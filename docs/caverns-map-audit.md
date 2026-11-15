# Revised Caverns map and description audit

Spoilers: engineering record, separate from the user manual.

All 54 room descriptions name the current paths, not the old graph. With
opened gates, every compass connection has its opposite return except the
hut's self-locking door: leaving north requires the key to re-enter from the
clearing. The native quest visits every room and checks its displayed prose.

## Direction, visibility and level changes

- Hut clearing 2 connects west to forest 3 and east to clovers 4. The hut is
  south of the clearing; the route back from clovers is west.
- Outcrop 8 sees a bridge upriver, without claiming a compass bearing for
  the river's course or providing a direct route there. West is its only exit.
- Balcony 28 and temple 35 are vertically connected by the secured rope.
  UP/DOWN are separate from compass movement.
- Ledge 27 is the upper river viewpoint; ledge 40 is below temple level.
  The directions used to approach them do not describe the direction of flow.
- The route between drain junction 43 and pearl chamber 46 winds and changes
  height. The north/south exits are the beginnings of that passage, not a claim
  that the caverns form a rectangular grid. Its return is explicitly retraceable.
- Viewpoint 48 sees the castle across the lower river to the east. The raised
  drawbridge is a visible, initially blocked eastern crossing. The first route
  goes through conduit 54, service path 53, wooden bridge, eastern bank 52
  and the tunnel north into courtyard 50.
- The wooden bridge crosses this lower underground waterway, not the surface
  Gioll crossing beside the hut. It cannot replace the string bridge as a
  direct route home. No unsupported compass bearing for the entire river's
  flow is asserted. Room distances are not specified.

## Deliberate departures from Caverns80

- The bat loop is a small reciprocal rectangle with recognisable landmarks;
  the key chamber has a second approach, as approved in the bat-cave plan.
- Neither direction of the old unpaired 35/36 shortcut is available. First
  access still requires key, crypt and grille. The walking return is via
  cavern 36 north to 39, west through cell and crypt, south to temple, UP.
  This removes an unexplained one-way link without adding a new magical gate.
- Ordinary bridge-side and lower-ledge compass mistakes are blocked. Crater
  7 retains its explicit, warned western fatal drop.
- A drain-side latch opens the cell hatch physically; visiting the waterfall
  no longer opens it remotely or resets anything at the temple.

The following table lists every remaining difference from the reference's
initial map. Negative values are our explicitly persisted gates, not extra
rooms; the reference applies some of these dynamically in machine code.

| Room | Direction | Caverns80 initial | Revised BASIC |
|---:|---|---:|---:|
| 11 | West | 128 | 0 |
| 11 | East | 128 | 0 |
| 20 | East | 0 | -2 |
| 29 | North | 30 | 0 |
| 29 | West | 0 | 30 |
| 30 | South | 29 | 0 |
| 30 | West | 0 | 32 |
| 30 | East | 32 | 29 |
| 31 | North | 33 | 32 |
| 31 | West | 32 | 0 |
| 31 | East | 0 | 34 |
| 32 | South | 0 | 31 |
| 32 | West | 30 | 0 |
| 32 | East | 31 | 30 |
| 33 | South | 31 | 0 |
| 34 | West | 0 | 31 |
| 35 | North | 0 | 37 |
| 35 | East | 36 | 0 |
| 36 | West | 35 | 0 |
| 37 | East | 0 | -3 |
| 38 | North | 0 | -4 |
| 38 | West | 0 | 37 |
| 38 | East | 0 | -5 |
| 40 | East | 128 | 0 |
| 45 | East | 128 | 0 |
| 48 | South | 128 | 0 |
| 48 | East | 128 | -6 |

## Complete room/description correlation

