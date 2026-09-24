# Unpublished review recovery and private follow-up

> Historical procedure/task. Publication acceptance completed on September 23 in a separate follow-up.
> Use [current acceptance](publication-acceptance-20260923.md), [operations](pinata-publication.md), and [local setup](local-development.md).
> Dates, pending statements, paths, and commands below describe the earlier session; they are not current release instructions.


The 17 September acceptance run is **interrupted and incomplete**. Do not resume its missing temporary directory.
The original D1, request ledger, scenario metadata, and producer configuration are unavailable.
The separate recovery packet preserves exact documents and historical observations, not publication authority.
Keep `/Users/hydra/Developer/yearn/dao-pinata-acceptance-20260917-recovery` intact.

This checklist is for operator execution **after review and authorization of the separate follow-up**.
Preparation performed no live publication, credential access, fork change, transaction, or cleanup.

## Retained evidence and bounds

Historical A and C publication/retrieval, B's rejected K1 upload, and A's upload-key DELETE 403 remain recorded observations.
C's DELETE 200 used cleanup authority. It does not demonstrate an upload-key scope failure.
The later C DELETE 400 has an unknown credential role. The helper last reported six requests; its ledger is missing.
No K2 success, local proposal, released-producer retrieval, or final cleanup is established.
See the packet's `README.md`, `B-retry-diagnosis.md`, and `evidence/document-recovery.json`.

The follow-up uses **only original B**, with fresh, separately labelled accounting.
It repeats one rejected upload because the original attempt counter cannot be recovered.
Then it permits one unchanged retry after key replacement, one local proposal, one producer cycle, and cleanup.
Do not repeat A/C publication or the accepted denied-delete test.

Application limits remain unchanged: three documents, four uploads, twelve retrievals, two concurrent jobs;
per document: two uploads, four retrievals, four reservations. The helper ceiling stays eight requests.
The narrower operator allowance is one document, **two uploads**, four application gateway attempts, one producer retrieval,
one `verify-app` request, and at most three cleanup attempts, one each for B/A/C.
This is at most eleven requests, counting the local verification conservatively, and 1,134 attempted upload bytes.
Unused old allowances do not transfer. Failed and uncertain attempts count. Stop at any allowance or unexpected result.

## 1. Verify the retained document

In a private **Checks** fish terminal, run this first:

```fish
shasum -a 256 /Users/hydra/Developer/yearn/dao-pinata-acceptance-20260917-recovery/documents/B.json
```

Expect `eddf3b10786df3496b3d36a2cc7cfc0df55af2676e4e47d885ea3065ba40903e`.
B has 567 bytes, snapshot `2026-09-18T16:53:51.000Z`, and CID
`bafkreihn345ra6dn6newwpjwulghz7an6vnpez3ojzd5rbpkgbs3uqeqhy`.
Its author is `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, forum topic is
`https://gov.yearn.fi/t/local-fork-uat/1234`, and Signal script is `0x`.
Do not reconstruct its Markdown or change its timestamp.

## 2. Prepare a separate durable follow-up

Use these public assignments in **Checks**, **Fork**, **App**, and a new **Follow-up Browser** fish terminal:

```fish
cd /Users/hydra/Developer/yearn/governance-apps.dao.m5.pinata
set -gx DAO_RECOVERY_PACKET /Users/hydra/Developer/yearn/dao-pinata-acceptance-20260917-recovery
set -gx DAO_ACCEPTANCE_DIR /Users/hydra/Developer/yearn/dao-pinata-followup-20260923
set -gx DAO_FORK_DIR "$DAO_ACCEPTANCE_DIR/fork"
set -gx DAO_FORK_RPC http://127.0.0.1:18547
set -gx DAO_LOCAL_SERVICES_PORT 18546
set -gx E2E_PORT 3310
set -gx DAO_ACCEPTANCE_APP_ORIGIN http://127.0.0.1:3310
set -gx DAO_IPFS_GATEWAY_URL https://tomato-raw-duck-661.mypinata.cloud/ipfs/
set -gx DAO_ACCEPTANCE_DB "$DAO_ACCEPTANCE_DIR/d1/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite"
umask 077
```

