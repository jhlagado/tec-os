# Diagnostics ROM

The diagnostics ROM is a separate 16 KiB image for `C000h–FFFFh`. I wrote
it for the first runs of TEC-OS on a real TEC-1G. It exercises every piece of
hardware TEC-OS uses and reports what the board does. Several questions about
the board can be answered only by running on one, and the ROM measures each
of them: what a write under the boot overlay reaches, how the latch's bank
field is decoded, whether VRAM keeps up without delays, and whether a card
keeps up with the bit-bang SD rate.

**Emulator results are not board evidence.** The ROM passes its automatic
and interactive tests on the Debug80 TEC-1G model (`test/diag.test.mjs`).
That proves the ROM's own logic and its timing arithmetic. It says nothing
about a physical board, because the model supplies the answers. A result
becomes board evidence only when a run on a real TEC-1G is recorded with the
board revision.

## Building

```bash
npm run diag
```

The build writes `build/diag/diag.rom` (16,384 bytes), the symbol map
`build/diag/diag.d8.json` and `build/diag/diag.json` with the image's
SHA-256, its checksum and the serial delay counts. Unused bytes are `FFh`.
The last two bytes hold the 16-bit sum of `C000h–FFFDh`, which test T05
checks on the board. Two builds from the same sources give identical images.

The sources are in `diag/`. They reuse TEC-OS's reset path, serial routines,
SD driver and font. `tools/diag.mjs` generates `diag/gen/config.asm` and
`diag/gen/font.asm` before assembling with ATOM.

## Running it on a board

1. Burn `diag.rom` where the TEC-OS ROM goes. It is entered through the same
   2 KiB boot overlay at reset.
2. Connect a terminal to the FTDI port at 4800 baud, 8 data bits, no parity
   and 2 stop bits. Turn on the terminal's session log so the report can be
   kept as a file.
3. Reset the board. The ROM tests its own variables and stack page first,
   then prints a banner and waits 5 s.
4. Press `I` or `Y` on the terminal, or `+` on the hex keypad, within those
   5 s to include the interactive tests. Otherwise only the automatic tests
   run, which needs nobody at the board.
5. Keep off the hex keypad while the RAM tests run (about 30 s at 4 MHz) and
   during T09 and T25. A keypad press raises an NMI. During the RAM tests its
   return address would land in the RAM under test. During T09 and T25 the
   stack is write-protected.
6. At the end the ROM prints the report between `==== TEC-1G DIAGNOSTICS
   REPORT ====` and `==== END ====`. `R` prints it again. `I` runs the
   interactive tests afterwards and adds their results.

Answers come from the terminal, the hex keypad or the matrix keyboard. On the
keypad `+` means yes, `-` means no, `GO` is Return and `AD` is Esc. Each
interactive test asks first, so `N` or Esc skips it. A question left
unanswered for a minute counts as skipped.

The LCD shows the test in progress on row 1, the last result on row 2 and
the totals of PASS, FAIL, INFO and SKIP on row 3.

## Results

Each test ends with one line in the report:

```text
T12 BANKS   INFO  field 0-F: 0122446688AACCEE (B base, - none); 9 banks + base
```

| Result | Meaning |
| --- | --- |
| `PASS` | The board did what TEC-OS relies on |
| `FAIL` | It did not; the line says what was read |
| `INFO` | A measured value with no verdict, often the answer to one of those questions |
| `SKIP` | Not run: skipped, or a test it depends on failed |
| `LOOK` | A visual or audible check in an automatic run; the interactive run asks Y/N instead |
| `NONE` | The device is not fitted or does not answer |

Times are in T-states. Every timing loop has a fixed cost per pass, given in
the line and in the source. Three tests measure the real clock: T18 against
the PICO9918's frame rate, T21 against the RTC and T33 against a stopwatch.
Dividing a T-state count by that clock gives seconds.

## Memory map while the ROM runs

| Range | Use |
| --- | --- |
| `0066h` | NMI handler that counts NMIs (after the RAM tests) |
| `07FFh–0800h` | Overlay probes (T07, T08) |
| `0C00h–0DFFh` | SD block buffer |
| `0E00h–0FFFh` | VRAM test pages, second SD block buffer, T37's kept block |
| `1000h–2FFFh` | Report text |
| `7E00h–7EFFh` | Variables |
| `7F00h–7FFFh` | Stack |

