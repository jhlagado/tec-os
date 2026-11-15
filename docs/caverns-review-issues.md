# Caverns author gameplay review

Review the running game before batching refinements. Do not restart or advance
the live review session to implement an issue without the author's direction.

## Agreed follow-up items

| ID | Decision | Status |
|---|---|---|
| UI-01 | Support INVENTORY and INVENT for displaying carried objects; retain original LIST and existing I as aliases. Prefer the familiar inventory name in help. | Recorded for implementation after review; not in the running build. |
| UI-02 | Give concise, action-specific confirmation for successful actions, especially taking/dropping items, e.g. "You take the double-bladed sword." Reuse existing confirmations where adequate. | Future usability enhancement requested by the author, not a bug or a live-session change. |
| LAMP-01 | Move the candle from inner cavern 18 to daylight entrance 16, visibly available before choosing the eastern bat passage. Add a clear light-needed hint; defer matches/unlit behavior until the lighting refinement is implemented. | Recommended placement refinement during author review; not yet in the running build or old checkpoints. |
| BOMB-01 | Original detonation subtracted one from the numeric room ID, allowing arbitrary transport and bypass of the locked treasure door. Author explicitly classifies this as an original bug, not an intended puzzle mechanic. | Fixed in the currently qualified BASIC build: no location change; detonation at the visible locked door opens its east passage and consumes the bomb. Elsewhere it leaves location and permanent puzzle state unchanged and retains the bomb. |
| COMBAT-01 | ATTACK TROLL without an object noun currently triggers immediate lethal retaliation, rather than asking for a weapon. Explicit ATTACK TROLL WITH SWORD and USE SWORD enter combat. | Confirmed by source inspection only; unsafe command not executed. Author-approved correction: ask for the missing weapon rather than punish an incomplete command. Not implemented in the running BASIC build. |
| PROGRESS-01 | One-way descent without the key strands a first-time player at the temple's locked gate. GALAR is an unlearned escape at that stage, so it is not a fair solution. | Author approved reciprocal UP via the secured rope, replacing the key-before-descent proposal. Describe rope reaching the floor; preserve the gate puzzle and allow recovery of missing key/candle. Not yet implemented. |
| KEY-01 | Using the key silently leaves it in the current room while opening the hut door or temple gate and automatically moving the player through. Caverns80 keeps the key carried. | Author approved retaining the key after unlocking; give a specific gate/door confirmation. Not yet changed in the review build. |
| CRYPT-01 | Replace GAPE/APEX/APE riddle with Caverns80's keeper-name clue and VARD. Restrict opening the eastern seal to the crypt. | Author explicitly approved the Caverns80 replacement. Pending source/description/parser and checkpoint-identity update; running build still uses APE. |
| MEDIA-01 | Ship CAVBASIC.BAS and CAVERNS.TXT on the starter disk, with BAZA tools. Leave CAVBASIC.COM compilation to the user. Keep compiled artifacts for development/identity checks, and keep assembly development-only. | Packaging/tests/Viewer update pending. |
| SAVE-01 | Add an in-memory save/restore checkpoint first, supporting review and ordinary play; persistent disk saves are a later stage. No such command exists in the BASIC edition. A disk save must serialize game state and version it; an in-memory bookmark lasts only for the current run. Viewer disk downloads are not RAM snapshots. | Superseded during container-loss discussion: author now requests load-only externally generated scenarios. Development launcher implemented and documented in caverns-scenarios.md; no in-game SAVE or in-memory checkpoint added. |
| NAV-01 | Improve room descriptions to identify visible routes, locked doors and hazards. Keep undiscovered secret exits concealed until their puzzle state reveals them. | Recorded; wording and coverage to review. |
| NAV-02 | Normal paths should return consistently under the opposite direction. Retain a small set of deliberately confusing paths or one-way transitions, with each exception explicitly reviewed, documented and tested. Do not automatically remove every original asymmetry or retain all of them by default. | Author clarified this policy during live review; individual exceptions still to enumerate. |
| NAV-03 | Explain the compass's importance while it is available in the hut; when moving without it, explicitly describe disorientation. Preserve the compass mechanic pending further decisions. | Recorded; exact wording and any additional protection against an unrecoverable early mistake remain to review. |
| NAV-04 | Clarify the direction of the visible river where the geography is established. The dark-forest description gives no bearing; establish the river’s course and bends before choosing new wording. | Observation recorded during westward exploration; no compass bearing adopted yet. |
| NAV-05 | Dark forest west leads to river cliff, and river cliff west leads back to the same dark forest. This two-W loop is a concrete non-reciprocal connection to review under NAV-02. | Confirmed from the current source; Caverns80 repairs this with cliff west blocked and cliff east returning to the forest. Adopted into the forest refinement plan; not yet implemented in the live build. |
| NAV-06 | Prefer Caverns80 map repairs where evaluation finds no harmful change. The nine outdoor differences remove duplicate shortcuts and make normal return directions consistent; recommend adopting them as a set. | Author explicitly requested forest simplification following Caverns80; exact plan in caverns-forest-refinement-plan.md. Far-side details and purposeful exceptions remain subject to walkthrough review. No live-build changes. |
| NAV-07 | Evaluate later map repairs for puzzle bypasses, not just reversible exits. Caverns80 adds temple east to wizard cavern and a waterfall/stair/drain connection, creating a compass route from temple to castle without the crypt/cell gates. | Author agreed to keep the initial temple east bypass blocked, preserving the key/gate/crypt sequence. Any later unlocked shortcut needs a separate deliberate design. Other lower-region repairs still require evaluation. |
| NAV-08 | Clover-field hut bearing and return direction contradict the eastward approach from the clearing. Correct both geometry and description, following the Caverns80 westward return unless a specific problem is found. | Author classifies this as a serious bug, including misleading prose. Not changed in the active build. |

