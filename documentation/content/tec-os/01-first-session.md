---
title: First session
parent: TEC-OS
nav_order: 1
nav_group: "Using the machine"
---

# 1. First session

<!-- Checked against TEC-OS 57a8c38b7f341433285e39c4bec14ecc486ffe26 (retained recovery baseline),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED 02b63d8;
     Baza is the eee4ee6 payload; integration qualification is recorded
     separately. Source-derived excerpts are
     labelled separately from console captures. -->

The starter card contains programs you can use and source files you can
change. This session begins by finding those files at the command prompt.
You then build and run SAMPLE, a supplied program, before finishing with
your saved work written to the card.

## The prepared machine

The examples use a TEC-1G prepared with the TEC-OS ROM and starter card.
It has the required 32 KiB RAM chip in U9, the 4 MHz FAST setting and a
PICO9918 display.
The Matrix switch enables the matrix keyboard. The keypad non-maskable
interrupt (NMI) jumper is off. The display uses the TEC Compact font at
40 columns and 24 rows. [Appendix G](appendix-g-tec-1g.md) gives the hardware
preparation details.

The screen examples were captured from the host model, a software TEC-1G
with this configuration. Unused blank rows are omitted from the excerpts.

## The first prompt

Power-on starts TEC-OS and displays the system name. The three names below
it identify the card volumes available for files:

<!-- TEC-OS b95b2a9, ROM c9586263: owned-input stock PICO capture03, boot. 40-column text; right-hand blanks and empty bottom rows omitted. Raw rows/registers/VRAM and receipt: Origo studies/p3-tec-os/evidence/book-stock-pico-capture03/. -->
```text

TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>
```

A *volume* is a disk's worth of files on the card. SYSTEM is assigned to
drive A, WORK to drive B and PROJECTS to drive C. The final `A:SYSTEM>` is
the command prompt. It identifies drive A as the *current drive* and SYSTEM
as its volume. A file name without a drive letter refers to that drive.

The card's startup file runs `SHELL.SVC` and `GLCD.SVC` automatically.
The shell reads your command lines. The GLCD line is for an optional
graphics LCD. In this session it leaves the PICO9918 selected as the
*console*, the display and keyboard used for commands. You can begin typing at the final `A:SYSTEM>`. The separate
20 × 4 LCD also displays the system name and assigned drives.

## Files at the prompt

`DIR` lists the files on the current drive. To get this listing, type `DIR`
after the prompt and press Return. The prompt is already on screen, so it
is not part of the command you enter. The same session produced:

<!-- TEC-OS with the sized DIR (ROM 35893cab, starter card 67ecdfee): node tools/capture.mjs --board pico --screen DIR. The PICO9918's 40-column screen from the DIR line; right-hand blanks and empty bottom rows omitted. -->
```text
A:SYSTEM>DIR

SHELL.SVC       4224
GLCD.SVC         896
STARTUP.CMD      128
TED.COM        12416
SAMPLE.ASM      4608
TIMES.BAS        640
TAS.COM        11136
BAZA.COM       13440
BAZA.RTL       13056
BOUNCE.BAS      5376
CAVERNS.TXT     2688
DEMO.ASM       15360
MON3.SVC        5248
HELLO3.ASM      2176
CAVERNS.BAS    25344
15 files, 116736 bytes
903168 free on A:SYSTEM
A:SYSTEM>
```

Each row after the blank line names a file and gives its size in bytes.
A file name has up to eight characters and a type of up to three characters.
The listing shows them as you type them, separated by a full stop. In `SAMPLE.ASM`,
SAMPLE is the name and ASM is the type. The `.ASM` file contains source
text. A `.COM` file contains an executable program.

