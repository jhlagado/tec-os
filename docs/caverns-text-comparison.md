# Caverns complete text comparison

Historical audit snapshot. The subsequent implementation and current checks are recorded in [prose recovery and light editing](caverns-prose-concision.md).

Spoilers: author/editor review, separate from the user manual.

Generated from archived MicroWorld BASIC at d60481500140c79da0e6e06719a518c4231c4588 and the checked
current world/engine files. Exact byte hashes and complete statement inventory
are in [inventory.json](evidence/caverns-text-audit/inventory.json).
No game text has been edited by this report.

Coverage: 54 rooms, 24 creature/item descriptions,
102 original PRINT statements and 89 current
PRINT source lines (including lines with multiple PRINT statements).

Original whitespace padding is collapsed only for paragraph display. The JSON
retains exact original statement text and string contents. Fixed-column joined
words such as pathleads remain visible; they are not silently guessed apart.
Original room extraction is restricted to renderer lines 10–55. Earlier
rooms.json accidentally included later door/bomb action text for rooms 2/20;
use this scoped inventory instead for archival room provenance.

## Room descriptions

### 1: HUT

Original renderer lines: 10

**Original:** You are standing in a darkened room. There is a door to the north.

**Current:** You are standing in a darkened room inside a small bark hut. There is a door to the north, leading out into a forest clearing.

### 2: HUT_CLEARING

Original renderer lines: 11

**Original:** You are in a forest clearing before a small bark hut. There are no windows, and locked door to the south. The latch was engaged when you closed the door.

**Current:** You are in a forest clearing before a small bark hut. There are no windows, and the door to the south is locked. The latch engaged when you closed the door. The forest lies to the west, and a field of clovers opens to the east.

### 3: DARK_FOREST

Original renderer lines: 12

**Original:** You are deep in a dark forest. In the distance you can see a mighty river.

**Current:** You are deep in a dark forest. In the distance you can see a mighty river, its waters glinting through the trees. The path leads east to the hut clearing and west towards a cliff above the river.

### 4: CLOVER_FIELD

Original renderer lines: 13

**Original:** You are standing in a field of four-leafed clovers. There is a small hut to the north.

**Current:** You are standing in a field of four-leafed clovers. The hut clearing is to the west, and the lower slopes of Mount Ymir rise to the east.

### 5: RIVER_CLIFF

Original renderer lines: 16

**Original:** The forest has opened up at this point. You are standing on a cliff overlooking a wide glacial river. A small foot-beaten pathleads south.

**Current:** The forest has opened up at this point. You are standing on a cliff overlooking a wide glacial river. A small foot-beaten path leads south to the riverbank. The forest path returns east.

### 6: RIVERBANK

Original renderer lines: 17

**Original:** You are standing at the rocky edge of the mighty river Gioll. The path forks east and west.

**Current:** You are standing at the rocky edge of the mighty river Gioll. The path forks east and west, while a small path climbs north to the cliff.

### 7: CRATER

Original renderer lines: 18

**Original:** You are on the edge of an enormous crater. The rim is extremely slippery. Clouds of water vapour rise high in the air as the Gioll pours into it.

**Current:** You are on the edge of an enormous crater. The rim is extremely slippery. Clouds of water vapour rise high in the air as the Gioll pours into it. To the west is a fatal drop; the safe path returns east.

### 8: OUTCROP

Original renderer lines: 19

**Original:** The path to the east stops here. You are on a rocky outcrop, projected about 15 feet above the river. In the distance, a tiny bridge spans the river.

**Current:** The path stops here. You are on a rocky outcrop, projecting about fifteen feet above the river. In the distance, a tiny string bridge spans the water to the south-east. To reach it, you must return west and take the detour through the forest.

### 9: YMIR_SLOPES

Original renderer lines: 20

**Original:** You are on the lower slopes of Mt. Ymir. The forest stretches far away and to the west. Arctic winds blow fiercely, it's very cold!

**Current:** You are on the lower slopes of Mount Ymir. The forest stretches far away to the west. Arctic winds blow fiercely; it is very cold! A path leads west to the clover field, and another descends south towards the bridge.

### 10: BRIDGE_APPROACH

Original renderer lines: 21

**Original:** You stand on a rocky precipice high above the river, Gioll; Mt. Ymir stands to the north. A flimsy string bridge spans the mighty river.

**Current:** You stand on a rocky precipice high above the river Gioll. Mount Ymir stands to the north. A flimsy string bridge spans the mighty river to the south; the path north returns to the mountain slopes.

### 11: STRING_BRIDGE

Original renderer lines: 22

**Original:** You have made your way half way across the creaking bridge. It sways violently from side to side. It's going to collapse anysecond!!

**Current:** You have made your way halfway across the creaking bridge. It sways violently from side to side above the river! Hold tight and follow it north or south; there is no footing to the east or west.

### 12: SOUTH_LANDING

Original renderer lines: 23

**Original:** You are on the southern edge of the mighty river, before the string bridge.

**Current:** You are on the southern edge of the mighty river, before the string bridge. The bridge leads north, an oak forest lies to the west, and a path follows the bank east to a cliff face.

### 13: MUSHROOM_ROCK

Original renderer lines: 14

**Original:** You are standing on a rock in the middle of a mighty oak forest.Surrounding you are thousands of poisonous mushrooms.

**Current:** You are standing on a rock in the middle of a mighty oak forest. Surrounding you are thousands of poisonous mushrooms. A path leads east to the bridge landing, and another continues south to a clearing.

### 14: BASALT_CLEARING

Original renderer lines: 24

**Original:** You are in a clearing in the forest. An ancient basalt rock formation towers above you. To your south is the entrance of a VERY interesting cave...

**Current:** You are in a clearing in the forest. An ancient basalt rock formation towers above you. To your south is the entrance of a VERY interesting cave... The path north returns to the oak forest.

### 15: ROPE_CLIFF

Original renderer lines: 15

