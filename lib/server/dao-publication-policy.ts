import { recoverMessageAddress, type Address, type Hex } from "viem";
import { z } from "@/lib/schemas/zod";
import { DAO_CONTENT_MAX_BYTES } from "@/lib/schemas/dao-feed";
import { isProductionMode } from "@/lib/runtime/runtime-mode";
import { daoPublicationMessage } from "@/lib/clients/dao/publication-authorization";

const grantSchema = z.object({
  uploader: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  digest: z.string().regex(/^0x[0-9a-f]{64}$/),
  bytes: z.number().int().positive().max(DAO_CONTENT_MAX_BYTES),
}).strict();
const policySchema = z.object({
  maxDocuments: z.number().int().positive().max(1000),
  maxTotalBytes: z.number().int().positive().max(1000 * DAO_CONTENT_MAX_BYTES),
  grants: z.array(grantSchema).min(1).max(1000),
}).strict();
export class DaoPublicationPolicyError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
async function publicationPolicy(request: Request) {
  if (process.env.DAO_PUBLICATION_ENABLED !== "true") throw new DaoPublicationPolicyError(404, "Publication is disabled.");
  let policy;
  try {
    let raw = process.env.DAO_PUBLICATION_POLICY;
    // Local operator fixture only. Never read a policy file on a public host or in production.
    if (!isProductionMode() && ["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname) && process.env.DAO_PUBLICATION_POLICY_FILE) {
      const { readFile } = await import("node:fs/promises");
      raw = await readFile(process.env.DAO_PUBLICATION_POLICY_FILE, "utf8");
    }
    if (!raw || raw.length > 262144) throw new Error("Missing policy");
    policy = policySchema.parse(JSON.parse(raw));
  } catch { throw new DaoPublicationPolicyError(503, "Publication authorization is not configured."); }
  // A finite content allowlist bounds unique pinned documents and bytes across requests and replicas.
  const digests = new Set(policy.grants.map(g => g.digest));
  if (digests.size !== policy.grants.length || policy.grants.length > policy.maxDocuments ||
      policy.grants.reduce((sum, g) => sum + g.bytes, 0) > policy.maxTotalBytes) {
    throw new DaoPublicationPolicyError(429, "The publication budget does not permit this grant set.");
  }
  return policy;
}
export async function daoPublicationChallenge(request: Request) {
  const policy = await publicationPolicy(request);
  const url = new URL(request.url);
  const grant = policy.grants.find(g => g.digest === url.searchParams.get("authorize") && g.uploader.toLowerCase() === url.searchParams.get("uploader")?.toLowerCase());
  if (!grant) throw new DaoPublicationPolicyError(403, "This content is not approved for publication.");
  return { ...grant, issuedAt: Math.floor(Date.now() / 1000) };
}
export async function authorizeDaoPublication(request: Request) {
  const policy = await publicationPolicy(request);
  const digest = request.headers.get("x-dao-content-digest");
  const uploader = request.headers.get("x-dao-uploader")?.toLowerCase();
  const signature = request.headers.get("x-dao-publication-signature");
  const issued = request.headers.get("x-dao-publication-issued-at");
  const issuedAt = issued && /^[0-9]{1,12}$/.test(issued) ? Number(issued) : NaN;
  const now = Math.floor(Date.now() / 1000);
  const grant = policy.grants.find(g => g.digest === digest && g.uploader.toLowerCase() === uploader);
  if (!grant || !signature || !/^0x[0-9a-f]{130}$/i.test(signature) || !Number.isSafeInteger(issuedAt) || issuedAt > now + 60 || issuedAt < now - 300) {
    throw new DaoPublicationPolicyError(403, "This upload is not authorized.");
  }
  try {
    const signer = await recoverMessageAddress({ signature: signature as Hex,
      message: daoPublicationMessage({ origin: new URL(request.url).origin, uploader: grant.uploader as Address,
        digest: grant.digest as Hex, bytes: grant.bytes, issuedAt }) });
    if (signer.toLowerCase() !== uploader) throw new Error("Wrong uploader");
  } catch { throw new DaoPublicationPolicyError(403, "This upload is not authorized."); }
  return grant;
}
