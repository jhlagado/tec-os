# Console

The console is a set of devices rather than one port. Input comes from the
serial port and, when enabled, the matrix keyboard. Output goes to the serial
port and, when one is present, a video display. Programs see one CP/M
console either way.

| Device | Direction | Enabled when | Status |
| --- | --- | --- | --- |
| FTDI serial, 4800 8N2 | in, out | always | Implemented |
| Matrix keyboard | in | the board's Matrix configuration switch (port 03h bit 0) is on | Implemented |
| TMS9918/TMS9929, 40 × 24 text | out | the card answers at ports BEh/BFh | Implemented |
| TMS9918/TMS9929, 32 × 24 Graphics I | out | as above, with the `debug80g32` profile | Implemented |
| ST7920 GLCD, 128 × 64 as 21 × 8 | out | when no TMS9918 answers and the controller's busy flag clears | Implemented |
| HD44780 LCD, 20 × 4 | status only | always | Banner and mounted drives at cold boot; not a console device |
| V9938, 80 × 24 TEXT2 | out | — | Planned; needs Debug80 emulation first |

## Video terminal

Serial output is passed through unchanged, so a terminal program on the PC
does its own interpretation. On a video display TEC-OS interprets this
subset:

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

Other escape sequences are read and ignored. Characters 80h–FFh are reverse
images of 00h–7Fh. The cursor is the reverse image of the cell under it and
is shown only while TEC-OS waits for console input, so output never pays for
redrawing it. A character written in the last column leaves the cursor past
the edge; the line wraps only when another printable character follows, as
on a VT100, so a full-width line followed by CR LF does not leave a blank
line.

## Choosing the display

At cold boot TEC-OS uses the TMS9918 when VRAM answers at ports BEh/BFh, and
otherwise the GLCD when its busy flag clears. The terminal reaches the chosen
display through four driver vectors (put, get, clear to end of line, scroll),
so another display needs only those four routines and an initialiser.

## GLCD

The ST7920 runs in its extended instruction set with graphics on. TEC-OS
keeps the 168 characters on screen in RAM and draws each 16-pixel graphics
word by composing the glyph rows of the two to four 6-pixel cells that
overlap it, so no 1 KiB pixel buffer is needed. Writing a character redraws
the words its cell touches; scrolling redraws the screen, about 0.25 s at
4 MHz. Every access waits for the busy flag, bounded at 256 polls.

The CCP's `TYPE` and `DIR` use the display size to pause with `[more]` one
line short of a full screen (decision D19).

The display size is published in the ABI table at `FF00h` (word at `FF09h`
points to columns, then rows), so programs such as an editor can lay out
their screen without being rebuilt for each display.

The font is `format/font5x7.txt`, an original 5 × 7 design in 8-pixel rows.

## Matrix keyboard

Keys follow the TEC-1G matrix layout as Debug80 documents it: key k is row
k / 8, bit k % 8 of port FEh. Keys 0, 1 and 2 are Shift, Ctrl and Fn; key 7
toggles Caps Lock, shown on the latch's CAPS lamp. A key is delivered once
when it goes down; holding it does not repeat.

## Polling and timing

There is no interrupt or receive buffer. While waiting for input TEC-OS polls
the serial line continuously and scans one keyboard row every eighth poll. A
row scan can delay start-bit detection by up to about 280 T-states, so the
receiver samples earlier in each bit to keep every sample between a third and
two thirds of the bit. Input typed while a program is busy and not polling is
lost.
