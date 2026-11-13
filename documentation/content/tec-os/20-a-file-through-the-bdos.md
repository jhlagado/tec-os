---
title: A file through the BDOS
parent: TEC-OS
nav_order: 20
nav_group: "Inside TEC-OS"
---

# 20. A file through the BDOS

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

Making a file creates its directory entry. Writing records then changes the
file control block (FCB) in the program's memory and closing copies that
state back to the directory. The directory and FCB can therefore differ
while a file is open (`src/cpm/bdosfile.asm:451-514`,
`src/cpm/bdosrec.asm:69-82`, `src/cpm/bdosfile.asm:252-287`).

Chapter 10 established the calls a program uses: make, write, close, open and
read. Here the same lifecycle uses the BDOS's entry, directory searches,
allocation map and record arithmetic. The card operations use the BIOS of
Chapter 18 and the block cache of Chapter 19. [Chapter 9](09-call-tec-os.md)
explains the console-call contracts and [Chapter 17](17-console-paths.md) their
implementation. [Appendix A](appendix-a-bdos-functions.md) gives the complete
function reference.

## The call and its drive

A program puts the function number in `C` and its parameter in `DE`, then
calls `0005h` (`src/cpm/bdos.asm:108-129`). For make, write, close, open and
read, `DE` points to the FCB.

The jump at `0005h` leads to `JP BENTRY`, which cold boot puts directly
below the allocation vectors, as Chapter 15 describes. With a service loaded
the same jump is at the start of the lowest service's page
(`src/boot.asm:629-634`, `src/boot.asm:300-315`, `src/loader.asm:337-340`).

`BENTRY` saves the caller's stack pointer in `OLDSP`, moves to the BDOS's own
stack and keeps `DE` in `PARAM` (`src/cpm/bdos.asm:124-129`). The function and
the BIOS routines it calls use that stack. The caller's `CALL` puts its return
word on the caller's stack. `BENTRY` then tests for seven numbers above 40 that
have the meanings CP/M 3 gave them: 44, 45, 46, 47, 48, 99 and 108
(`src/cpm/bdos.asm:130-144`). Appendix A lists them. Chapter 13 describes 47 and
108 and the section on errors below describes function 45, the error mode. Any
other number above 40 returns 0 at once (`src/cpm/bdos.asm:145-146`).

A function from 0 to 40 has a routine in `FNTAB`, a table of 41 words
(`src/tables.asm:85-92`, `src/cpm/bdos.asm:147-154`). Functions 38 and 39,
which CP/M 2.2 leaves undefined, return 0.

Some functions take an FCB and work on the drive its first byte names. That
drive is selected before the routine runs. `FCBMAP` has a bit for each
function, set for 15, 16, 17, 19 to 23, 30, 33 to 35 and 40
(`src/tables.asm:93`, `src/cpm/bdos.asm:158-177`). For those `BENTRY` calls
`FCBSEL`, which reads the FCB's first byte: 0 for the default drive and 1 to
16 for A to P (`src/cpm/bdosfile.asm:176-195`). A `?` is allowed only for
function 17, where it selects every entry of the default drive's directory.
In any other function it is the `Select` error.

The selection, `SELDRV`, rejects a drive of 16 or more
(`src/cpm/bdosfile.asm:148-162`). It calls `LOGIN` unless the drive is the one
already bound and still logged in. An FCB can name a drive other than the
default so two variables distinguish them. `CURDRV` is the bound drive, the one
the function in hand works on. `DEFDRV` is the default drive, the one the
command prompt shows, and only function 14 and the disk reset change it
(`src/cpm/bdosfile.asm:128-136`). The FCB's drive byte is read and never
rewritten.

The routine runs with `DE` restored from `PARAM` and ends at one of three
exits (`src/cpm/bdos.asm:179-181`, `src/cpm/bdos.asm:194-214`). `RETZERO`
returns 0, `RETA` the byte in `A` and `RETWORD` the word in `HL`. All three
put the result in `HL`, with its low byte in `A` and its high byte in `B`,
as CP/M 2.2 does. They restore the caller's stack pointer and return. No
other register is preserved by the interface.

## The file in memory and on disk

