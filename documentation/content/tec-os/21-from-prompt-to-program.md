---
title: From prompt to program
parent: TEC-OS
nav_order: 21
nav_group: "Inside TEC-OS"
---

# 21. From prompt to program

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

The CCP reads your command through the BDOS, parses its name and either runs a
built-in or loads a file. A program command ends that path with page zero
prepared and a jump to `0100h`. This chapter follows the code from the command
prompt to that jump. [Appendix J](appendix-j-command-reference.md) gives the
exact command grammar.

## The minimal CCP and the shell

The ROM's CCP is small, and this chapter follows it. Its `KEYTAB`
holds CD, DIR, TYPE, ERA, REN, SAVE, USER, CON and UNLOAD, and it still runs a
`.COM` or a `.SVC`, changes drive and reads one line of `STARTUP.CMD`
(`src/tables.asm:53-78`, `docs/shell.md:3-5`). The rest is
in `SHELL.SVC`, a resident service that the starter card's startup file
installs. Its own table holds COPY, DEL and SERVICES, and DEL rewrites its
word as `ERA` and hands the piece to the ROM
(`drivers/shell.asm:545-552`).

The shell takes the prompt through a hook in the ROM. ROM service 16,
`TNSHELL`, records a table of four entries in the shell's pages: `LINE`,
`PAGE`, `HREC` and `HSTORE` (`src/abi.inc:226`,
`drivers/shell.asm:61-64`, `docs/shell.md:280-327`). At each
prompt `MAINLOOP` tests the hook. With a shell holding it, `SHLINE` calls
`LINE`, which prints the prompt, reads or takes the next piece and writes it
zero-ended into the command buffer with its origin, `FFh` for a line of
`STARTUP.CMD`. The ROM then runs that piece as a typed line. With no shell
the ROM prints its own prompt and takes a function 47 line, then its one
startup line, then a line read with function 10
(`src/cpm/ccp.asm:97-158`, `src/cpm/ccp.asm:248-294`).
`TYPE` sends every byte, and `DIR` its row breaks, through `PAGE`, which
gives the shell's `[more]` pause. With no shell the ROM prints the byte
(`src/cpm/ccpfile.asm:266-288`, `docs/shell.md:311-314`). Chapter 22 follows
the shell's lines of pieces, Chapter 23 its history and Chapter 26 the
startup file.

## Code and working storage

The CCP uses CP/M calls for its ordinary work: function 10 reads a line,
function 15 opens a file and function 9 prints a string through `0005h`. Its own
code stays in ROM while program files load into the transient program area
(TPA). The five source files are assembled in this order (`src/rom.asm:31-36`):

| File | Work |
| --- | --- |
| `src/cpm/ccp.asm` | Boot entry, prompt, command dispatch and program loading |
| `src/cpm/ccpfile.asm` | DIR, TYPE and their output through the shell's pager |
| `src/cpm/ccpmut.asm` | ERA, REN, a name check and the shared BDOS call helper |
| `src/cpm/ccpcmd.asm` | Other built-ins, file-name parsing, page-zero preparation and startup |
| `src/cpm/ccpdir.asm` | Basic directory selection, queries and listing for bare-prompt recovery |

The messages and `KEYTAB` are in the ROM data block. Each keyword in
`KEYTAB` has a zero terminator followed by its handler address. A final
zero ends the table, which holds nine records (`src/tables.asm:53-78`). `CCPBAS` is
`DBB8h` and the CCP ends at `E572h`. Its 2,491 bytes are followed by the BDOS.

The working state is in RAM. `CMDFCB` and `RENFCB` hold parsed file
references. The command buffer follows them and `CCPCLR` marks the start
of the state cleared by warm boot (`src/ram.asm:148-186`). The state
runs from `CCPRAM` at `BCD6h` to `BE6Ch`, with `CCPCLR` at `BDA2h`.
`CPMINIT` clears from `CCPCLR` through the BDOS state, leaving the command
buffer below it intact (`src/boot.asm:398-407`).
[Chapter 22](22-chains-across-warm-boot.md) explains the retained line.
[Appendix C](appendix-c-memory-map.md) lists the memory locations.

