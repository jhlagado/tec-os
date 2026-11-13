---
title: Commands at startup
parent: TEC-OS
nav_order: 8
nav_group: "Using the machine"
---

# 8. Commands at startup

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

Commands in `A:STARTUP.CMD` repeat your usual setup after reset.
TEC-OS runs them before accepting keyboard commands. They can load
the shell or a graphics LCD driver and select a display width. They
can also set the starting drive and user area. You can keep those choices on the card instead
of typing them each session.

## A short file of commands

The file contains a command per line in user area 0 of A. You can
edit it in TED as in Chapter 2 or use the
[PC card tools](06-cards-on-the-pc.md). While user area 0 is selected,
`TYPE A:STARTUP.CMD` displays the saved text for checking. Changes take
effect at the next reset.

After saving on the board, exit the editor normally before resetting.
A successful exit flush puts pending changes on the card. `Write lost`
means that failed cached writes were dropped so the intended file may
be incomplete. Read back the file and correct it before relying on the
next startup. Reset does not finish pending writes.

The starter card's file has two lines:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs 'TYPE STARTUP.CMD'. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>TYPE STARTUP.CMD
SHELL.SVC
GLCD.SVC

A:SYSTEM>
```

`SHELL.SVC` loads the shell used in [Chapter 1](01-first-session.md).
`GLCD.SVC` is the graphics LCD service from
[Chapter 5](05-drives-and-user-areas.md). Its startup effect depends
on the console selected at cold boot. The PICO9918 console needs no
service file because its code is in ROM.

The ROM runs the first command. `SHELL.SVC` must be that command so
the installed shell can run the remaining lines. It can follow empty
lines or comments beginning with `;`. Any other first command runs
alone, leaving the rest of the file unread.

Startup commands use the same syntax as typed commands. Each completed
command is followed by a prompt and the next command. Chapter 13
explains command chains and conditional execution within a line.

This recipe copies the starter image before replacing its startup file
with seven lines. The shell is first. `tecvol put` replaces the existing
file and `--text` converts its line endings to CRLF with a final CP/M
text-end marker, `^Z`:

```sh
printf 'SHELL.SVC\nB:\nUSER 3\ncd\nDIR\nNOSUCH\nUSER 0\n' > startup.cmd
cp dist/starter.img lines.img
node tools/tecvol.mjs put lines.img A startup.cmd --text
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card lines.img. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>B:
B:WORK>USER 3
3B:WORK>cd
B:WORK
3B:WORK>DIR
NO FILE

3B:WORK>NOSUCH
NOSUCH?

3B:WORK>USER 0
B:WORK>
```

The startup text is echoed as written, so `cd` appears in lower case.
The shell folds the command word to capitals for matching and runs it
as CD. Earlier lines have selected B and area 3, so DIR reports no files
in that area. NOSUCH fails without stopping the next line. USER 0
then leaves the first interactive prompt at `B:WORK>`. A program on
a startup line completes before the next line runs.

The same commands without the `SHELL.SVC` line show the ROM's single line:

```sh
printf 'B:\nUSER 3\ncd\n' > startup.cmd
cp dist/starter.img bare.img
node tools/tecvol.mjs put bare.img A startup.cmd --text
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card bare.img. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>B:
B>
```

Only `B:` ran. With no shell installed, the remaining lines were
left unread.

## Display commands in the file

The supplied GLCD line allows the same card to start on different
displays. A responding PICO9918 with the Matrix switch enabled starts
its ROM console first. The later `GLCD.SVC` command has these effects:

- With no active PICO9918 console, the line selects GLCD if its controller
  responds and the Matrix switch is enabled.
- With PICO9918 already selected, the startup line installs nothing and
  passes quietly. `CON UC1` can later load the service and select GLCD.
- An absent graphics LCD controller also makes the startup line pass quietly.

A quiet line prints no error and permits the next startup command.
It may leave the driver uninstalled. A responding GLCD with the Matrix
switch off instead produces `GLCD.SVC?`, after which startup still
continues. Typing `GLCD.SVC` at the prompt can install it while leaving
PICO9918 selected, as in Chapter 5. The quiet startup path differs
from that typed command.

The host-model configurations give these startup results:

| Board | `GLCD.SVC` | Console at the first prompt |
| --- | --- | --- |
| Serial terminal only, `--board serial` | Passes quietly | `TTY:` |
| Graphics LCD and matrix keyboard, `--board glcd` | Installs | `UC1:` |
| Both displays and matrix keyboard, `--board pico` | Passes quietly | `CRT:` |

With both displays configured, startup leaves no resident GLCD driver.
`SERVICES` lists only the shell and `CON` reports CRT:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico SERVICES CON. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>SERVICES
SHELL 15
A:SYSTEM>CON
CON: CRT:
A:SYSTEM>
```

