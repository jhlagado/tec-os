# 3. The command line

Checked against TEC-OS 08da4d6, with the starter card's `EDIT.COM` from Edit
845d062, whose copy on the card has the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`.

Everything you do at the `A>` prompt goes through the CCP, the command
processor that Chapter 1 introduced: it reads the line you type, finds the
command it names and runs it. This chapter describes how a line is read and
how file names and wildcards are written in it, then each command built into
the CCP, the way a program is found and started, user areas, and the
messages the CCP and the BDOS print when a command fails. It ends with the
history of command lines behind `^W` and `^N`.

## The line

The CCP reads a line with BDOS function 10, CP/M's line input, with the
editing keys that Chapter 2 lists, and Return ends it. The line holds up to
127 characters, and a 127th character ends it as Return would. Before it
searches for the command, the CCP turns every lower-case letter into a capital,
so `dir *.com` and `DIR *.COM` are the same command:

<!-- node book/capture.mjs "dir *.com" "DIR ????.COM" "DIR A:P*.*" "DIR B:" -->
```text
A>dir *.com
TERM.COM     PROBE.COM    DEMO.COM     MOUNT.COM    VOLS.COM     EDIT.COM
6 files, 986K free
A>DIR ????.COM
TERM.COM     DEMO.COM     VOLS.COM     EDIT.COM    
4 files, 986K free
A>DIR A:P*.*
PROBE.COM    PICO.DRV     PICO40.DRV   PICO32.DRV  
4 files, 986K free
A>DIR B:
NO FILE
A>
```

The echo of the line is what you typed, in lower case if you typed it so.
The first word of the line is the command, and the words after it, separated
by spaces, are its arguments. A command is a built-in, one of the commands
the CCP carries in the ROM, or else the name of a program file on the card.

Two characters have a meaning of their own in a line. `!` separates
commands, so `DIR!TYPE README.TXT` runs `DIR` and then `TYPE`, and a command
that starts with `:` runs only if the one before it succeeded. Chapter 11
describes both.

## File names

A CP/M file name has up to eight characters, then a full stop and a type of
up to three: `README.TXT`, `PICO.DRV`. The type may be left out, with its
full stop, and then it is three spaces. A drive letter and a colon in front
of the name, as in `B:NOTES.TXT`, name a file on another drive; without one,
the name is on the current drive, the one the prompt shows. A name may hold
any character but a space and these: `<`, `>`, `,`, `;`, `:`, `[`, `]`,
`%`, `|`, `(`, `)`, `/` and `\`, with `.` and `=` taken as the ends of a
name's parts. A name that breaks these rules, or a part that is too long,
makes the command fail, and the CCP prints the word it was reading back with
a question mark:

<!-- node book/capture.mjs "DIR VERYLONGNAME.TXT" "TYPE *.CMD" "DIR A: B:" -->
```text
A>DIR VERYLONGNAME.TXT
VERYLONGNAME.TXT?

A>TYPE *.CMD
*.CMD?

A>DIR A: B:
A:?

