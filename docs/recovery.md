# Write policy and recovery

## The block cache

TEC-OS keeps 30 card blocks, 15 KiB, in EXPAND 1. Every volume's reads go
through it: a block read before and still held costs a copy, not a card
read. A volume not written behind, A: among them, coalesces its data writes
there: a run of records into one card block is written once (below, "What a
successful write means"). A volume marked written behind (byte 15 of its
descriptor, `tecvol create`'s `:wb`) also keeps its writes there, and the card
catches up:

- at each write to the volume's directory, which first writes every data
  block the cache holds changed, then the directory block itself, so the
  directory never names a block whose data isn't on the card;
- when every block the cache holds is changed and another is needed;
- at every warm boot, so `^C` at the prompt writes everything;
- when `MOUNT` changes a drive.

Changed data blocks reach the card in the cache's line order, and the
directory block after them. A write to the directory that cannot get its
data to the card, or cannot write itself, drops the cache's copy of that
directory block, so the card's directory stays the truth and is read again
next time; the BDOS reports the failed write. A data block that failed stays
in the cache, still to be written, so a close tried again fails again until
the card takes the data.

A file is complete once it is closed, which is CP/M's own rule, but a write
can reach the card before the close, and nothing is rolled back. What a reset
or power off before the close leaves depends on where the write went:

- **Unwritten dirty data.** On a volume written behind, changed blocks the cache
  holds and hasn't written are lost. On A:, and any volume not written behind,
  the pending block is lost: the records written into it since it was last
  written, at most one block. Press `^C` at the prompt before pressing reset or
  taking the card out; the prompt's own console read writes A:'s pending block.
- **New allocations.** Blocks a write allocated reach the card, at the next
  flush point on a volume not written behind, or when the cache writes them on
  one written behind, but until the directory entry is written no entry names
  them: the file reads back without them, and the space is free again at the
  next login.
- **In-place overwrites.** A write into a block the file already had changes that
  block on the card when the block is written: on a volume not written behind
  at the next flush point, since the block is the pending one until then, and
  when the cache evicts or flushes it on one written behind. Until then a reset
  leaves the old contents on the card. Once written, the old contents are gone,
  closed or not: there is no copy to return to.

If a block cannot be written during a program's run, the BIOS returns the
error, the BDOS says `Bad Sector` and, under the shell, the rest of the line goes. A
flush, at a directory write on a volume written behind, at function 48, at
`MOUNT` or `UNMOUNT`, or at a warm boot, tries every changed line and goes on to
the rest. Function 48, `MOUNT` and unmount keep each line whose write fails,
as a directory write's flush does: function 48 returns FFh, `MOUNT` and unmount
refuse and leave the drives as they were, and the line is tried again at the
next flush. Only warm boot drops a line that still fails. A warm boot whose flush
dropped a line says `Write lost` once and drops the rest of the shell's line as a
BDOS error does; the next warm boot has nothing more to say.
While a kept A: or B: line keeps failing, B: directory writes and `MOUNT` refuse
until warm boot, since each flushes first; `MOUNT.COM` ends in a warm boot, which
drops the line. If the card refuses every write, kept lines can fill the cache,
and reads that need a line then fail too.

## What a successful write means

Every BIOS write goes into the block's cache line; there is no other buffer.

**A: coalesces.** Every data write on a volume not written behind (BDOS 21,
34 and 40, and `SAVE`) goes into its block's cache line, and a run of records
written into one card block is written once. A write returns when its record
is in the line. That block, the one pending block, is written to the card at
the first of: the file's close; any directory request; a write that moves to
another block; a warm boot; and the program's next console read, BDOS 1, 6
input, 10 or 11, or the BIOS's `CONIN`. Nothing is left unwritten while a
program waits for the user at a console read. Function 48, `MOUNT` and unmount
write it too. Until then a reset or power loss loses the records written into
that one block since it was last written: at most one block, four records, 512
bytes, and an in-place update of a closed file is among them. A block the card
refuses stays pending, and the directory never names it until the card has it.

- **The pending block** is at most one block at a time, the last one a data
  write went into on a volume not written behind.
- **A directory request** is any directory record the BDOS reads (open, make,
  search, delete, rename, attributes, size, login, and the extent change inside
  a sequential or random write) and any directory write. Selecting a drive
  already logged in reads no directory and is not one. Any close is one, even
  of a file that was not changed.
- **A write that moves to another block** is any BIOS write to another block,
  on any drive, B: included. BDOS 40's zero fill moves on one block at a time.
- **The console reads** are BDOS 1, BDOS 6 with E = FFh, 10 and 11, at entry,
  and the BIOS's `CONIN`, however it is called. Output, BDOS 3 and the BIOS's
  `CONST` and `READER` are not.
- **The directory stays last.** A directory write first writes the pending
  block, then the directory block, so no entry names a block whose data is not
  on the card. A directory write itself goes to the card before it returns;
  if it fails, its line is dropped, so the next read of the block comes from
  the card.

**When the pending block's write fails.** The block stays in its line, still
pending, at every flush point but warm boot.

- When writing moves on, or at a directory request, the call that made the
  flush returns the error: `Bad Sector`, or, under function 45's FFh mode,
  A = FFh and H = 1 with the FCB on the record not written. A close tried again
  fails again until the card takes the block.
- Function 48, `MOUNT` and unmount report the failure, as above, and keep the
  block.
- At a console read the failure is not reported there: the program gets its
  key and the block stays pending. It is reported at the next flush point that
  is not a console read, or by warm boot's `Write lost`. While the card answers
  but refuses, each console read tries the block again, about 55 ms at 4 MHz.
- Warm boot tries it once more, and drops it with `Write lost` if it fails.

Writing one 128-byte record reads its block into a line first (unless a line
already holds it), merges the record and writes the whole block back, so
neighbouring records are never replaced by stale data. The exception is a
block that holds nothing yet: the first write to a newly allocated block
(CP/M's write type 2), and the next blocks of that allocation block as a
program writes on into them. Such a block is not read; its records not yet
written are zeros.

When a program has asked for BDOS errors to be returned (function 45), a
sequential read or write that fails leaves the FCB on the record it did not
read or write, as CP/M 3 does, so the program can try that record again.

Whether a card that has reported completion has also made the data durable
against power loss is up to the card. That is not verified.

## The corruption window

A CP/M file update touches data blocks, then the directory entry. TEC-OS adds
no journal, so power loss or reset can leave:

- **Between data and directory writes.** Newly allocated blocks hold records
  that the directory does not list, and their space is free again in the
  allocation vector rebuilt at the next login. Blocks the file already had and
  were written in place hold the new records: the file reads back mixed, old
  where nothing was written and new where it was, with its old length.
- **On a volume not written behind, before a flush point.** The pending block's
  records since it was last written are lost, at most one block; the card keeps
  its old contents.
- **On a volume written behind, before a directory write.** The changes since
  the last directory write, warm boot or `MOUNT` that the cache still holds
  unwritten are lost. Some may already be on the card, written when their
  lines were taken for other blocks, so the card can hold a mix of old and new
  blocks; as above, nothing is rolled back.
- **On a volume written behind, during a flush.** The changed data blocks
  reach the card one by one in line order and the directory block last, so a
  cut leaves some new data blocks that no entry names, as above, and never a
  directory entry naming a block whose data is not there. A flush tries every
  line; one whose write fails is dropped and the rest are still written.
- **During a block write.** One 512-byte block may hold old, new or mixed
  contents. If it is a directory block, up to 16 directory entries can be
  damaged.
- **During `tecvol` editing on the PC.** `tecvol` writes a complete new image
  beside the old one and renames it into place, so an interrupted edit leaves
  the old image intact.

## Recovery procedure

1. Copy the card image to the PC (`dd`, or any raw copy tool) before doing
   anything else.
2. Run `tecvol verify IMAGE`. It reports blocks allocated twice, blocks
   beyond the volume and missing directory extents.
3. Export what can be read with `tecvol get`, then build a fresh container
   with `tecvol create` and `tecvol put`, or from a recipe.
4. Install the new image with `tecvol install IMAGE DEVICE --yes`.

The PC and TEC-OS must never write the same card at the same time. Remove
the card from the TEC-1G, or hold it in reset, while the PC has it.

## Three paths

TEC-OS comes back from a program in one of three ways, and the hardware reset
signal doesn't distinguish the last two.

| Path | Volumes | Everything else |
| --- | --- | --- |
| Ordinary exit: a program's return, `^C`, or `JP 0000h` | Unchanged | Warm boot: dirty lines written, services and registry kept |
| Recognised reset | The selection, each volume checked against the card | Rebuilt |
| Unrecognised reset | The card's defaults | Rebuilt |

A reset is recognised from what TEC-OS left in RAM: page zero's jumps, and the BDOS
entry stub at its address, jumping to this ROM's BDOS. The test reads and runs
nothing old, and power-up RAM, or RAM from a build with another BDOS entry (`BENTRY`)
or stub address (`STUBAD`), fails it. It doesn't read the drive table, so a
damaged `DRVTAB` passes it, and so does RAM from any build with the same
`BENTRY` and `STUBAD` addresses, whatever its drive table holds. The harm stops at a volume
checked against the card: the retained drives must match the card's descriptors
as below, or the defaults are taken, and a drive whose geometry is 0 is not
retained, whatever its other bytes. There is no signature to clear: what proves
the selection is that the volumes are still on the card.

Only the selection is kept. Page zero, the workspace, services, the registry, the
cache, open files, the shell and its history and the TPA ceiling are all rebuilt, and a reset
starts at user 0 on the console cold boot picks, `CRT:` when the PICO9918 answers and the
matrix keyboard is fitted and the serial terminal otherwise ([console.md](console.md)), with
startup run once from the selected A:.

Each drive's start, length, geometry and flags must match one descriptor of the card
now in the socket, and fit the slot that drive has, or the selection is dropped whole
and the card's defaults stand. Nothing is half applied. A card that won't mount goes
to the diagnostic prompt as always, and `R` applies the selection if the retry works.
A drive unmounted before the reset stays unmounted, and can be mounted after it.

Limits:

- RAM with no warm boot behind it isn't recognised, so a reset at the diagnostic
  prompt or during a boot, rather than `R`, gives the defaults.
- There is no route back to the defaults but losing RAM: every recognised reset
  reapplies the selection, and the keypad skip keeps it. A board whose selected A:
  has no driver stays as it is until the volume is mounted away or power goes.
- Identity is extents, not a name: a card with identical extents takes the
  selection, and a card that changed only its default letters keeps it.

**Flush before a reset.** A reset discards dirty lines, A:'s pending block among
them, and never writes them, to the old card or a new one. Press `^C` at the prompt
before a reset or taking the card out.

## A damaged directory

A block number past the end of a volume has no place in the allocation vector,
so logging the drive in passes over it, on drive A too. Reading that block says
`Bad Sector`, the rest of the volume works, and `ERA` takes the file.

## Card removal

**A changed card needs a reset.** The TEC-1G has no card-detect line, and
TEC-OS initialises the card only at cold boot. Removing the card while
TEC-OS runs is an I/O error: the next disk access that needs the card fails,
the BDOS reports `Bad Sector` and warm boots. A read of a block the cache
holds still succeeds, and a write behind still goes into the cache; the
warm boot then says `Write lost` for what it could not write. A warm boot keeps the mounts and keeps each
drive logged in with its allocation vector, so it cannot see that the card
is a different one. A card put in after that answers no read until reset.
Press reset after changing cards.

**Lines still dirty when a card comes out are lost.** That holds for the same
card put back, and for A:'s pending block: with the card out, or another or the
same card put in, every flush point fails, a close returns the error each time,
and the block is never written onto the card put in. Only cold boot starts a card, so the first warm boot after the
card comes out says `Write lost` and drops those lines, and a reset discards any
written behind since. Restarting a card to write to it
is left out by choice: TEC-OS doesn't read a card's CID, so a different card would
take these lines.

A warm boot rebuilds a drive's allocation vector from its directory when
anything has changed it since its last scan: a file written, closed or
erased, or any BIOS write into its directory blocks. It scans as far as the
directory's highest entry in use. A drive nothing has changed keeps its
vector, after a check that a program has not written over it, so a warm
boot reads no block. A program's BDOS function 13 still scans every drive in
full, as CP/M 2.2 does.
