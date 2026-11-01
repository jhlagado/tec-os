# 18. The SD card and the volumes

Checked against TEC-OS 98c6416.

Between the BDOS's view of a disk, tracks and sectors of 128 bytes, and the
SD card's view, numbered blocks of 512, TEC-OS has three layers. At the
bottom is a driver that talks to the card over SPI, bit by bit through one
port. Above it, cold boot reads the container in the card's first blocks,
checks it, and builds a drive table and a disk parameter header for each
drive. At the top, the BIOS's disk entries turn a track and sector into a
block of the card and a quarter of that block. This chapter goes up through
the layers in that order, and ends with the mount service through which
`MOUNT` and `VOLS` change and list the drives. Chapter 19 describes the
block cache, which every read passes through.

## The SPI driver

The card is on the TEC-1G's SD adaptor at port `FDh` (`src/layout.asm:12`).
Three output bits drive the card's lines, bit 0 its data in (MOSI), bit 1
its clock and bit 2 its chip select, active low, and bit 7 of the input is
the card's data out, MISO (`src/sd.asm:1-6`). Data changes while the clock is
low and the card samples it on the rising edge. Every routine returns Z on
success, and on failure NZ with an error code in `A` and in `SDERR`.

Sending a byte is eight passes of a loop: shift the top bit of `C` into the
carry, put it on bit 0 with the clock low, then write the same bit with the
clock high (`src/sd.asm:19-28`). Receiving is the same loop with MOSI held
high: clock low, clock high, read the port and shift bit 7 into the result
(`src/sd.asm:30-43`). `SPIEND` raises chip select and gives the card eight
more clocks (`src/sd.asm:45-56`).

A command is six bytes after an idle `FFh`: the command number with bit 6
set, four argument bytes from `SDARG`, most significant first, and a CRC
byte (`src/sd.asm:58-94`). In SPI mode the card checks the CRC only of
`CMD0` and `CMD8`, so `SDCMD` sends `95h` and `87h`, the correct bytes for
those two with the arguments TEC-OS uses, and `01h`, the end bit alone, for
the rest. It then reads up to 16 bytes, waiting for the response byte R1,
whose bit 7 is 0.

`SDINIT` starts the card at cold boot, and each step has its own error code
(`src/sd.asm:114-204`):

1. Chip select high and 80 clocks, more than the 74 the card needs after
   power-up, then `CMD0`, which puts the card in SPI mode and its idle
   state. The card must answer R1 = `01h`; after ten tries with no such
   answer the error is 1, `SDENOCD`, which is what an empty socket gives.
2. `CMD8` with the argument `1AAh`, the voltage range and a check pattern.
   A card of version 2 answers `01h` and four more bytes, which are read and
   ignored; an older card rejects the command, and initialisation goes on.
3. `CMD55` and `ACMD41` with the high-capacity bit set, repeated up to 256
   times with a short pause between, until R1 is 0, the card ready. Error 2,
   `SDEINIT`, if it never is.
4. `CMD58`, which returns the operating conditions register. Bit 6 of its
   first byte, CCS, is set on a high-capacity card, which takes block
   numbers as addresses. Error 3, `SDEOCR`, if the command fails.
5. On a standard-capacity card, which takes byte addresses, `SDBYTE` is set
   to 1 and `CMD16` sets the block length to 512. Error 4, `SDEBLEN`, if it
   fails.

Every later access gives the driver a block number in `SDLBA`, four bytes,
least significant first. `LBAARG` turns it into the command's argument: as
it is for a high-capacity card, shifted left by 9, the block times 512, for
a standard one (`src/sd.asm:206-221`).

`SDREAD` reads a block with `CMD17` (`src/sd.asm:223-252`). A nonzero R1 is
error 5, `SDECMD`. The card then sends `FFh` until the data is ready and
`FEh` before it, and the driver polls for that token up to 65,536 times
before it gives error 6, `SDETOK`. The 512 bytes follow, then a two-byte CRC
that the driver reads and doesn't check. `SDWRITE` writes one with `CMD24`
(`src/sd.asm:431-477`): R1 must be 0, or error 5; then `FFh`, the token
`FEh`, the 512 bytes and two CRC bytes. The card's data response must come
within 16 bytes and have `05h` in its low five bits, data accepted, or the
error is 7, `SDEWRSP`. The card then holds its data line at 0 while it
programs the block, and the driver waits up to 65,536 reads for it to let go
before it gives error 8, `SDEBUSY`. A write therefore returns success only
after the card has stopped reporting busy.

