# 1. Introduction and first boot

Checked against TEC-OS 98c6416.

The TEC-1G starts in MON-3, a monitor that reads the hex keypad and shows
addresses and bytes on six 7-segment digits. With TEC-OS in its ROM socket the
same board becomes a small disk computer: you type commands at a prompt, keep
files on an SD card and run programs written for CP/M 2.2. This chapter
describes what TEC-OS is and what it needs. We then start it in three ways,
follow the first boot line by line to the prompt, list the starter card, run a
program, and end at the prompt TEC-OS prints when it can't read a card.

## CP/M and TEC-OS

CP/M was the operating system of most Z80 business machines of the late 1970s
and early 1980s. A CP/M program reaches everything outside its own memory
through one interface. To read a key, print a character, open a file or read
128 bytes of it, the program puts a function number in register `C` and calls
address `0005h`. That address leads to the BDOS, the Basic Disk Operating
System, which does the work and returns. Thousands of programs were written to
that interface: editors, assemblers, compilers, games and BASIC interpreters.
TEC-OS implements the interface as CP/M 2.2 defined it, so a CP/M 2.2 program
that uses only the documented interface runs on the TEC-1G unchanged.

A CP/M system has three parts. The BDOS provides the functions at `0005h`. The
CCP, the Console Command Processor, prints the prompt, reads a command and
runs it. The BIOS, the Basic Input/Output System, is the part written for one
machine: it reads the keyboard, drives the screen and reads and writes the
disk. On a CP/M machine of 1980 the BDOS and CCP were loaded from a disk into
RAM at every start. On the TEC-1G all three are in a 16 KiB ROM at
`C000h–FFFFh`, together with the driver for the SD card, the serial terminal,
the keyboard scan and a table of services for the board's own hardware. From
the card TEC-OS loads only the programs you run and the drivers for the video
displays.

TEC-OS has more than CP/M 2.2 had:

- volumes, each an ordinary CP/M disk, held together on one SD card in a
  container, up to 127 of them, with four on drives at a time;
- a block cache of 15 KiB, so that a block read from the card once is read
  again from memory;
- a work volume whose writes reach the card in batches;
- a console on the PICO9918 video card, on the 128 × 64 graphics LCD or on a
  serial terminal, each display's console being a driver loaded from the
  card;
- a table of services at `C003h` through which a program reaches the
  7-segment digits, the 20 × 4 LCD, the PICO9918's graphics, the speaker, the
  joystick and the clock with no port numbers of its own;
- a startup file of commands run before the first prompt;
- a history of the command lines typed at the prompt.

Chapters 2 to 9 explain each of these, and Part II explains how they work.

## The board

TEC-OS needs a TEC-1G with 64 KiB of RAM. The board's fixed RAM is 32 KiB at
`0000h–7FFFh`. The other 32 KiB is a RAM chip in socket U9, which the board's
recommended build leaves empty. Its two 16 KiB halves, EXPAND 0 and EXPAND 1,
share the addresses `8000h–BFFFh`, and a bit in the board's system latch
selects the half that is there. Programs and TEC-OS's own working memory use
EXPAND 0; TEC-OS holds its block cache and command history in EXPAND 1. Cold
boot, the start after power-on or a reset, checks both halves. If RAM at
`8000h–BFFFh` is missing, or EXPAND 1 is, TEC-OS sends `TEC-OS needs 64K RAM`
to the serial port and stops.

TEC-OS also needs an SD card on the board's SD adaptor and a console, the
device you type on and read from. The console is a terminal program on a PC
connected to the board's FTDI serial port, or a PICO9918 video card or the
graphics LCD, each with the matrix keyboard. The 20 × 4 character LCD is never
the console; at cold boot TEC-OS writes its name and the drives there.

You don't need a board to follow this book. The Debug80 TEC-1G model, a
software TEC-1G, runs TEC-OS in a web page and from Node.js on a PC. Every
example in the book was run on that model, and the output shown is the output
it produced.

## Conventions

Addresses and bytes are hexadecimal with a trailing `h`, as in `0100h`, as the
Z80 assemblers of CP/M's time wrote them. Sizes in bytes are decimal. A KiB is
1,024 bytes. Times are in T-states, the Z80's clock cycles; at the TEC-1G's 4
MHz one T-state is a quarter of a microsecond.

A transcript shows the prompt with what you type after it, then TEC-OS's
reply:

```text
A>CON
CON: TTY: serial terminal
A>
```

A key held with Ctrl is written with a caret, so `^C` means Ctrl and C
together.

## Building TEC-OS

