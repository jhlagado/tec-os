# Appendix E. The container format

Checked against TEC-OS 98c6416, with the starter card's `EDIT.COM` from Edit
845d062, whose card copy has the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`.

A TEC-OS card holds one container: block 0 is its header, and its volumes
follow, each an ordinary CP/M disk. This appendix lists the header's fields,
the volume descriptors, the table's blocks beyond block 0, the checks the ROM
makes with their error codes, and the two geometries. Chapter 4 describes the
container from the user's side and Chapter 18 the ROM's mount.

The format is defined once, in `format/format.json`. The build generates the
ROM's field offsets and its geometry table from that file, as
`src/gen/format.asm` and `src/gen/geom.asm` (`tools/build.mjs:83` to `137`),
and `tools/lib/container.mjs` and `tecvol` read the same file through
`tools/lib/format.mjs`. All numbers of more than one byte are little-endian. A
block is 512 bytes, and block numbers count from the start of the container,
which `tecvol install` puts at the card's block 0.

## The header

The starter card's first 96 bytes hold the header's fields and the first two
descriptors:

```sh
od -A x -t x1 -N 96 dist/starter.img
```

```text
000000 54 45 43 4f 53 56 4f 4c 01 00 00 02 20 00 02 00
000010 00 50 00 00 f4 07 00 00 00 00 00 00 00 00 00 00
000020 01 00 00 00 00 08 00 00 00 08 00 00 02 00 00 00
000030 53 59 53 54 45 4d 20 20 20 20 20 00 00 00 00 00
000040 02 00 00 00 00 10 00 00 00 40 00 00 01 00 01 01
000050 57 4f 52 4b 20 20 20 20 20 20 20 00 00 00 00 00
000060
```

The header's fields (`format/format.json`, `header`):

| Offset | Bytes | Field | Starter card |
| ---: | ---: | --- | --- |
| 0 | 8 | Magic, `TECOSVOL` | `TECOSVOL` |
| 8 | 1 | Major version, 1 | 1 |
| 9 | 1 | Minor version, 0 or 1 | 0 |
| 10 | 2 | Header bytes, 512 | `0200h` |
| 12 | 2 | Descriptor bytes, 32 | `0020h` |
| 14 | 2 | Number of volumes | 2 |
| 16 | 4 | Container length in blocks | `00005000h`, 20,480 |
| 20 | 2 | Checksum | `07F4h` |
| 22 | 1 | 1.1: the number of drives to set up, 0 to 4; 0 in 1.0 | 0 |
| 23 | 2 | 1.1: the table's sum; 0 in 1.0 | 0 |
| 25 | 7 | Reserved, 0 | 0 |
| 32 | 32 each | The first 15 volume descriptors | 2 |

The checksum is the 16-bit sum of all 512 bytes of block 0 except the two
bytes of the checksum itself (`tools/lib/container.mjs:49` to `57`). The ROM
sums all 512 and then takes the two checksum bytes back out (`src/vol.asm:781`
to `802`). The sum covers the descriptors in block 0 as well as the header's
fields, so a change to any byte of block 0 needs a new checksum.

A card's minor version sets three things. A 1.0 card has no drives field and
no table sum, and `tecvol` gives it at most 8 volumes. A 1.1 card may have up
to 127, may give a number of drives, and has the table sum
(`tools/lib/container.mjs:74` to `78`, `138` to `146`). `tecvol create` makes
a 1.1 card when it is given more than 8 volumes or `--drives`, and a 1.0 card
otherwise. The ROM treats any minor version other than 0 as 1.1
(`src/vol.asm:83` to `85`).

## The volume descriptor

Each descriptor is 32 bytes (`format/format.json`, `descriptor`):

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 4 | Volume id: not 0, and different from every other volume's |
| 4 | 4 | Start block: not 0, a multiple of 8 |
| 8 | 4 | Length in blocks: the geometry's payload exactly |
| 12 | 1 | Geometry id: 1 for G8M, 2 for G1M |
| 13 | 1 | Flags: bit 0 read-only; the other bits 0 |
| 14 | 1 | Drive: 0 to 3 for A to D, `FFh` for none |
| 15 | 1 | Cache flags: bit 0 written behind; the other bits 0 |
| 16 | 11 | Label, ASCII, padded with spaces |
| 27 | 5 | Reserved, 0 |

The starter card's first descriptor, at `20h`, is volume 1, starting at block
`0800h` (2,048), 2,048 blocks long, geometry 2, not read-only, on drive A,
written through, labelled `SYSTEM`. Its second, at `40h`, is volume 2,
starting at block `1000h` (4,096), 16,384 blocks long, geometry 1, on drive B,
written behind, labelled `WORK`.

The drive byte is the drive the volume takes at cold boot; the volume id is
the name that stays with the volume. At most one volume is written behind, and
never a read-only one (`tools/lib/container.mjs:83` and `84`, `184` and
`185`). `tecvol create` starts the first volume at block 2,048, 1 MiB into the
card, and each next one at the next multiple of 2,048 blocks after the one
before, unless `--align` gives another multiple of 8
(`tools/lib/container.mjs:12`, `87` to `97`). It fills each payload with
`E5h`, an empty CP/M directory (`tools/lib/container.mjs:119`).

## The table beyond block 0

Block 0 holds the header and descriptors 0 to 14, at offsets 32 to 511. A 1.1
card with more than 15 volumes goes on in blocks 1 to 7, 16 descriptors to a
block, which with block 0's 15 gives the limit of 127
(`tools/lib/container.mjs:31` to `40`, `format/format.json`). Descriptor `i`,
for `i` of 15 or more, is in block `1 + (i − 15) / 16`, at `32 × ((i − 15) mod
16)` within it. No volume can start below block 8, so blocks 1 to 7 are free
on every card, whether or not the table uses them.

The table sum in the header, at offset 23, is the 16-bit sum of every byte of
the blocks after block 0 that hold descriptors (`tools/lib/container.mjs:42`
to `47`). The ROM reads `count / 16` of them, rounded down, and sums them
(`src/vol.asm:93` to `134`); with 15 descriptors in block 0, that is the
number of blocks the table needs. A difference gives code `25h`, as the
header's checksum does.

## The checks and their codes

The ROM's `MOUNT` checks the header first and then each descriptor in table
order, in one pass, mounting each one as it passes (`src/vol.asm:20` to
`255`). The first check to fail stops the mount, unmounts any drive mounted so
far, and returns its code, which cold boot prints at the diagnostic prompt
(Chapter 24). The checks, in the order the ROM makes them:

| Code | Check | Source |
| --- | --- | --- |
| `20h` | Block 0 can't be read | `src/vol.asm:26` to `29` |
| `21h` | The first 8 bytes are not `TECOSVOL` | `src/vol.asm:30` to `39` |
| `22h` | The major version is not 1 | `src/vol.asm:40` to `43` |
| `23h` | The header bytes are not 512, or the descriptor bytes not 32 | `src/vol.asm:44` to `54` |
| `24h` | The number of volumes is 0, or more than 127 | `src/vol.asm:55` to `67` |
| `25h` | The checksum differs | `src/vol.asm:70` to `75` |
| `23h` | 1.1: the drives field is more than 4 | `src/vol.asm:86` to `90` |
| `20h` | 1.1: a block of the table can't be read | `src/vol.asm:106` to `111` |
| `25h` | 1.1: the table sum differs | `src/vol.asm:130` to `134` |
| `26h` | A volume's id is 0, a flag other than read-only is set, the geometry is unknown, the length is not the geometry's, or the start is 0 or not a multiple of 8 | `src/vol.asm:147` to `185` |
| `28h` | A volume starts before the end of the one before it in the table | `src/vol.asm:186` to `193` |
| `27h` | A volume's end passes `FFFFFFFFh`, or the container's length | `src/vol.asm:194` to `215` |
| `29h` | A drive byte is neither `FFh` nor 0 to 3, the drive is past the number the drives field gives, or two volumes name one drive | `src/vol.asm:216` to `234` |
| `2Ah` | No volume is on drive A | `src/vol.asm:244` to `247` |

The ascending order behind `28h` is checked on every card, 1.0 and 1.1 alike,
and it is what keeps two volumes from overlapping: each must start at or after
the end of the one before it in the table. It also means that the ROM rejects
a 1.0 card whose descriptors are out of order, although `tecvol` accepts one.
`tecvol`'s check of a 1.0 card tests for overlap between every pair and
requires the order only of a 1.1 card (`tools/lib/container.mjs:172` and
`179`). A card whose two descriptors were swapped, with its checksum made
good, passes `tecvol verify`, and the ROM stops at the diagnostic prompt with
code `28h`. One Node.js command makes such a card, `build/swapped.img`, from
the starter card:

```sh
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
import { headerChecksum } from "./tools/lib/container.mjs";
const img = new Uint8Array(readFileSync("dist/starter.img"));
const a = img.slice(32, 64);
img.copyWithin(32, 64, 96);
img.set(a, 64);
const s = headerChecksum(img.subarray(0, 512));
img[20] = s & 255;
img[21] = s >> 8;
writeFileSync("build/swapped.img", img);
'
```

```sh
node tools/tecvol.mjs verify build/swapped.img
```

```text
container: format 1.0, 20480 blocks (10485760 bytes), 2 volume(s)
  B: WORK        id 2 G8M start 4096 rw wb 0 file(s), 8372224 bytes free
  A: SYSTEM      id 1 G1M start 2048 rw 12 file(s), 1009664 bytes free