The latch is `01h` throughout except inside the tests that change it.
Interrupts stay disabled with `IM 1` selected, as in TEC-OS.

## Automatic tests

### T01 HOME: variables and stack page

Four fill-and-verify passes over `7E00h–7FFFh` before anything uses the
stack. The code runs on registers alone. On a failure it prints the address,
the value written and the value read on the serial port, again without a
stack, and repeats the message every 2 s. Nothing else runs, because every
later test needs this page. This test proves the RAM the ROM itself depends
on.

### T02–T04 RAM

T02 tests `0000h–7DFFh` and T03 tests the window `8000h–BFFFh` with EXPAND
off. Each runs four passes: `L xor H`, its complement, `L+H` and its
complement. Every bit is therefore written as 0 and as 1. Two addresses that
alias read back each other's values, so a missing or shorted address line
fails. T04 tests `7E00h–7FFFh` again in full. It copies the page into the
window, moves the stack into the copy, tests the original and copies the page
back. T04 is skipped when T03 fails. A failure line gives the address, the
value written, the value read and the bad bits.

T02 overwrites the NMI vector at `0066h` while it runs, which is the reason
to keep off the keypad.

### T05 ROMSUM and T06 ROMWR

T05 sums `C000h–FFFDh` and compares the sum with the word at `FFFEh`, which
proves the chip was burned and is read correctly. T06 writes the complement
over a known ROM byte and reads it back unchanged.

### T07 OVERLAY and T08 OVLWR

With latch bit 0 low, `07FFh` should read the ROM byte at `C7FFh` and `0800h`
should still read RAM. T07 checks both. T08 then writes `07FFh` with the
overlay on, turns the overlay off and reads the RAM there. It reports whether
the write reached the RAM underneath or was dropped.
Debug80 sends the write to the RAM. TEC-OS never writes there with the
overlay on, so either answer is safe.

### T09 PROTECT

With latch bit 1 set, writes to `4000h` and `7DFFh` should be ignored and a
write to `3FFFh` should succeed. Nothing between the two latch writes touches
the stack. T09 also reads port `03h` with PROTECT on for T11.

### T10 LATCHRD

The board documentation describes the latch as write-only. Debug80 lets it
be read. T10 writes `01h`, `05h`, `0Dh` and `81h` and reports what port
`FFh` returns for each. TEC-OS never reads the latch, so this is information
only.

### T11 STATUS

Port `03h` read with the latch at `01h`, `03h`, `05h` and `81h`. The two
descriptions of this port disagree:

| Bit | TEC-1G documentation | Debug80 |
| --- | --- | --- |
| 0 | Matrix switch | Matrix mode |
| 1 | Protect switch | PROTECT latch bit |
| 2 | Expand switch | EXPAND latch bit |
| 3 | EXPAND latch bit | Cartridge |
| 4 | Cartridge, 0 when fitted | Raw key |
| 5 | GIMP input | GIMP input |
| 6 | KDA, 0 while a keypad key is down | No key, 1 when none is down |
| 7 | Serial RX | Serial RX |

Comparing the four values shows which bits follow the latch on the board.
TEC-OS reads bit 0 (the Matrix switch), bit 6 and bit 7.

### T12 BANKS and T13 BANKRAM

T12 writes a tag into the window for each value of the bank field, latch
bits 3–6 with EXPAND on, from 15 down to 0. It then writes a different tag
with EXPAND off and reads every tag back. Values that share RAM read the tag
of the last one written, so each value maps to the lowest value that shares
its RAM. The line shows the field values 0–F in order: a hex digit names the
value whose RAM it shares, `B` means the base mapping and `-` means no
consistent RAM. Debug80 gives `0122446688AACCEE`, nine banks plus the base:
its model decodes latch bits 3–6 as a bank field for the window. The documented board, with
one 32 KiB chip in U9 and bits 3–6 unconnected, should give `0000000000000000`
and one bank plus the base. The board's line settles how the field is
decoded and the value of `NBANKS` for the board profile.

T13 runs two pattern passes over each bank T12 found.

### T14 SERTX

Prints a pangram and every printable ASCII character. The line gives the
ROM's bit time, 833 T-states, which is 4800 baud at 4 MHz. Answering Y over
the terminal proves reception as well.