A CP/M file is a sequence of 128-byte records. The BDOS finds them through
the directory, a table of 32-byte entries at the start of the volume. Each
entry names a file in a user area and holds a map of allocation block
numbers, the blocks of the volume that hold the file's records. In this
chapter *block* alone means an allocation block and a *card block* is 512
bytes of the card, as in Chapter 18. A program names a file in an FCB of 36
bytes. The BDOS fills the FCB from the entry and changes its position, count
and map as the program reads and writes (`src/cpm/bdosfn.asm:489-529`,
`src/cpm/bdosrec.asm:143-158`, `src/cpm/bdosrec.asm:178-233`). The attribute
bits are tested at byte 9 for read-only and byte 10 for system
(`src/cpm/bdosfile.asm:355-366`, `src/cpm/ccpfile.asm:98-104`):

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

A directory entry has the same first 32 bytes, with the user number in place of
the drive. The map holds 16 one-byte block numbers on a volume of 256 blocks or
fewer and 8 two-byte numbers otherwise. `FCBLOCK` and `BLOCKIDX` test the high
byte of the volume's last block number, `DSM`, to choose
(`src/cpm/bdosrec.asm:462-472`, `src/cpm/bdosrec.asm:528-546`). Both of TEC-OS's
geometries have more than 256 blocks so every map on a TEC-OS card holds eight
two-byte numbers.

A logical extent is 128 records, 16 KiB, and one entry holds as many extents
as its map has room for. The disk parameter block, the DPB, gives the
numbers the arithmetic needs (`format/format.json:46-58`):

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

A G1M block is 2 KiB so an entry's eight blocks hold 16 KiB, one extent. A G8M
block is 4 KiB so an entry holds 32 KiB, two extents, and `EXM` is 1.

### Directory searches

The directory operations share one search routine, `FINDENT`, which `NEWSRCH`
starts from the first entry with a mode in `OPENMOD`
(`src/cpm/bdosfn.asm:375-472`). It reads the directory a record at a time, four
entries, into the directory buffer addressed by the disk parameter header (DPH)
and `MATCHFCB` compares each entry with the FCB (`src/cpm/bdosfn.asm:559-651`).
In modes 0, 1, 2 and 4 an entry matches when its user number is the current one
and its name and type match the FCB's. Bit 7 of each byte is left out so that
the attributes don't count and a `?` in the FCB matches any character. Modes 0,
1 and 4 compare the extent and `S2` as well, unless the FCB's extent is `?`.
Modes 3 and 5 use their own matches from the table below. The extent is compared
outside the bits `EXM` covers, since one entry holds `EXM` + 1 extents
(`src/cpm/bdosfn.asm:609-643`). The modes are:

| Mode | Used by | Matches |
| ---: | --- | --- |
| 0 | functions 17 and 18 | name and extent. The record goes to the DMA address |
| 1 | open and the move to the next extent | name and extent. The entry's fields go into the FCB |
| 2 | delete, rename, set attributes, file size | name, any extent |
| 3 | make | an empty entry, `E5h` in its first byte |
| 4 | close | name and extent, nothing copied |
| 5 | function 17 with `?` in the drive byte | every entry |

On a volume with few files most of the directory is unused. A search
therefore stops at the drive's directory mark, `DIRUSED`, a retained upper
bound on entries that may need scanning. A BIOS directory write can raise it
to the end of the containing card block, beyond the last live entry
(`src/cpm/bdosfn.asm:409-426`, `src/bios.asm:267-287`,
`src/cpm/bdoslog.asm:287-305`, `src/cpm/bdoslog.asm:335-352`). Modes 3
and 5 are the exceptions and go to the end of the directory. The starter
card's drive B has 512 entries, 32 card blocks of them. Once an empty
volume is logged in, an ordinary name search reads no directory record. The
login scan itself still reads the directory. `MAKEFCB` raises the mark when
it takes an entry beyond it (`src/cpm/bdosfile.asm:500-511`). The same mark
bounds the directory scan after a changed drive reaches warm boot.

## Making and writing the file

Function 22 starts a new file by allocating a directory entry. Its first
data block is allocated later, when a write needs it. The distinction lets
an empty file exist without a data block (`src/cpm/bdosfile.asm:428-514`,
`src/cpm/bdosrec.asm:38-52`).

