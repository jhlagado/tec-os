# 17. The CCP

Checked against TEC-OS 08da4d6, with the starter card's `EDIT.COM` from Edit
845d062, whose copy on the card has the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`.

The CCP prints the prompt, reads a command line and carries it out, as Chapter
3 describes from the keyboard's side. This chapter follows the CCP's code: its
entry from cold and warm boot, the loop that prints the prompt and takes a
line apart at each `!`, the parsing of the command word and of file names, the
built-in commands, the loading of a program and the page zero it gets, and the
RAM and the stack the CCP uses.

## The CCP in the ROM

The CCP's code is `src/cpm/ccp.asm`, which in the debug80 build runs from
`CCPBAS`, `D795h`, to `E0C9h`, 2,357 bytes, followed directly by the BDOS. Its
messages and the names of its built-in commands are in the ROM's data block
(`src/data3.asm:7-71`), except `TYPE`, whose name sits in front of the `RET`
at `C01Dh` (`src/data.asm:8-13`). Its variables, buffers and stack are in RAM,
from `CCPRAM`, `BCEBh`, to `BE76h` (`src/ram.asm:64-128`).

The CCP is an ordinary CP/M program in most of what it does. It reads and
writes files and the console through `CALL 0005h`, as a program in the TPA
does, and its comments say so: `DIR` uses only search first and search next
and the DMA record, `TYPE` reads 128-byte records, `ERA` deletes through the
BDOS (`src/cpm/ccp.asm:404`, `src/cpm/ccp.asm:785`, `src/cpm/ccp.asm:834`).
What it does outside that interface is read a few of TEC-OS's own bytes: the
console's width and height at `0048h` and `0049h`, the console mode, the
IOBYTE, the top of the TPA at `0007h`, the BDOS's flags `HFLAG` and `WRFLAG`,
and the return code `PRGCODE`. It also calls a few of TEC-OS's routines
directly: startup's `STBOOT` and `STLINE`, the driver loader, the PRL loader
and the BDOS's division, `DIV16`.

## The entry from boot

Cold boot and warm boot both end with a jump to `CCPENT`, with `C` holding the
byte at `0004h`, the user number in bits 4 to 7 and the drive in bits 0 to 3
(`src/boot.asm:80-82`, `src/cpm/ccp.asm:23-52`). Cold boot sets that byte to
0, drive A and user 0, before it falls into warm boot (`src/boot.asm:51-52`).
Warm boot leaves it as the CCP last wrote it, so the CCP comes back to the
drive and user it was on.

`CCPENT` sets its stack and keeps the drive in `BOOTDRV`
(`src/cpm/ccp.asm:27-30`). It sets `WRFLAG` and calls function 13, the disk
reset, which with that flag keeps the drives whose allocation vectors are
unchanged, as Chapter 16 describes; then it calls function 32 with the user
number from the byte (`src/cpm/ccp.asm:31-45`). `STBOOT` reads `A:STARTUP.CMD`
the first time it is called after a cold boot and does nothing later
(`src/cpm/ccp.asm:46`, `src/drv.asm:327-360`); Chapter 22 describes startup.
Last, if the drive is not A, the CCP selects it with function 14
(`src/cpm/ccp.asm:47-52`). Then it prints a new line and starts its loop at
`STARTED` (`src/cpm/ccp.asm:54-56`).

The selection at the end can fail. If the drive in the byte has lost its
volume, function 14 gives the `Select` error, and after a key the error's warm
boot comes back to `CCPENT` with the same byte, which selects the same drive
again. That happens when a program unmounts the current drive. Here `MOUNT`,
from drive A, takes the volume off drive B while B is the current drive; each
of the two keys `x` and Return after it gives the error again, and only the
reset button, whose cold boot sets the byte to 0, ends it:

<!-- node book/capture.mjs B: "@start A:MOUNT B:" "@start x" "@reset" -->
```text
A>B:
B>A:MOUNT B:
Unmounted

Bdos Err On B: Select
Bdos Err On B: Select
Bdos Err On B: Select
TEC-OS 0.1 for TEC-1G
A: SYSTEM     

A>PICO.DRV
PICO.DRV?

