# Caverns original/current editorial audit and reform register

Author-review spoilers. Source inspection, not an implemented text revision.

This audit judges the differences in the [complete text inventory](caverns-text-comparison.md)
rather than treating a list of differences as completed editorial review.
Original text is pinned to the protected MicroWorld BASIC source from the
Caverns remote repository. Exact source statements and hashes are retained in
[the inventory](evidence/caverns-text-audit/inventory.json). Machine-readable
findings are in [the reform register](evidence/caverns-text-audit/reform-register.json).

## Important distinction

The current temple has not lost its entire statue paragraph. Its original
locked-gate sentence was altered and a separate terse gate status was added.
The result is duplication and disrupted voice. Other scenes, notably the
wizard, dragon and dwarf introductions, genuinely lost distinctive details.
Both defects need repair but they should not be reported as the same thing.

Most rich room prose has been recovered already. Modern exit additions,
separate state messages and creature introductions account for much of the
remaining problem. Some original text was always terse or awkward. The audit
identifies provenance instead of attributing every defect to the revision.

## Concrete reform list

### SCENE-01: Wizard entrance

**Comparison:** Original lines 200 / current FOE_INTRO. Swirling mist, outstretched hand and the full challenge were condensed into a generic blocking-the-way sentence.

**Action:** Recover the original scene with shall/shalt and grammar corrected; avoid repeating a first appearance on every redisplay.

### SCENE-02: Dragon entrance

**Comparison:** Original 202–203 / current FOE_INTRO. Enormous green dragon, flickering eyes and leap were shortened to a waking/fire sentence plus the generic creature listing.

**Action:** Recover evocative details. Avoid repeated awakening and duplicate introduction. Correct missing of in jets of fire.

### SCENE-03: Dwarf entrance

**Comparison:** Original 205 / current FOE_INTRO. Lantern, quoted duty and lunge were removed from the richer scene.

**Action:** Restore the original scene with dwarf and word-spacing corrected; retain current encounter behavior.

### STATE-01: Temple gate

**Comparison:** Original 40 / current room35 and gate status. Original statue paragraph still exists; extra gate fragment duplicates and interrupts it.

**Action:** Use the original integrated locked-gate sentence and an open-state variant. Delete North gate locked/open fragments.

### STATE-02: Treasure door

**Comparison:** Original 28 / current room20 and door status. Original full inside-locking description moved into terse East status.

**Action:** Restore original meaning in full sentences with approved explosives hint. Remove repeated east label. Keep different truthful blasted state.

### STATE-03: Rope

**Comparison:** Original 163–164 / new rope handlers. Old unsafe short rope was deliberately replaced by secure two-way rope; new messages are terse.

**Action:** Keep safe agreed mechanics. Expand confirmations. Delete automatic Use UP or DOWN coaching. Do not restore the ten-foot shortfall.

### STATE-04: Crypt seal and shaft

**Comparison:** Original 127 / current seal and shaft statuses. Original animated eastern wall now uses terse East seal/shaft status and command instructions.

**Action:** Describe the opening naturally. Retain VARD and reversibility; keep physical grille-size information without a compressed command list.

### STATE-05: Drawbridge

**Comparison:** Original 49,58 / current room49 and bridge status. Original magical lowering/waters imagery replaced by technical status/crossing language.

**Action:** Restore wonder where compatible with current lowered/raised state. Full sentences for both states, not East drawbridge raised/lowered fragments.

### MESSAGE-01: Chasm death

**Comparison:** Original 121 / current fatal movement. Original stumbling/fall/rocks scene shortened to a generic fall-and-die sentence.

**Action:** Offer the original atmospheric version with mechanical correction. Preserve only the approved warned crater hazard, not removed surprise deaths.

### MESSAGE-02: Creature death and aftermath

**Comparison:** Original 112,154 / current CREATURE_KILLS and sword aftermath. Named-creature death and fuller black-cloud disappearance are now generic/shortened.

**Action:** Recover creature-specific identification and original cloud imagery. Keep permanent defeats and the dragon corpse exception.

### MESSAGE-03: Score/ranking introduction

**Comparison:** Original 105,192 / current ending and ranking. Full adventurer-ranking introduction shortened to Ranking.

**Action:** Use natural original score/ranking language integrated with the approved homecoming and optional continued exploration.

### MESSAGE-04: Combat responses

**Comparison:** Original 145,148–151,153 / current SWORD. Most combat wording survives. He/his and head-blow language is original, not newly introduced abbreviation.

**Action:** Correct pronouns and creature-appropriate actions as separately requested. Preserve RNG, fatigue, hit odds and outcome semantics.

### MESSAGE-05: Candle/bomb responses

