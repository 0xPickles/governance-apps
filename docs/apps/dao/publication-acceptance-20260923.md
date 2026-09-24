# Publication acceptance — 23 September 2026

Publication acceptance is complete. The separate September 23 follow-up closed the remaining B recovery and interoperability checks.
The interrupted September 17 session remains incomplete. Its missing D1 database and request ledger were not reconstructed.
No live provider request was repeated during this closeout.

The tested application revision was `6f78a0840feafdb26e8256e7212529156beb6c72` on `codex/dao/m5/pinata`.
This revision comes from the operator handoff and unchanged branch at closeout start.
The saved provider artifacts do not independently attest an application commit.
Later transaction, interface, and setup corrections have separate [offline validation](delivery/evidence/closeout-20260924/README.md).

## Checked artifacts

The [sanitized record](delivery/evidence/closeout-20260924/acceptance.json) includes identities, counters, comparisons, and SHA-256 checksums.
Checks used the retained `dao-pinata-followup-20260923` directory and the `dao-pinata-acceptance-20260917-recovery` packet.
Both remain outside this repository and unchanged.

| Check | Result and scope |
| --- | --- |
| Original B | 567 bytes; `createdAt` remains `2026-09-18T16:53:51.000Z`; Signal script remains `0x` |
| SHA-256 digest | `0xeddf3b10786df3496b3d36a2cc7cfc0df55af2676e4e47d885ea3065ba40903e` |
| Raw CID | `bafkreihn345ra6dn6newwpjwulghz7an6vnpez3ojzd5rbpkgbs3uqeqhy` |
| Exact comparison | Recovery-packet B, follow-up B, checkpoint D1 content, and producer-embedded bytes match |
| First publication | Saved state: one upload attempt, zero acknowledgement, no publication time, zero retrievals |
| Unchanged retry | Saved D1: two upload attempts, one validated acknowledgement, one retrieval, two reservations, and a publication time |
| Limits | The same stored policy remains: three documents, 393,216 bytes, four global uploads, two uploads per document |
| Local proposal | Chain 1 fork, Voting `0x543e8871562a8c53e8b6a26835aeecb3a5a13070`, proposal `0`, epoch `17` |
| Transaction | `0x848cec7b54c47430f0ac83c8c9b4a9f680d561949e59d0799bb91683f0ba1605`; saved hash matches the producer's Propose event |
| Interoperability | Released-producer output and saved application response match completely, including exact content and block identity |
| Producer block | `26029079`, `0x35ad3942417da6b9f5404fdc49d93f56209ad534e0f3f81efcf7b7f07b5db1a1` |
| Cleanup | Saved helper ledger records successful HTTP 200 cleanup for B and retained A; three helper requests total |
| Checkpoint | Final SQLite backup passes `quick_check`; database, ledger, and fork-dump hashes match the saved manifest |

The application made live Pinata requests during the operator's acceptance session.
The producer used the public gateway. Its single acquisition has a saved reservation and matching output.
The saved feed does not embed a producer binary revision; release identity comes from the prepared handoff and operator report.
Forum validation used local fixtures. Contract execution occurred only on the local fork, with test weight and role configuration.
These observations do not establish production deployment configuration.

## Operator observations and limitations

The operator recorded K1 revocation before the failed upload and K2 creation before the unchanged retry.
They confirmed correct rendering at 12:11 UTC and reported all disposable K1, K2, and cleanup keys revoked at 12:14 UTC.
These are operator observations. No credential or private terminal was inspected to verify them.

Cleanup receipts establish successful unpin requests. They do not establish deletion from every IPFS cache.
The September 17 run's missing accounting remains a historical limitation.
The follow-up does not claim that its fresh database was the original ledger or that all earlier A/C/B steps passed.

Two defects were observed during the completed follow-up: ordinary block advancement rejected preparation, and the authoring frame appeared cropped.
A proposal retry subsequently succeeded. The failed preparation submitted no transaction.
The file-based database setup repair also followed an unsuccessful inline initializer.
The [closeout record](delivery/evidence/closeout-20260924/README.md) records these corrections and all new validation failures and reruns.

## Release requirements

Provider selection and publication acceptance are closed.
Production still needs reviewed deployment identities and RPC/feed configuration, separate D1 bindings and migration, an upload-only secret, gateway, limits, and retention policy.
Independent closeout approval, integration, release-branch reconciliation, protected-host checks, and rollout authorization remain separate steps.
Use [publication operations](pinata-publication.md) and the [release checklist](release-checklist.md).
