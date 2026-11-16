# TEC-OS Book: BASIC Caverns handover

This is the current practical-manual handover, including the behaviour-preserving
BASIC rewrite, landmark wording corrections and compact compiler emission. Walkthrough spoilers are in
[caverns-walkthrough.md](caverns-walkthrough.md), not this teaching outline.

## Readiness

Qualified in the native TEC-OS emulator: compile with the shell resident;
126-point quest; all 54 rooms and displayed descriptions; automatic homecoming;
reversible rope/gates; complete checkpoint restoration; TED edit/save/build/run,
exit and reopen after power cycle. The compact compiler passes 712 native
regression cases and 49 independent control/arithmetic expectations. Current
TEC-OS checks include 15 game/scenario/TED tests, a 480-command comparison in
36 scenarios, native insertion of line 151 without renumbering and 19 starter
checks. Three Viewer native/bundle checks cover Caverns, BOUNCE and the bundle.
A separate real Chromium trial compiles the exact expected COM from a fresh
source-only card, plays opening commands and exports/restores a checkpoint in
fresh browser storage. Physical TEC-1G testing and final human review remain
outstanding before calling the public release fully qualified.
Changes are pushed on integration branches, not claimed merged or publicly
hosted. The manual may describe tested emulator behaviour with that boundary.

## Exact artifacts

| Artifact | Repository / pin / path |
|---|---|
| Qualified gameplay/source/card recipe | jhlagado/tec-os, a442f151b58b38c211251272bf40fc64dd195754 |
| Source supplied on SYSTEM | programs/CAVBASIC.BAS |
| Verification executable, not on starter | programs/CAVBASIC.COM; 38,272 bytes |
| Source/binary/compiler/RTL hashes | test/caverns-basic.json |
| Instructions supplied on SYSTEM | programs/CAVERNS.TXT |
| Main-volume starter recipe | dist/starter.recipe.json, revision 17; image dist/starter.img |
| Matching Viewer integration | jhlagado/tec-os-viewer, 12e67f3efe5de8f59cc9b2db56bd99e0e45e93f1 |
| BAZA compiler/runtime pins | jhlagado/baza, 52c3956167c8cebe382d342619ec2899913fd18c, dist/BAZA.COM and dist/BAZA.RTL |
| Supporting editor/compiler/runtime | TED.COM, BAZA.COM, BAZA.RTL on SYSTEM, pinned by test/inputs.json |
| Scenario tools, development only | tools/caverns-scenario.mjs; programs/caverns/CAVLOAD.COM and *.CAV |

Compiler SHA-256: 087d3a4073fe1c2dcd41ccd5e5ca7efcb9f21628c714a2e37986028839c2fa36.
Runtime SHA-256: f79d57328eb152ecba86a9c203f5ead5544a95b07da131c0fd0ad5821d5d5e07.
Source SHA-256: f64fdb84ead251e3e49590c4c156d7951afc52fb02ffad959cf819b20760b9e0.
Executable SHA-256: 4c2a29c643dc13999cebcddf45f5743bfb025e060185b0327b5929468a3677b8.
The rewrite itself required no compiler change. Subsequent compact source-location
emission reduces the executable while preserving diagnostics. Engine authoring source
and world data are separate; the supplied BAS uses ten-step numbering,
uppercase keywords and lowercase variables. Native compilation needs no generator. RTL is linked
selectively into the COM; its 12,928-byte file is not loaded beside the game.

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
TPA: 42,496 bytes; COM: 38,272 bytes; logical image: 38,248 bytes. After
reserving 768 bytes for the CPU stack, 3,480 bytes remain for dynamic arrays,
strings and control. This space is used during initialisation and play. The no-shell TPA is 46,533 bytes, but this example does not need it.
Growth is constrained; use the small banner change, not a large library feature.
There are eleven carrying slots, finite candle life and random combat risk.
The candle is still found lit; matches and a burn clock starting on lighting
are deferred. Stronger startup entropy and in-game disk SAVE/LOAD are also
future work. Exact checkpoints intentionally repeat the saved RNG sequence.
A card-image download is not a game-memory snapshot.

## Evidence and release scope

- [Current game/scenario/TED tests](evidence/caverns-compact-emission/integration.log).
- [Compiler and Caverns integration](caverns-compact-emission.md).
- [Starter tests](evidence/caverns-compact-emission/starter.log).
- [Viewer native tests](evidence/caverns-compact-emission/viewer-native-tests.log).
- [Real browser trial](evidence/caverns-compact-emission/viewer-result.json).
- [Qualification summary](evidence/caverns-compact-emission/qualification.json).
- [Strict baseline comparison](evidence/caverns-compact-emission/differential.json):
  480 commands, 36 scenarios, all persisted state and RNG checked.
- [Reader line-insertion experiment](evidence/caverns-compact-emission/reader-insertion.log).
- [Native size/link audit](evidence/caverns-compact-emission/size.json).
- [Measured timing and string collection](evidence/caverns-compact-emission/timing.json).
- [Engine and authoring structure](caverns-engine.md).
- [Map/prose audit, spoilers](caverns-map-audit.md).

BASIC Caverns is the intended public worked example. Only CAVBASIC.BAS and
CAVERNS.TXT are supplied for it; users compile their own COM. The assembly
CAVERNS.COM remains in the repository for development/reference, excluded from
the starter disk until gameplay parity is separately established. Developer
checkpoint files/loader are likewise excluded. Player instructions and the
banner-edit exercise do not need the spoiler walkthrough or full map.
