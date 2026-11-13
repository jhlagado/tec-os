---
title: E. The container format
parent: TEC-OS
nav_order: 105
nav_group: "Reference"
---

# Appendix E. The container format

<!-- Checked against TEC-OS 46cf3f1f1c6ea7ff361a568672a41ab1a7e2c1ee (main),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A TEC-OS card starts with one container at block 0. Its header identifies
CP/M volumes by location and geometry. Each volume then holds an ordinary
CP/M disk. [Cards on the PC](06-cards-on-the-pc.md) covers image operations
and [Card blocks and volumes](18-card-blocks-and-volumes.md) follows the
ROM's mount. This reference gives the bytes and validation rules needed
to decode a container or diagnose a rejected one.

`format/format.json` defines the fields and geometries. The build generates
`src/gen/format.asm` and `src/gen/geom.asm` from it
(`tools/build.mjs:79-134`). The host container module and `tecvol` read the
same definition through `tools/lib/format.mjs`. All multibyte numbers are
little-endian. Each block is 512 bytes and its number counts from the
container's start. `tecvol install` puts that start at the card's block 0.

## The header

The following dump shows the starter card's first 96 bytes: the header fields
followed by two descriptors.

```sh
od -A x -t x1 -N 96 dist/starter.img
```

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
000000 54 45 43 4f 53 56 4f 4c 01 01 00 02 20 00 05 00
000010 00 68 00 00 77 12 04 00 00 00 00 00 00 00 00 00
000020 01 00 00 00 00 08 00 00 00 08 00 00 02 00 00 00
000030 53 59 53 54 45 4d 20 20 20 20 20 00 00 00 00 00
000040 02 00 00 00 00 10 00 00 00 40 00 00 01 00 01 00
000050 57 4f 52 4b 20 20 20 20 20 20 20 00 00 00 00 00
000060
```

The header's fields (`format/format.json`, `header`):

| Offset | Bytes | Field | Starter card |
| ---: | ---: | --- | --- |
| 0 | 8 | Magic, `TECOSVOL` | `TECOSVOL` |
| 8 | 1 | Major version, 1 | 1 |
| 9 | 1 | Minor version, 0 or 1 | 1 |
| 10 | 2 | Header bytes, 512 | `0200h` |
| 12 | 2 | Descriptor bytes, 32 | `0020h` |
| 14 | 2 | Number of volumes | 5 |
| 16 | 4 | Container length in blocks | `00006800h`, 26,624 |
| 20 | 2 | Checksum | `1277h` |
| 22 | 1 | 1.1: drive count, 0 to 4. 0 in 1.0 | 4 |
| 23 | 2 | 1.1: table sum. 0 in 1.0 | 0 |
| 25 | 7 | Reserved, 0 | 0 |
| 32 | 32 each | The first 15 volume descriptors | 5 |

The header checksum covers all 512 bytes of block 0 except its own two bytes. It
is a 16-bit sum, including the descriptors as well as the header fields
(`tools/lib/container.mjs:51-59`). A change anywhere in block 0 therefore needs
a new checksum. The ROM reads 32 bytes at a time from a line in the block cache,
sums the whole block and subtracts the two checksum bytes
(`src/vol.asm:479-498`, `src/volutil.asm:83-124`).

A card's minor version sets three things. A 1.0 card has no drives field and
no table sum and `tecvol` gives it at most 8 volumes. A 1.1 card may have up
to 127, may give a number of drives and has the table sum
(`tools/lib/container.mjs:75-79`, `tools/lib/container.mjs:137-145`).
`tecvol create` makes a 1.1 card when it is given more than 8 volumes or
`--drives` and a 1.0 card otherwise. The ROM rejects a 1.0 card of more than
8 volumes with code `24h` (`src/vol.asm:89-115`). It treats any minor
version other than 0 as 1.1 (`src/vol.asm:135-137`).

## The volume descriptor

Each descriptor is 32 bytes (`format/format.json`, `descriptor`):

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 4 | Volume id: not 0 and different from every other volume's |
| 4 | 4 | Start block: not 0, a multiple of 8 |
| 8 | 4 | Length in blocks: the geometry's payload exactly |
| 12 | 1 | Geometry id: 1 for G8M, 2 for G1M |
| 13 | 1 | Flags: bit 0 read-only. Other bits 0 |
| 14 | 1 | Drive: 0 to 3 for A to D, `FFh` for none |
| 15 | 1 | Reserved: written zero, never read |
| 16 | 11 | Label, ASCII, padded with spaces |
| 27 | 5 | Reserved, 0 |

The starter card's first descriptor, at `20h`, is volume 1, starting at block
`0800h` (2,048), 2,048 blocks long, geometry 2, not read-only, on drive A,
labelled `SYSTEM`. Its second, at `40h`, is volume 2,
starting at block `1000h` (4,096), 16,384 blocks long, geometry 1, on drive B,
labelled `WORK`.

The drive byte assigns a drive at cold boot. The volume id stays with the
volume when that assignment changes.

Byte 15 is reserved. It once marked one volume written behind. TEC-OS now
writes behind the volume on the drive you are on and coalesces the data
writes of every other volume, as [Chapter 19](19-cache-and-persistence.md)
explains, so no descriptor marks one. `tecvol` and the container library
write the byte zero, and neither they nor the ROM read it. A card made with
the mark still mounts, its drive's flags holding only the read-only bit.
`tecvol create` refuses `:wb` as an unknown flag, and `createContainer`
refuses a volume that names `writeBehind`
(`format/format.json:36`, `tools/lib/container.mjs:84`,
`docs/container-format.md`). `tecvol create` starts the first volume at
block 2,048, 1 MiB into the card. Each later volume starts at the next
multiple of 2,048 blocks after the one before. `--align` puts another multiple
of 8 in place of 2,048 (`tools/lib/container.mjs:14`,
`tools/lib/container.mjs:87-97`). `tecvol create` fills each payload with
`E5h`, giving it an empty CP/M directory (`tools/lib/container.mjs:118`).

## The table beyond block 0

Block 0 holds the header and descriptors 0 to 14, at offsets 32 to 511. A 1.1
card with more than 15 volumes goes on in blocks 1 to 7, 16 descriptors to a
block. With block 0's 15 that gives the limit of 127
(`tools/lib/container.mjs:33-42`, `format/format.json`). Descriptor `i`, for
`i` of 15 or more, is in block `1 + floor((i − 15) / 16)`, at
`32 × ((i − 15) mod 16)` within it. No volume can start below block 8 so
blocks 1 to 7 remain outside every volume, whether or not the table uses
them.

The table sum at header offset 23 is the 16-bit sum of every byte in the
descriptor blocks after block 0, including their unused bytes
(`tools/lib/container.mjs:44-49`). The ROM reads `floor(count / 16)` such
blocks. With 15 descriptors in block 0, that is the number needed for the
remaining descriptors (`src/vol.asm:148-172`). When those blocks exist, a
sum difference gives `25h` (`src/vol.asm:174-180`).

With 15 or fewer descriptors the ROM skips this comparison entirely.
The host validator still compares the stored table sum with the computed
sum of zero so a 1.1 image must store zero in that field when its table
fits in block 0 (`src/vol.asm:148-154`, `tools/lib/container.mjs:142-145`).

## The checks and their codes

The ROM's `MOUNT` checks the header before walking the descriptors in
table order. It mounts each assigned volume as its descriptor passes.
The first failure stops the walk and unmounts every drive mounted so far
(`src/vol.asm:42-365`). Cold boot prints the error code at the diagnostic
prompt described in [Chapter 28](28-diagnose-the-machine.md). The table
below follows the check order so the same code appears more than once.

| Code | Check | Source |
| --- | --- | --- |
| `20h` | Block 0 can't be read | `src/vol.asm:43-50` |
| `21h` | The first 8 bytes are not `TECOSVOL` | `src/vol.asm:51-62` |
| `22h` | The major version is not 1 | `src/vol.asm:64-71` |
| `23h` | The header bytes are not 512 or the descriptor bytes not 32 | `src/vol.asm:75-87` |
| `24h` | The number of volumes is 0, more than 8 on a 1.0 card or more than 127 | `src/vol.asm:89-115` |
| `25h` | The checksum differs | `src/vol.asm:112-115` |
| `23h` | 1.1: the drives field is more than 4 | `src/vol.asm:139-143` |
| `20h` | 1.1: a block of the table can't be read | `src/vol.asm:161-169` |
| `25h` | 1.1 with descriptors beyond block 0: the table sum differs | `src/vol.asm:174-180` |
| `26h` | A volume's id is 0, a flag other than read-only is set, the geometry is unknown, the length is not the geometry's or the start is 0 or not a multiple of 8 | `src/vol.asm:204-244`, `src/vol.asm:357-358` |
| `28h` | A volume starts before the end of the one before it in the table | `src/vol.asm:245-252` |
| `27h` | The exclusive end exceeds `FFFFFFFFh` or the container length or a standard-capacity card's last volume block exceeds `7FFFFFh` | `src/vol.asm:254-296` |
| `29h` | A drive byte is neither `FFh` nor 0 to 3, the drive is past the number the drives field gives or two volumes name one drive | `src/vol.asm:307-334` |
| `2Ah` | No volume is on drive A | `src/vol.asm:343-353` |

Both format versions require ascending, nonoverlapping volumes. Each
volume must start at or after the previous volume's exclusive end. An
out-of-order or overlapping descriptor therefore gives `28h`. `tecvol`
makes the same check on every card
(`tools/lib/container.mjs:169`). A card whose two descriptors were swapped,
with its checksum made good, fails `tecvol verify`. The ROM stops at the
diagnostic prompt with code `28h`. One Node.js command makes such a card,
`build/swapped.img`, from the starter card:

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

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
tecvol: volume 1: not after volume 0
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card build/swapped.img. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
No volume mounted, error 28
R retry>
```

