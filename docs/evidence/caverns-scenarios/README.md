# Caverns load-only checkpoint evidence — 2026-11-14

- `native-tests.log`: five passing tests, zero failures/skips. Includes all
  persistent fields, all five bundled scenarios, fresh-machine restoration,
  identical next combat/RNG continuation and replay, plus invalid-file cases.
- `result.json`, `rope.png`, `cave-restored.png`: actual system Chromium,
  standalone Viewer at 80 columns. Restored ROPE, downloaded CAVE.CAV via the
  Viewer, closed its browser context, opened an independent context/card,
  imported only the exported file and launcher, and restored the cave/inventory.
- `scenario-loader.json`: original COM and launcher hashes and exact overlay
  addresses/size. `manifest.json` adds development-card identity/slot filenames.

Normal BASIC source and COM are unchanged. Compiler/runtime pins remain those
in test/caverns-basic.json. No BAZA, ROM, Viewer or public starter recipe change
is required by the launcher. The files can be regenerated from repository
JSON inputs with `npm run caverns:scenarios`.

This is native emulator and real browser evidence. Physical TEC-1G testing
has not been performed. Existing BASIC map/parser behavior is unchanged.
