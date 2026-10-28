# Running the diagnostics ROM on a TEC-1G

This is the plan for a first run of the diagnostics ROM on a real TEC-1G.
It is written for someone who knows the board but not TEC-OS, the operating
system the ROM was written for. The ROM tests every part of the board
TEC-OS uses and prints a report over the serial port. I need that report,
the whole terminal log around it and a short form about the board. Nothing
here needs TEC-OS itself.

The run takes about 2 minutes without the hands-on tests and 15 to 20
minutes with them. It reads the SD card and writes one block that no file
uses, then puts it back. It writes nothing else outside the board's RAM.

## What to prepare

- **The board.** Note its PCB revision and what is fitted. The form at the
  end lists what I need to know.
- **RAM in U9.** TEC-OS needs a 32K RAM chip (62256 or similar) in U9 with
  the EXPAND jumpers set for a 32K chip. The board's recommended build
  leaves U9 empty. Without it the RAM test of the window, T03, fails, which
  is a useful answer too, but most of what TEC-OS needs goes untested.
- **The ROM.** `diag.rom` is a 16 KiB image for `C000h–FFFFh`. In a 32K chip
  (27C256 or 28C256), burn it into both halves, at `0000h` and at `4000h`,
  so that the ROM Lo/Hi switch (SW6) runs it in either position. Set the
  ROM SIZE jumpers for a 28-pin chip, as for MON-3.
- **A ROM programmer** such as a TL866.
- **The FTDI cable** on J5, and a terminal program that keeps a session log
  to a file: PuTTY, Tera Term, CoolTerm, `screen -L` or `minicom -C`.
  Settings: 4800 baud, 8 data bits, no parity, 2 stop bits, no flow
  control, no local echo.
- **The CPU clock on FAST** (SW2), with the 4 MHz crystal oscillator. The
  serial link works only at 4 MHz.
- **A stopwatch** that shows tenths of a second. A phone's is fine.
- **An SD card that may be written.** Write `starter.img` from the TEC-OS
  release to it with balenaEtcher, Raspberry Pi Imager or `dd`. Any card of
  16 MB or more will do. T37 writes block 7 of the card, which no file
  uses, and puts back what was there. It writes only to a card that holds a
  TEC-OS image, so a card with anything else on it is left alone, and T37
  then reports `SKIP`.
- **Optional devices,** each tested if fitted: the 20 × 4 LCD, the 128 × 64
  GLCD, the PICO9918 video card and a monitor, the 8 × 8 LED matrix, the
  matrix keyboard and the joystick, the DS1302 clock and the SD card
  adaptor on the GPIO stack. Fit whatever you have before the run.
- **The config switches.** Set the Matrix switch on if the matrix keyboard
  is fitted. The Protect and Expand switches do not matter, but note them on
  the form.
- **The keypad NMI jumper** may stay as it is. With it fitted, T30 counts
  the keypad's NMIs. Either way, keep off the hex keypad while the
  automatic tests run, except to answer a question.

## The run, step by step

### 1. Burn and fit the ROM (10 minutes)

Burn `diag.rom` as above and fit it in U7. Before you fit it, check the
programmer's read-back against the file. The ROM prints an image ID in its
first line, and the form asks for it, so the report says which image ran.

### 2. Connect (2 minutes)

Connect the FTDI cable and start the terminal with its session log on.
Power the board.

### 3. Reset and choose (5 seconds)

Press RESET. Within a second the terminal shows:

```text
TEC-1G diagnostics 0.2 image 0123456789ABCDEF
RAM 7E00-7FFF (variables and stack) passed.
Press I, Y or keypad + within 5 s to include the interactive tests.
```

The LCD shows `TEC-1G DIAG 0.2` on its first row. The image ID on your
board will be different from the one shown here.

Press `I` on the terminal, or `+` on the keypad, within those 5 seconds to
include the interactive tests. I recommend it: the questions put your
answers into the log. Otherwise only the automatic tests run, and the
visual checks report `LOOK` for you to describe on the form.

### 4. The automatic tests (1 to 2 minutes)

The tests run in this order. Each starts with a line `-- Tnn` and its
title, and ends with its result line. The LCD shows the test in progress on
its second row, the last result on its third and the running totals on its
fourth (`P` pass, `F` fail, `I` information, `S` skipped).

