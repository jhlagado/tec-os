# The ROM table and the hardware services

Status: **Built**, ABI 4.0. The *ROM table* is at `C003h`. Its hardware services' entry, `ABIHW` at
`C00Ah`, has 9 *hardware services* in `src/hwsvc.asm`, 485 bytes of ROM in all, and
`test/hwsvc.test.mjs` calls each one with its arguments in the registers and
measures its stack. `DEMO.COM` on the starter card shows them.

The ROM is 16 KiB. <!-- media: rom-space -->It holds 14,937 bytes (`debug80`) and has 1,447 free,
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

Only `C003h` and the `RET` at `C01Dh`, below, are fixed. The data and code move when an entry is added to the
table or the code changes; programs reach the ROM only through the table.
The build checks this order from the symbol table on every profile, and
refuses any `.asm` file that names an address of the old table at `FF00h`.

## The ROM table

ABI 4.0. `src/abi.inc`, published in `dist/` as `abi.inc`, gives each entry's
address under the name below, and the hardware services' numbers and status codes, and
the build checks them against the ROM. A program tests for major version 4
exactly: a new major may move what follows `ABIMAIN` and renumber the hardware services.
`C003h` to `C00Ch` kept their addresses from ABI 3. ABI 4 isn't frozen until a
release, so a later stage may add to the table's end, which is `C018h`.

An ABI 3 program that tests the major for 3 stops itself. For the old clients that
don't, two things are done. Hardware service numbers start at `HWBASE`, 19, so that the
numbers 0 to 18 are refused, which holds for `DEMO`, whose test takes any major from
2. And `MOUNT` and `VOLS`, which test nothing and call `C01Dh`, meet a `RET` there,
in the data after the table, and the build checks that it stays. No other program
is covered: an ABI 3 program that doesn't test may reach any address in the table,
such as `C012h`, which is `ABIGLCD` now.

| Address | Name | Contents |
| --- | --- | --- |
| `C003h` | `ABITAB` | `"TNA"` signature |
| `C006h` | `ABIMAJ` | ABI major version, 4 |
| `C007h` | `ABIMIN` | ABI minor version, 0 |
| `C008h` | `ABIVID` | Address of the console size, columns then rows |
| `C00Ah` | `ABIHW` | `JP` to the hardware services |
| `C00Dh` | `ABIMAIN` | Address of the MAIN count, 1 or 2 |
| `C00Fh` | `ABIVOL` | `JP VOLSVC`: A = 0 mount drive C with container index E; 1 unmount drive C; 2 describe index E into the 32 bytes at HL, its drive byte the drive it is on now. A = 0, or FFh with nothing changed |
| `C012h` | `ABIGLCD` | `JP GLHOOK`: A = 1 `CRT:` or 3 `UC1:`, HL = a video driver's table of eight words, and `LINEBUF` back in HL; carry set and nothing changed if that mode has one, or with no matrix keyboard; HL = 0 drops it |
| `C015h` | `ABISVC` | `JP SVCREG`: the registry, below; C = 0 find, 1 enumerate |

`XMOVE` and `MOVE` are CP/M 3's, with its registers, reached through BDOS
function 50's selectors 29 and 25. `XMOVE`'s 0 is the
program's view below the BDOS entry at `(0006h)`, read at each call; its 1
is EXPAND 1 from `8000h` up to its low mark, read at each call. EXPAND 1 is
TEC-OS's own: `BF00h` its reserved page, `BE00h` free, `BD00h`
the command history, `BC00h` the block cache's table and `8000h–BBFFh` its
30 lines. Cold boot
sets the mark to `80h`, so every byte in bank 1 is refused. `MOVE` copies forward as `LDIR` does and returns `A = 0`, or
`A = FFh` with nothing copied when an end lies outside its region. A copy returns with the latch
and the interrupt state as it found them. Cold boot clears EXPAND 1, the
cache with it; its contents do not survive a reset, and warm boot leaves
them.

## The registry

`ABISVC` finds the records of the services in memory. `docs/services.md` sets out
the services and what each side may rely on.

