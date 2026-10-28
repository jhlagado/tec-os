# ROM services

Status: **Built**, 2026-10-26. The entry at `FF0Bh` (ABI 1.1, unchanged in 2.0) has 19
services in `src/hwsvc.asm`, 755 bytes of ROM in all, and
`test/hwsvc.test.mjs` calls each one with its arguments in the registers and
measures its stack. `DEMO.COM` on the starter card shows them.

The ROM is 16 KiB. <!-- media: rom-space -->It holds 14,986 bytes (`debug80`) and has 1,398 free:
1,182 below the table at `FF00h`, where code can go, and 216 above it.<!-- end --> This
document sets out what earns a place in it, the entry point that
gives programs the TEC-1G's hardware, and what belongs on the card instead.

## The table at `FF00h`

Its layout is fixed; entries are only added, with the minor version raised.

| Address | Contents |
| --- | --- |
| `FF00h` | `"TNA"` signature |
| `FF03h` | ABI major version, 2 |
| `FF04h` | ABI minor version, 7 |
| `FF05h` | Native banks: 0 since ABI 2.0 |
| `FF06h` | `JP` to a routine that refuses every call: status 1, carry set (the native services until ABI 2.0) |
| `FF09h` | Address of the console size, columns then rows |
| `FF0Bh` | `JP` to the hardware services |
| `FF0Eh` | Address of the MAIN count, 1 or 2 (ABI 2.1) |
| `FF10h` | Address of the EXPAND count, always 2 since TEC-OS needs EXPAND 1 (ABI 2.2) |
| `FF12h` | `JP XMOVE`: B = destination, C = source, each 0 for the program's memory or 1 for EXPAND 1, which has no range, for the next `MOVE` (ABI 2.2) |
| `FF15h` | `JP MOVE`: HL = destination, DE = source, BC = count; A = 0, or FFh with nothing copied (ABI 2.2) |
| `FF18h` | Address of EXPAND 1's low mark, always 80h: no part of EXPAND 1 is a program's (ABI 2.3) |
| `FF1Ah` | `JP XCCP`: a nested CCP, back at `EXIT`; HL = `0100h` in, function 108's code out; any other HL refused with carry set (ABI 2.4) |
| `FF1Dh` | `JP XCMD`: as `XCCP`, but DE points at one command line (a length byte, then the text), run with no prompt (ABI 2.4) |
| `FF20h` | `JP VOLSVC`: A = 0 mount drive C with container index E; 1 unmount drive C; 2 describe index E into the 32 bytes at HL, its drive byte the drive it is on now. A = 0, or FFh with nothing changed (ABI 2.5) |
| `FF23h` | Address of the console font, 8 bytes a character from 20h, for the GLCD console (ABI 2.6) |
| `FF25h` | `JP GLHOOK`: HL = a video table, six words, for the GLCD console, and `LINEBUF` back in HL; carry set and nothing changed if a table is kept already; HL = 0 puts the console back to serial (ABI 2.7) |

`XMOVE` and `MOVE` are CP/M 3's, with its registers. `XMOVE`'s 0 is the
program's view below the BDOS entry at `(0006h)`, read at each call; its 1
is EXPAND 1 from `8000h` up to its low mark, read at each call. EXPAND 1 is
TEC-OS's own: `BF00h` its reserved page, `BE00h` the CCP's levels, `BD00h`
the command history, and `8000h–BCFFh` left for a block cache. Cold boot
sets the mark to `80h`, so every byte in bank 1 is refused. `MOVE` copies forward as `LDIR` does and returns `A = 0`, or
`A = FFh` with nothing copied when an end lies outside its region. A copy returns with the latch
and the interrupt state as it found them. Cold boot clears EXPAND 1; its
contents do not survive a reset, and warm boot leaves them.

## Calling the services

A program checks for `"TNA"` at `FF00h` and an ABI version of 2.0 or later,
or 1.1 or later (major at `FF03h`, minor at `FF04h`), then calls `FF0Bh` with the service number in C and arguments in A,
B, DE and HL. On return A holds the status, with Z set and carry clear on
success; results come back as each service lists. IX, IY and the alternate
registers are preserved. A CP/M program that finds no signature is on
another system and carries on without the TEC-1G's devices.

| Status | Meaning |
| ---: | --- |
| 0 | Success |
| 1 | No such service, or an argument out of range |
| 2 | The device is not fitted, or not the console |
| 3 | Nothing arrived in time |
| 4 | The card did not read |
| 5 | The PICO9918 is not claimed |

The rules that make the services safe for CP/M programs:

