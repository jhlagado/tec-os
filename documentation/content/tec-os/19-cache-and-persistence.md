---
title: Cache and persistence
parent: TEC-OS
nav_order: 19
nav_group: "Inside TEC-OS"
---

# 19. Cache and persistence

<!-- Checked against TEC-OS 57a8c38b7f341433285e39c4bec14ecc486ffe26 (retained recovery baseline),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/. READ/SAVE/DIR timings use the measurements retained there.
     The tool inputs are the pinned TAS host 3d16b30 and TED 02b63d8;
     Baza is the qualified eee4ee6 payload. Source-derived excerpts are
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
Ordinary outer calls now give pending writes an earlier opportunity: one eligible
line is attempted before the call's normal work. A successful record call can
still leave its newest bytes only in RAM if the program makes no further call.
No timer progresses the queue while the program owns the CPU
(`0701241:docs/recovery.md:25-52`).

The existing numeric and capture receipts in this chapter retain their stated
historical firmware. They have not been rerun under these housekeeping paths.
Current source explanations identify their own revision. The current
retained-data observation below is separate from those historical costs.

## Thirty lines and their table

The cache can retain thirty card blocks. Its 30 lines each contain 512
bytes and occupy `8000h–BBFFh` in EXPAND 1 (`b95b2a9:src/cache.asm:1-20`,
`b95b2a9:src/layout.asm:32-42`). Line n begins at `8000h` plus n times `200h`.
`CLADR` calculates its high byte by doubling n and adding `80h`
(`b95b2a9:src/cache.asm:172-177`).

A table in the next page records each line's identity and state. At
`CTAB`, `BC00h`, four bytes per line hold the card block number or
`FFFFFFFFh` for an empty line. At `CDIRTY`, `BC80h`, a nonzero byte marks
changes not yet written to the card. Empty lines have no block, clean
lines match the card and dirty lines contain newer bytes.

Cold boot clears EXPAND 1 and marks every line empty before mounting the
card ([Chapter 16](16-reset-and-boot.md), `b95b2a9:src/boot.asm:77`,
`b95b2a9:src/boot.asm:239-256`). Mounting reads the container table into an ordinary
clean line. `CTAKE` can later reuse that line like any other
(`b95b2a9:src/vol.asm:380-416`). Chapter 18 explains the mount checks.

The lookup key is `SDLBA`, the absolute card block number. It remains the
same regardless of the drive used to reach the block. Looking up this
address prevents separate cache copies of the same block
(`b95b2a9:src/cache.asm:52-94`).

The data and line table are banked in EXPAND 1. Five control bytes remain
in the resident workspace above the RAM BIOS table (`b95b2a9:src/ram.asm:310-325`):

- `CNEXT`, the next line to give out
- `CWTYPE`, the write type of the current BIOS `WRITE` in its low bits,
  with bit 5 set for a data write held to coalesce
- `CIFF`, the saved flags containing the interrupt state at the BIOS call's entry
- `CANY`, nonzero while a data line may be held behind on the logged drive
- `CPEND`, the pending block's line plus one, 0 for none

