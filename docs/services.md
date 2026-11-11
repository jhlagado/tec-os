# Services

Status: **Built**, 2026-10-31: the loader, the registry, the commands, startup
and `GLCD.SVC`; the PICO9918's console moved into the ROM (KS39). 2026-11-10:
`NAME.SVC /E` and the execution record (KS53 S1).
`test/svc.test.mjs`, `test/startup.test.mjs`, `test/pico.test.mjs`,
`test/ks39.test.mjs` and `test/mon3.test.mjs` hold them.

A *service* is what a `.SVC` file installs: a resident in EXPAND 0, below
`(0006h)`, in whole pages. It publishes named *records* in the registry and
calls the ROM only through the *ROM table* at `C003h`. A *driver* is a service
that drives hardware, and a *library* is a service offering routines. The
*hardware services* are numbered calls through `ABICALL`, in the ROM; they
aren't loaded and have no record. *Service resident memory* is the pages loaded
services hold, from the lowest resident's page up to the workspace. The format
is the service format.

This document is the interface: what a service must do, and what the ROM does
for it.

## The file

A `.SVC` file is the image, made for page 0 with its header at the start, then
the dependencies, then the relocation data. `tools/lib/svc.mjs` writes one from
two assemblies. ATOM takes `%INCLUDE` only in a file's header, so the writer copies
in any `%INCLUDE` below the `ORG`. Records are whole on disk, so a file's end is rounded, and the
loader ignores what follows its relocation data.

| Offset | Bytes | In the file | In memory |
| --- | --- | --- | --- |
| 0 | 1 | Magic, `44h` | `JP BENTRY`, 3 bytes |
| 1 | 1 | Format version, 4 (`SVCFMT`) | |
| 2 | 1 | Number of dependencies | |
| 3 | 1 | Flags: bit 0 removable, bits 1 to 7 claim `RST 1` to `RST 7` | The same; 0 if a hook kept the pages |
| 4 | 2 | `REMOVE`, from the header's start | The same |
| 6 | 2 | Header and image, in bytes | The registry's head before it |
| 8 | 2 | Extra memory after the image, not cleared | Low byte: the owner before it, a page, 0 at the last |
| 10 | 2 | Relocation data, in bytes | Unused |
| 12 | 3 | Stack use: BDOS, BIOS, CCP | Each stack's room left below this service |
| 15 | 2 | `INIT`, from the header's start | Unused |
| 17 | 8 | Name, padded with spaces | The same |
| 25 | | The image | |

The header is 25 bytes and goes into memory with the image, the loader writing
over the fields a load has finished with, so the file carries no padding.

With a service in, `(0006h)` is its page's start. The `JP` there goes straight into
the BDOS, so a BDOS call is two jumps however many services are in, and every field a
service needs lies at or above that word, where a program that sets SP from it can't
reach. With none in, `(0006h)` is the stub directly below the allocation vectors,
`B9A4h` on the starter card and lower on a card with more volumes.

Format version 4 has version 1's layout. It rose with ABI 5, as 3 did with ABI 4:
services test no ABI, and each major moved the table's entries, so the loader
refuses an older file. The CCP hands the loader no `.DRV` name.

A dependency is 9 bytes: its least version, then a record's 8-byte name.

The relocation data is a list of gaps. Each byte is the distance to the next
byte to relocate, the first from the byte before the image; 255 moves on with
nothing relocated. Each marked byte, the high byte of an address, has the
service's page added. A list whose first gap is 0 would patch header byte 24, the
name's last; `makeSvc` never writes one.

## Commands

`NAME.SVC`, or `B:NAME.SVC`, reads that file and installs it. The type must be
typed: `NAME` alone looks for `NAME.COM`, on A: too when it isn't on the current
drive. If the file
won't read, or the load is refused or fails, the command's name comes back with
a question mark, as for any command that won't run, with one exception: a line
from `STARTUP.CMD` whose driver finds its device absent (`INIT` returns
`TNENODV` with carry) says nothing, and leaves the code 0, so a `:` line after
it runs. Typed, or for any other cause, it says `NAME?` as before. `GLCD.SVC`
takes the console unless `CRT:`, the ROM's PICO9918 console, is in effect, and
then gives way to it; in a line from `STARTUP.CMD` with `CON:` at `CRT:`,
`TNDRVR` refuses its table with `TNENODV`, so the line passes over it quietly
and it takes no stack room it would not use (KE-200). Any other service leaves
the console alone.