**Original:** You are on a cliff face over looking the river.

**Current:** You are on a shelf against a cliff face, overlooking the river from its southern bank. The path west returns to the string bridge landing.

### 16: ENTRANCE

Original renderer lines: 25

**Original:** You are just inside the cave. Sunlight pours into the cave lighting a path to the east and another to the south. I don't mind saying I'm a bit scared!

**Current:** You are just inside the cave. Sunlight pours into the entrance, lighting a path to the east and another to the south. I don't mind saying I'm a bit scared! The way north leads outside. You will need a light before venturing deeper.

### 17: EXPLORER_PASSAGE

Original renderer lines: 26

**Original:** This passage appears to be a dead end. On a wall before you is carved `Find the Sacred Key of Thialfi'.

**Current:** This passage appears to be a dead end. An earlier explorer has scratched a message on the wall before you: 'Find the Sacred Key of Thialfi'. The passage returns west to the cave entrance.

### 18: ENTRANCE_CAVERN

Original renderer lines: 55

**Original:** You are deep in a dark cavern.

**Current:** You are deep in a dark cavern. Daylight filters in from the cave entrance to the north. A passage leads west into what appears to be an old torture chamber.

### 19: TREASURE_ROOM

Original renderer lines: 27

**Original:** You are in the legendary treasure room of the black elves of Svartalfheim. Every red-blooded Viking has dreamed of entering this sacred room.

**Current:** You are in the legendary treasure room of the black elves of Svartalfheim. Every red-blooded Viking has dreamed of entering this sacred room! The only way out leads west through the doorway.

### 20: TREASURE_DOOR

Original renderer lines: 28

**Original:** You can see a small oak door to the east. It has been locked from the inside.

**Current:** You stand before an oak doorway in the eastern wall, its heavy timber bound with iron. The entrance looks formidable. The passage south returns to the cavern.

### 21: NORTH_CAVERN

Original renderer lines: 55

**Original:** You are deep in a dark cavern.

**Current:** You are deep in a dark cavern north of the long tunnel. A passage leads north to an oak doorway, and a draught comes from the corridor to the east. The long tunnel stretches south into the darkness.

### 22: CORRIDOR

Original renderer lines: 29

**Original:** You are standing in an east-west corridor. You can feel a faint breeze coming from the east.

**Current:** You are standing in an east-west corridor. You can feel a faint breeze stirring the stale air. The western passage returns to the cavern; a doorway to the south leads into an old torture chamber.

### 23: TORTURE_CHAMBER

Original renderer lines: 30, 31

**Original:** You are standing in what appears to have once been a torture chamber. Apart from the rather comprehensive range of instumentsof absolutely inhuman agony, coagulated blood stains on the walls and mangled bits of bone onthe floor make me think that a number of would be adventurers croaked it here!

**Current:** You are standing in what appears to have once been a torture chamber. Apart from the rather comprehensive range of instruments of absolutely inhuman agony, coagulated blood stains on the walls and mangled bits of bone on the floor make me think that a number of would-be adventurers croaked it here! A corridor leads north, and the entrance cavern lies to the east.

### 24: LONG_TUNNEL

Original renderer lines: 32

**Original:** You stand in a long tunnel which has been bored out of the rock.It runs from north to south. A faint glow comes from a narrow crack in the eastern wall.

**Current:** You stand in a long tunnel which has been bored out of the rock. It runs from north to south, between a cavern and a large round chamber. A faint glow comes from a narrow, sealed crack in the eastern wall.

### 25: SIDE_CAVE

Original renderer lines: 55

**Original:** You are deep in a dark cavern.

**Current:** You are deep in a dark cavern. This small side cave is empty and very quiet. Its only passage leads west, back to the large round chamber.

### 26: ROUND_CHAMBER

Original renderer lines: 33, 34

**Original:** You are in a large round room with a number of exits. The walls have been painted in a mystical dark purple and a big chalk staris drawn in the centre of the floor. Note: This is one of the hidden chambers of the infamous pagan sect, the monks of Loki. Norse folk believe them to be gods.

**Current:** You are in a large round room with a number of exits. The walls have been painted a mystical dark purple, and a big chalk star is drawn in the centre of the floor. This is one of the hidden chambers of the infamous pagan sect, the monks of Loki. Norse folk believe them to be gods. The long tunnel is north, a river ledge south, the bat caves west, and a small side cave east.

### 27: UPPER_LEDGE

Original renderer lines: 35

**Original:** You are standing on a narrow ledge, high above a subterranean river. There is an exit to the east.

**Current:** You are standing on a narrow ledge, high above a subterranean river. To the east is a balcony overlooking a huge cavern. The passage north returns to the round chamber.

### 28: BALCONY

Original renderer lines: 36, 37

**Original:** You are on a balcony, overlooking a huge cavern which has been converted into a pagan temple. Note: this temple has been dedicated to Loki, the god of fire, who came to live in Svartalfheim after he had been banished to exile by Odin. Since then he has been waiting for the `End Of All Things'.

**Current:** You are on a balcony overlooking a huge cavern which has been converted into a pagan temple. It is dedicated to Loki, the god of fire, who came to live in Svartalfheim after Odin banished him to exile. Since then he has been waiting for the 'End Of All Things'. A sturdy stone rail borders the balcony. The upper river ledge lies to the west; the temple floor is below.

### 29: BAT_JUNCTION

Original renderer lines: 55

**Original:** You are deep in a dark cavern.

**Current:** You are deep in a dark cavern where the passages meet. A draught stirs the air. The round chamber lies to the east, a bat colony to the south, and a forked stone pillar marks the passage west.

### 30: FORKED_PILLAR

Original renderer lines: 55

**Original:** You are deep in a dark cavern.

**Current:** You are deep in a dark cavern beside a forked stone pillar. The junction lies to the east, and a passage continues west into a pale limestone chamber.

### 31: LOW_PASSAGE

Original renderer lines: 55

**Original:** You are deep in a dark cavern.

