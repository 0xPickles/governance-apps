import { isDaoEnabled } from "@/lib/runtime/features";
import { DaoHashSchema } from "@/lib/schemas/dao-feed";
import { readDaoBoundedBytes, validateDaoPublicationBytes } from "@/lib/clients/dao/publication";
import { publishDaoContent, readStoredDaoContent } from "@/lib/server/dao-content";
import { validateDaoForumTopic } from "@/lib/clients/dao/forum";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  if (!isDaoEnabled()) return new Response(null, { status: 404, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
  if (request.headers.get("content-type") !== "application/octet-stream") return new Response(null, { status: 415, headers });
  try {
    const bytes = await readDaoBoundedBytes(request);
    const { content } = validateDaoPublicationBytes(bytes);
    const topic = await validateDaoForumTopic(content.discussionUrl);
    if (topic.state !== "valid" || topic.topic.normalizedUrl !== content.discussionUrl) throw new Error("Proposal discussion no longer passes forum validation.");
    const result = await publishDaoContent(bytes);
    return Response.json(result, { headers });
  } catch {
    // Upstream credentials, URLs, and provider responses never enter public errors.
    return Response.json({ error: "Content publication failed. Verify service configuration and retry the same content." }, { status: 503, headers });
  }
}
export async function GET(request: Request) {
  if (!isDaoEnabled()) return new Response(null, { status: 404, headers });
  const digest = DaoHashSchema.safeParse(new URL(request.url).searchParams.get("digest"));
  if (!digest.success) return new Response(null, { status: 400, headers });
  try {
    const bytes = await readStoredDaoContent(digest.data as Hex);
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/octet-stream" } });
  } catch { return Response.json({ error: "Published content is unavailable." }, { status: 503, headers }); }
}