**Historical setup correction.** The inline initializer originally printed here stalled in Miniflare's worker path.
The file-based repair completed on September 23. The completed database must not be initialized again.
Use the reusable [fresh/resume initializer](local-development.md#file-based-local-d1-initialization) only for separate local development.
The original command remains available at `6f78a0840feafdb26e8256e7212529156beb6c72:docs/apps/dao/pinata-recovery.md`.

**Fork — start a separate local child fork on 18547.** Keep the original Anvil and old Browser alive.
First check ports with `lsof -nP -iTCP:18545 -iTCP:18547 -iTCP:18546 -iTCP:3310 -sTCP:LISTEN`.
Expect original Anvil on 18545, with 18547, 18546, and 3310 free. Stop if ownership differs.

```fish
env DAO_FORK_SOURCE_RPC=http://127.0.0.1:18545 DAO_FORK_PORT=18547 node scripts/dao-start-fork.mjs
```

This forks the current local state and leaves the original fork unchanged. Keep **Fork** running.
**Checks — create new scenario metadata on 18547 only:**

```fish
test "$DAO_FORK_RPC" = http://127.0.0.1:18547; or exit 1
node scripts/dao-fork.mjs setup > "$DAO_ACCEPTANCE_DIR/evidence/followup-setup.json"
and curl --max-time 10 -fsS -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"anvil_setIntervalMining","params":[12]}' "$DAO_FORK_RPC" -o "$DAO_ACCEPTANCE_DIR/evidence/followup-mining.json"
and node scripts/dao-fork.mjs status > "$DAO_ACCEPTANCE_DIR/evidence/followup-status.json"
```

Setup makes local configuration transactions on the new fork. It must find zero proposals.
Require no RPC error in `followup-mining.json`. The child fork then mines actual local blocks every twelve seconds.
This is new scenario metadata, not a reconstruction of the missing original metadata.
Stop on setup failure; do not run reset on either fork.

## 3. Check state before every App start or restart

In **Checks**, refresh from actual local contracts. Do not edit freshness timestamps:

```fish
node scripts/dao-fork.mjs fixture > "$DAO_ACCEPTANCE_DIR/evidence/feed-check-"(date -u +%Y%m%dT%H%M%SZ)".json"
and node --input-type=module -e '
import assert from "node:assert/strict"; import {readFile} from "node:fs/promises";
import {requireAcceptanceState} from "./scripts/dao-pinata-acceptance.mjs";
await requireAcceptanceState(process.env.DAO_ACCEPTANCE_DIR,process.env.DAO_FORK_DIR);
const f=JSON.parse(await readFile(process.env.DAO_FORK_DIR+"/feed.json"));
const age=Math.floor(Date.now()/1000)-f.observedAt;
assert.ok(age>=-60&&age<=300,"Refresh the actual fork fixture before startup");
const blockAge=Math.floor(Date.now()/1000)-f.block.timestamp;
assert.ok(blockAge>=-60&&blockAge<=300,"The local fork head is stale; inspect the fork before startup");
console.log({ageSeconds:age,proposals:f.proposals.length,block:f.block.number});
'
and sqlite3 -readonly "$DAO_ACCEPTANCE_DB" 'PRAGMA quick_check; SELECT digest,byte_length,published_at,upload_accepted,upload_attempts,retrieval_attempts,reservations,retry_after FROM dao_publications; SELECT * FROM dao_publication_policy;'
```

Require `quick_check=ok`, expected document identities and counters, and the correct fork state.
Initially expect zero publication rows and zero proposals. After B's failed request, require one B row and one failed upload.
`retry_after` is milliseconds; divide by 1,000 only for a seconds-based date display.
Compare counters with the last checkpoint. Missing files, unexplained decreases, or changed policies stop publication.
The launcher refuses missing database, ledger, and scenario files before its private JWT prompt.
Its existence check does not replace SQLite integrity, counter, or fork-provenance checks.

## 4. Restore B and test the unchanged retry

Privately prepare upload-only credentials and separate cleanup authority as described in [acceptance](pinata-acceptance.md).
Use a deliberately revoked upload-only credential for the first request. Record its role and revocation time without its value.
Do not reuse uncertain historical keys or expose credentials in saved output.

**App — exact private startup command, also used after rotation:**

```fish
node scripts/dao-pinata-acceptance.mjs launch "$DAO_ACCEPTANCE_DIR"
```

Answer `yes` and enter the relevant JWT at the hidden prompt. Leave App running.
**Checks:** `curl --max-time 60 -fsS http://127.0.0.1:3310/dao/propose -o /dev/null`.
If compilation times out, retain the failure and inspect App privately before one bounded readiness retry.

**Follow-up Browser:** `node scripts/dao-pinata-browser.mjs "$DAO_ACCEPTANCE_DIR"`.
Use only `http://127.0.0.1:3310/dao/propose#B`. Leave A and C untouched.
Select **Connect wallet → Browser Wallet → Start proposal**. Use the throwaway author from step 1, chain 1, RPC 18547.
No seed or real funds are needed. Do not use the old Browser for this new fork.

1. Select **Restore exact content file** and choose `$DAO_ACCEPTANCE_DIR/documents/B.json` through the file picker.
2. Require the unpublished notice, original snapshot time, original forum topic, and Signal script `0x`.
3. Select **Download exact content** twice. Both downloads must match retained B; the helper must report no mismatch.
4. Select **I reviewed…**, then **Publish immutable content** once with the revoked key. Expect failure and no transaction action.
5. Stop only **App** with Ctrl-C. Keep both browsers and both forks alive. Inspect D1 and make the checkpoint below.
6. Require B's original digest, `upload_accepted=0`, `published_at=NULL`, `upload_attempts=1`, and no fourth document.
7. Privately obtain a replacement upload-only key. Repeat step 3, then restart App with the same command and directory.
8. Reload the same B tab. Require the same unpublished snapshot, with confirmation unchecked. Do not rebuild the review.
9. Download B again and compare it with the retained file. Wait until the recorded retry deadline has passed.
10. Confirm the unchanged review and publish **once**. Require acknowledged publication and exact retained retrieval.

If tab storage is gone, use the import step again. Import never creates publication success or a transaction hash.
If storage is unavailable, keep the current tab, download the content, and resolve storage before publishing.
If the helper reports changed bytes, stop. It correctly refuses to overwrite the original file.
If the second upload fails, stop: this follow-up has no third upload allowance.

**Checks — verify through the application once:**

```fish
node scripts/dao-pinata-acceptance.mjs verify-app "$DAO_ACCEPTANCE_DIR" "$DAO_ACCEPTANCE_DIR/documents/B.json"
```

Require success, one admitted B, two upload attempts, an acknowledgement, and a non-null publication time.
Record the displayed result and counter inspection in `evidence/operator-notes.txt` without credentials.

## 5. One local proposal and one released-producer retrieval

In the B tab, select **Create onchain proposal** exactly once. Require proposal ID 0 and save the actual transaction hash.
In **Checks**:

```fish
read --prompt-str 'Local B transaction hash: ' DAO_B_TX
node scripts/dao-fork.mjs record "$DAO_B_TX" "$DAO_ACCEPTANCE_DIR/documents/B.json" > "$DAO_ACCEPTANCE_DIR/evidence/B-receipt.json"
```

Require a successful canonical receipt with B's digest and empty script. Do not send another proposal if indexing is delayed.
Copy the retained configuration:

```fish
cp docs/apps/dao/delivery/evidence/m5-pinata/local-producer-config.json "$DAO_ACCEPTANCE_DIR/producer-config.json"
```
This retained configuration uses one content request and no retries. Verify its deployment identities against the new fork.
Verify the unchanged released binary before execution:

```fish
shasum -a 256 /Users/hydra/Developer/dao-operations/gov-apps-stats.agent.integration/target/release/gov-apps-dao
```

Require `61c51b8528cb249b8290b0bc1fe9acc9f9514be7a5991d8af22fd61fedc8ff5c`. Stop if the binary or configuration differs.
Reserve and run one cycle:

```fish
node scripts/dao-fork.mjs mine > "$DAO_ACCEPTANCE_DIR/evidence/producer-confirmation.json"
and node -e 'require("node:fs").writeFileSync(process.env.DAO_ACCEPTANCE_DIR+"/evidence/producer-reservation.json",JSON.stringify({requests:1,outcome:"reserved",at:new Date().toISOString()})+"\n",{flag:"wx"})'
and env DAO_RPC_TRANSPORT=http DAO_RPC_URL="$DAO_FORK_RPC" DAO_CONTENT_GATEWAY="$DAO_IPFS_GATEWAY_URL" /Users/hydra/Developer/dao-operations/gov-apps-stats.agent.integration/target/release/gov-apps-dao local "$DAO_ACCEPTANCE_DIR/producer-config.json" "$DAO_ACCEPTANCE_DIR/producer-state" "$DAO_ACCEPTANCE_DIR/producer-feed.json" > "$DAO_ACCEPTANCE_DIR/evidence/producer.log" 2>&1
```

An existing reservation blocks a repeat, including after uncertain failure. Require exit zero and exactly one proposal with content bytes.
Before serving the result, compare its decoded bytes:

```fish
node --input-type=module -e '
import assert from "node:assert/strict";import {readFile,copyFile,writeFile} from "node:fs/promises";
const d=process.env.DAO_ACCEPTANCE_DIR,f=JSON.parse(await readFile(d+"/producer-feed.json"));
assert.equal(f.proposals.length,1);const p=f.proposals[0];assert.equal(p.id,"0");
assert.equal(p.contentDigest,"0xeddf3b10786df3496b3d36a2cc7cfc0df55af2676e4e47d885ea3065ba40903e");
assert.ok(Buffer.from(p.contentBytes,"base64").equals(await readFile(d+"/documents/B.json")));
await writeFile(d+"/evidence/producer-comparison.json",JSON.stringify({passed:true,digest:p.contentDigest,id:p.id})+"\n",{flag:"wx"});
await copyFile(d+"/producer-feed.json",d+"/fork/feed.json");'
```

Open `http://127.0.0.1:3310/dao/proposals/0?chain=1&voting=0x543e8871562a8c53e8b6a26835aeecb3a5a13070`.
Record B's rendered content, the proposal identity, and any freshness warning. Do not replace producer evidence with a fixture.
Save the actual response:

```fish
curl --max-time 15 -fsS http://127.0.0.1:3310/api/dao-data -o "$DAO_ACCEPTANCE_DIR/evidence/app-producer-feed.json"
```

## 6. Checkpoint, interruption, and cleanup

Before an interruption, stop App only and finish or preserve any helper request reservation.
Keep documents immutable. Retain every ledger, receipt, producer reservation, and observed counter value.
In **Checks**, create a new checkpoint, using SQLite's backup operation:

```fish
set checkpoint "$DAO_ACCEPTANCE_DIR/checkpoints/"(date -u +%Y%m%dT%H%M%SZ)
mkdir "$checkpoint"; or exit 1
sqlite3 -readonly "$DAO_ACCEPTANCE_DB" ".backup '$checkpoint/publication.sqlite'"
and sqlite3 -readonly "$checkpoint/publication.sqlite" 'PRAGMA quick_check;'
and cp "$DAO_ACCEPTANCE_DIR/acceptance-ledger.json" "$checkpoint/acceptance-ledger.json"
and cp -R "$DAO_ACCEPTANCE_DIR/documents" "$DAO_FORK_DIR" "$DAO_ACCEPTANCE_DIR/evidence" "$checkpoint/"
and curl --max-time 30 -fsS -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"anvil_dumpState","params":[]}' "$DAO_FORK_RPC" -o "$checkpoint/fork-export.json"
and shasum -a 256 "$checkpoint/publication.sqlite" "$checkpoint/acceptance-ledger.json" "$checkpoint/fork-export.json" > "$checkpoint/checksums.txt"
```

Do not copy a live SQLite main file alone, discard WAL files, or use `immutable=1` while a writer exists.
Require a valid RPC `result` in the export. Record chain ID, block hash, and proposal count beside each checkpoint.
For a stopped fork, load the export only into a separate empty Anvil process through `anvil_loadState`.
For this packet, verify the hex export checksum `59da8916fabdb280d8c48a72d8183e7327ed7fdfb85c9db1a9916a7e1d73966d` first.
Neither export restores original scenario snapshot IDs. Never call `reset` with stale snapshot identifiers.
Verify code identities, genesis, accounts, proposal count, event receipts, deployment metadata, and fresh reads before resume.
If metadata cannot be reconciled, prepare a separately labelled replacement scenario. Do not reset the original fork.
Restore D1 and its matching ledger/documents together into the same session only after checking the checkpoint.
Ambiguous requests remain consumed. Never create a blank ledger or database to continue an existing run.

After successful evidence capture, run cleanup privately with separate cleanup authority:

```fish
node scripts/dao-pinata-acceptance.mjs cleanup "$DAO_ACCEPTANCE_DIR" "$DAO_ACCEPTANCE_DIR/documents/B.json"
```

Require HTTP 200 for B. Historical A/C pin status is unknown; inspect it privately before selecting either reserved cleanup attempt.
If needed, use the same command with `$DAO_RECOVERY_PACKET/documents/A.json` or `C.json`, once per document.
Record already-absent outcomes honestly; do not republish a canary to obtain a cleanup result.
Privately revoke disposable upload and cleanup keys. Record roles and times only.
Take a final checkpoint. Stop App, then the new Follow-up Browser, then the new Fork terminal with Ctrl-C.
Do not close the old Browser or stop original Anvil as part of this follow-up.
Original Anvil was PID 49883 under launcher 49858; recheck ownership before any separately authorized shutdown.