**Current:** You are deep in a dark cavern. Water drips from the roof of this low passage. It leads north to a pale limestone chamber and east to another chamber beyond.

### 32: PALE_CHAMBER

Original renderer lines: none (no room-specific renderer text)

**Original:** [No matching room-description PRINT in the original renderer.]

**Current:** You are deep in a dark cavern whose pale limestone walls catch the light. The passage east leads to a forked stone pillar, while a low, dripping passage turns south.

### 33: BAT_COLONY

Original renderer lines: 38, 39

**Original:** You are in the central cave of a giant bat colony. Above you hundreds of giant bats hang from the ceiling and the floor is covered in centuries of giant bat droppings. Careful where you step! Incidentally, the smell is indescribable.

**Current:** You are in the central cave of a giant bat colony. Above you, hundreds of giant bats hang from the ceiling, and the floor is covered in centuries of giant bat droppings. Careful where you step! Incidentally, the smell is indescribable. A junction lies north, and a passage leads west to another chamber.

### 34: KEY_CHAMBER

Original renderer lines: 55

**Original:** You are deep in a dark cavern.

**Current:** You are deep in a dark cavern beyond the bat colony. Passages lead east towards the roosting bats and west into a low, dripping passage.

### 35: TEMPLE

Original renderer lines: 40

**Original:** You are in the temple. To the north is a locked gate and on the wall is a giant statue of Loki, carved out of the living rock itself!

**Current:** You are in the temple. To the north is a great gate, and on the wall is a giant statue of Loki, carved out of the living rock itself! High overhead is the balcony from which you descended.

### 36: WIZARD_CAVERN

Original renderer lines: 55

**Original:** You are deep in a dark cavern.

**Current:** You are deep in a dark cavern below the temple. A narrow shaft opens to the north, while a passage east leads towards the sound of an underground river.

### 37: CRYPT

Original renderer lines: 41, 42

**Original:** You stand in an old and musty crypt, the final resting place of hundreds of Loki devotees. On the wall is carved:``What 3 letter word completes a word starting with 'G---' and another ending with '---X'' Note: The monks of Loki must have liked silly puzzles. Putrefaction and decay fills the air here.

**Current:** You stand in an old and musty crypt, the final resting place of hundreds of Loki's devotees. Putrefaction and decay fill the air here. Four stones on the eastern wall name its keeper; the temple gate lies to the south.

### 38: CELL

Original renderer lines: 43

**Original:** You are in a tiny cell. The western wall has now firmly closed again. There is a ventilator shaft on the eastern wall.

**Current:** You are in a tiny cell. The passage west returns to the crypt, while a ventilation shaft pierces the eastern wall. There is a service hatch to the north, but its latch is on the drain side.

### 39: SHAFT

Original renderer lines: 55

**Original:** You are deep in a dark cavern.

**Current:** You are deep in a dark cavern just beyond the ventilation shaft. The shaft leads west into the cell, and a passage continues south into a lower cavern.

### 40: LOWER_LEDGE

Original renderer lines: 44

**Original:** You are on another ledge high above a subterranean river. The water flows in through a hole in the cavern roof, to the north.

**Current:** You are on another ledge high above a subterranean river. Water pours into the cavern through a hole in the roof to the north. The path north leads to the waterfall; south, it follows the ledge to a river bend. The cavern lies west. There is only a sheer drop to the east.

### 41: WEST_DRAIN

Original renderer lines: 45

**Original:** Somehow you have gotten into the complex drainage system of thisentire cavern network!!

**Current:** Somehow you have found your way into the complex drainage system of this entire cavern network! This straight drain leads west to a freezing conduit and east along the passage towards a junction.

### 42: MIDDLE_DRAIN

Original renderer lines: 45

**Original:** Somehow you have gotten into the complex drainage system of thisentire cavern network!!

**Current:** You are in the complex drainage system of the cavern network. The straight passage runs between the conduit to the west and a junction to the east.

### 43: DRAIN_JUNCTION

Original renderer lines: 45

**Original:** Somehow you have gotten into the complex drainage system of thisentire cavern network!!

**Current:** You are at a junction in the complex drainage system of the cavern network. A winding passage leads north towards a pearl-white chamber. A branch leads east, and the drain west returns to the conduit. To the south is the cell's service hatch; you can OPEN HATCH here.

### 44: BLIND_DRAIN

Original renderer lines: 45

**Original:** Somehow you have gotten into the complex drainage system of thisentire cavern network!!

**Current:** You are in a blind branch of the cavern's complex drainage system. There is no way onwards; the drain west returns to the junction.

### 45: WATERFALL

Original renderer lines: 46

**Original:** You are standing near an enormous waterfall which brings water down from the surface, from the river Gioll.

**Current:** You are standing near an enormous waterfall which brings water down from the surface, from the river Gioll. Stone steps climb north beside the falling water. The lower ledge lies south; there is no safe footing to the east.

### 46: PEARL_CHAMBER

Original renderer lines: 55

**Original:** You are deep in a dark cavern.

**Current:** You are deep in a dark cavern whose walls shine pearl-white in your light. Stone steps lie to the west. A winding passage leads south, changing height as it makes its way to a junction in the drains.

### 47: STONE_STEPS

Original renderer lines: 47

**Original:** You are standing before a stone staircase which leads southwards.

**Current:** You are standing at the top of a stone staircase. The steps lead south towards the roar of the waterfall. To the east is a pearl-white chamber.

### 48: CASTLE_VIEW

Original renderer lines: 48

**Original:** You are on a narrow and crumbling ledge. On the other side of the river you can see a magic castle. (Don't ask me why it's magic...I just know it is)

**Current:** You are on a narrow and crumbling ledge at a bend in the river. Across the water to the east you can see a magic castle. Don't ask me why it is magic... I just know it is! The path north returns to the lower ledge; there is no path south. The drawbridge crossing lies east.

### 49: DRAWBRIDGE

Original renderer lines: 49

