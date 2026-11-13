# Caverns trials on TEC-OS

The starter card and Viewer include the CP/M assembly game CAVERNS.COM, an
experimental Microsoft BASIC comparison CAVBASIC.BAS, and CAVERNS.TXT with
instructions. Select the PICO9918 at 80 columns. Both run with the startup
shell installed; no ROM changes or UNLOAD are needed with the revised BAZA.

```
CAVERNS
```

runs Caverns80. HELP lists commands; Space/Enter continues its story, Q skips.
SAVE and LOAD use CAVERNS.SAV on the current drive. QUIT followed by N exits.

```
BAZA CAVBASIC
CAVBASIC
```

compiles and runs the BASIC comparison. It accepts full words plus N/S/E/W
and I: LOOK, LIST, GET COMPASS, DROP COMPASS, SCORE, QUIT, and tool commands
such as OPEN DOOR WITH KEY and KILL TROLL WITH SWORD. N exits and Y restarts.
It has no disk save/load and does not duplicate Caverns80's full parser or
EXAMINE/HELP presentation. The named platforms share a map and winning quest
in this trial, rather than every command or random outcome.

## Rule-set status

The current BASIC is a trial of Caverns80's revised rules, not an archival
replacement. The author prefers the original compass confusion and one-use
bridge. The original return path is under investigation before a final shared
rule set is adopted. [The original-game audit](caverns-original.md) records
the hut/key handler, drainage connections and the remaining reachability issue.
Passing the present trial's completion test does not settle that design choice.

## Sizes

| Build | COM bytes |
| --- | ---: |
| Assembly Caverns80 0.1.1 | 22,896 |
| Initial BASIC conversion, old BAZA | 42,240 |
| Same conversion, finer runtime linking | 38,912 |
| Table-cached Caverns80-rule BASIC trial | 38,272 |

The runtime is already linked into the COM. BAZA.RTL is a compile-time library,
not a second library loaded alongside a running program. The revised compiler
links RND separately and omits numeric input parsing for string-only INPUT.
The trial fits the shell's 42,496-byte TPA with room for its runtime allocations.
The full winning route and 54-room tour run under that shell without memory
violations. These are emulator measurements, not physical TEC-1G results.

## BASIC source changes

The original line numbers are multiplied by ten; helpers follow the old game.
The initial conversion replaced Microbee display/input hooks, substring syntax,
SEARCH, NEXT *variable exits, variable-valued DATA and numbered RESTORE.
The source already uses integer variables. Fixed map, vocabulary and object
name tables are now read once into arrays. Simple integer index operations and
nested integer comparisons avoid several generic floating-point paths.

Three creature-description subroutines formerly jumped directly to the prompt.
They now RETURN, so repeated encounters do not leak GOSUB/FOR frames. The
trial also includes Caverns80's map, retained keys, reusable bridge, literal
compass directions, persistent waterfall exit, combat fatigue reset, ten-item
limit, bomb exclusion from scoring and the non-teleporting vault explosion.
These gameplay choices are explicitly experimental pending the original-rule
review. Forty repeated LOOKs do not consume turns. Fatal moves, restart and
exit are exercised through ordinary input.

## Provenance

Copyright 1982–83 John Hardy; GNU GPL. The recovered listing records the 2019
release. Sources:

- [Caverns80](https://github.com/jhlagado/caverns80), commit
  3c033e9a24f9873389c26c2a3d680cf79a69d6ec, version 0.1.1. The vendored
  programs/CAVERNS.COM has SHA-256
  6e4c4154d7136645c18effccfc5d60ca3d59ae7b19a963b389608ecaf18e2dfb.
  Its original assembler commit was unavailable. ATOM 0.3.7 built the unchanged
  source to the identical published COM; the original 58 upstream tests passed.
- [Recovered BASIC](https://github.com/jhlagado/caverns), commit
  d60481500140c79da0e6e06719a518c4231c4588, src/caverns.basic.
- The revised BAZA is a local source pin until publication is authorized.
  Preparing another workspace requires that BAZA checkout and its dist files,
  or publishing the pinned commit first.

## Repeatable verification

```
node --test test/caverns.test.mjs test/starter.test.mjs
node tools/caverns-fixture.mjs ../baza/build/runtime-build.json
```

The fixture command recompiles with real BAZA under TEC-OS and records native
variable addresses, source/compiler hashes and the output COM hash. It injects
no gameplay state. Completion tests use ordinary commands, check the same map
and all ten banked treasures for 126 points, then tour all 54 rooms. The assembly
test saves the completed game and reloads it after a fresh machine boot. BASIC
checks restart, inventory, absent objects, fatal movement and free information
commands, including a long encounter route that detects the earlier frame leak.

Caverns80's broader upstream suite covers combat, clues, examination, parser
paths, save corruption and recovery, score, counters, stack and full progression.
The BASIC trial has a smaller documented command set. A completion route and
feature tests provide evidence for those cases, not an exhaustive proof of all
possible play histories. Once the original return puzzle is settled, add its
bridge-loss, compass-loss and alternate-return scenarios to both versions.
