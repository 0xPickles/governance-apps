import { encodeFunctionData } from "viem";
import { renderCatalogueMessages } from "./catalogue";
import {
  domainConfigs,
  runtimeConfig,
  type AlertsEnv,
  type DomainConfig,
  type RuntimeConfig,
} from "./config";
import {
  ERC4626_TOTAL_ASSETS_ABI,
} from "./abis";
import {
  YETH_RECOVERY_VAULT,
  YETH_YIELD_VAULT,
} from "./contracts";
import {
  ALERT_DOMAIN_GENESIS_BLOCKS,
  getAlertDomainRegistration,
  isActiveAlertDomainRegistration,
  isAlertDomainId,
  type ActiveAlertDomainId,
} from "./domain-registry";
import {
  buildYethRepaymentAlertActions,
  buildYethRepaymentMetrics,
  createEmptyYethState,
  loadYethRepaymentMetrics,
  loadYethState,
  serializeYethRepaymentMetrics,
  serializeYethState,
  type StoredYethRepaymentMetrics,
  type StoredYethState,
  type YethFlowSummary,
  type YethRepaymentMetrics,
  type YethState,
} from "./domains/yeth/accounting";
import { scanChunkForActionsWithProgress } from "./domains/styfi-veyfi/scanner";
import { scanYethBlocks } from "./domains/yeth/scanner";
import {
  createEmptyTeamsState,
  loadTeamsState,
  scanTeamsBlocks,
  serializeTeamsState,
  type StoredTeamsState,
  type TeamsState,
} from "./domains/teams/scanner";
import {
  createEmptyYbcState,
  loadYbcState,
  scanYbcBlocks,
  serializeYbcState,
  type StoredYbcState,
  type YbcState,
} from "./domains/ybc/scanner";
import {
  createRpcClient,
  RpcRequestError,
  type RpcBlock,
  type RpcClient,
} from "./rpc";
import {
  sendMessage,
  TelegramRateLimitError,
  TelegramSendError,
} from "./telegram";
import type { NormalizedAction } from "./types";
import type { AlertAction } from "./product-types";

const STATE_KEY = "state:v1";
const RECEIPT_PREFIX = "sent:";
const TELEGRAM_SPACING_MS = 1_100;
const ZERO_FLOW = Object.freeze({ recoveryNetFlowEth: 0n, yieldNetFlowEth: 0n });

interface StoredDomainState {
  readonly version: 1;
  readonly domainId: ActiveAlertDomainId;
  readonly cursorBlock: number;
  readonly cursorHash: string | null;
  readonly lastObservedHead: number | null;
  readonly lastRunAt: number | null;
  readonly lastSuccessAt: number | null;
  readonly lastErrorCode: string | null;
  readonly telegramRetryAfterUntil: number | null;
  readonly yethState: StoredYethState | null;
  readonly yethMetrics: StoredYethRepaymentMetrics | null;
  readonly yethDailyFlow: {
    readonly recoveryNetFlowEth: string;
    readonly yieldNetFlowEth: string;
  } | null;
  readonly teamsState: StoredTeamsState | null;
  readonly ybcState: StoredYbcState | null;
}

interface ScanOutcome {
  readonly terminalBlock: number;
  readonly actions: readonly AlertAction[];
  readonly yethState: YethState | null;
  readonly yethMetrics: YethRepaymentMetrics | null;
  readonly yethDailyFlow: YethFlowSummary;
  readonly teamsState: TeamsState | null;
  readonly ybcState: YbcState | null;
}

class AlertRunError extends Error {
  constructor(
    readonly code: string,
    readonly diagnostic: {
      readonly reason: string;
      readonly contract: string | null;
      readonly blockNumber: number | null;
      readonly transactionHash: string | null;
      readonly eventName: string | null;
    } | null = null,
  ) {
    super(code);
    this.name = "AlertRunError";
  }
}

