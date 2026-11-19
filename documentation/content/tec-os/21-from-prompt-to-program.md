---
title: From prompt to program
parent: TEC-OS
nav_order: 21
nav_group: "Inside TEC-OS"
---

# 21. From prompt to program

<!-- Checked against TEC-OS 57a8c38b7f341433285e39c4bec14ecc486ffe26 (retained recovery baseline),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED 02b63d8;
     Baza is the qualified 5f6b58d payload. Source-derived excerpts are
     labelled separately from console captures. -->

Running a command requires more than finding its file. TEC-OS must retain
the selected drive, prepare the arguments and provide a return to
the prompt. The console command processor, or CCP, obtains a line through the BDOS.
It parses a name then runs a built-in or loads a file. Program execution begins at `0100h` after page zero is ready.
[Appendix J](appendix-j-command-reference.md) gives the exact grammar.

## The minimal CCP and the shell

Command input and program execution are split between the shell and ROM.
The ROM CCP handles CD, DIR, TYPE, ERA, REN, CON and UNLOAD through
`KEYTAB`. It can also run `.COM` and `.SVC` files, change drive and read a
line of `STARTUP.CMD` (`b95b2a9:src/tables.asm:53-78`, `b95b2a9:docs/shell.md:3-5`). The
cited revision's table also holds SAVE and USER, CP/M 2.2's commands that
wrote memory pages to a file and selected a user area. Both have since left
the ROM, and each name is now looked up as a program like any other. The
starter startup file installs resident `SHELL.SVC` for additional commands.
Its table includes COPY, DEL, SERVICES, CD, DIR, CLS, ECHO and PAUSE.
DEL changes its command word to `ERA` before passing the piece to the ROM
(`b95b2a9:drivers/shell.asm:545-552`, `b95b2a9:drivers/shell.asm:650-667`).

The shell extends the prompt through ROM service 16, `TNSHELL`. Its table
supplies four entries: `LINE`, `PAGE`, `HREC` and `HSTORE`
(`b95b2a9:src/abi.inc:226`, `b95b2a9:drivers/shell.asm:61-64`, `b95b2a9:docs/shell.md:280-327`).
`MAINLOOP` checks the hook at every prompt. With a shell installed, `SHLINE`
calls `LINE` to print the prompt and supply a zero-ended command piece
plus its origin. `FFh` marks startup input. The ROM executes that piece
through the ordinary command path.

Without a shell, the ROM prints its prompt. It takes function 47 input
first, then startup input and finally function 10 keyboard input
(`b95b2a9:src/cpm/ccp.asm:143-204`, `b95b2a9:src/cpm/ccp.asm:294-340`). The hook also supplies
paging: TYPE sends every byte and DIR sends row breaks through `PAGE`.
Without the hook those bytes print directly (`b95b2a9:src/cpm/ccpfile.asm:266-288`,
`b95b2a9:docs/shell.md:311-314`). Chapter 22 explains command pieces, Chapter 23
history and Chapter 26 startup input.

## Entry from boot

The drive must survive the program's exit. Page-zero byte `0004h` holds it
in bits 0–3. Bits 4–7 are CP/M's user number, which the CCP keeps zero: it
works in user area 0 only, where the cited revision carried a user number
there. Cold boot writes zero for A. Warm boot preserves the byte and passes
it to `CCPENT`
in `C` (`b95b2a9:src/boot.asm:114-115`, `b95b2a9:src/boot.asm:154-156`,
`b95b2a9:src/boot.asm:297-312`).

`CCPENT` establishes its stack then validates the saved drive. A drive
past D or with no mounted volume falls back to A. Repeating an invalid
selection would otherwise cause `Select` and another warm boot. `BOOTDRV`
holds the chosen drive during disk reset (`b95b2a9:src/cpm/ccp.asm:48-77`).

