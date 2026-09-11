# DAO Governance

DAO Governance lets users read Yearn proposals, review immutable content and exact scripts, and use permitted governance actions as those flows pass their later release gates.

The accepted mock product and reviewed V2 reads are integrated. The user reports that the reviewed producer is released and active at https://data.dao-ops.com/prod/dao.json.
The combined live implementation follows the [single active milestone plan](delivery/milestone-plan.md). It covers publication, wallet transactions, disposable fork UAT, and review preparation.
See [live services](live-services.md), the [local fork runbook](local-fork-uat.md), and [status](delivery/status.md) for configuration, inspected evidence and remaining inputs. Production rollout remains separately gated.

The [review-fix tracker](delivery/evidence/m5-live-review/README.md) records publication controls, receipt recovery, draft retention and bounded cleanup.
Independent re-review and operator configuration remain pending.

## Canonical references

1. [Contract behavior and source pin](contract-reference.md).
2. [Functional requirements](functional-requirements.md), [user stories](user-stories.md), and [UI specification](ui-spec.md).
3. [Feed V2 specification](feed-schema-v2.md), [field/source mapping](feed-v2-field-sources.md), [generated schema](feed-schema-v2.schema.json), and [saved examples](examples/feed-v2/dao-feed-v2.example.json).
4. [Internal domain and mocks](mock-data.md).
5. [Producer handoff](delivery/producer-handoff.md), [dependency graph](delivery/dependency-graph.md), and [status](delivery/status.md).
6. [Reset decision and evidence](delivery/feed-v2-reset.md).

## Product and trust boundaries

Global reads use one static cache of coherent contract state and canonical event history. The producer refreshes all proposals at each snapshot. The frontend derives display groups, status labels, percentages, content validity and supported script framing. Current wallet facts come from a separately dated live observation.

Proposal identity includes chain, Voting address and uint256 ID, including zero. The app explicitly configures supported deployments. It never accepts a transaction destination or RPC endpoint chosen by a feed.

Stored proposal thresholds and snapshot-effective configuration have distinct labels. There is no quorum: percentages say “of votes cast”; passing still requires positive total weight and the contract's integer arithmetic. Flag/Veto have unknown historical actors unless the event itself identifies one. Vetoed, nonretracted proposals may remain votable. Signal completion never invents an Execute transaction.

The immutable format stays `yearn.dao.proposal.v1`. Canonical bytes, digest/CID commitments, safe Markdown and no-load attachment cards remain intact. Content failure does not hide a proposal or prohibit otherwise valid voting. Original script bytes and stored hash stay visible; missing/mismatched/malformed supported scripts block execution preparation. Historical simulations, build proofs, trace attribution and precise human voter counts are outside launch.

Writes stay in domain clients and shared useTx. Authoring separates content publication, receipt-confirmed creation, and awaiting-index recovery. The combined implementation retains fresh actual-call preflight before signing.

## Routes and rollout

Shared hosts use `/dao`, `/dao/proposals/[id]`, and `/dao/propose`. Proposal links carry chain/Voting selection where needed. The existing internal `dao-beta.dao-ops.com` host stays unlisted, noindex and noncanonical; planned `dao.yearn.fi` exposure requires later approval. Forum discussion remains at `gov.yearn.fi`.

`NEXT_PUBLIC_ENABLE_DAO` gates production routes. `DAO_PUBLICATION_ENABLED` independently gates uploads, which also require an operator grant policy and uploader signatures. Production mode has no mock fallback, including on the beta host. The existing production deployment flag remains off. Protected preview-mode environments may review mock actions. See the [runbook](delivery/dao-beta-runbook.md); this reset changes no infrastructure or deployed environment.
