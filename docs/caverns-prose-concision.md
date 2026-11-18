# Caverns prose recovery and light editing

Native qualification is complete. Two full platform runs pass 1,433 tests
each. A final one-sentence literal correction then passes all 41 affected
native checks and 16 conditional-prose observations. No compiler, runtime,
world topology or puzzle-state change is part of this increment. Viewer final
pin/publication status is recorded separately in the qualification receipt.

The full-prose candidate is retained in
[full-prose-candidate.json](evidence/caverns-prose-concision/full-prose-candidate.json).
It restores the shortened creature scenes and expands the modern status
fragments. The separate concision pass preserves the approved navigation,
warning, rope and clue changes. It removes duplication and unnecessary commas
rather than replacing descriptions with labels.

Current room text: 8,158 characters versus 10,387 in the recorded full-prose
candidate (21.46% less). This is not a 30% reduction in executable size. The
rough 30% editorial aspiration is not enforced at the expense of imagery.
The native candidate is 35,968 file bytes (35,941 logical), saving 1,280 file
bytes versus the previous build. It leaves 5,275 bytes before dynamic allocation
after the 768-byte stack reservation. Qualification is still pending.

Recovered scenes include the wizard's swirling mist and hand, the green dragon
and its jets of fire, and the dwarf's lantern and dialogue. Generic nearby-foe
listings no longer duplicate those full scenes. Ordinary creatures still use
the shared listing. All state and RNG must match the frozen native baseline.

An exact message-edit manifest records permissible output differences for
comparison. Room paragraphs are compared through known prose variants. These
exceptions do not permit different movement, inventory, scoring, turn counts,
monsters, puzzle flags, RNG, arbitrary diagnostics or unlisted command replies.


## Exact editorial record

[All 54 before/recovered/edited passages](evidence/caverns-prose-concision/room-edits.json)
are retained alongside the full recovery candidate. The message edit manifest
is test/fixtures/caverns-prose-message-edits.json. The original/current audit
remains a frozen record of the version reviewed by the author; it is not
silently regenerated to make these subsequent differences disappear.

The original ambiguous Norse-folk sentence is retained pending an author
meaning decision. Matches, in-game HELP and save/load are not implemented by
this text-only increment. These remain separate review items.

## Examples of the editing approach

- The crater retains its slippery rim, rising water vapour and the Gioll pouring
  into it. Its deliberate fatal-west warning remains explicit.
- The torture chamber retains inhuman agony, coagulated blood, mangled bones
  and the author's croaked-it voice. Exit directions now identify the correct
  neighbouring cavern without assuming a previous visit.
- The bat colony retains hundreds overhead, centuries of droppings and the
  indescribable smell. The alternate loop has recognisable landmarks.
- The temple retains Loki carved from living rock. Its gate state is a full
  sentence rather than North gate locked/open. The repeated bearing and
  automatic UP/DOWN coaching are gone.
- A closed oak door is described with its iron binding and inside lock. The
  explosives idea is a natural suggestion. The open state describes the
  passage rather than continuing to claim an intact door.
- Wizard, dragon and dwarf scenes include recovered imagery but no longer
  repeat a generic nearby-creature listing immediately afterwards.


## Representative edited passages

**Crater:**

> You stand on the slippery rim of an enormous crater. Clouds of water vapour
> rise as the Gioll pours into it. West is a fatal drop. A safe path leads east.

**Bat colony:**

> You are in the heart of a giant bat colony. Hundreds hang overhead above
> centuries of bat droppings. Careful where you step! The smell is
> indescribable. A junction lies north and a passage leads west to another chamber.

**Wizard:**

> Before you in a swirling mist stands an evil wizard with his hand held
> outwards. 'Thou shalt not pass!' he cries.

**Dwarf:**

> From around the corner trots an old and gnarled dwarf carrying a lantern.
> 'My job is to protect these stone steps!' he says and lunges at you with his dagger.

**Temple gate, depending on state:**

> To the north is a locked gate.

> To the north is an open gate.

The statue remains in the temple paragraph. These sentences replace the
additional clipped status, not the original statue imagery.


## Controlled native size comparison

The same final engine and object/rule DATA were compiled with the untrimmed
recovered room paragraphs as a separate, unshipped control. It is 38,272 file
bytes (38,272 logical). The edited build is 35,968 file bytes (35,941 logical),
saving 2,304 file bytes or 2,331 logical bytes from room editing alone. The
control is a successful compilation measurement, not a full-play qualification.
[Exact evidence](evidence/caverns-prose-concision/budget.json) includes both
compiler/runtime identities and executable hashes. Reproduce it with
`node tools/caverns-prose-budget.mjs` after building the normal starter card.
Neither CAVFULL.BAS nor CAVFULL.COM is included in the public media.

A fresh browser compiled the exact edited COM from the source-only starter,
played the opening, displayed the temple and restored an exported checkpoint
in independent browser storage. Its [result](evidence/caverns-prose-concision/browser-result.json)
and temple screenshot are retained. A stale article assertion was corrected;
no source/runtime change was needed. The full platform reference runs are complete. The final literal-only
polish and its scoped evidence are distinguished below.


## Final literal-only polish and evidence scope

After the platform reference runs, the crypt sentence was shortened from
"The eastern wall of the crypt slides open. The passage stays open behind you."
to "The eastern wall of the crypt slides open." This removes an arrival
assumption and repeated information. Only 35 literal bytes changed; executable
record rounding saves another 128 file bytes. No game logic changed.

The platform reference COM is 594b1e39 (36,096 bytes). The final COM is a686342f
(35,968 bytes). Both full 1,433-check logs identify the reference version.
The final artifact separately passes all 41 affected game/card/editor/vector
checks, the 480-command state/RNG comparison and 16 state-dependent prose
observations. All unaffected OS/compiler/Viewer implementation bytes remain
unchanged. Final compilation and browser receipts identify the exact final COM;
do not treat the older browser screenshots as final-artifact compilation proof.
