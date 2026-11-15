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


Checkpoint 3 continuation: `check3-captured.json` retains the replayed review
commands and complete pre-adjustment native state. CHECK3 changes only the
troll location from 30 to absent (0), following the author's approved removal.
`check3-tests.log` verifies all seven bundled checkpoints in fresh native
machines. `check3-viewer.json` and `check3-viewer.png` show the actual Viewer
restored at the tunnel with compass, sword, candle and rope. No exploration
command was entered after that reload.


Checkpoint 4: `check4-captured.json` records the exact CHECK3 continuation
commands and native state at the bat colony, with no new state adjustment.
`check4-live-screen.json` records the corresponding live Viewer screen.
`check4-tests.log` verifies all eight bundled checkpoints in fresh native
machines. Inventory, monsters, flags, counters and RNG are compared exactly.


Checkpoint 5: `check5-captured.json` records the exact CHECK3 review continuation
through key pickup and rope descent. `check5-live-screen.json` shows the live
Viewer on the temple floor with compass/key/sword/candle and rope left above.
`check5-tests.log` verifies all nine scenarios with exact fresh-machine state
comparisons. No new state adjustment was made for checkpoint 5.


Checkpoint 6: `check6-captured.json` records the actual command continuation
through the crypt and cell, including removal/drop of the grille and eastward
passage. `check6-live-screen.json` shows the live inventory beyond the shaft.
`check6-tests.log` verifies all ten bundled scenarios in fresh native machines;
CHECK6 additionally returns west to the cell and east again, verifying that
the removed grille on the floor does not close the restored opening.