Table access briefly selects EXPAND 1. `CXON` supplies `LATCHV` ORed with
`LATEXP`. The routine writes that latch value, accesses the bytes then
restores `LATCHV`. No `PUSH`, `POP` or `CALL` occurs between those latch
writes (`b95b2a9:src/cache.asm:33-44`). The caller's stack may be hidden during the
access, as [Chapter 15](15-state-and-memory.md#expand-1-and-the-stack-boundary)
explains.

## A record read through the cache

A cache hit replaces the physical transfer with a copy. BIOS `READ` maps
the record to its card block and quarter-block position then calls `CREAD`
(`b95b2a9:src/bios.asm:395-399`, `b95b2a9:src/cache.asm:426-437`). `CLOOK` compares `SDLBA`
against line keys from line 0 onwards (`b95b2a9:src/cache.asm:52-94`). On a hit,
`CRDREC` copies 128 bytes to the DMA address. On a miss, `CTAKE` allocates
a line and `CFILL` reads the block before the same record copy.

Filling a line needs no intermediate block buffer. `CFILL` sets `SDXB` to
`LATEXP` and `SDREAD` selects EXPAND 1 during its byte loop, placing card
bytes directly in the line (`b95b2a9:src/cache.asm:189-207`, `b95b2a9:src/sd.asm:469-478`).
Read failure leaves the line empty.

Replacement still favours clean lines. `CTAKE` searches cyclically from
`CNEXT`, skipping dirty lines and wrapping after line 29. It allocates a clean
line and advances the cursor; this is not a least-recently-used policy.
When all lines are dirty, it instead tries one bounded first-dirty pass.
Any clean slot freed can serve the allocation even if another line refused.
If none is freed, the operation fails without discarding acknowledged data
(`0701241:src/cache.asm:308-374`).

The write queue is separate from that clean-line replacement policy. Each
dirty cache line retains its full absolute block tag in CTAB; its queue entry
keeps the first-dirty position. Received rewrites merge without moving or
duplicating that entry. `HKROUND` freezes
eligible line numbers for a round; failure advances the round too, and later
arrivals wait for the next round. Successful removal invalidates stale round
slots before line reuse (`0701241:src/hk.asm:1-122`).

### Historical read costs

The following directory/READ measurements and their exact workloads remain
historical receipts. Equal low-level transfer code alone does not reprice a
containing call that can now perform queued work.

The recorded directory scan shows the difference. On the four-drive
starter, a hit during `DIR /W` takes 13,538 T-states including lookup and
the copy to `DIRBUF`. Misses in `DIR /W B:` take 235,235–235,280. All four
reads on A hit. Scanning the empty WORK directory produces 32 misses and
96 hits.

Lookup alone is much cheaper than those complete BIOS calls. `CLOOK`
takes 264 T-states for a line-0 hit in the READ workload. Across the READ and
directory workloads and the historical SAVE workload described below, misses
take 1,977–2,021. The trace distinguishes
hit and miss through the saved Z flag.

The copy cost depends on the DMA address. `CRDREC` and `CWRREC` select
source and destination banks through `XMSRC` and `XMDST`: 0 is the program
view and 1 is EXPAND 1. They call `MVCOPY` (`57a8c38:src/cache.asm:370-395`). Within
a bank, it performs an `LDIR` with that bank selected (`57a8c38:src/cache.asm:680-684`,
`57a8c38:src/cache.asm:777-783`). Below `8000h`, the program view remains visible
with EXPAND 1 selected so that part also uses an `LDIR`
(`57a8c38:src/cache.asm:685-739`).

A destination in EXPAND 0, such as `DIRBUF`, shares the window with EXPAND 1.
The copy must switch the latch between each byte read and write
(`57a8c38:src/cache.asm:742-771`). It uses no stack under EXPAND 1 because the
caller's stack may be in EXPAND 0 (`57a8c38:src/cache.asm:13-17`). `MVEND` restores
`LATCHV` and enables interrupts only if enabled on entry
(`57a8c38:src/cache.asm:790-804`). In the READ workload below, the faster fixed-RAM
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
or shell. It samples `cycles` (`57a8c38:host/machine.mjs:284`) after the command
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
unchanged. That drive can retain several dirty blocks. All other volumes
share one pending-block boundary in `CPEND`, and changing blocks flushes it.
Read-only volumes reject writes. Ordinary entry service supplements both
policies, so the next public write can commit the previous same-block update.
Four separate record calls can therefore cause four SD writes; merging received
updates no longer promises batching across public calls
(`0701241:src/bios.asm:329-358`, `0701241:docs/recovery.md:47-67`).

Both policies use the same directory and console boundaries:

1. **Every directory write flushes cached data first.** On any drive,
   every changed data block must reach the card before the directory block.
   The directory therefore cannot publish an entry before its data writes
   succeed. A failed data block prevents the directory write.
2. **Every console read attempts to write every changed line.** Functions 1, 6 with
   `E = FFh`, 10 and 11 and the BIOS's `CONIN` write every changed line, on
   every drive, before they read, subject to errors. BIOS `CONST` and the raw
   reader get ordinary entry opportunities rather than newly promised complete
   drains. A long TONE/raw-reader call has no new progress deadline
   (`0701241:docs/recovery.md:106-109`).

The following table retains the historical flush-point account. The ordinary
outer entry attempt is now an additional opportunity for both data rows, and
all-dirty pressure now attempts a bounded pass. Neither cold reset nor power
loss preserves dirty RAM (`0701241:docs/recovery.md:25-67`).

| Write | Reaches the card | A reset before then loses |
| --- | --- | --- |
| Data on the logged drive's volume, written behind | at the next console read, directory write on any volume, write that needs a line when all are changed, function 48, drive change, `CD` or warm boot | the changed blocks since the program's last key wait or directory write, up to 30 |
| Data on any other volume, coalesced | its pending block at the first of: a console read, any directory request, a write to another block on any drive, function 48, a drive change, `CD`, warm boot | at most one block, 512 bytes |
| A directory write, on any volume | before the call returns, after every changed and kept data line; refused if one fails | nothing that the call reported done |
| Any write to a read-only volume | never: refused | nothing |

The starter boots with A logged. Its writes can be accepted into RAM, but
an admitted outer BDOS, hardware or returning BIOS entry can attempt a queued
line before its normal operation. Nested entries inherit that context rather
than starting recursive workers. `OUTCHAR` and `READDIR` supply selected private
opportunities (`0701241:src/hk.asm:124-202`,
`0701241:src/cpm/bdoscon.asm:169-171`, `0701241:src/cpm/bdoslog.asm:17-22`).
A prompt after `Write pending` is not proof that the card is current.

## Writes off the logged drive

Off-drive coalescing begins in BIOS `WRITE`. After saving the type in
`CWTYPE` and completing its checks, it reaches `BWGET`. A write to another
block first flushes the pending block. `BWGET` then compares `BOOTDRV` with
`DSKCUR`. An off-drive data write sets `CWTYPE` bit 5. Type-1 directory
writes leave the bit clear. Both continue through `CWRBH`
(`b95b2a9:src/bios.asm:329-358`).

`CWRBH` merges the record and marks its line dirty. With bit 5 set, `CWCO`
stores the line number plus one in `CPEND` and returns. Zero means no pending
block (`b95b2a9:src/cache.asm:519-549`, `b95b2a9:src/ram.asm:310-325`). This retains one
pending-block boundary shared across drives. Required flush points include
the following events; ordinary outer entry can attempt the line earlier (`b95b2a9:docs/recovery.md:25-67`):

- the file's close and any other directory request: an open, make, search,
  delete, rename, attribute change, size, login or the extent change inside
  a write. `FNCLSE` and `READDIR` call `CPOUT` first, so the directory never
  names a block whose data is not on the card
  (`b95b2a9:src/cpm/bdosfile.asm:215-216`, `b95b2a9:src/cpm/bdoslog.asm:17-20`)
- a BIOS write to another block, on any drive. `BWGET` calls `CPMOVE`, which
  keeps the pending line when the new write is to the same block and
  otherwise writes it with `CPFLSH` (`b95b2a9:src/bios.asm:343-347`,
  `b95b2a9:src/cache.asm:572-601`)
- a console read: functions 1, 10 and 11, function 6 with `E = FFh` or
  BIOS `CONIN`. All call `CKEY` (`b95b2a9:src/cpm/bdos.asm:282-289`, `b95b2a9:src/cpm/bdos.asm:331-340`,
  `b95b2a9:src/cpm/bdos.asm:405-407`, `b95b2a9:src/cpm/bdos.asm:702-715`, `b95b2a9:src/console.asm:225`)
- a drive change at the prompt, which calls `VFLUSH` before it moves the
  logged drive (`b95b2a9:src/cpm/ccp.asm:286`)
- function 48, `CD`'s mount, an unmount and warm boot

Received records still merge in a block and preserve their neighbours.
Completed clean lines remain useful for program and directory reads. Ordinary
entry service can end the merge interval between public record calls, however;
there is no deliberate wait for future updates and no cross-call one-write-per-
block guarantee (`0701241:docs/recovery.md:25-52`).

Before the pending block reaches the card, power loss or a cold reset can
discard its newest records: at most four records, or 512 bytes. Warm boot
retains failed acknowledged data. The card retains the previous contents. A rejected write leaves the block pending. Close or another
directory request reports `Bad Sector` or returns function 45's error.
Input still returns according to its own API. Failed acknowledged data stays
queued through warm boot; the separate notice reporter does not borrow an
unrelated call's result registers. An unmodified or read-only close need not
globally drain every dirty line (`0701241:docs/recovery.md:69-84`,
`0701241:src/cache.asm:638-649`).

### Historical off-drive SAVE costs

The following retained SAVE timings, committed-byte observations and write
counts describe their old firmware, not current housekeeping traffic. SAVE
was a ROM command of that firmware, CP/M 2.2's, which wrote memory pages from
`0100h` to a file. It has since left the ROM. Fresh measurements need a
program that writes the same 8, 16 and 160 pages, with the same byte and
end-of-file checks.

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
mapping in Chapter 18 (`b95b2a9:src/cache.asm:380-415`). Policy follows the logged
drive regardless of descriptor content. Descriptor byte 15 is reserved
and `MNFILL` copies only the read-only bit into drive flags
(`b95b2a9:src/vol.asm:597-598`, `b95b2a9:format/format.json:36`). After its checks, BIOS
`WRITE` enters `CWRBH` with `CWTYPE` bit 5 clear for logged-drive data
(`b95b2a9:src/bios.asm:343-358`).

The merge itself is common to every write (`b95b2a9:src/cache.asm:439-569`).
`CWRBH` uses the block's existing line or obtains a line through `CTAKE`.
A new line normally requires a card pre-read. The new-allocation rule from
Chapter 18 permits zero-fill instead when no existing records need
preserving (`b95b2a9:src/cache.asm:462-488`).

`CWRREC` copies 128 bytes from DMA and `CDSET` marks the line dirty.
Logged-drive data writes then set `CANY` and return. Success means the
record is cached. The call may also have evicted an older dirty line, so
other card bytes may already have changed (`b95b2a9:src/cache.asm:519-541`).

Type 1, identified by `CWTYPE` bit 0, continues to directory publication on
any drive (`b95b2a9:src/cache.asm:550-570`). `CFLUSH` writes every dirty line except
the directory line. Only complete success permits `CWRITE` to write that
line. On failure the directory line is dropped so the next read obtains
the card's copy. Failed data lines remain dirty because they contain the
newest records. The BDOS receives the error. A program using function 45
can retry close and its retained dirty data. Close succeeds after those
writes and the directory write succeed (`b95b2a9:src/cache.asm:265-306`,
`b95b2a9:src/cache.asm:560-569`).

File creation and closing a changed FCB cause BDOS directory writes.
Extent transitions also close changed state (`b95b2a9:src/cpm/bdosfile.asm:229-287`,
`b95b2a9:src/cpm/bdosfile.asm:510-514`, `b95b2a9:src/cpm/bdosrec.asm:94-98`). Each successful
directory write therefore brings changed cache data to the card first,
on every drive (`b95b2a9:src/cpm/bdoslog.asm:83-88`).

Required input still attempts pending data. `CANY` selects a complete bounded
pass when logged-drive lines may remain; otherwise `CPOUT` checks the single
pending block. Ordinary entry service can commit a line even before these
required boundaries (`0701241:src/cache.asm:603-636`).

### Historical logged-drive SAVE costs

The comparison and line-number ordering below remain their original measured
receipts, taken with the same removed SAVE command. New first-dirty service
changes traffic and scheduling; fresh results must write the same page counts
and check the bytes written.

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

A full pass snapshots first-dirty order and attempts each eligible line once,
advancing past refusals so healthy lines can progress. New arrivals cannot
extend a frozen round, and successful removal invalidates its old slot before
reuse. `CFLUSH` excludes the caller's directory line; `CFLALL` is the same
no-exclusion warm pass (`0701241:src/hk.asm:1-122`,
`0701241:src/cache.asm:265-306`).

Directory publication remains after its data prerequisites. Either a failed
prerequisite or a failed metadata write rejects and drops that unpublished
directory image. It must never be replayed later. Failed acknowledged data has
a different lifetime: it stays queued, including through warm boot. All-dirty
allocation can use any clean slot its bounded pass freed; if none was freed it
fails without discarding that data (`0701241:src/cache.asm:308-374`,
`0701241:src/cache.asm:550-569`).

This ordering provides no rollback. Completed overwrites stay changed even if
the directory update fails. Newly allocated data can be on SD without a completed
file entry, and a cut during one block transfer can leave old, new or mixed bytes.
A directory block can damage sixteen entries. Acknowledgement is not proof of
physical power-loss durability (`0701241:docs/recovery.md:111-132`).

`CWRITE` still performs the individual transfer from the tagged line, with
SDXB selecting EXPAND 1 for SDWRITE. A successful write makes the line clean;
a refused write leaves acknowledged data dirty. The new queue removal and
error-event bookkeeping accompany that transfer rather than replacing its
physical byte path (`0701241:src/cache.asm:219-263`).

<a id="seven-flush-occasions"></a>

### Required and ordinary opportunities

Ordinary outer BDOS, hardware and returning BIOS calls attempt one eligible
line before their own work; nested calls inherit that operation. Selected
OUTCHAR/READDIR points also attempt work. Required input, explicit function 48,
warm boot, directory publication and valid selection changes keep their own
bounded flush paths. Invalid or same-selection paths can return earlier.
These are cooperative opportunities, not a timer or wall-clock deadline
(`0701241:docs/recovery.md:33-67`).

<a id="a-failed-flush"></a>

## A failed write

A delayed write can fail after its data call succeeded. Warm boot retains the
acknowledged bytes and queue entry, while cancelling remaining command text
through `CHPOS`. `HKNOTICE` reports the failure episode separately:

- `Write pending` warns once while an episode has dirty retries.
- `Cache clear` follows a reported episode when the queue drains successfully.
- `Write error` identifies an otherwise unreported failure with no dirty retry,
  such as rejected metadata; it is not successful recovery.

Function 45's silent `FFh` mode defers notices without losing the event. A
previously reported episode retains its own state; an operation's metadata
error is not interchangeable with the queue notice
(`0701241:src/cache.asm:638-649`, `0701241:src/hk.asm:204-237`).

`Cache clear` covers cached record writes. It does not close an FCB, repair
rejected metadata, finish browser persistence or prove physical durability.
After `Write pending`, a prompt alone is insufficient: resolve the original
initialised backend failure and await successful cache completion. Cold reset
still discards retained RAM.

Reinserting a card neither initialises it nor identifies it. Warm boot and
the bootstrap Enter-retry path run no `SDINIT`; Enter is not permission to
replay the queue onto an inserted stranger. Resolve the original backend's
failure, or accept cold reset's loss of queued RAM. Retention can make required
polling slow and fill the cache; healthy lines may still progress, but allocation
fails if a bounded pass frees no slot (`0701241:docs/recovery.md:206-222`).

### Current retained-data observation

With ROM `35893cab` and its fifteen-file starter, the same shortened
card still has a readable WORK directory, while its first data block is
outside the backend. The capture sends `COPY STARTUP.CMD B:X.CMD`, acknowledges
its error with one explicit `x`, then sends `DIR B:`. No further key is
supplied.

<!-- TEC-OS 84518ef, ROM 35893cab: node tools/capture.mjs --card nodata.img '@start COPY STARTUP.CMD B:X.CMD' '@key x' '@start DIR B:'. Complete captured console transcript. The cache's state after each step was read from the same host model. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>COPY STARTUP.CMD B:X.CMD

Write pending

Bdos Err On B: Bad Sector
A:SYSTEM>DIR B:

Bdos Err On B: Bad Sector
```

The `x` acknowledges COPY's disk error. Warm boot retains the
failed block and successfully rebuilds the disk state, so the normal shell
can read the next command. That prompt does not certify that the write reached
the card. `DIR B:` then runs. It encounters another Bad Sector and waits for an
acknowledgement. The capture ends there, not at a successful listing or a
repaired card.

The same dirty entry still owns block 4128 and the same 512 data bytes after
DIR. This model observation demonstrates retained acknowledged data across
the error and warm boot. It does not complete an unclosed file, demonstrate
original-backend repair or qualify physical-card durability. Separately,
the exact `b95b2a9` strict fixture pair checks original-backend recovery,
rejected metadata, deferred notices and CR-only bootstrap retry. These are
controlled guest tests, not additional console transcripts.

### Historical failed-close capture

The following recipe and transcript remain their original firmware's evidence,
including its discarded-data output and its DIR row, which that firmware
printed with the type in a column of its own. The current observation above
retains the data instead. Its successful disk reset is distinct from bootstrap
recovery: that console is entered only when the reset or saved-drive
selection itself fails.

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

<!-- TEC-OS 57a8c38: node tools/capture.mjs --card nodata.img '@start SAVE 1 B:X.COM' '@key x' 'DIR B:'. Complete captured console transcript. -->
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

In this historical capture `SAVE 1`, the removed ROM command writing one
256-byte page of memory, creates X.COM's empty directory entry before
buffering two records.
Close then fails to flush their data block and reports `Bad Sector`. After
the recovery key, `x` here, warm boot retries the block then drops it with
`Write lost`. The failed close never publishes the new record count or
allocation map. The fixture's on-card file consequently still has no
records (`57a8c38:src/cpm/ccpcmd.asm:266-390`, `57a8c38:src/cpm/bdosfile.asm:210-217`,
`57a8c38:src/cache.asm:624-640`).

DIR lists the name because creation of the empty entry succeeded. The
listing establishes that earlier operation's result, not persistence of the
two buffered records.

## Time with maskable interrupts off

The numeric costs below remain their historical measurements. They do not
reprice the containing housekeeping calls. The separate final TED-save ceiling
of 1,682.95425 ms belongs only to its pinned 60-line/PICO80 fixture, not these
READ/SAVE workloads or every source/display.

The same banking that enables caching creates an interrupt constraint.
During EXPAND 1 access, `8000h–BFFFh` contains cache memory in place of the
workspace and stacks. An interrupt could push its return address into the
wrong bank and run with hidden workspace. BIOS `READ` and `WRITE` therefore
mask interrupts across mapping and cache work (`b95b2a9:src/cache.asm:16-20`).

`CDI` saves the preceding interrupt state through `IFFGET`. Its `LD A,I`
copies the interrupt flip-flop to P/V. An NMOS Z80 can clear that flag when
accepting an interrupt during the instruction, so `IFFGET` repeats a clear
result (`b95b2a9:src/bios.asm:367-371`). `CDI` then executes `DI` and saves flags
in `CIFF` (`b95b2a9:src/bios.asm:379-386`).

On exit, `BRET` converts Z to `A` = 0 for success or 1 for error. `CEI`
reenables interrupts only if `CIFF` records them enabled at entry. Calls
made with interrupts off return with them off (`b95b2a9:src/bios.asm:424-449`,
`b95b2a9:src/bios.asm:395-399`, `b95b2a9:src/bios.asm:418-422`). `VFLUSH` uses the same pair
(`b95b2a9:src/volsvc.asm:373-389`). `MVCOPY` calls `IFFGET` and retains a separate
state copy (`b95b2a9:src/cache.asm:668-670`).

As described in Chapter 16, a program or service must enable maskable
interrupts. The executable ROM `EI` sites restore saved state: `CEI`,
`RXBITS`, `TXBYTE`, `MVEND` and PICO9918 `VPAIR` (`b95b2a9:src/bios.asm:440-449`,
`b95b2a9:src/console.asm:306-331`, `b95b2a9:src/console.asm:363-393`, `b95b2a9:src/cache.asm:808-813`,
`b95b2a9:src/pico.asm:443-454`). Boot also installs `EI` followed by `RETI` at
`0038h` when no resident jump is retained. That stub can run on an interrupt
or a program's `RST 38h` (`b95b2a9:src/boot.asm:377-386`). `DI` cannot block NMI.
The NMI conditions from Chapter 15 still apply.

Programs that enable interrupts must schedule disk operations around
required response times. A read miss masks interrupts for roughly 235,000
T-states, or 59 milliseconds. A directory write or console read can keep
them masked while every dirty line transfers. The logged-B 8-page close
above costs 1,129,449 T-states. At 217,338 T-states per `CWRITE`, thirty
lines imply about 6.5 million T-states, or 1.6 seconds, for data transfer
alone. This is a model-based estimate, not a measured all-dirty flush or
a physical-card upper bound.

Avoiding explicit disk calls is insufficient for short interrupt response.
An admitted light BDOS call, hardware query or returning BIOS call can perform
SD work first; OUTCHAR and READDIR add selected private opportunities. The
worker brackets its attempted write with CDI/CEI, so those calls can incur the
same interrupt-off storage interval (`0701241:src/hk.asm:124-202`,
`0701241:src/cpm/bdoscon.asm:169-171`, `0701241:src/cpm/bdoslog.asm:17-22`).
Plan pending storage work before latency-sensitive intervals and account for
ordinary opportunities as well as required drains and cache misses. Long TONE
and raw-reader calls gain no new deadline or universal short-call guarantee.
