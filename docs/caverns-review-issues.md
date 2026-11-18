# Caverns author gameplay review

> Current revision: the author-approved gameplay batch is implemented. Earlier
> entries below record the running game and proposals at the time. The current
> specification is [Caverns](caverns.md), with the complete
> [map/prose audit](caverns-map-audit.md). See the implementation record at the end.


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
| PROGRESS-02 | Visiting waterfall 45 enables the cell's north exit; visiting temple 35 disables it again, without a stated physical action or useful message. | Confirmed unexplained remote gate. Preserve required progression while replacing this trigger with a clear physical shortcut/unlock and the Caverns80 waterfall/stair route. Design proposal pending. |
| KEY-01 | Using the key silently leaves it in the current room while opening the hut door or temple gate and automatically moving the player through. Caverns80 keeps the key carried. | Author approved retaining the key after unlocking; give a specific gate/door confirmation. Not yet changed in the review build. |
| CRYPT-01 | Replace GAPE/APEX/APE riddle with Caverns80's keeper-name clue and VARD. Restrict opening the eastern seal to the crypt. | Author explicitly approved the Caverns80 replacement. Pending source/description/parser and checkpoint-identity update; running build still uses APE. |
| SWORD-01 | Wizard victory says the sword crumbles but relocates it to temple 35. Author considers this an unnecessary complication; the sword remains needed for later enemies. | Recommend retaining the carried sword and removing the misleading loss/relocation effect. Caverns80 preserves the same effect, so this is a separate simplification beyond it. Pending source update. |
| CELL-01 | Crypt seal opens east into cell, but the cell's west exit stays permanently blocked despite the crypt-side passage remaining open. Closure adds forced routing without another puzzle. | Recommend keeping the opened seal traversable both ways, with west back to crypt while the existing seal-open state is true. Caverns80 retains this asymmetry; proposed improvement beyond it. |
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


## Grille bulk and leaving it aside — proposed cell refinement

Author suggested preventing passage through the narrow shaft while carrying
the grille. Record as a proposed physical constraint, not current behavior:
TAKE GRILLE removes the loose cover; EAST while carrying it explains "The
grille is too bulky to take through. Put it aside first." No injury or forced
loss. DROP GRILLE leaves it on the cell floor, confirms the action and leaves
the opening uncovered; EAST then enters passage 39. No rope is required.

Current BASIC already allows carrying the grille through, and the opening
stays available after dropping it (G%=39 persists). The object is non-scoring
and has no special later use; all carried objects cost one slot, with no
weight calculation. Caverns80 also opens the shaft when the grille is taken
and has no carried-grille movement restriction. This was initially a suggested refinement beyond both versions. The author
subsequently clarified that the cover is literally wider than its opening;
record that physical reason for the intended restriction. Not implemented.

If implementing, distinguish attached cover (P24=38,G=0) from the removed cover
left on the floor (P24=38,G=39). Description and checkpoint state must preserve
that distinction; dropping must not be treated as reattaching it. Say the
cover is loose/removable before the player needs to guess TAKE. Do not add
other arbitrary equipment restrictions to the shaft. No live commands entered;
we are still in cell 38 with the grille untouched.


## Grille left behind; checkpoint 6 beyond the shaft

Author clarified the physical reasoning: the cover is wider than the opening
it covers, so it cannot be carried through. Planned message: "The grille is
wider than the shaft. You'll have to leave it behind." Keep this distinct from
the old generic one-slot inventory rule; no general weight system is added.

Author requested entering and marking checkpoint 6. CHECK3 live turns 31–34:
TAKE GRILL, DROP GRILL, EAST, LIST. Entered cavern 39. Actual description is
only "You are deep in a dark cavern." LIST confirms compass/sword/candle.
No creature or loose object displayed. Grille remains at 38 on the floor;
G%=39 keeps the eastern shaft open despite the same item room as its initial
attached location. E%=38 preserves the opened crypt seal. Key remains at 35
under the old drop rule; rope at 28. Retention/ascent/prose fixes remain queued.

CHECK6 is an exact capture/replay of this recorded continuation with no new
state edit: A=39, U=67, F=6, RNG 4002a021. Native restore checks the complete
state plus a WEST-to-cell/EAST-through-shaft round trip, proving the open flag
survives restoration. Evidence: docs/evidence/caverns-scenarios/check6-*.

Route comparison: current 39N/S/W/E = 0,36,38,0, same as Caverns80. West returns
to cell; south reaches wizard cavern 36, where an enemy is still present.
North/east blocked. Description is generic in both versions. No move into
the wizard's room yet; warn before combat. Current live review paused at 39.


## Wizard encounter — room 36

Author instructed proceeding south and fighting; then requested descriptions.
CHECK3 Viewer turns 35–37: SOUTH from 39 to wizard cavern 36; two ATTACK WIZARD
WITH SWORD commands. First missed; second won. Actual description: "You are
deep in a dark cavern. There, before you in a swirling mist stands an evil
wizard with his hand held outwards...'Thou shall not pass' he cries."

Victory printed "The sword strikes home and your foe dies...", then "Hey!
Your sword has just crumbled into dust!!", then a black cloud vaporizes the
corpse. Current room 36 is clear. No onward movement after the fight.