## Parser finding for UI-01

Source inspection of CAVBASIC.BAS lines 815, 930 and 3000–3020 shows an explicit
I-to-LIST alias and a space-delimited keyword search. There is no general
fixed-significant-letter truncation rule. INVENT must therefore be supported
explicitly; it is not currently an automatic abbreviation for INVENTORY.
Do not generalize a prefix rule to every verb/object as part of this small fix.

## Comparison policy

Author standing decision: adopt Caverns80 navigation corrections by default
unless evaluation reveals something strange or harmful, in which case flag
the exception for discussion. Do not silently import unrelated gameplay rules.

At every newly visited room or reviewed connection, compare current exits,
description and relevant conditional gates with Caverns80. Explicitly report
whether they match or differ. For each difference, record its navigation or
puzzle effect and an accept/hold/reject recommendation. Prefer the Caverns80
repair when it removes accidental confusion without harming a deliberate
puzzle or hazard. This comparison is mandatory throughout the walkthrough,
including the underground rooms. Caverns80 remains a reference attempt;
changes still need evaluation rather than automatic wholesale import.

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

## Route coverage policy

Author explicitly requested noting important routes so nothing is missed.
At each significant junction, record and report the onward route, useful side
trips and items, return paths, blocked/conditional exits, one-way transitions,
and routes intentionally deferred. Keep an outstanding-route checklist and
state the current position before advancing. Distinguish actual commands from
source-derived advice and current-build directions from planned repairs.
Do not silently pass a useful branch while pursuing the next objective.

### Outstanding route checklist at cell 38

- Current onward obstacle: eastern ventilation grille; its removal opens east
  to passage 39. Grille not yet touched. No ordinary west return from this cell.
- Conditional later route: cell north opens toward drainage room 43 after
  discovering waterfall 45; currently blocked. Revisit its purpose when reached.
- Passage 39 onward toward wizard cavern 36 and river ledge 40: not yet explored.
- Entrance-side bat passage 17 and explorer/key clue: inspected in source,
  not visited during this foot-route walkthrough. Bat colony/key branch was
  completed on foot; key acquired, later left at temple by old handler.
- Treasure door 20: visited, bomb hint read; still locked pending castle bomb.
- Gold coin at river outcrop 8 and diamond in corridor 22: deliberately left
  uncollected. Brick at tunnel 24 left behind; no specific use implemented.
- Current return limitations: key at temple 35 and rope at balcony 28;
  approved retention/ascent fixes are not yet applied. Checkpoint 5 restores
  the pre-gate state if a return is needed for review.

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


## Checkpoint 2 — author review resumed

Named CHECK2.CAV: exact CAVE checkpoint, room 16 just inside the entrance,
carrying compass, sword and rope. Bridge troll encounter completed; original
relocation semantics retained. Dragon defeated on the original-map rope route.
Candle remains in room 18, uncollected. Native fresh-machine comparison passed.
Actual Viewer launched CAVLOAD CHECK2 and LIST printed all three carried items;
stopped at its prompt with no exploration commands after loading.


