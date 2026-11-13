---
title: Cache and persistence
parent: TEC-OS
nav_order: 19
nav_group: "Inside TEC-OS"
---

# 19. Cache and persistence

<!-- Checked against TEC-OS 46cf3f1f1c6ea7ff361a568672a41ab1a7e2c1ee (main),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/. READ/SAVE/DIR timings use the measurements retained there.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A program can finish writing a record while its newest bytes are still only in
RAM. The block cache makes that possible by collecting records into card blocks.
Its write policy determines when a successful call also means that the block has
reached the card.

A block read on the host model takes about 55 milliseconds, with bits
passing through a port one at a time. Chapter 18 explains that
transfer. A CP/M program reads the same blocks again and again, the directory
above all. The block cache keeps what it has read in EXPAND 1 so that a later
read is a memory copy while that block remains cached. Every write goes through
the same cache. The drive you are on is written behind: its writes stay in
the cache and reach the card in batches. Writes off the logged drive share one pending block across all drives;
that block reaches the card at the next flush point. Chapter 1 introduced the
consequence for saved work: until the next key wait or flush, the card can
lag behind the saved file (`src/bios.asm:329-358`, `src/cache.asm:581-622`).

## Thirty lines and their table

The cache is 30 lines of 512 bytes, one card block each, at `8000h–BBFFh` in
EXPAND 1 (`src/cache.asm:1-17`, `src/layout.asm:32-42`). Line n starts at
`8000h` plus n times `200h`. `CLADR` works the address out by doubling n and
adding `80h`, which gives the high byte (`src/cache.asm:166-171`).

The cache's table is the next page. From `CTAB`, `BC00h`, each line has four
bytes for the number of its card block, `FFFFFFFFh` while the line is empty.
From `CDIRTY`, `BC80h`, each line has a byte that is nonzero while the line
holds changes the card lacks. A line is therefore empty, clean or dirty. An
empty line has no block. A clean line holds a block the card has too and a dirty
line holds a block whose newest bytes are only here. Every line is empty after a
cold boot. The boot clears EXPAND 1 and marks each line empty before it mounts
the card, as [Chapter 16](16-reset-and-boot.md) describes
(`src/boot.asm:77`, `src/boot.asm:235-252`). The mount then reads the
container's table into a line, an ordinary clean one that `CTAKE` gives out
again in turn (`src/vol.asm:380-416`). Chapter 18 explains the mount.

The lines are keyed by the block's number on the card, `SDLBA`, and not by
drive and block within the volume. The absolute card address identifies a
block independently of the drive used to reach it. The lookup therefore
prevents two lines from holding separate copies of the same block
(`src/cache.asm:49-91`).

The cache's lines and table are in EXPAND 1. Its five bytes of control state are
in the resident workspace above the RAM BIOS table (`src/ram.asm:310-325`):

- `CNEXT`, the next line to give out
- `CWTYPE`, the write type of the current BIOS `WRITE` in its low bits,
  with bit 5 set for a data write held to coalesce
- `CIFF`, the saved flags containing the interrupt state at the BIOS call's entry
- `CANY`, nonzero while a data line may be held behind on the logged drive
- `CPEND`, the pending block's line plus one, 0 for none