Important state/text contradiction: BASIC 1531 places sword item 20 at temple
35, rather than destroying it. Caverns80 explicitly does the same in its
wizard victory handler. Record for author review: do not claim permanent
weapon destruction, and do not silently treat the magic item relocation as
clear from the current message. A later required sword encounter still needs
this weapon; returning west to temple 35 can recover it. Current key is also
there under its pending drop correction. Recommend clearer recovery wording
or an explicit alternative rule, subject to author choice.

Compass exits at 36 match Caverns80: north to passage 39, west to temple 35,
east to river ledge 40, south blocked. Current description is generic plus the
wizard encounter; no loose object initially present. Caverns80 additionally
resets fatigue on victory (and movement), unlike this BASIC. No such combat
balance change was applied live.


Turn 38 LIST explicitly confirms only compass and candle remain carried after
the wizard fight. Source-derived sword location is temple 35; no move to
retrieve it has been performed. Key remains at 35 and rope at 28.


## Remaining creatures and sword usefulness

After the wizard victory, the remaining hostile creatures in the live state
are demon 2 at treasure room 19 and dwarf 6 at stone stairs 47. The transport
bat 5 remains at passage 17, with no required sword fight. Troll 3 and dragon
4 are absent in our checkpoint-derived state; wizard 1 is now absent too.
The native completion witness uses the sword against both dwarf and demon;
the demon guards required treasure. Do not imply that losing the sword is
harmless, or that a vague crumbling message explains where to recover it.

Author regards the wizard's sword effect as an unnecessary complication.
Record the simpler direction: retain the sword after that victory. The live
build is unchanged and the sword is currently at temple 35, not carried.
No further game command entered during this explanation; still at room 36.


## Sword recovered; river-access bearings reviewed

Author requested sword recovery and consideration of the river being reached
southwards earlier versus eastwards now. CHECK3 live turns 39–45: WEST to
temple 35, TAKE SWORD, LIST, UNLOCK GATE WITH KEY (using the key still present
there), EAST to crypt's cell, EAST through its still-open shaft, SOUTH back
to cleared wizard cavern 36. LIST confirmed compass/sword/candle. No creatures
encountered, no new spell or grille removal required, and no move to ledge 40.
Current room 36; key still at 35 and rope at 28 under old rules.

Concrete geography review/proposal: caverns-river-geography-plan.md. The first
ledge is south of round chamber 26; the second is east of wizard cavern 36,
after the temple descent and intervening crypt/cell passages. Access bearings
do not determine river flow. Proposed description distinguishes the viewpoints
and relates them to the northern roof inlet/waterfall fed by Gioll, pending a
full geography audit. Caverns80 retains the same vague wording at 40, so this
requires a prose improvement beyond copying the reference map.


## Second underground river ledge — room 40

CHECK3 live turn 46: EAST from cleared wizard cavern 36 to ledge 40. Actual
screen: "You are on another ledge high above a subterranean river. The water
flows in through a hole in the cavern roof, to the north." No item or creature
listed. Stopped without another eastward step.

All current exits and the description match Caverns80: N45 waterfall,
S48 castle-view ledge, W36 wizard cavern, E128 fatal fall. Ledge 48 north
returns safely to 40 in both versions; do not confuse that with its fatal
south edge or closed eastern drawbridge. North is the useful next route for
the waterfall; south is a viewpoint/bridge approach to inspect separately.
Warn before east at 40, since the current text does not identify the lethal
edge. Improved exit/hazard wording and the river-viewpoint plan remain pending.


## Waterfall — room 45; ledge fairness decision

Author rejected the unwarned fatal east move at ledge 40 as inconsistent.
Queue 40E128 -> blocked (0), using ordinary safe rejection and a description
that distinguishes the edge from a passage. Current build remains fatal.
The southern branch from 40 is not merely information: room 48 is the castle
viewpoint and eastern drawbridge approach, useful once the drawbridge is
lowered from room 49. North from 48 safely returns to 40.

CHECK3 live turn 47: NORTH from 40 to waterfall 45. Actual description:
"You are standing near an enormous waterfall which brings water down from
the surface, from the river Gioll." A blood-red ruby is listed. No creature.
Ruby not collected; no action beyond entry has been entered at the waterfall.

Caverns80 description/item placement match. Current 45N/S/W/E = 0,40,0,128;
Caverns80 = 47,40,0,128. Its added north-to-staircase link reciprocates the
existing 47S45 return. Adopt this navigation repair under the author's default
policy: with the rejected 35E36 temple bypass still blocked, this link does
not bypass the earlier key/gate/crypt/grille sequence. It avoids an unexplained
backtrack via the cell. The current build has no north exit here yet.

Important original mechanism: while processing a command at 45, BASIC 880
sets W%=43, enabling cell 38's north exit to drains 43. There is no message or
visible route clue explaining this remote change. At the just-entered prompt
that input-time update has not yet happened; leaving or another command will
apply it. Flag missing discovery text. Caverns80 records the same discovery
on room display and supplies the visible north stair route. Keep the cell
connection as a return/shortcut instead of a required unexplained detour.

