# Caverns author gameplay review

Review the running game before batching refinements. Do not restart or advance
the live review session to implement an issue without the author's direction.

## Agreed follow-up items

| ID | Decision | Status |
|---|---|---|
| UI-01 | Support INVENTORY and INVENT for displaying carried objects; retain original LIST and existing I as aliases. Prefer the familiar inventory name in help. | Recorded for implementation after review; not in the running build. |
| UI-02 | Give concise, action-specific confirmation for successful actions, especially taking/dropping items, e.g. "You take the double-bladed sword." Reuse existing confirmations where adequate. | Future usability enhancement requested by the author, not a bug or a live-session change. |
| COMBAT-01 | ATTACK TROLL without an object noun currently triggers immediate lethal retaliation, rather than asking for a weapon. Explicit ATTACK TROLL WITH SWORD and USE SWORD enter combat. | Confirmed by source inspection only; unsafe command not executed. Author-approved correction: ask for the missing weapon rather than punish an incomplete command. Not implemented in the running BASIC build. |
| MEDIA-01 | Ship CAVBASIC.BAS and CAVERNS.TXT on the starter disk, with BAZA tools. Leave CAVBASIC.COM compilation to the user. Keep compiled artifacts for development/identity checks, and keep assembly development-only. | Packaging/tests/Viewer update pending. |
| SAVE-01 | Add an in-memory save/restore checkpoint first, supporting review and ordinary play; persistent disk saves are a later stage. No such command exists in the BASIC edition. A disk save must serialize game state and version it; an in-memory bookmark lasts only for the current run. Viewer disk downloads are not RAM snapshots. | Superseded during container-loss discussion: author now requests load-only externally generated scenarios. Development launcher implemented and documented in caverns-scenarios.md; no in-game SAVE or in-memory checkpoint added. |
| NAV-01 | Improve room descriptions to identify visible routes, locked doors and hazards. Keep undiscovered secret exits concealed until their puzzle state reveals them. | Recorded; wording and coverage to review. |
| NAV-02 | Normal paths should return consistently under the opposite direction. Retain a small set of deliberately confusing paths or one-way transitions, with each exception explicitly reviewed, documented and tested. Do not automatically remove every original asymmetry or retain all of them by default. | Author clarified this policy during live review; individual exceptions still to enumerate. |
| NAV-03 | Explain the compass's importance while it is available in the hut; when moving without it, explicitly describe disorientation. Preserve the compass mechanic pending further decisions. | Recorded; exact wording and any additional protection against an unrecoverable early mistake remain to review. |
| NAV-04 | Clarify the direction of the visible river where the geography is established. The dark-forest description gives no bearing; establish the river’s course and bends before choosing new wording. | Observation recorded during westward exploration; no compass bearing adopted yet. |
| NAV-05 | Dark forest west leads to river cliff, and river cliff west leads back to the same dark forest. This two-W loop is a concrete non-reciprocal connection to review under NAV-02. | Confirmed from the current source; Caverns80 repairs this with cliff west blocked and cliff east returning to the forest. Adopted into the forest refinement plan; not yet implemented in the live build. |
| NAV-06 | Prefer Caverns80 map repairs where evaluation finds no harmful change. The nine outdoor differences remove duplicate shortcuts and make normal return directions consistent; recommend adopting them as a set. | Author explicitly requested forest simplification following Caverns80; exact plan in caverns-forest-refinement-plan.md. Far-side details and purposeful exceptions remain subject to walkthrough review. No live-build changes. |
| NAV-07 | Evaluate later map repairs for puzzle bypasses, not just reversible exits. Caverns80 adds temple east to wizard cavern and a waterfall/stair/drain connection, creating a compass route from temple to castle without the crypt/cell gates. | Static source-graph finding; significant design change flagged for author discussion, not automatically accepted. |
| NAV-08 | Clover-field hut bearing and return direction contradict the eastward approach from the clearing. Correct both geometry and description, following the Caverns80 westward return unless a specific problem is found. | Author classifies this as a serious bug, including misleading prose. Not changed in the active build. |

## Parser finding for UI-01

Source inspection of CAVBASIC.BAS lines 815, 930 and 3000–3020 shows an explicit
I-to-LIST alias and a space-delimited keyword search. There is no general
fixed-significant-letter truncation rule. INVENT must therefore be supported
explicitly; it is not currently an automatic abbreviation for INVENTORY.
Do not generalize a prefix rule to every verb/object as part of this small fix.

## Comparison policy