## Candle and matches — proposed review refinement

Author requested recording the implausibility of an already-lit candle left
in the cave. Proposed replacement: find an unlit candle and a box of matches,
then explicitly light the candle. Track burn time from lighting, rather than
from total adventure moves before collection. This remains a design note:
object placement, command syntax, consumption/relighting and timing rules
need review; no matches or lighting-rule change added to the current build.
Current source starts C0%=1 and uses global U% thresholds 200/230 for warnings
and extinction. Checkpoint 2 and its existing candle behavior are unchanged.


Live continuation from checkpoint 2: SOUTH to room 18, TAKE CANDLE, LIST.
Actual Viewer LIST confirms compass, sword, candle and rope. Stopped in room
18 at the prompt. No westward exploration yet. Source inspection: north goes
to entrance 16, west to torture chamber 23; south/east blocked. No other loose
object initially occupies room 18. Evidence: build/caverns/review-check2/,
commands at turns 2–4.


Review turn 5 after checkpoint 2: WEST from candle cavern 18 to torture
chamber 23; stopped at prompt. North leads to corridor 22, east and west both
return to 18, south blocked. Caverns80 removes the redundant west return,
keeping east as the reciprocal route (already in full map comparison).
Correction to guide advice: the red brick has no specific implemented use in
this BASIC edition (only its noun-table entry and generic item handling).
Author elected to leave the diamond and brick while continuing exploration.


Review turn 6: NORTH into corridor 22. Actual screen describes east-west
corridor with breeze from east and a sparkling diamond; diamond left alone.
Current graph: S23, W21, E16 (entrance), N blocked. The S-W-N approach forms a
local loop west of the entrance rather than implying a surface river crossing.
Caverns80 blocks 22E16 and describes a south/west bend with breeze from south;
record this geometry/prose pair together under the full map comparison policy.
Stopped at room 22; no westward move or item pickup yet.


## Current cavern comparison — room 21

After WEST from corridor 22, actual Viewer turn 7 is room 21 (dark cavern).

| Direction | Running BASIC | Caverns80 |
|---|---|---|
| North | Blocked | Treasure-door approach 20 |
| South | Long tunnel 24 | Same long tunnel 24 |
| West | Blocked | Blocked |
| East | Treasure-door approach 20 | Return to corridor 22 |

Caverns80 moves the door approach to the north and restores the reciprocal
east return to the corridor we entered from. Room 20's south return is also
changed to room 21, completing that reciprocal pair. The door remains gated;
this repair does not bypass the treasure-door puzzle. Recommend adopting this
local repair together with its paired room-20 change. Generic dark-cavern
description remains; visible exit wording is still worth improving. Source
comparison only; no navigation edit or additional live command executed.


## Approved correction: defeat the troll permanently

Author rejected the second troll encounter at the treasure-door approach.
Change BASIC line 1530 so only the bat (z%=5) uses the +10 relocation after a
successful sword attack. The troll (z%=3) must instead follow normal defeat
handling, setting p%(3)=0. Keep the victory message and vaporization text.
This removes the reappearance; do not merely hide the creature description.
Preserve the bat's independent behavior unless separately reviewed.

For the next gameplay build, verify: troll begins at bridge room 10; victory
sets its location to zero; entering door approach 20 after that victory has
no troll encounter; incomplete-command parsing remains a separate correction.
Regenerate scenario files so checkpoints after the bridge encounter retain a
zero troll location, and regenerate executable identity/loader fixtures after
the source change. Current live game and checkpoint binaries still implement
the old relocation; this approved fix is queued with the walkthrough batch,
not silently applied to live memory. At turn 8 we remain in cavern 21 after a
blocked NORTH command. No move into the second troll encounter was made.


## Checkpoint 3 — tunnel after treasure-door review

At door room 20, the repeat troll missed one sword attack and fell on the
second. Actual Viewer commands then NORTH to 21, SOUTH to long tunnel 24,
LIST; inventory compass/sword/candle/rope confirmed. Brick and diamond left
uncollected. Door remains locked. Replayed the exact recorded commands from
CHECK2 on the native machine to capture every persistent field and RNG.
Evidence: docs/evidence/caverns-scenarios/check3-captured.json.