East from the waterfall is also an unwarned fatal edge in both versions.
Recommend applying the same safe blocked-direction policy here; flag it as
a proposed companion correction rather than walking into it. South returns
to ledge 40; west blocked. Current live review stopped at waterfall 45.


## Castle-view ledge — room 48

Author asked for SOUTH, SOUTH from waterfall to find the castle entrance.
CHECK3 live turns 48–49: SOUTH to ledge 40, SOUTH to castle-view ledge 48.
Ruby deliberately left uncollected. Actual description: narrow and crumbling
ledge; magic castle on the opposite side of the river, with the parenthetic
"Don't ask me why it's magic...I just know it is". No item/creature listed.
Stopped before any crossing attempt.

Initial exits match Caverns80: north returns safely to 40; west blocked;
south fatal; east fatal/closed crossing until the drawbridge is available.
Current BASIC has 48E=D%, initially128, later49. Caverns80 uses the equivalent
dynamic override. Drawbridge 49 is accessible west from castle courtyard 50;
processing an action there enables the crossing. This is a useful later
castle approach/return route, not only an informational room, but it is not
an available first entry while the drawbridge is raised.

First entry is via the other bank's route 52->50, reached through the drainage/
conduit/wooden-bridge network. The already-visited waterfall enables cell38N43
in the current build, so returning via that unhinted connection is the present
onward route. Caverns80's approved waterfall-to-staircase correction provides
a more discoverable approach; no such edit is in the live build yet.

Prose should explicitly show the raised drawbridge and absence of a safe
crossing. Recommend safe blocked moves rather than unwarned east/south death,
while preserving the eventual east exit when the bridge is lowered. Both
versions retain the same weak warning/prose and fatal defaults here. No fatal
command was entered; current review is paused at 48 with compass/sword/candle.


## Drainage junction — room 43

Author asked for north then the next useful direction towards the castle.
CHECK3 live turns 50–54: N40,W36,N39,W38,N43. Visiting waterfall had enabled
the previously blocked cell north passage, as source inspection predicted.
Actual new text: "Somehow you have gotten into the complex drainage system
of this entire cavern network!!" No item or creature listed. Stopped at 43.

All junction exits match Caverns80: north to pearl chamber 46, south to cell
38, west to drain passage 42, east to drain branch 44. West is the useful
castle approach: 43W42,W41,W54 conduit,S53 wooden bridge,E52 riverbank,N50
courtyard. No NPC on that route. North and east are optional side branches
for the current no-treasure-focused walkthrough; current east branch forces
an indirect visit towards dwarf room 47 rather than an ordinary west return.

Caverns80 repairs neighbouring passages: 42 and 41 become a clear east/west
chain, removing north/south shortcuts; 44 becomes a dead end returning west
43; 46 returns south43 and west47; 47 returns east46 and south45; conduit54
returns east41 instead of the original west41 loop. Adopt these navigation
repairs under the author's default policy; they preserve pearl and dwarf
placements and do not bypass the temple gate. Later riverbank52 removes its
duplicate east-to-courtyard shortcut and changes the tunnel bearing to north;
review its description when reached.

Both versions retain the same generic drain description, so room landmarks
and visible exit text still need improvement. The waterfall/cell discovery
needs a player-facing explanation or the approved visible staircase approach,
not source knowledge. No further west move or side-branch pickup yet.


## Why the cell's north route became available

Author queried "newly available". Exact current trigger: BASIC 880, while
processing an action in waterfall room 45, sets W%=43. The cell's north exit
resolves through W%. BASIC 890 resets W%=0 when processing an action in temple
35. Neither is explained by a switch, door action, discovery message or clear
room description. This is source-derived guidance, not something the player
was told; the later live northward move merely confirmed it worked.

Potential repair, not approved yet: keep Caverns80's visible 45N47 route so
castle/drain access still follows the wizard encounter, then make 43S38 a
physical shortcut that can be opened from the drain side and remains open.
Describe a barred north doorway in the cell and an accessible bolt on the
drain side; reuse the existing gate state if possible. Remove remote reset
on visiting temple. Do not simply open 38N43 from the outset without checking
whether that bypasses the wizard/waterfall progression. This separates a
reasonable shortcut from an arbitrary map change triggered elsewhere.
No live move or source change performed; current review remains in drains 43.


## Checkpoint 7 — inside the drainage entrance

Author agreed this entrance needs better design and requested a new checkpoint
while continuing through it. We had already entered via cell38N43; CHECK7
marks the current position just inside at junction 43, without another move.
Exact continuation of CHECK3: moves 85, fatigue 8, RNG 541b7cad. Compass,
sword and candle carried. Wizard/troll/dragon absent; key at temple35, rope28,
grille on cell floor38. W%=43 and G%=39 preserve both the north drainage
entrance and east shaft; E%=38 preserves the crypt seal. D%=128 keeps the
castle drawbridge unavailable. Ruby, pearl, diamond, coin remain uncollected.

Capture and restore are external scenario operations, not a change to the
unexplained original trigger. Trigger/description redesign remains pending;
the author chose to use this existing entrance for the live review. Current
live game stays at 43. West continues through drains towards the conduit.