Make searches in mode 3 for the first empty entry. It fills the entry with the
FCB's name, the current user number and an empty map and writes the entry's
directory record at once (`src/cpm/bdosfile.asm:451-514`). As in CP/M 2.2 it
clears `S2` and keeps `EX` so the entry is the extent `EX` names among the
file's first 32. It clears `S1`, `RC` and the map in the FCB too
(`src/cpm/bdosfile.asm:428-435`, `src/cpm/bdosfile.asm:458-472`). Make leaves
`CR` and the random-record bytes alone. For a sequential file the program
supplies `CR` = 0, as in Chapter 10. Make returns an entry slot from 0 to 3 or
`FFh` if the directory is full. Every directory write goes to the BIOS as write
type 1 (`src/cpm/bdoslog.asm:82-107`). On any volume, a directory
write flushes the other dirty and kept cache lines first, as Chapter 19 describes
(`src/cache.asm:538-547`).

A file that was only read has nothing to write back at its close. Make and
open therefore set bit 7 of `S2` (`src/cpm/bdosfile.asm:495-499`,
`src/cpm/bdosfn.asm:525-527`). `ADVWRITE` clears the bit at each write that
succeeds (`src/cpm/bdosrec.asm:143-158`). `ALLOCBLK` clears it as soon as it
puts a new block in the map (`src/cpm/bdosrec.asm:593-615`).

Function 21 writes the record at `CR` (`src/cpm/bdosrec.asm:20-82`). If the map
has no block for the record, `ALLOCBLK` takes the first free block of the drive.
The record then goes to the BIOS as write type 2, the first write to a new block
(`src/cpm/bdosrec.asm:43-59`). For that type the BIOS obtains the card block's
cache line without a pre-read and clears it before copying the record
(`src/bios.asm:298-351`, `src/cache.asm:447-466`). Any other write of a record
is type 0. `CR` moves on only after the BIOS has returned success so a write
that fails leaves the FCB on the record it didn't write
(`src/cpm/bdosrec.asm:69-82`).

### A record's card address

To read or write a record the BDOS needs the record's place on the volume.
`FCBADDR` takes the extent's place within its entry, `EX` AND `EXM`, times 128,
adds `CR` and shifts the sum right by `BSH`. The result is the index of the
record's block in the map (`src/cpm/bdosrec.asm:501-526`). `POSREC` then turns
the block and record into a record number on the volume: the block shifted left
by `BSH`, plus `CR` AND `BLM` (`src/cpm/bdosrec.asm:699-716`). The BIOS takes a
track and a sector so `POSREC` divides that number by `SPT`. The division is
`DIV16`, 16 steps of shift and trial subtraction. The quotient goes to the BIOS
through `SETTRK` and the remainder through `SECTRAN` and `SETSEC`
(`src/cpm/bdosrec.asm:717-760`). The BIOS's `MAPREC` turns track and sector back
into a record number, as Chapter 18 describes. From that it takes `BLKOFF`, the
card block within the volume, and `BLKSLOT`, the record's quarter of it
(`src/bios.asm:128-155`).

For a worked arithmetic example, take record 37 of extent 0 of a file on drive
A, a G1M volume, whose third map cell holds block 300. `FCBADDR` gives 0 × 128 +
37 = 37 and 37 shifted right by 4 is 2, the third cell. `POSREC` shifts 300 left
by 4 to get 4,800 and adds 37 AND 15, which is 5. The record is 4,805 of the
volume and 4,805 divided by 64 is track 75, sector 5. `MAPREC` makes 75 × 64 + 5
= 4,805 again. `BLKOFF` is 4,805 divided by 4, card block 1,201 of the volume,
and `BLKSLOT` is the remainder, 1. The card block is the volume's start block
plus 1,201 (`src/bios.asm:128-185`).

`POSREC` checks the block number first. `CHKBLK` compares it with `DSM` and a
number past the end of the volume is the `Bad Sector` error
(`src/cpm/bdosrec.asm:699-700`, `src/cpm/bdoscon.asm:76-92`). Such an
out-of-range allocation reference indicates damaged file metadata.

