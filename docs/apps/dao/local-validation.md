# Built DAO validation

This is the current local walkthrough entry point on `agent/integration`.
The approved publication acceptance remains complete. This session does not repeat that experiment.
The [September 26 completion record](delivery/integration-20260926.md) identifies the tested source, durable populated session, and retained evidence.
The manual walkthrough completed on September 30. The [UAT closeout](delivery/uat-closeout-20260930.md) records its evidence and subsequent product corrections.
The retained session uses `ad2c18a47c9366f50037e9daa79b08641d09affa`. Preserve it as completed evidence. This closeout does not require another walkthrough or rebuild.

The launcher builds optimized Next.js output with `NODE_ENV=production` and explicit `NEXT_PUBLIC_RUNTIME_MODE=development`.
It uses real DAO clients, the shared transaction pipeline, and production freshness, canonicality, and simulation checks.
It does not represent a production Worker deployment.

## Prerequisites and source

Use Node 24, the locked npm dependencies, Anvil, Docker, uvx, and the installed Playwright Chromium browser.
The Docker CLI can use Colima without Docker Desktop. Inspect the existing Colima profile, Docker context, and container ownership label before use.
`colima-m1-wp2` is this retained session's context, not a universal default. Its container is `dao-validation-857869440066`, labeled with the session directory.
Do not start an unrelated profile or reset storage based on sandbox-restricted status output.
The producer remains the released `gov-apps-dao` binary. Each acquisition requires this SHA-256:

```text
61c51b8528cb249b8290b0bc1fe9acc9f9514be7a5991d8af22fd61fedc8ff5c
```

