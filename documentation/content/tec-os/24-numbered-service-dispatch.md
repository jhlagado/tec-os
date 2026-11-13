---
title: Numbered-service dispatch
parent: TEC-OS
nav_order: 24
nav_group: "Inside TEC-OS"
---

# 24. Numbered-service dispatch

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

Numbered calls let programs use ROM services without embedding routine
addresses. A call to `ABICALL` must find the selected routine while leaving
its register arguments intact. The dispatcher saves the pairs needed for
lookup on the caller's stack then removes them before entry
(`src/services.asm:34-57`). Programs, the CCP and resident routines can
therefore use the same call path without an argument buffer.

## From a number to a routine

The stable entry is the jump at `C008h`, `ABICALL`, which leads to
`SVCDSP`. It occupies the last three bytes of an eight-byte ROM table.
Before it are signature `TNA` and ABI version bytes 5 and 1
(`src/abi.asm:9-14`, `src/abi.inc:17-33`). The caller supplies the number
in `C` and arguments in `B`, `DE` and `HL`. Since `A` carries no argument,
dispatch can use it and flags immediately (`src/abi.inc:35-56`).

The table has seventeen callable entries, 0–16. `SVCDSP` compares `C`
through `A` with exclusive bound `TNCOUNT`, 17. Loading `TNEBAD` into
`A` preserves the comparison flags. Numbers 17 and above reach `HWERR`
without altering `B`, `DE` or `HL` (`src/services.asm:34-38`,
`src/abi.inc:228-238`). The result is status 1 with carry set and Z clear
(`src/services.asm:63-66`).

Valid dispatch needs four temporary stack bytes. It pushes `HL` and
`DE`, doubles the service number in `DE` and adds that offset to `SVTAB`.
Seventeen address words occupy 34 ROM-data bytes (`src/services.asm:39-46`,
`src/tables.asm:98-130`). This routine table is separate from the eight-byte
signature/version/jump table at `C003h`.

The selected address replaces a saved word rather than requiring another
call frame. Dispatch loads the address into `HL` and pops argument `DE`.
`EX (SP),HL` exchanges the address with saved argument `HL`. `RET` then
consumes that address and enters the routine. The original arguments are
restored and only the caller's return word remains
(`src/services.asm:47-57`).

Result handling belongs to the selected service. Generic failure exit
`HWERR` preserves `B`, `DE` and `HL` as they reach that exit. It cannot
restore changes already made by a routine. `OR A` and `SCF` return nonzero
status with carry set. Ordinary success uses `XOR A` and `RET` for status
zero, Z set and carry clear (`src/services.asm:59-67`,
`src/services.asm:74-82`).

`FIND` and `LIST` instead return registry-specific results, including
generation in `A` (`src/abi.inc:185-206`). The ABI normally preserves `IX`, `IY`
and alternate registers. `MOUNT`, `UNMNT` and `DESC` may change `IX` and
alternates. Other register results must be taken from the selected
service contract (`src/abi.inc:35-56`).

## The code behind the table

Service numbers group several implementation boundaries. Hardware calls
0–8 and `FONT`, 15, are in `src/services.asm`. Volumes 9–11 use
`src/volsvc.asm`, explained in [Chapter 18](18-card-blocks-and-volumes.md).
`DRVR`, 12, enters `SVDRV` for the display-driver table from
[Chapter 17](17-console-paths.md). `FIND` and `LIST`, 13–14, enter the
registry in `src/loader.asm`, explained in
[Chapter 25](25-loading-and-removing-services.md). `SHELL`, 16, installs
or clears the prompt hook through `SVSHL`
(`src/tables.asm:98-130`, `src/services.asm:532-610`).

The following 442-byte account covers dispatch, generic exits, the nine
hardware routines and font access. Font data and the other numbered
services are excluded. These are build-specific figures, not fixed ABI
sizes.

| Number | Name | Routine | Bytes |
| ---: | --- | --- | ---: |
| | dispatcher, exits | `SVCDSP` | 28 |
| 0 | `INFO` | `HWSINFO` | 16 |
| 1 | `DIGIT` | `HWSDIG` | 25 |
| 2 | `LCD` | `HWSLCD` | 43 |
| 3 | `VIDEO` | `HWSVID`, with `HWVREL` | 76 |
| 4 | `TONE` | `HWSTONE` | 26 |
| 5 | `JOY` | `HWSJOY` | 9 |
| 6 | `KEYS` | `HWSKEYS` | 14 |
| 7 | `PUTAT` | `HWSPUT` | 62 |
| 8 | `RTC` | `HWSRTC`, with its clock routines | 138 |
| 15 | `FONT` | `HWSFONT` | 5 |

## Stored state and the status LCD

Programs can inspect console and device state without performing I/O.
`INFO` returns `CONDEV` OR `VCLAIM` in `B`, `ROMVER` in `DE` and adjacent
`VWID`/`VHGT` in `L`/`H` (`src/services.asm:74-80`, `src/ram.asm:421-422`).
The dimensions occupy `BFEAh` and `BFEBh` near the workspace's upper end.

