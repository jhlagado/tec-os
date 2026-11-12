# Container format, version 1.1

A TEC-OS card holds one container: a contiguous image whose block 0 is the
header. The PC tool `tecvol` builds and edits it as an ordinary file and
`tecvol install` writes it raw from card block 0. The format's field
positions, limits and geometries are defined once, in `format/format.json`;
the ROM build and the host tools both read that file.

All multi-byte fields are little-endian. A block is 512 bytes. Block numbers
are relative to the start of the container.

## Header (block 0)

| Offset | Size | Field |
| --- | ---: | --- |
| 0 | 8 | Magic `"TECOSVOL"` |
| 8 | 1 | Major version, 1. Any other value is rejected |
| 9 | 1 | Minor version: 0 or 1. Later minors are accepted |
| 10 | 2 | Header bytes, 512 |
| 12 | 2 | Descriptor bytes, 32 |
| 14 | 2 | Volume count: 1–8 in version 1.0, 1–127 in 1.1 |
| 16 | 4 | Container length in blocks |
| 20 | 2 | Checksum: 16-bit sum of all 512 header bytes except these two |
| 22 | 1 | 1.1: the drives the card wants, 1–4 (0: as many as it mounts); reserved in 1.0 |
| 23 | 2 | 1.1: 16-bit sum of the table's blocks after block 0 (see below); reserved in 1.0 |
| 25 | 7 | Reserved, zero |
| 32 | 32 × n | Volume descriptors, the first 15 |

## Volume descriptor

| Offset | Size | Field |
| --- | ---: | --- |
| 0 | 4 | Volume id: nonzero and unique in the container |
| 4 | 4 | Start block: nonzero, a multiple of 8 |
| 8 | 4 | Length in blocks: exactly the geometry's payload |
| 12 | 1 | Geometry id |
| 13 | 1 | Flags: bit 0 read-only; other bits must be zero |
| 14 | 1 | Drive: 0–3 for A–D, FFh not mounted |
| 15 | 1 | Cache flags: bit 0, the volume is written behind (see below); other bits zero |
| 16 | 11 | Label, ASCII, space padded |
| 27 | 5 | Reserved, zero |

The drive letter is a mount assignment, not an identity; the volume id is
the stable name.

A volume with byte 15 bit 0 set is written behind: TEC-OS keeps its writes
in the block cache and writes them to the card later (see
[recovery.md](recovery.md)). Every other volume coalesces its data writes:
each card block's run of records is written once, at the next flush point
(the same page). One volume at most is written behind, and never
a read-only one; `tecvol create` takes `:wb` after the drive, as in
`--volume G8M:WORK:B:wb`, and refuses a second one or `:wb` with `:ro`. A
ROM from before the cache ignores the byte and writes the volume through.

## The volume table beyond block 0 (1.1)

Block 0 holds the header and the first 15 descriptors. A 1.1 card of more
volumes continues the table in blocks 1–7, 16 descriptors to a block, up to
127 in all; no volume can start below block 8, so those blocks are always
free. The header's table sum is the 16-bit sum of every byte of the blocks
that hold descriptors (`count / 16` of them, rounded down). In 1.1 the
labels are unique. In every version the descriptors are in ascending order
of start block, and a 1.1 card that asks for N drives mounts no volume on a
drive past the Nth. A ROM that reads only 1.0 refuses a card of more than 8 volumes on its
count, and mounts a 1.1 card of 8 or fewer as before.

## Allocation vectors

At cold boot each drive gets its allocation vector below the resident
workspace. A 1.1 card that asks for N drives gets a G8M-sized vector (256
bytes) for each of drives A to the Nth, mounted or not, so that any of them
can take any volume at run time. Any other card gets a vector for each
drive it mounts, sized for that volume, which keeps the TPA as large as
possible; a drive can then be remounted only with a volume whose vector
fits.

## Checks

The ROM refuses to mount anything unless every check passes, and then reports
the error code on the diagnostic console:

| Code | Check |
| --- | --- |
| 20h | Block 0 unreadable |
| 21h | Magic |
| 22h | Major version |
| 23h | Header or descriptor size, or a 1.1 drives field above 4 |
| 24h | Volume count: 1–8 in 1.0, 1–127 in 1.1 |
| 25h | Checksum, or the 1.1 table sum |
| 26h | Descriptor id, flags, geometry, length or alignment |
| 27h | Payload beyond the container, or a 32-bit sum that wraps |
| 28h | A payload starting before the previous one ends: out of start order, or overlapping |
| 29h | Drive letter out of range, past the 1.1 drives field's N, or assigned twice |
| 2Ah | No volume mounted as drive A |

The ROM checks the table in one pass, in table order. `tecvol` applies the
same checks, so a card `tecvol verify` passes mounts, and also requires
unique ids, known cache flags, at most one volume written behind and never a
read-only one, at most 8 volumes in 1.0 and unique labels in 1.1, and an image as
long as the header says. The ROM cannot check the card's capacity; a payload past the
end of the card fails as an I/O error when it is reached.

## Geometries

Every version 1 geometry has 128-byte records, 64 records per track, no
reserved tracks, no sector skew and no checksum vector (the card is fixed
media). Record r of a volume is byte `128 × r` of its payload; four records
share one block.

| Id | Name | Payload | Block size | DSM | Directory entries | EXM |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | G8M | 8 MiB | 4 KiB | 2047 | 512 | 1 |
| 2 | G1M | 1 MiB | 2 KiB | 511 | 256 | 0 |

A volume's payload is an ordinary CP/M 2.2 directory and allocation area, so
standard tools can read it with a matching disk definition. For example,
cpmtools `diskdefs` for G8M:

```text
diskdef tecos-g8m
  seclen 128
  tracks 1024
  sectrk 64
  blocksize 4096
  maxdir 512
  skew 0
  boottrk 0
  os 2.2
end
```

## RAM cost

`DPHTAB` is a fixed 64 bytes, 16 for each of the four drives, whatever is
mounted. Each mounted drive also costs an allocation vector in the classic
bank, one bit for each block of its geometry: 64 bytes for G1M, up to 256.
TEC-OS mounts up to four drives.
