# TEC-OS Book: BASIC Caverns handover

This is the current practical-manual handover, including the description-only
landmark pass (no exit or gameplay changes). Walkthrough spoilers are in
[caverns-walkthrough.md](caverns-walkthrough.md), not this teaching outline.

## Readiness

Qualified in the native TEC-OS emulator: compile with the shell resident;
126-point quest; all 54 rooms and displayed descriptions; automatic homecoming;
reversible rope/gates; complete checkpoint restoration; TED edit/save/build/run,
exit and reopen after power cycle. Fifteen game/scenario/TED tests and nineteen
starter-card tests pass. Two Viewer recipe/bundle tests pass. A separate real
Chromium trial compiled from a fresh source-only card to the exact expected
COM, played opening commands, and exported/restored a checkpoint in fresh
browser storage. Physical TEC-1G testing and final human review of the revised
adventure remain outstanding before calling the public release fully qualified.
Changes are pushed on integration branches, not claimed merged or publicly
hosted. The manual may describe tested emulator behaviour with that boundary.

## Exact artifacts

| Artifact | Repository / pin / path |
|---|---|
| Qualified gameplay/source/card recipe | jhlagado/tec-os, 652a1626cd1d2d0f5ad7dce6de3dbd4a03159723 |
| Source supplied on SYSTEM | programs/CAVBASIC.BAS |
| Verification executable, not on starter | programs/CAVBASIC.COM; 39,808 bytes |
| Source/binary/compiler/RTL hashes | test/caverns-basic.json |
| Instructions supplied on SYSTEM | programs/CAVERNS.TXT |
| Main-volume starter recipe | dist/starter.recipe.json, revision 17; image dist/starter.img |
| Matching Viewer integration | jhlagado/tec-os-viewer, 289794684fa6b274e5ae2e6ba69f9557126552bd |
| BAZA compiler/runtime pins | jhlagado/baza, 8578fe50fdfc66e16015c54f365d1403825979da, dist/BAZA.COM and dist/BAZA.RTL |
| Supporting editor/compiler/runtime | TED.COM, BAZA.COM, BAZA.RTL on SYSTEM, pinned by test/inputs.json |
| Scenario tools, development only | tools/caverns-scenario.mjs; programs/caverns/CAVLOAD.COM and *.CAV |

Compiler SHA-256: 41f96c2716274327fd84180b3cadbb277a8d4f7faacf95b0e31fe3fdceb0acc6.
Runtime SHA-256: 3c77dccda2221616dd2573183f137d5d4131218b9f024b521982c44b0567bc64.
Source SHA-256: 19040160f8f20217d80fa8d587d2966f7d372d4e83d5ff7a945ecc6bae96b7c2.
Executable SHA-256: e767cd3060635fff1f4356bd2673ee3f2ef0fd0ab172a278511e1485c9300ec7.
No BAZA/compiler change was required for this gameplay batch. RTL is linked
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

Edit the line 30 presentation banner to TEC-OS Book presents, retaining PRINT
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
TPA: 42,496 bytes; COM: 39,808, leaving 2,688 bytes for runtime working space
and stack. The no-shell TPA is 46,533 bytes, but this example does not need it.
Growth is constrained; use the small banner change, not a large library feature.
There are eleven carrying slots, finite candle life and random combat risk.
The candle is still found lit; matches and a burn clock starting on lighting
are deferred. Stronger startup entropy and in-game disk SAVE/LOAD are also
future work. Exact checkpoints intentionally repeat the saved RNG sequence.
A card-image download is not a game-memory snapshot.

## Evidence and release scope

- [Latest native game/scenario/TED tests](evidence/caverns-wording-pass/native-tests.log).
- [Latest build](evidence/caverns-wording-pass/build.log).
- [Exact build record](evidence/caverns-refinement/native-build.log).
- [Starter tests](evidence/caverns-refinement/starter-tests.log).
- [Latest Viewer native tests](evidence/caverns-wording-pass/viewer-native-tests.log).
- [Latest real browser trial](evidence/caverns-wording-pass/viewer-result.json).
- [Latest qualification summary](evidence/caverns-wording-pass/qualification.json).
- [Map/prose audit, spoilers](caverns-map-audit.md).

BASIC Caverns is the intended public worked example. Only CAVBASIC.BAS and
CAVERNS.TXT are supplied for it; users compile their own COM. The assembly
CAVERNS.COM remains in the repository for development/reference, excluded from
the starter disk until gameplay parity is separately established. Developer
checkpoint files/loader are likewise excluded. Player instructions and the
banner-edit exercise do not need the spoiler walkthrough or full map.
