# The ROM table and the hardware services

Status: **Built**, ABI 5.1. The *ROM table* is 8 bytes at `C003h`, ending in one jump, `ABICALL`
at `C008h`, to 16 *numbered services*: 9 *hardware services* in `src/services.asm`, and
the volumes', the display drivers' hook, the registry's and the font's. `test/hwsvc.test.mjs`
calls each hardware service with its arguments in the registers and measures its stack. `DEMO.COM`, on the viewer's demo card, shows them.

The ROM is 16 KiB. <!-- media: rom-space -->It holds 15,877 bytes (`tecos`) and has 507 free,
in one gap after the code at the end of the ROM.<!-- end --> This
document sets out what earns a place in it, the entry point that
gives programs the TEC-1G's hardware, and what belongs on the card instead.

## The ROM's layout

| Addresses | Contents |
| --- | --- |
| `C000h–C002h` | `JP COLD`: at reset the CPU runs it through the boot overlay at `0000h` |
| `C003h` | The ROM table, below: the one fixed address in the ROM |
| after the table | One block of read-only data: messages, the geometry and format tables, the CCP's and the BDOS's tables, and the BIOS jump table that cold boot copies to RAM |
| after the data | One block of code |
| to `FFFFh` | The free space, in one gap |

Only `C003h` is fixed. The data and code move when the code changes; programs reach
the ROM only through the table. The build checks this order from the symbol table.

## The ROM table

ABI 5.1. `src/abi.inc`, published in `dist/` as `abi.inc`, gives the table's
addresses and each service's number, arguments, results, carry and stack; the ROM
assembles from the same file, so the two can't disagree. A program tests for major
version 5 exactly: a new major may renumber the services, and a new minor only adds
numbers at the end. An ABI 4 or ABI 3 program that tests the major stops itself; one that
tests nothing reaches whatever its old address now holds, and a service of format 3,
built for ABI 4, is refused by the loader before its INIT runs.

| Address | Name | Contents |
| --- | --- | --- |
| `C003h` | `ABITAB` | `"TNA"` signature |
| `C006h` | `ABIMAJ` | ABI major version, 5 |
| `C007h` | `ABIMIN` | ABI minor version, 1: 1 adds `TNFONT` |
| `C008h` | `ABICALL` | `JP` to the service numbered in C |

EXPAND 1 is TEC-OS's own, and no interface leaves it in view: `BF00h` and `BE00h`
free, `BD00h` the command history, `BC00h` the block cache's table and
`8000h–BBFFh` its 30 lines. Cold boot clears EXPAND 1, the cache with it; its
contents do not survive a reset, and warm boot leaves them.

## The font

| C | Arguments | Returns |
| --- | --- | --- |
| 15, `TNFONT` | — | HL = the console font in the ROM: 96 characters of 8 bytes, one a row from the top, from 20h |

The PICO9918's console and the GLCD's driver draw from this copy, built from
`format/font5x7.txt`; the driver asks for it at `INIT`, and a ROM before ABI 5.1
refuses the number, and the driver's `INIT` with it. Serial and the LCD need no font.

## The registry

`TNFIND` and `TNLIST` find the records of the services in memory. `docs/services.md` sets out
the services and what each side may rely on.

