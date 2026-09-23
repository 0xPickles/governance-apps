# Prepared Pinata session — 2026-09-17

> Historical preparation record, superseded on 2026-09-23. The live run was interrupted and remains incomplete.
> The temporary session files, original D1, request ledger, and scenario metadata are missing.
> Exact A/B/C bytes were recovered, but acknowledgements and counters were not recovered.
> **Do not execute this old startup procedure.** Use the [recovery and separate follow-up checklist](pinata-recovery.md).
> The statements below describe preparation on 17 September, not current service or publication state.

This is the operator checklist for the authorized [bounded acceptance](pinata-acceptance.md).
The clean starting commit was `ffb2ba336fe04652aa710f35bb0887e6310694a4` on `codex/dao/m5/pinata`.
Implementation approval and validation closure remain accepted. Live acceptance is still pending.

The session directory is `/private/tmp/dao-pinata-acceptance-20260917`.
Its `session.fish` contains only public local configuration. Its `evidence` directory contains sanitized results.
The disposable fork already runs on port 18545 with a local block every 12 seconds.
The prepared D1 contains no admitted documents. The saved feed contains no proposals.
No remote D1 ID is necessary for this session.
The [sanitized preparation record](evidence/pinata-preparation-20260917.json) preserves the earlier timeout and successful preflight.
The accepted 1,397-test validation remains unchanged. Live acceptance has not started.

The app uses this database:

```text
/private/tmp/dao-pinata-acceptance-20260917/d1/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite
```

The running app's `workerd` opened this file during a read-only missing-content request.
The request returned the expected HTTP 503 and made no provider request.
Wrangler's `getPlatformProxy` uses `persist.path` directly. Its CLI persistence command adds `v3` instead.
Keep the other `d1/v3/d1` database intact. Do not use it for inspection or backup.

Preparation stopped the app launcher and its services. Ports 3310 and 18546 are available for private startup.
Anvil PID **49883**, owned by `hydra`, remains under fork launcher PID **49858**.
Both belong to this worktree. The launcher writes `evidence/fork-launch.log` and manages Anvil shutdown.
The corrected `fork-launcher.pid` records that launcher. Recheck ownership before any later shutdown.
Do not restart the fork or run `setup` or `reset`. Its scenario and snapshot state must survive this acceptance.

Use three private fish terminals: **App**, **Checks**, and **Browser**.
Keep App and Browser running except for the specified App restart.
The fork runs separately from preparation and must remain alive through proposal verification.
The browser helper opens an isolated Chromium session with a local throwaway wallet.
It uses the actual app and routes. It does not click, publish, sign, reset, or create proposals automatically.

