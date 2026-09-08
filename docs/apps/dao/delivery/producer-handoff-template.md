# Producer handback template

Use after explicit producer-start approval. Refer to the reviewed V2 candidate,
not the superseded V1 freeze.

- Exact producer base, branch, final commit and review range.
- Exact consumer review range and any coordinated amendments.
- Verified chain/Voting deployment, genesis, deployment block and implementation/source agreement.
- RPC EIP-1898 and historical log availability evidence; acquisition bounds and measured refresh cost.
- Immutable producer-generated candidate location/digest and stable publication identity.
- Complete proposal/log reconciliation, restart/checkpoint/reorg recovery results.
- Content/script durability and recovery; optional enrichment failures.
- Candidate validation, publication retry, conditional-write/fencing and stale-cache results.
- Actual-byte consumer transport/parser/adapter/route results.
- Source-based, synthetic, contract-executed and live evidence distinguished.
- Outstanding lifecycle/staging/production gates and approval status.

No cursor, lease, retry, trace reference or machine path belongs in the public feed.