Author-approved scenario refinement: set only p%(3) from its old repeat
relocation destination 30 to zero. CHECK3 therefore keeps the troll removed;
this adjustment is explicit and is not claimed as an unchanged-game witness.
Other state: room 24, moves 37, fatigue 6, RNG 4002a021. The general BASIC
permanent-troll-defeat source edit is still queued for the review batch.
Fresh-machine comparison of CHECK3 and all other bundled scenarios passed.

Room 24 comparison: both versions have north to 21, south to 26, west blocked.
Current BASIC additionally has east to candle cavern 18; Caverns80 blocks
that non-reciprocal shortcut. Both descriptions mention a north–south tunnel
and faint glow from an eastern wall crack. Recommend blocking the east
shortcut, retaining the crack as visible scenery; describe north/south as
actual exits. No additional corridor/temple exploration yet.


CHECK3 was then loaded through the actual Viewer using CAVLOAD CHECK3.
LIST confirmed compass, sword, candle and rope at the tunnel. Current live
review is paused in room 24, with the author-approved absent-troll checkpoint
applied. No southward exploration beyond the tunnel has been performed.


Bomb classification reaffirmed by the author: the original room-number
decrement is a bug. This is already corrected in the running BASIC and all
current CAVLOAD checkpoints, unlike the still-pending general troll and map
repairs. Source evidence: CAVBASIC.BAS 1610–1620; documentation caverns.md
and caverns-original.md. No additional game change or live command required.


## Round chamber review — room 26

Actual Viewer CHECK3 continuation turn 2: SOUTH from tunnel 24 to chamber 26.
Description: large round room, mystical dark-purple walls, chalk star in the
floor centre, hidden chamber of Loki's monks. No loose objects or creatures
are listed; initial object table also has none here. No pickups or further
movement. All four exits match Caverns80: N24 (tunnel), S27 (river ledge),
W29 (dark cavern), E25 (dark cavern). The room description also matches,
including the missing space in "staris"; record that as a minor text repair
rather than a map difference. Exit destinations are source-inspected; only
SOUTH to 26 was entered live. Visible exit descriptions could be clearer in
both versions; "a number of exits" does not give their bearings.


## Subterranean river ledge — room 27

Actual Viewer CHECK3 turn 3: SOUTH from round chamber 26 to river ledge 27.
Screen: narrow ledge high above a subterranean river, exit east. No loose
objects or creatures. Stopped; no eastward move yet.

Important Caverns80 correction: north returns to chamber 26, matching the
southward approach; current BASIC north jumps to candle cavern 18 instead.
East to balcony 28, south/west blocked, match in both versions. Caverns80
also explicitly describes passages north and east. Recommend adopting the
north-return repair and the matching prose together; it removes a shortcut,
not a puzzle gate, and the repaired upper-cave network remains connected.

Torture chamber 23: source search finds only its descriptive text and generic
room/item handling, no dedicated object or action. Its role is a junction and
atmosphere. No hidden payoff should be implied by guide advice.

Author questioned surface river north versus underground river south. Later
room 45 explicitly says its waterfall brings surface water down from Gioll;
room 40 mentions water entering through the cavern roof. These support a
multi-level connected water system, but do not prove the precise bearing or
identity of every visible stretch at room 27. Flag a coherent geographic and
description audit; do not invent a flow direction or assert this exact ledge
is directly below a particular surface room without further evidence.


CHECK3 live review turns 4–9: returned from ledge 27 to round chamber 26 via
the old map's N18,W23,N22,W21,S24,S26 detour. No objects collected or creatures
encountered. This demonstrates the return-path confusion addressed by the
Caverns80 27N26 correction. Current room is 26. The chamber is described as a
hidden chamber of Loki's monks; the actual temple is room 35, visible from
balcony 28 reached east from ledge 27. No ledge-specific puzzle/item exists.


## East side cavern — room 25

CHECK3 actual Viewer turn 10: EAST from round room 26 to cavern 25.
Description only "You are deep in a dark cavern." No objects or creatures.
Current BASIC: west goes to tunnel 24 (not back to round room 26), south to
river ledge 27, north/east blocked. Caverns80: west returns to 26; all other
exits blocked. Recommend its reciprocal west return and removal of the south
shortcut, while noting the resulting room is an empty atmospheric dead end.
Room-26 exit destinations matched both versions; this destination room's
return paths do not. Only EAST was executed; stopped in room 25.

Bat-caves question: the key initially occupies cavern 34 near bat colony 33;
its special handler opens the hut door at 2 and temple gate at 35. It is useful,
not merely a scoring pickup. No movement toward the bat region was made.


