# Governance source revision comparison

On 2026-09-08, the reviewer reported downloading and comparing these three
files. The implementation follow-up independently downloaded the exact raw
GitHub bytes and compared them with Node Buffer.equals, then calculated SHA-256.

- Governance Apps pin: `9395d5e6fffdfe21fda32af94d32fca1a4f7840b`.
- Read-only producer manifest pin: `054e3e391f0fe4cd41c68b1a97263cb3234faee1`.
- Paths: `contracts/governance/Voting.vy`, `Voter.vy`, `Executor.vy`.

| File | Exact bytes at either revision | SHA-256 at either revision |
| --- | ---: | --- |
| Voting.vy | 16,684 | `6c9899bdfc5f51e965a0f35bfb2008a29f3dcde07decbc81a265b17e64ce709e` |
| Voter.vy | 6,315 | `32b1b32ee87e34b23c7bfcefc1b6b191bd84fe38b1f377e114d0b77d1a7f3aab` |
| Executor.vy | 3,437 | `fd93c2a50050d63d3ca32be1404a1152e9a3fbaa7c558cfac4253e3ca63fbdd1` |

Every byte comparison passed. No newline or other normalization was applied.

Sources: [Voting at consumer pin](https://raw.githubusercontent.com/yearn/stYFI/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voting.vy),
[Voting at producer pin](https://raw.githubusercontent.com/yearn/stYFI/054e3e391f0fe4cd41c68b1a97263cb3234faee1/contracts/governance/Voting.vy),
[Voter at consumer pin](https://raw.githubusercontent.com/yearn/stYFI/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Voter.vy),
[Voter at producer pin](https://raw.githubusercontent.com/yearn/stYFI/054e3e391f0fe4cd41c68b1a97263cb3234faee1/contracts/governance/Voter.vy),
[Executor at consumer pin](https://raw.githubusercontent.com/yearn/stYFI/9395d5e6fffdfe21fda32af94d32fca1a4f7840b/contracts/governance/Executor.vy),
[Executor at producer pin](https://raw.githubusercontent.com/yearn/stYFI/054e3e391f0fe4cd41c68b1a97263cb3234faee1/contracts/governance/Executor.vy).

This resolves the file-level difference for these sources; Governance Apps keeps
its existing pin. It proves neither deployed bytecode nor equivalence of other
dependencies, compiler settings or deployment configuration. Verify those at
the later producer/deployment gate. No live contract reads or producer changes
were performed for this comparison.
