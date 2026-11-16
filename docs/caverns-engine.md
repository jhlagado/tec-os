# Caverns BASIC engine and authoring

The rewrite preserves the author-qualified game: room and object IDs, text,
connections, puzzles, command aliases, scoring, turn costs and seeded combat.
It does not restore defects from the archival game or invent new puzzles.

## Files and editing

- `programs/caverns/engine.bas.in`: labelled engine source. Keywords and named
  constants are uppercase; runtime variables are lowercase.
- `programs/caverns/world.json`: rooms with descriptions and exits, object text
  and starting positions, directions and ordered command vocabulary.
- `tools/caverns-source.mjs`: resolves named labels/constants to ordinary BASIC.
- `programs/CAVBASIC.BAS`: distributed reader-editable listing, numbered
  **10, 20, 30, ...** throughout. It compiles directly with native BAZA.
- `programs/caverns/source-map.json`: label locations, expanded constants and
  logical checkpoint-to-compiler-symbol mappings; not needed to play.

Run `node tools/caverns-source.mjs` to regenerate the repository listing;
`--check` verifies that it matches the authoring sources. This is a maintainer
step. End users need neither JavaScript nor the generator: copy the BAS file
in TED, insert experiments between existing line numbers, save and compile.
Regeneration is not run by BAZA or TED and must not overwrite an experiment.

BAZA identifies variables by their first two alphanumerics and suffix. Long
names can also contain reserved keyword spellings. The generated listing
therefore uses distinct short lowercase variables and a glossary; descriptive
labels and constants live in the authoring source and are inlined numerically.
This avoids increasing runtime storage or assuming a new CONST statement.

## Execution model

Initialise immutable tables once, including explicit object values rather than
deriving treasure values from object IDs. The second half of il% holds these
read-only values without adding another array descriptor. Each new adventure resets mutable state and
RNG normally, then prints the unchanged welcome. The main loop is:

1. Prepare visibility/candle events, then render the room without world effects.
2. Read/normalise input and recognise ordered vocabulary without world effects.
3. Handle free LOOK, inventory, SCORE and QUIT.
4. Resolve special requests and clarification. Incomplete requests return a
   prompt with zero turn cost. Accepted rope/hatch actions return redisplay.
5. Find a present creature and dispatch the ordinary action or bat transport.
6. Apply its explicit turn cost once, then redisplay, prompt or finish.

Every action routine returns to the dispatcher; none jumps into the input loop
from inside a subroutine. `rs%` identifies prompt/redisplay/finish; `tc%` is the
turn cost. Movement, object actions, tool use, spells, combat, rope/hatch
handling, scoring and homecoming have named responsibilities. Rendering item
and inventory lists uses a single pass rather than counting then rescanning.

Ordinary invalid actions retain their existing turn costs; making every failed
request free would change the game. The historical visibility-dependent candle
check is preserved in the event stage, not silently replaced by a new clock.
Room-description DATA is scanned into one temporary string to stay inside TPA;
a 54-string heap cache is deliberately avoided.

## Entry points in the shipped BASIC

| Routine | Line |
|---|---:|
| Main room loop | 190 |
| Input loop | 210 |
| Describe room | 620 |
| Parse command | 1090 |
| Special requests | 1200 |
| Dispatch ordinary action | 1420 |
| Movement | 1550 |
| Object actions | 1790 |
| Combat | 2020 |
| Score | 2230 |
| Homecoming | 2340 |

These refer to the generated listing; the source map regenerates with it.
Manual insertions in the free number slots do not renumber existing targets.

## Mutable state and compatibility

| Field | Variable | Meaning |
|---|---|---|
| Player | rm% | Room ID |
| Objects | ob%() | Creature/item locations; 0 absent, -1 carried |
| Drawbridge | db% | Raised sentinel or open destination |
| Drain hatch | ht% | Closed or open destination |
| Shaft | sh% | Closed or cleared destination |
| Treasure door | td% | Closed or blasted destination |
| Crypt | cr% | Closed or open seal |
| Candle | cl% | Lit flag |
| Combat | ft% | Fatigue |
| Time | tu% | Action turns |
| Rope | rp% | Secured flag |
| Temple gate | gt% | Unlocked flag |
| Reserved | hb%, jf% | Retained CVB2 compatibility fields |
| Randomness | native RTL | Serialized 32-bit state |

Parser/display variables are deliberately separate: cm$ command, yn$ restart
answer, wd$ searched word, mp% match position, si% search index, vb% recognised
verb, it% item, fo% creature, ac% action, nx% destination, ei% exit-table index,
rs% result, tc% turn cost, vs% visibility, ce% candle event, ds$ description,
li% displayed object, ix% loop index and qt% temporary quantity. Immutable
ad$/no$/di$/ve$ tables hold adjective/noun/direction/verb text; ex% holds exits.

Score is derived from room and possessions; parser/display temporaries are not
world state. CVB2's logical fields and IDs are unchanged. Compiler addresses
are discovered from a real native build; the fixture records their actual
names plus an explicit compatibility mapping, rather than fabricated symbols.
New binaries require matching launcher/scenario identities. Existing review
positions retain their state values when regenerated for the new executable.

## Behavioural evidence

The pre-rewrite BAS, COM, debug fixture and native loader are frozen under
`test/fixtures/caverns-baseline/`. Differential tests boot both real binaries
in separate TEC-OS machines using equivalent externally encoded checkpoints,
then send the same keyboard commands. They compare output, every object,
all thirteen persisted fields and the exact RNG state after each command.
No live game state or random value is patched. The comparisons include seeded
combat successes/deaths, aliases, unknown commands, inventory, rope lifecycle,
crypt/grille/hatch progression, dark recovery, candle thresholds, turn-counter
saturation, homecoming, restart and a full quest. Error source-line numbers
are normalised because the required renumbering intentionally changes them.

A separate resource test records the outcome of an overlong input, including
the baseline's memory failure. Resource headroom may differ after the rewrite;
this is explicitly excluded from claims of identical resource failures. It does not change
ordinary gameplay or disguise a failing baseline trial.

Fresh-game RANDOMIZE depends on processor refresh timing, so reorganising code
can change its startup seed. Identical external seeds, not an assumption of
identical startup timing, are used for the strict comparison. No random call
is added, removed or reseeded while playing a compared scenario.

Native regression tests independently rebuild from the supplied BAS, complete
a 126-point quest through all 54 rooms, verify visible descriptions, restore
all bundled scenarios, and perform TED copy/edit/save/build/run/exit/reopen.
The same pinned BAZA compiler and RTL are used. Human gameplay and physical
TEC-1G checks remain distinct from emulator and browser evidence.