`NAME.SVC` only installs, and never enters what it installs. `NAME.SVC /E`
enters an installed service's execution entry, and installs it first if it
isn't in: the next section. Text after a first operand that isn't a switch is
ignored, as before, so `NAME.SVC X /E` only installs. A second `NAME.SVC` of a
file already in installs a second copy, as it always has: the loader compares
no name. A service claiming a slot is refused the second time with `SVCRC` 0,
since the slot holds the first copy's `JP`; a second `GLCD.SVC` fails at its
`INIT` and says `GLCD.SVC?`, except in a startup line with `CON:` at `CRT:`,
where it passes quietly as above.

`SERVICES` prints one line for each loaded service, the newest first: its name
and its pages. It walks the owner list, so a service with no record is listed,
and the ROM's PICO9918 console, which has no pages, is not.

`UNLOAD` removes the lowest resident, as below, and answers the same way if it
can't. It never removes the ROM's PICO9918 console. `GLCD.SVC`'s `REMOVE` gives the
console back to `CRT:` if the "PICO" record is present.

## Execution: `NAME.SVC /E`

A service can carry a resident application, such as `MON3.SVC`'s `MON3>`
monitor (`docs/mon3.md`), behind an *execution entry*. Three operations stay
apart: `INIT` installs and registers, the execution entry runs the
application, and `REMOVE` removes it. Only a service whose image starts with
an *execution record* can be entered. A registry record is never an entry,
and no command enters the service loaded last.

**The switch.** `/E` follows the name after a space, and ends at a space or
the end of the line. What follows it is the application's command tail. Any
other first operand starting with `/` is refused with `NAME.SVC?` and code
FF00h before any file is opened: `/X`, `/`, `//E`, `/EX` and `/E5` all are.
`NAME.SVC/E`, with no space, is a name the CCP refuses as it always has.

**The identity rule.** An installed service is named by the eight-byte name of
the file it was installed from, which its `INIT` copies into its record. The
command's own file name is compared with that name in each installed
service's ready record. The header's name and any registry record's name play
no part, and nor do the drive and the user: `B:MON3.SVC /E` and `MON3.SVC /E`
in user 1 enter a `MON3` installed from A: and read nothing.

1. **One match** is entered. No file is opened, so the file need not still be
   on the card.
2. **None:** the file is read from the drive named, or the current one, with
   no fallback to A:, and staged at 0100h. A staged image with no version-1
   record is refused before anything is installed. The rest installs as
   `NAME.SVC` does, and is entered if its `INIT` set it ready with that name.
3. **Two or more** are refused, and neither is chosen. `UNLOAD` until one is
   left.

A renamed copy, `M2.SVC`, is a service of its own. To change to another
version of a service that is in, `UNLOAD` it first: `/E` enters the one
installed.

**The execution record, version 1.** Sixteen bytes at the start of the image,
file offset 25:

| Offset | Bytes | Contents |
| --- | --- | --- |
| 0 | 2 | `"EX"`, 45h 58h |
| 2 | 1 | Its version, 1 |
| 3 | 1 | Bit 0: ready |
| 4 | 2 | The entry, from the header's start, as `INIT` and `REMOVE` are |
| 6 | 8 | The name the service was installed by, written by `INIT` |
| 14 | 2 | The service's own version, for its own use |

- **The entry is an offset, never a relocated label.** The ROM adds the
  service's page itself. `makeSvc` refuses a record whose entry word carries a
  fixup. A word that was relocated anyway is refused at entry, as page plus
  page carries, and that service stays installed.
- **The entry is bounded at install.** The loader refuses a staged record
  whose entry lies outside the image, as it refuses an `INIT` outside it,
  with `SVCRC` 0, for a plain `NAME.SVC` too.
- **No false record.** A format-4 service without a record must not start its
  image with 45h 58h 01h.
- **Ready.** `INIT` sets bit 0 last, after the name. `REMOVE` clears it first.

**A `/E` install that never becomes ready** is taken out by the loader's own
unload, and the line is refused: nothing is listed and `(0006h)` is as before.
The one exception is a service that is not removable, or whose `REMOVE`
refuses: it stays installed and the line is refused, so each further `/E`
installs one more copy. `UNLOAD` or a reset takes them.

