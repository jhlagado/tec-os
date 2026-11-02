# CP/M 2.2 compatibility

TEC-OS runs unmodified COM programs that use the documented CP/M 2.2
interfaces, size themselves from the BDOS address at `0006h` and fit the TPA:
46,854 bytes (`0100h–B805h`) on the starter card, and at least 46,086 on any
card, since cold boot places the BDOS entry below the allocation vectors of
the volumes mounted. A display's driver takes more: 1,536 bytes for the PICO9918
or the GLCD, leaving 45,318 on the starter card and 44,550 with four 8 MiB
volumes. A board with both displays that installs both with `CON UC1` gives up
3,072 bytes, 43,782 on the starter card and 43,014 with four. It reports
version 2.2.

## BDOS functions

The BDOS is an adaptation of Portable CP/M, which implements functions 0–40
with their documented conventions; 38 and 39 return zero, and functions above
40 return zero, except 47, 50 and 108. Function 50 is CP/M 3's direct BIOS call: `DE`
points at the BIOSPB (function, A, BC, DE, HL). Functions 0–16 go through
the RAM BIOS table, so hooks apply; 25 is `MOVE` and 29 `XMOVE`, CP/M 3's
copies, which refuse every byte in EXPAND 1 (see rom-services.md); any other, `SELMEM` (27) among them,
returns `A = FFh`. Function 108 is CP/M 3's program return code: `DE =
FFFFh` gets it into `HL`, any other `DE` sets it; one code serves every
program, and it is 0 after a reset. The CCP clears it as it takes each
command and sets it to FF00h when a command isn't found, won't load or is a
built-in that fails. Function 47 is TEC-OS's chain, from CP/M 3's: the
command at the DMA address, ended by a 0 within 128 bytes, replaces what is
left of the CCP's line and the program ends by warm boot; a string with no 0
there, or holding a CR or LF, returns `A = FFh` and the program goes on. `E`
is ignored. Function 12 still reports 2.2. The probe in `test/programs/probe.asm` checks on TEC-OS:

| Area | Functions | Result |
| --- | --- | --- |
| Version | 12 | 2.2 reported |
| Create, write, close, reopen, read to end | 15, 16, 20, 21, 22 | Pass, across two extent boundaries |
| Random read and write | 33, 34 | Pass; neighbouring records in the same SD block unchanged, written through or behind |
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
supported. A line of up to 127 characters, typed, from `STARTUP.CMD` or from
function 47, is split at each `!`, and what is left of it runs after each
program's warm boot, before any startup line; a piece that starts with `:`
runs only if the last command's code is not FF00h to FFFEh, and otherwise
the rest of the line is dropped. ^C at a program's line input, a BDOS
error's exit, a write lost at warm boot and a reset drop it too. These are TEC-OS's own rules, taken
from CP/M 3's CCP. `COPY SOURCE DEST` is a TEC-OS built-in, and so are these:

- `COPY` copies one file within the current user. `DEST` may be a drive
  alone, `COPY X.COM B:`, or a blank name with a type, `COPY X.COM B:.TXT`
  or `COPY X.COM B:.*`: each takes the source's whole name, so all three
  make `B:X.COM`. A
  destination that names the source, on the same drive after the current
  drive is filled in, is a bad command and nothing is opened: `COPY X.DAT`,
  `COPY X.DAT X.DAT` and `COPY X.DAT A:` on A: all print `COPY?`.

- `NAME.DRV` installs a driver and `DRIVERS` lists them, each with its pages.
  `UNLOAD` removes the lowest.
- At cold boot `A:STARTUP.CMD`, if there is one, runs before the first prompt.
  One record of it is read, at most 128 bytes, from the volume on A:, and a keypad
  key held through reset skips it. `docs/drivers.md` has the rules.

The prompt keeps a history of the lines typed at it. ^W puts the line before
in the buffer, erasing the one shown, and ^N the line after; past the newest
the line is empty. The line recalled can be edited and sent like a typed
one. The history is a 256-byte ring at `BD00h` in EXPAND 1, kept by warm boot and emptied by a reset. A line equal to the
newest is not stored again, and nor is one holding a 0. Function 10 called by
a program is CP/M 2.2's: ^W and ^N go into its buffer as characters, and its
lines are not kept.

`MOUNT B: NAME` (or an index, as `VOLS` lists them) puts another of the
card's volumes on a drive, and `MOUNT B:` takes it off; A: is never left
empty, and a volume is never on two drives. Both are programs on the starter
card, using the mount service in the table, `ABIVOL`. Mounts are for the session: a
reset keeps them, as long as the card still holds each volume. `docs/recovery.md`
says how.

A command runs `NAME.COM`; when there is no `NAME.COM`, it runs `NAME.PRL`,
a relocatable file in Digital Research's PRL format: a 256-byte header, the
code made for `0100h`, then a bitmap marking the high bytes of its
addresses, as LINK-80's `[OP]` writes it. A PRL is a program, loaded at
`0100h` as its `.COM` would be, with nothing relocated: only its length is
read, and the bitmap is checked for. The module header some earlier PRLs
carried is no longer read.

A driver is a resident in TEC-OS's own `.DRV` format, with an installation
that can fail cleanly and a registry through which programs find its
services (`ABIDRV`, ABI 4). `docs/drivers.md` is its interface. It goes in
whole pages just below the BDOS entry, and the word at `0006h` moves down to
the jump at its offset 6, which leads on to the old entry; warm boot keeps it
there. Programs that size themselves from `0006h` never reach it. Drivers are
removed last in, first out, and a reset clears them. Nothing of this changes
the TPA when no driver is installed, and a program written for CP/M sees
neither.

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
the console writes over it. The restore costs about 145,000 T-states (36 ms) per
warm boot on the PICO9918 and 7,984 on the GLCD.

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
| Edit | build with the screen configuration block (`ECFG` at `0103h`) | Runs | Edits, saves and reopens a file on the PICO9918 at 80 × 24; also verified on Triptych's CP/M 2.2 at 80 × 24 (`test/edit.test.mjs`). The pinned build tests for ABI major 3 at `C003h`, so the card and the tests take it with that one byte set to 4, checked by its hash, and it reads `ABIVID` at `C008h`; it also edits, saves and reopens on the GLCD at 21 × 8 |
| ATOM.COM | build that sizes its workspace from `0006h` | Runs | Assembles `HELLO.ASM` into `HELLO.COM` on TEC-OS, which then runs (`test/atom.test.mjs`); needs the BDOS at `78C4h` or higher |
| ATOM.COM | 0.3.7 | Refuses to run | Requires the BDOS at `E400h` or higher |
| EDIT.COM | 0.2.0 without the screen configuration | Not run | Fixed stack at `D800h–E3FFh`, above the TPA, and assumes 80 × 24 |

Released ATOM.COM 0.3.7 and Edit 0.2.0 assume a 64 KiB system; their newer
builds take every limit from the word at `0006h`, as CP/M programs should,
and run.

## Known incompatibilities

- **TPA ceiling.** Programs that assume a BDOS at a fixed high address, or
  more than 46,086 bytes of TPA, may fail; how much a card gives depends on
  its volumes, and on a board with a display driver 1,536 bytes less.
- **BDOS internals.** Programs that patch the BDOS or BIOS code fail: both are
  in ROM. The BIOS jump table in RAM is the place to hook. The one BDOS call
  that does not go through it is the check for `^S` while the BDOS writes,
  which calls the ROM's console status directly so that it draws no cursor.
- **CCP overwrite.** Programs that expect to reclaim CCP memory below the BDOS
  gain nothing: the CCP is in ROM and its workspace is above the TPA.
- **Interrupts off across a block.** BIOS `READ` and `WRITE` turn
  interrupts off for the whole call and put them back as they found them, so
  that none arrives while EXPAND 1, where the block cache lives, is in view.
  A call that moves one block to or from the card holds them off for about
  240,000 T-states (60 ms at 4 MHz), and a write-through write that must
  read its block first for about 490,000 (122 ms); a hit in the cache, for
  about 5,000. A program's interrupt routine can wait that long.
- **Bit-banged serial.** Input that arrives while a program is busy and not
  polling the console is lost. Keys typed while the BDOS is printing are kept
  for the next read, as in CP/M 2.2.
