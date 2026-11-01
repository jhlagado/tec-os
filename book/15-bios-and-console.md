# 15. The BIOS and the console path

Checked against TEC-OS 98c6416.

The BIOS is the part of a CP/M system written for one machine, and on the
TEC-1G most of it is the console: a serial port made of two port bits and
timing loops, a matrix keyboard scanned by software, a terminal emulator that
turns escape sequences into cursor moves, and displays whose code is loaded
from the card. This chapter starts at the BIOS jump table and follows a
character through it, in from a key and out to a screen, by way of the
IOBYTE that selects the device. It ends at the 20 × 4 LCD, which the BIOS
writes to but which is never the console. The disk entries of the table are
in Chapter 18.

## The jump table

CP/M 2.2 defines the BIOS as a table of jumps at the start of a page, one for
each function, in a fixed order. TEC-OS's table has the seventeen entries of
CP/M 2.2 (`src/data.asm:20-36`):

| Offset | Entry | Routine |
| ---: | --- | --- |
| `00h` | cold boot | `COLD` |
| `03h` | warm boot | `WBOOTR` |
| `06h` | `CONST` | `BCONSTC` |
| `09h` | `CONIN` | `BCONIN` |
| `0Ch` | `CONOUT` | `BCONOUT` |
| `0Fh` | `LIST` | `BLIST` |
| `12h` | `PUNCH` | `BPUNCH` |
| `15h` | `READER` | `BREADER` |
| `18h` | `HOME` | `BHOME` |
| `1Bh` | `SELDSK` | `BSELDSK` |
| `1Eh` | `SETTRK` | `BSETTRK` |
| `21h` | `SETSEC` | `BSETSEC` |
| `24h` | `SETDMA` | `BSETDMA` |
| `27h` | `READ` | `BREAD` |
| `2Ah` | `WRITE` | `BWRITE` |
| `2Dh` | `LISTST` | `BLISTST` |
| `30h` | `SECTRAN` | `BSECTRN` |

The table in the ROM is never called. Cold boot copies it to `BF00h`, the
start of the page above the BDOS's workspace (`src/boot.asm:45-48`), and
every caller goes through the copy. The word at `0001h` points at its warm
boot entry, `BF03h`, so a program finds the table the way CP/M 2.2 programs
do, by taking that word and subtracting 3. The BDOS calls the same copy: its
names for the BIOS entries are offsets from `RAMBIOS` (`src/cpm/bdos.asm:14-28`),
and its function 50, the direct BIOS call of CP/M 3, sends functions 0 to 16
through it as well (`src/cpm/bdos.asm:100-102`).

Because every caller goes through RAM, the table is a set of hooks. A program
may write its own jump over an entry, to receive every character the BDOS prints
or to put its own routine behind `CONIN`, and the BDOS then calls the
program's routine. Cold boot is the only time the table is copied, so warm
boot leaves a replaced entry in place, as CP/M 2.2's warm boot does
(`src/boot.asm:45-47`); a program that replaces an entry has to put it back
before it ends, or the replacement's code in the TPA is called after the
program has gone. Warm boot writes one jump of its own, at `BF03h` in
EXPAND 1, and leaves EXPAND 0's table alone (`src/boot.asm:59-65`).

## The IOBYTE and the console mode

CP/M 2.2's IOBYTE, at `0003h`, gives each of four logical devices a field of
two bits, and the two low bits are the console's, `CON:`. TEC-OS uses them for
its four consoles (`src/console.asm:1-6`, `src/layout.asm:60-65`):

| Value | Device | Input | Output |
| ---: | --- | --- | --- |
| 0 | `TTY:` | the serial port | the serial port |
| 1 | `CRT:` | the matrix keyboard | the PICO9918 |
| 2 | `BAT:` | the serial port | the list device, which discards it |
| 3 | `UC1:` | the matrix keyboard | the graphics LCD |

