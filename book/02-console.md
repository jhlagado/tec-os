# 2. The console

Checked against TEC-OS 98c6416.

The console is the device you type commands on and read TEC-OS's replies
from. A TEC-1G can carry a serial terminal, a PICO9918 video card and a
graphics LCD at once, and TEC-OS uses one of them as the console at a time.
This chapter describes the four console devices and the `CON` command that
moves the console between them, then the serial terminal, the display
drivers that put the console on a screen, the matrix keyboard, the keys that
edit a line and control output, and the `[more]` pause in a long listing.

## The four devices

CP/M 2.2 keeps the choice of console in the IOBYTE, the byte at address
`0003h`. Its low two bits name the console device, and CP/M gives the four
values the names `TTY:`, `CRT:`, `BAT:` and `UC1:`. TEC-OS gives each name a
device of the TEC-1G:

| Name | IOBYTE bits | Keys from | Output to |
| --- | --- | --- | --- |
| `TTY:` | 0 | serial port | serial port |
| `CRT:` | 1 | matrix keyboard | PICO9918 |
| `BAT:` | 2 | serial port | nowhere |
| `UC1:` | 3 | matrix keyboard | graphics LCD |

`TTY:` is a terminal program on a PC, connected to the board's FTDI serial
port. `CRT:` is the PICO9918 with the matrix keyboard, at 80, 40 or 32
columns and 24 rows, and `UC1:` is the 128 × 64 graphics LCD with the matrix
keyboard, which TEC-OS treats as a screen of 21 columns and 8 rows. `BAT:`
is CP/M's batch device, which in CP/M takes its input from the reader device
and sends its output to the list device; TEC-OS's reader is the serial port
and its list device discards what it is given, so on `BAT:` TEC-OS reads the
serial port and prints nothing. Chapter 8 describes the reader and the list
device.

The 20 × 4 character LCD is never the console. TEC-OS writes its version and
the drives there at cold boot, and programs write to it through the services
in Chapter 9.

Cold boot, after power-on or a reset, clears page zero, the first 256 bytes
of memory, and with it the IOBYTE, so it always starts on `TTY:`. A warm
boot, the restart of the CCP when a program ends, leaves the IOBYTE as it
was, and the console with it.

## The CON command

`CON` with no argument names the console in use, with a word about what the
device is:

<!-- node book/capture.mjs CON -->
```text
A>CON
CON: TTY: serial terminal
A>
```

The other three replies are `CON: CRT: PICO9918`, `CON: BAT: reader and
list` and `CON: UC1: GLCD`.

`CON` followed by a device name sets the IOBYTE's console bits to that
device. The names are `TTY`, `CRT`, `BAT` and `UC1`, and a colon may follow
them. The BIOS acts on the new bits at its next console call, and the first
call after the change is the one that prints `CON`'s reply, so the reply
appears on the new console. A name that isn't one of the four comes back
with a question mark:

<!-- node book/capture.mjs "CON XYZ" -->
```text
A>CON XYZ
XYZ?

A>
```

On a board with a PICO9918 and the matrix keyboard, where `PICO.DRV` has
made the PICO9918 the console, `CON TTY` typed on the matrix keyboard moves
the console to the serial terminal. The command's echo appears on the
PICO9918, and the reply and the next prompt on the PC's terminal, which
shows this:

<!-- node book/capture.mjs --board pico --serial "CON TTY" -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM     
B: WORK       