Outstanding routes at checkpoint 7: westward conduit/wooden-bridge/castle
approach not yet explored; north pearl/dwarf branch and east drain branch not
visited; entrance-side bat transport passage not played (source inspected).
Ruby, diamond and coin deliberately left. Treasure door visited but still
locked pending bomb. Wizard is defeated and sword recovered; key retention,
rope ascent and navigation/prose fixes remain pending the implementation batch.


## Cell west closure — usefulness and recommended adjustment

Author questioned whether closing the west route is useful. Source shows no
additional puzzle, item or scoring rule depending on trapping the player.
The grille still blocks onward east progress even if retreat west is allowed,
so the closure is unnecessary to preserve that puzzle or the wizard sequence.

It is not even a modelled door-closing event: E% remains 38 after entering the
cell, so crypt east stays open while cell west is statically zero. The live
sword-recovery loop re-entered the crypt-to-cell passage without saying APE
again, confirming the seal never actually reset. Caverns80 keeps the same
one-way arrangement and contradictory closed-wall description.

Recommend: once VARD opens the seal, retain reciprocal crypt37E38 and cell38W37
until a new game. Reuse the existing seal-open state for the return condition;
do not add an independent west flag that can disagree. Update cell description
to show the open western doorway. A player can retreat to the crypt/temple and,
under the approved rope repair, climb back to the upper caves. Do not reopen
the rejected initial temple-east bypass; this return does not skip any puzzle.

Cell east remains a separate grille-removal puzzle; cell north remains the
separate drainage-shortcut redesign. Describe all visible routes/states
clearly. This reciprocal west adjustment is a recommendation in response to
the author's question, not an implemented map edit. No game action entered;
current live review remains at drainage junction 43/checkpoint 7.


## Conduit inspection — room 54

Author questioned justifying the waterfall-triggered opening and requested
visiting the conduit. Clarify terminology: the remote trigger opens cell38N43,
not conduit54 itself. There is no sluice/lever action or causal explanation
in the current program. Do not invent one as an existing fact. A hydraulic
redesign would require a real action and visible effect; the preferred simple
proposal remains a local physical shortcut/door with the visible stair route.

CHECK3 live turns 55–57: WEST to drain42, WEST to drain41, WEST into conduit54.
The first two repeat the generic drainage description. Conduit text: water
up to the knees, freezing cold, draining into the river; narrow service path
south. An interesting stone is listed (treasure item13), no creature. Stone
not collected; stopped in conduit. Current code has no special cold/water
hazard here beyond ordinary global candle/move rules.

Caverns80 preserves conduit description/item and south route to wooden bridge
53. It fixes the return to drains41: current BASIC west41/east blocked becomes
east41/west blocked, reciprocal to 41W54. Recommend/adopt this correction under
the author's navigation policy. North remains blocked. The source's current
westward return is not an intentional flow-direction clue.

Onward castle approach is service path SOUTH53, EAST52 to the other bank,
NORTH50 into the courtyard. This bypasses the raised drawbridge viewpoint,
not the temple gate puzzle. The skipped pearl/dwarf branch remains available
for later review. No further movement, item action or source edit yet.


## Wooden bridge — room 53

Author requested following the conduit. CHECK3 live turn 58: SOUTH from 54 to
wooden bridge 53. Actual screen: "You stand before a small wooden bridge which
crosses the river." Then the generic "You are deep in a dark cavern." No item
or creature listed. Stopped before crossing east.

Both versions have N54 return to conduit, E52 across to the eastern/castle-side
bank, south/west blocked. No bridge collapse or toll/monster event is coded
here. This crossing is the useful first castle approach after the drain route.
Caverns80 preserves the bridge description but omits the redundant generic
dark-cavern extra line (53 is absent from DARCAVRO); adopt that prose cleanup.
Add clear crossing bearings when revising the description. The interesting
stone remains uncollected in conduit54. Current review paused at 53.


## Eastern riverbank — room 52

Author instructed crossing the wooden bridge. CHECK3 live turn 59: EAST53->52.
Actual description: eastern side of river; small tunnel leads EAST into cliff
face. No loose object or creature listed. Stopped before entering the tunnel.

Current BASIC N/S/W/E = 50,0,53,50: both north and east reach courtyard 50.
Caverns80 corrects this to 50,0,53,0 and says the tunnel leads NORTH. Adopt the
paired map/prose repair: north enters the castle's southern escape/service
tunnel, west returns to bridge53, south/east blocked. This reciprocates 50S52
and removes the duplicate east shortcut. It supplies the first castle entrance
without attempting the raised drawbridge at ledge48.

The useful next command in either build is NORTH. No extra movement or item
action yet; current room 52, carrying compass/sword/candle.


## Castle courtyard — room 50

Author requested entering castle. CHECK3 live turn 60: NORTH from riverbank52
through tunnel into courtyard50. Actual text: magic castle courtyard, "WOW!
This castle is really something!", inscription 'hzb tzozi', secret escape
tunnel south. No item or creature listed. No spell or further move entered.

