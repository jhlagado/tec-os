# 24. Diagnostics

Checked against TEC-OS 98c6416. The diagnostics ROM in this chapter is version
0.2, image `D90143609F53FAAB`, as `npm run diag` builds it from that commit.

Two parts of the repository report what is wrong with a board. The TEC-OS ROM
itself stops at a diagnostic prompt when cold boot can't mount the card. The
diagnostics ROM, built from `diag/`, is a separate image that tests each part
of the board TEC-OS uses and prints a report. Chapter 1 shows the prompt from
the user's side, Chapter 18 the container's checks and a header read with `H`,
and Appendix D every error code with its remedy.

## The diagnostic prompt

Cold boot sets up the LCD and the card at `COLDRT` (`src/boot.asm:34`). It
starts the card with `SDINIT` and checks the container with `MOUNT`, and a
failure of either jumps to `DIAG` with an error code in `A`
(`src/boot.asm:37-40`): one of the SD card driver's codes, `01h` to `08h`, or
one of the container's, `20h` to `2Ah`. The banner is printed before the card
is touched (`src/boot.asm:29-31`), so it appears whatever the card holds.

`DIAG` resets the stack to the BIOS's, since a mount that failed part way may
have left it deep, and keeps the code on it (`src/diag.asm:5-6`). It writes
`CARD?` on the LCD's last row (`src/diag.asm:7-8`, `src/data3.asm:103`,
`src/lcd.asm:43`), then prints `No volume mounted, error ` and the code as two
hexadecimal digits (`src/diag.asm:9-13`, `src/data3.asm:4`).

At the prompt `R retry, H header> ` (`src/data3.asm:5`), `DIAG` reads one key
with `BCONIN`, turns a small letter into a capital, echoes it and ends the
line (`src/diag.asm:14-21`). Any key but `R` or `H` gives the prompt again.
The console at this point is always the serial terminal: cold boot starts it
there, and no display driver has been installed, since the startup file is on
the card. On a board with no terminal attached, the LCD's `CARD?` is the only
sign.

`H` prints the first 64 bytes of `BLKBUF`, the 512-byte buffer that holds the
last block read from the card, in four rows of 16 (`src/diag.asm:26-46`,
`src/ram.asm:20`). For a container that fails its checks that block is usually
block 0, the header, as in Chapter 18's example. With no card, or a card that
fails before block 0 is read, the buffer holds what cold boot cleared it to,
all zeros, as Chapter 1 shows.

`R` jumps back to `COLDRT` (`src/diag.asm:22-23`). That starts the LCD again,
which clears `CARD?`, and then repeats the card's start and the mount. A card
fixed or put in while the prompt waits is therefore mounted without a reset.
The retry keeps a selection of volumes carried over from a recognised reset:
`RSLCAP` copies the drive table to `RSLBUF` before cold boot clears anything,
and nothing writes `RSLBUF` before `MEMINIT`, which runs only after a mount
has succeeded (`src/boot.asm:14`, `src/boot.asm:54`, `src/boot.asm:91-92`).
Chapter 14 explains that reset.

## The diagnostics ROM

The diagnostics ROM is a second 16 KiB image for `C000h–FFFFh`, made to be
burned in place of TEC-OS. Its subject is the board, and it needs no card, no
console driver and no TEC-OS. One command builds it:

```sh
npm run diag
```

```text
diag: ROM 16318/16384 bytes, 56 free, image D90143609F53FAAB, checksum $47C0
```

`tools/diag.mjs` generates `diag/gen/config.asm`, with the version, the serial
delay counts and the stopwatch constants, and `diag/gen/font.asm` from
`format/font5x7.txt`, the same font file TEC-OS's display drivers use
(`tools/diag.mjs:51-77`). The serial delays are worked out from 4 MHz and 4800
baud as for TEC-OS (`tools/diag.mjs:37-49`). It assembles `diag/diag.asm` with
ATOM, fills the unused bytes with `FFh`, and writes `build/diag/diag.rom`, its
symbol map and `build/diag/diag.json` (`tools/diag.mjs:90-133`).

