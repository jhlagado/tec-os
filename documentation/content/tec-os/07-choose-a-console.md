---
title: Choose a console
parent: TEC-OS
nav_order: 7
nav_group: "Using the machine"
---

# 7. Choose a console

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

The console is the input and output used for commands. You can switch
from the prepared PICO9918 screen and matrix keyboard to a serial terminal
or the graphics LCD. `CON` selects the pair. Its reply appears on the
newly selected display so the next command must use that console's keyboard.

## Devices and their names

A serial terminal is a PC terminal program connected to the board's
FTDI serial port. Both the PICO9918 and graphics LCD use the TEC-1G
matrix keyboard. All three can be connected but only a selected
console receives command output and supplies command input.

| Console name | Keys from | Output to |
| --- | --- | --- |
| `TTY:` | serial terminal | serial terminal |
| `CRT:` | matrix keyboard | PICO9918 |
| `UC1:` | matrix keyboard | graphics LCD |
| `BAT:` | serial port | nowhere |

The PICO9918 console has the CP/M device name `CRT:`. The graphics LCD
console is `UC1:`. `CON` also accepts the descriptive aliases `PICO`
and `GLCD`. Chapter 17 explains how these selections are stored in memory.

The PICO9918 supports 80, 40 or 32 columns, each with 24 rows. The
128 × 64 graphics LCD displays 21 columns and 8 rows. The separate
20 × 4 character LCD displays boot status, not the command console.
Programs can write to it through the ROM calls in Chapter 12.

A program's warm boot keeps the selected console. Reset performs a
cold boot and checks the board configuration again. A responding
PICO9918 with the Matrix switch enabled starts as `CRT:` at 40 columns
before the banner. Otherwise TEC-OS starts on `TTY:`. A startup file
can then load the graphics LCD console, as Chapter 8 explains.

## The serial terminal

A serial connection needs 4800 baud, 8 data bits, no parity and 2 stop
bits. The board must run at FAST, 4 MHz, because TEC-OS generates the
serial timing in software. A different clock changes that timing.
Appendix G lists the physical preparation requirements.

Output bytes reach the serial terminal unchanged. The PC terminal
program interprets control characters and escape sequences, so programs
that position a cursor or clear the screen need ANSI support. Command
pagination assumes 80 columns and 24 rows. TEC-OS cannot read the
terminal window's actual size.

There is no hardware receive buffer on the board. Input is caught only while
TEC-OS polls the serial line. It polls while waiting for a key and briefly
during ordinary text output. Keys typed by hand at the prompt are caught.
Pasting text or typing ahead of a busy program can lose characters. A host
model's queued input does not establish that the physical board can receive a
paste.

## Moving between displays

`CON` alone reports the selected console as `CON: TTY:`, `CON: CRT:`,
`CON: UC1:` or `CON: BAT:`. BAT discards that output. A name after CON
selects the console, with an optional colon. `CON TTY` and `CON TTY:`
therefore perform the same selection.

The transcripts in this chapter are host-model captures, not observations of
a physical board.

`CON TTY` entered on the matrix keyboard switches from the PICO9918
to the serial terminal. The command appears on the old display. Its
reply and next prompt appear on the new one. Only serial output is
included in this capture:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --serial 'CON TTY'. Boot rows included in this complete serial transcript. -->
```text
CON: TTY:
A:SYSTEM>
```

The first serial line is the reply because the boot text appeared on
the PICO9918. That display keeps its old picture and receives no more
console output. Input now comes from the PC terminal. `CON CRT` typed
there restores the matrix keyboard and PICO9918.

Selecting another display clears it and positions the cursor at the
top left. A program holding a PICO9918 display claim prevents the clear
until its claim ends, as Chapter 12 explains. Bare `CON CRT` and
`CON PICO` retain the width and any active claim. Returning to the
PICO9918 produces only this reply and prompt:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen 'CON TTY' 'CON CRT'. The full screen, with trailing empty rows omitted. -->
```text
CON: CRT:
A:SYSTEM>
```

An invalid console name is printed with a question mark. The selection
remains unchanged, as this separate capture shows:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'CON XYZ'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON XYZ
XYZ?

A:SYSTEM>
```

## Choosing the PICO9918 width

A width command changes the PICO9918 layout and selects it as the
console. `CON PICO 40` sets 40 columns and `CON CRT 32` sets 32. The
space before the number is required. Both 80 and 40 columns use text
mode and 32 columns uses Graphics I. All three have 24 rows. Applying a
new width clears the screen.

Cold boot starts the PICO9918 console at 40 columns when its probe succeeds
and the Matrix switch is enabled. A warm boot keeps the selected width. Reset
restores 40 before any startup width command runs. This capture selects 32
columns, runs `TAS` with no name and then lists files across the row:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen 'CON PICO 32' TAS 'DIR /W'. The full screen, with trailing empty rows omitted. -->
```text
CON: CRT:
A:SYSTEM>TAS
usage: TAS NAME [OUT.TYP]

A:SYSTEM>DIR /W
SHELL.SVC    GLCD.SVC
STARTUP.CMD  TED.COM
SAMPLE.ASM   TIMES.BAS
TAS.COM      BAZA.COM
BAZA.RTL     BOUNCE.BAS
DEMO.ASM     MON3.SVC
HELLO3.BIN   HELLO3.ASM
14 files, 914K free
A:SYSTEM>
```

The warm boot after TAS retains 32 columns. `DIR /W` fits two file
names per row at this width, compared with six at 80 columns. Fourteen
files therefore occupy seven rows.

An unsupported width, a width after another device name or a number joined to
`CRT` without a space produces a question mark. The console remains as it was:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico 'CON CRT80' 'CON TTY 40' 'CON PICO 50'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON CRT80
CRT80?

A:SYSTEM>CON TTY 40
40?

A:SYSTEM>CON PICO 50
50?

A:SYSTEM>
```

