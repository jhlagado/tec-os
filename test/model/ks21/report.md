# KS21's model: the block cache

Run on the working tree at TEC-OS `f49e380` (KS20 and its review's
fixes), built, on the Debug80 model. `model.mjs` prints every figure below,
and `figures.json` holds one run of each line copy. The inputs:

- `EDIT.COM`, SHA-256 `599eba0d…`, as the suite pins it.
- `TAS.COM`, built at Thorium `bf18b74`, SHA-256 `48b81b58…`, which
  matches the hash Thorium's `build.json` records.

No product source changes.

## How the model works

- **Copies** (choices 1 and 2): the product's copy core (`MVCOPY`) is called
  on the 96K harness, whose EXPAND 1 the model can read. Each copy's bytes
  are checked against its source. `copies.asm` holds two faster line copies,
  run and checked the same way.
- **ROM** (choice 3): `cache.asm` writes out the brief's cache code (the
  table, lookup, round robin, line fill and write, the BIOS read and write
  paths, warm boot, `MOUNT` and `BLOCK`). It is assembled with the
  product's symbols to give its size. Its lookup is run on a table in
  EXPAND 1 to time it.
- **The cache over real workloads** (choice 4 and the speed gate):
  `cache.mjs` follows today's ROM.
  - The machine runs unchanged. Each BIOS `READ` and `WRITE` is followed
    from entry to return, with the block it maps and its time in `SDREAD`
    and `SDWRITE`.
  - A cache of the brief's design runs beside it: 30 lines, round robin,
    B: written behind. Each operation's cost is replaced by what the cache
    would spend: the lookups, the record and line copies above, card reads
    saved, writes deferred, and dirty lines written at directory writes,
    when every line is dirty, and at warm boot.
  - Three models follow each run: today (no cache), the cache with every
    volume written through, and the cache with B: written behind.
  - Times are T-states of work; waits for a key are left out.
- **Line copies compared:**
  - `mvbl`: today's byte loop.
  - `u8`: the loop unrolled eight times.
  - `sp16`: 16 bytes at a time through the registers, by `POP` and `PUSH`.
  - `direct`: no line copy at all. That is the cost if the card's block
    loops (`SDRBLK`, `SDWBLK`, which use no stack) ran with the line itself
    in view.

## Choice 1: a record between a line and `DSKDMA`

| `DSKDMA` | Line to `DSKDMA` | `DSKDMA` to line |
| --- | ---: | ---: |
| `0080h`, below `8000h` | 3,349 | 3,352 |
| `9000h`, at or above `8000h` | 12,239 | 12,242 |
| `7FC0h`, 64 bytes each side | 7,890 | 7,893 |

Today's record copy, `BLKBUF` to `DSKDMA` by `LDIR`, is 2,683 T-states. A
hit costs 666 more when `DSKDMA` is below `8000h`. It costs 9,556 more at
or above, because the copy core moves a byte at a time between two banks
there. Against the 217,248 T-states of the card read a hit saves, both are
small.

A lookup: 1,677 T-states for a miss, and 256, 1,036 and 1,764 for a hit in
the first, middle and last line.

## Choice 2: the line copy

| Copy | T-states for 512 bytes | Per byte | Saved per miss and per line written | ROM bytes added |
| --- | ---: | ---: | ---: | ---: |
| `MVBL`, today | 47,567 | 92.9 | — | 0 |
| `MVBL` unrolled 8 times | 30,641 | 59.8 | 16,926 | 96 |
| `POP` and `PUSH`, 16 bytes | 12,439 | 24.3 | 35,128 | 125 |
| Direct: the card's loop in the line's bank | 0 | 0 | 47,567 | about 15 |

- **The `POP` and `PUSH` copy moves `SP` through the blocks.** An NMI
  during it would push its return address into the block being read.
  TEC-OS has no NMI handler, but the keypad can raise an NMI.
- **The direct design** costs about 15 bytes: a flag that makes `SDREAD`
  and `SDWRITE` switch EXPAND 1 in around their block loops, which use only
  registers and `(HL)`. A miss then reads straight into the line, a line is
  written straight from it, and `BLKBUF` carries only write-through
  merges. It is the only one of the four that meets every speed threshold
  below.

