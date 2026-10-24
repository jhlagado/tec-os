# CP/M 2.2 compatibility

TEC-OS runs unmodified COM programs that use the documented CP/M 2.2
interfaces, size themselves from the BDOS address at `0006h` and fit the TPA
of 45,830 bytes (`0100h–B405h`). It reports version 2.2.

## BDOS functions

The BDOS is an adaptation of Portable CP/M, which implements functions 0–40
with their documented conventions; 38 and 39 return zero, and functions above
40 return zero. The probe in `test/programs/probe.asm` checks on TEC-OS:

| Area | Functions | Result |
| --- | --- | --- |
| Version | 12 | 2.2 reported |
| Create, write, close, reopen, read to end | 15, 16, 20, 21, 22 | Pass, across two extent boundaries |
| Random read and write | 33, 34 | Pass; neighbouring records in the same SD block unchanged |
| File size | 35 | Pass; a new extent's size is visible after close, as in CP/M 2.2 |
| Sparse random write | 34 | Pass |
| Rename, delete | 23, 19 | Pass |
| Wildcard search | 17 | Pass |
| User areas | 32 | Pass; files in one user area are invisible from another |
| Drive selection | 14, 25 | Pass |
| Read-only volume | 21 via `SAVE` | `Bdos Err On C: Bad Sector`; card unchanged |

## Command processor

`DIR`, `ERA`, `REN`, `SAVE`, `TYPE`, `USER` and drive changes, with the
syntax of the CP/M 2.2 CCP. `SUBMIT` and batch files are not supported. When
no `NAME.COM` exists the CCP runs `NAME.TNX`, a native program.

## Base page

Warm boot at `0000h`, BDOS vector at `0005h` (target `B406h`), IOBYTE at
`0003h` (stored, not acted on), user and drive at `0004h`, default FCBs at
`005Ch` and `006Ch`, command tail and default DMA at `0080h`, programs at
`0100h`. The BIOS jump table is page-aligned at `B500h` and reached through
`0001h`. A program may return by `RET`, by `JP 0000h` or by BDOS function 0.
The user number survives warm boot.

## Devices

| Device | Behaviour |
| --- | --- |
| Console | Serial and matrix keyboard in; serial and video out ([console.md](console.md)) |
| List, punch | Output discarded; `LISTST` reports ready |
| Reader | Returns `1Ah` (end of file) |
| IOBYTE | Stored, ignored |

## Applications

| Program | Version | Result | Notes |
| --- | --- | --- | --- |
| BASIE compiler and BLINK linker | Basie release disk, SHA-256 `7d70f1c0…` | Runs | Compiles and links `ADVENT.BSI`; the result runs after a power cycle |
| ATOM.COM | 0.3.7 | Refuses to run | Requires the BDOS at `E400h` or higher |
| EDIT.COM | 0.2.0 | Not run | Uses a fixed stack at `D800h–E3FFh`, above the TPA, and assumes 80 × 24 |

ATOM.COM and EDIT.COM assume a 64 KiB system. Programs written to the CP/M
convention, which take every limit from the word at `0006h`, run.

## Known incompatibilities

- **TPA ceiling.** Programs that assume a BDOS at a fixed high address, or
  more than 45,830 bytes of TPA, fail.
- **NMI and the default FCB.** The Z80 NMI vector `0066h` lies inside the
  default FCB at `005Ch` (its file-type field). While a CP/M program runs it
  owns those bytes, so a hex-keypad press during that time executes whatever
  the FCB holds. Do not press the hex keypad while a CP/M program runs.
  TEC-OS restores the vector at every warm boot. See decision D06.
- **BDOS internals.** Programs that patch the BDOS or BIOS code fail: both are
  in ROM. Programs that write to the BIOS jump table in RAM change only that
  copy; the BDOS calls the ROM table.
- **CCP overwrite.** Programs that expect to reclaim CCP memory below the BDOS
  gain nothing: the CCP is in ROM and its workspace is above the TPA.
- **Bit-banged serial.** Input that arrives while a program is busy and not
  polling the console is lost.
