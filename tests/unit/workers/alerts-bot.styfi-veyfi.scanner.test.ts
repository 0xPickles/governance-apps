import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

import {
  COOLDOWN_STREAMS_ABI,
  ERC20_TRANSFER_ABI,
  ERC4626_DEPOSIT_ABI,
  ERC4626_WITHDRAW_ABI,
  LEGACY_VEYFI_MODIFY_LOCK_ABI,
  LIQUID_LOCKER_EXCHANGE_ABI,
  LIQUID_LOCKER_REDEEM_ABI,
} from "@/workers/alerts-bot/src/abis";
import {
  LIQUID_LOCKERS,
  LIQUID_LOCKER_REDEMPTION,
  STYFI,
  STYFIX,
  VEYFI,
} from "@/workers/alerts-bot/src/contracts";
import {
  scanChunkForActionsWithProgress as scanCanonicalChunkForActionsWithProgress,
  type ChunkScanOptions,
} from "@/workers/alerts-bot/src/domains/styfi-veyfi/scanner";
import type {
  RpcBlock,
  RpcClient,
  RpcLog,
  RpcTransaction,
  RpcTransactionReceipt,
} from "@/workers/alerts-bot/src/rpc";
import { SAFE_EXEC_TRANSACTION_ABI } from "@/workers/alerts-bot/src/transaction-attribution";

const ONE = 10n ** 18n;
const STYFI_DEPOSIT_CALL_ABI = parseAbi([
  "function deposit(uint256 assets, address receiver) returns (uint256)",
]);
const STYFI_WITHDRAW_CALL_ABI = parseAbi([
  "function withdraw(uint256 assets) returns (uint256)",
  "function withdraw(uint256 assets, address receiver) returns (uint256)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256)",
  "function redeem(uint256 shares) returns (uint256)",
  "function redeem(uint256 shares, address receiver) returns (uint256)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256)",
]);
const LIQUID_LOCKER_REDEMPTION_CALL_ABI = parseAbi([
  "function redeem(uint256 index, uint256 amount) returns (uint256)",
]);
const DIRECT_STYFI_EXIT_CASES = [
  {
    label: "withdraw(uint256)",
    functionName: "withdraw",
    arity: 1,
    selector: "0x2e1a7d4d",
  },
  {
    label: "withdraw(uint256,address)",
    functionName: "withdraw",
    arity: 2,
    selector: "0x00f714ce",
  },
  {
    label: "withdraw(uint256,address,address)",
    functionName: "withdraw",
    arity: 3,
    selector: "0xb460af94",
  },
  {
    label: "redeem(uint256)",
    functionName: "redeem",
    arity: 1,
    selector: "0xdb006a75",
  },
  {
    label: "redeem(uint256,address)",
    functionName: "redeem",
    arity: 2,
    selector: "0x7bde82f2",
  },
  {
    label: "redeem(uint256,address,address)",
    functionName: "redeem",
    arity: 3,
    selector: "0xba087652",
  },
] as const;

function encodeDirectStyfiExitInput(
  testCase: (typeof DIRECT_STYFI_EXIT_CASES)[number],
  amount: bigint,
  owner: Address,
): Hex {
  if (testCase.arity === 1) {
    return encodeFunctionData({
      abi: STYFI_WITHDRAW_CALL_ABI,
      functionName: testCase.functionName,
      args: [amount],
    });
  }
  if (testCase.arity === 2) {
    return encodeFunctionData({
      abi: STYFI_WITHDRAW_CALL_ABI,
      functionName: testCase.functionName,
      args: [amount, owner],
    });
  }
  return encodeFunctionData({
    abi: STYFI_WITHDRAW_CALL_ABI,
    functionName: testCase.functionName,
    args: [amount, owner, owner],
  });
}

function hashOf(value: number): Hex {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function addressOf(value: number): Address {
  return `0x${value.toString(16).padStart(40, "0")}` as Address;
}

function verifiedBlock(blockNumber: number): RpcBlock {
  return {
    number: blockNumber,
    hash: hashOf(blockNumber),
    parentHash: hashOf(Math.max(0, blockNumber - 1)),
    timestamp: 1_800_000_000,
  };
}

async function scanChunkForActionsWithProgress(
  rpc: RpcClient,
  fromBlock: number,
  toBlock: number,
  options: Partial<ChunkScanOptions> = {},
) {
  return scanCanonicalChunkForActionsWithProgress(rpc, fromBlock, toBlock, {
    domainId: options.domainId ?? "styfi",
    verifiedBlocks:
      options.verifiedBlocks ??
      Array.from(
        { length: toBlock - fromBlock + 1 },
        (_, index) => verifiedBlock(fromBlock + index),
      ),
    ...(options.isBudgetExceeded === undefined
      ? {}
      : { isBudgetExceeded: options.isBudgetExceeded }),
    ...(options.isElapsedTimeExceeded === undefined
      ? {}
      : { isElapsedTimeExceeded: options.isElapsedTimeExceeded }),
  });
}

function depositLog(params: {
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly txHash: Hex;
  readonly contract?: Address;
  readonly sender?: Address;
  readonly owner?: Address;
  readonly assets?: bigint;
  readonly shares?: bigint;
  readonly malformed?: boolean;
}): RpcLog {
  const sender = params.sender ?? addressOf(1);
  const owner = params.owner ?? sender;
  return {
    address: params.contract ?? STYFI,
    topics: encodeEventTopics({
      abi: ERC4626_DEPOSIT_ABI,
      eventName: "Deposit",
      args: { sender, owner },
    }) as Hex[],
    data: params.malformed
      ? "0x"
      : encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          [params.assets ?? ONE, params.shares ?? ONE],
        ),
    blockHash: hashOf(params.blockNumber),
    blockNumber: params.blockNumber,
    transactionHash: params.txHash,
    logIndex: params.logIndex,
    removed: false,
  };
}

function nonBurnTransferLog(blockNumber: number, logIndex: number): RpcLog {
  return {
    address: STYFI,
    topics: encodeEventTopics({
      abi: ERC20_TRANSFER_ABI,
      eventName: "Transfer",
      args: { sender: addressOf(2), receiver: addressOf(3) },
    }) as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [ONE]),
    blockHash: hashOf(blockNumber),
    blockNumber,
    transactionHash: hashOf(20 + logIndex),
    logIndex,
    removed: false,
  };
}

