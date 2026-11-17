---
title: A file through the BDOS
parent: TEC-OS
nav_order: 20
nav_group: "Inside TEC-OS"
---

# 20. A file through the BDOS

<!-- Checked against TEC-OS 57a8c38b7f341433285e39c4bec14ecc486ffe26 (retained recovery baseline),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED 02b63d8;
     Baza is the qualified eee4ee6 payload. Source-derived excerpts are
     labelled separately from console captures. -->

Writing records and publishing a file's directory state are separate
operations. Make creates the directory entry. Later writes update the
program's file control block, or FCB, and close copies that state back to
the directory. Until close, the FCB can describe records absent from the directory (`b95b2a9:src/cpm/bdosfile.asm:451-514`,
`b95b2a9:src/cpm/bdosrec.asm:69-82`, `b95b2a9:src/cpm/bdosfile.asm:252-287`).

The make, write, close, open and read calls from Chapter 10 operate on
these two copies of file state. Following them inside the BDOS connects
the FCB to directory searches, allocation and record addresses. Physical
transfers use Chapter 18's BIOS and Chapter 19's cache.
[Chapter 9](09-call-tec-os.md) gives console call contracts and
[Chapter 17](17-console-paths.md) explains their implementation.
[Appendix A](appendix-a-bdos-functions.md) contains the function reference.

## The file in memory and on disk

The persistent description starts in the directory, a table of 32-byte
entries at the front of the volume. Each entry identifies a file and user
area and maps allocation blocks containing its 128-byte records. Here,
*block* means an allocation block. A *card block* remains a 512-byte SD
block, following Chapter 18.

The program supplies a 36-byte FCB. The BDOS copies directory state into it
and updates its position, record count and allocation map during I/O
(`b95b2a9:src/cpm/bdosfn.asm:489-529`, `b95b2a9:src/cpm/bdosrec.asm:143-158`,
`b95b2a9:src/cpm/bdosrec.asm:178-233`). Read-only and system attributes occupy bit 7
of bytes 9 and 10 respectively (`b95b2a9:src/cpm/bdosfile.asm:355-366`,
`b95b2a9:src/cpm/ccpfile.asm:98-104`):

| Offset | Field | Contents |
| ---: | --- | --- |
| 0 | `DR` | drive: 0 the default, 1 to 16 A to P |
| 1–8 | `F1`–`F8` | the name, in capitals, padded with spaces |
| 9–11 | `T1`–`T3` | the type. Bit 7 of `T1` is the read-only attribute, of `T2` the system attribute |
| 12 | `EX` | the extent, 0 to 31 |
| 13 | `S1` | unused |
| 14 | `S2` | the extent's high bits, 0 to 63, and in bit 7 the mark of an FCB not written since open or make |
| 15 | `RC` | the count of records in the extent, 0 to 128 |
| 16–31 | `D0`–`D15` | the allocation map |
| 32 | `CR` | the next record in the extent for a sequential read or write |
| 33–35 | `R0`–`R2` | the record number for a random read or write |

The first 32 FCB bytes correspond to a directory entry, except that the
entry stores the user number where the FCB stores its drive. Allocation
maps contain sixteen one-byte numbers for volumes of at most 256 blocks
or eight two-byte numbers for larger volumes. `FCBLOCK` and `BLOCKIDX`
select the width from the high byte of `DSM`, the last block number
(`b95b2a9:src/cpm/bdosrec.asm:462-472`, `b95b2a9:src/cpm/bdosrec.asm:528-546`). Both TEC-OS
geometries exceed 256 blocks and therefore use eight two-byte numbers.

Larger files require extents because an entry has limited map space.
A logical extent contains 128 records, or 16 KiB. An entry holds as many
extents as its allocation map permits. The disk parameter block, or DPB,
supplies the geometry for this calculation (`b95b2a9:format/format.json:46-58`):

