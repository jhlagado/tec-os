---
title: Commands at startup
parent: TEC-OS
nav_order: 8
nav_group: "Using the machine"
---

# 8. Commands at startup

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

`A:STARTUP.CMD` holds commands you want to repeat after reset. TEC-OS runs
them before accepting a command from the keyboard. You can use it to load the shell, select
your display width, load the graphics LCD driver or choose your starting
drive and user area.

## A short file of commands

Each line supplies a command. The file belongs in user area 0 of drive A.
You can use the text editing from Chapter 2 or the card tools from
[Chapter 6](06-cards-on-the-pc.md). The changes take effect at the next
reset. `TYPE A:STARTUP.CMD` lets you read back the saved text before that
reset while user area 0 is selected.

After saving on the board, exit the editor normally before resetting.
A successful exit flush puts pending changes on the card. `Write lost`
means that failed cached writes were dropped so the intended file may
be incomplete. Read back the file and correct it before relying on the
next startup. Reset does not finish pending writes.

The starter card's file has two lines:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'TYPE STARTUP.CMD'. Boot rows included in this complete serial transcript. -->
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

`SHELL.SVC` is the shell of [Chapter 1](01-first-session.md) and `GLCD.SVC`
is the resident graphics LCD service introduced in
[Chapter 5](05-drives-and-user-areas.md). The PICO9918 console is in ROM
and needs no service file. The effect of the GLCD line depends on which
console cold boot selected.

The ROM itself runs only one line of the file. When that line installs the
shell, the shell reads and runs the rest of the file. Keep `SHELL.SVC` on
the first line, or after lines that are empty or begin with `;`. A file
whose first command is anything else runs that command alone.

A startup line uses the same command syntax as a typed command. With an action
on each line, its completion is followed by the next command prompt and command.
Chapter 13 explains multiple commands and conditional execution.

The following recipe copies the starter card and replaces its startup file
with seven lines, the shell first. The `tecvol put` command replaces an
existing file of the same name. Its `--text` option converts each line ending
to CR and LF and appends the CP/M text-end marker, `^Z`:

```sh
printf 'SHELL.SVC\nB:\nUSER 3\ncd\nDIR\nNOSUCH\nUSER 0\n' > startup.cmd
cp dist/starter.img lines.img
node tools/tecvol.mjs put lines.img A startup.cmd --text
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card lines.img. Boot rows included in this complete serial transcript. -->
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

Each line is echoed as it appears in the file before it runs. That is why
`cd` is lowercase in this capture. The shell folds a command's first word to
capitals to match its own commands, so `cd` is its `CD`, which shows the
current drive's volume. `B:` changes the drive and `USER 3` changes the user
area for subsequent lines. `DIR` therefore lists area 3 of B, which is empty.
`NOSUCH` prints its usual error and the next line runs. `USER 0` leaves the first interactive prompt at `B:WORK>`.
TEC-OS takes the next startup line after the program finishes.

The same commands without the `SHELL.SVC` line show the ROM's single line:

```sh
printf 'B:\nUSER 3\ncd\n' > startup.cmd
cp dist/starter.img bare.img
node tools/tecvol.mjs put bare.img A startup.cmd --text
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card bare.img. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>B:
B>
```

`B:` was the ROM's line. No shell was installed, so nothing read the file's
later lines.

## The ROM's line and the shell's lines

The ROM reads only the first 128 bytes of the file. That is a CP/M
*record*, the unit in which file data is read. It takes the first line there
that is neither empty nor begins with `;`. The record's end also ends a
line, so a line cut by it runs in its shortened form. Sixty blank lines take
120 bytes after `--text` conversion because each contains CR and LF. In this
example the remaining eight bytes contain only the start of `DIR *.CMD`:

```sh
printf '\n%.0s' $(seq 60) > startup.cmd
printf 'DIR *.CMD\nUSER 3\n' >> startup.cmd
cp dist/starter.img cut.img
node tools/tecvol.mjs put cut.img A startup.cmd --text
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card cut.img. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>DIR *.CM
NO FILE
A>
```

The shortened `DIR *.CM` still runs, and `USER 3` never runs. The shell has
no such limit. It reads the rest of the file a record at a time, as many
records as the file has. The same sixty blank lines after a `SHELL.SVC`
line put `DIR *.CMD` and `USER 3` in the second record, and both run whole:

```sh
printf 'SHELL.SVC\n' > startup.cmd
printf '\n%.0s' $(seq 60) >> startup.cmd
printf 'DIR *.CMD\nUSER 3\n' >> startup.cmd
cp dist/starter.img long.img
node tools/tecvol.mjs put long.img A startup.cmd --text
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card long.img. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>DIR *.CMD