| C | Arguments | Returns |
| --- | --- | --- |
| 0, find | DE = a record's name, 8 bytes padded with spaces; B = the least interface version | Carry clear: HL = its entry table, A = the generation. Carry set: none |
| 1, enumerate | B = an index from 0 | Carry clear: HL = that record (a link word, the name, the version, the table's address), A = the generation. Carry set: past the last |
| anything else | | Carry set |

Find returns the newest service's record when two publish one name. AF, BC, DE and
HL are destroyed; IX and IY are kept. It uses at most 8 bytes of the caller's
stack, its return address among them, and makes no BDOS or BIOS call, so it
is safe on any stack. Each walk stops after 256 records, so a program that
has overwritten a record can't loop it. A removal raises the generation by
one; it is 8 bits, so after 256 removals it repeats and a stale pointer
passes a comparison. There is no public removal: `UNLOAD` is the only way a service leaves.

## Calling the hardware services

A program checks for `"TNA"` at `ABITAB` and ABI major version 4 at
`ABIMAJ`, then calls `ABIHW` with the hardware service's number in C and arguments in
B, DE and HL. `abi.inc` names each number and status code. On return A holds the status, with Z set and carry clear on
success; results come back as each hardware service lists. IX, IY and the alternate
registers are preserved. A CP/M program that finds no signature is on
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

The consoles on the PICO9918 and the GLCD are drivers, `PICO.SVC` and `GLCD.SVC`,
below `(0006h)`. INIT calls `ABIGLCD` with A = 1 for `CRT:` or 3 for `UC1:` and HL
pointing at eight words: the routines in the terminal's order (put, get, clear to
the end of the line, restore, read a row, write a row), a routine for the page
functions, then a byte of columns and a byte of rows. The seventh word may be 0 on
a display that isn't `CRT:`, since only `CRT:` calls it, with A = 0 to show a finished
row move, 1 to begin a move of rows B to C and 2 to end one, and never while a
program has claimed the VDP. `CONSW` points the terminal's vector at the table
when it selects the mode, and the terminal then calls the routines directly, on the
caller's stack: a program on the CCP stack can call the BIOS's `CONOUT` in the 28
bytes it has. A program that pushes anything before calling the BIOS directly sets
up its own stack first. The routines run with the caller's interrupt state, so an
interrupt handler must not print through the console.

`ABIGLCD` returns `LINEBUF`'s address in HL, where the row routines read and write a
row, with carry clear. It returns carry set with nothing changed if that mode has a
table already, or with no matrix keyboard. HL = 0 drops the mode's table, with carry
clear, and the console is chosen again at its next call. A destroys; BC is kept.
It uses 2 bytes of the caller's stack.

Page zero's restart vectors at `0008h–003Fh` are left to programs, debuggers and
services. A warm boot, like a cold boot, puts seven zeros and a `RET`, or `EI; RETI`
at `0038h`, in each one that doesn't jump to a page at or above `PZTOP`'s, so an RST
through a vector a finished program left returns at once with the interrupt state
unchanged. `docs/services.md` gives a service's rules.

## The hardware services

| C | Hardware service | Arguments | Results | Stack | ROM |
| ---: | --- | --- | --- | ---: | ---: |
| — | Dispatcher, exits, table | | | 4 | 50 |
| 19 | `INFO` | — | `B` devices: bit 0 matrix keyboard, 1 PICO9918, 2 GLCD, 3 DS1302 clock, 4 PICO9918 claimed (`HWBCLM`), 7 a word of the ROM's, `PICO?` or `GLCD?`, on LCD row 3 (`HWBWRD`); `DE` ROM version; `L` console columns, `H` rows (0 for serial) | 6 | 24 |
| 20 | `DIGIT` | `HL` → 6 segment bytes, leftmost first | One scan, about 0.8 ms a digit, then all off | 4 | 26 |
| 21 | `LCD` | `B` = row 0-3, `HL` → 20 characters | The row written; row 3 also clears `HWBWRD` | 10 | 44 |
| 22 | `VIDEO` | `B` = 1 claim the PICO9918, 0 give it back | Status 2 without a PICO9918 | 10 | 81 |
| 23 | `TONE` | `B` = half period in units of 16 T-states, `DE` = half cycles | A square wave on the speaker; each half cycle is 16 × B + 51 T-states | 4 | 29 |
| 24 | `JOY` | — | `B` = joystick bits, 1 for each one pressed | 4 | 10 |
| 25 | `KEYS` | `HL` → 8-byte buffer | The 8 matrix rows, 1 for each key down | 4 | 15 |
| 26 | `PUTAT` | `D` = row, `E` = column, `B` = count, `HL` → characters | Written on the video console without moving the cursor, clipped to the screen; status 2 on serial, or while the PICO9918 is claimed and is the console | 22 | 68 |
| 27 | `RTC` | `B` = 0 read, 1 set; `HL` → 7 BCD bytes: seconds, minutes, hours, date, month, weekday, year | The DS1302 clock read or set; status 2 without a clock | 8 | 138 |
| | **Total** | | | | **485** |