**Original:** You are by the drawbridge which has just lowered itself....by magic!!

**Current:** You are on the mighty golden drawbridge, with the river below you and the magic castle ahead. The river ledge lies west and the courtyard east. Crossing secures the bridge in its lowered position.

### 50: COURTYARD

Original renderer lines: 50

**Original:** You are in the courtyard of the magic castle. WOW! This castle is really something! On the wall is inscribed 'hzb tzozi'. A secret escape tunnel leads south

**Current:** You are in the courtyard of the magic castle. WOW! This castle is really something! On the wall is inscribed 'hzb tzozi'. The drawbridge lies west, and a doorway east leads to the powder magazine. A secret escape tunnel leads south to the riverbank.

### 51: MAGAZINE

Original renderer lines: 51

**Original:** You are in the powder magazine of this really super castle.

**Current:** You are in the powder magazine of this really super castle. The doorway west leads back into the courtyard.

### 52: EAST_BANK

Original renderer lines: 53

**Original:** You are on the eastern side of the river. A small tunnel leads east into the cliff face.

**Current:** You are on the eastern side of the underground river. A small tunnel leads north through the cliff face into the castle. To the west, a wooden bridge crosses the water.

### 53: WOODEN_BRIDGE

Original renderer lines: 52, 55

**Original:** You stand before a small wooden bridge which crosses the river. You are deep in a dark cavern.

**Current:** You stand before a small wooden bridge which crosses the underground river to the east. A narrow service path leads north towards the conduit.

### 54: CONDUIT

Original renderer lines: 54

**Original:** You are in a conduit draining into the river. The water comes upto your knees and is freezing cold. A narrow service path leads south.

**Current:** You are in a conduit draining into the river. The water comes up to your knees and is freezing cold. A narrow service path leads south to the wooden bridge, while the drains continue east into the cavern network.

## Creature and item names

Articles are assembled from a literal a plus the adjective field.

- **1 WIZARD:** original “an evil wizard”; current “an evil wizard”.
- **2 DEMON:** original “a fiery demon”; current “a fiery demon”.
- **3 TROLL:** original “an axe wielding troll”; current “an axe wielding troll”.
- **4 DRAGON:** original “a fire breathing dragon”; current “a fire breathing dragon”.
- **5 BAT:** original “a giant bat”; current “a giant bat”.
- **6 DWARF:** original “an old and gnarled dwarf”; current “an old and gnarled dwarf”.
- **7 COIN:** original “a gold coin”; current “a gold coin”.
- **8 COMPASS:** original “a useful looking compass”; current “a useful looking compass”.
- **9 BOMB:** original “a home made bomb”; current “a home made bomb”.
- **10 RUBY:** original “a blood red ruby”; current “a blood red ruby”.
- **11 DIAMOND:** original “a sparkling diamond”; current “a sparkling diamond”.
- **12 PEARL:** original “a moon-like pearl”; current “a moon-like pearl”.
- **13 STONE:** original “an interesting stone”; current “an interesting stone”.
- **14 RING:** original “a diamond studded ring”; current “a diamond studded ring”.
- **15 PENDANT:** original “a magic pendant”; current “a magic pendant”.
- **16 GRAIL:** original “a most holy grail”; current “a most holy grail”.
- **17 SHIELD:** original “a mirror like shield”; current “a mirror like shield”.
- **18 BOX:** original “a nondescript black box”; current “a nondescript black box”.
- **19 KEY:** original “an old an rusty key”; current “an old and rusty key”.
- **20 SWORD:** original “a double bladed sword”; current “a double-bladed sword”.
- **21 CANDLE:** original “a small candle”; current “a small lit candle”.
- **22 ROPE:** original “a thin and tatty rope”; current “a thin and tatty rope”.
- **23 BRICK:** original “a red house brick”; current “a red house brick”.
- **24 GRILLE:** original “a rusty ventilation grill”; current “a rusty ventilation grille”.

## Other displayed messages: comparison groups

Groups aid manual review; they do not claim a one-to-one mapping. Current
line references are in the labelled authoring engine, not the generated BAS.
The appendices inventory every PRINT line even when not mapped in a group.

### Opening and darkness

**Original**

- Line 3: “DREAMCARDS presents...”
- Line 4: “C A V E R N S by John Hardy (1983)”
- Line 8: “It's very dark, too dark to see anything...I'm scared!”

**Current**

- Line 19: “DREAMCARDS presents...”
- Line 20: “CAVERNS by John Hardy (c) 1982-83” / “GNU Public License, 2019”
- Line 21: “Bring treasure home for double points. Take the compass!” / “LOOK describes, INVENTORY lists, SCORE totals, QUIT finishes.”
- Line 79: [PRINT has no literal text; inspect source inventory for variables.]
- Line 80: “It's very dark, too dark to see anything...I'm scared!”
- Line 81: [PRINT has no literal text; inspect source inventory for variables.]
- Line 83: “East: iron-bound door, barred within. Try explosives.” / “East doorway blasted open.”
- Line 84: “The secured rope reaches the floor. Use UP or DOWN.”
- Line 85: “North gate open.” / “North gate locked.”
- Line 86: “East seal open.” / “Stones read V, A, R, D. Speak the name.”
- Line 87: “East shaft open.” / “Remove the grille; leave it here. It cannot fit through.”
- Line 88: “East drawbridge raised; seek another entrance.” / “East drawbridge lowered.”
- Line 89: “You can also see the bloody corpse of an enormous dragon.”
- Line 90: “Your candle is growing dim.”
- Line 91: “Your candle has gone out.”
- Line 95: “You can also see...”

### Creature entrance scenes

**Original**

- Line 200: “There, before you in a swirling mist stands an evil wizard with his hand held outwards...`Thou shall not pass' he cries.”
- Line 202: “Before the entrance of the cave lies an enormous, green, sleeping dragon. Realizing your presence, its eyes flicker open”
- Line 203: “and it leaps up, breathing jets fire at you.”
- Line 205: “From around the corner trots an old and gnarled drawf carrying a lantern. `My job is to protect these stone steps!' he says andlunges at you with his dagger.”