**The console step.** A `NAME.SVC` that installs `GLCD.SVC` then makes the
GLCD the console. `/E` installs through the loader alone and skips that step,
so a display driver installed by `/E` doesn't take the console.

**In a startup line** the refusals are the same. The quiet path is too: a `/E`
install whose `INIT` finds no device (`TNENODV` with carry) ends with code 0,
no message, nothing installed and nothing entered.

**The entry contract.**

- HL is the entry address. A, BC, DE, IX and IY are undefined.
- SP is `CSTKTOP` with 0000h pushed, as a `.COM` starts. The entry runs where
  a transient does, and should take its own stack at once.
- Page zero, the FCBs at 005Ch and 006Ch, the tail at 0080h and the DMA are
  as the CCP makes them for a `.COM`, from the text after `/E`. `PZLDRV` is
  the command's drive: 0 for the current drive, 1 for A: and so on.
- Interrupts are off and the latch is `LATCLAS`.
- **Return** is `RET`, `JP 0000h` or BDOS 0, each a warm boot that leaves the
  service installed. The result is the BDOS 108 code: an entry that sets
  FF00h makes a following `:` piece skip.
- **Failure:** the entry prints its own message, sets FF00h and returns.
- **Recursion.** The CCP runs only after a warm boot, and warm boot ends any
  application, so the only second entry is a program calling the entry. The
  entry must refuse that itself.

The stack census includes `/E`'s paths: a refused switch, install then entry,
re-entry, and a never-ready install removed.

## Startup

After a reset, recognised or not, and never on an ordinary exit, `A:STARTUP.CMD`,
if there is one, runs before the first
prompt. One record is read once, into RAM: **at most 128 bytes**, and anything
after them isn't run. The file isn't read again, so a warm boot doesn't repeat
it and `USER 3` in a line can't affect it. Each prompt takes the next line in place
of the keyboard, so a program's warm boot and a built-in's return reach the next line
by the same route. ^C stops the current program, and the next lines still run;
^C at a program's line input also drops the rest of a line holding `!`, and the
next startup line runs.
The line is echoed through BDOS function 9, so a `$` in it ends the echo, though
the line runs whole. A 127-character line and its CR and `$` take 129 bytes from
`CMDTXT`: the `$` lands on `BOOTDRV`, which is rewritten before it is read.

A line ends at CR or LF, and blank lines are passed over. `^Z`, a zero or the
128th byte ends the file. A line runs its first 127 characters, so one of 128,
the whole record, runs without its last; one that starts at the 128th byte isn't
run. A line that fails prints its usual message and the
next runs.

**The PICO9918 needs no line.** When the VDP answers the ROM's probe and the
matrix keyboard is fitted, cold boot starts the ROM's console before the banner
at 40 columns and sets the IOBYTE's `CON:` field to `CRT:`. `CON PICO 32`,
`CON PICO 40` and `CON PICO 80` select a width explicitly. Bare `CON PICO` and
`CON CRT` keep the current width. Warm boot keeps it and reset restores 40;
a `STARTUP.CMD` width line overrides that default. On a board without the PICO9918
console the line passes quietly. The ROM is one image for every board.

One card can serve every board: the starter card's `STARTUP.CMD` holds `GLCD.SVC`
alone. Where there is a GLCD and a matrix keyboard and no PICO9918 console, the
line makes the GLCD the console; elsewhere it passes over it quietly and goes on.
On a board with both displays, `GLCD.SVC`'s line passes over it quietly, since
`CRT:` keeps the console, and `CON UC1:` then loads it and makes the GLCD the console;
that leaves 46,336 bytes of TPA on the starter card. An old
card's `PICO.SVC` line is refused at its `INIT`, since `TNDRVR` no longer takes
`CRT:`, and prints `PICO.SVC?`, leaving nothing loaded.

`CON UC1:` shows `GLCD?` on the LCD if it can't load, and a take clears it, as does
`GLCD.SVC` loading and giving way to `CRT:`. A word goes only if it is still there:
a program's write to row 3 through hardware service `LCD` takes the row over, and no
take clears it. A program writing the LCD's port directly is unseen. Where the
ROM's console doesn't start, the banner and volumes go to the serial terminal and
the LCD until a display's line runs. A card that won't mount shows `CARD?` on the
LCD at every failure, and DIAG's `R retry>` prompt on the console, the PICO9918's
screen or the serial terminal; `R` starts the LCD again, so a good retry clears the
word.

