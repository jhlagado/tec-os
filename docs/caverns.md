# Caverns on TEC-OS

Caverns is now the original BASIC adventure, refined with its author's approval.
The starter disk's main SYSTEM volume holds **CAVBASIC.COM**, its BAZA source
**CAVBASIC.BAS**, and **CAVERNS.TXT**. Select PICO9918 at 80 columns and type:

```
CAVBASIC
```

To rebuild it on the TEC-1 with the shell resident:

```
BAZA CAVBASIC
CAVBASIC
```

The ready-to-run executable is 39,680 bytes, including its selected runtime.
BAZA.RTL is needed to compile, not to play. TED CAVBASIC.BAS opens the source.
QUIT followed by N returns to the shell; Y starts a fresh adventure. There is
no disk SAVE/LOAD facility in this BASIC version.

## Rules and original identity

The complete original 54-room directed map and object starting locations are
retained. Paths may curve and double back. Without a compass carried or in the
current room, compass commands choose random directions. The rope descends
one way from the balcony into the temple; APE opens the crypt wall, and GALAR
is the castle-clued return to the cave entrance. The key is left outside a door
when used. Eleven carried objects are allowed. Sword fatigue accumulates over
the adventure, and randomness can still kill the player.

The author's agreed refinements are deliberately small:

- The string bridge remains usable for the return journey. A complete adventure
  must not require a death/restart or prior knowledge of GALAR.
- The visible treasure-room entrance explicitly suggests explosives. Using the
  lit candle and bomb there blasts open the eastern passage, consumes the bomb,
  and leaves the player outside to enter normally. There is no numerical
  teleportation. Elsewhere a blast changes neither location nor surroundings;
  the bomb remains available, avoiding a permanent loss from that experiment.
- TAKE/PUT/USING/WITH share noun and presence validation with GET/DROP/USE.
  Missing or remote objects cannot be acquired, banked or used through aliases.
- Creature descriptions return from their subroutines; room 32 has a description.

Small interface conveniences retained from the trial are N/S/E/W, I, SCORE and
free LOOK/LIST/SCORE. The normal combat risk still applies to action commands
near hostile creatures. Normal RANDOMIZE makes replay timing affect randomness.
The original crypt clue uses APE; VARD is not substituted. The original shield
and pendant do not gain invented combat or magic effects.

## Validation and walkthrough review

`test/caverns-refined-route.json` is an independently source-derived quest
witness. `test/caverns.test.mjs` drives the real TEC-OS ROM and native BAZA output
through ordinary keyboard commands. It checks the actual room and all 24 object
locations against the witness, retries sword attacks until victory, and allows
fresh adventures after the original random combat death. A successful adventure
must learn the castle clue before using GALAR, consume one bomb at the entrance,
return all ten surviving treasures for 126, and visit all 54 rooms. No host-side
item, location, RNG or puzzle-state writes are used to complete the quest.

Additional checks cover off-target explosions at the castle and northern cavern,
blocked reverse rope/cell exits, inventory capacity, bat relocation, invalid
aliases, compass loss, fatal falls, replay and exit. The native compiler rebuild
is compared byte-for-byte with the shipped executable. The starter recipe and
Viewer card include the same BASIC executable and source.

The source-derived witness assumes possible first-strike victories; the native
run uses real RND and may need repeated sword commands or a fresh adventure.
Neither proves that every random outcome wins. That is consistent with the
agreed fairness requirement: a full-score first-discovery adventure must be
possible, while combat and geographical hazards retain risks.

The exact book exercise is now covered by `test/caverns-ted.test.mjs`: shell
COPY, TED editing and explicit save, build, run, game exit, return to TED and
reopen after a power cycle. The original supplied source and executable remain
unchanged by that exercise. It is emulator evidence, not a physical-board run.

The compact BASIC header records the original 1982–83 copyright, 1983 Microbee
edition, 2019 GPL release, original repository, author-approved port, platform
lineage and recovery credits. Adding those REM lines produced exactly the same
39,680-byte executable: remarks are skipped before code generation. Numbered
lines still occupy compile-time line-table space; this does not make source
comments unlimited.

See [the review walkthrough](caverns-walkthrough.md) for the route and review
checkpoints. The Viewer is a local test deployment; no public site has been
published by this work. At `http://127.0.0.1:8765/`, an existing browser card is
kept on reload. To test the refreshed disk, download any card you wish to keep
with **Download image**, then select **New starter card** and run CAVBASIC.

## Assembly comparison retained for development

`programs/CAVERNS.COM` remains the separately preserved Caverns80 0.1.1 artifact,
22,896 bytes, SHA-256
`6e4c4154d7136645c18effccfc5d60ca3d59ae7b19a963b389608ecaf18e2dfb`.
It is deliberately **absent from the starter recipe and Viewer disk**. Its
regression test installs it into a disposable test image explicitly. Its map
and later gameplay choices are not the specification for the BASIC release.
It should only return to a public disk after gameplay parity is established.

## Provenance and reproduction

The archival source is sibling repository `jhlagado/caverns`, commit
`d60481500140c79da0e6e06719a518c4231c4588`, `src/caverns.basic` and its intro.
That archival listing is unchanged. The BASIC port caches static DATA in integer
and string arrays once, resets mutable state on replay, and uses integer
variables for rooms, flags, inventories and loops; RND remains floating point.

BAZA input pins point to local compiler/runtime commit
`8578fe50fdfc66e16015c54f365d1403825979da`. This compiler/runtime commit is published on the BAZA integration branch;
a fresh Git fetch by its pinned SHA has reproduced both input hashes. Native fixture regeneration:

```
node tools/caverns-fixture.mjs ../baza/build/runtime-build.json ../baza/dist
npm run media
npm run web
node --test test/caverns.test.mjs test/caverns-ted.test.mjs test/starter.test.mjs
```

The fixture writer captures compiler symbols and emits both the debug copy and
`programs/CAVBASIC.COM` from an actual compilation. Keep source, binary and
fixture together. `npm run media` packages their hashes into starter recipe
revision 16. `npm run web` supplies that same recipe and files to the Viewer.
