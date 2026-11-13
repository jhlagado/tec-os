---
title: The host model as evidence
parent: TEC-OS
nav_order: 29
nav_group: "Inside TEC-OS"
---

# 29. The host model as evidence

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

A result needs an observation that can establish its claim. Console
bytes can demonstrate printed output but cannot by themselves establish
pixels, persisted files or physical-board behaviour. TEC-OS's host model
also exposes serial bytes, display state, memory-write reports and card
bytes. Choosing among these observations is part of checking the operation.

## A shared machine

Tests, the web page and capture tool share `host/machine.mjs`, so many
workflows exercise the same machine wrapper. It imports the Debug80
TEC-1G runtime and byte-string helper without Node dependencies. The test
wrapper supplies Node file access while the browser supplies storage and
controls (`host/machine.mjs:10-16`, `test/lib/machine.mjs:3-13`,
`web/src/main.mjs:5-12`).

The caller supplies a ROM and its matching symbol map. `symbolsFromD8`
converts names to uppercase address entries used for input-loop detection
and memory watches. Those observations follow labels rather than fixed
ROM offsets. They still require the map for that ROM. Successful symbol
lookup cannot validate an unrelated map (`host/machine.mjs:23-27`,
`host/machine.mjs:190-216`, `host/machine.mjs:251-254`).
[Chapter 27](27-build-the-rom-and-media.md) explains paired artifact
preparation.

Board assumptions also enter as constructor options rather than being
implicit in a transcript (`host/machine.mjs:33-78`):

| Option | Meaning |
| --- | --- |
| `sdImage` | A mutable array of card bytes or no card |
| `highCapacity` | Block addressing when true, standard-card byte addressing when false |
| `tms`, `matrix` | A PICO9918 and an enabled matrix keyboard |
| `glcd` | False makes graphics-LCD reads return FFh, as an absent controller whose busy flag never clears |
| `rtc`, `clock` | Presence of the DS1302 and an optional starting time |
| `ramFill` | The initial RAM byte |
| `windowRam` | False makes reads at 8000h–BFFFh float high and discards writes there |
| `ram96`, `mains`, `expands` | Optional documented MAIN/EXPAND decoding with one or two regions of each kind |
| `onSdWrite` | A callback for card writes |

The runtime implements CPU, latch decoding, overlay, expansion banks,
keypad, serial timing, LCDs and PICO. Machine selects RAM at `0000h–BFFFh`,
ROM at `C000h–FFFFh` and entry zero, then loads the 16 KiB ROM. Optional
`ram96` uses a separate MAIN/EXPAND mapping. A result must identify its
mapping to make that assumption reproducible (`host/machine.mjs:63-78`,
`host/machine.mjs:143-179`).

Display observations avoid a host-update-timer dependency. The runtime
normally clears queued LED and digit scans during timed updates. Machine
sets `updateMs` to Infinity and callers read display state directly
(`host/machine.mjs:80-85`). Other model-versus-board timing differences
remain.

## Card bytes and time

Card persistence is observable through the supplied byte array. Machine
attaches `SdSpi` at `FDh` instead of the runtime's automatic SD device.
Successful writes alter that array. `swapCard` replaces the device with
another image or an empty socket but leaves ROM driver state and cached
blocks intact (`host/machine.mjs:59-74`, `host/machine.mjs:122-140`,
`host/machine.mjs:556-560`). [Chapter 6](06-cards-on-the-pc.md) explains
reset after PC-side card changes.

The range cases in `test/sd-range.test.mjs:36-106` assert separate limits.
In byte-addressed mode the ROM rejects volumes beyond its last addressable
block, `7FFFFFh`. Access beyond the model image returns the card's parameter
error in R1 and the ROM reports SD error 5 without transferring data.
High-capacity mode uses block numbers directly. These are source assertions,
not newly passing tests or measurements of a real card's capacity.
[Chapter 18](18-card-blocks-and-volumes.md) follows the ROM checks.

