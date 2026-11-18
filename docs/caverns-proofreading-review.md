# Caverns proofreading review — 18 November 2026

Historical audit snapshot. The subsequent implementation and current checks are recorded in [prose recovery and light editing](caverns-prose-concision.md).

Status: source-inspection review, not applied to the game. The author asked
for spelling, grammar and missing-word corrections while preserving original
sentences, atmosphere and voice. Accumulate during the live walkthrough.

Scope inspected: all 54 room descriptions and all 24 object descriptions in
`programs/caverns/world.json`, every displayed string in
`programs/caverns/engine.bas.in`, and the public `programs/CAVERNS.TXT`.
This is a manual first pass, not proof that every possible prose issue has
been found. No exits, rules, BASIC source, binaries or card have changed.

## Author punctuation and voice rule

The author explicitly requests minimal commas in descriptive prose, no Oxford
commas and no unnecessary comma immediately before or after and. Retain a comma
only where grammar or clarity needs it. Prefer a full stop for an overloaded
sentence rather than inserting more punctuation. This is a careful sentence
review, not a global comma-deletion operation. Preserve the original voice and
complete sentences. Earlier suggested quotations elsewhere are subordinate to
this preference and must be checked before application.

Remove the modern added word sealed from the tunnel's crack description. The
original narrow crack is the reference; do not invent physical explanations or
new clues to justify the blocked route. These decisions remain queued prose
changes during the live walkthrough, not edits to current game artifacts.

## Clear mechanical corrections

| Location | Current wording or formatting | Minimal correction |
| --- | --- | --- |
| Troll adjective | axe wielding | axe-wielding |
| Dragon adjective | fire breathing | fire-breathing |
| Compass adjective | useful looking | useful-looking |
| Bomb adjective | home made | home-made |
| Ruby adjective | blood red | blood-red |
| Ring adjective | diamond studded | diamond-studded |
| Shield adjective | mirror like | mirror-like |
| Teleport message | Suddenly a magic wind carried you to another place... | Suddenly a magic wind carries you to another place... (match the surrounding present-tense narration) |
| Failed movement message | You can't go that way | Add the final full stop. |
| Darkness message | anything...I'm scared! | Add a space after the ellipsis: anything... I'm scared! |
| Ranking message | Excellent...but you've left something behind! | Add a space after the ellipsis. |
| Copyright banner licence title | GNU Public License, 2019 | GNU General Public License, 2019 (correct licence name; preserve year) |

The adjective fields include deliberate leading/trailing spaces and, in some
cases, the final n of the article an. Preserve that assembly convention when
correcting hyphens; do not blindly trim fields or change vocabulary nouns.
Retain UK forms already present: vapour, draught, centre and vaporises.

## Ambiguities: resolve meaning before applying wording

- **Round chamber (26):** "Norse folk believe them to be gods." Grammatically
  possible, but them appears to refer to the monks of Loki. It is unclear
  whether this is the intended lore. Do not silently change it to worshippers,
  Loki, or another meaning. Retain pending an author decision.
- **Torture chamber (23):** "the entrance cavern lies to the east" uses a room
  label that sounds like a dropped word. The author requested "the entrance
  to the cavern lies to the east". East actually returns to the inner cavern,
  with the daylight entrance north from there. A minimal unambiguous option is
  "the cavern near the cave entrance lies to the east". Preserve the route;
  choose final wording with the author. The preceding long sentence has a
  valid plural subject (blood stains and bits of bone); do not rewrite it
  merely because it is long or macabre.
- **Treasure doorway (20):** "its heavy timber bound with iron" follows oak
  doorway. The timber refers to the door, although the opening is the named
  noun. Consider "an oak door in the eastern wall, its heavy timber bound with
  iron" only if the resulting static description remains truthful after the
  door is blasted open. This was deliberately neutralised in the last pass;
  avoid reintroducing a stale intact-door description after the explosion.
- **Key chamber (34):** "beyond the bat colony" assumes an approach from the
  colony, although another approach exists. It is not a spelling error.
  Consider "near the bat colony" only if needed for route-neutral narration.

## Output grammar and presentation

- The shared object printer always ends an object with a comma and space,
  including the only or last item and single TAKE/DROP confirmations. End
  single-item confirmations with a full stop and format multiple-item lists
  without a dangling final comma. This is an output-format change, not just
  an adjective edit; preserve articles and all inventory contents.
- "Nearby there lurks..." is singular even if a scenario places multiple live
  creatures in one room. Prefer a count-aware form or "Nearby you can see...";
  avoid changing the intentional narrative tone without need.