File operations share a short call helper. A `CALL DOSSEQ` has an inline byte
containing twice the BDOS function number plus a file control block (FCB)
selection bit. Bit 0 selects `CMDFCB` when clear and `RENFCB` when set. `DOSSEQ`
advances the stacked return address past that byte, decodes it into `C` and `DE`
and jumps to the BDOS. The BDOS returns after the inline byte
(`src/cpm/ccpmut.asm:172-183`). The CCP uses this form for 18 calls. DIR's searches use functions 17 and 18, TYPE's reads use 20 and ERA's
deletion uses 19 (`src/cpm/ccpfile.asm:74-75`, `src/cpm/ccpfile.asm:187-189`,
`src/cpm/ccpfile.asm:371-373`, `src/cpm/ccpmut.asm:57-61`).

The CCP also reads the console geometry and mode, the loader's result
and the program ceiling at `0007h`. Its direct state includes `SHOWN`, the
shell's table or 0, `HFLAG` for the shell's history input, `WRFLAG` for the
disk reset, `STFLAG` for a line's origin, `CHPOS` for a function 47 line and
a dropped line, and `PRGCODE` for the previous result
(`src/cpm/ccp.asm:46-158`, `src/cpm/ccp.asm:203-223`).

## Entry from boot

The prompt must return to the selected drive and user area after a program
ends. Both are packed into `0004h`: the user in bits 4 to 7 and the drive
in bits 0 to 3. Cold boot sets the byte to zero for A and user 0. Warm
boot preserves it and enters `CCPENT` with the byte in `C`
(`src/boot.asm:114-115`, `src/boot.asm:150-152`, `src/boot.asm:293-308`).

`CCPENT` establishes the CCP stack and checks the saved drive. A drive
past D or without a mounted volume becomes A. Otherwise the selection
would raise `Select` and its warm boot would repeat the failed selection.
The chosen drive is held in `BOOTDRV` while the disk state is reset
(`src/cpm/ccp.asm:46-75`).

Function 13 resets the disks with `WRFLAG` set, preserving the allocation
vectors for unchanged drives. Warm boot has cleared the BDOS user variable
so function 32 restores the saved user. `STBOOT` then handles the first
record of `A:STARTUP.CMD` once after cold boot. Finally function 14 selects
the saved drive when it is not A and `STARTED` prints a new line before
the prompt (`src/cpm/ccp.asm:74-96`, `src/cpm/bdosfile.asm:46-77`).
[Chapter 20](20-a-file-through-the-bdos.md) explains the allocation-vector
reset and [Chapter 26](26-startup-inside-the-ccp.md) explains startup.

A drive left with no volume is the unavailable-drive case. `CD` never
leaves a drive empty, since it puts one volume in place of another, but a
program can empty a drive through the ROM's `UNMNT` service. When 0004h then
names that drive at warm boot, the CCP takes A instead, as no selection of
the empty drive could succeed (`src/cpm/ccp.asm:74-96`,
`docs/compatibility.md`).

## The prompt and its input

`MAINLOOP` resets the stack and calls `SAVEDU` before each prompt. `SAVEDU`
reads the user with function 32 and the drive with function 25, then packs
them into `0004h`. With a shell holding the hook, `SHLINE` calls its `LINE`
entry, which prints the prompt itself. Otherwise the ROM prints a nonzero
user number in decimal before the drive letter and `>`, giving `A:SYSTEM>` or `3A:SYSTEM>`
(`src/cpm/ccp.asm:110-144`, `src/cpm/ccp.asm:306-324`). A program's ordinary
exit preserves that selection. Removing the current volume gives the
fallback to A described above. Cold reset starts from A and user 0.

With the shell, the line comes from `LINE`: a remaining piece, the rest of
the startup file, a script line or a typed line, written zero-ended at
`CMDTXT` with its origin in `A`. `SHLINE` sets `HFLAG` around the call so
that the shell's own function 10 call offers history, and bounds the line
with a zero at the buffer's last byte (`src/cpm/ccp.asm:110-124`,
`src/cpm/ccp.asm:251-282`). [Chapter 22](22-chains-across-warm-boot.md)
explains the shell's order and [Chapter 23](23-the-history-ring.md) storage
and recall.

With no shell, input has three sources in priority order. A function 47
line flagged in `CHPOS` is echoed and taken whole. Otherwise `STLINE`
supplies the one startup line, or function 10 reads the keyboard with
`HFLAG` clear (`src/cpm/ccp.asm:126-182`).

