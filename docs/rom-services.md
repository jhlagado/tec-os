# ROM services

Status: **Built**, 2026-10-26. The hardware services' entry, `ABIHW` at
`C00Ah`, has 19 services in `src/hwsvc.asm`, 766 bytes of ROM in all, and
`test/hwsvc.test.mjs` calls each one with its arguments in the registers and
measures its stack. `DEMO.COM` on the starter card shows them.

The ROM is 16 KiB. <!-- media: rom-space -->It holds 15,652 bytes (`debug80`) and has 732 free,
in one gap after the code at the end of the ROM.<!-- end --> This
document sets out what earns a place in it, the entry point that
gives programs the TEC-1G's hardware, and what belongs on the card instead.

## The ROM's layout

| Addresses | Contents |
| --- | --- |
| `C000h–C002h` | `JP COLD`: at reset the CPU runs it through the boot overlay at `0000h` |
| `C003h` | The table, below: the one fixed address in the ROM |
| after the table | One block of read-only data: messages, the font, the geometry and format tables, the CCP's and the BDOS's tables, and the BIOS jump table that cold boot copies to RAM |
| after the data | One block of code |
| to `FFFFh` | The free space, in one gap |

Only `C003h` is fixed. The data and code move when an entry is added to the
table or the code changes; programs reach the ROM only through the table.
The build checks this order from the symbol table on every profile, and
refuses any `.asm` file that names an address of the old table at `FF00h`.

## The table at `C003h`

ABI 3.0. Its layout is fixed; entries are only added, at the end, with the
minor version raised. `src/abi.inc`, published in `dist/` as `abi.inc`,
gives each entry's address under the name below, and the build checks it
against the ROM. ABI 3.0 keeps ABI 2.7's entries in the same order, less
the native banks (`FF05h`), the native services' entry (`FF06h`) and the
EXPAND count (`FF10h`, always 2).

| Address | Name | Contents |
| --- | --- | --- |
| `C003h` | `ABITAB` | `"TNA"` signature |
| `C006h` | `ABIMAJ` | ABI major version, 3 |
| `C007h` | `ABIMIN` | ABI minor version, 0 |
| `C008h` | `ABIVID` | Address of the console size, columns then rows |
| `C00Ah` | `ABIHW` | `JP` to the hardware services |
| `C00Dh` | `ABIMAIN` | Address of the MAIN count, 1 or 2 |
| `C00Fh` | `ABIXMOV` | `JP XMOVE`: B = destination, C = source, each 0 for the program's memory or 1 for EXPAND 1, which has no range, for the next `MOVE` |
| `C012h` | `ABIMOVE` | `JP MOVE`: HL = destination, DE = source, BC = count; A = 0, or FFh with nothing copied |
| `C015h` | `ABIXMRK` | Address of EXPAND 1's low mark, always 80h: no part of EXPAND 1 is a program's |
| `C017h` | `ABIXCCP` | `JP XCCP`: a nested CCP, back at `EXIT`; HL = `0100h` in, function 108's code out; any other HL refused with carry set |
| `C01Ah` | `ABIXCMD` | `JP XCMD`: as `XCCP`, but DE points at one command line (a length byte, then the text), run with no prompt |
| `C01Dh` | `ABIVOL` | `JP VOLSVC`: A = 0 mount drive C with container index E; 1 unmount drive C; 2 describe index E into the 32 bytes at HL, its drive byte the drive it is on now. A = 0, or FFh with nothing changed |
| `C020h` | `ABIFONT` | Address of the console font, 8 bytes a character from 20h, for the GLCD console |
| `C022h` | `ABIGLCD` | `JP GLHOOK`: HL = a video table, six words, for the GLCD console, and `LINEBUF` back in HL; carry set and nothing changed if a table is kept already; HL = 0 puts the console back to serial |

`XMOVE` and `MOVE` are CP/M 3's, with its registers. `XMOVE`'s 0 is the
program's view below the BDOS entry at `(0006h)`, read at each call; its 1
is EXPAND 1 from `8000h` up to its low mark, read at each call. EXPAND 1 is
TEC-OS's own: `BF00h` its reserved page, `BE00h` the CCP's levels, `BD00h`
the command history, `BC00h` the block cache's table and `8000h–BBFFh` its
30 lines. Cold boot
sets the mark to `80h`, so every byte in bank 1 is refused. `MOVE` copies forward as `LDIR` does and returns `A = 0`, or
`A = FFh` with nothing copied when an end lies outside its region. A copy returns with the latch
and the interrupt state as it found them. Cold boot clears EXPAND 1, the
cache with it; its contents do not survive a reset, and warm boot leaves
them.