The CCP restores disk state before requesting another command.
Function 13 runs with `WRFLAG` set to retain unchanged allocation vectors.
Warm boot has cleared the user number with the BDOS's state and the CCP
leaves it at 0, so every prompt is in area 0. `STBOOT` handles the
first record of `A:STARTUP.CMD` once after cold boot. Function 14 then
attempts to reselect a saved drive other than A. Only after reset and
selection succeed does `STARTED` print a newline. A returned failure stays
in the bootstrap retry console rather than entering the normal prompt
(`b95b2a9:src/cpm/ccp.asm:75-142`, `b95b2a9:src/cpm/bdosfile.asm:46-77`).
[Chapter 20](20-a-file-through-the-bdos.md) explains vector reuse and
[Chapter 26](26-startup-inside-the-ccp.md) explains startup.

A program can create the unavailable-drive case with ROM `UNMNT`.
`CD` replaces a volume and never leaves its drive empty. If `0004h` names
an emptied drive on warm boot, the CCP selects A instead
(`b95b2a9:src/cpm/ccp.asm:48-68`, `docs/compatibility.md`).

## The prompt and its input

Before each prompt, `MAINLOOP` resets its stack and stores the drive
from function 25 at `0004h`, with a zero user nibble.
With the shell hook, `LINE` prints the prompt. The bare ROM instead prints
the drive letter and `>`, giving `A>`
(`b95b2a9:src/cpm/ccp.asm:156-190`, `b95b2a9:src/cpm/ccp.asm:352-370`). Ordinary program
exit retains the drive. An unmounted current drive falls back to A
and cold reset begins at A.

Shell input is already a command piece when the ROM receives it.
`LINE` can supply a remaining piece, startup input, a script line or typed
input at `CMDTXT`, with origin in `A`. `SHLINE` sets `HFLAG` during the
call so the shell's function 10 input can use history. It also zeroes the
buffer's last byte to bound the result (`b95b2a9:src/cpm/ccp.asm:156-170`,
`b95b2a9:src/cpm/ccp.asm:297-328`). [Chapter 22](22-chains-across-warm-boot.md)
explains source priority and [Chapter 23](23-the-history-ring.md) explains
history storage and recall.

With no shell, input has three sources in priority order. A function 47
line flagged in `CHPOS` is echoed and taken whole. Otherwise `STLINE`
supplies the one startup line or function 10 reads the keyboard with
`HFLAG` clear (`b95b2a9:src/cpm/ccp.asm:172-228`).

`STFLAG` is `FFh` for startup and zero for typed input. With the shell
it holds the origin returned by `LINE`. Typed input uses `CMDBUF`, the
maximum-length byte, followed by `CMDLEN` and 128 bytes at `CMDTXT`. Warm
boot sets the maximum to 127 (`b95b2a9:src/cpm/ccp.asm:187-204`,
`b95b2a9:src/ram.asm:152-157`, `b95b2a9:src/boot.asm:410-411`).

An empty or space-only piece returns to the prompt through `MLSKIP`.
`MLTAKE` uppercases the zero-ended text and clears `PRGCODE`
(`b95b2a9:src/cpm/ccp.asm:230-269`). Chain separators have already been removed by
the shell. Without a shell, `!` and `&` remain ordinary characters.
[Chapter 13](13-results-and-command-chains.md) explains the resulting
success and chain rules.

## The parsed command

A drive selection is handled before keyword dispatch. `MLTAKE` recognises a
letter A to P followed by a colon and only spaces after it. It selects that
drive with function 14 and updates `0004h` through `SAVEDRV`. A missing volume
raises `Select` before that update so the error's warm boot restores the
previous drive (`b95b2a9:src/cpm/ccp.asm:270-295`).

A non-drive command enters `NOTDRIVE`. It starts an output line and saves
the word's beginning in `CMDSTRT` through `CMDSKIP`. `CMDPARSE` fills
`CMDFCB` and leaves its delimiter in `ARGSTRT` for the handler. Invalid
syntax reaches `BADCMD` before any dispatch (`b95b2a9:src/cpm/ccp.asm:385-394`,
`b95b2a9:src/cpm/ccp.asm:529-574`).

