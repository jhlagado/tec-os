# Acceptance evidence

Every result here comes from the Debug80 TEC-1G model (`@jhlagado/debug80-runtime`
0.2.0) or from host tests. **No result is physical-board evidence.** No
TEC-OS ROM has yet run on a real TEC-1G.

Evidence classes:

- **Host:** Node tests of the PC tools, no Z80 involved.
- **Emulator:** the ROM image running in the Debug80 TEC-1G model, with
  Debug80's own SD card, serial, latch, overlay, keypad, matrix keyboard,
  TMS9918 and expansion-bank models. The harness only types, presses keys,
  resets and reads memory, VRAM and the card image.
- **Board:** none yet.

Reproduce with `npm ci && npm run build && npm test`. The suite takes about
90 seconds.

## Milestones

| Milestone | Requirement | Test | Class | Result |
| --- | --- | --- | --- | --- |
| M0 | Hardware and source contract | [decisions.md](decisions.md) D01–D18 | — | Adopted, with open items O1–O4 |
| M1 | Reset through the overlay, overlay exit, fixed stack | `system`: cold boot; `nmi`: cold boot | Emulator | Pass: latch 01h, no write to ROM or under the overlay |
| M1 | Repeated cold and warm starts, reset from a non-default bank | `system`: reset from dirty latch ×4, ^C warm boot | Emulator | Pass |
| M1 | Diagnostic console without a card | `system`: no card | Emulator | Pass: error 01, retry works |
| M2 | Container round trip, geometry checks, corrupt and truncated input | `host-tools` | Host | Pass: 12 corruptions rejected |
| M2 | ROM rejects invalid containers | `system`: invalid container | Emulator | Pass: codes 21h, 25h, 28h |
| M2 | Block and byte addressed cards | `system`: standard-capacity card | Emulator | Pass |
| M3 | COM load, arguments, file create, read, write, close, directory | `system`: BDOS probe (16 checks) | Emulator | Pass |
| M3 | Partial SD block updates keep neighbouring records | probe T07 | Emulator | Pass |
| M3 | Persistence across reset and power loss | `system`: exchange; `qualification` | Emulator | Pass; RAM refilled with 76h |
| M3 | PC to TEC and TEC to PC, text and binary | `system`: exchange | Emulator + host | Pass |
| M3 | Read-only media | `system`: read-only volume | Emulator | Pass: error reported, card unchanged |
| M3 | Unmodified application saves a file that reopens after reset | `qualification`: BASIE | Emulator | Pass |
| M4 | Distinct bank contents, nested calls, bank copies | `native`: N04–N10 | Emulator | Pass |
| M4 | Fixed stack; bank, SP, return PC and interrupt state restored | `native`: N06–N08, N13 | Emulator | Pass |
| M4 | Errors leave state unchanged: bad bank, unreserved bank, ranges, zero length, depth | `native`: N07–N09, N12 | Emulator | Pass |
| M4 | Damaged stack guard detected, recovery path independent of the damaged stack | `native`: guard | Emulator | Pass |
| M4 | NMI during overlay exit and bank transitions | `nmi` | Emulator | Pass: hundreds of NMIs taken in each run |
| — | TMS9918 40 and 32 columns, ANSI subset, matrix keyboard, LCD status | `console` | Emulator | Pass |
| — | GLCD 21 × 8 console when no TMS9918 answers; DIR fitted to 40 and 21 columns | `console` | Emulator | Pass |
| — | TYPE and DIR pause per screen on 8 and 24 rows, count wrapped lines, stop on Q | `console` | Emulator | Pass |
| — | Web page: boot, TMS9918 text and Graphics I screens, matrix typing, TERM | Browser check, 2026-10-25 | Emulator in a browser | Pass; not automated |
| M5 | Reproducible image, size census, compatibility matrix, instructions | `npm run build`, `npm run media`; [memory-map.md](memory-map.md), [compatibility.md](compatibility.md) | Host | Done |

## Qualifying application

BASIE, the Basie compiler, with its BLINK linker and runtime library, taken
unmodified from the Basie release disk `BASIE.DSK` (SHA-256
`7d70f1c07dcf123db2affd86fe37153cb0c43ab3f4322e9481e8f8c114de2fe2`), imported
with `tecvol`'s 8-inch disk reader. On TEC-OS with the serial console:
`BASIE ADVENT` compiles `ADVENT.BSI`, chains to BLINK through its loader below
the BDOS entry, and writes `ADVENT.COM` and `ADVENT.LIN` (317 million
T-states, about 79 seconds at 4 MHz). After a power cycle with RAM refilled
with `HALT` opcodes, `ADVENT` runs, shows its opening room and quits back to
the CCP. The card verifies clean afterwards.

The test does not compare `ADVENT.COM` with an output made on another CP/M
system, because the copy in the Basie build directory comes from an older
compiler. That comparison is still to do.

## Measured costs

ROM, `debug80` profile: 11,892 of 16,384 bytes used, 4,492 free. The region
breakdown is in [memory-map.md](memory-map.md).

Classic TPA: 45,830 bytes (`0100h–B405h`). Resident workspace: `B400h–BFFFh`.

Stack high-water marks under PROBE, a 20,000-byte copy from A: to B:, DIR,
SAVE, TYPE, ERA and NATDEMO, with the TMS9918 console on (`test/stacks`):

| Stack | Reserved | Deepest use |
| --- | ---: | ---: |
| BDOS | 64 | 22 |
| CCP (also the default stack of transients that keep it) | 48 | 14 |
| BIOS (warm boot, diagnostics) | 64 | 2 |
| Native OS | 256 | 20 |
| Native application, 8 nested bank calls | 496 | 42 |

Timings at 4 MHz in the emulator: cold boot to the prompt about 1.8 million
T-states (0.45 s); one 512-byte SD block read about 330,000 T-states; serial
4800 baud.

## Not yet shown

- Any physical TEC-1G run: reset, latch decoding of bits 2–6, SD timing,
  serial timing, NMI from the real keypad, TMS9918 access timing.
- The V9938 console.
- A full-screen editor on TEC-OS: Edit 0.2.0 needs the TPA changes listed in
  [compatibility.md](compatibility.md).