Courtyard exits and base description match Caverns80: E51 powder magazine
(bomb), W49 drawbridge, S52 return through tunnel, north blocked. The castle's
west drawbridge side is the useful place to enable the return crossing to
ledge48; current code treats this as lowering by magic on a visit/action.
Keep it in the route checklist rather than skipping it after taking the bomb.

Caverns80 adds a contextual READ clue: "Speak the name that lies mirrored in
the last light of the alphabet, and the ancient path shall open." This helps
interpret the Atbash inscription (SAY GALAR); current BASIC has no READ helper.
Record as a separate clue/help improvement for author review, not already
implemented or adopted merely because room geometry matches. Do not claim
we have spoken GALAR yet: only the inscription has been seen in this session.

Current position courtyard50, carrying compass/sword/candle. Bomb not yet
taken; drawbridge still unavailable; key remains35, rope28. Deferred optional
routes/treasures remain on the prior checklist.


## Bomb acquired and drawbridge visited — rooms 51/49

Author requested TAKE BOMB, GO WEST. CHECK3 live turns 61–66: EAST from courtyard
50 into magazine51, TAKE BOMB, LIST, WEST50, WEST49, LIST. Magazine description
matches Caverns80 ("powder magazine of this really super castle"); bomb was
listed and then explicitly confirmed carried. No creature or other item.
Room51 west returns50; other directions blocked, matching Caverns80.

Drawbridge text: "You are by the drawbridge which has just lowered itself...
by magic!!" Current exits N/S/W/E = 0,0,48,50 match Caverns80. The final LIST
processes the current BASIC visit-time update D%=49, making the reverse
48E49 crossing available too. West now returns to the earlier castle-view
ledge; east returns courtyard. No crossing or spell was entered after this.
LIST confirms compass, bomb, sword and candle. Bomb was not lit/consumed.

Current world: wizard/troll/dragon absent; dwarf/pearl route still unvisited;
key remains temple35, rope28, grille on cell floor with shaft open. We have
seen and decoded the castle inscription, but have not spoken GALAR in this
session. Current room49, safely paused at the lowered bridge.

Design consequence to review explicitly before implementation: the approved
reusable UP rope will allow walking from the lower region back to balcony28
and upper caves. GALAR will then be a useful fast-travel reward rather than
the sole intended lower-region escape. This does not bypass the gate/crypt
sequence on first entry, but changes the magic word's necessity. Do not add
another arbitrary equipment loss/closure simply to force the spell.


## GALAR used; upper caves revisited

Author explicitly agreed to the reusable-rope consequence: GALAR should be an
optional shortcut in the revised game, not a mandatory escape. Updated the
canonical rope plan. Current one-way build still uses the learned spell.

CHECK3 live turn 67: GALAR from drawbridge49. Screen described a magic wind
carrying the player, then daylight cave entrance16. No further movement.
Carried items remain compass/bomb/sword/candle; no consumption or item change.
The inscription was seen/decoded in the castle before this first live use.

Next main objective is the upper treasure door20: S18,W23,N22,W21,E20 in this
current build (future repaired map uses north from21). Light bomb with candle
there, then inspect the opened east passage/demon. Key remains at temple35
under the old drop rule, so still needs retrieval before a hut-bank finish;
this is a pending correction, not secretly repaired by teleportation. Optional
pearl/dwarf, ruby, stone, diamond and coin branches remain deferred.


## Treasure door blasted open — room 20

Author requested returning to the treasure room and using the bomb. CHECK3
live turns 68–73: S18,W23,N22,W21,E20,LIGHT BOMB WITH CANDLE. No repeat troll
present in the checkpoint-adjusted state. Bomb blast printed: "BOOM! You are
thrown aside as the blast tears the door from its hinges. When the smoke
clears, the passage east is open." Door description changed to shattered
remains beside an open east passage. Player stayed at doorway20; bomb item9
was consumed, T%=19. No entry east into demon room19 yet.

Caverns80's revised handler also requires bomb/candle, a lit carried candle,
and location20, then opens east19 and consumes the bomb without transport.
Its text has the player shelter around a corner as the fuse burns, rather
than being thrown aside; this is a plausible safety/description refinement
for review. Unlike our author-approved harmless wrong-place explosion rule,
Caverns80 refuses a wrong-place detonation without a blast. Keep our explicit
chosen rule; do not restore room decrement or silently import a different
wrong-place policy. Existing enhanced BASIC door hint is stronger than the
reference's "small oak door locked from inside" text.

The important onward route is EAST into the vault/demon encounter. South20->23
returns to the torture chamber; north20->21 returns to cavern; west blocked.
Caverns80 repairs the return to south21 and blocks north, as already recorded.
Stop before entering; warn about combat before attempting treasure pickups.


Turn 74 LIST confirms compass, sword and candle only: the bomb is no longer
carried after its successful use. Current live review remains at doorway20
with the eastern passage open, before the demon encounter.

## Demon encounter — actual native emulator outcome