`STFLAG` is `FFh` for a startup line and zero for typed input, and with the
shell it is the origin `LINE` returned. Typed input uses `CMDBUF`, the
maximum-length byte, followed by `CMDLEN` and 128 bytes at `CMDTXT`. Warm
boot sets the maximum to 127 (`src/cpm/ccp.asm:141-158`,
`src/ram.asm:152-157`, `src/boot.asm:406-407`).

`MLSKIP` passes over spaces and returns to the prompt for an empty line.
`MLTAKE` converts lower-case letters to capitals up to the line's zero and
clears `PRGCODE` (`src/cpm/ccp.asm:184-223`). The ROM sees no `!` or `&`:
the shell has already split the line, and with no shell they are ordinary
characters. [Chapter 13](13-results-and-command-chains.md) explains the
practical result rules.

## The parsed command

A drive selection is handled before keyword dispatch. `MLTAKE` recognises a
letter A to P followed by a colon and only spaces after it. It selects that
drive with function 14 and updates `0004h` through `SAVEDU`. A missing volume
raises `Select` before that update so the error's warm boot restores the
previous drive (`src/cpm/ccp.asm:224-249`).

Other pieces enter `NOTDRIVE`. It starts a new output line and calls
`CMDSKIP` to store the word's start in `CMDSTRT`. `CMDPARSE` parses a file
reference into `CMDFCB`. `ARGSTRT` is then set to its delimiter for the
handler's arguments. Invalid syntax reaches `BADCMD` before dispatch
(`src/cpm/ccp.asm:339-348`, `src/cpm/ccp.asm:483-528`).

`PARSEFCB` clears all 36 bytes of the destination FCB: zero drive, eleven
spaces for name and type and zeros for the remainder. Reusing an FCB after
TYPE therefore starts a later load at record zero. `FCBBASE` records the
FCB's address while the parser advances `DE`. On return `HL` points to the
reference's delimiter (`src/cpm/ccpcmd.asm:443-531`).

An initial letter and colon set the drive byte to 1 through 16 for A to P.
The parser fills up to eight name bytes and three type bytes after a dot.
`FCBEND` recognises zero, space, equals and dot. `PARSTAR` fills the remaining
field positions with question marks and skips text to the delimiter.
`VALIDCHR` checks the thirteen reserved characters in `BADCHARS`.
`PARLONG` skips an overlong field and returns carry
(`src/cpm/ccpcmd.asm:485-569`, `src/cpm/ccpcmd.asm:602-662`,
`src/text.asm:58-59`). Appendix J gives
the complete exclusion list, padding rules and accepted command forms.

`UNAMBIG` checks the stored FCB through `FCBBASE`. It rejects a blank name or
any question mark in the eleven name/type positions. TYPE, REN, SAVE and program
dispatch use that check (`src/cpm/ccpcmd.asm:581-622`). The shell's COPY has
its own parser and check, `PARSEFCB` and `UNAMBIG` in
`drivers/shellcmd.asm:221-336`.

The keyword loop compares the original command text at `CMDSTRT` with
`KEYTAB`, not the parsed FCB. Its order is CD, DIR, TYPE, ERA, REN, SAVE,
USER, CON and UNLOAD. COPY, DEL and SERVICES are not in it: the shell
takes them before the ROM sees the piece, and DEL reaches the ROM as `ERA`
(`src/tables.asm:60-78`, `drivers/shell.asm:545-552`). `ISCMD` requires a space or zero
immediately after the keyword. `A:DIR` and `DIR.COM` therefore name a
program file rather than built-in DIR. Both fail when the selected search
finds no `DIR.COM` (`src/cpm/ccp.asm:351-376`,
`src/cpm/ccpcmd.asm:689-708`, `src/tables.asm:53-78`).

A match jumps to the handler address in the table. With no match the CCP
requires an unambiguous file name. Type SVC calls `SVCGO` to load and install a
service. Other types are replaced by COM so `TAS.TXT` searches for `TAS.COM`
(`src/cpm/ccp.asm:374-428`). A startup service whose INIT reports `TNENODV` has
the quiet-success exception. Other installation failures reach `BADCMD`
(`src/cpm/ccp.asm:396-412`). A service whose execution record asks to be
entered is entered after it installs, or found and entered without a file
read (`src/loader.asm:734-783`). [Chapter 25](25-loading-and-removing-services.md)
describes installation.

