---
title: First session
parent: TEC-OS
nav_order: 1
nav_group: "Using the machine"
---

# 1. First session

<!-- Checked against TEC-OS 46cf3f1f1c6ea7ff361a568672a41ab1a7e2c1ee (main),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

Your first session starts with the supplied files. You list them, change drive
and turn SAMPLE's source into a program you can run. Before finishing you write
any pending saved changes to the card.

## The prepared machine

The TEC-1G is already prepared with the TEC-OS ROM and starter card. It has the
required 32 KiB RAM chip in U9, the 4 MHz FAST setting and a PICO9918 display.
The Matrix switch enables the matrix keyboard. The keypad non-maskable
interrupt (NMI) jumper is off. The display uses the TEC Compact font at
40 columns and 24 rows. [Appendix G](appendix-g-tec-1g.md) gives the hardware
preparation details.

The screen examples below are from the host model, a software TEC-1G with that
configuration. They are text excerpts from its screen with unused blank rows
left out.

## The first prompt

Powering on starts TEC-OS. The screen names the system and the three assigned volumes on
the starter card:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen. Full screen; trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>
```

A *volume* is a disk's worth of files on the card. SYSTEM is assigned to drive
A, WORK to drive B and PROJECTS to drive C. The letter before `>` identifies the *current drive*,
the one used when you name a file without a drive letter. At `A:SYSTEM>` you are
working on SYSTEM. The prompt is where you type a command.

The `SHELL.SVC` and `GLCD.SVC` lines were automatic. They came from the
card's startup file. `SHELL.SVC` loads the *shell*, a program that stays in
memory and reads each command line you type. It supplies the recall keys
below, the pause in long listings and the `COPY` command of Chapter 4. The
PICO9918 is already the console, the screen and keyboard used for commands,
so the `GLCD.SVC` line leaves it selected. You begin typing at the final
`A:SYSTEM>`. The separate 20 × 4 LCD also shows the system name and assigned drives.

## Files at the prompt

`DIR` lists the files on the current drive. You type the letters after the
prompt and press Return. The prompt itself is already on the screen and is
not part of the command. In the same session the listing was:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen DIR. Full screen; trailing empty rows omitted. -->
```text
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>DIR

SHELL   .SVC    3712
GLCD    .SVC     896
STARTUP .CMD     128
TED     .COM   12416
SAMPLE  .ASM    4608
TIMES   .BAS     640
TAS     .COM   10368
BAZA    .COM   13184
BAZA    .RTL   12032
BOUNCE  .BAS    5376
DEMO    .ASM   15360
MON3    .SVC    5120
HELLO3  .ASM    2176
13 files, 86016 bytes
937984 free on A:SYSTEM
A:SYSTEM>
```

The listing starts after a blank line and gives one file a row, with its
size in bytes. Each name has up to eight characters followed by a type of up
to three characters. A full stop separates the two when you type a name. In
`SAMPLE.ASM`, SAMPLE is the name and ASM is the type. The `.ASM` file holds
source text. A `.COM` file holds a program that TEC-OS can run.

`TAS` is the assembler supplied on the card. It turns source text into a
program. `TED` is the supplied text editor.
`BAZA` is a BASIC compiler, which uses its library `BAZA.RTL`, and
`TIMES.BAS` is a BASIC program for it. The automatic display setup uses
`GLCD.SVC` and `STARTUP.CMD`, and `SHELL.SVC` is the shell. Leave them as
supplied for this session. The other files are demonstrations, which
[More on the card](#more-on-the-card) lists.

The last two lines report the number of files and their bytes, and the free
space on A with the drive's volume, `A:SYSTEM`. The prompt shows the same
pair: `A:SYSTEM>` means drive A, holding the volume SYSTEM. The card's WORK
volume on B starts empty and is available for your files.

## Correcting and recalling a line

You can change a command before Return runs it. Letter case does not change
the command: `dir` and `DIR` name the same operation. Shift supplies capital
letters and the symbols above the matrix keyboard's other keys. Each press
sends one character so holding a key does not repeat it.

Control keys use Ctrl with a letter. `^X` means hold Ctrl while pressing X.
These command-line actions let you correct a name or start again:

| Key | Action before Return |
| --- | --- |
| Backspace or `^H` | Removes the last character and erases it from the screen |
| `^X` | Erases the whole line being typed |
| `^U` | Discards the line, prints `#` and starts a new screen line |
| `^W` | Brings back the previous command and earlier ones on further presses |
| `^N` | Moves forward through recalled commands with an empty line past the newest |

Return runs a recalled line just as it runs a newly typed one. You can edit
its last characters first with Backspace or discard it with `^X`. Recall is
useful for another `DIR` after a file has changed. It applies at the command
prompt, not inside an arbitrary program's own input. `^W` and `^N` belong to
the shell, which keeps the lines you type. Without the shell, as after the
startup bypass of Chapter 8, the other keys still work and recall does not.

A mistyped command can fail with a question mark after its name. The command
has then finished and the prompt is ready for a corrected line. `^C` at an
empty prompt starts a *warm boot*, which restarts the command processor and
returns to the prompt.

## Drive A and drive B

