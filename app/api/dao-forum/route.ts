import { validateDaoForumTopic } from "@/lib/clients/dao/forum";
import { isDaoEnabled } from "@/lib/runtime/features";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!isDaoEnabled()) return new Response(null, { status: 404, headers });
  const input = new URL(request.url).searchParams.get("url") ?? "";
  if (input.length > 2048) return Response.json({ error: "Forum URL exceeds the limit." }, { status: 400, headers });
  return Response.json(await validateDaoForumTopic(input), { headers });
}