The TEC-OS repository holds the ROM's source, the tools for building it and
the card, the TEC-1G model and the web page. Building it requires Node.js 20
or later. From a clone of the repository, three commands build everything this
chapter uses:

```sh
npm ci
npm run build
npm run media
```

`npm ci` installs the assembler, ATOM, and the TEC-1G model. `npm run build`
assembles the ROM. `npm run media` writes the ROM images, the starter card and
its files to `dist/`. The starter card is `dist/starter.img`, an image of a
whole SD card. If a build of the Edit program is beside the repository, at
`../edit/dist/EDIT.COM`, `npm run media` puts `EDIT.COM` on the starter card;
without it the card has the other eleven files shown below.

## Running TEC-OS in a web page

The web page runs the TEC-1G model at 4 MHz with TEC-OS in its ROM, and draws
the board's displays: the PICO9918's screen, the 7-segment digits, the 20 × 4
LCD, the 8 × 8 LEDs and the graphics LCD, with a serial terminal below them.
Two more commands build the page and serve it, the second with Python 3:

```sh
npm run web
python3 -m http.server 8765 --directory web/dist
```

The page is then at `http://localhost:8765`. A click on the PICO9918's screen
sends your typing to the matrix keyboard. The page stores its SD card in the
browser's storage, so files written on the card are still there after the page
is reloaded. Its "New starter card" button builds a fresh card from the
starter card's recipe, checking each file against the SHA-256 the recipe
records. Its "Display" list selects a board with a PICO9918 or a board with
only the graphics LCD, and the list labelled "ROM" selects the PICO9918's
width, 80, 40 or 32 columns. A change to either starts the board again, after
the page writes the matching display driver's name into the first line of the
card's startup file. "Reset" presses the board's reset button, which leaves
the RAM as it is, and "Power cycle" turns the board off and on, which loses
what the RAM held.

## Running TEC-OS from Node.js

The web page and the tests run the same TEC-1G model, `host/machine.mjs`. The
script `book/capture.mjs` boots it from a PC's command line with the starter
card, types the commands it is given, and prints everything TEC-OS sent to the
console. It is how this book's examples were made:

```sh
node book/capture.mjs DIR
```

With no options the board has a serial terminal and nothing else: no PICO9918,
no graphics LCD and no matrix keyboard. `--board pico` gives it the PICO9918,
the graphics LCD and the matrix keyboard, as the web page has, `--lcd` prints
the 20 × 4 LCD's rows at the end, and `--card none` boots with the socket
empty. The comment at the top of the script lists the rest. A run of a few
commands takes about a second.

## Running TEC-OS on a board

On a TEC-1G, TEC-OS replaces MON-3. Its image for the board is
`dist/tecos-board.rom`, 16 KiB for `C000h–FFFFh`. The diagnostics ROM in the
repository goes in the same place, and `docs/board-run.md` describes the ROM
chip, its jumpers and the switches for it. All of TEC-OS's images are the same
ROM: `tecos-board.rom`, `tecos-debug80.rom` and the others in `dist/` differ
only in name.

The SD card is given over to TEC-OS whole. `tecvol`, the card tool in the
repository, writes the starter card's image to it from the PC:

```sh
node tools/tecvol.mjs install dist/starter.img /dev/rdiskN --yes
```

`/dev/rdiskN` stands for the card's device on the PC. `install` overwrites the
device from its first block, so the device name needs checking twice before
the command runs.

For a serial console, connect the board's FTDI port to the PC and set the
terminal program to 4800 baud, 8 data bits, no parity and 2 stop bits. A board
with the matrix keyboard has its Matrix configuration switch on. Cold boot
reads the switch, bit 0 of port `03h`, and TEC-OS reads the matrix keyboard
only when the switch is on. With it off, both display drivers fail to install,
and the console stays on the serial terminal.

## The first boot

At reset the TEC-1G shows the first 2 KiB of the ROM at `0000h` as well as at
`C000h`, so the Z80, which starts at `0000h`, runs ROM code. The first
instruction jumps to cold boot at its address in the ROM, above `C000h`, and
cold boot turns the copy at `0000h` off, leaving RAM there. It then checks the
RAM, clears TEC-OS's working memory, starts the serial terminal and prints the
banner. Here is the whole of a first boot on a board with only a serial
terminal, as `node book/capture.mjs` prints it with no options:

```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM     
B: WORK       

A>PICO.DRV
PICO.DRV?

A>GLCD.DRV
GLCD.DRV?

A>
```

The first line is the banner, with the version, 0.1. After a reset the console
is always the serial terminal, so the banner goes there on every board.

