# Caverns development scenarios (CVB2)

Spoilers and test tooling, not part of the starter disk or ordinary game UI.

Use the development card `build/caverns/scenarios.img` in the Viewer and type:

```
CAVLOAD CHECK8
```

CAVLOAD is a testing clone of the qualified BASIC executable. It patches a three-byte jump at
its opening banner to a native CP/M file loader appended before a relocated
runtime footer, after normal array/runtime initialisation. It restores the scenario then enters ordinary game code. QUIT
and Y reload that same scenario; N exits to TEC-OS. There is no in-game SAVE.
The public starter disk supplies CAVERNS.BAS for the user to compile, not this
loader or any scenarios. Repository binaries are verification/development files.

## Build, create and preserve

```
npm run caverns:scenarios
node tools/caverns-scenario.mjs write scenario.json CUSTOM.CAV
```

JSON inputs live in `test/caverns-scenarios/`; generated `.CAV` files and matching
`CAVLOAD.COM` are also retained in `programs/caverns/`. Import both into a fresh
Viewer card. Download the scenario/card outside the browser to survive container
or browser loss. An image download preserves files, not a running machine.

The generator requires format `caverns-basic-scenario-2`, the current game's
full SHA-256, all 24 object locations, all 13 scalar variables below and an
8-digit nonzero hexadecimal RNG state. It checks ranges, boolean flags and
that a secured rope is physically at balcony 28. An imported scenario is tied
to the exact executable hash; old-format or old-build files are rejected.

## Available review positions

- TROLL: first bridge fight, compass and sword carried.
- SOUTH: after crossing; ROPE: rope obtained; CAVE/CHECK2: cave entrance.
- CANDLE: entrance with candle; CHECK3: long tunnel; CHECK4: bat colony.
- CHECK5: temple after securing and descending rope; key still carried.
- CHECK6: beyond the cell shaft; CHECK7: drain junction after wizard victory.
- CHECK8/VAULT: demon defeated, four vault treasures uncollected.
- HUT: those four treasures deposited at home; compass, key, sword and candle
  retained. SCORE is 80 under the revised at-home valuation.

These positions were **explicitly adapted from the earlier review**, not replayed
as exact new-game witnesses. Adaptation adds secured-rope/gate flags, retains a
key formerly left by the old unlocking handler, removes defeated respawning
trolls/transport bats, and moves an untaken candle to the entrance. Existing RNG
values and turn counters were retained. Historical unmodified captures and
command logs remain under `docs/evidence/caverns-scenarios`; the current normal
quest is independently verified without loading scenarios or editing game state.
Old files have deliberately not been silently accepted by the new loader.

## Native record layout

One CP/M record, 128 bytes, little-endian:

| Offset | Bytes | Meaning |
|---:|---:|---|
| 0 | 4 | ASCII CVB2 |
| 4 | 1 | Version 2 |
| 5 | 1 | Zero |
| 6 | 2 | Unsigned byte sum, excluding offsets 6 and 7 |
| 8 | 8 | First eight SHA-256 bytes of qualified CAVERNS.COM |
| 16 | 48 | 24 signed words, P%(1)..P%(24): absent 0, carried -1, room otherwise |
| 64 | 26 | The 13 scalar words in order below |
| 90 | 4 | Exact runtime RNG state |
| 94 | 34 | Zero padding |

Scalar order: `A%, H%, D%, W%, G%, T%, E%, J%, C0%, F%, U%, R0%, K0%`.
A% is room; H% bridge destination; D% drawbridge; W% drain hatch; G% shaft;
T% treasure door; E% crypt seal; J% retained legacy flag; C0% candle lit;
F% combat fatigue; U% action turns; R0% rope secured; K0% temple gate unlocked.
Object IDs are the original 1..24 order in the BASIC DATA and native fixture.

The loader validates header, identity, length, checksum, player room and basic
object bounds before applying the record. The external generator additionally
validates scalar domains and rope consistency; arbitrary handcrafted records
are development inputs, not a trusted public save format. It uses the ordinary
CP/M filename/FCB and checks missing, truncated and extra-record files.

The loader no longer needs to fit inside the opening banner. Its 348 bytes are
appended before the runtime footer; only a three-byte banner jump and the
runtime's footer pointer are patched in the public image. The footer's image
end moves with it, so normal startup and allocation account for the extra
memory. The CPU stack reserve and all existing game code/data/cell addresses
stay unchanged. The public game is neither padded nor enlarged. This build's
development COM is 37,632 bytes versus the 37,248-byte public COM (record
padding included); future compiler sizes are recorded by the generator.
`build/caverns/scenario-loader.json` records exact addresses, sizes and hashes.
Full compiler symbols are in `test/caverns-basic.json`. Its explicit
`stateSymbols` mapping connects the legacy CVB2 fields to the rewrite's actual
lowercase source variables. The wire format and room/object identities are
unchanged; compiler addresses and protected executable identities are refreshed.

## What restoration proves

Tests restore objects, defeated creatures, puzzle flags, attachment state,
counters and RNG into a fresh machine. A proper checkpoint retry intentionally
repeats the same combat sequence for identical commands. It is not a fresh random
trial. Tests also cover missing/corrupt/incompatible files, restart, reciprocal
rope travel without key/light, removing the rope, persistent physical hatch
opening, and returning CHECK8's treasures to the hut.

The Viewer trial separately imports the development card, exports a scenario,
and restores it with a matching launcher in a fresh browser context/card.
Physical TEC-1G testing remains outstanding.