The former live Viewer process had ended before EAST was submitted. Restored
CHECK7 in the native TEC-OS ROM emulator and replayed recorded Viewer turns
55–74. The reconstructed pre-fight state was room 20, moves 102, fatigue 8,
RNG 541b7cad; compass, sword and candle carried, bomb consumed, door open.
No RNG or live game state was edited. EAST entered room 19. Eleven successive
ATTACK DEMON WITH SWORD attempts failed to kill the demon; the eleventh killed
the player at move 114. The game reported score 2/126 and asked for another
adventure. This is a failed combat trial, not a completion witness or Viewer
trial. No treasure was collected and no victory checkpoint was produced.

Visible treasures: diamond-studded ring, magic pendant, holy grail and
mirror-like shield. The room is described as the legendary treasure room of
the black elves of Svartalfheim. West is the return to the doorway once the
enemy is defeated. The accumulated-fatigue difference already noted above
now has a concrete adverse outcome; evaluate Caverns80's fatigue resets as
part of combat balance. An exact RNG-restoring replay repeats this outcome,
so reloading alone is not a different random trial. Do not silently reseed or
change fatigue to manufacture a win.

Evidence: [pre-fight state](evidence/caverns-scenarios/demon-review/before.json)
and [native emulator output](evidence/caverns-scenarios/demon-review/native-emulator.log).

### Approved fatigue correction implemented and retried

The author approved the proposed Caverns80 fatigue resets. BASIC now clears
F% after a successful compass move, GALAR travel, bat transport, rope descent
and combat victory. Blocked moves and unsuccessful sword attacks retain F%.
No other combat probabilities, map links or parser rules changed.

Native BAZA rebuild: 39,808 bytes, SHA256
87874b600c2d344dc782c41d8ff93ffcf5c54ed947e7918b0f84021353bc9056.
All existing external checkpoint identities were regenerated for this binary;
their object locations, flags, counters and saved RNG values were preserved.
Historical evidence above still describes the previous executable.

Restored CHECK7 and replayed the recorded continuation to the doorway again.
Travel naturally reset fatigue to zero. Kept RNG 541b7cad unchanged. EAST and
eleven sword attacks now defeated the demon at move 114; victory reset F% to
zero. No reseeding or live-state editing was needed. The sword remains carried,
with compass and candle; all four vault treasures remain on the ground.
The externally captured post-victory state is available as CAVLOAD VAULT.
This is a native TEC-OS emulator trial; Viewer and physical-board validation
of this revision remain outstanding.

Evidence: [retry state and commands](evidence/caverns-scenarios/demon-review/fatigue-reset-result.json)
and [retry output](evidence/caverns-scenarios/demon-review/fatigue-reset.log).

## Checkpoint 8 return to the hut — completed in native TEC-OS emulator

Author requested only the four vault treasures, then a key-assisted return
and deposit in the hut. Restored CHECK8; collected ring, pendant, grail and
shield. SCORE was 40 (38 for these treasures, 2 for the carried compass).
Returned west20, north21, south24, south26, south27, east28, used the rope to
35 and retrieved the key that the old gate handler left there. No additional
combat was needed. GALAR returned to 16; north14, east13, north12, north11,
north10, west4, north2 reached the hut clearing. USE KEY printed "You opened
the door" and entered room 1. The bridge remained intact throughout.

Dropped ring, pendant, grail and shield. LOOK lists all four on the hut floor;
SCORE reports 78/126: 76 for the deposited vault treasures plus 2 for the
compass still carried. Sword and candle are also carried. Final moves 139,
fatigue 0; demon, wizard, dragon and troll absent. Key left outside in room 2
by the still-unrefined unlocking handler. No automatic ending occurred on
deposit; SCORE verifies the banking goal. This is a successful partial-score
return, not an all-treasure completion or a claim about the unmodified original.

Each of four native emulator stages used a complete externally captured
scenario to preserve progress between processes; no state values or RNG were
edited. Staged records include pre/post state and actual command output:
[collection](evidence/caverns-scenarios/hut-return/collect.json),
[key recovery](evidence/caverns-scenarios/hut-return/key.json),
[hut entry](evidence/caverns-scenarios/hut-return/home.json),
[deposit and score](evidence/caverns-scenarios/hut-return/bank.json).
Development snapshot HUT preserves this state without replacing CHECK8.

## Gameplay batch implemented — current qualification

This supersedes the earlier running-game observations and proposed designs.
All 54 descriptions were correlated with the revised graph. Ordinary exits
have opposite returns once gates are opened, except the explicitly self-locking
hut door. Distant bridge/castle views are distinguished from available paths;
upper/lower river ledges and the vertical rope transition are named distinctly.
The complete table and Caverns80 deviations are in caverns-map-audit.md.

Implemented: Caverns80 forest/cave/drain repairs; approved recognisable bat
loop; reusable bridge and blocked accidental side falls; candle at daylight
entrance; first-explorer clue; VARD crypt inscription and reversible seal;
explicit tying and reciprocal rope travel; retained key and wizard sword;
permanent enemy defeats; grille spelling/alias, removal and size constraint;
physical drain-side service hatch using OPEN HATCH; no remote waterfall or
reset-on-temple trigger; inventory aliases; weapon clarification without time
or retaliation; successful pickup/drop confirmations; warning without compass;
fatigue resets; hut welcome, automatic treasure deposit, score and ranking,
full-score completion message and optional continued exploration.