Parsing starts from a complete FCB reset. `PARSEFCB` writes a zero drive,
eleven name/type spaces and zeros through the remaining 36-byte structure.
A command after TYPE can therefore load from record zero. `FCBBASE` retains
the base while `DE` advances. Returned `HL` points to the reference's
delimiter (`b95b2a9:src/cpm/ccpcmd.asm:443-531`).

An initial letter and colon set the drive byte to 1 through 16 for A to P.
The parser fills up to eight name bytes and three type bytes after a dot.
`FCBEND` recognises zero, space, equals and dot. `PARSTAR` fills the remaining
field positions with question marks and skips text to the delimiter.
`VALIDCHR` checks the thirteen reserved characters in `BADCHARS`.
`PARLONG` skips an overlong field and returns carry
(`b95b2a9:src/cpm/ccpcmd.asm:485-569`, `b95b2a9:src/cpm/ccpcmd.asm:602-662`,
`b95b2a9:src/text.asm:58-59`). Appendix J gives
the complete exclusion list, padding rules and accepted command forms.

`UNAMBIG` checks the stored FCB through `FCBBASE`. It rejects a blank name or
any question mark in the eleven name/type positions. TYPE, REN and program
dispatch use that check (`b95b2a9:src/cpm/ccpcmd.asm:581-622`). The shell's COPY has
its own parser and check, `PARSEFCB` and `UNAMBIG` in
`b95b2a9:drivers/shellcmd.asm:221-336`.

Built-in recognition uses the original word at `CMDSTRT`. `KEYTAB` tests
CD, DIR, TYPE, ERA, REN, CON and UNLOAD. The shell handles COPY,
DEL and SERVICES earlier and passes DEL onward as `ERA`
(`b95b2a9:src/tables.asm:60-78`, `b95b2a9:drivers/shell.asm:545-552`). `ISCMD` accepts a
keyword only before space or zero. A drive prefix or type therefore selects
a program name: `A:DIR` and `DIR.COM` search for `DIR.COM` and fail if it
is absent (`b95b2a9:src/cpm/ccp.asm:397-422`, `b95b2a9:src/cpm/ccpcmd.asm:689-708`,
`b95b2a9:src/tables.asm:53-78`).

A keyword match jumps to its handler. Otherwise the FCB must be
unambiguous. Type SVC enters `SVCRUN` for service dispatch. A blank type
selects COM. An exact COM uses the application loader. Other explicit types
reach `BADCMD` before any COM load, so `TAS.TXT` produces `TAS.TXT?`
(`9428374:src/cpm/ccp.asm`). The shell handles explicit CMD before ROM dispatch.
During startup, INIT result `TNENODV` is a quiet success. Other install
failures reach `BADCMD` (`b95b2a9:src/cpm/ccp.asm:442-458`). A service execution
record can also request entry after installation or entry into an existing
service without reading its file (`b95b2a9:src/loader.asm:734-783`).
[Chapter 25](25-loading-and-removing-services.md) explains installation.

`BADCMD` prints the word at `CMDSTRT` up to space or zero, then `?` and a new
line. Built-ins can move `CMDSTRT` to an argument. CON moves it again for a
separated width so its error may name that width. `ERRGO` sets `FF00h` before
printing the error message. Successful handlers retain the zero set at piece
entry. They finish at `MAINLOOP` or at `STARTED`, which adds a new line first
(`b95b2a9:src/cpm/ccp.asm:576-616`, `b95b2a9:src/cpm/ccp.asm:582-616`,
`b95b2a9:src/cpm/ccpcmd.asm:105-111`).

## Program lookup and capacity

A plain program name can reach tools on drive A. The CCP first runs
`LOADCOM` on the named or current drive. The file needs no system
attribute.

A found but unloadable file stops this search. `LOADCOM` returns carry
with Z for absence and carry with NZ for load failure. Drive A is tried
only after absence, only without an explicit drive and only when the
current drive is not A. The CCP sets the FCB drive byte to 1 before calling
`LOADCOM` again (`b95b2a9:src/cpm/ccp.asm:474-486`). The cited revision
made each attempt through `LOADA`, which also looked in user area 0 from
another area. That search left with USER.