As each location or connection is reviewed, compare it with Caverns80 and flag
encountered differences for discussion. Caverns80 remains a reference attempt,
not the canonical map; differences are not automatically adopted.

## Navigation exception policy

An intentional exception needs its source/destination/direction or state rule,
its gameplay purpose, any player-facing indication, and an explicit author
keep/change decision. Tests should distinguish those exceptions from accidental
inconsistent return paths. A deliberately confusing maze need not reveal its
solution to the player; its design must be explicit to the maintainers.
The exception list will be populated during review. No map edits are authorized
to run ahead of that review or to alter the active game session.

Source clarification: lacking the compass currently randomizes movement. It is
not an immediate game-over state, although the locked hut and hazards make the
mistake punitive. Do not describe the inventory as lost merely because moving
to a new room does not print it: LIST is the observable check.

## Live session checkpoint

- Actual standalone Viewer, real Chromium, PICO9918 at 80 columns.
- Commands: TAKE COMPASS, LIST, N, LIST, NORTH (blocked), W, WEST, SOUTH, WEST, TAKE SWORD, LIST, EAST, NORTH, WEST, NORTH, EAST, LOOK, EAST, SOUTH, ATTACK TROLL WITH SWORD, SOUTH, SOUTH.
- Location: southern bridge landing (room 12), after one successful ATTACK TROLL WITH SWORD and two SOUTH commands. Troll victory and crossing observed in the actual Viewer; last turn 22. No further movement.
- Inventory confirmed by LIST at the crater: compass and double-bladed sword.
- The river’s compass bearing has not been stated by the running game.
- Safety/comparison check: riverbank west to crater agrees in both maps. Entering is safe; continuing west from the crater is a fatal exit, disclosed as a safety warning.
- Screens and command transcript: build/caverns/review/ (local review artifacts).

## Review safety policy

At the author's request, inspect a proposed move for deterministic fatal exits
before executing it, and warn rather than silently walking into death. Do not
advance beyond the user's requested action. Warn about combat risk; random
outcomes cannot be guaranteed safe. Keep actual screen output separate from
source-based safety advice and remembered inventory.

## Caverns80 comparison for NAV-05

Reference only, not canonical: Caverns80 commit
3c033e9a24f9873389c26c2a3d680cf79a69d6ec, src/tables.asm MOVTAB.
Its dark forest west still reaches the river cliff. At the cliff, west is
blocked and east returns to the dark forest, removing the two-W loop. The
clearing/forest pair is also reciprocal: clearing west to forest, forest east
to clearing. This is a candidate local repair under the author's NAV-02 policy.

Caverns80's src/strings.asm retains the same dark-forest river description
without a compass bearing, and the same cliff description naming a south path.
Thus the graph repair does not resolve the descriptive gaps noted in NAV-01
and NAV-04. No assembly map or rule has been copied into the active BASIC game.

Crater safety check: both maps have north/south blocked, west fatal, and east
returning to the riverbank. This was source-based advice; only LIST was executed.

## Forest comparison outcome

There are 57 initial-destination differences across the whole map; nine are in
rooms 3, 4, 5 and 10. The riverbank, crater and outcrop connections agree.
Caverns80 changes the forest/clearing return from north to east, the field/clearing
return from north to west, removes the forest/field duplicate south shortcuts
to the cliff, changes cliff east from field to forest and blocks cliff west,
and removes the bridge-approach west shortcut to the field. These preserve
access to the sword, coin, river views and eastward bridge approach.

Current field exits (source advice, not printed by LOOK): north clearing, south
river cliff, east Mt. Ymir slopes, west blocked. Caverns80 instead uses west
to clearing, blocks north/south, and retains east to slopes. The current live
BASIC still has the original geometry and north-hut description.

The larger NAV-07 finding is a static reachability result, not a played proof
of every resource condition. With initial dynamic gates closed, Caverns80 has
35 E36 E40 N45 N47 E46 S43 W42 W41 W54 S53 E52 N50; the original temple has no
compass departure. The path still requires dealing with creatures. Decide
explicitly whether the crypt/riddle/grille sequence may become optional.

## Author clarification: unnecessary confusion is a defect

Treat misleading compass text and accidental route inconsistencies as bugs,
not historical flavor to preserve. Suggest clarity improvements wherever they
reduce this additional burden on the actual puzzles. Prefer Caverns80's repairs
subject to explicit review of purposeful exceptions and puzzle dependencies.
All 57 initial-exit differences are retained in caverns-map-comparison.md; a
complete prose/conditional-state audit remains to be done.

