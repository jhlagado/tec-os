# Caverns prose recovery and light editing

Work in progress. The public main build is unchanged while this candidate is
qualified. No compiler, runtime, world topology or puzzle-state changes are
part of this increment.

The full-prose candidate is retained in
[full-prose-candidate.json](evidence/caverns-prose-concision/full-prose-candidate.json).
It restores the shortened creature scenes and expands the modern status
fragments. The separate concision pass preserves the approved navigation,
warning, rope and clue changes. It removes duplication and unnecessary commas
rather than replacing descriptions with labels.

Current room text: 8,158 characters versus 10,387 in the recorded full-prose
candidate (21.46% less). This is not a 30% reduction in executable size. The
rough 30% editorial aspiration is not enforced at the expense of imagery.
The native candidate is 36,096 file bytes (35,976 logical), saving 1,152 file
bytes versus the previous build. It leaves 5,240 bytes before dynamic allocation
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