A>GLCD.DRV
GLCD.DRV?

A>
```

The reset finds the card's volumes again, with drive B left empty, since the
selection a reset keeps is the one that was in RAM, as Chapter 14 describes.
`MOUNT B:` from drive A, or `A:` before it, leaves the drive byte on A and
gives no error.

## The prompt and the line

`MAINLOOP` sets the stack again and calls `SAVEDU`, which reads the user
number with function 32 and the drive with function 25 and writes both into
the byte at `0004h` (`src/cpm/ccp.asm:58-60`, `src/cpm/ccp.asm:192-211`).
Every prompt therefore leaves `0004h` matching the drive and user in use, so a
warm boot started by a program returns to them. The prompt is the drive's
letter and `>` (`src/cpm/ccp.asm:61-65`); the user number is not shown.

A line comes from one of three places, tried in this order
(`src/cpm/ccp.asm:66-75`):

1. the next piece of a chained line, while `CHPOS` is not 0;
2. the next line of `A:STARTUP.CMD`, from `STLINE`, while startup has lines;
3. the console, through BDOS function 10, with `HFLAG` set so that the line is
   stored in the history and `^W` and `^N` recall earlier ones.

For the console, the CCP's buffer is `CMDBUF`, with `CMDLEN` after it for the
count and `CMDTXT` for the 128 characters (`src/ram.asm:75-80`). Warm boot
sets the buffer's first byte, the maximum, to 127 (`src/boot.asm:280-281`), so
a line holds 127 characters and the 128th byte has room for the 0 that `MLGOT`
writes after the line (`src/cpm/ccp.asm:77-84`). `STLINE` copies a line of the
startup file into `CMDTXT` itself, passes over its characters after the 127th,
and echoes it as if typed, since it does not come through function 10
(`src/drv.asm:362-413`). Both kinds of line then go the same way: `MLGOT` sets
`CHPOS` to 1, the line's start, and takes its first piece
(`src/cpm/ccp.asm:85-89`).

## Pieces of a line

A line is split at each `!` into pieces, and the CCP runs one piece at a time.
`CHPOS` holds the offset in `CMDTXT` of the next piece plus 1, or 0 when none
is left (`src/ram.asm:240`). It is above the RAM BIOS table, where warm boot
does not clear it, and `CMDTXT` is below `CCPCLR`, the start of what warm boot
clears (`src/ram.asm:67-81`, `src/boot.asm:270-277`). So after a program's
warm boot the rest of the line is still there, and `MAINLOOP`'s first test
finds it.

`CHSKIP` finds the next piece: from `CHPOS` it passes over spaces and `!`, and
returns with the zero flag set if it reaches the end of the line
(`src/cpm/ccp.asm:173-190`). A line of spaces and `!` alone gives a new prompt
(`src/cpm/ccp.asm:87-88`). A piece found by `MAINLOOP` is echoed after the
prompt by `MLECHO`, as far as its `!` or the end, since it did not come
through function 10 (`src/cpm/ccp.asm:91-104`).

`MLTAKE` then prepares the piece (`src/cpm/ccp.asm:106-149`). A piece that
starts with `:` runs only if the last command succeeded. The test is on the
code of BDOS function 108: a code from `FF00h` to `FFFEh` is a failure, and
the CCP then sets `CHPOS` to 0, dropping the rest of the line, and goes back
to the prompt (`src/cpm/ccp.asm:111-123`). Otherwise the `:` is passed over,
and the piece's letters are turned to capitals as far as its `!` or the line's
end. The `!` becomes a 0, the end of the piece, and `CHPOS` is set to the next
piece, or to 0 at the end of the line (`src/cpm/ccp.asm:124-143`). Last,
`PRGCODE` is set to 0, so that each command starts as a success
(`src/cpm/ccp.asm:144-145`).

Only the piece being taken is turned to capitals, so a later piece is echoed
as it was typed:

<!-- node book/capture.mjs "dir *.drv ! b: ! dir" -->
```text
A>dir *.drv ! b: ! dir
PICO.DRV     PICO40.DRV   PICO32.DRV   GLCD.DRV    
4 files, 986K free
A>b: 
B>dir
NO FILE
B>
```

The rest of a line is dropped in three cases: when a piece that starts with
`:` follows a failure; when `^C` is the first key of a line that a program
reads with function 10; and after a BDOS error, whose warm boot goes through
`CHDROP` (`src/cpm/bdos.asm:73-77`). A reset clears `CHPOS` with the rest of
the workspace (`src/boot.asm:23-27`). Two other ways of ending a command leave
the rest of the line to run. `^C` at a `[more]` pause ends `TYPE` or `DIR`,
and the CCP goes on to the next piece; and `Write lost`, printed by a warm
boot whose cache flush has failed, is followed by the next piece as well
(`src/cache.asm:347-355`).

An example of `^C` at `[more]` needs a card with a long text on it. This card,
used for the later examples too, is a copy of the starter card with four files
on drive B: two programs that are a `RET` and zeros, of 46,848 and 46,849
bytes, a program `ARGS`, and a text of 40 lines:

```sh
node -e 'const b = n => { const x = Buffer.alloc(n); x[0] = 0xC9; return x; };
require("fs").writeFileSync("build/fits.com", b(46848));
require("fs").writeFileSync("build/big.com", b(46849));
let s = ""; for (let i = 1; i <= 40; i++) s += "Line " + i + "\n";
require("fs").writeFileSync("build/lines.txt", s);'
npx atom build/args.asm build/args.com
cp dist/starter.img build/ccp.img
node tools/tecvol.mjs put build/ccp.img B build/args.com
node tools/tecvol.mjs put build/ccp.img B build/fits.com
node tools/tecvol.mjs put build/ccp.img B build/big.com
node tools/tecvol.mjs put build/ccp.img B build/lines.txt --text
```

A `^C` at the first pause in `LINES.TXT` ends `TYPE`, and `DIR` runs:

<!-- node book/capture.mjs --card build/ccp.img B: "TYPE LINES.TXT ! DIR" "^C" -->
```text
A>B:
B>TYPE LINES.TXT ! DIR
Line 1
Line 22
Line 23
      
