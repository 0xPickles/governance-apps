import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";

import {
  ERC20_TRANSFER_ABI,
  ERC4626_DEPOSIT_ABI,
  ERC4626_WITHDRAW_ABI,
  YETH_CLAIM_CALL_ABI,
  YETH_CLAIM_EXIT_SELECTOR,
  YETH_CLAIM_NO_ARGUMENTS_SELECTOR,
  YETH_CLAIM_TOPIC,
  YETH_SET_CLAIM_TOPIC,
} from "@/workers/alerts-bot/src/abis";
import {
  YETH_CLAIM,
  YETH_CLAIM_DEPLOY_BLOCK,
  YETH_RECOVERY_VAULT,
} from "@/workers/alerts-bot/src/contracts";
import {
  applyYethSetClaim,
  createEmptyYethState,
} from "@/workers/alerts-bot/src/domains/yeth/accounting";
import {
  loadYethBlockIdentityRange,
  scanYethBlocks as scanCanonicalYethBlocks,
} from "@/workers/alerts-bot/src/domains/yeth/scanner";
import type { RpcBlock, RpcClient, RpcLog } from "@/workers/alerts-bot/src/rpc";

const ACCOUNT = "0x00000000000000000000000000000000000000a1" as Address;
const CLAIM_TEST_BASE = YETH_CLAIM_DEPLOY_BLOCK + 1_000;

function hashOf(value: number): Hex {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function setClaimLog(params: {
  blockNumber: number;
  logIndex?: number;
  amount?: bigint;
  malformed?: boolean;
  removed?: boolean;
  address?: Address;
}): RpcLog {
  return {
    address: params.address ?? YETH_CLAIM,
    topics: [
      YETH_SET_CLAIM_TOPIC,
      `0x${ACCOUNT.slice(2).padStart(64, "0")}`,
    ],
    data: params.malformed
      ? "0x01"
      : encodeAbiParameters(
          [{ type: "uint256" }],
          [params.amount ?? BigInt(params.blockNumber)],
        ),
    blockHash: hashOf(params.blockNumber),
    blockNumber: params.blockNumber,
    transactionHash: hashOf(params.blockNumber * 100 + (params.logIndex ?? 0)),
    logIndex: params.logIndex ?? 0,
    removed: params.removed ?? false,
  };
}

function rpcWithLogs(logs: RpcLog[]): RpcClient {
  return {
    getLogs: vi.fn(async (filter) => {
      const requested = new Set(
        (Array.isArray(filter.address) ? filter.address : [filter.address])
          .filter(
            (address: unknown): address is string => typeof address === "string",
          )
          .map((address: string) => address.toLowerCase()),
      );
      return logs.filter(
        (log) =>
          requested.has(log.address.toLowerCase()) ||
          (log.address.toLowerCase() !== YETH_CLAIM.toLowerCase() &&
            log.address.toLowerCase() !== YETH_RECOVERY_VAULT.toLowerCase()),
      );
    }),
    getBlockByNumber: vi.fn(async (number: number) =>
      block(number, hashOf(number - 1)),
    ),
  } as unknown as RpcClient;
}

function block(number: number, parentHash: string, salt = number): RpcBlock {
  return {
    number,
    hash: hashOf(salt),
    parentHash,
    timestamp: number,
  };
}

async function scanYethBlocks(
  params: Omit<Parameters<typeof scanCanonicalYethBlocks>[0], "verifiedBlocks"> & {
    readonly verifiedBlocks?: readonly RpcBlock[];
  },
) {
  const verifiedBlocks =
    params.verifiedBlocks ??
    Array.from(
      { length: params.toBlock - params.fromBlock + 1 },
      (_, index) => {
        const number = params.fromBlock + index;
        return block(number, hashOf(number - 1));
      },
    );
  return scanCanonicalYethBlocks({ ...params, verifiedBlocks });
}

function vaultLog(
  kind: "deposit" | "withdraw" | "transfer",
  blockNumber: number,
): RpcLog {
  const base = {
    address: YETH_RECOVERY_VAULT,
    blockHash: hashOf(blockNumber),
    blockNumber,
    transactionHash: hashOf(blockNumber * 1_000),
    logIndex: 0,
    removed: false,
  };
  if (kind === "deposit") {
    return {
      ...base,
      topics: encodeEventTopics({
        abi: ERC4626_DEPOSIT_ABI,
        eventName: "Deposit",
        args: { sender: ACCOUNT, owner: ACCOUNT },
      }) as string[],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        [1n, 1n],
      ),
    };
  }
  if (kind === "withdraw") {
    return {
      ...base,
      topics: encodeEventTopics({
        abi: ERC4626_WITHDRAW_ABI,
        eventName: "Withdraw",
        args: { sender: ACCOUNT, receiver: ACCOUNT, owner: ACCOUNT },
      }) as string[],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        [1n, 1n],
      ),
    };
  }
  return {
    ...base,
    topics: encodeEventTopics({
      abi: ERC20_TRANSFER_ABI,
      eventName: "Transfer",
      args: {
        sender: "0x0000000000000000000000000000000000000000",
        receiver: ACCOUNT,
      },
    }) as string[],
    data: encodeAbiParameters([{ type: "uint256" }], [1n]),
  };
}