- **The caller's stack.** No service switches stacks or touches the TPA
  beyond the buffers it is given. The deepest takes 16 bytes of the caller's
  stack, counting the dispatcher but not the `CALL`.
- **Resident state only.** The services keep their state in the resident
  workspace: the claim flag, a saved argument and the random number seed,
  4 bytes in all.
- **Never the BDOS.** Services do not call the BDOS, so a program can call
  them from inside its own BDOS-heavy code without re-entry.
- **Port 01h stays safe.** Every service that writes port 01h holds bit 6,
  the serial transmit line, high.

## The GLCD console's table

The GLCD console is a resident, `GLCD.PRL`, below `(0006h)`. Its INIT calls
`FF25h` with HL pointing at six words, its routines in the terminal's
order: put, get, clear to the end of the line, restore, read a row, write a
row. `CONSW` points the terminal's vector at that table when it selects
`UC1:`, and the terminal then calls the routines directly, on the caller's
stack: a program on the CCP stack can call the BIOS's `CONOUT` in the 25
bytes it has. A program that pushes anything before calling the BIOS
directly sets up its own stack first. The routines run with the caller's
interrupt state and share their drawing counters, so an interrupt handler
must not print through the console. `FF25h` returns `LINEBUF`'s address in HL, where the row
routines read and write a row, or carry set if a table is kept already, as
when `GLCD.PRL` is loaded a second time; that copy then leaves the console
alone. Its REMOVE, in the copy that took the console, calls `FF25h` with
HL = 0, which drops the table and puts the console back to serial. The PRL loader takes
kind 1 only; kind 2, the driver kind of ABI 2.6 and before, is refused.

Page zero's restart vectors at `0008h–0037h` are left to programs and
debuggers. A warm boot, like a cold boot, puts seven zeros and a `RET` in
each one that does not jump into ROM, so an RST through a vector a finished
program left returns at once with the interrupt state unchanged.

## Services

| C | Service | Arguments | Results | Stack | ROM |
| ---: | --- | --- | --- | ---: | ---: |
| — | Dispatcher, exits, table | | | 4 | 75 |
| 0 | `INFO` | — | `B` devices: bit 0 matrix keyboard, 1 PICO9918, 2 GLCD, 3 DS1302 clock; `DE` ROM version; `L` console columns, `H` rows (0 for serial) | 6 | 20 |
| 1 | `DIGITS` | `HL` → 6 segment bytes, leftmost first | One scan, about 0.8 ms a digit, then all off | 4 | 26 |
| 2 | `HEXSEG` | `A` = 0-15 (the low four bits) | `B` = its segment pattern, MON3's layout | 4 | 29 |
| 3 | `LEDS` | `HL` → 8 rows of red, green, blue bytes | One scan of the 8 × 8 matrix, about 0.4 ms a row, then off | 4 | 31 |
| 4 | `LCDROW` | `B` = row 0-3, `HL` → 20 characters | The row written | 10 | 35 |
| 5 | `VIDEO` | `B` = 1 claim the PICO9918, 0 give it back | Status 2 without a PICO9918 | 8 | 65 |
| 6 | `TONE` | `B` = half period in units of 16 T-states, `DE` = half cycles | A square wave on the speaker; each half cycle is 16 × B + 59 T-states | 4 | 29 |
| 7 | `JOY` | — | `B` = joystick bits, 1 for each one pressed | 4 | 10 |
| 8 | `KEYS` | `HL` → 8-byte buffer | The 8 matrix rows, 1 for each key down | 4 | 15 |
| 9 | `SERIAL` | `B` = 0: send `A`. `B` = 1: wait up to `DE` ms | `B` = the byte received, or status 3 | 4 | 40 |
| 10 | `BLOCK` | `HL` → block number (4 bytes, least significant first), `DE` → 512-byte buffer | The raw card block, or status 4 | 8 | 21 |
| 11 | `DELAY` | `DE` = milliseconds | About 4,000 T-states a millisecond | 4 | 16 |
| 12 | `VREG` | `B` = register, `A` = value | Claimed PICO9918 register written | 4 | 26 |
| 13 | `VFILL` | `HL` = VRAM address, `DE` = count, `A` = value | Claimed PICO9918 VRAM filled | 4 | 23 |
| 14 | `VWRITE` | `HL` → VRAM address, RAM address, count (three words) | RAM copied to VRAM | 4 | 36 |
| 15 | `VREAD` | The same | VRAM copied to RAM | 4 | 22 |
| 16 | `PUTAT` | `D` = row, `E` = column, `B` = count, `HL` → characters | Written on the video console without moving the cursor, clipped to the screen; status 2 on serial or while claimed | 16 | 63 |
| 17 | `RANDOM` | — | `HL` = the next number from a 16-bit xorshift, period 65,535 | 4 | 30 |
| 18 | `RTC` | `B` = 0 read, 1 set; `HL` → 7 BCD bytes: seconds, minutes, hours, date, month, weekday, year | The DS1302 clock read or set; status 2 without a clock | 8 | 143 |
| | **Total** | | | | **755** |

