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
| M4 | Native banking | — | — | Withdrawn 2026-10-27: the native services are removed (D25) |
| M4 | NMI through cold boot and the overlay exit | `nmi` | Emulator | Pass: hundreds of NMIs taken in each run |
| — | TMS9918 40 and 32 columns, ANSI subset, matrix keyboard, LCD status | `console` | Emulator | Pass |
| — | GLCD 21 × 8 console when no TMS9918 answers; DIR fitted to 40 and 21 columns | `console` | Emulator | Pass |
| — | TYPE and DIR pause per screen on 8 and 24 rows, count wrapped lines, stop on Q | `console` | Emulator | Pass |
| — | Matrix arrow keys arrive as ANSI cursor sequences | `console` | Emulator | Pass |
| — | Warm boot restores the PICO9918 mode and font and the GLCD display after a program changes them | `devices` | Emulator | Pass |
| — | One console device by IOBYTE: PICO9918 or GLCD with the matrix keyboard, serial terminal without it; `CON` switches, a missing device falls back to serial, serial stays quiet on a video console | `console` | Emulator | Pass |
| — | Insert and delete characters and lines; the cursor shows while a program polls BDOS function 6 | `console` | Emulator | Pass |
| — | Scroll regions; a row move is built in the hidden VRAM page and shown in one step when the program asks for a key | `console` | Emulator | Pass; Edit scrolling rendered frame by frame shows no torn frame |
| — | Punch and reader carry 8-bit bytes over the serial port | `devices` | Emulator | Pass |
| — | The old native entry at `FF06h` refuses every call without touching memory | `devices` | Emulator | Pass: status 1, carry set |
| — | On the 96K paged memory: cold boot counts the low pages, page 1 gets page zero and is otherwise untouched, and an exit from low page 1 or U9 half 1 warm boots into page 0 and half 0 | `paged` | Emulator (harness option `paged`) | Pass |
| — | The workspace sized for the card: each allocation vector `DSM / 8 + 1` bytes, packed, the BDOS entry jump at an `xx06h` address below them; four 8 MiB volumes boot and pass the BDOS probe; `SAVE` reaches the entry's page and no further | `system` | Emulator | Pass |
| — | A program that replaces CONOUT, CONIN, CONST and WBOOT in the RAM BIOS table sees BDOS functions 2, 6 and 9 written and 1, 6 and 10 read through them, and `^C` and a BDOS disk error warm boot through its WBOOT | `hooks` | Emulator | Pass |
| — | PICO9918 80 × 24 console: registers, DIR in 6 columns, 80-character lines | `console` | Emulator (Debug80 TMS9918 model; VRAM checked, not pixels) | Pass |
| — | Edit edits, saves and reopens on the PICO9918 80 × 24 and GLCD 21 × 8, and on Triptych CP/M 2.2 80 × 24 | `edit` | Emulator | Pass with the shadow-screen Edit build |
| — | ATOM assembles a program on TEC-OS and it runs | `atom` | Emulator | Pass with the ATOM build that sizes itself from `0006h` |
| — | Web page: boot, TMS9918 text and Graphics I screens, matrix typing, TERM | Browser check, 2026-10-25 | Emulator in a browser | Pass; not automated |
| M5 | Reproducible image, size census, compatibility matrix, instructions | `npm run build`, `npm run media`; [memory-map.md](memory-map.md), [compatibility.md](compatibility.md) | Host | Done |

## Measured costs

ROM, `debug80` profile: 13,155 of 16,384 bytes used, 3,229 free: 2,989 below
the table at `FF00h`, where code goes, and 240 above it. The region
breakdown is in [memory-map.md](memory-map.md).

Classic TPA: 46,854 bytes (`0100h–B805h`) on the starter card, 46,086 with
four 8 MiB volumes. Resident workspace: from the BDOS entry jump to `BFFFh`.

Stack high-water marks from reset, with a keypad NMI taken at each new depth,
on the serial console, the PICO9918 and the GLCD, and on the diagnostic
console without a card (`test/stacks`):

| Stack | Reserved | Deepest use, NMI included |
| --- | ---: | ---: |
| BDOS | 54 | 40 |
| CCP (also the default stack of transients that keep it) | 27 | 14 |
| BIOS (cold and warm boot, diagnostics) | 38 | 28 |

Each reservation keeps at least a quarter free. The CCP's also gives a
transient on it CP/M's eight levels, its return word and an NMI, with a
quarter free.

The 19 hardware services at `FF0Bh` use at most 16 bytes of the caller's
stack (`PUTAT`, which hides the cursor through the video driver); most use 4
(`test/hwsvc`, figures in `build/hwsvc-stacks.json`). A transient on the CCP
stack has room for any of them beside CP/M's eight levels, or for the
deepest with 7 bytes of its own.

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
