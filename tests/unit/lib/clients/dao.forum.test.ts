import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDaoForumUrl, validateDaoForumTopic } from "@/lib/clients/dao/forum";
afterEach(() => vi.unstubAllGlobals());
describe("real DAO forum policy", () => {
  it.each(["?","#","/","?x=1","#post","/2"])("rejects suffix %s", suffix => {
    expect(parseDaoForumUrl("https://gov.yearn.fi/t/proposal/123" + suffix)).toBeNull();
  });
  it.each(["https://evil.example/t/proposal/123","https://gov.yearn.fi:443/t/proposal/123","https://user@gov.yearn.fi/t/proposal/123","https://gov.yearn.fi/t/../t/proposal/123"])("rejects ambiguous or untrusted %s", url => {
    expect(parseDaoForumUrl(url)).toBeNull();
  });
  it("normalizes from actual public topic data and verifies stable category ancestry", async () => {
    const fetcher = vi.fn(async (url: string) => Response.json(url.includes("/t/") ? {
      id: 123, slug: "actual-title", title: "Actual title", category_id: 10, created_at: "2026-09-01T00:00:00Z",
      archetype: "regular", visible: true, post_stream: { posts: [{ username: "author" }] },
    } : { category: url.includes("/c/5/") ? { id: 5, name: "Proposals", slug: "proposals" } :
      { id: 10, name: "YIPs", slug: "yips", parent_category_id: 5 } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await validateDaoForumTopic("https://gov.yearn.fi/t/old-title/123")).toMatchObject({
      state: "valid", topic: { normalizedUrl: "https://gov.yearn.fi/t/actual-title/123", categoryId: 10 },
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(call => String(call[0]).startsWith("https://gov.yearn.fi/"))).toBe(true);
  });
  it.each([301, 302, 303, 307, 308])("rejects topic redirects (%s) without following them", async status => {
    const fetcher = vi.fn(async () => new Response(null, {
      status, headers: { Location: "https://untrusted.example/" },
    }));
    vi.stubGlobal("fetch", fetcher);
    expect(await validateDaoForumTopic("https://gov.yearn.fi/t/proposal/123")).toMatchObject({
      state: "invalid", error: { code: "FORUM_UNAVAILABLE" },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://gov.yearn.fi/t/123.json", expect.objectContaining({ redirect: "manual" }));
  });
  it("rejects category labels with the wrong ancestry", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.includes("/t/") ? {
      id: 123, slug: "proposal", title: "Proposal", category_id: 10, created_at: "2026-09-01T00:00:00Z",
      archetype: "regular", post_stream: { posts: [{ username: "author" }] },
    } : { category: url.includes("/c/5/") ? { id: 5, name: "Proposals", slug: "proposals" } :
      { id: 10, name: "YIPs", slug: "yips", parent_category_id: 7 } })));
    expect(await validateDaoForumTopic("https://gov.yearn.fi/t/proposal/123")).toMatchObject({ state: "invalid", error: { code: "WRONG_CATEGORY" } });
  });
});