The old unpaired wizard-to-temple shortcut was removed in both directions
rather than importing Caverns80's puzzle bypass. The walking return retraces
shaft, cell and crypt to the temple. Its gate stays unlocked after key use.
The waterfall's visible staircase makes the original dwarf the first-route
guard into the drains; the hatch becomes a later shortcut. These are explicit
progression decisions rather than unexplained changes to distant flags.

Implementation layout: concise descriptions in DATA, scanned into one temporary
string for the current room; no 54-string heap cache. Existing BAZA and RTL
pins are unchanged. Native compilation fits with shell resident: 39,808-byte
COM. CAVBASIC.COM is retained for verification but removed from public starter
recipe 17, which contains BASIC source plus instructions. Assembly remains
repository/development-only. Developer checkpoint format is now CVB2, storing
rope/gate state and rejecting old versions/build identities. Review presets
were explicitly adapted; original evidence captures remain unchanged.

Native quest evidence: 126 points, 135 action turns, all 54 rooms, description
checks, first discovery of the castle clue before the first spell, full walking
return from castle without GALAR, automatic intermediate/final banking and
optional continuation. Commands run through normal input with no host-side
item/location/RNG writes. Scenario tests separately cover exact RNG continuation,
malformed records, old version rejection, missing-weapon clarification,
key/light-free rope recovery, attachment removal and physical hatch persistence.
TED copy/edit/save/build/run/exit/power-cycle reopen passes. Browser Viewer and
physical-board evidence are separately identified in the qualification record.

Deferred rather than silently claimed complete: matches/unlit candle and a
burn clock starting at lighting; stronger startup entropy; actual in-game disk
saves; physical TEC-1G run; final human review of the revised release. The
retained 230-action candle lifetime and random combat can still end a game.

Browser qualification completed: system Chromium loaded the clean standalone
Viewer built at 7dee8f3, with TEC-OS 2bd6b0a. Its fresh starter contains source,
not COM. Native compilation inside the browser produced the exact qualified
COM, verified by downloading and comparing bytes. TAKE COMPASS confirmed the
action; INVENTORY and the revised clearing description worked. The trial then
restored ROPE, exported CAVE.CAV, and restored it with inventory in a fresh
browser context/card. See docs/evidence/caverns-refinement/viewer-result.json
and accompanying screenshots. Both Viewer recipe/native-build and bundle tests
passed. No public site deployment or physical-board result is claimed.

## Description-only landmark pass

Author narrowed further geography work to wording: distant bearings should
approximately correlate with the route, without another map redesign.
Updated rooms 8, 15, 40, 43, 45, 46 and 48 only. The outcrop sees the bridge
broadly south-east but requires a forest detour; neither upriver nor upstream
is claimed. The lower ledge's southern path leads to a bend, where the castle
is visible east; it does not put the castle itself south. The waterfall's steps
climb north without claiming the whole drain network lies north. Winding
passages identify the route and destination without an invented westward bend.
The rope shelf is explicitly above the Gioll's southern bank.

All 216 exit entries are unchanged. Native build remains 39,808 bytes; all
15 game/scenario/TED tests pass, including a 126-point, all-54-room quest with
actual room descriptions checked. Supporting records live under
 docs/evidence/caverns-wording-pass/. This is not the proposed architectural
rewrite, and changes no parser, random, inventory, puzzle or scoring rule.

The description-only build also passes the two native Viewer recipe/bundle
tests and the actual Chromium compile/play/export/fresh-restore trial. During
qualification, test captures were separated from packaged scenario outputs:
regression tests no longer overwrite build/caverns/scenarios/CAVE.CAV with a
new-game witness. The browser compares its exported checkpoint to the packaged
repository artifact. This fixes a test-artifact collision, not game behaviour.

## Behaviour-preserving BASIC rewrite

The author authorised the structural rewrite after requiring line numbers in
normal ten-step spacing, uppercase keywords/constants and lowercase variables.
The frozen pre-rewrite source/COM/native loader/debug fixture are retained in
 test/fixtures/caverns-baseline/. The rewritten source is generated from a
labelled engine plus world data, but the distributed BAS is ordinary editable
BASIC and compiles natively without the generator.

Implemented: one dispatcher, explicit result/turn cost, one turn-advancement
point, side-effect-free recognition/rendering, separately prepared candle
legacy events, named movement/object/tool/combat/puzzle/score routines, immutable
room/object tables with explicit treasure values, and mapped checkpoint state.
All 285 delivered lines use 10,20,30,... spacing. Variables use short lowercase
names because BAZA identifies only the first two characters; named authoring
constants are uppercase and expand to numeric literals. No compiler or RTL
change was made. Published source still contains original credits/provenance.

Final COM is 39,680 bytes, 128 smaller than the 39,808-byte baseline. All 18
native tests pass. Strict native-binary comparisons matched 480 commands in
36 scenarios, checking exact output (apart from newline/source-error-line
normalisation), all objects, all persisted fields and RNG after each command.
A matched seeded full quest used 145 turns; a separate normal-start quest
scored 126 in 136 turns and visited all 54 rooms. Startup RANDOMIZE can differ
with instruction timing; compared games use the same external seed, never
live game-state/RNG patching. Long-input memory behaviour is tested separately:
the baseline failed with OUT OF MEMORY, while this rewrite handled that input.
This resource improvement is not disguised as exact error-for-error equivalence.

