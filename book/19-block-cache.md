# 19. The block cache

Checked against TEC-OS 98c6416, with the starter card's `EDIT.COM` from
Edit 845d062, whose copy on the card has the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`; the
timings and traces below were made on that card.

Reading a block from the SD card takes TEC-OS about 55 milliseconds, because
every bit of it passes through a port one at a time, as Chapter 18 describes.
A CP/M program reads the same blocks again and again, the directory above
all, and the block cache keeps the blocks it has read in EXPAND 1 so that a
second read of one is a copy in memory. The same cache holds the writes to
one volume, the volume written behind, and writes them to the card in
batches. This chapter describes the cache's lines and their table, the path
of a read, the two ways a write goes, the order and the times of a flush,
what `Write lost` reports, and why every BIOS disk call runs with interrupts
off.

## Thirty lines

The cache is 30 lines of 512 bytes, one card block each, at `8000h–BBFFh` in
EXPAND 1 (`src/cache.asm:1-8`, `src/layout.asm:24-26`). Line n is at
`8000h` + n × `200h`, which `CLADR` works out by doubling n and adding `80h`
to give the high byte (`src/cache.asm:131-136`). Its table is the next page.
From `CTAB`, `BC00h`, each line has four bytes holding the number of the card
block it holds, `FFFFFFFFh` while it is empty; from `CDIRTY`, `BC80h`, each
line has a byte that is nonzero while the line holds changes the card lacks.
Every line starts empty and clean, since cold boot clears EXPAND 1 and marks
each line empty, as Chapter 14 describes.

The lines are keyed by the block's number on the card, `SDLBA`, and not by
drive and block within the volume. A block has one number whichever drive
reaches it, so it can be in at most one line.

All of the cache is in EXPAND 1 and all of its state outside the table is
in the workspace above the RAM BIOS table, at fixed addresses: `CNEXT`, the
next line to give out; `CFAIL`, set when a line's write has failed since the
last warm boot; `CSKIP`, the line a flush leaves alone; `CWTYPE`, the write
type of the current BIOS `WRITE`; and `CIFF`, the interrupt state at the
current BIOS call's entry (`src/ram.asm:196-201`). To read or write the table, a routine
takes from `CXON` the latch value with `LATEXP` added to `LATCHV`, writes it
to the latch, reads or writes the bytes with no `PUSH`, `POP` or `CALL` in
between, and writes `LATCHV` back to the latch (`src/cache.asm:36-44`).
Chapter 13 explains why no stack may be used while EXPAND 1 is in view.

## Reads through the cache

Every volume's reads go through the cache. BIOS `READ` maps the record to a
card block and a quarter of it, and calls `CREAD` (`src/bios.asm:179-184`,
`src/cache.asm:271-281`). `CLOOK` compares `SDLBA` with each line's block
number in turn, from line 0 (`src/cache.asm:46-85`). On a hit, `CRDREC`
copies the record's 128 bytes from the line to the DMA address. On a miss,
`CTAKE` gives out a line, `CFILL` reads the card block straight into it, and
then the record is copied from the line. The block goes from the card into
EXPAND 1 with no copy through `BLKBUF`: `CFILL` sets `SDXB` to `LATEXP` for
the call, and `SDREAD`'s byte loop puts EXPAND 1 in view while it fills the
buffer (`src/cache.asm:138-158`, `src/sd.asm:258-262`). A failed read leaves
the line empty.

`CTAKE` gives out lines in turn (`src/cache.asm:214-248`). It starts at
`CNEXT` and takes the first clean line from there on, wrapping
from line 29 to line 0, and sets `CNEXT` to the line after the one it took.
A clean line can be given out at any time, since the card has the same
bytes, and a dirty line is passed over. When every line is dirty, `CTAKE`
writes the line at `CNEXT` to the card first and takes that one. The order is
round-robin, not least-recently-used: a block that is read often is still
given up when its turn comes, and read again from the card at its next use.

On the model, with the starter card, a read that hits takes 13,616
T-states when the record goes to the directory buffer `DIRBUF` at `BBD0h`,
and a read that misses takes 235,309, nearly all of it the card. `CLOOK`
takes 259 T-states when the block is in line 0 and about 2,000 to search all
30. The copy is the larger part of a hit. `CRDREC` and `CWRREC` use `MVCOPY`,
the routine behind `XMOVE` and `MOVE` (`src/cache.asm:250-269`), and a copy
between EXPAND 1 and an address in EXPAND 0, such as `DIRBUF`, goes a byte at
a time with the latch switched between each read and its write; a DMA
address below `8000h`, in MAIN, is copied with one `LDIR` while EXPAND 1 is
in view (`src/xmove.asm:21-26`). A hit to a DMA address below `8000h`, such as
the CCP's loads at `0100h` and up, takes from 5,763 T-states, and a miss
226,419.

`DIR` on the starter card's drive A shows the effect. After the first prompt
the directory's blocks are in the cache, and `DIR`'s three BIOS reads are all
hits.

## Writes through

A volume whose descriptor does not have the written-behind flag is written
through: a BIOS `WRITE` returns only after the card has the block. Its path
is in `bios.asm`, and Chapter 18 describes it: the block is read into the
deblocking buffer `BLKBUF` unless that holds it already or the write needs no
read, the record is merged, and `SDWRITE` writes `BLKBUF` to the card. The
read into `BLKBUF`, when there is one, comes from the card, not from the
cache (`src/bios.asm:127-164`).

The cache is kept up to date after such a write. `CREFR` looks the block up, and if
a line holds it copies the 512 bytes of `BLKBUF` over the line, so that a
later read cannot return the old contents (`src/bios.asm:298`,
`src/cache.asm:357-368`). A block not in the cache is not added to it. If the
card write fails, the block's line is dropped, since neither it nor
`BLKBUF` can be known to match the card (`src/bios.asm:291-297`). A written
through volume's lines are therefore always clean.

## Writes behind

A volume is written behind when its descriptor has bit 0 of its cache byte,
byte 15, set. `tecvol` sets the bit on one volume at most, and the ROM writes
behind any volume that has it. `MNFILL` copies that bit into bit 1 of the
drive's flags in the drive table (`src/vol.asm:346-350`), and BIOS `WRITE`,
after its checks, sends a write on that drive to `CWRBH` in place of the
written-through path (`src/bios.asm:277-281`). On the starter card the volume
is `WORK` on drive B.

`CWRBH` puts the record into the block's line and marks the line dirty
(`src/cache.asm:283-345`). If no line holds the block, `CTAKE` gives one out.
Then there are two cases, decided by the same rule `WRITE` uses for
`BLKBUF`: whether the block holds anything the card's copy has to supply. If
it might, the line is filled from the card first, unless it already held the
block. If it can't, because the write is CP/M's type 2, the first to a newly
allocated block, or the next block of an allocation block whose first block
was handled that way, the line is cleared to zeros instead, with no read, and
`BLKBUF`'s key is set to record that block as cleared, so that the rule holds
for the block after it (`src/cache.asm:298-316`). The record's 128 bytes are
copied from the DMA address into the line with `CWRREC`, and `CDSET` marks the
line dirty.

A data write ends there and returns success with the card unchanged. A write
of type 1, a directory write, goes on (`src/cache.asm:333-345`). `CFLUSH`
writes every dirty line except the directory's, and then `CWRITE` writes the
directory's line. The data reaches the card before the directory block that
names it, so the card's directory never lists a block whose contents are not
yet on the card. If either step fails, the directory's line is dropped,
leaving the card's directory as the copy that is read next time, and the
write reports the error to the BDOS.

The BDOS writes the directory when a file is created, when it is closed and
when a file's extent fills, so on a volume written behind the card is
brought up to date at those points. A trace of `SAVE 8 X.COM` on drive B, after `B:`, shows
the writes that reach the card, by card block: the directory's first block,
4,096, when the file is created; then nothing while the four data blocks go
into the cache; then at the close, 4,131, 4,128, 4,129 and 4,130, the data in
the order of their lines, and 4,096 again. The trace was taken on the host
model by recording `SDLBA` at each call of `SDWRITE`. Six card writes do
what eighteen do on drive A, which is written through (Chapter 18). A larger
file fills the lines: in `SAVE 160 Z.COM` on B, 80 blocks, `CTAKE` writes
three of the first 32 data blocks early, because all 30 lines are dirty
before the BDOS next writes the directory.

## The order of a flush

`CFLUSH` and `CFLALL` write dirty lines in line order, from line 0 to line
29; `CFLUSH` leaves out the line in `CSKIP`, and `CFLALL` sets `CSKIP` to
`FFh`, which is no line (`src/cache.asm:197-212`). Line order is not block
order, since `CTAKE` gives lines out in turn, so the blocks of a file can
reach the card in any order. A directory line is never left dirty: a
directory write is written to the card at once, after the data
(`src/cache.asm:283-286`). A flush at any other time writes only data, and a
directory write's flush that a power cut interrupts leaves some of the new
data blocks on the card and the directory block not yet written, so no entry
on the card names a block that was missed (`docs/recovery.md` describes what
the user sees).

`CWRITE` writes one line (`src/cache.asm:138-195`). It takes the block number
from the table, sets `SDXB` so that `SDWRITE` reads its 512 bytes straight
from the line in EXPAND 1, and on success marks the line clean. On a failure
it sets `CFAIL` and leaves the line dirty, and the flush stops: `CFLUSH` and
`CFLALL` return at the first line that fails, and the lines after it stay
dirty for the next flush (`src/cache.asm:197-207`). A flush has four
occasions:

- a directory write on the volume written behind, as above;
- `CTAKE` with every line dirty, which writes one line;
- every warm boot, whose `CWBOOT` calls `CFLALL` (`src/boot.asm:79`,
  `src/cache.asm:347-355`);
- every call of the mount service that mounts or unmounts a drive, whose
  `VFLUSH` calls `CFLALL` before any drive changes, and fails if it fails
  (`src/vol.asm:678-690`).

The warm boot's flush is the one you can cause: a `^C` at the prompt is
a warm boot, and after it every change is on the card. A reset writes
nothing, since cold boot clears EXPAND 1 (`src/boot.asm:149-155`), and the
changes in the cache at the time of a reset are lost.

## Write lost

`CWBOOT` writes every dirty line and then tests `CFAIL`. If a line's write
has failed since the last warm boot, including the flush it has just made,
it clears `CFAIL` and prints `Write lost` on its own line
(`src/cache.asm:347-355`, `src/data3.asm:109`). The failed lines are still
dirty and still hold their data, so each warm boot writes them again, and
prints the message again while the write still fails. A card taken out while
TEC-OS runs gives that: every write fails, the message comes at each `^C`,
and the data that is only in the cache is lost when the board is reset or
turned off. While dirty lines stay dirty, fewer lines are free for reads, and
once all 30 are dirty every `CTAKE` starts with a write.

## Interrupts held off

The cache's routines put EXPAND 1 in view many times in each BIOS call, and
while it is in view the `8000h–BFFFh` window holds the cache, not the
workspace and the stacks. An interrupt taken then would push its return
address into EXPAND 1 and run its handler with the wrong memory in the
window. So the BIOS's `READ` and `WRITE` run with interrupts off from start to
end (`src/cache.asm:10-13`).

`CDI` at each entry reads the interrupt state with `LD A,I`, which copies the
interrupt flip-flop into the P/V flag, turns interrupts off with `DI`, and
saves the flags in `CIFF` (`src/cache.asm:17-24`). `BRET` at each exit turns
the result's Z flag into `A`, 0 for success and 1 for an error, and `CEI`
turns interrupts on again only if `CIFF` shows they were on at entry
(`src/cache.asm:25-34`, `src/bios.asm:181-184`, `src/bios.asm:195-199`). A
call made with interrupts off returns with them off. The mount service's
`VFLUSH` uses the same pair around its flush (`src/vol.asm:681-690`), and
`MVCOPY` and the history's routines keep their own copy of the state in the
same way (`src/xmove.asm:40-42`, `src/history.asm:25-27`).

For a program that uses interrupts, a BIOS disk call holds them off for its
whole length. A read that misses holds them off for about 235,000 T-states,
59 milliseconds, and a directory write on the volume written behind holds
them off while every dirty line is written: on the model the close of a file
of four blocks took 1,111,250 T-states, and a flush of all 30 lines takes
about 30 × 217,411, some 6.5 million T-states, or 1.6 seconds. Interrupts
are on only when a program has enabled them, as Chapter 14 describes, so this
affects only such a program.
