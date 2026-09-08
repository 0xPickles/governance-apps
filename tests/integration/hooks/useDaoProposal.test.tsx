import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DAO_MOCK_FEED,
  DAO_MOCK_NOW,
  resetDaoMockStore,
  setDaoMockSurface,
} from "@/lib/clients/dao";
import { OnchainDaoClient } from "@/lib/clients/dao/onchain";
import { daoKeys } from "@/lib/hooks/daoKeys";
import {
  getDaoRouteClient,
  useDaoFeed,
  useDaoProposal,
} from "@/lib/hooks/useDao";

const originalRuntimeMode = process.env.NEXT_PUBLIC_RUNTIME_MODE;
const originalDaoFlag = process.env.NEXT_PUBLIC_ENABLE_DAO;

afterEach(() => {
  process.env.NEXT_PUBLIC_RUNTIME_MODE = originalRuntimeMode;
  process.env.NEXT_PUBLIC_ENABLE_DAO = originalDaoFlag;
});

describe("DAO production read gate", () => {
  it("refuses route-local mock reads while the DAO flag is false", () => {
    process.env.NEXT_PUBLIC_RUNTIME_MODE = "production";
    process.env.NEXT_PUBLIC_ENABLE_DAO = "false";

    expect(() => getDaoRouteClient()).toThrow(
      "DAO route is disabled."
    );
  });

  it("selects only the real client in production", () => {
    process.env.NEXT_PUBLIC_RUNTIME_MODE = "production";
    process.env.NEXT_PUBLIC_ENABLE_DAO = "true";
    expect(getDaoRouteClient()).toBeInstanceOf(OnchainDaoClient);
  });
});

describe("useDaoProposal", () => {
  beforeEach(() => {
    resetDaoMockStore({ now: DAO_MOCK_NOW });
  });

  it("keeps an invalid route ID not-found when the shared feed cache errored", async () => {
    const feedError = new Error("seeded feed failure");
    let feedReads = 0;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    await expect(
      queryClient.fetchQuery({
        queryKey: [...daoKeys.feed(), "mock"],
        queryFn: () => {
          feedReads += 1;
          throw feedError;
        },
      })
    ).rejects.toBe(feedError);

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useDaoProposal("invalid"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ state: "not_found" });
      expect(result.current.isPending).toBe(false);
    });
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(feedReads).toBe(1);
  });

  it("hides a previously found proposal when the surfaced feed becomes empty", async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDaoProposal("2"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data?.state).toBe("found");
      expect(result.current.envelope?.proposal.ref.proposalId).toBe(2n);
    });

    await act(async () => {
      setDaoMockSurface("empty");
      await queryClient.invalidateQueries({
        queryKey: daoKeys.all,
        refetchType: "all",
      });
    });

    await waitFor(() => {
      expect(result.current.data?.state).toBe("not_found");
      expect(result.current.envelope).toBeNull();
    });
  });
});

describe("useDaoFeed last-good behavior", () => {
  beforeEach(() => {
    resetDaoMockStore({ now: DAO_MOCK_NOW });
  });

  it("retains the last successful feed while preserving synthetic error semantics", async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDaoFeed(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data?.canonicalBlock.hash).toBe(
        DAO_MOCK_FEED.canonicalBlock.hash
      );
    });

    act(() => {
      setDaoMockSurface("error");
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.data?.canonicalBlock.hash).toBe(
        DAO_MOCK_FEED.canonicalBlock.hash
      );
    });

    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.isError).toBe(true);
    expect(result.current.data?.canonicalBlock.hash).toBe(
      DAO_MOCK_FEED.canonicalBlock.hash
    );
  });

  it("does not start a hidden feed read from a cold synthetic error", async () => {
    setDaoMockSurface("error");
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDaoFeed(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.data).toBeUndefined();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });
    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("does not promote an in-flight cold read after a synthetic error", async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDaoFeed(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      setDaoMockSurface("error");
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.data).toBeUndefined();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });
    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}