Stack is the deepest measured use of the caller's stack below the return
address. The `VREG` row includes the claim check shared by services 12-15.

Notes:

- The digits, LEDs and speaker are multiplexed or timed by the CPU, so a
  program calls `DIGITS` and `LEDS` in its main loop.
- While the PICO9918 is claimed the console drops output to it, draws no
  cursor and does not flip pages, and the program may set any mode and use
  all of VRAM. Releasing it, or a warm boot, restores the 80-column text
  mode, font and page and clears the screen.
- `PUTAT` is a fast path for full-screen programs: it costs only the cell
  writes, against a BDOS call and the ANSI parser for each character. Edit
  stays a portable CP/M program and can use it when it finds the signature.
- `SERIAL` works whatever the console routing, at 4800 baud with eight bits,
  which is what a file-transfer program needs. All eight bits come through,
  NUL included.
- `BLOCK` reads only, into the caller's buffer; the BIOS's own buffer is not
  touched.
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

Everything else lives on the card: utilities as `.COM` files, and driver code
that programs share as ATOM include files.

## What the ROM holds today

| Part | Bytes | Rule | Verdict |
| --- | ---: | --- | --- |
| Vectors, cold and warm boot | 572 | 1 | Stays |
| BIOS | 452 | 2 | Stays |
| Serial and matrix keyboard | 789 | 1, 2 | Stays |
| ANSI terminal | 988 | 2 | Stays |
| Video switch | 104 | 2 | Stays |
| PICO9918 text console | 419 | 1, 2 | Stays |
| GLCD text console | — | 1, 2 | Moved to `GLCD.PRL`, a resident, loaded at the CCP's first entry |
| `FF25h` and loading the GLCD's resident | 128 | 2 | Stays |
| Font, 96 characters | 768 | 1 | Stays: the PICO9918 needs it before the card is read, and the GLCD resident reads it through `FF23h` |
| 20 × 4 LCD | 146 | 2 | Stays |
| SD driver | 795 | 1 | Stays |
| Container mount and checks | 1,192 | 1 | Stays |
| Format tables, diagnostics | 176 | 1 | Stays |
| CCP | 2,664 | 2 | Stays |
| CCP levels: `XCCP`, `XCMD`, `EXIT` and `UNLOAD` | 297 | 2 | Stays |
| PRL loader | 221 | 2 | Stays |
| Command history | 210 | 2 | Stays |
| BDOS | 3,736 | 2 | Stays |
| `XMOVE` and `MOVE` | 228 | 3 | Stays |
| Hardware services | 755 | 3, 4 | Stays |
| ABI table at `FF00h` | 40 | 1 | Stays |

Counted from the `debug80` build's symbol map at `7957c52`: the CCP, BDOS
and the regions as `docs/memory-map.md` gives them, the parts within the
console and services regions by source file. The rows for the GLCD's
resident, the CCP levels, the PRL loader, `XMOVE` and `MOVE` and the table
are counted again after drivers and the image save went.

Nothing in the ROM today belongs on the card. The native program services,
which had no user, were removed.

## Fixes found on the way

Writing the proposal for these services turned up three faults. All three are fixed (67 bytes
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

## Costs

| Resource | Before the services | After the services | Change |
| --- | ---: | ---: | ---: |
| ROM used | 13,079 | 13,868 | +789: the services and the console's claim hooks |
| ROM free | 3,305 | 2,516 | |
| TPA | 45,830 | 45,830 | none |
| Resident workspace | | | +4 bytes |
| Caller's stack per service | — | 16 bytes or less | measured by the tests |

The 8 × 8 LED scan and the clock driver were planned as include files on the
card; at 31 and 143 bytes they cost less in the ROM than in every program
that uses them.

## Next in the ROM

For the <!-- media: below-ff00 -->1,182<!-- end --> bytes left below `FF00h`: a resident monitor with Intel HEX
loading. The integer arithmetic once planned here was settled by what calls
it: a 16 ÷ 16 divide (`DIV16`) is in the BDOS, where it splits record
numbers into track and sector, and `PUTDEC` uses it; a multiply, a 32 ÷ 16
divide and CRC-16 have no caller in the ROM and go in include files on the
card, beside floating point and drawing. A disassembler does not fit.
