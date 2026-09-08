# Contract Auditor Prompt

```text
Audit DAO Governance {WP_ID} read-only.

Read docs/apps/dao/contract-reference.md and verify claims against the pinned
stYFI commit. Check the parts relevant to this package, including:
- status and action capability are separate;
- Flag implies retracted; Veto may set retracted; later totals do not identify veto phase;
- vetoed nonretracted proposals may remain votable, including after replacement to zero;
- no quorum, stored proposal threshold and snapshot-effective configuration;
- voting epochs, execution window, and late decay boundaries;
- public Voter one-vote behavior;
- Vote.yea bps and replacement contributions, with zero accounts/weights accepted;
- unknown historical actors and Execute execution-caller identity;
- script framing, 64-call cap, and 2,048-byte cap;
- empty-script signal display;
- event script retention and hash verification;
- content failure does not become a frontend voting veto;
- fresh actual Voting.execute simulation, prepared-state invalidation and shared useTx;
- source pin versus actual deployment evidence and production write gates.

Do not edit. Return findings with severity, source evidence, user impact, and the
smallest focused correction. State explicitly when no blocking finding exists.
```
