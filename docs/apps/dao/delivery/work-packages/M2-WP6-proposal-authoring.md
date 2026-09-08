# M2 WP6: Proposal Authoring

> Historical package scope. Acceptance evidence remains in [status](../status.md). Active maintenance follows the [V2 reset](../feed-v2-reset.md), [V2 specification](../../feed-schema-v2.md) and revised dependency graph. Old producer-before-consumer gates, simulation/proof obligations and production mock exceptions are superseded.


Historical note: WP7B supersedes this package's separate title, summary, and
specification fields with the finalized in-place `yearn.dao.proposal.v1`
Markdown source and asset manifest. WP6 remains the delivery record for the
original authoring slice, not the current content contract.

Branch: `agent/dao/m2/wp6`

## Objective

Build mock signal and executable proposal authoring with a full raw-script input,
structural checks, immutable-content review, and mock publish/propose states.

## Depends on

- Accepted M1.

## Expected ownership

- `/dao/propose` components and route-local copy
- authoring form state and validation
- mocked forum and publication services
- form and authoring E2E tests

## Scope

- Mock forum topic validation and normalization.
- Historical separate title, summary, and specification inputs, superseded by
  WP7B's exact Markdown source; proposal type remains structured metadata.
- Signal empty script.
- Executable full-hex textarea, parser result, targets, byte/call count, and hash.
- Final review plus separate publication and onchain mock steps.
- Precise proposer eligibility for wallet, network, blacklist, weight, cooldown,
  and the rolling six-epoch shared proposal capacity.

## Non-goals

- No ABI builder, bundle format, semantic browser decode, or browser simulation.
- No real forum API, IPFS provider, or contract write.

## Acceptance criteria

- Empty script is valid only for Signal.
- Parser errors identify code and byte offset.
- Passing copy says `Script structure is valid`, never safe or verified.
- Exact content, script, and hash appear before confirmation.
- Failed publication preserves form state and does not start the wallet step.
- A full affected reward epoch blocks submission and identifies the shared
  capacity rule without implying a per-user quota.
- Copy says backend decoding and simulation follow submission.

## Validation

- Fixed parser/form vectors and accessibility tests.
- Signal and executable authoring E2E.
- Standard repository checks.

## Mock implementation contract

- The accepted M1 readiness card remains the route entry state. `Start proposal`
  opens the authoring form without changing shared DAO board or detail state.
- Forum fixtures are deterministic: `1001` publishes a Signal proposal, `1002`
  fails publication, `1003` reaches wallet rejection, `1004` reaches proposal
  revert, and `1005` publishes an executable proposal. `2002`, `404`, and `503`
  exercise wrong-category, missing-topic, and unavailable-service validation.
- Publication creates a deterministic mock content fingerprint before the
  separate mocked wallet/proposal step. Publication failure keeps the draft and
  never enters the wallet step.
- Exact review content is locked after publication. Submitted proposals remain
  pending while backend indexing, decoding, and simulation are represented as
  post-submission work.
- The review lock begins when publication starts, preserves exact title
  whitespace, and cannot be escaped by returning to the draft while the request
  is in flight.
- Accepted and reviewed forum facts include the normalized topic title, stable
  category ID and label, author, and creation time.
- Loading controls retain their action or progress name, expose busy state, and
  stop decorative spinner motion when reduced motion is requested.
- Eligibility fixtures expose wallet, proposal network, blacklist, voting
  weight, cooldown, expected voting epoch, and all six shared affected reward
  epochs as separate facts.

## Review

Contract-format auditor and form/accessibility reviewer. May run alongside WP4;
integrate after WP4 to reduce route-level conflict risk.