| Field | G1M | G8M | Meaning |
| --- | ---: | ---: | --- |
| `SPT` | 64 | 64 | records a track |
| `BSH` | 4 | 5 | records a block, as a power of 2 |
| `BLM` | 15 | 31 | records a block, less 1 |
| `EXM` | 0 | 1 | extents an entry holds, less 1 |
| `DSM` | 511 | 2,047 | the last block's number |
| `DRM` | 255 | 511 | the last directory entry's number |
| `AL0`, `AL1` | `F0h`, 0 | `F0h`, 0 | the directory's blocks, a bit each |
| `CKS` | 0 | 0 | the check vector's length |
| `OFF` | 0 | 0 | reserved tracks |

The same eight map cells describe different amounts of data on the two
geometries. G1M's 2 KiB blocks give 16 KiB, an extent per entry. G8M's
4 KiB blocks give 32 KiB, two extents per entry and `EXM` = 1.

### Directory searches

Directory functions use `FINDENT` to locate the relevant entry. `NEWSRCH`
starts at the beginning with the mode in `OPENMOD`
(`b95b2a9:src/cpm/bdosfn.asm:375-472`). Each directory record supplies four entries
to the DPH's directory buffer. `MATCHFCB` compares them with the FCB
(`b95b2a9:src/cpm/bdosfn.asm:559-651`).

Modes 0, 1, 2 and 4 match the current user plus name and type. They ignore
bit 7 so attributes do not affect the name. An FCB `?` matches any
character. Modes 0, 1 and 4 also compare `EX` and `S2` unless the FCB
extent is `?`. Extent comparison excludes `EXM` bits because an entry
covers `EXM` + 1 extents (`b95b2a9:src/cpm/bdosfn.asm:609-643`). Modes 3 and 5
use the separate conditions below:

| Mode | Used by | Matches |
| ---: | --- | --- |
| 0 | functions 17 and 18 | name and extent. The record goes to the DMA address |
| 1 | open and the move to the next extent | name and extent. The entry's fields go into the FCB |
| 2 | delete, rename, set attributes, file size | name, any extent |
| 3 | make | an empty entry, `E5h` in its first byte |
| 4 | close | name and extent, nothing copied |
| 5 | function 17 with `?` in the drive byte | every entry |

An ordinary name search can stop before unused directory space. Its
`DIRUSED` mark bounds the entries that may need scanning. BIOS directory
writes can raise that bound to the end of a card block, past the last live
entry (`b95b2a9:src/cpm/bdosfn.asm:409-426`, `b95b2a9:src/bios.asm:267-287`,
`b95b2a9:src/cpm/bdoslog.asm:288-306`, `b95b2a9:src/cpm/bdoslog.asm:336-353`). Modes 3 and
5 scan to the end because they seek free or arbitrary entries.

On starter B, the directory has 512 entries in 32 card blocks. Initial
login still scans that directory. Once an empty volume is logged in, an
ordinary name search reads no directory record. `MAKEFCB` raises the mark
when using an entry beyond it (`b95b2a9:src/cpm/bdosfile.asm:500-511`). The same
bound limits a later warm-boot rebuild of a changed drive.

## The call and its drive

A program puts the function number in `C` and its parameter in `DE`, then
calls `0005h` (`b95b2a9:src/cpm/bdos.asm:108-129`). For make, write, close, open and
read, `DE` points to the FCB.

The address at `0005h` remains stable while the RAM jump target can move.
Cold boot places `JP BENTRY` directly below the allocation vectors, as
Chapter 15 describes. With resident services loaded, the jump occupies the
start of the lowest service's page (`b95b2a9:src/boot.asm:633-638`,
`b95b2a9:src/boot.asm:304-319`, `b95b2a9:src/loader.asm:337-340`).

Entry separates the caller's stack from BDOS working storage. The original
`CALL` leaves its return word on the caller's stack. `BENTRY` saves that
stack pointer in `OLDSP`, selects the BDOS private stack and saves `DE`
in `PARAM` (`b95b2a9:src/cpm/bdos.asm:124-129`). The selected function's normal work and its BIOS
calls use that stack. Maintenance temporarily switches to the housekeeping
worker without changing the logical caller's restrictions.

