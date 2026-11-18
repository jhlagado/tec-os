# TEC-OS Book: BASIC Caverns handover

The worked example uses restored original prose with the author-approved modern
map and puzzles. Walkthrough spoilers remain in [the walkthrough](caverns-walkthrough.md)
and [map audit](caverns-map-audit.md), outside the practical manual.

## Readiness

The current prose increment is under final qualification. Native compilation,
the 126-point quest through all 54 rooms, 480-command complete-state/RNG
comparison, checkpoint restoration and the TED edit/build/run exercise pass.
Sixteen separate native observations check both gate/door/shaft/bridge states
and live/defeated creatures. The full strict platform run and refreshed Viewer
checks are in progress; final receipts are in
[the current record](evidence/caverns-prose-concision/qualification.json).

The earlier restored-prose version passed two 1,433-test strict runs and 202
Viewer checks. Those are historical evidence for that earlier version, not a
substitute for the current increment's final results. Physical TEC-1G testing
and the author's final prose/gameplay read-through remain outstanding.

## Exact artifacts

| Artifact | Repository / pin / path |
|---|---|
| Current source and artifacts | jhlagado/tec-os, 7cea9d0b52bb4a9d3e8c3dd83d2dcc3155278b20 |
| Firmware code pin | jhlagado/tec-os, 1dd75f5bc97672d71a885010ba3aff9c2f598d6c; runtime source unchanged from tested 9b25a0cf |
| Source on SYSTEM | programs/CAVERNS.BAS |
| Verification executable, excluded from starter | programs/CAVERNS.COM; 36,096 bytes |
| Exact source, compiler, RTL, executable identities | test/caverns-basic.json |
| Player instructions on SYSTEM | programs/CAVERNS.TXT |
| Main-volume recipe and image | dist/starter.recipe.json, revision 17; dist/starter.img |
| Compiler/runtime pair | jhlagado/baza, eee4ee6846add13c0ea120fbf2de8be0ec08c0b1; dist/BAZA.COM and dist/BAZA.RTL |
| Editor and dependency pins | TED.COM and compiler/runtime in test/inputs.json |
| Published Viewer source | jhlagado/tec-os-viewer, d90925012de391a6b7e1c5dbddd011820dcd44e8 |
| Viewer qualification/publication receipts | jhlagado/tec-os-viewer, e2248c9bb5886d22c31ec669ff0c3d6ef691b79f; docs/evidence/caverns-prose-restoration/ |
| Hosting branch | gh-pages, 0a02a27d8ce1a16332562e9766595e0d530d82f8; exact tested standalone bytes |
| Development checkpoints | tools/caverns-scenario.mjs; programs/caverns/CAVLOAD.COM and *.CAV |
| Assembly comparison, development only | programs/CAVASM.COM |

Source SHA-256: 5cb573c8a67f8e94619509bfee85b3b65e26727f2c0e9b4b6600436ec1a32abc.
Executable SHA-256: 594b1e393681a4a3f3e3cd87b077979e56e3ab13d43ba69ff1498d068b28cf3a.
Compiler SHA-256: f8d4b8944be95451faa7aa0bc99e611f6793b7d4a8e413344e951e26ede07498.
Runtime SHA-256: 29c07740630069921f93581c8527d5db057c63a073a95b37c7a020df92ae5e38.

The displayed copyright is 1982-83, with the GNU General Public License notice retaining
2019. The archival MicroWorld BASIC program is unchanged. The current editorial record preserves [every before/recovered/edited room](evidence/caverns-prose-concision/room-edits.json).
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

The shell-resident TPA is 41,984 bytes. The executable occupies 36,096 file bytes
and 35,976 logical bytes; reserving a 768-byte CPU stack leaves 5,240 bytes for
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

- [Current prose recovery and concision](caverns-prose-concision.md).
- [Current qualification](evidence/caverns-prose-concision/qualification.json).
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
public-release qualification. The tested standalone is pushed to the hosting branch. The cloud CONNECT
proxy blocks live HTTP confirmation, so the actual public response remains
part of the author review. Physical-board qualification is not claimed.