Current combat safety check at troll approach: no attacks have been made. The
first correct sword attack increments fatigue from 0 to 1, so its fatigue
death condition cannot occur; the attack can win or miss. This does not promise
a risk-free prolonged fight. Bare ATTACK TROLL takes the hostile fallback
before the normal "Please tell me how" response. No combat command was entered.


### Caverns80 combat/parser comparison (source inspection, 2026-11-14)

Reference: caverns80 commit 3c033e9a24f9873389c26c2a3d680cf79a69d6ec.
No command was sent to the live troll encounter during this inspection.

- `src/combat.asm` CMDKILAT selects a creature and a separate tool noun,
  irrespective of their order. With no tool, CKANEEHO prints "Please tell me
  how." and clears VERPATIN, suppressing subsequent monster retaliation.
  This is the precedent to adopt for BASIC's incomplete ATTACK request.
- This is not completely free input validation: `src/parser.asm` HANINPLI
  increments the turn counter and updates the candle before combat validation.
  Do not import that detail as our fairness policy; validate before charging
  resources or changing combat state.
- The parser scans case-insensitive whole-word tokens, selecting the first
  matching verb in table order and the first two distinct nouns in noun-table
  order. It can therefore recognize both target and weapon; WITH is not needed
  by CMDKILAT. It is still a simple recognizer, not a general grammar parser.
- Explicit INVENT, INVENTORY, LIST and I aliases are documented/implemented;
  these are aliases, not a generic significant-prefix rule.
- Current BASIC's ATTACK TROLL SWORD must also be reviewed: ATTACK reaches the
  hostile fallback whereas WITH routes through tool-use handling. Test both
  forms on a disposable instance after the parser correction, never on this
  live review session. The intended behavior is that optional filler words do
  not determine whether an otherwise complete sword attack is accepted.

Evidence: Caverns80 `src/combat.asm` CMDKILAT/CKANEEHO;
`src/parser.asm` HANINPLI/SCAINPTO; `src/encountr.asm` MAYMONAT;
`src/strings.asm` STRPLETE/TOKINV/TOKSTA3; `src/tables.asm` VERTOKTA.
These are source findings, not a new emulator qualification.


### Bridge midpoint safety — author-approved refinement

At room 11, replace east and west destinations 128 (fatal) with 0 (blocked).
Use the normal "You can't go that way" response, with no special message.
North and south remain the bridge routes. Caverns80 retains the same fatal
side exits (`src/tables.asm` MOVTAB); this is a deliberate improvement beyond
that version. Approved during live review after turn 21. Not yet implemented;
the running build still has fatal east/west exits. Do not test them live.


## Restarted live review checkpoint

The prior emulator process ended. Restarted the unchanged standalone Viewer
and replayed ordinary commands without modifying game state or RNG. Evidence:
`build/caverns/review-restart/transcript.jsonl` and numbered screenshots.
Collected compass and sword; troll defeated on first sword attack. Crossed
south twice, west to mushroom rock, west to dragon clearing. Defeated dragon
on third sword attempt (two misses), then north to rope cliff, TAKE ROPE, LIST.
Turn 26: room 15, alive, carrying compass, double-bladed sword and thin/tatty
rope, all explicitly printed by LIST. Stopped at prompt without using rope.
Live map still predates the agreed Caverns80 outdoor corrections.


## RNG initialization concern — source inspection

CAVBASIC line 25 calls RANDOMIZE before the first player INPUT. BAZA starts
with state 5A4A1234h (`src/runtime/console.asm`); RANDOMIZE without an argument
XORs the Z80 R register into its top byte (`src/level2.asm` TRYRAND).
RND(1) advances xorshift32 (`src/runtime/rnd.asm`). Thus generator state does
advance, but startup entropy is limited and a repeatable emulator boot can
repeat the first combat sequence. Repeated first-swing troll victories alone
are not proof of failure (per-swing kill threshold is .38). Later dragon
combat differed across observed restarts. Audit seeding, particularly whether
to sample timing after interactive input; do not silently change combat odds.
No RNG implementation changed during this review.


## Load-only scenario facility

Author narrowed the persistence requirement to externally written scenario
files and a loader. See caverns-scenarios.md. The oversized BASIC save/load
prototype was removed from working source; archival game source and normal
COM remain unchanged. CAVLOAD.COM is a development clone with its opening
banner replaced by a native file loader, using the same 39,680-byte image and
runtime memory requirement. It restores full persistent game state and RNG.
Named exported records and repository JSON allow fresh-machine recovery.
No map/parser refinements were applied as part of this facility.