**Comparison:** Original 59,62,158,160,161 / current lighting/bomb. Some shorter text reflects removal of insulting replies and arbitrary bomb relocation.

**Action:** Do not restore old side effects or room subtraction. Recover fuse/explosion atmosphere only where truthful; keep helpful non-insulting full sentences.

### MESSAGE-06: Inventory/action confirmations

**Comparison:** Original 68,74,94,98,165 / current shared printer. Many headers and trailing commas are original. New Taken/Dropped confirmations are modern additions requested by the author.

**Action:** Preserve confirmations; use natural sentences and correct singular/plural/list punctuation. Do not call inherited punctuation an AI-created loss.

### MESSAGE-07: Opening and restart

**Comparison:** Original 3–4,105–106 / current banner/end. Presentation-only platform effects omitted; credits changed as authorised; guidance/homecoming added.

**Action:** Keep 1982–83/GPL2019. Optional HELP for controls; do not restore platform graphics/music dependencies merely for source similarity.

### MESSAGE-08: Transport and commands

**Comparison:** Original 109,120,125,128–143,170–172 / current command/action handlers. Some replies survive exactly; bat destination is more explicit; teleport sentence retains original past-tense shift.

**Action:** Retain useful clarity with grammar fixes. Do not imply shorter text necessarily lost imagery where the original was already brief.

## Individual disposition for every room

Read alongside the original/current paragraphs. All rows are review findings; none denotes an applied edit.