Serial and GLCD configurations first display the banner and volume
names on serial and the 20 × 4 character LCD. The GLCD becomes the
console only after its service loads.

A width command in the file reapplies your choice after reset. The
PICO9918 starts at 40 columns before startup, then an explicit command
can select 80, 40 or 32. Bare `CON CRT` and `CON PICO` retain the width
and any program claim. This recipe places a 32-column selection between
the shell and GLCD lines:

```sh
printf 'SHELL.SVC\nCON PICO 32\nGLCD.SVC\n' > startup.cmd
cp dist/starter.img w32.img
node tools/tecvol.mjs put w32.img A startup.cmd --text
```

The banner and volumes first appeared at 40 columns. Selecting 32
cleared the screen before the reply. A later DIR produced this display:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card w32.img --board pico --screen DIR. Full screen; trailing empty rows omitted. -->
```text
CON: CRT:
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

[Appendix J](appendix-j-command-reference.md#programs-on-the-starter-card)
lists the thirteen files.

A startup width command passes quietly if the ROM PICO console did
not start. The typed equivalent would print the width followed by `?`,
such as `32?`. This serial-only run of the same card printed each
startup command without an error:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card w32.img. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>CON PICO 32

A:SYSTEM>GLCD.SVC

A:SYSTEM>
```

The web page's Display control prepares the startup file at power-on.
Successful preparation places the selected display command after the
`SHELL.SVC` line. Every
PICO width has an explicit line: `CON PICO 80`, `CON PICO 40` or `CON PICO 32`.
The page's default remains 80 columns, selected through that startup line
after the ROM's 40-column cold start. GLCD selection puts `GLCD.SVC` first.
Other commands are kept. If preparation fails, the page reports the problem
and boots the card unchanged.
[Appendix I](appendix-i-web-page.md) gives the exact rewrite and failure rules.

## Bypassing a bad startup file

A program that hangs or resets the board can prevent startup from reaching an
interactive prompt. With the keypad non-maskable interrupt (NMI) jumper off,
hold any hex-keypad key from reset until the prompt appears. TEC-OS samples the
keypad once just before opening the file and skips startup when a key is down.
On the host model with the starter card that sample comes about 1.46
seconds after reset on the web page's board, and about 1.50 seconds on the
serial board.