**Current**

- Line 110: “An evil wizard bars the way. He cries: Thou shalt not pass!”
- Line 111: “A sleeping dragon wakes and breathes jets of fire.”
- Line 112: “An old dwarf guards the steps, raising his dagger.”

### Inventory and object formatting

**Original**

- Line 68: “You can also see...”
- Line 74: “Nearby there lurks...”
- Line 94: “You are carrying”
- Line 98: “nothing.”
- Line 165: “a” / “,”

**Current**

- Line 108: “a” / “,”
- Line 110: “An evil wizard bars the way. He cries: Thou shalt not pass!”
- Line 111: “A sleeping dragon wakes and breathes jets of fire.”
- Line 112: “An old dwarf guards the steps, raising his dagger.”
- Line 115: “You are carrying”
- Line 118: [PRINT has no literal text; inspect source inventory for variables.]
- Line 122: “nothing.”

### Score, ranking and restart

**Original**

- Line 105: “You have a score of” / “out of a possible 126 points in” / “moves.” / “Another adventure?”
- Line 192: “This gives you an adventurer's ranking of:”
- Line 193: “Hopeless beginner”
- Line 194: “Experienced loser”
- Line 195: “Average Viking”
- Line 196: “Excellent...but you've left something behind!”
- Line 197: “Perfectionist and genius!!”

**Current**

- Line 42: “Score:” / “out of a possible 126 points in” / “moves.” / “Another adventure?”
- Line 42: “Score:” / “out of a possible 126 points in” / “moves.” / “Another adventure?”
- Line 79: [PRINT has no literal text; inspect source inventory for variables.]
- Line 80: “It's very dark, too dark to see anything...I'm scared!”
- Line 81: [PRINT has no literal text; inspect source inventory for variables.]
- Line 83: “East: iron-bound door, barred within. Try explosives.” / “East doorway blasted open.”
- Line 84: “The secured rope reaches the floor. Use UP or DOWN.”
- Line 85: “North gate open.” / “North gate locked.”
- Line 86: “East seal open.” / “Stones read V, A, R, D. Speak the name.”
- Line 87: “East shaft open.” / “Remove the grille; leave it here. It cannot fit through.”
- Line 88: “East drawbridge raised; seek another entrance.” / “East drawbridge lowered.”
- Line 89: “You can also see the bloody corpse of an enormous dragon.”
- Line 90: “Your candle is growing dim.”
- Line 91: “Your candle has gone out.”
- Line 95: “You can also see...”
- Line 102: “Nearby there lurks...”
- Line 106: [PRINT has no literal text; inspect source inventory for variables.]
- Line 108: “a” / “,”
- Line 110: “An evil wizard bars the way. He cries: Thou shalt not pass!”
- Line 111: “A sleeping dragon wakes and breathes jets of fire.”
- Line 112: “An old dwarf guards the steps, raising his dagger.”
- Line 115: “You are carrying”
- Line 118: [PRINT has no literal text; inspect source inventory for variables.]
- Line 122: “nothing.”
- Line 153: “With what weapon?”
- Line 159: “The grille cannot fit. DROP GRILLE first.”
- Line 162: “There is no suitable rail here.”
- Line 163: “Tie what?”
- Line 164: “rail” / “Tie it to what? Try the rail.”
- Line 165: “You must be carrying the rope.”
- Line 166: “Rope secured to rail; it reaches the floor.”
- Line 168: “No secured rope here.”
- Line 169: “Rope untied on balcony.”
- Line 171: “TIE ROPE TO RAIL first.”
- Line 172: “You climb down to the temple floor.”
- Line 174: “There is no secured rope above you.”
- Line 175: “You climb up to the balcony.”
- Line 177: “You lift the latch. The hatch opens both ways.”
- Line 187: “Nothing happens!”
- Line 188: “Please tell me how.”
- Line 189: “I can't!”
- Line 190: [PRINT has no literal text; inspect source inventory for variables.]
- Line 201: “Without the compass, I lose my bearings!”
- Line 204: “The gate is locked. Use the key.”
- Line 205: “The hatch is latched. OPEN HATCH.”
- Line 207: “You can't go that way”
- Line 208: “You fall into the chasm and die.”
- Line 221: “Suddenly a magic wind carried you to another place...”
- Line 223: “Nothing happens here.”
- Line 224: “The seal slides open both ways.”
- Line 226: “The giant bat carries you to its colony.”
- Line 228: “The creature kills you.”
- Line 235: “eh?”
- Line 237: “Not here.”
- Line 246: “You cannot carry more.”
- Line 249: “Taken:”
- Line 251: “Dropped:”
- Line 255: “Where? I can't see it.”
- Line 258: “How am I supposed to use it?”
- Line 260: “It won't open!”
- Line 261: “You opened the door.”

### Bat transport and death

**Original**

- Line 109: “The giant bat picked you up and carried you to another place.”
- Line 112: “AUUUUUGH...you've just been killed by a” / “!!”
- Line 121: “You stumble and fall into the chasm and smash yourself to a pulp on the rocks below.”

**Current**

- Line 226: “The giant bat carries you to its colony.”
- Line 228: “The creature kills you.”

### Movement and magic

**Original**

- Line 120: “You can't go that way”
- Line 125: “Suddenly a magic wind carried you to another place...”
- Line 127: “Hey! the eastern wall of the crypt slid open...”

**Current**

- Line 201: “Without the compass, I lose my bearings!”
- Line 204: “The gate is locked. Use the key.”
- Line 205: “The hatch is latched. OPEN HATCH.”
- Line 207: “You can't go that way”
- Line 208: “You fall into the chasm and die.”
- Line 221: “Suddenly a magic wind carried you to another place...”
- Line 223: “Nothing happens here.”
- Line 224: “The seal slides open both ways.”

