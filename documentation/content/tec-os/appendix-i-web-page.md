---
title: I. The web page
parent: TEC-OS
nav_order: 109
nav_group: "Reference"
---

# Appendix I. The web page

<!-- Checked against TEC-OS 46cf3f1f1c6ea7ff361a568672a41ab1a7e2c1ee (main),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

The web page has controls for the emulated board, a serial terminal and a card
you can save or exchange with the PC. This appendix describes those controls,
file transfers and the startup changes made for the selected display.
[Chapter 29](29-the-host-model-as-evidence.md) explains the host model and its
evidence limits. [Chapter 8](08-commands-at-startup.md) explains using
STARTUP.CMD and [Chapter 26](26-startup-inside-the-ccp.md) follows its ROM path.

## Serving the page

After the PC setup from [Chapter 6](06-cards-on-the-pc.md) and the ROM/media
preparation from [Chapter 27](27-build-the-rom-and-media.md), `npm run web`
builds the page into web/dist. The build copies the ROM, its symbols and the
starter card's recipe and files. `npm start` serves that directory with the
installed esbuild development server, so Python is not needed
(`web/build.mjs:16-45`, `package.json:15`, `package.json:22`,
`README.md:116-124`):

```sh
npm run web
npm start
```

The page is then at `http://localhost:8765`. These commands are preparation
instructions, not a new build or browser result.

## Controls and displayed state

At the inspected source a page without stored preferences selects the
PICO9918 at 80 columns. Width and display selections use the browser's local
storage. A reload retains them when that storage is available. Otherwise
they last only for the open page (`web/src/main.mjs:17-43`). Successful
startup preparation selects that width explicitly after the ROM's raw
40-column cold start (`host/card.mjs:199-220`, `src/pico.asm:19-68`).

The controls and their handlers are defined in `web/index.html:12-30`,
`web/index.html:68-82` and `web/src/main.mjs:604-694`:

| Control | Effect |
| --- | --- |
| "ROM" | Selects the PICO9918 width: 80, 40 or 32 columns. Changing it power-cycles the emulated board. |
| "Display" | Selects the PICO9918 board, which also has a graphics LCD, or a board with only the graphics LCD. Changing it power-cycles the board. |
| "Reset" | Restarts the board with RAM and card contents retained. The serial terminal shows `[reset]`. |
| "Power cycle" | Creates a fresh machine with fresh RAM and the same card. |
| "Pause" | Stops Z80 execution. The button reads "Run" and the speed reads "paused" while stopped. It has no effect during file import. |
| "New starter card" | Builds a fresh card from the starter recipe, checks each file's length and SHA-256, attempts to save the image and power-cycles the board. |
| "Open image" | Checks a PC image as a container, selects it, attempts to save it and power-cycles the board. A rejected image produces `Not opened` with the reason under "SD card". |
| "Download image" | Downloads the in-memory card as `tecos-card.img`, independently of browser storage. |
| "Drive" | Selects the volume for the file list and file imports. |
| "Copy file to drive" | Stages the selected PC files for that volume, with text conversion when selected, then resets after publication. The import and save conditions are described below. |
| "as text" | Selects text conversion for imports and individual file downloads, as with tecvol's `--text`. |
| "Download" on a file | Downloads that file from its listed user area, with text conversion when selected. |

Reset and power-on have different memory effects (`host/machine.mjs:612-621`,
`web/src/main.mjs:82-115`). Neither control flushes the ROM's pending writes
before restarting. The safe-copy procedure below applies before either one.

The page's card is the starter card, built from the same recipe, with
thirteen files at recipe revision 14. Among them are the shell, SHELL.SVC,
which its STARTUP.CMD loads, TIMES.BAS, BAZA.COM and BAZA.RTL for
[Chapter 3](03-build-a-basic-program.md) and these demonstrations:

