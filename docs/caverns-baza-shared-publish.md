# Caverns integration of the compact Baza build

This integration is under qualification. The published compiler/runtime pair
comes from Baza `eee4ee6`; its committed `dist/compiler-build.json` is checked
against both files before native compilation. No BASIC source, game rule or
room data changed. Historical evidence remains tied to its original artifacts.

| Native measurement | Bytes |
|---|---:|
| CAVBASIC.COM, record-rounded | 29,056 |
| Logical program image | 28,946 |
| Generated application code and data | 20,930 |
| Linked runtime code and workspace | 7,915 |
| Scalar and descriptor cells | 88 |
| Entry jump and footer | 13 |
| File padding | 110 |
| Shell-resident TPA | 41,984 |
| Reserved CPU stack | 768 |
| Space above the image before dynamic allocations | 12,270 |

The previous pinned compiler produced 33,280 file bytes and a 33,259-byte
logical image. This update saves 4,224 bytes on disk and 4,313 logical bytes.
The 13,440-byte compiler and 13,056-byte library are needed to build the game;
they are not resident beside it while it runs.

The audit structurally decodes all 46 DATA blocks, including 264 digit-only
whole-number entries. Encoded DATA is 6,040 bytes. Text characters comprise
4,499 DATA string bytes and 2,996 other literal bytes. The audit counts 669
source records occupying 2,408 bytes, using three-byte first-statement and
four-byte later-statement restart forms. The remaining application
instructions and inline metadata total 9,486 bytes. These are file-layout
categories, not additional allocations.

`tools/caverns-scenario.mjs` recognises the new first-statement restart form
and still accepts the earlier native forms for historical records. The
external CVB2 scenario format and semantic fields remain unchanged; executable
identities, checksums and addresses are regenerated for this build. The
29,312-byte development loader remains excluded from the starter card.

The timing tool recognises the recorder's context stores without assuming
that footer magic follows the routine. The size audit installs compiler files
before boot, so it cannot reuse stale directory/cache state from another
compiler. It decodes whole-number DATA tags instead of charging them a floating
payload they no longer contain.

The focused checks pass 20 native Caverns tests, including a 126-point route,
all 54 rooms, the 480-command comparison in 36 scenarios, checkpoint restore,
and TED edit/save/build/run/reopen. Two additional platform checks press the
actual matrix Ctrl+C chord: INPUT and paused FFh output both have the original
restart vectors in place before warm boot can clear a stale jump. Existing
TIMES tests separately exercise Baza with a GLCD service and a held vector.
The compiler's pre-existing RST 6 exception is unchanged by this integration.

The unchanged card-write and speed gates pass. BOUNCE compiles to 16,000 bytes,
125 records in one CP/M extent: 125 data commits and three directory commits,
128 total writes, below the original 168-write limit. Its old two-extent output
needed six directory commits. An initial strict attempt was stopped after the
two stale six-commit expectations failed; both affected checks passed after
requiring the measured three commits. No limit was relaxed.

The ordinary 16-command game route used 34,183,508 cycles versus 33,570,896,
about 1.8% slower. String collections fell from one to zero. This is a measured
route, not a whole-game speed claim or a change to combat probabilities.

The Viewer native/card checks pass all eleven tests. A fresh Chromium context
compiled the exact COM from the source-only card, played the opening commands,
and exported/restored a checkpoint in another context/card. Public-site
publication and physical TEC-1G qualification are separate.

The release procedure follows Origo's
[Phase 3b checklist](https://github.com/jhlagado/origo/blob/main/studies/p3-tec-os/release-roadmap.md#phase-3b-baza-and-ted-language-support-kd-262):
paired pins, service-loaded vector checks, two strict TEC-OS runs, review,
then Viewer/book integration. The two fresh complete strict runs are pending.
The [qualification record](evidence/caverns-baza-shared-publish/qualification.json)
tracks their actual outcomes and the complete retained logs.
