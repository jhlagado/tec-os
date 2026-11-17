# Caverns: compact compiler emission

The BASIC source and game rules are unchanged. The compiler now emits a
seven-byte CALL/inline-coordinate prefix instead of nine instruction bytes for
each BASIC statement, retaining the full line and statement identifiers.

In this increment BAZA.COM stayed 13,184 bytes and its matching RTL file was
12,928 bytes; the present pin is in test/inputs.json and
[caverns.md](caverns.md). Only ten extra helper bytes are
linked into Caverns. The 669 shorter sites save 1,338 bytes, for a net logical
saving of 1,328 bytes. The COM is 38,272 bytes, down from 39,680.

At the audited 42,496-byte shell-resident TPA, the 38,248-byte logical image and
768-byte stack reservation leave 3,480 bytes for dynamic arrays, strings and
control. These bytes are not all unused after game initialisation. The shell
that lists sizes from a table leaves 41,984 bytes, and so 2,968 of them.

The full BAZA native regression passed 712 cases, and the separate compatibility
corpus passed 49 expectations. The compiler's retained evidence is in its
`docs/evidence/compact-emission/` folder.

TEC-OS qualification:

- [480-command comparison in 36 scenarios](evidence/caverns-compact-emission/differential.json): output, all object locations, persistent fields and RNG state agree, including a complete treasure-return route.
- [Game, checkpoint and TED tests](evidence/caverns-compact-emission/integration.log): 15 tests pass. TED edit/save/build/run/reopen is exercised with the new compiler.
- [Normal-start quest](evidence/caverns-compact-emission/normal-quest.json): 126 points, all 54 rooms, 138 turns, no memory violations.
- [Native size/link audit](evidence/caverns-compact-emission/size.json).
- [Paired 16-command timing](evidence/caverns-compact-emission/timing.json): identical output; 31 string collections before and five afterward. Command cycles decrease by about 6.5% on this route despite the slower individual coordinate helper. This is not a general speed guarantee.

Reproduce the paired timing in this checkout with:

```
node tools/caverns-compact-timing.mjs BASELINE.COM CANDIDATE.COM REPORT.json
```

The development scenario format stays CVB2. The loader recognises the compact
prefix, its 348-byte overlay fits the new 374-byte banner, and checkpoint files
are rebound to the exact executable identity. Old and new checkpoint binaries
must not be mixed. Logical scenario JSON state is unchanged.

The starter disk remains source-only for Caverns: CAVBASIC.BAS and CAVERNS.TXT,
with BAZA.COM/BAZA.RTL for readers to compile it. CAVBASIC.COM and the assembly
version remain development artifacts, excluded from the starter disk.

The refreshed Viewer passed [native/bundle checks](evidence/caverns-compact-emission/viewer-native-tests.log)
and an [actual Chromium fresh-card build/play/checkpoint trial](evidence/caverns-compact-emission/viewer-result.json).
The [qualification record](evidence/caverns-compact-emission/qualification.json)
pins the exact compiler, TEC-OS and Viewer revisions. Physical TEC-1G testing
and public main/site deployment remain outstanding. Literal-print compaction,
integer DATA payloads and native file channels are not implemented by this change.

## Integration with current main

The combined implementation preserves the cooperative cache/recovery firmware
from main and the source-only Caverns/compiler work. See the
[main-integration qualification](evidence/caverns-main-integration/qualification.json).
The full strict run exercised 1,395 checks; its five stale binary/card expectations
were corrected and all affected checks passed on targeted reruns. The record
retains the original failed log as well as the passing reruns and unchanged
resource ceilings; it does not claim a single fresh all-green full invocation.
