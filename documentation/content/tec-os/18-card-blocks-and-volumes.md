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

A CP/M disk read transfers 128 bytes. An SD card read transfers 512 bytes. The
BIOS joins these two sizes by mapping each CP/M record to a quarter of a card
block. The volume's start block supplies the other part of the address so the
same track and sector can name different card blocks on A and B
(`src/bios.asm:5-11`, `src/bios.asm:128-185`).

The eight disk entries in the BIOS are `HOME`, `SELDSK`, `SETTRK`, `SETSEC`,
`SETDMA`, `READ`, `WRITE` and `SECTRAN`. They separate the BDOS's record
operations from the card's electrical interface. A volume descriptor defines
the permitted range between those boundaries. The block cache holds the
512-byte blocks used for both record transfers and container-table reads
(`src/tables.asm:23-31`, `src/cache.asm:173-201`, `src/vol.asm:378-416`).

## Bytes on the card interface

The TEC-1G's SD adaptor uses port `FDh`. Output bit 0 is MOSI, the data sent
to the card. Bit 1 is the clock and bit 2 is active-low chip select. Input
bit 7 is MISO, the data received from the card. The driver changes outgoing
data with the clock low and supplies a rising edge for the card to sample
it (`src/layout.asm:15-20`, `src/sd.asm:1-7`, `src/sd.asm:35-69`).

`SPIW` sends a byte from its top bit down. Each pass shifts the next bit
from `C` into carry and writes it with the clock low then high. `SPIR`
receives a byte with MOSI held high. It clocks each bit and shifts the
sampled input bit into the result. `SPIEND` raises chip select and supplies
eight more clocks while preserving the result of the preceding operation
(`src/sd.asm:35-89`).

`SDCMD` first sends an idle `FFh` then a six-byte command. The first byte
is the command number with bit 6 set. Four argument bytes follow from
`SDARG` most significant first. A CRC byte ends the command. The driver
supplies `95h` for `CMD0`, `87h` for `CMD8` with argument `1AAh` and `01h` for other
commands. In the default SPI CRC mode only `CMD0` and `CMD8` need valid
CRC bytes. The other commands get the end bit alone. `SDCMD` reads at
most sixteen bytes for R1, the response whose bit 7 is clear (`src/sd.asm:100-143`).

The high-level operations `SDINIT`, `SDREAD` and `SDWRITE` return Z with
`A` and `SDERR` zero on success. Failure returns NZ with the error code in
both places. This contract does not describe the raw byte-transfer helpers
or `LBAARG`, whose range failure uses carry
(`src/sd.asm:334-387`, `src/sd.asm:397-457`,
`src/sd.asm:667-737`).

## Initialisation and block addresses

`SDINIT` establishes whether later commands need block or byte addresses.
It starts with `SDBYTE` clear and performs these steps
(`src/sd.asm:190-351`):

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

Every subsequent access supplies a four-byte block number in `SDLBA`, least
significant byte first. `LBAARG` writes its big-endian command argument to
`SDARG`. A high-capacity card gets the block number unchanged. A
standard-capacity card gets the block number multiplied by 512 because its
commands use byte addresses (`src/sd.asm:354-387`).

The multiplication must fit in 32 bits. `7FFFFFh` is the last addressable
block in that mode and becomes byte address `FFFFFE00h`. A block number of
`800000h` or more would overflow. `LBAARG` returns carry before changing
`SDARG` in that case. Both transfer routines return error 9, `SDERNG`,
before sending a card command. This is the byte-addressing ceiling at
4 GiB, not a measurement of the inserted card's capacity
(`src/sd.asm:354-387`, `src/sd.asm:397-400`, `src/sd.asm:454-457`,
`src/sd.asm:667-670`).

## Reading and writing a block

`SDREAD` sends `CMD17`. A nonzero R1 returns error 5, `SDECMD`. After a
successful response it polls for the data token. `FFh` means continue
waiting and `FEh` starts the block. The wait permits 65,536 polls before
error 6, `SDETOK`. Every other byte ends the read immediately with error
`0Ah`, `SDEDTOK`. This includes the card's `000xxxxx` data-error tokens.
After `FEh` the driver receives 512 data bytes and reads the two CRC bytes
without checking them (`src/sd.asm:397-457`).