Clock-dependent tests need a separate time assumption. Machine attaches
DS1302 at `FCh` with automatic RTC attachment disabled. Without `clock`,
it uses host time. A supplied date instead advances through emulated
cycles at 4 MHz. Writes establish a new cycle-based starting value too.
Pausing or slowing host execution therefore does not advance a supplied
clock merely through elapsed wall time (`host/machine.mjs:72-119`,
`host/machine.mjs:126-137`).

The ordinary test starts at 1 January 2026, 12:00. Capture starts at
1 November 2026, 12:00 (`test/lib/fixtures.mjs:85-86`,
`tools/capture.mjs:72`). Reproduction must preserve the selected clock.
T-states count Z80 cycles: at 4 MHz each is a quarter microsecond and
four million make an emulated second. Host wall duration measures
something different.

## Console bytes, serial bytes and screens

Console and serial records observe different points in output. `step`
samples register C on entry to ROM BCONOUT, executes an instruction and
adds its cycles. Those samples form `output`. Emulated serial-line
decoding forms `serial` (`host/machine.mjs:51-55`, `host/machine.mjs:77`,
`host/machine.mjs:275-286`). Hooks before BCONOUT and drawing that bypasses
it are outside the console-byte record.

The distinction is visible when output switches to GLCD. These captures
use matrix input and graphics LCD without PICO9918. Console bytes include
boot and later CON output after GLCD selection:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board glcd CON. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON
CON: UC1:
A:SYSTEM>
```

Serial bytes stop at the console switch, before the later command:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board glcd --serial CON. Complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC
```

The decoded GLCD screen instead contains only the later command. Driver
startup cleared the earlier display contents:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board glcd --screen CON. Full screen; trailing empty rows omitted. -->
```text

A:SYSTEM>CON
CON: UC1:
A:SYSTEM>
```

A decoded PICO screen is a character observation. `screen` reads the
name table using display-register layout unless width or base is supplied.
Masking bit 7 presents reversed cells as plain characters. `cell` returns
the raw name-table byte. Neither establishes glyph pixels or reverse-video
appearance by itself (`host/machine.mjs:411-441`).

Capture supplies PICO console width from PIWID, allowing 40- and
32-column decoding instead of the 80-column fallback
(`tools/capture.mjs:147-153`). Changing this decoder parameter alone
cannot demonstrate execution with another width or font.

GLCD text decoding has a different dependency. `glcdScreen` compares
six-by-eight pixel cells with supplied `Machine.font`, accepting inverted
patterns and returning `?` for unknown cells. Test and capture callers
use the repository font parser (`host/machine.mjs:443-481`,
`test/lib/machine.mjs:10-11`, `tools/capture.mjs:43-50`). Matching decoded
strings alone cannot qualify another font, display default or editor
layout.

## Write watches

Memory watches expose attempted operations that real RAM does not report.
Machine records `rom-write` for CPU writes to `C000h–FFFFh` and
`overlay-write` below `0800h` while overlay is active. `violations` stores
address and program counter before the memory hook processes the write
(`host/machine.mjs:220-238`). Such a report establishes an attempted
write, not a changed ROM byte.

Ordinary tests assert no violations (`test/system.test.mjs:14`) and the
diagnostic test makes the same assertion (`test/diag.test.mjs:292`). The
inspected source contains these checks in 33 top-level files outside
diagnostics. This inventory counts source locations rather than successful
runs or coverage of unexecuted paths.

A second watch covers EXPAND 1 after cold boot's clear. Writes to
`8000h–BCFFh` are permitted for the cache's recognised writers. Writes to
the free pages `BD00h–BFFFh` are reported. On an older ROM whose history
ring, `HRING`, is at `BD00h`, the watch starts at `BE00h` instead. The model locates
the clear's end from MEMINIT's first LDIR. Symbols identify permitted
writers: SD block loops, cold-boot cache initialisation and MVCOPY called
from the cache (`host/machine.mjs:180-230`).

Unexpected EXPAND writes accumulate in per-machine `expand1Writes`.
The first sixteen also enter process-wide `EXPAND1_WRITES`. The Node
wrapper asserts the shared list empty after each file and optional
`TEST_TRACE` connects entries with test names (`test/lib/machine.mjs:54-74`).
Only callers using that wrapper receive its after-file assertion.

