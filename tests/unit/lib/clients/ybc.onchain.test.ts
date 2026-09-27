import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import feedExample from "@/docs/apps/ybc/onchain-integration-plan/examples/ybc-feed.example.json";
import forkFeed from "@/public/fork-fixtures/ybc-proposals.json";
import {
  assertCompleteYbcProposalHistory,
  mapYbcFeedToPageState,
  readYbcCanonicalSnapshot,
  readYbcWalletOverlay,
  YBC_MAINNET_DEPLOYMENT,
  YBC_PROPOSAL_READ_BATCH_SIZE,
  type YbcCanonicalSnapshot,
} from "@/lib/clients/ybc";
import {
  YbcFeedSchema,
  YBC_FEED_MAX_PROPOSALS,
  type YbcFeed,
} from "@/lib/schemas/ybc-feed";

function parseFeed(value: unknown): YbcFeed {
  const parsed = YbcFeedSchema.parse(value);
  return parsed;
}

describe("YBC feed mapper", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a feed that changes a mainnet contract", () => {
    const maliciousFeed = parseFeed({
      ...feedExample,
      deployment: {
        ...feedExample.deployment,
        ybcWeightAggregator:
          "0x9999999999999999999999999999999999999999",
      },
    });

    expect(() => mapYbcFeedToPageState(maliciousFeed)).toThrow(
      /deployment mismatch: ybcWeightAggregator/i
    );
  });

  it("rejects deceptive reward token and distributor metadata", () => {
    const maliciousToken = parseFeed({
      ...feedExample,
      rewards: {
        ...feedExample.rewards,
        token: "0x9999999999999999999999999999999999999999",
      },
    });
    const maliciousDistributor = parseFeed({
      ...feedExample,
      rewards: {
        ...feedExample.rewards,
        distributor:
          "0x9999999999999999999999999999999999999999",
      },
    });

    expect(() => mapYbcFeedToPageState(maliciousToken)).toThrow(
      /deployment mismatch: rewards.token/i
    );
    expect(() => mapYbcFeedToPageState(maliciousDistributor)).toThrow(
      /deployment mismatch: rewards.distributor/i
    );
  });

  it("maps a feed into the existing observer page state", () => {
    const pageState = mapYbcFeedToPageState(parseFeed(feedExample));

    expect(pageState.scenarioId).toBe("observer");
    expect(pageState.data.hero.collectiveAddress).toBe(feedExample.deployment.ybc);
    expect(pageState.data.hero.memberCount).toBe(1);
    expect(pageState.data.hero.internalWeight).toBe("50");
    expect(pageState.data.roster.totals.rawStaked).toBe("100");
    expect(pageState.data.roster.totals.effectiveWeight).toBe("50");
    expect(pageState.data.me.isMember).toBe(false);
    expect(pageState.data.me.canPropose).toBe(false);
    expect(pageState.data.rewards.claim.disabledReason).toMatch(/connect/i);
  });

  it("excludes removed members from total collective voting power", () => {
    const removedFeed = parseFeed({
      ...feedExample,
      members: [{
        ...feedExample.members[0]!,
        status: "removed",
        removedAt: feedExample.generatedAt,
      }],
      events: {
        ...feedExample.events,
        activeMemberCount: 0,
        removedMemberCount: 1,
      },
    });

    const pageState = mapYbcFeedToPageState(removedFeed);

    expect(pageState.data.hero.memberCount).toBe(0);
    expect(pageState.data.hero.internalWeight).toBe("0");
    expect(pageState.data.roster.totals.rawStaked).toBe("0");
    expect(pageState.data.roster.totals.effectiveWeight).toBe("0");
    expect(pageState.data.roster.totals.targetWeight).toBe("0");
  });

  it("derives live epoch and proposal timing from pinned constants", () => {
    const canonicalTimestamp =
      YBC_MAINNET_DEPLOYMENT.genesis +
      YBC_MAINNET_DEPLOYMENT.epochLengthSeconds;
    const pageState = mapYbcFeedToPageState(
      parseFeed(feedExample),
      null,
      { canonicalBlockTimestamp: canonicalTimestamp }
    );
    const proposal = pageState.data.proposals.items[0]!;

    expect(pageState.data.epoch).toEqual({
      current: 1,
      startsAt: canonicalTimestamp,
      endsAt:
        canonicalTimestamp +
        YBC_MAINNET_DEPLOYMENT.epochLengthSeconds,
    });
    expect(proposal.timing.discussionStartsAt).toBe(
      feedExample.proposals[0]!.proposedAt
    );
    expect(proposal.timing.votingStartsAt).toBe(
      canonicalTimestamp +
        YBC_MAINNET_DEPLOYMENT.epochLengthSeconds -
        YBC_MAINNET_DEPLOYMENT.voteLengthSeconds
    );
  });

  it("uses proposed event time for display and omits invented execution time", () => {
    const feed = parseFeed({
      ...feedExample,
      proposals: [
        {
          ...feedExample.proposals[0]!,
          status: "executed",
          executed: true,
          proposedAt: null,
        },
      ],
    });
    const pageState = mapYbcFeedToPageState(feed, null, {
      canonicalBlockTimestamp: feed.generatedAt,
      proposalStatusById: { 0: 32 },
    });
    const proposal = pageState.data.proposals.items[0]!;

    expect(proposal.timing.createdAt).toBe(
      YBC_MAINNET_DEPLOYMENT.genesis +
        proposal.epoch *
          YBC_MAINNET_DEPLOYMENT.epochLengthSeconds
    );
    expect(proposal.timing.discussionStartsAt).toBe(
      proposal.timing.createdAt
    );
    expect(proposal.timing).not.toHaveProperty("executedAt");
  });

  it("matches the deployed zero-based epoch clock in the fork fixture", () => {
    const feed = parseFeed(forkFeed);
    const pageState = mapYbcFeedToPageState(feed, null, {
      canonicalBlockTimestamp: feed.generatedAt,
    });
    const proposal = pageState.data.proposals.items[0]!;

    expect(pageState.data.epoch.current).toBe(12);
    expect(pageState.data.epoch.startsAt).toBe(
      YBC_MAINNET_DEPLOYMENT.genesis +
        12 * YBC_MAINNET_DEPLOYMENT.epochLengthSeconds
    );
    expect(proposal.epoch).toBe(11);
    expect(proposal.timing.votingStartsAt).toBe(
      YBC_MAINNET_DEPLOYMENT.genesis +
        12 * YBC_MAINNET_DEPLOYMENT.epochLengthSeconds -
        YBC_MAINNET_DEPLOYMENT.voteLengthSeconds
    );
    expect(proposal.timing.votingEndsAt).toBe(
      YBC_MAINNET_DEPLOYMENT.genesis +
        12 * YBC_MAINNET_DEPLOYMENT.epochLengthSeconds
    );
  });

  it("uses the canonical zero-based epoch to authorize retraction", () => {
    const feed = parseFeed({
      ...feedExample,
      epoch: {
        ...feedExample.epoch,
        current: 999,
      },
      proposals: [
        {
          ...feedExample.proposals[0]!,
          status: "proposed",
        },
      ],
    });
    const beforeProposalEpoch = mapYbcFeedToPageState(
      feed,
      feed.proposals[0]!.proposer as Address,
      {
        actionStateTrusted: true,
        canonicalBlockTimestamp:
          YBC_MAINNET_DEPLOYMENT.genesis +
          YBC_MAINNET_DEPLOYMENT.epochLengthSeconds -
          1,
        proposalStatusById: { 0: 1 },
      }
    );
    expect(
      beforeProposalEpoch.data.proposals.items[0]?.actions.canRetract
    ).toBe(true);

    const duringProposalEpoch = mapYbcFeedToPageState(
      feed,
      feed.proposals[0]!.proposer as Address,
      {
        actionStateTrusted: true,
        canonicalBlockTimestamp:
          YBC_MAINNET_DEPLOYMENT.genesis +
          YBC_MAINNET_DEPLOYMENT.epochLengthSeconds +
          1,
        proposalStatusById: { 0: 1 },
      }
    );
    expect(
      duringProposalEpoch.data.proposals.items[0]?.actions.canRetract
    ).toBe(false);
    expect(
      duringProposalEpoch.data.proposals.items[0]?.actions.disabledReason
    ).toMatch(/window has closed/i);
  });

  it("overlays the connected member perspective", () => {
    const pageState = mapYbcFeedToPageState(
      parseFeed(feedExample),
      "0x1111111111111111111111111111111111111111",
      trustedMapOptions()
    );

    expect(pageState.scenarioId).toBe("member-ramping");
    expect(pageState.data.me.isMember).toBe(true);
    expect(pageState.data.me.weight.rawStaked).toBe("100");
    expect(pageState.data.me.weight.effectiveWeight).toBe("50");
    expect(pageState.data.me.weight.targetWeight).toBe("100");
    expect(pageState.data.me.pendingRewards).toBe("1.2");
    expect(pageState.data.me.canVote).toBe(true);
  });

  it("disables voting when the connected member has already voted", () => {
    const pageState = mapYbcFeedToPageState(
      parseFeed(feedExample),
      "0x1111111111111111111111111111111111111111",
      trustedMapOptions()
    );
    const proposal = pageState.data.proposals.items[0]!;

    expect(proposal.phase).toBe("voting");
    expect(proposal.votes.total).toBe("50");
    expect(proposal.actions).toEqual(
      expect.objectContaining({
        canRetract: false,
        canVote: false,
        canExecute: false,
        nextAction: "none",
      })
    );
    expect(proposal.actions.disabledReason).toMatch(/already voted/i);
  });

  it("enables voting for an eligible member without a recorded vote", () => {
    const pageState = mapYbcFeedToPageState(
      parseFeed({
        ...feedExample,
        votes: [],
        events: {
          ...feedExample.events,
          voteCount: 0,
        },
        proposals: [
          {
            ...feedExample.proposals[0]!,
            votes: "0",
            yea: "0",
            nay: "0",
          },
        ],
      }),
      "0x1111111111111111111111111111111111111111",
      trustedMapOptions()
    );
    const proposal = pageState.data.proposals.items[0]!;

    expect(proposal.phase).toBe("voting");
    expect(proposal.actions).toEqual(
      expect.objectContaining({
        canRetract: false,
        canVote: true,
        canExecute: false,
        nextAction: "vote",
        disabledReason: null,
      })
    );
  });

  it("keeps snapshot values visible while disabling untrusted actions", () => {
    const pageState = mapYbcFeedToPageState(
      parseFeed({
        ...feedExample,
        votes: [],
        events: {
          ...feedExample.events,
          voteCount: 0,
        },
        proposals: [
          {
            ...feedExample.proposals[0]!,
            votes: "0",
            yea: "0",
            nay: "0",
          },
        ],
      }),
      "0x1111111111111111111111111111111111111111",
      { actionStateTrusted: false }
    );
    const proposal = pageState.data.proposals.items[0]!;

    expect(pageState.data.me.isMember).toBe(true);
    expect(pageState.data.me.weight.effectiveWeight).toBe("50");
    expect(pageState.data.me.canPropose).toBe(false);
    expect(pageState.data.me.canVote).toBe(false);
    expect(proposal.actions).toEqual(
      expect.objectContaining({
        canRetract: false,
        canVote: false,
        canExecute: false,
        nextAction: "none",
      })
    );
    expect(proposal.actions.disabledReason).toMatch(/not trusted/i);
  });

  it("allows any connected mainnet wallet to execute passed proposals", () => {
    const pageState = mapYbcFeedToPageState(
      parseFeed({
        ...feedExample,
        votes: [],
        events: {
          ...feedExample.events,
          voteCount: 0,
        },
        proposals: [
          {
            ...feedExample.proposals[0]!,
            status: "passed",
          },
        ],
      }),
      "0x3333333333333333333333333333333333333333",
      trustedMapOptions()
    );
    const proposal = pageState.data.proposals.items[0]!;

    expect(pageState.data.me.isMember).toBe(false);
    expect(proposal.phase).toBe("awaiting-execution");
    expect(proposal.actions).toEqual(
      expect.objectContaining({
        canRetract: false,
        canVote: false,
        canExecute: true,
        nextAction: "execute",
        disabledReason: null,
      })
    );
  });

  it("marks active members with unmatured target weight as ramping", () => {
    const feed = parseFeed({
      ...feedExample,
      members: [
        {
          ...feedExample.members[0]!,
          effectiveWeight: "0",
          weightMaturityBps: 0,
          maturesAt: null,
        },
      ],
    });
    const pageState = mapYbcFeedToPageState(feed);

    expect(pageState.data.roster.members[0]?.status).toBe("ramping");
    expect(pageState.data.roster.totals.rampingMemberCount).toBe(1);

    const memberPageState = mapYbcFeedToPageState(
      feed,
      "0x1111111111111111111111111111111111111111"
    );
    expect(memberPageState.scenarioId).toBe("member-ramping");
  });

  it("pins every wallet overlay read to the feed block", async () => {
    const feed = parseFeed(feedExample);
    const getBlock = vi.fn(async () => ({
      hash: feed.blockHash,
      timestamp: BigInt(Math.floor(Date.now() / 1_000)),
    }));
    const getBlockNumber = vi.fn(async () => BigInt(feed.blockNumber));
    const readContract = vi.fn(
      async ({
        functionName,
      }: {
        functionName: string;
      }) => {
        switch (functionName) {
          case "num_proposals":
            return 1n;
          case "addition_threshold":
            return BigInt(feed.config.additionThresholdBps);
          case "expulsion_threshold":
            return BigInt(feed.config.expulsionThresholdBps);
          case "proposals":
            return canonicalProposal(feed.proposals[0]!);
          case "members":
            return true;
          case "operators":
            return false;
          case "staked":
            return 100n;
          case "weight":
            return 50n;
          case "status":
            return 4n;
          case "voted":
            return false;
          default:
            return null;
        }
      }
    );
    const publicClient = {
      chain: { id: 1 },
      getChainId: vi.fn(async () => 1),
      getBlock,
      getBlockNumber,
      readContract,
    } as unknown as PublicClient;

    const overlay = await readYbcWalletOverlay(
      publicClient,
      feed,
      "0x1111111111111111111111111111111111111111" as Address
    );

    expect(overlay.isMember).toBe(true);
    expect(getBlock).toHaveBeenCalledTimes(4);
    expect(getBlock).toHaveBeenCalledWith({
      blockNumber: BigInt(feed.blockNumber),
    });
    expect(readContract).toHaveBeenCalledTimes(10);
    for (const [parameters] of readContract.mock.calls) {
      expect(parameters).toEqual(
        expect.objectContaining({
          blockNumber: BigInt(feed.blockNumber),
        })
      );
    }
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: YBC_MAINNET_DEPLOYMENT.ybc,
        functionName: "members",
      })
    );
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: YBC_MAINNET_DEPLOYMENT.ybcElection,
        functionName: "status",
      })
    );
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: YBC_MAINNET_DEPLOYMENT.ybcWeightAggregator,
        functionName: "weight",
      })
    );
  });

  it("fails the wallet overlay closed when the feed block reorganizes during its reads", async () => {
    const feed = parseFeed(feedExample);
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const replacementHash =
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const getBlock = vi
      .fn()
      .mockResolvedValueOnce({
        hash: feed.blockHash,
        timestamp: BigInt(nowSeconds),
      })
      .mockResolvedValueOnce({
        hash: replacementHash,
        timestamp: BigInt(nowSeconds),
      });
    const readContract = vi.fn(
      async ({ functionName }: { functionName: string }) => {
        switch (functionName) {
          case "members":
            return true;
          case "operators":
            return false;
          case "staked":
            return 100n;
          case "weight":
            return 50n;
          case "voted":
            return false;
          default:
            return null;
        }
      }
    );
    const publicClient = {
      chain: { id: 1 },
      getChainId: vi.fn(async () => 1),
      getBlock,
      getBlockNumber: vi.fn(async () => BigInt(feed.blockNumber)),
      readContract,
    } as unknown as PublicClient;
    const verifiedSnapshot: YbcCanonicalSnapshot = {
      additionThresholdBps: feed.config.additionThresholdBps,
      blockHash:
        feed.blockHash as YbcCanonicalSnapshot["blockHash"],
      blockNumber: BigInt(feed.blockNumber),
      blockTimestamp: nowSeconds,
      expulsionThresholdBps: feed.config.expulsionThresholdBps,
      proposalStatusById: { 0: 4 },
      tipBlockNumber: BigInt(feed.blockNumber),
    };

    await expect(
      readYbcWalletOverlay(
        publicClient,
        feed,
        "0x1111111111111111111111111111111111111111" as Address,
        verifiedSnapshot
      )
    ).rejects.toThrow(/not canonical/i);
    expect(readContract).toHaveBeenCalledTimes(5);
    expect(getBlock).toHaveBeenCalledTimes(2);
  });

  it("fails the wallet overlay closed when the feed block was reorganized", async () => {
    const feed = parseFeed(feedExample);
    const getBlock = vi.fn(async () => ({
      hash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      timestamp: BigInt(Math.floor(Date.now() / 1_000)),
    }));
    const getBlockNumber = vi.fn(async () => BigInt(feed.blockNumber));
    const readContract = vi.fn();
    const publicClient = {
      chain: { id: 1 },
      getChainId: vi.fn(async () => 1),
      getBlock,
      getBlockNumber,
      readContract,
    } as unknown as PublicClient;

    await expect(
      readYbcWalletOverlay(
        publicClient,
        feed,
        "0x1111111111111111111111111111111111111111" as Address
      )
    ).rejects.toThrow(/not canonical/i);
    expect(getBlock).toHaveBeenCalledOnce();
    expect(readContract).not.toHaveBeenCalled();
  });

  it("rejects a non-mainnet overlay client before making RPC calls", async () => {
    const feed = parseFeed(feedExample);
    const getBlock = vi.fn();
    const getBlockNumber = vi.fn();
    const readContract = vi.fn();
    const publicClient = {
      chain: { id: 10 },
      getBlock,
      getBlockNumber,
      readContract,
    } as unknown as PublicClient;

    await expect(
      readYbcWalletOverlay(
        publicClient,
        feed,
        "0x1111111111111111111111111111111111111111" as Address
      )
    ).rejects.toThrow(/requires an Ethereum Mainnet RPC client/i);
    expect(getBlock).not.toHaveBeenCalled();
    expect(getBlockNumber).not.toHaveBeenCalled();
    expect(readContract).not.toHaveBeenCalled();
  });

  it("rejects feed proposal metadata that differs from the pinned block", async () => {
    const feed = parseFeed(feedExample);
    const publicClient = createCanonicalClient(feed, {
      canonicalProposal: [
        "0x9999999999999999999999999999999999999999",
        feed.proposals[0]!.proposer,
        BigInt(feed.proposals[0]!.epoch),
        feed.proposals[0]!.addition,
        BigInt(feed.proposals[0]!.thresholdBps),
        BigInt(feed.proposals[0]!.votes),
        BigInt(feed.proposals[0]!.yea),
        feed.proposals[0]!.retracted,
        feed.proposals[0]!.executed,
      ],
    });

    await expect(
      readYbcCanonicalSnapshot(publicClient, feed)
    ).rejects.toThrow(/account does not match mainnet/i);
  });

  it("rejects feed threshold metadata that differs from the pinned block", async () => {
    const feed = parseFeed(feedExample);
    const publicClient = createCanonicalClient(feed, {
      additionThresholdBps: feed.config.additionThresholdBps - 1,
    });

    await expect(
      readYbcCanonicalSnapshot(publicClient, feed)
    ).rejects.toThrow(/thresholds do not match/i);
  });

  it("rechecks the feed block hash after reading proposal authority", async () => {
    const feed = parseFeed(feedExample);
    const publicClient = createCanonicalClient(feed);
    vi.mocked(publicClient.getBlock)
      .mockResolvedValueOnce({
        hash: feed.blockHash,
        timestamp: BigInt(Math.floor(Date.now() / 1_000)),
      } as Awaited<ReturnType<PublicClient["getBlock"]>>)
      .mockResolvedValueOnce({
        hash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        timestamp: BigInt(Math.floor(Date.now() / 1_000)),
      } as unknown as Awaited<ReturnType<PublicClient["getBlock"]>>);

    await expect(
      readYbcCanonicalSnapshot(publicClient, feed)
    ).rejects.toThrow(/not canonical/i);
  });

  it("keeps a canonical snapshot valid while proposal verification runs", async () => {
    const nowSeconds = 2_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(nowSeconds * 1_000);
    const feed = parseFeed(feedExample);
    let advancedPastFreshness = false;
    const publicClient = {
      chain: { id: 1 },
      getChainId: vi.fn(async () => 1),
      getBlock: vi.fn(async () => ({
        hash: feed.blockHash,
        timestamp: BigInt(nowSeconds),
      })),
      getBlockNumber: vi.fn(async () => BigInt(feed.blockNumber)),
      readContract: vi.fn(
        async ({ functionName }: { functionName: string }) => {
          if (!advancedPastFreshness) {
            advancedPastFreshness = true;
            vi.setSystemTime(
              (nowSeconds + 5 * 60 + 1) * 1_000
            );
          }

          switch (functionName) {
            case "num_proposals":
              return BigInt(feed.proposals.length);
            case "addition_threshold":
              return BigInt(feed.config.additionThresholdBps);
            case "expulsion_threshold":
              return BigInt(feed.config.expulsionThresholdBps);
            case "proposals":
              return canonicalProposal(feed.proposals[0]!);
            case "status":
              return 4n;
            default:
              return null;
          }
        }
      ),
    } as unknown as PublicClient;

    await expect(
      readYbcCanonicalSnapshot(publicClient, feed)
    ).resolves.toMatchObject({
      blockHash: feed.blockHash,
      blockTimestamp: nowSeconds,
    });
    expect(publicClient.getBlock).toHaveBeenCalledTimes(2);
  });

  it("accepts a shuffled but complete canonical proposal history", () => {
    const proposalZero = parseFeed(feedExample).proposals[0]!;
    const proposalOne = {
      ...proposalZero,
      id: 1,
      account: "0x3333333333333333333333333333333333333333",
    };
    const feed = parseFeed({
      ...feedExample,
      proposals: [proposalOne, proposalZero],
      events: {
        ...feedExample.events,
        proposalCount: 2,
      },
    });

    expect(() => assertCompleteYbcProposalHistory(feed)).not.toThrow();
  });

  it("bounds canonical and wallet RPC concurrency at the history ceiling", async () => {
    const feed = parseFeed({
      ...feedExample,
      proposals: Array.from(
        { length: YBC_FEED_MAX_PROPOSALS },
        (_, id) => ({
          ...feedExample.proposals[0]!,
          id,
        })
      ),
      events: {
        ...feedExample.events,
        proposalCount: YBC_FEED_MAX_PROPOSALS,
      },
    });
    let activeCanonicalReads = 0;
    let peakCanonicalReads = 0;
    const canonicalClient = {
      chain: { id: 1 },
      getChainId: vi.fn(async () => 1),
      getBlock: vi.fn(async () => ({
        hash: feed.blockHash,
        timestamp: BigInt(Math.floor(Date.now() / 1_000)),
      })),
      getBlockNumber: vi.fn(async () => BigInt(feed.blockNumber)),
      readContract: vi.fn(
        async ({
          args,
          functionName,
        }: {
          args?: readonly [bigint];
          functionName: string;
        }) => {
          if (functionName === "num_proposals") {
            return BigInt(feed.proposals.length);
          }
          if (functionName === "addition_threshold") {
            return BigInt(feed.config.additionThresholdBps);
          }
          if (functionName === "expulsion_threshold") {
            return BigInt(feed.config.expulsionThresholdBps);
          }
          const proposalId = Number(args?.[0] ?? 0n);
          const proposal = feed.proposals[proposalId]!;
          activeCanonicalReads += 1;
          peakCanonicalReads = Math.max(
            peakCanonicalReads,
            activeCanonicalReads
          );
          await Promise.resolve();
          activeCanonicalReads -= 1;
          return functionName === "proposals"
            ? canonicalProposal(proposal)
            : 4n;
        }
      ),
    } as unknown as PublicClient;

    const snapshot = await readYbcCanonicalSnapshot(
      canonicalClient,
      feed
    );

    expect(peakCanonicalReads).toBeLessThanOrEqual(
      YBC_PROPOSAL_READ_BATCH_SIZE * 2
    );
    expect(canonicalClient.readContract).toHaveBeenCalledTimes(
      3 + YBC_FEED_MAX_PROPOSALS * 2
    );

    let activeVotedReads = 0;
    let peakVotedReads = 0;
    const walletClient = {
      chain: { id: 1 },
      getChainId: vi.fn(async () => 1),
      getBlock: vi.fn(async () => ({
        hash: feed.blockHash,
        timestamp: BigInt(Math.floor(Date.now() / 1_000)),
      })),
      getBlockNumber: vi.fn(async () => BigInt(feed.blockNumber)),
      readContract: vi.fn(
        async ({ functionName }: { functionName: string }) => {
          if (functionName === "members") return true;
          if (functionName === "operators") return false;
          if (functionName === "staked") return 100n;
          if (functionName === "weight") return 50n;
          activeVotedReads += 1;
          peakVotedReads = Math.max(peakVotedReads, activeVotedReads);
          await Promise.resolve();
          activeVotedReads -= 1;
          return false;
        }
      ),
    } as unknown as PublicClient;

    await readYbcWalletOverlay(
      walletClient,
      feed,
      "0x1111111111111111111111111111111111111111",
      snapshot
    );

    expect(peakVotedReads).toBeLessThanOrEqual(
      YBC_PROPOSAL_READ_BATCH_SIZE
    );
    expect(walletClient.readContract).toHaveBeenCalledTimes(
      4 + YBC_FEED_MAX_PROPOSALS
    );
  });
});

