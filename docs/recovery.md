# Write policy and recovery

## Restoring SYSTEM from the bare prompt

If A: presents GAMES rather than SYSTEM, a recognised reset keeps that
selection and can leave a bare `A>` because GAMES has no shell startup.
The ROM now provides the same basic CD selection syntax as the shell:

```text
A>CD ?
A>CD A:SYSTEM
A>USER 0
A>SHELL.SVC
A:SYSTEM>
```

`CD ?` lists the available named directories and their assigned drives.
`CD A:SYSTEM` restores SYSTEM on A: without changing the current drive or
user area. The starter's shell file is in user 0; there is no hidden
user-zero search for a service. A reset already starts in user 0, so USER 0
is only needed if you have changed it. A refused selection reports
`CD FAILED` or its more specific name/conflict error and keeps the previous
selection. Power cycle restores the card's default drive assignments.

## The block cache

TEC-OS keeps thirty full 512-byte card blocks in EXPAND1. Read hits still
avoid SD reads. Each changed block has one dirty-queue entry, identified by
its complete absolute card-block tag. Updates already received merge into
that block without duplicating its entry or moving its first-dirty position.
New-allocation writes zero the untouched records; ordinary overwrites retain
their neighbours. TEC-OS does not delay a ready write to await future updates.

**Integrity takes priority at OS calls.** Each admitted outer BDOS, hardware
service or returning BIOS call attempts one eligible dirty block before its
normal work. Nested calls inherit that operation instead of starting another
maintenance pass. The worker owns a private stack and excludes unsafe bank/SD
spans. Console output and directory scanning have selected additional safe
points. This is cooperative service, with no timer or wall-clock deadline.

A frozen round records the eligible first-dirty order. A failed line remains
dirty, but the round advances so other lines can progress. New arrivals join
the next round; continuously arriving writes cannot indefinitely postpone a
failed line's next retry. Successful writes remove their entry, invalidating
its frozen slot before that cache line can be reused.

The logged drive can keep multiple changed blocks. Other drives retain their
existing single pending-block boundary: changing blocks flushes that pending
block. The ordinary entry attempt now also applies between public calls, so
four separately issued record writes can require four SD writes. Read caching
and merging updates already received still help; cross-call write coalescing
is no longer promised. A read-only volume continues to refuse writes.

## Required flushes and failures

The ordinary one-block attempt supplements required flushes:

- A directory write first tries all other dirty data in a bounded pass, then
  writes the directory block only if those prerequisites succeeded. Either
  prerequisite or metadata failure rejects and drops that unpublished
  directory image. Later retries must not publish rejected metadata.
- Console input through BDOS1,6 input,10 or11 and BIOS CONIN drains pending
  data before waiting. Function48, a close's directory work, directory access,
  drive/selection changes and warm boot retain their required flush paths.
- A complete pass attempts each eligible line once and continues after
  failure. All-dirty allocation can use any clean slot the pass frees. If
  every line refuses, the operation fails without discarding acknowledged data.

Failed acknowledged data remains dirty and queued, including across warm
boot. Required operations preserve their existing error conventions: for
example function48 returns FFh and a failed selection leaves its assignments
unchanged. A maintenance failure during an unrelated call does not replace
that call's functional result; guest notices report the pending write state:

- `Write pending`: once while a failed-write episode has dirty data to retry.
- `Cache clear`: after that reported episode's queue is successfully drained.
- `Write error`: an otherwise unreported failure has no dirty retry left,
  such as rejected metadata. This is not reported as successful recovery.

Function45's silent FFh mode defers notices without losing the event. Console
callbacks must return normally and keep their logical caller's BDOS reentry
restrictions. A private worker stack does not make BDOS generally reentrant.
Warm-boot flush failure also drops the remaining chained command text while
retaining the failed data; it no longer drops data with `Write lost`.

If the bootstrap disk reset or saved-drive selection fails, TEC-OS prints
`Disk reset failed` and `Enter retries`. This is a recovery console. Press
Enter to retry the disk reset; normal commands resume once the default disk
state is valid. Other keys, including LF, do not retry it. Printing and
reading input still provide housekeeping opportunities. Enter does not
initialise a newly inserted card. If cold startup was already buffered, it
waits until recovery succeeds and then runs once. Pausing output with ^S and
then pressing ^C deliberately warm boots back into recovery; ^C at the retry
input is ignored. Pending data survives these retries, while reset still
discards it.

## What a successful write means

A successful data write can mean its record is accepted into the cache.
An immediate application stop after that write can still leave old SD bytes.
The next admitted light call attempts pending work; the guest-stop tests
distinguish that case from a stop with no further API call. A program that
hangs without calling the OS can hold data indefinitely. There is no minimum
call cadence or background progress guarantee.