`BADCMD` prints the word at `CMDSTRT` up to space or zero, then `?` and a new
line. Built-ins can move `CMDSTRT` to an argument. CON moves it again for a
separated width so its error may name that width. `ERRGO` sets `FF00h` before
printing the error message. Successful handlers retain the zero set at piece
entry. They finish at `MAINLOOP` or at `STARTED`, which adds a new line first
(`src/cpm/ccp.asm:464-471`, `src/cpm/ccp.asm:536-570`,
`src/cpm/ccpcmd.asm:105-111`).

## The built-in handlers

The handlers use the same FCB and DMA interfaces as a disk program. This
table locates their implementations, the ROM's and the shell's. Appendix J
gives syntax and [Appendix D](appendix-d-error-messages.md) gives recovery
from messages.

| Command | Routine | Source |
| --- | --- | --- |
| DIR | `CMDDIR` | `src/cpm/ccpfile.asm:17-255` |
| TYPE | `CMDTYPE` | `src/cpm/ccpfile.asm:354-420` |
| ERA | `CMDERA` | `src/cpm/ccpmut.asm:10-67` |
| REN | `CMDREN` | `src/cpm/ccpmut.asm:81-153` |
| SAVE | `CMDSAVE` | `src/cpm/ccpcmd.asm:266-390` |
| USER | `CMDUSER` | `src/cpm/ccpcmd.asm:223-260` |
| CON | `CMDCON` | `src/cpm/ccpcmd.asm:55-220` |
| UNLOAD | `CMDUNL` | `src/cpm/ccpcmd.asm:13-18`, `src/loader.asm:97-126` |
| COPY, the shell's | `CMDCOPY` | `drivers/shellcmd.asm:54-154` |
| DEL, the shell's | `CMDDEL` | `drivers/shell.asm:543-552` |
| SERVICES, the shell's | `CMDSVC` | `drivers/shellcmd.asm:15-50` |

### Directory listing and text output

DIR turns a blank name into eleven question marks and sets DMA to `LOADBUF`.
Functions 17 and 18 return matching directory entries. DIR skips a system
file by testing bit 7 of the second type byte. Its parsed FCB has extent
zero so the search returns each file once
(`src/cpm/ccpfile.asm:17-104`).

`DIRNCOL` is the console width `VWID` divided by 13, with a minimum of one.
A zero width uses 80 for serial output. DIR prints each name and type,
padding to twelve characters except at a row's end, with a separating
space before the next entry (`src/cpm/ccpfile.asm:57-73`,
`src/cpm/ccpfile.asm:106-180`). The layout differs from Digital Research's
DIR. The footer calls function 46 for the listed drive and divides its
three-byte free-record count by eight to print KiB. The default drive stays
unchanged. No listed file gives `NO FILE`
(`src/cpm/ccpfile.asm:198-255`, `src/cpm/bdosfn.asm:55-126`).

Both DIR and TYPE print through `LSTPUT`. With a shell holding the hook it
sends each byte to the shell's `PAGE` entry, whose carry stops the listing.
With no shell it prints the byte and returns carry clear, so a bare listing
never pauses (`src/cpm/ccpfile.asm:261-288`). The pager is the shell's.
`PGRST` takes its dimensions from `TNINFO` or uses 24 rows and 80 columns for
serial, and reserves a row for `[more]`. `PGPUT` resets its column at carriage
return, steps back at backspace and advances to the next multiple of eight at
a tab. It counts a new line at LF or before a printable character beyond the
last column (`drivers/shellio.asm:345-449`). At a pause function 6 reads a key
without echo, and `UNMORE` erases the prompt with CR, six spaces and CR. The
key mask makes `#` equivalent to `^C` and `;` equivalent to Esc. `^C` and `#`
drop the rest of the line. Esc, `Q`, `q` and `;` stop only the listing. Other
keys continue (`drivers/shellio.asm:450-502`). Chapter 22 explains the
distinction.

TYPE opens its file and reads 128-byte records into `LOADBUF`. It prints
through the pager until `1Ah`, the first Ctrl-Z, or the file's end. It then
closes the file. No name or a missing file produces `NO FILE`
(`src/cpm/ccpfile.asm:354-420`).

### Erase, rename and save

