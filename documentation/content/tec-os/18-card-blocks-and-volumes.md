---
title: Card blocks and volumes
parent: TEC-OS
nav_order: 18
nav_group: "Inside TEC-OS"
---

# 18. Card blocks and volumes

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A file read must reach the right volume and the right bytes within that
volume. The BIOS starts with CP/M's 128-byte records and maps each to a
quarter of a 512-byte SD block. It then adds the volume's start block.
The same track and sector can therefore identify different card blocks on
A and B (`src/bios.asm:5-11`, `src/bios.asm:128-185`).

The BIOS exposes eight disk entries: `HOME`, `SELDSK`, `SETTRK`, `SETSEC`,
`SETDMA`, `READ`, `WRITE` and `SECTRAN`. These convert the BDOS's record
operations into card transfers. The volume descriptor bounds each permitted
range and the cache stores the 512-byte blocks used for records and container
tables (`src/tables.asm:23-31`, `src/cache.asm:173-201`, `src/vol.asm:378-416`).

## Container blocks and validation

The BIOS needs a range for each volume before it can locate any file
record. TEC-OS obtains those ranges from a single container on the card.
Block 0 begins with `TECOSVOL`, major and minor versions, header and
descriptor sizes, volume count, container length in blocks and a checksum.
Format 1.1 adds a drives field and an extra-table sum. Each descriptor uses
32 bytes. Block 0 has room for fifteen after the header and blocks 1–7 hold
sixteen each, giving a maximum of 127 (`format/format.json:2-42`).

The shared format definition is `format/format.json`. The build generates
ROM offsets in `gen/format.asm` and geometry definitions in `gen/geom.asm`
from it (`tools/build.mjs:79-134`). [Appendix E](appendix-e-container-format.md)
gives the byte layout and compares host and ROM validation. Mounting must
read this metadata afresh so a previous mount's cached bytes cannot determine
the new assignment.

`MNBLK` enforces freshness while obtaining a cache line for a table block.
`MNTCB` records the last table block read in the current operation. Changing
blocks forces a card read even after a cache hit. Cold `MOUNT` and service
entry `VSIN` initialise `MNTCB` to `FFh` so the first block is read too
(`src/vol.asm:42-48`, `src/vol.asm:378-421`, `src/volsvc.asm:353-357`).

A fresh read may first need to evict a dirty cache line. `CWRITE`
remaps the BIOS record and changes `SDLBA`. `MNBLK` therefore invokes
`MNLBA` again to restore the requested table address. Eviction or read failure returns NZ
(`src/cache.asm:213-251`, `src/vol.asm:399-435`). The field checks then run
on a 32-byte copy in resident `MNBUF`, transferred by `MNCPH` through
`MVCOPY`. `MNSUM` processes a whole block in those pieces, avoiding stack
use under EXPAND 1 (`src/vol.asm:438-501`, `src/ram.asm:108`).

`MOUNT` empties the drives before validating the container. It tests the
header in the order below and returns the hexadecimal code for the first
failure (`src/vol.asm:11-30`, `src/vol.asm:42-143`):

| Check | Failure |
| --- | --- |
| Block 0 can be read | `20h` |
| The eight magic bytes are `TECOSVOL` | `21h` |
| Major version is 1 | `22h` |
| Header size is 512 and descriptor size is 32 | `23h` |
| Volume count is 1–8 for minor 0, otherwise 1–127 | `24h` |
| Header checksum equals the 16-bit sum of the other 510 bytes | `25h` |
| For a nonzero minor version, drives is 0–4 | `23h` |

The minor version determines the remaining validation path. Minor 0 uses
format 1.0 checks. Every nonzero minor selects the 1.1-style checks,
including versions above 1. The host creator chooses 1.1 for more than eight
volumes or a nonzero drives field (`src/vol.asm:89-100`,
`src/vol.asm:132-143`, `tools/lib/container.mjs:79-85`).

The 1.1-style path checks `floor(volumeCount / 16)` table blocks after
block 0. `MOUNT` sums every byte of each whole 512-byte block modulo
65,536, including unused descriptor bytes. An unreadable block returns
`20h` and a sum mismatch returns `25h`.