Dispatch first tests the seven supported CP/M 3 numbers above 40: 44, 45,
46, 47, 48, 99 and 108 (`b95b2a9:src/cpm/bdos.asm:131-145`). Appendix A lists their
contracts. Chapter 13 explains 47 and 108 and the error section below
explains 45. After ordinary entry service, all other numbers above 40 return zero
(`b95b2a9:src/cpm/bdos.asm:146-147`).

A function from 0 to 40 has a routine in `FNTAB`, a table of 41 words
(`b95b2a9:src/tables.asm:85-92`, `b95b2a9:src/cpm/bdos.asm:148-155`). Functions 38 and 39,
which CP/M 2.2 leaves undefined, return 0.

Some functions take an FCB and work on the drive its first byte names. That
drive is selected before the routine runs. `FCBMAP` has a bit for each
function, set for 15, 16, 17, 19 to 23, 30, 33 to 35 and 40
(`b95b2a9:src/tables.asm:93`, `b95b2a9:src/cpm/bdos.asm:159-178`). For those `BENTRY` calls
`FCBSEL`, which reads the FCB's first byte: 0 for the default drive and 1 to
16 for A to P (`b95b2a9:src/cpm/bdosfile.asm:176-195`). A `?` is allowed only for
function 17, where it selects every entry of the default drive's directory.
In any other function it is the `Select` error.

An FCB can refer to a different drive from the default. `CURDRV` records
the currently bound drive for the operation. `DEFDRV` records the default
shown at the command prompt. Only function 14 and disk reset change that
default (`b95b2a9:src/cpm/bdosfile.asm:128-136`). `SELDRV` rejects numbers 16 or
above and calls `LOGIN` unless the drive is already bound and logged in
(`b95b2a9:src/cpm/bdosfile.asm:148-162`). Selection reads the FCB's drive byte
without rewriting it.

Before dispatch, `DE` is restored from `PARAM`. The routine finishes
through `RETZERO`, `RETA` or `RETWORD`, supplying zero, the byte in `A`
or the word in `HL` respectively (`b95b2a9:src/cpm/bdos.asm:180-182`,
`b95b2a9:src/cpm/bdos.asm:195-216`). Each exit puts the result in `HL`, its low
byte in `A` and its high byte in `B`, matching CP/M 2.2. It restores the
caller stack and returns. The interface preserves no other register.

## Making and writing the file

Function 22 creates the file's name before allocating its contents.
It takes a directory entry immediately but obtains the first data block
only when a write needs it. Empty files can therefore exist without data
blocks (`b95b2a9:src/cpm/bdosfile.asm:428-514`, `b95b2a9:src/cpm/bdosrec.asm:38-52`).

Make searches in mode 3 for the first empty entry. It fills the entry with the
FCB's name, the current user number and an empty map and writes the entry's
directory record at once (`b95b2a9:src/cpm/bdosfile.asm:451-514`). As in CP/M 2.2 it
clears `S2` and keeps `EX` so the entry is the extent `EX` names among the
file's first 32. It clears `S1`, `RC` and the map in the FCB too
(`b95b2a9:src/cpm/bdosfile.asm:428-435`, `b95b2a9:src/cpm/bdosfile.asm:458-472`). Make leaves
`CR` and the random-record bytes alone. For a sequential file the program
supplies `CR` = 0, as in Chapter 10. Make returns an entry slot from 0 to 3 or
`FFh` if the directory is full. Every directory write goes to the BIOS as write
type 1 (`b95b2a9:src/cpm/bdoslog.asm:83-108`). On any volume, a directory
write flushes the other dirty and kept cache lines first, as Chapter 19 describes
(`b95b2a9:src/cache.asm:560-569`).

