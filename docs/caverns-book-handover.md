# TEC-OS Book: BASIC Caverns handover

This is the current practical-manual handover, including the behaviour-preserving
BASIC rewrite, landmark wording corrections and compact compiler emission. Walkthrough spoilers are in
[caverns-walkthrough.md](caverns-walkthrough.md), not this teaching outline.

## Readiness

The latest BAZA pair (`eee4ee6`) is under TEC-OS integration qualification.
Twenty native game/scenario/rewrite/TED checks pass: the 126-point quest,
all 54 rooms and displayed descriptions, homecoming, reversible rope/gates,
checkpoint restoration, a 480-command comparison in 36 scenarios, and TED
edit/save/build/run/exit/reopen after power cycle. Two service-loaded Ctrl+C
checks also pass. Eleven Viewer native/bundle checks and a fresh Chromium trial
pass with this pair, including exact compilation and checkpoint restoration
in fresh storage. Two complete strict TEC-OS runs are still pending; this
candidate is pushed on `caverns-baza-qualification`, with the receiving Viewer
on `caverns-baza-viewer`, and is not yet qualified on main.

Physical TEC-1G testing and final human review remain outstanding before
calling the public release fully qualified. Browser qualification does not
establish public-site deployment. Historical qualification below remains tied
to its original compiler and binary.

## Exact artifacts

| Artifact | Repository / pin / path |
|---|---|
| Qualified gameplay/source | jhlagado/tec-os, `caverns-baza-qualification`; exact source hash below |
| Source supplied on SYSTEM | programs/CAVBASIC.BAS |
| Verification executable, not on starter | programs/CAVBASIC.COM; 29,056 bytes |
| Source/binary/compiler/RTL hashes | test/caverns-basic.json |
| Instructions supplied on SYSTEM | programs/CAVERNS.TXT |
| Main-volume starter recipe | dist/starter.recipe.json, revision 17; image dist/starter.img |
| Matching Viewer integration | jhlagado/tec-os-viewer, `caverns-baza-viewer` at 0a58aae4904ef146fe21346e561c11fcdfb3e28e |
| BAZA compiler/runtime pins | jhlagado/baza, eee4ee6846add13c0ea120fbf2de8be0ec08c0b1, dist/BAZA.COM and dist/BAZA.RTL |
| Supporting editor/compiler/runtime | TED.COM, BAZA.COM, BAZA.RTL on SYSTEM, pinned by test/inputs.json |
| Scenario tools, development only | tools/caverns-scenario.mjs; programs/caverns/CAVLOAD.COM and *.CAV |

Compiler SHA-256: f8d4b8944be95451faa7aa0bc99e611f6793b7d4a8e413344e951e26ede07498.
Runtime SHA-256: 29c07740630069921f93581c8527d5db057c63a073a95b37c7a020df92ae5e38.
Source SHA-256: f64fdb84ead251e3e49590c4c156d7951afc52fb02ffad959cf819b20760b9e0.
Executable SHA-256: 0c0d74e09bbb0bafee43a22e75d2dab3c3fa69071c96cd94e77a4e6d9464117e.
The rewrite itself required no compiler change. Subsequent compact source-location
emission, shared literal/newline helpers and the compact-code compiler (direct jumps,
equality compares, inline numeric literals, digit-only whole numbers in DATA)
reduce the executable while preserving diagnostics. Engine authoring source
and world data are separate; the supplied BAS uses ten-step numbering,
uppercase keywords and lowercase variables. Native compilation needs no generator. RTL is linked
selectively into the COM; its 13,056-byte file is not loaded beside the game.

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
TPA: 41,984 bytes; COM: 29,056 bytes; logical image: 28,946 bytes. After
reserving 768 bytes for the CPU stack, 12,270 bytes remain for dynamic arrays,
strings and control. This space is used during initialisation and play. The no-shell TPA is 46,533 bytes, but this example does not need it.
Growth is constrained; use the small banner change, not a large library feature.
There are eleven carrying slots, finite candle life and random combat risk.
The candle is still found lit; matches and a burn clock starting on lighting
are deferred. Stronger startup entropy and in-game disk SAVE/LOAD are also
future work. Exact checkpoints intentionally repeat the saved RNG sequence.
A card-image download is not a game-memory snapshot.

## Evidence and release scope

The current candidate pins BAZA at `eee4ee6`: compact restart-based source
coordinates and printing, short constant-bound FOR setup, and shared numeric
publishing. It produces a 29,056-byte COM, 4,224 file bytes and 4,313 logical
bytes smaller than the preceding 33,280-byte build. No BASIC source or game
rule changed. The 16-command timing route is 1.8% slower, with zero string
collections instead of one. This is a route measurement, not a general speed
claim. The compiler's existing RST 6 exception remains unchanged.

- [Current integration and measurements](caverns-baza-shared-publish.md).
- [Current qualification status](evidence/caverns-baza-shared-publish/qualification.json).
- [Game/editor comparison checks](evidence/caverns-baza-shared-publish/game-tests.log).
- [Service-loaded vector checks](evidence/caverns-baza-shared-publish/vector-tests.log).
- [Current size audit](evidence/caverns-baza-shared-publish/size.json).
- [Current fresh-browser trial](evidence/caverns-baza-shared-publish/viewer-result.json).

The following paragraphs document preceding compiler increments; their sizes,
commit pins and test counts are historical. The preceding compact-code
increment pinned BAZA at `5f6b58d`. GOTO, GOSUB and
THEN n are direct jumps, integer = and <> skip the sign-bit turn, FOR and DIM
drop repeated slot-top resets, a numeric literal is CALL NUMLIT with its tag
address and f32 bytes inline, and a whole number in DATA keeps only its digits.
The unchanged source compiles to 33,280 bytes, 3,359 fewer logical bytes, with
the same 42 symbols each 3,359 bytes lower. On TEC-OS the four Caverns test
files pass all 20 tests, among them the 480-command comparison in 36 scenarios
with the baseline, with identical output, state and RNG; the starter, TIMES,
TED and BAZA, and card-write files pass too. No BASIC source or game rule
changed.

- [Compiler round and its evidence](https://github.com/jhlagado/baza/blob/5f6b58d07b70e570bc993cfc430ec0196f4855d0/docs/compact-code.md).

The print-helper increment before it passed 714 compiler cases (552 successful
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
- [Compiler qualification](https://github.com/jhlagado/baza/blob/daed994b43392a1ccc7cddf3cb1e4070207182fa/docs/evidence/print-helpers/qualification.json).

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