With fifteen or fewer descriptors, the zero-block branch skips comparison.
The ROM therefore accepts a nonzero stored `tableSum` if the other checks
pass. The host parser calculates an empty sum of zero and rejects that
value (`src/vol.asm:145-180`, `src/vol.asm:479-501`,
`tools/lib/container.mjs:41-49`, `tools/lib/container.mjs:127-145`). For block
0, `HDRSUM` uses the same byte-summing path then subtracts the two checksum
bytes before comparison (`src/volutil.asm:83-128`).

After the header checks, the walk validates each descriptor and installs
its assigned drive. Any later failure calls `UNMOUNT`. The returned result
therefore has all assignments mounted or all drives empty
(`src/vol.asm:182-201`, `src/vol.asm:325-365`).

Each descriptor must describe a supported payload. A zero volume id,
unsupported flag bits, unknown geometry, wrong payload length or invalid
start returns `26h`. Only the read-only flag bit is permitted. Length must
match the geometry with a zero upper word. The start must be nonzero and
aligned to eight blocks, placing the first possible payload at block 8
(`src/vol.asm:204-244`).

The walk also prevents payload overlap. Each start must be at least the
previous volume's exclusive end, otherwise it returns `28h`. It calculates
`end = start + length` in 32 bits and returns `27h` on carry or an end above
`containerBlocks`. The exclusive end names the first block beyond the
volume. In standard-capacity mode it can equal `00800000h`, leaving
`007FFFFFh` as the last block. Larger ends are rejected. High-capacity mode
has no corresponding byte-address ceiling (`src/vol.asm:245-296`).

Drive assignment is checked separately from payload placement. `FFh` means
unmounted and 0–3 mean A–D. A nonzero header drives count further bounds
the assignment. A repeated drive returns `29h` and an empty A after the
walk returns `2Ah` (`src/vol.asm:307-353`). Volume ids must be nonzero but
need not be unique. Descriptor byte 15 is reserved. Write policy follows
the logged drive, as Chapter 19 explains (`src/vol.asm:204-211`,
`src/vol.asm:582-598`).

Host validation differs at several of these boundaries. It checks duplicate ids
and, for nonzero minor versions, duplicate labels.
By default it also compares the declared extent with the image's byte length.
The host parser has no `SDBYTE` card-mode input for the standard-capacity
ceiling, so neither validator includes every check performed by the other.
Neither checks every reserved byte. Appendix E gives the field-by-field
comparison (`tools/lib/container.mjs:127-185`, `src/vol.asm:204-353`).

## Declared length and physical capacity

A valid declared range can still extend beyond the physical card.
`MOUNT` compares payloads with the declared container length and reads no
card CSD to measure capacity. An out-of-range transfer then depends on the
card's response. Nonzero R1 from `CMD17` produces SD error 5. A failed BIOS
read reaches the BDOS `Bad Sector` path (`src/vol.asm:254-296`,
`src/sd.asm:397-405`, `src/sd.asm:445-446`, `src/cpm/bdoslog.asm:89-107`,
`src/cpm/bdoscon.asm:23-74`).

The recorded assertions in `test/sd-range.test.mjs:36-106` distinguish the
address ceiling from a short image. Standard-capacity volumes starting at
`800800h` or straddling the ceiling from `7FF000h` return `27h`. A volume
ending exactly at `800000h` mounts. The straddling volume also mounts in
high-capacity mode. Beyond-image cases assert error 5 with no image changes.
These describe source test cases, not newly executed results.

The short-image capture demonstrates the later read failure. Its card is
a copy of `dist/starter.img` shortened with
`truncate -s 2105344 build/short.img`. The remaining 4,112 blocks include
only sixteen of B's thirty-two directory blocks. Logging B in reaches the
missing seventeenth block and reports an error. A's directory is still
accessible afterwards:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card build/short.img '@start DIR B:' '@key x' 'DIR A:*.CMD'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>DIR B:

Bdos Err On B: Bad Sector
A:SYSTEM>DIR A:*.CMD

STARTUP .CMD     128
1 file, 128 bytes
935936 free on A:SYSTEM
A:SYSTEM>
```

A damaged header fails earlier, before a drive is available. Cold boot
enters its diagnostic prompt when `SDINIT` or `MOUNT` fails
(`src/boot.asm:97-101`). This capture uses a starter-image copy whose first
`T` was changed to `X` with
`printf X | dd of=build/bad.img bs=1 seek=0 conv=notrunc`. The `H` key
produced another diagnostic prompt:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card build/bad.img H. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
No volume mounted, error 21
R retry> H
R retry>
```