describe("yETH strict scanner", () => {
  it("pins the deployed Claim and SetClaim topics and selectors", () => {
    expect(YETH_CLAIM_TOPIC).toBe(
      "0x45c072aa05b9853b5a993de7a28bc332ee01404a628cec1a23ce0f659f842ef1",
    );
    expect(YETH_SET_CLAIM_TOPIC).toBe(
      "0xfeade32aeee64616e3e6ab962ce2f5ac32e4224847165dbc4f9df38e93f56d68",
    );
    expect(YETH_CLAIM_NO_ARGUMENTS_SELECTOR).toBe("0x4e71d92d");
    expect(YETH_CLAIM_EXIT_SELECTOR).toBe("0x2d81a78e");
    expect(
      encodeFunctionData({
        abi: YETH_CLAIM_CALL_ABI,
        functionName: "claim",
        args: [],
      }),
    ).toBe("0x4e71d92d");
    expect(
      encodeFunctionData({
        abi: YETH_CLAIM_CALL_ABI,
        functionName: "claim",
        args: [true],
      }),
    ).toBe(`0x2d81a78e${"0".repeat(63)}1`);
  });

  it("keeps a complete earlier block and stops at B-1", async () => {
    const firstBlock = CLAIM_TEST_BASE + 10;
    const result = await scanYethBlocks({
      rpc: rpcWithLogs([
        setClaimLog({ blockNumber: firstBlock, amount: 5n }),
        setClaimLog({ blockNumber: firstBlock + 1, malformed: true }),
      ]),
      fromBlock: firstBlock,
      toBlock: firstBlock + 2,
      state: createEmptyYethState(),
    });

    expect(result.lastProcessedBlock).toBe(firstBlock);
    expect(result.failure).toMatchObject({
      code: "decode_failed",
      blockNumber: firstBlock + 1,
    });
    expect(result.state.snapshotUnclaimedEth).toBe(5n);
  });

  it("discards all same-block provisional accounting after a later malformed log", async () => {
    const blockNumber = CLAIM_TEST_BASE + 20;
    const result = await scanYethBlocks({
      rpc: rpcWithLogs([
        setClaimLog({ blockNumber, amount: 7n, logIndex: 0 }),
        setClaimLog({ blockNumber, malformed: true, logIndex: 1 }),
      ]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
    });

    expect(result.lastProcessedBlock).toBe(blockNumber - 1);
    expect(result.actions).toEqual([]);
    expect(result.state.totalSnapshotDebtEth).toBe(0n);
  });

  it("classifies the address/topic pair before allowing a removed-log ignore", async () => {
    const blockNumber = CLAIM_TEST_BASE + 30;
    const known = await scanYethBlocks({
      rpc: rpcWithLogs([setClaimLog({ blockNumber, removed: true })]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
    });
    expect(known.failure).toBeNull();
    expect(known.ignored).toHaveLength(1);
    expect(known.eventBlocksInspected).toBe(1);

    const unknown = await scanYethBlocks({
      rpc: rpcWithLogs([
        setClaimLog({
          blockNumber: blockNumber + 1,
          removed: true,
          address: "0x00000000000000000000000000000000000000ff",
        }),
      ]),
      fromBlock: blockNumber + 1,
      toBlock: blockNumber + 1,
      state: createEmptyYethState(),
    });
    expect(unknown.lastProcessedBlock).toBe(blockNumber);
    expect(unknown.failure).toMatchObject({
      code: "decode_failed",
      reason: "invalid_logs_response",
    });
    expect(unknown.eventBlocksInspected).toBe(0);
  });

  it("rejects unsafe block metadata instead of advancing", async () => {
    const blockNumber = CLAIM_TEST_BASE + 40;
    const unsafe = setClaimLog({ blockNumber });
    unsafe.blockNumber = blockNumber + 0.5;
    const result = await scanYethBlocks({
      rpc: rpcWithLogs([unsafe]),
      fromBlock: blockNumber,
      toBlock: blockNumber + 1,
      state: createEmptyYethState(),
    });
    expect(result).toMatchObject({
      lastProcessedBlock: blockNumber - 1,
      failure: { reason: "invalid_log_metadata" },
    });
  });

  it("rejects dirty address padding in indexed and unindexed encodings", async () => {
    const blockNumber = CLAIM_TEST_BASE + 50;
    const indexed = setClaimLog({ blockNumber });
    indexed.topics[1] = `0x${"11".repeat(12)}${ACCOUNT.slice(2)}`;
    const indexedResult = await scanYethBlocks({
      rpc: rpcWithLogs([indexed]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
    });
    expect(indexedResult.failure?.reason).toBe("monitored_log_undecodable");
    expect(indexedResult.eventBlocksInspected).toBe(1);

    const unindexed = setClaimLog({ blockNumber: blockNumber + 1 });
    unindexed.topics = [YETH_SET_CLAIM_TOPIC];
    unindexed.data = `0x${"11".repeat(12)}${ACCOUNT.slice(2)}${"1".padStart(64, "0")}`;
    const unindexedResult = await scanYethBlocks({
      rpc: rpcWithLogs([unindexed]),
      fromBlock: blockNumber + 1,
      toBlock: blockNumber + 1,
      state: createEmptyYethState(),
    });
    expect(unindexedResult.failure?.reason).toBe("monitored_log_undecodable");
    expect(unindexedResult.eventBlocksInspected).toBe(1);
  });

  it("rejects dirty indexed address padding for every vault event", async () => {
    for (const [index, kind] of (
      ["deposit", "withdraw", "transfer"] as const
    ).entries()) {
      const blockNumber = CLAIM_TEST_BASE + 60 + index;
      const dirty = vaultLog(kind, blockNumber);
      dirty.topics[1] = `0x${"11".repeat(12)}${ACCOUNT.slice(2)}`;
      const result = await scanYethBlocks({
        rpc: rpcWithLogs([dirty]),
        fromBlock: blockNumber,
        toBlock: blockNumber,
        state: createEmptyYethState(),
      });
      expect(result).toMatchObject({
        lastProcessedBlock: blockNumber - 1,
        failure: { reason: "monitored_log_undecodable" },
      });

      dirty.removed = true;
      const removed = await scanYethBlocks({
        rpc: rpcWithLogs([dirty]),
        fromBlock: blockNumber,
        toBlock: blockNumber,
        state: createEmptyYethState(),
      });
      expect(removed.failure?.reason).toBe("monitored_log_undecodable");
      expect(removed.ignored).toEqual([]);
    }

    const prefixBlock = CLAIM_TEST_BASE + 70;
    const earlier = setClaimLog({ blockNumber: prefixBlock, amount: 9n });
    const later = vaultLog("withdraw", prefixBlock + 1);
    later.topics[3] = `0x${"11".repeat(12)}${ACCOUNT.slice(2)}`;
    const prefix = await scanYethBlocks({
      rpc: rpcWithLogs([earlier, later]),
      fromBlock: prefixBlock,
      toBlock: prefixBlock + 1,
      state: createEmptyYethState(),
    });
    expect(prefix.lastProcessedBlock).toBe(prefixBlock);
    expect(prefix.state.snapshotUnclaimedEth).toBe(9n);
    expect(prefix.failure?.reason).toBe("monitored_log_undecodable");
  });

  it("binds every log, including removed logs, to the verified block hash", async () => {
    const blockNumber = CLAIM_TEST_BASE + 80;
    const chainA = block(blockNumber, hashOf(blockNumber - 1), 6_000);
    const forkB = setClaimLog({ blockNumber, amount: 4n });
    forkB.blockHash = hashOf(6_001);
    const mismatch = await scanYethBlocks({
      rpc: rpcWithLogs([forkB]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
      verifiedBlocks: [chainA],
    });
    expect(mismatch).toMatchObject({
      lastProcessedBlock: blockNumber - 1,
      failure: {
        blockHash: chainA.hash,
        reason: "log_block_hash_mismatch",
      },
    });
    expect(mismatch.state.totalSnapshotDebtEth).toBe(0n);

    forkB.removed = true;
    const removedMismatch = await scanYethBlocks({
      rpc: rpcWithLogs([forkB]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
      verifiedBlocks: [chainA],
    });
    expect(removedMismatch.failure?.reason).toBe("log_block_hash_mismatch");
    expect(removedMismatch.ignored).toEqual([]);

    for (const invalidHash of [null, "0x01", 7] as const) {
      const malformedBlock = blockNumber + 1;
      const malformed = {
        ...setClaimLog({ blockNumber: malformedBlock }),
        blockHash: invalidHash,
      } as unknown as RpcLog;
      const result = await scanYethBlocks({
        rpc: rpcWithLogs([malformed]),
        fromBlock: malformedBlock,
        toBlock: malformedBlock,
        state: createEmptyYethState(),
        verifiedBlocks: [block(malformedBlock, hashOf(malformedBlock - 1))],
      });
      expect(result.failure?.reason).toBe("invalid_log_metadata");
    }
  });

  it("turns malformed runtime log shapes into a typed later-block stop", async () => {
    const firstBlock = CLAIM_TEST_BASE + 90;
    const mutations: Array<(log: Record<string, unknown>) => void> = [
      (log) => { log.address = null; },
      (log) => { log.topics = null; },
      (log) => { log.topics = [7]; },
      (log) => { log.data = null; },
      (log) => { log.transactionHash = 7; },
      (log) => { log.removed = "false"; },
      (log) => { log.logIndex = Number.MAX_SAFE_INTEGER + 1; },
    ];
    for (const mutate of mutations) {
      const good = setClaimLog({ blockNumber: firstBlock, amount: 11n });
      const malformed = {
        ...setClaimLog({ blockNumber: firstBlock + 1, amount: 12n }),
      } as unknown as Record<string, unknown>;
      mutate(malformed);
      const result = await scanYethBlocks({
        rpc: rpcWithLogs([good, malformed as unknown as RpcLog]),
        fromBlock: firstBlock,
        toBlock: firstBlock + 1,
        state: createEmptyYethState(),
      });
      if (malformed.address === null) {
        expect(result).toMatchObject({
          lastProcessedBlock: firstBlock - 1,
          failure: {
            blockNumber: firstBlock,
            code: "lookup_failed",
            reason: "get_logs_failed",
          },
        });
        expect(result.state.snapshotUnclaimedEth).toBe(0n);
      } else if (
        malformed.topics === null ||
        (Array.isArray(malformed.topics) &&
          typeof malformed.topics[0] !== "string")
      ) {
        expect(result).toMatchObject({
          lastProcessedBlock: firstBlock - 1,
          failure: {
            blockNumber: firstBlock,
            code: "decode_failed",
            reason: "invalid_logs_response",
          },
        });
        expect(result.state.snapshotUnclaimedEth).toBe(0n);
      } else {
        expect(result).toMatchObject({
          lastProcessedBlock: firstBlock,
          failure: { blockNumber: firstBlock + 1, reason: "invalid_log_metadata" },
        });
        expect(result.state.snapshotUnclaimedEth).toBe(11n);
      }
    }
  });

  it("keeps elapsed getLogs failures distinct from PF data failures", async () => {
    const elapsed = new Error("test_elapsed");
    const blockNumber = CLAIM_TEST_BASE + 95;
    const logsFailure = await scanYethBlocks({
      rpc: {
        ...rpcWithLogs([]),
        getLogs: async () => {
          throw elapsed;
        },
      } as RpcClient,
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
      isElapsedTimeExceeded: (error) => error === elapsed,
    });
    expect(logsFailure.failure).toMatchObject({
      code: "elapsed_time",
      reason: "get_logs_failed",
    });
    expect(logsFailure.eventBlocksInspected).toBe(0);

  });

  it("uses canonical Claim event evidence without a transaction lookup", async () => {
    const blockNumber = CLAIM_TEST_BASE + 100;
    const txHash = hashOf(blockNumber * 100 + 1);
    const setClaim = setClaimLog({ blockNumber, amount: 11n, logIndex: 0 });
    const claim: RpcLog = {
      ...setClaimLog({ blockNumber, amount: 11n, logIndex: 1 }),
      topics: [
        YETH_CLAIM_TOPIC,
        `0x${ACCOUNT.slice(2).padStart(64, "0")}`,
      ],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [11n, 7n, 0n],
      ),
      transactionHash: txHash,
    };
    const getTransactionByHash = vi.fn(async () => {
      throw new Error("transaction lookup must not be used");
    });
    const rpc = {
      ...rpcWithLogs([setClaim, claim]),
      getTransactionByHash,
    } as unknown as RpcClient;
    const result = await scanYethBlocks({
      rpc,
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
    });
    expect(result.failure).toBeNull();
    expect(result.actions[0]).toMatchObject({
      kind: "yeth_claimed_exited",
      principal: { kind: "proven", address: ACCOUNT },
    });
    expect(getTransactionByHash).not.toHaveBeenCalled();
  });

  it("rejects a stayed claim without its vault companions", async () => {
    const blockNumber = CLAIM_TEST_BASE + 105;
    const claimTx = hashOf(blockNumber * 100 + 1);
    const setClaim = setClaimLog({ blockNumber, amount: 11n, logIndex: 0 });
    const claim: RpcLog = {
      ...setClaimLog({ blockNumber, amount: 11n, logIndex: 1 }),
      topics: [
        YETH_CLAIM_TOPIC,
        `0x${ACCOUNT.slice(2).padStart(64, "0")}`,
      ],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [11n, 7n, 1n],
      ),
      transactionHash: claimTx,
    };

    const result = await scanYethBlocks({
      rpc: rpcWithLogs([setClaim, claim]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
    });
    expect(result).toMatchObject({
      lastProcessedBlock: blockNumber - 1,
      actions: [],
      failure: {
        code: "accounting_failed",
        reason: "block_accounting_failed",
      },
    });
    expect(result.state.totalSnapshotDebtEth).toBe(0n);
  });

  it("preserves legacy transaction-hash casing in action metadata", async () => {
    const blockNumber = CLAIM_TEST_BASE + 110;
    const transactionHash = `0x${"AB".repeat(32)}`;
    const setClaim = {
      ...setClaimLog({ blockNumber, amount: 11n }),
      transactionHash,
    };
    const claim = {
      ...setClaimLog({ blockNumber, amount: 1n }),
      topics: [
        YETH_CLAIM_TOPIC,
        `0x${ACCOUNT.slice(2).padStart(64, "0")}`,
      ],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [11n, 7n, 0n],
      ),
      transactionHash,
      logIndex: 1,
    };
    const result = await scanYethBlocks({
      rpc: rpcWithLogs([setClaim, claim]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
    });
    expect(result.failure).toBeNull();
    expect(result.actions[0]).toMatchObject({
      kind: "yeth_claimed_exited",
      txHash: transactionHash,
      principal: { kind: "proven", address: ACCOUNT },
      amounts: {
        yethSnapshotAmount: 11n,
        yethUnderlyingAmount: 7n,
        yethClaimShares: 0n,
      },
    });
  });

  it("attributes a production claim-and-distribute transaction from event evidence", async () => {
    const blockNumber = 24_903_118;
    const transactionHash =
      "0x486ab5546f5da6d69db61fc7cc01b3780ecc24b8676c4980d28242fa034d8f76" as Hex;
    const account = "0x926df14a23be491164dcf93f4c468a50ef659d5b" as Address;
    const snapshotAmount = 0x143a9a32b69f7e81c1n;
    const underlying = 0x6771f49a7e05660bbn;
    const shares = 0x6506149a8ca336ddfn;
    const base = {
      blockHash: hashOf(blockNumber),
      blockNumber,
      transactionHash,
      removed: false,
    } as const;
    const mint: RpcLog = {
      ...base,
      address: YETH_RECOVERY_VAULT,
      topics: encodeEventTopics({
        abi: ERC20_TRANSFER_ABI,
        eventName: "Transfer",
        args: {
          sender: "0x0000000000000000000000000000000000000000",
          receiver: account,
        },
      }) as Hex[],
      data: encodeAbiParameters([{ type: "uint256" }], [shares]),
      logIndex: 268,
    };
    const deposit: RpcLog = {
      ...base,
      address: YETH_RECOVERY_VAULT,
      topics: encodeEventTopics({
        abi: ERC4626_DEPOSIT_ABI,
        eventName: "Deposit",
        args: { sender: YETH_CLAIM, owner: account },
      }) as Hex[],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        [underlying, shares],
      ),
      logIndex: 269,
    };
    const claim: RpcLog = {
      ...base,
      address: YETH_CLAIM,
      topics: [YETH_CLAIM_TOPIC, `0x${account.slice(2).padStart(64, "0")}`],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [snapshotAmount, underlying, shares],
      ),
      logIndex: 270,
    };
    const recipients = [
      ["0xc95f235896f5a82486ab645596fc29b76e52900c", 0x351c577459971e606n, 275],
      ["0x3c9f71ae57fea4a2e38c9d413705ed1fdcd9e3da", 0x20e5f7ed7052dc50an, 277],
      ["0xae79f0562c2128cc12d0ac068ac288856fe0e1ab", 0x04302431b9d7ad94n, 279],
      ["0xc989df5b623fa84e57e99ec9006283510ea8c2ec", 0xec0c2f5a71bc153bn, 281],
    ] as const;
    const transfers = recipients.map(([receiver, value, logIndex]): RpcLog => ({
      ...base,
      address: YETH_RECOVERY_VAULT,
      topics: encodeEventTopics({
        abi: ERC20_TRANSFER_ABI,
        eventName: "Transfer",
        args: { sender: account, receiver },
      }) as Hex[],
      data: encodeAbiParameters([{ type: "uint256" }], [value]),
      logIndex,
    }));
    const getTransactionByHash = vi.fn(async () => {
      throw new Error("transaction lookup must not be used");
    });
    const rpc = {
      ...rpcWithLogs([mint, deposit, claim, ...transfers]),
      getTransactionByHash,
    } as unknown as RpcClient;
    const state = createEmptyYethState();
    applyYethSetClaim(state, account, snapshotAmount);

    const result = await scanYethBlocks({
      rpc,
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state,
    });

    expect(result.failure).toBeNull();
    expect(result.actions[0]).toMatchObject({
      kind: "yeth_claimed_stayed",
      txHash: transactionHash,
      user: account,
      principal: { kind: "proven", address: account },
    });
    expect(getTransactionByHash).not.toHaveBeenCalled();
  });

  it("accepts the production process-report share mint without a Deposit event", async () => {
    const blockNumber = 24_721_750;
    const transactionHash =
      "0x336c3c3739b0765d09b243d68cce643ae4a252571e653eb7101687a3cd78e030" as Hex;
    const shares = 0x2060c8c55b504d36n;
    const reportMint: RpcLog = {
      address: YETH_RECOVERY_VAULT,
      topics: encodeEventTopics({
        abi: ERC20_TRANSFER_ABI,
        eventName: "Transfer",
        args: {
          sender: "0x0000000000000000000000000000000000000000",
          receiver: YETH_RECOVERY_VAULT,
        },
      }) as Hex[],
      data: encodeAbiParameters([{ type: "uint256" }], [shares]),
      blockHash: hashOf(blockNumber),
      blockNumber,
      transactionHash,
      logIndex: 1_064,
      removed: false,
    };

    const result = await scanYethBlocks({
      rpc: rpcWithLogs([reportMint]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
    });

    expect(result.failure).toBeNull();
    expect(result.actions).toEqual([]);
    expect(
      result.state.observedSharesByAddress.get(
        YETH_RECOVERY_VAULT.toLowerCase(),
      ),
    ).toBe(shares);
  });

  it("accepts the production process-report burn of vault-owned locked shares", async () => {
    const blockNumber = 24_793_498;
    const transactionHash =
      "0xafad8619fe92f6d1600e11f30f665f3c0b1f69aeab53a7021db5e514e192ea2e" as Hex;
    const mintedShares = 0x2060c8c55b504d36n;
    const burnedShares = 0x11c5a582c0665ca5n;
    const reportBurn: RpcLog = {
      address: YETH_RECOVERY_VAULT,
      topics: encodeEventTopics({
        abi: ERC20_TRANSFER_ABI,
        eventName: "Transfer",
        args: {
          sender: YETH_RECOVERY_VAULT,
          receiver: "0x0000000000000000000000000000000000000000",
        },
      }) as Hex[],
      data: encodeAbiParameters([{ type: "uint256" }], [burnedShares]),
      blockHash: hashOf(blockNumber),
      blockNumber,
      transactionHash,
      logIndex: 444,
      removed: false,
    };
    const state = createEmptyYethState();
    state.observedSharesByAddress.set(
      YETH_RECOVERY_VAULT.toLowerCase(),
      mintedShares,
    );

    const result = await scanYethBlocks({
      rpc: rpcWithLogs([reportBurn]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state,
    });

    expect(result.failure).toBeNull();
    expect(result.actions).toEqual([]);
    expect(
      result.state.observedSharesByAddress.get(
        YETH_RECOVERY_VAULT.toLowerCase(),
      ),
    ).toBe(mintedShares - burnedShares);
  });

  it("rejects a standalone user share burn without a Withdraw event", async () => {
    const blockNumber = CLAIM_TEST_BASE + 121;
    const userBurn = vaultLog("transfer", blockNumber);
    userBurn.topics = encodeEventTopics({
      abi: ERC20_TRANSFER_ABI,
      eventName: "Transfer",
      args: {
        sender: ACCOUNT,
        receiver: "0x0000000000000000000000000000000000000000",
      },
    }) as Hex[];
    const state = createEmptyYethState();
    state.observedSharesByAddress.set(ACCOUNT.toLowerCase(), 1n);

    const result = await scanYethBlocks({
      rpc: rpcWithLogs([userBurn]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state,
    });

    expect(result).toMatchObject({
      lastProcessedBlock: blockNumber - 1,
      actions: [],
      failure: {
        code: "accounting_failed",
        reason: "block_accounting_failed",
      },
    });
  });

  it("still rejects a Deposit event without its share-mint companion", async () => {
    const blockNumber = CLAIM_TEST_BASE + 120;
    const result = await scanYethBlocks({
      rpc: rpcWithLogs([vaultLog("deposit", blockNumber)]),
      fromBlock: blockNumber,
      toBlock: blockNumber,
      state: createEmptyYethState(),
    });

    expect(result).toMatchObject({
      lastProcessedBlock: blockNumber - 1,
      actions: [],
      failure: {
        code: "accounting_failed",
        reason: "block_accounting_failed",
      },
    });
  });

  it("returns only the exactly adjacent block-identity prefix", async () => {
    const parent = hashOf(1);
    const valid = block(40, parent, 40);
    const wrongParent = block(41, hashOf(999), 41);
    const rpc = {
      getBlockByNumber: vi.fn(async (number: number) =>
        number === 40 ? valid : wrongParent,
      ),
    };

    const result = await loadYethBlockIdentityRange({
      rpc,
      fromBlock: 40,
      toBlock: 42,
      expectedParentHash: parent,
    });

    expect(result.blocks).toEqual([valid]);
    expect(result.lastValidatedBlock).toBe(40);
    expect(result.failure).toMatchObject({
      blockNumber: 41,
      reason: "block_identity_non_adjacent",
    });
  });

  it("turns every malformed raw header into typed redacted evidence", async () => {
    const parent = hashOf(90);
    const valid = block(91, parent);
    const malformedValues: unknown[] = [
      null,
      { number: 92, hash: null, parentHash: valid.hash, timestamp: 92 },
      { number: 92, hash: "0x01", parentHash: valid.hash, timestamp: 92 },
      { number: 92, hash: hashOf(92), parentHash: null, timestamp: 92 },
      { number: 92, hash: hashOf(92), parentHash: "bad", timestamp: 92 },
      { number: 92.5, hash: hashOf(92), parentHash: valid.hash, timestamp: 92 },
    ];
    for (const malformed of malformedValues) {
      const rpc = {
        getBlockByNumber: vi.fn(async (number: number) =>
          (number === 91 ? valid : malformed) as RpcBlock,
        ),
      };
      const result = await loadYethBlockIdentityRange({
        rpc,
        fromBlock: 91,
        toBlock: 92,
        expectedParentHash: parent,
      });
      expect(result.blocks).toEqual([valid]);
      expect(result).toMatchObject({
        lastValidatedBlock: 91,
        failure: { blockNumber: 92, reason: "block_identity_malformed" },
      });
    }

    const unavailableTime = {
      ...block(92, valid.hash),
      timestamp: null,
    } satisfies RpcBlock;
    const unavailableTimeResult = await loadYethBlockIdentityRange({
      rpc: {
        getBlockByNumber: vi.fn(async (number: number) =>
          number === 91 ? valid : unavailableTime,
        ),
      },
      fromBlock: 91,
      toBlock: 92,
      expectedParentHash: parent,
    });
    expect(unavailableTimeResult).toEqual({
      blocks: [valid, unavailableTime],
      lastValidatedBlock: 92,
      failure: null,
    });

    const wrongTerminal = await loadYethBlockIdentityRange({
      rpc: {
        getBlockByNumber: vi.fn(async (number: number) =>
          number === 91 ? valid : block(92, valid.hash),
        ),
      },
      fromBlock: 91,
      toBlock: 92,
      expectedParentHash: parent,
      expectedTerminal: { blockNumber: 92, blockHash: hashOf(999) },
    });
    expect(wrongTerminal).toMatchObject({
      lastValidatedBlock: 91,
      failure: {
        blockNumber: 92,
        blockHash: hashOf(92),
        reason: "block_identity_terminal_mismatch",
      },
    });
  });
});