The FCB records whether close needs to publish changes. Make and open set
`S2` bit 7, marking state unchanged since that operation
(`b95b2a9:src/cpm/bdosfile.asm:495-499`, `b95b2a9:src/cpm/bdosfn.asm:525-527`). A successful
write clears the bit through `ADVWRITE` (`b95b2a9:src/cpm/bdosrec.asm:143-158`).
`ALLOCBLK` also clears it immediately after adding a map entry
(`b95b2a9:src/cpm/bdosrec.asm:593-615`). Reading alone leaves close with nothing
to write back.

Function 21 writes the record selected by `CR`
(`b95b2a9:src/cpm/bdosrec.asm:20-82`). A missing map entry causes `ALLOCBLK` to
reserve the first free block. The first write to it uses BIOS type 2
(`b95b2a9:src/cpm/bdosrec.asm:43-59`), permitting a zeroed cache line without a
card pre-read (`b95b2a9:src/bios.asm:298-351`, `b95b2a9:src/cache.asm:462-488`). Existing
records use type 0. Only BIOS success advances `CR`. Failure leaves the
FCB positioned at the record still requiring a write
(`b95b2a9:src/cpm/bdosrec.asm:69-82`).

### A record's card address

Record addressing first selects an allocation-map cell. `FCBADDR` takes
`EX` AND `EXM`, multiplies by 128, adds `CR` and shifts right by `BSH`
(`b95b2a9:src/cpm/bdosrec.asm:501-526`). `POSREC` then calculates the volume record:
the selected block shifted left by `BSH`, plus `CR` AND `BLM`
(`b95b2a9:src/cpm/bdosrec.asm:699-716`).

The BIOS interface takes track and sector, so `DIV16` divides by `SPT`
using sixteen shift-and-trial-subtraction steps. `SETTRK` receives the
quotient. `SECTRAN` and `SETSEC` receive the remainder
(`b95b2a9:src/cpm/bdosrec.asm:717-760`). BIOS `MAPREC` recombines them and extracts
`BLKOFF` and `BLKSLOT`, the card-block offset and quarter-block position
from Chapter 18 (`b95b2a9:src/bios.asm:128-155`).

The address calculation can be followed for record 37 of extent 0.
The file is on G1M drive A and its third map cell contains block 300. `FCBADDR` gives 0 × 128 +
37 = 37 and 37 shifted right by 4 is 2, the third cell. `POSREC` shifts 300 left
by 4 to get 4,800 and adds 37 AND 15, which is 5. The record is 4,805 of the
volume and 4,805 divided by 64 is track 75, sector 5. `MAPREC` makes 75 × 64 + 5
= 4,805 again. `BLKOFF` is 4,805 divided by 4, card block 1,201 of the volume,
and `BLKSLOT` is the remainder, 1. The card block is the volume's start block
plus 1,201 (`b95b2a9:src/bios.asm:128-185`).

Address calculation rejects a damaged map before transfer. `POSREC`
calls `CHKBLK` to compare the block number with `DSM`. A number beyond
the volume produces `Bad Sector` (`b95b2a9:src/cpm/bdosrec.asm:699-700`,
`b95b2a9:src/cpm/bdoscon.asm:76-92`). Such a reference indicates damaged file
metadata.

### The next extent

After record 127, the next write finds `CR` = 128. It closes the current
extent then opens or creates the next (`b95b2a9:src/cpm/bdosrec.asm:21-31`,
`b95b2a9:src/cpm/bdosrec.asm:94-121`). No free data block returns 2. A required
directory entry with no free slot returns 1. In that case the FCB retains
its extent and `CR` = 128, allowing retry after an entry is freed
(`b95b2a9:src/cpm/bdosrec.asm:94-135`). The write also returns 1 if closing the previous extent fails because
its entry has disappeared, as after deletion under an open FCB
(`b95b2a9:src/cpm/bdosrec.asm:94-98`).

## Closing the file

