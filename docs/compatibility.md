# CP/M 2.2 compatibility

TEC-OS runs unmodified COM programs that use the documented CP/M 2.2
interfaces, size themselves from the BDOS address at `0006h` and fit the TPA:
46,854 bytes (`0100h–B805h`) on the starter card, and at least 46,086 on any
card, since cold boot places the BDOS entry below the allocation vectors of
the volumes mounted. It reports version 2.2.

## BDOS functions

The BDOS is an adaptation of Portable CP/M, which implements functions 0–40
with their documented conventions; 38 and 39 return zero, and functions above
40 return zero, except 50 and 108. Function 50 is CP/M 3's direct BIOS call: `DE`
points at the BIOSPB (function, A, BC, DE, HL). Functions 0–16 go through
the RAM BIOS table, so hooks apply; 25 is `MOVE` and 29 `XMOVE`, for copies
to and from EXPAND 1 (see rom-services.md); any other, `SELMEM` (27) among them,
returns `A = FFh`. Function 108 is CP/M 3's program return code: `DE =
FFFFh` gets it into `HL`, any other `DE` sets it; one code serves every
program, and it is 0 after a reset. Function 12 still reports 2.2. The probe in `test/programs/probe.asm` checks on TEC-OS:

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
columns that fit the display, then the file count and free space. `TYPE`
and `DIR` pause with `[more]` when the screen fills. Programs that parse
DR's `DIR` layout will not find it. `SUBMIT` and batch files are not
supported. `COPY SOURCE DEST` is a TEC-OS built-in, and so are these:

- `CCP` starts a nested command processor; `EXIT` returns to the level that
  started it, with that level's drive, user and warm-boot entry back. Levels
  nest six deep.
- `UNLOAD` removes the lowest resident.

A program can shell out the same way, through `FF1Ah` (an interactive
nested CCP) or `FF1Dh` (one command line, run with no prompt), passing the
end of its own image in HL. TEC-OS keeps that much of the TPA in EXPAND 1
while the nested level runs, puts it back at `EXIT` with the program's
stack, drive and user, and returns the last program's BDOS function 108
code in HL. Page zero is rebuilt by the nested level: a program keeps for
itself whatever it needs from the default FCBs and the command tail.

A command runs `NAME.COM`; when there is no `NAME.COM`, it runs `NAME.PRL`,
a relocatable file in Digital Research's PRL format. A PRL that begins with
TEC-OS's module header (`"TNM"`, a version and a kind) is installed rather
than run:

- **A resident** goes in whole pages just below the BDOS entry, and the
  word at `0006h` moves down to the jump at its offset 6, which leads on to
  the old entry; warm boot keeps it there. Programs that size themselves
  from `0006h` never reach it. Residents are removed last in, first out,
  and a reset clears them.
- **A driver** goes into EXPAND 1, below its low mark.

Any other PRL is a program, loaded at `0100h` as its `.COM` would be.

## Base page

Warm boot at `0000h`, BDOS vector at `0005h` (target `B806h` on the starter card, always an
`xx06h` address), IOBYTE at
`0003h` (stored, not acted on), user and drive at `0004h`, default FCBs at
`005Ch` and `006Ch`, command tail and default DMA at `0080h`, programs at
`0100h`. The BIOS jump table is at `BF00h`, the top page of EXPAND 0, and
reached through `0001h`. The BDOS calls the BIOS through it, as CP/M 2.2
does, so a program that replaces an entry there sees the BDOS's own calls,
its console output, its console reads and the warm boot after `^C` or a disk
error. Cold boot builds the table and warm boot leaves it alone, so a
replaced entry stays until reset. A program that damages the table can stop
warm boot working; reset rebuilds it. A program may return by `RET`, by `JP 0000h` or by BDOS function 0.
The user number survives warm boot.

Warm boot puts the video display back into its console mode: on the
PICO9918 it reloads registers 0–7 and the font, and on the GLCD it turns the
display and graphics back on. What a program left on the screen stays until
the console writes over it. The restore costs 143,044 T-states (36 ms) per
warm boot on the PICO9918 and 1,447 on the GLCD.

## Devices

| Device | Behaviour |
| --- | --- |
| Console | One device chosen by the IOBYTE `CON:` field: serial terminal, PICO9918 with the matrix keyboard, batch, or GLCD with the matrix keyboard ([console.md](console.md)) |
| List | Output discarded; `LISTST` reports ready |
| Punch | The serial port, 8 bits, whatever the console routing |
| Reader | The serial port, 8 bits; waits for a byte. A byte the console has already taken stays with the console |
| IOBYTE | `CON:` field selects the console; the other fields are stored and ignored |

## Applications

| Program | Version | Result | Notes |
| --- | --- | --- | --- |
| Edit | build with the screen configuration block (`ECFG` at `0103h`) | Runs | Edits, saves and reopens a file at 40 × 24 (TMS9918) and 21 × 8 (GLCD), sizing itself from `FF09h`; also verified on Triptych's CP/M 2.2 at 80 × 24 (`test/edit.test.mjs`) |
| ATOM.COM | build that sizes its workspace from `0006h` | Runs | Assembles `HELLO.ASM` into `HELLO.COM` on TEC-OS, which then runs (`test/atom.test.mjs`); needs the BDOS at `78C4h` or higher |
| ATOM.COM | 0.3.7 | Refuses to run | Requires the BDOS at `E400h` or higher |
| EDIT.COM | 0.2.0 without the screen configuration | Not run | Fixed stack at `D800h–E3FFh`, above the TPA, and assumes 80 × 24 |

Released ATOM.COM 0.3.7 and Edit 0.2.0 assume a 64 KiB system; their newer
builds take every limit from the word at `0006h`, as CP/M programs should,
and run.

## Known incompatibilities

- **TPA ceiling.** Programs that assume a BDOS at a fixed high address, or
  more than 46,086 bytes of TPA, may fail; how much a card gives depends on
  its volumes.
- **BDOS internals.** Programs that patch the BDOS or BIOS code fail: both are
  in ROM. The BIOS jump table in RAM is the place to hook. The one BDOS call
  that does not go through it is the check for `^S` while the BDOS writes,
  which calls the ROM's console status directly so that it draws no cursor.
- **CCP overwrite.** Programs that expect to reclaim CCP memory below the BDOS
  gain nothing: the CCP is in ROM and its workspace is above the TPA.
- **Bit-banged serial.** Input that arrives while a program is busy and not
  polling the console is lost. Keys typed while the BDOS is printing are kept
  for the next read, as in CP/M 2.2.