To reach the table, a routine takes from `CXON` the latch value with
`LATEXP` ORed into `LATCHV` and writes it to the latch. It reads or writes
the bytes with no `PUSH`, `POP` or `CALL` in between, then puts `LATCHV`
back (`src/cache.asm:30-41`). [Chapter 15](15-state-and-memory.md#expand-1-and-the-stack-boundary) explains why no
stack may be used while EXPAND 1 is in view.

## A record read through the cache

Every volume's reads go through the cache. BIOS `READ` maps the record to a card
block and a quarter of it and calls `CREAD` (`src/bios.asm:395-399`,
`src/cache.asm:406-417`). `CLOOK` compares `SDLBA` with each line's block number
in turn, from line 0 (`src/cache.asm:49-91`). On a hit, `CRDREC` copies the
record's 128 bytes from the line to the DMA address. On a miss, `CTAKE` gives
out a line, `CFILL` reads the card block straight into it and the record is then
copied from the line.

The block goes from the card into EXPAND 1 with no copy through another buffer.
`CFILL` sets `SDXB` to `LATEXP` for the call and `SDREAD`'s byte loop puts
EXPAND 1 in view while it fills the buffer (`src/cache.asm:183-201`,
`src/sd.asm:469-478`). A failed read leaves the line empty.

`CTAKE` gives out lines in turn (`src/cache.asm:312-358`). A clean line can be
given out at any time, since the card has the same bytes. A dirty line has to
reach the card first. So `CTAKE` starts at `CNEXT` and gives out the first clean
line from there on. It passes over dirty ones and wraps from line 29 to line 0.
It sets `CNEXT` to the line after the one it gave out. When every line is dirty,
`CTAKE` writes the line at `CNEXT` to the card first and gives out that one. The
order is round-robin and not least recently used. A block that is read often is
still given up when its turn comes and read again from the card at its next use.

On the four-drive starter, a BIOS read in `DIR /W` that hits takes 13,538
T-states, with its record going to the directory buffer `DIRBUF`. In
`DIR /W B:`, misses take 235,235–235,280. These are complete BIOS reads,
including lookup and copying. The four reads on A all hit; the empty WORK
directory makes 32 misses and 96 hits while it is scanned.

`CLOOK` itself takes 264 T-states for a hit in line 0 in the READ workload.
Its misses take 1,977–2,021 across these READ, SAVE and directory workloads;
the saved Z flag distinguishes hits from misses in the trace.

`CRDREC` and `CWRREC` put the two banks in `XMDST` and `XMSRC` as 0 for the
program's view and 1 for EXPAND 1. Both then call `MVCOPY`, the cache's copy
routine (`src/cache.asm:370-395`). A copy within a
single bank is one `LDIR` with that bank in view (`src/cache.asm:680-684`,
`src/cache.asm:777-783`). A copy between EXPAND 1 and an address in EXPAND
0, such as `DIRBUF`, can't have both ends in view. The two banks share the
one window. The part of the bank-0 end below `8000h` is in view whatever the
latch holds. That part goes by one `LDIR` with EXPAND 1 selected
(`src/cache.asm:685-739`). The part in EXPAND 0 goes a byte at a time, with
the latch switched between each read and its write
(`src/cache.asm:742-771`). The copy uses no stack while EXPAND 1 is in view,
because the caller's stack may be in EXPAND 0 (`src/cache.asm:13-17`).
`MVEND` writes `LATCHV` back to the latch and enables interrupts only if
they were on at entry (`src/cache.asm:790-804`). A BIOS read to a DMA
address below `8000h` can use the faster fixed-RAM copy path. In the READ workload below, reads to `0080h` take 4,565–6,334 T-states on
a hit and 226,345–226,346 on a miss. The directory buffer uses the slower
EXPAND-0 copy path; those timings must not be interchanged.

The READ program gives a complete-file comparison. Its 24-byte binary opens
the file named on its command line and repeatedly reads records to `0080h`
with function 20:

```asm
; READ: open the file named on the command line and read it to the end.
BDOS    EQU     $0005
FCB     EQU     $005C           ; the name from the command line
        ORG     $0100
        LD      DE,FCB
        LD      C,15            ; BDOS function 15: open a file
        CALL    BDOS
        INC     A               ; FFh, no such file, becomes 0
        RET     Z
NEXT:   LD      DE,FCB
        LD      C,20            ; BDOS function 20: read a record to 0080h
        CALL    BDOS
        OR      A               ; 0: a record was read
        JR      Z,NEXT
        JP      $0000
```

This recipe assembles READ on the PC with TAS, as Chapter 27 explains, and
places it and a 12,288-byte file on A, with a G8M volume on B for the later
write comparison:

```sh
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { assembleProgram } from "./tools/lib/assemble.mjs";
const [src, out] = process.argv.slice(1);
writeFileSync(out, (await assembleProgram(src)).bytes);
' read.asm read.com
head -c 12288 /dev/zero > data.bin
node tools/tecvol.mjs create time.img --volume G1M:SYSTEM:A --volume G8M:WORK:B
node tools/tecvol.mjs put time.img A read.com
node tools/tecvol.mjs put time.img A data.bin
```

`tools/capture.mjs` prints no T-state count so the figures come from a script
that drives `Machine` as it does, on `time.img`, which has no startup file and
so no shell. The script reads the model's count, `cycles`
(`host/machine.mjs:284`), twice. The first reading is after `READ
DATA.BIN` has been typed and echoed, before the Return that ends it. The second
is at the next prompt. After a cold boot, the command's first run took
6,617,943 T-states, 1.65 seconds. The next run took 1,318,031, 0.33 seconds,
a fifth of the first. Both figures include loading the program from
drive A. The trace counts the loader separately: it reads READ.COM's
one record and its EOF. The program's data loop makes one function-20 call
per data record, followed by its own EOF call.

The gain depends on which blocks remain in the cache. A 15,360-byte file,
`BIG.BIN` on a copy of `time.img`, took 2.04 seconds and then 2.10. The
counts were 8,165,728 and 8,388,441 T-states. `CTAKE`
had given up each line before the next read reached it. The file data alone
occupied all 30 lines, leaving no room for the directory and program blocks
read along the way.

## Two kinds of drive

The cache treats a write by the drive it goes to. The *logged drive* is the
drive you are on at the prompt, the CCP's `BOOTDRV`. A drive change at the
prompt sets it, and so does each warm boot, from the drive the program left
at 0004h. A program's function 14 does not move it. Its volume is *written
behind*: a data write there stays in the cache. A data write on any other
drive is *coalesced*: the run of records written into one card block is
written once. A read-only volume takes no write at all
(`src/bios.asm:329-358`, `src/cpm/ccp.asm:233-245`, `docs/recovery.md:1-39`).

Two rules hold for both kinds:

1. **Every directory write writes the cache first.** On any drive, a
   directory write first writes every changed data block the cache holds,
   then its own block, so the directory never names a block whose data isn't
   on the card. If a data block fails, the directory write is refused.
2. **Every console read writes every changed line.** Functions 1, 6 with
   `E = FFh`, 10 and 11 and the BIOS's `CONIN` write every changed line, on
   every drive, before they read. Whenever TEC-OS waits for a key,
   everything is on the card (`docs/recovery.md:41-53`).

What a reset or power loss leaves depends on the write
(`docs/recovery.md:55-62`):

| Write | Reaches the card | A reset before then loses |
| --- | --- | --- |
| Data on the logged drive's volume, written behind | at the next console read, directory write on any volume, write that needs a line when all are changed, function 48, drive change, `CD` or warm boot | the changed blocks since the program's last key wait or directory write, up to 30 |
| Data on any other volume, coalesced | its pending block at the first of: a console read, any directory request, a write to another block on any drive, function 48, a drive change, `CD`, warm boot | at most one block, 512 bytes |
| A directory write, on any volume | before the call returns, after every changed and kept data line; refused if one fails | nothing that the call reported done |
| Any write to a read-only volume | never: refused | nothing |

On the starter card you start on A, so A is written behind while you are
there. A program's data on A reaches the card at the program's next key
wait, directory write or warm boot, not at each write that moves on to
another block. The prompt is a key wait, so waiting for the prompt is all
that is needed before a reset or taking the card out.

## Writes off the logged drive

BIOS `WRITE` saves the write type in `CWTYPE` and, after its checks, reaches
`BWGET`. `BWGET` first writes the pending block if this write is to another
block. It then compares `BOOTDRV` with `DSKCUR`, the drive of this write. On
any other drive a data write sets bit 5 of `CWTYPE`, to coalesce. A
directory write, type 1, leaves bit 5 clear. Both then enter `CWRBH`, the
path of every write (`src/bios.asm:329-358`).

`CWRBH` puts the record into the block's line, as the next section
describes, and marks the line dirty. For bit 5, `CWCO` records the line in
`CPEND`, the line's number plus one, or 0 when no block is pending, and the
write returns once the record is in the line (`src/cache.asm:497-527`,
`src/ram.asm:310-325`). This is the *pending block*. At most one block is
pending, and it reaches the card at the first flush point
(`docs/recovery.md:120-155`):

- the file's close and any other directory request: an open, make, search,
  delete, rename, attribute change, size, login or the extent change inside
  a write. `FNCLSE` and `READDIR` call `CPOUT` first, so the directory never
  names a block whose data is not on the card
  (`src/cpm/bdosfile.asm:215-216`, `src/cpm/bdoslog.asm:17-18`)
- a BIOS write to another block, on any drive. `BWGET` calls `CPMOVE`, which
  keeps the pending line when the new write is to the same block and
  otherwise writes it with `CPFLSH` (`src/bios.asm:343-347`,
  `src/cache.asm:550-579`)
- a console read: functions 1, 10 and 11, function 6 with `E = FFh`, and
  the BIOS's `CONIN`, which call `CKEY` (`src/cpm/bdos.asm:281`, `:333`,
  `:404`, `:708`, `src/console.asm:225`)