A>
```

`TYPE *.CMD` fails because `TYPE` takes one file and `*.CMD` is a wildcard,
which the next section explains. `DIR A: B:` fails because `DIR` takes one
argument, and the word printed back is the command's first argument, `A:`,
not the extra one after it. Every built-in but `COPY` and `UNLOAD` prints
its first argument so, and one that needs an argument and has none prints
the question mark alone (`TYPE` prints `NO FILE`): `ERA` with no name prints
`?`. `COPY` and `UNLOAD` print their own names, `COPY?` and `UNLOAD?`, and so
do an unknown command and a program that won't load.

## Wildcards

Two characters in a name match a group of files. `?` matches any one
character in its place, and `*` matches the rest of the part it is in: in the
name, up to eight characters, or in the type, up to three. The CCP turns a
`*` into `?` characters to the end of its part, so `P*.*` is
`P???????.???` and matches every file whose name starts with `P`, whatever
its type. Characters after a `*` in the same part are passed over, so `D*X`
is the same as `D*`. A `?` also matches a space, and a name shorter than eight
characters is padded with spaces, so `????.COM` is `????` and four spaces:
in the transcript above it matches the names of up to four characters with
the type `COM`, and not `PROBE.COM` or `MOUNT.COM`.

Only `DIR` and `ERA` take a name with wildcards. `TYPE`, `REN`, `SAVE` and
`COPY` each work on one file, and a wildcard in their names makes the
command fail, as `TYPE *.CMD` did. The command's own name may hold no
wildcard either.

## The built-in commands

The CCP's built-in commands are these:

| Command | Effect |
| --- | --- |
| `DIR` | Lists files on a drive |
| `TYPE NAME` | Prints a text file |
| `COPY SOURCE DEST` | Copies a file |
| `REN NEW=OLD` | Renames a file |
| `ERA NAME` | Erases a file, or every file a name with wildcards matches |
| `SAVE N NAME` | Writes the first `N` pages of the program area to a file |
| `USER N` | Selects user area `N` |
| `B:` | Selects drive B, and so on for the other drives |
| `CON` | Names or changes the console (Chapter 2) |
| `NAME.DRV` | Installs the driver in the file `NAME.DRV` |
| `DRIVERS` | Lists the drivers installed |
| `UNLOAD` | Removes the driver installed last |

A built-in's name is matched only as a whole word, followed by a space or
the end of the line, so `DIRX` is the name of a program, not `DIR` with
something after it. A drive in front of a built-in's name, as in `A:DIR`,
also makes it the name of a program, here `DIR.COM` on drive A.

## DIR

`DIR` with no argument lists every file on the current drive, and `DIR B:`
every file on drive B. A name, with or without a drive, lists only the files
it matches. Each file appears as its name and type, in columns 13 characters
wide, as many as fit the console's width: six on the serial terminal and on
the PICO9918 at 80 columns, and one on the graphics LCD. The last line gives
the number of files listed and the free space on the drive listed, in KiB.
When no file matches, `DIR` prints `NO FILE`.

A listing longer than the screen stops with `[more]`, as Chapter 2
describes. `DIR` lists only the files of the current user area, described
below, and it leaves out a file whose system attribute is set. `tecvol put
--sys` sets that attribute on a file put on a card from a PC, and a program
can set it with BDOS function 30. A system file is still there for every
other command: `TYPE` prints it and a command runs it.

`DIR`'s layout is TEC-OS's own, and CP/M 2.2's `DIR` prints the names in a
different layout.

## TYPE

`TYPE` prints a text file. It reads the file a record of 128 bytes at a time
and stops at the first `^Z`, the byte `1Ah` that ends a CP/M text file, or at
the end of the file's last record:

<!-- node book/capture.mjs "TYPE STARTUP.CMD" -->
```text
A>TYPE STARTUP.CMD
PICO.DRV
GLCD.DRV

A>
```

`STARTUP.CMD` ends its last line with a carriage return and a line feed, and
the blank line after it is the one the CCP prints before the prompt. A file
that isn't there gives `NO FILE`, and so does `TYPE` with no name. Like
`DIR`, `TYPE` stops at `[more]` when the screen fills.

## COPY, REN and ERA

`COPY` copies one file to another name, to another drive, or both. Chapter 1
showed it in the starter card's `README.TXT`. When the destination is a
drive alone, as in `COPY README.TXT B:`, the copy has the source's name. The
copy goes a record at a time, and `COPIED` and a number report the records
copied, in hexadecimal: `0005` is five records, 640 bytes. A file of the
destination's name is erased first, so `COPY` replaces it. `REN` renames a
file, with the new name first, an equals sign and the old name after it, as
CP/M 2.2 has it. `ERA` erases files. Here a copy of `README.TXT` is made on
drive B under two names, one is renamed and then erased:

<!-- node book/capture.mjs "COPY README.TXT B:" "COPY README.TXT B:COPY.TXT" B: DIR "REN NOTES.TXT=COPY.TXT" "REN NOTES.TXT=README.TXT" DIR "ERA NOTES.TXT" "ERA NOTES.TXT" DIR -->
```text
A>COPY README.TXT B:
COPIED 0005

A>COPY README.TXT B:COPY.TXT
COPIED 0005