### T15 LCD

Times the busy flag after a clear in polls of 50 T-states, writes 20
characters to row 4 and reads them back through port `84h`. TEC-OS only
writes the LCD, but a working read-back shows the busy flag and the data bus
are sound.

### T16 GLCD

The ST7920 at `07h`/`87h`. Times the busy flag after a clear, fills the
graphics RAM with a pattern that differs between rows 16 apart and reads it
back with the controller's dummy read. It then draws a framed 8 × 8
checkerboard. A board without the GLCD gives `NONE`.

### T17 VDP and T18 VDPCLK

T17 detects the PICO9918 as TEC-OS does and sets TEC-OS's 80-column
registers (`04 50 07 00 00 00 00 F4`). It writes a tag every 4 KiB to show
16 KiB of distinct VRAM. Then it writes and reads all 16 KiB at full speed,
16 T-states a byte with `OUTI` and `INI`, and again at 104 T-states a byte,
counting the bytes that come back wrong. TEC-OS inserts no VRAM delays, so
errors at full speed with none at the slower rate would show that it needs
them. Last, T17 loads the font and draws the test screen: a title on
row 1, rulers on rows 2 and 24, the printable characters between them and
the title in reverse video on row 13. The name table is read back as well.

T18 counts 16 frames of the status register's frame flag in polls of 33
T-states. It reports the frame length and the CPU clock that follows for a
50 Hz and a 60 Hz refresh. The PICO9918's refresh rate is a setting of its
own, so the right figure is the one near 4 MHz.

### T35 VDPPAGE: page select

TEC-OS page-flips in 80 columns. The
console's name table is at `1000h` (R2 = `07h`). Row moves are built in a
second table at `2000h` (R2 = `0Bh`) and shown by rewriting R2. T35 fills
`2000h` with 2s under the title `PAGE 2: NAMES AT 2000h, R2 = 0Bh`, leaves
the T17 test screen at `1000h`, and switches R2 between `0Bh` and `07h`
three times, a second each. R2 is left at `07h`. TEC-OS and the emulator
renderers take the page as `(R2 & 0Ch) << 10`, so the board must show page
2 for `0Bh` and the test screen for `07h`. Registers are write-only, so only
the operator can confirm what the screen shows. In an automatic run the
result is `LOOK`.

### T36 F18A: identity and vertical scroll

The PICO9918 firmware's VDP core (`vrEmuTms9918.c` in
[vrEmuTms9918](https://github.com/visrealm/vrEmuTms9918), the PICO9918
submodule) keeps registers above 7 locked until `1Ch` is written to register
57 twice in a row. Unlocked, VR15 selects the status register read at `BFh`.
SR1 reads `E8h`: `E0h` is the F18A identity and the firmware sets `08h` to
mark a PICO9918. SR14 holds the version, `1Ah` in that source. VR28 scrolls
80-column text up by that many pixel lines, wrapping at 192 (240 with the
30-row bit in VR49). Writing VR50 with bit 7 set resets every register and
locks them again.

T36 reads SR1 through VR15 while locked, unlocks, reads SR1 and SR14, and
reports them. A value of SR1 outside `E0h–EFh` means the VDP is not
F18A-compatible, and T36 reports `INFO` with what it read. A plain TMS9918
takes the unlock and VR15 writes as writes to R1 and R7, so the test sets
registers 0–7 back to TEC-OS's values either way. On an F18A-compatible
answer it sets VR28 to 8 for 2 s, which moves the text up one row with the
top row wrapping to the bottom. It then clears VR28, writes VR50 bit 7 and
rewrites registers 0–7. Reading SR1 once more shows whether the reset locked
the registers again, and a line ending `STILL UNLOCKED` is a `FAIL`. TEC-OS
never unlocks, so a reset of the board also leaves the console locked.

Unlocked, the firmware decodes R2 in 80 columns with mask `0Fh` instead of
`0Ch`, so R2 = `07h` would select names at `1C00h`. T36 sets R2 to `04h`
during the scroll check, which means `1000h` under either mask. A program
that unlocks the PICO9918 under TEC-OS needs the same care.

On the board, T36 needs the operator for the scroll check and settles the
identity, version and relocking from the readings. On the Debug80 model it
reports `not F18A-compatible`, because the model has only registers 0–7.