Close publishes the FCB state that writing accumulated. Function 16
returns zero when no write is needed, the entry slot 0–3 after an update
or `FFh` if no matching entry exists (`b95b2a9:src/cpm/bdosfile.asm:209-227`).
An unchanged FCB with `S2` bit 7 set returns immediately
(`b95b2a9:src/cpm/bdosfile.asm:229-235`). Read-only drives also return success
without writing (`b95b2a9:src/cpm/bdosfile.asm:252-258`).

Otherwise mode 4 finds the entry again. Close copies extent, record count
and map from the FCB. An earlier FCB extent updates only the map. It then
writes the directory record (`b95b2a9:src/cpm/bdosfile.asm:252-287`). The cache
writes every other dirty line before this directory line. Failed flushes
remain errors and completed writes are not undone. Chapter 19 explains
this persistence boundary (`b95b2a9:src/cache.asm:527-569`).

## Opening and reading the file

Open reconstructs FCB state from the directory. Function 15 uses mode 1
and copies bytes 1–31 (`b95b2a9:src/cpm/bdosfn.asm:489-529`). Name wildcards become
the matching entry's characters. The FCB retains its requested extent.
The entry's `RC` describes its highest extent, so an earlier extent in a
two-extent G8M entry receives 128 records. A later empty extent receives
zero. Open returns slot 0–3 or `FFh` for no matching extent
(`b95b2a9:src/cpm/bdosfile.asm:205-207`, `b95b2a9:src/cpm/bdosfn.asm:542-544`).

Function 20 reads `CR` to DMA and advances the position
(`b95b2a9:src/cpm/bdosrec.asm:178-233`). At `CR` = 128 it closes the FCB, opens
the next extent and starts at record zero. It returns 1 when that extent
is absent, `CR` reaches or exceeds `RC` or the map cell contains block 0.
A failed extent-boundary close also returns 1 (`b95b2a9:src/cpm/bdosrec.asm:188-233`).

### Deletion and the shared entry

Deletion reverses allocation only after publishing the empty entry.
Function 19 marks a match `E5h`, writes its directory record then frees
its blocks (`b95b2a9:src/cpm/bdosfile.asm:380-415`). Random functions 33, 34 and
40, plus size, rename and attribute operations, use these same entries
and FCBs. Appendix A gives their individual return codes.

## Free space and drive login

Allocation cannot afford a full directory scan for every new block.
Each drive therefore retains an allocation vector with a set bit for
each occupied block. Chapter 15 explains cold-boot placement. The DPH
supplies its address and `LOGIN` copies it into `ALVPTR`
(`b95b2a9:src/cpm/bdoslog.asm:206-209`).

`ALLOCBLK` searches from block 0 for the first clear vector bit, sets it
and puts the block in the FCB map (`b95b2a9:src/cpm/bdosrec.asm:555-626`). Delete
clears bits for the entry's blocks (`b95b2a9:src/cpm/bdoslog.asm:508-583`). Vector
construction reserves directory blocks from `AL0` and `AL1` so allocation
cannot give them to files (`b95b2a9:src/cpm/bdoslog.asm:410-432`).

Reserving the bit precedes close. Other files therefore cannot allocate a
block already reserved by an open FCB. Allocation also marks the FCB changed
(`b95b2a9:src/cpm/bdosrec.asm:593-615`). Close after a failed data write can still
publish that block's entry. Its own result must also succeed. An exit without
close leaves the next vector rebuild to derive allocation from the directory.

### The first selection

The vector initially comes from a directory scan on first selection after
disk reset (`b95b2a9:src/cpm/bdoslog.asm:165-276`). `LOGIN` obtains the DPH through
BIOS `SELDSK`. Zero means no volume and produces `Select`
(`b95b2a9:src/cpm/bdoslog.asm:173-181`). The DPH supplies translation, directory
buffer, DPB and vector pointers. A read-only volume sets the drive's
read-only vector bit (`b95b2a9:src/cpm/bdoslog.asm:211-216`).