ERA tests all eleven stored name/type bytes for question marks before
printing `ALL (Y/N)?`. Function 1 reads the first echoed answer byte.
Return alone cancels deletion. Otherwise ERA drains the answer to Return
and deletes only for an initial Y or y. Other patterns delete without that
question. Function 19 performs the deletion and no match gives `NO FILE`
(`src/cpm/ccpmut.asm:10-67`).

REN parses NEW into `RENFCB` and OLD into `CMDFCB`. The names share a drive
from either reference and different explicit drives are rejected. Function
17 checks the new name first. A match gives `FILE EXISTS` before mutation.
Otherwise REN copies twelve bytes from `RENFCB` to `CMDFCB+16`, placing
the new name at offset 17 for function 23. An absent old name gives
`NO FILE` (`src/cpm/ccpmut.asm:81-149`).

SAVE converts a decimal page count with a carry check at every arithmetic
step. It rejects values above 255 and counts reaching the high byte of
the word at `0006h`. On the starter card with the shell installed that byte
is `A7h`: 166 pages cover `0100h` through `A6FFh`. Both 167 and 320 are
rejected in this capture (`src/cpm/ccpcmd.asm:266-307`):

<!-- TEC-OS 46cf3f1: node tools/capture.mjs 'SAVE 320 B:X.COM' 'SAVE 167 B:X.COM'. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>SAVE 320 B:X.COM
320?

A:SYSTEM>SAVE 167 B:X.COM
167?