An explicit drive suppresses that drive-A fallback. In this starter-card
capture, plain TAS finds A's tool and prints its usage line. `B:TAS`
searches B alone:

<!-- TEC-OS 57a8c38: node tools/capture.mjs B: TAS B:TAS. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS
usage: TAS NAME [OUT.TYP]

B:WORK>B:TAS
B:TAS?

B:WORK>
```

Service lookup is narrower. `SVCGO` calls `LOADCOM` directly, searching
the named or current drive. It does not retry drive A (`b95b2a9:src/cpm/ccp.asm:431-441`, `b95b2a9:src/loader.asm:901-906`).

After open, loading proceeds through ordinary record reads. `LOADCOM`
starts at `0100h`. Before every function 20 call, `READSRC` sets DMA with
function 26. Success advances the destination 128 bytes. EOF or the page
in `0007h` ends the loop. That byte is the high byte of the entry word
at `0006h` (`b95b2a9:src/cpm/ccp.asm:671-694`, `b95b2a9:src/cpm/ccp.asm:759-765`).

An exact fit must be distinguished from an oversized file without
writing into resident memory. At the ceiling, `LOADLIM` reads a further
record into workspace `LOADBUF`. EOF confirms a fit. Another record or
error returns carry with NZ. EOF is also required below the ceiling.
`LOADOK` stores the rounded end in `LOADTOP` for service loading then
closes, clearing carry without testing close's result
(`b95b2a9:src/cpm/ccp.asm:705-746`).

An oversized file is therefore a found-file failure, preventing fallback
to another drive. In default BDOS error mode, a failed card read instead
prints `Bad Sector` and warm-boots before the loader can return
(`b95b2a9:src/cpm/bdoscon.asm:47-64`).

Resident services reduce this load ceiling. Without installed services,
the starter entry at `B6C8h` gives ceiling `B600h`: 46,336 bytes from
`0100h`, 200 below the TPA byte limit. Startup installs the shell at
`A500h`, reducing prompt-time capacity to 41,984 bytes. Each installed
service moves the entry word and load ceiling to its first page
(`b95b2a9:src/cpm/ccp.asm:683-685`, `b95b2a9:src/loader.asm:494-507`).

The capacity fixture places FITS, BIG and ARGS on B. FITS and BIG contain
RET followed by zeros. ARGS has the complete listing below and is assembled
on the PC by TAS, as Chapter 27's HELLO is. FITS has 41,984 bytes and BIG
has 41,985:

```sh
node -e 'const b = n => { const x = Buffer.alloc(n); x[0] = 0xC9; return x; };
require("fs").writeFileSync("build/fits.com", b(41984));
require("fs").writeFileSync("build/big.com", b(41985));'
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { assembleProgram } from "./tools/lib/assemble.mjs";
const [src, out] = process.argv.slice(1);
writeFileSync(out, (await assembleProgram(src)).bytes);
' build/args.asm build/args.com
cp dist/starter.img build/ccp.img
node tools/tecvol.mjs put build/ccp.img B build/args.com
node tools/tecvol.mjs put build/ccp.img B build/fits.com
node tools/tecvol.mjs put build/ccp.img B build/big.com
```

TAS writes the 76-byte ARGS.COM. FITS returned to the prompt and BIG was
rejected:

<!-- TEC-OS with the sized DIR (ROM c9586263, starter card 1cdc614e): node tools/capture.mjs --card build/ccp.img B: FITS BIG. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>FITS

B:WORK>BIG
BIG?

B:WORK>
```

## Page zero before entry

The loaded program receives both parsed names and the original argument
tail. `PREPPAGE` fills argument FCBs at `005Ch` and `006Ch`, ignoring
parse errors. It copies the tail to `0081h`, places its length
at `0080h` and appends zero. Function 26 resets DMA to `0080h`. The initial
space belongs to the tail. Spaces before a shell separator have already
been removed and letters are already uppercase (`b95b2a9:src/cpm/ccpcmd.asm:402-440`,
`b95b2a9:drivers/shell.asm:321-373`).

