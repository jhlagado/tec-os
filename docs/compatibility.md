# CP/M 2.2 compatibility

TEC-OS runs unmodified COM programs that use the documented CP/M 2.2
interfaces, size themselves from the BDOS address at `0006h` and fit the TPA:
47,348 bytes (`0100h–B9F3h`) on the starter card, and at least 46,644 on any
card, since cold boot places the BDOS entry below the allocation vectors of
the volumes mounted. A display's driver takes six pages under the stub's page,
leaving 45,568 on the starter card and 45,056 with four 8 MiB volumes. A board
with both displays that installs both with `CON UC1` has 44,032 on the starter
card and 43,520 with four. The CCP loads a `.COM` up to the start of the page
holding the word at `0006h`, so the largest it loads on the starter card is
47,104 bytes (`0100h–B8FFh`), 244 below the TPA: a program may use the rest. It reports version 2.2.

## BDOS functions

The BDOS is an adaptation of Portable CP/M, which implements functions 0–40
with their documented conventions; 38 and 39 return zero, and functions above
40 return zero, except 47 and 108; CP/M 3's function 50 is not provided, and a
program reaches the BIOS through the jump table at `(0001h)`. Function 108 is CP/M 3's program return code: `DE =
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
| Read-only volume | 22 via `SAVE`, 29 | `Bdos Err On C: R/O`; card unchanged. Function 29 lists the volume once its drive has been selected |

A sequential write (21) moves to the next extent when it needs it, as CP/M
2.2's does: the write of record 128 of an extent, not the write of record
127, opens or makes the next one. With the directory full that write returns
1 and leaves the FCB on its extent at record 128, so the same write made
after an entry is freed makes the extent and goes on, with none missing. A
file of 128 records has one directory entry.

Function 32 keeps the low five bits of any `E` but FFh, as CP/M 2.2's does:
user numbers 0–31 reach the directory, and no `E` makes the user E5h, the
user byte of an erased entry. The CCP's `USER` takes 0–15, and 0004h holds
four bits of the user, so a program that leaves user 16 or more finds the
next prompt in that number's low four bits.

Function 13 resets the disks and selects drive A, and leaves the user number
as it is, as CP/M 2.2's does.

A file with the read-only attribute (`t1`'s bit 7) is refused with
`File R/O` (`Bdos Err On A: File R/O` for a file on A:), and the program
ends after a key, for a write (21, 34, 40) through an FCB opened on it, a
rename (23) and an erase (19), as in CP/M 2.2. Function 30 still sets or clears the attribute on such a
file, as CP/M 2.2's does, so a program can make it read-write again.

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
the rest of the line is dropped. ^C at a program's line input or at
`TYPE`'s or `DIR`'s `[more]`, a BDOS error's exit, a write lost at warm
boot and a reset drop it too. Esc or Q at `[more]`, and `ERA *.*` answered
N, are answers, not failures: they leave the code at 0, and the line goes on. These are TEC-OS's own rules, taken
from CP/M 3's CCP. `COPY SOURCE DEST` is a TEC-OS built-in, and so are these:

- `COPY` copies one file within the current user. `DEST` may be a drive
  alone, `COPY X.COM B:`, or a blank name with a type, `COPY X.COM B:.TXT`
  or `COPY X.COM B:.*`: each takes the source's whole name, so all three
  make `B:X.COM`. A
  destination that names the source, on the same drive after the current
  drive is filled in, is a bad command and nothing is opened: `COPY X.DAT`,
  `COPY X.DAT X.DAT` and `COPY X.DAT A:` on A: all print `COPY?`.

- `NAME.SVC` installs a service and `SERVICES` lists them, each with its pages.
  `UNLOAD` removes the lowest. A `.DRV` name is no longer a service: `NAME.DRV`
  goes down the `.COM` path, runs a `NAME.COM` if there is one, and
  prints `NAME.DRV?` if there is none.
- After a reset, recognised or not, and not on an ordinary exit, `A:STARTUP.CMD`,
  if there is one, runs before the first prompt.
  One record of it is read, at most 128 bytes, from the volume on A:, and a keypad
  key held through reset skips it. `docs/services.md` has the rules.

The prompt keeps a history of the lines typed at it. ^W puts the line before
in the buffer, erasing the one shown, and ^N the line after; past the newest
the line is empty. The line recalled can be edited and sent like a typed
one. The history is a 256-byte ring at `BD00h` in EXPAND 1, kept by warm boot and emptied by a reset. A line equal to the
newest is not stored again, and nor is one holding a 0. Function 10 called by
a program is CP/M 2.2's: ^W and ^N go into its buffer as characters, and its
lines are not kept.

`MOUNT` lists the card's volumes, and `MOUNT B: NAME` (or an index, as `MOUNT`
lists them) puts another of the
card's volumes on a drive, and `MOUNT B:` takes it off; A: is never left
empty, and a volume is never on two drives. `MOUNT B:` with B: the current
drive takes it off too, and the next prompt is `A>`: the CCP takes A: at
warm boot whenever 0004h names a drive with no volume, as no select of it
could succeed. `MOUNT.COM` is on the starter
card, using the ROM table's volume services, `TNMOUNT` and `TNUNMNT`. Mounts are for the session: a
reset keeps them, as long as the card still holds each volume. `docs/recovery.md`
says how.