Required console input drains the queue, subject to reported errors. BIOS
CONST and raw reader entry provide ordinary opportunities, not mandatory
complete drains. A replacement CONIN hook owns the input behaviour it
replaces. TONE has its entry opportunity and no new long-call deadline.

Closing a modified file completes its directory work under CP/M rules;
committing record data alone does not finish an unclosed new file's metadata.
New allocations can reach SD before any directory entry names them. In-place
overwrites change the old file as each block reaches SD, closed or not:
there is no journal or rollback. A card's acknowledgement is not proof of
physical power-loss durability. In the Viewer, guest cache completion and
completed browser persistence are separate stages.

## The corruption window

Reset or power loss can still interrupt an update:

- Before a dirty block commits, its latest cached records can be lost.
- Between data and directory writes, new blocks can lack directory entries;
  an existing file can contain mixed old and new blocks with its old length.
- During a flush, successful data blocks reach SD in first-dirty order and
  directory metadata follows its prerequisites. Failed acknowledged data
  remains available for retry in RAM, including through warm boot.
- During one SD block write, old, new or mixed contents can remain. A damaged
  directory block can affect up to sixteen entries.
- PC-side `tecvol` editing writes a new image beside the old one and renames
  it into place, so an interrupted edit leaves the old image intact.

## Recovery procedure

1. Copy the card image to the PC before making repairs.
2. Run `tecvol verify IMAGE` to check allocation and directory extents.
3. Export readable files with `tecvol get`, then build a fresh container with
   `tecvol create` and `tecvol put`, or from a recipe.
4. Install the image with `tecvol install IMAGE DEVICE --yes`.

The PC and TEC-OS must never write the same card at the same time. Remove it
from the TEC-1G, or hold the board in reset, while the PC has it.

## Three paths

TEC-OS comes back from a program in one of three ways, and the hardware reset
signal doesn't distinguish the last two.

| Path | Volumes | Everything else |
| --- | --- | --- |
| Ordinary exit: a program's return, `^C`, or `JP 0000h` | Unchanged | Warm boot: dirty lines attempted, failures retained, services and registry kept |
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
- Every recognised reset reapplies the selection, and the keypad skip keeps
  it. Use the ROM's `CD` to select SYSTEM again if A: has no shell or driver.
  Power cycle restores all the card's default drive assignments.
- Identity is extents, not a name: a card with identical extents takes the
  selection, and a card that changed only its default letters keeps it.

**Wait for successful writes before reset.** Reset discards dirty lines and
never writes them to the old card or a new one. Normal prompt input drains
them, but a prompt after `Write pending` is not proof of completion. Resolve
the write failure and wait for `Cache clear` before reset or removal.

**`CD A:` and a reset.** A recognised reset keeps the drives' selection, so
after `CD A:` to a volume without `SHELL.SVC` (`CD A:GAMES` on the starter
card) a reset gives the bare `A>` on that volume. Use `CD ?`, `CD A:SYSTEM`
and `SHELL.SVC` to restore the shell, as above. Power off and on gives the
card's own drives and shell again; on the web page, Power cycle.

## A damaged directory

A block number past the end of a volume has no place in the allocation vector,
so logging the drive in passes over it, on drive A too. Reading that block says
`Bad Sector`, the rest of the volume works, and `ERA` takes the file.

## Card removal

**A changed card needs a reset.** The TEC-1G has no card-detect line and
TEC-OS initialises SD only at cold boot. Removing a running card causes I/O
failures; cache hits can still read and accepted writes can still enter RAM.
Warm boot retains failed data and warns `Write pending`, but cannot restart
the card or verify its identity. Inserting the same or another card does not
make those writes safe or successful. Reset after changing cards discards
that retained cache. TEC-OS does not read CID and deliberately avoids
reinitialising an inserted card and replaying data onto a possible stranger.

Persistent refusal can fill the dirty cache. Reads that need a new line then
fail if a bounded pass frees none; healthy lines can still make progress.
Input polling's required complete flush can be slow while many lines refuse.
Warm boot preserves those failed lines rather than using data loss to make
polling faster. The user must resolve the original backend failure or accept
that resetting will discard the pending RAM contents.

A warm boot rebuilds a drive's allocation vector from its directory when
anything has changed it since its last scan: a file written, closed or
erased, or any BIOS write into its directory blocks. It scans as far as the
directory's highest entry in use. A drive nothing has changed keeps its
vector, after a check that a program has not written over it, so a warm
boot reads no block. A program's BDOS function 13 still scans every drive in
full, as CP/M 2.2 does.
