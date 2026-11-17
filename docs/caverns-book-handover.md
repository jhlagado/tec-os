# TEC-OS Book: BASIC Caverns handover

The worked example uses restored original prose with the author-approved modern
map and puzzles. Walkthrough spoilers remain in [the walkthrough](caverns-walkthrough.md)
and [map audit](caverns-map-audit.md), outside the practical manual.

## Readiness

The restored version passes 39 native game/scenario/rewrite/TED/starter checks
on the preceding firmware: a 126-point first-discovery quest, all 54 rooms and
their displayed descriptions, return home, and checkpoint restoration. The
480-command comparison in 36 scenarios retains exact non-prose output and full
persisted state/RNG; only the recorded descriptions, their line wrapping and
the copyright are normalised. TED copy/edit/save/build/run/exit/reopen after a
power cycle passes. The source-only starter compiles the exact executable in
a fresh Chromium Viewer, plays the opening, and restores an exported checkpoint
in independent browser storage. These are emulator and browser observations.

Current TEC-OS main has since been merged. Two complete strict runs on this
combined candidate and the refreshed Viewer qualification are pending. This is
active integration work, not a completed main release. The previous compiler-only
candidate passed two complete 1,432-test strict runs; those results are retained
separately and do not qualify the newer firmware or restored text by themselves.
Physical TEC-1G testing and final human gameplay review remain outstanding.

## Exact artifacts

| Artifact | Repository / pin / path |
|---|---|
| Restored source and rendering change | jhlagado/tec-os, 5af4bf7447771cbb109e97a030e3bd5d4f3e0f6e |
| Current firmware integration | jhlagado/tec-os, ae61d294; current main merged for qualification |
| Source on SYSTEM | programs/CAVERNS.BAS |
| Verification executable, excluded from starter | programs/CAVERNS.COM; 37,248 bytes |
| Exact source, compiler, RTL, executable identities | test/caverns-basic.json |
| Player instructions on SYSTEM | programs/CAVERNS.TXT |
| Main-volume recipe and image | dist/starter.recipe.json, revision 17; dist/starter.img |
| Compiler/runtime pair | jhlagado/baza, eee4ee6846add13c0ea120fbf2de8be0ec08c0b1; dist/BAZA.COM and dist/BAZA.RTL |
| Editor and dependency pins | TED.COM and compiler/runtime in test/inputs.json |
| Viewer receiving work | jhlagado/tec-os-viewer, caverns-baza-viewer; qualification pending |
| Development checkpoints | tools/caverns-scenario.mjs; programs/caverns/CAVLOAD.COM and *.CAV |
| Assembly comparison, development only | programs/CAVASM.COM |

Source SHA-256: b2e62b3bb501f657948f001ad4335eed9be9549ec81d8a6d98db3ce6d46c0c53.
Executable SHA-256: 27f61ac267dee17c696f502bf5d9400448fede330211246d8f7ebaea5e8553a2.
Compiler SHA-256: f8d4b8944be95451faa7aa0bc99e611f6793b7d4a8e413344e951e26ede07498.
Runtime SHA-256: 29c07740630069921f93581c8527d5db057c63a073a95b37c7a020df92ae5e38.

The displayed copyright is 1982-83, with the GNU Public License notice retaining
2019. The archival MicroWorld BASIC program is unchanged. Prose reconciliation
is recorded [room by room](evidence/caverns-prose-restoration/rooms.json).
The source uses ten-step line numbering, uppercase keywords and lowercase
variables. End users need no generator. RTL is linked selectively into the
executable; its 13,056-byte file is needed for compilation, not alongside the
running game. BAZA.COM itself is 13,440 bytes.

## Tested user exercise

SYSTEM is A:. In the Viewer, download any existing card before choosing **New
starter card**: reloading preserves an existing card rather than replacing its
files. With a fresh card:

```text
CON PICO 80
COPY CAVERNS.BAS CAVBOOK.BAS
TED CAVBOOK.BAS
```

Edit the presentation banner at line 150 to `TEC-OS Book presents`, retaining
PRINT and its quotes. Ctrl-S saves, Ctrl-T B builds, Ctrl-T R builds/runs.
QUIT followed by N exits the game. Dismiss TED's return pause, then Ctrl-Q
leaves TED. The shell alternative is BAZA CAVBOOK followed by CAVBOOK.
Download the Viewer card after saving to preserve edits outside the container.
This exact editor sequence, including reopening after power cycle, is tested
natively. The browser trial separately compiles the untouched source and tests
opening play and checkpoint export/restore; it does not exercise browser TED
editing. None of these observations is a physical-board test.

The small banner edit is the teaching example: no puzzle, map or engine
knowledge is needed. It changes visible output without spoiling the adventure.

## Requirements and limits

The design and current tests target PICO9918 at 80 columns with matrix keyboard
input. Descriptions are word-wrapped into lines of at most 79 characters.
Counted DATA lines preserve paragraphs longer than BASIC's 255-byte single
string limit. Forty-column prose layout is not the current qualification target.

The shell-resident TPA is 41,984 bytes. The executable occupies 37,248 file bytes
and 37,177 logical bytes; reserving a 768-byte CPU stack leaves 4,039 bytes for
dynamic allocations before initialisation. Arrays, strings and control frames
consume that space during play. Bare-ROM TPA is 46,536 bytes, but the example
runs with the shell resident. Large source experiments can still exceed memory.

There are eleven carrying slots, finite candle life and random combat risk.
The candle remains lit when found; matches and an explicit lighting clock,
stronger startup entropy and in-game disk SAVE/LOAD remain future work.
Development checkpoints intentionally restore the RNG sequence as well as
items, monsters and puzzle state. Downloading a card does not preserve live RAM.
The compiler's existing RST 6 exception is unchanged and is tracked separately.

## Evidence and release scope

- [Restoration and reconciliation](caverns-prose-restoration.md).
- [Restoration qualification status](evidence/caverns-prose-restoration/qualification.json).
- [Pre-merge native game/editor/starter checks](evidence/caverns-prose-restoration/pre-merge/game-starter-tests.log.gz).
- [Pre-merge fresh browser trial](evidence/caverns-prose-restoration/pre-merge/viewer-result.json).
- [Compiler-only integration and retained strict runs](caverns-baza-shared-publish.md).
- [Engine and authoring structure](caverns-engine.md).

Older measurements remain historical in the compact-emission, print-helper,
main-integration, refinement and wording-pass evidence directories. Their binary
sizes and commit pins are not measurements of the restored-prose executable.

BASIC Caverns is the intended public worked example. The starter supplies
CAVERNS.BAS and CAVERNS.TXT; users create CAVERNS.COM by compiling it. The
assembly build CAVASM.COM and development checkpoint loader/files remain
excluded. Their presence in the repository does not imply gameplay parity or
public-release qualification. No public-site deployment or physical-board
qualification is claimed by this handover.