### Object errors and carrying

**Original**

- Line 128: “eh?”
- Line 129: “Where? I can't see it.”
- Line 135: “You are carrying too many objects.”
- Line 140: “How am I supposed to use it?”
- Line 141: “It won't open!”
- Line 142: “You opened the door.”
- Line 143: “But there's nothing to kill...”

**Current**

- Line 235: “eh?”
- Line 237: “Not here.”
- Line 246: “You cannot carry more.”
- Line 249: “Taken:”
- Line 251: “Dropped:”
- Line 255: “Where? I can't see it.”
- Line 258: “How am I supposed to use it?”
- Line 260: “It won't open!”
- Line 261: “You opened the door.”

### Sword combat

**Original**

- Line 145: “You swing with your sword but miss and the creature smashes your skull.”
- Line 148: “You attack but the creature moves aside.”
- Line 149: “The creature deflects your blow.”
- Line 150: “The foe is stunned but quickly regains his balance.”
- Line 151: “You missed and he deals a blow to your head.”
- Line 153: “The sword strikes home and your foe dies...” / “Hey! Your sword has just crumbled into dust!!”
- Line 154: “Suddenly a black cloud descends and the corpse vaporizes into nothing.”

**Current**

- Line 263: “But there's nothing to kill...”
- Line 264: “You aren't carrying that.”
- Line 266: “You swing with your sword but miss and the creature smashes your skull.”
- Line 270: “You attack but the creature moves aside.”
- Line 271: “The creature deflects your blow.”
- Line 272: “The foe is stunned but quickly regains his balance.”
- Line 273: “You missed and he deals a blow to your head.”
- Line 276: “The sword strikes home and your foe dies.”
- Line 277: “A black cloud descends and the corpse vaporises.”

### Candle and bomb

**Original**

- Line 59: “Your candle is growing dim.”
- Line 62: “In fact...it went out!”
- Line 158: “That won't burn, Dummy...In fact, the candle went out.”
- Line 160: “But the candle is out, stupid!!”
- Line 161: “The fuse burnt away and....BOOM!!....the explosion blew you out of the way (Lucky!)”

**Current**

- Line 281: “Nothing to ignite here. Keep your candle safe.”
- Line 283: “The candle is out; you need a flame.”
- Line 284: “BOOM! Smoke clears: nothing has changed.”
- Line 285: “The passage is already open. Save your bomb.”
- Line 286: “BOOM! The door is torn from its hinges. The passage east is open.”

### Rope

**Original**

- Line 163: “It's too dangerous!!!”
- Line 164: “You descend the rope, but it drops 10 feet short of the floor. You jump the rest of the way.”

**Current**

- Line 162: “There is no suitable rail here.”
- Line 163: “Tie what?”
- Line 164: “rail” / “Tie it to what? Try the rail.”
- Line 165: “You must be carrying the rope.”
- Line 166: “Rope secured to rail; it reaches the floor.”
- Line 168: “No secured rope here.”
- Line 169: “Rope untied on balcony.”
- Line 171: “TIE ROPE TO RAIL first.”
- Line 172: “You climb down to the temple floor.”
- Line 174: “There is no secured rope above you.”
- Line 175: “You climb up to the balcony.”
- Line 288: “TIE ROPE TO RAIL at the balcony, then DOWN; UP returns.”

### Generic command replies

**Original**

- Line 170: “Nothing happens!”
- Line 171: “Please tell me how.”
- Line 172: “I can't!”

**Current**

- Line 187: “Nothing happens!”
- Line 188: “Please tell me how.”
- Line 189: “I can't!”
- Line 190: [PRINT has no literal text; inspect source inventory for variables.]

## Complete original PRINT inventory