The session also requires a local libfaketime dylib for the producer process clock.
The preparation used upstream tag `v0.9.13`, commit `86b37fde2fed7336ea2d0c17928e3015a55d9b4a`.
No system clock or producer source changes are required.
See the upstream [macOS instructions](https://github.com/wolfcw/libfaketime/blob/v0.9.13/README.OSX).

To reproduce this dependency in a new directory:

```fish
set clock_source /Users/hydra/Developer/yearn/dao-local-validation/libfaketime-v0.9.13
git clone --branch v0.9.13 --depth 1 https://github.com/wolfcw/libfaketime.git "$clock_source"
test (git -C "$clock_source" rev-parse HEAD) = 86b37fde2fed7336ea2d0c17928e3015a55d9b4a; or exit 1
make -C "$clock_source/src" -f Makefile.OSX
set clock_library "$clock_source/src/libfaketime.1.dylib"
```

This launcher targets the current macOS workstation. It does not install a system library.

The session stores its source SHA, dependency lock hash, clock-library hash, producer hash, upstream block, and fork checkpoint.
It exports tracked source into its directory and shares the installed `node_modules` directory.
Do not change dependencies during a session. Use a new session after a dependency installation.
After committing source changes, `npm run dao:validate -- rebuild "$session"` retains the old source and builds a new export.
Rebuild stops owned services first, preserves fork and D1 state, then resumes with the new source revision.
Initialization requires a clean committed candidate and refuses existing directories.
It never copies `.env` files, acceptance checkpoints, or private credentials.

## Start, use, resume, and stop

These fish commands document session operation. The completed session contains eight proposals in their final lifecycle states.
Keep the directory, recorded dependencies, and stopped Docker container as evidence. Resume only for separately requested work.
Do not initialize, reset, or rerun the proposal smoke in this populated session.

```fish
cd /Users/hydra/Developer/yearn/governance-apps.agent.integration
set session /Users/hydra/Developer/yearn/dao-local-validation/20260926/session

# Start or resume the retained populated session.
npm run dao:validate -- start "$session"
npm run dao:validate -- status "$session"
npm run dao:validate -- browser "$session"

# After relevant UI transactions or a phase change, acquire a real producer snapshot.
npm run dao:validate -- refresh "$session"

# Stop the owned browser, application, Anvil, and offline container. Retain all state.
npm run dao:validate -- stop "$session"
npm run dao:validate -- status "$session"
```

The session manifest selects the tested source export. Documentation-only delivery changes do not require rebuilding it.
Open the browser with the session command. Connect **Browser Wallet** in the app.
The session wallet exists only at `http://localhost:3310` and sends requests only to the selected loopback Anvil.
This canonical local origin matches Next's request normalization. The production publication origin guard remains unchanged.
Every transaction checks Anvil identity, chain ID, selected checkpoint, and the throwaway sender.
No real key import is required. Local transactions execute immediately.

One owner controls the background processes. PID records include process start identity.
Startup refuses occupied ports. It does not terminate unrelated listeners.
Logs, downloads, D1 accounting, browser storage, producer state, snapshots, and Anvil state remain inside the session directory.
The container stores the offline content blocks. Its ownership label must match the session directory.

For a separate experiment, choose a new durable directory outside Git and initialize it once:

```fish
set new_session /Users/hydra/Developer/yearn/dao-local-validation/another-session
set clock_library /Users/hydra/Developer/yearn/dao-local-validation/20260926/dependencies/libfaketime-v0.9.13/src/libfaketime.1.dylib
env DAO_FORK_SOURCE_RPC=https://ethereum.reth.rs/rpc \
  DAO_VALIDATION_CLOCK_LIBRARY="$clock_library" \
  npm run dao:validate -- init "$new_session"
```

Stop the existing session before starting another. These sessions use the same fixed ports.
Relocation is unsupported. Manifest paths, build fingerprints, producer state paths, and container labels refer to the original directory.
Preserve an old session as an archive and initialize a separate session at its intended durable location.
The completion record identifies the retained September 24 session and its additional durable archive.

Startup bounds are 60 seconds for Anvil and Kubo, ten minutes for the first build, and 90 seconds for app readiness.
An acquisition has a 90-second producer budget and a 120-second process deadline.
A failed startup stops owned services. Inspect `logs/` before retrying.
Wait for the `Ready` message before opening the session browser.
Readiness includes a real producer acquisition and a successful built-app feed request.
The September 26 fresh-session smoke passed without another warm-up. One passing run does not establish repeated cold-start reliability.
Anvil saves state every 30 seconds and at clean shutdown, including historical states.
Startup mines two explicit monotonic blocks after the retained tip, parent, and producer observation times.
This handles Anvil's restored tip-clock behavior before a confirmed producer snapshot is acquired.
In-memory reset and replacement checkpoints can disappear after an Anvil restart.
If a checkpoint is lost, preserve this session and initialize a new directory. Do not restore unrelated acceptance state.

## Controls

```fish
# Select funded throwaway accounts 0, 1, or 2. Account 0 is the local operator/guardian.
npm run dao:validate -- control "$session" account 1
npm run dao:validate -- control "$session" rejectNext true
npm run dao:validate -- control "$session" rpcDelayMs 5000
npm run dao:validate -- control "$session" rpcOffline true
npm run dao:validate -- control "$session" rpcOffline false
npm run dao:validate -- control "$session" rpcDelayMs 0
npm run dao:validate -- control "$session" viewport '"mobile"'
npm run dao:validate -- control "$session" viewport '"desktop"'

# ID 0 is an example. Use the proposal ID confirmed by the UI.
npm run dao:validate -- scenario "$session" phase vote 0
npm run dao:validate -- refresh "$session"
npm run dao:validate -- scenario "$session" phase execute 0
npm run dao:validate -- refresh "$session"
npm run dao:validate -- scenario "$session" phase expire 0
npm run dao:validate -- refresh "$session"
npm run dao:validate -- scenario "$session" mine

# Explicit display-only fixtures. Reload after changing feed mode.
npm run dao:validate -- control "$session" feed '"empty-fixture"'
npm run dao:validate -- control "$session" feed '"content-fixture"'
npm run dao:validate -- control "$session" feed '"unavailable"'
npm run dao:validate -- control "$session" feed '"producer"'
npm run dao:validate -- control "$session" clock '"stale"'
npm run dao:validate -- control "$session" clock '"fork"'
```

The session browser applies controls once per second. A rejected request consumes the rejection control once.
Desktop mode follows the native window. Mobile mode uses a 390 × 844 viewport.
RPC delay affects browser requests, including identity reads. Producer acquisition remains an independent local operation.
The fixture controls intercept only browser feed responses. They never change the saved producer output.
Fixture results are display evidence, not producer or transaction evidence.

Opening a review dialog does not prepare a transaction. Confirmation starts preparation.
A canonical-replacement rejection test requires preparation first, replacement of the observed block second, and invocation of the old preparation afterward.
The existing [automated canonicality test](../../../tests/e2e/dao-live/canonicality.spec.ts) asserts this sequence and zero sends on rejection.
That test resets its disposable fork. Do not run it against the retained session.
Replacement before confirmation does not establish rejection of an old preparation. Mining with a dialog open checks UI continuity only.

The helper script and reverting variant are available from the session state:

```fish
node -e 'const f=require("fs"),p=process.argv[1],s=JSON.parse(f.readFileSync(p+"/fork/state.json"));f.writeFileSync(p+"/marker.hex",s.script+"\n");f.writeFileSync(p+"/reverting.hex",s.script.replace("2c16cd8a","ffffffff")+"\n")' "$session"
cat "$session/marker.hex"
cat "$session/reverting.hex"
```

Use the marker bytes in the UI's **Full Executor script** field.
The reverting variant targets an unavailable helper selector. Its execution simulation must fail.
The local forum substitute accepts `https://gov.yearn.fi/t/local-fork-uat/1234` without posting a topic.

## Scenario matrix

| Scenario | UI action and control | Evidence to retain |
|---|---|---|
| Signal creation | Account 0 or another eligible account; choose Signal; publish and create | Exact downloaded bytes, receipt identity, producer event and empty script |
| Executable creation | Paste `marker.hex`; publish and create | Exact script and hash, content digest, proposal ID |
| Yea / Nay | Move to `phase vote ID`; refresh; choose an unused account and vote | Canonical receipt and producer totals/events |
| Duplicate / unavailable | Revisit the voted account; select another account for role checks | Disabled action and explanation; no second transaction |
| Retraction | Author account, before vote weight; retract through the UI | Retract event and retained content |
| Flag | Account 0, before vote weight and within allowed epoch | Flag event, flagged and retracted state |
| Veto | Account 0 within the guardian window; also inspect an account without that role | Veto event and correct retraction semantics |
| Passing / executable | Cast Yea, move to execute phase, refresh | PASSED state and successful fresh simulation |
| Failing | Separate proposal with Nay or no successful vote; move to execute phase | FAILED state from the contract and producer |
| Expired | Separate passed executable; omit execution; move to expire phase | EXPIRED state from the contract |
| Marker execution | Execute the passed marker proposal through the UI | Execute event and helper marker `42` in scenario status log |
| Wallet rejection | Set `rejectNext true` immediately before confirmation | Preserved review and retry; no transaction hash |
| Failed simulation | Create the reverting executable, pass its vote, then enter execute phase | Disabled execution, simulation error, unchanged contract state |
| Reload / indexing lag | Create or vote, reload before `refresh`, then acquire | Saved receipt, one transaction, eventual indexed state |
| Ordinary advancement | Review an action, run `mine`, confirm | UI continuity and preparation on confirmation; not proof of revalidating an old preparation |
| Canonical replacement | Existing automated test on a disposable fork: prepare, replace observed block, invoke old preparation | Old preparation rejected with zero sends; no manual dialog-based rejection claim |
| Cold / slow RPC | Fresh browser profile/session, or delay/offline controls | Loading, retry, error, and no duplicate submission |
| Empty | Fresh initialized fork for producer evidence; `empty-fixture` for display inspection | Label the evidence source explicitly |
| Stale | `clock stale`, then return to `clock fork` | Freshness blocker without edited feed timestamps |
| Missing content | `content-fixture` | Onchain identity remains visible; no invented content |
| Desktop / mobile | Viewport control on authoring and proposal pages | Screenshots, keyboard focus, containment and action access |

Create separate proposals before time travel when scenarios need the same epoch.
The deployed proposer cooldown still applies. Use another funded account or another fresh session when blocked.
The phase control only moves forward. The reset control requires the current process's original prepared snapshot.
Close the browser before reset so its saved receipts cannot cross branches. Refresh afterward and open a new browser session.

## Clocks and producer evidence

Each refresh mines one confirmation block, then runs the hash-verified binary once in `local` mode.
The local configuration uses supported 10,000-block log queries to reduce cold acquisition overhead. Its 90-second budget stays unchanged.
It reads only loopback RPC and retrieves content from the offline loopback gateway.
It retains each output separately and reuses producer history while the previous snapshot remains canonical and the clock moves forward.
After a branch replacement or backward reset, it starts another state directory and preserves the previous one.
The producer clock starts at the fork time plus two seconds and advances normally. Its monotonic clock remains real.
After acquisition, the wrapper advances Anvil to the producer observation time with another ordinary block.
It rejects snapshots outside the application's 300-second freshness window and verifies the resulting clock alignment.
The wrapper verifies the output time and canonical block before replacing the served file atomically.
It never changes `observedAt`, block timestamps, or document bytes.
The browser clock follows the greater of the actual fork timestamp and producer observation time.
After phase changes, acquire again before reviewing the new state.
For stale-state inspection, the browser moves one hour forward while the feed stays unchanged.

`node scripts/dao-validation-smoke.mjs /absolute/session` creates one proposal through the built UI.
It checks its receipt, Propose event, identity, script, digest, exact content bytes, released producer output, and rendered proposal.
Run this only in a disposable session with an eligible author and sufficient retained publication allowance.
The prepared durable session already passed this check. Do not rerun it to resume the environment.
After a failure, inspect retained receipts, the publication ledger, and downloads before any retry.
Preserve attempt files before retrying; the smoke uses fixed output filenames.
The broader interactive walkthrough completed on September 30. Its evidence remains separate from this earlier smoke check.

## Substitutions and environment differences

| Local validation | Production Worker / mainnet preprod |
|---|---|
| Optimized Next build, explicit development runtime configuration, `next start` | OpenNext Worker build, production runtime configuration |
| Node preload supplies local Miniflare D1 context | Worker supplies the real D1 binding |
| Loopback Anvil, funded throwaway accounts | Mainnet RPC and real connected wallets |
| Impersonated management changes weight measure; guardian assigns account 0 as operator and guardian | Reviewed mainnet roles and authorization remain unchanged |
| Vyper helper supplies constant `10**24` voting weight and marker action | Actual protocol weights and executable targets |
| Offline Kubo with the existing Pinata-compatible publication substitute | Upload-only Pinata secret and reviewed public gateway |
| Local forum responses and 40-document hourly/daily walkthrough allowance | Actual forum validation and approved durable publication limits |
| Per-process producer clock and controlled browser clock | Real host/browser clocks |

These substitutes do not verify production authorization, hosted Worker origin behavior, edge execution, or real D1 provisioning.
The separate production route and Worker checks cover build boundaries. The [preprod checklist](preprod-validation.md) covers deployment preparation.