The supplied assembler, `TAS`, turns assembly source into an executable.
`TED` edits text files. `BAZA` compiles BASIC source such as `TIMES.BAS`
and uses the library `BAZA.RTL`. The startup files are `SHELL.SVC`,
`GLCD.SVC` and `STARTUP.CMD`. Leave them as supplied for this session.
The current card also includes `CAVERNS.BAS` and `CAVERNS.TXT`, the BASIC
Caverns source and its instructions. Select `CON PICO 80`, compile it with
`BAZA CAVERNS`, then run `CAVERNS`. The remaining
demonstrations are optional and are listed under
[More on the card](#more-on-the-card).

The totals below the files give their combined size and the free space on
`A:SYSTEM`. This is the same drive and volume shown in the prompt. WORK
on drive B starts empty, ready for your files.

## Correcting and recalling a line

A command runs when you press Return. Until then you can correct what you
have typed. `dir` and `DIR` perform the same operation. Shift supplies
capital letters and the symbols above the matrix keyboard's other keys.
Each press sends a character and holding a key does not repeat it.

Control keys use Ctrl with a letter. `^X` means hold Ctrl while pressing X.
These command-line actions let you correct a name or start again:

| Key | Action before Return |
| --- | --- |
| Backspace or `^H` | Removes the last character and erases it from the screen |
| `^X` | Erases the whole line being typed |
| `^U` | Discards the line, prints `#` and starts a new screen line |
| `^W` | Brings back the previous command and earlier ones on further presses |
| `^N` | Moves forward through recalled commands with an empty line past the newest |

Recall lets you repeat a command such as `DIR` after changing a file.
Return runs the recalled line. Before that you can remove its last
characters with Backspace or discard it with `^X`. The shell stores these
command lines and supplies `^W` and `^N` at the prompt. Other programs
have their own input rules. Bypassing startup in Chapter 8 leaves recall
unavailable, while the other correction keys still work.

A question mark after a command name can indicate a typing error. You can
enter the corrected command at the next prompt. `^C` at an empty prompt
starts a *warm boot*: the command processor restarts and displays the
prompt again.

## Drive A and drive B

A drive letter followed by a colon changes the current drive. `B:` selects
WORK and `A:` returns to SYSTEM. This screen follows the listing above
with both drive commands:

<!-- TEC-OS with the sized DIR (ROM 35893cab, starter card 67ecdfee): node tools/capture.mjs --board pico --screen DIR B: A:. Full screen; trailing empty rows omitted. -->
```text
A:SYSTEM>GLCD.SVC

A:SYSTEM>DIR

SHELL.SVC       4224
GLCD.SVC         896
STARTUP.CMD      128
TED.COM        12416
SAMPLE.ASM      4608
TIMES.BAS        640
TAS.COM        11136
BAZA.COM       13440
BAZA.RTL       13056
BOUNCE.BAS      5376
CAVERNS.TXT     2688
DEMO.ASM       15360
MON3.SVC        5248
HELLO3.ASM      2176
CAVERNS.BAS    25344
15 files, 116736 bytes
903168 free on A:SYSTEM
A:SYSTEM>B:
B:WORK>A:
A:SYSTEM>
```

Selecting another drive affects lookup for a plain file name. It leaves
the files themselves in place. Returning to A selects the volume containing
SAMPLE and the assembler for the next command.

## Supplied source and a running program

`TAS SAMPLE` assembles the supplied `SAMPLE.ASM` into `SAMPLE.COM`.
The command needs only SAMPLE because TAS supplies the file types.
A completed assembly produces this message:

<!-- TEC-OS 57a8c38: node tools/capture.mjs --board pico --screen 'TAS SAMPLE'. Full screen; trailing empty rows omitted. -->
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

Assembly creates an executable while leaving the `.ASM` source available
for reading and editing. A later source edit takes effect in the program
only after you assemble it again.

The command `SAMPLE` loads and starts `SAMPLE.COM`. Its greeting and screen
size appear before it returns to the prompt:

<!-- TEC-OS 57a8c38: node tools/capture.mjs --board pico --screen 'TAS SAMPLE' SAMPLE. Full screen; trailing empty rows omitted. -->
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

SAMPLE reports the console dimensions, 40 columns by 24 rows. It also
writes `Hello from SAMPLE` on the separate 20 × 4 LCD, displays `123456`
on the digits and sounds a short speaker tone.

At the new `A:SYSTEM>` the program has finished. You can enter another
command or finish the session using the precautions below.

## Saved work before reset or removal

A program can accept a record into cache before it reaches SD. Ordinary OS
calls give queued data an opportunity to progress and required input attempts
to drain it. Cold reset and power loss still discard changes left only in RAM;
there is no timer that keeps writing while a program owns the CPU
(`0701241:docs/recovery.md:25-67`).

Finish the program and wait for the prompt before switching off, pressing
reset or removing the card. A running program may hold new changes
in memory between key waits.

After `Write pending`, the next prompt is not proof of preservation.
Failed acknowledged data remains in RAM even through warm boot. Resolve the
failure on the original initialised backend and await `Cache clear` before
reset. That notice does not close a file, repair rejected metadata, complete
browser storage or prove physical durability. Reinserting a card is not
permission to replay retained data onto it
(`0701241:docs/recovery.md:69-117`, `0701241:docs/recovery.md:206-222`).

Keep a separate copy of valuable work. [Chapter 6](06-cards-on-the-pc.md)
explains card copies and recovery and
[Appendix D](appendix-d-error-messages.md) explains the failure messages.

Save the file and exit an editor normally before this step. The prompt cannot
preserve edits that exist only inside the editor.

The card must be out of the TEC-1G before you change it on a PC. After putting
it back, press reset before using it again.

## More on the card

You can finish the first session after SAMPLE. For more examples, the
other files on A use the same build-and-run sequence at `A:SYSTEM>`:

| Commands | Result |
| --- | --- |
| `TAS DEMO`, then `DEMO` | Builds and runs a tour of the hardware on the LCD, the digits, the 8 × 8 LEDs and the PICO9918, until you press a key. [Chapter 12](12-use-the-boards-devices.md) describes it |
| `BAZA BOUNCE`, then `BOUNCE` | Compiles and runs a sprite game on the PICO9918. Tap W, A, S and D, or the arrow keys, to steer and Q to quit. [Chapter 3](03-build-a-basic-program.md) describes it |

`TED DEMO.ASM` and `TED BOUNCE.BAS` open the demonstration sources.
The longest line in BOUNCE.BAS is 79 columns wide. TED scrolls sideways
at 40 columns to display the rest of that line. `CON PICO 80` provides
enough width to show each line whole and `CON PICO 40` restores 40 columns.
[Chapter 7](07-choose-a-console.md) explains console widths.

Programs written for the TEC-1G's MON-3 monitor use a separate service.
First build the supplied HELLO3.ASM at the CP/M prompt with
`TAS HELLO3 HELLO3.BIN`. Then `MON3.SVC` installs the service and displays
`MON3>`. At this prompt, `LOAD HELLO3.BIN` loads the binary you built and
`GO` runs it. HELLO3 prints four lines on the 20 × 4 LCD through MON-3's
calls, then beeps:

<!-- TEC-OS 9ade2fe test/starter.test.mjs:219, the LCD rows the host-model
     test checks, trailing spaces removed. Not a separate capture. -->
```text
MON-3 ON TEC-OS
LCD BY RST 10H
DIGITS BY RST 20H
KEY BEEPS, AD QUITS
```

HELLO3 then counts on the digits. A keypress sounds a beep and displays
its code on the right two digits. With the Matrix switch enabled, the
service reads the matrix keyboard, so Esc ends the program and returns
to `MON3>`. With that switch off, AD on the keypad ends it. `EXIT` returns
to `A:SYSTEM>`. The starter supplies the source. The binary is the file
you built above. [Chapter 5](05-drives-and-user-areas.md) explains
the service and its reserved memory.
