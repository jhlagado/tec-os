# Drivers

Status: **Built**, 2026-10-31: the loader, the registry, the commands, startup
and `GLCD.DRV`, the first real driver. `test/drv.test.mjs` and
`test/startup.test.mjs` hold them.

A driver is a resident in EXPAND 0, below `(0006h)`, in whole pages. It
offers named services through the registry and calls the ROM only through
the table at `C003h`. This document is the interface: what a driver must do,
and what the ROM does for it.

## The file

A `.DRV` file is the image, made for page 0 with its header at the start, then
the dependencies, then the relocation data. `tools/lib/drv.mjs` writes one from
two assemblies. Records are whole on disk, so a file's end is rounded, and the
loader ignores what follows its relocation data.

| Offset | Bytes | In the file | In memory |
| --- | --- | --- | --- |
| 0 | 1 | Magic, `44h` | The registry's head before it, 2 bytes |
| 1 | 1 | Format version, 1 | |
| 2 | 1 | Number of dependencies | The owner before it, a page |
| 3 | 1 | Flags: bit 0 removable | The same; 0 if a hook kept the pages |
| 4 | 2 | `REMOVE`, from the header's start | The same |
| 6 | 2 | Header and image, in bytes | `JP` to the top before it, 3 bytes |
| 8 | 2 | Extra memory after the image, not cleared | Its low byte is the `JP`'s last |
| 10 | 2 | Relocation data, in bytes | Unused |
| 12 | 3 | Stack use: BDOS, BIOS, CCP | Each stack's room left below this driver |
| 15 | 2 | `INIT`, from the header's start | Unused |
| 17 | 8 | Name, padded with spaces | The same |
| 25 | | The image | |

The header is 25 bytes and goes into memory with the image, the loader writing
over the fields a load has finished with, so the file carries no padding. The
`JP` lands at the page's `xx06h`, where `(0006h)` must point.

A dependency is 9 bytes: its least version, then a service's 8-byte name.

The relocation data is a list of gaps. Each byte is the distance to the next
byte to relocate, the first from the byte before the image; 255 moves on with
nothing relocated. Each marked byte, the high byte of an address, has the
driver's page added.

## Commands

`NAME.DRV`, or `B:NAME.DRV`, reads that file and installs it. The type must be
typed: `NAME` alone still looks for `NAME.COM` and then `NAME.PRL`. If the file
won't read, or the load is refused or fails, the command's name comes back with
a question mark, as for any command that won't run. If the driver gave
`ABIGLCD` a table, the GLCD becomes the console, unless a PICO9918 is.

`DRIVERS` prints one line for each driver, the newest first: its name and its
pages. It walks the owner list, so a driver with no services is listed.

`UNLOAD` removes the lowest resident, as below, and answers the same way if it
can't.

## Startup

At cold boot only, `A:STARTUP.CMD`, if there is one, runs before the first
prompt. One record is read once, into RAM: **at most 128 bytes**, and anything
after them isn't run. The file isn't read again, so a warm boot doesn't repeat
it and `USER 3` in a line can't affect it. Each prompt at level 0 takes the next
line in place of the keyboard, echoed as if typed, so a program's warm boot, a
built-in's return and `EXIT` all reach the next line by the same route. A nested
level takes no lines; `EXIT` resumes them.

A line ends at CR or LF, and blank lines are passed over. `^Z`, a zero or the
128th byte ends the file, and a line that reaches the 128th byte still runs. A
line that fails prints its usual message and the next runs.

One card can serve every board. A line naming `GLCD.DRV` makes the GLCD the
console where there is one, and elsewhere prints `GLCD.DRV?` and goes on.

**The skip.** A keypad key held through reset skips the file: port `03h` bit 6 is
read just before the open, so the skip needs no driver and costs no boot time.
A line that hangs or resets the machine would otherwise run at every boot. The
web host has no keypad, so it clears the file through its own card tools.

**Recovery needs serial.** After a skip, or with no file, a GLCD board has its LCD
and the serial terminal: the matrix keyboard isn't read until the driver is in.

## Installation

A load runs only at level 0, with no `INIT` or `REMOVE` running. In order:

1. The file's magic, version, sizes and `INIT` and `REMOVE` are checked against
   the image and the file, and the base against `8000h`.
2. Each dependency must be installed, at its least version or above.
3. Each stack's figure must fit the room left.
4. The image is relocated and any fixup past it refused.
5. The header and image move to their pages and `(0006h)` is lowered.
6. `INIT` runs. `PZTOP` is untouched, so a warm boot during `INIT` puts the
   ceiling back by itself.
