# M2 WP7C: Beta Access and Execution Clarity

> Historical package scope. Acceptance evidence remains in [status](../status.md). Active maintenance follows the [V2 reset](../feed-v2-reset.md), [V2 specification](../../feed-schema-v2.md) and revised dependency graph. Old producer-before-consumer gates, simulation/proof obligations and production mock exceptions are superseded.


Status: scoped for implementation; the M2 product gate remains unaccepted.

Branch: `agent/dao/m2/wp7c`

Frozen integration base: `18019c38e27c84c9a9900a390c5b03ff4ddf8103`

Accepted WP7B merge: `c2931f7714ab96ff2531e4192e9ef4a49595057a`

## Objective

Complete the final M2 pre-acceptance follow-up by requiring Cloudflare One
authentication on every governance beta hostname, surfacing typed
proposal-level execution integrity blockers, making the shared application
label a host-aware home link, making the DAO review transaction outcome apply
truthfully to proposal creation, and proving that the existing created-proposal
indexing transition completes without changing identity.

The package remains deterministic and mock-backed. It does not authorize an
application Worker deployment, public production exposure, M2 acceptance, an
M2 tag, M3, backend feeds, real forum or IPFS work, onchain reads or writes,
fork work, or M7.

## Depends on

- Exact clean `agent/integration` tip
  `18019c38e27c84c9a9900a390c5b03ff4ddf8103`.
- Accepted WP7B merge
  `c2931f7714ab96ff2531e4192e9ef4a49595057a` in that tip's ancestry.
- The WP7B receipt-derived proposal identity and browser-local created-proposal
  overlay remaining the only creation/indexing model in M2.
- The pinned governance source and canonical DAO contracts documented in
  `docs/apps/dao/contract-reference.md`.

This follow-up starts from the exact accepted integration tip above. The
historical `integration/dao-m0` tag invariant is not a package precondition.

## Expected ownership

- exact-host Cloudflare One Access configuration and sanitized operator evidence;
- shared host-aware header navigation and its regression coverage;
- typed DAO execution-readiness derivation, fixtures, board/detail presentation,
  route-local copy, and tests;
- typed proposal-authoring transaction-outcome input, mock creation state
  transitions, retry behavior, indexing verification, and tests;
- preproduction, security, runtime, DAO behavior, UI, test, delivery, and
  evidence documentation affected by the package.

One implementer owns repository edits in the package worktree. Cloudflare,
contract/domain, frontend/accessibility, and test reviewers are read-only.
External Cloudflare mutation follows the separately authorized exact-host
boundary below and never changes Worker, DNS, custom-domain, or GitHub state.

## Scope

### 1. Require Cloudflare One on six exact beta hosts

Protect every path, including nested application routes, on exactly:

- `styfi-beta.dao-ops.com`
- `veyfi-beta.dao-ops.com`
- `yeth-beta.dao-ops.com`
- `teams-beta.dao-ops.com`
- `ybc-beta.dao-ops.com`
- `dao-beta.dao-ops.com`

Use Cloudflare Access with the account's existing GitHub identity provider and
existing reusable internal-beta organization/team policy when their configured
identity matches the intended audience. Audit current Zero Trust identity
providers, reusable policies, Access applications, hostnames, and precedence
before mutation. Record a sanitized pre-change snapshot of existing exact-host
applications and policy attachments that is sufficient to restore them. If the
authorized GitHub organization or team cannot be determined from existing
configuration, stop external mutation and ask the user one narrow question.
Never infer an email domain, admit any GitHub user, use `Everyone`, or add a
public bypass.

Use one reusable policy across six exact self-hosted application entries, or
another API-supported exact-host structure with equivalent isolation. Do not
use `*.dao-ops.com`. Preserve custom domains, DNS, TLS, routing, Worker, paths,
and application behavior. Keep `app.dao-ops.com`, public `*.yearn.fi`, shared
path hosts, and unrelated `dao-ops.com` hosts outside the change.

Do not create unauthenticated bypasses for assets, `/_next`, APIs, health
checks, or application routes. If later automation needs access, document a
separate narrow Service Auth policy and securely stored service token rather
than weakening interactive GitHub authorization.

For each exact host, record sanitized evidence that:

- an unauthenticated incognito request is challenged or redirected by Access;
- the application cannot be used before authentication;
- an authorized GitHub organization/team member can enter;
- an unrelated GitHub account is denied;
- a representative nested route remains protected;
- the correct application loads after authentication;
- cross-beta navigation does not expose an unprotected destination;
- wallet connection and wallet popups still work;
- authenticated responses retain the intended noindex/canonical policy; and
- no production or unrelated hostname is protected.

If available tooling cannot inspect or mutate Access safely, record exact
operator steps and leave the external gate explicitly blocked. Never claim
completion for an unchecked hostname. Rollback must restore the sanitized
pre-change snapshot and disable or delete only exact-host bindings,
applications, and policies created by this package. If the package extends an
existing application or policy, rollback removes only the added
`dao-beta.dao-ops.com` hostname or policy attachment. It must never detach a
pre-existing policy from a pre-existing application, and it must preserve or
restore protection for the five beta hosts that were already protected. Do not
touch DNS or the Worker.

### 2. Add a typed proposal-level execution-readiness fact

Lifecycle status, vote result, proposal type, moderation, account capability,
and execution readiness remain separate domain facts. Add an explicit typed
proposal-level readiness value in the DAO domain/client layer. Components
render that value and do not inspect raw analysis fields to invent it.

The minimum matrix is:

```ts
type DaoProposalExecutionReadiness =
  | { state: "not_applicable"; blocker: null; reason: null }
  | { state: "integrity_ready"; blocker: null; reason: null }
  | {
      state: "integrity_blocked";
      blocker:
        | "exact_script_unavailable"
        | "stored_script_hash_mismatch";
      reason: string;
    };
```

`integrity_ready` means only that exact script bytes are present and match the
stored hash. It never means that the proposal is executable now or that the
connected account has permission.

| Proposal condition | Proposal-level readiness | Board/detail hard-block badge | Account capability effect |
| --- | --- | --- | --- |
| Executable proposal; stored script hash mismatches exact event script | `integrity_blocked / stored_script_hash_mismatch` | `Execution blocked` with exact mismatch reason | execution unavailable |
| Executable proposal; exact event script bytes unavailable | `integrity_blocked / exact_script_unavailable` | `Execution blocked` with concise unavailable-bytes reason | execution unavailable |
| Normal executable proposal with verified bytes | `integrity_ready` | none | derived separately |
| Approved executable proposal waiting for its execution window | `integrity_ready`; lifecycle remains `scheduled` | none | time block remains account/action copy |
| Guarded executable proposal with verified bytes | `integrity_ready`; guard remains `guarded` | none | non-operator inability remains account-specific |
| Signal proposal | `not_applicable`; type remains Signal/no actions | none | no execution action |
| Vetoed or flagged executable proposal with verified bytes | `integrity_ready`; lifecycle/moderation remains blocked | none | execution unavailable from lifecycle facts |
| Executed or expired executable proposal with verified bytes | `integrity_ready`; terminal lifecycle fact remains separate | none | execution unavailable from lifecycle facts |
| Disconnected wallet, wrong network/account permission, operator-only guard, execution delay, or simulation idle/pending/failed | readiness unchanged | none | account/action state only |

Derive readiness from proposal type and exact script bytes/hash only. Do not use
analysis, wallet state, account capabilities, guard mode, lifecycle timing, or
simulation. When bytes exist, `hashVerified` must equal their actual hash
comparison; it is nullable only when exact bytes are absent.

Proposal `#19` must present, in this order:

```text
Execution blocked · Approved · Executable
```

Use a high-contrast error treatment appropriate to a hard integrity failure on
both the board row and detail header. Show a concise visible reason equivalent
to `Stored script hash does not match the proposed event script.` Preserve the
detailed trust/integrity explanation lower on detail. Suppress or replace
misleading board copy such as `Executable actions` when the hard blocker is
present. Normal executable, signal, scheduled, guarded, vetoed, flagged,
expired, executed, and account-incapable proposals retain their accepted
semantics.

### 3. Link the resolved application label to its landing page

Render the current resolved application label in the shared header as a native
link to the application's default landing page. Prefer the existing resolved
`primaryNav.path` when it safely describes that path.

- `DAO Governance` links to `/` on `dao-beta.dao-ops.com`.
- `DAO Governance` links to `/dao` on shared path-scoped hosts.
- Existing host-aware roots for stYFI, veYFI, yETH, Team Finances, and YBC
  remain correct.

