# DAO internal domain and mocks

The public contract is [feed V2](feed-schema-v2.md). `DaoSnapshot` and `DaoProposal` are frontend domain values, with bigint weights/IDs, derived display groups/statuses, content interpretation, script integrity, timing and capabilities. Their JSON serialization supports mock storage; it is not a second public feed validator.

The existing mutable mock runtime preserves the accepted board, detail, authoring and action flows. It shares domain status/capability rules, the immutable content parser, script-framing checker and presentation types with the V2 adapter. Production mode excludes mock client selection, mock actions and review controls. New production reads use the saved V2 response and real transport/parser/adapter, not mock fallback.

## Required scenarios

The [saved V2 response](examples/feed-v2/dao-feed-v2.example.json) contains 27 synthetic source-based cases: ID zero; all protocol statuses; both veto paths and later zero replacement; Flag's retracted flag; signal completion without Execute; exact/empty/missing/mismatched/malformed/unknown-call scripts; unavailable/malformed/mismatched/unsafe content; zero Vote account/weight; replacement events; changed default vs stored threshold; very large weights; and direct-contract content.

Acceptance tests reject matching-digest BOM-prefixed content locally while accepting canonical non-ASCII content. They also add empty feeds, multiple configured Voting deployments with duplicate numeric IDs, invalid envelopes, wrong chains, canonical replacement, out-of-order/failed refreshes, bounds and deadlines. Controlled ABI responses exercise current wallet state, wrong network/account changes, disconnect, stale heads, RPC failure and immutable commitment disagreement.

All new examples are synthetic. They are not node recordings, producer output or contract-execution evidence. See [reset evidence](delivery/feed-v2-reset.md) for the later integration gate.

## Mutable actions and creation

Runtime controls cover roles, wallet/network, current time, vote totals, stored thresholds/flags, script/content integrity and fresh execution-preflight failure. Historical simulation states were removed. Script controls are missing, decoded/framed, partial/unknown, malformed and hash mismatch. Raw unknown calls never carry fictional proof labels.

Execution preflight results bind the chain, Voting destination, actual caller and exact Voting.execute calldata, plus the independent live block number/hash/timestamp and relevant preparation inputs; an Executor frame result alone cannot satisfy the interface. Missing or stale block identity, a replacement hash at the same height, or changed configuration invalidates preflight. Advancing the mock live observation does not automatically rerun simulation. Prepared mock actions recheck capabilities at submission and reject changed account/proposal/configuration/script/observation context. Confirmed actions stay separate from canonical events until indexing. Failure creates no successful receipt or event.

Mock authoring preserves canonical `yearn.dao.proposal.v1`, forum validation and two separate actions: content publication, then onchain creation. Receipt identity includes chain/Voting/ID and accepts ID zero. Publication alone creates no proposal. Awaiting-index records persist in browser session storage under a versioned internal key, retain one identity and retry indexing idempotently. They do not promise backend simulation or cross-session durability.

## Generation

`npm run generate:dao-feed` produces the public V2 JSON Schema/example, synthetic trusted deployment example and [internal mock example](examples/mock-data.example.json). `--check` verifies deterministic bytes. The [content example](examples/proposal-content.example.json) and fixed Executor vectors preserve their independent formats. Do not serialize domain display fields into the public feed.

Old V1 schema, proof fixtures, generator and tests are removed from active maintenance. Useful regressions now live in the compact V2 suite and the existing content, script, receipt, mock action, route and authoring tests.