| Room | Disposition | Finding and next action |
| --- | --- | --- |
| 1: HUT | Retain original; trim added guidance | Darkened room and northern door survive. Added hut/clearing detail is useful only if it avoids duplication; remove the unnecessary comma. |
| 2: HUT_CLEARING | Retain corrected prose | Original clearing/window/latch scene survives with a missing-word correction. Keep west/east paths but use natural low-comma sentences. |
| 3: DARK_FOREST | Retain imagery; trim additions | Original dark forest and distant river survive. Glinting water is modern embellishment; assess it openly rather than calling it archival. Keep useful exits once. |
| 4: CLOVER_FIELD | Retain approved bearing fix | Original northward hut reference conflicts with the corrected map. Keep the western clearing and eastern slopes without a compressed destination list. |
| 5: RIVER_CLIFF | Retain original; neutralise arrival | Glacial cliff and foot-beaten path survive. Keep the restored missing space. Change returns east to leads east if the exit sentence is needed. |
| 6: RIVERBANK | Retain original and useful exit | Gioll and the east/west fork survive. The northward climb adds new information; retain it without an unnecessary connective comma. |
| 7: CRATER | Retain original and approved warning | Crater, slippery rim and rising vapour all survive. Keep the explicit fatal-west warning and safe east route as reaffirmed by the author. |
| 8: OUTCROP | Retain corrected geometry | Original height and distant bridge survive. Keep the distinction between seeing the bridge and reaching it; concise detour guidance must not repeat the same bearing. |
| 9: YMIR_SLOPES | Retain weather and routes | Original arctic winds/cold survive. Mount spelling and comma-splice fix are reasonable. Describe western field and southern path in natural sentences. |
| 10: BRIDGE_APPROACH | Trim repetitive modern addition | Original precipice, Gioll, mountain and string bridge survive. The added north-return phrase repeats the mountain bearing; consolidate without losing southward crossing information. |
| 11: STRING_BRIDGE | Apply explicit author edit | Original creaking/swaying survives. Collapse warning is obsolete with the reusable bridge. Use the agreed north/south sentence and remove the redundant side-footing clause. |
| 12: SOUTH_LANDING | Retain original; rewrite added exits | Original southern-bank sentence survives. Added north/west/east directions are useful new information but their comma-heavy list needs the author style pass. |
| 13: MUSHROOM_ROCK | Retain original scene | Oak forest and poisonous mushrooms survive. Two modern route sentences can remain if clear and non-repetitive; remove unnecessary comma before and. |
| 14: BASALT_CLEARING | Retain original emphasis | Basalt formation and VERY interesting cave survive. Northern exit addition must not assume the player arrived from the forest. |
| 15: ROPE_CLIFF | Retain corrected vantage point | Original cliff view is expanded to a shelf on the southern bank. Keep physically clear positioning; remove return-language assumptions and excess punctuation. |
| 16: ENTRANCE | Retain original and fairness hint | Original sunlight and frightened aside survive. Outside route and need-for-light warning are useful approved additions; do not imply matches already exist. |
| 17: EXPLORER_PASSAGE | Retain author-approved clue attribution | Sacred Key clue survives. Earlier explorer attribution is an approved modern change. Keep a natural westward route without assuming prior visitation. |
| 18: ENTRANCE_CAVERN | Retain useful expansion | Original was only the generic dark-cavern sentence. Modern daylight/north and torture-chamber/west information adds orientation rather than replacing rich original prose. |
| 19: TREASURE_ROOM | Retain original atmosphere | Black elves, Svartalfheim and Viking dream survive. The westward exit is a useful addition; no abbreviated status sentence is needed. |
| 20: TREASURE_DOOR | Restore original; reform dynamic states | Original small oak door locked from inside was replaced by formidable-door prose plus a terse status. Restore its meaning in natural closed-state sentences without the repeated east label. Open-state prose must not describe an intact door. |
| 21: NORTH_CAVERN | Apply explicit author edit | Original generic cavern was expanded. Remove north of the long tunnel from the opening. Introduce a long tunnel south and an oak doorway north without assuming prior visits. |
| 22: CORRIDOR | Apply explicit author edit | Original corridor/breeze survives but its directional breeze changed. Call it a corridor as requested. West leads to a different cavern, not back to the entrance cavern. Keep south to torture chamber; no new eastern exit. |
| 23: TORTURE_CHAMBER | Preserve original scene; clarify exit | Original grotesque instruments, blood/bone and croaked-it voice survive with spelling/spacing fixes. Only clarify the modern eastern cavern destination and remove unnecessary comma. |
| 24: LONG_TUNNEL | Resolve misleading addition | Original north/south tunnel survives. Sealed was invented later. Author allows removal or improvement of the whole glowing-crack sentence; do not invent a puzzle or light source to explain it. |
| 25: SIDE_CAVE | Retain useful expansion | Original was generic dark cavern. Modern empty side-cave distinction and sole west exit are helpful; avoid back as an assumption if not needed. |
| 26: ROUND_CHAMBER | Apply author edits; preserve imagery | Purple walls, chalk star, monks and ambiguous Norse-folk sentence are archival. Remove pagan. Reform the modern abbreviated exit list with a long tunnel and a passage towards the bat caves. Ask about the meaning of them before changing lore. |
| 27: UPPER_LEDGE | Retain original and clearer destination | Original ledge/river and eastern exit survive. Balcony destination clarifies that exit. A northern passage is new useful information; prefer leads to a round chamber. |
| 28: BALCONY | Apply author edits; recover cadence | Original temple dedication/exile/End Of All Things survive in lightly rephrased form. Remove pagan. Rail is modern and necessary for the agreed rope action. Review the added west/below sentences for duplication and retain no automatic command coaching. |
| 29: BAT_JUNCTION | Retain deliberate maze landmarks | Original was generic dark cavern. Draught, junction and pillar are new navigation aids approved in the bat-loop simplification. Write full low-comma sentences and make the southern colony an immediate destination. |
| 30: FORKED_PILLAR | Retain deliberate maze landmarks | Original was generic dark cavern. Pillar and limestone chamber distinguish the modern reciprocal loop; do not claim the new details were archival. |
| 31: LOW_PASSAGE | Retain deliberate maze landmarks | Original was generic dark cavern. Dripping low passage is a new recognition cue; preserve the actual north/east connections in complete sentences. |
| 32: PALE_CHAMBER | Retain necessary new description | The original renderer has no matching description for this room. Pale limestone is a modern landmark, not recovered lost text. Retain it as part of the approved simple loop. |
| 33: BAT_COLONY | Preserve original scene; reduce commas | Original bats, centuries of droppings and indescribable smell survive. Added commas are not needed for the original cadence. Keep genuinely new north/west route guidance. |
| 34: KEY_CHAMBER | Neutralise arrival assumption | Original was generic dark cavern. Key-chamber approach wording beyond the bat colony assumes an entry route; change to neutral location/visible connections. |
| 35: TEMPLE | Restore integrated state-aware original | Original statue imagery remains in the current paragraph. Locked gate became great gate plus an extra North gate locked/open fragment. Integrate locked/open wording into the original sentence and delete duplicate fragments. Balcony text must not assert every arrival was a descent. |
| 36: WIZARD_CAVERN | Retain useful expansion | Original was generic dark cavern. Shaft and river-sound directions clarify the lower region; avoid redundant bearings or a bare exit list. |
| 37: CRYPT | Retain approved riddle change; review lost voice | Original crypt/decay survives. APE riddle was deliberately replaced by VARD. The original monks-liked-silly-puzzles aside was lost too; consider recovering the aside only if it fits the approved clue. Do not restore APE mechanics. |
| 38: CELL | Retain approved reversible route | Original cell survives. Closed western wall is obsolete. Preserve shaft/hatch information in natural prose; remove terse shaft and DROP command coaching from ordinary description while keeping fair physical clues. |
| 39: SHAFT | Retain useful expansion | Original was generic dark cavern. Shaft/cell and southern cavern directions are useful; avoid just beyond as an assumption about arrival. |
| 40: LOWER_LEDGE | Retain river imagery; reform additions | Original ledge, subterranean river and roof inflow survive. Lower-region route additions are useful but currently rely on fragments and semicolon lists. Clarify in full sentences without inventing river flow directions. |
| 41: WEST_DRAIN | Preserve original surprise | Original drainage-network exclamation survives in rephrased form. Prefer its original voice with spacing correction where possible. Added conduit/junction directions are useful. |
| 42: MIDDLE_DRAIN | Review lost shared voice | Original shared drainage surprise was replaced with a neutral introduction. Restore evocative wording where it helps, but do not mechanically repeat one exclamation in every drain. Keep distinctive route information. |
| 43: DRAIN_JUNCTION | Reform new junction/puzzle description | Original shared drainage line replaced by a detailed junction. Keep approved physical hatch/latch clue and real paths. Remove unrequested automatic OPEN HATCH coaching from ordinary narrative if the latch is adequately described. |
| 44: BLIND_DRAIN | Retain useful branch distinction | Original shared drainage line replaced by a blind-branch description. This is a useful modern distinction, not a lost rich individual scene. Keep a natural exit sentence. |
| 45: WATERFALL | Retain original and useful paths | Original waterfall/surface-Gioll sentence survives. Review repeated from phrasing only mechanically. New steps/safe paths should be complete sentences with no invented bearings. |
| 46: PEARL_CHAMBER | Retain deliberate recognition cue | Original was generic dark cavern. Pearl-white walls and a winding height-changing passage clarify the modern geography; do not replace with an abbreviated exit list. |
| 47: STONE_STEPS | Retain corrected staircase geometry | Original staircase/southward direction survives. Current top-of-stairs and waterfall/east-chamber details add orientation. No need to remove useful atmosphere or bearings. |
| 48: CASTLE_VIEW | Preserve original joke | Original crumbling ledge, magic castle and conversational aside survive. Additional east crossing and northern route must not repeat the castle bearing or presume entry route. |
| 49: DRAWBRIDGE | Restore wonder where compatible | Original drawbridge lowering by magic was replaced with golden-bridge and mechanical status prose. Preserve present crossing rules but consider restoring original magical voice rather than a technical crossing-secures explanation. |
| 50: COURTYARD | Preserve original exuberance | Courtyard WOW, really-something castle, inscription and escape tunnel survive. Added drawbridge/magazine directions need natural wording and restrained commas, not wholesale removal. |
| 51: MAGAZINE | Preserve original joke | Original really-super-castle sentence survives. Westward courtyard guidance adds information; prefer leads rather than back if route-neutrality matters. |
| 52: EAST_BANK | Retain approved bearing correction | Original eastern bank survives. Old eastward cliff tunnel now leads north under the corrected map. Do not restore the wrong bearing; clarify underground river and wooden crossing naturally. |
| 53: WOODEN_BRIDGE | Retain original bridge; remove original duplication | Original wooden bridge survives with useful crossing/path directions. The archival renderer also prints generic dark cavern here; dropping that duplicate was a reasonable cleanup. |
| 54: CONDUIT | Preserve original sensory detail | Original knee-deep freezing water survives with a missing-space fix. Keep the service path and new drains route, removing unnecessary connective comma and assumed known destinations. |

