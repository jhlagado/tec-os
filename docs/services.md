# Services

Status: **Built**, 2026-10-31: the loader, the registry, the commands, startup,
`GLCD.SVC` and `PICO.SVC`. `test/svc.test.mjs`, `test/startup.test.mjs` and
`test/pico.test.mjs` hold them.

A *service* is what a `.SVC` file installs: a resident in EXPAND 0, below
`(0006h)`, in whole pages. It publishes named *records* in the registry and
calls the ROM only through the *ROM table* at `C003h`. A *driver* is a service
that drives hardware, and a *library* is a service offering routines. The
*hardware services* are the numbered calls through `ABIHW`, in the ROM; they
aren't loaded and have no record. *Service resident memory* is the pages loaded
services hold, from the lowest resident's page up to the workspace. The format
is the service format.

This document is the interface: what a service must do, and what the ROM does
for it.

## The file

A `.SVC` file is the image, made for page 0 with its header at the start, then
the dependencies, then the relocation data. `tools/lib/svc.mjs` writes one from
two assemblies. ATOM takes `%INCLUDE` only in a file's header, so the writer copies
in any `%INCLUDE` below the `ORG`, which is how a display driver places its font
last in the image, where its 768 bytes cost no gap bytes. Records are whole on disk, so a file's end is rounded, and the
loader ignores what follows its relocation data.

| Offset | Bytes | In the file | In memory |
| --- | --- | --- | --- |
| 0 | 1 | Magic, `44h` | `JP BENTRY`, 3 bytes |
| 1 | 1 | Format version, 3 | |
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
`B815h` on the starter card and lower on a card with more volumes.

Format version 3 has version 1's layout. It rose with ABI 4, which moved the table's
entries and took the font out of the ROM: services test no ABI, so the loader refuses
an older file. The layout and the magic have stayed since, through the type's
change from `.DRV` to `.SVC`: a format 3 file with its old name is a good file once
it is renamed, and the CCP hands the loader no `.DRV` name.

A dependency is 9 bytes: its least version, then a record's 8-byte name.

The relocation data is a list of gaps. Each byte is the distance to the next
byte to relocate, the first from the byte before the image; 255 moves on with
nothing relocated. Each marked byte, the high byte of an address, has the
service's page added. A list whose first gap is 0 would patch header byte 24, the
name's last; `makeSvc` never writes one.

## Commands

`NAME.SVC`, or `B:NAME.SVC`, reads that file and installs it. The type must be
typed: `NAME` alone still looks for `NAME.COM` and then `NAME.PRL`. If the file
won't read, or the load is refused or fails, the command's name comes back with
a question mark, as for any command that won't run. If a display driver's table is in
its own first page it takes the console: `PICO.SVC` always, `GLCD.SVC` unless
`PICO.SVC` is in. Any other service leaves the console alone.

`SERVICES` prints one line for each service, the newest first: its name and its
pages. It walks the owner list, so a service with no record is listed.

`UNLOAD` removes the lowest resident, as below, and answers the same way if it
can't. `PICO.SVC`'s `REMOVE` refuses while it is the console, since `CON CRT` has no
load, and while the PICO9918 is claimed, which it reads from `INFO`, until a release
or a warm boot. `GLCD.SVC`'s gives the console back to `CRT:` if `PICO.SVC` is in.

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

**Width is a startup line.** `PICO.SVC` is 80 columns, `PICO40.SVC` 40 and
`PICO32.SVC` 32 in Graphics I, and the ROM is one image for every board. The starter
card carries all three and names `PICO.SVC`.