A command runs `NAME.COM` from the current drive, or the drive it names, in the
current user and, if it isn't there, in user 0; no SYS attribute is needed. When
there is none there, no drive was named and the current drive isn't A:, it runs
A:'s `NAME.COM` (KD-169), from the current user and then user 0, so `TED` and
`TAS` run from B:; the current drive and user stay as they were. `B:NAME` looks
on B: only. A `.PRL` file is not run: it is a `.COM` with a 256-byte header,
and none is on the starter card or written by the tools.

A service is a resident in TEC-OS's own `.SVC` format, with an installation
that can fail cleanly and a registry through which programs find its
records (`TNFIND` and `TNLIST`, ABI 5). `docs/services.md` is its interface. It goes in
whole pages just below the BDOS entry, and the word at `0006h` moves down to
the page's start, which holds a jump straight into the BDOS, however many are in;
warm boot keeps it there. Programs that size themselves from `0006h` never reach it, a
stack set from that word included. Services are
removed last in, first out, and a reset clears them. Nothing of this changes
the TPA when no service is installed, and a program written for CP/M sees
neither.

## Base page

Warm boot at `0000h`, BDOS vector at `0005h` (target `B815h` on the starter card, directly
below the allocation vectors), IOBYTE at
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
| TED.COM | Thorium `128edb7`, on the starter card | Runs | Edits, saves and reopens a file on the PICO9918 at 80, 40 and 32 columns and on the GLCD at 21 × 8, and `TED NAME 12` opens at line 12 (`test/ted.test.mjs`). ^T B saves, runs `TAS` by function 47 and comes back at the error's line and column; ^T R builds, runs the program and comes back at the same place after a key; on A: and on B:, with the PICO9918 and with a serial terminal. ^T D chains `TDB`, which isn't on the card: each tool on the chained line names the drive TED was loaded from, so the CCP prints `A:TDB?` and `A:TED` brings the editor back at its place. It needs ABI major 5 and asks `TNINFO` for the console's size. `TED B:X.ASM` from A: opens B:'s file, and its build runs A:'s `TAS` on it; `C:TED X.ASM` from B: builds B:'s file with C:'s `TAS` and comes back to C:'s `TED`, since TED takes the load drive from 0050h before each tool; the CCP finds a `.COM` on A: when the current drive hasn't one. Its text holds 33,067 bytes on the starter card and 31,510 with the PICO9918's driver. Beside the source it writes `THOR.SES`, which holds the last file's name and place, and `THOR.PRJ` after a good build, whose keys are `MAIN` and `ARGS`, with `THOR.ERR`, `THOR.$$$` and `THOR.BAK` on the way; a `THOR.SES` copied from another card names that card's file and place |
| Edit | build with the screen configuration block (`ECFG` at `0103h`) | Ran until `TED.COM` took its place | Edited, saved and reopened a file on the PICO9918 at 80 × 24; also verified on Triptych's CP/M 2.2 at 80 × 24. That build tested for ABI major 3 at `C003h`, so the card and the tests took it with that one byte set to 4, checked by its hash, and read `ABIVID` at `C008h`; it also edited, saved and reopened on the GLCD at 21 × 8. Its test on Triptych's CP/M went with it |
| TAS.COM | Thorium `dbee66a`, on the starter card | Runs | Assembles `HELLO.ASM` into `HELLO.COM` and `HELLO.DBG` on TEC-OS, and rebuilds itself, using the BDOS only (`test/tas.test.mjs`). `TAS X X.SVC` writes a service that loads. A failed build sets FF00h by function 108, so `TED X.ASM!TAS X!:X` needs no `ERA X.COM`, and a read-only output is refused |
| ATOM.COM | build that sizes its workspace from `0006h` | Ran until `TAS.COM` took its place | Assembled `HELLO.ASM` into `HELLO.COM` on TEC-OS; needs the BDOS at `78C4h` or higher. It stays the ROM's host build |
| ATOM.COM | 0.3.7 | Refuses to run | Requires the BDOS at `E400h` or higher |
| EDIT.COM | 0.2.0 without the screen configuration | Not run | Fixed stack at `D800h–E3FFh`, above the TPA, and assumes 80 × 24 |

Released ATOM.COM 0.3.7 and Edit 0.2.0 assume a 64 KiB system; their newer
builds take every limit from the word at `0006h`, as CP/M programs should,
and run.

## Known incompatibilities

- **`^S`.** The key after `^S` is consumed and dropped, so `^C` there doesn't warm
  boot as CP/M 2.2's does.