- a drive change at the prompt, which calls `VFLUSH` before it moves the
  logged drive (`src/cpm/ccp.asm:240`)
- function 48, `CD`'s mount, an unmount and warm boot

A file written off the logged drive therefore passes through a single line,
block after block, each block written once when the write moves on, and the
cache keeps the lines that hold programs and directories. Writing each record
through would write a block once for each of its four records.

A reset or power loss before a flush point loses the records written into the
pending block since it was last written, at most one block of four records,
512 bytes. The card keeps the block's old contents. A block the card rejects
stays pending. A close or another directory request then returns the error,
`Bad Sector` or function 45's returned error. A console read does not report
the failure: the program gets its key and the next flush point that is not a
console read reports it. Warm boot writes the block once more and drops it
with `Write lost` (`docs/recovery.md:164-174`).

The SAVE comparison uses a fresh `time.img` for each run, with the same
READ and DATA files still on A. SAVE counts 256-byte pages, so 8, 16 and
160 pages mean 2,048, 4,096 and 40,960 bytes, or 16, 32 and 320 records.
With A logged, `SAVE 8 B:X.COM` took 2.782 seconds, `SAVE 16` 3.069 and
`SAVE 160` 8.607. Each interval starts before Return and ends at the next
prompt, including B's first directory login. The recorded SDWRITE calls all
returned success, and the file read from the resulting card matched the
RAM bytes saved.

