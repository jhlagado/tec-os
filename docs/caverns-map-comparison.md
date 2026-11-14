# Caverns80 map comparison — author review

**Spoilers: engineering review, separate from the player manual.**

Comparison against jhlagado/caverns80 3c033e9a24f9873389c26c2a3d680cf79a69d6ec. All 57 differing initial compass destinations are listed below. Zero is blocked; 128 is fatal. Dynamic gates are compared in their initial state, so this table does not enumerate every state-transition difference.

The author now treats avoidable compass inconsistencies and misleading room descriptions as bugs. Prefer the Caverns80 repair unless inspection identifies a useful deliberate exception or a harmful puzzle bypass. No changes have been applied to the running review session.

| Room | Direction | Running BASIC | Caverns80 |
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
| 20 | North | 21 | 0 |
| 20 | South | 23 | 21 |
| 21 | North | 0 | 20 |
| 21 | East | 20 | 22 |
| 22 | East | 16 | 0 |
| 23 | West | 18 | 0 |
| 24 | East | 18 | 0 |
| 25 | South | 27 | 0 |
| 25 | West | 24 | 26 |
| 27 | North | 18 | 26 |
| 29 | North | 0 | 30 |
| 30 | North | 29 | 0 |
| 30 | South | 31 | 29 |
| 30 | East | 0 | 32 |
| 31 | North | 32 | 33 |
| 31 | West | 0 | 32 |
| 32 | North | 33 | 0 |
| 32 | South | 30 | 0 |
| 32 | West | 0 | 30 |
| 32 | East | 0 | 31 |
| 33 | North | 0 | 29 |
| 35 | East | 0 | 36 |
| 41 | North | 46 | 0 |
| 41 | South | 43 | 0 |
| 42 | North | 46 | 0 |
| 42 | South | 43 | 0 |
| 44 | North | 47 | 0 |
| 44 | South | 47 | 0 |
| 44 | West | 0 | 43 |
| 44 | East | 47 | 0 |
| 45 | North | 0 | 47 |
| 46 | North | 47 | 0 |
| 46 | South | 0 | 43 |
| 46 | East | 47 | 0 |
| 47 | West | 46 | 0 |
| 47 | East | 0 | 46 |
| 52 | East | 50 | 0 |
| 54 | West | 41 | 0 |
| 54 | East | 0 | 41 |

## Confirmed descriptive bug: clover field

The BASIC description puts the hut north and north returns to the clearing, although the field is reached by travelling east from the clearing. Caverns80 makes west the return direction and describes the hut west. Correct the geometry and wording together; the current live build is unchanged.

## Dependency warning

Caverns80 also adds temple east to the wizard cavern and a waterfall/stair/drain route. Static reachability allows reaching the castle with the crypt/cell gates still closed, making the riddle and grille optional. This requires an explicit design decision rather than automatic adoption. See caverns-review-issues.md, NAV-07.

## Description audit still required

This is the complete initial-exit difference list, not a completed audit of all prose. Check each room description and conditional message against the chosen graph; flag omissions, wrong bearings and undiscovered exits separately.
