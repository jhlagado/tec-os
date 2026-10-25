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
syntax of the CP/M 2.2 CCP. `DIR`'s output is TEC-OS's own: `NAME.EXT`
columns that fit the display, then the file count and free space (decision
D19). `TYPE` and `DIR` pause with `[more]` when the screen fills. Programs
that parse DR's `DIR` layout will not find it. `SUBMIT` and batch files are not supported. When
no `NAME.COM` exists the CCP runs `NAME.TNX`, a native program.

## Base page

Warm boot at `0000h`, BDOS vector at `0005h` (target `B406h`), IOBYTE at
`0003h` (stored, not acted on), user and drive at `0004h`, default FCBs at
`005Ch` and `006Ch`, command tail and default DMA at `0080h`, programs at
`0100h`. The BIOS jump table is page-aligned at `B500h` and reached through
`0001h`. A program may return by `RET`, by `JP 0000h` or by BDOS function 0.
The user number survives warm boot.

Warm boot puts the video display back into its console mode: on the
PICO9918 it reloads registers 0–7 and the font, and on the GLCD it turns the
display and graphics back on. What a program left on the screen stays until
the console writes over it. The restore costs 143,044 T-states (36 ms) per
warm boot on the PICO9918 and 1,447 on the GLCD.

## Devices

| Device | Behaviour |
| --- | --- |
| Console | Serial and matrix keyboard in; serial and video out ([console.md](console.md)) |
| List | Output discarded; `LISTST` reports ready |
| Punch | The serial port, 8 bits, whatever the console routing |
| Reader | The serial port, 8 bits; waits for a byte. A byte the console has already taken stays with the console |
| IOBYTE | Stored, ignored |

## Applications

| Program | Version | Result | Notes |
| --- | --- | --- | --- |
| BASIE compiler and BLINK linker | Basie release disk, SHA-256 `7d70f1c0…` | Runs | Compiles and links `ADVENT.BSI`; the result runs after a power cycle |
| Edit | build with the screen configuration block (`ECFG` at `0103h`) | Runs | Edits, saves and reopens a file at 40 × 24 (TMS9918) and 21 × 8 (GLCD), sizing itself from `FF09h`; also verified on Triptych's CP/M 2.2 at 80 × 24 (`test/edit.test.mjs`) |
| ATOM.COM | build that sizes its workspace from `0006h` | Runs | Assembles `HELLO.ASM` into `HELLO.COM` on TEC-OS, which then runs (`test/atom.test.mjs`); needs the BDOS at `78C4h` or higher |
| ATOM.COM | 0.3.7 | Refuses to run | Requires the BDOS at `E400h` or higher |
| EDIT.COM | 0.2.0 without the screen configuration | Not run | Fixed stack at `D800h–E3FFh`, above the TPA, and assumes 80 × 24 |

Released ATOM.COM 0.3.7 and Edit 0.2.0 assume a 64 KiB system; their newer
builds take every limit from the word at `0006h`, as CP/M programs should,
and run.

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
  polling the console is lost. Keys typed while the BDOS is printing are kept
  for the next read, as in CP/M 2.2.