For drives absent from `LOGINV`, `INITALV` clears allocation and reserves
the directory blocks. Login sets the drive bit and scans every directory
record. `PARENT` reserves each live entry's blocks and advances the directory
mark (`b95b2a9:src/cpm/bdoslog.asm:219-276`, `b95b2a9:src/cpm/bdoslog.asm:440-495`).
`BITPTR` skips block numbers beyond the volume because no vector bit exists
for them (`b95b2a9:src/cpm/bdoslog.asm:598-605`). Login still succeeds and deletion
also skips those numbers. Already logged drives use `LOGFAST` to restore
the DPH mark with no reads (`b95b2a9:src/cpm/bdoslog.asm:288-306`).

## Rebuilding after warm boot

Warm boot can avoid repeating that initial scan by checking retained
per-drive state. The DPH reserves words at offsets 2, 4 and 6 for the BDOS.
`MNDPH` clears them on construction (`b95b2a9:src/vol.asm:608-615`):

| Offset | Contents | Written by |
| ---: | --- | --- |
| 2 | the sum of the vector's bytes at the end of the last scan | `LOGDONE` (`b95b2a9:src/cpm/bdoslog.asm:315-328`) |
| 4 | the changed flag: 1 once the vector may differ from the directory | `ALFOUND` (`b95b2a9:src/cpm/bdosrec.asm:598-603`) and BIOS `WRITE` of a directory card block (`b95b2a9:src/bios.asm:239-266`) set it and `LOGDONE` clears it |
| 6 | the directory mark, `DIRUSED` | `DUSAVE` (`b95b2a9:src/cpm/bdoslog.asm:336-353`), BIOS `WRITE` of a directory card block (`b95b2a9:src/bios.asm:267-287`) |

BIOS directory writes contribute to the retained state even when a
program bypasses BDOS file calls. `WRITE` recognises directory card
addresses, sets the changed flag and raises the mark through all sixteen
entries in the block (`b95b2a9:src/bios.asm:239-287`). `DUSAVE` raises the stored
mark only when the BDOS mark is higher. Neither path can lower the other's
scan bound.

This check avoids the directory traffic caused by an ordinary CP/M 2.2
warm reset. That reset logs drives in again on selection, reading thirty-two
card blocks for G8M. Chapter 16 records model timings. TEC-OS's CCP still
calls function 13 but first sets `WRFLAG` (`b95b2a9:src/cpm/ccp.asm:75-134`). The
flag routes reset to `WRESET` (`b95b2a9:src/cpm/bdosfile.asm:19-24`).

`WRESET` visits drives 0–15 and skips those absent from `LOGINV`
(`b95b2a9:src/cpm/bdosfile.asm:61-107`). For a logged drive, `LOGIN` binds its
pointers without reading. The DPH state then determines reuse or rescan:

- If the changed flag is set, the drive is taken out of `LOGINV` and put in
  `WARMV`, the vector of drives to rebuild to their mark
  (`b95b2a9:src/ram.asm:243`). At its next selection `LOGIN` builds the vector again
  but reads the directory only up to the mark (`b95b2a9:src/cpm/bdoslog.asm:237-249`).
  The mark covers every entry recorded as used so the scan can omit the
  remaining empty entries.
- If the flag is clear, `ALVSUM` adds up the vector's bytes with `SUMDE`,
  the routine that also sums the container's table
  (`b95b2a9:src/cpm/bdoslog.asm:361-367`, `b95b2a9:src/cpm/bdoslog.asm:384-401`,
  `b95b2a9:src/volutil.asm:115-128`). If the sum is what `LOGDONE` stored, the drive
  stays logged in with its vector as it is. A different sum indicates a
  change that neither an allocation nor a directory write recorded, such as
  a stray write by a program. That drive is taken out of `LOGINV` and
  scanned in full at its next selection. Equal sums are not a byte-for-byte
  comparison of the vector.

### The reset tail

