# Board diagnostics

The diagnostics are a small RAM program that the TEC-1G's own monitor,
MON3, loads and runs. MON3 stays in the ROM socket. The program checks, on a
real board, the hardware that TEC-OS assumes: above all the SD card, then RAM,
the system latch, the clock and the devices TEC-OS looks for. It prints one
line for each check on the serial port, so a board run gives a log that can be
pasted back.

TEC-OS's SD results so far all come from the Debug80 emulator. Its SD model
answers at once, reports a version 2 card by default and never stalls. A real card
answers slowly and differently from card to card, so the SD checks measure how
much of each of TEC-OS's waits a real card uses.

**Emulator results are not board evidence.** `test/diag.test.mjs` runs the
program on the Debug80 model. That proves the program's own logic and its
arithmetic, and that the write test leaves a card as it was. It says nothing
about a board, because the model supplies the answers.

## Building

```bash
npm run diag
```

The build writes `build/diag/`:

| File | What it is |
| --- | --- |
| `DIAG.HEX` | Intel HEX for 4000h, 16-byte records, ending `:00000001FF` |
| `DIAG.BIN` | The same bytes, for 4000h |
| `diag.d8.json` | The symbol map |
| `diag.json` | Version, image ID, SHA-256, size and memory use |

The image ID is the first 8 bytes of the SHA-256 of the image with the ID
itself zero. The header line prints it, so a log names the image that ran.

The sources are in `diag/`. They include TEC-OS's SD driver (`src/sd.asm`)
and its PICO9918 probe (`src/tms.asm`) instead of copying them, so the board
runs exactly the code TEC-OS runs. `tools/diag.mjs` generates
`diag/gen/config.asm` and `diag/gen/fmt.asm`: the serial delays from the same
derivation `tools/build.mjs` uses for TEC-OS, and the container format's
fields from `format/format.json`. It assembles with TAS.

## Memory

| Range | Use |
| --- | --- |
| `0800h–0FFFh` | MON3's stack and RAM, not touched but for the user vectors in the INT check |
| `1000h–1916h` | Variables and buffers: three block buffers and block 0 as SD7 validated it |
| `1917h–1A16h` | The program's own stack, 256 bytes; `START` loads SP with `1A17h` |
| `4000h–6C81h` | Code and tables, 11,394 bytes |

`START` keeps the SP MON3 entered with and prints it in the header line
(`sp=`), then uses its own stack, so the RAM check cannot overwrite a stack
MON3 may have put in free RAM. The build checks that code and tables end
below `8000h`, with a spare byte for the PROTECT check, and that the
variables and stack end below `4000h`.

The program's code and tables are never written. Two checks write
`4000h–7FFFh` on purpose, with PROTECT turned off through MON3 first: the RAM
check, from the first byte after the program (`6C82h`) to `7FFFh`, and PROT,
which writes that first byte and puts it back. The RAM check overwrites three
areas of free RAM, and nothing else:

- `1A17h–3FFFh`, from the end of the stack;
- `6C82h–7FFFh`, from the end of the program;
- `8000h–BFFFh`, in both EXPAND settings.

## Loading and running

Two routes. [board-run.md](board-run.md) is the owner's checklist.

**Intel HEX over the FTDI port.** Connect a terminal at 4800 baud, 8 data
bits, no parity, 2 stop bits. In MON3's main menu choose Intel HEX Load, then
send `DIAG.HEX` from the terminal as a plain text file. MON3 shows `PASS` on
the digits when the load is good. MON3 receives bit by bit, so if the load
fails, set the terminal to wait a few milliseconds after each character or
line and send it again.

**From a FAT32 SD card.** Copy `DIAG.HEX` to the root of a FAT32 card, fit it,
and load it with MON3's Drive Access, Catalog (`Fn-F`). MON3 converts the
HEX file as it loads. The program then asks for the card to test, so the
FAT32 card can be swapped for the TEC-OS card first. This also checks that
TEC-OS's driver starts a card that was changed after power-on.

