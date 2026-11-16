# TEC-OS Book: BASIC Caverns handover

This is the current practical-manual handover, including the behaviour-preserving
BASIC rewrite, landmark wording corrections and compact compiler emission. Walkthrough spoilers are in
[caverns-walkthrough.md](caverns-walkthrough.md), not this teaching outline.

## Readiness

Qualified in the native TEC-OS emulator: compile with the shell resident;
126-point quest; all 54 rooms and displayed descriptions; automatic homecoming;
reversible rope/gates; complete checkpoint restoration; TED edit/save/build/run,
exit and reopen after power cycle. The compact compiler passes 714 native
regression cases and 49 independent control/arithmetic expectations. Current
TEC-OS checks include 16 game/scenario/TED tests, a 480-command comparison in
36 scenarios, native insertion of line 151 without renumbering and 19 starter
checks. Eleven Viewer native/bundle checks cover Caverns, BOUNCE and the bundle.
A separate real Chromium trial compiles the exact expected COM from a fresh
source-only card, plays opening commands and exports/restores a checkpoint in
fresh browser storage. Physical TEC-1G testing and final human review remain
outstanding before calling the public release fully qualified.
The qualified changes are merged and pushed to main in BAZA, TEC-OS and the
Viewer. This is not a claim of public-site deployment or physical-board testing.
The manual may describe tested emulator behaviour with that boundary.

## Exact artifacts

| Artifact | Repository / pin / path |
|---|---|
| Qualified gameplay/source/card recipe | jhlagado/tec-os, 485bf24f15de668da748e5598eb850fe20f4ae99 |
| Source supplied on SYSTEM | programs/CAVBASIC.BAS |
| Verification executable, not on starter | programs/CAVBASIC.COM; 36,736 bytes |
| Source/binary/compiler/RTL hashes | test/caverns-basic.json |
| Instructions supplied on SYSTEM | programs/CAVERNS.TXT |
| Main-volume starter recipe | dist/starter.recipe.json, revision 17; image dist/starter.img |
| Matching Viewer integration | jhlagado/tec-os-viewer, 5e7bb9dc8ede62fcb7fe1650043e1e33e3cc26c4 |
| BAZA compiler/runtime pins | jhlagado/baza, 74c438207f787685f961dd972a3a5289f679ddba, dist/BAZA.COM and dist/BAZA.RTL |
| Supporting editor/compiler/runtime | TED.COM, BAZA.COM, BAZA.RTL on SYSTEM, pinned by test/inputs.json |
| Scenario tools, development only | tools/caverns-scenario.mjs; programs/caverns/CAVLOAD.COM and *.CAV |

Compiler SHA-256: c9625842dceee5f68361cbb14c43c2aecbe65defd49536880d1613159a29d123.
Runtime SHA-256: 64510ae26d654bcc4329f302b184ff507ee164bee905aa17d35eb3cac018ce9e.
Source SHA-256: f64fdb84ead251e3e49590c4c156d7951afc52fb02ffad959cf819b20760b9e0.
Executable SHA-256: c2ce4aecfae8a4439e0a7fb37d92b2427d8e5afb728e843caf0704fea5fd9fcd.
The rewrite itself required no compiler change. Subsequent compact source-location
emission and shared literal/newline helpers reduce the executable while preserving diagnostics. Engine authoring source
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
TPA: 41,984 bytes; COM: 36,736 bytes; logical image: 36,618 bytes. After
reserving 768 bytes for the CPU stack, 4,598 bytes remain for dynamic arrays,
strings and control. This space is used during initialisation and play. The no-shell TPA is 46,536 bytes, but this example does not need it.
Growth is constrained; use the small banner change, not a large library feature.
There are eleven carrying slots, finite candle life and random combat risk.
The candle is still found lit; matches and a burn clock starting on lighting
are deferred. Stronger startup entropy and in-game disk SAVE/LOAD are also
future work. Exact checkpoints intentionally repeat the saved RNG sequence.
A card-image download is not a game-memory snapshot.

## Evidence and release scope

The current print-helper increment passes 714 compiler cases (552 successful
native compilations), 49 independent compatibility expectations, 14 checkpoint/
differential tests, 34 game/editor/starter tests, three unchanged write/speed
gates and eleven Viewer native/bundle tests. The real Chromium trial compiles
the exact smaller COM and restores an exported checkpoint in fresh storage.
No BASIC source or game rules changed. The 16-command measured route used 1.2%
fewer cycles and two collections versus five; this is not a general speed claim.
The 16-byte shared-core increase costs space in programs without literal prints.

- [Print-helper integration qualification](evidence/caverns-print-helpers/qualification.json).
- [Exact size and TPA audit](evidence/caverns-print-helpers/size.json).
- [Native game/editor/starter checks](evidence/caverns-print-helpers/integration-tests.log).
- [Checkpoint comparison tests](evidence/caverns-print-helpers/game-tests.log).
- [Fresh-browser trial](evidence/caverns-print-helpers/viewer-result.json).
- [Compiler qualification](https://github.com/jhlagado/baza/blob/74c438207f787685f961dd972a3a5289f679ddba/docs/evidence/print-helpers/qualification.json).

The records below document the preceding main integration and first size
increment; their historical binary hashes and measurements remain unchanged.

The preceding main-integration records preserve the complete strict run (1,390
passes and five stale fixture failures), then the passing reruns of all five
affected checks. Viewer coverage is 201 passing functional checks plus its
original resource check passing separately with unchanged limits. These are
combined coverage records, not claims of single all-green full-suite runs.

- [Current-main firmware qualification](evidence/caverns-main-integration/qualification.json).
- [Fresh matching-main browser trial](evidence/caverns-main-integration/viewer-result.json).
- [Viewer qualification](https://github.com/jhlagado/tec-os-viewer/blob/5e7bb9dc8ede62fcb7fe1650043e1e33e3cc26c4/docs/evidence/caverns-main-integration/qualification.json).

The earlier compact-emission records below remain the detailed first-increment
baseline; current-main integration preserves its compiler and game hashes.

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
