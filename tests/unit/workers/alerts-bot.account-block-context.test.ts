import { describe, expect, it, vi } from "vitest";
import { encodeFunctionResult, parseAbi, type Hex } from "viem";

import {
  ALERT_MULTICALL3,
  resolveAlertAccountBlockContext,
  type AlertAccountBlockReader,
  type AlertYethAccountBlockSnapshot,
  type AlertYfiAccountBlockSnapshot,
} from "@/workers/alerts-bot/src/account-block-context";
import { LIQUID_LOCKERS } from "@/workers/alerts-bot/src/contracts";
import type { NormalizedAction } from "@/workers/alerts-bot/src/types";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const BLOCK = {
  blockNumber: 25_123_456,
  blockHash: `0x${"a".repeat(64)}`,
} as const;
const ONE = 10n ** 18n;
const MULTICALL3_ABI = parseAbi([
  "function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)",
] as const);
const RESOLVER_ABI = parseAbi([
  "function reverse(bytes reverseAddress,uint256 coinType) view returns (string,address,address)",
] as const);

function words(...values: bigint[]): Hex {
  return `0x${values.map((value) => value.toString(16).padStart(64, "0")).join("")}`;
}

function ensResult(name = "alice.eth"): Hex {
  const inner = encodeFunctionResult({
    abi: RESOLVER_ABI,
    functionName: "reverse",
    result: [
      name,
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ],
  });
  return encodeFunctionResult({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    result: [{ success: true, returnData: inner }],
  });
}

function action(kind: NormalizedAction["kind"], tokenSymbol: string): NormalizedAction {
  return {
    kind,
    tokenSymbol,
    user: ACCOUNT,
    principal: { kind: "proven", address: ACCOUNT },
    amounts: kind === "staked" ? { assets: ONE, shares: ONE } : {},
    txHash: `0x${"b".repeat(64)}`,
    blockNumber: BLOCK.blockNumber,
    logIndex: 1,
    source: {
      kind: "onchain",
      txHash: `0x${"b".repeat(64)}`,
      logIndex: 1,
    },
  };
}

describe("exact event-block account context", () => {
  it("resolves stYFI, stYFIx, LLYFI, and veYFI context in one bounded plan", async () => {
    const values: string[] = [
      words(38n * ONE),
      words(1_800_000_000n, 12n * ONE, 0n),
      words(0n),
      words(4n * ONE),
      words(0n, 0n, 0n),
      words(0n),
    ];
    for (const locker of LIQUID_LOCKERS) {
      values.push(
        words(ONE * locker.scale),
        words(2n * ONE),
        words(0n, 0n, 0n),
        words(0n),
      );
    }
    values.push(
      words(8n * ONE, 1_812_585_600n),
      words(9n * ONE, 2n, 1_812_585_600n),
      words(1_800_000_000n),
      ensResult(),
    );
    const read = vi.fn(async () => values);
    const context = await resolveAlertAccountBlockContext({
      domainId: "styfi",
      actions: [action("staked", "stYFI")],
      block: BLOCK,
      reader: { read },
    });
    const snapshot = context.snapshotsByPrincipal[ACCOUNT] as AlertYfiAccountBlockSnapshot;
    expect(read).toHaveBeenCalledOnce();
    expect(context.requestCount).toBe(values.length);
    expect(context.ensNamesByAddress).toEqual({ [ACCOUNT]: "alice.eth" });
    expect(snapshot.styfi.active).toBe(38n * ONE);
    expect(snapshot.styfi.cooldown.cooling).toBe(12n * ONE);
    expect(snapshot.styfix.active).toBe(4n * ONE);
    expect(snapshot.liquidLockers.map(({ yfiEquivalent }) => yfiEquivalent)).toEqual([
      3n * ONE,
      3n * ONE,
      3n * ONE,
    ]);
    expect(snapshot.legacyVeyfi.amount).toBe(8n * ONE);
    expect(snapshot.migratedVeyfi).toMatchObject({
      amount: 9n * ONE,
      migrationProven: true,
    });
  });

  it("uses a second exact-block stage to value yETH vault shares", async () => {
    const first = [
      words(320_000_000_000_000_000n),
      words(640n * ONE),
      words(600n * ONE),
      words(20n * ONE),
      words(6n * ONE),
      ensResult(),
    ];
    const second = [words(64n * ONE / 10n)];
    const read = vi.fn(async () => (read.mock.calls.length === 1 ? first : second));
    const context = await resolveAlertAccountBlockContext({
      domainId: "yeth",
      actions: [action("yeth_claimed_stayed", "yETH")],
      block: BLOCK,
      reader: { read },
    });
    const snapshot = context.snapshotsByPrincipal[ACCOUNT] as AlertYethAccountBlockSnapshot;
    expect(read).toHaveBeenCalledTimes(2);
    expect(context.requestCount).toBe(7);
    expect(snapshot).toMatchObject({
      claimableSnapshot: 20n * ONE,
      claimableRecovered: 64n * ONE / 10n,
      recoveryVaultShares: 6n * ONE,
      recoveryVaultAssets: 64n * ONE / 10n,
      recoveryVaultTotalAssets: 640n * ONE,
      recoveryVaultTotalSupply: 600n * ONE,
    });
  });

  it("deduplicates the same reader, block, action, and principal plan", async () => {
    const failure = new Error("rpc unavailable");
    const read = vi.fn(async () => Promise.reject(failure));
    const reader: AlertAccountBlockReader = { read };
    const input = {
      domainId: "styfi" as const,
      actions: [action("staked", "stYFI")],
      block: BLOCK,
      reader,
    };
    const first = resolveAlertAccountBlockContext(input);
    const second = resolveAlertAccountBlockContext(input);
    expect(first).toBe(second);
    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
    expect(read).toHaveBeenCalledOnce();
  });

  it("never performs a context read for synthetic protocol messages", async () => {
    const read = vi.fn();
    const synthetic: NormalizedAction = {
      ...action("yeth_recovery_progress", "yETH"),
      user: "yeth-system",
      principal: undefined,
      txHash: "meta:yeth:test",
      logIndex: 910_002,
      source: {
        kind: "synthetic",
        metricId: "meta:yeth:test",
        blockHash: BLOCK.blockHash,
        orderingIndex: 910_002,
      },
    };
    const context = await resolveAlertAccountBlockContext({
      domainId: "yeth",
      actions: [synthetic],
      block: BLOCK,
      reader: { read },
    });
    expect(context.snapshotsByPrincipal).toEqual({});
    expect(context.requestCount).toBe(0);
    expect(read).not.toHaveBeenCalled();
  });

  it("identifies ENS requests only at the canonical Multicall3 address", async () => {
    const seen: string[] = [];
    const reader: AlertAccountBlockReader = {
      async read(requests) {
        seen.push(...requests.map(({ to }) => to));
        throw new Error("stop after plan inspection");
      },
    };
    await expect(resolveAlertAccountBlockContext({
      domainId: "styfi",
      actions: [action("staked", "stYFI")],
      block: { ...BLOCK, blockHash: `0x${"c".repeat(64)}` },
      reader,
    })).rejects.toThrow("stop after plan inspection");
    expect(seen.filter((address) => address === ALERT_MULTICALL3)).toHaveLength(1);
  });
});
