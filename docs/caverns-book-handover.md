# TEC-OS Book: BASIC Caverns handover

The worked example uses restored original prose with the author-approved modern
map and puzzles. Walkthrough spoilers remain in [the walkthrough](caverns-walkthrough.md)
and [map audit](caverns-map-audit.md), outside the practical manual.

## Readiness

Two independent full platform runs pass **1,433 tests each, zero failures or
skips** on the prose-engine reference. Final text-only corrections
then passes **41 affected native checks**, including the 126-point quest through
all 54 rooms, 480-command complete-state/RNG comparison, checkpoint restoration,
TED editing and compiler/game interrupt vectors. Sixteen conditional-prose
observations also pass. No game logic, OS or compiler/runtime changed in that
last correction. [Exact artifact scopes and receipts](evidence/caverns-prose-concision/qualification.json)
distinguish the full-run reference from the final executable.

The full Viewer suite passes 202 checks on unchanged runtime/observer code.
Final source/card receiving and publication pins are being refreshed. Physical
TEC-1G testing and the author's final prose/gameplay read-through remain
outstanding. No public version or release tag is created by this increment.

## Exact artifacts

| Artifact | Repository / pin / path |
|---|---|
| Current source and artifacts | jhlagado/tec-os, 67efb1b0951ce30bf01d0ad892e24bfed6b421fd |
| Firmware code pin | jhlagado/tec-os, 1dd75f5bc97672d71a885010ba3aff9c2f598d6c; runtime source unchanged from tested 9b25a0cf |
| Source on SYSTEM | programs/CAVERNS.BAS |
| Verification executable, excluded from starter | programs/CAVERNS.COM; 35,968 bytes |
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

Source SHA-256: 2f65e0a2a89045ec87b6c7291654b9a8612bfc1747c3c241f5da4b826768b7bd.
Executable SHA-256: d563736861387ebf9152e730d28b0d5513ceba1c1b0f7666ddc4c5942bab956d.
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

The shell-resident TPA is 41,984 bytes. The executable occupies 35,968 file bytes
and 35,876 logical bytes; reserving a 768-byte CPU stack leaves 5,340 bytes for
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
