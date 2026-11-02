# Write policy and recovery

## The block cache

TEC-OS keeps 30 card blocks, 15 KiB, in EXPAND 1. Every volume's reads go
through it: a block read before and still held costs a copy, not a card
read. A volume marked written behind (byte 15 of its descriptor, `tecvol
create`'s `:wb`) also keeps its writes there, and the card catches up:

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
next time; the BDOS reports the failed write.

A file is safe once it is closed, which is CP/M's own rule. Data written
and not yet closed is lost by a reset or power off, and never reaches any card:
press `^C` at the prompt before pressing reset or taking the card out. If a data block cannot be
written, it stays changed in the cache, and each warm boot tries it again
and says `Write lost` while it still fails, dropping the rest of a chained
line as a BDOS error does. Only a reset, or power off, gives it up.

## What a successful write means

On every volume not written behind, a BIOS write returns success only after
the SD card has accepted the 512-byte block and stopped reporting busy. The
deblocking buffer always matches the card, or is marked invalid after a
failed write, and the cache's copy of the block is refreshed from it, or
dropped.
Writing one 128-byte record reads its block first (unless the buffer already
holds it), merges the record and writes the whole block back, so neighbouring
records are never replaced by stale data. The exception is a block that holds
nothing yet: the first write to a newly allocated block (CP/M's write type 2),
and the next blocks of that allocation block as a program writes on into
them. Such a block is not read; its records not yet written are zeros.

Whether a card that has reported completion has also made the data durable
against power loss is up to the card. That is not verified.

## The corruption window

A CP/M file update touches data blocks, then the directory entry. TEC-OS adds
no journal, so power loss or reset can leave:

- **Between data and directory writes.** The data blocks hold new records
  that the directory does not list. The file reads back as it was before the
  write. The space stays free in the allocation vector rebuilt at the next
  login, so it is reused.
- **On a volume written behind, before a directory write.** Every change
  since the last directory write, warm boot or `MOUNT` is still in the cache
  and is lost; the card holds the volume as it was then.
- **On a volume written behind, during a flush.** The changed data blocks
  reach the card one by one in line order and the directory block last, so a
  cut leaves some new data blocks that no entry names, as above, and never a
  directory entry naming a block whose data is not there.
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
| Ordinary exit: a program's return, `^C`, or `JP 0000h` | Unchanged | Warm boot: dirty lines written, drivers and registry kept |
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

Only the selection is kept. Page zero, the workspace, drivers, the registry, the
cache, open files, the history and the TPA ceiling are all rebuilt, and a reset
starts at user 0 on the serial console, with startup run once from the selected A:.

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

**Flush before a reset.** A reset discards dirty lines and never writes them, to the
old card or a new one. Press `^C` at the prompt before a reset or taking the card out.

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

A warm boot rebuilds a drive's allocation vector from its directory when
anything has changed it since its last scan: a file written, closed or
erased, or any BIOS write into its directory blocks. It scans as far as the
directory's highest entry in use. A drive nothing has changed keeps its
vector, after a check that a program has not written over it, so a warm
boot reads no block. A program's BDOS function 13 still scans every drive in
full, as CP/M 2.2 does.