These default buffers overlap. The FCBs begin sixteen bytes apart, so
parsing the second overwrites the first's last twenty bytes. Tail storage
at `0080h` also occupies the second FCB's final sixteen bytes. Drive and
eleven name/type bytes remain intact in both (`b95b2a9:src/cpm/ccpcmd.asm:402-440`).
[Chapter 10](10-read-and-write-a-file.md) explains the complete FCB and
DMA contracts.

ARGS prints those drive and name fields, then the tail between brackets.
This complete listing is the `build/args.asm` used in the capacity-card
recipe above:

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

The output routine preserves the registers needed to traverse those
buffers. `PUT` saves BC and HL around function 2. `SHOWFCB` prints eleven
name/type bytes and `TAIL` follows the length at `0080h`. The capture
therefore exposes padded FCB names alongside spaces retained in the tail:

<!-- TEC-OS with the sized DIR (ROM c9586263, starter card 1cdc614e): node tools/capture.mjs --card build/ccp.img B: 'args one.txt a:*.c' 'ARGS X Y ! ARGS'. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>args one.txt a:*.c
0 ONE     TXT
1 ????????C
[ ONE.TXT A:*.C]
B:WORK>ARGS X Y ! ARGS
0 X
0 Y
[ X Y]
B:WORK>ARGS
0
0
[]
B:WORK>
```

Drive zero in the first FCB selects the current drive. The second uses
1 for A. `*.C` expands its name field to eight question marks. The shell
removes the space before `!` from the `ARGS X Y` piece. With no arguments,
both names are blank and the tail has zero length
(`57a8c38:src/cpm/ccpcmd.asm:457-531`, `57a8c38:src/cpm/ccpcmd.asm:632-645`).

## The jump and return

Before entry, the CCP also records the load drive at `0050h` from
`CMDFCB`. Zero means a plain name found on the current drive. Explicit
`B:ARGS` preserves FCB drive 2. A plain name found by fallback on A has
1 because fallback changed the FCB drive byte (`b95b2a9:src/cpm/ccp.asm:477-507`).

The initial stack supplies the return route. `CMDRUN` sets SP to
`CSTKTOP`, pushes `0000h` and jumps to `0100h`. The configured 48-byte
CCP stack leaves forty-six bytes below that return word, with a guard before
command scratch (`b95b2a9:src/cpm/ccp.asm:510-520`, `b95b2a9:src/layout.asm:111-112`,
`b95b2a9:src/ram.asm:196-208`). CP/M 2.2's eight levels provide sixteen bytes.
[Chapter 15](15-state-and-memory.md) distinguishes these configured sizes
from measured use and proven bounds.

The final jump uses HL so the same path can enter an installed service
at its own address. `CMDRUN` first loads HL with `0100h`. Programs therefore
start here with HL = `0100h`, DE = `0000h` and A = `FFh` for startup input
or zero otherwise. These are implementation values. CP/M 2.2 guarantees
no entry register (`b95b2a9:src/cpm/ccp.asm:488-520`, `b95b2a9:docs/compatibility.md:186-191`).

A top-level RET uses the pushed address to reach warm boot at `0000h`.
A jump there or function 0 has the same destination (`b95b2a9:src/cpm/ccp.asm:515-517`,
`b95b2a9:src/cpm/bdos.asm:218-223`). Warm boot flushes the cache before re-entering
the CCP. Failed acknowledged data stays queued while CHPOS cancels the
shell's remaining pieces; separate notices do not restore that continuation
(`0701241:src/cache.asm:638-649`, `0701241:src/hk.asm:204-237`).
Entry through `STARTED` adds a newline. Output already ending in a newline
therefore leaves a blank line before the prompt.

## The built-in handlers

Built-ins operate through the FCB and DMA interfaces already used by
programs. ROM CD also supplies volume selection at a bare prompt, allowing
recovery when A holds a volume without the shell startup. It enters
`RCMDCD` in `src/cpm/ccpdir.asm`. Queries and named selection preserve the
current drive. Failed selection keeps the old volume and reports
`CD FAILED` or a more specific name/conflict error
(`b95b2a9:src/cpm/ccpdir.asm:1-173`, `b95b2a9:docs/recovery.md:1-23`).

The table locates the file and console handlers plus three shell handlers. Ordinary
shell DIR lists files by row with byte counts. `DIR /W` delegates to the
ROM listing described below (`b95b2a9:drivers/shelldir.asm:1-35`). Appendix J gives syntax and
[Appendix D](appendix-d-error-messages.md) gives message recovery:

| Command | Routine | Source |
| --- | --- | --- |
| DIR | `CMDDIR` | `b95b2a9:src/cpm/ccpfile.asm:17-255` |
| TYPE | `CMDTYPE` | `b95b2a9:src/cpm/ccpfile.asm:354-420` |
| ERA | `CMDERA` | `b95b2a9:src/cpm/ccpmut.asm:10-67` |
| REN | `CMDREN` | `b95b2a9:src/cpm/ccpmut.asm:81-153` |
| CON | `CMDCON` | `b95b2a9:src/cpm/ccpcmd.asm:55-220` |
| UNLOAD | `CMDUNL` | `b95b2a9:src/cpm/ccpcmd.asm:13-18`, `b95b2a9:src/loader.asm:97-126` |
| COPY, the shell's | `CMDCOPY` | `b95b2a9:drivers/shellcmd.asm:54-154` |
| DEL, the shell's | `CMDDEL` | `b95b2a9:drivers/shell.asm:543-552` |
| SERVICES, the shell's | `CMDSVC` | `b95b2a9:drivers/shellcmd.asm:15-50` |

### Directory listing and text output

The ROM DIR handler turns a blank name into eleven question marks and
sets DMA to `LOADBUF`.
Functions 17 and 18 return matching directory entries. DIR skips a system
file by testing bit 7 of the second type byte. Its parsed FCB has extent
zero so the search returns each file once
(`b95b2a9:src/cpm/ccpfile.asm:17-104`).

`DIRNCOL` is the console width `VWID` divided by 13, with a minimum of one.
A zero width uses 80 for serial output. DIR prints each name and type,
padding to twelve characters except at a row's end, with a separating
space before the next entry (`b95b2a9:src/cpm/ccpfile.asm:57-73`,
`b95b2a9:src/cpm/ccpfile.asm:106-180`). The layout differs from Digital Research's
DIR. The footer calls function 46 for the listed drive and divides its
three-byte free-record count by eight to print KiB. The default drive stays
unchanged. No listed file gives `NO FILE`
(`b95b2a9:src/cpm/ccpfile.asm:198-255`, `b95b2a9:src/cpm/bdosfn.asm:55-126`).

Paging belongs to the shell hook. `LSTPUT` sends DIR and TYPE output to
`PAGE` and stops on carry. Without a shell it prints directly and returns
carry clear, so a bare listing never pauses (`b95b2a9:src/cpm/ccpfile.asm:261-288`).
`PGRST` takes dimensions from `TNINFO` or uses serial's 24 rows and 80
columns, reserving a row for `[more]`.

`PGPUT` resets the column at carriage return, retreats at backspace and
advances tabs to multiples of eight. LF or a printable character beyond
the final column counts a newline (`b95b2a9:drivers/shellio.asm:345-449`). At a
pause, function 6 reads without echo. `UNMORE` erases `[more]` with CR,
six spaces and CR. The key mask maps `#` to `^C` and `;` to Esc. `^C`
and `#` drop the remaining line. Esc, `Q`, `q` and `;` stop only the
listing. Other keys continue (`b95b2a9:drivers/shellio.asm:450-502`). Chapter 22
explains why stopping output and cancelling a chain differ.

