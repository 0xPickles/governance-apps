# Exact recovered acceptance documents

A, B, and C are byte-for-byte copies of the durable recovery packet dated 2026-09-23.
The packet reconstructed content from historical conversation records and verified the earlier observed SHA-256 hashes.
Its original D1 database and request ledger were not recovered.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| A.json | 527 | b6d65c3111e87261f255c825687ba8a15935fbde0aa98e5457fea7b7356876b9 |
| B.json | 567 | eddf3b10786df3496b3d36a2cc7cfc0df55af2676e4e47d885ea3065ba40903e |
| C.json | 536 | 483a8aa56688cf23c0036d191e136be8f919567c62c1f32d1d10a501806ce70c |

Tests use synthetic forum metadata, isolated D1 records, and provider substitutes.
They prove recovery behavior, not historical publication, current pin status, or remaining live allowances.
Do not format these JSON files. Their final LF and all other bytes define their identities.