## Choice 3: ROM

| | Bytes |
| --- | ---: |
| The cache's code (`cache.asm`) | 591 |
| Its calls from today's code (`BREAD`, `BWRITE`, warm and cold boot, `MOUNT`, the unmount, `BLOCK`) | 35, estimated |
| **The stage, with today's line copy** | **626** |
| With the unrolled copy | 722 |
| With the `POP`/`PUSH` copy | 751 |
| With the direct design, which drops most of `CFILL` and `CEMPTY`'s use | about 640 |
| Free below `FF00h` at `f49e380` | 1,182 |

The 1,201 bytes free at `4ea57f7` became 1,182 with KE-65 and KE-66.
Every variant fits, leaving 431 to 556 bytes. The cache also needs 8 bytes
of workspace: the dirty map, the next line, the write-behind drive and a
failed-write flag. They fit in EXPAND 0's unused top page, so `(0006h)`
doesn't move.

## Choice 4 and the speed gate

The speed gate's cases, in seconds at 4 MHz. Each read case is the second
of two runs of a reader program.

| Case | Today | `mvbl` | `u8` | `sp16` | direct |
| --- | ---: | ---: | ---: | ---: | ---: |
| 16 KiB `SAVE`, write-through | 7.56 | 7.60 | 7.59 | 7.58 | 7.57 |
| 16 KiB `SAVE`, write-behind | — | 3.25 | 2.97 | 2.66 | 2.44 |
| **Ratio, write-through over write-behind (at least 3)** | | **2.34** | **2.56** | **2.85** | **3.10** |
| 12 KiB file read again | 1.70 | 0.32 | 0.32 | 0.32 | 0.32 |
| **Ratio, today over the cache (at least 4)** | | **5.29** | **5.29** | **5.29** | **5.29** |
| 20 KiB file read again | 2.81 | 3.27 | 3.09 | 2.90 | 2.77 |
| **Ratio, the cache over today (at most 1.10)** | | **1.17** | **1.10** | **1.03** | **0.99** |

- **Only the direct design meets all three thresholds,** and its save only
  just (3.10). The brief's "about four times" for saves leaves out what the
  BDOS and the CCP spend per record. With every line copy free, the
  written-behind save is still 2.44 s, of which the 32 block writes are
  1.72 s.
- **The reread gain** comes from the lookup and record copy replacing a
  card read. It is the same with every line copy, because the second run
  misses nothing.
- **The scan** pays a line copy and a lookup on every miss. Only `sp16`
  and the direct design keep within 10 percent; `u8` is at 10 percent.

The development loop, one round in seconds: `EDIT X.ASM` (open, one
character typed, `^S`, `^Q`), then `TAS X`, then `X`. All files are on B:.
The second of two rounds is reported. The source over 15 KiB is 20 KiB, and
`TAS.COM` alone is 24,200 bytes, more than the cache's 15 KiB.

| Round | Today | Write-through, `mvbl` | Write-behind, `mvbl` | Write-through, direct | Write-behind, direct |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 KiB source | 24.18 | 25.34 | 21.51 | 23.82 | 19.38 |
| 20 KiB source | 41.75 | 43.18 | 35.60 | 41.13 | 32.39 |

The direct design's parts, today against write-behind:

| Part | 10 KiB source | 20 KiB source |
| --- | --- | --- |
| Open in `EDIT` | 4.28, 4.24 | 6.68, 6.72 |
| `^S` save | 6.16, 3.15 | 10.85, 4.72 |
| `^Q` | 0.14, 0.10 | 0.14, 0.10 |
| `TAS X` | 13.40, 11.81 | 23.82, 20.76 |
| `X` | 0.19, 0.09 | 0.26, 0.10 |

- **Write-behind saves a fifth of the round:** 20 percent with a 10 KiB
  source and 22 percent with a 20 KiB one, on the direct design. Most of
  that is `EDIT`'s save, which halves, and `TAS`'s output files.
- **Opening the source gains nothing.** `TAS` loads 24 KiB between one
  round's open and the next, so the source has left the cache by then.
- **Write-through with the cache costs about what today does,** a few
  percent either way by line copy: it neither helps nor hurts the loop.

## What the model assumes

