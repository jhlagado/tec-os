# ROM services

Status: **Proposed**, 2026-10-25. Nothing here is built yet. Sizes marked
"est." are estimates; the others come from the `debug80` build census.

The ROM is 16 KiB. It holds 12,869 bytes today and has 3,515 free. This
document sets out what earns a place in it, adds one entry point that gives
programs the TEC-1G's hardware, and lists what belongs on the card instead.

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
| Vectors, cold and warm boot | 461 | 1 | Stays |
| BIOS | 379 | 2 | Stays |
| Serial and matrix keyboard | 598 | 1, 2 | Stays |
| ANSI terminal | 579 | 2 | Stays |
| Video switch | 60 | 2 | Stays |
| PICO9918 text console | 292 | 1, 2 | Stays |
| GLCD text console | 472 | 1, 2 | Stays: the console when no video card answers |
| Font, 96 characters | 768 | 1 | Stays: both consoles need it before the card is read |
| 20 × 4 LCD | 152 | 2 | Stays |
| SD driver | 554 | 1 | Stays |
| Container mount and checks | 757 | 1 | Stays |
| Format tables, diagnostics | 176 | 1 | Stays |
| CCP | 2,166 | 2 | Stays |
| BDOS | 3,491 | 2 | Stays |
| Native ABI: banks, copies, calls, loader | 1,132 | — | Open decision O7 |

Nothing in the ROM today belongs on the card. The services the TEC-1G's
other hardware needs are missing instead, and the native ABI is the only part
without a current user.

## One entry point for the hardware

The native ABI table at `FF00h` grows one field. Its minor version goes from
0 to 1, so ABI 1 programs keep working.

| Address | Contents |
| --- | --- |
| `FF00h` | `"TNA"` signature |
| `FF03h` | ABI major version, 1 |
| `FF04h` | ABI minor version, **1** |
| `FF05h` | Native bank count |
| `FF06h` | `JP NATSVC`: native services (native programs only) |
| `FF09h` | Address of the console size, columns then rows |
| **`FF0Bh`** | **`JP HWSVC`: hardware services (any program)** |

A program checks for `"TNA"` at `FF00h` and a minor version of at least 1,
then calls `FF0Bh` with the service number in C and arguments in A, B, DE and
HL. On return A holds a status with Z set on success, and results come back
as each service documents. IX, IY and the alternate registers are preserved.

The rules that make it safe for CP/M programs:

- **The caller's stack.** No service switches stacks or touches the TPA.
  Each service has a documented stack use, at most 16 bytes (est.), measured
  by the test suite the same way the BDOS stack is.
- **Resident state only.** Services keep their state in the resident
  workspace and page zero's OS block, never in program memory.
- **Interrupt state kept.** A service that needs exact timing (tones, serial
  bits) disables interrupts and restores the caller's state on return.
- **Never the BDOS.** Services do not call the BDOS, so a program can call
  them from inside its own BDOS-heavy code without re-entry.

A CP/M program that finds no signature is on another system and carries on
without the TEC-1G's devices.

### Services

| C | Service | What it does | Rule | ROM bytes (est.) |
| ---: | --- | --- | --- | ---: |
| — | Dispatcher and table | | | 40 |
| 0 | `INFO` | Devices present (PICO9918, GLCD, card mounted), ROM version, console size | 4 | 25 |
| 1 | `CAPS` | Read or set the caps-lock bit; the OS keeps the rest of the latch | 3 | 20 |
| 2 | `TONE` | Square wave on the speaker for a period and count, serial line held idle | 3 | 35 |
| 3 | `DIGITS` | One multiplex pass of the six 7-segment digits from a 6-byte buffer, serial line held idle | 3 | 40 |
| 4 | `JOY` | Read the joystick (port FEh with A11 low) | 4 | 10 |
| 5 | `KEYS` | Raw matrix key state for games: which keys are down now, not characters | 2, 3 | 25 |
| 6 | `LCDROW` | Write a 20-character row to the 20 × 4 LCD | 2 | 10 |
| 7 | `VIDEO` | Claim the PICO9918 for graphics, or give it back; console output goes to serial only while claimed, and warm boot restores the text screen | 2, 3 | 35 |
| 8 | `PUTAT` | Write a run of characters at a row and column with no ANSI parsing | 2 | 40 |
| 9 | `SERIAL` | Send a byte, or wait a set time for one, whatever the console routing | 2, 3 | 35 |
| 10 | `BLOCK` | Read one raw 512-byte card block | 1 | 25 |
| 11 | `DELAY` | Wait a number of milliseconds at 4 MHz | 4 | 15 |
| | **Total** | | | **about 370** |