B>DIR
ARGS.COM     FITS.COM     BIG.COM      LINES.TXT   
4 files, 8072K free
B>
```

The transcript leaves out the lines from `Line 2` to `Line 21`. The six spaces
are what is left of `[more]`, which the pager writes over when a key comes.

`ARGS`'s source, saved as `build/args.asm`, is in the section on page zero
below. Chapter 25 describes the chained line and function 47, which puts a
line in `CMDTXT` from a program.

## Drive changes and the command word

With the piece ready, `MLTAKE` tests for a change of drive: a letter from `A`
to `P`, a colon and nothing after them but spaces (`src/cpm/ccp.asm:146-171`).
For that the CCP stores the drive in `BOOTDRV`, selects it with function 14
and calls `SAVEDU`. A drive with no volume gives the `Select` error before
`SAVEDU` runs, so the byte at `0004h` keeps the old drive, and the warm boot
after the error returns to it.

Anything else is a command. `NOTDRIVE` starts a new line on the screen, passes
over spaces and parses the first word with `CMDPARSE`, as a file name, into
`CMDFCB` (`src/cpm/ccp.asm:213-219`). `CMDSTRT` keeps where the word starts,
for an error message, and `ARGSTRT` where it ends, the start of the arguments.
A word that doesn't parse as a file name is a bad command already
(`src/cpm/ccp.asm:309-314`).

The CCP then compares the word with the names of its ten built-in commands, in
the order `DIR`, `TYPE`, `ERA`, `REN`, `SAVE`, `USER`, `CON`, `COPY`, `UNLOAD`
and `DRIVERS` (`src/cpm/ccp.asm:220-249`). `ISCMD` compares the text at
`CMDSTRT`, not the FCB, and requires a space or the end of the piece after the
name (`src/cpm/ccp.asm:1491-1511`). So `A:DIR` and `DIR.COM` are not the
built-in: the first is the program `DIR` on drive A, and the second the
program `DIR`, and both fail with no `DIR.COM` on the card.

A word that is none of the built-ins names a program, and must be a single
file name with no wildcard (`src/cpm/ccp.asm:250-252`). The type selects what
follows. A type of `DRV` installs a driver through `DRVGO`
(`src/cpm/ccp.asm:253-262`, `src/glcd.asm:65-93`), which Chapter 20 describes.
Any other type, or none, is replaced by `COM` (`src/cpm/ccp.asm:263-268`), so
`VOLS.TXT` runs `VOLS.COM`.

A command that fails ends at `BADCMD`, which prints the word from `CMDSTRT` up
to its first space with a question mark after it, then a new line
(`src/cpm/ccp.asm:315-334`). Every message that reports a failed command,
`BADCMD`'s and the built-ins' `NO FILE`, `FILE EXISTS`, `NO SPACE` and
`COPY`'s four, goes through `ERRGO`, which sets the return code to `FF00h`
first (`src/cpm/ccp.asm:335-341`). `ERRGO` and the built-ins end at `STARTED`,
which starts a new line and prints the prompt, or at `MAINLOOP`, which prints
the prompt on the line the command left.

## File names

`PARSEFCB` reads one file reference into the first 16 bytes of an FCB and
leaves `HL` at the character after it (`src/cpm/ccp.asm:1296-1401`). It first
clears all 36 bytes of the FCB: 0 for the drive, spaces for the name and type,
zeros for the rest, so that a command after `TYPE` loads from the start of its
file and not from where `TYPE` stopped (`src/cpm/ccp.asm:1300-1325`). A letter
and a colon at the start set the drive byte, 1 to 16 for `A` to `P`, and any
other character before the colon is an error (`src/cpm/ccp.asm:1327-1343`). Up
to eight characters go into the name and, after a full stop, up to three into
the type (`src/cpm/ccp.asm:1345-1365`).

A name ends at a 0, a space, `=` or `.` (`src/cpm/ccp.asm:1473-1482`). Inside
it, `*` fills the rest of its field with `?` (`src/cpm/ccp.asm:1458-1471`),
and `VALIDCHR` rejects the thirteen characters in `BADCHARS`, the ones CP/M
2.2 reserves: `<`, `>`, `,`, `;`, `:`, `[`, `]`, `%`, `|`, `(`, `)`, `/` and
`\` (`src/cpm/ccp.asm:1433-1456`, `src/data3.asm:70-71`). A field with more
characters than it holds is an error too: `PARLONG` moves past the rest of the
word and returns the error flag (`src/cpm/ccp.asm:1383-1401`). Commands that
take exactly one file, `TYPE`, `REN`, `SAVE`, `COPY` and a program's name,
test the parsed FCB with `UNAMBIG`, which rejects an empty name and any `?`
(`src/cpm/ccp.asm:1403-1431`).

## The built-in commands

Each built-in is a routine in `ccp.asm` or, for the driver commands, in
`drv.asm`:

| Command | Routine | Source |
| --- | --- | --- |
| `DIR` | `CMDDIR` | `src/cpm/ccp.asm:404-617` |
| `TYPE` | `CMDTYPE` | `src/cpm/ccp.asm:785-828` |
| `ERA` | `CMDERA` | `src/cpm/ccp.asm:834-878` |
| `REN` | `CMDREN` | `src/cpm/ccp.asm:880-925` |
| `SAVE` | `CMDSAVE` | `src/cpm/ccp.asm:1161-1259` |
| `USER` | `CMDUSER` | `src/cpm/ccp.asm:1129-1159` |
| `CON` | `CMDCON` | `src/cpm/ccp.asm:1067-1127` |
| `COPY` | `CMDCOPY` | `src/cpm/ccp.asm:927-1059` |
| `UNLOAD` | `CMDUNL` | `src/cpm/ccp.asm:1061-1065`, `src/drv.asm:26-30` |
| `DRIVERS` | `CMDDRV` | `src/drv.asm:301-325` |

`DIR` turns a missing name into eleven `?`, sets the DMA address to `LOADBUF`
and lists the entries that function 17 and then function 18 return
(`src/cpm/ccp.asm:404-452`). An entry whose system attribute, bit 7 of its
second type byte, is set is passed over (`src/cpm/ccp.asm:467-472`). The CCP's
FCB has extent 0, so only the entry that holds a file's first extent matches,
and each file is listed once. The number of columns is the console's width at
`0048h` divided by 13, at least one, with 80 assumed when the width is 0, on
the serial terminal (`src/cpm/ccp.asm:431-448`). Each name is printed as
`NAME.EXT`, padded to 12 characters unless it ends the row
(`src/cpm/ccp.asm:488-533`).

`DIR`'s last line gives the number of files and the free space on the drive it
listed (`src/cpm/ccp.asm:546-617`). For the free space it selects that drive
with function 14, if the listing named one, takes the DPB's address from
function 31 and the allocation vector's from function 27, and counts the clear
bits for the `DSM` + 1 blocks of the volume. The count of blocks is shifted
left by `BSH` less 3 to give KiB: 2 KiB a block on G1M, 4 on G8M. Then it
selects the drive from `0004h` again. A listing with no file gives `NO FILE`.

`DIR` and `TYPE` print through the pager (`src/cpm/ccp.asm:619-732`). `PGINIT`
takes the console's height and width from `0049h` and `0048h`, or 24 and 80 on
the serial terminal, and keeps one row for the pause. `PGPUT` counts each
character's column, back to 0 at CR, back one at backspace and on to the next
multiple of 8 at a tab, and counts a new line at LF and at a character that
would pass the last column, as the screen wraps it. When the rows are full it
prints `[more]` and waits with function 6, so that the key is not echoed;
`UNMORE` then writes a CR, six spaces and a CR over `[more]`. `^C`, Esc and
`Q` stop the listing; any other key shows the next screen.

`TYPE` opens its one file, reads it a record at a time into `LOADBUF` and
prints each byte through the pager up to the first `^Z`, `1Ah`, or the end of
the file (`src/cpm/ccp.asm:785-828`). A file that is not there gives `NO
FILE`.

`ERA` with a name that is all `?`, as `*.*` gives, prints `ALL (Y/N)?`, reads
the answer with function 1 and reads on to a CR; any answer but `Y` or `y`
erases nothing (`src/cpm/ccp.asm:845-867`). The erase itself is function 19,
and `NO FILE` when nothing matched (`src/cpm/ccp.asm:869-878`).

`REN NEW=OLD` parses the new name into `RENFCB` and the old one into `CMDFCB`,
and searches for the new name first: if it is there the command gives `FILE
EXISTS` with nothing changed (`src/cpm/ccp.asm:880-910`). Otherwise the new
name is copied to offset 16 of `CMDFCB`, the place function 23 reads it, and
the rename gives `NO FILE` if the old name is not there
(`src/cpm/ccp.asm:912-925`).

`SAVE N NAME` reads a decimal count of 256-byte pages, rejects any count that
reaches the page of the word at `0006h`, erases the file, makes it again and
writes the pages from `0100h` on, two records each
(`src/cpm/ccp.asm:1161-1259`). On the starter card that page is `B8h`, so the
largest `SAVE` is 183 pages, `0100h` to `B7FFh`. A failed make, write or close
gives `NO SPACE`.

`USER N` takes 0 to 15 and calls function 32 (`src/cpm/ccp.asm:1129-1159`).
`CON` with no argument names the console in use; with `TTY`, `CRT`, `BAT` or
`UC1`, a colon after it allowed, it sets the IOBYTE's console field and, for
`UC1`, loads `GLCD.DRV` if it is not in (`src/cpm/ccp.asm:1067-1127`). Chapter
15 describes the BIOS's side.

`COPY SOURCE DEST` copies a file within the user area
(`src/cpm/ccp.asm:927-1059`). Both names are parsed with the current drive put
in a 0 drive byte, so that they can be compared; a destination with no name
takes the source's whole name, and a destination equal to the source, all 12
bytes, is a bad command, with nothing opened (`src/cpm/ccp.asm:960-986`). The
copy goes a record at a time through the default DMA record at `0080h`, so it
uses none of the TPA, and the count of records is kept in `DIRNUM` and printed
in hex after `COPIED` (`src/cpm/ccp.asm:987-1032`).

`DRIVERS` prints each driver's name and its pages from the list of drivers,
and `UNLOAD` removes the lowest; `NAME.DRV` as a command installs one. Chapter
20 describes the three.

## Loading a program

`LOADCOM` loads a `.COM` file at `0100h` through the BDOS
(`src/cpm/ccp.asm:343-402`). It opens `CMDFCB` and returns with the carry flag
and the zero flag set if there is no such file. Otherwise it reads the file a
record at a time, function 26 setting the DMA address to each record's place
from `0100h` up, until the end of the file or until the address reaches the
page of the word at `0006h`, the byte at `0007h` (`src/cpm/ccp.asm:352-370`).
At that page the file still has to end, and `LOADLIM` reads one more record
into `LOADBUF` to find out: if that read is the end of the file the load is
complete, and otherwise the file is too large and the carry flag is set with
the zero flag clear (`src/cpm/ccp.asm:372-386`). A file that fits leaves in
`LOADTOP` the address after its last record, which the PRL loader uses, and is
closed (`src/cpm/ccp.asm:388-398`).

The largest program is therefore the 256-byte pages from `0100h` up to the
page that holds the BDOS entry: on the starter card, whose entry is at
`B806h`, 46,848 bytes, six fewer than the TPA. With a driver loaded the word
at `0006h` is the driver's jump, at offset 6 of the driver's first page, and
the limit is that page. `FITS.COM`, 46,848 bytes, loads and runs; `BIG.COM`,
one byte more, doesn't:

<!-- node book/capture.mjs --card build/ccp.img B: FITS BIG -->
```text
A>B:
B>FITS