A>B:
B>DIR
README.TXT   COPY.TXT    
2 files, 8168K free
B>REN NOTES.TXT=COPY.TXT
B>REN NOTES.TXT=README.TXT
FILE EXISTS
B>DIR
README.TXT   NOTES.TXT   
2 files, 8168K free
B>ERA NOTES.TXT
B>ERA NOTES.TXT
NO FILE
B>DIR
README.TXT  
1 file, 8172K free
B>
```

Each 640-byte file takes 4 KiB of the drive, since the volume on drive B,
`WORK`, gives space to files in blocks of 4 KiB; Chapter 4 describes the
volumes and their blocks. The second `REN` fails because a file of the new
name, `NOTES.TXT`, is there already, and `REN` changes nothing then. A `REN`
whose old name isn't there prints `NO FILE`, and so does an `ERA` that
matches no file, as the second `ERA` above shows.

`COPY` works in the current user area, on both drives. A destination that
names the source itself, such as `COPY README.TXT A:` on drive A, fails with
`COPY?` before any file is opened. `COPY` has four messages of its own:
`NO SOURCE` when the source isn't there, `CANNOT MAKE DEST` when the
destination's directory is full, `WRITE ERROR` when a record can't be
written, as on a full drive, and `CLOSE ERROR` when the finished copy can't
be closed.

Before it erases with a name that matches every file, such as `*.*` or
`B:*.*`, `ERA` prints `ALL (Y/N)?` and reads a line; a `Y` as the line's first
character, in either case, erases the files, and anything else leaves them:

<!-- node book/capture.mjs "COPY README.TXT B:" B: "@start ERA *.*" $'@key n\r' DIR "@start ERA *.*" $'@key y\r' DIR -->
```text
A>COPY README.TXT B:
COPIED 0005

A>B:
B>ERA *.*
ALL (Y/N)?n
B>DIR
README.TXT  
1 file, 8172K free
B>ERA *.*
ALL (Y/N)?y
B>DIR
NO FILE
B>
```

`$'@key n\r'` in the capture command is the shell's way of writing the keys
`n` and Return. A name with wildcards that matches only some files, such as
`ERA *.TXT`, erases them with no question.

## SAVE

`SAVE` writes memory to a file, from `0100h`, in pages of 256 bytes:
`SAVE 2 TWO.COM` writes the 512 bytes at `0100h–02FFh`. `0100h` is where the
CCP loads each program, so `SAVE` keeps whatever the last program loaded or
left there. In CP/M 2.2 it was the way to keep a program loaded and patched with a
debugger. The number is decimal and may be 0, which makes an empty file.

The pages must stay below the BDOS, whose entry is the word at `0006h`, so
the number must be less than the high byte of that word. On the starter card
with no driver installed the word is `B806h`, and `SAVE` takes up to 183
pages:

<!-- node book/capture.mjs B: "SAVE 2 TWO.COM" "SAVE 184 BIG.COM" DIR -->
```text
A>B:
B>SAVE 2 TWO.COM
B>SAVE 184 BIG.COM
184?

B>DIR
TWO.COM     
1 file, 8172K free
B>
```

A file of the same name is erased first. When the drive or its directory is
full, `SAVE` prints `NO SPACE`.

## Drives

A drive letter and a colon, alone on the line, select that drive: the prompt
shows it, and file names with no drive are on it. TEC-OS has four drives, A
to D, and a drive has a volume only when the card's header or the `MOUNT`
program put one there; Chapter 4 describes both. The starter card has
volumes on A and B. Selecting a drive with no volume, or naming a file on
one, gives the BDOS's error for an empty drive, and the prompt stays on the
drive it was on:

<!-- node book/capture.mjs B: "@start C:" "@key x" "@start DIR C:" "@key x" -->
```text
A>B:
B>C:
Bdos Err On C: Select
B>DIR C:

Bdos Err On C: Select
B>
```

After the message TEC-OS waits for a key, `x` in this run, and then prints
the prompt. The section on the BDOS's messages, below, explains the wait.
The letters `E:` to `P:` name drives as CP/M 2.2 has them, and they give the
same error; `Q:` and the letters after it aren't drives, and the CCP prints
`Q:?`.

The CCP stores the drive and the user area in the byte at `0004h` each time
it prints the prompt, and a program's end leaves the prompt on that drive. A reset
returns the prompt to drive A.

## User areas

CP/M divides the files on a drive into 16 user areas, numbered 0 to 15.
Every file belongs to one, and a command, a program and `DIR` work only on the
files of the current user area, on every drive. TEC-OS starts in user area
0, and the starter card's files are all there. `USER` and a number select
another area. The prompt doesn't show the area, so the files of area 0
disappear from view after `USER 3`:

<!-- node book/capture.mjs "USER 3" "SAVE 1 B:MINE.COM" "DIR B:" VOLS "USER 0" "DIR B:" -->
```text
A>USER 3
A>SAVE 1 B:MINE.COM
A>DIR B:
MINE.COM    
1 file, 8172K free
A>VOLS
VOLS?

A>USER 0
A>DIR B:
NO FILE
A>
```

In area 3 the program `VOLS` isn't found, since `VOLS.COM` is in area 0, and
back in area 0 `MINE.COM` is out of view. `COPY` works within one area, so
it can't move a file from one area to another. `tecvol put --user N`, from
Chapter 4, puts a file from a PC into area `N`. A number outside 0 to 15,
or `USER` with no number, fails with a question mark.

The user area survives a program's end and a warm boot, like the drive, and
a reset returns to area 0.

## Drivers

A command that names a file of type `.DRV` installs the driver it holds. A
driver is code that TEC-OS keeps in memory below the BDOS until a reset or
`UNLOAD`, as Chapter 1 explained for the display drivers. `DRIVERS` lists the
drivers installed, the newest first, each with the number of 256-byte pages
it takes. `UNLOAD` removes the newest one, if that driver can be removed;
otherwise it changes nothing and prints `UNLOAD?`, and it prints the same
with no driver installed. On the web page's board, where `PICO.DRV` is
installed at startup, the PICO9918's screen shows this, from the startup
file's second line on:

<!-- node book/capture.mjs --board pico --screen DRIVERS UNLOAD -->
```text

A>GLCD.DRV
GLCD.DRV?

A>DRIVERS
PICO 6
A>UNLOAD
UNLOAD?

A>
```

`PICO.DRV` takes six pages, 1,536 bytes, and its removal fails while the
PICO9918 is the console. A `.DRV` file that isn't there, or that doesn't
install, gives the command's name with a question mark, as `GLCD.DRV?` shows
here. Chapter 5 gives the rules for installing and removing drivers, and
Chapter 10 describes how a driver is made.

## Running a program

A command that isn't a built-in names a program. The CCP searches the
directory of the current drive, in the current user area, for the file
`NAME.COM`, loads it at `0100h` and starts it. If there is no `NAME.COM`, it
searches for `NAME.PRL`, a program in Digital Research's relocatable PRL format, which
Chapter 10 describes. A drive in front of the name runs the program from
that drive, and the CCP searches no other:

<!-- node book/capture.mjs B: "A:VOLS" VOLS "README.TXT" -->
```text
A>B:
B>A:VOLS
00 SYSTEM      G1M A:
01 WORK        G8M B:

B>VOLS
VOLS?

B>README.TXT
README.TXT?