### The next extent

The write after record 127 finds `CR` at 128. It closes the extent, then opens
the next extent or makes it (`src/cpm/bdosrec.asm:21-31`,
`src/cpm/bdosrec.asm:94-121`). The write returns 2 when the drive has no free
block. It returns 1 when the next extent needs a directory entry and the
directory is full. The FCB then stays on its extent with `CR` at 128 so a write
after an entry is freed makes the extent it needs
(`src/cpm/bdosrec.asm:94-135`). It returns 1 in the same way when the close of
the extent it leaves finds no entry for it (`src/cpm/bdosrec.asm:94-98`). That
is the case after the file was deleted under the open FCB.

## Closing the file

Function 16, close, returns 0 when it writes nothing or the entry's slot from 0
to 3 when it updates the directory. It returns `FFh` when that update finds no
matching entry (`src/cpm/bdosfile.asm:209-227`). It returns at once when bit 7
of `S2` is still set, with nothing written (`src/cpm/bdosfile.asm:229-235`). On
a read-only drive it also returns success with nothing written
(`src/cpm/bdosfile.asm:252-258`). Otherwise it searches in mode 4 for the entry
again and copies the FCB's extent, record count and map into it or only the map
when the FCB is on an earlier extent than the entry records. It then writes the
directory record back (`src/cpm/bdosfile.asm:252-287`). On a volume written
behind the directory write flushes every other dirty cache line before writing
its own line. A failed flush is still an error and earlier writes are not
undone. Chapter 19 describes the resulting persistence boundary
(`src/cache.asm:505-547`).

## Opening and reading the file

Function 15, open, searches in mode 1 and copies bytes 1 to 31 of the entry
into the FCB (`src/cpm/bdosfn.asm:489-529`). A `?` in the FCB's name becomes
the entry's character. The FCB keeps its own extent. The entry's `RC` is the
count of its highest extent. In a G8M file whose entry holds two extents, an
FCB naming the earlier extent gets 128 records and one naming a later, empty
extent gets 0. Open returns the entry's slot, 0 to 3, or `FFh` when no
matching extent exists (`src/cpm/bdosfile.asm:205-207`,
`src/cpm/bdosfn.asm:542-544`).

Function 20 reads the record at `CR` into the DMA address and moves `CR` on
(`src/cpm/bdosrec.asm:178-233`). At `CR` = 128 it closes the FCB, opens the next
extent and starts it at record 0. It returns 1 for end of file when the next
extent is absent, `CR` has reached or passed `RC` or the record's map cell
contains block 0. A failed close at the extent boundary also returns 1
(`src/cpm/bdosrec.asm:188-233`).

### Deletion and the shared entry

Function 19, delete, marks each matching entry empty, `E5h`, writes its
directory record and only then frees its blocks
(`src/cpm/bdosfile.asm:380-415`). The random functions 33, 34 and 40, the
size and rename functions and the attributes work on the same entries and
FCBs. Appendix A gives each with its return codes.

## Free space and drive login

The BDOS has to find a free block for each write without reading the whole
directory. Each drive therefore has an allocation vector, one bit for each
block of the volume, set while the block is in use. Chapter 15 describes
where cold boot places the vectors. The DPH holds the vector's address and
`LOGIN` copies it into `ALVPTR` (`src/cpm/bdoslog.asm:205-208`).

`ALLOCBLK` scans the vector from block 0 for the first clear bit, sets it and
puts the block's number in the FCB's map (`src/cpm/bdosrec.asm:555-626`). A
delete clears the bits of each block the entry lists
(`src/cpm/bdoslog.asm:507-582`). The directory's own blocks are set from `AL0`
and `AL1` when the vector is built (`src/cpm/bdoslog.asm:409-431`) and they are
never given out. The vector changes as soon as a block is taken, before the file
is closed. A block a program has written but not yet closed is therefore already
in use for every other file. `ALLOCBLK` also marks the FCB as changed
(`src/cpm/bdosrec.asm:593-615`). A close after a failed write can still write
the entry that holds the allocated block. Close can itself fail so the entry is
not guaranteed to reach the card after a data-write error. If the program exits
without closing, the later vector rebuild derives allocation from the directory
again.