function withdrawLog(params: {
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly txHash: Hex;
  readonly contract?: Address;
  readonly owner?: Address;
  readonly assets?: bigint;
  readonly shares?: bigint;
}): RpcLog {
  const owner = params.owner ?? addressOf(5);
  return {
    address: params.contract ?? STYFI,
    topics: encodeEventTopics({
      abi: ERC4626_WITHDRAW_ABI,
      eventName: "Withdraw",
      args: { sender: owner, receiver: owner, owner },
    }) as Hex[],
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [params.assets ?? ONE, params.shares ?? ONE],
    ),
    blockHash: hashOf(params.blockNumber),
    blockNumber: params.blockNumber,
    transactionHash: params.txHash,
    logIndex: params.logIndex,
    removed: false,
  };
}

function burnLog(params: {
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly txHash: Hex;
  readonly owner?: Address;
  readonly shares?: bigint;
  readonly contract?: Address;
}): RpcLog {
  const owner = params.owner ?? addressOf(5);
  return {
    address: params.contract ?? STYFI,
    topics: encodeEventTopics({
      abi: ERC20_TRANSFER_ABI,
      eventName: "Transfer",
      args: {
        sender: owner,
        receiver: "0x0000000000000000000000000000000000000000",
      },
    }) as Hex[],
    data: encodeAbiParameters(
      [{ type: "uint256" }],
      [params.shares ?? ONE],
    ),
    blockHash: hashOf(params.blockNumber),
    blockNumber: params.blockNumber,
    transactionHash: params.txHash,
    logIndex: params.logIndex,
    removed: false,
  };
}

function redeemLog(blockNumber: number, token: Address = addressOf(999)): RpcLog {
  return {
    address: LIQUID_LOCKER_REDEMPTION,
    topics: encodeEventTopics({
      abi: LIQUID_LOCKER_REDEEM_ABI,
      eventName: "Redeem",
      args: { token },
    }) as Hex[],
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [ONE, ONE / 10n],
    ),
    blockHash: hashOf(blockNumber),
    blockNumber,
    transactionHash: hashOf(blockNumber),
    logIndex: 0,
    removed: false,
  };
}

function exchangeLog(blockNumber: number, token: Address = addressOf(999)): RpcLog {
  return {
    address: LIQUID_LOCKER_REDEMPTION,
    topics: encodeEventTopics({
      abi: LIQUID_LOCKER_EXCHANGE_ABI,
      eventName: "Exchange",
      args: { token },
    }) as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [ONE]),
    blockHash: hashOf(blockNumber),
    blockNumber,
    transactionHash: hashOf(blockNumber),
    logIndex: 0,
    removed: false,
  };
}

function transactionFor(params: {
  readonly hash: Hex;
  readonly blockNumber: number;
  readonly from?: Address;
  readonly to?: Address | null;
  readonly input?: Hex;
}): RpcTransaction {
  return {
    hash: params.hash,
    from: params.from ?? addressOf(70),
    to: params.to ?? null,
    blockHash: hashOf(params.blockNumber),
    blockNumber: params.blockNumber,
    nonce: 0,
    transactionIndex: 0,
    value: "0x0",
    input: params.input ?? "0x",
  };
}

function modifyLockLog(blockNumber: number): RpcLog {
  const user = addressOf(4);
  return {
    address: VEYFI,
    topics: encodeEventTopics({
      abi: LEGACY_VEYFI_MODIFY_LOCK_ABI,
      eventName: "ModifyLock",
      args: { sender: user, user },
    }) as Hex[],
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [2n * ONE, 2_000_000n, 1_900_000n],
    ),
    blockHash: hashOf(blockNumber),
    blockNumber,
    transactionHash: hashOf(30),
    logIndex: 0,
    removed: false,
  };
}

function createRpc(params: {
  readonly logs: RpcLog[];
  readonly getLogs?: RpcClient["getLogs"];
  readonly call?: RpcClient["call"];
  readonly getTransactionByHash?: RpcClient["getTransactionByHash"];
  readonly getTransactionReceipt?: RpcClient["getTransactionReceipt"];
}): RpcClient {
  const emptyTransactions = (async (input: string | string[]) =>
    typeof input === "string" ? null : input.map(() => null)) as RpcClient["getTransactionByHash"];
  const emptyReceipts = (async (input: string | string[]) =>
    typeof input === "string" ? null : input.map(() => null)) as RpcClient["getTransactionReceipt"];
  return {
    getBlockNumber: async () => 0,
    getBlockByNumber: async (blockTag) => {
      if (blockTag === "latest") {
        throw new Error("latest is not used in this fixture");
      }
      return {
        number: blockTag,
        hash: hashOf(blockTag),
        parentHash: hashOf(Math.max(0, blockTag - 1)),
        timestamp: 1_800_000_000,
      };
    },
    getLogs:
      params.getLogs ??
      (async (filter) => {
        const addresses = new Set(
          (Array.isArray(filter.address) ? filter.address : [filter.address])
            .filter((address): address is string => typeof address === "string")
            .map((address) => address.toLowerCase()),
        );
        return params.logs.filter((log) =>
          addresses.has(log.address.toLowerCase()),
        );
      }),
    call:
      params.call ??
      ((async (requestOrRequests: unknown) => {
        const result = encodeFunctionResult({
          abi: COOLDOWN_STREAMS_ABI,
          functionName: "streams",
          result: [0n, 1_000n * ONE, 0n],
        });
        return Array.isArray(requestOrRequests)
          ? requestOrRequests.map(() => result)
          : result;
      }) as RpcClient["call"]),
    getTransactionByHash: params.getTransactionByHash ?? emptyTransactions,
    getTransactionReceipt: params.getTransactionReceipt ?? emptyReceipts,
  };
}

function streamResult(total: bigint, claimed: bigint): Hex {
  return encodeFunctionResult({
    abi: COOLDOWN_STREAMS_ABI,
    functionName: "streams",
    result: [0n, total, claimed],
  });
}