Either way, start it from MON3's data entry mode with the address at `4000h`
and `GO`. The program waits for `GO` before it sends anything (the LCD's last
row reads `Log on? GO=send`), so the terminal's log can be started first. It
then prints its header and asks for the card to test: `GO` starts, `AD`
returns to MON3. SHAD runs at once after that `GO`, before any SD access; keep
off the keypad until the LCD's second row changes from `Latch bit 0` to
`SD1 MISO idle`, under a second later.

The keys are MON3's: `GO` goes on and `AD` skips or leaves. The one prompt
that writes the card, SD8's, needs `8` then `GO`. On the matrix
keyboard these are Enter and Esc. The LCD shows the check on row 2, its
result on row 3 and the totals of PASS, WARN, FAIL and SKIP on row 4. One
digit shows the check's number in hex: 1–9 for SD1–SD9, A RAM, b PROT, C
SHAD, d CLK, E the devices, F INT. At a prompt all six digits are scanned.
On exit the program sets every latch bit back through MON3's set calls and
returns with `RST 00h`.

## The output

Every check prints one line:

```text
SD3 PASS r1max=2/16 tokmax=412/65536 acmd41=37/256 cmd0=1/10 reads=64 err=0
```

The line is the check's ID, a status, then fields of `key=value`; a few
fields are a bare word, such as `alias`. A count against a bound is
`used/limit`. Other lines start with `# `: notes, prompts and SD8's line for
each block. The first line and the last are:

```text
TEC1G-DIAG 1.0 image=0123456789ABCDEF bytes=11394 sp=087E
SUMMARY pass=17 warn=1 fail=0 skip=1
```

| Status | Meaning |
| --- | --- |
| `PASS` | The board did what TEC-OS relies on |
| `WARN` | It worked, with a figure worth a look, given in the line |
| `FAIL` | It did not; the line says what was read |
| `SKIP` | Not run: skipped by a key, nothing fitted, or an earlier check failed; `reason=` says which |

The header's `sp=` is the stack pointer MON3 started the program with.
Error codes are TEC-OS's own: `SDE*` from `src/sd.asm` (1 no card answered
CMD0, 2 ACMD41 never ready, 3 CMD58, 4 CMD16, 5 an R1 that was not 00h, 6 no
data token, 7 write refused, 8 still busy, 9 SDSC range, 10 a data error
token, 11 a wrong CMD8 echo), and `ME*` from `src/vol.asm` for SD7.

## The SD checks

TEC-OS's driver keeps no counts of its waits. Where a check needs one, the
program repeats the driver's sequence with the driver's own routines
(`SDCMD`, `SPIR`, `SPIW`, `SPIEND`, `SDRBLK`, `SDWBLK`) and counts each wait
against the same bound. The counting loops take about as long a turn as
TEC-OS's. Everything else calls `SDINIT`, `SDREAD` and `SDWRITE` directly.

The SD hardware is the TEC-1G GPIO board with an HW-125 style microSD
module. It has no card-detect line, so a missing card shows only as a card
that does not answer. Its output latch cannot be read back, and the program
never reads port `FDh`'s output bits. The board's DISC ACTIVITY LED should
flash during the SD checks. Which signal drives it has not been checked: the
old diagnostics ROM switched it off with the card deselected, which suggests
it follows `/CS`.

**SD1, the idle line.** With `/CS` high and no clock, MISO (port `FDh` bit 7)
is read 16 times and should be 1. Many HW-125 modules leave their MISO buffer
on, so a deselected card's output may float. A low reading is therefore a
`WARN` with `note=miso-not-idle-high`, not a failure: only SD2 decides whether
the card works.

**SD2, initialisation.** First a counted run along `SDINIT`'s own path, then
`SDINIT` itself, which decides the status. The line gives `err`, `SDINIT`'s
code; `cmd0`, the CMD0 tries of TEC-OS's 10; `cmd8`, CMD8's R1; `r7`, the four
R7 bytes, only after R1 01h; `acmd41`, the ACMD41 tries of TEC-OS's 256;
`ocr`; `type`, SDHC for block addresses or SDSC for byte addresses; and
`counted`, the counted run's code. A version 1 card rejects CMD8: TEC-OS then
goes on to ACMD41 without the R7 check and finds the type from the OCR, and
so does this check. A counted run that fails where `SDINIT` passes is a
`WARN`. With no card, CMD0 is never answered and the line is `FAIL err=1`,
and SD3–SD9 skip with `reason=sd2`.

