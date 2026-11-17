# Console

The LCD console changes in this branch are a prototype awaiting the combined
build and emulator qualification. Physical LCD readback, timing and the future
controller wiring still require board checks.

The console is selected through the CP/M IOBYTE CON field at `0003h`.
UC1 has a separate auxiliary selection for the ROM LCD or a registered driver.
Selecting the LCD leaves the GLCD driver resident and registered.

| IOBYTE CON | Device | Keyboard | Size from INFO |
| --- | --- | --- | --- |
| TTY (0) | Serial terminal | Serial | 0 × 0 |
| CRT (1) | PICO9918 | Matrix | 80, 40 or 32 × 24 |
| BAT (2) | Serial reader, discarded output | Serial | 0 × 0 |
| UC1 (3), LCD selected | Character LCD | Matrix | 20 × 4, or configured 40 × 4 |
| UC1 (3), GLCD selected | Registered GLCD driver | Matrix | 21 × 8 |

A reset with the Matrix switch on starts on the LCD even when PICO9918 is
present. The serial line receives the banner. Before card access the LCD shows
`L=LCD C=CRT S=TTY`. L or an unanswered choice keeps LCD. C requests PICO
and S requests serial. A missing PICO leaves LCD selected. Fn or a keypad key
held through reset skips the choice and STARTUP.CMD. The bypass is latched
before mounting, so releasing the key during card access does not run the script.
The Matrix switch off at reset starts on serial.

CON reports the effective IOBYTE mode. The selection forms are:

| Command | Effect |
| --- | --- |
| CON LCD | Select the ROM LCD and retain its profile |
| CON UC1 | Select a registered auxiliary table, otherwise ROM LCD. Load no file |
| CON LCD 20 | Select the original 20-column profile |
| CON LCD 40 | Probe the experimental second controller, then select 40 columns if both controllers are independent |
| CON GLCD | Load or reuse GLCD.SVC and select its registered table |
| CON CRT or CON PICO | Select PICO at its retained width |
| CON PICO 80, 40 or 32 | Select PICO at that width |
| CON TTY | Select serial input and output |
| CON BAT | Select serial input with ordinary output discarded |

BAT confirmation feedback goes temporarily to serial. Its ordinary output
remains discarded and its IOBYTE field stays BAT.

A colon may follow a console name. A typed CON or STARTUP.CMD selection that
changes the device or width displays `Press a key` on the target. A fresh key
from its keyboard keeps the change. An unanswered question restores the
previous device, PICO width and LCD profile. The intended interval is about
ten seconds at 4 MHz and remains subject to timing qualification. The former
screen is restored and cleared. No previous bitmap is retained.

The command's Enter key, buffered characters and arrow tails cannot confirm.
Serial confirmation begins after the question finishes transmitting and after
an idle interval. NULs, bad frames and a low line use the same finite budget.
Escape-prefixed CSI and SS3 actions retain input for the whole remaining
question budget, including delayed suffixes. A bare Escape or incomplete
action times out and restores the former console. CR confirmation accepts
an optional LF only within sixteen subsequent poll slots. A later LF is
ordinary input. The poll-slot interval still needs timing qualification.
An identical selection and a report-only CON need no question. Invalid syntax,
invalid width, unavailable PICO and a held PICO claim leave the route intact.
A failed GLCD load restores the former route.

Programs writing IOBYTE retain the immediate interface. The next console call
applies its CON field without a question or a driver load. UC1 uses the retained
auxiliary selection. CRT with no available PICO, or UC1 without the matrix
keyboard, falls back to serial. The other six IOBYTE bits are preserved.

Fn+Space cycles LCD, available PICO and loaded GLCD, then returns to LCD.
A claimed PICO is skipped as a destination. The key is consumed and the partial
command line is retained. Control-R redraws that line on the newly cleared
screen. Serial is excluded from this cycle and matrix scanning is not added
to its input path. The hotkey works while the OS polls the matrix keyboard.
A program retaining the CPU or reading raw ports cannot be interrupted this way.

| Device | Direction | Availability |
| --- | --- | --- |
| FTDI serial, 4800 8N2 | input and output | Always |
| Matrix keyboard | input | Matrix switch, port 03h bit 0 |
| PICO9918 text and Graphics I | output | Controller at BEh/BFh and matrix keyboard |
| ST7920 GLCD, 21 × 8 | output | GLCD.SVC installed and controller ready |
| HD44780 LCD, 20 × 4 | output | Original panel at 04h/84h |
| HD44780 LCD, 40 × 4 | output | Explicit experimental profile, two independent controllers |

## LCD profiles

Both profiles have four rows. Reset always uses 20 columns and never probes
or writes the second-controller ports. CON LCD 40 explicitly permits probing
0Ch and 8Ch. That pair is board-unqualified and requires matching hardware
decode. A failed proof prints `LCD40?` on the previous console without
publishing 40-column geometry. A successful request still needs confirmation.
CON LCD 20 returns to the first controller and turns off the second cursor.
An omitted width retains the selected profile. Warm boot retains it and reset
returns to 20 columns before processing startup commands again.

