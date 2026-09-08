import { readBoundedJson, withFeedRequest, type FeedTransportPolicy } from "@/lib/feed-transport";
import { DAO_FEED_MAX_PAYLOAD_BYTES, DaoFeedError, parseDaoFeed, type DaoFeedWire } from "@/lib/schemas/dao-feed";
import { adaptDaoFeed } from "./feed-adapter";
import type { DaoDeployment } from "./deployment";
import type { DaoSnapshot } from "./types";

export const DAO_FEED_REQUEST_TIMEOUT_MS = 10_000;
export const DAO_FEED_STALE_SECONDS = 300;
export const DAO_FEED_TRANSPORT_POLICY: FeedTransportPolicy = {
  maximumPayloadBytes: DAO_FEED_MAX_PAYLOAD_BYTES,
  fatalUtf8: true,
  requestTimeoutMs: DAO_FEED_REQUEST_TIMEOUT_MS,
  fetchOptions: { cache: "no-store" },
  createPayloadTooLargeError: () => new DaoFeedError("oversized", "DAO feed exceeds the payload budget."),
  createTimeoutError: () => new DaoFeedError("timeout", "DAO feed request timed out."),
  payloadTooLargeCancelReason: "DAO payload limit",
  timeoutCancelReason: "DAO request deadline",
};

export async function fetchDaoFeed(url = "/api/dao-data"): Promise<DaoFeedWire> {
  return withFeedRequest(url, DAO_FEED_TRANSPORT_POLICY, async (response, context) => {
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 409) throw new DaoFeedError("incompatible", "DAO feed version is incompatible; expected yearn.dao.feed.v2.");
      if (response.status === 504) throw new DaoFeedError("timeout", "DAO upstream request timed out.");
      throw new DaoFeedError("unavailable", "DAO feed is unavailable (" + response.status + ").");
    }
    return parseDaoFeed(await readBoundedJson(response, context, DAO_FEED_TRANSPORT_POLICY));
  });
}

/** Scoped to one client/configuration. React Query retains data on failures. */
export class DaoFeedReader {
  private sequence = 0;
  private lastGood: { wire: DaoFeedWire; snapshot: DaoSnapshot } | null = null;

  constructor(
    private readonly deployments: readonly DaoDeployment[],
    private readonly fetchFeed: () => Promise<DaoFeedWire> = fetchDaoFeed,
  ) {}

  async refresh(): Promise<DaoSnapshot> {
    const sequence = ++this.sequence;
    const wire = await this.fetchFeed();
    const snapshot = adaptDaoFeed(wire, this.deployments);
    if (sequence !== this.sequence) {
      if (this.lastGood) return this.lastGood.snapshot;
      throw new DaoFeedError("unavailable", "DAO feed request was superseded.");
    }
    if (wire.observedAt > Math.floor(Date.now() / 1000) + 60) throw new DaoFeedError("invalid", "DAO observation time is in the future.");
    if (this.lastGood) {
      if (wire.observedAt < this.lastGood.wire.observedAt) throw new DaoFeedError("unavailable", "An older DAO publication was received.");
      if (wire.observedAt === this.lastGood.wire.observedAt && JSON.stringify(wire) !== JSON.stringify(this.lastGood.wire)) throw new DaoFeedError("invalid", "DAO candidates disagree at the same observation time.");
    }
    // A newer observation may legitimately replace a block with a different
    // hash, including a lower height following canonical reorg recovery.
    this.lastGood = { wire, snapshot };
    return snapshot;
  }

  current(): DaoSnapshot | null { return this.lastGood?.snapshot ?? null; }
  wire(): DaoFeedWire | null { return this.lastGood?.wire ?? null; }
}