Two values in the image identify it. The image ID is the first 8 bytes of the
SHA-256 of the image with its last 10 bytes, `FFF6h–FFFFh`, set to `FFh`; the
build stores it at `FFF6h` (`tools/diag.mjs:25-28`, `tools/diag.mjs:83-88`,
`tools/diag.mjs:115`). The last two bytes, at `FFFEh`, hold the 16-bit sum of
`C000h–FFFDh` (`tools/diag.mjs:116-119`). The banner and the report both print
the ID, so a report names the image that produced it, and test T05 checks the
sum on the board. Before writing the image the build checks that the reset
entry is at `C000h`, the interrupt entries at `C038h` and `C066h`, and that
cold boot and the first RAM check lie in the first 2 KiB, which is all the
board shows at `0000h` after a reset (`tools/diag.mjs:104-108`).

The ROM starts as TEC-OS does. At reset the board's boot overlay shows the
first 2 KiB of the ROM at `0000h`, and the code there jumps to `COLD` at its
`C000h` address and turns the overlay off (`diag/boot.asm:8-27`). It puts a
`RETN` at `0066h` before anything else, so that an NMI returns at once, and
turns off the digits, the speaker, the 8 × 8 LEDs and the SD card
(`diag/boot.asm:29-40`).

The ROM's own variables are at `7E00h–7EFFh` and its stack at `7F00h–7FFFh`,
in the fixed RAM (`diag/defs.asm:43-44`). Every later test depends on that
page, so test T01 checks it first, with no stack, using registers alone: four
passes that fill the page with a pattern from each address and read it back
(`diag/boot.asm:43-73`). On a failure the ROM sends one line to the serial
port, again without a stack: `T01 HOME    FAIL  RAM 7E00-7FFF at `, the
failing address in four hexadecimal digits, ` wrote ` and the byte written, `
read ` and the byte read, from the pattern `HCTEXT` (`diag/boot.asm:127-128`).
The ROM then waits and sends the line again, for ever
(`diag/boot.asm:118-125`). The wait is 16 passes of a 65,536-pass loop of 26
T-states, 27,262,976 T-states in all, about 6.8 seconds at 4 MHz, so on a
board the line comes back about every 7 seconds.

## The run

With its page proved, the ROM clears its variables, installs an NMI handler at
`0066h` that counts NMIs, reads the Matrix switch, and prints its banner
(`diag/main.asm:4-28`). It then waits about 5 seconds for a key
(`diag/main.asm:29-35`). `GETKEY` takes a key from the serial port, from the
hex keypad, or from the matrix keyboard when the Matrix switch is on, with a
time-out counted in half seconds (`diag/out.asm:240-275`). On the keypad `+`
reads as `Y`, `-` as `N`, `GO` as Return and `AD` as Esc (`diag/out.asm:326`).
`I` or `Y` chooses the interactive tests as well as the automatic ones;
anything else, or nothing, runs the automatic tests alone.

`tools/diag-check.mjs` runs the ROM on the host model with the PICO9918, the
matrix keyboard, a new card with the starter card's two volumes, empty, and no
DS1302 clock, and keeps what the serial port printed in `build/diag` beside
the image (`tools/diag-check.mjs:110-134`). One Node.js command makes that run
on its own:

```sh
node --input-type=module -e '
import { modelReport } from "./tools/diag-check.mjs";
modelReport("build/diag/diag.rom");
'
```

Its file, `build/diag/model-report-D90143609F53FAAB.txt`, starts like this:

```text


TEC-1G diagnostics 0.2 image D90143609F53FAAB
RAM 7E00-7FFF (variables and stack) passed.
Press I, Y or keypad + within 5 s to include the interactive tests.
Automatic tests only.
RAM tests take about 6 s. Keep off the keypad: its NMI would
land in the RAM under test.

-- T01 RAM 7E00h-7FFFh, before any stack use
T01 HOME    PASS  4 passes, registers only

-- T02 Fixed RAM 0000h-7DFFh, 4 pattern passes
T02 RAMLO   PASS  all bits both ways, no aliasing
```