The extra error-token classification costs 11 T-states on a normal `FFh`
wait: `INC A` followed by the untaken `JR NZ,SDRERR`. That is only the
additional check, not the entire token poll (`src/sd.asm:421-422`). The
retired diagnostics ROM's account at `b706f61:docs/diagnostics.md:285-291`
gives 678 T-states for a full poll in that ROM. The 11-T-state addition
therefore cannot be compared directly with that full-poll cost.

`SDWRITE` sends `CMD24` and also requires R1 = 0 or returns error 5. It
sends an idle byte, `FEh`, the 512-byte block and two `FFh` CRC bytes. It
reads up to sixteen bytes for a non-`FFh` response. The low five bits must
be `05h` for data accepted. Any other response or no response returns
error 7, `SDEWRSP`.
The busy wait then permits 65,536 reads of `00h`. Any nonzero byte ends
that wait successfully. Exhaustion returns error 8, `SDEBUSY`. Success
therefore follows the end of reported busy, not merely acceptance of the
data token (`src/sd.asm:667-737`).

Both block-transfer loops have the eight bit operations written out for each
byte. `SDRBLK` counts 256 two-byte passes in the Z80's `I` register. That
register supplies no interrupt-vector address in this ROM's interrupt mode 1
(`src/boot.asm:35-40`). `SDWBLK` uses two passes of 256 bytes. These routines
clobber their declared registers, including `I` on the read path
(`src/sd.asm:459-655`). On the host model `SDREAD` takes 219,232 T-states per block (about 55 ms
at 4 MHz) and `SDWRITE` takes 216,264. Most of that work transferred the block's 4,096 bits individually.

