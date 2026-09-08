# DAO delivery dependencies after the V2 reset

The historical M0–M2 acceptance and V1 WP8 acceptance remain in [status](status.md).
The user authorized replacing the V1 freeze and the old WP10-before-WP11 dependency.

Current state (2026-09-08): consumer external review is complete, producer handoff
is approved and the exact consumer range is integrated. See the [integration
record](evidence/feed-v2/integration.md). WP9 is next in its own authorized producer
task; its preflight and all interoperability, deployment-verification, lifecycle,
staging and production gates remain pending.

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
The recorded consumer approval and merge clear the consumer handoff gate.
They do not establish actual producer interoperability, live deployment
correctness, contract-executed lifecycle evidence, staging validation or
production readiness, or authorize publication, deployment or production writes.
