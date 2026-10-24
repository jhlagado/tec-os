# Container format, version 1.0

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
| 9 | 1 | Minor version, 0. Later minors are accepted |
| 10 | 2 | Header bytes, 512 |
| 12 | 2 | Descriptor bytes, 32 |
| 14 | 2 | Volume count, 1–8 |
| 16 | 4 | Container length in blocks |
| 20 | 2 | Checksum: 16-bit sum of all 512 header bytes except these two |
| 22 | 10 | Reserved, zero |
| 32 | 32 × n | Volume descriptors |

## Volume descriptor

| Offset | Size | Field |
| --- | ---: | --- |
| 0 | 4 | Volume id: nonzero and unique in the container |
| 4 | 4 | Start block: nonzero, a multiple of 8 |
| 8 | 4 | Length in blocks: exactly the geometry's payload |
| 12 | 1 | Geometry id |
| 13 | 1 | Flags: bit 0 read-only; other bits must be zero |
| 14 | 1 | Drive: 0–3 for A–D, FFh not mounted |
| 15 | 1 | Reserved, zero |
| 16 | 11 | Label, ASCII, space padded |
| 27 | 5 | Reserved, zero |

The drive letter is a mount assignment, not an identity; the volume id is
the stable name.

## Checks

The ROM refuses to mount anything unless every check passes, and then reports
the error code on the diagnostic console:

| Code | Check |
| --- | --- |
| 20h | Block 0 unreadable |
| 21h | Magic |
| 22h | Major version |
| 23h | Header or descriptor size |
| 24h | Volume count |
| 25h | Checksum |
| 26h | Descriptor id, flags, geometry, length or alignment |
| 27h | Payload beyond the container, or a 32-bit sum that wraps |
| 28h | Overlapping payloads or duplicate ids |
| 29h | Drive letter out of range or assigned twice |
| 2Ah | No volume mounted as drive A |

`tecvol` applies the same checks and also requires the image to be as long as
the header says. The ROM cannot check the card's capacity; a payload past the
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

Each mounted drive costs a 16-byte DPH and a 256-byte allocation vector in
the classic bank. TEC-OS mounts up to four drives.