The reported `21h` is `MEMAGIC`. At this prompt, `R` or `r` retries card
initialisation and mounting. Every other key repeats the prompt
(`src/vol.asm:13-14`, `src/boot.asm:646-667`). Appendix E also covers
host-side header inspection.

## Drive entries and disk parameters

Successful validation produces the resident information used for later
record transfers. Each drive has an eight-byte `DRVTAB` entry: four bytes
of start block, two of length, a geometry byte and a flags byte. `MNFILL`
copies the contiguous start and low length fields with `LDIR`. Flag bit 0
is read-only. A separate `DRVIDX` byte stores
the container index plus one or zero for an empty drive
(`src/vol.asm:558-598`, `src/ram.asm:37-55`).

The geometry byte also identifies an empty entry: zero means no volume.
For an empty drive or a number past D, `SELDSK` returns `HL` = 0 and leaves
`DSKCUR` unchanged. Otherwise it sets `DSKCUR` and returns the disk parameter
header, or DPH. `DPHADR` locates it at `DPHTAB + 16 × drive`
(`src/bios.asm:53-92`). `MNDPH` fills its sixteen bytes as follows
(`src/vol.asm:600-636`, `src/ram.asm:71`):

| Offset | Contents |
| ---: | --- |
| 0 | Zero sector-translation pointer, meaning no skew |
| 2–7 | Three BDOS scratch words, initially zero |
| 8 | Shared 128-byte `DIRBUF` |
| 10 | Pointer to the geometry's disk parameter block (DPB) |
| 12 | `CSVDUM`, unused because `CKS` is zero |
| 14 | Allocation-vector pointer set by `ALVINIT`, left intact by `MNDPH` |

Both supported geometries have 64 records per track, no reserved tracks
and four directory allocation blocks. The remaining parameters determine
their payload sizes and allocation layout
(`format/format.json:46-58`, `tools/lib/format.mjs:9-40`):

| Parameter | G8M (`DPB1`) | G1M (`DPB2`) |
| --- | ---: | ---: |
| Geometry id | 1 | 2 |
| Payload in SD blocks | 16,384 | 2,048 |
| Allocation-block size | 4 KiB | 2 KiB |
| Allocation blocks | 2,048 | 512 |
| Directory entries | 512 | 256 |
| Tracks | 1,024 | 128 |
| `SPT` / `BSH` / `BLM` | 64 / 5 / 31 | 64 / 4 / 15 |
| `EXM` / `DSM` / `DRM` | 1 / 2047 / 511 | 0 / 511 / 255 |
| `AL0` / `AL1` | `F0h` / 0 | `F0h` / 0 |
| `CKS` / `OFF` | 0 / 0 | 0 / 0 |