## Bat-cave approach and difficulty review

CHECK3 live turns 11–14: WEST from side cavern 25 to tunnel 24, SOUTH to
round room 26, WEST to approach cavern 29, SOUTH to bat colony 33. Stopped
there; no key pickup or further exploration yet. No hostile creature was
encountered along the approach. The single transport bat remains at 17 in
this checkpoint; the colony's descriptive bats are not an active enemy.

Author reinforced adopting Caverns80 navigation repairs unless a change seems
questionable. Room 25 has no item or special interaction; its return repair
and removal of south shortcut are adopted for the next map batch.

Bat-region source comparison (N,S,W,E):

| Room | Running BASIC | Caverns80 |
|---|---|---|
| 29 | 0,33,0,26 | 30,33,0,26 |
| 30 | 29,31,0,0 | 0,29,0,32 |
| 31 | 32,0,0,0 | 33,0,32,0 |
| 32 | 33,30,0,0 | 0,0,30,31 |
| 33 | 0,31,34,0 | 29,31,34,0 |
| 34 | 0,0,0,33 | 0,0,0,33 |

Recommend the Caverns80 set: every ordinary link in this region then has its
opposite return. Key placement at 34 is unchanged. The direct round-room/key
trip and return takes 6 movement commands in the corrected map, versus 9 in
the original using the shortest route, and avoids a forced asymmetric loop.
The optional surrounding loop remains explorable. This is navigation repair,
not bypassing a puzzle/creature gate. General generic-cavern text remains poor
for distinguishing rooms; review landmarks without introducing fake exits.

Colony description matches Caverns80: hundreds of giant bats overhead,
centuries of droppings on the floor, indescribable smell. No loose objects in
33. West to key cavern 34 and south to passage 31 are unchanged. Caverns80's
new north return to 29 removes the original blocked return. No map change
has been applied to the active review build.


Remaining bat-loop geometry exception: Caverns80 makes local returns
reciprocal, but the cycle 29N30,E32,E31,N33,N29 consists only of north/east
moves. It cannot be embedded as ordinary straight compass-directed passages
on a consistent geographic plane. Adopt the return repairs, but explicitly
flag this remaining loop for the author's deliberate-maze decision; do not
claim that reciprocity alone fixes global geography. The key's direct side
branch remains accessible without traversing that optional loop. This is a
potential "seems strange" exception under the author's updated policy.


## Checkpoint 4 — central bat colony

Author requested preserving current inventory and full game state. CHECK4 is
an exact replay/capture of the CHECK3 continuation, with no new state edits.
Room 33, moves 50, fatigue 6, RNG 4002a021. Carried items: compass, sword,
candle, rope. Troll and dragon absent; transport bat remains at 17. Key is
still at 34, diamond at 22 and brick at 24. Treasure door is still locked.
Source JSON and 128-byte CHECK4.CAV are retained with the development files.
Evidence: docs/evidence/caverns-scenarios/check4-captured.json; live screen
recorded separately. No command was entered to advance the live session while
creating this checkpoint. The current live card predates CHECK4's addition;
restore using the updated scenario card or import CHECK4.CAV into that card.


## Bat-cave redesign approach approved

Author approved a smaller, less frustrating maze and delegated a concrete
redesign in the notes. See caverns-bat-cave-refinement-plan.md. The key is the
region's only initial collectible; find it and return to round chamber 26.
The proposed rectangle keeps all six rooms, reciprocal exits and landmarks,
retains the short 26W29,S33,W34 key route, and replaces Caverns80's remaining
impossible compass loop. Room 34 gains an explicit west connection into the
optional loop; its key and purpose remain unchanged. No game edit or live
command performed. Current state remains checkpoint 4 at colony 33, key not
yet collected. Source inspection confirms no additional regional item/gate.


## Key collected and return completed

Author's "do it" continued the walkthrough; no map implementation was made.
CHECK3 live turns 15–23: WEST to 34, TAKE KEY, LIST, EAST to 33, SOUTH to 31,
NORTH to 32, SOUTH to 30, NORTH to 29, EAST to round chamber 26. LIST explicitly
confirmed compass, key, sword, candle and rope. No creatures encountered or
other objects collected. Current live review is paused in room 26. This
old-map detour exercises the return problems already covered in the bat plan;
Caverns80 and the proposed design have different return routes.

