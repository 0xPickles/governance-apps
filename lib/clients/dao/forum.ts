import { z } from "@/lib/schemas/zod";
import type { DaoForumValidationResult } from "./authoring-types";
import { readBoundedJson, withFeedRequest, type FeedTransportPolicy } from "@/lib/feed-transport";
import { isProductionMode } from "@/lib/runtime/runtime-mode";

export const DAO_FORUM_CATEGORIES: Readonly<Record<number, { name: string; slug: string; parent: number | null }>> = {
  5: { name: "Proposals", slug: "proposals", parent: null },
  9: { name: "Vaults", slug: "vaults", parent: 5 },
  18: { name: "Other Products (Labs)", slug: "labs", parent: 5 },
  17: { name: "Finance", slug: "finance", parent: 5 },
  21: { name: "Protocol and Governance", slug: "protocol-and-governance", parent: 5 },
  10: { name: "YIPs", slug: "yips", parent: 5 },
  29: { name: "veYFI", slug: "veyfi", parent: 5 },
};

export function parseDaoForumUrl(input: string): { topicId: number } | null {
  try {
    const url = new URL(input);
    if (url.origin !== "https://gov.yearn.fi" || url.username || url.password || url.port ||
        input !== url.origin + url.pathname) return null;
    const match = /^\/t\/[^/%?#\s]+\/([1-9][0-9]*)$/.exec(url.pathname);
    const topicId = Number(match?.[1]);
    return match && Number.isSafeInteger(topicId) ? { topicId } : null;
  } catch { return null; }
}
const policy: FeedTransportPolicy = {
  maximumPayloadBytes: 1024 * 1024, requestTimeoutMs: 8_000, fatalUtf8: true,
  fetchOptions: { cache: "no-store", redirect: "error", credentials: "omit" },
  createPayloadTooLargeError: () => new Error("Forum response is too large."),
  createTimeoutError: () => new Error("Forum request timed out."),
  payloadTooLargeCancelReason: "Forum response limit", timeoutCancelReason: "Forum deadline",
};
const topicSchema = z.object({
  id: z.number().int().positive(), slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1).max(1024), category_id: z.number().int(),
  created_at: z.iso.datetime({ offset: true }), visible: z.boolean().optional(),
  archetype: z.literal("regular"),
  post_stream: z.object({ posts: z.array(z.object({ username: z.string().min(1).max(256) })).min(1) }),
});
const categorySchema = z.object({ category: z.object({
  id: z.number().int(), name: z.string(), slug: z.string(), parent_category_id: z.number().int().nullable().optional(),
}) });
function forumOrigin(): string {
  const local = process.env.DAO_FORUM_TEST_ORIGIN;
  if (!local) return "https://gov.yearn.fi";
  const url = new URL(local);
  if (isProductionMode() || url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      local !== url.origin) throw new Error("Forum test origin must be local and outside production.");
  return url.origin;
}
async function readForum(path: string) {
  return withFeedRequest(forumOrigin() + path, policy, async (response, context) => {
    if (!response.ok) { await response.body?.cancel(); throw new Error(response.status === 404 ? "TOPIC_NOT_FOUND" : "FORUM_UNAVAILABLE"); }
    return readBoundedJson(response, context, policy);
  });
}
export async function validateDaoForumTopic(input: string): Promise<DaoForumValidationResult> {
  const parsed = parseDaoForumUrl(input);
  if (!parsed) return failure("INVALID_TOPIC_URL", "Use an exact public https://gov.yearn.fi/t/<slug>/<id> topic URL.");
  try {
    const topic = topicSchema.parse(await readForum("/t/" + parsed.topicId + ".json"));
    if (topic.id !== parsed.topicId || topic.visible === false) return failure("TOPIC_NOT_FOUND", "This public forum topic could not be found.");
    const allowed = DAO_FORUM_CATEGORIES[topic.category_id];
    if (!allowed) return failure("WRONG_CATEGORY", "This topic is outside the approved Proposals categories.");
    const ids = topic.category_id === 5 ? [5] : [5, topic.category_id];
    const categories = await Promise.all(ids.map(async id => categorySchema.parse(await readForum("/c/" + id + "/show.json")).category));
    if (categories.some((category, index) => {
      const expected = DAO_FORUM_CATEGORIES[ids[index]];
      return category.id !== ids[index] || category.name !== expected.name || category.slug !== expected.slug ||
        (category.parent_category_id ?? null) !== expected.parent;
    })) return failure("WRONG_CATEGORY", "Forum category metadata or ancestry differs from the approved policy.");
    return { state: "valid", topic: {
      topicId: topic.id, normalizedUrl: "https://gov.yearn.fi/t/" + topic.slug + "/" + topic.id,
      title: topic.title, categoryId: topic.category_id, category: allowed.name,
      author: topic.post_stream.posts[0].username, createdAt: Math.floor(Date.parse(topic.created_at) / 1000),
    } };
  } catch (error) {
    return error instanceof Error && error.message === "TOPIC_NOT_FOUND"
      ? failure("TOPIC_NOT_FOUND", "This public forum topic could not be found.")
      : failure("FORUM_UNAVAILABLE", "The forum could not be checked. Retry without changing your draft.");
  }
}
function failure(code: "INVALID_TOPIC_URL" | "TOPIC_NOT_FOUND" | "WRONG_CATEGORY" | "FORUM_UNAVAILABLE", message: string): DaoForumValidationResult {
  return { state: "invalid", error: { code, message } };
}