The returned bits describe different times. Cold boot probes the clock
once with `RTCHAS` and sets `CONDEV` bit 3, `CDRTC`, on a response
(`src/boot.asm:68-72`, `src/layout.asm:73`). `VCLAIM` instead holds the
current PICO9918 claim as bit 4, `CDCLM` (`src/ram.asm:128`,
`src/layout.asm:74`). INFO neither repeats the clock probe nor changes
the claim.

Status LCD output must also distinguish application text from recovery
text. `HWSLCD` first validates row `B` below 4, returning `TNEBAD` before
writes otherwise. For row 3 it clears `CDWRD` in `CONDEV`, the mark for a
ROM recovery word (`src/services.asm:130-140`). Later recovery-word cleanup
then leaves application text intact (`src/loader.asm:924-943`).
[Chapter 26](26-startup-inside-the-ccp.md) explains the bottom-row use.

After validation, `LCDROWS` supplies the row address. `HWSLCD` sends it
then writes exactly twenty bytes from `HL`, advancing after each and
calling `LCDWAIT` before each character (`src/tables.asm:50-51`,
`src/services.asm:142-157`). Zero bytes count as output too. `LCDWAIT`
limits busy polling to 256 attempts, bounding the wait on an absent display
(`src/lcd.asm:23-39`).

## Digits and sound on port 01h

Shared port wiring constrains both digit and sound output. Port `01h`
also carries serial transmission, whose bit 6 must stay high while either
service changes other bits. Every DIGIT and TONE write includes `TXIDLE`,
`40h` (`src/services.asm:1-24`, `src/services.asm:94-116`,
`src/services.asm:241-262`). This avoids a false serial start bit.

`DIGIT` scans six patterns from `HL`, leftmost first. It starts `C` at
`20h` so only the leftmost select bit is set. Each pattern goes to
`SEGPORT` before that digit is enabled through `DIGPORT`. A `DJNZ` loop
starting with `B` at zero makes 256 turns, about 0.8 ms at 4 MHz.
The routine writes `TXIDLE` alone to turn the digit off, advances `HL`
and shifts `C` right. The scan ends when the select bit leaves the
register (`src/services.asm:84-116`).

`TONE` starts its port value at `TXIDLE` and toggles bit 7 for each half
cycle. `B` supplies the delay count and `DE` the number of half cycles.
The loop copies `B` to `C`, counts it down and uses `C` again to save the
port value while testing `DE` for zero (`src/services.asm:241-260`).
Between successive loop toggles the instruction cost is `16 × B + 51`
T-states. `B` at zero makes 256 delay turns because `DEC C` wraps to
`FFh`. Zero half cycles return immediately. After a nonempty tone the
last port write is `TXIDLE`, leaving the speaker low and the serial line
high (`src/services.asm:233-262`). This instruction-derived interval is
separate from the program-side measurements in
[Chapter 12](12-use-the-boards-devices.md).

## Matrix rows and the joystick

Keyboard and joystick input share port `FEh`. For `IN A,(C)`, register
`B` drives upper address lines and a low bit selects a matrix row.
`HWSKEYS` starts at `BC = FEFEh`, complements each input byte, stores it
through `HL` then rotates `B` left (`src/services.asm:280-295`). Returned
1 bits consequently identify pressed keys.

`RLC B` also copies the old top bit to carry. The low select bit reaches
that position for the eighth read, after which carry is clear and the
loop ends. The buffer contains eight row bytes. `HWSJOY` uses `F7FEh`
for its single read, the fourth select value in that scan. The joystick
therefore shares row 3. It also complements the port byte, returning a 1
for each pressed input (`src/services.asm:270-295`).

## Clock transfers

RTC calls validate the operation before device I/O. Mode `B` must be
0 for read or 1 for write. Other values return `TNEBAD` without touching
the clock (`src/services.asm:377-380`). Each valid call probes the DS1302
seconds register with `RTCHAS`. A byte below `60h` counts as a response,
using the BCD seconds range. This test does not validate every BCD digit
(`src/services.asm:382-385`, `src/services.asm:424-441`). No response
returns `TNENODV`.

`RTCCMD` raises the enable line and enters `RTCWR` to send the command.
`RTCWR` shifts the byte in `D` out least significant bit first, setting
each data bit before raising the clock (`src/services.asm:460-483`).
The service uses burst command `BFh` to read seven time bytes into the
buffer at `HL`:
seconds, minutes, hours, date, month, weekday and year. Each read byte
advances `HL` (`src/services.asm:366-375`, `src/services.asm:387-399`).

A write first calls `RTCPUT` with `8E00h` in `DE` to clear write protect.
It then sends burst command `BEh`, the seven bytes from `HL` and control
byte `80h` to turn protection on again. Both directions finish by taking
enable low (`src/services.asm:401-421`, `src/services.asm:447-453`). The
probe happens on each `RTC` call even though `INFO` reports the bit saved
at cold boot.

## Display claims and positioned text

