# Caverns original-text recovery action list

Author review, 18 November 2026. No game edits in this increment.

The earlier restoration covered the room paragraphs but left shortened
state-dependent messages in the engine. It did not establish that every
original scene or line of dialogue had been recovered. The complete inventory
now covers both paths instead of relying on terse-text heuristics.

## Editorial audit and later concision

The [editorial reform register](caverns-editorial-reform-register.md) now gives
an individual disposition for all 54 rooms and 16 concrete message reform
areas. This goes beyond the comparison inventory: it judges what was lost,
what is duplicated, what is a useful modern addition and what reflects an
approved gameplay change. Findings remain pending application.

The author requests full-prose recovery before skilled editing for concision.
Aim for roughly 30% shorter room descriptions only where this preserves the
evocative elements. Do not impose a quota, promise a 30% executable saving or
return to compressed labels. Remove duplication and weak additions before
cutting original imagery. Measure encoded text, final COM size and runtime
headroom separately against the full recovered candidate.

## Comparison records

- [Full original/current comparison](caverns-text-comparison.md): all 54 rooms,
  all 24 creature/item names, grouped messages and complete PRINT inventories.
- [Machine-readable inventory](evidence/caverns-text-audit/inventory.json): exact
  archival source statements, line numbers, hashes and current source lines.
- [Proofreading review](caverns-proofreading-review.md): spelling, grammar,
  punctuation and arrival-neutral wording candidates.
- [Walkthrough decisions](caverns-review-issues.md): author-approved refinements
  and questions that remain undecided.

The archive was fetched from the Caverns repository's remote master branch.
The source is its protected MicroWorld BASIC listing, not Caverns80. Its local
checkout has pre-existing unpublished documentation; this audit reads the
pinned remote object without changing or publishing that unrelated work.

Reproduce beside a checkout of the archival repository:

```
node tools/caverns-text-audit.mjs ../caverns d60481500140c79da0e6e06719a518c4231c4588
```

Room extraction is restricted to the original renderer. The prior restoration
rooms.json accidentally associated later door/bomb action messages with room
paragraphs for rooms 2 and 20. It remains a historical receipt. Use this scoped
inventory for original-text provenance rather than copying those mixed strings.
The new appendices retain every PRINT source line so unpaired messages cannot
silently disappear merely because a comparison group misses them.

## Recovery work queue

Each item needs a disposition: restore original with mechanical corrections,
retain a documented approved modernization, or obtain an author decision.
An added direction is not automatically an improvement. An original sentence
is not automatically compatible with a changed puzzle. No game rewrite or
restored obsolete behavior is authorised by this inventory.

| Text area | Established difference | Next action |
| --- | --- | --- |
| Wizard entrance | Original swirling mist, outstretched hand and dialogue were shortened to a blocking-the-way summary. | Recover the original scene with spelling/grammar fixes while preserving the current encounter state. |
| Dragon entrance | Original enormous green sleeping dragon, flickering eyes and leap with jets of fire were condensed. | Recover the scene without repeating its awakening on every redisplay or duplicating the generic creature list. |
| Dwarf entrance | Original lantern, quoted duty and dagger lunge were shortened. | Recover those details; correct original drawf/andlunges and respect current game rules. |
| Room exits and additions | Modern exit explanations were appended throughout the restored paragraphs. Some use compressed lists or presume prior visits. | Review every room pair; retain useful bearings in full natural sentences with a/an for newly introduced landmarks. |
| Door, gate, seal, shaft and drawbridge status | Current engine has terse fragments separate from the room data. | Replace with natural state-aware sentences, including both closed and open variants; avoid duplicate descriptions. |
| Death and aftermath | Original chasm description, named-creature death and swirling-cloud aftermath were shortened. | Present original/current alternatives for author review; retain warned hazards and current combat semantics. |
| Score and ranking | Full introduction to the adventurer ranking was shortened to Ranking. | Review prose alongside new homecoming behavior; preserve score126 and current accounting. |
| Candle, bomb and rope | Some original lines were removed or replaced because their mechanics changed. | Preserve the agreed fixes. Do not restore room-number teleportation, a rope that prevents return, or obsolete candle side effects merely to recover wording. |
| Crypt riddle, cell and drawbridge | Original lines refer to APE, a closing western wall and magical drawbridge movement. | Retain approved VARD, reversible crypt and current bridge rules. Compare atmosphere separately from behavior. |
| Generic replies and item labels | Some are unchanged; others differ in tense, spelling, articles or length. | Review the complete inventories, not just the illustrative rows here. Avoid blanket modernization. |

## New balcony instruction

The author now expressly requests temple rather than pagan temple in room28.
This extends the earlier room26 instruction to the balcony description too.
The original balcony already includes the cavern converted to a temple,
Loki's dedication, exile by Odin and waiting for the End Of All Things. The
current version lightly rephrases those sentences; they are not newly invented
lore. The sturdy rail and final west/below directions are modern additions.
They are complete sentences but should be reviewed for voice and arrival-neutral
articles rather than presented as original wording. Keep the rail needed by
the agreed explicit rope action and preserve useful navigation information.

## Completion criteria for the later text build

1. Assign every changed room and message a disposition in the comparison.
   Include modified, removed and newly added prose, not just shortened strings.
2. Restore approved original wording with only needed grammar/spelling changes.
   Keep UK spelling, restrained commas and the author's requested vocabulary.
3. Resolve ambiguous meaning with the author instead of inventing lore.
4. Preserve current exits, puzzle flags, inventory, RNG and combat probabilities.
   Descriptions must remain truthful after state changes and from any entry.
5. Rebuild the source-only card and matching checkpoints and verify the exact
   compiled output in the Viewer after native regression and size checks.
6. Record exact game/source identities and publish the qualified text increment
   on main. Until then the current game/card is unchanged.

The inventory is complete at the stated source-line scope. Sentence-by-sentence
editorial classification and application are still pending; this report is not
a claim that all prose problems have already been fixed.