The two block loops, `SDRBLK` and `SDWBLK`, are unrolled, eight bits written
out in full for each byte, and `SDRBLK` keeps its count of 256 two-byte
passes in the Z80's `I` register, which is free in interrupt mode 1
(`src/sd.asm:254-429`). On the model `SDREAD` takes 219,137 T-states for one
block, about 55 milliseconds, and `SDWRITE` 216,154. Nearly all of that is
the 4,096 bits of the block moved one at a time. When `SDXB` holds `LATEXP`
the buffer is a line of the block cache in EXPAND 1, and each loop puts
EXPAND 1 in view around itself and uses no stack while it is
(`src/sd.asm:258-262`, `src/sd.asm:356-359`).

## The container's checks

The card holds one container, and its block 0 is the header: the name
`TECOSVOL`, the format's version, the sizes of the header and of a volume
descriptor, the number of volumes, the container's length in blocks, a
checksum, and in format 1.1 a drive count and a sum over the rest of the
table. The volume descriptors follow, 32 bytes each,
fifteen in block 0 and sixteen in each of blocks 1 to 7. Chapter 4 describes
the container from the user's side and Appendix E lists its fields. The
offsets the ROM uses come from `format/format.json` through the generated
`gen/format.asm`, as Chapter 12 describes.

`MOUNT` reads block 0 into `BLKBUF` and checks it in a fixed order,
stopping at the first failure with that check's code
(`src/vol.asm:8-18`, `src/vol.asm:20-135`):

| Code | Check |
| --- | --- |
| `20h` | block 0, or a block of the table, reads |
| `21h` | the first eight bytes are `TECOSVOL` |
| `22h` | the major version is 1 |
| `23h` | the header is 512 bytes and a descriptor 32; in 1.1, the drive count is at most 4 |
| `24h` | the volume count is from 1 to 127 |
| `25h` | the header's checksum, the 16-bit sum of its other 510 bytes; in 1.1, the table's sum |

Any minor version other than 0 is read as 1.1 (`src/vol.asm:83-85`). For a
1.1 card with more than fifteen volumes, `MOUNT` reads each further block of
the table and adds up its 512 bytes, and the total must be the header's table
sum (`src/vol.asm:93-134`).

Then it walks the descriptors in table order, checking each one and mounting
it as it goes (`src/vol.asm:136-243`):

| Code | Check |
| --- | --- |
| `26h` | the volume id is not 0; no flag but read-only is set; the geometry is known; the length is that geometry's payload exactly; the start block is not 0 and a multiple of 8 |
| `28h` | the start is at or after the previous volume's end |
| `27h` | start plus length has no carry out of 32 bits, and ends within the container |
| `29h` | the drive byte is `FFh` or 0 to 3, below a 1.1 header's drive count when that count is not 0, and not a drive already taken |
| `2Ah` | after the last descriptor, drive A has a volume |

The order check makes overlapping volumes impossible, since each must start
where the one before it ended or later, and it means the descriptors have to
be in ascending order of their start block. The ROM uses only bit 0 of a
descriptor's cache byte, the written-behind flag, and doesn't check the
others (`src/vol.asm:346-350`). Any failure unmounts every drive that the
walk had mounted, so a card is mounted whole or not at all
(`src/vol.asm:251-255`). The ROM can't find the card's capacity, so a volume
that runs past the end of the card fails only when a read reaches it.

Cold boot sends any failure, of the card or of the container, to the
diagnostic prompt (`src/boot.asm:37-40`). Here the starter card's first byte
was changed from `T` to `X` before the run, with
`printf X | dd of=/tmp/bad.img bs=1 seek=0 conv=notrunc` on a copy of
`dist/starter.img`, and `H` was typed at the prompt:

<!-- node book/capture.mjs --card /tmp/bad.img H -->
```text
TEC-OS 0.1 for TEC-1G
No volume mounted, error 21
R retry, H header> H
58 45 43 4F 53 56 4F 4C 01 00 00 02 20 00 02 00 
00 50 00 00 F4 07 00 00 00 00 00 00 00 00 00 00 
01 00 00 00 00 08 00 00 00 08 00 00 02 00 00 00 
53 59 53 54 45 4D 20 20 20 20 20 00 00 00 00 00 
R retry, H header> 
```