STARTUP .CMD     256
1 file, 256 bytes
935936 free on A:SYSTEM
A:SYSTEM>USER 3
3A:SYSTEM>
```

These rules determine the boundaries:

- CR or LF ends a line. Empty lines are passed over, and so is a line
  whose first character is `;`, which holds a comment. A `;` after blanks
  is not a comment: the line is rejected as a bad command.
- `^Z` or a zero byte ends startup text. For the ROM's line the end of the
  first record ends it too.
- A line supplies at most its first 127 characters, matching the typed-line
  limit. Further characters on that line are skipped.
- A first line of only spaces or tabs is neither empty nor a comment, so it
  is the ROM's one line and a `SHELL.SVC` after it never loads.

A comment line is a place to record why a line is there:

```sh
printf '; Shell first.\nSHELL.SVC\n; Start on B.\nB:\n' > startup.cmd
cp dist/starter.img semi.img
node tools/tecvol.mjs put semi.img A startup.cmd --text
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card semi.img. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>B:
B:WORK>
```

Neither comment is echoed. A `$` in the ROM's line ends its displayed echo
early while the command still runs in full. The shell echoes its lines
whole. [Chapter 26](26-startup-inside-the-ccp.md) explains the ROM's echo
mechanism with a complete example.

## Program exits and resets

After an ordinary program exit the shell resumes the startup file at its
next unread line. Reset begins a new startup attempt. The three routes back
to a prompt have different effects:

- An ordinary program return or a `^C` that ends a program causes a warm
  boot. Installed services, the shell among them, and mounted volumes
  remain, and startup continues at its next unread line. [Chapter 9](09-call-tec-os.md) explains the
  program-exit routes.
- A recognised reset finds TEC-OS's retained marks in RAM. It rebuilds the
  working state and can restore the previous drive-to-volume assignments
  when the card and retained selection are valid.
- An unrecognised reset, including normal power-on, has no valid retained
  selection. The drives take the assignments in the card's header.

Either kind of reset is a cold boot. It removes installed services, the
shell among them, selects drive A and user area 0 and runs the startup file
once. At the
current source, a responding PICO9918 with the Matrix switch enabled
starts as the 40-column console. Otherwise the console starts on
serial. A startup width or GLCD line can then select the intended display.

The file is always taken from user area 0 of the volume assigned to A at
that reset. If a recognised reset restores another volume to A, that
volume's startup file runs. An absent file leaves no startup commands.
[Chapter 5](05-drives-and-user-areas.md) explains retained assignments and
fallback to the card's defaults.

This card has a third volume, SPARE, with a different startup file. Its
initial A file loads the shell and lists the card's volumes with `CD ?`.
After `CD A:SPARE` and reset, SPARE's file is A's. Its one line, `USER 2`,
is the ROM's, and SPARE has no shell:

```sh
node tools/tecvol.mjs create spare.img --volume G1M:SYSTEM:A --volume G8M:WORK:B --volume G1M:SPARE --drives 4
node tools/tecvol.mjs put spare.img A dist/files/SHELL.SVC
printf 'SHELL.SVC\nCD ?\n' > startup.cmd
node tools/tecvol.mjs put spare.img A startup.cmd --text
printf 'USER 2\n' > startup.cmd
node tools/tecvol.mjs put spare.img SPARE startup.cmd --text
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card spare.img 'CD A:SPARE' @reset. Boot rows included in this complete serial transcript. -->
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
is no longer mounted, and with it the shell and the tools needed for
recovery. With no shell there is no `CD` to put SYSTEM back, and a
recognised reset repeats the retained assignment while it remains valid. A
power loss clears the retained selection so the next boot uses the header's
SYSTEM assignment again. On the web page, Power cycle does the same.

## Display commands in the file

The supplied `GLCD.SVC` line supports different board configurations.
With the Matrix switch enabled a responding PICO9918 starts its ROM
console before that line. The GLCD service then has these outcomes:

- With no active PICO9918 console, the line selects GLCD if its controller
  responds and the Matrix switch is enabled.
- With PICO9918 already selected, the startup line installs nothing and
  passes quietly. `CON UC1` can later load the service and select GLCD.
- An absent graphics LCD controller also makes the startup line pass quietly.

Quiet means that the command prints no error and the next startup line
can run. It does not mean that a driver was installed. A responding GLCD
controller with the Matrix switch off instead gives `GLCD.SVC?`. That
failure still allows the next line. Typing `GLCD.SVC` at the prompt has
a different result on a board with both displays: it can install the
service while leaving PICO9918 selected, as Chapter 5 demonstrated.