### T19 SD and T20 SDBLKS

T19 initialises the card with TEC-OS's driver and records each answer: the
CMD0 attempts, the CMD8 R1 and R7 bytes, the ACMD41 attempts and the OCR. It
reads the CSD and the CID with the product name and block 0. No card gives
`NONE`. T20 reads block 0 twice and compares the copies, then reads blocks
0–63 and reports errors and the fewest and most polls for the data token.
One block costs 354,216 T-states plus 678 for each poll, about 89 ms at
4 MHz. These two lines show whether the card fitted keeps up with the
bit-bang rate.

T37 writes one block, outside every volume, and puts it back. Every other
test only reads the card.

### T37 SDWRITE

TEC-OS writes blocks, so the write path needs a test of its own, on a block
that no container uses. Block 0 is the header and every volume starts at a
nonzero multiple of 8 ([container-format.md](container-format.md)), so
blocks 1–7 belong to nothing. T37 writes only when block 0 holds the
`TECOSVOL` magic, so a card holding anything else is left alone and the line
says so. It keeps block 7 in RAM, writes a pattern there (byte i is the low
byte of i xor its high byte xor `5Ah`), reads it back, writes the kept block
back and reads that back. The line gives the card's busy polls after the last
write. If the pattern reads back wrong the block is still written back. A
power cut during T37 is the only way it can leave block 7 changed, and
nothing reads block 7. T37 runs straight after T20.

### T21 RTC

The DS1302 add-on on port `FCh`. The ROM detects it with MON-3's checks, a
valid seconds value and a weekday from 1 to 7. MON-3 first clears the
write-protect and trickle-charge registers, and the ROM does not. With the
clock running, T21 counts polls of the seconds register across one second.
Each poll is 1,282 T-states, which gives the CPU clock directly. A halted
clock (CH set) is reported and left halted.

TEC-OS's hardware services set the clock, so T21 then sets it too. It waits
until the seconds are below 50, keeps the seven time registers and the
write-protect bit, clears write-protect and sets 2099-12-31 23:59:58, a
Thursday. It reads the time back, waits 2.5 s and expects 2100-01-01 00:00.
Then it writes back the kept time plus the seconds the set took and the
write-protect bit as it was, and reads the time back. The wait below 50
seconds means the seconds added back never carry into the minutes. The
trickle-charge register is never written. The line ends with `read back,
rolled over, restored`, or with the step that went wrong, which is a `FAIL`.
The restored clock is behind by at most the fraction of a second between
reading the kept time and setting the test time.

### T22 SEG7 and T23 SPEAKER

T22 lights each segment on all six digits in turn, then `8.` on each digit
from left to right, then all of them. Port `01h` bit 6 stays high throughout
so the serial line idles. The segment bits on port `02h` are a `01h`, b
`08h`, c `20h`, d `80h`, e `40h`, f `02h`, g `04h` and the point `10h`.
T23 plays 601 Hz, 1203 Hz and 2407 Hz for 0.3 s each on port `01h` bit 7.

### T24 RGB8X8

Multiplexes the 8 × 8 matrix row by row: red, green, blue, white and a white
diagonal. The ROM drives port `05h` as the row latch and `06h`, `F8h` and
`F9h` as the red, green and blue columns, which is how Debug80 decodes them.
MON-3 names `05h` the horizontal latch and `06h` the vertical one, with `F8h`
green and `F9h` blue. The TEC-1G port list calls `05h` the X axis and `06h`
the Y axis. What the fitted display shows for this sequence settles which
reading the board follows. The matrix is left dark.

### T25 LEDBAR

The STATUS LED bar shows the latch. T25 walks a 1 through bits 1–7 with bit
0 high, lighting the CAPS lamp with bit 7. It then writes `00h`, which turns
the boot overlay on and changes only bit 0, and returns to `01h`. Each step
lasts about 0.4 s. PROTECT is on for one step, so this test also runs on
registers alone.

### T26 NMI

The number of NMIs taken while the automatic tests ran. None is expected,
because the PICO9918's frame interrupt stays disabled.

## Interactive tests

### T27 SERRX

Each character typed comes back as its hex code and the character. Esc ends
the test. The verdict is the answer to the question that follows, which
arrives over the same line.