`H` prints the first 64 bytes of `BLKBUF` (`src/diag.asm:26-45`), which here
hold block 0 as read. The first row is the name, with `58h` for the `X`,
then the version 1.0, the header size `0200h`, the descriptor size `0020h`
and the count, 2. The second row starts with the container's length,
`00005000h` blocks, and the checksum, `07F4h`; the drives field and the table
sum are 0, as on any 1.0 card. The third and fourth rows are the first
descriptor: id 1, start block `0800h`, length `0800h`, geometry 2, flags 0,
drive 0, cache byte 0 and the label `SYSTEM`.

## The drive table and the DPHs

Each descriptor that names a drive is mounted by `MNONE`
(`src/vol.asm:308-320`). `MNFILL` writes the drive's eight-byte entry in
`DRVTAB`: the start block, four bytes; the length in blocks, two; the
geometry; and a flags byte with read-only in bit 0 and written-behind in
bit 1 (`src/vol.asm:322-351`, `src/ram.asm:22`). `DRVIDX` records which
volume each drive holds, as its index in the container plus 1, 0 for none
(`src/ram.asm:28`). The geometry byte is 0 for a drive with no volume, and
the BIOS's `SELDSK` returns 0, no such drive, for it (`src/bios.asm:23-43`).

`MNDPH` builds the drive's disk parameter header, the 16-byte block through
which the BDOS reaches a drive's parameters and buffers
(`src/vol.asm:353-389`):

| Offset | Contents |
| ---: | --- |
| 0 | the sector translation table: 0, no skew |
| 2–7 | three words for the BDOS's own use, zeroed |
| 8 | `DIRBUF`, the 128-byte directory buffer every drive shares |
| 10 | the disk parameter block of the volume's geometry |
| 12 | `CSVDUM`, a check vector that is never used, since `CKS` is 0 |
| 14 | the allocation vector, set by `ALVINIT` |

The disk parameter blocks are `DPB1` and `DPB2` in `gen/geom.asm`. Both
geometries have 64 records a track, no reserved tracks and four directory
allocation blocks; G8M has 2,048 blocks of 4 KiB and 512 directory entries,
G1M 512 blocks of 2 KiB and 256 entries. `CKS` is 0 in both: CP/M 2.2 uses
the check vector to detect a changed floppy, and the card is treated as fixed
media. The three scratch words are where TEC-OS's BDOS keeps, for each drive,
a sum of its allocation vector, a flag set when it has changed, and a mark,
the number of directory entries to read when the vector is rebuilt, which
together let a warm boot keep the drive logged in
(`src/cpm/bdos.asm:468-507`). Chapter 16 describes that, and Chapter 13 how
`ALVINIT` places the vectors at cold boot.

## Deblocking

The BDOS reads and writes 128-byte records through the BIOS, by track and
sector. Every geometry has 64 records a track and no reserved tracks, so the BIOS numbers
the volume's records straight through, record = track × 64 + sector, and
four records share one 512-byte block of the card (`src/bios.asm:5-10`).
`SETTRK`, `SETSEC` and `SETDMA` store their values, `HOME` sets track 0, and
`SECTRAN` returns the sector unchanged (`src/bios.asm:12-21`).

`MAPREC` does the arithmetic (`src/bios.asm:57-125`). It rejects a sector of
64 or more and a track of 1,024 or more, whose record number would not fit
in 16 bits. It keeps the record's low two bits as `BLKSLOT`, the quarter of
the block, and the record divided by 4 as `BLKOFF`, the block within the
volume. `BLKOFF` must be less than the volume's length from the drive table;
then the volume's start block is added to it, in 32 bits, to give `SDLBA`,
the block of the card. A G8M volume's 16,384 blocks are 65,536 records, 1,024
tracks; a G1M volume has 128 tracks.

`READ` maps the record and copies it to the DMA address through the block
cache, as Chapter 19 describes. `WRITE` has more to do
(`src/bios.asm:188-300`). After mapping it rejects a write to a read-only
volume before anything changes, with error 1, which the BDOS reports, for a
file's data, as `Bad Sector` (`src/cpm/bdos.asm:850-864`). If the block is
one of the directory's, the first 32 blocks of a G8M volume or 16 of a G1M,
it sets the drive's changed flag in the DPH and raises its mark to cover the
16 entries of this block, so that the next warm boot rebuilds the drive's
vector from the entries up to there (`src/bios.asm:210-248`).