## Calling the services

A program checks for `"TNA"` at `ABITAB` and ABI major version 3 at
`ABIMAJ`, then calls `ABIHW` with the service number in C and arguments in A,
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
`ABIGLCD` with HL pointing at six words, its routines in the terminal's
order: put, get, clear to the end of the line, restore, read a row, write a
row. `CONSW` points the terminal's vector at that table when it selects
`UC1:`, and the terminal then calls the routines directly, on the caller's
stack: a program on the CCP stack can call the BIOS's `CONOUT` in the 25
bytes it has. A program that pushes anything before calling the BIOS
directly sets up its own stack first. The routines run with the caller's
interrupt state and share their drawing counters, so an interrupt handler
must not print through the console. `ABIGLCD` returns `LINEBUF`'s address in HL, where the row
routines read and write a row, or carry set if a table is kept already, as
when `GLCD.PRL` is loaded a second time; that copy then leaves the console
alone. Its REMOVE, in the copy that took the console, calls `ABIGLCD` with
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
| 10 | `BLOCK` | `HL` → block number (4 bytes, least significant first), `DE` → 512-byte buffer | The card block, from the cache if it holds it, or status 4 | 10 | 32 |
| 11 | `DELAY` | `DE` = milliseconds | About 4,000 T-states a millisecond | 4 | 16 |
| 12 | `VREG` | `B` = register, `A` = value | Claimed PICO9918 register written | 4 | 26 |
| 13 | `VFILL` | `HL` = VRAM address, `DE` = count, `A` = value | Claimed PICO9918 VRAM filled | 4 | 23 |
| 14 | `VWRITE` | `HL` → VRAM address, RAM address, count (three words) | RAM copied to VRAM | 4 | 36 |
| 15 | `VREAD` | The same | VRAM copied to RAM | 4 | 22 |
| 16 | `PUTAT` | `D` = row, `E` = column, `B` = count, `HL` → characters | Written on the video console without moving the cursor, clipped to the screen; status 2 on serial or while claimed | 16 | 63 |
| 17 | `RANDOM` | — | `HL` = the next number from a 16-bit xorshift, period 65,535 | 4 | 30 |
| 18 | `RTC` | `B` = 0 read, 1 set; `HL` → 7 BCD bytes: seconds, minutes, hours, date, month, weekday, year | The DS1302 clock read or set; status 2 without a clock | 8 | 143 |
| | **Total** | | | | **766** |

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
  touched. A block the cache holds comes from the cache, so a block written
  behind and not yet on the card reads as TEC-OS has it.
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
| `ABIGLCD` and loading the GLCD's resident | 128 | 2 | Stays |
| Font, 96 characters | 768 | 1 | Stays: the PICO9918 needs it before the card is read, and the GLCD resident reads it through `ABIFONT` |
| 20 × 4 LCD | 146 | 2 | Stays |
| SD driver | 795 | 1 | Stays |
| Container mount and checks | 1,192 | 1 | Stays |
| Format tables, diagnostics | 176 | 1 | Stays |
| CCP | 2,664 | 2 | Stays |
| CCP levels: `XCCP`, `XCMD`, `EXIT` and `UNLOAD` | 297 | 2 | Stays |
| PRL loader | 221 | 2 | Stays |
| Command history | 210 | 2 | Stays |
| Block cache | 591 | 1, 2 | Stays: every read goes through it |
| BDOS | 3,736 | 2 | Stays |
| `XMOVE` and `MOVE` | 228 | 3 | Stays |
| Hardware services | 766 | 3, 4 | Stays |
| The table at `C003h` and the reset jump | 37 | 1 | Stays |

Counted from the `debug80` build's symbol map at `7957c52`: the CCP, BDOS
and the regions as `docs/memory-map.md` gives them, the parts within the
console and services regions by source file. The memory map now gives the
ROM as its five blocks instead. The rows for the GLCD's
resident, the CCP levels, the PRL loader, `XMOVE` and `MOVE` are counted
again after drivers and the image save went, the block cache's at its
build, and the table's with the reset jump at the compact layout.

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

For the <!-- media: rom-free -->732<!-- end --> bytes left at the end of the ROM: a resident monitor with Intel HEX
loading. The integer arithmetic once planned here was settled by what calls
it: a 16 ÷ 16 divide (`DIV16`) is in the BDOS, where it splits record
numbers into track and sector, and `PUTDEC` uses it; a multiply, a 32 ÷ 16
divide and CRC-16 have no caller in the ROM and go in include files on the
card, beside floating point and drawing. A disassembler does not fit.
