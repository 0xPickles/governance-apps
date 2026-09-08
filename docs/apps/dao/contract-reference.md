# DAO governance contract reference

Source pin remains `9395d5e6fffdfe21fda32af94d32fca1a4f7840b`:
[Voting.vy](https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voting.vy),
[Voter.vy](https://github.com/yearn/stYFI/blob/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voter.vy).
This revision defines the reviewed interpretation, not proof of any live deployment. The producer's discovered deployment pin differs; resolve it at the later gate in [the handoff](delivery/producer-handoff.md).

## State, time and passage

Voting has fixed genesis and 1209600-second epochs. Proposal creation stores the next voting epoch and the then-current threshold. View `proposals(id)` exposes proposer, epoch, ipfs digest, script_hash, threshold, votes, yea, retracted, executed, flagged and vetoed. `num_proposals` begins at zero; the first valid ID is zero.

A displayed voting window uses genesis + proposal.epoch × epoch length + snapshot vote_start through genesis + (proposal.epoch+1) × epoch length. Execution begins after snapshot execute_delay and ends after the following epoch. These dates use configuration at the displayed observation. They are not claims about creation-time rules.

No quorum exists. Passage requires votes > 0 and the source's integer test `yea * 10000 // votes >= threshold`. Stored yea and total use base weight units. The threshold is read from the proposal; the current default is shown separately.

`status(id)` first returns INVALID for absent IDs, then prioritizes stored executed, flagged, vetoed, retracted. Otherwise it compares current time and vote_start: PROPOSED before vote start, VOTING during the proposal epoch, FAILED after an unsuccessful vote, PASSED in the next epoch after passage, then EXECUTED for empty scripts or EXPIRED for other scripts. Time and mutable configuration can change this result without new logs. The feed records the observed view result.

| Protocol result | Display | Group |
| --- | --- | --- |
| PROPOSED | Discussion | Upcoming |
| VOTING | Voting | Active |
| PASSED executable | Approved | Active |
| PASSED signal | Approved | Closed |
| FAILED | Rejected | Closed |
| EXECUTED executable | Executed | Closed |
| EXECUTED signal | Approved; no executable actions | Closed |
| EXPIRED | Expired | Closed |
| RETRACTED / FLAGGED / VETOED | Retracted / Flagged / Vetoed | Closed |
| INVALID | Not found | No proposal record |

## Voting and honest history

Voting.vote is callable by the configured Voter. It requires the proposal's voting epoch, current vote-start timing, nonretracted state and scale/yea ≤10000. It replaces that account's previous weighted contribution. It can log a zero account and zero weight. Vote.yea is the input fraction in bps, not an already-weighted yea total. Never sum event weights to derive current totals.

The reviewed Voter's public Yea/Nay functions check Voting.voted(account,id), require positive effective user weight, and may update aggregate accounts. Voting.voted means stored contribution.weight > 0. Decay uses the Voter's own immutable genesis and current decay_length; it must not borrow Voting genesis blindly. The read overlay fetches those values coherently. YBC membership, downstream aggregator/hook execution and all actual transaction effects remain action preflight concerns. Read eligibility is not a signing authorization.

Historical labels use ABI facts: Propose proposer, Vote account, Execute executor (execution caller). Flag and Veto contain no actor. Retract also carries only proposal ID. Transaction sender may be different from the immediate caller; current roles cannot identify historical actors. The launch feed omits human/YBC/stYFIx classification and precise human-voter counts. Traces and historical role/setter attribution are not prerequisites.

## Moderation and lifecycle writes

Flag requires the current operator, an existing epoch no later than its voting epoch, nonretracted state and total votes == 0. It sets both flagged and retracted.

Veto requires the guardian, an existing epoch no later than the following epoch, and no retracted/executed/vetoed flag. It sets vetoed and additionally retracted if total weight is zero at that time. A nonretracted vetoed proposal can still receive votes during the allowed window; its later total may become zero through replacement. Do not infer historical veto phase from that later total.

Retraction requires the proposal author, the source's current epoch limit, nonretracted/nonvetoed state and no current vote weight. Retraction/moderation does not reset the proposer cooldown. Reasons are event facts bounded to 256 UTF-8 bytes, including valid empty onchain reasons; the app's authoring action may require a nonempty reason.

Creation checks the current blacklist, weight measure/minimum, cooldown and hooks. Shared reward participation capacity is 64 proposals in any affected reward epoch, not per author; the existing mock workflow covers the six-epoch range. Future creation reads must verify actual configured hook behavior and all current capacity/eligibility before signing.

## Scripts and execution

Preserve exact Propose script bytes (including empty bytes) and stored keccak256 hash. The established supported Executor format concatenates frames with a 20-byte target, 12-byte big-endian calldata length and that exact calldata. Voting accepts at most 2048 script bytes; the frontend's existing supported parser also enforces its reviewed frame/call limits and reports first failing offsets. Unknown Executor implementations do not inherit this format. Unknown calls retain target, selector and calldata.

A passed empty script may age to protocol EXECUTED with stored executed=false and no Execute event. Display Approved / No executable actions and never fabricate a transaction.

The first production feed has no proposal-time conditional simulation. Remove frame commitments, historical authorization/storage/trace proofs and engine manifests. Future optional analysis cannot block basic rendering or producer publication.

Before a later production execute signature, verify chain, wallet, trusted Voting deployment, current stored commitments, exact script hash, current status/flags, time, configuration and guard/role. Freshly simulate actual `Voting.execute(id, exactScript)` with the actual caller and arguments. A standalone Executor frame simulation is insufficient. Failed/unavailable required simulation blocks normal execution; successful preflight is no guarantee of later success. Require a valid simulation block number/hash/timestamp matching the live preparation observation and relevant inputs. Missing observation data, changed configuration or canonical replacement at the same height invalidate preflight even with a recent simulatedAt. This context is separate from the older feed snapshot. Account, network, proposal, script or relevant observation changes invalidate prepared state.

## Content and evidence

The content contract is independent of feed version: `yearn.dao.proposal.v1`, fixed-order canonical UTF-8 JSON plus one LF, SHA-256 onchain commitment, CIDv1/raw/SHA-256/Base32. The existing frontend parser owns safe Markdown, exact title/summary extraction and attachments. See [requirements](functional-requirements.md) and [V2](feed-schema-v2.md).

This reset's protocol evidence is source-based and synthetic ABI/consumer test coverage. No live node result or newly contract-executed lifecycle evidence is claimed. WP10/WP16/WP17 must supply actual deployment, producer-generated bytes and contract-executed lifecycle/reorg evidence before rollout.
