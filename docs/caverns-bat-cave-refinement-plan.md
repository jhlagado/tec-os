# Bat-cave refinement — author-approved approach, proposed layout

> Implemented in the gameplay revision. The plan below is historical; see
> [current map audit](caverns-map-audit.md) and [current rules](caverns.md).


The author approved simplifying this region while keeping a small, recognizable
maze, and delegated its redesign in the review notes. This document is the
concrete design for the later gameplay batch. No source, map, checkpoint or
live-game state is changed by writing it.

## Purpose and scope

The key in room 34 is the only initial collectible in rooms 29–34. It opens
the hut door and the temple gate. The giant bat can deliver the player to
colony 33 from the entrance-side passage; walking in from the round chamber
is the other approach. This region has no additional treasure or bespoke
puzzle to solve. Its practical objective is to find the key and return to
round chamber 26, ready to continue toward the ledge/balcony/temple.

Keep all six rooms and the same key/creature placements. Retain the colony's
atmosphere and a short optional winding loop, with recognizable landmarks.
No new consumable, enemy, required combat, fatal compass exit or hidden action.
The transport bat's separate behavior is not redesigned here.

## What to adopt from Caverns80, and the deliberate exception

Adopt its reciprocal ordinary paths and its direct colony-north return toward
the round chamber. Preserve its short direct trip to the key. Its five-room
outer loop still contains an all-north/east cycle, so it cannot represent
ordinary compass geometry. That is the flagged exception to importing the
Caverns80 map verbatim. Replace the loop with the simple rectangle below.

The key chamber gets a west connection to the loop; the key stays in room 34.
It is no longer a dead-end alcove. This is an explicit design choice: either
way around the small loop can discover the key, and the short route is clear.
No puzzle gate or scoring rule is bypassed.

## Proposed layout

Horizontal connections run east/west. Both vertical connections run north/south.
All lines can be retraced in the opposite direction. There is no connection
between the top-middle and bottom-middle rooms.

```text
 Pale chamber 32 ---- Split-stone 30 ---- Junction 29 ---- Round room 26
       |                                      |
 Low passage 31 ----- Key chamber 34 ----- Bat colony 33
```

| Room | Landmark / role | North | South | West | East |
|---:|---|---:|---:|---:|---:|
| 29 | Draughty junction; bat sounds south; route back east | 0 | 33 | 30 | 26 |
| 30 | A forked stone pillar; winding outer passage | 0 | 0 | 32 | 29 |
| 32 | Pale limestone walls; bend south | 0 | 31 | 0 | 30 |
| 31 | Low roof and dripping water; bend east | 32 | 0 | 0 | 34 |
| 33 | Existing central bat colony; droppings and smell | 29 | 0 | 34 | 0 |
| 34 | Key in a shallow recess; western passage also visible | 0 | 0 | 31 | 33 |

Zero means blocked, not fatal. The landmarks are descriptive scenery, not
collectible objects or concealed command puzzles. Descriptions must state the
visible exits and match this table. Do not claim an orientation for the whole
river or add a route to the lower temple/castle region.

Keep descriptions concise and reuse the colony text, subject to copy edits.
This is a six-room navigation/text edit, not a request to add objects or grow
the runtime. Measure the compiled size when implementing.

## Routes and difficulty

Short discovery trip from the round room:

```
WEST, SOUTH, WEST, TAKE KEY, EAST, NORTH, EAST
```

From the current checkpoint 4 at the colony:

```
WEST, TAKE KEY, EAST, NORTH, EAST
```

Those are proposed-map routes, not commands to execute against the unchanged
review build. The original colony's north exit is still blocked there.

Optional longer approach from junction 29:

```
WEST, WEST, SOUTH, EAST
```

This reaches key chamber 34 by going around the loop. After taking the key,
east reaches the colony; north and east return to the round room. An explorer
can walk either direction around the loop, identify the landmark rooms and
retrace every step. The challenge is modest exploration, not remembering
arbitrary non-reciprocal directions or dying to learn the route.

## Acceptance before implementation is qualified

- All listed ordinary exits have their opposite return, including 26W29.
- The diagram and every landmark/exit description agree with the table.
- Both approaches reach the same key; taking it changes only its carried state.
- A player delivered by the bat can find the key and walk out toward room 26.
- Every region room remains reachable, with no new one-way or fatal exit.
- The six-move round-room/key round trip works with the carry/candle limits.
- Preserve the original key's hut/temple functions and the existing bat rule.
- Rebuild and run native completion/room checks; measure size and refresh
  loader identities/scenarios after the source/map changes.
- Record that the key chamber's new west exit and the rerouted loop are
  intentional deviations from Caverns80, not accidental map differences.