A>PICO.DRV
CON: TTY: serial terminal
A>
```

The terminal shows the boot as far as `PICO.DRV`, the line that moved the
console to the PICO9918, and then nothing more until the reply to `CON TTY`.
The PICO9918 goes on showing what was on it, but TEC-OS writes nothing more
there and stops reading the matrix keyboard. `CON CRT` typed on the PC moves
the console back. The BIOS clears a display's screen and puts the cursor at
the top left whenever the display becomes the console, so after `CON CRT`
the PICO9918 shows only the reply and the prompt:

<!-- node book/capture.mjs --board pico --screen "CON TTY" "CON CRT" -->
```text
CON: CRT: PICO9918
A>
```

`CRT:` and `UC1:` need their display, its driver and the matrix keyboard. If
any of them is missing, the BIOS uses the serial terminal, so there is
always a console. On a board with only a serial terminal, `CON CRT` sets the
IOBYTE's bits to 1 and the console stays on the serial terminal, which is
what `CON` reports:

<!-- node book/capture.mjs CON "CON CRT" "CON UC1" CON -->
```text
A>CON
CON: TTY: serial terminal
A>CON CRT
CON: TTY: serial terminal
A>CON UC1
CON: TTY: serial terminal
A>CON
CON: TTY: serial terminal
A>
```

`CON UC1` does more than set the bits. If `GLCD.DRV`, the graphics LCD's
driver, isn't installed, `CON UC1` loads it from drive A first. On a board
with both displays this is how the console reaches the graphics LCD, since
the startup file's `GLCD.DRV` line installs nothing while the PICO9918 is
the console. On the web page's board, which has both displays, the graphics
LCD shows this after `CON UC1`:

<!-- node book/capture.mjs --board pico --screen "CON UC1" CON -->
```text
CON: UC1: GLCD
A>CON
CON: UC1: GLCD
A>
```

`CON CRT` has no such load: the PICO9918's driver must be installed already,
by the startup file or by typing its name.

`BAT:` sends the console's output nowhere, so after `CON BAT` the serial
terminal shows nothing at all. TEC-OS still reads the commands typed there,
and `CON TTY` typed blind brings the console back. In this run `DIR` was
typed after `CON BAT` and ran, but its listing went nowhere, and the
terminal shows only the line before and the reply after:

<!-- node book/capture.mjs --serial "@start CON BAT" "@start DIR" "CON TTY" -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM     
B: WORK       

A>PICO.DRV
PICO.DRV?

A>GLCD.DRV
GLCD.DRV?

A>CON BAT
CON: TTY: serial terminal
A>
```

A program changes the console in the same way, by writing the IOBYTE's low
two bits, and TEC-OS acts on the change at the program's next console call.
Digital Research's `STAT CON:=CRT:` works like this, so a copy of `STAT`
from another CP/M system changes the console too.

## The serial terminal

The serial port runs at 4800 baud with 8 data bits, no parity and 2 stop
bits, and the terminal program on the PC is set the same way. TEC-OS sends
and receives each bit itself, through bit 6 of port `01h` for output and bit
7 of port `03h` for input, and it times each bit by counting the Z80's clock
cycles: one bit is 833 T-states at 4 MHz. That is why, as Chapter 1 says,
the serial link works only with the CPU clock switch on FAST and the 4 MHz
oscillator.

TEC-OS passes every byte to the serial terminal unchanged. The terminal
program does its own interpretation of control characters and escape
sequences, so a program that moves the cursor or clears the screen needs a
terminal program that follows the ANSI conventions, as most do. The serial
terminal has no size that TEC-OS can read; the CCP and programs that need
one assume 80 columns and 24 rows.

The board has no hardware to hold an incoming byte, and TEC-OS takes no
interrupt from the serial line. TEC-OS catches a byte only while it is
watching the line, which it does while a program waits for a key and for a
moment before each character the BDOS prints. A byte that arrives while
TEC-OS is doing anything else is lost. Keys typed by hand at the prompt are
caught, but text pasted into the terminal program, or typed ahead of a busy
program, can lose characters.

## A display as the console

The ROM has no code for drawing on the PICO9918 or the graphics LCD. Each
display's console is a driver, a file on the card that TEC-OS loads into
memory below the BDOS. Chapter 1 showed the starter card's startup file
installing them before the first prompt. Installing a display driver can
move the console:

- `PICO.DRV`, `PICO40.DRV` or `PICO32.DRV` makes the PICO9918 the console,
  at 80, 40 or 32 columns;
- `GLCD.DRV` makes the graphics LCD the console unless a PICO9918 driver is
  already installed, in which case the console stays where it was. While a
  display is the console, `GLCD.DRV` installs only for `CON UC1`.

Each driver installs only on a board that has its display and the matrix
keyboard, with the board's Matrix configuration switch on. On a board
without them the installation fails and the console stays where it was,
which on a board with only a serial terminal is that terminal. A display
driver takes 1,536 bytes of memory, as Chapter 1 explained, and with both
displays' drivers installed programs have 3,072 bytes less. Chapter 5 gives
the rules for the startup file and for installing and removing drivers.

On a display, TEC-OS is the terminal. It draws each character at the cursor,
moves the cursor on, and acts on the control characters and the ANSI escape
sequences that Chapter 8 lists. While TEC-OS waits for a key on a display,
the cursor is drawn as the reverse image of the character under it, and the
next character printed removes it.

## The matrix keyboard

On `CRT:` and `UC1:` keys come from the matrix keyboard, and TEC-OS doesn't
read the serial port. On `TTY:` and `BAT:` it reads only the serial port.