### T28 SERBIT

Typing a capital `U` (`55h`) gives a falling edge at the start of every
second bit. The ROM times eight bit periods per character in polls of 33
T-states, over eight characters, and compares the terminal's bit time with
its own. It passes within 2%. A failure means the board's clock and the
terminal disagree on 4800 baud, whatever the cause.

### T29 KEYPAD and T30 KEYNMI

Pressing each of the 20 keypad keys prints its code from port `00h` and
whether bit 5 (Shift) was low. `AD` twice in a row ends the test. T29 passes
when all 20 codes were seen. T30 compares the NMIs counted at `0066h` with
the presses. The 74C923 raises its data-available output once for each key
press and drops it on release, so a press of the same key again strobes it
again, and with the NMI on that edge each press gives one NMI; T30 shows
whether the board does it. It needs the keypad NMI jumper, which TEC-OS
itself leaves off. T29 clears its counts
before it prints the instructions, so a key pressed while they print still
counts. Before that order was fixed, a press arriving within the last line
of the prompt was lost, which showed as 20 NMIs for 21 presses.

### T31 MATRIX

Each matrix key going down prints its number, row and bit, numbered as
TEC-OS numbers them (row × 8 + bit, row selected by a low address line on
`A8–A15`). The report keeps a map of every key seen as eight row bytes. The
test ends after 15 s with no new key or on any key from the terminal.

### T32 JOY

The joystick, read as MON-3 reads it: port `FEh` with only A11 low
(`BC = F7FEh`). Bits are 01 up, 02 down, 04 left, 08 right, 10 fire 2, 20
pin 9, 40 fire 1 and 80 fire 3. The joystick shares row 3 with the matrix
keyboard, so keys in that row show here too.

### T33 CLOCK

A stopwatch measurement of the CPU clock. After three countdown beeps a
second apart, the ROM beeps at GO and again at STOP. The interval from the
first speaker edge of one beep to the first edge of the other is 240,400,396
T-states, about 60.1 s at 4 MHz. Typing the stopwatch reading in tenths of a
second gives the clock in Hz. Starting and stopping on the beeps cancels most
of the reaction time, so a careful reading is good to about 0.3%. The
interval constant is `STOPWATCH_T` in `tools/diag.mjs`. The emulator test
counts it from the speaker edges on every run.

### T34 SDTIME

256 block reads (128 KiB) between a GO beep and a STOP beep. Typing the
stopwatch reading gives the read rate in bytes per second. With the RTC
fitted the line also gives the RTC's elapsed seconds.

## Recording a board run

Keep the terminal log with the board revision, the CPU clock from T33 (or
T18 or T21), what is fitted and the report between the two `====` lines.
Note every result that differs from the Debug80 model, with the behaviour
of TEC-OS it affects.

## The emulator test

`test/diag.test.mjs` builds the ROM and runs it on the Debug80 model:

- the automatic run with the PICO9918, matrix keyboard and a card, checking
  every result and the model's answers on the bank field and the write
  under the overlay, the frame length, the
  80-column screen, the page the harness decodes while R2 is `0Bh` and `07h`
  and the registers T36 leaves behind;
- T21's set against a DS1302 that counts on from a written time, which
  checks the read-back, the roll-over to 2100 and that the restored clock is
  within 2 s of where it would have been. Runtime 0.2.0's DS1302 stops
  counting once a time register is written, so the test keeps it counting;
- T37's write, checking the card image's block 7 is unchanged after two
  writes;
- the F18A probe against a stub of the firmware's register behaviour: the
  unlock, the VR15 reads, VR28 set to 8 and back to 0, R2 = `04h` during the
  scroll, the VR50 reset and TEC-OS's registers afterwards;
- a stuck bit in the variables page, which must give the stackless T01
  message and nothing else;
- no RAM in the window, which must fail T03, skip T04 and report no banks;
- the interactive run, driven over the serial port, keypad, matrix keyboard
  and joystick, checking the measured bit time and the stopwatch interval.

The only memory writes the ROM makes to ROM or under the overlay are the two
deliberate ones in T06 and T08, and the test checks that too.

None of this shows what a real PICO9918 displays. The page shown for each R2
value, the scroll and the identity and version a card reports need a board.
