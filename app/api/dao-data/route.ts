import { readBoundedJson, withFeedRequest } from "@/lib/feed-transport";
import { DAO_FEED_TRANSPORT_POLICY } from "@/lib/clients/dao/feed";
import { DaoFeedError, parseDaoFeed } from "@/lib/schemas/dao-feed";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const url = process.env.DAO_DATA_URL;
  if (!url) return Response.json({ error: "DAO feed is not configured." }, { status: 503, headers });
  try {
    return await withFeedRequest(url, DAO_FEED_TRANSPORT_POLICY, async (upstream, context) => {
      if (!upstream.ok) {
        await upstream.body?.cancel().catch(() => undefined);
        return Response.json({ error: "DAO upstream is unavailable." }, { status: 502, headers });
      }
      const feed = parseDaoFeed(await readBoundedJson(upstream, context, DAO_FEED_TRANSPORT_POLICY));
      return Response.json(feed, { headers });
    });
  } catch (error) {
    const status = error instanceof DaoFeedError
      ? error.kind === "incompatible" ? 409 : error.kind === "timeout" ? 504 : 502
      : 502;
    return Response.json({ error: error instanceof DaoFeedError ? error.message : "DAO upstream failed." },
      { status, headers });
  }
}