Each test starts with `TBEGIN`, which prints `-- T`, the test's number and its
title, and shows the number and its seven-character name on the LCD's second
row (`diag/out.asm:634-657`). Each ends with one result line from `RESULT`:
`T`, the number, the name, one of six results and the details
(`diag/out.asm:659-711`). While a result line is printed, every character is
also kept in the report buffer at `1000h` (`diag/out.asm:48-62`,
`diag/defs.asm:41`), and the LCD's third row shows the result and its fourth
the running totals (`diag/out.asm:592-615`).

The six results are these (`diag/defs.asm:49-56`, `diag/out.asm:706-711`):

| Result | Meaning |
| --- | --- |
| `PASS` | The board did what the test checks |
| `FAIL` | It didn't; the line gives what was expected and what was read |
| `INFO` | A value measured, with no verdict |
| `SKIP` | The test wasn't run |
| `LOOK` | A check by eye or ear in an automatic run, for the person at the board |
| `NONE` | The device isn't fitted or doesn't answer |

## The tests

The automatic tests run in the order `diag/main.asm:56-87` calls them, which
is not the order of their numbers: T35 and T36 follow T18, and T37 follows
T20. The RAM tests T02 to T04 run before T01's line is printed, and their
lines come after it. The interactive tests run after T26 when they were chosen
at the start, or later from the report's prompt (`diag/main.asm:88-119`). Each
test's title is the text its `TBEGIN` prints:

| Test | Name | Title |
| --- | --- | --- |
| T01 | `HOME` | RAM 7E00h-7FFFh, before any stack use |
| T02 | `RAMLO` | Fixed RAM 0000h-7DFFh, 4 pattern passes |
| T03 | `RAMWIN` | Window RAM 8000h-BFFFh, EXPAND off, 4 passes |
| T04 | `RAMHOME` | RAM 7E00h-7FFFh again, 4 passes, stack in the window |
| T05 | `ROMSUM` | ROM C000h-FFFDh sums to the word at FFFEh |
| T06 | `ROMWR` | Writes to ROM are ignored |
| T07 | `OVERLAY` | Latch bit 0: ROM C000h-C7FFh appears at 0000h-07FFh |
| T08 | `OVLWR` | A write to 07FFh with the overlay on |
| T09 | `PROTECT` | Latch bit 1: 4000h-7FFFh read-only, 3FFFh writable |
| T10 | `LATCHRD` | Reading port FFh after writing it |
| T11 | `STATUS` | Port 03h for latch values 01h, 03h, 05h, 81h |
| T12 | `BANKS` | What each bank field value (latch bits 3-6) selects |
| T13 | `BANKRAM` | Each distinct bank, 8000h-BFFFh, 2 passes |
| T14 | `SERTX` | Serial TX at 4800 8N2: two known lines follow |
| T15 | `LCD` | HD44780 at 04h/84h: busy flag, DDRAM read-back |
| T16 | `GLCD` | ST7920 at 07h/87h: busy flag, graphics RAM read-back |
| T17 | `VDP` | PICO9918 at BEh/BFh: VRAM size, speed, 80 columns |
| T18 | `VDPCLK` | PICO9918 frame flag as a clock: 16 frames |
| T35 | `VDPPAGE` | PICO9918 page select: R2 07h and 0Bh |
| T36 | `F18A` | F18A identity, version and vertical scroll |
| T19 | `SD` | SD card on FDh: initialise, CSD, CID, block 0 |
| T20 | `SDBLKS` | Blocks 0-63: errors and token waits |
| T37 | `SDWRITE` | SD write on block 7, outside every volume, then restored |
| T21 | `RTC` | DS1302 on FCh (optional): time, ticking, clock check |
| T22 | `SEG7` | 7-segment: each segment, then each digit |
| T23 | `SPEAKER` | Speaker: 600, 1200 and 2400 Hz for 0.3 s each |
| T24 | `RGB8X8` | 8 x 8 matrix on 05h/06h/F8h/F9h |
| T25 | `LEDBAR` | Latch FFh on the STATUS LED bar and the CAPS lamp |
| T26 | `NMI` | NMIs during the automatic tests (none expected) |
| T27 | `SERRX` | Serial RX: typed characters come back |
| T28 | `SERBIT` | The terminal's bit time from typed U |
| T29 | `KEYPAD` | Hex keypad on 00h: every key and Shift |
| T30 | `KEYNMI` | NMIs taken for those keypad presses |
| T31 | `MATRIX` | Matrix keyboard on FEh: row and bit of each key |
| T32 | `JOY` | Joystick on FEh with A11 low |
| T33 | `CLOCK` | CPU clock by stopwatch, about 60 s |
| T34 | `SDTIME` | SD read rate by stopwatch: 256 blocks, 128 KiB |

