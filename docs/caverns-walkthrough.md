# Caverns walkthrough review

This is the spoiler route for the author-refined original BASIC release.
Start the local Viewer with a fresh starter card, choose PICO9918 at 80 columns,
then type `CAVBASIC`. Use `LOOK` and `LIST` freely during review.

## Review checkpoints

| Phase | What to review |
|---|---|
| Hut and forest | The objective is clear; compass makes directions reliable; curved paths retain their original behavior. |
| Outward bridge | The troll is dangerous, but the string bridge permits crossing and remains available for homeward travel. |
| Upper caves | The treasure-room entrance explicitly suggests explosives. Key and rope are discoverable before the descent. |
| Temple | Rope descent has no reverse climb. The key opens the crypt and stays behind. APE solves the original word riddle. |
| Cell and waterfall | The cell has no west return. Removing the grille opens east; a waterfall visit enables the route north into the drains. |
| Castle | The drains, conduit and wooden bridge reach the castle from behind. Its inscription teaches GALAR; the magazine supplies the bomb. |
| Treasure room | GALAR returns to the upper caves. Ignite the bomb at the entrance: the door opens, the player stays outside, and east leads to the demon. |
| Home | Retrieve the key, use GALAR, return across the bridge and unlock the hut. Banking treasures yields 126 points. |

## Command route

The route includes optional visits for map coverage and a brick pickup/drop for
inventory testing. The source-derived model takes 160 commands before QUIT
with six first-strike victories. In the running game, **repeat each `use sword`
until the enemy is defeated**, then continue. Combat has genuine random risk;
a losing adventure can be restarted with Y. A successful adventure itself
does not need a death, replay knowledge or a command exploit.

The native regression follows this route with real randomness, compares all
object locations, and supplements it with off-target blast, inventory and
one-way-passage checks. It also visits the remaining bat room after banking
the treasure, then restores the compass to the hut before checking the ending.

```text
get compass
north
west
south
south
west
get sword
east
east
get coin
west
north
east
east
south
use sword
south
south
south
west
use sword
south
south
get candle
west
north
get diamond
west
south
south
east
west
get brick
south
west
south
west
get key
east
south
north
south
north
east
north
east
north
north
north
get rope
south
south
south
west
north
west
south
south
south
east
use rope
drop brick
use key
ape
east
get grill
east
drop grill
south
use sword
west
get sword
use key
east
east
south
east
north
get ruby
south
west
north
west
north
north
get pearl
north
use sword
south
south
west
north
west
north
east
north
south
south
west
north
west
north
west
west
west
get stone
south
east
north
east
get bomb
west
west
west
galar
south
west
north
west
east
use sword
use candle
east
use sword
drop candle
drop sword
get ring
get pendant
get grail
get shield
galar
south
west
north
west
south
south
south
east
use rope
get key
galar
north
east
north
north
north
west
north
use key
drop coin
drop compass
drop ruby
drop diamond
drop pearl
drop stone
drop ring
drop pendant
drop grail
drop shield
score
quit
n
```

The score must be 126, with the “Perfectionist and genius” ranking.
The separate test-only bat tour is not necessary to finish the adventure.
