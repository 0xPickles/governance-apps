import type { Hex } from "viem";
import { isProductionMode } from "@/lib/runtime/runtime-mode";
import { cancelDaoBody, readDaoBoundedBytes, validateDaoPublicationBytes } from "@/lib/clients/dao/publication";
import { validateDaoForumTopic } from "@/lib/clients/dao/forum";
import { DaoPublicationPolicyError, daoPublicationLimits, requireDaoPublicationEnabled } from "./dao-publication-policy";
import { DaoPublicationStore, daoPublicationDatabase } from "./dao-publication-store";

const PINATA_UPLOAD = "https://api.pinata.cloud/pinning/pinFileToIPFS";
export function daoPublicationServiceConfiguration() {
  try {
    const local = process.env.DAO_PUBLICATION_TEST_ORIGIN;
    if (local) {
      const url = new URL(local);
      if (isProductionMode() || url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
          url.origin !== local) throw new Error("Invalid local seam");
      return { upload: local + "/pinning/pinFileToIPFS", gateway: local + "/ipfs/", authorization: undefined };
    }
    const gateway = new URL(process.env.DAO_IPFS_GATEWAY_URL ?? "");
    const key = process.env.DAO_PINATA_JWT;
    if (!key || /\s/.test(key) || gateway.protocol !== "https:" || gateway.username || gateway.password ||
        gateway.search || gateway.hash || !gateway.pathname.endsWith("/ipfs/") ||
        ["localhost", "127.0.0.1", "[::1]"].includes(gateway.hostname)) throw new Error("Invalid configuration");
    return { upload: PINATA_UPLOAD, gateway: gateway.href, authorization: "Bearer " + key };
  } catch { throw new DaoPublicationPolicyError("unavailable", 503); }
}
type Service = ReturnType<typeof daoPublicationServiceConfiguration>;

export async function uploadDaoPinataFile(bytes: Uint8Array, service: Service) {
  const { cid } = validateDaoPublicationBytes(bytes);
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }), cid + ".json");
  body.append("pinataOptions", JSON.stringify({ cidVersion: 1, wrapWithDirectory: false }));
  const response = await fetch(service.upload, {
    method: "POST", body, cache: "no-store", redirect: "error", credentials: "omit",
    headers: service.authorization ? { Authorization: service.authorization } : {},
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) { cancelDaoBody(response.body); throw new DaoPublicationPolicyError("verification_pending", 503); }
  const result: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readDaoBoundedBytes(response, 4096)));
  if (!result || typeof result !== "object" || !("IpfsHash" in result) || result.IpfsHash !== cid ||
      !("PinSize" in result) || result.PinSize !== bytes.length) throw new DaoPublicationPolicyError("verification_pending", 503);
}

export async function retrieveDaoPinataFile(bytes: Uint8Array, service: Service) {
  const { cid } = validateDaoPublicationBytes(bytes);
  // Gateway requests never receive upload authorization, including redirects.
  const response = await fetch(service.gateway + cid, {
    cache: "no-store", redirect: "error", credentials: "omit", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) { cancelDaoBody(response.body); throw new DaoPublicationPolicyError("verification_pending", 503); }
  const retained = await readDaoBoundedBytes(response);
  if (retained.length !== bytes.length || retained.some((byte, i) => byte !== bytes[i])) {
    throw new DaoPublicationPolicyError("verification_pending", 503);
  }
}

export async function publishDaoContent(bytes: Uint8Array) {
  requireDaoPublicationEnabled();
  const { content, digest, cid } = validateDaoPublicationBytes(bytes);
  const service = daoPublicationServiceConfiguration();
  const store = new DaoPublicationStore(await daoPublicationDatabase(), daoPublicationLimits());
  const { row, token } = await store.reserve(digest, cid, bytes);
  if (token === null) return { digest, cid, publishedAt: row.published_at!, state: "already_published" };
  try {
    const topic = await validateDaoForumTopic(content.discussionUrl);
    if (topic.state !== "valid" || topic.topic.normalizedUrl !== content.discussionUrl) {
      throw new DaoPublicationPolicyError("invalid_forum", 422);
    }
    let verified = false;
    let retrievals = 0;
    const verify = async () => {
      await store.spend(digest, token, "retrieval");
      retrievals++;
      try { await retrieveDaoPinataFile(bytes, service); return true; }
      catch { return false; }
    };
    // Recover uncertain uploads by looking for these exact bytes before another upload.
    if (row.upload_attempts > 0) verified = await verify();
    if (!verified && !row.upload_accepted) {
      await store.spend(digest, token, "upload");
      await uploadDaoPinataFile(bytes, service);
      await store.accepted(digest, token);
    }
    // A valid provider acknowledgement never causes an automatic reupload.
    while (!verified && retrievals < 3) {
      if (retrievals > 0) await new Promise(resolve => setTimeout(resolve, 250));
      verified = await verify();
    }
    if (!verified) throw new DaoPublicationPolicyError("verification_pending", 503);
    const publishedAt = await store.verified(digest, token);
    return { digest, cid, publishedAt, state: "published" };
  } catch (error) {
    if (error instanceof DaoPublicationPolicyError) throw error;
    throw new DaoPublicationPolicyError("verification_pending", 503);
  } finally {
    // Failure to release is recoverable by lease expiry; it must not hide a verified result.
    await store.release(digest, token).catch(() => undefined);
  }
}
export async function readStoredDaoContent(digest: Hex) {
  const store = new DaoPublicationStore(await daoPublicationDatabase(), daoPublicationLimits());
  const row = await store.read(digest);
  if (!row) throw new DaoPublicationPolicyError("unavailable", 503);
  const bytes = new Uint8Array(row.content);
  const identity = validateDaoPublicationBytes(bytes);
  if (identity.digest !== digest || identity.cid !== row.cid) throw new DaoPublicationPolicyError("unavailable", 503);
  return bytes;
}