### The first selection

A vector is built when a drive is logged in, the first time it is selected after
a disk reset (`src/cpm/bdoslog.asm:164-275`). `LOGIN` calls the BIOS's `SELDSK`
for the drive's DPH and a drive with no volume gets 0, which is the `Select`
error (`src/cpm/bdoslog.asm:172-180`). It copies from the DPH the addresses of
the translation table, the directory buffer, the DPB and the vector. A volume
the card marks read-only then goes into the read-only vector
(`src/cpm/bdoslog.asm:210-215`). For a drive not in `LOGINV`, `INITALV` clears
the vector and sets the directory's bits and the drive's bit in `LOGINV` is set.
The whole directory is then read a record at a time. `PARENT` sets the bit of
every block that each entry in use lists and moves the mark past the entry
(`src/cpm/bdoslog.asm:218-275`, `src/cpm/bdoslog.asm:439-494`). A block number
past the end of the volume has no bit and `BITPTR` passes over it
(`src/cpm/bdoslog.asm:597-604`). The drive still logs in and a delete of that
file passes over the number too. For a drive already in `LOGINV`, `LOGIN` reads
nothing: `LOGFAST` takes the drive's mark from its DPH
(`src/cpm/bdoslog.asm:287-305`).

## Rebuilding after warm boot

The DPH has three words for the BDOS's own use, at offsets 2, 4 and 6.
`MNDPH` clears them when it builds the DPH (`src/vol.asm:608-615`). TEC-OS's
BDOS keeps in them what the scan at warm boot needs:

| Offset | Contents | Written by |
| ---: | --- | --- |
| 2 | the sum of the vector's bytes at the end of the last scan | `LOGDONE` (`src/cpm/bdoslog.asm:314-327`) |
| 4 | the changed flag: 1 once the vector may differ from the directory | `ALFOUND` (`src/cpm/bdosrec.asm:598-603`) and BIOS `WRITE` of a directory card block (`src/bios.asm:239-266`) set it and `LOGDONE` clears it |
| 6 | the directory mark, `DIRUSED` | `DUSAVE` (`src/cpm/bdoslog.asm:335-352`), BIOS `WRITE` of a directory card block (`src/bios.asm:267-287`) |

The BIOS's part is in its `WRITE`, which tests whether the card block being
written is one of the directory's. For such a block it sets the changed flag and
raises the mark to the end of that block's 16 entries (`src/bios.asm:239-287`).
It does that for every write so a program's own directory write through BIOS
`WRITE` sets the flag and raises the mark as well. `DUSAVE` writes the BDOS's
mark only when it is higher than the one there so the higher of the two stands.

CP/M 2.2's CCP resets the disk system at every warm boot. Each drive logs in
again at its next selection, which reads its directory. On a G8M volume that is
32 card blocks and Chapter 16 gives host-model timings. TEC-OS's CCP
makes the same call, function 13, but sets `WRFLAG` first
(`src/cpm/ccp.asm:73-77`). With the flag set function 13 goes to `WRESET`
(`src/cpm/bdosfile.asm:19-24`).

`WRESET` goes through drives 0 to 15 and passes over each one that is not in
`LOGINV` (`src/cpm/bdosfile.asm:61-107`). For a logged-in drive it calls
`LOGIN`, which binds the drive's pointers and reads nothing. It then tests
the drive's DPH:

- If the changed flag is set, the drive is taken out of `LOGINV` and put in
  `WARMV`, the vector of drives to rebuild to their mark
  (`src/ram.asm:243`). At its next selection `LOGIN` builds the vector again
  but reads the directory only up to the mark (`src/cpm/bdoslog.asm:236-248`).
  The mark covers every entry recorded as used so the scan can omit the
  remaining empty entries.
- If the flag is clear, `ALVSUM` adds up the vector's bytes with `SUMDE`,
  the routine that also sums the container's table
  (`src/cpm/bdoslog.asm:360-366`, `src/cpm/bdoslog.asm:383-400`,
  `src/volutil.asm:115-128`). If the sum is what `LOGDONE` stored, the drive
  stays logged in with its vector as it is. A different sum indicates a
  change that neither an allocation nor a directory write recorded, such as
  a stray write by a program. That drive is taken out of `LOGINV` and
  scanned in full at its next selection. Equal sums are not a byte-for-byte
  comparison of the vector.