| C | Arguments | Returns |
| --- | --- | --- |
| 13, `TNFIND` | DE = a record's name, 8 bytes padded with spaces; B = the least interface version | Carry clear: HL = its entry table, A = the generation. Carry set: none |
| 14, `TNLIST` | B = an index from 0 | Carry clear: HL = that record (a link word, the name, the version, the table's address), A = the generation. Carry set: past the last |

Find returns the newest service's record when two publish one name. AF, BC, DE and
HL are destroyed; IX and IY are kept. Each uses at most 8 bytes of the caller's
stack, the dispatcher's among them, and makes no BDOS or BIOS call, so it
is safe on any stack. Each walk stops after 256 records, so a program that
has overwritten a record can't loop it. A removal raises the generation by
one; it is 8 bits, so after 256 removals it repeats and a stale pointer
passes a comparison. There is no public removal: `UNLOAD` is the only way a service leaves.
When the PICO9918's console started at cold boot, its "PICO" record is the
registry's permanent tail: `TNFIND` finds it, `TNLIST` returns it last, and
`UNLOAD` never removes it (KS39).

## Calling the services

A program checks for `"TNA"` at `ABITAB` and ABI major version 5 at
`ABIMAJ`, then calls `ABICALL` with the service's number in C and arguments in
B, DE and HL; A is never an argument. `abi.inc` names each number and status code. On return A holds the status, with Z set and carry clear on
success, or a status with carry set and nothing changed; results come back as each
service lists, and `TNFIND` and `TNLIST` return the generation in A. IX, IY and the
alternate registers are preserved, but `TNMOUNT`, `TNUNMNT` and `TNDESC` may change
IX and the alternates. None calls the BDOS but `TNMOUNT` and `TNUNMNT`, which reset
the drive through function 37 on the BDOS's own stack. A CP/M program that finds no signature is on
another system and carries on without the TEC-1G's devices.

| Status | Meaning |
| ---: | --- |
| 0 | Success |
| 1 | No such hardware service, or an argument out of range |
| 2 | The device is not fitted, or not the console |

The rules that make the hardware services safe for CP/M programs:

- **The caller's stack.** No hardware service switches stacks or touches the TPA
  beyond the buffers it is given. The deepest, `PUTAT` on a GLCD console, takes
  22 bytes of the caller's stack, counting the dispatcher but not the `CALL`.
- **Resident state only.** The hardware services keep their state in the resident
  workspace: the claim flag, 1 byte.
- **Never the BDOS.** Hardware services do not call the BDOS, so a program can call
  them from inside its own BDOS-heavy code without re-entry.
- **Port 01h stays safe.** Every hardware service that writes port 01h holds bit 6,
  the serial transmit line, high.

## A video driver's table

The PICO9918's console is in the ROM, and its table is `CRT:`'s (KS39). The GLCD's
console is a driver, `GLCD.SVC`, below `(0006h)`. Its INIT calls `TNDRVR` (12) with
B = 3 for `UC1:` and HL pointing at eight words: the routines in the terminal's
order (put, get, clear to the end of the line, restore, read a row, write a row), a
routine for the page functions, then a byte of columns and a byte of rows. The
seventh word may be 0 in a driver's table, since only `CRT:` calls it, with A = 0 to
show a finished row move, 1 to begin a move of rows B to C and 2 to end one, and
never while a program has claimed the VDP. `CONSW` points the terminal's vector at the table
when it selects the mode, and the terminal then calls the routines directly, on the
caller's stack: a program on the CCP stack can call the BIOS's `CONOUT` in the 28
bytes it has. A program that pushes anything before calling the BIOS directly sets
up its own stack first. The routines run with the caller's interrupt state, so an
interrupt handler must not print through the console.

`TNDRVR` returns `LINEBUF`'s address in HL, where the row routines read and write a
row, with A = 0 and carry clear. It returns `TNEBAD` with carry and nothing changed for
B = 1, since `CRT:`'s table is the ROM's, if that mode has a table already, or with no
matrix keyboard. An old card's `PICO.SVC` is therefore refused at its INIT. HL = 0
drops the mode's table, with carry clear, and the console is chosen again at its
next call. It uses 4 bytes of the caller's stack, the dispatcher's among them.

Page zero's restart vectors at `0008h–003Fh` are left to programs, debuggers and
services. A warm boot, like a cold boot, puts seven zeros and a `RET`, or `EI; RETI`
at `0038h`, in each one that doesn't jump to a page at or above `PZTOP`'s, so an RST
through a vector a finished program left returns at once with the interrupt state
unchanged. `docs/services.md` gives a service's rules.

## The hardware services

| C | Hardware service | Arguments | Results | Stack | ROM |
| ---: | --- | --- | --- | ---: | ---: |
| — | Dispatcher, exits, table | | | 4 | 50 |
| 0 | `INFO` | — | `B` devices: bit 0 matrix keyboard, 1 PICO9918, 2 GLCD, 3 DS1302 clock, as cold boot found it, 4 PICO9918 claimed (`HWBCLM`), 7 the ROM's word `GLCD?` on LCD row 3 (`HWBWRD`); `DE` ROM version; `L` console columns, `H` rows (0 for serial) | 6 | 24 |
| 1 | `DIGIT` | `HL` → 6 segment bytes, leftmost first | One scan, about 0.8 ms a digit, then all off | 4 | 26 |
| 2 | `LCD` | `B` = row 0-3, `HL` → 20 characters | The row written; row 3 also clears `HWBWRD` | 10 | 44 |
| 3 | `VIDEO` | `B` = 1 claim the PICO9918, 0 give it back | Status 2 without a PICO9918 | 12 | 81 |
| 4 | `TONE` | `B` = half period in units of 16 T-states, `DE` = half cycles | A square wave on the speaker; each half cycle is 16 × B + 51 T-states | 4 | 29 |
| 5 | `JOY` | — | `B` = joystick bits, 1 for each one pressed | 4 | 10 |
| 6 | `KEYS` | `HL` → 8-byte buffer | The 8 matrix rows, 1 for each key down | 4 | 15 |
| 7 | `PUTAT` | `D` = row, `E` = column, `B` = count, `HL` → characters | Written on the video console without moving the cursor, clipped to the screen; status 2 on serial, or while the PICO9918 is claimed and is the console | 22 | 68 |
| 8 | `RTC` | `B` = 0 read, 1 set; `HL` → 7 BCD bytes: seconds, minutes, hours, date, month, weekday, year | The DS1302 clock read or set; status 2 without a clock | 8 | 138 |
| | **Total** | | | | **485** |

Numbers 9 to 14 are the volumes', the drivers' hook and the registry's, above and in
`abi.inc`. Every number from 15 to 255 returns status 1 with the other registers
as they came. Stack is the deepest measured use of the
caller's stack below the return address.

Notes:

- The digits and speaker are multiplexed or timed by the CPU, so a program
  calls `DIGIT` in its main loop.
- While the PICO9918 is claimed the console drops output to it, draws no
  cursor and does not flip pages, and the program may set any mode and use
  all of VRAM, through the ports or through the ROM console's graphics entries
  (`docs/services.md`). The claim has no owner. Releasing it, or a warm boot,
  which releases a resident's claim too, restores the console's text mode,
  font and page and clears the screen.
- `PUTAT` is a fast path for full-screen programs: through the driver's cell
  routine it costs about 425 T-states a cell along a row on the PICO9918 at 80
  columns, against about 715 through BIOS `CONOUT` and about 3,860 through BDOS
  function 2. On the GLCD, whose cells are drawn pixel by pixel, each takes about
  35,000 T-states a cell or more, and they are within 10 percent.
  Edit stays a portable CP/M program and can use it when it finds the signature.
- `RTC` uses the same bit sequence as MON3: the DS1302 puts each data bit
  out on a falling clock edge, as Debug80 runtime 0.3.0 models it.

## What earns ROM space

A routine goes in the ROM when at least one of these holds:

1. **The system needs it before a card is read, or without one.** Reset,
   the console, the SD driver, the mount checks and the diagnostic prompt.
2. **The OS itself uses the device.** The BIOS, BDOS and CCP drive the
   console, the card and the status LCD.
3. **The device shares a port or state with something the OS owns.** A
   program that drives the device directly can break the OS. Port 01h is the
   clearest case: bit 6 is the serial transmit line, bit 7 the speaker and
   bits 0–5 the 7-segment digit select. A program that scans the digits or
   beeps without holding bit 6 high sends noise down the serial line. The
   system latch at FFh is write-only, and the OS keeps its value in `LATCHV`;
   a program that writes the latch itself leaves that copy wrong.
4. **It is small and nearly every program for the device would carry it.**
   Only for a few dozen bytes; anything larger goes in an include file.

Everything else lives on the card: utilities as `.COM` files, services as
`.SVC` files, and code that programs share as ATOM include files. The 8 × 8
LEDs, 7-segment patterns and random numbers have no hardware service: `DEMO.COM`
carries its own.

## What the ROM holds today

| Part | Bytes | Rule | Verdict |
| --- | ---: | --- | --- |
| The ROM table and the reset jump (`reset.asm`, `abi.asm`) | 11 | 1 | Stays |
| Read-only data: messages, keywords, the jump table's source, geometries (`tables.asm`, `gen/geom.asm`, `text.asm`) | 767 | 1, 2 | Stays |
| Cold and warm boot, the vectors, the drives' listing, the resident layout and the diagnostic console, its header dump gone (`boot.asm`) | 738 | 1 | Stays |
| BIOS, with its entries' interrupt discipline (`bios.asm`) | 404 | 2 | Stays |
| Serial console (`console.asm`) | 474 | 1, 2 | Stays |
| Matrix keyboard (`keyboard.asm`) | 249 | 1, 2 | Stays |
| ANSI terminal (`term.asm`) | 971 | 2 | Stays |
| Video switch and the display drivers' hook (`video.asm`) | 115 | 2 | Stays |
| PICO9918 text console and graphics (`pico.asm`) | 603 | 1, 2 | Stays: the console from the banner on, its RAM a 95-byte block (KS39) |
| PICO9918 probe (`tms.asm`) | 32 | 1 | Stays |
| GLCD text console | — | 1, 2 | Moved to `GLCD.SVC`, a driver, loaded by `STARTUP.CMD` |
| Font, 96 characters, service 15's (`gen/font.asm`) | 768 | 1, 2 | Stays: the PICO9918's console reads it and the GLCD's driver through `TNFONT`; serial and the LCD need none |
| 20 × 4 LCD (`lcd.asm`) | 133 | 2 | Stays |
| SD driver (`sd.asm`) | 836 | 1 | Stays |
| Container mount and checks (`vol.asm`) | 1,293 | 1 | Stays |
| CCP, with the startup file and `SERVICES` (`cpm/ccp.asm`) | 2,495 | 2 | Stays |
| BDOS (`cpm/bdos.asm`) | 3,871 | 2 | Stays |
| Numbered services, `TNDRVR`'s among them (`services.asm`) | 497 | 3, 4 | Stays |
| Block cache (`cache.asm`) | 690 | 1, 2 | Stays: every read goes through it |
| Command history (`history.asm`) | 211 | 2 | Stays |
| Service loader, registry and loading the display driver (`loader.asm`) | 719 | 2 | Stays |

Counted from the build's debug map: each row is its source files' bytes, and
the data row the block from `ROMDATA` to `ROMCODE`. The rows sum to the
census's 15,877 bytes used.

Nothing in the ROM today belongs on the card. The native program calls,
which had no user, were removed.

## Fixes found on the way

Writing the proposal for the hardware services turned up three faults. All three are fixed (67 bytes
of ROM) and covered by `test/devices`:

1. **`NATSVC` wrote into the TPA when a CP/M program called it.** It stored
   its arguments in kernel state at `0100h` and moved to a stack at `0300h`
   before checking anything. It now refuses with status 11 and carry set
   before touching memory when the classic profile is running.
2. **Warm boot did not restore the video mode.** It now reloads the
   PICO9918's registers and font, or turns the GLCD's display and graphics
   back on (36 ms per warm boot on the PICO9918).
3. **Punch and reader were null devices.** They are now the serial port,
   as on most CP/M machines with one serial line. List stays null.

## What lives on the card

Include files, assembled into the programs that need them:

| File | Contents | Why not ROM |
| --- | --- | --- |
| `SEGFONT.ASM` | ASCII to 7-segment table | 96 bytes; only display programs need it |
| `GLCDGFX.ASM` | GLCD pixels, lines and boxes | The OS uses the GLCD only as text |
| `VDPGFX.ASM` | PICO9918 graphics modes and sprites, after `VIDEO` claims the card | The OS uses only text modes |

Programs:

| Program | Job |
| --- | --- |
| `TIME.COM` | Read and set the real-time clock |
| `XFER.COM` | Send and receive files over the serial port with checksums |
| `CARDINFO.COM` | Show the container and volumes from raw card blocks |
| `TUNE.COM`, `LEDS.COM`, `JOY.COM` | Speaker, LED and joystick tests and demos |
| `TERM.COM`, `PROBE.COM` | Built from `test/programs`, no longer on the starter card; `COPY` is built into the CCP |

## Next in the ROM

For the <!-- media: rom-free -->507<!-- end --> bytes left at the end of the ROM: a resident monitor with Intel HEX
loading. The integer arithmetic once planned here was settled by what calls
it: a 16 ÷ 16 divide (`DIV16`) is in the BDOS, where it splits record
numbers into track and sector, and `PUTDEC` uses it; a multiply, a 32 ÷ 16
divide and CRC-16 have no caller in the ROM and go in include files on the
card, beside floating point and drawing. A disassembler does not fit.