The reset tail restores the ordinary entry conditions. `WRESET` joins
`RSTAIL`, which clears the read-only vector, selects A, sets DMA to
`0080h` and logs A in (`b95b2a9:src/cpm/bdosfile.asm:30-44`). After a full or partial
scan, `LOGDONE` stores the mark and new sum and clears the changed flag
and `WARMV` bit (`b95b2a9:src/cpm/bdoslog.asm:315-328`).

Unchanged vectors with clear flags need no warm-boot directory reads.
Changed A state requires a scan through its retained mark. A BIOS write
can extend that mark past the final live entry to the card-block boundary.

A program's explicit reset preserves CP/M 2.2 semantics. Function 13
finds `WRFLAG` clear and empties `LOGINV` and `WARMV`, forcing full scans
on later selection (`b95b2a9:src/cpm/bdosfile.asm:25-28`). Function 37 instead
removes the drives selected by the bits in `DE` from those vectors and the read-only
vector (`b95b2a9:src/cpm/bdosfn.asm:343-355`). `MOUNT` and `UNMNT` use it after
replacing a volume (`b95b2a9:src/volsvc.asm:286-310`).

Mounting the default drive also selects it with function 14 and logs the
new volume in (`b95b2a9:src/volsvc.asm:335-345`). Functions 27 and 31 then return
that volume's allocation-vector and DPB pointers (`b95b2a9:src/cpm/bdosfn.asm:48-53`,
`b95b2a9:src/cpm/bdosfn.asm:145-153`).

## Code and writable state

The file lifecycle is implemented by Portable CP/M's BDOS, written from
the documented CP/M 2.2 interface without Digital Research source
(`b95b2a9:src/cpm/PROVENANCE.md:3-7`). TEC-OS assembles its six files in this order
(`b95b2a9:src/rom.asm:36-41`):

| File | Contents |
| --- | --- |
| `bdos.asm` | the entry, the dispatch and the console functions |
| `bdosfile.asm` | the disk reset, the selection of a drive and the functions on whole entries: open, close, search, delete, make, rename and the attributes |
| `bdosrec.asm` | the records, the FCB's fields and the allocation of blocks |
| `bdosfn.asm` | the functions that read the BDOS's tables and the directory search |
| `bdoslog.asm` | the directory records, the login and the allocation vectors |
| `bdoscon.asm` | the errors and the console's output |

The historical `57a8c38` ROM map places the BDOS between `BDOSBAS` at `E573h` and its last
byte at `F34Dh`, before `SVCDSP`: 3,547 bytes. Chapter 27 describes the ROM
layout. The function table and four disk-error strings also reside in ROM
(`57a8c38:src/tables.asm:85-93`, `57a8c38:src/text.asm:71-77`). Hooks must therefore use a
writable RAM interface.

Writable working state occupies `BDOSRAM` through exclusive `BDOSRME`,
`BE6Dh–BEFFh` on the starter card (`b95b2a9:src/ram.asm:215-294`). Its top contains
the 64-byte stack (`b95b2a9:src/layout.asm:110`). Warm boot clears this block as
a fresh disk load would, then sets DMA to `0080h` (`b95b2a9:src/boot.asm:402-409`).

State needed across warm boots remains outside that cleared block.
`LOGINV` records built allocation vectors in BIOS workspace (`b95b2a9:src/ram.asm:69`).
`PRGCODE`, function 108's result, sits above the RAM BIOS table and clears
only at cold boot (`b95b2a9:src/ram.asm:372-373`, `b95b2a9:src/boot.asm:61-65`). Each DPH
retains its drive pointers and scan state, following Chapter 18's layout.