## Editorial sequence and size target

The author requests recovering the imagery before a separate skilled
concision pass. The aim is roughly 30% shorter room descriptions without
losing evocative elements. This is a measured aspiration, not a hard quota or
permission to cut atmosphere. It applies to description prose, not a promise
that the entire executable will shrink by 30%.

1. Reconstruct a full-prose candidate with original scenes and agreed modern
   mechanics. Mark every addition and departure from the original.
2. Remove duplication and weak modern explanations first. Preserve imagery,
   humour, sensory detail, clues, named features and useful distinct bearings.
3. Edit overloaded sentences skilfully, preserving the author's voice, UK
   spelling and restrained commas. Avoid labels, telegram-like fragments and
   unrequested automatic command coaching in ordinary narration.
4. Show representative before/after passages for author review. Resolve
   ambiguous lore instead of inventing its meaning.
5. Measure room-description characters and encoded bytes, engine messages,
   logical executable size, record-padded COM size and runtime headroom
   separately. Compare the concise candidate with the full-prose candidate,
   not a cherry-picked baseline. Do not mistake word count for memory saved.
6. Apply and qualify a bounded text increment only after these decisions.
   Reissue checkpoints and refresh card/Viewer after behavior and size checks.

No executable, source BAS, runtime, map, checkpoint or starter card changed in
this audit. All reform items remain pending application. The audit is an
editorial judgement from source inspection, not proof every possible wording
problem has been found or that the prose has had the author's final approval.