An odd value is a video display with the matrix keyboard. The console mode
in effect is a separate byte, `CONMOD`, and the IOBYTE's field is what a
program or the CCP's `CON` command writes. Every console entry starts with
`CONSEL`, which compares the field with `CONACT`, the field it last acted
on, and does nothing when they match (`src/console.asm:46-58`). When they
differ, `CONSW` switches (`src/console.asm:60-102`). For `CRT:` or `UC1:` it
looks up the display driver's table in `PIVEC` or `GLVEC`; with no driver
loaded for that display it falls back to the serial terminal. For a display it
copies the driver's seven vectors and the screen's columns and rows into the
workspace, resets the scroll region, sets the mode, and, unless a program has
claimed the PICO9918, restores the display's mode, homes the cursor and
clears the screen. For `TTY:` or `BAT:` it sets `VWID` and `VHGT` at `0048h`
to 0, so that a program reading them through the table at `C008h` gets 0:
the console has no screen of known size.

Since `CONSEL` runs at the next console call, a change to the IOBYTE takes
effect at the next character. The `CON` command shows it. On the web page's
board, with `PICO.DRV` as the console, `CON TTY` writes the IOBYTE, and the
reply is the first thing to reach the serial port after the boot, which had
ended there with `PICO.DRV`:

<!-- node book/capture.mjs --board pico --serial CON "CON TTY" CON -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM     
B: WORK       