| Tests | What happens | About |
| --- | --- | --- |
| RAM | The RAM tests, before T01's line. Keep off the keypad | 6 s |
| T01–T12 | Memory, ROM, overlay, PROTECT, latch and status port | 4 s |
| T13 | Each RAM bank T12 found | 1 s a bank |
| T14 | Two lines of text, then the TX bit time | 1 s |
| T15–T16 | LCD and GLCD | 1 s |
| T17–T18 | PICO9918 test screen, then its frame rate | 3 s |
| T35 | PICO9918 page select: watch the monitor | 7 s |
| T36 | PICO9918 F18A registers: watch the monitor | 3 s |
| T19–T20, T37 | SD card: identify, read 64 blocks, write block 7 | 8 s |
| T21 | DS1302 clock: rate, then a set and restore | up to 15 s |
| T22 | 7-segment display: watch it | 7 s |
| T23 | Speaker: listen | 1 s |
| T24 | 8 × 8 LED matrix: watch it | 3 s |
| T25 | STATUS LED bar and CAPS lamp: watch them | 5 s |
| T26 | The NMI count | — |

With the interactive tests chosen, the visual tests each ask a question,
answered Y or N, before the run moves on. Answer from the terminal (`Y`,
`N`) or the keypad (`+` yes, `-` no). A question left for a minute counts
as skipped.

### 5. What correct looks like

- **T14, terminal.** A pangram, then every printable character from space
  to `~`, on two lines with nothing missing or garbled.
- **T15, LCD.** The fourth row shows `LCD READ-BACK 012345` for a moment.
- **T16, GLCD.** A framed checkerboard of 8 × 8 squares fills the screen.
- **T17, monitor.** 80 columns by 24 rows of text: a title on row 1, a
  ruler `1234567890…` on rows 2 and 24, rows of characters between them,
  and the title again in reverse video on row 13.
- **T35, monitor.** The screen switches to a page of `2`s headed
  `PAGE 2: NAMES AT 2000h, R2 = 0Bh` and back to the test screen, three
  times, a second each. It ends on the test screen.
- **T36, monitor.** Only on a PICO9918 whose firmware has the F18A
  registers: the text moves up one row for 2 seconds, the top row wrapping
  to the bottom, then moves back. On other firmware nothing moves and the
  test asks nothing.
- **T22, 7-segment display.** Segment a lights on all six digits, then b,
  c, d, e, f, g and the decimal point in turn. Then `8.` lights on each
  digit from left to right, then on all six together.
- **T23, speaker.** Three tones rising in steps of an octave, about a third
  of a second each.
- **T24, LED matrix.** The ROM drives it as the Debug80 emulator does: port
  `05h` selects a row, and `06h`, `F8h` and `F9h` light red, green and blue.
  On such a matrix you see it all red, all green, all blue, all white, then
  a white diagonal. The board's documents describe a single-colour matrix
  with `05h` as the columns (bit 0 left) and `06h` as the rows (bit 0 at the
  bottom). On that one you see it all lit, dark, dark, all lit, then a
  diagonal from bottom left to top right. Either is a useful answer:
  describe what you saw on the form.
- **T25, STATUS LED bar.** Bit 0 is the rightmost LED. Bits 1 to 7 light one
  at a time from right to left, about 0.4 s each, with the CAPS lamp on the
  matrix keyboard lit with bit 7. Then the rightmost LED changes on its own
  and the bar returns to how it started. Describe on the form what the
  rightmost LED did.

### 6. The hands-on tests (10 to 15 minutes)

These follow the automatic tests when you chose them at the start, or run
when you press `I` after the report. Each asks `Run this test? (Y/N)`
first: `N` skips it.

| Test | What to do | Ends |
| --- | --- | --- |
| T27 SERRX | Type anything on the terminal. Each character comes back with its hex code. Press Esc, then answer whether everything came back as typed | Esc, or 30 s idle |
| T28 SERBIT | Type a capital `U` eight times, a second or so apart | 8 `U`s, or 30 s idle |
| T29 KEYPAD | Press each of the 20 keypad keys once, holding Shift for one of them, then `AD` twice in a row | `AD` twice, or 15 s idle |
| T31 MATRIX | Press keys on the matrix keyboard one at a time, as many as you like | Any key on the terminal, or 15 s idle |
| T32 JOY | Move the joystick in each direction and press each button | Any key on the terminal, or 15 s idle |
| T33 CLOCK | After three beeps a second apart, start the stopwatch on the GO beep and stop it on the STOP beep, about 60 s later. Type the reading in tenths of a second (`601` for 60.1 s), then Return | Your reading |
| T34 SDTIME | The same with the stopwatch, about 25 s this time | Your reading |

