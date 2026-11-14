# Original Caverns and the refined BASIC release

The recovered MicroWorld BASIC and introduction are the source of truth.
The current release retains their map, compass, key, rope, magic words and
inventory rules. The author has approved a reusable string bridge and a
geographically coherent bomb puzzle; see [the release notes](caverns.md).

The one-way temple descent is purposeful: the crypt/cell puzzle admits the
lower caverns, drains reach the castle from behind, and its inscription teaches
GALAR, the repeatable escape to the upper caves. The castle's bomb supplies the
tool for the earlier treasure-room obstacle. The conduit contains the scoring
stone; the wooden bridge connects to the castle's rear approach.

Our earlier static audit correctly found no ordinary hut return *after an
outward crossing collapses the bridge and the bomb is spent*. That is not
proof the recovered program is wholly incompletable: advance knowledge of
GALAR allows outward teleportation, preserving the bridge for the homeward
crossing. The author considers that requirement for knowledge from an earlier
adventure unfair and selected a reusable bridge instead.

The original bomb subtracts one from the room number. A blast from cavern 21
lands at doorway 20 and opens its east exit; a blast directly at 20 lands in
treasure room 19 without opening it. Neither the arbitrary transport nor the
special detonation location is preserved by the refined bomb. The original
TAKE/PUT/tool aliases also bypass presence checks; these are fixed in the port.

`test/caverns-original.json` retains the recovered 216 exits and the historical
static graph audit. `test/caverns-refined-route.json` supplies the original-based
quest witness with the agreed refinements. These have different scopes:
neither is a claim to emulate every behavior of MicroWorld BASIC. The native
port's complete quest is tested separately in `test/caverns.test.mjs`.

The archival source has not been modified. Its sibling repository's
`docs/game-flow.md`, `docs/bugs.md`, `docs/bomb-dynamics.md` and
`docs/refinement-decisions.md` retain the detailed findings and author decisions.
