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
| M0 | Hardware and source contract | [decisions.md](decisions.md) D01–D22 | — | Adopted, with open items O1–O4 |
| M1 | Reset through the overlay, overlay exit, fixed stack | `system`: cold boot; `nmi`: cold boot | Emulator | Pass: latch 01h, no write to ROM or under the overlay |
| M1 | Repeated cold and warm starts, reset from a non-default bank | `system`: reset from dirty latch ×4, ^C warm boot | Emulator | Pass |
| M1 | Missing RAM at `8000h–BFFFh` reported at boot | `system`: without RAM at 8000h | Emulator | Pass: serial message, then stops |
| M1 | Diagnostic console without a card | `system`: no card | Emulator | Pass: error 01, retry works |
| M2 | Container round trip, geometry checks, corrupt and truncated input | `host-tools` | Host | Pass: 12 corruptions rejected |
| M2 | ROM rejects invalid containers | `system`: invalid container | Emulator | Pass: codes 21h, 25h, 28h |
| M2 | Block and byte addressed cards | `system`: standard-capacity card | Emulator | Pass |
| M3 | COM load, arguments, file create, read, write, close, directory | `system`: BDOS probe (16 checks) | Emulator | Pass |
| M3 | Partial SD block updates keep neighbouring records | probe T07 | Emulator | Pass |
| M3 | Persistence across reset and power loss | `system`: exchange; `edit` | Emulator | Pass; RAM refilled with 76h |
| M3 | PC to TEC and TEC to PC, text and binary | `system`: exchange | Emulator + host | Pass |
| M3 | Read-only media | `system`: read-only volume | Emulator | Pass: error reported, card unchanged |
| M3 | Unmodified application saves a file that reopens after reset | `edit`: Edit saves, power cycle, reopens | Emulator | Pass |
| M4 | Distinct bank contents, nested calls, bank copies | `native`: N04–N10 | Emulator | Pass |
| M4 | Fixed stack; bank, SP, return PC and interrupt state restored | `native`: N06–N08, N13 | Emulator | Pass |
| M4 | Errors leave state unchanged: bad bank, unreserved bank, ranges, zero length, depth | `native`: N07–N09, N12 | Emulator | Pass |
| M4 | Damaged stack guard detected, recovery path independent of the damaged stack | `native`: guard | Emulator | Pass |
| M4 | NMI during overlay exit and bank transitions | `nmi` | Emulator | Pass: hundreds of NMIs taken in each run |
| — | TMS9918 40 and 32 columns, ANSI subset, matrix keyboard, LCD status | `console` | Emulator | Pass |
| — | GLCD 21 × 8 console when no TMS9918 answers; DIR fitted to 40 and 21 columns | `console` | Emulator | Pass |
| — | TYPE and DIR pause per screen on 8 and 24 rows, count wrapped lines, stop on Q | `console` | Emulator | Pass |
| — | Matrix arrow keys arrive as ANSI cursor sequences | `console` | Emulator | Pass |
| — | Warm boot restores the PICO9918 mode and font and the GLCD display after a program changes them | `devices` | Emulator | Pass |
| — | One console device by IOBYTE: PICO9918 or GLCD with the matrix keyboard, serial terminal without it; `CON` switches, a missing device falls back to serial, serial stays quiet on a video console | `console` | Emulator | Pass |
| — | Insert and delete characters and lines; the cursor shows while a program polls BDOS function 6 | `console` | Emulator | Pass |
| — | Scroll regions; a row move is built in the hidden VRAM page and shown in one step when the program asks for a key | `console` | Emulator | Pass; Edit scrolling rendered frame by frame shows no torn frame |
| — | Punch and reader carry 8-bit bytes over the serial port | `devices` | Emulator | Pass |
| M4 | A CP/M program calling the native entry is refused without touching its memory | `devices` | Emulator | Pass: status 0Bh, carry set |
| — | PICO9918 80 × 24 console: registers, DIR in 6 columns, 80-character lines | `console` | Emulator (Debug80 TMS9918 model; VRAM checked, not pixels) | Pass |
| — | Edit edits, saves and reopens on the PICO9918 80 × 24 and GLCD 21 × 8, and on Triptych CP/M 2.2 80 × 24 | `edit` | Emulator | Pass with the shadow-screen Edit build |
| — | ATOM assembles a program on TEC-OS and it runs | `atom` | Emulator | Pass with the ATOM build that sizes itself from `0006h` |
| — | Web page: boot, TMS9918 text and Graphics I screens, matrix typing, TERM | Browser check, 2026-10-25 | Emulator in a browser | Pass; not automated |
| M5 | Reproducible image, size census, compatibility matrix, instructions | `npm run build`, `npm run media`; [memory-map.md](memory-map.md), [compatibility.md](compatibility.md) | Host | Done |

## Measured costs

ROM, `debug80` profile: 13,906 of 16,384 bytes used, 2,478 free: 2,236 below
the table at `FF00h`, where code goes, and 242 above it. The region
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

The 19 hardware services at `FF0Bh` use at most 16 bytes of the caller's
stack (`PUTAT`, which hides the cursor through the video driver); most use 4
(`test/hwsvc`, figures in `build/hwsvc-stacks.json`). A transient on the CCP
stack has room for the deepest of them.

Edit on the 80 × 24 PICO9918 console, emulator time at 4 MHz for one
keystroke in a 20-line file (2026-10-25):

| Keystroke | Edit 0.2.0, console copied to serial | Shadow-screen Edit, one console device |
| --- | ---: | ---: |
| Cursor right or down | 278 ms | 23 ms |
| Insert a character near the start of a line | 518 ms | 58–68 ms |
| Move the view one line (scroll) | not measured | 129–139 ms, about 100 bytes sent, shown in one frame |

A scroll shifts Edit's cached rows and draws only the new line; TEC-OS moves
the rows in the hidden VRAM page and shows it whole.

Timings at 4 MHz in the emulator: cold boot to the prompt about 1.8 million
T-states (0.45 s); one 512-byte SD block read about 330,000 T-states; serial
4800 baud.

## Not yet shown

- Any physical TEC-1G run: reset, latch decoding of bits 2–6, SD timing,
  serial timing, NMI from the real keypad, TMS9918 access timing.
- The V9938 console.