A deliberate `BF80h` write under EXPAND 1 tests the watch itself.
`test/expand.test.mjs:68-78` checks the report then removes its intentional
shared-list entry. The underlying write still happens: the watch adds
observation rather than protection (`host/machine.mjs:228-238`). Setup
through `Machine.write` or force-write helpers bypasses this CPU watch
(`host/machine.mjs:178`, `host/machine.mjs:248`).

## Commands and stopping conditions

Execution control also limits what a capture demonstrates. `runUntil`
stops on a predicate or fails at its cycle limit, including an early CPU
halt. `expect` checks output only after it grows then permits bounded
settling for the final display character (`host/machine.mjs:288-340`).
A matched output pattern is a stopping condition. Other required state
changes still need their own observation.

Prompt recognition combines state with text. `waitingForInput` locates
named polling ranges and `ready` also checks startup completion and CCP
line input. Capture uses that state plus a prompt suffix, treating
`[more]` and retry prompts separately (`host/machine.mjs:342-373`,
`tools/capture.mjs:76-96`). Prompt-like program output can confuse a
suffix-only wait. Persisted results or specific state must distinguish
completion from similar-looking output.

`type` sends serial characters only when the ROM is waiting, completing
reception before sending the next. With a video console it uses matrix keys,
holding a key and its modifier until the keyboard scan consumes it, then
releasing it. `enqueueInput` and `pumpInput` provide a nonblocking queue for
the page and capture tool. Unsupported queued matrix characters can fall
back to serial (`host/machine.mjs:385-402`, `host/machine.mjs:484-554`).
This pacing differs from a physical terminal sending characters as typed.

Capture accepts command lines, control-key notation and `@key`, `@press`,
`@start`, `@run` and `@reset`. Source defines each wait and cycle bound.
It prints the starting card's SHA-256 to stderr, identifying input bytes
rather than the card after execution (`tools/capture.mjs:5-39`,
`tools/capture.mjs:67-73`, `tools/capture.mjs:98-132`). A reproducible
sequence also needs ROM, matching symbols, runtime and application inputs.

Reset and RAM export preserve different state. `reset` restarts CPU
and latches while retaining RAM and card. `ramImage` copies mapped
`0000h–BFFFh` plus a selected EXPAND 1 window into 64 KiB. `loadRam`
restores that layout. Neither captures all optional MAIN regions, device
registers, CPU registers or pending input (`host/machine.mjs:562-584`,
`host/machine.mjs:613-621`).

## A complete pagination fixture

A complete pagination fixture connects these observations to an operation.
Its ten-line file is longer than starter STARTUP.CMD and uses a separate
image. Chapter 4's prepared SAMPLE route needs no such fixture. This
preparation requires Chapter 6 host setup and prepared media:

```sh
printf 'The graphics LCD has 8 rows of 21 characters.\nA line wider than that goes on in the next row.\nThree\nFour\nFive\nSix\nSeven\nEight\nNine\nTen\n' > lines.txt
cp dist/starter.img long.img
node tools/tecvol.mjs put long.img A lines.txt --text
```

GLCD has eight rows of 21 characters. Reserving the last for `[more]`
gives seven output rows before the first pause:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card long.img --board glcd --screen 'TYPE LINES.TXT'. Full screen; trailing empty rows omitted. -->
```text
The graphics LCD has
8 rows of 21 characte
rs.
A line wider than tha
t goes on in the next
 row.
Three
[more]
```

Each initial file line wraps across three rows. Counting starts at the
listing's first row, so the command has scrolled away before the pause.
The next capture sends x to erase `[more]` and continue:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card long.img --board glcd --screen 'TYPE LINES.TXT' '@key x'. Full screen; trailing empty rows omitted. -->
```text
Four
Five
Six
Seven
Eight
Nine
Ten
[more]
```