A width command typed at the prompt also produces a question mark where cold
boot did not start the PICO9918 console. The same line in `STARTUP.CMD` passes
quietly on that board, as Chapter 8 explains.

## An unavailable display

`CON CRT` can select the PICO9918 only if its console started at cold
boot with the matrix keyboard enabled. Otherwise it selects serial
and reports `CON: TTY:`.

`UC1:` needs the graphics LCD, matrix keyboard and `GLCD.SVC` driver.
This resident service loads from A into RAM, reducing program space.
The PICO9918 console is in ROM and requires no service file. Chapter 11
explains the memory boundary.

`CON UC1` loads `GLCD.SVC` from drive A if it is not installed. A failed load
leaves the console where it was and shows `GLCD?` on the 20 × 4 LCD. Here both
display selections leave a serial-only board on the terminal:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs CON 'CON CRT' 'CON UC1' CON. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON
CON: TTY:
A:SYSTEM>CON CRT
CON: TTY:
A:SYSTEM>CON UC1
CON: TTY:
A:SYSTEM>CON
CON: TTY:
A:SYSTEM>
```

With both displays fitted, cold boot selects the PICO9918 and the
startup `GLCD.SVC` line installs nothing. `CON UC1` then loads the
driver and selects the graphics LCD. This host-model text capture used
both displays and the matrix keyboard:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen 'CON UC1' CON. The full screen, with trailing empty rows omitted. -->
```text
CON: UC1:
A:SYSTEM>CON
CON: UC1:
A:SYSTEM>
```

Removing the graphics-LCD driver while it is the console selects the
PICO9918 if its ROM console started. Otherwise output returns to serial.
This separate run used both displays. It selected UC1, listed the
services, removed the driver and reported the resulting console:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico 'CON UC1' SERVICES UNLOAD CON. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON UC1
CON: UC1:
A:SYSTEM>SERVICES
GLCD 3
SHELL 15
A:SYSTEM>UNLOAD

A:SYSTEM>CON
CON: CRT:
A:SYSTEM>
```

The final `CRT:` report confirms the return to PICO9918. GLCD was
the newest service, so its removal leaves the shell installed.

A graphics LCD and matrix keyboard can also be used without a terminal.
The starter file installs `GLCD.SVC` before the first prompt when no
PICO9918 console started. The graphics LCD then becomes the console.
Chapter 8 explains these startup conditions.

## A silent console and recovery

`BAT:` is CP/M's batch-device name. TEC-OS reads its input from serial
and discards its output. `CON BAT` therefore suppresses its own reply
but commands typed on the serial terminal still run.

`CON TTY` typed blind on that terminal brings the visible console back. The
matrix keyboard is not the input device in `BAT:`. In this run `DIR`
ran between the two `CON` commands but printed nothing on the terminal:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --serial '@start CON BAT' '@start DIR' 'CON TTY'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON BAT
CON: TTY:
A:SYSTEM>
```

The visible reply belongs to `CON TTY`, which also restores serial output. If a
display goes quiet after a console change, the selected keyboard and display are
the first things to check. A move to `TTY:` needs the serial terminal for both.
A move to `CRT:` or `UC1:` needs the matrix keyboard. Reset selects the cold-boot console again but loses pending card writes. A console change lets you
recover without resetting the machine.

## The matrix keyboard

`CRT:` and `UC1:` read the matrix keyboard. `TTY:` and `BAT:` read
serial instead. Shift and Ctrl work as in the first session. Fn produces
the same character as the key alone. A modifier alone sends nothing,
as do two ordinary keys held together.

Caps toggles Caps Lock and its CAPS lamp. While it is on, letters are
capitals regardless of Shift. The `{` key produces `[` and the other
keys keep their usual behaviour.

The arrow keys send standard ANSI sequences. Programs such as `TED` read them on
the matrix keyboard too. The keyboard lacks `]`, `}`, `` ` `` and `~`. It also
has no Delete key. Backspace remains the way to remove the character before the
cursor. On a serial terminal that has Delete, its command-line effect differs
from backspace:

| Key | Effect |
| --- | --- |
| Delete, `7Fh` | Removes the last character and prints it again, as CP/M 2.2 does on a printing terminal |

A matrix key is sent once when pressed. Holding it does not repeat it. A press
and release while the program is busy elsewhere can be lost. Chapter 17 explains
the scan timing and character encodings.

## Text and the cursor on a display

TEC-OS draws display-console text at the cursor and advances it a
column for each printable character. Control characters move the cursor
or clear the screen. Supported ANSI sequences provide these operations
and reverse video. They also insert or delete characters and lines.
Chapter 17 lists the exact subset. Programs using other sequences
may require a serial terminal with fuller ANSI support.

While a program waits for input on a display, the cursor appears as the reverse
image of the character underneath it. The next output byte removes that cursor.
No cursor is drawn while its position is past the right edge. A character in the
last column leaves the cursor past the edge. Wrapping occurs when another
printable character follows. A full-width line followed by carriage return and
line feed leaves no extra blank row.