Every other number, 0 to 18 and 28 to 255, returns status 1 with the other registers
as they came. Stack is the deepest measured use of the
caller's stack below the return address.

Notes:

- The digits and speaker are multiplexed or timed by the CPU, so a program
  calls `DIGIT` in its main loop.
- While the PICO9918 is claimed the console drops output to it, draws no
  cursor and does not flip pages, and the program may set any mode and use
  all of VRAM, through the ports or through `PICO.SVC`'s graphics entries
  (`docs/services.md`). The claim has no owner. Releasing it, or a warm boot,
  which releases a resident's claim too, restores the driver's text mode,
  font and page and clears the screen.
- `PUTAT` is a fast path for full-screen programs: through the driver's cell
  routine it costs about 425 T-states a cell along a row on `PICO.SVC` at 80
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
| The ROM table and the reset jump | 24 | 1 | Stays |
| Read-only data: messages, keywords, the jump table's source, geometries | 806 | 1, 2 | Stays |
| Cold and warm boot, the vectors | 546 | 1 | Stays |
| BIOS | 482 | 2 | Stays |
| Serial and matrix keyboard | 690 | 1, 2 | Stays |
| ANSI terminal | 971 | 2 | Stays |
| Video switch | 64 | 2 | Stays |
| PICO9918 text console and graphics | — | 1, 2 | Moved to `PICO.SVC`, `PICO40.SVC` and `PICO32.SVC`; the probe stays |
| PICO9918 probe | 32 | 1 | Stays |
| GLCD text console | — | 1, 2 | Moved to `GLCD.SVC`, a driver, loaded by `STARTUP.CMD` |
| Font, 96 characters | — | | Moved: each display driver carries its own copy, `drivers/font.asm`, and serial and the LCD need none |
| 20 × 4 LCD | 129 | 2 | Stays |
| SD driver | 818 | 1 | Stays |
| Container mount and checks | 1,390 | 1 | Stays |
| Diagnostics | 86 | 1 | Stays |
| CCP | 2,399 | 2 | Stays |
| BDOS | 3,909 | 2 | Stays |
| Hardware services | 467 | 3, 4 | Stays |
| `XMOVE` and `MOVE` | 228 | 3 | Stays |
| `ABIGLCD` and loading the display drivers | 167 | 2 | Stays |
| Block cache | 566 | 1, 2 | Stays: every read goes through it |
| Command history | 210 | 2 | Stays |
| PRL loader | 98 | 2 | Stays, for programs |
| Service loader, registry, `SERVICES` and startup | 744 | 2 | Stays |

Counted from the `debug80` build's symbol map: each row is one source file's span,
and the data row the block from `ROMDATA` to `ROMCODE`. The rows sum to the census's
14,826 bytes used.

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
| `TERM.COM`, `PROBE.COM` | Already on the starter card; `COPY` is built into the CCP |

## Next in the ROM

For the <!-- media: rom-free -->1,447<!-- end --> bytes left at the end of the ROM: a resident monitor with Intel HEX
loading. The integer arithmetic once planned here was settled by what calls
it: a 16 ÷ 16 divide (`DIV16`) is in the BDOS, where it splits record
numbers into track and sector, and `PUTDEC` uses it; a multiply, a 32 ÷ 16
divide and CRC-16 have no caller in the ROM and go in include files on the
card, beside floating point and drawing. A disassembler does not fit.