On the keypad, `GO` is Return and `AD` is Esc, so the stopwatch readings
can be keyed in there too.

### 7. The report

The ROM prints the report between `==== TEC-1G DIAGNOSTICS REPORT ====`
and `==== END ====`, one line per test, then waits. `R` prints it again and
`I` runs the hands-on tests. Each line reads:

```text
T09 PROTECT PASS  wrote A5 over 5A, expect 5A 5A A5: 4000 5A 7DFF 5A 3FFF A5
```

`PASS` means the board did what TEC-OS relies on and `FAIL` means it did
not; a `FAIL` line gives what was expected and what was read. `INFO` is a
measurement, `LOOK` a visual check no one answered, `SKIP` a test not run
and `NONE` a device not fitted. A `FAIL` on a visual test is your answer No.

## What to send back

1. **The session log,** the whole file, from the banner to the last
   `==== END ====`. Send it as a file, not retyped. Partial logs help too:
   see the next section.
2. **The form,** filled in:

```text
Board revision (PCB, and schematic if known):
CPU type and clock (crystal):
U7 ROM chip (part number) and SW6 position:
U8 RAM chip:
U9 chip (part number, size), or empty:
Config switches (Matrix, Protect, Expand): on/off, on/off, on/off
Keypad NMI jumper fitted: yes/no
LCD (size, or none):
GLCD (model, or none):
PICO9918 (firmware version, 50 or 60 Hz setting, or none):
8 x 8 LED matrix (single colour or RGB, or none):
Matrix keyboard / joystick / DS1302 / SD adaptor: fitted or not, each
SD card (make, size):
Terminal program, and FTDI cable or module:
Image ID from the first line of the log:

What you saw, for any test that reported LOOK or that you answered No:
T14 terminal lines:
T15 LCD:
T16 GLCD:
T17 monitor:
T35 monitor:
T36 monitor:
T22 7-segment:
T23 speaker:
T24 LED matrix (the colours or patterns, in order):
T25 STATUS LEDs (and what the rightmost LED did):
Stopwatch readings for T33 and T34:
Anything else odd:
```

## When it stops

Every test starts with a line `-- Tnn`, so the last such line in the log
names the test that stopped. Send the log as it is, the form, and what the
LCD, the 7-segment display and the HALT LED show.

- **Nothing on the terminal.** Check what the LCD shows.
  - `TEC-1G DIAG 0.2` on its first row: the ROM is running and the serial
    link is at fault. Check the terminal's settings (4800 8N2), that TX and
    RX are not swapped, and SW2 on FAST.
  - A blank LCD and nothing on the terminal: the ROM is not running. Check
    the chip is in the right way round, the ROM SIZE jumpers, that both
    halves of a 32K chip were burned, and the clock. If the HALT LED is
    lit, say so.
- **A line like `T01 HOME FAIL RAM 7E00-7FFF at 7E81 wrote 00 read 10`,
  repeated every 2 seconds.** The RAM at the top of U8 is faulty, and the
  ROM goes no further because everything else needs it. Send the log.
- **Garbled characters.** The terminal settings or the clock. Check 4800
  baud, 8 data bits, no parity, 2 stop bits, and SW2 on FAST.
- **It stops in a test.** Allow twice the time in the table above, then
  note the last `-- Tnn` line and the LCD's second row, press RESET and run
  again. If it stops in the same test twice, run again with that device
  unplugged, if it can be, and send both logs.
  - A keypad press during the RAM tests, T09 or T25 can crash the ROM, as
    the NMI it raises lands where the ROM cannot return from it. Run again
    without touching the keypad.
- **Questions answer themselves, or the keypad does nothing.** The keypad's
  KDA line reads the other way from what the ROM expects. Answer from the
  terminal and say so on the form.
- **T06 ROMWR FAIL.** The ROM chip took a write, which changes one byte of
  it and can change a second during T08. Reburn the chip before running
  again, and give the chip's part number on the form.