B>BIG
BIG?

B>
```

`NOTDRIVE` calls `LOADCOM` for `NAME.COM` first (`src/cpm/ccp.asm:263-271`). A
file that is there but too large is a bad command at once. Only when there is
no `NAME.COM` does the CCP change the type to `PRL` and call `LOADCOM` again,
and then `PRLGO`, which checks the PRL's header against what was loaded and
moves the code down from `0200h` to `0100h` (`src/cpm/ccp.asm:272-279`,
`src/prl.asm:12-58`). Chapter 21 describes the PRL loader. A read error during
a load is a `Bad Sector` from the BDOS, which ends the command by warm boot
before `LOADCOM` returns.

## Page zero and the jump

A loaded program gets the page zero that CP/M 2.2 defines. `PREPPAGE` parses
the first two words of the arguments into the FCBs at `005Ch` and `006Ch`,
copies the arguments to `0080h`, the command tail, with their length in front
and a 0 after them, and sets the DMA address to `0080h` with function 26
(`src/cpm/ccp.asm:1261-1294`). The tail starts with the space after the
command's name and ends at the end of the piece, and its letters are the
capitals `MLTAKE` made. The second FCB starts 16 bytes after the first, and
`PREPPAGE` parses it second, so its drive and name are complete and the first
FCB's last 20 bytes are not; the tail, written last, takes the second FCB's
last 16 bytes in turn.

`ARGS` prints what it finds: each FCB's drive byte as a digit and its eleven
name bytes, then the tail between brackets.

```asm
; ARGS: prints the two FCBs and the command tail that the CCP leaves in
; page zero: each FCB's drive byte as a digit and its eleven name bytes,
; then the tail between brackets.
BDOS    EQU     $0005

        ORG     $0100
        LD      HL,$005C        ; the first FCB
        CALL    SHOWFCB
        LD      HL,$006C        ; the second
        CALL    SHOWFCB
        LD      A,'['
        CALL    PUT
        LD      HL,$0080        ; the tail's length, then its characters
        LD      B,(HL)
