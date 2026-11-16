# TEC-OS Book: BASIC Caverns handover

This is the current practical-manual handover, including the behaviour-preserving
BASIC rewrite and the earlier landmark wording corrections. Walkthrough spoilers are in
[caverns-walkthrough.md](caverns-walkthrough.md), not this teaching outline.

## Readiness

Qualified in the native TEC-OS emulator: compile with the shell resident;
126-point quest; all 54 rooms and displayed descriptions; automatic homecoming;
reversible rope/gates; complete checkpoint restoration; TED edit/save/build/run,
exit and reopen after power cycle. Eighteen game/scenario/TED/rewrite tests pass, plus a native test inserting
line 151 without renumbering and nineteen starter-card tests. Two Viewer recipe/bundle tests pass. A separate real
Chromium trial compiled from a fresh source-only card to the exact expected
COM, played opening commands, and exported/restored a checkpoint in fresh
browser storage. Physical TEC-1G testing and final human review of the revised
adventure remain outstanding before calling the public release fully qualified.
Changes are pushed on integration branches, not claimed merged or publicly
hosted. The manual may describe tested emulator behaviour with that boundary.

## Exact artifacts

| Artifact | Repository / pin / path |
|---|---|
| Qualified gameplay/source/card recipe | jhlagado/tec-os, fe0df27d4f5caf5bd1b1146deefe198f980db6c7 |
| Source supplied on SYSTEM | programs/CAVBASIC.BAS |
| Verification executable, not on starter | programs/CAVBASIC.COM; 39,680 bytes |
| Source/binary/compiler/RTL hashes | test/caverns-basic.json |
| Instructions supplied on SYSTEM | programs/CAVERNS.TXT |
| Main-volume starter recipe | dist/starter.recipe.json, revision 17; image dist/starter.img |
| Matching Viewer integration | jhlagado/tec-os-viewer, c0d1fdea6e8bfc84d574149f3ede9d45e7f85805 |
| BAZA compiler/runtime pins | jhlagado/baza, 8578fe50fdfc66e16015c54f365d1403825979da, dist/BAZA.COM and dist/BAZA.RTL |
| Supporting editor/compiler/runtime | TED.COM, BAZA.COM, BAZA.RTL on SYSTEM, pinned by test/inputs.json |
| Scenario tools, development only | tools/caverns-scenario.mjs; programs/caverns/CAVLOAD.COM and *.CAV |

Compiler SHA-256: 41f96c2716274327fd84180b3cadbb277a8d4f7faacf95b0e31fe3fdceb0acc6.
Runtime SHA-256: 3c77dccda2221616dd2573183f137d5d4131218b9f024b521982c44b0567bc64.
Source SHA-256: f64fdb84ead251e3e49590c4c156d7951afc52fb02ffad959cf819b20760b9e0.
Executable SHA-256: 841e208da7603054ed3e86d9f52a58c7de87f0a7a4c29e5d1f41599971733ee0.
No BAZA/compiler change was required for the rewrite. Engine authoring source
and world data are separate; the supplied BAS uses ten-step numbering,
uppercase keywords and lowercase variables. Native compilation needs no generator. RTL is linked
selectively into the COM; its 12,800-byte file is not loaded beside the game.

## Tested user exercise

On the starter card, SYSTEM is A:. For an existing Viewer card, download it
before choosing New starter card; reloading preserves the old card and does
not magically substitute new source. On a fresh card:

```
CON PICO 80
COPY CAVBASIC.BAS CAVBOOK.BAS
TED CAVBOOK.BAS
```

Edit the presentation banner (line 150 in this listing) to TEC-OS Book presents, retaining PRINT
and quotes. Ctrl-S saves, Ctrl-T B builds, Ctrl-T R builds/runs. QUIT then N
exits the game; dismiss TED's return pause, then Ctrl-Q leaves TED. Shell
alternative: BAZA CAVBOOK followed by CAVBOOK. Keep the supplied source intact.
Download the Viewer card after saving to preserve changes outside the container.
The exact editor workflow, including a saved-file reopen after power cycle,
is tested natively. Browser evidence separately covers compiling the untouched
source and opening play; do not describe browser TED interaction as tested by
that browser trial. No physical-board claim applies to either.

## Requirements and limits

Tested console: PICO9918 at 80 columns, matrix keyboard input. Shell-resident
TPA: 42,496 bytes; COM: 39,680, leaving 2,816 bytes for runtime working space
and stack. The no-shell TPA is 46,533 bytes, but this example does not need it.
Growth is constrained; use the small banner change, not a large library feature.
There are eleven carrying slots, finite candle life and random combat risk.
The candle is still found lit; matches and a burn clock starting on lighting
are deferred. Stronger startup entropy and in-game disk SAVE/LOAD are also
future work. Exact checkpoints intentionally repeat the saved RNG sequence.
A card-image download is not a game-memory snapshot.

## Evidence and release scope

- [Latest native game/scenario/TED tests](evidence/caverns-rewrite/native-tests.log).
- [Latest build](evidence/caverns-rewrite/native-build.log).
- [Exact build record](evidence/caverns-rewrite/native-build.log).
- [Starter tests](evidence/caverns-rewrite/starter-tests.log).
- [Latest Viewer native tests](evidence/caverns-rewrite/viewer-native-tests.log).
- [Latest real browser trial](evidence/caverns-rewrite/viewer-result.json).
- [Latest qualification summary](evidence/caverns-rewrite/qualification.json).
- [Strict baseline comparison](evidence/caverns-rewrite/differential.json):
  480 commands, 36 scenarios, all persisted state and RNG checked.
- [Reader line-insertion experiment](evidence/caverns-rewrite/reader-insertion.log).
- [Fresh checkout packs matching scenarios](evidence/caverns-rewrite/fresh-checkout-pack.log).
- [Engine and authoring structure](caverns-engine.md).
- [Map/prose audit, spoilers](caverns-map-audit.md).

BASIC Caverns is the intended public worked example. Only CAVBASIC.BAS and
CAVERNS.TXT are supplied for it; users compile their own COM. The assembly
CAVERNS.COM remains in the repository for development/reference, excluded from
the starter disk until gameplay parity is separately established. Developer
checkpoint files/loader are likewise excluded. Player instructions and the
banner-edit exercise do not need the spoiler walkthrough or full map.