At the pause, Ctrl-C, Esc or case-insensitive Q stops output. Ctrl-C
also cancels later command pieces. Esc and Q preserve them, following
Chapter 13. Pager cleanup erases `[more]` before returning. Here q stops
at the first pause, leaving remaining file text unprinted and a prompt
below the erased row:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card long.img --board glcd --screen 'TYPE LINES.TXT' '@key q'. Full screen; trailing empty rows omitted. -->
```text
8 rows of 21 characte
rs.
A line wider than tha
t goes on in the next
 row.
Three

A:SYSTEM>
```

Shell source defines the dimensions and stop paths
(`drivers/shellio.asm:345-374`, `drivers/shellio.asm:450-502`). These
screens establish the model result rather than a physical GLCD display.

## Fixtures, assertions and pinned inputs

Test source describes checks that still require an actual run. The
package command selects top-level `test/*.test.mjs` with Node test
concurrency one (`package.json:18`). Git-tree inventory contains 67 files
from arith.test.mjs through write.test.mjs. This counts files, not cases,
executed files or passing assertions.

`romFor` reads `build/tecos/tecos.rom` and its D8 map. `boot` prepares the
card for the requested display and waits for the first prompt with the fixed
test clock. `withDisplay` preserves an existing STARTUP.CMD. With matrix
input and no PICO it can add GLCD.SVC and startup. With PICO and matrix
input, a width other than the raw cold 40 can add a CON PICO line when
startup is absent. The helper's default width argument remains 80
(`test/lib/fixtures.mjs:27-32`, `test/lib/fixtures.mjs:121-149`).

Program fixtures also depend on their assembly inputs. `program` runs
TAS through `assembleProgram` for `test/programs/NAME.asm` and caches
bytes and symbols in `build/test-programs`. The key includes origin,
the first sixteen hash digits of TAS.COM and a recursive source/include
digest. Editing an included file produces a different key. It omits other assembler
and runtime dependencies, so the key is not a complete artifact identity
(`test/lib/fixtures.mjs:35-68`). `service` uses makeSvc
(`test/lib/fixtures.mjs:88-95`), whose writer Chapter 14 explains.

Fixture population can bypass runtime protections. `standardCard`
creates empty SYSTEM on A and WORK on B, optionally adding volumes.
It is distinct from populated starter. `volume` deliberately supplies
`readOnly: false` to CpmVolume for setup (`test/lib/fixtures.mjs:70-83`).
The same library serves tecvol and the page. Ordinary reads reject block
references above DSM and writes/erase enforce attributes unless forced
(`tools/lib/cpmfs.mjs:128-173`, `tools/lib/cpmfs.mjs:175-233`). Privileged
setup therefore cannot establish a protected operation through the ROM.

TED.COM and TAS.COM are external inputs. `test/inputs.json` records their
repository, full commit, path, byte count and SHA-256. Selection uses an
explicit environment override, then `.inputs/`, then the legacy sibling
path. A selected entry remains authoritative even if broken or stale
(`tools/lib/pins.mjs:10-49`). `npm run inputs` prepares missing pinned files
as described in Chapter 27. A missing test input is skipped unless STRICT=1
makes it fail. A hash mismatch is a failure, not a reason to try another
candidate (`test/lib/inputs.mjs:28-45`, `package.json:19`).

Browser execution requires another run surface. Repository tests do not
drive a browser. Those tests moved to TEC-OS Viewer. Playwright remains
pinned at 1.62.1 for Chromium against the local `npm start` page. README
setup uses `npx playwright install chromium`. Dependency tests inspect
declared and locked versions plus that instruction (`README.md:75-79`,
`package.json:28`, `test/deps.test.mjs:15-27`). Those declarations identify
neither the installed browser nor its execution outcome.

## The browser as another caller

The browser is another caller of the shared implementation. After ROM
and media preparation, `npm run web` builds `web/dist` using esbuild.
It bundles Machine and container/file libraries into app.js and aliases
fs to a stub. After clearing old output, it copies the page, style, ROM,
symbols, recipe and distribution files (`web/build.mjs:1-45`). Its starter recipe contains
the same thirteen files, including SHELL.SVC and DEMO.ASM. `TAS DEMO`
builds DEMO.COM from programs/DEMO.ASM on the card
(`tools/media.mjs:203-257`, `web/build.mjs:41-42`).

