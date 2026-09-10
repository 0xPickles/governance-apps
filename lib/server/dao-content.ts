import { sha256, type Hex } from "viem";
import { isProductionMode } from "@/lib/runtime/runtime-mode";
import { createDaoRawSha256Cid } from "@/lib/clients/dao/content";
import { readDaoBoundedBytes, validateDaoPublicationBytes } from "@/lib/clients/dao/publication";

/** Standard raw-block IPFS API. No provider or credentials are selected by the browser. */
function serviceConfiguration() {
  const value = process.env.DAO_IPFS_API_URL;
  if (!value) throw new Error("Durable DAO content publication is not configured.");
  const url = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (!loopback && url.protocol !== "https:") || (loopback && !["http:", "https:"].includes(url.protocol)) || (loopback && isProductionMode())) {
    throw new Error("Invalid DAO publication service configuration.");
  }
  const authorization = process.env.DAO_IPFS_AUTHORIZATION;
  if (!loopback && !authorization) throw new Error("Private DAO publication credentials are not configured.");
  return { base: value.replace(/\/$/, ""), authorization };
}
async function ipfs(path: string, body?: FormData) {
  const { base, authorization } = serviceConfiguration();
  const response = await fetch(base + "/api/v0/" + path, {
    method: "POST", body, cache: "no-store", redirect: "error", credentials: "omit",
    headers: authorization ? { Authorization: authorization } : {},
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error("DAO content service request failed."); }
  return response;
}
export async function readStoredDaoContent(digest: Hex) {
  const cid = createDaoRawSha256Cid(digest);
  const bytes = await readDaoBoundedBytes(await ipfs("block/get?arg=" + cid));
  if (sha256(bytes) !== digest) throw new Error("Stored DAO bytes do not match the content commitment.");
  validateDaoPublicationBytes(bytes);
  return bytes;
}
export async function publishDaoContent(bytes: Uint8Array) {
  const { digest, cid } = validateDaoPublicationBytes(bytes);
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }), cid);
  const response = await ipfs("block/put?cid-codec=raw&mhtype=sha2-256&mhlen=32&pin=true", body);
  const result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readDaoBoundedBytes(response, 4096))) as { Key?: unknown; Size?: unknown };
  if (result.Key !== cid || result.Size !== bytes.length) throw new Error("The publication service returned a different content identity.");
  const retained = await readStoredDaoContent(digest);
  if (retained.length !== bytes.length || retained.some((byte, i) => byte !== bytes[i])) throw new Error("Published content did not round-trip exactly.");
  return { digest, cid, publishedAt: Math.floor(Date.now() / 1000) };
}
