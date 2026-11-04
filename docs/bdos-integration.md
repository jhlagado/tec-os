# BDOS integration handoff

Integrate the isolated `bdos-potential` branch after reconciling the storage
work already in progress. Its source baseline is the qualified CCP result
`022a4ef79420abe3a461f6d37ff57287f10b5e05`; the selected production source is
`e8c24924c5bf66bb23a2b671bf76acf377881123`. This branch has not merged into main; main now contains the CCP baseline.

| Account | Baseline | Selected |
| --- | ---: | ---: |
| Used ROM | 14,561 | 14,462 |
| Free ROM | 1,823 | 1,922 |
| BDOS instructions | 3,854 | 3,755 |
| ROM outside BDOS instructions | 10,707 | 10,707 |
| BDOS RAM, including stack | 137 | 137 |
| BDOS stack allocation | 54 | 54 |
| Starter TPA | 46,869 | 46,869 |

The seven changes save 99 ROM bytes: shared allocation-vector length 19,
existing checksum helper 7, read-only vector mask 8, random-record arithmetic 15,
FCB offset-helper reuse 3, three-byte record publication 15, and allocation-map
walkers 32. No feature was added or removed. The ROM SHA-256 is
`9e51269ab611b44fd5cb5e4d7de10b83584f768e4d93b71550f20e16965e30e2`.

Preservation compares the current TEC-OS baseline, including its error
precedence and retry behavior. Original CP/M differences remain advisory;
this work does not claim complete original-BDOS parity. The proofs observe
actual CALL 0005h return PC/SP and A/L/B/H, complete FCBs, DMA/canaries, user
areas 0/5/31, raw and logical storage, warm boot and cold reopen. Dedicated
helper checks cover both allocation widths and their final cells, duplicate,
zero and out-of-range blocks, record publication boundaries and failing
mutants. The mounted G1M/G8M workload uses word allocation cells; byte cells
are exercised by the direct helper corpus.

The cost is small but measurable: record publication takes seven additional
T-states per call. In the fixed 16-file workload, complete A and B login scans
add 4,473 T-states each; wildcard erase adds 4,780 T-states per drive. At 4 MHz
these are about 1.12 ms and 1.20 ms. Public workload BDOS stack peaks remain 24
bytes for random I/O and 20 for allocation scanning/erase. The full-suite global peaks remain BDOS 32/54, CCP 22/30 and BIOS 16/38
bytes, retaining the required quarter-free margin and stack guards.

Keep the storage integration explicit. `ks36b` at
`aaef68c8e8e774e1fd67b995ccc90b5ee59be484` changes error handling and FCB
advancement, and `ks36c` at `ba61d46233b66a698deddaf603027667f10705fa`
extends the dispatcher. Those unmerged semantics were not imported here.
The selected helpers avoid their inspected changed hunks, but re-run the
public behavior, persistence and stack proofs after integration. Do not
restore old error tails or unsupported-selector assumptions while resolving
conflicts. SUMDE was unchanged in both inspected storage revisions. The refreshed
storage tips are `c1151c11e03eb16fed06c5c15a67f8e75aec975e` and
`4496d5c2466c8450a117ee954db5e4a56422d307`; their BDOS source is unchanged
from the inspected pins, although other work changes whole-ROM/TPA accounts.
At handoff, `origin/main` is `022a4ef79420abe3a461f6d37ff57287f10b5e05`.

The SoT brief is `studies/p3-tec-os/stages/bdos-potential.md`, gate KG-BDOS1;
model and proof evidence is under `studies/p3-tec-os/evidence/bdos-potential/`.
Historical model results and rejected alternatives are retained. Small
new offset wrappers saved only one byte per site group and were rejected;
broad dispatch/error redesign overlapped active storage work. This is a
measured bounded improvement, not a claim that no further reduction exists.

For a later integration check, build the integrated source with ATOM and run
`node tools/bdos-public-proof.mjs BASELINE_TREE INTEGRATED_TREE RESULT_JSON`.
`tools/bdos-extra-proof.mjs` accepts the same three arguments and requires
all selected helper labels and seven failing controls. The pinned baseline
can be rebuilt with `BDOS_VARIANTS=incumbent,combined-all MODEL_JOBS=1 node tools/bdos-model.mjs`; it also retains the selected model for comparison.
Run expensive checks under the shared memory guard. The original strict
suite, media/web builds and byte-identical repeated build remain part of
the integration qualification, together with any storage-specific checks.

Qualification at `e8c24924c5bf66bb23a2b671bf76acf377881123` passed all
632 strict tests with no skips or failures, production public/helper proofs,
media and web builds, and two byte-identical ATOM builds. The guarded run
took 703 seconds with a 616 MB peak; queue wait was 11 seconds. Final changes
only update documentation and relocate the ALVLEN/INITALV contract comments;
normalized instruction identity and the rebuilt ROM hash remain unchanged.