A board with a PICO9918 and no matrix keyboard keeps its console on serial and has
an unprogrammed VDP until a program claims it, and a board with no matrix keyboard
refuses `GLCD.SVC`. A claim where the ROM's console didn't start restores nothing
on release.

**The skip.** A keypad key held through reset, until the prompt, skips the file:
port `03h` bit 6 is read once, just before the open, about 1.46 s after reset. The
skip needs no driver and costs no boot time. A line that hangs or resets the
machine would otherwise run at every boot. `docs/diagnostics.md` records a conflict
over this bit's polarity: a board that reads it the other way would skip on every
boot. The web host has no keypad and no tool to clear the file, which can only be
overwritten by a copy or replaced with a new starter card.

**Recovery needs serial.** After a skip, or with no file, a board without the ROM's
PICO9918 console has its LCD and the serial terminal: the matrix keyboard isn't read
until a display's driver is in. A PICO board keeps the console it started on.

## Installation

A load runs only with no `INIT` or `REMOVE` running, which `SVCBSY` says. In order:

1. The file's magic, version, sizes and `INIT` and `REMOVE` are checked against
   the image and the file, an execution record's entry against the image, and
   the base against `8000h`.
2. Each dependency must be installed, at its least version or above.
3. Each stack's figure must fit the room left.
4. The image is relocated and any fixup past it refused.
5. A restart vector claimed in the flags must not hold a `JP`.
6. The header and image move to their pages and `(0006h)` is lowered.
7. `INIT` runs. `PZTOP` is untouched, so a warm boot during `INIT` puts the
   ceiling back by itself.
8. The records are checked and linked, and `PZTOP` is written. That word is the
   commit.

Until step 5 a refusal leaves everything but the file as it was. `SVCLOAD`
returns carry clear when installed. With carry set, `SVCRC` is 0 for refused,
1 for a failure leaving nothing behind, and 2 for a failure with the pages kept.
`SVCRA` holds `INIT`'s `A` when `INIT` failed, and 0 when a record `INIT`
returned was refused, so a refused record never passes for an absent device.

## What a service must do

**`INIT`** builds its records in its own memory and returns carry clear with HL
at the first, or 0 for none. BC points at the eight-byte name the file was read
by, padded with spaces, whichever command loaded it: a service with an
execution record copies it there, and any other ignores it. A record is 13
bytes:

| Offset | Bytes | Contents |
| --- | --- | --- |
| 0 | 2 | The next record, 0 at the last |
| 2 | 8 | The record's name |
| 10 | 1 | Its interface version |
| 11 | 2 | Its entry table's address |

The loader checks that each record, its link and its table's address lie in the
service's pages, for at most 255 records, and no more than keep the registry,
the records already in with these, at 256, all that `TNFIND` walks, so the
PICO9918 console's record stays findable (KE-AR4); then it links them. It can't
check an entry table's contents. If a check fails it calls `REMOVE`; if `REMOVE` refuses,
the service stays installed with no records and the load reports 2.

`INIT` returning carry means it undid what it did. It installs hooks last, since
a warm boot inside it can't call anything back and a hook already in the table
would be left pointing into free memory. After a failed `INIT` the loader scans
the 17 entries of the RAM BIOS table for a target in the service: a hit keeps the
pages, not removable, and registers nothing. Vectors such as `TNDRVR`'s table
can't be scanned, so that rule binds the service.

While `INIT` or `REMOVE` runs, a load and a removal are refused, which only a raw
call to the ROM could try. A warm boot ends that state.

**`REMOVE`** undoes `INIT`, restoring hooks in reverse order, and returns carry
clear, or carry set to refuse, leaving everything as it was. It may be called
after a record check failed. `UNLOAD` calls it, from the CCP, so no program is
running.

## Stacks

A service runs on its caller's stack, and that is one of four. Its header
declares its additional use on each of the three the ROM owns. The loader
refuses a service that takes a stack's sum past its limit:

| Stack | Reserved | Base | Census | Limit for services |
| --- | --- | --- | --- | --- |
| BDOS | 54 | 30 | 32 | 8 |
| BIOS | 40 | 18 | 18 | 12 |
| CCP | 32 | 18 | 18 | 6 |