One card can serve every board: a line for the PICO9918, then `GLCD.SVC`. Each line
makes its display the console where there is one, and elsewhere prints its name with
a question mark and goes on. On a board with both, `GLCD.SVC`'s line gives way once
`PICO.SVC` is the console, and only `CON UC1:` installs the second; the two together
cost 3,072 TPA bytes, leaving 43,782 on the starter card. Once, at the first prompt
after startup, a board with a PICO9918 and a matrix keyboard shows `PICO?` on the LCD
if no display driver is installed. That covers a missing file, a bad file, no
`STARTUP.CMD`, a file with no display line and a skip. It stays silent when the GLCD
has taken over from a bad `PICO.SVC`, or after a good load and `CON TTY`, and a board
with no matrix keyboard, which both drivers refuse, never shows it. A display driver
installed later clears the word. `CON UC1:` shows `GLCD?` if it can't load, a take
clears that too, and so does `GLCD.SVC` loading under `PICO.SVC`, which keeps the
console. A word goes only if it is still there: a program's write to row 3 through
hardware service `LCD` takes the row over, and no take clears it. A program writing the LCD's
port directly is unseen. Until a
display's line runs, the banner and volumes go to the serial terminal and the LCD. A
card that won't mount shows `CARD?` on the LCD at every failure, and `R` starts the LCD
again, so a good retry clears the word.

A board with no matrix keyboard refuses both drivers, so it has an unprogrammed VDP
until a program claims it. A claim with no `PICO.SVC` in restores nothing on release.

**The skip.** A keypad key held through reset, until the prompt, skips the file:
port `03h` bit 6 is read once, just before the open, about 1.46 s after reset. The
skip needs no driver and costs no boot time. A line that hangs or resets the
machine would otherwise run at every boot. `docs/diagnostics.md` records a conflict
over this bit's polarity: a board that reads it the other way would skip on every
boot. The web host has no keypad and no tool to clear the file, which can only be
overwritten by a copy or replaced with a new starter card.

**Recovery needs serial.** After a skip, or with no file, a board has its LCD and the
serial terminal: the matrix keyboard isn't read until a display's driver is in.

## Installation

A load runs only with no `INIT` or `REMOVE` running, which `SVCBSY` says. In order:

1. The file's magic, version, sizes and `INIT` and `REMOVE` are checked against
   the image and the file, and the base against `8000h`.
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

## What a service must do

**`INIT`** builds its records in its own memory and returns carry clear with HL
at the first, or 0 for none. A record is 13 bytes:

| Offset | Bytes | Contents |
| --- | --- | --- |
| 0 | 2 | The next record, 0 at the last |
| 2 | 8 | The record's name |
| 10 | 1 | Its interface version |
| 11 | 2 | Its entry table's address |

The loader checks that each record, its link and its table's address lie in the
service's pages, for at most 255 records, and then links them. It can't check an
entry table's contents. If a check fails it calls `REMOVE`; if `REMOVE` refuses,
the service stays installed with no records and the load reports 2.

`INIT` returning carry means it undid what it did. It installs hooks last, since
a warm boot inside it can't call anything back and a hook already in the table
would be left pointing into free memory. After a failed `INIT` the loader scans
the 17 entries of the RAM BIOS table for a target in the service: a hit keeps the
pages, not removable, and registers nothing. Vectors such as `ABIGLCD`'s table
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
| BDOS | 54 | 32 | 32 | 8 |
| BIOS | 38 | 16 | 16 | 12 |
| CCP | 30 | 16 | 22 | 6 |

The base is the deepest use on the serial and PICO9918 paths, with no resident.
The census is the deepest use of all, the CCP's 22 being `GLCD.SVC`'s. A limit is
counted from the base, so a stack holds its base and its limit with a quarter
free, but a service's figure added to the census leaves less: the CCP's stack
would then reach 28 of 30, the BDOS's 40 of 54. Nothing overflows. A declaration
is the service's promise, and `test/svc.test.mjs` shows how a stack watch proves
one: the ROM can't.

A program's stack can't be checked, so a service's own document states what a
program must leave. On the BDOS's stack a service may not call the BDOS, as
`BENTRY` would lose its frame.

## Records

A client finds a record with `ABISVC` (`docs/rom-services.md`):

- **A program** may keep a pointer until it exits. No service can be removed
  while it runs.
- **A service that needs another** names its record as a dependency and binds at `INIT`.
  The dependency is then above it in memory, and last in, first out removes the
  dependent first.