The capture configurations produce this table:

| Board | `GLCD.SVC` | Console at the first prompt |
| --- | --- | --- |
| Serial terminal only, `--board serial` | Passes quietly | `TTY:` |
| Graphics LCD and matrix keyboard, `--board glcd` | Installs | `UC1:` |
| Both displays and matrix keyboard, `--board pico` | Passes quietly | `CRT:` |

The last configuration has no resident GLCD driver after startup.
`SERVICES` lists only the shell and `CON` reports the ROM console:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico SERVICES CON. Boot rows included in this complete serial transcript. -->
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

On the serial and GLCD configurations, the banner and volume names first
go to serial and the 20 × 4 character LCD. The GLCD can become the console
only after its startup service loads.

A startup width command selects the intended PICO width after each reset.
Cold boot starts at 40 columns before the startup file runs. An explicit
width command can select 80, 40 or 32 columns. Bare `CON CRT` and `CON PICO`
retain the current width and any program claim. This recipe puts a
32-column command between the shell and the supplied GLCD line:

```sh
printf 'SHELL.SVC\nCON PICO 32\nGLCD.SVC\n' > startup.cmd
cp dist/starter.img w32.img
node tools/tecvol.mjs put w32.img A startup.cmd --text
```

The banner and volumes appeared at 40 columns. The width command cleared
the screen at 32 columns before printing its reply. After `DIR` the PICO
screen contained:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card w32.img --board pico --screen DIR. The full screen, with trailing empty rows omitted. -->
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
HELLO3  .BIN     256
HELLO3  .ASM    2176
14 files, 86272 bytes
935936 free on A:SYSTEM
A:SYSTEM>
```

[Appendix J](appendix-j-command-reference.md#programs-on-the-starter-card)
lists the fourteen files.

Where the ROM PICO console did not start, a startup width command passes
quietly. The same command typed there reports the width with `?`, such as
`32?`. The serial-only run of that same card showed every startup command
without an error:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card w32.img. Boot rows included in this complete serial transcript. -->
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

After a skip no service has been installed, not even the shell. The prompt
is the ROM's own: `DIR` and `TYPE` list without pausing, `^W` recalls
nothing, and `COPY`, `DEL` and `SERVICES` are unknown commands. Typing
`SHELL.SVC` installs the shell. A responding PICO9918 with
the Matrix switch enabled remains the console. Otherwise the board has
serial and the 20 × 4 LCD until a GLCD driver is loaded. In that latter
configuration, matrix input becomes available with the GLCD console after
installation, provided the Matrix switch is enabled.

At the serial prompt you can erase the bad file with `ERA STARTUP.CMD` or
replace it with corrected text then reset. The startup file is in user area 0 of
A so recovery must address that location. Without a usable terminal, the Chapter
6 card tools can replace or erase it on a PC. A recognised reset with a skip
retains valid drive assignments just as it does without a skip.

The web page has no hex keypad. Its Copy file to drive and New starter card
controls provide recovery from a bad file, as Appendix I explains.

## Recovery words on the character LCD

The last row of the 20 × 4 LCD gives a result even without an attached
terminal. `GLCD?` reports a load or installation failure returned by
`CON UC1`, with the console still where it was. A fatal card-read error
instead prints the BDOS disk-error message and ends the command.
`CARD?` accompanies a card-mount failure and the diagnostic prompt described in
[Chapter 28](28-diagnose-the-machine.md).

The next recipe removes the startup file. On the serial board, `CON UC1`
then fails to install GLCD and leaves `GLCD?` on that LCD row:

```sh
cp dist/starter.img nostart.img
node tools/tecvol.mjs era nostart.img A STARTUP.CMD
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card nostart.img --lcd 'CON UC1'. Boot rows included in this complete serial transcript. -->
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

A successful GLCD installation clears that recovery word, whether GLCD
becomes the console or PICO9918 stays selected. The next card keeps the
driver as `G.SVC` instead. `CON UC1` cannot find `GLCD.SVC`,
then typing `G.SVC` installs it and clears the word:

```sh
cp nostart.img gname.img
node tools/tecvol.mjs put gname.img A dist/files/GLCD.SVC G.SVC
node tools/tecvol.mjs era gname.img A GLCD.SVC
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card gname.img --board glcd --lcd 'CON UC1' G.SVC CON. Boot rows included in this complete serial transcript. -->
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

`CARD?` is cleared differently. `R` at the diagnostic prompt reinitialises
the LCD before retrying the card so a successful retry clears the word.
Another mount failure writes it again.