The map, descriptions, puzzles, accepted command semantics, ordinary failure
turn costs and intentional random combat risks are preserved. The wire layout
stays CVB2; actual compiler symbols/addresses and protected executable hashes
are refreshed. Current implementation details: docs/caverns-engine.md. Current
records: docs/evidence/caverns-rewrite/. Historic proposal/wording records above
remain historical rather than descriptions of unimplemented work.

Rewrite integration completed: the source-only Viewer compiled the rewritten
BAS to byte-identical COM, played the opening and exported/restored a checkpoint
in a fresh context/card. Both native Viewer checks passed. A separate native
reader experiment inserted line 151 without changing other numbers and compiled
and ran successfully. Nineteen starter tests passed. A fresh checkout also
packs all matching developer scenarios; their regenerated JSON identities are
committed alongside the ready CAV files. The final evidence and updated book
handover distinguish all these checks from physical TEC-1G testing, which is
still outstanding. No public site deployment or main-branch merge is claimed.


## Author walkthrough: bridge prose — 18 November 2026

Approved wording-only refinement, pending the next game text build: in the
string-bridge midpoint description, replace the final sentence with:

> Hold tight and follow it either north or south.

Remove the redundant clause about there being no footing east or west. Keep
the preceding creaking/swaying description. East and west remain blocked;
no exit or combat rules change. The current running game and published card
have not been changed by this review note.

The author also explicitly reaffirmed retaining the clearly warned fatal
western crater drop as a rare deliberate hazard.


## Author walkthrough: save budget and dragon wording — 18 November 2026

Review notes only: accumulate findings during the author's playthrough; do not
implement game edits yet.

- Investigate a compact complete-state save/restore using the existing 128-byte
  CVB2 semantic payload (objects, creatures, puzzle flags, position, counters and
  RNG). Measure resident snapshot/code costs and any newly linked BAZA file I/O
  dependencies before choosing memory-only or disk persistence. The current
  restored game is 37,248 file bytes; 4,039 bytes before dynamic allocation is
  not all spare feature budget. No save facility has been added. A previous
  large file-I/O size increase needs reproduction before attributing its cause.
- Dragon intro is conditional on the live dragon's object being in the room;
  it disappears after death, and the clearing then describes the corpse.
  However, while alive each redisplay repeats the sleeping/waking sentence,
  followed by the generic nearby-creature listing. Consider a non-repeating
  awakening or less repetitive live-dragon wording. Source inspection verified
  this behavior; no new live combat test or game change was performed here.


## Author walkthrough: candle lighting and creature-specific combat — 18 November 2026

Notes only, deferred until after the ongoing playthrough:

- Reaffirm the earlier proposal for an unlit candle and a box of matches with
  an explicit lighting action. The current candle at the daylight entrance is
  already lit; matches and a lighting mechanic are not implemented. Preserve
  fair access to light before bat transport or deeper exploration, and assess
  inventory, candle-clock, checkpoint and size implications before a change.
- Reduce duplicated live-dragon introductions. Review generic combat messages
  such as a blow to the head for creature-appropriate wording (dragon fire or
  claws, for example), without silently changing combat probabilities.
- Eastern entrance passage currently contains the earlier explorer's Sacred
  Key of Thialfi clue and the giant bat. On the next ordinary action the bat
  transports the player to the bat colony and disappears. LOOK/inventory and
  free clarification paths do not themselves trigger that transport. This is
  a shortcut/alternate route, not a prerequisite for the southern route.


## Author walkthrough: in-game HELP — 18 November 2026

Requested review addition, not implemented during the playthrough: provide HELP
(and consider ? as an alias) with a compact spoiler-free command reference.
Cover movement abbreviations, LOOK, inventory aliases, SCORE, QUIT and restart,
TAKE/GET, DROP/PUT, object use, explicit sword attacks and basic command syntax.
Separate context-specific puzzle examples from general help; do not expose
magic words, solutions or undiscovered objects merely by listing vocabulary.
HELP should cost no turn or candle time and allow no enemy retaliation or bat
transport. Advertise it in the opening banner and keep CAVERNS.TXT consistent.
The current public game has no HELP handler; the external CAVERNS.TXT is the
existing command reference. Preserve all existing memory/size gates.


## Author walkthrough: torture-chamber exit wording — 18 November 2026

Wording review only; current game unchanged. The author finds "the entrance
cavern lies to the east" awkward and requests "the entrance to the cavern lies
to the east". Retain the northward corridor and clarify the eastern return in
full natural sentences. Geography check: east actually reaches room 18, the
inner cavern, and north from there reaches room 16 at the daylight cave mouth.
Resolve the final wording without implying east alone leads directly outside;
"the cavern near the cave entrance lies to the east" is a geographically
explicit alternative for the next prose pass. No exit changes requested.