function canonicalProposal(proposal: YbcFeed["proposals"][number]) {
  return [
    proposal.account,
    proposal.proposer,
    BigInt(proposal.epoch),
    proposal.addition,
    BigInt(proposal.thresholdBps),
    BigInt(proposal.votes),
    BigInt(proposal.yea),
    proposal.retracted,
    proposal.executed,
  ] as const;
}

function trustedMapOptions() {
  return {
    actionStateTrusted: true,
    canonicalBlockTimestamp: feedExample.generatedAt,
  } as const;
}

function createCanonicalClient(
  feed: YbcFeed,
  overrides: {
    additionThresholdBps?: number;
    canonicalProposal?: readonly unknown[];
    expulsionThresholdBps?: number;
  } = {}
): PublicClient {
  return {
    chain: { id: 1 },
    getChainId: vi.fn(async () => 1),
    getBlock: vi.fn(async () => ({
      hash: feed.blockHash,
      timestamp: BigInt(Math.floor(Date.now() / 1_000)),
    })),
    getBlockNumber: vi.fn(async () => BigInt(feed.blockNumber)),
    readContract: vi.fn(
      async ({ functionName }: { functionName: string }) => {
        switch (functionName) {
          case "num_proposals":
            return BigInt(feed.proposals.length);
          case "addition_threshold":
            return BigInt(
              overrides.additionThresholdBps ??
                feed.config.additionThresholdBps
            );
          case "expulsion_threshold":
            return BigInt(
              overrides.expulsionThresholdBps ??
                feed.config.expulsionThresholdBps
            );
          case "proposals":
            return (
              overrides.canonicalProposal ??
              canonicalProposal(feed.proposals[0]!)
            );
          case "status":
            return 4n;
          default:
            return null;
        }
      }
    ),
  } as unknown as PublicClient;
}