### The reset tail

After the loop `WRESET` joins the ordinary reset at `RSTAIL`
(`src/cpm/bdosfile.asm:30-44`). `RSTAIL` clears the read-only vector,
selects drive A, sets the DMA address to `0080h` and logs drive A in. At the
end of each full or partial scan `LOGDONE` saves the mark and stores the new
sum (`src/cpm/bdoslog.asm:314-327`). It also clears the changed flag and the
drive's bit in `WARMV`. With unchanged vectors and clear changed flags, warm
boot needs no directory reads. After a program changes drive A, its
directory scan reaches the recorded mark. A BIOS directory write can raise
that mark to the end of the containing card block, beyond the last used
entry.

A program's own call of function 13 finds `WRFLAG` clear and empties
`LOGINV` and `WARMV` (`src/cpm/bdosfile.asm:25-28`). Every drive is then
scanned in full at its next selection, as in CP/M 2.2. Function 37 takes the
drives named by the bits of `DE` out of `LOGINV`, the read-only vector and
`WARMV` (`src/cpm/bdosfn.asm:343-355`). The volume services `MOUNT` and
`UNMNT` call it for a drive whose volume they have changed
(`src/volsvc.asm:286-310`). A `MOUNT` onto the default drive then selects
the drive again with function 14, which logs the new volume in
(`src/volsvc.asm:335-345`). Functions 27 and 31 return the new default
volume's allocation-vector and DPB pointers (`src/cpm/bdosfn.asm:48-53`,
`src/cpm/bdosfn.asm:145-153`).

## Code and writable state

TEC-OS's BDOS comes from Portable CP/M, an implementation of the documented
CP/M 2.2 interface written without Digital Research's source
(`src/cpm/PROVENANCE.md:3-7`). Its code is in six files under `src/cpm/`,
included in this assembly order (`src/rom.asm:36-41`):

| File | Contents |
| --- | --- |
| `bdos.asm` | the entry, the dispatch and the console functions |
| `bdosfile.asm` | the disk reset, the selection of a drive and the functions on whole entries: open, close, search, delete, make, rename and the attributes |
| `bdosrec.asm` | the records, the FCB's fields and the allocation of blocks |
| `bdosfn.asm` | the functions that read the BDOS's tables and the directory search |
| `bdoslog.asm` | the directory records, the login and the allocation vectors |
| `bdoscon.asm` | the errors and the console's output |

The ROM map places `BDOSBAS` at `E573h` and the last BDOS byte at `F34Dh`,
before the numbered services' `SVCDSP`, a span of 3,547 bytes. Chapter 27 describes the ROM
organisation. The function table and its four error messages are in the ROM's
data block (`src/tables.asm:85-93`, `src/text.asm:71-77`). Those bytes are
read-only so a hook must use a RAM interface.

The BDOS keeps its working state in RAM, from `BDOSRAM` up to the exclusive end
`BDOSRME`. On the starter card this is `BE6Dh–BEFFh`. The source defines the
block by labels (`src/ram.asm:215-294`). Its 64-byte stack is at the top of that block
(`src/layout.asm:110`). Warm boot clears the block, as a fresh load of the BDOS
from disk would leave it, and sets the DMA address to `0080h`
(`src/boot.asm:398-405`). Two of the BDOS's variables are outside the block
because a warm boot must not clear them. `LOGINV`, in the BIOS's part of the
resident workspace, has a bit for each drive whose allocation vector the BDOS
has built (`src/ram.asm:69`). `PRGCODE`, the return code of function 108, is
above the RAM BIOS table, where only cold boot clears it (`src/ram.asm:372-373`,
`src/boot.asm:61-65`). Per-drive pointers and scan state are in the drive's DPH,
the 16-byte disk parameter header described in Chapter 18.