- **`[more]`.** The key is tested with `AND DFh`, so `#` and `;` stop a listing as
  ^C, Esc and Q do.
- **TPA ceiling.** Programs that assume a BDOS at a fixed high address, or
  more than 46,644 bytes of TPA, may fail; how much a card gives depends on
  its volumes, and on a board with a display driver 45,056 is the least.
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

## The contract at this commit

What another program or study may rely on, in one place. ABI 5.0 is not frozen
until a release. `src/abi.inc` is the published form, and the ROM assembles from it.

### The ROM table

| Address | Name | What it is |
| --- | --- | --- |
| `C003h` | `ABITAB` | `"TNA"` |
| `C006h` | `ABIMAJ` | Major version, 5 |
| `C007h` | `ABIMIN` | Minor version, 0 |
| `C008h` | `ABICALL` | `JP` to the 15 services numbered 0 to 14 in C: the hardware services, mount, unmount, describe, the video drivers' hook, find and list |

The table ends at `C00Bh`. `abi.inc` gives each service's arguments, results, carry and stack.
`PUTAT` returns status 2 on the serial terminal, or while the PICO9918 is claimed and
is the console: with the console on `UC1:`, a claim leaves it working.

The restart vectors today: at cold boot, every warm boot, an unload and a failed
`INIT`, a sweep gives each vector at `0008h` to `003Fh` that isn't a `JP` at or above
`PZTOP`'s page seven zeros and a `RET`, or `EI; RETI` at `0038h`, so a free slot's first
byte isn't `C3h`. A service claims its vectors in its flags, by `docs/services.md`.

### The BDOS

Functions 0 to 40, 47, 50 and 108, as above. 38 and 39 return zero, and so does any
other function above 40.

### The service format

Format 4, the magic 0444h ('D', then the version), the type `.SVC`. The layout is
`docs/services.md`'s, unchanged from format 3; the version rose with ABI 5, so the
loader refuses a format 3 service, which would call ABI 4's addresses.

### Page zero and the workspace

`docs/memory-map.md` gives both. Page zero is CP/M's, with TEC-OS's state at `0040h`
to `004Fh`. The RAM BIOS table is at `BF00h`. The CCP's command line and both its FCBs
are kept over warm boot, from `CCPCLR`, and `CHPOS` above the table holds the place in
a chained line.

### What changed since each pin

| Area | Since `814bc44` | Before it, from `7029f57` |
| --- | --- | --- |
| ROM table | Moved from `FF00h` to `C003h` and from ABI 2.6 to 5.0: 8 bytes, the signature, the versions and one jump to 15 numbered services. `XMOVE`, `MOVE`, the nested CCP entries, the counts, the low mark, the console size's address and the font's address left it | The table was added |
| Hardware services | 19 numbered from 0 became 9 numbered from 0: `INFO`, `DIGIT`, `LCD`, `VIDEO`, `TONE`, `JOY`, `KEYS`, `PUTAT`, `RTC`, then mount, unmount, describe, the drivers' hook, find and list as 9 to 14. A number past 14 returns status 1 | Added |
| BDOS | Function 47 added; function 50 gone. The CCP sets function 108's code to FF00h on a failed command. A write that needs an extent a full directory can't hold returns 1 at record 128; function 32 keeps five bits; function 13 leaves the user; a read-only file refuses writes and renames with `File R/O`; a warm boot takes A: when 0004h names a drive with no volume | 50 and 108 added, and hooks through the RAM BIOS table |
| Command line | `!` and `:` in typed, startup and chained lines, a 127-character cut, and a program's tail no longer carries `!`. `STARTUP.CMD` added. `.DRV`, `NAME.DRV` and `DRIVERS` came after the pin too, and became `.SVC`, `NAME.SVC` and `SERVICES` | History and `COPY` added |
| Service format | Format 4 and the type `.SVC` are new: at the pin a driver was a PRL in EXPAND 1. The loaded display files replace the ROM's PICO9918 and GLCD consoles and the ROM's font | None |
| Page zero | `0040h` to `004Fh` hold the same names but `MAINS` at `0041h` and `EXPANDS` at `0044h`, gone with MAIN 1's count; both bytes are unused. `0050h` holds the drive the CCP loaded the running program from, as CP/M 3 does: 0 for the current drive, 1 for A: and so on, and 1 when it was found on A: by the search. After a warm boot a jump left at `0038h` to a page at or above the top's is kept, a jump left into a service is kept, and `003Bh` to `003Fh` are cleared. A clean boot's page zero differs only in the word at `0006h` | State moved there |
| Workspace | `CHPOS` added and the line kept over warm boot from `CCPCLR` | The workspace left the top page of the TPA |
| TPA | 47,348 on the starter card with no display, 45,568 with one display's driver and 44,032 with two, since KS36b's block store took `BLKBUF` out of the workspace | 45,830 at `7029f57` |