The next two lines are the volumes on the drives. A volume is one CP/M disk
inside the container on the card, and a drive is one of the letters `A` to `D`
through which programs reach a volume. The starter card has two volumes:
`SYSTEM`, of 1 MiB, on drive A, and `WORK`, of 8 MiB, on drive B. Each line is
the drive and the volume's label, which has 11 characters, padded with spaces.
A read-only volume has ` (read-only)` after its label. Before it prints these
lines, cold boot starts the card and checks the container's header; Chapter 4
describes the container.

The 20 × 4 LCD shows the same thing at the same time, as `--lcd` prints it:

```text
TEC-OS 0.1  TEC-1G
A: SYSTEM
B: WORK
```

After a blank line comes the prompt, `A>`. The letter is the current drive,
the one a command uses when it names a file with no drive. Here the prompt is
followed at once by `PICO.DRV`, though nobody typed it. Before the first
prompt waits for the keyboard, the CCP reads the first 128 bytes of the file
`STARTUP.CMD` from drive A, if the file is there, and runs each line as a
command, echoed after the prompt as if it had been typed. The starter card's
`STARTUP.CMD` has two lines, `PICO.DRV` and `GLCD.DRV`.

A command that names a `.DRV` file installs a driver from that file. A driver
is code that TEC-OS loads from the card into memory just below the BDOS, where
it stays until a reset or until the `UNLOAD` command removes it. `PICO.DRV` is
the console for the PICO9918 at 80 columns, and `GLCD.DRV` is the console for
the graphics LCD. Each one makes its display the console when it is installed.
This board has neither display nor a matrix keyboard, so both installations
fail, and a command that fails prints its own name with a question mark:
`PICO.DRV?` and `GLCD.DRV?`. The console stays on the serial terminal. The
startup file is read only once, after cold boot, and a program's exit doesn't
run it again.

## The first boot with a PICO9918

The web page's board has a PICO9918, the graphics LCD and the matrix keyboard,
and there the boot goes differently. Its serial terminal shows this, captured
with `node book/capture.mjs --board pico --serial`:

```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM     
B: WORK       

A>PICO.DRV

```

`PICO.DRV` installs, and the PICO9918 becomes the console. From then on TEC-OS
writes nothing more to the serial terminal and reads the matrix keyboard in
place of the serial port. Taking over the screen clears it, so the PICO9918
shows only what followed, as `--screen` prints it:

```text

A>GLCD.DRV
GLCD.DRV?

A>
```

`GLCD.DRV` fails here because a video display is already the console: from a
startup line, the graphics LCD's driver installs only while the console is on
the serial terminal. On a board with both displays the `CON UC1` command
installs it later. Chapter 5 gives the rules for display drivers.

A display driver takes 1,536 bytes of memory below the BDOS. CP/M calls the
memory a program may use the TPA, the Transient Program Area: it starts at
`0100h` and ends below the BDOS's entry, whose address is the word at `0006h`.
On the starter card with no driver the word is `B806h`, and programs have
46,854 bytes; with `PICO.DRV` installed it is `B206h`, and programs have
45,318. Chapter 6 explains a program's memory.

If a board has a PICO9918 and the matrix keyboard but no display driver was
installed by the time of the first prompt, the 20 × 4 LCD's last row shows
`PICO?`, since that board's screen is dark and it may have no serial terminal
attached.

## The starter card

`DIR` lists the files on the current drive:

```text
A>DIR
TERM.COM     PROBE.COM    DEMO.COM     MOUNT.COM    VOLS.COM     PICO.DRV
PICO40.DRV   PICO32.DRV   GLCD.DRV     STARTUP.CMD  EDIT.COM     README.TXT
12 files, 986K free
A>
```

A file name has up to eight characters, a full stop and a type of up to three.
A file of type `.COM` is a program, and its name without the type is the
command that runs it. `PICO40.DRV` and `PICO32.DRV` are the PICO9918's console
at 40 columns and at 32 columns; a line in `STARTUP.CMD` naming one of them in
place of `PICO.DRV` selects the width. The last line of the listing is the
number of files and the space left on the drive.

`TYPE` prints a text file. The starter card's `README.TXT` lists the programs:

```text
A>TYPE README.TXT
TEC-OS starter disk

COPY SOURCE DEST   copy a file (built in), for example COPY TERM.COM B:TERM.COM
TERM               draw on the video console; TERM S also scrolls
PROBE              exercise the BDOS file functions
DEMO               the LCD, digits, 8x8 LEDs and PICO9918; any key stops
EDIT NAME.TXT      full-screen editor, if present: ^S save, ^Q quit
VOLS               list the card's volumes
MOUNT B: NAME      put a volume on a drive; MOUNT B: takes it off

B: is an empty work disk, written behind: its changes reach the card when a
file is closed, at ^C and at MOUNT. Press ^C at A> before reset or power off.

A>
```