The tests use TEC-OS's own ways of reaching the hardware where TEC-OS has
them. The serial output is bit-banged as TEC-OS's is (`diag/out.asm:1-5`).
T19's card start is TEC-OS's SD driver, recording each answer the card gives
(`diag/sd.asm:1-2`). T17 detects the PICO9918 as TEC-OS does and sets the
registers of TEC-OS's 80-column console, and T35 checks the page flip that
console uses (`diag/display.asm:334`, `diag/display.asm:353`,
`diag/display.asm:751`). The others measure what TEC-OS requires of the board:
T03 the RAM in socket U9 that holds EXPAND 0, T12 and T13 the bank behind
EXPAND 1, T07 the boot overlay that cold boot starts through, T11 the bits of
port `03h`. Only T37 writes to the card. It writes block 7, and only on a card
whose block 0 holds `TECOSVOL` (`diag/sd.asm:619-631`). No volume can use that
block, since every volume starts at a nonzero multiple of 8 blocks, and T37
puts it back afterwards.

## The report

After the last test, `PRREP` prints the report: a heading, a line with the
version and the image ID, every result line kept in the buffer, the totals,
and an end line (`diag/out.asm:737-789`). The ROM then prints `R prints the
report again; I runs the interactive tests.` and waits for one of those keys
(`diag/main.asm:91-106`). The model's run, from the same file, ends with this
report:

```text
==== TEC-1G DIAGNOSTICS REPORT ====
ROM diag 0.2 image D90143609F53FAAB, 4800 8N2, times in T-states (4 MHz nominal), error counts expect 0
T01 HOME    PASS  4 passes, registers only
T02 RAMLO   PASS  all bits both ways, no aliasing
T03 RAMWIN  PASS  all bits both ways, no aliasing
T04 RAMHOME PASS  all bits both ways, no aliasing
T05 ROMSUM  PASS  sum 47C0 stored 47C0
T06 ROMWR   PASS  wrote 5A at CDB4, expect A5, read A5
T07 OVERLAY PASS  07FF read CD (ROM C7FF CD), 0800 read AB (RAM, expect AB)
T08 OVLWR   INFO  reaches the RAM underneath; read under overlay CD
T09 PROTECT PASS  wrote A5 over 5A, expect 5A 5A A5: 4000 5A 7DFF 5A 3FFF A5
T10 LATCHRD INFO  01>01 05>05 0D>0D 81>81 reads back
T11 STATUS  INFO  01>C1 03>C3 05>C5 81>C1 (bit 7 RX, 6 KDA)
T12 BANKS   INFO  field 0-F: 0122446688AACCEE (B base, - none); 9 banks + base
T13 BANKRAM PASS  9 banks pass
T14 SERTX   LOOK  TX bit 833 T, stop bits 1691 T
T15 LCD     PASS  read-back errors 0/20, clear busy 128 polls x 50 T
T16 GLCD    LOOK  read-back errors 0/1024, clear busy 127 polls x 50 T, pattern drawn
T17 VDP     LOOK  tags 11 22 33 44 (11 22 33 44 = 16K); errors at 16 T/byte 0, at 104 T/byte 0 (of 16384, then 1920)
T18 VDPCLK  INFO  frame 79999 T; CPU at 50 Hz 3999950 Hz, at 60 Hz 4799940 Hz
T35 VDPPAGE LOOK  R2 0Bh for page 2000h, 07h for 1000h; left at 07h
T36 F18A    INFO  not F18A-compatible: SR1 read 00 (F18A E0h-EFh), locked 80
T19 SD      PASS  v2 SDHC/XC, CMD0 x1, R7 00 00 01 AA, ACMD41 x2, OCR C0 00 00 00, block 0 ends 0000, token polls 0
T20 SDBLKS  PASS  block 0 twice same; 64 blocks, errors 0, token polls min 0 max 0 (x678 T)
T37 SDWRITE PASS  pattern read back, block restored; busy polls 1
T21 RTC     NONE  no DS1302 (read FF)
T22 SEG7    LOOK  segment bits a01 b08 c20 d80 e40 f02 g04 dp10 on port 02h
T23 SPEAKER LOOK  port 01h bit 7
T24 RGB8X8  LOOK  rows on 05h, red 06h, green F8h, blue F9h
T25 LEDBAR  LOOK  01 03 05 09 11 21 41 81 00 01
T26 NMI     PASS  0 taken through 0066h
TOTAL PASS 14 FAIL 0 INFO 6 SKIP 0 LOOK 8 NONE 1
==== END ====
```