1. **All terminals — load the prepared configuration.**

   ```fish
   source /private/tmp/dao-pinata-acceptance-20260917/session.fish
   ```

   This command selects the worktree, corrected database, local ports, and public gateway in each terminal.
   The gateway is `https://tomato-raw-duck-661.mypinata.cloud/ipfs/`, supplied by the operator.
   Preparation made no request to this gateway. Public retrieval remains part of the bounded live checks.

   **Checks — verify the fork and refresh the empty fixture before App startup.**

   ```fish
   lsof -nP -iTCP:18545 -iTCP:18546 -iTCP:3310 -sTCP:LISTEN
   node scripts/dao-fork.mjs status
   and node scripts/dao-fork.mjs fixture > "$DAO_ACCEPTANCE_DIR/evidence/operator-empty-feed-"(date -u +%Y%m%dT%H%M%SZ)".json"
   and node --input-type=module -e '
   import assert from "node:assert/strict";
   import {readFile} from "node:fs/promises";
   const f=JSON.parse(await readFile(process.env.DAO_FORK_DIR+"/feed.json"));
   const age=Math.floor(Date.now()/1000)-f.observedAt;
   assert.equal(f.proposals.length,0);
   assert.equal(f.deployments[0].proposalCount,"0");
   assert.ok(age>=-60 && age<=300,"Fork feed is not fresh; stop before publication.");
   console.log(JSON.stringify({empty:true,ageSeconds:age,block:f.block.number}));
   '
   test -f "$DAO_ACCEPTANCE_DB"; and not test -e "$DAO_ACCEPTANCE_DB-wal"
   and sqlite3 -readonly -json "file:$DAO_ACCEPTANCE_DB?immutable=1" 'PRAGMA quick_check; SELECT count(*) AS documents FROM dao_publications; SELECT * FROM dao_publication_policy'
   ```

   Expect only Anvil on port 18545, chain ID 1, and the saved account and deployment from step 3.
   Expect an empty, fresh feed and zero D1 documents. The policy table is initially empty until first admission.
   Expect `quick_check` to return `ok`.
   This initial SQLite command requires the app stopped and no WAL file. Do not use `immutable=1` while the app runs.
   If a check fails or another process owns a port, stop and preserve the session. Do not kill an unidentified process.
   The fixture command reads the current fork block and contracts; it does not create transactions or alter timestamps.
   The preparation feed was stale and was refreshed once. Repeat this block immediately before private startup.

   Privately create K1 with Admin disabled and only legacy `pinning.pinFileToIPFS` permission.
   Prepare separate cleanup authority with only legacy `pinning.unpin`.
   Keep both outside command arguments, files, screenshots, chat, and shell history.
   These permissions follow the [Pinata permission schema](https://docs.pinata.cloud/api-reference/endpoint/ipfs/generate-pinata-api-key).
   If private preparation takes more than five minutes, repeat only the fixture command and its following freshness check before Browser startup.

2. **App — start with K1.**

   ```fish
   node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-pinata-acceptance.mjs launch /private/tmp/dao-pinata-acceptance-20260917
   ```

   Answer `yes`, then enter K1 at the hidden prompt. Leave this process running.
   Expect Next.js on `http://127.0.0.1:3310` and “Local DAO services ready.”
   If startup fails, stop here. Preserve the session and fix startup before publication.

   **Checks — warm the route with a bounded readiness check before opening Browser.**

   ```fish
   curl --max-time 60 -fsS http://127.0.0.1:3310/dao/propose -o /dev/null
   and curl --max-time 15 -fsS http://127.0.0.1:3310/api/dao-data -o "$DAO_ACCEPTANCE_DIR/evidence/operator-app-feed.json"
   ```

   Expect successful exits. If compilation times out, preserve the failure and inspect App privately before repeating this local GET.
   Readiness checks do not publish content or spend provider allowances.

3. **Browser — open the manual session.**

   ```fish
   node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-pinata-browser.mjs /private/tmp/dao-pinata-acceptance-20260917
   ```

   The three URLs are `http://127.0.0.1:3310/dao/propose#A`, `#C`, and `#B`.
   Identify tabs by their URL fragment. Select A first.
   Click **Connect wallet → Browser Wallet → Start proposal**.
   The account must be `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`, chain ID 1, RPC `http://127.0.0.1:18545`.
   No seed, private key, wallet extension, or real funds are needed.
   Wallet actions execute immediately on Anvil when you click the app's transaction button.
   If eligibility is unavailable or another wallet appears, stop before publication.
   If browser startup fails, the helper closes its Chromium process and reports the error.
   If a download reports an error, stop before publication. Changed downloads never replace the original bytes.

4. **Browser — prepare and publish A, then C.**

   In each tab, use **Connect wallet → Browser Wallet → Start proposal** if the editor is not open.
   For each tab, enter `https://gov.yearn.fi/t/local-fork-uat/1234` in **Forum discussion**.
   Click **Validate topic**. Expect **Forum topic accepted**. This response is a local fixture.
   Use the supplied Markdown template. Replace its title with `Pinata acceptance A` or `Pinata acceptance C`.
   Replace its summary and specification with short disposable text that identifies the same letter.
   Select **Signal**. Use **Preview** and inspect the title, summary, and specification.
   Click **Review proposal**, inspect the exact content, and select **I reviewed…**.
   Click **Download exact content** before publication.
   The Browser terminal must report `documents/A.json` or `documents/C.json`.
   Click **Publish immutable content** exactly once. Expect **Immutable content published**.
   Do not create either proposal yet. Keep both tabs open.

   **Checks — after each respective publication, run its one retained-byte check.**

   ```fish
   node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-pinata-acceptance.mjs verify-app /private/tmp/dao-pinata-acceptance-20260917 /private/tmp/dao-pinata-acceptance-20260917/documents/A.json
   node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-pinata-acceptance.mjs verify-app /private/tmp/dao-pinata-acceptance-20260917 /private/tmp/dao-pinata-acceptance-20260917/documents/C.json
   sqlite3 -readonly -json "$DAO_ACCEPTANCE_DB" 'SELECT digest,cid,byte_length,published_at,upload_accepted,upload_attempts,retrieval_attempts,reservations,retry_after FROM dao_publications ORDER BY admitted_at,digest' > /private/tmp/dao-pinata-acceptance-20260917/evidence/after-A-C.json
   ```

   Expect HTTP 200 and `passed:true` for each helper check.
   Expect two D1 rows, each with `upload_accepted=1`, non-null `published_at`, and one upload attempt.
   Match each displayed fingerprint with its D1 digest. The helper derives the CID from the exact downloaded bytes.
   If any result differs, retain it and stop. Do not republish automatically.

5. **Checks — prove deletion scope on C.**

   ```fish
   node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-pinata-acceptance.mjs scope-delete /private/tmp/dao-pinata-acceptance-20260917 /private/tmp/dao-pinata-acceptance-20260917/documents/C.json
   and node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-pinata-acceptance.mjs control-delete /private/tmp/dao-pinata-acceptance-20260917 /private/tmp/dao-pinata-acceptance-20260917/documents/C.json
   ```

   Enter K1 at the first hidden prompt. Require HTTP **403**.
   Enter cleanup authority at the second hidden prompt. Require HTTP **200** for the same CID.
   If either result differs, stop and record scope as failed or inconclusive. A timeout does not prove scope enforcement.
   C remains counted in D1 after deletion.

6. **Private Pinata page, then Browser B — revoke K1 and attempt B once.**

   Revoke K1 privately. Keep App running with K1.
   Record the action and UTC time without key material in `evidence/operator-notes.txt`.
   Prepare B using step 4, with title `Pinata acceptance B` and distinct disposable text.
   Download B, then click **Publish immutable content** once.
   Expect **Proposal content was not published** and no available **Create onchain proposal** action.
   Keep B's review and bytes unchanged. Do not reload B or return to its editor.

   **Checks:**

   ```fish
   sqlite3 -readonly -json "$DAO_ACCEPTANCE_DB" 'SELECT digest,cid,byte_length,published_at,upload_accepted,upload_attempts,retrieval_attempts,reservations,retry_after FROM dao_publications ORDER BY admitted_at,digest' > /private/tmp/dao-pinata-acceptance-20260917/evidence/after-revoked-K1.json
   node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-pinata-acceptance.mjs retrieve /private/tmp/dao-pinata-acceptance-20260917 /private/tmp/dao-pinata-acceptance-20260917/documents/A.json
   ```

   Require B's `upload_accepted=0`, `published_at=null`, and `upload_attempts=1`.
   Require A's public retrieval to return HTTP 200, exact bytes, and `passed:true`.
   If B publishes or A fails retrieval, preserve that failure and stop.

7. **App — replace K1 with K2 without changing D1.**

   Stop only App with Ctrl-C. Keep Browser and the fork running.
   Privately create K2 with the same upload-only scope.
   Run the exact launch command from step 2, with the same directory. Enter K2 at its hidden prompt.
   After B's recorded `retry_after` time and at least 60 seconds after its failure, click **Retry content publication** once.
   Do not edit, re-review, or recreate B. Expect **Immutable content published**.

   **Checks:**

   ```fish
   node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-pinata-acceptance.mjs verify-app /private/tmp/dao-pinata-acceptance-20260917 /private/tmp/dao-pinata-acceptance-20260917/documents/B.json
   sqlite3 -readonly -json "$DAO_ACCEPTANCE_DB" 'SELECT digest,cid,byte_length,published_at,upload_accepted,upload_attempts,retrieval_attempts,reservations,retry_after FROM dao_publications ORDER BY admitted_at,digest' > /private/tmp/dao-pinata-acceptance-20260917/evidence/after-K2.json
   ```

   Require B's original digest/CID, `upload_accepted=1`, non-null `published_at`, and exactly **two** upload attempts.
   Require three total documents and exactly four total upload attempts.
   If B fails, stop. No fifth upload is available.

8. **Checks, then Browser A — refresh the empty feed and create the one proposal.**

   Before creation, run only the `node scripts/dao-fork.mjs fixture` command and its following freshness check from step 1.
   This refresh is necessary if private key preparation or A/C/B checks take more than five minutes.
   Keep the reviewed browser tabs open. Eligibility refreshes from the live fork; do not reload an unpublished review.
   After proposal creation, do not run `fixture` again. Preserve the empty feed until the producer checkpoint.

   Return to A's published review. Click **Create onchain proposal** once.
   Expect receipt confirmation and **Proposal confirmed — awaiting indexing**, with the transaction hash and proposal identity.
   Copy the transaction hash. Do not follow a public explorer link for this local transaction.

   **Checks — record that exact transaction.**

   ```fish
   read --prompt-str 'Local A transaction hash: ' DAO_A_TX
   node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-fork.mjs record "$DAO_A_TX" /private/tmp/dao-pinata-acceptance-20260917/documents/A.json > /private/tmp/dao-pinata-acceptance-20260917/evidence/A-receipt-record.json
   and cp /private/tmp/dao-pinata-acceptance-20260917/fork/state.json /private/tmp/dao-pinata-acceptance-20260917/evidence/fork-after-A.json
   ```

   Require successful exit. `record` verifies the canonical successful receipt, stored digest, script hash, and event identity.
   The fresh deployment expects proposal ID 0. Record the actual identity; stop on any disagreement.
   Keep `fork/feed.json` unchanged. Reload A, reopen **Draft proposal** or **Start proposal**, then **Open proposal**.
   Expect pending indexing with the same identity and no second creation action.
   Record this observation in `evidence/operator-notes.txt`.

9. **Checks — reserve and run exactly one released-producer acquisition.**

   ```fish
   node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-fork.mjs mine > /private/tmp/dao-pinata-acceptance-20260917/evidence/producer-confirmation.json
   and node -e 'require("node:fs").writeFileSync("/private/tmp/dao-pinata-acceptance-20260917/evidence/producer-reservation.json", JSON.stringify({requests:1,outcome:"reserved",at:new Date().toISOString()})+"\n", {flag:"wx",mode:0o600})'
   and env DAO_RPC_TRANSPORT=http DAO_RPC_URL=http://127.0.0.1:18545 DAO_CONTENT_GATEWAY="$DAO_IPFS_GATEWAY_URL" /Users/hydra/Developer/dao-operations/gov-apps-stats.agent.integration/target/release/gov-apps-dao local /private/tmp/dao-pinata-acceptance-20260917/producer-config.json /private/tmp/dao-pinata-acceptance-20260917/producer-state /private/tmp/dao-pinata-acceptance-20260917/producer-feed.json > /private/tmp/dao-pinata-acceptance-20260917/evidence/producer.log 2>&1
   printf 'Producer exit: %s\n' $status >> /private/tmp/dao-pinata-acceptance-20260917/evidence/operator-notes.txt
   ```

   Run this block once. An existing reservation blocks another cycle, including after an uncertain interruption.
   The unchanged binary SHA-256 is `61c51b8528cb249b8290b0bc1fe9acc9f9514be7a5991d8af22fd61fedc8ff5c`.
   Its temporary configuration has `contentRequests=1` and `retries=0`.
   Require exit 0 and one proposal with non-null `contentBytes`. Otherwise stop and preserve the reservation.

10. **Checks, then Browser — compare exact bytes and show the producer output.**

    ```fish
    node --input-type=module -e '
    import assert from "node:assert/strict";
    import { readFile, writeFile } from "node:fs/promises";
    import { readAcceptanceDocument } from "./scripts/dao-pinata-acceptance.mjs";
    const d="/private/tmp/dao-pinata-acceptance-20260917";
    const a=await readAcceptanceDocument(d+"/documents/A.json");
    const feed=JSON.parse(await readFile(d+"/producer-feed.json"));
    assert.equal(feed.proposals.length,1);
    const p=feed.proposals[0];
    assert.equal(p.id,"0");
    assert.equal(p.votingAddress,"0x543e8871562a8c53e8b6a26835aeecb3a5a13070");
    assert.equal(p.contentDigest,a.digest);
    assert.ok(Buffer.from(p.contentBytes,"base64").equals(a.bytes));
    await writeFile(d+"/evidence/producer-byte-comparison.json",JSON.stringify({passed:true,id:p.id,digest:a.digest,cid:a.cid,bytes:a.bytes.length})+"\n",{flag:"wx"});
    '
    and cp /private/tmp/dao-pinata-acceptance-20260917/producer-feed.json /private/tmp/dao-pinata-acceptance-20260917/fork/feed.json
    ```

    Refresh `http://127.0.0.1:3310/dao/proposals/0?chain=1&voting=0x543e8871562a8c53e8b6a26835aeecb3a5a13070`.
    Expect A's title, summary, specification, and the same proposal identity.
    If rendering differs, retain the feed and record the difference. Do not replace it with a fixture.
    Save the actual application feed response:

    ```fish
    curl --max-time 15 -fsS http://127.0.0.1:3310/api/dao-data -o /private/tmp/dao-pinata-acceptance-20260917/evidence/app-producer-feed.json
    ```

    Record the visible result in `evidence/operator-notes.txt`. Optional screenshots must show only the local app.
    This is released-producer evidence on local contract state. Forum validation and the initial feed remain fixture evidence.

11. **Checks and private Pinata page — clean up and preserve evidence.**

    ```fish
    node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-pinata-acceptance.mjs cleanup /private/tmp/dao-pinata-acceptance-20260917 /private/tmp/dao-pinata-acceptance-20260917/documents/A.json
    node /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata/scripts/dao-pinata-acceptance.mjs cleanup /private/tmp/dao-pinata-acceptance-20260917 /private/tmp/dao-pinata-acceptance-20260917/documents/B.json
    ```

    Enter cleanup authority through each hidden prompt. Require HTTP 200 for A and B. C already required HTTP 200.
    Privately revoke K2 and any disposable cleanup key. Record all three key revocations and their times without identifiers or credentials.
    Stop App with Ctrl-C. Stop Browser with Ctrl-C after saving observations.
    Verify that ports 3310 and 18546 are free and no process holds the database:

    ```fish
    lsof -nP -iTCP:3310 -iTCP:18546 -sTCP:LISTEN
    lsof "$DAO_ACCEPTANCE_DB"
    test -f "$DAO_ACCEPTANCE_DB"; and not test -e "$DAO_ACCEPTANCE_DB-wal"
    ```

    Require no listeners, no database handles, and a successful final command.
    If a WAL file remains, preserve it and stop before this backup. Do not delete it or use `immutable=1`.
    After these checks, run:

    ```fish
    set -l stopped_db "file:$DAO_ACCEPTANCE_DB?immutable=1"
    sqlite3 -readonly -json "$stopped_db" 'SELECT digest,cid,byte_length,admitted_at,published_at,upload_accepted,upload_attempts,retrieval_attempts,reservations,lease_until,retry_after FROM dao_publications ORDER BY admitted_at,digest' > /private/tmp/dao-pinata-acceptance-20260917/evidence/final-publications.json
    sqlite3 -readonly -json "$stopped_db" 'SELECT * FROM dao_publication_policy' > /private/tmp/dao-pinata-acceptance-20260917/evidence/final-policy.json
    sqlite3 -readonly -json "$stopped_db" 'SELECT count(*) AS documents,sum(byte_length) AS canonical_bytes,sum(upload_attempts) AS upload_attempts,sum(byte_length*upload_attempts) AS attempted_upload_bytes,sum(retrieval_attempts) AS gateway_attempts FROM dao_publications' > /private/tmp/dao-pinata-acceptance-20260917/evidence/final-totals.json
    sqlite3 -readonly "$stopped_db" .dump > /private/tmp/dao-pinata-acceptance-20260917/evidence/local-d1.sql
    cp /private/tmp/dao-pinata-acceptance-20260917/acceptance-ledger.json /private/tmp/dao-pinata-acceptance-20260917/evidence/acceptance-ledger.json
    ps -p 49858,49883 -o pid=,ppid=,user=,lstart=,comm=
    lsof -R -a -p 49858,49883 -d cwd,1,2
    ```

    Require the same worktree, owner `hydra`, launcher PID 49858, and Anvil PID 49883 with parent 49858.
    Their original start time is 2026-09-17 11:24:15 Europe/Madrid. Do not inspect process arguments or environments.
    If ownership differs, preserve the processes and report the mismatch. If ownership matches, stop the fork launcher:

    ```fish
    kill -TERM 49858
    lsof -nP -iTCP:3310 -iTCP:18545 -iTCP:18546 -sTCP:LISTEN
    ```

    Expect no listeners after shutdown. Preserve the entire session directory, including D1, documents, producer state, and ledgers.
    Shutdown can take a few seconds. Repeat only the listener check if a verified process still exits.
    The SQLite dump targets the verified application database and preserves counters.
    On this host, SQLite 3.43.2 failed to open the stopped WAL-mode database with ordinary `-readonly`.
    The stopped-file URI above passed the integrity check. It is only valid after the shutdown and WAL checks.
    Keep this SQLite backup approach. Do not substitute a Wrangler command against the other persistence path.

12. **Return only sanitized results; preserve interruptions.**

    Return the `evidence` directory and A/C/B documents, or tell Codex to inspect those exact paths.
    Include UI observations, cleanup outcomes, and key-revocation confirmations in `operator-notes.txt`.
    Do not include private terminal output, shell history, environment dumps, account pages, JWTs, or wallet key files.
    Codex will reconcile identities, counters, bytes, receipt events, producer output, and the actual app response before committing evidence.

    If interrupted, stop publication and preserve every file. Never rerun setup, reset the fork, rename the session, or reset a counter.
    Keep Browser open across the K1/K2 restart. Losing B's failed review can prevent an unchanged UI retry.
    If a helper leaves `acceptance.lock`, first verify that no helper request remains active in your private terminals.
    Only then remove that lock with `rm /private/tmp/dao-pinata-acceptance-20260917/acceptance.lock`.
    Its reserved request remains counted. Never remove the producer reservation to rerun acquisition.
    If a timeout spends the remaining allowance, record incomplete acceptance and stop acceptance requests.
    Use remaining helper slots for necessary cleanup. Record cleanup failures or unresolved pins explicitly.
    Do not increase the eight-helper-request allowance to clean up or obtain a passing result.

The maximum remains three documents, four uploads, 393,216 canonical bytes, and 524,288 attempted upload bytes.
Conservative provider accounting is app upload attempts + app gateway attempts + helper reservations + one producer reservation, at most 25.
The planned helper sequence uses all eight slots: A verify, C verify, scope delete, control delete, A retrieve, B verify, A cleanup, B cleanup.
No additional public gateway check, automatic lifecycle scenario, or producer cycle is part of this session.
Remote D1 IDs, production configuration, private Worker secrets, and rollout authorization remain later deployment inputs.
