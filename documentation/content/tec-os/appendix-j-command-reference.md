---
title: J. Command reference
parent: TEC-OS
nav_order: 110
nav_group: "Reference"
---

# Appendix J. Command reference

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A command line contains a command and its arguments, separated by spaces.
Return or `^J` ends the line. The maximum is 127 characters and typing the
last available character also ends it. `^C` cancels only at the start of
the line. Later in the line it is ignored. Recall and editing keys are in
[The first session](01-first-session.md). The ROM's
command processor runs the built-ins marked ROM below, and the shell,
`SHELL.SVC`, which the starter card's startup file installs, adds those
marked shell, recall, the `[more]` pause, lines of several commands and
`.CMD` scripts (`docs/shell.md:1-50`). Command names and ordinary program arguments are converted to capitals
before execution. ECHO and PAUSE keep their text as typed. The command
echo also retains the case typed.
[Work with files](04-work-with-files.md) explains the ordinary operations.
This appendix gives their exact forms and boundary cases.

## Names and patterns

A file reference has an optional drive, a name of up to eight characters
and an optional type of up to three. A full stop separates the name and type as in `B:NOTES.TXT`. With no drive the reference uses the current drive.
With no type its three stored type bytes are spaces.

Spaces separate arguments. These thirteen characters are rejected inside
name and type fields:

```text
< > , ; : [ ] % | ( ) / \
```

A colon belongs to the optional drive prefix. A full stop or equals sign
ends the current field. A field longer than its limit is rejected.
The parser and delimiter checks are in `src/cpm/ccpcmd.asm:457-569`,
`src/cpm/ccpcmd.asm:602-662` at the stated source revision.

`?` matches one character, including a padding space. `*` fills the rest of its
field with question marks. Thus `G*.*` is `G???????.???`. Text after a star in
the same field is ignored so `D*X` and `D*` select the same pattern. A short
field is padded with spaces. `????.COM` therefore matches names of up to four
characters with type COM, not every name ending in COM
(`src/cpm/ccpcmd.asm:546-569`, `src/cpm/ccpcmd.asm:624-645`).

DIR and ERA use patterns to select files. TYPE, REN and SAVE require
unambiguous names. COPY requires an unambiguous source and resolved
destination, with the blank-destination rules below. A program or service
command also requires one name.
The following retained capture shows an overlong name, a pattern where TYPE
requires one file and a second argument where DIR accepts only one.

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'DIR VERYLONGNAME.TXT' 'TYPE *.CMD' 'DIR A: B:'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>DIR VERYLONGNAME.TXT
DIR?

A:SYSTEM>TYPE *.CMD
*.CMD?

A:SYSTEM>DIR A: B:
DIR?

