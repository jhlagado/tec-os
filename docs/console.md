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
| ST7920 GLCD, 128 × 64 | out | — | Planned |
| HD44780 LCD, 20 × 4 | out | — | Planned |
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

Other escape sequences are read and ignored. Characters 80h–FFh in the
display's pattern table are reverse images of 00h–7Fh; the cursor is drawn as
the reverse image of the cell under it.

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