Room 34's east return matches Caverns80. Rooms 31/32/30 return differences are
in the recorded bat-region table; all were traversed in the old build, not
silently substituted with corrected paths. Room 32 currently prints "a dark
passage among the bat caves"; Caverns80 uses its generic room description
entry there. Neither provides the distinctive landmarks now proposed. Record
the current key-description typo "an old an rusty key" for a copy edit.


## Temple balcony — room 28

CHECK3 Viewer turns 24–25: SOUTH from round chamber 26 to ledge 27, EAST to
balcony 28. Actual description: huge cavern converted to a pagan temple,
dedicated to Loki, exiled by Odin and awaiting the End Of All Things. No
loose items or hostile creature displayed. Inventory still compass/key/sword/
candle/rope. Stopped before any rope action.

Balcony compass exits match Caverns80: west to ledge 27; north/south/east
blocked. Description also matches. The ledge's repaired north return remains
the already-recorded Caverns80 difference; no new balcony navigation repair.
Current BASIC USE ROPE is sufficient: handler 1630–1640 moves to temple 35,
leaves the rope at balcony 28 and describes a final ten-foot drop. There is
no climb-up return. No separate tie-to-rail requirement should be invented.
Potential descriptive improvement: explain the temple floor is below and hint
at a rope descent, with a clear one-way warning before committing; current
text gives the mythology but no visible descent cue. Not implemented.

The temple region's Caverns80 eastward link is still subject to the previously
flagged puzzle-bypass review (NAV-07); do not automatically import that link
while applying ordinary navigation repairs.


## Rope sequence approved; checkpoint 5 on temple floor

Author agreed to describe a rail, require TIE ROPE TO RAIL, confirm attachment,
then make DOWN perform the warned one-way descent. USE ROPE should explain the
sequence. Concrete design: caverns-rope-refinement-plan.md. This is an approved
future change; the current program/scenario format has no tying state.

Author requested descent now under the existing rule. CHECK3 live turns 26–27:
USE ROPE described stopping ten feet above the floor and jumping the remainder,
then entered temple 35; LIST showed compass, key, sword and candle. Rope is
left at balcony 28. Gate still locked; giant Loki statue described. No active
creature or loose object displayed. No further command entered.

CHECK5 captures the exact recorded continuation: room 35, moves 61, fatigue 6,
RNG 4002a021, no new author state adjustment. All nine bundled checkpoints
passed native fresh-machine full-state comparison. Current live review remains
on the temple floor. Updated scenario card or CHECK5.CAV import is needed to
restore this new slot on an older already-loaded card.

Caverns80 comparison: same temple description; it adds east to wizard cavern
36 while current temple has no compass exit before using the key. This is the
flagged NAV-07 puzzle bypass, not a routine geometry fix. Recommend preserving
the key/gate/crypt progression until an explicitly justified alternative is
agreed. Caverns80 CMDDOWN also resets sword fatigue; current BASIC keeps it.
That combat-balance difference is recorded separately, not silently adopted.


## Entrance clue, bat transport and candle availability

Author agreed to preserve the temple gate/crypt progression rather than add
the initial east bypass. Keep current temple east blocked; a shortcut opened
after solving the section remains a separate possible refinement.

Source inspection: entrance 16 east leads to passage 17, whose wall reads
"Find the Sacred Key of Thialfi". The transport bat starts there. The clue
and bat are visible before the next action; LOOK/LIST/SCORE remain safe in
the current BASIC. On the next non-informational action the bat carries the
player to colony 33, then relocates itself from 17 to 24. No fight is required.
This is an alternative entry to the region containing the key at 34.

Without a candle, room 33 prints the darkness message instead of the room
and loose-object descriptions. Source 70–90 does not automatically kill the
player or impose a separate random darkness death; compass navigation still
works. Thus this is an unfair blind-navigation/preparation trap, not an
instant-death rule. Known hazards or hostile encounters elsewhere can still
kill the unprepared player; do not claim darkness itself does so here.

Placement recommendation: move candle item 21 from initial room 18 to room 16
(the daylight entrance), with explicit visible-item text and a hint that the
passages beyond daylight require a light. This makes it available before
the east/south choice. Retain the current lit-candle behavior for this interim
placement change; the separately proposed matches and lighting-time rules
must be implemented together later. Do not silently make the candle unlit
without providing a working way to light it.