The BDOS reaches the BIOS through the RAM BIOS table at `BF00h`. Its names
for the entries are offsets from `RAMBIOS` (`src/cpm/bdos.asm:20-34`). A
program that replaces an entry there therefore receives the BDOS's own
calls, as [Chapter 17](17-console-paths.md#the-bios-boundary) describes.
The output-status check is an exception. It
calls the ROM's `BCONST` directly, because the table's `CONST` draws the
video cursor while no key is waiting. Chapter 17 explains that console path
(`src/cpm/bdoscon.asm:153-158`, `src/console.asm:141-149`).

## Errors returned or reported

The BDOS has four disk error messages, printed after `Bdos Err On` and the
drive's letter (`src/text.asm:71-77`):

- `Select`, code 4, for a drive past D, a drive with no volume or a `?`
  drive byte outside function 17 (`src/cpm/bdoslog.asm:757-760`,
  `src/bios.asm:61-68`, `src/cpm/bdosfile.asm:176-195`).
- `R/O`, code 2, for a change to a drive that function 28 has made read-only
  or to a volume the card marks read-only (`src/cpm/bdoslog.asm:740-749`).
- `File R/O`, code 3, for function 19 or 23 on an entry with the read-only
  attribute and for function 21, 34 or 40 through an FCB that has it
  (`src/cpm/bdosfile.asm:355-366`).
- `Bad Sector`, code 1, for a BIOS `READ` or `WRITE` that fails, a directory
  record that won't read or write and a block number past the end of the volume
  (`src/cpm/bdosrec.asm:221-223`, `src/cpm/bdoscon.asm:28-30`).

Each goes to `BDERR` with its message and code. What `BDERR` does is set by
the error mode, which function 45 puts in `ERRMODE`
(`src/cpm/bdos.asm:232-235`, `src/cpm/bdoscon.asm:47-64`). In the default
mode `DISKMSG` prints the message and `BDERR` waits for a key with `GETCHAR`
(`src/cpm/bdoscon.asm:100-129`). An ordinary key retained during message
output satisfies that wait. `^P` toggles list output and `^S` consumes a
resume key, with `^C` at that pause aborting
(`src/cpm/bdoscon.asm:299-330`). `CHDROP` then ends the program by warm boot, whatever the key, so the
function never returns to the program (`src/cpm/bdos.asm:103-105`). `CHDROP`
also drops the rest of a chained line, which Chapter 22 describes.

With `ERRMODE` at `FFh` the error returns to the program with `A` = `FFh` and
the error's code in `H`. Nothing is printed and the rest of a chained line is
kept. With `FEh` the message is printed first and the error returns in the same
way. Warm boot clears `ERRMODE` with the rest of the BDOS's state so each
program starts in the default mode (`src/ram.asm:222-223`). A read or write that
returns an error leaves the FCB on the record it didn't read or write, as CP/M
3's does (`src/cpm/bdosrec.asm:69-82`, `src/cpm/bdosrec.asm:220-225`).

Chapter 5 explains volume protection and the read-only file attribute. They
enter the BDOS through different state. The volume's read-only flag is in the
drive table. `LOGIN` sets the drive's bit in the read-only vector from it
(`src/cpm/bdoslog.asm:210-215`) so the BDOS rejects the change before any write
reaches the card. A warm boot clears the vector and the drive's next selection
sets the bit again. Function 28 protects only the default drive in `ROVEC`,
until function 13 or 37 clears it (`src/cpm/bdosfn.asm:122-134`,
`src/cpm/bdosfile.asm:30-35`, `src/cpm/bdosfn.asm:343-355`).

## The compatibility boundary

The file interface remains CP/M 2.2's and function 12 returns `22h`
(`src/cpm/bdos.asm:727-728`). A program's disk reset still drops every login
while the CCP's flagged reset can retain or partly rebuild vectors. ROM code
also changes the place for a hook: the writable RAM BIOS table described in
Chapter 11 replaces a patch to BDOS instructions.

Appendix A retains the complete compatibility list, including the CP/M 3
extensions, unsupported function returns and console differences. The console
mechanisms are in Chapter 17. For files, both supported geometries set `CKS` to
0 so no directory check vector detects a card changed during use
(`format/format.json:51`, `format/format.json:58`). A card must be preserved and
removed through the procedure in Chapter 6 before it is changed on a PC.