| Room | North | South | West | East | Description |
|---:|---|---|---|---|---|
| 1 | 2 | blocked | blocked | blocked | Inside the bark hut. The door leads north to the clearing. |
| 2 | blocked | blocked | 3 | 4 | Hut clearing: locked door south, forest west, clover field east. |
| 3 | blocked | blocked | 5 | 2 | Forest path: clearing east, river cliff west. Water glints through the trees. |
| 4 | blocked | blocked | 2 | 9 | Clover field: the hut clearing is west; Mount Ymir's slopes lie east. |
| 5 | blocked | 6 | blocked | 3 | Cliff above the Gioll: forest east; a path descends south to the bank. |
| 6 | 5 | blocked | 7 | 8 | Riverbank: cliff north, crater west, rocky outcrop east. |
| 7 | blocked | blocked | warned fatal drop | 6 | The Gioll pours into a crater. West is a fatal drop. The safe path returns east. |
| 8 | blocked | blocked | 6 | blocked | Rocky outcrop: a bridge is visible upriver, but unreachable from here. Return west. |
| 9 | blocked | 10 | 4 | blocked | Windy slopes of Mount Ymir: clover field west, bridge approach south. |
| 10 | 9 | 11 | blocked | blocked | The string bridge crosses the Gioll southwards. Mount Ymir's slopes are north. |
| 11 | 10 | 12 | blocked | blocked | On the swaying string bridge. Follow it north or south; no footing east or west. |
| 12 | 11 | blocked | 13 | 15 | Southern bank: string bridge north, oak forest west, rope cliff east. |
| 13 | blocked | 14 | blocked | 12 | A rock amid poisonous mushrooms: bridge landing east, basalt clearing south. |
| 14 | 13 | 16 | blocked | blocked | Basalt clearing: oak forest north, cave entrance south. |
| 15 | blocked | blocked | 12 | blocked | A shelf overlooks the river. West returns to the southern bridge landing. |
| 16 | 14 | 18 | blocked | 17 | Daylit cave entrance: outside north, passages south and east. Take a light first. |
| 17 | blocked | blocked | 16 | blocked | An explorer scratched: Seek the sacred key of Thialfi. The passage returns west. |
| 18 | 16 | blocked | 23 | blocked | Entrance cavern: daylight north, old torture chamber west. |
| 19 | blocked | blocked | 20 | blocked | The legendary treasure room of the black elves of Svartalfheim. Only exit: west. |
| 20 | blocked | 21 | blocked | gate → 19 | Treasure doorway: south returns to the northern cavern. |
| 21 | 20 | 24 | blocked | 22 | Northern cavern: treasure door north, corridor east, long tunnel south. |
| 22 | blocked | 23 | 21 | blocked | Draughty corridor: cavern west, torture chamber south. |
| 23 | 22 | blocked | blocked | 18 | An old torture chamber, stained with blood. Corridor north; entrance cavern east. |
| 24 | 21 | 26 | blocked | blocked | Long tunnel: cavern north, round chamber south. A sealed crack glows faintly east. |
| 25 | blocked | blocked | 26 | blocked | Empty side cave. The only exit is west to the round chamber. |
| 26 | 24 | 27 | 29 | 25 | Loki's round chamber: tunnel north, upper ledge south, bat caves west, side cave east. |
| 27 | 26 | blocked | blocked | 28 | Upper ledge above an underground river: round chamber north, temple balcony east. |
| 28 | blocked | blocked | 27 | blocked | Temple balcony: sturdy stone rail, floor below. West returns to the upper ledge. |
| 29 | blocked | 33 | 30 | 26 | Draughty junction: round chamber east, bat colony south, forked pillar west. |
| 30 | blocked | blocked | 32 | 29 | Forked stone pillar: junction east, pale chamber west. |
| 31 | 32 | blocked | blocked | 34 | Low, dripping passage: pale chamber north, key chamber east. |
| 32 | blocked | 31 | blocked | 30 | Pale limestone chamber: forked pillar east, low passage south. |
| 33 | 29 | blocked | 34 | blocked | Bat colony: mind the droppings! Junction north, key chamber west. |
| 34 | blocked | blocked | 31 | 33 | Key chamber: bat colony east, low passage west. |
| 35 | 37 | blocked | blocked | blocked | Loki's temple: gate north, balcony overhead. |
| 36 | 39 | blocked | blocked | 40 | Lower cavern: shaft north, lower river ledge east. |
| 37 | blocked | 35 | blocked | gate → 38 | Crypt: temple gate south, sealed passage east. Four stones name its keeper. |
| 38 | gate → 43 | blocked | 37 | gate → 39 | Cell: crypt west, shaft east, service hatch north. Its latch is on the drain side. |
| 39 | blocked | 36 | 38 | blocked | Beyond the shaft: cell west, lower cavern south. |
| 40 | 45 | 48 | 36 | blocked | Lower river ledge, below temple level: waterfall north, castle view south, cavern west. East is a sheer edge. |
| 41 | blocked | blocked | 54 | 42 | Straight drain: conduit west, passage east towards the junction. |
| 42 | blocked | blocked | 41 | 43 | Straight drain: conduit west, junction east. |
| 43 | 46 | 38 | 42 | 44 | Drain junction: winding path north, branch east, conduit west, service hatch south. OPEN HATCH lifts its latch. |
| 44 | blocked | blocked | 43 | blocked | Blind drainage branch: return west to the junction. |
| 45 | 47 | 40 | blocked | blocked | Gioll water falls from the roof. Steps north climb to the drains; ledge south. No safe footing east. |
| 46 | blocked | 43 | 47 | blocked | Pearl-white chamber: steps west; a winding path south bends west to the drain junction. |
| 47 | blocked | 45 | blocked | 46 | Top of the stone steps: waterfall south, pearl-white chamber east. |
| 48 | 40 | blocked | blocked | gate → 49 | Castle viewpoint: ledge north; castle across the river east, reached by drawbridge. No path south. |
| 49 | blocked | blocked | 48 | 50 | Drawbridge: river ledge west, castle courtyard east. Crossing secures the bridge. |
| 50 | blocked | 52 | 49 | 51 | Castle courtyard: hzb tzozi. Drawbridge west, magazine east; tunnel south to bank. |
| 51 | blocked | blocked | 50 | blocked | Powder magazine: return west to the courtyard. |
| 52 | 50 | blocked | 53 | blocked | Eastern riverbank: castle tunnel north, wooden bridge west. |
| 53 | 54 | blocked | blocked | 52 | Wooden bridge: eastern bank east, conduit service path north. |
| 54 | blocked | 53 | blocked | 41 | Freezing conduit: drains east, service path south to the wooden bridge. |

## Qualification boundary

This audit verifies route bearings, retraceable ordinary connections, stated
level changes and visibility claims. It does not infer a metrically exact
survey of the entire river system: no source establishes its length, exact
bends or compass course. The explicitly winding drain approach is therefore
not drawn as a straight compass-grid edge. A future geographical illustration
must preserve these distinctions rather than invent contradictory bearings.