Caverns80 keeps the same clue, bat-delivery destination and candle placement
at 18; it does not solve this preparation issue. Its bat carry also resets
sword fatigue, another recorded combat-balance difference, not part of the
placement fix. Consider a clear pre-transport warning/safe retreat if needed;
placement alone makes preparation discoverable but does not force a pickup.

No game command was entered; current review remains at checkpoint 5 on the
temple floor. Current checkpoints still reflect the old candle placement.


## Entrance inscription provenance — author-requested refinement

Author found the bare "Find the Sacred Key of Thialfi" instruction too
arbitrary and requested framing it as a message from an earlier explorer.
Describe rough, weathered writing scratched into the rock rather than an
unexplained narrator instruction. Preserve the key reference while giving
the clue an in-world source. Suggested draft, not final copy:
"Scratched into the rock, apparently by an earlier explorer, are the words:
'Seek the sacred key of Thialfi. I could go no farther without it.'"
Do not add a collectible journal or invent a new puzzle around the inscription.
Caverns80 retains the same bare wall instruction; this prose refinement goes
beyond that version. Note only: current game and checkpoint 5 unchanged.


## Temple available action and key handling comparison

At current room 35/checkpoint 5, the locked north gate is the intended onward
puzzle. Current BASIC accepts UNLOCK GATE WITH KEY (WITH routes to tool use)
or USE KEY, prints "You opened the door", places key item 19 at room 35 and
moves to crypt 37. This does not persist an ordinary open north exit in the
map. Crypt south returns to temple 35; do not falsely claim the dropped key
is permanently inaccessible. The Loki statue has no bespoke interaction or
collectible; current compass directions remain blocked before a tool action.

Caverns80 requires gate/door plus carried key, prints the appropriate action
message and moves through, but does NOT drop the key. Recommend its key
retention as a separate improvement: preserve the nonconsumable key for the
later hut return and avoid an unexplained item-state change. The temple east
bypass remains a rejected exception, independently of this useful correction.
Only source inspection; no live command, item drop or gate opening performed.


Author approved KEY-01: retain the key after unlocking. Its later purpose is
to reopen the hut at room 2 so treasures can be returned for double points.
Remove the automatic p%(19)=a% drop from the key-use handler in the next
source batch; preserve the carried location (-1). Verify temple and hut uses,
inventory confirmation and refreshed scenario state. No live action performed.


## Why the current key drop does not make completion impossible

Author asked whether there is an alternative full-score route avoiding the
temple gate. In the current BASIC, opening that gate is required to reach the
crypt/lower region and castle. An overapproximated compass graph, granting all
dynamic passages open plus rope descent/GALAR/hut use, still cannot reach
rooms 36–54 from temple 35 without the 35->37 key action. Thus even optimistic
state assumptions do not provide an ordinary gate bypass. Caverns80's 35E36
addition is precisely the separate bypass already rejected for this section.

The key is not consumed: USE KEY leaves it at 35. It can be recovered on a
later temple visit, after learning GALAR. The existing completion witness
(test/caverns-refined-route.json) explicitly does this: trace 62 opens gate
35->37 and leaves key 35; trace 130 GALAR returns from treasure room to 16;
131–139 retrace the upper route and reuse the rope at balcony 28 to reach 35;
140 GET KEY carries it; 141 GALAR returns to 16; 149 USE KEY at 2 enters hut 1.
This witness is used by the previously qualified native full-score test.
The dropped rope can be reused while present at balcony 28 (handler 1392),
so an additional carried rope is not required for that retrieval trip.

Therefore the old mechanic creates an unexplained retrieval chore, rather
than an irrecoverably lost key or proof that the temple puzzle must be
bypassed. Retaining the key, as approved, removes that chore while preserving
the gate/crypt sequence. No game commands entered; still at checkpoint 5.


## One-way descent without key — progression softlock

Author identified the first-discovery trap: temple 35 has no ordinary compass
exit and the key is its only intended onward action. GALAR technically returns
to entrance 16, but its clue is later at the castle, so prior knowledge or a
guess cannot count as a fair recovery. Darkness/blocked moves are not an
immediate death rule; the issue is being stranded until quitting/restarting.

Recommended safeguard for the agreed rope design: make the locked gate below
visible in the balcony description; require the key to be carried before DOWN
commits. Explain the missing-key problem and keep the player safely above.
Do not restore the rejected temple east bypass or silently make the rope
climbable. This is a proposed refinement awaiting the author's response, not
a live code change. Current checkpoint 5 has the key and remains safe.