**SD3, margins.** This is the key result. 64 counted reads of blocks 0–63
give the most polls each wait used against TEC-OS's bound: `r1max` against 16
R1 polls, `tokmax` against 65,536 data-token polls, and SD2's `acmd41` and
`cmd0`. A `WARN` with `over=` names any wait that used more than a quarter of
its bound: such a card works, but closer to TEC-OS's limit than a slower day
or an older card might allow. The write waits are measured in SD8.

**SD4, CSD and CID.** The capacity in blocks from the CSD, and in MiB, then
the maker (`mid`), OEM (`oid`), product name (`pnm`), revision (`prv`) and
serial number (`psn`) from the CID. `class` is the smallest card size as sold
(128 MB to 1 TB, in decimal bytes) that the capacity fits. A card with less
than 90% of its class is a `WARN`: a card sold as 4 GB should show about
3,700–3,815 MiB and `class=4GB`. A size well under the marked one, or a class
above it, points to a fake or relabelled card; the CSD can lie too, which
SD8's probe looks for. The addressing the OCR gave (CCS, SDHC or SDSC) must
agree with the CSD's version, v2 or v1. A mismatch is a `WARN` with
`ccs=mismatch`, and SD8 then skips.

**SD5, reads.** Block 0 is read 16 times and compared with the first copy.
Then blocks 1–7, the container's last block, the middle of the card and its
last block (from SD4) are each read twice and compared. `err` counts failures
and differences, with the last one's block and code. On an SDSC card TEC-OS
refuses blocks from 8,388,608 with `SDERNG`, and the line says how many were
refused.

**SD6, read speed.** With the DS1302 fitted, the program counts block reads
over 5 whole seconds and prints `bps`, bytes a second. Without it, it beeps,
reads 256 blocks and beeps again; time the beeps with a stopwatch, and 131,072
bytes divided by the seconds is the rate.

**SD7, the container.** A read-only check that follows `MOUNT` in
`src/vol.asm` step by step, with its codes
([container-format.md](container-format.md)): the `TECOSVOL` magic, major
version 1, the header and descriptor sizes, the volume count (1–8 in 1.0,
1–127 in 1.1), the header checksum, in 1.1 the drives field and the sum of the
table blocks 1–7, then each descriptor in table order: a nonzero id, known
flags and geometry, the geometry's exact length, a nonzero start that is a
multiple of 8, no overlap with the previous volume, an end that does not wrap
or pass the header's length (or 800000h on SDSC), and a drive letter that is
valid and not used twice. Drive A must be mounted. Two checks go beyond
`MOUNT`: each volume must end within the card (code 2Bh) and its first
directory block must read (2Ch). The line gives the version, volume count,
drives, the header's length, `lastvol`, the highest block a volume uses, and
`free_from`, the first block past everything the container uses.

**SD8, the write test.** TEC-OS writes the card, so this check writes it
too, under one rule: **it addresses only blocks SD7 proved free**, from
`free_from` to the block before the card's last block. It never addresses
blocks 0–7 or any volume's blocks, on any path: every check of blocks 0–7 only
reads them. On a card whose controller wraps or remaps addresses where the
checks below cannot see it, a write to a free block could still land on one
of those blocks. Each block written is put back, and where the checks see
such a landing they report it as an alias; they cannot rule it out.

It writes nothing, and skips with the reason, unless SD2 passed
(`reason=sd2`), SD3 passed or warned (`sd3`), SD5 passed (`sd5`), SD7 passed
(`sd7`), and SD4 gave a size with addressing that agrees with the CSD
(`sd4`; a size-class `WARN` alone does not stop it). It also skips when there
is no free block (`nofree`). Then, before it asks:

1. Block 0 is read twice and must match the header SD7 validated, both
   times. Otherwise SD8 fails with `blk0=unstable`, and nothing is written.
2. A read-only probe reads each power-of-two block from block 8 to the
   card's end, ascending, inside the container too, twice, and compares
   both reads with block 0. A card that ignores its high address bits, as
   fake cards do, reads one of them as block 0, even when it wraps below the
   container's end. If either read matches, SD8 fails with `alias at=<block>
   probe=read-only` and nothing is written; one corrupted read cannot hide
   the wrap. The note allows both causes: the card wraps, or the free area
   holds an old copy of block 0. Two reads that differ are reported as
   `probe-unstable`, and a read that fails as `probe-read`, each with
   nothing written.

Only then does it ask: `8` then `GO` writes, and `AD` or any other key skips.
The blocks, in order, are the first free block, every power of two in the
free range ascending, the middle of the free range, a run of 32 from the
first free block, and the last free block. Pressing `AD` while SD8 runs
stops it at the next block, after the block in hand is put back
(`reason=user-abort`); hold the key until it stops.

For each block the program reads it twice; the two reads must match
(`unstable` otherwise) and must not read as block 0 (`alias`, with the same
note as the probe's). Either stops SD8 before that block is written. If
earlier blocks were written, the note says nothing was written to this
block, and the backup note follows: a free block that reads as block 0 in
mid-run may mean an alias the probe missed, and the earlier writes may have
landed in used blocks, though each was put back. It then writes a pattern
that depends on the block number, reads it back and compares. For every block
but those of the run of 32, it then reads blocks 0–7: a low block that reads
as the pattern just written, on two reads, has been reached by the write.
A low block that does not read is reported as `lowread`, not as an alias.
Whatever happened, it then writes the saved data back with TEC-OS's
`SDWRITE`, reads it and compares, up to three times.

The pattern writes go through the counted copy of `SDWRITE`, which gives
`busymax` against TEC-OS's 65,536 busy polls and `wrsmax` against its 16
data-response polls; more than a quarter of either is a `WARN`. Each block
gets a `# SD8 block` line with the outcome of both stages, the tries and the
busy polls.

SD8 stops at the first alias, failed restore, unstable read or unread low
block, and its line names it: `alias at=<block> low=<blocks>`,
`restore-failed at=<block>`, `lowread` and so on, with `blocks=`, the
blocks written, and `fail=`, which counts each block with any of these. After an alias seen
after a write, or a failed restore, a note says to restore the card from its
backup before using it: the free block, or the low block the write landed
on, may hold the pattern. A reset or power cut during SD8 can leave the
block in hand with the pattern. That block is free unless the card wraps or
remaps in a way the checks did not see, so keep the backup until the run is
over.

**SD9, card removal.** Pull the card when asked and press `GO`. With no
card-detect line, the program sees the card's absence as TEC-OS would: a read
of block 0 fails, normally with `SDECMD` (5) since no R1 comes, and `SDINIT`
fails, normally with `SDENOCD` (1) since CMD0 goes unanswered. On a module
whose MISO floats low the codes can differ, for example `SDEDTOK` (10); any
failure counts. Put the card back and press `GO`:
`SDINIT` and a block 0 read must work, and block 0 must match its copy from
before. A read that works with the card out, or a changed block 0, is a
`WARN`. `AD` at the first question skips the check.

## The other checks

These are cut down from the old diagnostics ROM's tests.

**RAM.** Two passes over each area, each byte written `L xor H` and then its
complement, all read back after all are written, so a missing or shorted
address line shows. The areas are `1A17h–3FFFh` after the variables and the
stack, `6C82h–7FFFh` after the program, and the `8000h–BFFFh` window with
EXPAND (latch bit 2) off and on. Then a tag written in each EXPAND setting must
survive the other: TEC-OS keeps its block cache in EXPAND 1, so the two
settings must select different RAM and both must hold data. PROTECT is off
through MON3 meanwhile; MON3's EXPAND and PROTECT settings are put back. A
failure gives the area, the address and the bytes written and read.

