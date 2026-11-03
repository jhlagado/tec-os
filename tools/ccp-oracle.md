# Reconstructed CP/M 2.2 CCP qualification

`ccp-oracle.mjs` qualifies a second comparison point for CCP work. It does not
compare TEC-OS automatically or require historical feature parity. The first
comparison for a replacement remains the pinned TEC-OS incumbent.

Run from the product root with the pinned dependencies installed (`npm ci`):

```sh
PORTABLE_CPM_REPO=/path/to/portable-cpm DEBUG80_REPO=/path/to/debug80 \
node /path/to/origo/tools/mem-guard.mjs --limit 800 --heap 384 --wait 1800 \
  --name ccp-oracle --log /tmp/ccp-oracle-memory.jsonl \
  -- node tools/ccp-oracle.mjs > /tmp/ccp-oracle-result.json
```

The two source checkouts are read-only: all inputs come from `git show` at
fixed commits, never from their working files. No external binaries execute.
The original Intel source is converted to ATOM syntax in a temporary directory,
with declared symbols renamed bijectively for compact identifiers. Only ATOM
assembles code. The historical full-image recipe is not invoked.

The disk's initialized CCP bytes trace to the Digital Research source
reformatted by Eric Smith, including the documented correction to the invalid
serialization-failure expression. This is a reconstructed original, not an
untouched historical executable. The 1,979 initialized bytes, 2,048-byte slot,
whole input disk and imported system area are independently checked. BIOS is
built from the pinned Portable CP/M test fixture. The machine implementation
is transpiled from its pinned TypeScript source, with fixed-address profile and
runtime import adapters. The report records input and executable hashes.

The console comparison performs no normalization. CR/LF, echo and spaces remain
observable. Disk export and a fresh machine exercise persistence. The transient
probe observes overlapping page-zero FCBs, tail, DMA and entry stack before its
RET returns to CCP. A deliberately different TYPE result still reaches a prompt
and must fail the equality comparator.

Historical `oracle-*.json` scenarios in Portable CP/M often name its rewritten
BDOS (`systemBdos: triptych`). They are prior mixed-system observations, not this
original-CCP/original-BDOS execution. Any disagreement first belongs to the
combined system until a controlled replay establishes its owner.

## Provisional difference inventory

These source-derived observations guide discussion; they are not a complete
executed parity matrix. Optimization must preserve the incumbent TEC-OS
contract, and new features need separate benefit and cost decisions.

| Difference | Practical value and recommendation | Cost status |
| --- | --- | --- |
| Original `$$$.SUB` reverse-record batch stream; TEC-OS startup and command chains use different formats | Optional compatibility with historical SUBMIT/XSUB workflows. Defer unless needed; consider general script support separately. | Unpriced; do not count existing startup as equivalent |
| Original fixed four-column DIR; TEC-OS width-aware names, pager, counts and free space | Keep the TEC-OS interface for its small displays. | Included in incumbent; optimize equivalent behaviour |
| Original current/explicit-drive program lookup; TEC-OS user-0 and A: fallback plus 0050h load-drive publication | Keep the working edit/build workflow and tool discovery. | Included in incumbent |
| Original six-byte CCP/BDOS serialization check | Obsolete distribution mechanism. Keep its omission from TEC-OS. | No addition proposed |
| Original CCP initial command buffer may run on warm and cold starts; TEC-OS has once-cold startup plus surviving chains | Retain the documented TEC-OS lifecycle. | Included in incumbent |
| Numeric/operand grammar details, including leading zeros and trailing operands | Probe before classifying. Historical acceptance is not automatically better than intentional validation. | Unpriced; attribution unresolved |

The result is host-emulator evidence. It does not prove hardware execution,
full original feature coverage, or incumbent/candidate parity. Source assembly
failure is reported as unresolved rather than silently accepted.

## Qualified observation

The harness at `f777e34` passed on 4 November 2026; the recorded result is
`test/fixtures/ccp-oracle-qualification.json`. Guarded execution took 1.5
seconds with 80 MB sampled peak across at most two processes. The process's
own maximum RSS is retained separately in the result; sampling is not an
exact high-water measurement.

ATOM reproduced the 1,979 initialized CCP bytes exactly. Its full 2,034-byte
materialization also includes reserved workspace; only the initialized
extent is compared against the code hash, and the executable reference still
uses the original 2,048-byte disk slot including its E5h padding.

All six probe groups passed: boot/TYPE; REN persisted through export/reboot,
TYPE and ERA; USER 5 and SAVE 0 with the directory entry checked; transient
FCBs/tail/DMA/entry stack and return; two submitted records in reverse order
with deletion; and the deliberately wrong TYPE content reaching a prompt but
failing comparison. This is reference qualification, not a feature parity run.

Two initial harness assumptions were corrected from actual execution and
source: TYPE's framing includes a CRLF after the echoed CR, and page-zero
user state is published after the prompt when the CCP reaches its input
wait. No output normalization was added. The transient observation also
retains the first FCB's record-count byte of 1; this is an observation to
assess against TEC-OS, not a demand to retain incidental loader state.