## Reusable rope ascent approved — supersedes the key guard

Author approved UP to climb the secured rope back to balcony 28. Remove the
short-rope/final-jump text and show it reaching the temple floor. This replaces
both the one-way commitment and the proposed key check before descending.
Canonical revised design: caverns-rope-refinement-plan.md. No live map or
source change; checkpoint 5 continues to represent the old build.

## Gate opened into crypt — room 37

CHECK3 live turn 28: UNLOCK GATE WITH KEY printed "You opened the door" and
moved 35->37. The old handler left the key at temple 35, as previously warned;
key retention remains an approved pending fix. Current inventory is therefore
compass, sword and candle; rope remains at balcony 28. No extra action entered.

Actual crypt description: musty resting place of hundreds of Loki devotees,
a carved three-letter-word riddle (G--- / ---X), putrefaction and decay. No
loose objects or creature displayed. South returns to temple 35; east is
blocked until the word opens it; north/west blocked. These initial compass
exits agree with Caverns80 (its eventual east opening also leads to cell 38).

Important separate puzzle difference: Caverns80 replaces the G---/---X riddle
and APE word with four carved stones, a READ prompt and a VARD clue. This is
a puzzle/content rewrite, not a map correction to adopt automatically. Keep
it flagged for the author's review, preserving the current clue until a
deliberate choice. No riddle answer or READ command has been entered live.


## Crypt clue alternatives and spell effect

Author agrees the original G---/---X riddle is weak and asked for Caverns80's
replacement. Its READ response is: "The keeper stands in four stones, from
left to right: V, A, R, D. Speak his name, and the eastern seal shall yield."
It therefore supplies VARD as a keeper's name. This was initially candidate
copy; the author subsequently explicitly approved adopting the replacement
(see CRYPT-01 and the cell-entry review below).

Original APE completes GAPE and APEX. Current handler 1260–1270 sets E%=38,
prints that the crypt's eastern wall slid open, and leaves the player in
crypt 37. EAST must then be entered to move into cell 38. This is passage
opening, not teleportation. Caverns80's VARD uses the same destination/effect.
Its handler additionally checks that the player is actually in the crypt;
current BASIC can set E% from elsewhere. Recommend location scoping with the
future clue rewrite. Current running word is still APE. No spell, READ or
movement command entered during this explanation; still in crypt 37.


## VARD replacement approved; eastern passage entered

Author approved Caverns80's crypt clue as an improvement and instructed saying
the current word and proceeding. CHECK3 live turns 29–30: SAY APE printed that
the crypt's eastern wall slid open; EAST entered cell 38. No further action.
Current clue/word remain unchanged until the source batch; future replacement
is VARD with its keeper/four-stones clue and crypt-only activation. Ensure any
READ prompt is backed by a supported command, or show the clue directly.

Actual cell text: tiny cell, western wall firmly closed again, ventilator
shaft on the eastern wall. A rusty ventilation grill is listed; no creature.
The room description matches Caverns80. Initial blocked compass exits and
conditional overrides also match: north depends on waterfall discovery, east
opens through removal of the grille, south/west blocked. Caverns80's GET
handler explicitly opens the same east exit to 39 when taking the grille.
No item has been taken here; inventory remains compass/sword/candle, key left
at temple 35 by the old handler, rope at balcony 28.

Additional combat-rule observation while inspecting the reference: Caverns80
resets sword fatigue after every successful compass move, not just descent or
bat transport. Current BASIC retains cumulative fatigue. Keep this as a
separate combat-balance review rather than silently importing it with map or
clue repairs. No combat has occurred in the lower region so far.


## Language and spelling policy — UK English

Author explicitly requests correct spelling and UK, rather than US, English
in the refined game's player-facing prose, help and supporting documentation.
Use "ventilation grille" for the metal cover. Current source noun "grill"
should remain an accepted parser alias when the displayed spelling changes,
so correcting prose does not break familiar commands. Also accept GRILLE.
Do not rewrite BASIC language keywords or required system command spellings.
Preserve the archival recovered listing; apply copy edits to the refined port.

Include a copy-edit pass for typos already observed ("staris", "old an rusty",
"instuments", "drawf", missing spaces/awkward wrapping), grammar, punctuation
and consistency of names/bearings. Keep compact-screen line wrapping readable.
This is recorded for the implementation batch; no live text or parser changes
have been made during this note update.