`tecvol create` and the starter card's recipe always place the volumes in
order so a card made by either passes the ROM's order check.

On a 1.1 card the drives field can restrict the assignments. A nonzero
value N permits only drives A through the Nth drive. A value of 0 leaves
all four available, as on a 1.0 card (`src/vol.asm:319-321`). A violation
stops cold boot at the diagnostic prompt with code `29h`. `tecvol` makes the
same check (`tools/lib/container.mjs:173`). `tecvol verify` rejects such a
card and `tecvol create` rejects a volume on drive C with `--drives 2`:

```sh
node tools/tecvol.mjs create build/drv2.img --volume G1M:SYSTEM:A --volume G1M:EXTRA:C --drives 2
```

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
tecvol: volume 1: drive C is past the card's 2 drive(s)
```

The host validator also enforces the volume-count limit, descriptor order
and drive assignments (`tools/lib/container.mjs:127-186`). It cannot test
the physical card's addressing mode from image bytes alone so the ROM's
standard-capacity bound remains a separate check. These additional image
requirements apply in `tecvol`:

| `tecvol` also requires |
| --- |
| A zero table sum on a 1.1 image with no descriptors beyond block 0 |
| Volume ids different from each other |
| Unique labels on a 1.1 card |
| An image as long as the header's container length |

The ROM does not read byte 15 and does not validate labels, reserved bytes or duplicate
volume ids. It cannot check the physical card's size. The host validator
also leaves reserved bytes unchecked.

## The geometries

Both geometries use 128-byte records and 64 records per track
(`format/format.json`, `geometries`). Record `r` starts at byte `128 × r`
in the volume's payload so four records share a 512-byte card block.
Neither geometry has reserved tracks, sector skew or a directory check
vector. The card is not removable media in CP/M's sense.

| Id | Name | Payload | Blocks | Allocation block | Directory entries | Allocation vector |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | G8M | 8 MiB | 16,384 | 4 KiB | 512 | 256 bytes |
| 2 | G1M | 1 MiB | 2,048 | 2 KiB | 256 | 64 bytes |

The allocation vector is the drive's map of free space in TEC-OS's memory,
one bit for each allocation block. Its size is `floor(DSM / 8) + 1` bytes.
[State and memory](15-state-and-memory.md) explains their placement for a
particular card.

Their disk parameter blocks, as `src/gen/geom.asm` holds them:

| Field | G8M | G1M | Meaning |
| --- | ---: | ---: | --- |
| SPT | 64 | 64 | Records per track |
| BSH | 5 | 4 | Block shift: an allocation block is 128 × 2^BSH bytes |
| BLM | 31 | 15 | Block mask, 2^BSH − 1 |
| EXM | 1 | 0 | Extent mask |
| DSM | 2,047 | 511 | The highest allocation block number |
| DRM | 511 | 255 | The highest directory entry number |
| AL0 | `F0h` | `F0h` | The allocation blocks the directory takes: the first four |
| AL1 | 0 | 0 | |
| CKS | 0 | 0 | No check vector |
| OFF | 0 | 0 | No reserved tracks |

Each directory occupies four allocation blocks. G8M's 512 entries of
32 bytes occupy 16 KiB or four 4-KiB blocks. G1M's 256 entries occupy
8 KiB or four 2-KiB blocks. Those four blocks come from the volume's
2,048 allocation blocks on G8M or 512 on G1M.

The ROM's geometry table has 6 bytes for each geometry (`src/gen/geom.asm`):
the id, a 0, the payload in blocks as a word and the disk parameter block's
address. `GEOFIND` finds an id in it (`src/volutil.asm:29-39`). The length
check compares the descriptor's length with that word and requires its two
high bytes to be 0 (`src/vol.asm:217-229`).