Three keys are modifiers, held down with another key: Shift, Ctrl and Fn.
Shift gives capital letters and the shifted symbols, and on the digit keys
the shifted symbols are those of a PC keyboard, `)` on 0, `!` on 1, `@` on 2
and so on to `(` on 9. Ctrl with a letter gives that letter's control code,
from `01h` for A to `1Ah` for Z, so Ctrl and C together is `^C`. Fn gives
the same character as the key alone. A modifier pressed alone sends nothing,
and two keys held together send nothing unless one of them is a modifier.

The Caps key turns Caps Lock on and off, and the CAPS lamp, bit 7 of the
board's system latch, lights while it is on. With Caps Lock on, the letter
keys give capitals, with Shift or without it; the other keys are unchanged.

Return sends `0Dh` and Esc `1Bh`; `^H` is backspace, `08h`, and `^I` is tab,
`09h`. The four arrow keys send the escape sequences an ANSI terminal sends
for them:

| Key | Bytes |
| --- | --- |
| Up | `ESC [ A` |
| Down | `ESC [ B` |
| Right | `ESC [ C` |
| Left | `ESC [ D` |

A program that reads the arrow keys from a PC's terminal program, such as
the starter card's editor, reads them from the matrix keyboard in the same
way. TEC-OS's translation of the keys gives no `]`, `}`, `` ` `` or `~`.

A key is sent once, when it goes down, and holding it doesn't repeat it.
TEC-OS scans the keyboard while it waits for a key and when the BDOS checks
for one during output, so a key pressed and released while a program is busy
elsewhere is lost.

## Keys at the prompt

The CCP reads each command line with BDOS function 10, CP/M's line input,
which gives the keys that edit a line before Return ends it:

| Key | Effect |
| --- | --- |
| `^H`, backspace | Removes the last character, rubbing it out on the screen |
| Delete, `7Fh` | Removes the last character and prints it again, as CP/M 2.2 does on a printing terminal |
| `^X` | Removes the whole line, rubbing it out |
| `^U` | Removes the whole line, prints `#` and starts a new line |
| `^R` | Prints `#` and the line so far again on a new line |
| `^E` | Starts a new line on the screen and leaves the line being typed as it was |
| `^C` | As the first key of a line, prints `^C` and runs a warm boot |
| `^P` | Turns the copy of console output to the list device on or off |
| `^W`, `^N` | Bring back an earlier command line, at the prompt only |

Return or `^J` ends the line, and so does a full line: the CCP's line holds
127 characters. A `^C` anywhere but at the start of the line is ignored, and
in a line read by a program `^W` and `^N` are characters like any other.
Chapter 3 describes the history of command lines behind `^W` and `^N`.

Two keys act while the BDOS prints. `^S` stops the output, and the next key
starts it again; that key is used up and does nothing else, so a `^C` then
doesn't end the program as it does in CP/M 2.2. `^P` turns the copy to the
list device on or off, as it does in a line. Any other key typed during
output is kept for the program's next console read, so it isn't lost. Since
TEC-OS's list device discards what it is sent, `^P` has no effect that you
can see.

## Pauses in long listings

`TYPE` and `DIR` count the lines they print, including a line that wraps at
the console's right edge and continues on the next row. One line short of a
full screen they print `[more]` on the last row and wait for a key. On the
serial terminal they count as for 80 columns and 24 rows.

The graphics LCD, with 8 rows of 21 characters, shows the pause soonest. On
a board with the graphics LCD and no PICO9918, `TYPE README.TXT` stops after
seven rows, and the screen shows this:

<!-- node book/capture.mjs --board glcd --screen "TYPE README.TXT" -->
```text
TEC-OS starter disk

COPY SOURCE DEST   co
py a file (built in),
 for example COPY TER
M.COM B:TERM.COM
TERM               dr
[more]
```

The line about `COPY` is longer than the screen is wide, and it takes four
rows. The count starts at the listing's first row, so the command line above
it has scrolled away by the time `[more]` appears. A key, `x` in this run,
rubs out `[more]` and prints the next seven rows:

<!-- node book/capture.mjs --board glcd --screen "TYPE README.TXT" "@key x" -->
```text
aw on the video conso
le; TERM S also scrol
ls
PROBE              ex
ercise the BDOS file
functions
DEMO               th
[more]
```

`^C`, Esc or `Q` at `[more]`, in capitals or not, rubs out `[more]` and ends
the listing there. After `q` at the first pause the CCP starts a new line
for the prompt, and the graphics LCD shows this:

<!-- node book/capture.mjs --board glcd --screen "TYPE README.TXT" "@key q" -->
```text

COPY SOURCE DEST   co
py a file (built in),
 for example COPY TER
M.COM B:TERM.COM
TERM               dr

A>
```

The empty row above the prompt is the one `[more]` was on.
