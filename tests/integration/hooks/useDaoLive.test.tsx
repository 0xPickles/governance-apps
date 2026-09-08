import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import saved from "@/docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json";
import { useDaoAccountProposalState, useDaoFeed } from "@/lib/hooks/useDao";
import { V2_ACCOUNT, V2_DEPLOYMENTS, V2_VOTING, V2_NOW } from "../../fixtures/dao-feed-v2";
import { createDaoRpcFixture } from "../../fixtures/dao-rpc-v2";
import { daoKeys } from "@/lib/hooks/daoKeys";

const context = vi.hoisted(() => ({
  wallet: { isConnected: false, address: undefined as string | undefined, chainId: undefined as number | undefined },
  rpc: null as null | { request: (input: { method: string; params?: readonly unknown[] }) => Promise<unknown> },
}));
vi.mock("wagmi", async () => ({ ...await vi.importActual<typeof import("wagmi")>("wagmi"), useAccount: () => context.wallet }));
vi.mock("@/state/protocol", () => ({ useOptionalProtocol: () => ({ mainnetPublicClient: context.rpc }) }));
const ref = { chainId: 1, votingAddress: V2_VOTING, proposalId: 0n } as const;
const previous = { ...process.env };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime((V2_NOW + 120) * 1000);
  process.env.NEXT_PUBLIC_RUNTIME_MODE = "production";
  process.env.NEXT_PUBLIC_ENABLE_DAO = "true";
  process.env.NEXT_PUBLIC_DAO_DEPLOYMENTS = JSON.stringify(V2_DEPLOYMENTS);
  context.wallet = { isConnected: false, address: undefined, chainId: undefined };
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify(saved))));
});
afterEach(() => {
  for (const key of ["NEXT_PUBLIC_RUNTIME_MODE", "NEXT_PUBLIC_ENABLE_DAO", "NEXT_PUBLIC_DAO_DEPLOYMENTS"]) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
  vi.unstubAllGlobals(); vi.useRealTimers();
});
describe("DAO production live hooks", () => {
  it("reads while disconnected and discards eligibility across network, account, and RPC changes", async () => {
    const fixture = createDaoRpcFixture();
    context.rpc = fixture.rpc;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    const { result, rerender, unmount } = renderHook(() => {
      const feed = useDaoFeed();
      const account = useDaoAccountProposalState(feed.data ? ref : null, context.wallet.address as typeof V2_ACCOUNT ?? null);
      return { feed, account };
    }, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.feed.data?.proposals[0].ref.proposalId).toBe(0n));
    expect(fixture.rpc.request).not.toHaveBeenCalled();
    context.wallet = { isConnected: true, address: V2_ACCOUNT, chainId: 1 };
    rerender();
    await waitFor(() => expect(result.current.account.data?.capabilities.canVote).toBe(true));
    context.wallet.chainId = 10;
    rerender();
    expect(result.current.account.data).toBeUndefined();
    await waitFor(() => expect(result.current.account.error?.message).toMatch(/network/));
    context.wallet.chainId = 1;
    context.wallet.address = "0x9999999999999999999999999999999999999999";
    rerender();
    await waitFor(() => expect(result.current.account.data?.address).toBe(context.wallet.address));
    expect(fixture.calls.filter(c => c.name === "votes").at(-1)?.args[0]).toBe(context.wallet.address);
    fixture.state.fail = true;
    await act(async () => { await client.invalidateQueries({ queryKey: daoKeys.all }); });
    await waitFor(() => expect(result.current.account.error?.message).toMatch(/Controlled RPC/));
    expect(result.current.account.data).toBeUndefined();
    context.wallet.isConnected = false;
    context.wallet.address = undefined;
    rerender();
    expect(result.current.account.data).toBeUndefined();
    expect(result.current.feed.data?.proposals[0].ref.proposalId).toBe(0n);
    unmount(); client.clear();
  });
});
