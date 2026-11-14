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

A save operation can return while the newest file bytes still exist only
in RAM. The cache collects 128-byte records into 512-byte card blocks before
writing them. Persistence therefore depends on the flush boundary after the
write as well as the write's own result.

Retaining those blocks avoids repeated slow card transfers. A host-model
block read takes about 55 milliseconds because the driver transfers bits
individually, as Chapter 18 explains. Directory scans revisit the same
blocks, so a cached copy in EXPAND 1 replaces later card reads with memory
copies. Writes use those same lines. Data on the logged drive accumulates
in several lines. Other drives share a pending block until a flush point.
The safe-save consequence from Chapter 1 follows directly: the card can lag
behind the file until a key wait or flush (`src/bios.asm:329-358`,
`src/cache.asm:581-622`).

## Thirty lines and their table

The cache can retain thirty card blocks. Its 30 lines each contain 512
bytes and occupy `8000h–BBFFh` in EXPAND 1 (`src/cache.asm:1-17`,
`src/layout.asm:32-42`). Line n begins at `8000h` plus n times `200h`.
`CLADR` calculates its high byte by doubling n and adding `80h`
(`src/cache.asm:166-171`).

A table in the next page records each line's identity and state. At
`CTAB`, `BC00h`, four bytes per line hold the card block number or
`FFFFFFFFh` for an empty line. At `CDIRTY`, `BC80h`, a nonzero byte marks
changes not yet written to the card. Empty lines have no block, clean
lines match the card and dirty lines contain newer bytes.

Cold boot clears EXPAND 1 and marks every line empty before mounting the
card ([Chapter 16](16-reset-and-boot.md), `src/boot.asm:77`,
`src/boot.asm:235-252`). Mounting reads the container table into an ordinary
clean line. `CTAKE` can later reuse that line like any other
(`src/vol.asm:380-416`). Chapter 18 explains the mount checks.

The lookup key is `SDLBA`, the absolute card block number. It remains the
same regardless of the drive used to reach the block. Looking up this
address prevents separate cache copies of the same block
(`src/cache.asm:49-91`).

The data and line table are banked in EXPAND 1. Five control bytes remain
in the resident workspace above the RAM BIOS table (`src/ram.asm:310-325`):

- `CNEXT`, the next line to give out
- `CWTYPE`, the write type of the current BIOS `WRITE` in its low bits,
  with bit 5 set for a data write held to coalesce
- `CIFF`, the saved flags containing the interrupt state at the BIOS call's entry
- `CANY`, nonzero while a data line may be held behind on the logged drive
- `CPEND`, the pending block's line plus one, 0 for none