**PROT.** PROTECT (latch bit 1) is set through MON3's `setProtect`, and a
write to the first byte after the program must leave it unchanged. Then it is
cleared and the write must land. The byte and MON3's setting are put back.

**SHAD.** It runs first, before the SD checks. TEC-OS calls latch bit 0
`/SHADOW`: 1 removes the boot overlay, so `0000h–07FFh` is RAM, and 0 shows
the ROM's first 2 KiB there. MON3 calls `01h` "shadow on". With interrupts
off, the program writes the latch directly with bit 0 clear and set,
counting the bytes of `0000h–07FFh` that differ from `C000h–C7FFh` each
time. It then calls MON3's `setShadow(01h)` with the latch as found, so that
call's `RST 10h` runs through RAM, and counts again. It writes the latch back
directly before calling MON3 again, with `setShadow` and MON3's own setting,
so no `RST 10h` runs while the ROM may show at `0000h`, and MON3's copy of the
latch agrees with the latch afterwards.

The line names the convention found, then what each setting gave, `rom` (no
difference) or `ram`, with the count:
`convention=tecos bit0=0:rom(0) bit0=1:ram(1932) mon3on:rom(0)`. `tecos` is
`PASS`. `inverted` (bit 0 clear shows RAM, set the ROM) or `none` (no
difference between them) is a `WARN`: TEC-OS's own boot would not work as
designed, but the other checks go on, using the latch value measured at the
start. Keep off the keypad while it runs: the vectors at `0038h` and `0066h`
are the ROM's while it shows.

**CLK.** The CPU clock, from one second of the DS1302: the number of seconds
reads in the second times their known cost, 1,274 T-states. TEC-OS's 4800-baud
serial and its SD timing assume 4 MHz. Outside 3.92–4.08 MHz is a `WARN`.

**VDP.** The PICO9918 at `BEh`/`BFh`, found with TEC-OS's own probe
(`TMSINIT`: a byte written to VRAM and read back). Then the status register's
frame flag is timed over 8 frames, giving the frame in T-states and the rate
in Hz at the measured clock (or at 4 MHz, `at=4mhz`, without the RTC).

**LCD.** Two DDRAM addresses set through MON3 and read back from the busy
flag's port, `04h`. TEC-OS only writes the LCD; a read-back shows it is there.

**GLCD.** The ST7920 at `07h`: present if its busy flag clears within 256
reads. Nothing is written to it.

**RTC.** The DS1302 on port `FCh`, found as TEC-OS finds it (a seconds byte
below `60h`). The seven time registers and the write-protect byte are read,
not set; a field that is not valid BCD in range is a `WARN`. `ch=1` means the
clock is halted.

**INT.** With the VDP present, MON3's user vectors at `0892h` (IM 1) and
`0894h` (NMI) are pointed at counting handlers, the VDP's frame interrupt is
turned on for about 0.2 s, and both are counted. `PASS` means IM 1
interrupts reach `0892h`. If the frames arrive only as NMIs, as on the Debug80
model, there is no IM 1 source to test, and the line is `SKIP
reason=nmi-only`. The vectors are put back and the VDP's interrupt turned off;
register 1 is left at `C0h`. TEC-OS itself never enables the VDP interrupt.

**KEYS.** Each keypad key pressed prints its MON3 code, and each matrix key
going down prints its row, bit and code (row × 8 + bit, the row selected by a
low address line on `A8–A15` at port `FEh`). `AD` ends it.

## What it cannot check

The program runs under MON3, so it cannot check TEC-OS's own power-on boot:
the reset overlay entry, the ROM's cold boot, the mount and the console with
the TEC-OS ROM fitted. That stays part of the owner's smoke test with the
TEC-OS ROM in the socket.

Other limits:

- The counted SD routines are copies of the driver's sequences, not the
  driver itself, though they call its primitives. The busy and data-response
  margins come from SD8's pattern writes only.