B>
```

A type typed after a program's name is replaced: `VOLS.COM` runs `VOLS`, and
`README.TXT` as a command searches for `README.COM` and then `README.PRL`,
and finds neither. The one exception is `.DRV`, which installs a driver.

The command fails, with its name and a question mark, when neither file is
there, and also when `NAME.COM` is there but doesn't load: when a read of it
fails, or when it is too large for the memory between `0100h` and the BDOS.
A `NAME.COM` that doesn't load is not passed over for a `NAME.PRL`.

The rest of the line after the program's name is the command tail. The CCP
copies it to `0080h` for the program, and it fills the two file control
blocks at `005Ch` and `006Ch` from its first two words, so that a program
that takes a file name finds it ready. Chapter 6 describes both. When the
program ends, TEC-OS runs a warm boot, and the CCP starts a new line and
prints the prompt.

## The CCP's messages

When a command fails, the CCP prints one of these messages:

| Message | Printed by | Cause |
| --- | --- | --- |
| `NAME?` | any command | an unknown command, a bad name or argument, a program that won't load, a driver that won't install |
| `NO FILE` | `DIR`, `TYPE`, `ERA`, `REN` | no file of that name, or none that matches |
| `FILE EXISTS` | `REN` | the new name is taken |
| `NO SPACE` | `SAVE` | the drive or its directory is full |
| `NO SOURCE` | `COPY` | no source file |
| `CANNOT MAKE DEST` | `COPY` | the destination's directory is full |
| `WRITE ERROR` | `COPY` | a record couldn't be written |
| `CLOSE ERROR` | `COPY` | the destination couldn't be closed |

Appendix D lists every message TEC-OS prints.

## The BDOS's messages

The BDOS prints its own message when a disk operation can't be done at all.
The message is `Bdos Err On`, the drive, and one of four causes:

| Message | Cause |
| --- | --- |
| `Bdos Err On C: Select` | the drive has no volume |
| `Bdos Err On C: Bad Sector` | a record couldn't be read from the card or written to it, or the volume is read-only |
| `Bdos Err On B: File R/O` | the file to be erased has its read-only attribute set |
| `Bdos Err On B: R/O` | the drive was made read-only by BDOS function 28 |

After printing the message, the BDOS waits for a key. When the key comes it
ends the command, or the program that made the call, with a warm boot. In
CP/M 2.2 any key but `^C` there passes over a `Bad Sector` error and the
program goes on; in TEC-OS every key ends it.

A write to a read-only volume, such as one made with `tecvol create`'s `:ro`
in Chapter 4, gives `Bad Sector`, the message for a failed disk write. This
card has the starter card's `README.TXT` on drive B with its read-only
attribute set, and a read-only volume on drive C:

```sh
node tools/tecvol.mjs create build/errs.img --volume G1M:SYSTEM:A --volume G8M:WORK:B:wb --volume G1M:ARCHIVE:C:ro
node tools/tecvol.mjs put build/errs.img B dist/files/README.TXT --ro
```

<!-- node book/capture.mjs --card build/errs.img "@start SAVE 1 C:X.COM" "@key x" "@start ERA B:README.TXT" "@key x" "DIR B:" -->
```text
A>SAVE 1 C:X.COM

Bdos Err On C: Bad Sector
A>ERA B:README.TXT

Bdos Err On B: File R/O
A>DIR B:
README.TXT  
1 file, 8172K free
A>
```

Neither command changed the card: `SAVE` made no file on drive C, and
`README.TXT` is still on drive B. A drive made read-only by function 28, the
cause of `R/O`, stays so until the next warm boot.

## Command history

TEC-OS keeps the lines typed at the CCP's prompt, in a store that Chapter 23
describes. `^W` at the prompt replaces the line being typed with the line
typed before it, and a second `^W` with the one before that; `^N` moves the
other way, toward the newest, and one step past the newest leaves an empty
line. A line brought back can be edited with the keys
of Chapter 2 and run with Return, as if it had been typed. Here `DIR *.DRV`
and `CON` were typed, then `^W`, `^W` and Return; the PICO9918's screen
shows `DIR *.DRV` brought back and run again:

<!-- node book/capture.mjs --board pico --screen "DIR *.DRV" CON "@start "$'\x17\x17' -->
```text

A>GLCD.DRV
GLCD.DRV?

A>DIR *.DRV
PICO.DRV     PICO40.DRV   PICO32.DRV   GLCD.DRV
4 files, 986K free
A>CON
CON: CRT: PICO9918
A>DIR *.DRV
PICO.DRV     PICO40.DRV   PICO32.DRV   GLCD.DRV
4 files, 986K free
A>
```

`$'\x17'` is the shell's way of writing `^W`, and the capture's `@start`
line types its keys and a Return together. The history holds 256 bytes of
lines, and the oldest go first when it fills. A line the same as the newest
is not stored again, and the lines of the startup file are not stored at all.
A warm boot keeps the history, and a reset empties it. In a line that a
program reads with function 10, `^W` and `^N` are characters like any other.