On a physical 40-column module, the 20-column recovery profile can occupy two
physical rows as four logical rows. It is not a four-row window on that panel.
Scrolling reads the panel's display memory into LINEBUF and writes rows back.
It therefore needs data-port readback to work on the board. Status writers
and TNLCD leave an active LCD console alone. TNLCD retains its twenty-byte
raw-row interface when the console is elsewhere.

The LCD uses its hardware character set, plain text in place of reverse video
and a hardware cursor. Under the shell the pager displays three text rows
before `[more]`. The 20-column directory row contains a contiguous filename
and its size. Long summaries wrap. Programs requiring more rows or graphics
need another display.

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
| `ESC [ J`, `ESC [ 2 J` | Clear to the end of the screen; clear the screen. `ESC [ 1 J`, or any parameter but 2, also clears to the end of the screen |
| `ESC [ K` | Clear to the end of the line. `ESC [ 1 K` and `ESC [ 2 K` do the same: any parameter clears to the end of the line |
| `ESC [ 7 m`, `ESC [ 0 m` | Reverse video on; off |
| `ESC [ n @`, `ESC [ n P` | Insert n blanks, or delete n characters, at the cursor; the rest of the line moves |
| `ESC [ t ; b r`, `ESC [ r` | Scroll region rows t to b; the whole screen; the cursor goes home |
| `ESC [ n L`, `ESC [ n M` | Insert or delete n lines at the cursor row within the scroll region; the rows below it move, and the cursor goes to column 1 |

A line feed at the bottom of the scroll region scrolls the region; below the
region it stops at the last row. The region resets to the whole screen when
the console changes and at warm boot.

Other escape sequences are read and ignored. `VTOUT` drops output bytes 7Fh to
FFh. A cell holding 80h–FFh shows the reverse image of 00h–7Fh. The cursor is the reverse image of the cell under it. It
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
answers at ports BEh/BFh. The terminal reaches the display in use through a
table of its routines, so another display needs only those routines.
`docs/services.md` has the rules.

The PICO9918 console is in ROM and supports 80-column and 40-column text,
plus 32-column Graphics I. Cold boot prepares its table at 40 columns when
the VDP and matrix keyboard are present. The LCD remains selected until the
user chooses PICO. Its table, registry record and state occupy the BIOS's
95-byte PIBLK. With the matrix switch off the console remains serial and no
PICO console table is installed. Warm boot restores the selected display.

## GLCD

The GLCD console is GLCD.SVC, a resident driver occupying three pages below
the BDOS entry. A direct load selects GLCD unless CRT is active. A startup
GLCD.SVC line while CRT is active is skipped quietly. CON GLCD explicitly
loads or reuses the driver and requests its selection. CON UC1 selects an
already registered auxiliary table, or ROM LCD when no table exists. It
loads no file.

Startup TNDRVR registration preserves the chosen base console. Ordinary
registration restores UC1 install/select/use behaviour: an active UC1 route
selects the new table, while TTY and CRT retain their current device. Removing the active driver
returns UC1 to LCD. Removing it while LCD is selected keeps LCD selected.
A saved console transaction identifies the former live installation. Dropping
that driver invalidates the identity, so rollback cannot call reclaimed code
or select another installation merely because it reused the address.

The ST7920 runs in its extended instruction set with graphics on. The
driver keeps the 168 characters on screen and draws each 16-pixel graphics
word by composing the glyph rows of the two to four 6-pixel cells that
overlap it, so no 1 KiB pixel buffer is needed. Writing a character redraws
the words its cell touches. Scrolling moves the text and redraws each row.
Every access waits for the busy flag, bounded at 256 polls;
a byte the controller is not ready for by then is dropped, not sent.

Under `SHELL.SVC`, `TYPE` and `DIR` use the display size, from `TNINFO`, to pause
with `[more]` one line short of a full screen ([shell.md](shell.md)). With no
shell they list without pausing.

The display size is published in the table at `C003h` (the word at
`INFO`, service 0, returns columns in L and rows in H), so programs such as an editor can lay out
their screen without being rebuilt for each display.

The font is `format/font5x7.txt`, TEC Compact in the existing five-cell, eight-row encoding. The
ROM holds one copy, built from that file and packed four bytes a glyph, and the ROM's
PICO9918 console and the GLCD's driver draw from it; the driver asks for each glyph it
draws with `TNGLYPH`, service 17.

## Matrix keyboard

The key translation gives no `]`, `}`, `` ` `` or `~`: the key after Z gives `{`
and `[`, and Ctrl gives Esc. Keys follow the TEC-1G matrix layout as Debug80 documents it: key k is row
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
Input typed while a program is busy and not polling is lost. Console
confirmation uses a separate bounded receiver so an endless NUL stream
cannot suspend its timeout.

The cold PICO9918 working width is 40. Explicit 32/40/80 selection and warm width preservation remain supported. Bare CON CRT/PICO retains the selected width.

See [FONT-NOTICES](../format/FONT-NOTICES.txt) for the complete X11/Spleen notices, deliberate edits, recoverable original and unresolved legacy-glyph origin.
