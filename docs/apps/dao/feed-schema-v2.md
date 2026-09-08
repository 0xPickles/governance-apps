# DAO feed V2 consumer contract

Status: Governance Apps review candidate. Ready for external review and producer implementation once explicitly approved after consumer review. Producer interoperability is pending. Small coordinated amendments may follow actual producer experience.

This replaces `yearn.dao.feed.v1`. The immutable content format remains `yearn.dao.proposal.v1`; the Executor frame format is unchanged. There is one active feed parser and one publication contract. Historical V1 code and accepted bytes are recoverable at the commits recorded in [the reset decision](delivery/feed-v2-reset.md).

## Contract and ownership

The feed is an operator-produced cache of chain observations. Zod, JSON Schema, and content/script hashes detect bounded classes of errors; they do not prove all chain state. Governance Apps owns trusted chain, Voting deployments, fixed genesis, and supported Voter/Executor identities. Its current shared RPC and explorer infrastructure supports Ethereum mainnet (chain 1); app configuration rejects other chains. The wire identity retains chain ID and supports multiple Voting deployments on that chain. The feed supplies no RPC URL or transaction destination authority.

Required sources:
- [Structural schema](../../../lib/schemas/dao-feed.ts) in TypeScript is authoritative; [generated draft-07 JSON Schema](feed-schema-v2.schema.json) is deterministic.
- [Every field and source](feed-v2-field-sources.md) defines interpretation and failure policy.
- [Portable acceptance mutations](examples/feed-v2/acceptance-cases.json) provide shared positive and negative expectations for ordinary producer tooling.
- [Saved 27-proposal response](examples/feed-v2/dao-feed-v2.example.json) and [synthetic deployment configuration](examples/feed-v2/deployments.example.json).
- [Producer handoff](delivery/producer-handoff.md) defines acquisition and publication.
- [Contract reference](contract-reference.md) defines protocol semantics.

## One coherent snapshot

One static UTF-8 JSON object contains one chain, one canonical block, all explicitly configured Voting deployments, and all their proposals with complete canonical proposal timelines. The configuration array contains at least one deployment even when there are no proposals. No artificial adjacent proposal or start sentinel exists.

At the identified block, read each Voting deployment's `num_proposals`, current configuration, every stored `proposals(id)`, and every `status(id)`. Use the stored threshold directly. Status is the observed result; neither producer nor consumer replays event history to determine authoritative current state. Refresh all known proposals with bounded batches on every snapshot, even when no new logs exist. Measure before adding incremental dependency tracking.

The producer scans logs inclusively from each configured deployment block. History supplies original script bytes and Propose time, Vote records, moderation reasons, and Execute caller. Acquisition must reconcile complete logs and stored records before publication. An unavailable content gateway is optional enrichment failure; an incomplete required state/log acquisition prevents a new publication.

## Encoding, ordering, and bounds

All onchain uint256 values use canonical decimal strings, including proposal ID, epoch, block number, counts, bps and weights: `0` or a nonzero digit followed by digits, at most 78 digits, value at most 2^256−1. No sign, leading zero, fraction, exponent, or whitespace. The frontend uses bigint until a bounded presentation conversion.

All addresses and hashes are lowercase `0x` plus exactly 40 and 64 hex digits. Zero-valued Vote accounts, weights and indexed proposal IDs are valid. Script bytes are lowercase, even-length hex with `0x` prefix, at most 2,048 bytes. Empty `0x` and missing `null` differ.

Timestamps are integer Unix seconds in UTC, from 0 through 253402300799 (end of year 9999). Observation time is the acquisition completion time, at or after block time. It stays fixed across publication retries. Chain IDs are positive safe integers; transaction/log indices are nonnegative safe integers (at most 9007199254740991). Epoch-derived dates must fit the same timestamp range in the adapter. Vote weights retain the contract weight unit (18-decimal weight for the reviewed deployment), never whole-token integers. Threshold and Vote.yea are integer bps 0–10000; stored proposal.yea is weighted yea units, at most proposal.votes.

Deployments retain an operator-defined stable order. Proposals group by that order and then ascending ID, exactly 0 through proposalCount−1 per deployment. Full identity is chain ID + Voting address + proposal ID. Timelines begin with one Propose and sort by block number then block-global logIndex; transactionIndex cannot go backwards within one proposal's block. No duplicate block/log index is allowed across the snapshot. Equal block numbers must have equal hash/time, and events cannot follow the snapshot. The producer also validates transaction/log identity against canonical receipts and headers.

Initial limits: 8 deployments, 10000 proposals, 100000 total events, 131072 decoded content bytes per proposal, 256 UTF-8 bytes per moderation reason, and 32 MiB total response bytes after HTTP content decoding. Arrays are complete, never pagination tokens or truncated prefixes. Exceeding a required-data budget blocks publication and raises an operator alert. Retain the previous stable snapshot; coordinate a reviewed budget adjustment or immutable-object split. Optional content may be omitted as null under its documented bound without dropping core proposals. Do not silently truncate content.

## Content and scripts