A drive letter and a colon, typed alone, change the current drive:

```text
A>B:
B>DIR
NO FILE
B>A:
A>
```

Drive B is empty, and it is the place for your own files. Its volume is
*written behind*: TEC-OS holds what a program writes to it in the block cache
and writes it to the card later, at times that include those `README.TXT`
lists. One of them is a `^C` typed at the prompt, which ends the CCP and
starts it again, writing to the card every change the cache holds:

```text
A>^C
A>
```

A `^C` at the prompt before pressing reset, turning the board off or taking
the card out puts every change on the card. Chapter 4 explains the cache and
what a power cut can lose.

## Running a program

`DEMO` uses the hardware services described in Chapter 8. It beeps, puts a
title on the 20 × 4 LCD, counts in hexadecimal on the 7-segment digits and
moves a rainbow across the 8 × 8 LEDs. On a PICO9918 it also draws colour bars
and a bouncing ball, and with a DS1302 clock fitted the LCD's last row shows
the time. Any key stops it. On the serial-only board:

```text
A>DEMO

TEC-OS hardware services demo
PICO9918: no   GLCD: no   clock: yes
Watch the LCD, the digits, the LEDs and the screen.
Press any key to stop.

Demo stopped.

A>
```

After the demo stopped, the LCD still showed its last screen:

```text
TEC-OS hardware demo
7-seg: hex counter
8x8: moving rainbow
Time     12:00:16
```

When a program ends, TEC-OS performs a warm boot. It writes the cache's
changes to the card, starts the CCP again and prints the prompt with the same
drive and user area as before. A user area is one of 16 groups, numbered 0 to
15, into which CP/M divides the files on a drive; Chapter 3 explains them. The
`^C` at the prompt above is a warm boot too, and so is a `^C` that stops a
program reading the console. Chapter 12 explains the warm boot.

A command that is neither built into the CCP nor the name of a program file on
the drive gets its name back with a question mark:

```text
A>NOSUCH
NOSUCH?

A>
```

`CON` names the console in use:

```text
A>CON
CON: TTY: serial terminal
A>
```

`TTY:` is the serial terminal. With the PICO9918 as the console the reply is
`CON: CRT: PICO9918`, and with the graphics LCD it is `CON: UC1: GLCD`.
Chapter 2 explains the console devices and moving the console from one to
another.

## Reset and power

Pressing reset runs cold boot again, so the banner, the volumes and the
startup file's lines appear again, the console starts on the serial terminal
and the prompt is on drive A in user area 0. One thing survives a reset
pressed after TEC-OS has reached a prompt: if the drives held other volumes,
put there while TEC-OS ran, and the card still has those volumes, the drives
hold them again after the reset. Everything else in memory, the cache
included, is rebuilt, and a change in the cache that hadn't reached the card
is lost. Turning the board off loses the RAM, and the drives then hold the
volumes the card's header names. Chapter 4 describes how volumes are moved
between drives.

## A card that won't mount

When the card doesn't answer, or its contents don't pass the checks, cold boot
stops after the banner and prints the diagnostic prompt. With the socket
empty, captured with `node book/capture.mjs --card none --lcd H`:

```text
TEC-OS 0.1 for TEC-1G
No volume mounted, error 01
R retry, H header> H
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 
R retry, H header> 
```

The number after `error` is a code in hexadecimal. Codes `01` to `08` come
from the SD card driver and identify the step of talking to the card that
failed; `01` is no answer to the first command sent to the card, which is what
an empty socket gives. Codes `20` to `2A` come from the checks on the
container: `21` is a block 0 that doesn't start with the container's name,
`TECOSVOL`, and `2A` is a card with no volume for drive A. Appendix D lists
them all.

`H` prints the first 64 bytes of the last block read from the card, in
hexadecimal, which shows whether the card holds a TEC-OS container at all.
With no card no block was read, and the bytes are zeros. `R` starts the boot
again from the LCD and the card, so after fixing or inserting the card, `R`
reaches the prompt without a reset. While the diagnostic prompt is waiting,
the LCD's last row shows `CARD?`, for a board with no terminal attached:

```text
TEC-OS 0.1  TEC-1G


CARD?
```

A card must never be changed on a PC while the TEC-1G is using it. TEC-OS
holds a map of each drive's free space in memory, and after a change made on
the PC the card no longer matches the map. Take the card out after a `^C` at
the prompt, and press reset after putting a changed card back.
