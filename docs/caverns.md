# Caverns on TEC-OS

The starter disk's main SYSTEM volume supplies **CAVBASIC.BAS** and
**CAVERNS.TXT**. Neither the BASIC executable nor the assembly version is
preinstalled. Build the BASIC game yourself with the included BAZA compiler:

```
CON PICO 80
BAZA CAVBASIC
CAVBASIC
```

The qualified executable is **29,056 bytes**, including its selected runtime.
Compilation and play work with the shell resident (TPA 41,984 bytes); no UNLOAD
is needed. BAZA.RTL is required for compilation, not beside the running game.
Use the PICO9918 console at 80 columns and matrix keyboard input, as tested.
Physical TEC-1G qualification remains outstanding.

## A first edit/build/run exercise

```
COPY CAVBASIC.BAS CAVBOOK.BAS
TED CAVBOOK.BAS
```

Change the presentation banner (line 150 in this listing) from `DREAMCARDS presents...` to
`TEC-OS Book presents`. Keep the line number, PRINT and quotation marks.
Ctrl-S saves, Ctrl-T B builds, and Ctrl-T R builds/runs. In the game, QUIT,
then N, exits; dismiss TED's return pause to resume editing. Ctrl-Q leaves
TED. Alternatively compile and run from the shell with `BAZA CAVBOOK` and
`CAVBOOK`. This changes presentation without requiring knowledge of the game.

`test/caverns-ted.test.mjs` performs the exact copy, edit, explicit save, build,
run, exit and reopen after a power cycle. It checks the original source is
unchanged and no CAVBASIC.COM was supplied on the starter disk. In the Viewer,
TED save preserves the file on the emulated card; download that card to keep
it outside the browser/container. Downloading it does not save running memory.

## Player-facing behaviour

- Whole-word commands are case-insensitive; N/S/E/W abbreviate directions.
  LIST, INVENTORY, INVENT and I list possessions. LOOK, inventory and SCORE
  consume neither turns nor combat fatigue.
- Descriptions identify paths and distinguish them from distant views. The
  forest, caves and drains use reciprocal ordinary routes. Conditional gates,
  the self-locking hut and the clearly warned western crater drop are explicit.
- Take the compass before leaving the hut. Without one carried or present,
  direction commands choose a random bearing and print a warning.
- Specify the sword when attacking; an incomplete attack asks for a weapon
  before spending time or allowing retaliation. Combat still has random risk.
  Fatigue resets on successful travel and victory. Defeated enemies stay gone;
  the wizard no longer takes the sword, and the key is retained after unlocking.
- The rope must be tied to the balcony rail before DOWN. UP returns from the
  temple. Taking or untying the rope removes the climbing connection.
- Returning home with the key automatically banks treasures, retains equipment,
  prints a welcome, score and ranking, and allows continued exploration. Carried
  possessions are valued at double while in the hut. SCORE is always available;
  QUIT prints the final score/ranking and asks whether to restart.

The original adventure, characters and puzzles are retained with the author's
approved corrections. This is not a claim that the archival directed map is
unchanged. See the separate spoiler records below for the exact revisions.

## Evidence and remaining work

The current native TEC-OS test drives keyboard commands through a real native
BAZA rebuild, completes a first-discovery 126-point quest, visits all 54 rooms,
checks their displayed descriptions, walks back from the castle without the
magic word, and verifies the homecoming. No host-side game-state or RNG writes
are used for that completion. Scenario tests separately verify complete state
restoration, deterministic RNG continuation, attachment/removal of the rope,
physical hatch operation, clarification handling and treasure banking.

The earlier records under `docs/evidence/caverns-scenarios` describe historical
builds. The gameplay revision records live under `docs/evidence/caverns-refinement`;
the later text-only landmark pass is under `docs/evidence/caverns-wording-pass`.
The native tests are emulator evidence. The system-Chromium Viewer trial also
compiled from a fresh source-only card, downloaded a byte-identical COM, played
the opening and exported/restored a checkpoint in a fresh browser context.
Its two native Viewer recipe/bundle tests pass. None substitutes for a board run. Gameplay review of this
revision and a physical TEC-1G run remain the final human checks.

Known limits: eleven carried objects; combat can lose; finite candle lifetime
(230 action turns under the retained rule); the candle is still found lit.
Matches/explicit candle lighting, stronger startup entropy and persistent
in-game saves remain future work. Development checkpoints restore an exact
random state, so identical commands intentionally repeat the same outcome.
The development-only loader is not an in-game SAVE/LOAD command.

## Exact artifacts and reproduction

Source and qualified binary: `programs/CAVBASIC.BAS`, `programs/CAVBASIC.COM`.
The latter is retained in the repository for verification, omitted from starter
recipe revision 17. `test/caverns-basic.json` records the full source, binary,
compiler and RTL hashes, byte count and native compiler symbol addresses.

Compiler/runtime pins in `test/inputs.json` resolve published BAZA commit
`eee4ee6846add13c0ea120fbf2de8be0ec08c0b1`. BAZA.COM SHA-256:
`f8d4b8944be95451faa7aa0bc99e611f6793b7d4a8e413344e951e26ede07498`.
BAZA.RTL SHA-256:
`29c07740630069921f93581c8527d5db057c63a073a95b37c7a020df92ae5e38`.
The structural rewrite itself required no compiler/runtime change. A subsequent
compact source-location optimisation reduces the COM by 1,408 bytes on disk;
see [compiler integration evidence](caverns-compact-emission.md). Shared print
helpers then made it 36,736 bytes, the compact-code compiler at `5f6b58d`
(direct jumps, equality compares, inline numeric literals and digit-only whole
numbers in `DATA`) 33,280, and Baza `eee4ee6` (restart-vector calls for the
source record, inline print, newline and slot reset, a short constant `FOR`
and a shared publish for computed numbers; Baza's `docs/compact-code.md`)
makes it 29,056. The engine
and world data are separated, with ten-step numbering and the requested casing.
See [engine structure and authoring](caverns-engine.md). Descriptions
are scanned from compact DATA into one temporary string rather than retaining
54 extra strings or compiling 54 conditional printing branches.

```
node tools/caverns-source.mjs
node tools/caverns-fixture.mjs ../baza/build/runtime-build.json ../baza/dist
npm run media
npm run caverns:scenarios
npm run web
node --test test/caverns.test.mjs test/caverns-scenario.test.mjs test/caverns-ted.test.mjs test/caverns-rewrite.test.mjs
```

The archival source remains in `jhlagado/caverns` at
`d60481500140c79da0e6e06719a518c4231c4588`, `src/caverns.basic`.
The compact REM header preserves copyright, provenance and recovery credits.

The pre-rewrite binary and source are frozen for comparison under
`test/fixtures/caverns-baseline/`; they are not supplied on the starter card.
Current rewrite evidence is in `docs/evidence/caverns-rewrite/`.

## Development and spoiler records

- [Complete map/prose audit and Caverns80 exceptions](caverns-map-audit.md).
- [Revised walkthrough](caverns-walkthrough.md).
- [Scenario format and checkpoint usage](caverns-scenarios.md).
- [Chronological author review and implementation status](caverns-review-issues.md).
- [Archival source analysis](caverns-original.md), historical rather than the
  current gameplay specification.

The separately preserved assembly `programs/CAVERNS.COM` is 22,896 bytes,
SHA-256 `6e4c4154d7136645c18effccfc5d60ca3d59ae7b19a963b389608ecaf18e2dfb`.
It is tested as a reference in a disposable image and remains development-only.
