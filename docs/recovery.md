# Write policy and recovery

## What a successful write means

A BIOS write returns success only after the SD card has accepted the 512-byte
block and stopped reporting busy. Nothing is cached dirty: the deblocking
buffer always matches the card, or is marked invalid after a failed write.
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

## Card removal

**A changed card needs a reset.** The TEC-1G has no card-detect line, and
TEC-OS initialises the card only at cold boot. Removing the card while
TEC-OS runs is an I/O error: the next disk access fails, the BDOS reports
`Bad Sector` and warm boots. A warm boot keeps the mounts and keeps each
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
