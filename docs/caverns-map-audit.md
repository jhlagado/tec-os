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
| 1 | 2 | blocked | blocked | blocked | You are standing in a darkened room inside a small bark hut. There is a door to the north, leading out into a forest clearing. |
| 2 | blocked | blocked | 3 | 4 | You are in a forest clearing before a small bark hut. There are no windows, and the door to the south is locked. The latch engaged when you closed the door. The forest lies to the west, and a field of clovers opens to the east. |
| 3 | blocked | blocked | 5 | 2 | You are deep in a dark forest. In the distance you can see a mighty river, its waters glinting through the trees. The path leads east to the hut clearing and west towards a cliff above the river. |
| 4 | blocked | blocked | 2 | 9 | You are standing in a field of four-leafed clovers. The hut clearing is to the west, and the lower slopes of Mount Ymir rise to the east. |
| 5 | blocked | 6 | blocked | 3 | The forest has opened up at this point. You are standing on a cliff overlooking a wide glacial river. A small foot-beaten path leads south to the riverbank. The forest path returns east. |
| 6 | 5 | blocked | 7 | 8 | You are standing at the rocky edge of the mighty river Gioll. The path forks east and west, while a small path climbs north to the cliff. |
| 7 | blocked | blocked | warned fatal drop | 6 | You are on the edge of an enormous crater. The rim is extremely slippery. Clouds of water vapour rise high in the air as the Gioll pours into it. To the west is a fatal drop; the safe path returns east. |
| 8 | blocked | blocked | 6 | blocked | The path stops here. You are on a rocky outcrop, projecting about fifteen feet above the river. In the distance, a tiny string bridge spans the water to the south-east. To reach it, you must return west and take the detour through the forest. |
| 9 | blocked | 10 | 4 | blocked | You are on the lower slopes of Mount Ymir. The forest stretches far away to the west. Arctic winds blow fiercely; it is very cold! A path leads west to the clover field, and another descends south towards the bridge. |
| 10 | 9 | 11 | blocked | blocked | You stand on a rocky precipice high above the river Gioll. Mount Ymir stands to the north. A flimsy string bridge spans the mighty river to the south; the path north returns to the mountain slopes. |
| 11 | 10 | 12 | blocked | blocked | You have made your way halfway across the creaking bridge. It sways violently from side to side above the river! Hold tight and follow it north or south; there is no footing to the east or west. |
| 12 | 11 | blocked | 13 | 15 | You are on the southern edge of the mighty river, before the string bridge. The bridge leads north, an oak forest lies to the west, and a path follows the bank east to a cliff face. |
| 13 | blocked | 14 | blocked | 12 | You are standing on a rock in the middle of a mighty oak forest. Surrounding you are thousands of poisonous mushrooms. A path leads east to the bridge landing, and another continues south to a clearing. |
| 14 | 13 | 16 | blocked | blocked | You are in a clearing in the forest. An ancient basalt rock formation towers above you. To your south is the entrance of a VERY interesting cave... The path north returns to the oak forest. |
| 15 | blocked | blocked | 12 | blocked | You are on a shelf against a cliff face, overlooking the river from its southern bank. The path west returns to the string bridge landing. |
| 16 | 14 | 18 | blocked | 17 | You are just inside the cave. Sunlight pours into the entrance, lighting a path to the east and another to the south. I don't mind saying I'm a bit scared! The way north leads outside. You will need a light before venturing deeper. |
| 17 | blocked | blocked | 16 | blocked | This passage appears to be a dead end. An earlier explorer has scratched a message on the wall before you: 'Find the Sacred Key of Thialfi'. The passage returns west to the cave entrance. |
| 18 | 16 | blocked | 23 | blocked | You are deep in a dark cavern. Daylight filters in from the cave entrance to the north. A passage leads west into what appears to be an old torture chamber. |
| 19 | blocked | blocked | 20 | blocked | You are in the legendary treasure room of the black elves of Svartalfheim. Every red-blooded Viking has dreamed of entering this sacred room! The only way out leads west through the doorway. |
| 20 | blocked | 21 | blocked | gate → 19 | You stand before an oak doorway in the eastern wall, its heavy timber bound with iron. The entrance looks formidable. The passage south returns to the cavern. |
| 21 | 20 | 24 | blocked | 22 | You are deep in a dark cavern north of the long tunnel. A passage leads north to an oak doorway, and a draught comes from the corridor to the east. The long tunnel stretches south into the darkness. |
| 22 | blocked | 23 | 21 | blocked | You are standing in an east-west corridor. You can feel a faint breeze stirring the stale air. The western passage returns to the cavern; a doorway to the south leads into an old torture chamber. |
| 23 | 22 | blocked | blocked | 18 | You are standing in what appears to have once been a torture chamber. Apart from the rather comprehensive range of instruments of absolutely inhuman agony, coagulated blood stains on the walls and mangled bits of bone on the floor make me think that a number of would-be adventurers croaked it here! A corridor leads north, and the entrance cavern lies to the east. |
| 24 | 21 | 26 | blocked | blocked | You stand in a long tunnel which has been bored out of the rock. It runs from north to south, between a cavern and a large round chamber. A faint glow comes from a narrow, sealed crack in the eastern wall. |
| 25 | blocked | blocked | 26 | blocked | You are deep in a dark cavern. This small side cave is empty and very quiet. Its only passage leads west, back to the large round chamber. |
| 26 | 24 | 27 | 29 | 25 | You are in a large round room with a number of exits. The walls have been painted a mystical dark purple, and a big chalk star is drawn in the centre of the floor. This is one of the hidden chambers of the infamous pagan sect, the monks of Loki. Norse folk believe them to be gods. The long tunnel is north, a river ledge south, the bat caves west, and a small side cave east. |
| 27 | 26 | blocked | blocked | 28 | You are standing on a narrow ledge, high above a subterranean river. To the east is a balcony overlooking a huge cavern. The passage north returns to the round chamber. |
| 28 | blocked | blocked | 27 | blocked | You are on a balcony overlooking a huge cavern which has been converted into a pagan temple. It is dedicated to Loki, the god of fire, who came to live in Svartalfheim after Odin banished him to exile. Since then he has been waiting for the 'End Of All Things'. A sturdy stone rail borders the balcony. The upper river ledge lies to the west; the temple floor is below. |
| 29 | blocked | 33 | 30 | 26 | You are deep in a dark cavern where the passages meet. A draught stirs the air. The round chamber lies to the east, a bat colony to the south, and a forked stone pillar marks the passage west. |
| 30 | blocked | blocked | 32 | 29 | You are deep in a dark cavern beside a forked stone pillar. The junction lies to the east, and a passage continues west into a pale limestone chamber. |
| 31 | 32 | blocked | blocked | 34 | You are deep in a dark cavern. Water drips from the roof of this low passage. It leads north to a pale limestone chamber and east to another chamber beyond. |
| 32 | blocked | 31 | blocked | 30 | You are deep in a dark cavern whose pale limestone walls catch the light. The passage east leads to a forked stone pillar, while a low, dripping passage turns south. |
| 33 | 29 | blocked | 34 | blocked | You are in the central cave of a giant bat colony. Above you, hundreds of giant bats hang from the ceiling, and the floor is covered in centuries of giant bat droppings. Careful where you step! Incidentally, the smell is indescribable. A junction lies north, and a passage leads west to another chamber. |
| 34 | blocked | blocked | 31 | 33 | You are deep in a dark cavern beyond the bat colony. Passages lead east towards the roosting bats and west into a low, dripping passage. |
| 35 | 37 | blocked | blocked | blocked | You are in the temple. To the north is a great gate, and on the wall is a giant statue of Loki, carved out of the living rock itself! High overhead is the balcony from which you descended. |
| 36 | 39 | blocked | blocked | 40 | You are deep in a dark cavern below the temple. A narrow shaft opens to the north, while a passage east leads towards the sound of an underground river. |
| 37 | blocked | 35 | blocked | gate → 38 | You stand in an old and musty crypt, the final resting place of hundreds of Loki's devotees. Putrefaction and decay fill the air here. Four stones on the eastern wall name its keeper; the temple gate lies to the south. |
| 38 | gate → 43 | blocked | 37 | gate → 39 | You are in a tiny cell. The passage west returns to the crypt, while a ventilation shaft pierces the eastern wall. There is a service hatch to the north, but its latch is on the drain side. |
| 39 | blocked | 36 | 38 | blocked | You are deep in a dark cavern just beyond the ventilation shaft. The shaft leads west into the cell, and a passage continues south into a lower cavern. |
| 40 | 45 | 48 | 36 | blocked | You are on another ledge high above a subterranean river. Water pours into the cavern through a hole in the roof to the north. The path north leads to the waterfall; south, it follows the ledge to a river bend. The cavern lies west. There is only a sheer drop to the east. |
| 41 | blocked | blocked | 54 | 42 | Somehow you have found your way into the complex drainage system of this entire cavern network! This straight drain leads west to a freezing conduit and east along the passage towards a junction. |
| 42 | blocked | blocked | 41 | 43 | You are in the complex drainage system of the cavern network. The straight passage runs between the conduit to the west and a junction to the east. |
| 43 | 46 | 38 | 42 | 44 | You are at a junction in the complex drainage system of the cavern network. A winding passage leads north towards a pearl-white chamber. A branch leads east, and the drain west returns to the conduit. To the south is the cell's service hatch; you can OPEN HATCH here. |
| 44 | blocked | blocked | 43 | blocked | You are in a blind branch of the cavern's complex drainage system. There is no way onwards; the drain west returns to the junction. |
| 45 | 47 | 40 | blocked | blocked | You are standing near an enormous waterfall which brings water down from the surface, from the river Gioll. Stone steps climb north beside the falling water. The lower ledge lies south; there is no safe footing to the east. |
| 46 | blocked | 43 | 47 | blocked | You are deep in a dark cavern whose walls shine pearl-white in your light. Stone steps lie to the west. A winding passage leads south, changing height as it makes its way to a junction in the drains. |
| 47 | blocked | 45 | blocked | 46 | You are standing at the top of a stone staircase. The steps lead south towards the roar of the waterfall. To the east is a pearl-white chamber. |
| 48 | 40 | blocked | blocked | gate → 49 | You are on a narrow and crumbling ledge at a bend in the river. Across the water to the east you can see a magic castle. Don't ask me why it is magic... I just know it is! The path north returns to the lower ledge; there is no path south. The drawbridge crossing lies east. |
| 49 | blocked | blocked | 48 | 50 | You are on the mighty golden drawbridge, with the river below you and the magic castle ahead. The river ledge lies west and the courtyard east. Crossing secures the bridge in its lowered position. |
| 50 | blocked | 52 | 49 | 51 | You are in the courtyard of the magic castle. WOW! This castle is really something! On the wall is inscribed 'hzb tzozi'. The drawbridge lies west, and a doorway east leads to the powder magazine. A secret escape tunnel leads south to the riverbank. |
| 51 | blocked | blocked | 50 | blocked | You are in the powder magazine of this really super castle. The doorway west leads back into the courtyard. |
| 52 | 50 | blocked | 53 | blocked | You are on the eastern side of the underground river. A small tunnel leads north through the cliff face into the castle. To the west, a wooden bridge crosses the water. |
| 53 | 54 | blocked | blocked | 52 | You stand before a small wooden bridge which crosses the underground river to the east. A narrow service path leads north towards the conduit. |
| 54 | blocked | 53 | blocked | 41 | You are in a conduit draining into the river. The water comes up to your knees and is freezing cold. A narrow service path leads south to the wooden bridge, while the drains continue east into the cavern network. |

## Qualification boundary

This audit verifies route bearings, retraceable ordinary connections, stated
level changes and visibility claims. It does not infer a metrically exact
survey of the entire river system: no source establishes its length, exact
bends or compass course. The explicitly winding drain approach is therefore
not drawn as a straight compass-grid edge. A future geographical illustration
must preserve these distinctions rather than invent contradictory bearings.