Do not change application names, the Yearn mark, header layout, mobile menu,
focus order, or existing navigation menus. Preserve a visible keyboard focus
treatment and at least a 40 by 40 pixel interactive target, with 44 pixels used
where practical. Cover shared and beta hosts, desktop and mobile, keyboard, and
non-DAO regressions.

### 4. Make proposal-creation outcomes use the typed review setting

The shared DAO review `Transaction result` controls the next DAO transaction,
including proposal creation. Thread one `DaoMockTransactionOutcome` through an
explicit typed authoring/mock-client boundary. Do not read UI-global state from
a low-level service. Retire forum-topic IDs as the primary hidden selector for
transaction rejection, revert, or network error. Topic fixtures may remain
only for explicit forum validation, publication failure, or malformed-receipt
roles, with typed names and tests.

Support the existing outcomes:

- success;
- user rejected;
- revert;
- network error.

The exact rejected transition is:

```text
review complete
  -> immutable publication succeeds and remains available
  -> create transaction requested with outcome user-rejected
  -> route-local rejection message
  -> no submitted/success state, transaction hash, receipt, proposal identity,
     proposal record, proposal href, pending created record, indexing state, or
     canonical feed/event mutation
  -> review and publication stay complete
  -> Step 2 remains retryable
```

Revert and network error preserve the same canonical/created/indexing
invariants. They use their existing distinct route-local messages. A failed
submission produces a transaction hash only if the modeled wallet boundary for
that exact outcome truthfully returns one; the deterministic M2 outcomes should
not invent one. Reset restores success.

After changing the review result to Success, retry must reuse the existing
immutable publication, decode proposal identity from the receipt, and complete
without republishing.

### 5. Verify the created-proposal indexing transition

Keep the accepted WP7B state sequence:

1. transaction receipt pending;
2. proposal identity decoded;
3. awaiting indexing;
4. indexed or indexing delayed.

Do not add a fake percentage. A normal successful mock creation must reach
Indexed within the documented deterministic delay. If it remains at
`Awaiting proposal indexing and analysis`, diagnose and correct the transition
rather than hiding it with animation. Preserve an explicit delayed/failure
state and a visible `Retry indexing` path. Apply modeled registration latency
before mutating persisted/runtime created-proposal state. Retry must be
idempotent: it reuses or re-registers the same receipt-derived record as needed,
then indexes that exact reference. A subtle indeterminate indicator is optional
only when it does not flash during the normal short delay.

Regression coverage proves that success reaches Indexed, the receipt-derived
identity stays byte-for-byte stable, Open proposal and Copy proposal link work,
and rejected/reverted/network-error submissions never enter receipt, identity,
created-record, or indexing states. Continue documenting the browser-session
persistence limit.

### 6. Documentation and evidence

Update canonical behavior with the implementation:

- `docs/apps/dao/README.md`
- `docs/apps/dao/functional-requirements.md`
- `docs/apps/dao/user-stories.md`
- `docs/apps/dao/ui-spec.md`
- `docs/apps/dao/mock-data.md`
- `docs/apps/dao/delivery/README.md`
- `docs/apps/dao/delivery/dao-beta-runbook.md`
- shared runtime, security, preproduction, and testing guidance affected by the
  new mandatory Access policy
- this package and `docs/apps/dao/delivery/evidence/M2-WP7C/README.md`
- `docs/apps/dao/delivery/status.md` only in the separate post-merge ledger
  commit
- M5 WP13 handoff for real forum autocomplete

Remove or correct prior text that treats Cloudflare Access as optional for the
six listed beta hosts. Keep authentication distinct from `noindex` and
noncanonical metadata.

Evidence records the exact base, package tip, reviewed range, merge, ledger,
commits by concern, readiness matrix, failed-authoring transitions, indexing
timing and identity, all six hostnames, sanitized Access application/policy
structure, authenticated and unauthenticated checks, rollback, viewport and
theme metadata, test results, external changes actually made, and operator or
user actions still outstanding.

Capture sanitized production-compiled/local and remote evidence as applicable
at 390 by 844, 768 by 1024, 1280 by 900, and 1280 by 600; light and dark;
keyboard; 200% root text; reduced motion; and coarse pointer where interaction
changes. Do not include identities, emails, cookies, tokens, OAuth secrets, or
private policy data.

## Explicitly deferred