`contentBytes` is null or standard RFC 4648 padded canonical base64 of the exact raw IPFS content block. Preserve bytes, including canonical final LF. The producer may retrieve and bound these bytes; it does not reproduce the frontend Markdown AST, canonicalizer, attachment resolver, or error precedence. The frontend verifies SHA-256 against the stored digest, fatal UTF-8 decoding, JSON/content structure, the existing safe content parser, and exact canonical bytes (length and every original byte, including rejection of a UTF-8 BOM even when its digest matches). Invalid enrichment affects one proposal. Unsafe HTML and links never render. Attachments remain no-load cards with explicit user activation.

Invalid base64 inside the bounded string is an invalid-content state, not an invalid feed. A missing required field, wrong field type, out-of-budget string or unknown property is an invalid envelope. Exact script bytes and stored hash remain separate. The frontend compares keccak256 and frames only app-supported Executor implementations. Missing/mismatched/malformed supported scripts block execution preparation but retain the rest of the record. Unsupported implementations retain raw bytes with an explicit unsupported decoder state. Unknown targets/selectors remain readable; no arbitrary ABI discovery or historical simulation is required.

## Validation layers

1. Transport bounds time and bytes.
2. Generated JSON Schema and Zod enforce structure, primitive formats, required/null fields, and per-array limits.
3. Named semantic functions check uint256 upper range, bps/configuration limits, stored flag priority, Flag⇒retracted, weighted yea≤total, complete ordered identities, block/log consistency, initial Propose, total event count and UTF-8 reason size.
4. The app adapter checks trusted deployments, inclusive deployment coverage and safe derived dates, then creates domain content/script integrity states.

JSON Schema intentionally cannot express the cross-record checks in step 3 or app configuration in step 4. The [acceptance suite](../../../tests/unit/lib/schemas/dao-feed-v2.test.ts) runs ordinary Ajv validation and the actual consumer against the same saved response and mutations. A changed status with no conflicting flags can be structurally valid: only a producer's real `status` read establishes its correctness. This avoids the earlier disagreement caused by an authoritative state replay requirement in only one language.

## Transport, caching, and rendering

The same-origin `/api/dao-data` proxy first checks `isDaoEnabled()`: disabled production GET and HEAD return 404 without reading feed configuration or contacting upstream. When enabled, it reads only server-configured `DAO_DATA_URL`. It and the browser reuse the existing Teams/YBC bounded transport: 10-second total request/body deadline, 32 MiB decoded byte limit, no-store, cancellation on overflow/deadline. The proxy returns 409 for an unsupported feed version, 504 for upstream deadline expiry and 502 for other invalid/upstream failures; the client retains incompatible/timeout distinctions. No browser history scan or request-time indexer exists. Normal polling is 60 seconds; snapshot age comes from block time and becomes stale after 300 seconds, including after a successful but old response.

Cache scope includes feed version and exact trusted deployment configuration. Invalid refreshes retain last-good data with the refresh error. A per-reader sequence prevents older requests replacing later requests. A candidate with earlier observedAt is rejected. Identical observedAt must identify identical parsed data; producers serialize candidate creation to distinct observation seconds. A newer observation may replace a block at the same or lower height during canonical recovery. This is cache ordering, not a cryptographic canonicality proof.

Loading, empty, stale, last-good, unavailable, incompatible and unknown-deployment states are explicit. Multi-deployment proposal URLs carry `?chain=1&voting=0x…`; a bare numeric route resolves only when one Voting deployment is configured. ID zero is valid.

Disconnected users need no wallet RPC for global data. A separate live overlay reads current wallet contribution, weight/decay, roles, configuration, stored flags and status at one EIP-1898 block, checks the chain and block canonicality, and rejects stale RPC heads (over 300 seconds) or future heads (over 60 seconds). Current wallet facts display their own observation block. They never refresh the older feed timestamp. Account/network/ref/snapshot changes change query scope; disconnect, refreshing and RPC error hide stale eligibility. Production writes remain disabled. Execution preflight requires its own simulation block number, hash and timestamp to match the current live preparation observation, plus an equality key for the relevant proposal/account/configuration inputs. Missing or changed observations, canonical replacement at the same height, and changed configuration invalidate the result. The older feed observation is not this preparation context; a recent simulation timestamp alone cannot authorize execution.

Receipt-confirmed local mock proposals retain their full identity while awaiting indexing; retries reuse the receipt, without a new creation. Production authoring remains a later package. Any future confirmed-write overlay must bind the real receipt, retain its identity through feed lag, and compare feed event/hash evidence before claiming indexed success.

## Generation and review

Run `npm run generate:dao-feed` to update the JSON Schema and saved examples. Run `npm run generate:dao-feed -- --check` to detect drift; the Security And Quality CI workflow runs this same check for all four generated artifacts. The generator uses Zod's schema exporter with shared references; there is no handwritten schema interpreter. Synthetic fixture builders are test inputs, never production feed acquisition.

See [reset evidence and measurements](delivery/feed-v2-reset.md). A saved consumer response is not producer interoperability evidence. Real producer-generated candidate bytes must pass this transport/parser/adapter and routes in the later cross-repository gate.