A>PICO.DRV
CON: TTY: serial terminal
A>CON
CON: TTY: serial terminal
A>
```

The `CON` typed before the change, its reply and the line `CON TTY` itself
went to the PICO9918's screen, as did everything after `PICO.DRV` up to the
change.

A display driver takes the console by the same route. When the loader has
installed a driver whose page holds a video table, `DRVGO` writes the mode
into the IOBYTE's field and sets `CONACT` to `FFh`, a value no field has, so
that the `CONSEL` it calls next switches (`src/glcd.asm:65-93`). `PICO.DRV`
always takes the console; `GLCD.DRV` takes it only when `PICO.DRV` is not in.

## Console input

`CONIN` and `CONST` share one byte of buffer: `RXFULL` and `RXCHAR`, at
`0042h` and `0043h`. Whatever produces a character, the serial receiver or
the keyboard scan, puts it in `RXCHAR` and sets `RXFULL`, and `CONIN` returns
it from there (`src/console.asm:166-171`).

`BCONST` reports a character ready when `RXFULL` is set. Otherwise it looks
once: on a video console it scans the whole keyboard, and on the serial
terminal it reads the serial input up to `RXPOLL` times, 77, which at 38
T-states a poll covers three and a half bit times, and receives the byte if a
start bit comes in that time (`src/console.asm:117-146`). The table's `CONST`
entry is `BCONSTC`, which also draws the cursor on a video console when
nothing is ready, since a program that polls is waiting for a key; the BDOS's
own check for `^S` while it prints calls `BCONST` directly and draws nothing
(`src/console.asm:104-115`).

`BCONIN` waits (`src/console.asm:148-190`). On a video console it shows the
cursor, scans the keyboard one row at a time until a key is delivered, takes
the key and hides the cursor. On the serial terminal it loops reading port
`03h` until bit 7 goes low, the start bit, and receives the byte. Bit 7 of
every serial byte is cleared, and a `NUL` is skipped, because the Debug80 model
sends one ahead of its first input byte (`src/console.asm:148-149`). Each wait
for the serial input reads port `00h` first: on the board that port is the hex
keypad's encoder and the read does nothing, and on the model it lets a queued
input byte start (`src/console.asm:18-19`).

## The serial port

The TEC-1G has no UART. TEC-OS sends on bit 6 of port `01h`, the port that
also selects the 7-segment digits, and receives on bit 7 of port `03h`
(`src/layout.asm:10-11`), and its code times each bit by counting T-states.
The settings are 4800 baud, 8 data bits, no parity and 2 stop bits
(`src/console.asm:15-16`).

`TXBYTE` sends a byte (`src/console.asm:218-236`). Its loop runs nine times,
for the start bit and the eight data bits from the lowest; each pass turns
the carry into `00h` or `40h` with `SBC A,A` and `AND 40h`, writes the port,
waits `TXDLY` passes of a 16-T-state delay and shifts the next bit into the
carry. A pass takes 49 + 16 × `TXDLY` T-states, and with `TXDLY` at 49 that
is 833, one bit at 4800 baud from a 4 MHz clock. The stop bits are the line
held high for `TXSTOP` passes, 105. On the model a whole character takes
9,217 T-states, so the serial terminal shows about 430 characters a second.

`RXBITS` receives one (`src/console.asm:192-206`). It is called just after a
poll has seen the start bit, and it waits `RXHALF` passes, 74, to reach the
middle of the first data bit; then it samples the line eight times, shifting
each sample into `C`, with `RXDLY`, 50, passes between samples. A pass of its
loop takes 38 + 16 × `RXDLY` T-states, 838. The polling loops that look for
the start bit take 38 T-states a pass, so the edge can be up to 38 T-states
old when it is seen, and `RXHALF` is reduced by half of that, to centre the
samples on the bits (`src/console.asm:22-23`, `tools/build.mjs:40-47`). The
counts come from the build, as Chapter 12 describes, and they hold only for
a 4 MHz clock: on a board, the CPU clock switch has to be on FAST.

The serial input has no hardware buffer, so a byte is received only if a
routine is polling for its start bit when it comes (`src/console.asm:17-18`).
A byte that comes while TEC-OS is doing something else is lost, and text sent
to TEC-OS from a PC reaches it whole only as fast as the program reading it
calls `CONIN` or `READER`.

## The matrix keyboard

The matrix keyboard is read through port `FEh`. An `IN A,(C)` with `C` at
`FEh` puts `B` on the high half of the address bus, and the low bit in `B`
selects one of eight rows; the byte read has a low bit for each key down in
that row. Key number k is row k / 8, bit k mod 8. Keys 0, 1 and 2 are Shift,
Ctrl and Fn, keys 3 to 6 are the arrows, and key 7 is Caps Lock
(`src/console.asm:291-295`). TEC-OS reads the keyboard only when the board's
Matrix switch was on at cold boot: `CONINIT` copies bit 0 of port `03h` into
`CONDEV`'s bit `CDMTX` (`src/console.asm:41-43`), and `KBPOLL` returns at once
without it (`src/console.asm:299-301`).

`KBSTEP` reads one row each time it is called (`src/console.asm:311-342`).
`KBMASK` holds the row's select byte, rotated left after each row, and
`KBBASE` the number of the row's first key. For each key down it moves the
last key seen, `KBE`, into `KBD` and records the new one in `KBE`, so after a
scan `KBE` holds the highest-numbered key down and `KBD` the one below it.
After the eighth row `KBEVAL` evaluates the scan (`src/console.asm:343-391`). A key
that is still the one held at the last scan, `KBLAST`, gives nothing, so a
key is delivered once when it goes down and holding it does not repeat. A
second key down must be a modifier, since modifiers have the lowest numbers;
a modifier alone gives nothing. Caps Lock toggles bit 7 of the latch and of
`LATCHV`. An arrow becomes the three bytes `ESC`, `[` and `A`, `B`, `D` or
`C`, the first delivered at once and the other two kept in `KBT1` and
`KBT2` for the next two calls of `CONIN`. Any other key goes through
`KBASCII` (`src/console.asm:399-454`), which looks it up: Return, Esc,
space, quote and backslash from a table of plain and shifted values; digits
and punctuation with their shifted forms from `KBSHIFT`; letters in lower
case, in upper case with Shift or Caps Lock, and as control codes 01h to
1Ah with Ctrl.

`CONIN` calls `KBSTEP` in a loop, a row at a time, and `CONST` calls
`KBPOLL`, which runs the eight steps of one full scan
(`src/console.asm:159-160`, `src/console.asm:297-309`).

## The video terminal

On a video console every character of output goes through `VTOUT`, a terminal
emulator of the VT100's kind (`src/term.asm:1-21`). The serial terminal gets
no such treatment: `BCONOUT` sends its bytes untouched and the terminal
program on the PC interprets them. `BCONOUT` itself is short
(`src/console.asm:208-217`): after `CONSEL` it drops the character if a
program has claimed the PICO9918 and it is the console, goes to `VTOUT` for
`CRT:` and `UC1:`, returns with the character dropped for `BAT:`, whose
output goes to the list device and so is discarded, and sends to the serial
port for `TTY:`.

`VTOUT` keeps the cursor in `VROW` and `VCOL` in page zero and draws through
the driver's vectors: `VPUT` puts a character at a row and column, `VGET`
reads one back, `VCLREOL` clears from a column to the end of its row, and
`VRDROW` and `VWRROW` copy a whole row to and from the 80-byte `LINEBUF`
(`src/video.asm:1-24`). A printable character, `20h` to `7Eh`, goes at the
cursor with `VATTR`, `80h` while reverse video is on, added to it; the
display's font draws codes `80h` to `FFh` as the reverse images of `00h` to
`7Fh` (`src/term.asm:15-16`, `src/term.asm:33-34`). A character in the last
column leaves the cursor one past the edge, and the line wraps only when
another printable character comes, as on a VT100 (`src/term.asm:5-6`,
`src/term.asm:36-53`). Bytes from `7Fh` up are dropped. The control
characters it acts on are `CR`, `LF`, `BS`, `HT` with stops every eight
columns, `FF`, which clears the screen and homes the cursor, and `ESC`
(`src/term.asm:55-98`).

An `LF` on the last row of the scroll region scrolls the region up a line,
which is a delete of the region's top line (`src/term.asm:100-115`). Lines
move through `LINEBUF`: each row is read into it and written back one row
higher, and the freed row is cleared (`src/term.asm:489-524`). Below the
region, an `LF` moves the cursor down and stops at the screen's last row.

The escape parser keeps its state in `ESCST` at `004Ah`: 0 normally, 1 after
`ESC`, 2 while reading the first number and 3 while reading the second, which
starts at a `;` (`src/term.asm:137-178`). `ESC` and `[` start a sequence; any
other byte after `ESC` ends it. Digits build the current number in a byte. A
`?` and any other byte below `40h` are skipped, so a private or unknown
sequence is read to its end. The byte that ends the sequence selects the
action (`src/term.asm:179-214`):

| Sequence | Action |
| --- | --- |
| `ESC [ n A`, `B`, `C`, `D` | the cursor up, down, right or left n, at least 1, stopping at the edge |
| `ESC [ r ; c H` or `f` | the cursor to row r, column c, counted from 1 |
| `ESC [ J` | clear to the end of the screen |
| `ESC [ 2 J` | clear the screen |
| `ESC [ K` | clear to the end of the line |
| `ESC [ 0 m`, `ESC [ 7 m` | normal or reverse video |
| `ESC [ n @`, `ESC [ n P` | insert or delete n characters at the cursor |
| `ESC [ n L`, `ESC [ n M` | insert or delete n lines at the cursor's row, in the scroll region |
| `ESC [ t ; b r` | the scroll region from row t to row b, and the cursor home |

Any other final byte ends the sequence with nothing done. Inserts and deletes
of characters edit the cursor's row in `LINEBUF` and write it back as one
row (`src/term.asm:339-429`); a scroll region must cover at least two rows,
or the sequence is ignored (`src/term.asm:216-245`).

The cursor is the cell at `VROW` and `VCOL` drawn in reverse, by reading the
cell with `VGET`, flipping bit 7 and writing it back with `VPUT`
(`src/term.asm:546-576`). `VCURV` records whether it is drawn. It is shown
only while input is awaited, by `CONIN` and by `CONST` when nothing is ready,
and the next character of output removes it first, so that output does not
pay for drawing a cursor on every character (`src/term.asm:16-17`,
`src/term.asm:24`). There is no cursor cell while a wrap is pending.

## The video drivers and ABIGLCD

The terminal's code is in the ROM, and the drivers for the two displays are
on the card. `PICO.DRV`, in its three widths, and `GLCD.DRV` each give the
ROM a table through `ABIGLCD`, the jump at `C012h`, which goes to `GLHOOK`
(`src/abi.asm:15-16`, `src/glcd.asm:1-10`). The table is eight words: the
six terminal vectors `VPUT`, `VGET`, `VCLREOL`, `VREST`, `VRDROW` and
`VWRROW`, a seventh for the PICO9918's page functions, and a last word
holding the screen's columns and rows.

`GLHOOK` takes the mode in `A`, `CMCRT` for the PICO9918 or `CMUC1` for the
graphics LCD, and the table's address in `HL` (`src/glcd.asm:11-33`). It
keeps the address in `PIVEC` or `GLVEC`, above the RAM BIOS table, and returns
`HL` pointing at `LINEBUF`, the buffer that the driver's row routines use.
It sets carry and changes nothing when there is no matrix keyboard or the
display already has a table. With `HL` 0 it drops the display's table, which a driver's `REMOVE`
does, and it sets the mode back to the serial terminal and `CONACT` to `FFh`,
so that the next console call selects the console again from the IOBYTE
(`src/glcd.asm:34-48`).

The seventh vector carries three functions that only the PICO9918's driver
needs (`src/video.asm:26-45`). Function 0 shows the page the terminal has
drawn, and `CONST` and `CONIN` call it, so that by the time a program waits
for a key the screen shows what it drew (`src/console.asm:118`, `src/console.asm:151`);
functions 1 and 2 begin and end a move of rows, around a scroll or a line
insert or delete (`src/term.asm:465`, `src/term.asm:524`). The terminal calls
them only when the console is the PICO9918 and no program has claimed it.

A program claims the PICO9918 through the hardware services, to draw on it
directly (`src/hwsvc.asm:134-150`). While it is claimed and is the console,
`VTOWN` reports it, and the terminal leaves the display alone: `BCONOUT` drops
output, and there is no cursor and no page flip (`src/term.asm:533-544`). The
claim ends with the service's release or at warm boot, when `HWVREL` gives the
display back to the driver (`src/boot.asm:74`).

The ROM's own part of the PICO9918 is the probe at cold boot. `TMSINIT`
writes `5Ah` to video RAM address `3FFFh` through ports `BFh` and `BEh`,
reads it back, and does the same with `A5h`; if both come back, `VIDINIT`
sets `CDTMS` in `CONDEV` (`src/tms.asm:1-30`, `src/video.asm:7-11`).

## The 20 × 4 LCD

The character LCD is an HD44780 on port `04h` for commands and `84h` for data
(`src/lcd.asm:1-6`). `LCDINIT` sends four commands, `38h`, `0Ch`, `06h` and
`01h`: eight-bit interface with two-line addressing, display on with no
cursor, the address moving right after each character, and clear
(`src/lcd.asm:8-15`, `src/data2.asm:4`). Before each command or character
`LCDWAIT` reads the busy flag, bit 7 of port `04h`, at most 256 times, so a
board with no LCD costs only that wait and no hang (`src/lcd.asm:17-25`).
The rows start at display addresses `80h`, `C0h`, `94h` and `D4h`
(`src/data2.asm:6`), and `LCDROW` writes a string from column 0 of a row
(`src/lcd.asm:45-66`).

Cold boot writes `TEC-OS 0.1  TEC-1G` on row 0 and the letters and labels
of drives A and B on rows 1 and 2; drives C and D have no row
(`src/boot.asm:34-36`, `src/boot.asm:50`, `src/lcd.asm:67-104`). Row 3 is for one of three words that TEC-OS shows when
a board may have no terminal to show a message on: `CARD?` at the diagnostic
prompt (`src/diag.asm:7-8`), `GLCD?` when `CON UC1` can't load `GLCD.DRV`
(`src/cpm/ccp.asm:1025`, `src/glcd.asm:49-63`), and `PICO?` when a board
with a PICO9918 reaches its first prompt with no display driver
(`src/drv.asm:423-424`). Writing `PICO?` or `GLCD?` sets `CDWRD` in
`CONDEV` (`src/lcd.asm:34-39`), and `WRDCLR` writes blanks over the row only
while that bit is set, so that a word TEC-OS wrote is cleared when a display
driver is installed and a row a program wrote is left alone
(`src/glcd.asm:95-107`). The LCD is never the
console; programs reach it through the hardware services, as Chapter 9
describes.