A:SYSTEM>
```

For built-ins other than COPY and UNLOAD, the word before `?` is the first
argument, even when a later argument is wrong. A missing required argument
usually produces `?` alone. TYPE with no name instead prints `NO FILE`.
CON is another exception: when a separated width is invalid, as in
`CON PICO 50`, it prints `50?`. COPY and UNLOAD print their own names. An unknown or unloadable program
prints its command name. [Appendix D](appendix-d-error-messages.md) lists
the causes and recovery actions.

## Command forms

The ROM holds eight built-ins, DIR, TYPE, ERA, REN, SAVE, USER, CON and
UNLOAD. The shell adds COPY, DEL, SERVICES, CD, CLS, ECHO and PAUSE, and its
own DIR, which lists sizes and hands `DIR /W` to the ROM's
(`src/tables.asm:53-76`, `drivers/shell.asm:650-667`). Drive selection, program launch and service
installation have additional forms handled by the command processor.

| Form | In | Operation |
| --- | --- | --- |
| `DIR [PATTERN]` | Shell | List matching files, or all visible files, with each file's size in bytes |
| `DIR /W [PATTERN]` | ROM | List names across the row. Without the shell, `DIR` is this listing |
| `TYPE NAME` | ROM | Print one text file |
| `COPY SOURCE [DEST]` | Shell | Copy one file, with the destination rules below |
| `REN NEW=OLD` | ROM | Rename one file on one drive |
| `ERA PATTERN` | ROM | Erase matching files |
| `DEL PATTERN` | Shell | Erase matching files, as another name for ERA |
| `SAVE N NAME` | ROM | Save N memory pages from `0100h` |
| `USER N` | ROM | Select user area 0 to 15 |
| `CON [DEVICE [WIDTH]]` | ROM | Report or change the console |
| `SERVICES` | Shell | List installed services, newest first |
| `CD [D:][NAME]`, `CD ?` | Shell | Put a volume on a drive, show a drive's volume or list the card's volumes |
| `CLS` | Shell | Clear the screen |
| `ECHO TEXT` | Shell | Print the text as typed |
| `PAUSE [TEXT]` | Shell | Print the text or `[more]` and wait for a key |
| `UNLOAD` | ROM | Attempt to remove the newest service |
| `D:` | ROM | Select drive D, with the same form for another drive |
| `NAME [ARGS]` | ROM | Load a COM program and pass its arguments |
| `NAME.SVC [ARGS]` | ROM | Load a resident service, and enter its application when it has one |
| `NAME.CMD` | Shell | Run a script of command lines. Without the shell, run `NAME.COM` |

Without the shell `COPY`, `DEL`, `SERVICES`, `CD`, `CLS`, `ECHO` and `PAUSE`
are names like any other, so each looks for a program of that name and
normally prints the name with a question mark, and `DIR` is the ROM's wide
listing (`docs/shell.md:32-51`).

A built-in name must end at a space or the end of the command piece.
`DIRX`, `DIR.COM` and `A:DIR` are program commands, not forms of built-in
DIR. The last searches for `A:DIR.COM`. The keyword comparison uses the
original command word (`src/cpm/ccpcmd.asm:678-708`).

### DIR and TYPE

DIR accepts no argument, a drive alone or one pattern with an optional
drive. It lists the current user area's matching files except those with
the system attribute. Each file appears once. No match produces `NO FILE`
with return code `FF00h`. A system file remains available to TYPE and to
program lookup.

Under the shell, DIR prints a blank line, then one file a row: the name and
type padded and the size in bytes, BDOS function 35's records times 128, in
a 20-column row that fits the graphics LCD's 21. Then come the count of files
and their bytes, and the drive's free bytes, function 46's records times 128,
with its volume:

```text
A:SYSTEM>DIR

SHELL   .SVC    3712
SAY     .COM     128
X       .DAT  128128
3 files, 131968 bytes
1013760 free on A:SYSTEM
```

This listing is the one `docs/shell.md:193-227` gives. Files of one directory
entry come first, listed in one pass. A file that may have more entries is
sized by function 35, which scans the directory, so DIR is slower on a volume
of many large files: on a G8M volume a file over 32 KiB has more than one
entry, and on a G1M one over 16 KiB. `DIR /W` is then the fast listing.

`DIR /W`, and DIR without the shell, is the ROM's wide listing. Its last line
gives the number listed and the free KiB on that drive. A displayed name has
a 13-column field except at the end of a row. The number of names per row
follows the console width and is at least one. Serial uses the 80-column
layout. This differs from Digital Research's DIR layout.

Under the shell both DIR and TYPE pause at `[more]`, one row before a full
screen. Without it they list to the end. The practical continuation and stop
keys are in [Chapter 4](04-work-with-files.md).

TYPE takes one name without wildcards and no extra argument. It prints
through the pager until the first Ctrl-Z byte, `1Ah`, or the end of the
last record. No name or no matching file produces `NO FILE`.

### COPY

COPY is the shell's (`drivers/shellcmd.asm:54-219`,
`docs/compatibility.md:125-133`).
COPY uses the current user area on both source and destination drives.
A name without a drive uses the current drive. A destination containing only
a drive takes the source's complete name and type. A destination with a type
but no name also takes the source's complete name and type, ignoring that
destination type. Omitting DEST applies the same rules to a blank destination.

The resolved source and destination must differ. A self-copy or an argument
after the destination produces `COPY?` before either file is opened.
A valid copy replaces any existing destination file, subject to protection.
On success `COPIED` is followed by the number of 128-byte records copied,
in hexadecimal (`drivers/shellcmd.asm:54-154`).

The type-only destination and self-copy cases below were captured on A
with the starter card.

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'COPY STARTUP.CMD B:.DOC' 'DIR B:' 'COPY A:STARTUP.CMD STARTUP.CMD' 'COPY STARTUP.CMD'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>COPY STARTUP.CMD B:.DOC
COPIED 0001

A:SYSTEM>DIR B:

STARTUP .CMD     128
1 file, 128 bytes
8368128 free on B:WORK
A:SYSTEM>COPY A:STARTUP.CMD STARTUP.CMD
COPY?

A:SYSTEM>COPY STARTUP.CMD
COPY?

A:SYSTEM>
```