- **A service that looks up later** may not keep the pointer. Removing a
  service frees its pages, and a kept pointer runs whatever is there. `ABISVC`
  returns a generation, raised by each removal, for such a service to compare.
  It is 8 bits and wraps: after exactly 256 removals a stale pointer passes the
  comparison.

Each record's table is defined in a document with its interface version.

### `PICO`, version 2

`PICO.SVC`, at each width, offers `PICO` with the table it hands `ABIGLCD`, followed
by four words, the graphics entries:

| Offset | `abi.inc` | Registers | Effect |
| --- | --- | --- | --- |
| 16 | `PICOREG` | B = register, A = value | The VDP's register written |
| 18 | `PICOFIL` | HL = VRAM address, DE = count, A = value | VRAM filled |
| 20 | `PICOWR` | HL = VRAM address, DE = RAM address, BC = count | RAM copied to VRAM |
| 22 | `PICORD` | The same | VRAM copied to RAM |

Each assumes the caller holds the claim (hardware service `VIDEO`), as a program writing the
ports does, and checks nothing. A count of 0 moves nothing. Each destroys AF, BC, DE
and HL. `GLCD.SVC`'s `REMOVE` asks for version 1 and reads none of these. A board with
a PICO9918 and no matrix keyboard refuses the driver, so it has no entries: a
program there claims the VDP and writes the ports.

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
that the ROM doesn't offer: each display driver has its own font, checked by the
build against `format/font5x7.txt`. The build refuses a source
in `drivers/`, or `test/programs/svc*.asm`, that names a ROM address; `abi.inc`'s
names are the way in.

## Restart vectors and interrupts

Memory above the TPA is of three kinds: service resident memory, the workspace with
the RAM BIOS table, and the ROM. At cold boot, at every warm boot, after an unload and
after a failed `INIT`, a sweep of `0008h` to `003Fh` keeps a `JP` whose target's page is
at or above `PZTOP`'s page, and gives anything else its default: seven zeros and a
`RET`, or `EI; RETI` at `0038h`, the rest of that vector zero. The bound keeps all
three kinds. It also keeps a jump into the bytes of the stub's page below the stub,
which are the TPA's, and into a service's header.

A service claims `RST 1` to `RST 7` by flags bits 1 to 7. A load whose claimed slot
holds a `JP` is refused with nothing changed, `SVCRC` 0. `INIT` writes the vector
itself, so a write it didn't declare goes unseen, the rule that binds `ABIGLCD`'s table,
and a `JP` a finished program left into ROM counts as held until a reset. Unload gives
the claimed slots their defaults whatever they hold, and sweeps. A jump the service set
outside its pages in a slot it didn't claim is `REMOVE`'s to restore. A failed `INIT`
runs no `REMOVE`, so that, and turning off any interrupt source, are `INIT`'s duty. A
source left on under the default `EI; RETI` repeats for ever, and a warm boot inside
`INIT` leaves one on. A reset forgets the service and clears its vectors.

Nothing in the ROM enables interrupts: cold boot and warm boot leave them off, and each
routine that masks them restores what it found. A kept `0038h` therefore does nothing
after a warm boot until a program or a service sets `EI`, and a warm-boot hook chains
into `WBOOTR` with no service code after it. `MAIN 1` keeps its cold-boot page zero
for good, so a service whose vector matters there writes its own copy last, as with
hooks, and restores it in `REMOVE`. A warm boot inside `INIT` leaves that copy stale,
and no sweep reaches it.

The ROM and the display drivers mask what an interrupt could split: `VPAIR` for each
pair written to the VDP's control port, and serial's `TXBYTE` and `RXBITS` for a whole
byte, while their start-bit polls stay open. A program holding the claim masks its
own pairs. Function 47 from `INIT` or `REMOVE` is a warm boot there, like function 0,
`^C` or a disk error: from `INIT` the load rolls back, and from `REMOVE` the service
stays listed.