The 8-page run wrote six blocks in this order: directory block 4096,
data blocks 4128–4131, then directory block 4096 again. Each of the four
data blocks was written once, after its records had been collected. The
16-page run made ten writes: eight data blocks and two directory writes.
The 160-page run made 85 writes: 80 data blocks and five directory writes,
including extent transitions. These are measured counts, not a promise
that every workload writes each block only once.

## Collecting records on the logged drive

A card block holds four CP/M records. Writes off the logged drive share one
pending block across all volumes. The logged drive holds every changed block in the cache
until a flush. Chapter 18 explains the record-to-block mapping
(`src/cache.asm:360-395`). A volume is written behind while its drive is the
logged one, whatever its descriptor says: byte 15, which once marked a volume
written behind, is reserved, and `MNFILL` copies only the read-only bit into
the drive's flags (`src/vol.asm:597-598`, `format/format.json:36`). After
its checks, BIOS `WRITE` sends a data write on the logged drive to `CWRBH`
with bit 5 of `CWTYPE` clear (`src/bios.asm:343-358`).

`CWRBH`, the path of every write, puts the record into the block's line and
marks the line dirty (`src/cache.asm:429-547`). If no line holds the block,
`CTAKE` gives one out. The line is filled from the card first unless it
already held the block. It is cleared to zeros instead, with no read, when
by `WRITE`'s rule from Chapter 18 the card has nothing to supply
(`src/cache.asm:447-466`).

Either way, the record's 128 bytes are then copied from the DMA address into the
line with `CWRREC` and `CDSET` marks the line dirty. On the logged drive a
data write ends there and sets `CANY`, the flag that tells `CKEY` a line may
be held behind. Success at this point means the record is in the cache.
A miss may already have forced an older dirty line to the card so the complete
call need not leave the card unchanged. A write of type 1, a directory write,
which bit 0 of `CWTYPE` shows, goes on, on any drive (`src/cache.asm:497-519`,
`src/cache.asm:528-548`). The new directory entry must not reach the card before
the data blocks it names. `CFLUSH` writes every dirty line except the
directory's and then, if every one was written, `CWRITE` writes the directory's
line. The data reaches the card before the directory block that names it. If any
of those writes fails, the directory's cached line is dropped so its next read
comes from the card. A data line whose write fails stays dirty, since it holds
the only copy of its records. The write then reports the error to the BDOS. When
function 45 returns the error to a program, another close can retry the retained
dirty data. If those writes and the directory write succeed, the close succeeds
(`src/cache.asm:266-300`, `src/cache.asm:538-547`).