The base is the deepest use with no resident, on the serial and PICO9918 paths,
the diagnostic console and a recognised reset; the census is the deepest use of
all. The BIOS's 18 is warm boot's flush of the lines written behind: cold boot
mounts and lists the drives on the BDOS's stack, which nothing else uses before
the CCP runs. A limit is counted from the base, and a stack holds its base and
its limit with a quarter free, which `test/stacks.test.mjs` checks: the BDOS's
38 of 54, the BIOS's 30 of 40 and the CCP's 24 of 32. A service must stay within
its declared stack use. `test/svc.test.mjs` checks this with a stack watch.
The ROM does not enforce the declaration at runtime.

A program's stack can't be checked, so a service's own document states what a
program must leave. On the BDOS's stack a service may not call the BDOS, as
`BENTRY` would lose its frame.

## Records

A client finds a record with `TNFIND` (`docs/rom-services.md`):

- **A program** may keep a pointer until it exits. No service can be removed
  while it runs.
- **A service that needs another** names its record as a dependency and binds at `INIT`.
  The dependency is then above it in memory, and last in, first out removes the
  dependent first.
- **A service that looks up later** may not keep the pointer. Removing a
  service frees its pages, and a kept pointer runs whatever is there. `TNFIND`
  returns a generation, raised by each removal, for such a service to compare.
  It is 8 bits and wraps: after exactly 256 removals a stale pointer passes the
  comparison.

Each record's table is defined in a document with its interface version.

### `PICO`, version 4

The ROM's PICO9918 console offers `PICO`, version 4, with its console table
followed by four words, the graphics entries, and from version 3 a fifth, the
width. Its table, its record and its state are one 95-byte RAM block, `PIBLK`, in
the BIOS's state, filled at cold boot from a ROM template and kept by warm boot.
The record is registered only when the console started, and is the registry's
permanent tail: `TNFIND` finds it and `TNLIST` returns it last (KS39). The offsets
are from the table `TNFIND` returns:

| Offset | `abi.inc` | Registers | Effect |
| --- | --- | --- | --- |
| 16 | `PICOREG` | B = register, A = value | The VDP's register written |
| 18 | `PICOFIL` | HL = VRAM address, DE = count, A = value | VRAM filled |
| 20 | `PICOWR` | HL = VRAM address, DE = RAM address, BC = count | RAM copied to VRAM |
| 22 | `PICORD` | The same | VRAM copied to RAM |
| 24 | `PICOWID` | A = 80, 40 or 32 | The console at that width, cleared; carry, with nothing changed, for any other width or while the PICO9918 is claimed |

The graphics entries each assume the caller holds the claim (hardware service `VIDEO`), as a program writing the
ports does, and checks nothing. A count of 0 moves nothing. Each destroys AF, BC, DE
and HL. `GLCD.SVC`'s `REMOVE` asks for version 1 and reads none of these. A board with
a PICO9918 and no matrix keyboard doesn't start the console, so it has no record and
no entries: a program there claims the VDP and writes the ports.

Version 3 put the width at offset 24, so the state after the table moved by two
bytes: `abi.inc` names the record's version byte (`PICOVRB`, 36), the page drawn
(`PICOTPD`, 41) and the page shown (`PICOTPS`, 42), for a debugger that reads
them, and the build checks each against the block. The name table,
the second page, the row table and the registers follow the width at run time.

Version 4 reserves all VRAM `3000h`–`37FFh` against console writes at every
width. These pixels need not survive a permitted width change: release the
claim first, re-read the geometry and redraw. A debugger's name-table R2 is
`0Fh` at 80 columns and `0Ch` at 40 or 32. The public table and state offsets
remain those of version 3. Width-only clients can still request at least 3;
a debugger using the version-4 guarantees requests at least 4 and diagnoses
or falls back on an older record. ABI remains 5.1.

While the caller holds the existing `VIDEO` claim, a supported `PICOREG` write
to register 1 tracks its IE bit. Raw port writes remain untracked. Restore,
accepted width selection and ordinary release preserve that tracked bit with
the current mode's other R1 bits. There is no hardware getter or new owner
registry. The caller checks conflicting vector ownership before arming.