BDOS-to-BIOS calls use offsets into the RAM table at `BF00h`
(`b95b2a9:src/cpm/bdos.asm:20-34`). Replacing an entry intercepts those calls, as
[Chapter 17](17-console-paths.md#the-bios-boundary) explains. Output status
is an exception: it calls ROM `BCONST` directly because table `CONST`
draws the video cursor when no key waits (`b95b2a9:src/cpm/bdoscon.asm:153-158`,
`b95b2a9:src/console.asm:141-149`). Chapter 17 explains that console path.

## Errors returned or reported

A failed file operation can either return control or end the program.
The four disk messages first identify the failure, following `Bdos Err On`
and the drive letter (`b95b2a9:src/text.asm:71-77`):

- `Select`, code 4, for a drive past D, a drive with no volume or a `?`
  drive byte outside function 17 (`b95b2a9:src/cpm/bdoslog.asm:758-761`,
  `b95b2a9:src/bios.asm:61-68`, `b95b2a9:src/cpm/bdosfile.asm:176-195`).
- `R/O`, code 2, for a change to a drive that function 28 has made read-only
  or to a volume the card marks read-only (`b95b2a9:src/cpm/bdoslog.asm:741-750`).
- `File R/O`, code 3, for function 19 or 23 on an entry with the read-only
  attribute and for function 21, 34 or 40 through an FCB that has it
  (`b95b2a9:src/cpm/bdosfile.asm:355-366`).
- `Bad Sector`, code 1, for a BIOS `READ` or `WRITE` that fails, a directory
  record that won't read or write and a block number past the end of the volume
  (`b95b2a9:src/cpm/bdosrec.asm:221-223`, `b95b2a9:src/cpm/bdoscon.asm:28-30`).

Each failure enters `BDERR` with its message and code. Function 45 sets
`ERRMODE` to select the reporting path (`b95b2a9:src/cpm/bdos.asm:234-237`,
`b95b2a9:src/cpm/bdoscon.asm:47-64`). By default, `DISKMSG` prints the message and
`GETCHAR` waits for a key (`b95b2a9:src/cpm/bdoscon.asm:100-129`). A key retained
during output can satisfy that wait. `^P` toggles list output. `^S` consumes
a resume key and `^C` at that pause aborts (`b95b2a9:src/cpm/bdoscon.asm:300-331`).
Whatever recovery key was used, `CHDROP` ends the program through warm boot.
The failed call does not return (`b95b2a9:src/cpm/bdos.asm:103-105`). It also drops
the remaining command chain, described in Chapter 22.

Returning modes let the program handle the failure. `ERRMODE` = `FFh`
returns `A` = `FFh` with the error code in `H`, printing nothing and keeping
the command chain. `FEh` prints first then returns the same result.
Warm boot clears `ERRMODE`, so every program begins in default mode
(`b95b2a9:src/ram.asm:222-223`). A failed read or write leaves the FCB on the
untransferred record, matching CP/M 3 (`b95b2a9:src/cpm/bdosrec.asm:69-82`,
`b95b2a9:src/cpm/bdosrec.asm:220-225`).

Protection also enters through distinct state, following Chapter 5's
volume and file rules. `LOGIN` copies the volume's read-only flag into
its read-only vector bit (`b95b2a9:src/cpm/bdoslog.asm:211-216`). The BDOS can then
reject changes before a card write. Warm boot clears the vector and later
selection restores the bit. Function 28 protects only the default drive
in `ROVEC` until function 13 or 37 clears it (`b95b2a9:src/cpm/bdosfn.asm:122-134`,
`b95b2a9:src/cpm/bdosfile.asm:30-35`, `b95b2a9:src/cpm/bdosfn.asm:343-355`).

## The compatibility boundary

These implementation changes retain the CP/M 2.2 file interface.
Function 12 returns `22h` (`b95b2a9:src/cpm/bdos.asm:729-730`). Program disk resets
drop every login while flagged CCP resets can reuse or partly rebuild
vectors. ROM residence also relocates hooks to the writable RAM BIOS table
from Chapter 11 rather than patched BDOS instructions.

Appendix A lists the CP/M 3 extensions, unsupported returns and console
differences. Chapter 17 explains console mechanisms. Both disk geometries
have `CKS` = 0, so no directory check vector detects a card changed during
use (`b95b2a9:format/format.json:51`, `b95b2a9:format/format.json:58`). Before changing a
card on the PC, it must be preserved and removed through Chapter 6's
procedure.