Then comes the deblocking. A record is a quarter of a block, so writing one
on a volume written through means reading the block into `BLKBUF`, copying
the record into its quarter and writing the whole block back. `GETBLKW`
reads the block unless `BLKBUF` already holds it, which its key, `BUFDRV` and
`BUFBLK`, records (`src/bios.asm:127-164`). The read is skipped when nothing
in the block is the card's to keep. CP/M's write type 2 marks the first write
to an allocation block the BDOS has just given the file, and for it
`GETBLKW` clears `BLKBUF` to zeros instead and sets `BUFOK` to 2. When the
next write is to the next block of the same allocation block and `BLKBUF`
holds the one before it, cleared, that block is cleared too and not read
(`src/bios.asm:249-276`). The record goes into its quarter, found by
`SLOTADR` (`src/bios.asm:166-177`), and `SDWRITE` writes `BLKBUF` to the
card. If the write fails, `BUFOK` is cleared, since the buffer no longer
matches the card, and the cache's copy of the block is dropped; if it
succeeds, the cache's copy, if it has one, is refreshed from `BLKBUF`
(`src/bios.asm:289-300`). On the volume written behind, `WRITE` goes to the
cache instead, at `CWRBH` (`src/bios.asm:277-281`).

A program that writes a new file sequentially on a volume written through
therefore causes no card reads, and four card writes for each block, since
the block goes to the card after each of its records. `SAVE 8 X.COM` on
drive A, 16 records in four blocks, writes 18 blocks: the 16 and two of the
directory.

## The mount service

`MOUNT` and `VOLS` on the starter card are programs, and they change and
list the drives through the mount service, `VOLSVC`, which a program reaches
through the jump `ABIVOL` at `C00Fh` (`src/abi.asm:14`, `src/vol.asm:578-584`).
It has three functions, chosen by `A`:

- `A` = 0 mounts the volume at container index `E` on drive `C`;
- `A` = 1 unmounts drive `C`;
- `A` = 2 copies the descriptor at index `E` to the 32 bytes at `HL`, with
  its drive byte replaced by the drive the volume is on now, `FFh` for none.

Each returns `A` = 0, or `FFh` with nothing changed. A mount fails for an
index past the table, a drive past D, a volume that is already on a drive,
or a drive whose vector slot is too small for the volume; an unmount fails
for drive A, which is never left empty (`src/vol.asm:611-676`). The slot rule
is `VSLOT`'s: a volume of 4,096 blocks or more, a G8M, needs a 256-byte slot,
and any other needs a slot of either size (`src/vol.asm:638-651`). Chapter 13 describes how
cold boot gives out the slots.

Before a mount or unmount changes a drive, `VFLUSH` writes every changed
line of the block cache to the card, with interrupts off, and the service
fails if any write fails, so that a volume's data is on the card before
the volume leaves its drive (`src/vol.asm:678-690`). A mount then clears the
drive's old entry, fills the new one and its DPH with `MNONE`, and records
the index; an unmount clears the entry. Either way the service ends by
marking `BLKBUF` empty and calling BDOS function 37 to reset the drive, so
that its next access logs it in from its new directory
(`src/vol.asm:662-674`). The service writes nothing of its own to the card.
The card's header still names its own drives, and a power-off, or a reset whose kept selection
no longer matches, brings them back.

The run below shows the slot rule on the starter card, a format 1.0 card
whose two drives have vector slots and whose C and D have none. `MOUNT C:
WORK` fails first because `WORK` is on B, and again after B is unmounted
because C has no slot; `MOUNT B: WORK` puts it back, and `VOLS` lists the
container through the describe function:

<!-- node book/capture.mjs "MOUNT C: WORK" "MOUNT B:" "MOUNT C: WORK" "MOUNT B: WORK" VOLS -->
```text
A>MOUNT C: WORK
Cannot mount: in use or too large

A>MOUNT B:
Unmounted

A>MOUNT C: WORK
Cannot mount: in use or too large

A>MOUNT B: WORK
B: WORK       

A>VOLS
00 SYSTEM      G1M A:
01 WORK        G8M B:

A>
```

A card of format 1.1 with a drive count of 4 gives each of A to D a
256-byte slot at cold boot, and on such a card `MOUNT C:` with a volume
that is on no other drive succeeds. The slots cost TPA: with four of them the
TPA is 46,086 bytes, 768 fewer than the starter card gives.