```

<!-- node book/capture.mjs --card build/swapped.img -->
```text
TEC-OS 0.1 for TEC-1G
No volume mounted, error 28
R retry, H header> 
```

`tecvol create` and the starter card's recipe always place the volumes in
order, so a card made by either passes both.

The drives field limits the drive bytes. On a 1.1 card that gives N drives, a
volume may name only drives A to the Nth. With N of 0, or on a 1.0 card, any
of the four (`src/vol.asm:222` to `226`).

`tecvol` makes these checks and more (`tools/lib/container.mjs:127` to `191`).
It also requires at most 8 volumes on a 1.0 card, a known cache flag, volume
ids different from each other, unique labels on a 1.1 card, no volume both
read-only and written behind, at most one written behind, and an image as long
as the header's container length. The ROM checks none of the cache byte, the
label, the reserved bytes or whether two volumes share an id, and it can't
check the card's size.

## The geometries

Both geometries have 128-byte records, 64 records to a track, no reserved
tracks, no sector skew and no checksum vector, since the card is not removable
media in CP/M's sense (`format/format.json`, `geometries`). Record `r` of a
volume is the 128 bytes at `128 × r` in its payload, so four records share a
block.

| Id | Name | Payload | Blocks | Allocation block | Directory entries |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | G8M | 8 MiB | 16,384 | 4 KiB | 512 |
| 2 | G1M | 1 MiB | 2,048 | 2 KiB | 256 |

Their disk parameter blocks, as `src/gen/geom.asm` holds them:

| Field | G8M | G1M | Meaning |
| --- | ---: | ---: | --- |
| SPT | 64 | 64 | Records per track |
| BSH | 5 | 4 | Block shift: a block is 128 × 2^BSH bytes |
| BLM | 31 | 15 | Block mask, 2^BSH − 1 |
| EXM | 1 | 0 | Extent mask |
| DSM | 2,047 | 511 | The highest block number |
| DRM | 511 | 255 | The highest directory entry number |
| AL0 | `F0h` | `F0h` | The blocks the directory takes: the first four |
| AL1 | 0 | 0 | |
| CKS | 0 | 0 | No checksum vector |
| OFF | 0 | 0 | No reserved tracks |

The directory takes four blocks in each: 512 entries of 32 bytes are 16 KiB,
four G8M blocks, and 256 entries are 8 KiB, four G1M blocks. A G8M volume has
2,048 blocks and a G1M volume 512, of which four are the directory's.

The ROM's geometry table has an entry of 6 bytes for each geometry: the id, a
0, the payload in blocks as a word, and the address of the disk parameter
block (`src/gen/geom.asm`). `GEOFIND` looks an id up in it (`src/vol.asm:749`
to `757`), and the length check compares the descriptor's length with that
word and requires its two high bytes to be 0 (`src/vol.asm:161` to `175`).

## The cost in memory

TEC-OS's workspace has a 16-byte disk parameter header for each of the four
drives (`src/ram.asm:30`, `src/layout.asm:86`). The allocation vectors, one
bit for each block of a volume, go below the workspace. `ALVINIT` sizes the
vectors at cold boot (`src/vol.asm:503` to `563`). On a 1.1 card that gives N
drives, each of drives A to the Nth gets 256 bytes, enough for a G8M volume,
whether or not a volume is on it, so that any drive can take any volume later.
On any other card each mounted drive gets a vector sized for its volume, `DSM
/ 8 + 1` bytes: 256 for G8M and 64 for G1M, and a drive with no volume gets
none. The starter card, 1.0 with a G1M and a G8M volume, takes 320 bytes of
vectors.