The BDOS writes the directory when it creates a file and when it closes a
changed file control block (FCB), including at an extent transition
(`src/cpm/bdosfile.asm:229-287`, `src/cpm/bdosfile.asm:510-514`,
`src/cpm/bdosrec.asm:94-98`). On any drive a successful directory write
brings changed cache data to the card first
(`src/cpm/bdoslog.asm:82-87`).

`CKEY`, at each console read, writes every changed line when `CANY` is set
and clears the flag once no line is kept. While `CANY` is clear only the
pending block can be changed, and `CKEY` goes to `CPOUT`, the cheaper test
that writes that one block. A program can combine rewrites of a cached block into one card write
while no flush or eviction intervenes. A directory write or an eviction
can end that interval before the next key wait
(`src/cache.asm:581-622`, `src/ram.asm:321-325`).

Selecting `B:` before the measured command makes the same destination
the logged drive. On fresh two-volume cards, the results were:

| SAVE pages | Bytes | A logged, seconds | B logged, seconds | SDWRITE calls in either run |
| ---: | ---: | ---: | ---: | ---: |
| 8 | 2,048 | 2.782 | 0.488 | 6 |
| 16 | 4,096 | 3.069 | 0.767 | 10 |
| 160 | 40,960 | 8.607 | 6.205 | 85 |

B's directory was already logged by the drive change, outside its timed
interval; the faster total is therefore not a measurement of write policy
alone. The larger logged-drive run also flushed data blocks in cache-line
order rather than ascending block order. The trace contains the same
80 data-block writes and five directory writes, and the completed file
again matched the saved RAM bytes.

The close in the logged-B 8-page run took 1,129,449 T-states, including the
four retained data blocks and the directory update. With A logged, each
preceding off-drive block transition had already flushed the earlier
pending block; that close took 477,956 T-states. Both obey the same
data-before-directory rule.

## Flush order and interrupted updates

`CFLUSH` and `CFLALL` write the dirty lines in line order, from 0 to 29. `CFLUSH`
leaves out the line numbered in `A`. `CFLALL` passes `FFh`, the number of no
line (`src/cache.asm:266-300`). That order is not the order of the blocks,
since `CTAKE` hands lines out in turn. The blocks of a file can therefore
reach the card in any order.