Fixed-media handling leaves `CKS` zero. CP/M uses that check vector to
detect disk changes on removable floppy drives. TEC-OS uses the DPH scratch
words for directory state retained across warm boot. Their changed flag and
scan mark determine how much of the allocation vector needs rebuilding
(`src/cpm/bdosfile.asm:19-107`). Cold-boot placement is described under
[Allocation vectors below the workspace](15-state-and-memory.md#allocation-vectors-below-the-workspace).

## From a record to a card block

The BDOS supplies the position through `SETTRK` and `SETSEC` and the memory
address through `SETDMA`. Each saves its argument from `BC`. `HOME` selects
track zero and `SECTRAN` returns the sector unchanged. These are logical
positions: there is no head movement or sector-skew adjustment
(`src/bios.asm:1-51`).

`MAPREC` converts that position into a bounded card address. It accepts
sectors 0–63 and tracks 0–1,023 then computes
`record = track × 64 + sector`. The low two record bits give `BLKSLOT`,
the quarter-block position. Division by four gives `BLKOFF`, the offset
within the volume. That offset must be below the `DRVTAB` length. The
32-bit sum of offset and volume start becomes `SDLBA`. Rejection leaves
`SDLBA` unchanged, although intermediate `BLKSLOT` or `BLKOFF` stores may
have occurred (`src/bios.asm:128-189`).

For example, track 2 and sector 5 identify record 133. That is block offset
33 with slot 1. A volume starting at card block 2,048 maps the record to
block 2,081, bytes 128–255 (`src/bios.asm:141-155`, `src/cache.asm:370-378`).

`READ` uses this mapping to transfer the selected record. It masks
interrupts, calls `CREAD` and copies 128 bytes from a cache line to the DMA
address. It then restores the preceding interrupt state and returns
`A` = 0 for success or 1 for error (`src/bios.asm:387-399`,
`src/bios.asm:373-446`, `src/cache.asm:360-417`).

## Merging a write

A record write changes only a quarter of an SD block. The other quarters
must survive unless the allocation block is new. The BDOS identifies the
case in `C`: type 0 is data, type 1 is directory and type 2 starts a newly
allocated allocation block. `WRITE` saves this in `CWTYPE` then maps the
record. A read-only drive returns BIOS error 1 before directory marks or
cached data change. Mapping and type workspace may already have changed
(`src/bios.asm:219-237`).

File callers normally encounter the BDOS `R/O` check before a write
reaches that BIOS boundary. Function 16, close, differs: on read-only media
it succeeds without writing. The source test includes an FCB that was never
opened (`src/cpm/bdoslog.asm:732-749`, `src/cpm/bdosfile.asm:209-258`,
`src/cpm/bdosfile.asm:347-366`, `src/cpm/bdosfile.asm:516-530`,
`src/cpm/bdosrec.asm:61-74`, `src/cpm/bdosrec.asm:274-285`,
`test/cpm22.test.mjs:174-185`). Direct BIOS callers can receive the BIOS
read-only error instead.

Directory changes also affect the next allocation-vector rebuild. Marking
uses the mapped address, regardless of whether the caller supplied type 1.
The directory occupies the first thirty-two SD blocks of G8M or sixteen of
G1M. A write there sets the DPH word at byte offset 4 to 1. It raises the
word at byte offset 6 to at least
`(BLKOFF + 1) × 16`. This covers all sixteen directory entries in the block.
The next warm reset schedules a changed logged-in drive for rebuilding
through that scan mark on selection (`src/bios.asm:239-287`,
`src/cpm/bdosfile.asm:61-107`).

`CWRBH` merges the record into a cache line. On an ordinary miss it first
reads the block, preserving its other records. Type 2 permits a different
path: `WRITE` skips the pre-read and `CWRBH` zeroes the whole line before
copying the record. It zeroes even a line already present in the cache
(`src/bios.asm:298-358`, `src/cache.asm:419-470`).

Sequential writes can extend that saving to the next SD block within the
same allocation block. `GETKEY` stores the cleared block's drive and offset
in `BUFDRV` and `BUFBLK` with `BUFOK` = 2. `WRITE` permits another no-pre-read
only for the immediately following block on that drive. The optimisation
stops at an allocation-block boundary (`src/bios.asm:191-208`,
`src/bios.asm:305-330`).

A preserving write retains the sequential key only for the key's own block
and drive. Other writes clear `BUFOK`. Correct BDOS write types therefore
prevent an out-of-order write from using stale state to clear a filled
block (`src/cache.asm:469-511`). This safety depends on the type-2 contract.
A direct BIOS caller must not label existing data as newly allocated.

Persistence has a separate ordering rule. Every type-1 directory write
first flushes all changed or kept data lines on every drive. Its merged
directory line reaches the card only after those writes succeed. A failed
data write prevents that directory write. Data writes off the logged drive
set `CWTYPE` bit 5 and retain a pending block in `CPEND`. On the logged
drive, several dirty lines may remain until a console read, directory write
or another flush point (`src/bios.asm:343-358`, `src/cache.asm:496-622`).
Chapter 19 explains the flush and failure paths in full.

These rules combine during a sequential new-file write. New allocation
blocks avoid pre-reads. Off the logged drive, four records accumulate in the pending SD block.
Moving to another block or reaching a flush point then writes it. On the logged drive, several changed blocks can accumulate
until a key read or directory write (`src/cache.asm:496-622`). For
`SAVE 8 X.COM` on the starter card, sixteen records occupy four data blocks
on A. Four data writes and two directory writes give six writes in total.
No reads are needed because boot has cached the directory block. An uncached
directory can add metadata reads.

## Bytes on the card interface

At the physical boundary, each block travels through port `FDh` on the
TEC-1G's SD adaptor. Output bit 0 is MOSI, carrying data to the card.
Bit 1 is the clock and bit 2 is active-low chip select. Input bit 7 is
MISO, carrying data from the card. The driver sets outgoing data while
the clock is low then raises the clock for sampling
(`src/layout.asm:15-20`, `src/sd.asm:1-7`, `src/sd.asm:35-69`).

The byte helpers implement that clock sequence. `SPIW` sends the top bit
first by shifting each bit from `C` into carry and writing it with the clock
low then high. `SPIR` holds MOSI high while clocking incoming bits into its
result. `SPIEND` raises chip select and supplies eight more clocks. It
preserves the preceding operation's result (`src/sd.asm:35-89`).

Card commands use the same byte transfers. `SDCMD` sends an idle `FFh`
followed by six command bytes. These contain the command number with bit 6
set, four `SDARG` argument bytes in most-significant-first order and CRC.
It uses `95h` for `CMD0`, `87h` for `CMD8` with argument `1AAh` and `01h`
for other commands. Only `CMD0` and `CMD8` require valid CRC bytes in the
default SPI CRC mode. The remaining commands receive the end bit alone.
`SDCMD` then reads at most sixteen bytes for R1, a response with bit 7 clear
(`src/sd.asm:100-143`).

Callers of `SDINIT`, `SDREAD` and `SDWRITE` test Z for success. Success
also clears `A` and `SDERR`. Failure returns NZ with the error code in both.
The raw byte helpers have different contracts and `LBAARG` reports its range
failure through carry (`src/sd.asm:334-387`, `src/sd.asm:397-457`,
`src/sd.asm:667-737`).

## Initialisation and block addresses

The card's capacity mode determines the address sent with a transfer.
`SDINIT` starts with `SDBYTE` clear and establishes that mode through the
following sequence (`src/sd.asm:190-351`):

1. Supply 80 clocks with chip select high, exceeding the power-up minimum
   of 74, then send `CMD0`. R1 must be `01h`, the idle state. Each of up to
   ten attempts includes those clocks. Exhaustion returns error 1,
   `SDENOCD`, also the usual empty-socket result.
2. Send `CMD8` with argument `1AAh`. Only R1 = `01h` enters the four-byte
   echo check. The third byte's low nibble must be 1 for the 2.7–3.6 V
   range and the fourth byte must be `AAh`. A mismatch returns `0Bh`,
   `SDEVOLT`. Any other R1 skips this check. That branch accommodates older
   cards which reject `CMD8`, though the code does not restrict it to an
   illegal-command response.
3. Send `CMD55` followed by `ACMD41` with HCS, bit 30, set. R1 = 0 from
   `ACMD41` ends the loop. Otherwise the driver makes up to 256 attempts
   with a short 256-turn pause between them. A `CMD55` response with any
   bit except idle bit 0 set returns error 2, `SDEINIT`, immediately and
   sends no `ACMD41`. Exhausting the attempts gives the same error.
4. Send `CMD58` and require R1 = 0, otherwise return error 3, `SDEOCR`.
   Read the four-byte operating conditions register. CCS, bit 6 of its
   first byte, selects block addressing when set.
5. With CCS clear set `SDBYTE` to 1 and send `CMD16` to set a 512-byte
   block length. Failure returns error 4, `SDEBLEN`.

After initialisation, callers always supply a four-byte block number in
`SDLBA`, least significant byte first. `LBAARG` converts it into the
big-endian command argument in `SDARG`. High-capacity cards use the block
number directly. Standard-capacity cards use byte addresses so the driver
multiplies the block number by 512 (`src/sd.asm:354-387`).

That multiplication limits standard-capacity addressing to 32 bits.
The last addressable block is `7FFFFFh`, giving byte address `FFFFFE00h`.
A block number of `800000h` or more would overflow. `LBAARG` returns carry
before changing `SDARG` and either transfer routine returns error 9,
`SDERNG`, before sending a command. The resulting 4 GiB ceiling describes
the address representation. It says nothing about the inserted card's
physical capacity (`src/sd.asm:354-387`, `src/sd.asm:397-400`,
`src/sd.asm:454-457`, `src/sd.asm:667-670`).

## Reading and writing a block

A read begins with `SDREAD` sending `CMD17`. Nonzero R1 returns error 5,
`SDECMD`. With R1 zero, the driver waits for the data token: `FFh` continues
the wait and `FEh` begins the block. The limit is 65,536 polls before error 6,
`SDETOK`. Any other byte immediately returns error `0Ah`, `SDEDTOK`, including
the card's `000xxxxx` data-error tokens. After `FEh`, the driver receives
512 bytes and consumes two CRC bytes without checking them
(`src/sd.asm:397-457`).

Checking for error tokens adds 11 T-states to an ordinary `FFh` wait:
`INC A` and the untaken `JR NZ,SDRERR` (`src/sd.asm:421-422`). This figure
covers only the added check. The retired diagnostics ROM records 678
T-states for its complete poll at `b706f61:docs/diagnostics.md:285-291`.
Those figures measure different amounts of work and cannot be compared
directly.

A write has a second completion stage after data acceptance. `SDWRITE`
sends `CMD24` and requires R1 zero, otherwise returning error 5. It sends
an idle byte, `FEh`, 512 data bytes and two `FFh` CRC bytes. It then reads
up to sixteen bytes for a non-`FFh` response. The low five bits must be
`05h`, meaning data accepted. Any other response or exhaustion returns
error 7, `SDEWRSP`.

Acceptance begins the busy wait. The driver permits 65,536 reads of `00h`
and completes successfully on any nonzero byte. Exhaustion returns error 8,
`SDEBUSY`. A successful return therefore follows the end of reported busy
(`src/sd.asm:667-737`).

Most transfer time is spent clocking the block's 4,096 bits individually.
Both loops write out all eight bit operations for each byte. `SDRBLK` counts
256 two-byte passes in `I`. This ROM uses interrupt mode 1 so `I` supplies no
interrupt-vector address (`src/boot.asm:35-40`). `SDWBLK` uses two passes of
256 bytes. The routines clobber their declared registers, including `I`
on reads (`src/sd.asm:459-655`). In the host model, `SDREAD` takes 219,232
T-states per block, about 55 ms at 4 MHz. `SDWRITE` takes 216,264.

Cache transfers also change the memory mapping. Setting `SDXB` to `LATEXP`
makes the block loop select EXPAND 1 for its buffer and restore `LATCHV`
before returning. The loop uses no stack while EXPAND 1 is visible
(`src/cache.asm:183-195`, `src/cache.asm:213-237`, `src/sd.asm:469-478`,
`src/sd.asm:566-591`, `src/sd.asm:646-655`). BIOS transfer paths and descriptor
service cache walks mask interrupts around this work. The SD transfer alone
supplies no general interrupt guard. The
[EXPAND 1 stack rule](15-state-and-memory.md#expand-1-and-the-stack-boundary)
explains the constraint (`src/bios.asm:395-399`, `src/bios.asm:418-422`,
`src/vol.asm:535-545`). [Appendix D](appendix-d-error-messages.md) links
SD errors to likely causes and recovery.

## Volume services and publication

Runtime volume changes must preserve pending file writes before replacing
a drive's address range. The shell's `CD` uses the numbered ROM service
interface, calling `ABICALL` at `C008h` with the service number in `C`
(`src/abi.asm:9-14`, `src/abi.inc:27-29`, `src/abi.inc:139-169`,
`drivers/shellcd.asm:110-117`). Three services expose the container:

| Service | Arguments and effect |
| --- | --- |
| 9, `MOUNT` | `B` = drive 0–3, `E` = container index. Mount that volume on the drive. |
| 10, `UNMNT` | `B` = drive 1–3. Empty B, C or D. |
| 11, `DESC` | `E` = index, `HL` = 32-byte destination. Copy the descriptor and substitute the current drive byte or `FFh` for unmounted. |

Each operation begins through `VSIN`: `VSMNT`, `VSUNM` and `VSDSC` copy
the drive argument into `C` and invalidate `MNTCB`. Descriptor reads
therefore start afresh. Completion returns `A` = 0 with carry clear.
Rejection returns `TNEBAD`, 1, with carry set (`src/volsvc.asm:167-198`,
`src/volsvc.asm:312-357`).

Validation precedes an assignment change. Mount rejects drives past D,
indices past the table, volumes already mounted and payloads too large for
the drive's allocation-vector slot. Mounting a volume on its existing drive
also counts as already mounted. Descriptor reads can fail. Payloads of
4,096 SD blocks or more require a 256-byte slot. Smaller payloads require
at least 64 bytes, giving the G8M and G1M requirements respectively
(`src/volsvc.asm:211-265`, `src/volsvc.asm:426-460`). Unmount rejects A and
numbers past D. Describe rejects an invalid index or failed table read
(`src/volsvc.asm:182-198`, `src/volsvc.asm:275-282`).

The register contracts are in [Appendix B](appendix-b-rom-services.md).
Each service uses at most 24 stack bytes below its return address, including
dispatch. The six-dirty-line and all-dirty-line assertions in
`test/storage-boundaries.test.mjs:205-250` cover this bound. They are source
assertions and have not been rerun here (`src/abi.inc:35-56`,
`src/abi.inc:139-169`).

The assignment changes only after `VFLUSH` succeeds. It calls `CFLUSH`
with no excluded line, masks interrupts and restores their preceding state
afterwards. Drive, index and descriptor arguments survive the call.
`CFLUSH` attempts every dirty line. A failed line stays dirty for retry
while the remaining lines are attempted. Any failed write makes the final
result a failure (`src/volsvc.asm:360-389`, `src/cache.asm:256-301`).

Validation or flush failure preserves the old drive assignment. Card
writes already completed remain in effect. Even a descriptor read can first
write a dirty victim. This boundary protects the assignment rather than
all storage and workspace bytes (`src/vol.asm:399-416`,
`src/volsvc.asm:211-244`, `src/volsvc.asm:275-322`).

After flushing, mount changes the copied descriptor's drive field and
clears the old entry. `MNONE` installs the entry and DPH then `DRVIDX`
receives index plus one. Unmount clears the entry. Both operations clear
the sequential no-pre-read key and call BDOS function 37 to reset the drive.
Its next use logs it in from the directory (`src/volsvc.asm:231-244`,
`src/volsvc.asm:275-310`, `src/volsvc.asm:397-413`).

Replacing the default drive also requires BDOS function 14 to select it
again. Functions 27 and 31 then refer to the new allocation vector and DPB.
This happens after publication. A subsequent directory-read failure uses
ordinary BDOS error handling and cannot use the earlier validation rollback
boundary (`src/volsvc.asm:335-345`, `src/cpm/bdosfile.asm:109-146`,
`src/cpm/bdoscon.asm:23-74`). These calls use the BDOS private stack.
Programs must invoke mount and unmount outside an ongoing BDOS call
(`src/abi.inc:47-49`).

The new assignment exists in RAM. Mount and unmount leave the header's
drive fields unchanged even though flushing can write pending data. A
recognised reset can retain the assignment. Power-on, an unrecognised reset
or failed reselection reloads the card defaults through boot mounting
(`src/boot.asm:1-6`, `src/boot.asm:97-104`, `src/volsvc.asm:13-129`,
`src/volsvc.asm:231-244`).

The starter card reserves room for runtime changes. Its format 1.1 header
has drives = 4, causing cold boot to allocate four 256-byte slots. Any
starter volume therefore fits any drive (`src/boot.asm:525-633`). In this
capture, service 11 supplies the descriptor list for `CD ?`. Service 9
mounts GAMES on the empty D for `CD D:GAMES`. `CD C:WORK` fails because WORK
is already mounted on B (`drivers/shellcd.asm:99-117`):

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'CD ?' 'CD D:GAMES' 'CD C:WORK'. Boot rows included. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CD ?

SYSTEM      A:
WORK        B:
PROJECTS    C:
GAMES
SPARE
A:SYSTEM>CD D:GAMES
D:GAMES
A:SYSTEM>CD C:WORK
WORK is on B:

A:SYSTEM>
```

Reserving those slots reduces program memory. Four slots use 1,024 bytes,
compared with 320 for G1M on A and G8M on B. The starter TPA is therefore
46,569 bytes, 704 below the two-volume card's 47,273. Format 1.0 reserves
slots only for drives mounted at cold boot. Later mounts must fit those
slots, so a G8M payload cannot replace a G1M-sized slot.