The NMI jumper must be off for this bypass. A key press with it fitted
causes a non-maskable interrupt at an address TEC-OS uses for other data
and can crash the system. [Appendix G](appendix-g-tec-1g.md#the-hex-keypad-and-its-nmi)
gives the board requirement.

Skipping startup leaves the ROM prompt with no services installed.
DIR and TYPE run without pauses. Recall with `^W` is unavailable,
as are COPY, DEL and SERVICES, until `SHELL.SVC` installs the shell. A started
PICO9918 console remains selected. Otherwise output is on serial and
the 20 × 4 LCD until the GLCD driver loads. Selecting that console
also enables matrix input if the Matrix switch is on.

At the serial prompt you can erase the bad file with `ERA STARTUP.CMD` or
replace it with corrected text then reset. The startup file is in user area 0 of
A so recovery must address that location. Without a usable terminal, the Chapter
6 card tools can replace or erase it on a PC. A recognised reset with a skip
retains valid drive assignments just as it does without a skip.

The web page has no hex keypad. Its Copy file to drive and New starter card
controls provide recovery from a bad file, as Appendix I explains.

## The ROM's line and the shell's lines

The ROM finds its first command within the first 128-byte CP/M record.
It skips empty lines and lines beginning with `;`. The record boundary
also ends a command, so text crossing it is cut short. In this example,
sixty CRLF blank lines occupy 120 bytes. The remaining eight bytes
contain only the beginning of `DIR *.CMD`:

```sh
printf '\n%.0s' $(seq 60) > startup.cmd
printf 'DIR *.CMD\nUSER 3\n' >> startup.cmd
cp dist/starter.img cut.img
node tools/tecvol.mjs put cut.img A startup.cmd --text
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card cut.img. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>DIR *.CM
NO FILE
A>
```

The shortened command, `DIR *.CM`, runs and USER 3 is never read.
The shell reads as many records as the file contains. Putting SHELL.SVC
first moves both commands into its part of the file. The sixty blank
lines place them in the second record and both run in full:

```sh
printf 'SHELL.SVC\n' > startup.cmd
printf '\n%.0s' $(seq 60) >> startup.cmd
printf 'DIR *.CMD\nUSER 3\n' >> startup.cmd
cp dist/starter.img long.img
node tools/tecvol.mjs put long.img A startup.cmd --text
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card long.img. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>DIR *.CMD

STARTUP .CMD     256
1 file, 256 bytes
937984 free on A:SYSTEM
A:SYSTEM>USER 3
3A:SYSTEM>
```

The parser applies these line and file limits:

- CR or LF ends a line. Empty lines are passed over, and so is a line
  whose first character is `;`, which holds a comment. A `;` after blanks
  is not a comment: the line is rejected as a bad command.
- `^Z` or a zero byte ends startup text. For the ROM's line the end of the
  first record ends it too.
- A line supplies at most its first 127 characters, matching the typed-line
  limit. Further characters on that line are skipped.
- A first line of only spaces or tabs is neither empty nor a comment, so it
  is the ROM's one line and a `SHELL.SVC` after it never loads.

Comment lines can explain a startup choice without running a command.
Here they identify why the shell is first and why B is selected:

```sh
printf '; Shell first.\nSHELL.SVC\n; Start on B.\nB:\n' > startup.cmd
cp dist/starter.img semi.img
node tools/tecvol.mjs put semi.img A startup.cmd --text
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card semi.img. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>B:
B:WORK>
```

Comments are not echoed. The ROM's command echo has a separate limit:
a `$` ends its display early, although the complete command still runs.
The shell echoes complete lines. [Chapter 26](26-startup-inside-the-ccp.md)
explains the ROM echo with an example.

## Program exits and resets

A program exit lets the shell continue at the next unread startup line.
Reset instead begins startup again. These routes retain different state:

- An ordinary program return or a `^C` that ends a program causes a warm
  boot. Installed services, the shell among them, and mounted volumes
  remain, and startup continues at its next unread line. [Chapter 9](09-call-tec-os.md) explains the
  program-exit routes.
- A recognised reset finds TEC-OS's retained marks in RAM. It rebuilds the
  working state and can restore the previous drive-to-volume assignments
  when the card and retained selection are valid.
- An unrecognised reset, including normal power-on, has no valid retained
  selection. The drives take the assignments in the card's header.

Both reset paths perform a cold boot. They remove the installed
services, select A and area 0 and run startup once. A responding
PICO9918 with the Matrix switch enabled starts at 40 columns. Other
configurations start on serial. A width or GLCD startup line can then
select another layout or display.

Startup is read from area 0 of whichever volume is on A at reset.
A recognised reset can restore another volume there and run its file.
No startup commands run if that file is absent.
[Chapter 5](05-drives-and-user-areas.md) explains retained assignments
and the card-header defaults.

This separate card has a SPARE volume with another startup file.
SYSTEM initially loads the shell and runs `CD ?`. After `CD A:SPARE`
and reset, the file on SPARE runs instead. It contains only `USER 2`
and installs no shell:

```sh
node tools/tecvol.mjs create spare.img --volume G1M:SYSTEM:A --volume G8M:WORK:B --volume G1M:SPARE --drives 4
node tools/tecvol.mjs put spare.img A dist/files/SHELL.SVC
printf 'SHELL.SVC\nCD ?\n' > startup.cmd
node tools/tecvol.mjs put spare.img A startup.cmd --text
printf 'USER 2\n' > startup.cmd
node tools/tecvol.mjs put spare.img SPARE startup.cmd --text
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card spare.img 'CD A:SPARE' @reset. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK

A>SHELL.SVC

A:SYSTEM>CD ?

SYSTEM      A:
WORK        B:
SPARE
A:SYSTEM>CD A:SPARE
A:SPARE
A:SPARE>
TEC-OS 0.1 for TEC-1G
A: SPARE
B: WORK

A>USER 2
2A>
```

The reset has kept SPARE on A so the final prompt is the bare `2A>`. SYSTEM
is no longer mounted, so its shell and tools cannot be loaded yet.
The ROM's CD remains available: `CD ?` lists the named directories and
`CD A:SYSTEM` restores SYSTEM. The current user area remains 2, so use
`USER 0` and then `SHELL.SVC` to load the starter's shell. A recognised
reset repeats the retained assignment while it remains valid. Power cycle
restores the header's default drive assignments and startup.

## An older card's display file

An older card may name its driver `GLCD.DRV`. This ROM treats that name
as a program command and reports `GLCD.DRV?`. Changing the name to
`GLCD.SVC` and updating the startup line can work when the file is already
service format 4. Renaming does not convert an incompatible format.
[Appendix H](appendix-h-service-file-format.md#the-header) gives the
service-format fields and checks.

An old `PICO.SVC` cannot install under another name because the PICO9918
console is now in ROM. [Appendix D](appendix-d-error-messages.md#a-card-from-an-older-tec-os)
retains the complete old-card renaming example.

## Recovery words on the character LCD

The last row of the 20 × 4 LCD can display failure information without
a terminal. `GLCD?` means `CON UC1` could not load or install the driver
and left the console unchanged. A fatal card-read failure instead
prints a BDOS disk error and ends the command. `CARD?` accompanies a
mount failure at the diagnostic prompt in
[Chapter 28](28-diagnose-the-machine.md).

The next recipe removes the startup file. On the serial board, `CON UC1`
then fails to install GLCD and leaves `GLCD?` on that LCD row:

```sh
cp dist/starter.img nostart.img
node tools/tecvol.mjs era nostart.img A STARTUP.CMD
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card nostart.img --lcd 'CON UC1'. Complete captured console transcript and LCD rows. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>CON UC1
CON: TTY:
A>
--- LCD
TEC-OS 0.1  TEC-1G
A: SYSTEM
B: WORK
GLCD?
```

A successful driver installation clears `GLCD?` whether it selects
GLCD or leaves PICO9918 selected. This next image names the driver
`G.SVC`. CON UC1 fails to find GLCD.SVC, then G.SVC installs the
driver and clears the word:

```sh
cp nostart.img gname.img
node tools/tecvol.mjs put gname.img A dist/files/GLCD.SVC G.SVC
node tools/tecvol.mjs era gname.img A GLCD.SVC
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card gname.img --board glcd --lcd 'CON UC1' G.SVC CON. Complete captured console transcript and LCD rows. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>CON UC1
CON: TTY:
A>G.SVC

A>CON
CON: UC1:
A>
--- LCD
TEC-OS 0.1  TEC-1G
A: SYSTEM
B: WORK
```

The `CON UC1` reply and the typed `G.SVC` line are on serial. The later
prompt and `CON: UC1:` report are on GLCD.

Clearing `GLCD?` writes blanks over only its five characters.
[Chapter 12](12-use-the-boards-devices.md#the-lcd-and-the-speaker) explains
how a program replaces the row through the LCD service.
[Chapter 26](26-startup-inside-the-ccp.md#recovery-words-and-row-ownership)
explains when later console changes preserve or clear its text.

`R` at the diagnostic prompt reinitialises the LCD before another
card-mount attempt. This clears `CARD?` on success. A failed attempt
writes the word again.