A program using PICO9918 VRAM directly must prevent console drawing from
altering it. `VIDEO` records a claim for that interval. It first validates
`B` as 0 or 1 then requires `CDTMS` in `CONDEV`. Invalid mode returns
status 1 and absent PICO9918 returns status 2 before a claim is changed
(`src/services.asm:161-179`).

Claiming hides the cursor when `CONMOD` is `CMCRT` and stores `CDCLM`
in `VCLAIM` (`src/services.asm:181-188`). `VTOWN` combines mode and claim,
returning nonzero only for a claimed PICO9918 selected as console
(`src/term.asm:805-822`). Console drawing on that device stops while output
to another selected console can continue.

Releasing an absent claim returns immediately. Otherwise `HWVREL` clears
`VCLAIM` and checks `PIVEC`. Cold boot points it at `PIBLK` when the
PICO9918 responds and the Matrix switch enables the keyboard
(`src/services.asm:206-214`, `src/video.asm:18-24`, `src/pico.asm:53-68`).
Zero leaves the chip in its program-configured state. A present table
supplies its fourth word, offset 6, for restoration through `VHLJP`
(`src/services.asm:216-222`, `src/video.asm:61-66`).

The restore routine reinstates the mode, font and displayed page. Release also
clears the screen and homes the cursor when the PICO9918 is the console
(`src/pico.asm:201-277`, `src/services.asm:223-230`). Warm boot calls `PIICLR`
and then `HWVREL` before `PZINIT`. `PIICLR` clears the tracked interrupt-enable
bit and writes register 1 with the chip's interrupt off, so the interrupt is off
before page zero is rebuilt. A restore during a claim keeps a tracked enable bit
that the program set through `PICOREG` (`src/boot.asm:131-141`,
`src/pico.asm:214-236`, `src/pico.asm:326-362`, `src/pico.asm:636-638`). A program's claim ends with its exit.

PUTAT uses the selected video driver while preserving the logical
console cursor position. `PUTAT` checks `VTOWN` then `CONMOD` bit 0.
A claimed PICO9918 console or non-video mode returns status 2. `CMCRT`
and `CMUC1` have that mode bit set. Serial and batch have it clear
(`src/services.asm:299-323`, `src/layout.asm:77-86`). These tests precede
the zero-count case. On an available video console, zero returns before source access
or cursor-state changes (`src/services.asm:324-325`).

For a nonzero count, `PUTAT` hides the cursor before checking the row.
A row beyond the screen returns status 0 with no text written.
The cell loop clips the column against `VWID`, then saves `BC`, `DE`
and `HL` around `VPUT`. It passes character `A`, row `B` and column `C`
to the driver. The source pointer and column advance until the count
expires or the right edge is reached (`src/services.asm:327-360`).
`VPUT` jumps through `VPUTV`, the vector copied from the driver's table
(`src/video.asm:26-34`).

## The ROM font

Display drivers share the ROM font (`src/pico.asm:253-275`,
`drivers/glcd.asm:527-555`). Service 15, `FONT`, returns its address in
`HL` and clears `A` (`src/services.asm:510-517`). The data contains 96
characters starting at code `20h`, eight bytes each in top-to-bottom row
order (`src/abi.inc:208-213`). Its 768 bytes are separate from the
five-byte access routine counted above.

The selected font is TEC Compact from `format/font5x7.txt`. Parsing
places five row pixels in bits 7–3 and requires eight rows per character
(`tools/lib/font.mjs:9-35`). The package check verifies the selected font's
identity (`tools/lib/font-package.mjs:8-16`).

GLCD installation depends on this service. `INIT` calls FONT first and
stores its pointer. Before ABI 5.1, service 15 is outside the table and
returns carry. INIT then exits before probing the controller
(`drivers/glcd.asm:60-68`).

## Space on the caller's stack

Hardware calls and FONT use the caller's stack and avoid BDOS calls.
Resident bytes such as `VCLAIM` and `CONDEV` hold their state. They can
therefore run from service INIT or inside a BDOS call without re-entering
BDOS. MOUNT and UNMNT are exceptions: both call function 37 and require
entry from outside an existing BDOS call (`src/services.asm:1-16`,
`src/abi.inc:35-56`).

A stack bound counts additional space below the caller's return address.
This applies even when the caller is already using part of the BDOS or
CCP stack. Bounds in `abi.inc` include the dispatcher's temporary four
bytes despite their removal before routine entry. They are maxima rather
than measurements of every path (`src/abi.inc:50-53`). Service calls also
preserve preceding interrupt state (`src/abi.inc:43-44`).

JOY, KEYS, DIGIT, TONE and FONT each need at most four additional bytes,
just the dispatcher saves (`src/abi.inc:65-113`, `src/abi.inc:208-213`).
PUTAT's bound is 22 bytes, the largest hardware bound. Six saved register
bytes remain while the driver makes nested drawing calls
(`src/services.asm:348-357`, `src/abi.inc:115-124`). A caller therefore
needs 22 free bytes for positioned text and four for a tone.