- SD8 never addresses blocks 0–7 or a volume block, but it cannot stop a
  card's controller from sending a write there. Its alias checks look for a
  card that wraps onto block 0 at a power of two (the probe, from block 8),
  a free block that reads as block 0, and a write that lands on blocks 0–7
  (for every block but the run of 32). A wrap at another boundary, or a
  remap onto a volume block other than block 0, is not seen; such a write is
  still put back.
- `SDREAD` does not check the CRC bytes, so a corrupted read can look good.
  SD5 and SD8's double reads make one less likely to pass unseen.
- The PICO9918's display output, the 8 × 8 LED matrix, the speaker and the
  status LED bar are not checked.

## Hardware facts kept from the old ROM

The old 16 KiB diagnostics ROM, which replaced MON3 in the socket, is
retired. Some of what it recorded still matters:

- Port `03h` bit 6 (KDA, a keypad key down): the TEC-1G port list reads 0 as
  down, while the functional description says the 74C923 drives KDA high.
  TEC-OS reads that bit once at cold boot for the startup file's skip. Which
  is true on the board is still open.
- The latch is write-only on the board; Debug80 lets it be read. TEC-OS
  never reads it, and neither does this program.
- The board's documents select the ROM, not the RAM, for writes to
  `0000h–07FFh` while the overlay shows; Debug80 sends them to RAM. TEC-OS
  never writes there with the overlay on, and neither does this program.
- Debug80 decodes latch bits 3–6 as a bank field for the window; the
  documented board leaves them unconnected. TEC-OS and this program change
  only bit 2 there.

## The emulator test

`test/diag.test.mjs` runs the program on the Debug80 TEC-1G model with a
stub monitor, `test/programs/mon3stub.asm`, at `C000h`. The stub implements
only the calls the program uses: the LCD calls, `scanKeys` and its wait,
`scanSegments`, `timeDelay`, `beep`, the latch get and set calls on a latch
copy written to port `FFh`, and the IM 1 and NMI dispatch through `0892h` and
`0894h`. Its `setShadow(01h)` clears bit 0, which the MON3 manual does not
state. Keys come from a script. The model's CSD is fixed at 16 MiB, so the
test gives each card a CSD that matches its image.

Every case that reaches SD8 asserts that no write addressed blocks 0–7 or the
container or past the block before the card's last, that no write landed
outside that range (the sparse card images record the block each write lands
on), except where a case expects it, and that blocks 0–7 and every volume
block are byte-identical afterwards. The cases:

- a starter-layout card passes every check, with INT skipped because the
  model delivers frame interrupts as NMIs; SD8 writes in the stated order,
  and the card is byte-identical afterwards;
- an SDSC card, byte-addressed, with a v1 CSD;
- a 4 GB card, as a sparse image, reads and writes blocks above `400000h`;
- a fake card that claims 2^23 blocks and wraps at 2^22, where the old
  order's middle block would have landed in the WORK volume, a card that
  wraps at 1 GiB, and the starter container on a card that claims 22,528
  blocks and wraps at 16,384, below the container's end: the probe catches
  all three with nothing written;
- a card that sends the first free block to block 3: both its writes land on
  block 3, the 0–7 reads see the pattern, SD8 fails as an alias and the
  block's restore puts block 3 back;
- SD7 rejecting a bad version, a bad volume count, a bad header checksum,
  unknown descriptor flags, a 1.1 drives field above 4, a drive assigned
  twice, overlapping volumes, a volume past the card's end and a card
  without a container, each with SD8 skipped and nothing written;
- a refused pattern write, a restore that fails three times, and a corrupted
  read of block 0 before SD8 writes, each reported as it happened;
- the `sd3`, `sd5` and `sd4` (`ccs=mismatch`) skips, `nofree`, a target
  that reads two ways, a copy of block 0 in free space (at the probe, at the
  first target and in mid-run, after four blocks were written), an unread
  low block (`lowread`, counted in `fail=`), a probe read that fails, two
  probe reads that differ, and one corrupted probe read on a card that wraps
  below the container's end;
- a 1.1 card of 20 volumes, with a table block;
- `AD` between blocks, any answer but `8` then `GO`, no card, and a board
  without an RTC.

The test sets `QUICK` in the loaded image to shorten SD6.
