import { DaoPublicationPolicyError, requireDaoPublicationEnabled } from "@/lib/server/dao-publication-policy";
import { isDaoEnabled } from "@/lib/runtime/features";
import { DAO_CONTENT_MAX_BYTES, DaoHashSchema } from "@/lib/schemas/dao-feed";
import { cancelDaoBody, readDaoBoundedBytes, validateDaoPublicationBytes } from "@/lib/clients/dao/publication";
import { publishDaoContent, readStoredDaoContent } from "@/lib/server/dao-content";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  if (!isDaoEnabled()) return new Response(null, { status: 404, headers });
  try {
    requireDaoPublicationEnabled();
    if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
    if (request.headers.get("content-type") !== "application/octet-stream") return new Response(null, { status: 415, headers });
    let bytes: Uint8Array;
    try {
      bytes = await readDaoBoundedBytes(request);
      const { digest, cid } = validateDaoPublicationBytes(bytes);
      if (request.headers.get("x-dao-content-digest") !== digest || request.headers.get("x-dao-content-cid") !== cid) {
        throw new Error("Identity mismatch");
      }
    } catch {
      throw new DaoPublicationPolicyError("invalid_content", Number(request.headers.get("content-length")) > DAO_CONTENT_MAX_BYTES ? 413 : 400);
    }
    return Response.json(await publishDaoContent(bytes), { headers });
  } catch (error) {
    cancelDaoBody(request.body);
    const failure = error instanceof DaoPublicationPolicyError ? error : new DaoPublicationPolicyError("unavailable", 503);
    return Response.json({ code: failure.code, error: failure.message }, {
      status: failure.status, headers: { ...headers, ...(failure.status === 429 || failure.code === "verification_pending" ? { "Retry-After": "60" } : {}) },
    });
  }
}
export async function GET(request: Request) {
  if (!isDaoEnabled()) return new Response(null, { status: 404, headers });
  // The old publication-only signature challenge no longer exists.
  if (new URL(request.url).searchParams.has("authorize")) return new Response(null, { status: 404, headers });
  const digest = DaoHashSchema.safeParse(new URL(request.url).searchParams.get("digest"));
  if (!digest.success) return new Response(null, { status: 400, headers });
  try {
    const bytes = await readStoredDaoContent(digest.data as Hex);
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/octet-stream" } });
  } catch { return Response.json({ error: "Published content is unavailable." }, { status: 503, headers }); }
}