7. The records are checked and linked, and `PZTOP` is written. That word is the
   commit.

Until step 5 a refusal leaves everything but the file as it was. `DRVLOAD`
returns carry clear when installed. With carry set, `DRVRC` is 0 for refused,
1 for a failure leaving nothing behind, and 2 for a failure with the pages kept.

## What a driver must do

**`INIT`** builds its records in its own memory and returns carry clear with HL
at the first, or 0 for none. A record is 13 bytes:

| Offset | Bytes | Contents |
| --- | --- | --- |
| 0 | 2 | The next record, 0 at the last |
| 2 | 8 | The service's name |
| 10 | 1 | Its interface version |
| 11 | 2 | Its entry table's address |

The loader checks that each record, its link and its table's address lie in the
driver's pages, for at most 255 records, and then links them. It can't check an
entry table's contents. If a check fails it calls `REMOVE`; if `REMOVE` refuses,
the driver stays installed with no services and the load reports 2.

`INIT` returning carry means it undid what it did. It installs hooks last, since
a warm boot inside it can't call anything back and a hook already in the table
would be left pointing into free memory. After a failed `INIT` the loader scans
the 17 entries of the RAM BIOS table for a target in the driver: a hit keeps the
pages, not removable, and registers nothing. Vectors such as `ABIGLCD`'s table
can't be scanned, so that rule binds the driver.

While `INIT` or `REMOVE` runs, `ABIXCCP`, `ABIXCMD`, a load and a removal are
refused. A warm boot ends that state.

**`REMOVE`** undoes `INIT`, restoring hooks in reverse order, and returns carry
clear, or carry set to refuse, leaving everything as it was. It may be called
after a record check failed. `UNLOAD` calls it, from the CCP at level 0, so no
program is running.

## Stacks

A driver runs on its caller's stack, and that is one of four. Its header
declares its additional use on each of the three the ROM owns. The loader
refuses a driver that takes a stack's sum past its limit:

| Stack | Reserved | Base | Census | Limit for drivers |
| --- | --- | --- | --- | --- |
| BDOS | 54 | 32 | 34 | 8 |
| BIOS | 38 | 16 | 16 | 12 |
| CCP | 30 | 16 | 22 | 6 |

The base is the deepest use on the serial and PICO9918 paths, with no resident.
The census is the deepest use of all, 34 and 22 being `GLCD.DRV`'s. A limit is
counted from the base, so a stack holds its base and its limit with a quarter
free, but a driver's figure added to the census leaves less: the CCP's stack
would then reach 28 of 30, the BDOS's 42 of 54. Nothing overflows. A declaration
is the driver's promise, and `test/drv.test.mjs` shows how a stack watch proves
one: the ROM can't.

A program's stack can't be checked, so a driver's own document states what a
program must leave. On the BDOS's stack a driver may not call the BDOS, as
`BENTRY` would lose its frame.

## Services

A client finds a service with `ABIDRV` (`docs/rom-services.md`):

- **A program** may keep a pointer until it exits. No driver can be removed
  while it runs.
- **A driver that needs another** names it as a dependency and binds at `INIT`.
  The dependency is then above it in memory, and last in, first out removes the
  dependent first.
- **A resident that looks up later** may not keep the pointer. Removing the
  service frees its pages, and a kept pointer runs whatever is there. `ABIDRV`
  returns a generation, raised by each removal, for such a resident to compare.
  It is 8 bits and wraps: after exactly 256 removals a stale pointer passes the
  comparison.

Each service's table is defined in a document with its interface version.

## Removal

`UNLOAD` acts on the lowest resident only, read from `PZTOP`, and only if the
owner list's head is its page. If the flag says it isn't
removable, or its `REMOVE` refuses, `UNLOAD` says so and changes nothing.
Otherwise the registry and owner heads go back to what they were before it, the
generation rises, and `PZTOP` and `(0006h)` go back to the top before it. Warm
boot keeps drivers and the registry; a reset empties both.

## Rules for a source

A driver calls the published table and nothing else. The build refuses a source
in `drivers/`, or `test/programs/drv*.asm`, that names a ROM address; `abi.inc`'s
names are the way in. No driver owns an interrupt: `PZINIT` rewrites `0038h` and
the restart vectors at each warm boot, so a handler wouldn't last until `REMOVE`.