describe("stYFI/veYFI strict scanner", () => {
  it.each([
    {
      label: "stYFI",
      contract: STYFI,
      domainId: "styfi",
      scale: 1n,
    },
    {
      label: "stYFIx",
      contract: STYFIX,
      domainId: "styfi",
      scale: 1n,
    },
    {
      label: "supYFI",
      contract: LIQUID_LOCKERS.find(({ symbol }) => symbol === "supYFI")!
        .depositor,
      domainId: "veyfi",
      scale: 69_420n,
    },
  ] as const)(
    "rejects noncanonical $label Deposit and Withdraw ratios before snapshot work",
    async ({ contract, domainId, scale }) => {
      const baseBlock =
        80 +
        [STYFI, STYFIX].findIndex(
          (candidate) => candidate.toLowerCase() === contract.toLowerCase(),
        ) +
        (domainId === "veyfi" ? 3 : 0);
      const call = vi.fn(async () => {
        throw new Error("snapshot work must not run");
      }) as unknown as RpcClient["call"];
      const malformedDeposit = depositLog({
        blockNumber: baseBlock,
        logIndex: 0,
        txHash: hashOf(baseBlock),
        contract,
        assets: scale * ONE + 1n,
        shares: ONE,
      });
      const depositResult = await scanChunkForActionsWithProgress(
        createRpc({ logs: [malformedDeposit], call }),
        baseBlock,
        baseBlock,
        { domainId },
      );
      expect(depositResult).toMatchObject({
        actions: [],
        lastProcessedBlock: baseBlock - 1,
        failure: { code: "decode_failed", blockNumber: baseBlock },
      });

      const withdrawBlock = baseBlock + 10;
      const withdrawResult = await scanChunkForActionsWithProgress(
        createRpc({
          logs: [
            withdrawLog({
              blockNumber: withdrawBlock,
              logIndex: 0,
              txHash: hashOf(withdrawBlock),
              contract,
              assets: scale * ONE + 1n,
              shares: ONE,
            }),
          ],
          call,
        }),
        withdrawBlock,
        withdrawBlock,
        { domainId },
      );
      expect(withdrawResult).toMatchObject({
        actions: [],
        lastProcessedBlock: withdrawBlock - 1,
        failure: { code: "decode_failed", blockNumber: withdrawBlock },
      });

      const removedBlock = baseBlock + 20;
      malformedDeposit.blockNumber = removedBlock;
      malformedDeposit.blockHash = hashOf(removedBlock);
      malformedDeposit.transactionHash = hashOf(removedBlock);
      malformedDeposit.removed = true;
      const removedResult = await scanChunkForActionsWithProgress(
        createRpc({ logs: [malformedDeposit], call }),
        removedBlock,
        removedBlock,
        { domainId },
      );
      expect(removedResult).toMatchObject({
        actions: [],
        ignoredLogs: [],
        lastProcessedBlock: removedBlock - 1,
        failure: { code: "decode_failed", blockNumber: removedBlock },
      });
      expect(call).not.toHaveBeenCalled();
    },
  );

  it("discards every provisional action in a block when a later decode fails", async () => {
    const blockNumber = 100;
    const rpc = createRpc({
      logs: [
        depositLog({ blockNumber, logIndex: 0, txHash: hashOf(1) }),
        depositLog({
          blockNumber,
          logIndex: 1,
          txHash: hashOf(2),
          malformed: true,
        }),
      ],
    });

    const result = await scanChunkForActionsWithProgress(
      rpc,
      blockNumber,
      blockNumber,
    );

    expect(result).toMatchObject({
      actions: [],
      chunkComplete: false,
      lastProcessedBlock: blockNumber - 1,
      budgetExhausted: false,
      failure: { code: "decode_failed", blockNumber },
    });
  });

  it("returns earlier complete blocks but stops before the affected block", async () => {
    const firstBlock = 200;
    const rpc = createRpc({
      logs: [
        nonBurnTransferLog(firstBlock, 0),
        depositLog({
          blockNumber: firstBlock + 1,
          logIndex: 0,
          txHash: hashOf(3),
          malformed: true,
        }),
      ],
    });

    const result = await scanChunkForActionsWithProgress(
      rpc,
      firstBlock,
      firstBlock + 1,
    );

    expect(result.lastProcessedBlock).toBe(firstBlock);
    expect(result.ignoredLogs).toEqual([
      { blockNumber: firstBlock, logIndex: 0, reason: "non_burn_transfer" },
    ]);
    expect(result.failure).toEqual({
      code: "decode_failed",
      blockNumber: firstBlock + 1,
    });
  });

  it("classifies legacy lookup failures while trusting indexed stYFI actors", async () => {
    const lookupBlock = 300;
    const lookupResult = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [modifyLockLog(lookupBlock)],
        call: async () => {
          throw new Error("archive lookup failed");
        },
      }),
      lookupBlock,
      lookupBlock,
      { domainId: "veyfi" },
    );
    expect(lookupResult.failure).toEqual({
      code: "lookup_failed",
      blockNumber: lookupBlock,
    });
    expect(lookupResult.actions).toEqual([]);
    expect(lookupResult.eventBlocksInspected).toBe(1);

    const attributionBlock = 301;
    const attributionResult = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [
          depositLog({
            blockNumber: attributionBlock,
            logIndex: 0,
            txHash: hashOf(31),
          }),
        ],
        getTransactionByHash: async () => {
          throw new Error("transaction lookup failed");
        },
        getTransactionReceipt: (async (input: string | string[]) =>
          typeof input === "string" ? null : input.map(() => null)) as RpcClient["getTransactionReceipt"],
      }),
      attributionBlock,
      attributionBlock,
    );
    expect(attributionResult.failure).toBeNull();
    expect(attributionResult.actions).toHaveLength(1);
    expect(attributionResult.actions[0]).toMatchObject({
      kind: "staked",
      user: addressOf(1),
      owner: addressOf(1),
      caller: addressOf(1),
    });
  });

  it("preserves elapsed-time exhaustion from range and secondary RPC reads", async () => {
    const blockNumber = 302;
    const elapsed = new Error("elapsed sentinel");
    const classifyElapsed = (error: unknown) => error === elapsed;

    const range = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [],
        getLogs: async () => {
          throw elapsed;
        },
      }),
      blockNumber,
      blockNumber,
      { isElapsedTimeExceeded: classifyElapsed },
    );
    expect(range).toMatchObject({
      actions: [],
      eventBlocksInspected: 0,
      chunkComplete: false,
      lastProcessedBlock: blockNumber - 1,
      failure: { code: "elapsed_time", blockNumber },
    });

    const secondary = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [modifyLockLog(blockNumber)],
        call: async () => {
          throw elapsed;
        },
      }),
      blockNumber,
      blockNumber,
      {
        domainId: "veyfi",
        isElapsedTimeExceeded: classifyElapsed,
      },
    );
    expect(secondary).toMatchObject({
      actions: [],
      eventBlocksInspected: 1,
      chunkComplete: false,
      lastProcessedBlock: blockNumber - 1,
      failure: { code: "elapsed_time", blockNumber },
    });
  });

  it("returns typed intentional ignores and advances their complete block", async () => {
    const blockNumber = 400;
    const removed = depositLog({
      blockNumber,
      logIndex: 0,
      txHash: hashOf(40),
    });
    removed.removed = true;
    const result = await scanChunkForActionsWithProgress(
      createRpc({ logs: [removed, nonBurnTransferLog(blockNumber, 1)] }),
      blockNumber,
      blockNumber,
    );

    expect(result).toMatchObject({
      actions: [],
      eventBlocksInspected: 1,
      chunkComplete: true,
      lastProcessedBlock: blockNumber,
      failure: null,
    });
    expect(result.ignoredLogs).toEqual([
      { blockNumber, logIndex: 0, reason: "removed" },
      { blockNumber, logIndex: 1, reason: "non_burn_transfer" },
    ]);

    const malformedRemoved = depositLog({
      blockNumber: blockNumber + 1,
      logIndex: 0,
      txHash: hashOf(41),
      malformed: true,
    });
    malformedRemoved.removed = true;
    const malformedResult = await scanChunkForActionsWithProgress(
      createRpc({ logs: [malformedRemoved] }),
      blockNumber + 1,
      blockNumber + 1,
    );
    expect(malformedResult).toMatchObject({
      actions: [],
      ignoredLogs: [],
      chunkComplete: false,
      lastProcessedBlock: blockNumber,
      failure: { code: "decode_failed", blockNumber: blockNumber + 1 },
    });
  });

  it("fixtures every paired and internal intentional ignore", async () => {
    const blockNumber = 410;
    const internalTxHash = hashOf(410);
    const internalDeposit = depositLog({
      blockNumber,
      logIndex: 0,
      txHash: internalTxHash,
      contract: STYFI,
      sender: STYFIX,
      owner: STYFIX,
    });
    const outerDeposit = depositLog({
      blockNumber,
      logIndex: 1,
      txHash: internalTxHash,
      contract: STYFIX,
    });
    const burnTxHash = hashOf(411);
    const burn: RpcLog = {
      address: STYFI,
      topics: encodeEventTopics({
        abi: ERC20_TRANSFER_ABI,
        eventName: "Transfer",
        args: {
          sender: addressOf(9),
          receiver: "0x0000000000000000000000000000000000000000",
        },
      }) as Hex[],
      data: encodeAbiParameters([{ type: "uint256" }], [ONE]),
      blockHash: hashOf(blockNumber),
      blockNumber,
      transactionHash: burnTxHash,
      logIndex: 2,
      removed: false,
    };
    const pairedWithdraw = withdrawLog({
      blockNumber,
      logIndex: 3,
      txHash: burnTxHash,
      owner: addressOf(9),
    });

    const directExitTransaction = transactionFor({
      hash: burnTxHash,
      blockNumber,
      from: addressOf(9),
      to: STYFI,
      input: encodeFunctionData({
        abi: STYFI_WITHDRAW_CALL_ABI,
        functionName: "withdraw",
        args: [ONE, addressOf(9), addressOf(9)],
      }),
    });
    const result = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [internalDeposit, outerDeposit, burn, pairedWithdraw],
        getTransactionByHash: (async (input: string | string[]) =>
          typeof input === "string"
            ? directExitTransaction
            : input.map(() => directExitTransaction)) as RpcClient["getTransactionByHash"],
      }),
      blockNumber,
      blockNumber,
    );

    expect(result.failure).toBeNull();
    expect(result.actions.map((action) => action.kind)).toEqual([
      "staked",
      "withdrew_from_cooldown",
    ]);
    expect(result.ignoredLogs).toEqual([
      {
        blockNumber,
        logIndex: internalDeposit.logIndex,
        reason: "internal_styfi_deposit",
      },
      {
        blockNumber,
        logIndex: burn.logIndex,
        reason: "paired_withdraw_burn",
      },
    ]);

    const malformedInternal = { ...internalDeposit, data: "0x" };
    const malformed = await scanChunkForActionsWithProgress(
      createRpc({ logs: [malformedInternal, outerDeposit] }),
      blockNumber,
      blockNumber,
    );
    expect(malformed).toMatchObject({
      actions: [],
      lastProcessedBlock: blockNumber - 1,
      failure: { code: "decode_failed", blockNumber },
    });
  });

  it("fails closed for an unknown address/topic pair and redemption token", async () => {
    const pairBlock = 420;
    const unexpectedLog = redeemLog(pairBlock);
    unexpectedLog.address = STYFI;
    const unexpectedPair = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [unexpectedLog],
      }),
      pairBlock,
      pairBlock,
    );
    expect(unexpectedPair).toMatchObject({
      actions: [],
      lastProcessedBlock: pairBlock - 1,
      failure: { code: "decode_failed", blockNumber: pairBlock },
    });

    const removedUnexpected = { ...unexpectedLog };
    removedUnexpected.logIndex = 1;
    removedUnexpected.removed = true;
    const removedUnexpectedPair = await scanChunkForActionsWithProgress(
      createRpc({ logs: [removedUnexpected] }),
      pairBlock,
      pairBlock,
    );
    expect(removedUnexpectedPair.failure).toEqual({
      code: "decode_failed",
      blockNumber: pairBlock,
    });

    const tokenBlock = pairBlock + 1;
    const unknownToken = await scanChunkForActionsWithProgress(
      createRpc({ logs: [redeemLog(tokenBlock)] }),
      tokenBlock,
      tokenBlock,
      { domainId: "veyfi" },
    );
    expect(unknownToken).toMatchObject({
      actions: [],
      lastProcessedBlock: tokenBlock - 1,
      failure: { code: "unsupported_action", blockNumber: tokenBlock },
    });

    const unknownExchangeToken = await scanChunkForActionsWithProgress(
      createRpc({ logs: [exchangeLog(tokenBlock + 1)] }),
      tokenBlock + 1,
      tokenBlock + 1,
      { domainId: "veyfi" },
    );
    expect(unknownExchangeToken.failure).toEqual({
      code: "unsupported_action",
      blockNumber: tokenBlock + 1,
    });
  });

  it("keeps indexed stYFI actors and represents an explicitly unavailable liquid-locker sender", async () => {
    const blockNumber = 430;
    const txHash = hashOf(430);
    const plausibleActorsMissing = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [depositLog({ blockNumber, logIndex: 0, txHash })],
      }),
      blockNumber,
      blockNumber,
    );
    expect(plausibleActorsMissing.failure).toBeNull();
    expect(plausibleActorsMissing.actions[0]).toMatchObject({
      user: addressOf(1),
      owner: addressOf(1),
      caller: addressOf(1),
    });

    const zeroAddress =
      "0x0000000000000000000000000000000000000000" as Address;
    const zeroActorsMissing = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [
          depositLog({
            blockNumber: blockNumber + 1,
            logIndex: 0,
            txHash: hashOf(431),
            sender: zeroAddress,
            owner: zeroAddress,
          }),
        ],
      }),
      blockNumber + 1,
      blockNumber + 1,
    );
    expect(zeroActorsMissing.failure).toEqual({
      code: "decode_failed",
      blockNumber: blockNumber + 1,
    });

    const locker = LIQUID_LOCKERS[0];
    if (!locker) {
      throw new Error("Missing liquid-locker fixture");
    }
    const missingLockerActor = await scanChunkForActionsWithProgress(
      createRpc({ logs: [redeemLog(blockNumber + 2, locker.token)] }),
      blockNumber + 2,
      blockNumber + 2,
      { domainId: "veyfi" },
    );
    expect(missingLockerActor.failure).toBeNull();
    expect(missingLockerActor.actions).toHaveLength(1);
    expect(missingLockerActor.actions[0]).toMatchObject({
      kind: "redeem",
      user: null,
      principal: {
        kind: "unavailable",
        reason: "canonical_sender_unavailable",
      },
    });

    const missingExchangeActor = await scanChunkForActionsWithProgress(
      createRpc({ logs: [exchangeLog(blockNumber + 3, locker.token)] }),
      blockNumber + 3,
      blockNumber + 3,
      { domainId: "veyfi" },
    );
    expect(missingExchangeActor).toMatchObject({
      actions: [{
        kind: "exchange",
        user: null,
        principal: { kind: "unavailable", reason: "canonical_sender_unavailable" },
      }],
      eventBlocksInspected: 1,
      lastProcessedBlock: blockNumber + 3,
      failure: null,
    });

    const zeroLockerSenderBlock = blockNumber + 4;
    const zeroLockerSender = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [redeemLog(zeroLockerSenderBlock, locker.token)],
        getTransactionByHash: (async (input: string | string[]) => {
          const transaction = (hash: string) =>
            transactionFor({
              hash: hash as Hex,
              blockNumber: zeroLockerSenderBlock,
              from: zeroAddress,
            });
          return typeof input === "string"
            ? transaction(input)
            : input.map(transaction);
        }) as RpcClient["getTransactionByHash"],
      }),
      zeroLockerSenderBlock,
      zeroLockerSenderBlock,
      { domainId: "veyfi" },
    );
    expect(zeroLockerSender.actions).toEqual([]);
    expect(zeroLockerSender.eventBlocksInspected).toBe(1);
    expect(zeroLockerSender.failure).toEqual({
      code: "attribution_failed",
      blockNumber: zeroLockerSenderBlock,
    });
  });

  it("batches actor RPC once per chunk and stops at the earliest mismatched hash", async () => {
    const locker = LIQUID_LOCKERS[0];
    if (!locker) throw new Error("Missing liquid-locker fixture");
    const firstBlock = 440;
    const firstHash = hashOf(440);
    const secondHash = hashOf(441);
    const logs = [
      redeemLog(firstBlock, locker.token),
      redeemLog(firstBlock + 1, locker.token),
    ];
    const getTransactionByHash = vi.fn(async (input: string | string[]) => {
      if (typeof input === "string") {
        return transactionFor({ hash: input as Hex, blockNumber: firstBlock });
      }
      return [
        transactionFor({
          hash: firstHash,
          blockNumber: firstBlock,
          to: LIQUID_LOCKER_REDEMPTION,
        }),
        transactionFor({
          hash: hashOf(999),
          blockNumber: firstBlock + 1,
          to: LIQUID_LOCKER_REDEMPTION,
        }),
      ];
    }) as RpcClient["getTransactionByHash"];
    const result = await scanChunkForActionsWithProgress(
      createRpc({ logs, getTransactionByHash }),
      firstBlock,
      firstBlock + 1,
      { domainId: "veyfi" },
    );

    expect(getTransactionByHash).toHaveBeenCalledTimes(1);
    expect(getTransactionByHash).toHaveBeenCalledWith([firstHash, secondHash]);
    expect(result).toMatchObject({
      lastProcessedBlock: firstBlock,
      failure: { code: "attribution_failed", blockNumber: firstBlock + 1 },
    });
    expect(result.actions.map((action) => action.txHash)).toEqual([firstHash]);
  });

  it("preserves a direct actor and leaves a later indirect Safe trade anonymous", async () => {
    const locker = LIQUID_LOCKERS[0];
    if (!locker) {
      throw new Error("Missing liquid-locker fixture");
    }
    const firstBlock = 445;
    const firstHash = hashOf(firstBlock);
    const expectedSender = addressOf(445);
    const invalidSafeInput = encodeFunctionData({
      abi: SAFE_EXEC_TRANSACTION_ABI,
      functionName: "execTransaction",
      args: [
        addressOf(999),
        0n,
        "0x12345678",
        0,
        0n,
        0n,
        0n,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        "0x1234",
      ],
    });
    const result = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [
          redeemLog(firstBlock, locker.token),
          redeemLog(firstBlock + 1, locker.token),
        ],
        getTransactionByHash: (async (input: string | string[]) => {
          const transaction = (hash: string) =>
            transactionFor({
              hash: hash as Hex,
              blockNumber: hash === firstHash ? firstBlock : firstBlock + 1,
              from: hash === firstHash ? expectedSender : addressOf(446),
              to:
                hash === firstHash
                  ? LIQUID_LOCKER_REDEMPTION
                  : addressOf(999),
              input: hash === firstHash ? "0x" : invalidSafeInput,
            });
          return typeof input === "string"
            ? transaction(input)
            : input.map(transaction);
        }) as RpcClient["getTransactionByHash"],
      }),
      firstBlock,
      firstBlock + 1,
      { domainId: "veyfi" },
    );

    expect(result).toMatchObject({
      lastProcessedBlock: firstBlock + 1,
      failure: null,
    });
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toMatchObject({
      txHash: firstHash,
      user: expectedSender,
      kind: "redeem",
    });
    expect(result.actions[1]).toMatchObject({
      kind: "redeem",
      user: null,
      principal: { kind: "unavailable", reason: "canonical_sender_unavailable" },
    });
  });

  it("attributes the production Safe-wrapped Cove redemption to the Safe", async () => {
    const locker = LIQUID_LOCKERS[2];
    if (!locker) {
      throw new Error("Missing Cove liquid-locker fixture");
    }
    const blockNumber = 24_650_397;
    const transactionHash =
      "0x7ef93dad8f455cbf068aa0af783d3ed24da3f0f8694dcb8d5db96336964cee84" as Hex;
    const executor = "0x48f2bd7513da5bb9f7bfd54ea37c41650fd5f3a3" as Address;
    const safe = "0x71bdc5f3aba49538c76d58bc2ab4e3a1118dae4c" as Address;
    const amount = 0xb14b336cc0b3300bn;
    const fee = 0x15c707120a9cec4n;
    const log: RpcLog = {
      ...redeemLog(blockNumber, locker.token),
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        [amount, fee],
      ),
      transactionHash,
      logIndex: 461,
    };
    const innerInput = encodeFunctionData({
      abi: LIQUID_LOCKER_REDEMPTION_CALL_ABI,
      functionName: "redeem",
      args: [2n, amount],
    });
    const safeInput = encodeFunctionData({
      abi: SAFE_EXEC_TRANSACTION_ABI,
      functionName: "execTransaction",
      args: [
        LIQUID_LOCKER_REDEMPTION,
        0n,
        innerInput,
        0,
        0n,
        0n,
        0n,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        "0x1234",
      ],
    });
    const transaction = transactionFor({
      hash: transactionHash,
      blockNumber,
      from: executor,
      to: safe,
      input: safeInput,
    });
    const result = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [log],
        getTransactionByHash: (async (input: string | readonly string[]) =>
          Array.isArray(input) ? input.map(() => transaction) : transaction) as RpcClient["getTransactionByHash"],
      }),
      blockNumber,
      blockNumber,
      { domainId: "veyfi" },
    );

    expect(result.failure).toBeNull();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      kind: "redeem",
      txHash: transactionHash,
      user: safe,
      caller: safe,
      principal: { kind: "proven", address: safe },
      amounts: { amount, fee },
    });
  });

  it("keeps a production router redemption anonymous without stopping replay", async () => {
    const locker = LIQUID_LOCKERS[1];
    if (!locker) {
      throw new Error("Missing 1UP liquid-locker fixture");
    }
    const blockNumber = 24_842_464;
    const transactionHash =
      "0x25e09d06cf1a0d7b6e58f0b107d0bde9b4e409fc1e281c96469173ce62a127ea" as Hex;
    const transaction = transactionFor({
      hash: transactionHash,
      blockNumber,
      from: "0xc0ffeebabe5d496b2dde509f9fa189c25cf29671",
      to: "0xe08d97e151473a848c3d9ca3f323cb720472d015",
      input: "0x8cbf8566",
    });
    const result = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [
          {
            ...redeemLog(blockNumber, locker.token),
            transactionHash,
            logIndex: 15,
          },
        ],
        getTransactionByHash: (async (input: string | readonly string[]) =>
          Array.isArray(input) ? input.map(() => transaction) : transaction) as RpcClient["getTransactionByHash"],
      }),
      blockNumber,
      blockNumber,
      { domainId: "veyfi" },
    );

    expect(result.failure).toBeNull();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      kind: "redeem",
      txHash: transactionHash,
      user: null,
      principal: {
        kind: "unavailable",
        reason: "canonical_sender_unavailable",
      },
    });
  });

  it.each(["redeem", "exchange"] as const)("keeps a Safe batch %s anonymous without stopping replay", async (kind) => {
    // The production stall was a Safe MultiSend redemption in this block.
    const blockNumber = 25_902_744;
    const transactionHash = "0x6bb6a069c1ee85687fc1ad06ef5d81512278597888d237a49b6109b014159e72" as Hex;
    const log = (kind === "redeem" ? redeemLog : exchangeLog)(blockNumber, LIQUID_LOCKERS[1]!.token);
    const transaction = transactionFor({
      hash: transactionHash,
      blockNumber,
      to: "0x66bdefa7abf210d1240c9ec00000aafcfc80a235",
      input: encodeFunctionData({
        abi: SAFE_EXEC_TRANSACTION_ABI,
        functionName: "execTransaction",
        args: [
          "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D",
          0n, "0x8d80ff0a", 1, 0n, 0n, 0n,
          "0x0000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000", "0x1234",
        ],
      }),
    });
    const result = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [{ ...log, transactionHash }],
        getTransactionByHash: (async (input: string | readonly string[]) =>
          typeof input === "string" ? transaction : input.map(() => transaction)) as RpcClient["getTransactionByHash"],
      }),
      blockNumber,
      blockNumber,
      { domainId: "veyfi" },
    );
    expect(result.failure).toBeNull();
    expect(result.chunkComplete).toBe(true);
    expect(result.actions).toMatchObject([{
      kind,
      user: null,
      principal: { kind: "unavailable", reason: "canonical_sender_unavailable" },
    }]);
  });

  it.each(LIQUID_LOCKERS)("keeps a routed $symbol buy and subsequent redemption without stopping replay", async (locker) => {
    const blockNumber = 460;
    const transaction = transactionFor({
      hash: hashOf(blockNumber),
      blockNumber,
      to: addressOf(80),
      input: "0x12345678",
    });
    const result = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [exchangeLog(blockNumber, locker.token), redeemLog(blockNumber + 1, locker.token)],
        getTransactionByHash: (async (input: string | readonly string[]) => {
          const lookup = (hash: string) => hash === transaction.hash ? transaction : null;
          return typeof input === "string" ? lookup(input) : input.map(lookup);
        }) as RpcClient["getTransactionByHash"],
      }),
      blockNumber,
      blockNumber + 1,
      { domainId: "veyfi" },
    );

    expect(result.failure).toBeNull();
    expect(result.chunkComplete).toBe(true);
    expect(result.lastProcessedBlock).toBe(blockNumber + 1);
    expect(result.actions.map(({ kind, tokenSymbol, user, principal }) => ({ kind, tokenSymbol, user, principal }))).toEqual(
      ["exchange", "redeem"].map((kind) => ({
        kind,
        tokenSymbol: locker.symbol,
        user: null,
        principal: { kind: "unavailable", reason: "canonical_sender_unavailable" },
      })),
    );
  });

  it("rejects short actor batches and mismatched transaction hashes", async () => {
    const locker = LIQUID_LOCKERS[0];
    if (!locker) throw new Error("Missing liquid-locker fixture");
    const firstBlock = 450;
    const firstHash = hashOf(450);
    const logs = [
      redeemLog(firstBlock, locker.token),
      redeemLog(firstBlock + 1, locker.token),
    ];
    const shortBatch = await scanChunkForActionsWithProgress(
      createRpc({
        logs,
        getTransactionByHash: (async (input: string | string[]) =>
          typeof input === "string"
            ? transactionFor({ hash: firstHash, blockNumber: firstBlock })
            : [
                transactionFor({
                  hash: firstHash,
                  blockNumber: firstBlock,
                  to: LIQUID_LOCKER_REDEMPTION,
                }),
              ]) as RpcClient["getTransactionByHash"],
      }),
      firstBlock,
      firstBlock + 1,
      { domainId: "veyfi" },
    );
    expect(shortBatch).toMatchObject({
      lastProcessedBlock: firstBlock,
      failure: { code: "lookup_failed", blockNumber: firstBlock + 1 },
    });
    expect(shortBatch.actions.map((action) => action.txHash)).toEqual([firstHash]);

    const transactionMismatch = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [logs[0] as RpcLog],
        getTransactionByHash: (async (input: string | string[]) => {
          const mismatched = transactionFor({
            hash: hashOf(999),
            blockNumber: firstBlock,
            to: LIQUID_LOCKER_REDEMPTION,
          });
          return typeof input === "string" ? mismatched : [mismatched];
        }) as RpcClient["getTransactionByHash"],
      }),
      firstBlock,
      firstBlock,
      { domainId: "veyfi" },
    );
    expect(transactionMismatch.failure).toEqual({
      code: "attribution_failed",
      blockNumber: firstBlock,
    });
  });

  it("propagates a rejected V5 transaction batch as budget exhaustion", async () => {
    const locker = LIQUID_LOCKERS[0];
    if (!locker) throw new Error("Missing liquid-locker fixture");
    const blockNumber = 452;
    const budgetError = new Error("work budget exhausted");
    const result = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [redeemLog(blockNumber, locker.token)],
        getTransactionByHash: (async () => {
          throw budgetError;
        }) as RpcClient["getTransactionByHash"],
      }),
      blockNumber,
      blockNumber,
      {
        domainId: "veyfi",
        isBudgetExceeded: (error) => error === budgetError,
      },
    );

    expect(result).toMatchObject({
      actions: [],
      lastProcessedBlock: blockNumber - 1,
      budgetExhausted: true,
      failure: { code: "budget_exhausted", blockNumber },
    });
  });

  it("never rewrites authoritative indexed stYFI actors from calldata", async () => {
    const blockNumber = 500;
    const txHash = hashOf(50);
    const wrongActor = addressOf(50);
    const caller = addressOf(51);
    const canonicalReceiver = addressOf(52);
    const transaction: RpcTransaction = {
      hash: txHash,
      from: caller,
      to: STYFI,
      blockHash: hashOf(blockNumber),
      blockNumber,
      nonce: 0,
      transactionIndex: 0,
      value: "0x0",
      input: encodeFunctionData({
        abi: STYFI_DEPOSIT_CALL_ABI,
        functionName: "deposit",
        args: [ONE, canonicalReceiver],
      }),
    };
    const batch = <T>(value: T, input: string | string[]): T | T[] =>
      typeof input === "string" ? value : input.map(() => value);
    const getTransactionByHash = vi.fn(async (input: string | string[]) =>
      batch(transaction, input),
    ) as RpcClient["getTransactionByHash"];
    const getTransactionReceipt = vi.fn(async (input: string | string[]) =>
      batch(null as RpcTransactionReceipt | null, input),
    ) as RpcClient["getTransactionReceipt"];

    const result = await scanChunkForActionsWithProgress(
      createRpc({
        logs: [
          depositLog({
            blockNumber,
            logIndex: 0,
            txHash,
            contract: STYFI,
            sender: wrongActor,
            owner: wrongActor,
          }),
        ],
        getTransactionByHash,
        getTransactionReceipt,
      }),
      blockNumber,
      blockNumber,
    );

    expect(result.failure).toBeNull();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      user: wrongActor,
      owner: wrongActor,
      receiver: wrongActor,
      caller: wrongActor,
    });
    expect(getTransactionByHash).not.toHaveBeenCalled();
    expect(getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("derives cooldown restart evidence from parent state and same-block order", async () => {
    const blockNumber = 520;
    const owner = addressOf(52);
    const scan = async (logs: RpcLog[], total: bigint) =>
      scanChunkForActionsWithProgress(
        createRpc({
          logs,
          call: (async (requests: unknown) => {
            const result = streamResult(total, 0n);
            return Array.isArray(requests) ? requests.map(() => result) : result;
          }) as RpcClient["call"],
        }),
        blockNumber,
        blockNumber,
      );

    const firstBurn = burnLog({
      blockNumber,
      logIndex: 0,
      txHash: hashOf(520),
      owner,
    });
    const zeroToBurn = await scan([firstBurn], 0n);
    expect(zeroToBurn.actions[0]).toMatchObject({
      kind: "initiated_cooldown",
      cooldownRestarted: false,
    });
    const positiveToBurn = await scan([firstBurn], ONE);
    expect(positiveToBurn.actions[0]).toMatchObject({
      kind: "initiated_cooldown",
      cooldownRestarted: true,
    });

    const withdrawThenBurn = await scan(
      [
        withdrawLog({
          blockNumber,
          logIndex: 0,
          txHash: hashOf(521),
          owner,
        }),
        burnLog({
          blockNumber,
          logIndex: 1,
          txHash: hashOf(522),
          owner,
        }),
      ],
      ONE,
    );
    expect(withdrawThenBurn.actions.map((action) => action.kind)).toEqual([
      "withdrew_from_cooldown",
      "initiated_cooldown",
    ]);
    expect(withdrawThenBurn.actions[1]?.cooldownRestarted).toBe(false);

    const burnThenBurn = await scan(
      [
        firstBurn,
        burnLog({
          blockNumber,
          logIndex: 1,
          txHash: hashOf(523),
          owner,
        }),
      ],
      0n,
    );
    expect(burnThenBurn.actions.map((action) => action.cooldownRestarted)).toEqual([
      false,
      true,
    ]);
  });

  it("fails closed on malformed, incomplete, or budget-exhausted parent stream reads", async () => {
    const blockNumber = 530;
    const logs = [
      burnLog({ blockNumber, logIndex: 0, txHash: hashOf(530) }),
    ];
    const invalidResult = streamResult(ONE, 2n * ONE);
    const malformed = await scanChunkForActionsWithProgress(
      createRpc({
        logs,
        call: (async () => [invalidResult]) as unknown as RpcClient["call"],
      }),
      blockNumber,
      blockNumber,
    );
    expect(malformed).toMatchObject({
      actions: [],
      lastProcessedBlock: blockNumber - 1,
      failure: { code: "lookup_failed", blockNumber },
    });

    const incomplete = await scanChunkForActionsWithProgress(
      createRpc({
        logs,
        call: (async () => []) as unknown as RpcClient["call"],
      }),
      blockNumber,
      blockNumber,
    );
    expect(incomplete.failure).toEqual({ code: "lookup_failed", blockNumber });

    const budgetError = new Error("parent snapshot budget exhausted");
    const budget = await scanChunkForActionsWithProgress(
      createRpc({
        logs,
        call: (async () => {
          throw budgetError;
        }) as RpcClient["call"],
      }),
      blockNumber,
      blockNumber,
      { isBudgetExceeded: (error) => error === budgetError },
    );
    expect(budget).toMatchObject({
      actions: [],
      budgetExhausted: true,
      failure: { code: "budget_exhausted", blockNumber },
    });
  });

  it("batches high-cardinality stream reads once at the canonical parent hash", async () => {
    const blockNumber = 540;
    const eventCount = 46;
    const logs = Array.from({ length: eventCount }, (_, index) =>
      burnLog({
        blockNumber,
        logIndex: index,
        txHash: hashOf(540 + index),
        owner: addressOf(100 + index),
      }),
    );
    const call = vi.fn(async (requests: unknown, blockReference: unknown) => {
      expect(Array.isArray(requests)).toBe(true);
      expect(requests).toHaveLength(logs.length);
      expect(blockReference).toEqual({
        blockHash: hashOf(blockNumber - 1),
        requireCanonical: true,
      });
      return (requests as unknown[]).map(() => streamResult(0n, 0n));
    }) as unknown as RpcClient["call"];
    const result = await scanChunkForActionsWithProgress(
      createRpc({ logs, call }),
      blockNumber,
      blockNumber,
    );

    expect(result.failure).toBeNull();
    expect(result.actions).toHaveLength(logs.length);
    expect(result.actions.every((action) => action.cooldownRestarted === false)).toBe(
      true,
    );
    expect(call).toHaveBeenCalledTimes(1);
  });

  it.each(DIRECT_STYFI_EXIT_CASES)(
    "proves canonical 1:1 direct stYFI $label exits with a prior-claimable burn subset",
    async (testCase) => {
      const blockNumber =
        550 +
        DIRECT_STYFI_EXIT_CASES.findIndex(
          (candidate) => candidate.label === testCase.label,
        );
      const owner = addressOf(blockNumber);
      const txHash = hashOf(blockNumber);
      const amount = 10n * ONE;
      const burnedShares = 4n * ONE;
      const logs = [
        burnLog({
          blockNumber,
          logIndex: 0,
          txHash,
          owner,
          shares: burnedShares,
        }),
        withdrawLog({
          blockNumber,
          logIndex: 1,
          txHash,
          owner,
          assets: amount,
          shares: amount,
        }),
      ];
      const input = encodeDirectStyfiExitInput(testCase, amount, owner);
      expect(input.slice(0, 10)).toBe(testCase.selector);
      const transaction = transactionFor({
        hash: txHash,
        blockNumber,
        from: owner,
        to: STYFI,
        input,
      });
      const result = await scanChunkForActionsWithProgress(
        createRpc({
          logs,
          call: (async (requests: unknown) => {
            const response = streamResult(amount - burnedShares, 0n);
            return Array.isArray(requests)
              ? requests.map(() => response)
              : response;
          }) as RpcClient["call"],
          getTransactionByHash: (async (input: string | string[]) =>
            typeof input === "string" ? transaction : [transaction]) as RpcClient["getTransactionByHash"],
        }),
        blockNumber,
        blockNumber,
      );

      expect(result.failure).toBeNull();
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toMatchObject({
        kind: "withdrew_from_cooldown",
        amounts: { assets: amount, shares: amount },
      });
      expect(result.ignoredLogs).toContainEqual({
        blockNumber,
        logIndex: 0,
        reason: "paired_withdraw_burn",
      });
    },
  );

  it.each(["withdraw", "redeem"] as const)(
    "rejects a non-1:1 direct stYFI %s event without advancing",
    async (functionName) => {
      const blockNumber = functionName === "withdraw" ? 560 : 561;
      const owner = addressOf(blockNumber);
      const txHash = hashOf(blockNumber);
      const assets = 10n * ONE;
      const shares = 2n * ONE;
      const burnedShares = ONE;
      const logs = [
        burnLog({
          blockNumber,
          logIndex: 0,
          txHash,
          owner,
          shares: burnedShares,
        }),
        withdrawLog({
          blockNumber,
          logIndex: 1,
          txHash,
          owner,
          assets,
          shares,
        }),
      ];
      const transaction = transactionFor({
        hash: txHash,
        blockNumber,
        from: owner,
        to: STYFI,
        input: encodeDirectStyfiExitInput(
          DIRECT_STYFI_EXIT_CASES.find(
            (testCase) =>
              testCase.functionName === functionName && testCase.arity === 3,
          )!,
          functionName === "withdraw" ? assets : shares,
          owner,
        ),
      });
      const result = await scanChunkForActionsWithProgress(
        createRpc({
          logs,
          call: (async (requests: unknown) => {
            const response = streamResult(shares - burnedShares, 0n);
            return Array.isArray(requests)
              ? requests.map(() => response)
              : response;
          }) as RpcClient["call"],
          getTransactionByHash: (async (input: string | string[]) =>
            typeof input === "string"
              ? transaction
              : [transaction]) as RpcClient["getTransactionByHash"],
        }),
        blockNumber,
        blockNumber,
      );

      expect(result).toMatchObject({
        actions: [],
        ignoredLogs: [],
        chunkComplete: false,
        lastProcessedBlock: blockNumber - 1,
        failure: { code: "decode_failed", blockNumber },
      });
    },
  );
});