- Forum autocomplete remains M5 WP13 work. Keep the current forum URL plus
  explicit validation. The real package must use the configured forum
  API/category, an accessible combobox, pagination, debounce/cache/rate
  limiting, exact selection validation, and paste-URL fallback. Do not add a
  mock-only autocomplete.
- Keep the numbered authoring sections and explicit two-action submission
  flow. A persistent or clickable full-process navigator remains optional
  future UX; do not add a fake completion percentage.

## Non-goals and hard stops

- No Worker deployment, DNS/custom-domain mutation, GitHub environment change,
  production host exposure, push, tag, M2 acceptance, M3, backend feed, forum
  integration, IPFS publication, onchain read/write, fork work, or M7.
- No broad `*.dao-ops.com` Access wildcard, protection of `app.dao-ops.com`,
  unrelated hosts, public bypass, or weakening of CSP, robots/noindex,
  canonical policy, feature gates, production fail-closed behavior, or wallet
  security.
- No global E2E, mock, review, or debug leakage into preproduction.
- No collapse of lifecycle, vote result, moderation, type, execution readiness,
  or account capability into one enum.

## Acceptance criteria

- All six exact beta hosts are protected on every path by the intended GitHub
  organization/team Access rule, or the external gate is explicitly blocked
  with exact operator steps and no completion claim.
- Proposal `#19` shows the typed hard-integrity blocker first on board and
  detail while preserving `Approved` and `Executable`.
- Every readiness-matrix row has domain tests and normal/account-specific states
  receive no false hard-block badge.
- The resolved application label is a host-aware native home link with visible
  focus, adequate target size, and desktop/mobile/non-DAO coverage.
- The review transaction outcome truthfully controls proposal creation; all
  failed outcomes leave publication intact and every proposal/receipt/index
  identity and canonical-state seam untouched.
- A success retry reuses publication and reaches Indexed with a stable
  receipt-derived proposal identity and working Open/Copy actions.
- Canonical docs, evidence, focused regressions, full repository gates, and
  production flag/security proofs are consistent at one clean final tip.
- Cloudflare/security/runtime, DAO contract/domain-state, and
  frontend/accessibility reviewers approve the complete frozen-base-to-final
  range before integration.

## Validation

Run focused unit, component, integration, and browser checks for:

- execution-readiness derivation and the complete matrix;
- proposal `#19` board/detail hierarchy and a normal executable proposal;
- host-aware header links on shared and beta hosts, desktop/mobile, keyboard,
  and non-DAO routes;
- success, user rejection, revert, and network-error proposal creation;
- rejection followed by Success retry without republishing;
- absence of transaction hash, receipt, identity, record, event, link, pending
  state, and indexing after failure;
- successful deterministic indexing, identity stability, Open, and Copy;
- production DAO flag-on and flag-off, beta noindex/noncanonical behavior, and
  absence of global mock/E2E/debug leakage;
- exact-host Access enforcement on all six beta hosts.

Run every repository gate on the final package tip and again after integration:

```fish
npm run validate:deps
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run test:e2e:full -- --workers=1
npm run build
```

Classify any deterministic failure against the exact base when needed. Do not
weaken assertions or dismiss a reproducible failure as a flake.

## Review and integration

Run read-only pre-implementation audits for Cloudflare/security/runtime, DAO
contract/domain state, and frontend/accessibility. Add failing regressions
before substantive code fixes. Keep focused Conventional Commits.

After implementation, each required reviewer verifies the exact clean final
tip and complete
`18019c38e27c84c9a9900a390c5b03ff4ddf8103..FINAL_TIP` range. Accepted blockers
go to one fixer as the sole editing owner. Every blocker fix requires a fresh
review of the complete base-to-new-tip range. A test specialist joins when the
browser matrix is not fully covered by those reviews.

A separate integrator may merge only the exact approved clean tip into
`agent/integration` with `--no-ff`. Run the full post-merge gate, then record
the merge and results in a separate status-ledger commit. Do not tag, push,
deploy, or mark M2 accepted.

## Stop condition

Present the integrated candidate for explicit user acceptance with package and
integration identities, reviewer verdicts, test/build results, exact six-host
Access results, organization/team allow and unrelated-account denial evidence,
rollback steps, integrated SHA for GitHub UI deployment, post-deploy UAT,
deferred forum and navigator work, and remaining risks. Do not claim that the
application update was deployed.