These are the model's answers, and they show what the model does, not what a
board does. On several lines the model's result says nothing about a board.
T08 says a write under the overlay reaches the RAM underneath; T10 that port
`FFh` reads back what was written to it; T12 that the latch's bits 3 to 6
select nine banks. `docs/diagnostics.md` compares each test with the TEC-1G's
own documents, which describe the latch as write-only and bits 3 to 6 as
unconnected to U9, so a board can be expected to answer T10 and T12
differently. TEC-OS uses neither: it keeps a copy of the latch at `0040h` and
never reads port `FFh`, and it selects EXPAND 1 with bit 2 alone
(`src/layout.asm:13`, `src/layout.asm:18`, `src/layout.asm:37`).

## Running it on a board

`docs/board-run.md` lists the board's settings for a run. They are the ones
TEC-OS needs:

1. Burn `diag.rom` into both halves of a 32 KiB ROM chip, at `0000h` and
   `4000h`, so that the ROM Lo/Hi switch runs it in either position, and fit
   it in place of MON-3.
2. Fit a 32 KiB RAM in U9, as TEC-OS needs. Without it T03 fails, and the
   tests of EXPAND 1 have no RAM to test.
3. Set the CPU clock switch to FAST with the 4 MHz oscillator, and the Matrix
   switch on if the matrix keyboard is fitted.
4. Connect a terminal program to the FTDI port at 4800 baud, 8 data bits, no
   parity and 2 stop bits, with its session log on.
5. Write the starter card's image to an SD card and put it in the adaptor, so
   that T19, T20 and T37 have a TEC-OS card to read. T37 writes only to a card
   whose block 0 starts with `TECOSVOL`.
6. Press reset, and press `I` on the terminal or `+` on the keypad within 5
   seconds for the interactive tests.
7. Keep off the hex keypad during the RAM tests, T09 and T25, except to answer
   a question.

The keypad's warning has the same cause as TEC-OS's. With the keypad NMI
jumper fitted, a key press makes an NMI, and the Z80 pushes its return address
and jumps to `0066h`. During the RAM tests the NMI handler at `0066h` is
overwritten by the patterns under test, and in T09 and T25 the latch's PROTECT
bit makes the stack's page read-only, so the pushed return address is lost
(`docs/diagnostics.md`, T02 and T25). TEC-OS has no NMI handler at all, and
runs with that jumper off.

The terminal's session log holds the whole run, from the banner to the last
`==== END ====`, and the report in it is the one `tools/diag-check.mjs` reads.

## Comparing a board's report

`tools/diag-check.mjs` compares the last report in a terminal's session log
with the model's run of the same image:

```sh
node tools/diag-check.mjs board-log.txt
```

It first checks that the report's image ID is the image's in
`build/diag/diag.rom`, and stops with exit status 2 if not
(`tools/diag-check.mjs:149-153`). It then compares each result line with the
model's (`tools/diag-check.mjs:79-110`). A line whose result and details both
match is passed over, and a visual check answered `PASS` on the board matches
the model's `LOOK`. Lines that carry measured values, such as T14's bit times,
T15's and T16's busy polls, T18's frame, T19's card answers, T20's and T37's
polls and T21's clock, are compared by the form of their details, and the
board's numbers are printed beside the model's (`tools/diag-check.mjs:31-46`).
Every other difference is printed with the TEC-OS behaviour it affects, taken
from the last table in `docs/board-run.md` (`tools/diag-check.mjs:64-72`). The
exit status is 0 with no differences and 1 with some.