A drive letter followed by a colon changes the current drive. `B:` selects
WORK and `A:` returns to SYSTEM. The next excerpt continues after the listing:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen DIR B: A:. Full screen; trailing empty rows omitted. -->
```text
A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>DIR

SHELL   .SVC    3712
GLCD    .SVC     896
STARTUP .CMD     128
TED     .COM   12416
SAMPLE  .ASM    4608
TIMES   .BAS     640
TAS     .COM   10368
BAZA    .COM   13184
BAZA    .RTL   12032
BOUNCE  .BAS    5376
DEMO    .ASM   15360
MON3    .SVC    5120
HELLO3  .ASM    2176
13 files, 86016 bytes
937984 free on A:SYSTEM
A:SYSTEM>B:
B:WORK>A:
A:SYSTEM>
```

The current drive supplies the location for a plain file name. The files on A
remain there when the prompt is on B. Returning to A puts the supplied SAMPLE
source and assembler on the current drive for the build below.

## Supplied source and a running program

`SAMPLE.ASM` is already on A. `TAS SAMPLE` reads that source and writes the
program as `SAMPLE.COM`. You type SAMPLE without `.ASM` in the build
command because TAS supplies the file types. The assembler's completion
message gives the output file's name:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen 'TAS SAMPLE'. Full screen; trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>TAS SAMPLE
SAMPLE.COM written

A:SYSTEM>
```

The source and program are separate files. An edit to the source affects the
program only after another assembly. The `.ASM` file remains available to read
or edit after the build.

Typing `SAMPLE` now runs `SAMPLE.COM`. TEC-OS loads the program and starts it.
The program prints its greeting and screen size then returns to the prompt:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen 'TAS SAMPLE' SAMPLE. Full screen; trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>TAS SAMPLE
SAMPLE.COM written

A:SYSTEM>SAMPLE
Hello from TEC-OS.
Screen: 40 by 24
Back to the prompt.

A:SYSTEM>
```

The dimensions are 40 columns by 24 rows, matching this console. On the
separate 20 × 4 LCD SAMPLE writes `Hello from SAMPLE` and its digit output is
`123456`. The source also includes a short speaker tone.

The new `A:SYSTEM>` means the program has finished and you can type another command.
The same prompt is also the place to finish the session safely.

## More on the card

The other files on A are programs to try in the same way, each with a
command or two at `A:SYSTEM>`:

| Commands | Result |
| --- | --- |
| `TAS DEMO`, then `DEMO` | Builds and runs a tour of the hardware on the LCD, the digits, the 8 × 8 LEDs and the PICO9918, until you press a key. [Chapter 12](12-use-the-boards-devices.md) describes it |
| `BAZA BOUNCE`, then `BOUNCE` | Compiles and runs a sprite game on the PICO9918. Tap W, A, S and D, or the arrow keys, to steer and Q to quit. [Chapter 3](03-build-a-basic-program.md) describes it |

`TED DEMO.ASM` and `TED BOUNCE.BAS` open those sources. BOUNCE.BAS's
longest line is 79 columns wide, so at 40 columns TED scrolls sideways to
show the rest of a line. After `CON PICO 80` it shows every line whole, and
`CON PICO 40` returns to 40 columns.
[Chapter 7](07-choose-a-console.md) explains the widths.

`MON3.SVC` runs programs written for MON-3, the TEC-1G's own monitor.
At the CP/M prompt, first type `TAS HELLO3 HELLO3.BIN` to build the
supplied HELLO3.ASM. Then `MON3.SVC` installs the service and gives its
prompt, `MON3>`. There `LOAD HELLO3.BIN` loads the binary you built and
`GO` runs it. HELLO3 writes four lines on the 20 × 4 LCD through MON-3's
calls, then beeps:

<!-- TEC-OS b3134cf test/starter.test.mjs:219, the LCD rows the host-model
     test checks, trailing spaces removed. Not a separate capture. -->
```text
MON-3 ON TEC-OS
LCD BY RST 10H
DIGITS BY RST 20H
KEY BEEPS, AD QUITS
```

It then counts on the digits. Another key beeps and shows its code on the
right two digits. With the matrix keyboard enabled, as here, the
service reads the matrix and not the keypad, so Esc on the matrix keyboard
ends the program and returns to `MON3>`. With the Matrix switch off, AD on
the keypad does the same. `EXIT` returns to `A:SYSTEM>`. The starter
supplies the assembly source; the binary is the file you built above.
[Chapter 5](05-drives-and-user-areas.md) explains the service and what it
keeps in memory.

## Saved work before reset or removal

A program can report that it has saved a file while some changes remain in
memory. TEC-OS holds the writes of the drive you are on in memory and writes
them to the card later. Resetting the machine or removing power discards
changes that have not reached the card. Whenever TEC-OS waits for a key,
though, it first writes every change it holds, on every drive. The prompt
waits for a key, so at the prompt everything is on the card.

Finish the program and wait for the prompt before switching off, pressing
reset or removing the card. Only a program still running, one that never
waits for a key, can hold changes in memory.

A `Write lost` message means that some pending changes could not be written.
The new prompt after that message does not establish successful preservation.
Those failed changes have been dropped and cannot be recovered.
Keep a separate copy of valuable work. [Chapter 6](06-cards-on-the-pc.md)
explains card copies and recovery and
[Appendix D](appendix-d-error-messages.md) explains the failure messages.

Save the file and exit an editor normally before this step. The prompt cannot
preserve edits that exist only inside the editor.

The card must be out of the TEC-1G before you change it on a PC. After putting
it back, press reset before using it again.
