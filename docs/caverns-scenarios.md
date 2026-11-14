# Caverns development scenarios (load only)

This is a development/testing facility. It adds no SAVE command and no new
BASIC language feature. The ordinary CAVBASIC.BAS and CAVBASIC.COM are unchanged. Ready-to-use development
files are retained in programs/caverns/ so they can be recovered from Git
without rebuilding the launcher.
It does not apply the pending forest-map or parser refinements.

## Use in the Viewer

Build the development card with:

```
node tools/caverns-scenario.mjs pack
```

Open `build/caverns/scenarios.img` using the Viewer's **Open image** control.
At the TEC-OS prompt, enter one of:

```
CAVLOAD TROLL
CAVLOAD SOUTH
CAVLOAD ROPE
CAVLOAD CAVE
CAVLOAD CANDLE
```

The launcher supplies the `.CAV` extension. `CAVLOAD CAVE.CAV` also works.
The filename may include a CP/M drive prefix. Use the same drive for the
scenario's actual location; this is ordinary default-FCB file resolution.

- TROLL: bridge approach, compass and sword carried, troll still present.
- SOUTH: southern bridge landing after defeating the troll and crossing.
- ROPE: rope cliff, compass/sword/rope carried, dragon defeated.
- CAVE: cave entrance, compass/sword/rope carried, candle still ahead.
- CANDLE: cave entrance with the candle also collected.

No additional commands are played automatically after restoring. LOOK and LIST
show the restored location and inventory. QUIT, then Y, reinitializes the game
and reloads the same scenario. QUIT, then N, returns to TEC-OS, where another
CAVLOAD command selects a different scenario. Fatal play also reaches the
normal replay question, so Y provides a quick retry.

To use the files on another card, copy `build/caverns/CAVLOAD.COM` and the
chosen `.CAV` files to its writable volume using the Viewer's file importer.
Download the files or the entire image and keep them outside the emulator and
container. Viewer browser storage and this workspace's generated files alone
are not a durable external backup. The scenario JSON inputs and build tools
are repository sources, so the binary files can also be regenerated after a
fresh checkout with the qualified compiler artifact available.

## External generation

The editable inputs are `test/caverns-scenarios/*.json`. They were captured
from actual native execution, including normal pickups and monster combat;
see `test/caverns-scenario.test.mjs`. To generate a new slot:

```
node tools/caverns-scenario.mjs write scenario.json CUSTOM.CAV
```

The JSON supplies all 24 object/creature locations and these integer variables:

| Variable | Meaning |
|---|---|
| A% | Player room |
| H% | Bridge destination |
| D% | Drawbridge destination |
| W% | Waterfall/temple conditional passage |
| G% | Grille/shaft passage |
| T% | Treasure-door passage |
| E% | Crypt passage |
| J% | Hut-door state |
| C0% | Candle lit flag |
| F% | Cumulative combat fatigue |
| U% | Move count, also used by candle lifetime |

`objects` lists items 1 through 24 in their original order, including all six
monsters. A location of -1 means carried; zero means absent. The generator
checks values and required fields. `rng` is the complete 32-bit BAZA RNG state,
as eight hexadecimal digits, not just a seed. The source-derived map and
initial-description tables are immutable and do not belong in a checkpoint.
Parser scratch variables, derived score and display counters are rebuilt.

This tool deliberately permits externally authored hypothetical states, but
passing validation does not prove that a hypothetical state is reachable by
normal play. The bundled checkpoints were reached through game commands.
Walkthrough details belong in this engineering document, not the user manual.

## Format and executable compatibility

Each `.CAV` is one 128-byte CP/M record:

| Offset | Bytes | Field |
|---:|---:|---|
| 0 | 4 | ASCII CVB1 |
| 4 | 1 | Format 1 |
| 5 | 1 | Reserved zero |
| 6 | 2 | Little-endian unsigned byte sum, excluding these two checksum bytes |
| 8 | 8 | First eight SHA-256 bytes of the qualified original COM |
| 16 | 48 | 24 signed little-endian object-location words |
| 64 | 22 | The 11 scalar words in the table above |
| 86 | 4 | Little-endian RNG state |
| 90 | 38 | Zero padding |

The loader checks the exact header/game identity, record count, checksum,
player-room bounds and object-location encoding before applying the record.
The external writer additionally checks scalar domains and nonzero RNG state.
Do not treat this checksum as cryptographic authentication.

The tool derives addresses from the hash-checked `test/caverns-basic.json`
fixture and guarded instruction signatures in CAVBASIC.COM. It assembles the
small launcher with the pinned native TAS, then overlays only the opening
banner, after normal BASIC initialization and before the first room display.
It restores the dynamic object array, scalars and the actual BAZA RNG state,
then enters the ordinary room-display code. No host memory injection is used
to load a scenario; the running Z80 reads the file through real BDOS calls.

CAVLOAD.COM remains 39,680 bytes, with the original runtime footer and TPA
requirement. The overlay occupies 344 of the banner's 425 bytes. This is a
COM-specific development launcher, not a compiler feature or an independent
second implementation of the game. A source/compiler change requires
regenerating the qualified COM fixture, launcher and scenarios; stale files
are rejected. The normal welcome/credits remain in the original game and
source; the testing launcher uses that space for loading instead.

## Qualification

Run:

```
node --test test/caverns-scenario.test.mjs
```

The tests execute the real ROM/BDOS, use exported files on a newly constructed
card and boot a fresh machine. They compare every persisted field, compare
the next combat output/RNG continuation, exercise replay, and reject missing,
wrong-game, incompatible, truncated, extra-record and corrupt files, plus
invalid room/object encodings. Native capture also reaches the rope and
candle checkpoints through ordinary game commands.

Actual Chromium Viewer testing opens the development image, restores ROPE,
downloads CAVE.CAV through the file browser, then imports the downloaded file
and launcher into an independent browser context with a fresh starter card
and restores CAVE. Reproduce that trial after packing with:

```
TEST_CHROMIUM=/usr/bin/chromium node tools/caverns-viewer-trial.mjs ../tec-os-viewer
```

Omit TEST_CHROMIUM when Playwright's default Chromium is installed.
Screens and the result record are under
`build/caverns/scenario-viewer/` when that trial has been run successfully.
The recorded results are retained in [evidence/caverns-scenarios](evidence/caverns-scenarios/README.md).
This is emulator/Viewer evidence, not physical TEC-1G qualification.

The public starter-card recipe is not changed by this development facility.
The assembly game remains outside the public release. Pending gameplay
refinements are listed in caverns-review-issues.md and the forest plan.