On B, `COPY A:STARTUP.CMD` instead has distinct source and destination drives
and copies to B. If a copy fills the drive or directory, COPY closes its
partial destination before printing `WRITE ERROR`. If that close succeeds,
the destination retains the records written before the failure. The message
does not confirm that the close succeeded. Its other messages distinguish a
missing source, inability to make a destination and failure to close it.

### REN

REN requires `NEW=OLD` with no spaces around the equals sign. Both names must
be unambiguous. Either name may specify the drive. The other must omit it
or specify the same drive. Thus `REN B:NEW.TXT=OLD.TXT` and
`REN NEW.TXT=B:OLD.TXT` rename on B. Different drives are rejected.

REN checks the new name first. If it already exists, `FILE EXISTS` is printed
and nothing is renamed. An absent old name produces `NO FILE`
(`src/cpm/ccpmut.asm:81-149`).

### ERA

ERA accepts one name or pattern and no extra argument. If all eleven name
and type positions are question marks, as with `*.*`, it prints
`ALL (Y/N)?`. A Return alone leaves every file unchanged. Otherwise ERA
reads through the next Return and erases only when the answer's first
character is Y or y. Other answers leave the files unchanged.

A pattern whose eleven stored positions are not all question marks, such
as `*.TXT`, is erased without confirmation. No match produces `NO FILE`
(`src/cpm/ccpmut.asm:10-67`). Protection and write failures can stop a
multi-file erase after some entries have already been erased. The exact
partial-result cases are in [Appendix D](appendix-d-error-messages.md).

DEL is another name for ERA and is the shell's: the shell rewrites the word as `ERA` and hands the piece to the
ROM, so it takes the same names and patterns and prints the same
`ALL (Y/N)?` question. Because a built-in is matched before a program is
looked up, plain `DEL` under the shell does not run a `DEL.COM`, as plain
`ERA` never runs an `ERA.COM`. `A:DEL` or `DEL.COM` still runs that file
(`drivers/shell.asm:543-552`, `docs/compatibility.md:121-124`,
`test/commands.test.mjs:163-213`).

The following run starts with an empty B drive and copies one
disposable file there. It records an `n` answer that leaves the file and a `y`
answer that erases it. This is a separate demonstration, not the card
used for BANNER in Chapter 2. `ERA *.*` would erase BANNER too on that card.

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'COPY STARTUP.CMD B:' B: '@start ERA *.*' $'@key n\x0d' DIR '@start ERA *.*' $'@key y\x0d' DIR. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>COPY STARTUP.CMD B:
COPIED 0001

A:SYSTEM>B:
B:WORK>ERA *.*
ALL (Y/N)?n
B:WORK>DIR

STARTUP .CMD     128
1 file, 128 bytes
8368128 free on B:WORK
B:WORK>ERA *.*
ALL (Y/N)?y
B:WORK>DIR
NO FILE