A type-1 directory write ends with its line clean after success or absent
after failure. On every volume the data flush precedes that
line's write (`src/cache.asm:538-547`). With the BDOS's directory write
types, later flushes have only data lines left. A power cut during the
data phase of a directory write's flush leaves some new data on the card and its directory update unwritten.
The ordering prevents publishing that update before all its data writes
succeed. It provides no rollback. A successfully written block the file
already had holds its new contents on the card, with or without the directory block
after it. [Chapter 6](06-cards-on-the-pc.md#recovery-after-a-power-cut)
describes recovery after that. A cut during the directory block's own write
can damage any of its 16 entries. Card-reported completion is also not a
verification of the card's physical power-loss durability
(`docs/recovery.md:188-189`, `docs/recovery.md:217-219`).

`CWRITE` writes a single line to the card (`src/cache.asm:213-251`). It takes
the block number from the table and sets `SDXB` so that `SDWRITE` reads its 512
bytes straight from the line in EXPAND 1. On success it marks the line clean. On
a failure it leaves the line dirty and returns `NZ`. A flush writes every dirty
line, goes on past each failure and returns `NZ` if there was one. `CFLALL`,
warm boot's flush, drops each line whose write fails so the card's copy of
that block stands. `CFLUSH`, the flush of a directory write, a console read,
a drive change, function 48, `MOUNT` and unmount, leaves such a line dirty for a later flush
(`src/cache.asm:256-301`). `CTAKE`'s write of one line, when every line is
dirty, keeps a failed line dirty in the same way. `CTAKE` then returns the error
with `CNEXT` moved past the line. The next miss writes the line after it so a
single bad block can't fail every later miss (`src/cache.asm:341-358`).

### Seven flush occasions

Dirty cache lines reach the card on seven occasions, and a drive off the
logged one adds its pending block's flush points, described above:

- a directory write, on any drive, as above
- a console read, whose `CKEY` writes every line when one may be held behind
  (`src/cache.asm:581-612`)
- a drive change at the prompt, whose `VFLUSH` writes every line and goes
  ahead with any line that fails still kept (`src/cpm/ccp.asm:240`)
- `CTAKE` with every line dirty, which writes one line
- every warm boot, whose `CWBOOT` calls `CFLALL` (`src/boot.asm:149-152`,
  `src/cache.asm:634-640`)
- a valid change through the services `MOUNT` or `UNMNT`, whose `VFLUSH` calls
  `CFLUSH` with no line excluded before any drive changes and fails if a line
  failed (`src/volsvc.asm:360-389`)
- BDOS function 48, which calls `VFLUSH` and returns 0 in `A` or `FFh` if a line
  failed (`src/cpm/bdos.asm:244-245`)

So `MOUNT`, unmount and function 48 keep a line whose write fails for the next
flush. Only warm boot's `CFLALL` drops a flushed line that still fails, and a
directory write on any volume whose flush fails drops its own
directory line, unwritten, so the card's directory is read again
(`src/cache.asm:256-301`, `src/cache.asm:538-547`, `docs/recovery.md:97-118`).

At the prompt every change has already reached the card, since the prompt's
own console read writes every line. A `^C` there causes a warm boot, whose
flush then has nothing left to write. A failure at a warm boot prints
`Write lost`, whose consequence is described below. Reset does not flush the old cache. Cold boot
clears EXPAND 1 (`src/boot.asm:235-252`) so changes still unwritten at reset are
lost. Some changes since the last directory write may already be on the card.
`CTAKE` wrote them when their lines were given out for other blocks
(`src/cache.asm:341-345`). The card can then hold a mix of old and new blocks.

## A failed flush

A data write on the logged drive can return success before its record has
reached the card. A failure when its line goes to the card later therefore needs
a report of its own and that report is `Write lost`. `CWBOOT` calls `CFLALL` at
the warm boot. That writes every dirty line and drops each one the card rejects.
If any failed, `CWBOOT` drops the rest of a chained line and prints `Write lost`
on its own line (`src/cache.asm:634-640`, `src/text.asm:94`). The dropped lines'
changes are gone from RAM. Blocks the card rejected before programming retain
their earlier contents. A partially programmed block has the corruption risk
described above. The message is printed once for that flush. With no new dirty
data, the next warm boot has nothing more to write.

A directory write whose flush fails during a program's run is the BDOS's
`Bad Sector` instead. Its data lines that failed are still dirty so the warm
boot after it writes them again. When the card rejects them again, the boot
prints `Write lost` and drops them. The directory's line was dropped when the
directory write failed. The failed directory update is not retried by that
flush. If the card rejected the directory write before changing it, the previous
directory remains. A card error or power loss during programming can instead
leave a partly changed block.

A card taken out while TEC-OS runs gives that, since every write then fails.
The first warm boot after it prints `Write lost` and drops the lines.
Putting the card back does not itself run `SDINIT`. The cold-boot path
starts the card (`src/boot.asm:92-101`). If writes still fail, a later
change written behind produces `Write lost` at the next warm boot.

While the card answers but refuses, each console read, polls among them
(functions 6 and 11), tries every kept line again, about 55 milliseconds a
line at 4 MHz. With all 30 lines kept a poll takes about 1.6 seconds. A
program that polls the console while the card refuses runs that slowly until
the card takes the lines or a warm boot drops them with `Write lost`
(`docs/recovery.md:114-118`). A reset
discards the change, still unwritten. While dirty lines stay dirty, fewer
lines are free for reads. Every `CTAKE` starts with a write once all 30 are
dirty.

The run below left X.COM in the directory after a failed close. Its buffered
records did not reach the card. It uses the prepared starter image and
matching ROM. The PC setup is described in
[Chapter 6](06-cards-on-the-pc.md#the-host-tools) and matching media in
[Chapter 27](27-build-the-rom-and-media.md). The shell recipe also
requires `cp` and `truncate`. It changes a separate image, not the working card.

The image ends 32 card blocks into WORK, just past its directory. The directory
is present but the file's data area is outside the shortened image:

<!-- Not a physical-card experiment. -->
```sh
cp dist/starter.img nodata.img
truncate -s 2113536 nodata.img
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card nodata.img '@start SAVE 1 B:X.COM' '@key x' 'DIR B:'. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>SAVE 1 B:X.COM

Bdos Err On B: Bad Sector
Write lost
A:SYSTEM>DIR B:

X       .COM       0
1 file, 0 bytes
8372224 free on B:WORK
A:SYSTEM>
```

`SAVE` first made X.COM's empty directory entry and buffered its two records.
The close's data flush could not write their block and failed with
`Bad Sector`. After the recovery key, `x` in this capture, warm boot tried the
block again, dropped it and printed `Write lost`. The failed close did not publish
the updated record count or allocation map. In this fixture the on-card file
therefore still had no records
(`src/cpm/ccpcmd.asm:266-390`, `src/cpm/bdosfile.asm:210-217`,
`src/cache.asm:624-640`).

DIR still listed X.COM because making the empty entry had succeeded before the
failed close. Its name in the listing does not establish that the two buffered
records reached the card.

## Time with maskable interrupts off

The cache's routines put EXPAND 1 in view many times in each BIOS call. The
window at `8000h–BFFFh` then holds the cache and not the workspace and the
stacks. An interrupt taken then would push its return address into EXPAND 1
and run its handler with the wrong memory in the window. So the BIOS's
`READ` and `WRITE` disable maskable interrupts across their mapping and
cache work (`src/cache.asm:13-17`).

`CDI` at each entry calls `IFFGET`, whose `LD A,I` copies the interrupt
flip-flop into the P/V flag. An NMOS Z80 can clear that flag when it accepts
an interrupt during the instruction. `IFFGET` therefore repeats the test
when the flag is clear (`src/bios.asm:367-371`). `CDI` turns interrupts off
with `DI` and saves the flags in `CIFF` (`src/bios.asm:379-386`). `BRET` at
each exit turns the result's Z flag into `A`, 0 for success and 1 for an
error. `CEI` turns interrupts on again only if `CIFF` shows they were on at
entry (`src/bios.asm:432-446`, `src/bios.asm:395-399`,
`src/bios.asm:418-422`). A call made with interrupts off returns with them
off. `VFLUSH`, in the volume services, uses the same pair around its flush
(`src/volsvc.asm:373-389`). `MVCOPY` calls `IFFGET` too and keeps its own copy of the state
(`src/cache.asm:659-661`).

Maskable interrupts come on only when a program or a service enables them, as
Chapter 16 states. The ROM's executable `EI` instructions restore a saved state.
The places are `CEI`, `RXBITS`, `TXBYTE`, `MVEND` and the
PICO9918's `VPAIR` (`src/bios.asm:437-446`, `src/console.asm:306-331`,
`src/console.asm:363-393`, `src/cache.asm:799-804`,
`src/pico.asm:443-454`). The boot also writes `EI` followed by `RETI` at `0038h`
when no resident jump is retained there. That code runs on an interrupt or a
program's `RST 38h` (`src/boot.asm:373-382`). DI does not block a non-maskable
interrupt (NMI). These routines therefore require the NMI conditions described
in Chapter 15 as well as their maskable-interrupt protection.

For a program that enables maskable interrupts, the protected portion of a BIOS
disk call holds them off across mapping, cache work and card I/O. A read that
misses holds them off for about 235,000 T-states, 59 milliseconds. A directory
write, on any drive, holds them off while every dirty line is written, and so
does a console read when a line may be held behind. After `SAVE 8 B:X.COM` the close of that file of four blocks takes
1,129,449 T-states in the logged-B measurement above. Each line's `CWRITE` costs 217,338 T-states. Multiplying it by 30 gives about 6.5 million T-states, or 1.6 seconds,
for data transfer alone. That is an estimate from the model cost, not a measured
all-dirty flush or an upper bound for a physical card. A program with an
interrupt response requirement can place disk calls outside the interval that
needs a short response. Writing off the logged drive keeps only the pending block changed, but a
directory write still flushes every line and a cache miss may still write one
dirty line. Warm boot, drive changes, mount changes and function 48 can flush
the whole cache whatever volume the program uses. Those operations must also fall outside that interval.