A:SYSTEM>
```

SAVE erases an existing file, makes it again and writes two 128-byte records per
page from `0100h`. A failed make, write or close gives `NO SPACE`. After a
failed write it attempts close before reporting the error. A successful close
records the partial file. The error path discards the close result so the
message does not certify that update. Digital Research's CP/M 2.2 SAVE leaves
the file open on that path (`src/cpm/ccpcmd.asm:309-390`).

SAVE reads the TPA. The other file-operation handlers use resident workspace and
page-zero buffers so they leave program memory available to save. Loading a COM
program or a service overwrites that memory, including a GLCD service loaded by
CON (`src/cpm/ccpcmd.asm:315-360`, `src/loader.asm:862-906`,
`src/cpm/ccp.asm:625-663`). The shell's COPY uses the DMA at `0080h` and also
leaves the TPA alone (`drivers/shellcmd.asm:93-94`).

### Selection and consoles

USER validates a single digit 0 to 9 or a two-digit value 10 to 15 and
calls function 32. CON uses its device-name table to set the IOBYTE console
field through `CONFLD`. PICO aliases CRT and GLCD aliases UC1. Selecting
UC1 calls `GLCLD` to load `GLCD.SVC` from A if required. A failed load puts
the field back to the active mode (`src/cpm/ccpcmd.asm:55-220`,
`src/cpm/ccpcmd.asm:223-246`, `src/loader.asm:862-887`).

CON's report prints `CON:` and the mode read from `CONMOD` after the BIOS has
acted on the field. A missing display or keyboard can force TTY while a failed
GLCD load restores the previous mode. Output uses the selected console and BAT
discards it. [Chapter 17](17-console-paths.md) explains the BIOS transition
(`src/cpm/ccpcmd.asm:187-214`, `src/console.asm:339-347`).

A width after CRT or PICO is parsed as two decimal digits. CON finds the PICO
version-3 record with `TNFIND` and calls its `PICOWID` entry for 80, 40 or 32
columns. A joined name and width, a width after another device, an unsupported
width or a missing PICO interface is an error. In startup the missing-interface
path passes quietly. A separated width becomes the error word while a joined
form names the whole token (`src/cpm/ccpcmd.asm:105-180`). This PICO capture
shows both:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico 'CON PICO 40' 'CON CRT80' 'CON PICO 50' 'CON TTY 80' 'CON CRT: 32'. Complete captured console transcript. -->
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
(`src/console.asm:32-45`, `src/video.asm:18-24`,
`src/pico.asm:44-68`, `src/pico.asm:70-94`,
`src/cpm/ccpcmd.asm:105-191`, `src/console.asm:111-133`).

### Copies and resident services

COPY is the shell's. It parses the source into the default FCB at `005Ch`
and the destination into its own `CFCB`, substituting the current drive for
zero. A destination with a blank name takes the source's eleven name/type
bytes. After checking both for ambiguity, COPY compares all twelve bytes for
a self-copy and rejects extra operands before opening either file
(`drivers/shellcmd.asm:54-92`, `drivers/shellcmd.asm:156-212`).

The copy uses DMA at `0080h` and leaves the TPA untouched. It opens the
source, erases and makes the destination and transfers records through
functions 20 and 21. `CCOUNT` counts records and `PUTHEX` prints the count in
hexadecimal. A write error closes the partial destination before
`WRITE ERROR`. Retention of the written records depends on that close
succeeding. The error path ignores its result (`drivers/shellcmd.asm:93-154`).

SERVICES, the shell's too, walks the owner list from the lowest owner's page,
which the ROM passes to `LINE` in `B`, upwards, printing each name and
decimal page count. The page count is the next owner's page, or the stub's
for the last, less the owner's own (`drivers/shellcmd.asm:15-50`). UNLOAD,
the ROM's, calls `SVCUNL` for the lowest owner, the newest service. It fails
there if removal is disallowed or REMOVE returns carry. It does not skip to
another service (`src/cpm/ccpcmd.asm:13-18`, `src/loader.asm:97-126`).
Chapter 25 explains the registry and removal checks.

## Program lookup and capacity

A COM command uses `LOADA` on the named drive or the current drive.
`LOADA` first calls `LOADCOM` in the current user area. Only a missing file
permits a retry in user 0 and user 0 is skipped when already current.
Function 32 changes the user before that retry and restores it afterwards.
No system attribute is required (`src/cpm/ccp.asm:584-609`).

`LOADCOM` distinguishes absence from an unloadable file with flags. Carry
and zero mean missing. Carry with NZ means a file was found but could not
load. `LOADA` returns the latter failure immediately. The CCP retries drive
A only after absence on the first drive, when no drive was explicit and
the current drive is not A. It writes 1 into the FCB drive byte and calls
`LOADA` again. A's current user therefore precedes A's user 0
(`src/cpm/ccp.asm:428-440`).

This starter-card capture contrasts a plain command with an
explicit B drive. The plain TAS reaches A, and prints its usage line, while
`B:TAS` stays on B:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs B: TAS B:TAS. Complete captured console transcript. -->
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

A service command calls `LOADCOM` directly through `SVCGO`. It searches
only its named or current drive and the current user area. It has neither
the user-0 retry nor the drive-A fallback
(`src/cpm/ccp.asm:385-395`, `src/loader.asm:901-906`).

`LOADCOM` opens `CMDFCB` and starts at `0100h`. `READSRC` sets DMA with
function 26 before each function-20 read. Each successful record advances
the destination by 128 bytes. The loop stops at EOF or at the page given
by `0007h`, the high byte of the entry word at `0006h`
(`src/cpm/ccp.asm:625-648`, `src/cpm/ccp.asm:713-719`).

Reaching that page does not establish that the file is oversized.
`LOADLIM` reads once more into workspace `LOADBUF`. EOF means an exact
fit. A further record or another error returns carry with NZ. Below the
ceiling, `LOADEND` also requires EOF for success. `LOADOK` stores the
record-rounded end in `LOADTOP` for the service loader then calls close.
It clears carry without checking close's result
(`src/cpm/ccp.asm:659-700`). Thus a larger file stops lookup rather than
falling through to another drive. In the default BDOS error mode a card
read failure prints `Bad Sector` and warm-boots before this routine returns
(`src/cpm/bdoscon.asm:47-64`).

With nothing installed the starter card's resident entry is at `B6C5h`. Its
load ceiling is `B600h`, allowing 46,336 bytes from `0100h`, 197 fewer than
the TPA's byte-address limit. The startup file installs the shell, whose
first page is `A700h`, so the starter card's prompt loads at most 42,496
bytes. An installed service lowers the entry word to
its first page and lowers the load ceiling with it
(`src/cpm/ccp.asm:637-639`, `src/loader.asm:494-507`).

The capacity fixture places FITS, BIG and ARGS on B. FITS and BIG contain
RET followed by zeros. ARGS has the complete listing below and is assembled
on the PC by TAS, as Chapter 27's HELLO is. FITS has 42,496 bytes and BIG
has 42,497:

```sh
node -e 'const b = n => { const x = Buffer.alloc(n); x[0] = 0xC9; return x; };
require("fs").writeFileSync("build/fits.com", b(42496));
require("fs").writeFileSync("build/big.com", b(42497));'
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

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card build/ccp.img B: FITS BIG. Complete captured console transcript. -->
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

