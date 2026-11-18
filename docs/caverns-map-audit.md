# Revised Caverns map and description audit

Spoilers: engineering record, separate from the user manual.

[Full map image (PNG)](images/caverns-map.png) · [Zoomable SVG](images/caverns-map.svg).
All 54 rooms, initial items/creatures, gates, rope and transport are shown.
Regenerate with `node tools/caverns-map-image.mjs` (Graphviz required).
The DOT source is retained beside the images.

All 54 room descriptions name the current paths, not the old graph. With
opened gates, every compass connection has its opposite return except the
hut's self-locking door: leaving north requires the key to re-enter from the
clearing. The native quest visits every room and checks its displayed prose.

## Direction, visibility and level changes

- Hut clearing 2 connects west to forest 3 and east to clovers 4. The hut is
  south of the clearing; the route back from clovers is west.
- Outcrop 8 sees the string bridge broadly south-east, consistent with the
  corrected surface route. Reaching it requires a detour via the forest; west
  is the only exit from the outcrop. No water-flow direction is asserted.
- Balcony 28 and temple 35 are vertically connected by the secured rope.
  UP/DOWN are separate from compass movement.
- Ledge 27 is the upper river viewpoint; ledge 40 is below temple level.
  The directions used to approach them do not describe the direction of flow.
