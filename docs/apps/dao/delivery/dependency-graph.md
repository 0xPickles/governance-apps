# DAO delivery dependencies after the V2 reset

The historical M0–M2 acceptance and V1 WP8 acceptance remain in [status](status.md).
The user authorized replacing the V1 freeze and the old WP10-before-WP11 dependency.

```mermaid
flowchart TD
  M2["Accepted mock product and historical V1 contract"] --> Reset["Governance Apps reset: revised WP8 + WP11 + WP12"]
  Reset --> Review{"External consumer review and findings addressed"}
  Review --> Start{"Explicit approval to begin Gov Apps Stats"}
  Start --> WP9["WP9: producer against reviewed V2 candidate"]
  WP9 --> WP10["WP10: actual producer bytes through consumer and staging"]
  WP10 --> WP13["WP13: forum and durable content publication"]
  WP13 --> WP14["WP14: fresh governance write preparation"]
  WP14 --> WP15["WP15: actual Voting.execute preflight"]
  WP15 --> WP16["WP16: contract-executed integration harness"]
  WP16 --> WP17["WP17: cross-repository lifecycle and reorg UAT"]
  WP17 --> ForkReview{"Lifecycle UAT accepted"}
  ForkReview --> Production{"Required production approval"}
  Production --> WP18["WP18: gated rollout"]
```

WP9 belongs to Gov Apps Stats; this reset changes Governance Apps only.
A consumer fixture is not producer interoperability evidence. Small coordinated
V2 amendments may follow real producer findings and require review.
No merge, external approval, producer start, deployment or production approval
is implied by completion of this branch.