Real warm boot ends the transient session: hardware IE and its shadow clear
before `PZINIT` removes a TPA handler, even when the display is unclaimed.
Real boot's `PIICLR` writes only R1, and writes all of it: the current
PICO mode's value with IE off, or `80h` (16K, display blanked) on a
detected VDP with no PICO mode. `HWVREL` follows. Releasing a claim on an
installed PICO restores its mode, which rewrites R0 to R7. Quit and abort must clear IE before vector teardown or follow the proved
disabled-interrupt path into real boot. This contract adds no IRQ handler and
makes no physical interrupt, wiring or paired-write atomicity guarantee.

## Removal

`UNLOAD` acts on the lowest resident only, read from `PZTOP`, and only if the
owner list's head is its page. If the flag says it isn't
removable, or its `REMOVE` refuses, `UNLOAD` says so and changes nothing.
Otherwise the registry and owner heads go back to what they were before it, the
generation rises, and `PZTOP` and `(0006h)` go back to the top before it. The slots
the service claimed and any vector into its pages then take their defaults. Warm
boot keeps services and the registry; a reset empties both.

## Rules for a source

A service calls the ROM table and nothing else, and carries what it needs
that the ROM doesn't offer; a display driver draws from the ROM's font, which
`TNFONT` returns. The build refuses a source
in `drivers/`, or `test/programs/svc*.asm`, that names a ROM address; `abi.inc`'s
names are the way in.

`abi.inc` also publishes two workspace bytes:

- `LATCHV` (`0040h`), the shadow copy of the write-only system latch.
- `KBLAST` (`BFEFh`), TEC-OS's last matrix key: the highest-numbered key
  down, row × 8 + column, FFh for none. TEC-OS's scan takes a key as new
  only when it differs from `KBLAST`, and skips a row that reads 00h, all
  eight keys down. A service that scans the matrix itself writes that key
  there, as `MON3.SVC` does, so a key held from a program isn't read again
  when TEC-OS's scan resumes, and a host that holds a matrix key until
  TEC-OS has read it lets it go. The build checks that `KBLAST` is the
  workspace's byte.

## Restart vectors and interrupts

Memory above the TPA is of three kinds: service resident memory, the workspace with
the RAM BIOS table, and the ROM. At cold boot, at every warm boot, after an unload and
after a failed `INIT`, a sweep of `0008h` to `003Fh` keeps a `JP` whose target is above
`PZTOP`, and gives anything else its default: seven zeros and a `RET`, or `EI; RETI` at
`0038h`, the rest of that vector zero. The bound keeps all three kinds, and a jump into
a service's header past its entry. The sweep rewrites `0038h` a byte at a time with
interrupts as it finds them, so `REMOVE` turns a source off before it returns.

A service claims `RST 1` to `RST 7` by flags bits 1 to 7. A load whose claimed slot
holds a `JP` is refused with nothing changed, `SVCRC` 0. `INIT` writes the vector
itself, so a write it didn't declare goes unseen, the rule that binds `TNDRVR`'s table,
and a `JP` a finished program left into ROM counts as held until a reset. Unload gives
the claimed slots their defaults whatever they hold, and sweeps. A jump the service set
outside its pages in a slot it didn't claim is `REMOVE`'s to restore. A failed `INIT`
has its claimed slots cleared the same way, and runs no `REMOVE`, so any other jump, and
turning off any interrupt source, are `INIT`'s duty. A
source left on under the default `EI; RETI` repeats for ever, and a warm boot inside
`INIT` leaves one on. A reset forgets the service and clears its vectors.

Nothing in the ROM enables interrupts: cold boot and warm boot leave them off, and each
routine that masks them restores what it found. A kept `0038h` therefore does nothing
after a warm boot until a program or a service sets `EI`, and a warm-boot hook chains
into `WBOOTR` with no service code after it. TEC-OS never selects MAIN 1 and gives
it no page zero.

The ROM masks what an interrupt could split: `VPAIR` for each
pair written to the VDP's control port, and serial's `TXBYTE` and `RXBITS` for a whole
byte, while their start-bit polls stay open. A program holding the claim masks its
own pairs. Function 47 from `INIT` or `REMOVE` is a warm boot there, like function 0,
`^C` or a disk error: from `INIT` the load rolls back, and from `REMOVE` the service
stays listed.