## What each line settles

`tools/diag-check.mjs` reads this table: for each line of a board's report
that differs from the emulator's, it prints the TEC-OS behaviour named here.

| Test | What it settles | TEC-OS behaviour it affects |
| --- | --- | --- |
| T01 HOME | RAM at `7E00h–7FFFh` | Everything: TEC-OS keeps its stacks and workspace in fixed RAM |
| T02 RAMLO | RAM at `0000h–7DFFh` | Page zero and the program area, `0100h` up |
| T03 RAMWIN | RAM in U9's lower half, EXPAND 0 | The resident BDOS, BIOS and buffers at the top of EXPAND 0; TEC-OS does not start without it |
| T04 RAMHOME | RAM at `7E00h–7FFFh` with every pattern | As T01 |
| T05 ROMSUM | The chip was burned and reads correctly | Nothing in TEC-OS; a failure means burn the chip again |
| T06 ROMWR | Whether the ROM chip takes writes | Nothing; TEC-OS never writes to ROM |
| T07 OVERLAY | The boot overlay and its removal | Cold boot, which starts through the overlay |
| T08 OVLWR | Where a write under the overlay goes | Nothing; TEC-OS never writes there with the overlay on |
| T09 PROTECT | PROTECT makes `4000h–7FFFh` read-only | Programs that set PROTECT; TEC-OS keeps the bit across bank changes |
| T10 LATCHRD | Whether port `FFh` reads back | Nothing; TEC-OS keeps a copy of the latch and never reads it |
| T11 STATUS | Which bits of port `03h` follow the latch | The console, which reads bit 0 (Matrix switch) and bit 7 (serial RX) |
| T12 BANKS | What latch bits 3–6 select, and EXPAND 1 | EXPAND 1, where the CCP levels and command history live; the board profile's bank count |
| T13 BANKRAM | RAM in each bank T12 found | EXPAND 1: the CCP levels and the history |
| T14 SERTX | Serial output at 4800 8N2 | The serial console's output |
| T15 LCD | The LCD's bus and busy flag | The LCD hardware service (4) |
| T16 GLCD | The ST7920 GLCD | The GLCD console driver, GLCD.PRL |
| T17 VDP | The PICO9918, its 16K VRAM and its speed | The 80-column console, which writes VRAM with no delays |
| T18 VDPCLK | The PICO9918's frame rate | Nothing directly; a check on T33's clock |
| T19 SD | The card's answers to TEC-OS's driver | Every drive: TEC-OS keeps its volumes on the card |
| T20 SDBLKS | Block reads at the bit-bang rate | Disk reads |
| T21 RTC | The DS1302: its time, rate, set and restore | The clock hardware service (18) and the clock TEC-OS reports |
| T22 SEG7 | The 7-segment wiring | The digit hardware services (1 and 2) |
| T23 SPEAKER | The speaker | The tone hardware service (6) |
| T24 RGB8X8 | How the matrix decodes `05h`, `06h`, `F8h`, `F9h` | The LED matrix hardware service (3) |
| T25 LEDBAR | The STATUS bar and the CAPS lamp | The CAPS lamp, latch bit 7, which the matrix keyboard console sets |
| T26 NMI | No stray NMIs | Programs: TEC-OS answers an NMI with RETN and expects none |
| T27 SERRX | Serial input | The serial console's input |
| T28 SERBIT | The terminal's bit time against the ROM's | The serial console at 4800 baud |
| T29 KEYPAD | The keypad's codes and Shift | Nothing; TEC-OS does not read the keypad |
| T30 KEYNMI | One NMI for each keypad press | Nothing; TEC-OS runs with the NMI jumper off |
| T31 MATRIX | The matrix keyboard's key numbers | The matrix keyboard console and the keys hardware service (8) |
| T32 JOY | The joystick's bits | The joystick hardware service (7) |
| T33 CLOCK | The CPU clock, by stopwatch | Every timing: the serial rate and every delay assume 4 MHz |
| T34 SDTIME | The card's read rate | Disk speed |
| T35 VDPPAGE | Which name table R2 selects | The 80-column console's page flip when it scrolls |
| T36 F18A | The F18A identity, version, scroll and relock | Nothing by default: TEC-OS never unlocks the F18A registers |
| T37 SDWRITE | Block writes | Every disk write |