TAIL:   LD      A,B
        OR      A
        JR      Z,TEND
        INC     HL
        LD      A,(HL)
        CALL    PUT
        DEC     B
        JR      TAIL
TEND:   LD      A,']'
        JP      PUT

SHOWFCB:LD      A,(HL)          ; the drive: 0 for the current one
        ADD     A,'0'
        CALL    PUT
        LD      A,' '
        CALL    PUT
        LD      B,11            ; the name and type, as stored
NAME:   INC     HL
        LD      A,(HL)
        CALL    PUT
        DJNZ    NAME
        LD      A,13
        CALL    PUT
        LD      A,10

; Print A by function 2, keeping B and HL.
PUT:    PUSH    HL
        PUSH    BC
        LD      E,A
        LD      C,2
        CALL    BDOS
        POP     BC
        POP     HL
        RET
```

<!-- node book/capture.mjs --card build/ccp.img B: "args one.txt a:*.c" "ARGS X Y ! ARGS" -->
```text
A>B:
B>args one.txt a:*.c
0 ONE     TXT
1 ????????C  
[ ONE.TXT A:*.C]
B>ARGS X Y ! ARGS
0 X          
0 Y          
[ X Y ]
B>ARGS
0            
0            
[]
B>
```

The first FCB names the current drive with 0 and the second drive A with 1;
the `*` of `*.C` is eight `?`. The tail of `ARGS X Y` keeps the space before
the `!`, and a command with no arguments gets blank FCBs and a tail of length
0.

Then the CCP starts the program (`src/cpm/ccp.asm:280-286`). It sets the stack
pointer to `CSTKTOP`, the top of its own stack, pushes `0000h` and jumps to
`0100h`. A program that ends with `RET` returns to `0000h`, the jump to warm
boot, and so does one that jumps to `0000h` or calls function 0. The CCP's new
line at `STARTED` after the warm boot is why a program that ends its output
with a new line is followed by a blank line before the prompt.

## The CCP's RAM and stack

The CCP's block of RAM has two parts, divided at `CCPCLR`
(`src/ram.asm:67-128`). Below it are the parts that warm boot keeps: the two
FCBs and the command line, so that the next piece of a chained line survives
the program before it. From `CCPCLR` on, warm boot clears the CCP's bytes
along with the BDOS's (`src/boot.asm:270-277`).

| Addresses | Bytes | Name | Contents |
| --- | ---: | --- | --- |
| `BCEBh–BD0Eh` | 36 | `CMDFCB` | the command's FCB, and the source's for `COPY` |
| `BD0Fh–BD32h` | 36 | `RENFCB` | the new name's FCB for `REN`, the destination's for `COPY` |
| `BD33h` | 1 | `CMDBUF` | function 10's maximum, 127 |
| `BD34h` | 1 | `CMDLEN` | the line's length |
| `BD35h–BDB4h` | 128 | `CMDTXT` | the line |
| `BDB5h` | 1 | `BOOTDRV` | the drive from `0004h` at entry, or of a drive change |
| `BDB6h–BDCBh` | 22 | | the parser's pointers and the state of `DIR`, the pager, `SAVE` and `ERA` |
| `BDCCh–BE4Bh` | 128 | `LOADBUF` | scratch: `DIR`'s and `REN`'s directory records, `TYPE`'s records, the load's extra record |
| `BE4Ch–BE58h` | 13 | `STKGUARD` | the stack guard, `A5h` in each byte |
| `BE59h–BE76h` | 30 | `CSTKBAS` | the CCP's stack, up to `CSTKTOP` at `BE77h` |

The addresses are those of the debug80 build. The guard is 43 bytes less the
stack's 30 (`src/ram.asm:119-124`), and warm boot fills it with `A5h`
(`src/boot.asm:282-286`). A guard byte that is no longer `A5h` shows that the
stack has run past its bottom. `test/stacks.test.mjs` checks the guard after
the CCP's deepest paths, and Chapter 13 describes the measurement behind the
stack's size.

The stack is the CCP's and, from the jump to `0100h`, the program's. With
`0000h` pushed, the program starts with 28 bytes below its return word, more
than the 16 of CP/M 2.2's eight levels, and its stack pointer is in the
workspace above the TPA (`src/cpm/ccp.asm:281-283`, `src/layout.asm:76-81`). A
program that needs more sets its own stack, as many CP/M programs do. Every
BDOS call moves to the BDOS's stack, so a program's calls of `0005h` use only
two bytes of the program's stack.

The CCP keeps nothing in the TPA. The program area from `0100h` is untouched
by the CCP until it loads a program there, and only `SAVE` reads it, which is
how `SAVE` writes what a program left in memory.
