# Console

The console is one device at a time, chosen by the CP/M IOBYTE's `CON:`
field at `0003h`:

| IOBYTE CON: | Device | Keys from | Output to | Size at `0048h` |
| --- | --- | --- | --- | --- |
| `TTY:` (0) | Serial terminal | Serial | Serial | 0 × 0 (programs assume 80 × 24) |
| `CRT:` (1) | PICO9918 | Matrix keyboard | PICO9918 | 80, 40 or 32 × 24, by the driver |
| `BAT:` (2) | CP/M batch | Reader (serial) | List (discarded) | 0 × 0 |
| `UC1:` (3) | GLCD | Matrix keyboard | GLCD | 21 × 8 |

Cold boot starts on `TTY:`, and a display driver's load takes the console:
`PICO.DRV` always, `GLCD.DRV` unless `PICO.DRV` is in.
The CCP's `CON` command shows the console in use; `CON TTY`, `CON CRT`,
`CON BAT` and `CON UC1` (a colon may follow) change it, as `STAT CON:=CRT:`
or any program writing the IOBYTE does. The BIOS acts on a change at the
next console call: it clears and homes the new screen. `CRT:` or `UC1:`
without its display or the keyboard falls back to the serial terminal, so
there is always a console. The 20 × 4 LCD is never the console.

| Device | Direction | Present when | Status |
| --- | --- | --- | --- |
| FTDI serial, 4800 8N2 | in, out | always | Implemented |
| Matrix keyboard | in | the board's Matrix configuration switch (port 03h bit 0) is on | Implemented |
| PICO9918, 80 × 24 text (TEXT80) | out | the card answers at ports BEh/BFh; `PICO.DRV` | Implemented |
| PICO9918, 40 × 24 text | out | as above, with `PICO40.DRV` | Implemented |
| PICO9918, 32 × 24 Graphics I | out | as above, with `PICO32.DRV` | Implemented |
| ST7920 GLCD, 128 × 64 as 21 × 8 | out | the controller's busy flag clears | Implemented |
| HD44780 LCD, 20 × 4 | status only | always | Banner and mounted drives at cold boot; not a console device |

## Video terminal

On the serial terminal, output is passed through unchanged and the terminal
program on the PC does its own interpretation. On a video display TEC-OS
interprets this subset:

| Bytes | Effect |
| --- | --- |
| 20h–7Eh | Character at the cursor; wraps at the right edge |
| CR, LF, BS | Column 0; next line, scrolling at the bottom; left one column |
| HT | Next multiple of 8 |
| FF | Clear the screen and home the cursor |
| `ESC [ n A`, `B`, `C`, `D` | Cursor up, down, right, left n (default 1), clamped |
| `ESC [ r ; c H`, `f` | Cursor to row r, column c, 1-based |
| `ESC [ J`, `ESC [ 2 J` | Clear to the end of the screen; clear the screen |
| `ESC [ K` | Clear to the end of the line |
| `ESC [ 7 m`, `ESC [ 0 m` | Reverse video on; off |
| `ESC [ n @`, `ESC [ n P` | Insert n blanks, or delete n characters, at the cursor; the rest of the line moves |
| `ESC [ t ; b r`, `ESC [ r` | Scroll region rows t to b; the whole screen; the cursor goes home |
| `ESC [ n L`, `ESC [ n M` | Insert or delete n lines at the cursor row within the scroll region; the rows below it move, and the cursor goes to column 1 |

A line feed at the bottom of the scroll region scrolls the region; below the
region it stops at the last row. The region resets to the whole screen when
the console changes and at warm boot.

Other escape sequences are read and ignored. Characters 80h–FFh are reverse
images of 00h–7Fh. The cursor is the reverse image of the cell under it. It
is drawn while a program waits for a key, through BIOS `CONIN` or by polling
BIOS `CONST` (as BDOS functions 6 and 11 do), and removed by the next output,
so output never pays for redrawing it. The BDOS's own check for `^S` during
output does not draw it.

Insert and delete move whole rows inside the display. On the PICO9918 a row
is read and written back as one block of VRAM transfers, so inserting a
character near the start of an 80-column line costs a few thousand T-states
instead of a redraw.