Notes:

- `DIGITS` and `TONE` exist to keep port 01h bit 6 high. That is the reason
  they are in the ROM; the 7-segment character table (96 bytes) is not, and
  goes in an include file.
- `PUTAT` is an optional fast path for full-screen programs. Edit stays a
  portable CP/M program that works through the BDOS, and can use `PUTAT`
  when it finds the signature. Through the BDOS each character costs the
  BDOS call plus the ANSI parser; `PUTAT` costs only the cell write (1,029
  T-states on the PICO9918).
- `SERIAL` is what a file-transfer program needs on real hardware before
  card utilities exist. The BIOS punch and reader devices are now the
  serial port too, so `PIP PUN:=FILE` sends a file.
- `BLOCK` reads only. A card backup or verify tool needs reads. Writes to raw
  blocks bypass the volume rules and stay out until a tool needs them.
- `VIDEO` builds on the warm-boot restore: once a program has claimed the
  display, console output stays off the screen until the claim ends.

## Fixes found on the way

Writing this proposal turned up three faults. All three are fixed (67 bytes
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
| `LED8X8.ASM` | Multiplex scan of the 8 × 8 RGB matrix (ports 05h, 06h, F8h, F9h) | Shares nothing with the OS |
| `DS1302.ASM` | Real-time clock on the GPIO card (port FCh) | An add-on; CP/M 2.2 keeps no dates |
| `GLCDGFX.ASM` | GLCD pixels, lines and boxes | The OS uses the GLCD only as text |
| `VDPGFX.ASM` | PICO9918 graphics modes and sprites, after `VIDEO` claims the card | The OS uses only text modes |

Programs:

| Program | Job |
| --- | --- |
| `TIME.COM` | Read and set the real-time clock |
| `XFER.COM` | Send and receive files over the serial port with checksums |
| `CARDINFO.COM` | Show the container and volumes from raw card blocks |
| `TUNE.COM`, `LEDS.COM`, `JOY.COM` | Speaker, LED and joystick tests and demos |
| `TERM.COM`, `COPY.COM`, `PROBE.COM` | Already on the starter card |

## Costs

| Resource | Today | After | Change |
| --- | ---: | ---: | ---: |
| ROM used | 12,869 | about 13,240 | +370 (est.) |
| ROM free | 3,515 | about 3,140 | |
| TPA | 45,830 | 45,830 | none |
| Resident workspace | | | +4 bytes (est.): video claim, serial timeout |
| Caller's stack per service | — | 16 bytes or less (est.) | measured by the tests |

The TPA does not change: the services' state fits in the existing resident
workspace page.

## Options I rejected

- **MON3's API.** MON3 programs call through `RST 10h` and keep state in
  RAM at `0800h–0FFFh` (the clock buffer is at `0900h`). Under CP/M both
  belong to the program: page zero's restart vectors are left to programs and
  debuggers, and `0100h` up is the TPA. MON3's list also carries its own UI
  (menus, parameter entry, disassembly), which is application code.
- **Extra BIOS jump-table entries.** Many CP/M 2.2 vendors added entries
  after `SECTRAN`. A program cannot tell whether they exist without a
  signature, and the RAM copy of the table would grow. The `FF00h` table
  already has a signature and a version and sits at a fixed ROM address.
- **A ROM in `8000h–BFFFh` for resident tools.** Rejected in D22.

## Open decisions

| ID | Open item |
| --- | --- |
| O7 | Keep the native bank services (1,132 bytes) while banking waits for its own design, or take them out and get the space back until then. My recommendation: keep them unchanged and add nothing, because the specification requires the native ABI and the tests prove it. |
| O8 | Whether `BLOCK` should ever write. |
| O9 | Whether `KEYS` reports the whole matrix or one row per call. |
