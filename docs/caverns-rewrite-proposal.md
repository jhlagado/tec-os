# A behaviour-preserving Caverns rewrite: proposal only

The author asked how we would organise this game if writing it afresh while
keeping the same gameplay. No rewrite is implemented or authorised by this
analysis. The current author-approved rules would be the baseline; the archival
bugs would not be silently reintroduced as a supposed fidelity requirement.

The most useful change is separation of responsibilities, not necessarily a
new language. BAZA BASIC can still be the delivered, reader-editable example.

## Author requirement: line-number spacing

The rewritten BASIC listing must use the normal spacing of **10**: 10, 20,
30, and so on. Leave the intervening numbers available for readers to insert
experimental lines without repeatedly renumbering the program. Any future
line-number generator must default to that spacing; compact numbering must
not consume the insertion space. This requirement applies to the future
rewrite, not an unsolicited renumbering of the currently qualified source.

1. **Explicit state.** One documented record for room, object locations,
   creatures, gates, attached rope, candle clock, score-relevant possessions
   and RNG. Immutable descriptions/connections/treasure values remain separate.
   Encode absence, carrying and attachment consistently; validate invariants.
2. **One command pipeline.** Read and normalise input; recognise verb, target
   and tool; validate presence and prerequisites; apply the action; advance
   clocks only when the rule says so; render the result. Recognition and LOOK
   should have no hidden world effects. Clarification is an explicit outcome.
3. **Small action handlers.** Movement, pickup/drop, unlocking, combat, tying,
   climbing, spells and homecoming each have one responsible routine. Keep
   special puzzle rules identifiable rather than scattered through noun lookup
   and printing. The old bomb-room arithmetic and remote waterfall trigger
   illustrate why; both are already corrected in the current game.
4. **Readable identities.** Author rooms, items and connections with names;
   generate compact numeric IDs and line-number targets for the delivered BAS.
   IDs identify entities, not accidental arithmetic relationships. Distribute
   the generated BAS so users can still compile it on TEC-OS without a host tool.
5. **Deliberate text and map data.** Keep descriptions beside the connection
   definitions they describe. Validate reverse routes, conditional gates and
   item placement during authoring. Distinguish a visible landmark's bearing
   from the initial direction of a winding approach. A map is not automatically
   a surveyed geography merely because opposite exits are reciprocal.
6. **Bounded memory.** Use integers for discrete state, initialise fixed tables
   once and avoid repeated allocations or a large general adventure framework.
   Keep selective runtime linking. The current one-string DATA scan deliberately
   trades some CPU work for memory; measure before replacing it with a cache.
7. **Versioned persistence.** Serialize the explicit state, including the RNG
   and attached/open conditions. A change to representation needs a versioned
   conversion, not guessing missing flags from object positions.
8. **Behavioural comparison.** Replay the same commands and initial RNG state
   through old and new engines, comparing location, possessions, creatures,
   puzzle flags, counters, score and output after each command. Cover failure
   and clarification paths as well as the successful full-score route.

“Same gameplay” must include when time advances, inventory limits, escape and
return routes, scoring, command aliases and random combat semantics. Replacing
the RNG or changing its call order can change a seeded encounter even if the
headline win probability is unchanged. Likewise, a cleaner parser must not
silently change the accepted grammar or target selection. Specify ambiguous
commands before claiming exact equivalence. Normalise display wrapping only
when comparing text; intended prose changes should be explicit.

I would freeze this qualified revision, then refactor one subsystem at a time
under those comparisons. That keeps the familiar adventure and its historical
BASIC role while making further maintenance and testing much less fragile.