TYPE opens its file and reads 128-byte records into `LOADBUF`. It prints
through the pager until `1Ah`, the first Ctrl-Z, or the file's end. It then
closes the file. No name or a missing file produces `NO FILE`
(`b95b2a9:src/cpm/ccpfile.asm:354-420`).

### Erase and rename

ERA tests all eleven stored name/type bytes for question marks before
printing `ALL (Y/N)?`. Function 1 reads the first echoed answer byte.
Return alone cancels deletion. Otherwise ERA drains the answer to Return
and deletes only for an initial Y or y. Other patterns delete without that
question. Function 19 performs the deletion and no match gives `NO FILE`
(`b95b2a9:src/cpm/ccpmut.asm:10-67`).

REN parses NEW into `RENFCB` and OLD into `CMDFCB`. The names share a drive
from either reference and different explicit drives are rejected. Function
17 checks the new name first. A match gives `FILE EXISTS` before mutation.
Otherwise REN copies twelve bytes from `RENFCB` to `CMDFCB+16`, placing
the new name at offset 17 for function 23. An absent old name gives
`NO FILE` (`b95b2a9:src/cpm/ccpmut.asm:81-149`).

### Selection and consoles

CON uses its device-name table to set the IOBYTE console
field through `CONFLD`. PICO aliases CRT and GLCD aliases UC1. Selecting
UC1 calls `GLCLD` to load `GLCD.SVC` from A if required. A failed load puts
the field back to the active mode (`b95b2a9:src/cpm/ccpcmd.asm:55-220`,
`b95b2a9:src/cpm/ccpcmd.asm:223-246`, `b95b2a9:src/loader.asm:862-887`).