Moving rows (line insert and delete, and scrolling) takes longer than one
video frame, so on the PICO9918 it is done out of sight. The card's VRAM
holds two name tables (`1000h` and `2000h` at 80 columns, `0800h` and `0C00h`
otherwise). The first move after the screen was last shown is built in the
hidden table, copying the rows that do not move; later output goes there too.
The hidden table is shown, by one write to register 2, when a program asks
for a key through BIOS `CONST` or `CONIN`, which includes the BDOS's check for
`^S` after each character it prints. A second move before that shows the first
one first, so output is never more than one move behind. The effect is that a
scroll appears in one frame instead of sweeping down the screen. A character written in the last column leaves the cursor past
the edge; the line wraps only when another printable character follows, as
on a VT100, so a full-width line followed by CR LF does not leave a blank
line.

## Displays

The video card is always a PICO9918. At cold boot the ROM records whether VRAM
answers at ports BEh/BFh, and programs nothing: each display's console is a
driver. Until one is in, output goes to the serial terminal and the LCD. The
terminal reaches the display in use through the driver's table, so another
display needs only those routines. `docs/drivers.md` has the rules.

The PICO9918's console is `PICO.DRV`, `PICO40.DRV` or `PICO32.DRV`, one file a
width, which the startup line chooses. It takes six pages below the BDOS entry,
so `(0006h)` is 1,536 bytes lower, with its own font and the graphics entries. It refuses with no PICO9918 and with no matrix
keyboard, and a board with no matrix keyboard therefore has an unprogrammed VDP
until a program claims it. Its `REMOVE` refuses while it is the console, since
`CON CRT` has no load, and while the PICO9918 is claimed. Warm boot restores the mode of
the display in use (see [compatibility.md](compatibility.md)).

## GLCD

The GLCD console is a driver, `GLCD.DRV` on the starter card, not part of
the ROM. Its code, its screen text and its font take six pages just below the
BDOS entry, so on a board that loads it `(0006h)` is 1,536 bytes lower; a board
without a GLCD loses nothing. Its INIT hands the terminal its six video
routines through `ABIGLCD` in the table at `C003h`, and the terminal calls them directly, on the
caller's stack (see [rom-services.md](rom-services.md)). On a board with a GLCD, the matrix
keyboard and no PICO9918, cold boot shows its banner and volumes on the
serial terminal and the 20 × 4 LCD, and a `STARTUP.CMD` line naming
`GLCD.DRV` installs it and makes the GLCD the console; with no such line the
console stays serial, and the matrix keyboard isn't read. `CON UC1:` loads it
too, and shows `GLCD?` on the LCD if it can't. On a board with both displays
the line gives way to `PICO.DRV`, and only `CON UC1:` installs it; the two
together cost 3,072 TPA bytes. A board without a GLCD or a matrix keyboard refuses
it, leaving nothing behind. Warm boot keeps it; `UNLOAD`, when it is the lowest
resident, removes it, and the console goes back to `CRT:` if `PICO.DRV` is in and
to serial if not.

The ST7920 runs in its extended instruction set with graphics on. The
driver keeps the 168 characters on screen and draws each 16-pixel graphics
word by composing the glyph rows of the two to four 6-pixel cells that
overlap it, so no 1 KiB pixel buffer is needed. Writing a character redraws
the words its cell touches; scrolling moves the text and redraws each row,
about 0.25 s at 4 MHz. Every access waits for the busy flag, bounded at 256 polls.

The CCP's `TYPE` and `DIR` use the display size to pause with `[more]` one
line short of a full screen.

The display size is published in the table at `C003h` (the word at
`ABIVID`, `C008h`, points to columns, then rows), so programs such as an editor can lay out
their screen without being rebuilt for each display.

The font is `format/font5x7.txt`, an original 5 × 7 design in 8-pixel rows. The
ROM holds none: each display driver carries its own copy, `drivers/font.asm`, as
the diagnostics ROM does, and the build checks it against that file.

## Matrix keyboard

Keys follow the TEC-1G matrix layout as Debug80 documents it: key k is row
k / 8, bit k % 8 of port FEh. Keys 0, 1 and 2 are Shift, Ctrl and Fn; key 7
toggles Caps Lock, shown on the latch's CAPS lamp. Keys 3–6 are the arrow
keys; TEC-OS delivers them as `ESC [ A`, `ESC [ B`, `ESC [ D` and `ESC [ C`
(up, down, left, right), the sequences ANSI-terminal programs such as Edit
expect, so the up arrow no longer reads as ^C. A key is delivered once when
it goes down; holding it does not repeat.

## Polling and timing

There is no interrupt or receive buffer. On the serial terminal TEC-OS polls
the serial line continuously while waiting for input; a start bit is seen at
most 38 T-states late, and the receiver allows for half of that. On `CRT:`
and `UC1:` it scans the matrix keyboard and does not poll the serial line.
Input typed while a program is busy and not polling is lost.
