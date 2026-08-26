import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = process.cwd();
const server = await createServer({
  configFile: resolve(root, "vitest.config.mts"),
  server: { middlewareMode: true },
});

try {
  const fixtures = await server.ssrLoadModule("/tests/fixtures/dao-feed-v1.ts");
  const schemaModule = await server.ssrLoadModule("/lib/schemas/dao-feed.ts");
  const zodModule = await server.ssrLoadModule("/lib/schemas/zod.ts");
  const feed = fixtures.createDaoFeedV1Example();
  const stages = fixtures.DAO_CREATION_IDENTITY_STAGES_V1_EXAMPLE;
  const generatedSchema = zodModule.z.toJSONSchema(
    schemaModule.DaoFeedV1Schema,
    { target: "draft-2020-12", io: "input" }
  );
  const jsonSchema = {
    $schema: generatedSchema.$schema,
    $id: schemaModule.DAO_FEED_SCHEMA_ID,
    title: "Yearn DAO feed v1",
    description:
      "Strict structural contract for yearn.dao.feed.v1. Semantic and cryptographic invariants are enforced by the repository boundary.",
    ...Object.fromEntries(
      Object.entries(generatedSchema).filter(([key]) => key !== "$schema")
    ),
    "x-semantic-validator": "lib/schemas/dao-feed.ts#parseDaoFeedJsonV1",
    "x-semantic-invariants": [
      "canonical uint256, nonzero provenance primitives, and composite identities",
      "atomic cursor, finality, retry, reorg, admission, and record counts",
      "proposal-time disclosure, event-effective admission, snapshot-effective status, zero-capable mutable configuration, and ordered same-Voting history",
      "one global block-number/hash/timestamp registry, strict block-global log order, reverse transaction identity, canonical ABI, receipt identity, veto branches, and last-write running totals",
      "explicit chain-time availability, exact arbitrary invalid bytes with reproduced typed failure codes, canonical available content, SHA-256/CIDv1 identity, attachment provenance, manifest and asset records",
      "feed-wide complete pinned-Voter full-call-trace invocation identities with canonical ordinal order and one caller submission per proposal, checked cumulative ybc_votes replay, trace-unavailable lower bounds, unclassified custom-Voter events, independent Voter genesis, and reproducible v2 source/compiler/template/immutable/runtime evidence",
      "verified, unverified, and constructor-zero Executor evidence; official compiler and source-integrity pins; pinned-only framing; exact script retention/type/hash binding; and unavailable analysis and simulation for unproven implementations",
      "conditional revm 34.0.0 OSAKA/BPO2 engine-injected simulation chronology and a v3 commitment binding synthetic-or-archive projections, block opcode context, exact warm set/calldata, and the disclosed non-transactional 30000000-gas overapproximation",
      "total nonthrowing safe admission across structural, semantic, and raw-JSON consumer boundaries",
    ],
  };

  const mapPath = resolve(
    root,
    "docs/apps/dao/examples/feed-v1/dao-mock-state-map-v1.example.json"
  );
  const previousMap = JSON.parse(await readFile(mapPath, "utf8"));
  const mockStateMap = previousMap.map((entry) => {
    const proposal = feed.proposals.find(
      (candidate) =>
        candidate.ref.chainId === entry.proposalRef.chainId &&
        candidate.ref.votingAddress === entry.proposalRef.votingAddress &&
        candidate.ref.proposalId === entry.proposalRef.proposalId
    );
    if (!proposal) throw new Error(`Missing mapped proposal ${entry.fixture}.`);
    return {
      ...entry,
      predicates: {
        protocolStatus: proposal.protocolStatus,
        displayStatus: proposal.displayStatus,
        displayGroup: proposal.displayGroup,
        proposalType: proposal.type,
        chainCreatedAtState: proposal.chainCreatedAt.state,
        thresholdBps: proposal.thresholdBps,
        contentState: proposal.content.state,
        discussionState: proposal.discussion.state,
        analysisState: proposal.analysis.state,
        simulationState: proposal.analysis.proposalSimulation.state,
        scriptRetentionState: proposal.script.retention.state,
        scriptStructureState: proposal.script.structure.state,
        scriptHashVerificationState: proposal.script.hashVerification.state,
        executionGuard: proposal.rules.mutableConfiguration.executionGuard,
        eventTypes: proposal.events.map((event) => event.type),
        flagReason: proposal.moderation.flagReason,
        vetoReason: proposal.moderation.vetoReason,
        hasUnavailableActorEvidence: proposal.events.some(
          (event) => event.actor.evidence.state === "unavailable"
        ),
        hasNullableEventTimestamp: proposal.events.some(
          (event) => event.log.timestamp === null
        ),
        hasNullableTransactionHash: proposal.events.some(
          (event) => event.log.transactionHash === null
        ),
      },
    };
  });

  const outputs = [
    ["docs/apps/dao/examples/feed-v1/dao-feed-v1.example.json", feed],
    ["docs/apps/dao/examples/feed-v1/dao-creation-stages-v1.example.json", stages],
    ["docs/apps/dao/examples/feed-v1/dao-mock-state-map-v1.example.json", mockStateMap],
    ["docs/apps/dao/feed-schema-v1.schema.json", jsonSchema],
  ];
  for (const [path, value] of outputs) {
    await writeFile(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);
  }
} finally {
  await server.close();
}