B:WORK>
```

### SAVE

SAVE takes a decimal count from 0 to 255 and one unambiguous file name. It
writes that many 256-byte pages starting at `0100h`. A count of 0 makes an empty
file. The count must be less than the high byte of the word at `0006h` so the
saved pages stop below the resident entry's page.
[Memory for programs](11-memory-for-programs.md) gives the memory boundary and
the complete capacity example.

An existing file of the same name is erased first. A failed make, write or
close produces `NO SPACE`. After a write failure SAVE attempts to close the
file. If the close succeeds, its directory entry retains the records written.
`NO SPACE` does not confirm that the close succeeded. Digital Research's CP/M 2.2
SAVE leaves the file open in that case (`src/cpm/ccpcmd.asm:252-390`).

### Drives, USER and program lookup

A drive selection is a letter and colon with no other argument. A through D are
the available TEC-OS drives. The CP/M letters E through P parse as drives but
selection fails. USER accepts a single digit from 0 to 9 or one of 10 to 15.
Leading-zero forms such as `00` and `03` are rejected. A nonzero user number
appears before the drive in the command prompt. Under the shell the drive's
volume follows the drive, as in `A:SYSTEM>` and `3B:GAMES>`, and a drive
with no volume shows `C:>`. Without the shell the prompt is `A:SYSTEM>`.

For a program command the type is replaced by COM, except for SVC. Lookup starts
on the named drive or the current drive when none is named. On that drive it
searches the current user area followed by user 0. The current user is restored
after that search. A file in user 0 needs no system attribute.

If no file is found, a plain command on a drive other than A continues on A
in the same user order. An explicit drive suppresses that fallback.
A found file that cannot load stops the search rather than permitting
another copy on a later drive. These paths are in `src/cpm/ccp.asm:374-440`
and `src/cpm/ccp.asm:572-623`. [Chapter 5](05-drives-and-user-areas.md)
works through the resulting choices.

### CD

CD is the shell's. It puts one of the card's volumes on a drive, A to D,
and reports what a drive holds:

| Typed | Result |
| --- | --- |
| `CD NAME` | Puts the volume `NAME` on the current drive, A included, and shows `d:NAME` |
| `CD D:NAME` | Puts `NAME` on D. The current drive is unchanged |
| `CD` | The current drive's volume, read from the card again, as `B:GAMES` |
| `CD D:` | D's volume, the same way |
| `CD ?` | Each of the card's volumes in the card's order, with its drive |

CD of the volume already on the drive shows it and mounts nothing. A volume on
another drive is refused, naming that drive, as `GAMES is on B:`, since a
volume is never on two drives. No such volume gives `NAME?`. A name of more
than 11 characters, a drive past D or text after the name or after `?` gives
`CD?`. A mount the ROM refuses, a volume too large for the drive's slot or a
cache line the card will not take, gives `CANNOT MOUNT` and the drive keeps
its volume. Each refusal sets return code `FF00h`. To take a volume off a
drive, put another there. CD of the drive a script is read from is refused
with `CD?` and the script goes on (`docs/shell.md:141-191`).

The commands found on A follow its volume. A reset keeps the drives'
selection, so after CD puts a volume with no `SHELL.SVC` on A, a reset gives
the bare `A>` with no shell and no CD. Power off and on gives the card's own
drives and the shell again. Without the shell no command changes a drive's
volume.

### CLS, ECHO and PAUSE

These are the shell's. `CLS` sends `ESC [ H ESC [ 2 J`, so the screen then
holds only the prompt. `ECHO TEXT` prints the text as typed: the shell folds
only a piece's first word to capitals to match its built-ins, so the text
keeps its case. `PAUSE` shows `[more]` and `PAUSE TEXT` the text. Either
waits for a key. Any key goes on, and `^C` ends the script and the rest of
the line with `FF00h` (`docs/shell.md:229-239`).

### CON

With no argument CON reports the console in effect. The device names are
TTY, CRT, BAT and UC1, with PICO as an alias for CRT and GLCD for UC1.
A colon may follow a device name. A width must be separated from CRT or PICO
by a space and must be 80, 40 or 32. Other devices take no width.
Extra text is rejected (`src/cpm/ccpcmd.asm:58-214`).

The reply goes through the selected console and is discarded in BAT mode.
Selecting an unavailable console can leave or restore another mode so the reply
reports the mode in effect, not merely the name typed. The practical
alternatives and recovery actions are in
[Choose a console](07-choose-a-console.md).

### Resident services

A command ending in SVC installs the named file from the current drive or
an explicitly named drive, in the current user area only. It uses neither
the COM search's retry in user 0 nor its fallback to drive A.
SERVICES, the shell's, lists installed names and page counts. UNLOAD acts on
the newest service. Removal fails if that service is not removable or its removal
routine reports failure. The practical installation rules are in
[Chapter 5](05-drives-and-user-areas.md) and authoring is in
[Chapter 14](14-write-a-resident-service.md).

`NAME.SVC` also enters a service's application when the
service has its enter-on-install bit set. Only a service whose image starts
with an execution record that has its enter bit set has one. On the starter
card those are `MON3.SVC` and `SHELL.SVC`. Text after the name is the
application's command tail, and no switch is parsed. A service installed from a file
of that name is entered without reading the card. Otherwise the file is read
from the named or current drive and installed, then entered once its `INIT`
has made it ready. An install that never becomes ready is removed again and
the command is refused. A service with no such record, such as `GLCD.SVC`,
only installs, and each typing installs another copy. With two entering
copies installed the command is refused until `UNLOAD` leaves one. Each
refusal prints the command's name with a question mark, as `MON3.SVC?`, and
sets return code FF00h. The application ends with a warm boot and its
service stays installed, so `UNLOAD` removes it as before
(`docs/services.md:82-89`, `docs/services.md:101-130`,
`docs/services.md:157-180`, `src/loader.asm:734-783`,
`docs/shell.md:327-342`). An older card's `MON3.SVC /E` line still enters:
the `/E` is only a tail, which the service does not read
(`docs/mon3.md:42-43`). [Appendix H](appendix-h-service-file-format.md#the-execution-record)
gives the record.

`MON3.SVC` gives the `MON3>` line, which BDOS function 10 reads and the
service converts to capitals. It takes three commands. Anything else prints
`?` (`docs/mon3.md:37-43`, `docs/mon3.md:59-113`):

| Form | Operation |
| --- | --- |
| `LOAD [D:]NAME[.TYP] [ADDR]` | Load the file at `4000h`, or at `ADDR`, one to four hexadecimal digits, in whole records. Any type but `HEX` loads this way |
| `LOAD [D:]NAME.HEX` | Load an Intel HEX file at its records' addresses. It takes no address |
| `GO [ADDR]` | Run the last good load, or the program at `ADDR` |
| `EXIT` | Restore page zero, reset the drives and warm boot to `A:SYSTEM>` |

The drive is A to P. The name has at most eight characters and the type
three, and neither may hold `?` or `*`. Such a name is refused with `?`
before it is looked up. `^C` at `MON3>` also ends the session. The service
stays installed after `EXIT`, and `MON3.SVC` enters it again without
reading the card. [Chapter 5](05-drives-and-user-areas.md#a-mon-3-session)
describes the session and
[Appendix D](appendix-d-error-messages.md#the-mon-3-session) its messages.

## Programs on the starter card

The starter card's A holds fourteen files, and the web page runs the same
card. Nine are programs or sources you use by name at the prompt.
`SHELL.SVC`, `GLCD.SVC` and `STARTUP.CMD` belong to the startup setup,
`BAZA.RTL` is read by BAZA and `HELLO3.BIN` is loaded at `MON3>`
(`tools/media.mjs:29-31`, `tools/media.mjs:209-240`,
`tools/lib/starter.mjs:10-22`, `README.md:165-202`,
`test/demo.test.mjs:1-4`, `test/starter.test.mjs:48-393`):

| File | Use |
| --- | --- |
| `TED.COM` | `TED [NAME.EXT [LINE]]` edits a text file, opening it at `LINE` when one is given. With no name it opens the project's file |
| `TAS.COM` | `TAS NAME [OUT.TYP]` assembles `NAME.ASM` to `NAME.COM` and `NAME.DBG`, or to `OUT.TYP`, where a type of `SVC` makes a service. A line may hold several statements with `\` between them |
| `BAZA.COM` | `BAZA NAME` compiles `NAME.BAS`, or `NAME.BAZ` when there is no `.BAS`, to `NAME.COM` on the same drive |
| `BAZA.RTL` | BAZA's runtime library, read from the current drive or from the drive `BAZA.COM` was loaded from |
| `SAMPLE.ASM` | Assembly source for `TAS SAMPLE`, then `SAMPLE` |
| `TIMES.BAS` | BASIC source for `BAZA TIMES`, then `TIMES` |
| `BOUNCE.BAS` | A sprite game for the PICO9918, which it needs. `BAZA BOUNCE`, then `BOUNCE`. Tap W, A, S and D, or the arrow keys, to steer and Q to quit |
| `DEMO.ASM` | The source of DEMO. `TAS DEMO` builds DEMO.COM, then `DEMO` shows the LCD, the 7-segment digits, the 8 × 8 LEDs and the PICO9918. `TED DEMO.ASM` opens the source |
| `MON3.SVC` | A resident service that runs MON-3 programs. `MON3.SVC` installs it and gives the `MON3>` line |
| `HELLO3.BIN` | A MON-3 program for `LOAD HELLO3.BIN`, then `GO`, at `MON3>`. It writes four lines on the LCD and counts on the digits until Esc on the matrix keyboard, or AD on the keypad with the Matrix switch off |
| `HELLO3.ASM` | HELLO3's source, for `TAS HELLO3 HELLO3.BIN` |
| `SHELL.SVC` | The shell, a resident service: recall, CD, DIR with sizes, COPY, DEL, SERVICES, CLS, ECHO, PAUSE, the `[more]` pause, lines of several commands and `.CMD` scripts |
| `GLCD.SVC` | The graphics LCD console driver, a resident service |
| `STARTUP.CMD` | The startup file, holding the lines `SHELL.SVC` and `GLCD.SVC` |

TED's `^T B` and `^T R` build an `.ASM` file with `TAS NAME.ASM` and a
`.BAS` file with `BAZA NAME.BAS`. `^T D` chains `TDB NAME` for an `.ASM`
file, which fails with `A:TDB?` on the starter card, and shows
`No debugger` for a `.BAS` file
(`Thorium a2fe556:README.md:14-41`, `docs/compatibility.md:222`).
A file name and `THOR.PRJ`'s `ARGS` stop at a `!` or at an `&` after a blank,
where the shell splits the line, so `ARGS X &Y` gives the program the tail
` X` and nothing after it runs (`Thorium a2fe556:README.md:51-58`).
`TAS` and `BAZA` both set the failure return code `FF00h` when a build
fails. A failed BAZA compile leaves an existing `NAME.COM` unchanged, and a
failed TAS build normally keeps its earlier outputs
(`docs/compatibility.md:224-225`, `Baza 50dc512:README.md:32-37`,
`Thorium 3d1e2c0:docs/language.md:17-20`).
[Make a small program](02-make-a-small-program.md) and
[Build a BASIC program](03-build-a-basic-program.md) use them.

## Several commands

Under the shell an exclamation mark ends one command piece and starts
another, which runs whatever the previous command returned. `&` after a space,
a tab or another separator does the same, but its piece runs only if the
previous command's return code is not `FF00h` to `FFFEh`. A skipped piece is
not echoed and leaves the code as it was, so in `A &B &C` a failing A skips
B and C, and in `A &B !C` C runs. A run of separators and blanks is one
separator, conditional when it holds only `&`. Empty pieces and spaces
between pieces are ignored. The same 127-character bound applies to the
whole line, typed, from a script or supplied by function 47
(`docs/shell.md:52-88`).

A program's command tail ends before the blanks in front of its piece's
separator. Neither a file name nor an argument can contain a literal
exclamation mark. An `&` inside a word is text, so a tail such as
`/M:&HE000` passes whole. A line whose first piece starts with `&` is
refused as `&WORD?` and none of it runs. CP/M 3's leading `:` is not
provided, and a piece starting with `:` is refused as a bad name.

Without the shell `!` and `&` are ordinary characters. `DIR!TYPE X` is then
one word, refused as `DIR!TYPE?`, and a function 47 line runs whole as one
command (`docs/shell.md:32-50`).
[Results and command chains](13-results-and-command-chains.md) gives the success
interval, every drop path and function 47's replacement-line contract.

## Scripts

Under the shell, typing `NAME.CMD` runs the script `NAME.CMD` from the named
drive, or else the current one, in the current user area, with no fallback to
A. It is a text file read 128 bytes at a time, ending at `^Z`, a zero or the
end of its last record. CR, LF or CR LF ends a line, of which the first 127
characters are kept. Empty lines, lines of blanks and `!` alone, and lines
whose first character is `;` are passed over and not echoed. Every other
line is echoed whole after the prompt and runs as a typed line. Scripts do
not nest: a `NAME.CMD` piece inside a script, or one followed by more
pieces, is refused as `NAME.CMD?` with FF00h. A missing script gives the same
refusal (`docs/shell.md:97-119`).

`STARTUP.CMD` is read the same way after the ROM has run its first line,
when that line installs the shell. Typing `STARTUP.CMD` runs the whole file
again as a typed script. Without the shell a typed `NAME.CMD` runs
`NAME.COM`, and only the first line of `STARTUP.CMD` runs
(`docs/shell.md:32-50`, `docs/shell.md:121-139`).