A cache transfer sets `SDXB` to `LATEXP`. The block loop then selects
EXPAND 1 for the buffer and restores `LATCHV` before returning. It uses no
stack while EXPAND 1 is visible (`src/cache.asm:183-195`,
`src/cache.asm:213-237`, `src/sd.asm:469-478`, `src/sd.asm:566-591`,
`src/sd.asm:646-655`). The BIOS transfer paths and descriptor-service cache
walks disable maskable interrupts around their work. The SD transfer itself
does not supply a general interrupt guard. The reason for this boundary is the
[EXPAND 1 stack rule](15-state-and-memory.md#expand-1-and-the-stack-boundary)
(`src/bios.asm:395-399`, `src/bios.asm:418-422`, `src/vol.asm:535-545`).
[Appendix D](appendix-d-error-messages.md) relates the SD error codes to
likely causes and recovery.

## Container blocks and validation

TEC-OS uses a single container on the card. It describes which ranges are
volumes. Block 0
starts with `TECOSVOL`, the major and minor versions, header and descriptor
sizes, volume count, container length in blocks and a checksum. Format 1.1
adds a drives field and an extra-table sum. The descriptors are 32 bytes
each. Fifteen fit after the header fields in block 0 and sixteen fit in
each of blocks 1–7, for a maximum of 127
(`format/format.json:2-42`).

The ROM's field offsets and geometry definitions are generated from
`format/format.json` into `gen/format.asm` and `gen/geom.asm`
(`tools/build.mjs:79-134`). [Appendix E](appendix-e-container-format.md)
contains the byte layout and the host/ROM validation comparison. A fresh
table read avoids using bytes cached during an earlier mount.

`MNBLK` obtains a cache line for the requested table block. `MNTCB` records
the table block last read for this operation. A different block forces a
card read even on a cache hit. Cold `MOUNT` and service entry `VSIN` set
`MNTCB` to `FFh`, forcing the first read too (`src/vol.asm:42-48`,
`src/vol.asm:378-421`, `src/volsvc.asm:353-357`).

Obtaining a line can first require writing a dirty victim. `CWRITE` restores
`SDLBA` by remapping the BIOS record after that write. `MNBLK` therefore calls
`MNLBA` again before filling the line, restoring the requested table block's
address. A failed eviction or read ends this operation with NZ
(`src/cache.asm:213-251`, `src/vol.asm:399-435`). `MNCPH` copies 32 bytes
through `MVCOPY` into the resident workspace's `MNBUF`. Field checks and sums
then use ordinary workspace memory. `MNSUM` processes a whole block in these
32-byte pieces without stack use under the EXPAND 1 mapping
(`src/vol.asm:438-501`, `src/ram.asm:108`).

`MOUNT` initially empties all drives. It checks the header in this order
and returns the first failing check's hexadecimal code
(`src/vol.asm:11-30`, `src/vol.asm:42-143`):

| Check | Failure |
| --- | --- |
| Block 0 can be read | `20h` |
| The eight magic bytes are `TECOSVOL` | `21h` |
| Major version is 1 | `22h` |
| Header size is 512 and descriptor size is 32 | `23h` |
| Volume count is 1–8 for minor 0, otherwise 1–127 | `24h` |
| Header checksum equals the 16-bit sum of the other 510 bytes | `25h` |
| For a nonzero minor version, drives is 0–4 | `23h` |

Minor 0 selects the format 1.0 path. Every other minor value selects the
1.1-style checks, not only minor 1. The host creator uses 1.1 for more than
eight volumes or a nonzero drives field (`src/vol.asm:89-100`,
`src/vol.asm:132-143`, `tools/lib/container.mjs:79-85`).

For that path, the number of table blocks after block 0 is
`floor(volumeCount / 16)`. `MOUNT` adds every byte of those whole 512-byte
blocks, including unused descriptor bytes, modulo 65,536. An unreadable
block returns `20h` and a mismatched sum returns `25h`. There is an exact
exception: with fifteen or fewer descriptors, the zero-block branch skips
the comparison altogether. The ROM accepts a nonzero stored `tableSum`
there if the other checks pass. The host parser computes an empty sum of
zero and rejects a nonzero stored value (`src/vol.asm:145-180`,
`src/vol.asm:479-501`, `tools/lib/container.mjs:41-49`,
`tools/lib/container.mjs:127-145`). `HDRSUM` uses
the same byte-summing path for block 0 and subtracts its two checksum bytes
before comparison (`src/volutil.asm:83-128`).

The descriptor walk validates each descriptor then installs its assigned
drive before advancing. A later failure calls `UNMOUNT` so the returned
result is all mounted or all empty (`src/vol.asm:182-201`, `src/vol.asm:325-365`).

A descriptor check returns `26h` for a zero volume id, unsupported flag
bits, an unknown geometry, the wrong payload length or an invalid start.
Only the read-only flag bit is allowed. Length must equal the geometry's
payload, with its upper word zero. The start must be nonzero and a multiple
of eight blocks. These checks place every payload at block 8 or later
(`src/vol.asm:204-244`).

The walk compares the start against the previous volume's exclusive end.
A lower start returns `28h`. It then computes `end = start + length` in
32 bits. Carry out or an end above `containerBlocks` returns `27h`.
Ascending descriptor order therefore prevents overlapping payloads. The
exclusive end is the first block after the volume. On a standard-capacity
card it may equal `00800000h`, giving last block `007FFFFFh`. An end above
`00800000h` is rejected. High-capacity addressing has no such byte-address limit
(`src/vol.asm:245-296`).

The drive field is `FFh` for unmounted or 0–3 for A–D. A nonzero header
drives count also bounds the assigned drive. Assigning a drive twice
returns `29h`. After the walk, an empty A returns `2Ah`
(`src/vol.asm:307-353`). The ROM checks that ids are nonzero but does not
check their uniqueness. It interprets only bit 0 of the separate cache
byte as written-behind and ignores its upper bits
(`src/vol.asm:204-211`, `src/vol.asm:582-598`).

The host validator also checks cache flags and duplicate ids. For nonzero
minor versions it checks duplicate labels too. By default it compares the
declared extent against the image's byte length. Its checks and the ROM's
checks are not universally nested. The host parser has no
`SDBYTE` card-mode input for the standard-capacity limit. Neither path
validates every reserved byte. Appendix E gives the field-by-field boundary
(`tools/lib/container.mjs:127-185`, `src/vol.asm:204-353`).

## Declared length and physical capacity

`MOUNT` checks against the declared container length. It reads no card CSD
to establish physical capacity. A payload can therefore pass validation yet
extend beyond the real card or model image. Later failure depends on the
card's response. A nonzero R1 from `CMD17` gives SD error 5 and a failed
BIOS read reaches the BDOS's `Bad Sector` path
(`src/vol.asm:254-296`, `src/sd.asm:397-405`, `src/sd.asm:445-446`,
`src/cpm/bdoslog.asm:89-107`, `src/cpm/bdoscon.asm:23-74`).

The source assertions in `test/sd-range.test.mjs:36-106` cover two distinct
bounds. A standard-capacity volume starting at `800800h` or straddling the
limit from `7FF000h` is rejected with `27h`. A volume ending exactly at
`800000h` mounts, as does the straddling volume in high-capacity mode.
The beyond-image cases assert error 5 without image changes. These are
statements about the recorded test cases, not newly executed results.

The short-image capture uses a copy of
`dist/starter.img` truncated with `truncate -s 2105344 build/short.img`.
Its first 4,112 blocks include only sixteen of B's thirty-two directory
blocks. Logging B in reaches the missing seventeenth block. After the
error, A's directory remains accessible:

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

A header failure takes a different route. Cold boot enters the diagnostic
prompt after either `SDINIT` or `MOUNT` fails (`src/boot.asm:97-101`).
The following capture uses another starter-image copy
with its first `T` changed to `X` by
`printf X | dd of=build/bad.img bs=1 seek=0 conv=notrunc`. Typing `H`
produced another prompt:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card build/bad.img H. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
No volume mounted, error 21
R retry> H
R retry>
```

`21h` is `MEMAGIC`. `R` or `r` retries card initialisation and mounting.
Any other key repeats the prompt (`src/vol.asm:13-14`,
`src/boot.asm:646-667`). Appendix E includes host-side header inspection.

## Drive entries and disk parameters

A successful descriptor install builds two related structures. The BIOS
uses an eight-byte entry in `DRVTAB`: four bytes of start block, two of
length, one of geometry and one of flags. `MNFILL` copies the contiguous
start and low length fields with one `LDIR`. Read-only occupies flag bit 0
and written-behind occupies bit 1. `DRVIDX` separately holds container
index plus one, with zero for an empty drive
(`src/vol.asm:558-598`, `src/ram.asm:37-55`).

An empty entry has geometry zero. `SELDSK` returns `HL` = 0 for that drive
or a number past D and leaves `DSKCUR` unchanged. For a valid drive it sets
`DSKCUR` and returns its disk parameter header (DPH).
`DPHADR` computes `DPHTAB + 16 × drive` (`src/bios.asm:53-92`).
`MNDPH` fills the sixteen bytes as follows (`src/vol.asm:600-636`, `src/ram.asm:71`):

| Offset | Contents |
| ---: | --- |
| 0 | Zero sector-translation pointer, meaning no skew |
| 2–7 | Three BDOS scratch words, initially zero |
| 8 | Shared 128-byte `DIRBUF` |
| 10 | Pointer to the geometry's disk parameter block (DPB) |
| 12 | `CSVDUM`, unused because `CKS` is zero |
| 14 | Allocation-vector pointer set by `ALVINIT`, left intact by `MNDPH` |

The two geometries use 64 records per track, no reserved tracks and four
allocation blocks for the directory. Their sizes are
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

`CKS` is zero because the card is treated as fixed media. CP/M's check
vector is for detecting a changed disk on removable floppy drives. TEC-OS
instead uses the DPH scratch words to retain directory state across warm
boot. Their changed flag and scan mark determine the allocation-vector
rebuild (`src/cpm/bdosfile.asm:19-107`). Cold-boot vector placement is
explained under [Allocation vectors below the workspace](15-state-and-memory.md#allocation-vectors-below-the-workspace).

## From a record to a card block

`SETTRK`, `SETSEC` and `SETDMA` save their arguments from `BC`. `HOME`
sets track zero and `SECTRAN` returns the sector unchanged. No head moves
and no skew table alters the sector (`src/bios.asm:1-51`).

`MAPREC` first bounds the sector to 0–63 and the track to 0–1,023. It
computes `record = track × 64 + sector`. The low two record bits become
`BLKSLOT`, the quarter within the SD block. Dividing the record by four
gives `BLKOFF`, the block offset within the volume. That offset must be
less than the length in `DRVTAB`. Adding the volume's start in 32 bits
produces `SDLBA`. A rejected mapping leaves `SDLBA` unchanged, though
intermediate `BLKSLOT` or `BLKOFF` values may have been stored
(`src/bios.asm:128-189`).

Track 2 and sector 5 give record 133. Division by four gives
block offset 33 and slot 1. On a volume starting at block 2,048, this is
card block 2,081. Slot 1 occupies bytes 128–255 of that block
(`src/bios.asm:141-155`, `src/cache.asm:370-378`).

`READ` masks interrupts, maps the record and calls `CREAD` to copy its
128 bytes from a cache line to the DMA address. It restores the preceding
interrupt state and returns `A` = 0 for success or 1 for error
(`src/bios.asm:387-399`, `src/bios.asm:373-446`,
`src/cache.asm:360-417`).

## Merging a write

Writing a quarter-block must preserve the other three quarters unless they
belong to a newly allocated block. The BDOS supplies that information in
`C`: type 0 is data, type 1 is directory and type 2 is the first write to
a newly allocated allocation block. `WRITE` stores the type in `CWTYPE`
and maps the record. A read-only drive then returns BIOS error 1 before
changing directory marks or cached data. Mapping and type workspace may
already have changed (`src/bios.asm:219-237`).

The BDOS applies its own `R/O` check before a file write. Close, function 16,
has a separate read-only return: it succeeds without writing. This also holds
for a file control block (FCB) that was never opened, as the source test asserts
(`src/cpm/bdoslog.asm:732-749`, `src/cpm/bdosfile.asm:209-258`,
`src/cpm/bdosfile.asm:347-366`, `src/cpm/bdosfile.asm:516-530`,
`src/cpm/bdosrec.asm:61-74`, `src/cpm/bdosrec.asm:274-285`,
`test/cpm22.test.mjs:174-185`). A caller using the BIOS directly can instead
receive the BIOS read-only error.

Directory marking depends on the mapped block address, not merely write
type 1. The first thirty-two SD blocks of G8M or sixteen of G1M are the
directory. A write there sets the DPH word at offset 4 to 1. It raises
the word at offset 6 to at least `(BLKOFF + 1) × 16`, covering all sixteen
directory entries in that block. The next warm reset marks a logged-in
changed drive for rebuilding through that mark at its next selection
(`src/bios.asm:239-287`,
`src/cpm/bdosfile.asm:61-107`).

Every write merges through `CWRBH` into the block's cache line. A normal
miss first reads the card block so its other records survive. For type 2,
`WRITE` selects no pre-read. `CWRBH` clears the whole line to zero even
if it was already a cache hit then copies the record into it
(`src/bios.asm:298-358`, `src/cache.asm:419-470`).

The following SD block can also be cleared without reading when it is in
the same allocation block. `GETKEY` records the cleared block's drive and
offset in `BUFDRV` and `BUFBLK` with `BUFOK` = 2. `WRITE` requires that
key to name the immediately preceding block on the same drive. It also
rejects the optimisation at the start of an allocation block
(`src/bios.asm:191-208`, `src/bios.asm:305-330`).

A write which preserves a line's bytes keeps this key only when it names
the key's own block and drive. Otherwise it clears `BUFOK`. With the
BDOS's correct write types, out-of-order writes therefore cannot use a
stale sequential key to clear an already filled block
(`src/cache.asm:469-511`). This protection relies on the type-2 contract.
A direct BIOS caller must not label existing data as newly allocated.

Every directory write, type 1, writes every changed or kept data line
first, on any drive. Only after those writes succeed does its own merged
line reach the card; a failed data write refuses the directory write.
A data write off the logged drive sets bit 5 of `CWTYPE` and leaves one
pending block in `CPEND`. Data on the logged drive may remain in several
dirty lines until a console read, directory write or another flush point
(`src/bios.asm:343-358`, `src/cache.asm:496-622`). Chapter 19 explains
these two rules and the failure paths in full.

Sequential writes to a new file can therefore avoid data pre-reads. On
a drive not logged they also avoid writing each SD block after each of its
four records: one block stays pending and is written when the write moves
on or a flush point arrives. On the logged drive several changed blocks
can wait together until the next key read or directory write
(`src/cache.asm:496-622`). On the starter card `SAVE 8 X.COM` writes sixteen
records in four data blocks on A. It causes four data-block writes plus two
directory-block writes, six writes in total. No reads are needed because
the directory block is already cached after boot. An
uncached directory can add metadata reads to a new-file operation.

## Volume services and publication

The shell's `CD` changes drives through the numbered ROM service
interface. It calls `ABICALL` at `C008h` with the service number in `C` (`src/abi.asm:9-14`, `src/abi.inc:27-29`,
`src/abi.inc:139-169`, `drivers/shellcd.asm:110-117`). These three services
expose the container:

| Service | Arguments and effect |
| --- | --- |
| 9, `MOUNT` | `B` = drive 0–3, `E` = container index. Mount that volume on the drive. |
| 10, `UNMNT` | `B` = drive 1–3. Empty B, C or D. |
| 11, `DESC` | `E` = index, `HL` = 32-byte destination. Copy the descriptor and substitute the current drive byte or `FFh` for unmounted. |

`VSMNT`, `VSUNM` and `VSDSC` begin with `VSIN`. It copies the drive
argument into `C` and invalidates `MNTCB` so a table read starts afresh.
Normal service completion returns `A` = 0 with carry clear. Rejection
returns `TNEBAD`, 1, with carry set (`src/volsvc.asm:167-198`,
`src/volsvc.asm:312-357`).

A mount rejects a drive past D, an index past the table, an already mounted
volume or an allocation-vector slot too small for the payload. The
already-mounted check also rejects mounting a volume again on its current
drive. Descriptor reads can fail too. A payload of 4,096 SD blocks or more
needs a 256-byte slot. A smaller payload needs at least the 64-byte slot.
The supported geometries therefore require the G8M or G1M slot respectively
(`src/volsvc.asm:211-265`, `src/volsvc.asm:426-460`). An unmount rejects
A and drives past D. A describe rejects an invalid index or failed table
read (`src/volsvc.asm:182-198`, `src/volsvc.asm:275-282`).

[Appendix B](appendix-b-rom-services.md) gives the register contracts.
Each service has a 24-byte stack bound below its return address, including
the dispatcher. `test/storage-boundaries.test.mjs:205-250` contains the
six-dirty-line and all-dirty-line assertions for this bound. These source
assertions have not been rerun here (`src/abi.inc:35-56`,
`src/abi.inc:139-169`).

Before a mount or unmount publishes a different drive assignment,
`VFLUSH` calls `CFLUSH`, with no line excluded, with interrupts masked and
restores their preceding state afterwards. It preserves the requested drive,
index and descriptor across that call. `CFLUSH` attempts every dirty line. It
keeps a failed line dirty for the next flush and continues with the rest,
then returns failure if any write failed
(`src/volsvc.asm:360-389`, `src/cache.asm:256-301`).

Validation or this flush failure leaves the drive assignment unchanged.
It does not roll back card writes. Even a
descriptor read can require a dirty victim write. The old assignment is
the protected state at this boundary, not every byte of storage or
workspace (`src/vol.asm:399-416`, `src/volsvc.asm:211-244`,
`src/volsvc.asm:275-322`).

After a successful flush, mount changes the descriptor copy's drive field,
clears the old drive entry, installs the new entry and DPH through `MNONE`
and records index plus one in `DRVIDX`. Unmount simply clears the old
entry. Both clear the sequential no-pre-read key and call BDOS function 37
to reset that drive. Its next use then logs it in from its directory
(`src/volsvc.asm:231-244`, `src/volsvc.asm:275-310`,
`src/volsvc.asm:397-413`).

Mounting onto the default drive also calls function 14 to select it again.
Functions 27 and 31 then refer to the new volume's allocation vector and
DPB. This reselection follows publication so a subsequent directory-read
error uses ordinary BDOS error handling rather than the earlier validation
rollback boundary (`src/volsvc.asm:335-345`,
`src/cpm/bdosfile.asm:109-146`, `src/cpm/bdoscon.asm:23-74`). These
BDOS calls use its private stack. Programs must call mount and unmount
from outside an ongoing BDOS call (`src/abi.inc:47-49`).

The services leave the container header's drive assignments unchanged.
Their flush can write pending data but their new assignment is held in RAM.
A recognised reset can retain it. Power-on, an unrecognised reset or failed
reselection restores the card's defaults through the boot mount path
(`src/boot.asm:1-6`, `src/boot.asm:97-104`,
`src/volsvc.asm:13-129`, `src/volsvc.asm:231-244`).

The starter card is format 1.1 with drives = 4, so cold boot allocates four
256-byte slots and any of its volumes fits any drive (`src/boot.asm:525-633`).
`CD ?` lists the card's descriptors through service 11, `CD D:GAMES` mounts
GAMES on the empty D through service 9, and `CD C:WORK` is refused because
WORK is on B (`drivers/shellcd.asm:99-117`):

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

The four slots use 1,024 bytes where a card with a G1M slot on A and a G8M
slot on B uses 320, so the starter card's transient program area (TPA) is
46,569 bytes, 704 less than the 47,273 of such a two-volume card. A format
1.0 card reserves slots only for the drives mounted at cold boot, and a
mount there must fit them: a G8M volume onto a G1M-sized slot is refused.