- **Card times are the emulator's:** 217,248 T-states for a block read and
  214,907 for a write, averaged over the run. A real card's write busy time
  is longer, which would favour write-behind more.
- **Write-through writes keep today's path exactly,** `BLKBUF` holding its
  block between records as now; only reads lose `BLKBUF` as a key.
- **A read miss is served from `BLKBUF`,** as now, after the line is
  filled. A write-behind miss is filled as a read would be, unless the
  write needs no pre-read.
- **Dirty lines are written** at each directory write of the volume, at
  each warm boot (every program's exit), and when every line is dirty.
- **A hit's lookup is costed at the middle line, and a miss's at all 30.**

## Draft gates: a pass input and a fail input for each

| Gate | Pass input | Fail input |
| --- | --- | --- |
| ROM: the stage at most 700 bytes (626 or about 640, plus a margin) | The build of the brief's design | A build with the `POP`/`PUSH` or unrolled copy as well as the cache, 722 to 751 |
| TPA: `(0006h)` unchanged on the starter card | 8 bytes of state in EXPAND 0's top page | The state below the workspace, moving `(0006h)` down a page |
| Reads: the suite reads the same bytes; a file read twice makes no card read the second time while it fits | `READF R12.DAT` twice: 0 `SDREAD`s the second time | A cache keyed by drive and record instead of card block, which misses after a remount |
| Write-through: card writes as before, block for block, when each `BWRITE` returns | The trace of `SDWRITE`s matching today's for the suite | A build that defers write-through volumes' writes to warm boot |
| Write-behind: `SAVE`, `COPY`, sequential and random writes read back from the cache, and from the card after warm boot | The suite's write tests with B: marked `:wb` | A build that skips the warm-boot write |
| Ordering: no directory entry names a block holding another file's data, at any cut | Cuts after each card write during `ERA` and reuse | A build that writes the directory line before the volume's dirty data lines |
| No pre-read lost | A random write to block N+1 after N was cleared keeps N+1's other records | A build that takes the no-pre-read path for a block that has its own line |
| `BLOCK` on a dirty block returns the line's data | A dirty line read through `BLOCK` | A `BLOCK` that reads the card |
| A card removed with dirty lines | The console works and warm boot says so | A build that loops retrying the write |
| A `:wb` card on the ROM before this stage mounts the volume write-through | `4ea57f7` with byte 15 bit 0 set | A ROM that refuses the flag, as byte 13's unknown bits are refused |
| Stacks: the census with dirty lines written inside `BWRITE` and at warm boot | The census on a `:wb` B: | A line write that calls through the BDOS's stack |
| Speed (thresholds above) | The direct design: 3.10, 5.29, 0.99 | `mvbl`: 2.34 on the save, 1.17 on the scan |
| The full suite, strict, twice | Both runs pass every test | Any failure or skip |

The model runs the speed and ROM rows' inputs. The rest need the build;
their inputs come from the brief's design and the code at `f49e380`.

## Files

- `model.mjs`: runs the model and prints the figures
- `copy.mjs`: choices 1 and 2
- `rom.mjs`: choice 3
- `cache.mjs`: the cache's model over today's ROM
- `loop.mjs`: choice 4 and the speed gate's cases
- `copies.asm`: the unrolled and `POP`/`PUSH` line copies
- `cache.asm`: the cache's code, sketched for its size and its lookup
- `readf.asm`: a program that reads a file through
- `source.mjs`: the loop's program, `X.ASM`, at a given size
- `figures.json`: one run of each line copy

## At the build

KS21 was built with the direct design. `kg25l.mjs` runs KG25 (l) on the
build and on `f49e380`'s ROM (`test/fixtures/rom-f49e380.json`), with no
modelling. `kg25l.json` holds the results:

| Case | Threshold | At the build |
| --- | --- | ---: |
| 16 KiB `SAVE`, write-through over write-behind | at least 2.8 | 3.11 |
| 12 KiB file read again, `f49e380` over the build | at least 4.5 | 5.44 |
| 20 KiB file read again, the build over `f49e380` | at most 1.05 | 1.00 |
| The 10 KiB round on B: written behind, faster than `f49e380` | at least 15 percent | 19.7 percent |
