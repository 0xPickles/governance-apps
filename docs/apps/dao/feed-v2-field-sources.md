# V2 public field/source mapping

Every public property is listed below. S = snapshot state; H = historical fact; E = optional enrichment; M = snapshot metadata. Gov Apps Stats owns acquisition and canonicality. Governance Apps owns interpretation and presentation. No public field grants signing authority.

Unless a row states otherwise, fields are required, null is forbidden, wrong types/unknown fields invalidate the envelope, and acquisition failure prevents publication. Format and bounds are defined in [V2](feed-schema-v2.md). All source reads use the same snapshot block.

| Field | User-facing purpose | Authoritative source / class | Interpretation owner | Absence, failure, validation |
| --- | --- | --- | --- | --- |
| schema | Reject incompatible data | Contract literal / M | Both | Exactly yearn.dao.feed.v2; reject V1 |
| chainId | Correct network and identity | eth_chainId + app configuration / M | App | Wire: positive safe integer; app: must match trusted Ethereum mainnet chain 1 |
| observedAt | Order acquisitions and publications | Producer acquisition completion clock / M | Producer; app cache | UTC seconds ≥ block time; immutable per candidate |
| block.number | Identify observation height | Canonical block header / M | Both | uint256 decimal |
| block.hash | Identify canonical observation | Same header / M | Both | 32-byte hash |
| block.timestamp | Honest age and displayed timing | Same header / M | App | Safe UTC seconds |
| deployments | Explicit supported Voting set | Operator/app configuration / M | App | 1–8, exact configured set, unique |
| deployments[].votingAddress | Scope proposals to Voting | Trusted deployment + observed contract / M | App | Lowercase address, unique |
| deployments[].proposalCount | Detect missing proposals | Voting.num_proposals() / S | Producer; consumer completeness | uint256; must equal complete contiguous records from zero |
| configuration.voteStart | Snapshot-effective vote window | Voting.vote_start() / S | App domain | Seconds from epoch start, 0–1209600 |
| configuration.executeDelay | Snapshot-effective execute window | Voting.execute_delay() / S | App domain | Seconds from vote epoch end, 0–1209599 |
| configuration.executeGuard | Explain current execution role rule | Voting.execute_guard() / S | App domain | Boolean; fresh signing check still required |
| configuration.threshold | Distinguish current default from stored threshold | Voting.threshold() / S | App domain | Bps 0–10000; never replace proposal threshold |
| configuration.voter | Show effective Voter; compare app support | Voting.voter() / S | App | Address, does not authorize destination |
| configuration.executor | Show effective Executor; compare supported framing | Voting.executor() / S | App | Unknown support retains raw script; no assumed framing |
| proposals | Complete directory | IDs 0..num_proposals−1 / S | Both | 0–10000; no omissions/truncation |
| proposals[].votingAddress | Composite proposal identity | Configured Voting used for reads/logs / S | App | Must be a listed deployment |
| proposals[].id | Composite proposal identity and route | View-call argument / S | Both | Canonical uint256; zero valid; ordered unique within Voting |
| proposals[].proposer | Display proposer | proposals(id).proposer / S stored fact | App | Address; not tx sender inference |
| proposals[].epoch | Derive snapshot-effective windows | proposals(id).epoch / S stored fact | App domain | uint256; derived date must fit supported range |
| proposals[].contentDigest | Authenticate optional content | proposals(id).ipfs / S stored fact | App content parser | Exact SHA-256 bytes32; expected digest never replaced |
| proposals[].scriptHash | Authenticate exact script; signal classification | proposals(id).script_hash / S stored fact | App domain/script parser | Exact keccak256 bytes32; empty-script hash defines signal |
| proposals[].threshold | Show stored approval threshold | proposals(id).threshold / S stored fact | App domain | Bps 0–10000; never reconstruct historical storage |
| proposals[].votes | Current total voting weight | proposals(id).votes / S | App domain | uint256 base weight units, not sum of event weights |
| proposals[].yea | Current weighted yea total | proposals(id).yea / S | App domain | uint256 weight units ≤ votes; frontend derives nay |
| proposals[].retracted | Voting prohibition, including moderation | proposals(id).retracted / S | App domain | Boolean; Flag must retain true |
| proposals[].executed | Actual stored execution distinction | proposals(id).executed / S | App domain | Boolean; signal status EXECUTED may have false |
| proposals[].flagged | Moderation distinction | proposals(id).flagged / S | App domain | Boolean, implies retracted |
| proposals[].vetoed | Approval block with possibly open voting | proposals(id).vetoed / S | App domain | Boolean; never infer event-time phase from later weight |
| proposals[].status | Snapshot protocol status | Voting.status(id) / S | Producer observes; app maps display | Named enum; INVALID cannot describe a known record; flags must agree with priority |
| proposals[].scriptBytes | Exact original actions | Propose.script / H retained bytes | App script parser | null distinct from 0x; ≤2048 bytes; missing/mismatch blocks execution, record remains |
| proposals[].contentBytes | Read immutable proposal body | Optional raw content block matching digest / E | App content parser | null unavailable; ≤131072 decoded bytes; bounded malformed/digest-invalid bytes cause local invalid state |
| proposals[].events | Canonical timeline and moderation reasons | Inclusive deployment-to-snapshot logs / H | Producer canonicality; app presentation | One first Propose, complete ordered events, no duplicate canonical logs |
| events[].type | Timeline verb | Event ABI signature / H | App | propose/vote/retract/flag/veto/execute only |
| events[].log.blockNumber | Locate historical event | Canonical log/header / H | Both | uint256, no later than snapshot |
| events[].log.blockHash | Canonical event identity | Log/header / H | Both | Hash agrees for equal heights |
| events[].log.timestamp | Display event time | Event block header / H | App | UTC seconds, no later than snapshot |
| events[].log.transactionHash | Transaction link | Canonical log/receipt / H | App | Exact hash |
| events[].log.transactionIndex | Transaction order | Canonical log/receipt / H | Both | Nonnegative safe integer |
| events[].log.logIndex | Unique position in block | Canonical log/receipt / H | Both | Block-global nonnegative safe integer, unique across snapshot |
| vote.account | Honest Vote account label | Vote.account ABI field / H | App | Zero address accepted; no human/YBC/stYFIx classification |
| vote.weight | Show that event's contribution | Vote.weight ABI field / H | App | uint256, zero valid; later votes may replace it |
| vote.yea | Show event's yea fraction | Vote.yea ABI field / H | App | Bps 0–10000, not weighted yea; preserve raw value |
| flag.reason / veto.reason | Explain moderation | Flag/Veto.reason ABI field / H | App | UTF-8 ≤256 bytes, empty valid; plain text |
| execute.executor | Honest execution caller label | Execute.executor ABI field / H | App | Address; distinct from configured Executor contract |

Propose identity, commitments, script hash and threshold have one public representation in the proposal record. The producer reconciles the Propose log with stored immutable fields. Propose/retract events carry no duplicate record facts. Flag/Veto lack actor fields, so the UI shows unknown actors. No transaction sender or current configuration supplies that missing historical identity.

Omitted by design: title/summary/AST, formatted amounts, percentages, display status/group, voter classes/counts, creation/event-time configuration snapshots, setter attribution, trace and storage proofs, simulation jobs/results/manifests, arbitrary ABI records, cursors/retries/leases/journals/paths/upload attempts. These either belong in the app, optional future analysis, or private operator state.
