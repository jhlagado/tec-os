# What the recovered game implies

This is an audit of the recovered MicroWorld BASIC, not a decision to replace
its rules. The author's current preference is to retain compass disorientation,
the bridge hazard and the original spirit. Those preferences take precedence
over earlier Caverns80 design notes.

## The hut and key

The hut is room 1. Its door leads north to the forest clearing, room 2; the
ordinary south exit is locked. The key starts in room 34. The original key
handler at BASIC line 142 moves the player from room 2 into room 1, or from
the temple (35) into the crypt (37). It leaves the key at the starting room,
so it can be picked up again. Depositing treasure in the hut doubles its score.
The intro explicitly says that returning the treasure to the hut is the goal.

## Compass and bridge

Without the compass carried or lying in the current room, line 116 chooses a
random compass direction. This is purposeful disorientation, not a lack of
random-number support. The intro warns that forest paths curve and double back
and calls the compass "of immeasurable value." That is evidence for retaining
some deliberate asymmetries, rather than requiring every forest edge to reverse.

Line 86 sets H to 128 after a command on the bridge, room 11. H supplies the
south exit of room 10 and north exit of room 12. Destination 128 is fatal.
The player can finish crossing, but cannot normally step back onto the bridge.

## The drainage route

The original late-game route matches the author's recollection of conduits
and a second, wooden bridge:

```
underground drains (41) --west--> conduit (54)
conduit (54) --south--> wooden bridge (53)
wooden bridge (53) --east--> east riverbank (52)
east riverbank (52) --north or east--> castle courtyard (50)
```

The reverse wooden-bridge and conduit connections return to the underground
network. None of these recorded destinations emerges in rooms 1–10, the hut's
side of the collapsed bridge. GALAR goes to room 16, the cave entrance, which
is still on the other side.

The audit optimistically unlocks the vault, crypt, grille, waterfall and
drawbridge, and includes the key, rope and GALAR actions. From the conduit it
finds a route to the hut with the original bridge intact; it finds none after
the bridge collapses and the bomb has been spent opening the vault.
`test/caverns-original.json` retains the extracted table and the result.
Regenerate it with:

```
node tools/caverns-original-audit.mjs ../caverns/src/caverns.basic
```

There is an important qualification: the old bomb handler also moves the player
one room number down. Using it at room 12 could place the player on the bridge.
But there is only one bomb, and it is needed for the treasure vault, so this
is not a reusable route for a full-score adventure. The audit is static source
inference; it does not claim to have executed the original MicroWorld runtime.
The protected recovered listing has the same relevant bridge, spell and key
handlers.

## What remains a design decision

The original allows 11 carried objects; Caverns80 allows 10. Together with the
key and light requirements, this affects whether banking must happen in stages.
Do not silently classify that limit, the bridge or the compass as a bug merely
because the newer game's winning route assumes different rules.

The recovered table suggests a missing or misdirected emergence from the
wooden-bridge/east-bank section. A small repair there may fit the intended
story better than making the original bridge permanent or changing GALAR.
Its exact destination and clue are not established by the recovered listing.
No new return connection or spell destination has been adopted.

The BASIC program presently on the trial card is explicitly an experimental
Caverns80-rule comparison. It has a verified winning route and 54-room tour,
but those results apply to that identified rule set. They do not prove that
the original one-use-bridge version is completable. Keep that distinction until
the intended return path is settled and both implementations' tests are updated.

## Randomness

Caverns80 uses a software 16-bit LFSR; BAZA uses xorshift32. Both are suitable
pseudorandom mechanisms for a text adventure. Repeatable seeded tests and
random gameplay are compatible: tests can fix the seed, while normal play can
seed from timing or user input. A hardware random-number generator is not
required to preserve the compass mechanic.