| File | Use |
| --- | --- |
| `DEMO.ASM` | The source of DEMO, with no include file. `TAS DEMO` builds DEMO.COM and `DEMO` then runs it, showing the LCD, the digits, the 8 × 8 LEDs and the PICO9918, as [Chapter 12](12-use-the-boards-devices.md) describes. `TED DEMO.ASM` opens the source |
| `BOUNCE.BAS` | A BASIC sprite game for the PICO9918. `BAZA BOUNCE` compiles it and `BOUNCE` runs it. Tap W, A, S and D, or the arrow keys, to steer and Q to quit |
| `MON3.SVC` | Runs MON-3 programs. `MON3.SVC` gives `MON3>`, as [Chapter 5](05-drives-and-user-areas.md#a-mon-3-session) describes |
| `HELLO3.ASM` | A MON-3 program's source. At the CP/M prompt, `TAS HELLO3 HELLO3.BIN` builds its binary; then enter `MON3.SVC`. At `MON3>`, `LOAD HELLO3.BIN` and `GO` write four lines on the LCD and count on the digits. With the matrix keyboard enabled, as on this page, Esc returns to `MON3>`. With the Matrix switch off, AD on the keypad does. `EXIT` returns to `A:SYSTEM>` |

The card does not hold DEMO.COM until you build it. BOUNCE needs the
PICO9918 and draws through `CALL`, as Chapter 3 explains
(`tools/media.mjs:203-257`, `test/starter.test.mjs:44-391`,
`test/demo.test.mjs:1-4`, `README.md:165-211`). Building a starter fetches
each recipe file and checks its byte count and SHA-256 before returning the
image (`tools/media.mjs:203-259`, `tools/lib/recipe.mjs:14-44`,
`web/src/main.mjs:60-63`). The file list shows user area, name and size.
It refreshes every five seconds and after the reset and power-cycle buttons
(`web/src/main.mjs:580-593`, `web/src/main.mjs:682-695`).

The execution loop targets 4 MHz. Host timing and a per-frame execution budget
can reduce the achieved rate. The MHz value beside "Pause" updates about once
a second and reports the achieved rate, not a guaranteed board speed
(`web/src/main.mjs:14`, `web/src/main.mjs:185-206`).

## Typing

Keyboard routing follows the focused element. Clicking a video display gives
it focus. The serial terminal becomes the console after `CON TTY`.
`CON CRT` selects the PICO9918 and `CON UC1` selects the graphics LCD when
available (`web/index.html:35-49`, `web/src/main.mjs:399-438`).

| Focus | Route | Arrow keys |
| --- | --- | --- |
| PICO9918 screen or graphics LCD | Matrix keyboard for ordinary characters and recognised matrix keys | Native matrix arrow keys |
| Serial terminal | Serial port | `ESC [` followed by a letter |

The page's serial display removes escape sequences sent by TEC-OS and handles
backspace (`web/src/main.mjs:369-438`). On a phone or tablet tapping a video
display or the terminal focuses a hidden text field for the on-screen keyboard.
The extra buttons supply Ctrl, Esc, Tab and four arrows. Ctrl latches for the
next key (`web/index.html:36-44`, `web/src/main.mjs:440-535`).

## Saving the card

The in-memory card and the browser's saved card are separate copies. IndexedDB
holds the saved image in database `tecos`, store `cards`, key `current`
(`web/src/store.mjs:6-8`). Startup loads and validates that record. An absent
record causes the page to build a starter card. A read or parse failure
instead disables saving for the session, as the notices below describe
(`web/src/main.mjs:699-713`).

Writes by TEC-OS mark the model card dirty. A timer attempts a save every
two seconds when it is dirty and no file import is active. A save takes a
snapshot for an IndexedDB write transaction and completes when that transaction
completes (`web/src/main.mjs:103-105`, `web/src/main.mjs:117-121`,
`web/src/store.mjs:42-59`). Only bytes already in the card image enter that
snapshot. Pending changes in the ROM's block cache require a successful flush
first, even if a browser save has succeeded.

Ordinary saves use a single in-flight guard. A save requested during another
marks the card dirty for a later timer tick. Writes after a snapshot also mark
it dirty so an older completed save need not contain the newest card bytes. A
failed ordinary save retains the in-memory image and the dirty mark for another
attempt (`web/src/main.mjs:129-158`).

The status under "SD card" lists volume labels and save problems. The
following strings are source-defined notices, not a new page capture
(`web/src/main.mjs:145-152`, `web/src/main.mjs:551-560`):

| Notice | Cause | Consequence |
| --- | --- | --- |
| `Card not saved in this browser: ` and the reason | An ordinary browser save failed. | The card remains in memory and the timer can retry. During import the timer defers saving. |
| `Saving the card in this browser keeps failing` and the reason | At least three ordinary saves have failed consecutively. | Retry remains possible. "Download image" preserves a PC copy of the current image. |
| `The saved card couldn't be read, so this card isn't saved; reload to try again.` | Loading or parsing the stored card failed. | The existing record is left untouched and a starter runs in memory. Saving remains disabled until reload, including for new or opened cards and file imports. |

A later status refresh can replace the detailed save error with
`Card not saved in this browser: it is kept in memory and saved again shortly.`
while the unsaved flag remains set (`web/src/main.mjs:551-560`). Reloading
before a successful save restores the last readable stored image. A PC
download preserves the current card bytes but performs no ROM cache flush
(`web/src/main.mjs:620-621`).

Whole-image opening differs from file import. After container validation,
"Open image" publishes the new image, waits for any save of the previous
card to finish and then attempts an ordinary save of the new one. A failed
save does not stop its power-on. "New starter card" uses that same path
once its recipe has been built. Either can therefore run a card that is
newer than the saved record (`web/src/main.mjs:604-630`). Power-on detaches
the previous machine before preparing the card, so that machine cannot
write the card while it is prepared (`web/src/main.mjs:82-86`).

The model uses a high-capacity card (`host/machine.mjs:49`). Opening an image
also checks its full declared length. A truncated image produces
`Not opened: image is truncated` followed by the lengths
(`web/src/main.mjs:609`, `tools/lib/container.mjs:146-149`). This excludes
the standard-card byte-addressing limit and that particular truncated-image
case. It does not exclude every `27h` mount error or every `Bad Sector`:
the ROM also checks arithmetic overflow and volume ends against the container
length (`src/vol.asm:254-299`). [Appendix D](appendix-d-error-messages.md) explains
those errors and recovery actions.

## Importing a file safely

Before copying PC files into the running card, wait for the command prompt
and check that no write-failure message appeared. The prompt's console
read writes every changed line, on every drive. Import itself does not flush them.
Its later reset clears the block cache. TEC-OS rebuilds free-space maps from the
changed card as drives are accessed. Unwritten cached changes, including changes
on the logged drive, are lost at that reset
(`src/boot.asm:77-77`, `src/boot.asm:149-152`, `src/boot.asm:235-252`,
`src/cache.asm:634-640`, `src/cpm/bdoslog.asm:218-270`).
[Chapter 19](19-cache-and-persistence.md) explains the failed-flush paths. A
browser save or download after a successful flush is still needed to preserve
the resulting image outside RAM.

"Copy file to drive" pauses the machine and reads all selected PC files.
It uppercases their names while reading them. The import then joins the
card-operation queue and stages the files on a copy of the card current at
that turn. These staged writes validate each CP/M 8.3 name and use user 0
of the selected volume, regardless of the ROM's current user area.
The file list can show other user areas but there is no import user-area
selector
(`web/src/main.mjs:632-651`, `tools/lib/cpmfs.mjs:15-20`,
`tools/lib/cpmfs.mjs:180-191`).

The volume's descriptor read-only flag and an existing file's read-only
attribute are enforced. Import supplies no force option. Text conversion
changes line endings to CRLF, appends `^Z` and pads text records with `^Z`.
File downloads in text mode stop at the first `^Z` and convert CRLF to LF
(`web/src/main.mjs:574-589`, `web/src/main.mjs:650-651`,
`tools/lib/cpmfs.mjs:128-149`, `tools/lib/cpmfs.mjs:180-191`).

With saving enabled, import waits for any older save to finish and then saves
the staged image under the same guard. Only after that transaction succeeds
does it publish the staged bytes to the running card and reset. A staging or
save error produces `Not copied` with the reason and leaves those imported
edits unpublished. No partial selection of files is published. In the
storage-read failure mode, saving is disabled and import instead publishes
in memory without a storage transaction
(`web/src/main.mjs:160-177`, `web/src/main.mjs:646-664`).

A second import is rejected with `Not copied: file import in progress`.
Whole-image selection during import is rejected with
`Not opened: file import in progress`. The machine resumes its previous
running or paused state when import finishes
(`web/src/main.mjs:604-607`, `web/src/main.mjs:632-664`).

Power-on startup preparation and import publication take turns through the
same queue. A display or width change made during import can therefore
cause a later startup rewrite. That rewrite marks the card dirty and relies
on a subsequent save. Queue ordering alone does not establish that the stored
card already includes it. Nor does an import failure undo other queued
operations (`web/src/main.mjs:67-95`, `web/src/main.mjs:117-121`,
`web/src/main.mjs:669-680`).

## Startup preparation

Each power-on calls `prepareCard` for the selected display and width. It
stages any STARTUP.CMD rewrite on a whole-card copy and publishes that copy
only after preparation succeeds. It reads drive A's user 0, as the ROM does
for startup, and passes the volume's read-only flag to file access
(`web/src/main.mjs:82-95`, `host/card.mjs:18-24`,
`host/card.mjs:109-146`). The page writes no display driver. The PICO9918
console is in ROM and the graphics LCD requires GLCD.SVC on the card.

A card saved before the shell is upgraded at power-on. Such a card has no
`SHELL.SVC` in A's user 0, and no `MON3.SVC` whose execution record asks to
be entered on install. For it the page first fetches the starter card, then
copies the starter's `SHELL.SVC` onto the card, and the starter's `MON3.SVC`
in place of the card's own if it has one. A card with no `MON3.SVC` gets
none. `SHELL.SVC` then goes first in `STARTUP.CMD`, so the card's later
lines, which the ROM alone never ran, now run under the shell. The card's
other files stay as they were, and the serial pane says which files the
page wrote. If they can't be written, for a full A: or a read-only
`MON3.SVC`, the card gets its display line alone and the note says the
shell was not added. A card whose `SHELL.SVC` was removed but whose
`MON3.SVC` is the newer one counts as current and is left without the shell
(`web/src/main.mjs:87-93`, `host/card.mjs:55-108`, `host/card.mjs:109-146`,
`README.md:130-137`).

The selected display determines the display line. When drive A holds
SHELL.SVC the new text starts with a `SHELL.SVC` line and the display line
follows it, since the ROM runs only the first line and the shell the rest.
Without SHELL.SVC the display line comes first (`host/card.mjs:199-220`):

| Display | Display line |
| --- | --- |
| PICO9918 at 80 columns | `CON PICO 80` |
| PICO9918 at 40 columns | `CON PICO 40` |
| PICO9918 at 32 columns | `CON PICO 32` |
| Graphics LCD only | `GLCD.SVC` |

No line for the other display is inserted. On the board with both displays,
GLCD.SVC in startup cannot take the console while CRT is selected. Later
`CON UC1` loads A:GLCD.SVC when needed
(`src/services.asm:540-556`, `src/cpm/ccpcmd.asm:187-191`,
`src/loader.asm:862-887`).

Preparation removes recognised display pieces, and any `SHELL.SVC` piece,
from the old startup text and keeps the remaining command pieces. It splits
lines as the shell does: `!` always separates and `&` separates after a
space, a tab or another separator. Recognition ignores case and surrounding
space. Driver names are PICO.SVC, PICO40.SVC, PICO32.SVC and GLCD.SVC, plus
their .DRV forms. Width pieces are `CON PICO` or `CON CRT`, optionally with
a colon after the device name, followed by spaces and decimal digits.
Each recognised piece may also have a leading `:`, from an older card's
startup file. Removing old width pieces prevents them from overriding the
selector (`host/card.mjs:11-16`, `host/card.mjs:148-197`).

A kept piece keeps the separator before it. An older card's `:` before a
kept piece becomes `&`, and a piece that now starts its line starts
unconditionally (`host/card.mjs:175-197`, `test/pico.test.mjs:728-765`):

| Original text | Result | Rule |
| --- | --- | --- |
| `X!:PICO.SVC!Y` | `X!Y` | The piece after the removed one keeps its own `!`. |
| `X!PICO.SVC!:Y` | `X &Y` | An older card's `:` becomes `&`. |
| `X &PICO.SVC &Y` | `X &Y` | A kept `&` piece stays conditional. |
| `PICO.SVC`, then `:VOLS` | `VOLS` | A line's first piece runs whatever the last line returned, so its `:` goes. |

A line with nothing left is dropped. The new text uses CRLF line endings and a final `^Z`.
Identical text causes no write so a protected file or volume does not itself
cause an error when no rewrite is needed. Replacing STARTUP.CMD can reuse its
existing directory entries and blocks. A full directory causes failure only when
the replacement needs more entries than are available, including reusable
entries. Data capacity is checked separately (`host/card.mjs:205-220`,
`tools/lib/cpmfs.mjs:189-205`).

For the starter's `SHELL.SVC` and `GLCD.SVC` lines, GLCD preparation leaves
the text unchanged. PICO preparation keeps the `SHELL.SVC` line and replaces
the GLCD line with the selected width line at 80, 40 or 32 columns, followed
by CRLF and `^Z`. The source assertion checks `SHELL.SVC`, then `CON PICO 80`,
each followed by CRLF (`test/pico.test.mjs:838-850`). That assertion is not
a newly executed browser result. An old startup file with no width line now
requires a rewrite even at 80. Its read-only attribute can prevent that write
and produce the notice below (`test/pico.test.mjs:689-701`).

## Preparation notices and protected cards

Preparation first checks drive A and, for the GLCD choice, GLCD.SVC in user 0.
The format-byte check is not complete service validation. An inaccessible A
directory also enters the no-drive-A notice path. These checks and failed
writes leave the staged startup edits unpublished
(`host/card.mjs:26-145`). The serial terminal prints the notice in brackets
after `[power on]` (`web/src/main.mjs:108-109`). These literal messages retain
the wording defined by that source:

| Condition | Terminal notice |
| --- | --- |
| Drive A cannot be opened and listed | `This card has no drive A: the diagnostic prompt is on the serial terminal below. A new starter card has one.` |
| GLCD selected without GLCD.SVC or an old display .DRV file | `This card has no GLCD.SVC: it boots as its STARTUP.CMD says. A new starter card has it.` |
| An old .DRV display file is found instead of GLCD.SVC | `This card is from an older TEC-OS: this ROM doesn't load NAME.DRV, so the card boots as its STARTUP.CMD says. A new starter card has GLCD.SVC.` |
| GLCD.SVC has another format byte | `This card's GLCD.SVC is format n, from an older TEC-OS, and this ROM refuses it. A new starter card has the driver.` |
| A needed rewrite fails, for example on a read-only volume or insufficient directory space | `This card couldn't be prepared for the page (` the reason `), so it boots as it is.` |
| A needed rewrite encounters STARTUP.CMD's read-only attribute | `This card's STARTUP.CMD is read-only, so the page can't set its display line; it boots as it is` |

`NAME.DRV` is GLCD.DRV when present, otherwise the first recognised .DRV
display file in the directory. `n` is the file's second byte
(`host/card.mjs:41-48`). These notices describe preparation's outcome.
Subsequent ROM execution can still write to the card. The page does not force
a protected startup rewrite. A PC copy made before opening the image
preserves its original startup text.
