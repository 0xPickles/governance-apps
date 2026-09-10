import { sha256, type Hex } from "viem";
import { DAO_CONTENT_MAX_BYTES } from "@/lib/schemas/dao-feed";
import { createDaoRawSha256Cid } from "./content";
import { readDaoContentBytes } from "./content-bytes";

export async function readDaoBoundedBytes(source: Request | Response, limit = DAO_CONTENT_MAX_BYTES): Promise<Uint8Array> {
  const length = source.headers.get("content-length");
  if (length !== null && Number(length) > limit) { await source.body?.cancel(); throw new Error("DAO content exceeds the byte limit."); }
  if (!source.body) throw new Error("DAO content is empty.");
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    void reader.cancel().catch(() => undefined); reject(new Error("DAO content request timed out."));
  }, 15_000); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); throw new Error("DAO content exceeds the byte limit."); }
      chunks.push(value);
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export function daoContentBase64(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result);
}
export function validateDaoPublicationBytes(bytes: Uint8Array) {
  if (bytes.length > DAO_CONTENT_MAX_BYTES) throw new Error("DAO content exceeds the byte limit.");
  const digest = sha256(bytes);
  const parsed = readDaoContentBytes(daoContentBase64(bytes), digest);
  if (parsed.state !== "available" || !parsed.value) throw new Error(parsed.error ?? "Invalid canonical content.");
  return { digest, cid: createDaoRawSha256Cid(digest), content: parsed.value };
}
export async function retrieveDaoPublishedContent(digest: Hex): Promise<Uint8Array> {
  const response = await fetch("/api/dao-content?digest=" + digest, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Published proposal content could not be retrieved.");
  const bytes = await readDaoBoundedBytes(response);
  if (sha256(bytes) !== digest) throw new Error("Retrieved proposal content has a different digest.");
  validateDaoPublicationBytes(bytes);
  return bytes;
}