- Line 3: “DREAMCARDS presents...”
- Line 4: “C A V E R N S by John Hardy (1983)”
- Line 5: [PRINT has no literal text; inspect source inventory for variables.]
- Line 8: “It's very dark, too dark to see anything...I'm scared!”
- Line 10: “You are standing in a darkened room. There is a door to the north.”
- Line 11: “You are in a forest clearing before a small bark hut. There are no windows, and locked door to the south. The latch was engaged when you closed the door.”
- Line 12: “You are deep in a dark forest. In the distance you can see a mighty river.”
- Line 13: “You are standing in a field of four-leafed clovers. There is a small hut to the north.”
- Line 14: “You are standing on a rock in the middle of a mighty oak forest.Surrounding you are thousands of poisonous mushrooms.”
- Line 15: “You are on a cliff face over looking the river.”
- Line 16: “The forest has opened up at this point. You are standing on a cliff overlooking a wide glacial river. A small foot-beaten pathleads south.”
- Line 17: “You are standing at the rocky edge of the mighty river Gioll. The path forks east and west.”
- Line 18: “You are on the edge of an enormous crater. The rim is extremely slippery. Clouds of water vapour rise high in the air as the Gioll pours into it.”
- Line 19: “The path to the east stops here. You are on a rocky outcrop, projected about 15 feet above the river. In the distance, a tiny bridge spans the river.”
- Line 20: “You are on the lower slopes of Mt. Ymir. The forest stretches far away and to the west. Arctic winds blow fiercely, it's very cold!”
- Line 21: “You stand on a rocky precipice high above the river, Gioll; Mt. Ymir stands to the north. A flimsy string bridge spans the mighty river.”
- Line 22: “You have made your way half way across the creaking bridge. It sways violently from side to side. It's going to collapse anysecond!!”
- Line 23: “You are on the southern edge of the mighty river, before the string bridge.”
- Line 24: “You are in a clearing in the forest. An ancient basalt rock formation towers above you. To your south is the entrance of a VERY interesting cave...”
- Line 25: “You are just inside the cave. Sunlight pours into the cave lighting a path to the east and another to the south. I don't mind saying I'm a bit scared!”
- Line 26: “This passage appears to be a dead end. On a wall before you is carved `Find the Sacred Key of Thialfi'.”
- Line 27: “You are in the legendary treasure room of the black elves of Svartalfheim. Every red-blooded Viking has dreamed of entering this sacred room.”
- Line 28: “You can see a small oak door to the east. It has been locked from the inside.”
- Line 29: “You are standing in an east-west corridor. You can feel a faint breeze coming from the east.”
- Line 30: “You are standing in what appears to have once been a torture chamber. Apart from the rather comprehensive range of instumentsof absolutely inhuman agony,”
- Line 31: “coagulated blood stains on the walls and mangled bits of bone onthe floor make me think that a number of would be adventurers croaked it here!”
- Line 32: “You stand in a long tunnel which has been bored out of the rock.It runs from north to south. A faint glow comes from a narrow crack in the eastern wall.”
- Line 33: “You are in a large round room with a number of exits. The walls have been painted in a mystical dark purple and a big chalk staris drawn in the centre of”
- Line 34: “the floor. Note: This is one of the hidden chambers of the infamous pagan sect, the monks of Loki. Norse folk believe them to be gods.”
- Line 35: “You are standing on a narrow ledge, high above a subterranean river. There is an exit to the east.”
- Line 36: “You are on a balcony, overlooking a huge cavern which has been converted into a pagan temple. Note: this temple has been dedicated to Loki, the god of”
- Line 37: “fire, who came to live in Svartalfheim after he had been banished to exile by Odin. Since then he has been waiting for the `End Of All Things'.”
- Line 38: “You are in the central cave of a giant bat colony. Above you hundreds of giant bats hang from the ceiling and the floor is covered in centuries of”
- Line 39: “giant bat droppings. Careful where you step! Incidentally, the smell is indescribable.”
- Line 40: “You are in the temple. To the north is a locked gate and on the wall is a giant statue of Loki, carved out of the living rock itself!”
- Line 41: “You stand in an old and musty crypt, the final resting place of hundreds of Loki devotees. On the wall is carved:``What 3 letter word completes a word”
- Line 42: “starting with 'G---' and another ending with '---X'' Note: The monks of Loki must have liked silly puzzles. Putrefaction and decay fills the air here.”
- Line 43: “You are in a tiny cell. The western wall has now firmly closed again. There is a ventilator shaft on the eastern wall.”
- Line 44: “You are on another ledge high above a subterranean river. The water flows in through a hole in the cavern roof, to the north.”
- Line 45: “Somehow you have gotten into the complex drainage system of thisentire cavern network!!”
- Line 46: “You are standing near an enormous waterfall which brings water down from the surface, from the river Gioll.”
- Line 47: “You are standing before a stone staircase which leads southwards.”
- Line 48: “You are on a narrow and crumbling ledge. On the other side of the river you can see a magic castle. (Don't ask me why it's magic...I just know it is)”
- Line 49: “You are by the drawbridge which has just lowered itself....by magic!!”
- Line 50: “You are in the courtyard of the magic castle. WOW! This castle is really something! On the wall is inscribed 'hzb tzozi'. A secret escape tunnel leads south”
- Line 51: “You are in the powder magazine of this really super castle.”
- Line 52: “You stand before a small wooden bridge which crosses the river.”
- Line 53: “You are on the eastern side of the river. A small tunnel leads east into the cliff face.”
- Line 54: “You are in a conduit draining into the river. The water comes upto your knees and is freezing cold. A narrow service path leads south.”
- Line 55: “You are deep in a dark cavern.”
- Line 56: “Two of the ropes have snapped under your weight. It's totally unfit to cross again.”
- Line 57: “You can also see the bloody corpse of an enormous dragon.”
- Line 58: “A mighty golden drawbridge spans the waters.”
- Line 59: “Your candle is growing dim.”
- Line 62: “In fact...it went out!”
- Line 68: “You can also see...”
- Line 74: “Nearby there lurks...”
- Line 77: [PRINT has no literal text; inspect source inventory for variables.]
- Line 94: “You are carrying”
- Line 98: “nothing.”
- Line 99: [PRINT has no literal text; inspect source inventory for variables.]
- Line 105: “You have a score of” / “out of a possible 126 points in” / “moves.” / “Another adventure?”
- Line 109: “The giant bat picked you up and carried you to another place.”
- Line 112: “AUUUUUGH...you've just been killed by a” / “!!”
- Line 120: “You can't go that way”
- Line 121: “You stumble and fall into the chasm and smash yourself to a pulp on the rocks below.”
- Line 125: “Suddenly a magic wind carried you to another place...”
- Line 127: “Hey! the eastern wall of the crypt slid open...”
- Line 128: “eh?”
- Line 129: “Where? I can't see it.”
- Line 135: “You are carrying too many objects.”
- Line 140: “How am I supposed to use it?”
- Line 141: “It won't open!”
- Line 142: “You opened the door.”
- Line 143: “But there's nothing to kill...”
- Line 145: “You swing with your sword but miss and the creature smashes your skull.”
- Line 148: “You attack but the creature moves aside.”
- Line 149: “The creature deflects your blow.”
- Line 150: “The foe is stunned but quickly regains his balance.”
- Line 151: “You missed and he deals a blow to your head.”
- Line 153: “The sword strikes home and your foe dies...” / “Hey! Your sword has just crumbled into dust!!”
- Line 154: “Suddenly a black cloud descends and the corpse vaporizes into nothing.”
- Line 158: “That won't burn, Dummy...In fact, the candle went out.”
- Line 160: “But the candle is out, stupid!!”
- Line 161: “The fuse burnt away and....BOOM!!....the explosion blew you out of the way (Lucky!)”
- Line 163: “It's too dangerous!!!”
- Line 164: “You descend the rope, but it drops 10 feet short of the floor. You jump the rest of the way.”
- Line 165: “a” / “,”
- Line 170: “Nothing happens!”
- Line 171: “Please tell me how.”
- Line 172: “I can't!”
- Line 173: [PRINT has no literal text; inspect source inventory for variables.]
- Line 192: “This gives you an adventurer's ranking of:”
- Line 193: “Hopeless beginner”
- Line 194: “Experienced loser”
- Line 195: “Average Viking”
- Line 196: “Excellent...but you've left something behind!”
- Line 197: “Perfectionist and genius!!”
- Line 200: “There, before you in a swirling mist stands an evil wizard with his hand held outwards...`Thou shall not pass' he cries.”
- Line 202: “Before the entrance of the cave lies an enormous, green, sleeping dragon. Realizing your presence, its eyes flicker open”
- Line 203: “and it leaps up, breathing jets fire at you.”
- Line 205: “From around the corner trots an old and gnarled drawf carrying a lantern. `My job is to protect these stone steps!' he says andlunges at you with his dagger.”