- The route between drain junction 43 and pearl chamber 46 winds and changes
  height. The north/south exits are the beginnings of that passage, not a claim
  that the caverns form a rectangular grid. Its return is explicitly retraceable; no precise westward bend is claimed.
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
| 1 | 2 | blocked | blocked | blocked | You are in a darkened room inside a small bark hut. A door leads north to a forest clearing. |
| 2 | blocked | blocked | 3 | 4 | You stand before a small windowless bark hut. The door to the south locked when you closed it. A forest lies west and a field of clovers opens east. |
| 3 | blocked | blocked | 5 | 2 | You are deep in a dark forest. A mighty river glints through the trees. A path leads east to a hut clearing and west towards a river cliff. |
| 4 | blocked | blocked | 2 | 9 | You stand in a field of four-leafed clovers. A hut clearing lies west and the slopes of Mount Ymir rise to the east. |
| 5 | blocked | 6 | blocked | 3 | The forest opens onto a cliff above a wide glacial river. A foot-beaten path leads south to the riverbank. A forest path leads east. |
| 6 | 5 | blocked | 7 | 8 | You stand at the rocky edge of the mighty river Gioll. A path forks east and west. Another climbs north to a cliff. |
| 7 | blocked | blocked | warned fatal drop | 6 | You stand on the slippery rim of an enormous crater. Clouds of water vapour rise as the Gioll pours into it. West is a fatal drop. A safe path leads east. |
| 8 | blocked | blocked | 6 | blocked | You are on a rocky outcrop fifteen feet above the river. A tiny string bridge spans the water to the south-east. To reach it you must go west and detour through the forest. |
| 9 | blocked | 10 | 4 | blocked | You are on the lower slopes of Mount Ymir. Arctic winds blow fiercely. It is very cold! A path leads west through clovers towards the forest and south towards a bridge. |
| 10 | 9 | 11 | blocked | blocked | You stand on a rocky precipice high above the Gioll. Mount Ymir rises to the north. A flimsy string bridge spans the river to the south. |
| 11 | 10 | 12 | blocked | blocked | You are halfway across a creaking bridge. It sways violently above the river! Hold tight and follow it either north or south. |
| 12 | 11 | blocked | 13 | 15 | You stand on the southern bank of the mighty river. A string bridge leads north. An oak forest lies west and a path follows the bank east to a cliff face. |
| 13 | blocked | 14 | blocked | 12 | You stand on a rock in a mighty oak forest surrounded by thousands of poisonous mushrooms. A path leads east to a bridge landing and south to a clearing. |
| 14 | 13 | 16 | blocked | blocked | You are in a forest clearing beneath an ancient basalt rock formation. A VERY interesting cave opens to the south... A path leads north into the oak forest. |
| 15 | blocked | blocked | 12 | blocked | You are on a shelf against a cliff face above the southern riverbank. A path leads west to a string bridge landing. |
| 16 | 14 | 18 | blocked | 17 | You are just inside a cave. Sunlight lights paths east and south. I don't mind saying I'm a bit scared! North leads outside. You will need a light to venture deeper. |
| 17 | blocked | blocked | 16 | blocked | This passage appears to be a dead end. An earlier explorer scratched a message on the wall: 'Find the Sacred Key of Thialfi'. A passage leads west to the cave entrance. |
| 18 | 16 | blocked | 23 | blocked | You are in a dark cavern. Daylight filters in from a cave entrance to the north. A passage leads west towards an old torture chamber. |
| 19 | blocked | blocked | 20 | blocked | You are in the legendary treasure room of the black elves of Svartalfheim. Every red-blooded Viking dreams of entering this sacred room! A doorway leads west. |
| 20 | blocked | 21 | blocked | gate → 19 | You stand before an entrance to a treasure room. A passage leads south to a cavern. |
| 21 | 20 | 24 | blocked | 22 | You are in a dark cavern. A passage leads north to an oak doorway. A draught comes from a corridor east. A long tunnel stretches south into darkness. |
| 22 | blocked | 23 | 21 | blocked | You are in a corridor. A faint breeze stirs the stale air. West leads to a dark cavern and a doorway south leads to a torture chamber. |
| 23 | 22 | blocked | blocked | 18 | This was once a torture chamber. Instruments of inhuman agony, coagulated blood on the walls and mangled bones on the floor suggest many adventurers croaked it here! A corridor leads north. A cavern near the cave entrance lies east. |
| 24 | 21 | 26 | blocked | blocked | You stand in a long tunnel bored through the rock. It runs north to a cavern and south to a large round chamber. |
| 25 | blocked | blocked | 26 | blocked | You are in a small silent side cave. Its only passage leads west to a large round chamber. |
| 26 | 24 | 27 | 29 | 25 | You are in a large round room with mystical dark purple walls. A big chalk star marks the centre of the floor. This is a hidden chamber of the infamous monks of Loki. Norse folk believe them to be gods. A long tunnel leads north and a river ledge lies south. A passage west leads towards bat caves. A small side cave opens east. |
| 27 | 26 | blocked | blocked | 28 | You stand on a narrow ledge high above a subterranean river. A balcony overlooks a huge cavern to the east. A passage leads north to a round chamber. |
| 28 | blocked | blocked | 27 | blocked | You are on a balcony above a cavern converted into a temple to Loki. Odin banished the god of fire to Svartalfheim. Here he waits for the 'End Of All Things'. A sturdy stone rail borders the balcony above the temple floor. A passage leads west to a river ledge. |
| 29 | blocked | 33 | 30 | 26 | You are in a dark cavern where passages meet. A draught stirs the air. A round chamber lies east and a bat colony lies south. A forked stone pillar marks a passage west. |
| 30 | blocked | blocked | 32 | 29 | You are beside a forked stone pillar in a dark cavern. A junction lies east and a passage leads west to a pale limestone chamber. |
| 31 | 32 | blocked | blocked | 34 | Water drips from the roof of a low dark passage. It leads north to a pale limestone chamber and east to another chamber. |
| 32 | blocked | 31 | blocked | 30 | Pale limestone walls catch the light in this dark cavern. A passage leads east to a forked stone pillar and a low dripping passage leads south. |
| 33 | 29 | blocked | 34 | blocked | You are in the heart of a giant bat colony. Hundreds hang overhead above centuries of bat droppings. Careful where you step! The smell is indescribable. A junction lies north and a passage leads west to another chamber. |
| 34 | blocked | blocked | 31 | 33 | You are in a dark cavern. Passages lead east towards roosting bats and west into a low dripping passage. |
| 35 | 37 | blocked | blocked | blocked | You are in the temple. A giant statue of Loki is carved out of the living rock of the wall itself! A balcony stands high overhead. |
| 36 | 39 | blocked | blocked | 40 | You are in a dark cavern below a temple. A shaft opens north. A passage east leads towards the sound of an underground river. |
| 37 | blocked | 35 | blocked | gate → 38 | You stand in a musty crypt where hundreds of Loki's devotees lie in putrefaction and decay. Four stones in the eastern wall name its keeper. A gate leads south to a temple. |
| 38 | gate → 43 | blocked | 37 | gate → 39 | You are in a tiny cell. A passage leads west to a crypt. A ventilation shaft pierces the eastern wall. A service hatch lies north but its latch is on the drain side. |
| 39 | blocked | 36 | 38 | blocked | You are in a dark cavern beside a ventilation shaft. The shaft leads west to a cell. A passage leads south into a lower cavern. |
| 40 | 45 | 48 | 36 | blocked | You stand on a ledge high above a subterranean river. Water pours through a hole in the roof to the north. A path leads north to the waterfall and south to a river bend. A cavern lies west. East is a sheer drop. |
| 41 | blocked | blocked | 54 | 42 | Somehow you have found the drains of this entire cavern network! This drain leads west to a freezing conduit and east towards a junction. |
| 42 | blocked | blocked | 41 | 43 | You are in the drains of a cavern network. A straight passage leads west towards a conduit and east to a junction. |
| 43 | 46 | 38 | 42 | 44 | You stand at a drain junction. A winding passage leads north towards a pearl-white chamber. A branch runs east. A drain leads west towards a conduit. The cell's service hatch lies south with its latch on this side. |
| 44 | blocked | blocked | 43 | blocked | You are in a blind branch of the cavern drains. There is no way onwards. A drain leads west to a junction. |
| 45 | 47 | 40 | blocked | blocked | An enormous waterfall brings water down from the surface river Gioll. Stone steps climb north beside it. A ledge lies south. There is no safe footing east. |
| 46 | blocked | 43 | 47 | blocked | Your light catches pearl-white walls in a dark cavern. Stone steps lie west. A winding passage leads south to a drain junction below. |
| 47 | blocked | 45 | blocked | 46 | You stand atop a stone staircase. Steps descend south towards a roaring waterfall. A pearl-white chamber lies east. |
| 48 | 40 | blocked | blocked | gate → 49 | You stand on a crumbling river ledge. Across the water to the east is a magic castle. Don't ask me why it is magic... I just know it is! A drawbridge crosses east. A path leads north to another ledge. There is no path south. |
| 49 | blocked | blocked | 48 | 50 | You stand on a mighty golden drawbridge above the river. Beyond it is a magic castle! A river ledge lies west and the courtyard lies east. |
| 50 | blocked | 52 | 49 | 51 | You are in the courtyard of a magic castle. WOW! This castle is really something! The wall reads 'hzb tzozi'. A drawbridge lies west and a doorway leads east to a powder magazine. A secret escape tunnel leads south to a riverbank. |
| 51 | blocked | blocked | 50 | blocked | You are in the powder magazine of this really super castle. A doorway leads west to a courtyard. |
| 52 | 50 | blocked | 53 | blocked | You are on the eastern bank of an underground river. A tunnel leads north through the cliff face into a castle. A wooden bridge crosses the water west. |
| 53 | 54 | blocked | blocked | 52 | A small wooden bridge crosses an underground river to the east. A narrow service path leads north towards a conduit. |
| 54 | blocked | 53 | blocked | 41 | You are in a conduit draining into a river. Freezing water reaches your knees. A narrow service path leads south to a wooden bridge. Drains continue east into the cavern network. |

## Qualification boundary

This audit verifies route bearings, retraceable ordinary connections, stated
level changes and visibility claims. It does not infer a metrically exact
survey of the entire river system: no source establishes its length, exact
bends or compass course. The explicitly winding drain approach is therefore
not drawn as a straight compass-grid edge. A future geographical illustration
must preserve these distinctions rather than invent contradictory bearings.