Table access briefly selects EXPAND 1. `CXON` supplies `LATCHV` ORed with
`LATEXP`. The routine writes that latch value, accesses the bytes then
restores `LATCHV`. No `PUSH`, `POP` or `CALL` occurs between those latch
writes (`src/cache.asm:30-41`). The caller's stack may be hidden during the
access, as [Chapter 15](15-state-and-memory.md#expand-1-and-the-stack-boundary)
explains.

## A record read through the cache

A cache hit replaces the physical transfer with a copy. BIOS `READ` maps
the record to its card block and quarter-block position then calls `CREAD`
(`src/bios.asm:395-399`, `src/cache.asm:406-417`). `CLOOK` compares `SDLBA`
against line keys from line 0 onwards (`src/cache.asm:49-91`). On a hit,
`CRDREC` copies 128 bytes to the DMA address. On a miss, `CTAKE` allocates
a line and `CFILL` reads the block before the same record copy.

Filling a line needs no intermediate block buffer. `CFILL` sets `SDXB` to
`LATEXP` and `SDREAD` selects EXPAND 1 during its byte loop, placing card
bytes directly in the line (`src/cache.asm:183-201`, `src/sd.asm:469-478`).
Read failure leaves the line empty.

Replacement favours clean lines because their bytes already exist on the
card. `CTAKE` searches from `CNEXT`, skips dirty lines and wraps after line
29. It allocates the first clean line and advances `CNEXT` beyond it. With
all lines dirty, it first writes the line at `CNEXT` then allocates that
line (`src/cache.asm:312-358`). This round-robin order does not track recent
use. Even a frequently read block can be evicted on its turn and need
another card read.

The recorded directory scan shows the difference. On the four-drive
starter, a hit during `DIR /W` takes 13,538 T-states including lookup and
the copy to `DIRBUF`. Misses in `DIR /W B:` take 235,235–235,280. All four
reads on A hit. Scanning the empty WORK directory produces 32 misses and
96 hits.

Lookup alone is much cheaper than those complete BIOS calls. `CLOOK`
takes 264 T-states for a line-0 hit in the READ workload. Across READ, SAVE
and directory workloads, misses take 1,977–2,021. The trace distinguishes
hit and miss through the saved Z flag.

The copy cost depends on the DMA address. `CRDREC` and `CWRREC` select
source and destination banks through `XMSRC` and `XMDST`: 0 is the program
view and 1 is EXPAND 1. They call `MVCOPY` (`src/cache.asm:370-395`). Within
a bank, it performs an `LDIR` with that bank selected (`src/cache.asm:680-684`,
`src/cache.asm:777-783`). Below `8000h`, the program view remains visible
with EXPAND 1 selected so that part also uses an `LDIR`
(`src/cache.asm:685-739`).

A destination in EXPAND 0, such as `DIRBUF`, shares the window with EXPAND 1.
The copy must switch the latch between each byte read and write
(`src/cache.asm:742-771`). It uses no stack under EXPAND 1 because the
caller's stack may be in EXPAND 0 (`src/cache.asm:13-17`). `MVEND` restores
`LATCHV` and enables interrupts only if enabled on entry
(`src/cache.asm:790-804`). In the READ workload below, the faster fixed-RAM
copy to `0080h` gives 4,565–6,334 T-states on hits and 226,345–226,346 on
misses. These cannot replace the slower `DIRBUF` timings.

The effect over a whole file is measured with READ. Its 24-byte binary
opens the command-line file and repeats function 20 reads to `0080h`:

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

The PC recipe assembles READ with TAS, using the process in Chapter 27.
It places READ and a 12,288-byte file on A and provides a G8M volume on B
for the write comparison:

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

The timing script uses `Machine` in the same way as `tools/capture.mjs`,
which prints no cycle count. Its card is `time.img`, with no startup file
or shell. It samples `cycles` (`host/machine.mjs:284`) after the command
`READ DATA.BIN` has been typed and echoed but before Return. The second
sample is at the next prompt. The first run after cold boot takes 6,617,943
T-states, or 1.65 seconds. The next takes 1,318,031, or 0.33 seconds, about
a fifth as long. Both include loading READ from A. The trace counts that
loader separately: one READ.COM record and its EOF. The program then makes
one function-20 call per data record followed by its own EOF call.

A file that fills the cache loses that repeat-read advantage. On a copy
of `time.img`, 15,360-byte `BIG.BIN` takes 8,165,728 T-states, or 2.04
seconds, then 8,388,441, or 2.10 seconds. Its data alone fills all thirty
lines. Directory and program reads also need lines, so `CTAKE` evicts each
data block before the next run reaches it.

## Two kinds of drive

Write policy follows the *logged drive*, stored in CCP `BOOTDRV`. This is
the drive selected at the prompt. Prompt drive changes set it, as does warm
boot using the drive left at 0004h. A program's function 14 leaves it
unchanged. Data on that drive is *written behind*, remaining in cache until
a flush. Other drives use *coalescing*: records accumulate in a card block
before it is written. Read-only volumes reject writes
(`src/bios.asm:329-358`, `src/cpm/ccp.asm:233-245`, `docs/recovery.md:1-39`).

Both policies use the same directory and console boundaries:

1. **Every directory write flushes cached data first.** On any drive,
   every changed data block must reach the card before the directory block.
   The directory therefore cannot publish an entry before its data writes
   succeed. A failed data block prevents the directory write.
2. **Every console read attempts to write every changed line.** Functions 1, 6 with
   `E = FFh`, 10 and 11 and the BIOS's `CONIN` write every changed line, on
   every drive, before they read. Successful writes place the changes
   on the card before TEC-OS waits for a key (`docs/recovery.md:41-53`).

The resulting loss bound depends on the operation and its next flush
point (`docs/recovery.md:55-62`):

| Write | Reaches the card | A reset before then loses |
| --- | --- | --- |
| Data on the logged drive's volume, written behind | at the next console read, directory write on any volume, write that needs a line when all are changed, function 48, drive change, `CD` or warm boot | the changed blocks since the program's last key wait or directory write, up to 30 |
| Data on any other volume, coalesced | its pending block at the first of: a console read, any directory request, a write to another block on any drive, function 48, a drive change, `CD`, warm boot | at most one block, 512 bytes |
| A directory write, on any volume | before the call returns, after every changed and kept data line; refused if one fails | nothing that the call reported done |
| Any write to a read-only volume | never: refused | nothing |

The starter boots with A logged, so data writes to A remain buffered
until the next key wait, directory write or warm boot. Moving to another
data block alone does not flush them. The prompt itself waits for input and
therefore performs a flush. With successful card writes, reaching that
prompt supplies the boundary needed before reset or card removal.

## Writes off the logged drive

Off-drive coalescing begins in BIOS `WRITE`. After saving the type in
`CWTYPE` and completing its checks, it reaches `BWGET`. A write to another
block first flushes the pending block. `BWGET` then compares `BOOTDRV` with
`DSKCUR`. An off-drive data write sets `CWTYPE` bit 5. Type-1 directory
writes leave the bit clear. Both continue through `CWRBH`
(`src/bios.asm:329-358`).

`CWRBH` merges the record and marks its line dirty. With bit 5 set, `CWCO`
stores the line number plus one in `CPEND` and returns. Zero means no pending
block (`src/cache.asm:497-527`, `src/ram.asm:310-325`). This bounds coalescing
to a pending block shared across drives. The first of these events flushes
it (`docs/recovery.md:120-155`):

- the file's close and any other directory request: an open, make, search,
  delete, rename, attribute change, size, login or the extent change inside
  a write. `FNCLSE` and `READDIR` call `CPOUT` first, so the directory never
  names a block whose data is not on the card
  (`src/cpm/bdosfile.asm:215-216`, `src/cpm/bdoslog.asm:17-18`)
- a BIOS write to another block, on any drive. `BWGET` calls `CPMOVE`, which
  keeps the pending line when the new write is to the same block and
  otherwise writes it with `CPFLSH` (`src/bios.asm:343-347`,
  `src/cache.asm:550-579`)
- a console read: functions 1, 10 and 11, function 6 with `E = FFh` or
  BIOS `CONIN`. All call `CKEY` (`src/cpm/bdos.asm:281`, `:333`,
  `:404`, `:708`, `src/console.asm:225`)
- a drive change at the prompt, which calls `VFLUSH` before it moves the
  logged drive (`src/cpm/ccp.asm:240`)
- function 48, `CD`'s mount, an unmount and warm boot

The four records of a block can therefore accumulate before a block
transition writes them together. Completed lines remain useful for program
and directory reads. Writing through after every record would transfer the
same block four times.

Before a flush, reset or power loss can discard the pending block's newest
records: at most four records, or 512 bytes. The card retains the previous
contents. A rejected write leaves the block pending. Close or another
directory request reports `Bad Sector` or returns function 45's error.
Console reads still return input and leave error reporting to the next
non-console flush point. Warm boot retries once more then discards the
failed block with `Write lost` (`docs/recovery.md:164-174`).

The recorded SAVE runs each start from a fresh `time.img` containing READ
and DATA on A. SAVE counts 256-byte pages. Counts 8, 16 and 160 therefore
mean 2,048, 4,096 and 40,960 bytes, or 16, 32 and 320 records. With A
logged, `SAVE 8 B:X.COM` takes 2.782 seconds, `SAVE 16` takes 3.069 and
`SAVE 160` takes 8.607. Timing begins before Return and ends at the next
prompt, including B's initial directory login. Every recorded SDWRITE
succeeds and the resulting files match the saved RAM bytes.

The 8-page trace writes directory block 4096, data blocks 4128–4131 and
directory block 4096 again: six writes. The four data blocks each transfer
once after record collection. The 16-page run uses eight data writes and
two directory writes, ten in total. The 160-page run uses 80 data writes
and five directory writes, 85 in total, including extent transitions.
These counts describe the measured workload. Other workloads can write a
block more than once.

## Collecting records on the logged drive

The logged drive can retain several changed blocks instead of just the
pending block used elsewhere. Four records fit each block, following the
mapping in Chapter 18 (`src/cache.asm:360-395`). Policy follows the logged
drive regardless of descriptor content. Descriptor byte 15 is reserved
and `MNFILL` copies only the read-only bit into drive flags
(`src/vol.asm:597-598`, `format/format.json:36`). After its checks, BIOS
`WRITE` enters `CWRBH` with `CWTYPE` bit 5 clear for logged-drive data
(`src/bios.asm:343-358`).

The merge itself is common to every write (`src/cache.asm:429-547`).
`CWRBH` uses the block's existing line or obtains a line through `CTAKE`.
A new line normally requires a card pre-read. The new-allocation rule from
Chapter 18 permits zero-fill instead when no existing records need
preserving (`src/cache.asm:447-466`).

`CWRREC` copies 128 bytes from DMA and `CDSET` marks the line dirty.
Logged-drive data writes then set `CANY` and return. Success means the
record is cached. The call may also have evicted an older dirty line, so
other card bytes may already have changed (`src/cache.asm:497-519`).

Type 1, identified by `CWTYPE` bit 0, continues to directory publication on
any drive (`src/cache.asm:528-548`). `CFLUSH` writes every dirty line except
the directory line. Only complete success permits `CWRITE` to write that
line. On failure the directory line is dropped so the next read obtains
the card's copy. Failed data lines remain dirty because they contain the
newest records. The BDOS receives the error. A program using function 45
can retry close and its retained dirty data. Close succeeds after those
writes and the directory write succeed (`src/cache.asm:266-300`,
`src/cache.asm:538-547`).

File creation and closing a changed FCB cause BDOS directory writes.
Extent transitions also close changed state (`src/cpm/bdosfile.asm:229-287`,
`src/cpm/bdosfile.asm:510-514`, `src/cpm/bdosrec.asm:94-98`). Each successful
directory write therefore brings changed cache data to the card first,
on every drive (`src/cpm/bdoslog.asm:82-87`).

Console reads supply the other frequent boundary. With `CANY` set,
`CKEY` writes every changed line and clears the flag once none remain.
With `CANY` clear, only the pending block can be dirty and the cheaper
`CPOUT` path checks that block. Until a flush or eviction, repeated changes
to a cached block can become a card write together. Directory writes and
evictions can end this interval before the next key wait
(`src/cache.asm:581-622`, `src/ram.asm:321-325`).

Selecting `B:` first changes the policy for the same destination. The
fresh two-volume card measurements compare both cases:

| SAVE pages | Bytes | A logged, seconds | B logged, seconds | SDWRITE calls in either run |
| ---: | ---: | ---: | ---: | ---: |
| 8 | 2,048 | 2.782 | 0.488 | 6 |
| 16 | 4,096 | 3.069 | 0.767 | 10 |
| 160 | 40,960 | 8.607 | 6.205 | 85 |

The faster B-logged totals include a different starting state. The drive
change has already logged B's directory outside the timed interval, so the
comparison does not isolate write policy. The larger logged-drive trace
also writes data in cache-line order rather than block order. It still has
80 data writes and five directory writes and the file matches saved RAM.

The close time shows where the work moved. With B logged, the 8-page
close writes four retained data blocks plus the directory update in
1,129,449 T-states. With A logged, earlier block transitions have already
written preceding pending blocks. Close then takes 477,956 T-states.
Both paths persist data before the directory update.

## Flush order and interrupted updates

Flush order follows cache line numbers. `CFLUSH` walks 0–29 excluding the
line in `A`. `CFLALL` passes `FFh`, excluding none (`src/cache.asm:266-300`).
Round-robin allocation places blocks in lines independently of file order,
so a file's blocks can reach the card in any order.

Directory publication is ordered after those data writes on every volume.
A successful type-1 write leaves its line clean. Failure removes it
(`src/cache.asm:538-547`). With correct BDOS types, later flushes therefore
have only data lines left.

Power loss during the data phase can leave new data with the directory
update unwritten. Completed overwrites remain in effect even if the directory
never changes. The ordering provides no rollback.
[Chapter 6](06-cards-on-the-pc.md#recovery-after-a-power-cut) describes recovery.
A cut during the directory block's own transfer can damage any of its 16
entries. Card-reported completion also does not verify physical power-loss
durability (`docs/recovery.md:188-189`, `docs/recovery.md:217-219`).

`CWRITE` performs the individual transfer. It obtains the block number
from the table and sets `SDXB` so `SDWRITE` reads 512 bytes directly from
EXPAND 1. Success marks the line clean. Failure returns NZ and leaves it
dirty (`src/cache.asm:213-251`). A flush continues past failures and returns
NZ if any write failed.

The caller determines the failed line's lifetime. Warm boot's `CFLALL`
drops it. `CFLUSH` retains it for retry during a directory write, console
read, drive change, function 48, `MOUNT` or unmount (`src/cache.asm:256-301`).
When all lines are dirty, `CTAKE` also retains a failed victim but advances
`CNEXT` before returning the error. The next miss attempts the next line
so a bad block cannot cause every later miss to fail
(`src/cache.asm:341-358`).

### Seven flush occasions

The complete flush lookup has seven occasions. Off-drive writes also use
the pending-block boundaries listed earlier:

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

These paths preserve failed data for retry except at warm boot.
`MOUNT`, unmount and function 48 keep failed lines dirty. `CFLALL` drops
them. A directory operation also drops its own unwritten directory line
on failure so the next read obtains the on-card directory
(`src/cache.asm:256-301`, `src/cache.asm:538-547`, `docs/recovery.md:97-118`).

A prompt console read attempts to write every change. After a successful
flush, `^C` at the prompt causes a warm boot with nothing left to write.
Failed warm-boot writes produce `Write lost`, described below. Reset does
not flush the old cache: cold boot clears EXPAND 1 and loses unwritten
changes (`src/boot.asm:235-252`). Earlier dirty evictions may already have
written other changes (`src/cache.asm:341-345`). The card can consequently
contain a mixture of old and new blocks.

## A failed flush

A delayed write can fail after the original data call returned success.
Warm boot reports this with `Write lost`. `CWBOOT` calls `CFLALL`, attempts
every dirty line and drops each rejected line. Any failure also discards
the remainder of a command chain before printing the message on its own
line (`src/cache.asm:634-640`, `src/text.asm:94`).

The discarded changes are gone from RAM. A block rejected before
programming retains its old contents. Partial programming carries the
corruption risk described above. The message appears once per failed flush.
Without new dirty data, a later warm boot has nothing left to retry.

During a running program, a directory flush failure instead reports BDOS
`Bad Sector`. Failed data remains dirty for warm boot to retry. Another
rejection then causes `Write lost` and discard. The failed directory line
has already been dropped, so that flush cannot retry its update. Rejection
before programming preserves the previous directory. A card error or power
loss during programming can leave the block partly changed.

Removing the card during use makes these writes fail. The first warm boot
prints `Write lost` and drops the lines. Reinserting the card does not
invoke `SDINIT`. Card initialisation belongs to the cold-boot path
(`src/boot.asm:92-101`). If later writes still fail, another buffered change
can produce the same message at the next warm boot.

Retaining failed lines also costs time. Every console read retries them,
including function 6 and 11 polls. A responding card that rejects writes
costs about 55 milliseconds per line at 4 MHz. Thirty retained lines can
make a poll take about 1.6 seconds. Polling remains that slow until writes
succeed or warm boot drops the lines with `Write lost`
(`docs/recovery.md:114-118`). Reset discards unwritten changes. Dirty lines
also reduce space for reads and every `CTAKE` begins with a write once all
thirty lines are dirty.

The following host fixture demonstrates a failed close that leaves a file
name but no saved records. It uses the prepared starter image and matching
ROM from [Chapter 6](06-cards-on-the-pc.md#the-host-tools) and
[Chapter 27](27-build-the-rom-and-media.md). The recipe requires `cp` and
`truncate` and alters a separate image rather than the working card.

The copy ends 32 card blocks into WORK. Its complete directory remains
present but the file's data area lies beyond the shortened image:

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

`SAVE` creates X.COM's empty directory entry before buffering two records.
Close then fails to flush their data block and reports `Bad Sector`. After
the recovery key, `x` here, warm boot retries the block then drops it with
`Write lost`. The failed close never publishes the new record count or
allocation map. The fixture's on-card file consequently still has no
records (`src/cpm/ccpcmd.asm:266-390`, `src/cpm/bdosfile.asm:210-217`,
`src/cache.asm:624-640`).

DIR lists the name because creation of the empty entry succeeded. The
listing establishes that earlier operation's result, not persistence of the
two buffered records.

## Time with maskable interrupts off

The same banking that enables caching creates an interrupt constraint.
During EXPAND 1 access, `8000h–BFFFh` contains cache memory in place of the
workspace and stacks. An interrupt could push its return address into the
wrong bank and run with hidden workspace. BIOS `READ` and `WRITE` therefore
mask interrupts across mapping and cache work (`src/cache.asm:13-17`).

`CDI` saves the preceding interrupt state through `IFFGET`. Its `LD A,I`
copies the interrupt flip-flop to P/V. An NMOS Z80 can clear that flag when
accepting an interrupt during the instruction, so `IFFGET` repeats a clear
result (`src/bios.asm:367-371`). `CDI` then executes `DI` and saves flags
in `CIFF` (`src/bios.asm:379-386`).

On exit, `BRET` converts Z to `A` = 0 for success or 1 for error. `CEI`
reenables interrupts only if `CIFF` records them enabled at entry. Calls
made with interrupts off return with them off (`src/bios.asm:432-446`,
`src/bios.asm:395-399`, `src/bios.asm:418-422`). `VFLUSH` uses the same pair
(`src/volsvc.asm:373-389`). `MVCOPY` calls `IFFGET` and retains a separate
state copy (`src/cache.asm:659-661`).

As described in Chapter 16, a program or service must enable maskable
interrupts. The executable ROM `EI` sites restore saved state: `CEI`,
`RXBITS`, `TXBYTE`, `MVEND` and PICO9918 `VPAIR` (`src/bios.asm:437-446`,
`src/console.asm:306-331`, `src/console.asm:363-393`, `src/cache.asm:799-804`,
`src/pico.asm:443-454`). Boot also installs `EI` followed by `RETI` at
`0038h` when no resident jump is retained. That stub can run on an interrupt
or a program's `RST 38h` (`src/boot.asm:373-382`). `DI` cannot block NMI.
The NMI conditions from Chapter 15 still apply.

Programs that enable interrupts must schedule disk operations around
required response times. A read miss masks interrupts for roughly 235,000
T-states, or 59 milliseconds. A directory write or console read can keep
them masked while every dirty line transfers. The logged-B 8-page close
above costs 1,129,449 T-states. At 217,338 T-states per `CWRITE`, thirty
lines imply about 6.5 million T-states, or 1.6 seconds, for data transfer
alone. This is a model-based estimate, not a measured all-dirty flush or
a physical-card upper bound.

Off-drive writes limit coalesced data to the pending block but cannot bound
every disk call to that transfer. A directory write still flushes all dirty
lines and a miss may evict a dirty line. Warm boot, drive changes, mount
changes and function 48 can flush the whole cache. They must also occur
outside any interval requiring short interrupt response.