- Generic combat switches between creature, foe, he and his. A consistent it/
  its is a minimal correction for non-human creatures. Creature-specific
  attacks (dragon fire/claws) remain a separate author-requested wording task,
  not a grammar fix or permission to alter combat odds.
- Several newer dynamic gate/door messages are fragments (for example "North
  gate locked."). They are understandable status lines, not missing-word
  errors in the archival prose. If expanded to sentences, preserve exact
  open/closed state distinctions and the author's preference for natural
  prose. Do not introduce another broad rewrite.

## Already recorded walkthrough refinements

- Bridge midpoint: final sentence becomes "Hold tight and follow it either
  north or south." Remove the redundant east/west clause; exits stay blocked.
- Dragon: avoid repeatedly waking an already awake creature and duplicating
  its introduction with the nearby-creature list. After defeat the live text
  already disappears and the corpse text is conditional.
- HELP, matches/candle lighting and compact saves are separate feature proposals,
  not proofreading corrections. None is implemented by this review.

## Text to preserve

No dropped-word or obvious spelling correction was found in the remaining
room descriptions during this pass. Preserve the original jokes, exclamations,
VERY/WOW emphasis, contractions, named places and characters. In particular,
"four-leafed clovers", "living rock", "croaked it", and "really super castle"
are valid stylistic choices, not errors to normalise away. Do not modernise
mythology or historical phrasing as part of proofreading.

## Later application checks

Apply only agreed minimal corrections, regenerate the ten-step BASIC listing,
and retain uppercase keywords/lowercase variables. Rebuild using the pinned
BAZA pair, reissue address/hash-bound checkpoints, and refresh source-only
media/Viewer only after the appropriate checks. Compare all exits, object
state, RNG and non-prose behavior against the qualified version. Check the
corrected text at 80 columns and exercise both sides of each dynamic message.
Until then the running game and its published card remain unchanged.


## Arrival-neutral article sweep and round-room provenance

Additional author direction during the 18 November walkthrough: use a/an when
introducing an unseen landmark instead of presuming the player already knows
it. This is semantic review, not a global replacement of the. Keep definite
articles for something already introduced in the same description, unique named
features, body parts and definite relations. Record candidates without changing
the running game.

All 54 room descriptions were checked again for destination articles, returns/
back phrasing and assumptions about the entry route. Main candidates:

| Rooms | Review candidate |
| --- | --- |
| 3, 4, 9 | Introduce a hut clearing or a field of clovers without assuming a visit. Keep Mount Ymir as a proper name. |
| 5, 7, 10, 14, 15, 17 | Review returns/back as route-dependent wording; leads is neutral. A safe exit remains explicit at the crater. |
| 20, 21, 22 | Apply the already recorded doorway/cavern/corridor decisions; introduce a cavern and a long tunnel. |
| 26 | Replace the compressed exit inventory with complete sentences introducing a long tunnel, a river ledge, bat caves and a side cave. |
| 27, 28, 29, 30 | Introduce a round chamber, an upper river ledge and a junction as first-seen destinations when appropriate. |
| 34 | Avoid beyond the bat colony as an assumed approach. |
| 35 | High overhead is the balcony from which you descended assumes rope descent. The player can also return via the crypt. Prefer a balcony high overhead without asserting the most recent route. |
| 36, 37, 38, 40 | Review the temple, crypt and cavern as previously known destinations; preserve visible/established relations and specific gates. |
| 42, 43, 44 | Introduce a conduit/junction without implying a previous visit; leads instead of returns. |
| 45, 47, 48 | Introduce a lower ledge/waterfall where not established; keep a visible feature definite once introduced in the same passage. |
| 49, 50, 51, 52, 53, 54 | Review courtyard, powder magazine, conduit and riverbank as route destinations; no automatic global article changes or exit edits. |

The original round-room description already contains the mystical dark purple
walls, chalk star, infamous pagan sect, monks of Loki and ambiguous sentence
about Norse folk believing them to be gods. Its preserved spelling has a missing
space in staris. The current compressed final exit list is a modern addition,
not archival wording. The author now explicitly requests removing pagan from
the round-room sentence; this does not by itself authorise removing it from
the separate balcony/temple description. Keep the original atmosphere and
correct spacing/grammar with minimal changes. The them ambiguity remains open.

Candidate replacement for the modern exit list, respecting low-comma style:
"A long tunnel leads north. A passage south leads to a river ledge. Bat caves
lie to the west and a small side cave opens to the east."

The author's latest crack instruction allows improving or removing the entire
unhelpful glowing-crack sentence. This supersedes treating deletion of sealed
alone as a complete solution. Do not invent a new light source or puzzle.
