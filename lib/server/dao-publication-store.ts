import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Hex } from "viem";
import { DaoPublicationPolicyError, type DaoPublicationLimits } from "./dao-publication-policy";

// Expiry releases concurrency, never spent allowances.
export const DAO_PUBLICATION_LEASE_MS = 180_000;
export const DAO_PUBLICATION_RETRY_MS = 60_000;
export interface DaoPublicationRecord {
  digest: Hex; cid: string; content: number[]; byte_length: number; admitted_at: number;
  published_at: number | null; upload_accepted: number; upload_attempts: number;
  retrieval_attempts: number; reservations: number; lease_token: string | null;
  lease_until: number; retry_after: number;
}
export async function daoPublicationDatabase(): Promise<D1Database> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (!env.DAO_PUBLICATION_DB) throw new Error("Missing binding");
    return env.DAO_PUBLICATION_DB;
  } catch { throw new DaoPublicationPolicyError("unavailable", 503); }
}

export class DaoPublicationStore {
  constructor(private readonly db: D1Database, private readonly limits: DaoPublicationLimits) {}

  async reserve(digest: Hex, cid: string, bytes: Uint8Array, now = Date.now()) {
    const p = this.limits;
    const policy = JSON.stringify(p);
    const token = crypto.randomUUID();
    // All conditions and mutations run on D1's primary in one transaction.
    const results = await this.db.batch<DaoPublicationRecord & { limits_json?: string; active?: number }>([
      this.db.prepare("INSERT OR IGNORE INTO dao_publication_policy VALUES (1, ?)").bind(policy),
      this.db.prepare(`INSERT OR IGNORE INTO dao_publications (digest, cid, content, byte_length, admitted_at)
        SELECT ?, ?, ?, ?, ? WHERE
        (SELECT limits_json FROM dao_publication_policy WHERE singleton = 1) = ?
        AND (SELECT COUNT(*) FROM dao_publications) < ?
        AND (SELECT COALESCE(SUM(byte_length), 0) FROM dao_publications) + ? <= ?
        AND (SELECT COUNT(*) FROM dao_publications WHERE admitted_at > ?) < ?
        AND (SELECT COUNT(*) FROM dao_publications WHERE admitted_at > ?) < ?
        AND (SELECT COUNT(*) FROM dao_publications WHERE admitted_at > ?) < ?
        AND (SELECT COUNT(*) FROM dao_publications WHERE lease_until > ?) < ?
        AND (SELECT COALESCE(SUM(upload_attempts), 0) FROM dao_publications) < ?
        AND (SELECT COALESCE(SUM(retrieval_attempts), 0) FROM dao_publications) < ?`)
        .bind(digest, cid, Array.from(bytes), bytes.length, now, policy, p.documents, bytes.length, p.bytes,
          now - 3_600_000, p.hourlyDocuments, now - 86_400_000, p.dailyDocuments,
          now - 30 * 86_400_000, p.monthlyDocuments, now, p.concurrent, p.uploadAttempts, p.retrievalAttempts),
      this.db.prepare(`UPDATE dao_publications SET lease_token = ?, lease_until = ?, reservations = reservations + 1
        WHERE digest = ? AND published_at IS NULL AND lease_until <= ? AND retry_after <= ? AND reservations < ?
        AND (SELECT limits_json FROM dao_publication_policy WHERE singleton = 1) = ?
        AND (SELECT COUNT(*) FROM dao_publications WHERE lease_until > ?) < ? RETURNING *`)
        .bind(token, now + DAO_PUBLICATION_LEASE_MS, digest, now, now, p.documentReservations, policy, now, p.concurrent),
      this.db.prepare("SELECT * FROM dao_publications WHERE digest = ?").bind(digest),
      this.db.prepare(`SELECT limits_json, (SELECT COUNT(*) FROM dao_publications WHERE lease_until > ?) AS active
        FROM dao_publication_policy WHERE singleton = 1`).bind(now),
    ]);
    const row = results[3].results[0];
    if (results[4].results[0]?.limits_json !== policy) throw new DaoPublicationPolicyError("unavailable", 503);
    if (!row) throw new DaoPublicationPolicyError((results[4].results[0]?.active ?? 0) >= p.concurrent ? "busy" : "budget_reached", 429);
    if (row.cid !== cid || row.byte_length !== bytes.length || row.content.length !== bytes.length ||
        row.content.some((byte, i) => byte !== bytes[i])) throw new DaoPublicationPolicyError("invalid_content", 400);
    if (row.published_at !== null) {
      if (row.upload_accepted !== 1) throw new DaoPublicationPolicyError("unavailable", 503);
      return { row, token: null };
    }
    if (row.lease_token !== token) throw new DaoPublicationPolicyError(
      row.reservations >= p.documentReservations && row.lease_until <= now ? "budget_reached" : "busy", 429);
    return { row, token };
  }

  async spend(digest: Hex, token: string, kind: "upload" | "retrieval", now = Date.now()) {
    // Column names come only from this closed union.
    const column = kind === "upload" ? "upload_attempts" : "retrieval_attempts";
    const perDocument = kind === "upload" ? this.limits.documentUploadAttempts : this.limits.documentRetrievalAttempts;
    const global = kind === "upload" ? this.limits.uploadAttempts : this.limits.retrievalAttempts;
    const result = await this.db.prepare(`UPDATE dao_publications SET ${column} = ${column} + 1
      WHERE digest = ? AND lease_token = ? AND lease_until > ? AND published_at IS NULL
      AND ${column} < ? AND (SELECT COALESCE(SUM(${column}), 0) FROM dao_publications) < ? RETURNING digest`)
      .bind(digest, token, now + 35_000, perDocument, global).all();
    if (!result.results.length) throw new DaoPublicationPolicyError("budget_reached", 429);
  }
  async accepted(digest: Hex, token: string) {
    const result = await this.db.prepare(`UPDATE dao_publications SET upload_accepted = 1
      WHERE digest = ? AND lease_token = ? AND lease_until > ? RETURNING digest`).bind(digest, token, Date.now()).all();
    if (!result.results.length) throw new DaoPublicationPolicyError("busy", 429);
  }
  async verified(digest: Hex, token: string) {
    // Completion requires both the caller's exact-byte verification and durable upload acceptance.
    const result = await this.db.prepare(`UPDATE dao_publications SET published_at = ?, lease_token = NULL, lease_until = 0
      WHERE digest = ? AND lease_token = ? AND lease_until > ? AND upload_accepted = 1 RETURNING published_at`)
      .bind(Math.floor(Date.now() / 1000), digest, token, Date.now()).first<{ published_at: number }>();
    if (!result) throw new DaoPublicationPolicyError("busy", 429);
    return result.published_at;
  }
  async release(digest: Hex, token: string) {
    await this.db.prepare(`UPDATE dao_publications SET lease_token = NULL, lease_until = 0, retry_after = ?
      WHERE digest = ? AND lease_token = ?`).bind(Date.now() + DAO_PUBLICATION_RETRY_MS, digest, token).run();
  }
  async read(digest: Hex) {
    return this.db.prepare("SELECT * FROM dao_publications WHERE digest = ? AND published_at IS NOT NULL AND upload_accepted = 1")
      .bind(digest).first<DaoPublicationRecord>();
  }
}