Each animation frame targets 4 MHz for the elapsed wall time, capped at 100 ms.
Every 1,024 instructions it checks a 30 ms execution budget and can stop the
frame early. Rendering reads the runtime's display state and shows the PICO
screen, digits, LEDs, LCD, GLCD, latch, window bank and Caps state. A
once-per-second display reports achieved MHz, not an unconditional 4 MHz
execution rate (`web/src/main.mjs:185-244`). The page supplies no fixed clock so
its DS1302 follows host time (`web/src/main.mjs:82-106`).

Focused video displays route ordinary keys to the matrix queue. The serial
terminal routes them to serial. Unsupported multi-character sequences can use
serial even from a video focus. The page's serial display strips escape
sequences and handles backspace. Its text presents the serial bytes through
those rules rather than implementing a complete terminal (`web/src/main.mjs:369-438`).

Browser storage adds a persistence boundary after ROM card writes.
Changed card bytes mark the in-memory image dirty. A two-second timer
attempts IndexedDB database tecos, store cards, key current. Failure
retains dirty state and displays an unsaved notice. Even a successfully
stored image excludes bytes still held in the ROM cache
(`web/src/main.mjs:103-163`, `web/src/store.mjs:6-8`,
`web/src/store.mjs:42-59`).

Power-on prepares a staged copy of STARTUP.CMD for the selected display and
width, publishing the change only after successful preparation. GLCD uses
GLCD.SVC. Every selected PICO width gets an explicit CON PICO line,
including 80. The page's fallback preference remains 80 columns, distinct
from the ROM's raw cold width of 40. Other display pieces are removed under
the rewrite rules in [Appendix I](appendix-i-web-page.md)
(`host/card.mjs:109-146`, `host/card.mjs:205-220`,
`web/src/main.mjs:17-43`, `src/pico.asm:19-68`). This source account does not
establish a browser run.

Import stages every selected file on a card copy. It waits for an older
save, attempts persistence then copies staged bytes into the running
image before reset. Normally failed saving prevents publication. If
storage loading previously disabled saving, import can remain in memory
only. Appendix I explains that recovery state and its notices
(`web/src/main.mjs:155-177`, `web/src/main.mjs:632-664`). Reset clears
ROM cache and rebuilds free space. Preserving earlier cached writes
requires a successful Ctrl-C flush before import. Import does not perform
that flush itself.

## From a model result to a board observation

The book's transcripts and T-state figures are model evidence. README
also records model-only execution (`README.md:29-30`). A source assertion
states a condition to test. A passing run establishes it for the actual
ROM, runtime, inputs and exercised paths. Similar source at another pin
cannot transfer that result to a new artifact or physical board.

The runtime sends overlay writes to underlying RAM and permits latch readback.
The board documentation instead selects ROM under the overlay and describes the
latch as write-only. The legacy bank-field decode uses latch bits 3–6. The
retired diagnostics ROM's test asserted its nine window banks plus the base
mapping, which must not be attributed to the documented board
(`46be5a4:test/diag.test.mjs:121-123`). The `ram96` mapping is a separate
configuration, not a repair to every legacy-model result. That ROM's T08,
T10 and T12 probed these differences. TEC-OS avoids overlay writes and latch
reads so checked ordinary paths can satisfy those restrictions on a more
permissive model (`host/machine.mjs:40-46`, `host/machine.mjs:158-175`,
`46be5a4:docs/diagnostics.md:147-164`, `46be5a4:docs/diagnostics.md:187-196`,
`docs/diagnostics.md:383-399`).

Physical observations require the separate route in
[Chapter 28](28-diagnose-the-machine.md). MON-3 loads the board diagnostic
and each log line records that board's response. Its model tests establish
diagnostic logic rather than board behaviour (`docs/diagnostics.md:15-18`,
`docs/diagnostics.md:104-127`). The retired ROM comparison tool,
`tools/diag-check.mjs`, is absent at that source. A board log supports
its particular observation, leaving other timings, devices and application
workflows to be checked separately.