The same fixture also demonstrates user fallback. Under user 3,
ARGS is found in B's user 0 and TAS in A's user 0. DIR still lists only
the empty current area:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card build/ccp.img B: 'USER 3' ARGS TAS B:TAS DIR. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>USER 3
3B:WORK>ARGS
0
0
[]
3B:WORK>TAS
usage: TAS NAME [OUT.TYP]

3B:WORK>B:TAS
B:TAS?

3B:WORK>DIR
NO FILE

3B:WORK>
```

## Page zero before entry

A successful load reaches `PREPPAGE`. It parses the first two argument
references into the FCBs at `005Ch` and `006Ch`, ignoring parse errors for those
program arguments. It then copies the command tail to `0081h`, writes its length
at `0080h` and appends zero. Function 26 restores DMA to `0080h`. The tail
includes the initial space. The shell ends a piece before the spaces in front
of its separator, so they are not in the tail. Its letters have already been
converted to capitals (`src/cpm/ccpcmd.asm:402-440`, `drivers/shell.asm:321-373`).

The two FCBs start sixteen bytes apart. Parsing the second overwrites the last
twenty bytes of the first. The tail begins at `0080h` within the second FCB's
last sixteen bytes so those bytes are shared with tail storage. Each FCB's drive
and eleven name/type bytes remain intact (`src/cpm/ccpcmd.asm:402-440`). The
complete FCB and DMA contracts are explained in
[Chapter 10](10-read-and-write-a-file.md).

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

`PUT` saves BC and HL across function 2, preserving the caller's count and
pointer. `SHOWFCB` prints eleven name/type bytes and `TAIL` uses the length
byte at `0080h`. In this capture the parsed names use padded FCB fields
while the tail preserves the spaces within the piece:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card build/ccp.img B: 'args one.txt a:*.c' 'ARGS X Y ! ARGS'. Complete captured console transcript. -->
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

The first FCB has drive zero for the current drive and the second has 1
for A. The star in `*.C` expands to eight question marks. `ARGS X Y` loses
the space before `!`, which the shell leaves off the piece. With no
arguments both names are blank and the tail length is zero
(`src/cpm/ccpcmd.asm:457-531`, `src/cpm/ccpcmd.asm:632-645`).

## The jump and return

After `PREPPAGE`, the CCP writes the load drive from `CMDFCB` to `0050h`. Zero
means a plain name loaded on the current drive. An explicit drive keeps its FCB
number so `B:ARGS` gives 2. A plain command found by fallback on A gives 1
because lookup set the FCB byte to A (`src/cpm/ccp.asm:431-461`).

`CMDRUN` resets SP to `CSTKTOP`, pushes `0000h` and jumps to `0100h`.
The source reserves a 48-byte CCP stack, leaving forty-six bytes below that
return word. A guard separates the stack from command scratch
(`src/cpm/ccp.asm:464-471`, `src/layout.asm:111-112`,
`src/ram.asm:196-208`). CP/M 2.2's eight levels provide sixteen bytes.
[Chapter 15](15-state-and-memory.md) distinguishes configured stack sizes
from measured use and bounds.

The jump goes through HL, because a service's entry on install uses the
same path to enter the service at its own address.
`CMDRUN` loads `0100h` first, so a program starts with HL = `0100h` and
DE = `0000h`, and with A = `FFh` when its line came from `STARTUP.CMD` and 0
otherwise. CP/M 2.2 promises a program no register at entry
(`src/cpm/ccp.asm:447-473`, `docs/compatibility.md:186-191`).

A top-level RET reaches the warm-boot jump at `0000h`. A direct jump there or
function 0 reaches warm boot too (`src/cpm/ccp.asm:469-471`,
`src/cpm/bdos.asm:216-221`). Warm boot flushes the block cache before
re-entering the CCP. A failed flush prints `Write lost` and sets the drop
flag, so the shell cancels the line's pending pieces (`src/boot.asm:141-152`, `src/cache.asm:634-640`). The CCP enters at
`STARTED` and prints a new line before its prompt. A program whose output
already ended with a new line therefore has a blank line before that prompt.