CON's report prints `CON:` and the mode read from `CONMOD` after the BIOS has
acted on the field. A missing display or keyboard can force TTY while a failed
GLCD load restores the previous mode. Output uses the selected console and BAT
discards it. [Chapter 17](17-console-paths.md) explains the BIOS transition
(`b95b2a9:src/cpm/ccpcmd.asm:187-214`, `b95b2a9:src/console.asm:339-347`).

A width after CRT or PICO is parsed as two decimal digits. CON finds the PICO
version-3 record with `TNFIND` and calls its `PICOWID` entry for 80, 40 or 32
columns. A joined name and width, a width after another device, an unsupported
width or a missing PICO interface is an error. In startup the missing-interface
path passes quietly. A separated width becomes the error word while a joined
form names the whole token (`57a8c38:src/cpm/ccpcmd.asm:105-180`). This PICO capture
shows both:

<!-- TEC-OS 57a8c38: node tools/capture.mjs --board pico 'CON PICO 40' 'CON CRT80' 'CON PICO 50' 'CON TTY 80' 'CON CRT: 32'. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON PICO 40
CON: CRT:
A:SYSTEM>CON CRT80
CRT80?

A:SYSTEM>CON PICO 50
50?

A:SYSTEM>CON TTY 80
80?

A:SYSTEM>CON CRT: 32
CON: CRT:
A:SYSTEM>
```

`PICOWID` also rejects a change while the display is claimed. An accepted
width change clears the screen at the next console call. Its state in
`PIBLK` survives warm boot. Reset initialises the PICO console to 40 columns
when the display probe succeeds and the Matrix switch is enabled. Otherwise
serial remains selected. Bare `CON CRT` and `CON PICO` retain the chosen
width and any active claim
(`b95b2a9:src/console.asm:32-45`, `b95b2a9:src/video.asm:18-24`,
`b95b2a9:src/pico.asm:44-68`, `b95b2a9:src/pico.asm:70-94`,
`b95b2a9:src/cpm/ccpcmd.asm:105-191`, `b95b2a9:src/console.asm:111-133`).

### Copies and resident services

COPY is the shell's. It parses the source into the default FCB at `005Ch`
and the destination into its own `CFCB`, substituting the current drive for
zero. A destination with a blank name takes the source's eleven name/type
bytes. After checking both for ambiguity, COPY compares all twelve bytes for
a self-copy and rejects extra operands before opening either file
(`b95b2a9:drivers/shellcmd.asm:54-92`, `b95b2a9:drivers/shellcmd.asm:156-212`).

The copy uses DMA at `0080h` and leaves the TPA untouched. It opens the
source, erases and makes the destination and transfers records through
functions 20 and 21. `CCOUNT` accumulates the transferred record total for `PUTHEX` to print
in hexadecimal. A write error closes the partial destination before
`WRITE ERROR`. Retention of the written records depends on that close
succeeding. The error path ignores its result (`b95b2a9:drivers/shellcmd.asm:93-154`).

Service inspection and removal use the same owner order. SERVICES walks
upwards from the lowest owner's page, passed by the ROM in `B` to `LINE`.
It prints each name and decimal page count. An owner's size ends at the
next owner's page or the stub for the final owner (`b95b2a9:drivers/shellcmd.asm:15-50`).
ROM UNLOAD calls `SVCUNL` on the lowest owner, the newest service. Removal
disallowed by flags or carry from REMOVE stops the operation. It cannot skip
to an older service (`b95b2a9:src/cpm/ccpcmd.asm:13-18`, `b95b2a9:src/loader.asm:97-126`).
Chapter 25 explains the registry checks.

## Code and working storage

The CCP uses the same CP/M interface as programs: function 10 for line
input, 15 for file open and 9 for strings through `0005h`. Its code remains
in ROM while loaded programs occupy the transient program area, or TPA.
The implementation is assembled from five files (`b95b2a9:src/rom.asm:31-35`):

| File | Work |
| --- | --- |
| `src/cpm/ccp.asm` | Boot entry, prompt, command dispatch and program loading |
| `src/cpm/ccpfile.asm` | DIR, TYPE and their output through the shell's pager |
| `src/cpm/ccpmut.asm` | ERA, REN, a name check and the shared BDOS call helper |
| `src/cpm/ccpcmd.asm` | Other built-ins, file-name parsing, page-zero preparation and startup |
| `src/cpm/ccpdir.asm` | Basic directory selection, queries and listing for bare-prompt recovery |

ROM data holds the messages and nine-record `KEYTAB`. Each record
contains a zero-ended keyword followed by a handler address. A final zero
ends the table (`57a8c38:src/tables.asm:53-78`). In the historical `57a8c38` ROM
account the CCP occupies 2,491 bytes from `CCPBAS` at `DBB8h` through
`E572h`, immediately before the BDOS. These sizes and addresses do not
reprice or locate the later bootstrap implementation.

The corresponding RAM state spans `CCPRAM` at `BCD9h` through `BE6Ch`.
`CMDFCB` and `RENFCB` contain parsed references, followed by the command
buffer. `CCPCLR` at `BDA5h` marks the warm-cleared portion
(`b95b2a9:src/ram.asm:148-186`). `CPMINIT` clears from there through BDOS state,
preserving the command buffer below it (`b95b2a9:src/boot.asm:402-411`). This is
the retained-line boundary in [Chapter 22](22-chains-across-warm-boot.md).
[Appendix C](appendix-c-memory-map.md) gives the locations for lookup.

A shared helper reduces repeated BDOS call setup. After `CALL DOSSEQ`,
an inline byte encodes twice the function number plus an FCB selection bit.
Clear bit 0 selects `CMDFCB` and set bit 0 selects `RENFCB`. `DOSSEQ` advances
the stacked return address past this byte, decodes `C` and `DE` then jumps
to the BDOS. Return resumes after the byte (`b95b2a9:src/cpm/ccpmut.asm:172-183`).
Eighteen CCP calls use this encoding, including DIR searches 17/18, TYPE
reads 20 and ERA deletion 19 (`b95b2a9:src/cpm/ccpfile.asm:74-75`,
`b95b2a9:src/cpm/ccpfile.asm:187-189`, `b95b2a9:src/cpm/ccpfile.asm:371-373`,
`b95b2a9:src/cpm/ccpmut.asm:57-61`).

Other direct state connects the CCP to surrounding services. It reads
console mode and geometry, the loader result and the program ceiling at
`0007h`. `SHOWN` is the shell table or zero. `HFLAG` marks history input,
`WRFLAG` the flagged disk reset and `STFLAG` line origin. `CHPOS` records
function 47 and dropped-line state. `PRGCODE` stores the previous result
(`b95b2a9:src/cpm/ccp.asm:48-204`, `b95b2a9:src/cpm/ccp.asm:249-269`).