type AlertRunStage =
  | "configuration"
  | "head"
  | "cursor_validation"
  | "scan"
  | "terminal"
  | "render"
  | "receipt_read"
  | "telegram_send"
  | "receipt_write"
  | "state_commit";

function safeExceptionName(error: unknown): string {
  if (!(error instanceof Error)) return "NonError";
  switch (error.name) {
    case "Error":
    case "TypeError":
    case "RangeError":
    case "SyntaxError":
    case "AbortError":
      return error.name;
    default:
      return "Error";
  }
}

function safeFailureDiagnostic(error: unknown) {
  if (error instanceof AlertRunError) {
    const diagnostic = error.diagnostic;
    return {
      failureKind: "controlled",
      failureReason:
        diagnostic !== null && /^[a-z0-9_:-]{1,120}$/.test(diagnostic.reason)
          ? diagnostic.reason
          : null,
      contract:
        diagnostic?.contract !== null &&
        diagnostic?.contract !== undefined &&
        /^0x[0-9a-fA-F]{40}$/.test(diagnostic.contract)
          ? diagnostic.contract.toLowerCase()
          : null,
      blockNumber:
        diagnostic?.blockNumber !== null &&
        diagnostic?.blockNumber !== undefined &&
        Number.isSafeInteger(diagnostic.blockNumber) &&
        diagnostic.blockNumber >= 0
          ? diagnostic.blockNumber
          : null,
      transactionHash:
        diagnostic?.transactionHash !== null &&
        diagnostic?.transactionHash !== undefined &&
        /^0x[0-9a-fA-F]{64}$/.test(diagnostic.transactionHash)
          ? diagnostic.transactionHash.toLowerCase()
          : null,
      eventName:
        diagnostic?.eventName !== null &&
        diagnostic?.eventName !== undefined &&
        /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(diagnostic.eventName)
          ? diagnostic.eventName
          : null,
    };
  }
  if (error instanceof RpcRequestError) {
    return {
      failureKind: "rpc",
      rpcMethod: error.method,
      rpcKind: error.kind,
      rpcCode: error.rpcCode ?? null,
      httpStatus: error.httpStatus ?? null,
      rangeLimit: error.rangeLimit,
      batchLimit: error.batchLimit,
    };
  }
  if (error instanceof TelegramSendError) {
    return {
      failureKind: "telegram",
      telegramKind: error.kind,
      httpStatus: error.httpStatus,
      telegramErrorCode: error.telegramErrorCode,
    };
  }
  return {
    failureKind: "unexpected",
    exceptionName: safeExceptionName(error),
  };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

function activeDomain(value: string | null): ActiveAlertDomainId | null {
  if (!isAlertDomainId(value)) return null;
  const registration = getAlertDomainRegistration(value);
  return isActiveAlertDomainRegistration(registration) ? registration.id : null;
}

function initialState(domainId: ActiveAlertDomainId): StoredDomainState {
  return Object.freeze({
    version: 1,
    domainId,
    cursorBlock: ALERT_DOMAIN_GENESIS_BLOCKS[domainId] - 1,
    cursorHash: null,
    lastObservedHead: null,
    lastRunAt: null,
    lastSuccessAt: null,
    lastErrorCode: null,
    telegramRetryAfterUntil: null,
    yethState: domainId === "yeth" ? serializeYethState(createEmptyYethState()) : null,
    yethMetrics: null,
    yethDailyFlow:
      domainId === "yeth"
        ? { recoveryNetFlowEth: "0", yieldNetFlowEth: "0" }
        : null,
    teamsState:
      domainId === "teams" ? serializeTeamsState(createEmptyTeamsState()) : null,
    ybcState:
      domainId === "ybc" ? serializeYbcState(createEmptyYbcState()) : null,
  });
}

function validateStoredState(
  value: StoredDomainState,
  domainId: ActiveAlertDomainId,
): StoredDomainState {
  if (
    value === null ||
    typeof value !== "object" ||
    value.version !== 1 ||
    value.domainId !== domainId ||
    !Number.isSafeInteger(value.cursorBlock) ||
    value.cursorBlock < ALERT_DOMAIN_GENESIS_BLOCKS[domainId] - 1 ||
    (value.cursorHash !== null && !/^0x[0-9a-f]{64}$/.test(value.cursorHash))
  ) {
    throw new AlertRunError("stored_state_invalid");
  }
  return value;
}

function loadFlow(value: StoredDomainState["yethDailyFlow"]): YethFlowSummary {
  if (
    value === null ||
    !/^-?\d+$/.test(value.recoveryNetFlowEth) ||
    !/^-?\d+$/.test(value.yieldNetFlowEth)
  ) {
    return { ...ZERO_FLOW };
  }
  return {
    recoveryNetFlowEth: BigInt(value.recoveryNetFlowEth),
    yieldNetFlowEth: BigInt(value.yieldNetFlowEth),
  };
}

function addFlow(left: YethFlowSummary, right: YethFlowSummary): YethFlowSummary {
  return {
    recoveryNetFlowEth: left.recoveryNetFlowEth + right.recoveryNetFlowEth,
    yieldNetFlowEth: left.yieldNetFlowEth + right.yieldNetFlowEth,
  };
}

function storeFlow(flow: YethFlowSummary): StoredDomainState["yethDailyFlow"] {
  return {
    recoveryNetFlowEth: flow.recoveryNetFlowEth.toString(),
    yieldNetFlowEth: flow.yieldNetFlowEth.toString(),
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nextYethCheckpoint(
  cursorBlock: number,
  interval: number,
): number {
  const base = ALERT_DOMAIN_GENESIS_BLOCKS.yeth - 1;
  const completed = Math.floor(Math.max(0, cursorBlock - base) / interval);
  return base + (completed + 1) * interval;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function dailyActionDelta(action: NormalizedAction): bigint {
  switch (action.kind) {
    case "yeth_recovery_progress":
    case "yeth_recovery_setback":
      return abs(
        action.amounts.yethCurrentRecoveryShortfallEth! -
          action.amounts.yethPreviousRecoveryShortfallEth!,
      );
    case "yeth_yield_capacity_up":
    case "yeth_yield_capacity_down":
      return abs(
        action.amounts.yethCurrentYieldVaultAssetsEth! -
          action.amounts.yethPreviousYieldVaultAssetsEth!,
      );
    default:
      return 0n;
  }
}

function recoveryShortfall(metrics: YethRepaymentMetrics): bigint | null {
  if (metrics.recoveryVaultAssetsEth === null) return null;
  return metrics.snapshotStayedEth > metrics.recoveryVaultAssetsEth
    ? metrics.snapshotStayedEth - metrics.recoveryVaultAssetsEth
    : 0n;
}

function decodeWord(value: string): bigint {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new AlertRunError("vault_assets_invalid");
  }
  return BigInt(value);
}

async function readYethVaultAssets(
  rpc: RpcClient,
  block: RpcBlock,
): Promise<readonly [bigint, bigint]> {
  const data = encodeFunctionData({
    abi: ERC4626_TOTAL_ASSETS_ABI,
    functionName: "totalAssets",
  });
  const values = await rpc.call(
    [
      { to: YETH_RECOVERY_VAULT.toLowerCase(), data },
      { to: YETH_YIELD_VAULT.toLowerCase(), data },
    ],
    { blockHash: block.hash, requireCanonical: true },
  );
  if (values.length !== 2) throw new AlertRunError("vault_assets_invalid");
  return [decodeWord(values[0]!), decodeWord(values[1]!)];
}

async function scanYfiRange(params: {
  readonly domainId: "styfi" | "veyfi";
  readonly rpc: RpcClient;
  readonly fromBlock: number;
  readonly requestedToBlock: number;
}): Promise<{ readonly terminalBlock: number; readonly actions: readonly NormalizedAction[] }> {
  let toBlock = params.requestedToBlock;
  while (true) {
    const result = await scanChunkForActionsWithProgress(
      params.rpc,
      params.fromBlock,
      toBlock,
      { domainId: params.domainId },
    );
    if (result.failure?.code === "range_too_large" && toBlock > params.fromBlock) {
      toBlock = params.fromBlock + Math.floor((toBlock - params.fromBlock) / 2);
      continue;
    }
    if (result.failure !== null || !result.chunkComplete) {
      throw new AlertRunError(`scan_${result.failure?.code ?? "incomplete"}`);
    }
    return { terminalBlock: toBlock, actions: result.actions };
  }
}

async function scanYethRange(params: {
  readonly rpc: RpcClient;
  readonly fromBlock: number;
  readonly requestedToBlock: number;
  readonly state: YethState;
}): Promise<{
  readonly terminalBlock: number;
  readonly state: YethState;
  readonly actions: readonly NormalizedAction[];
  readonly flow: YethFlowSummary;
}> {
  let toBlock = params.requestedToBlock;
  while (true) {
    let result = await scanYethBlocks({
      rpc: params.rpc,
      fromBlock: params.fromBlock,
      toBlock,
      state: params.state,
    });
    if (result.failure?.code === "range_too_large" && toBlock > params.fromBlock) {
      toBlock = params.fromBlock + Math.floor((toBlock - params.fromBlock) / 2);
      continue;
    }
    if (result.failure !== null) {
      throw new AlertRunError(`scan_${result.failure.code}`);
    }
    const eventBlocks = [...new Set(result.actions.map((action) => action.blockNumber))];
    if (eventBlocks.length > 1) {
      toBlock = eventBlocks[0]!;
      result = await scanYethBlocks({
        rpc: params.rpc,
        fromBlock: params.fromBlock,
        toBlock,
        state: params.state,
      });
      if (result.failure !== null) {
        throw new AlertRunError(`scan_${result.failure.code}`);
      }
    }
    return {
      terminalBlock: toBlock,
      state: result.state,
      actions: result.actions,
      flow: result.flow,
    };
  }
}

async function scanTeamsRange(params: {
  readonly rpc: RpcClient;
  readonly fromBlock: number;
  readonly requestedToBlock: number;
  readonly state: TeamsState;
}): Promise<{ readonly terminalBlock: number; readonly state: TeamsState; readonly actions: readonly AlertAction[] }> {
  let toBlock = params.requestedToBlock;
  while (true) {
    const result = await scanTeamsBlocks({
      rpc: params.rpc,
      fromBlock: params.fromBlock,
      toBlock,
      state: params.state,
    });
    if (result.failure?.code === "range_too_large" && toBlock > params.fromBlock) {
      toBlock = params.fromBlock + Math.floor((toBlock - params.fromBlock) / 2);
      continue;
    }
    if (result.failure !== null) {
      throw new AlertRunError(`scan_teams_${result.failure.code}`, result.failure);
    }
    return { terminalBlock: toBlock, state: result.state, actions: result.actions };
  }
}

async function scanYbcRange(params: {
  readonly rpc: RpcClient;
  readonly fromBlock: number;
  readonly requestedToBlock: number;
  readonly state: YbcState;
}): Promise<{ readonly terminalBlock: number; readonly state: YbcState; readonly actions: readonly AlertAction[] }> {
  let toBlock = params.requestedToBlock;
  while (true) {
    const result = await scanYbcBlocks({
      rpc: params.rpc,
      fromBlock: params.fromBlock,
      toBlock,
      state: params.state,
    });
    if (result.failure?.code === "range_too_large" && toBlock > params.fromBlock) {
      toBlock = params.fromBlock + Math.floor((toBlock - params.fromBlock) / 2);
      continue;
    }
    if (result.failure !== null) {
      throw new AlertRunError(`scan_ybc_${result.failure.code}`, result.failure);
    }
    return { terminalBlock: toBlock, state: result.state, actions: result.actions };
  }
}

async function scanRange(params: {
  readonly domainId: ActiveAlertDomainId;
  readonly rpc: RpcClient;
  readonly config: RuntimeConfig;
  readonly state: StoredDomainState;
  readonly requestedToBlock: number;
}): Promise<ScanOutcome> {
  const fromBlock = params.state.cursorBlock + 1;
  if (params.domainId === "styfi" || params.domainId === "veyfi") {
    const scan = await scanYfiRange({
      domainId: params.domainId,
      rpc: params.rpc,
      fromBlock,
      requestedToBlock: params.requestedToBlock,
    });
    return {
      terminalBlock: scan.terminalBlock,
      actions: scan.actions,
      yethState: null,
      yethMetrics: null,
      yethDailyFlow: { ...ZERO_FLOW },
      teamsState: null,
      ybcState: null,
    };
  }

  if (params.domainId === "teams") {
    const scan = await scanTeamsRange({
      rpc: params.rpc,
      fromBlock,
      requestedToBlock: params.requestedToBlock,
      state: params.state.teamsState === null || params.state.teamsState === undefined
        ? createEmptyTeamsState()
        : loadTeamsState(params.state.teamsState),
    });
    return {
      terminalBlock: scan.terminalBlock,
      actions: scan.actions,
      yethState: null,
      yethMetrics: null,
      yethDailyFlow: { ...ZERO_FLOW },
      teamsState: scan.state,
      ybcState: null,
    };
  }

  if (params.domainId === "ybc") {
    const scan = await scanYbcRange({
      rpc: params.rpc,
      fromBlock,
      requestedToBlock: params.requestedToBlock,
      state: params.state.ybcState === null || params.state.ybcState === undefined
        ? createEmptyYbcState()
        : loadYbcState(params.state.ybcState),
    });
    return {
      terminalBlock: scan.terminalBlock,
      actions: scan.actions,
      yethState: null,
      yethMetrics: null,
      yethDailyFlow: { ...ZERO_FLOW },
      teamsState: null,
      ybcState: scan.state,
    };
  }

  const startingYeth =
    params.state.yethState === null
      ? createEmptyYethState()
      : loadYethState(params.state.yethState);
  const previousMetrics = loadYethRepaymentMetrics(params.state.yethMetrics);
  const scan = await scanYethRange({
    rpc: params.rpc,
    fromBlock,
    requestedToBlock: params.requestedToBlock,
    state: startingYeth,
  });
  const accumulatedFlow = addFlow(loadFlow(params.state.yethDailyFlow), scan.flow);
  const stateMetrics = buildYethRepaymentMetrics(
    scan.state,
    previousMetrics?.recoveryVaultAssetsEth ?? null,
    previousMetrics?.yieldVaultAssetsEth ?? null,
  );
  const actions = [...scan.actions];
  const lastEvent = scan.actions.at(-1);
  if (lastEvent !== undefined) {
    const eventBlock = await params.rpc.getBlockByNumber(lastEvent.blockNumber);
    actions.push(
      ...buildYethRepaymentAlertActions({
        previous: previousMetrics,
        current: stateMetrics,
        flow: scan.flow,
        blockNumber: eventBlock.number,
        blockHash: eventBlock.hash,
      }).filter((action) => action.kind === "yeth_debt_paid_down"),
    );
  }

  const checkpoint = nextYethCheckpoint(
    params.state.cursorBlock,
    params.config.yethDailyCheckpointBlocks,
  );
  if (scan.terminalBlock !== checkpoint) {
    return {
      terminalBlock: scan.terminalBlock,
      actions: actions.sort((left, right) =>
        left.blockNumber - right.blockNumber || left.logIndex - right.logIndex),
      yethState: scan.state,
      yethMetrics: stateMetrics,
      yethDailyFlow: accumulatedFlow,
      teamsState: null,
      ybcState: null,
    };
  }

  const checkpointBlock = await params.rpc.getBlockByNumber(checkpoint);
  const [recoveryAssets, yieldAssets] = await readYethVaultAssets(
    params.rpc,
    checkpointBlock,
  );
  const dailyMetrics = buildYethRepaymentMetrics(
    scan.state,
    recoveryAssets,
    yieldAssets,
  );
  const dailyCandidates = buildYethRepaymentAlertActions({
    previous: stateMetrics,
    current: dailyMetrics,
    flow: accumulatedFlow,
    blockNumber: checkpoint,
    blockHash: checkpointBlock.hash,
  }).filter((action) => action.kind !== "yeth_debt_paid_down");
  const previousShortfall = recoveryShortfall(stateMetrics);
  const currentShortfall = recoveryShortfall(dailyMetrics);
  const rawRecoveryDelta =
    previousShortfall === null || currentShortfall === null
      ? null
      : abs(currentShortfall - previousShortfall);
  const rawYieldDelta =
    stateMetrics.yieldVaultAssetsEth === null ||
    dailyMetrics.yieldVaultAssetsEth === null
      ? null
      : abs(dailyMetrics.yieldVaultAssetsEth - stateMetrics.yieldVaultAssetsEth);
  console.log(JSON.stringify({
    event: "alert_yeth_daily_checkpoint",
    block: checkpoint,
    thresholdWei: params.config.yethDailyMinDeltaWei.toString(),
    recoveryDeltaWei: rawRecoveryDelta?.toString() ?? null,
    yieldDeltaWei: rawYieldDelta?.toString() ?? null,
    candidates: dailyCandidates.map((action) => ({
      kind: action.kind,
      deltaWei: dailyActionDelta(action).toString(),
      emitted: dailyActionDelta(action) >= params.config.yethDailyMinDeltaWei,
    })),
  }));
  actions.push(
    ...dailyCandidates.filter(
      (action) => dailyActionDelta(action) >= params.config.yethDailyMinDeltaWei,
    ),
  );
  return {
    terminalBlock: scan.terminalBlock,
    actions: actions.sort((left, right) =>
      left.blockNumber - right.blockNumber || left.logIndex - right.logIndex),
    yethState: scan.state,
    yethMetrics: dailyMetrics,
    yethDailyFlow: { ...ZERO_FLOW },
    teamsState: null,
    ybcState: null,
  };
}

function withRunMetadata(
  state: StoredDomainState,
  fields: Partial<StoredDomainState>,
): StoredDomainState {
  return { ...state, ...fields };
}

export class AlertState implements DurableObject {
  private running: Promise<Response> | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: AlertsEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const domainId = activeDomain(url.searchParams.get("domain"));
    if (domainId === null) return Response.json({ error: "invalid_domain" }, { status: 400 });
    if (url.pathname === "/status" && request.method === "GET") {
      return this.status(domainId);
    }
    if (url.pathname !== "/run" || request.method !== "POST") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (this.running !== null) {
      return Response.json({ domain: domainId, outcome: "busy" }, { status: 202 });
    }
    this.running = this.run(domainId).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async load(domainId: ActiveAlertDomainId): Promise<StoredDomainState> {
    const stored = await this.state.storage.get<StoredDomainState>(STATE_KEY);
    return stored === undefined ? initialState(domainId) : validateStoredState(stored, domainId);
  }

  private async status(domainId: ActiveAlertDomainId): Promise<Response> {
    let stored: StoredDomainState;
    try {
      stored = await this.load(domainId);
    } catch {
      return Response.json(
        { domain: domainId, status: "invalid_state" },
        { status: 500 },
      );
    }
    return Response.json({
      domain: domainId,
      cursorBlock: stored.cursorBlock,
      cursorHash: stored.cursorHash,
      lastObservedHead: stored.lastObservedHead,
      caughtUp:
        stored.lastErrorCode === null &&
        stored.lastObservedHead !== null && stored.cursorBlock >= stored.lastObservedHead,
      lastRunAt: stored.lastRunAt,
      lastSuccessAt: stored.lastSuccessAt,
      lastErrorCode: stored.lastErrorCode,
      telegramRetryAfterUntil: stored.telegramRetryAfterUntil,
    });
  }

  private async recordError(
    stored: StoredDomainState,
    code: string,
    observedHead: number | null = stored.lastObservedHead,
  ): Promise<void> {
    await this.state.storage.put(
      STATE_KEY,
      withRunMetadata(stored, {
        lastObservedHead: observedHead,
        lastRunAt: nowSeconds(),
        lastErrorCode: code,
      }),
    );
  }

  private async run(domainId: ActiveAlertDomainId): Promise<Response> {
    let stored: StoredDomainState;
    try {
      stored = await this.load(domainId);
    } catch {
      console.error(JSON.stringify({ event: "alert_run_failed", domain: domainId, code: "stored_state_invalid" }));
      return Response.json({ domain: domainId, outcome: "failed", code: "stored_state_invalid" }, { status: 500 });
    }
    let stage: AlertRunStage = "configuration";
    try {
      const domain = domainConfigs(this.env).find((entry) => entry.domainId === domainId);
      if (domain === undefined || !domain.enabled) {
        return Response.json({ domain: domainId, outcome: "disabled" });
      }
      if (domain.chatId === null) {
        throw new AlertRunError(`config_${domainId}_chat_missing`);
      }
      let config: RuntimeConfig;
      try {
        config = runtimeConfig(this.env);
      } catch (error) {
        const safeCode =
          error instanceof Error && /^alert_config_[a-z_]+$/.test(error.message)
            ? error.message.replace(/^alert_/, "")
            : "config_invalid";
        throw new AlertRunError(safeCode);
      }
      const currentTime = nowSeconds();
      if (
        stored.telegramRetryAfterUntil !== null &&
        stored.telegramRetryAfterUntil > currentTime
      ) {
        return Response.json({ domain: domainId, outcome: "telegram_backoff" }, { status: 202 });
      }
      const rpc = createRpcClient(config.rpcUrl);
      stage = "head";
      const latest = await rpc.getBlockNumber();
      const confirmedHead = Math.max(0, latest - config.confirmations);
      stored = withRunMetadata(stored, { lastObservedHead: confirmedHead });
      if (stored.cursorHash !== null) {
        stage = "cursor_validation";
        const cursor = await rpc.getBlockByNumber(stored.cursorBlock);
        if (cursor.hash !== stored.cursorHash) {
          throw new AlertRunError("cursor_reorg_detected");
        }
      }
      if (stored.cursorBlock >= confirmedHead) {
        stored = withRunMetadata(stored, {
          lastObservedHead: confirmedHead,
          lastRunAt: currentTime,
          lastSuccessAt: currentTime,
          lastErrorCode: null,
          telegramRetryAfterUntil: null,
        });
        stage = "state_commit";
        await this.state.storage.put(STATE_KEY, stored);
        return Response.json({ domain: domainId, outcome: "caught_up", cursorBlock: stored.cursorBlock });
      }

      let messagesSent = 0;
      let lastTelegramSendAt = 0;
      let ranges = 0;
      while (
        stored.cursorBlock < confirmedHead &&
        ranges < config.maxRangesPerRun &&
        messagesSent < config.maxMessagesPerRun
      ) {
        const fromBlock = stored.cursorBlock + 1;
        let requestedToBlock = Math.min(
          confirmedHead,
          fromBlock + config.logRangeSize - 1,
        );
        if (domainId === "yeth") {
          requestedToBlock = Math.min(
            requestedToBlock,
            nextYethCheckpoint(stored.cursorBlock, config.yethDailyCheckpointBlocks),
          );
        }
        stage = "scan";
        const scan = await scanRange({
          domainId,
          rpc,
          config,
          state: stored,
          requestedToBlock,
        });
        stage = "terminal";
        const terminal = await rpc.getBlockByNumber(scan.terminalBlock);
        if (terminal.number !== scan.terminalBlock) {
          throw new AlertRunError("terminal_block_invalid");
        }
        stage = "render";
        const rendered = await renderCatalogueMessages({ domainId, actions: scan.actions, rpc });
        const unsent = [] as typeof rendered[number][];
        for (const message of rendered) {
          stage = "receipt_read";
          const sent = await this.state.storage.get<boolean>(`${RECEIPT_PREFIX}${message.eventId}`);
          if (sent !== true) unsent.push(message);
        }
        const remaining = config.maxMessagesPerRun - messagesSent;
        const selected = unsent.slice(0, remaining);
        for (const message of selected) {
          if (lastTelegramSendAt > 0) {
            const wait = TELEGRAM_SPACING_MS - (Date.now() - lastTelegramSendAt);
            if (wait > 0) await sleep(wait);
          }
          stage = "telegram_send";
          await sendMessage(domain.chatId, message.html, config.botToken);
          lastTelegramSendAt = Date.now();
          stage = "receipt_write";
          await this.state.storage.put(`${RECEIPT_PREFIX}${message.eventId}`, true);
          messagesSent += 1;
        }
        if (selected.length < unsent.length) {
          stage = "state_commit";
          await this.recordError(stored, "message_cap_reached", confirmedHead);
          return Response.json({
            domain: domainId,
            outcome: "message_cap",
            cursorBlock: stored.cursorBlock,
            messagesSent,
          }, { status: 202 });
        }

        const successTime = nowSeconds();
        stored = {
          ...stored,
          cursorBlock: scan.terminalBlock,
          cursorHash: terminal.hash,
          lastObservedHead: confirmedHead,
          lastRunAt: successTime,
          lastSuccessAt: successTime,
          lastErrorCode: null,
          telegramRetryAfterUntil: null,
          yethState:
            scan.yethState === null ? stored.yethState : serializeYethState(scan.yethState),
          yethMetrics:
            scan.yethMetrics === null
              ? stored.yethMetrics
              : serializeYethRepaymentMetrics(scan.yethMetrics),
          yethDailyFlow:
            domainId === "yeth" ? storeFlow(scan.yethDailyFlow) : stored.yethDailyFlow,
          teamsState:
            scan.teamsState === null ? stored.teamsState : serializeTeamsState(scan.teamsState),
          ybcState:
            scan.ybcState === null ? stored.ybcState : serializeYbcState(scan.ybcState),
        };
        stage = "state_commit";
        await this.state.storage.put(STATE_KEY, stored);
        ranges += 1;
      }
      return Response.json({
        domain: domainId,
        outcome: stored.cursorBlock >= confirmedHead ? "caught_up" : "progress",
        cursorBlock: stored.cursorBlock,
        confirmedHead,
        ranges,
        messagesSent,
      });
    } catch (error) {
      if (error instanceof TelegramRateLimitError) {
        const retryAfterUntil = nowSeconds() + error.retryAfterSeconds;
        await this.state.storage.put(
          STATE_KEY,
          withRunMetadata(stored, {
            lastRunAt: nowSeconds(),
            lastErrorCode: "telegram_rate_limited",
            telegramRetryAfterUntil: retryAfterUntil,
          }),
        );
        console.warn(JSON.stringify({ event: "alert_run_delayed", domain: domainId, code: "telegram_rate_limited", retryAfterUntil }));
        return Response.json({ domain: domainId, outcome: "telegram_backoff" }, { status: 202 });
      }
      const code = error instanceof AlertRunError ? error.code : "processing_failed";
      const diagnostic = safeFailureDiagnostic(error);
      let errorStateRecorded = true;
      try {
        await this.recordError(stored, code);
      } catch {
        errorStateRecorded = false;
      }
      console.error(JSON.stringify({
        event: "alert_run_failed",
        domain: domainId,
        code,
        stage,
        ...diagnostic,
        errorStateRecorded,
        cursorBlock: stored.cursorBlock,
        nextBlock: stored.cursorBlock + 1,
      }));
      return Response.json({ domain: domainId, outcome: "failed", code }, { status: 500 });
    }
  }
}

export function activeDomainConfigs(env: AlertsEnv): readonly DomainConfig[] {
  return domainConfigs(env).filter((domain) => domain.enabled);
}
