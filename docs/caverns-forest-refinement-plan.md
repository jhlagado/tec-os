# Agreed forest refinement plan

Author instruction during gameplay review: simplify the outdoor/forest geometry in the Caverns80 style, correct misleading descriptions, and explicitly review purposeful exceptions. This is a change plan; the running review game has not been modified.

## Exact compass changes

These 18 outdoor changes are the Caverns80 repair set for rooms 1–17. The near-hut region has been reviewed; far-side details remain to be checked as the walkthrough reaches them. Zero means blocked. Dynamic destinations are compared initially; this does not undo the already-agreed reusable bridge.

| Room | Direction | Current BASIC | Planned Caverns80-style destination |
|---:|---|---:|---:|
| 3 | North | 2 | 0 |
| 3 | South | 5 | 0 |
| 3 | East | 0 | 2 |
| 4 | North | 2 | 0 |
| 4 | South | 5 | 0 |
| 4 | West | 0 | 2 |
| 5 | West | 3 | 0 |
| 5 | East | 4 | 3 |
| 10 | West | 4 | 0 |
| 12 | South | 13 | 0 |
| 12 | East | 0 | 15 |
| 13 | North | 12 | 0 |
| 13 | South | 12 | 14 |
| 13 | West | 14 | 0 |
| 14 | North | 15 | 13 |
| 14 | East | 13 | 0 |
| 15 | South | 14 | 0 |
| 15 | West | 0 | 12 |

## Room descriptions and retained behavior

- Hut: retain the locked-door/key puzzle; add the agreed compass-importance hint separately.
- Clearing: identify the visible west forest and east clover-field paths, plus the locked south hut door. North remains blocked.
- Dark forest: describe east back to clearing and west toward the river cliff. Remove the unhelpful duplicate south shortcut.
- Clover field: change hut bearing to west; describe west back toward the clearing and east toward Mt. Ymir. Remove the south shortcut and erroneous north return.
- River cliff: east returns to the forest; south descends to the riverbank. West is blocked, replacing the confusing westward return.
- Riverbank: keep north to cliff, west to crater and east to outcrop. Describe the return north as well as the fork.
- Crater: retain the sword and fatal west drop; clearly distinguish that danger from the safe eastward return. North/south remain blocked.
- Outcrop: retain the coin, distant bridge view and westward return. Do not invent an unsupported river bearing.
- Mt. Ymir slopes: retain west to field and south to bridge approach, and make those visible paths clear.
- Near bridge approach: retain north toward slopes and south onto the bridge; remove the duplicate west shortcut. Actor text must reflect whether the troll is actually there.
- Bridge: retain the agreed reusable crossing; replace the midpoint east/west fatal exits with blocked exits and the normal "You can't go that way" response, as subsequently approved by the author.
- Far-side forest, mushroom rock, cave clearing and rope cliff: use the listed reciprocal connections, updating descriptions to agree. Inspect implications of access to the rope cliff before adopting the exact far-side wording.
- Keep the same rooms and useful detours, compass/sword/coin placement, puzzle objects and visible hazards. Do not import Caverns80’s other gameplay rules merely to copy geometry.

## Acceptance checks

- Map and prose agree on every stated bearing and available normal exit.
- Ordinary paths reverse consistently; enumerate deliberate one-way/puzzle/fatal exceptions and obtain explicit keep/change decisions.
- Coin and sword remain accessible and returnable; the near-hut circuit has no accidental loops.
- Preserve the one-way rope and review lower-region puzzle bypasses separately (NAV-07).
- Update route fixtures, run the native full-score quest and room coverage, measure compiled size, then rebuild the source-only starter disk and Viewer together.
- Keep live-session changes out of the current playthrough. Implement after the review batch, retaining its command log and issue list.


## Nearby landmarks and collection guide — corrected map

Use this geometry for the outdoor revision and its descriptions. The live
review remains on the old geometry until the review batch is implemented.
At the southern landing, describe the bridge north, the forest path west and
the rope-bearing cliff face east. South is blocked. Do not claim a compass
bearing for the river's flow that the sources have not established.

| Feature | Corrected route from southern bridge landing | Objects / purpose |
|---|---|---|
| Cliff face overlooking the river | East; west returns | Rope (item 22), useful for the later descent. No new tying/rail requirement is established by this navigation decision. |
| Mushroom rock in oak forest | West; east returns | No collectible item; mushrooms are scenery here. South continues into the woods. |
| Basalt formation and cave clearing | West, south | No collectible item. North returns to mushroom rock; south reaches cave entrance. |
| Cave entrance | West, south, south | Daylight shows paths east and south; north returns outside. No initial collectible item in this room. |
| First inner cave | Continue south from cave entrance | Candle (item 21), to collect for cave exploration; explain lighting through the existing command/help rather than invent new syntax. |

Earlier outdoor collection remains unchanged: compass in the hut (already
carried in this review), sword at the crater (already carried), gold coin at
the rocky outcrop (still uncollected, optional scoring treasure). No outdoor
object placements are moved by these compass repairs. Preserve later puzzle
and encounter checks separately from this navigation/landmark guide.

Acceptance must check these object placements and visible route descriptions
against the corrected graph; do not present corrected directions as commands
for the still-running old-map review session.