## Complete current PRINT inventory

- Line 19: “DREAMCARDS presents...”
- Line 20: “CAVERNS by John Hardy (c) 1982-83” / “GNU Public License, 2019”
- Line 21: “Bring treasure home for double points. Take the compass!” / “LOOK describes, INVENTORY lists, SCORE totals, QUIT finishes.”
- Line 30: “Your score is” / “out of 126.”
- Line 42: “Score:” / “out of a possible 126 points in” / “moves.” / “Another adventure?”
- Line 79: [PRINT has no literal text; inspect source inventory for variables.]
- Line 80: “It's very dark, too dark to see anything...I'm scared!”
- Line 81: [PRINT has no literal text; inspect source inventory for variables.]
- Line 83: “East: iron-bound door, barred within. Try explosives.” / “East doorway blasted open.”
- Line 84: “The secured rope reaches the floor. Use UP or DOWN.”
- Line 85: “North gate open.” / “North gate locked.”
- Line 86: “East seal open.” / “Stones read V, A, R, D. Speak the name.”
- Line 87: “East shaft open.” / “Remove the grille; leave it here. It cannot fit through.”
- Line 88: “East drawbridge raised; seek another entrance.” / “East drawbridge lowered.”
- Line 89: “You can also see the bloody corpse of an enormous dragon.”
- Line 90: “Your candle is growing dim.”
- Line 91: “Your candle has gone out.”
- Line 95: “You can also see...”
- Line 102: “Nearby there lurks...”
- Line 106: [PRINT has no literal text; inspect source inventory for variables.]
- Line 108: “a” / “,”
- Line 110: “An evil wizard bars the way. He cries: Thou shalt not pass!”
- Line 111: “A sleeping dragon wakes and breathes jets of fire.”
- Line 112: “An old dwarf guards the steps, raising his dagger.”
- Line 115: “You are carrying”
- Line 118: [PRINT has no literal text; inspect source inventory for variables.]
- Line 122: “nothing.”
- Line 153: “With what weapon?”
- Line 159: “The grille cannot fit. DROP GRILLE first.”
- Line 162: “There is no suitable rail here.”
- Line 163: “Tie what?”
- Line 164: “rail” / “Tie it to what? Try the rail.”
- Line 165: “You must be carrying the rope.”
- Line 166: “Rope secured to rail; it reaches the floor.”
- Line 168: “No secured rope here.”
- Line 169: “Rope untied on balcony.”
- Line 171: “TIE ROPE TO RAIL first.”
- Line 172: “You climb down to the temple floor.”
- Line 174: “There is no secured rope above you.”
- Line 175: “You climb up to the balcony.”
- Line 177: “You lift the latch. The hatch opens both ways.”
- Line 187: “Nothing happens!”
- Line 188: “Please tell me how.”
- Line 189: “I can't!”
- Line 190: [PRINT has no literal text; inspect source inventory for variables.]
- Line 201: “Without the compass, I lose my bearings!”
- Line 204: “The gate is locked. Use the key.”
- Line 205: “The hatch is latched. OPEN HATCH.”
- Line 207: “You can't go that way”
- Line 208: “You fall into the chasm and die.”
- Line 221: “Suddenly a magic wind carried you to another place...”
- Line 223: “Nothing happens here.”
- Line 224: “The seal slides open both ways.”
- Line 226: “The giant bat carries you to its colony.”
- Line 228: “The creature kills you.”
- Line 235: “eh?”
- Line 237: “Not here.”
- Line 246: “You cannot carry more.”
- Line 249: “Taken:”
- Line 251: “Dropped:”
- Line 255: “Where? I can't see it.”
- Line 258: “How am I supposed to use it?”
- Line 260: “It won't open!”
- Line 261: “You opened the door.”
- Line 263: “But there's nothing to kill...”
- Line 264: “You aren't carrying that.”
- Line 266: “You swing with your sword but miss and the creature smashes your skull.”
- Line 270: “You attack but the creature moves aside.”
- Line 271: “The creature deflects your blow.”
- Line 272: “The foe is stunned but quickly regains his balance.”
- Line 273: “You missed and he deals a blow to your head.”
- Line 276: “The sword strikes home and your foe dies.”
- Line 277: “A black cloud descends and the corpse vaporises.”
- Line 281: “Nothing to ignite here. Keep your candle safe.”
- Line 283: “The candle is out; you need a flame.”
- Line 284: “BOOM! Smoke clears: nothing has changed.”
- Line 285: “The passage is already open. Save your bomb.”
- Line 286: “BOOM! The door is torn from its hinges. The passage east is open.”
- Line 288: “TIE ROPE TO RAIL at the balcony, then DOWN; UP returns.”
- Line 296: “Ranking:”
- Line 297: “Hopeless beginner”
- Line 298: “Experienced loser”
- Line 299: “Average Viking”
- Line 300: “Excellent...but you've left something behind!”
- Line 301: “Perfectionist and genius!!”
- Line 304: “Welcome home! Your treasures are safe.”
- Line 306: “Your score is” / “out of 126.”
- Line 307: “All treasure home. Your quest is complete!”
- Line 308: “QUIT to finish, or leave to seek more treasure.”
