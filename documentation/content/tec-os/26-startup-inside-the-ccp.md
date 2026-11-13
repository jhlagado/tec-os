---
title: Startup inside the CCP
parent: TEC-OS
nav_order: 26
nav_group: "Inside TEC-OS"
---

# 26. Startup inside the CCP

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A startup command can run a program that ends through warm boot. The next
startup line must still be available when the command processor starts
again. Two readers share the file. The ROM reads one
record of `A:STARTUP.CMD` once after cold boot and runs its first line. When
that line installs the shell, `SHELL.SVC` reads the rest of the file, every
record, and runs it line by line. The shell's position is in its own pages,
outside the warm-boot clear. The practical file setup is in
[Chapter 8](08-commands-at-startup.md).

## The ROM's one line

`STPOS` is one byte, and `CHPOS` follows it
(`src/ram.asm:399-404`). It records progress and completion
(`src/cpm/ccpcmd.asm:745-790`, `src/cpm/ccpcmd.asm:792-874`):

| `STPOS` | Meaning |
| --- | --- |
| `00h` | `STBOOT` hasn't run since cold boot |
| `01h` | A record waits in `LOADBUF` for `STLINE` |
| `80h` | Finished: the line was taken, or there was none |

The byte is above the RAM BIOS table. Warm boot's `CPMINIT` clears from
`CCPCLR` to `BDOSRME`, below it, so an ordinary program exit preserves it.
Reset enters `COLD` and clears the whole workspace including `STPOS`. The
next startup read begins from zero (`src/ram.asm:286-295`,
`src/boot.asm:22-65`, `src/boot.asm:398-403`).
[Chapter 15](15-state-and-memory.md#the-workspace-across-a-program-exit)
explains the two clearing spans. The space after `CHPOS`, up to the console
state, is unused (`src/ram.asm:406-410`).

A diagnostic retry returns to `COLDRT`, after the cold clear but before
the CCP has run. `STPOS` is still zero. Once the card mounts, startup can
begin as it would after an uninterrupted cold boot
(`src/boot.asm:92-115`).

## The first read and the bypass

Each `CCPENT` resets the disks, restores the user number and calls
`STBOOT` before selecting the entry drive (`src/cpm/ccp.asm:39-88`).
Cold boot sets page zero to drive A and user 0. Warm boot passes that
byte to the CCP so the first startup open uses user area 0
(`src/boot.asm:114-115`, `src/boot.asm:149-152`). `STBOOT` returns
immediately on later entries because `STPOS` is already nonzero
(`src/cpm/ccpcmd.asm:760-764`).

The routine marks startup finished before attempting any file operation. It
sets bit 7 of `STPOS`, making `80h` (`src/cpm/ccpcmd.asm:765`). A BDOS error
can warm boot from inside the open or read. On the next entry the nonzero
position prevents another attempt at that file. The source test at
`test/startup.test.mjs:235-258` injects a failure at the file's card block
and asserts a usable command prompt with `Bad Sector` and no execution of
the stored command.

The keypad bypass occurs after the finished mark and before the open.
`STBOOT` reads port `03h` once and returns if bit 6 is low, meaning a
hex-keypad key is down (`src/layout.asm:14`, `src/cpm/ccpcmd.asm:767-769`).
The position stays at `80h`, just as for an absent file. No line runs, so no
shell is installed either. Holding a key through reset covers that single
sample. On the host model the sample comes 5,821,320 T-states after reset on the
web-page board with the starter card, about 1.46 seconds. That measurement
is not a deadline on a physical board. The
hanging-`INIT` and repeated-cold-boot tests both exercise a held key as the
recovery route (`test/startup.test.mjs:57-69`, `test/startup.test.mjs:260-273`,
`test/startup.test.mjs:320-324`).

Without the bypass, `STBOOT` copies twelve bytes from `STFCB` into `CMDFCB`:
drive byte 1 and `STARTUP CMD`. The rest of the file control block (FCB) is
still zero from cold boot. Drive byte 1 names A regardless of the current
drive (`src/tables.asm:137`, `src/cpm/ccpcmd.asm:770-773`,
`src/ram.asm:148-149`). A recognised reset has already run `RESEL`, so this
is the volume currently selected as A, not necessarily the card's original
SYSTEM volume (`src/boot.asm:101-104`, `src/volsvc.asm:1-22`). Chapter 8's
`SPARE` example demonstrates that selection.

Three BDOS calls acquire the record (`src/cpm/ccpcmd.asm:774-784`):

- Function 26 sets the DMA address to `LOADBUF`, the CCP's load buffer,
  which nothing else uses before `STLINE` takes the line.
- Function 15 opens the file. `INC A` makes the no-file result `FFh` zero
  for the branch to `STBDMA`.
- Function 20 reads the first record. A nonzero result also branches to
  `STBDMA`, leaving startup finished.

The open and read use `DOSSEQ`. Its inline descriptor byte holds twice
the function number plus an FCB-selection bit (`src/cpm/ccpmut.asm:160-183`).
A good read leaves `A` at zero, which `INC A` converts to position 1. All
normal open/read outcomes then restore `CURDMA` directly to `DEFDMA`,
`0080h` (`src/cpm/ccpcmd.asm:783-790`). A program launched by the first line
therefore has the default DMA address. The bypass keeps the default already
established by warm boot (`src/boot.asm:404-405`).

There is no second read or close in the ROM. `STLINE` takes its one line from
those 128 bytes.

## Taking the line

With no shell holding the hook, `MLDRV` prints the prompt, takes a
function 47 line if one waits, and otherwise calls `STLINE` before the
keyboard. `STLINE` returns carry clear for a supplied line and carry set when
there is none. The keyboard path's function 10 runs with `HFLAG` clear, so
startup text adds no history entry (`src/cpm/ccp.asm:138-158`). With a shell
installed by that line, the ROM's prompt is no longer used, and `STLINE` is
never called again before the next reset.

`STLINE` returns carry unless `STPOS` is 1, and writes `80h` before reading,
so it supplies at most one line. `HL` starts at `LOADBUF`, `DE` at
`CMDTXT`, `B` at 127 slots and `C` at 128 record bytes
(`src/cpm/ccpcmd.asm:805-814`).

The scan reads each of the 128 bytes in turn. Zero and `^Z` end the text,
and the record's end ends it too. CR and LF end the current line. Other bytes
are copied while `B` is nonzero. Once 127 characters have been copied the
routine keeps scanning but drops further characters until the line's end
(`src/cpm/ccpcmd.asm:819-840`). A line cut by the record's end runs in its
shortened form.

At a CR or LF, `STLCR` passes over a line with nothing copied, so empty lines
and the LF of a CR LF pair cost nothing. A line whose first byte is `;` is a
comment: `STLCR` sets `DE` back to `CMDTXT` and `B` to 127 and goes on to the
next line (`src/cpm/ccpcmd.asm:842-851`). A `;` after a blank is not at
`CMDTXT`'s first byte, so that line is no comment. At the text's end `STLE`
returns carry for a last line that is a comment or for no line at all
(`src/cpm/ccpcmd.asm:853-861`). The tests check the first line alone running,
empty and comment lines passed over and not echoed, the 127-character cut,
and the record's end ending an unended line
(`test/startup.test.mjs:291-318`).

## The echo and the command buffer

For a nonempty line, `STLINE` stores `CMDLEN` and appends CR and `$` to the
copied text. It calls `PUTSTR`, which prints through BDOS function 9
(`src/cpm/ccpcmd.asm:862-874`). A `$` already in the text ends that echo
early. The command buffer still contains the whole line and its original
case. `NOTDRIVE` prints `CRLFMSG` before dispatch, so command output starts on
a new row even when the echo did not reach its appended CR
(`src/cpm/ccp.asm:339-342`).

This recipe's card contains `NOTE$.TXT`, and its startup file's one line
types that file with no shell:

```sh
printf 'It ran whole.\n' > 'NOTE$.TXT'
printf 'TYPE NOTE$.TXT\n' > startup.cmd
cp dist/starter.img dollar.img
node tools/tecvol.mjs put dollar.img A startup.cmd --text
node tools/tecvol.mjs put dollar.img A 'NOTE$.TXT' --text
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card dollar.img. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>TYPE NOTE
It ran whole.

A>
```

With `SHELL.SVC` on the first line and the same command on the second, the
shell echoes the line whole, since its `PUTZ` prints to a zero:

```sh
printf 'SHELL.SVC\nTYPE NOTE$.TXT\n' > startup.cmd
cp dollar.img dollar2.img
node tools/tecvol.mjs put dollar2.img A startup.cmd --text
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card dollar2.img. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>TYPE NOTE$.TXT
It ran whole.

A:SYSTEM>
```

At the maximum copied length, the echo's CR fills the last byte of 128-byte
`CMDTXT`. The `$` goes one byte further into `BOOTDRV`, which immediately
follows it (`src/ram.asm:156-160`, `src/cpm/ccpcmd.asm:864-870`). `BOOTDRV`
has one reader, in `CCPENT`. That read precedes line extraction and each new
entry writes `BOOTDRV` before reading it. The temporary `$` is overwritten
before it can become a drive selection (`src/cpm/ccp.asm:46-88`).

`MLGOT` replaces the appended CR with zero, and `MLTAKE` capitalises the line
in place after the echo (`src/cpm/ccp.asm:184-223`). The source test compares
file-supplied and typed lines from `MLGOT` to the next `MLREAD`, including
their BDOS calls. It normalises letter case for the output comparison
(`test/startup.test.mjs:186-233`).

## The rest of the file in the shell

The startup line that names `SHELL.SVC` installs it and, because the
shell's execution record asks to be entered, enters it with `A = FFh`, the
startup origin. On that first entry the shell claims the hook and sets
`STSKIP` (`drivers/shell.asm:128-144`). At the next prompt `LINE` finds no
piece in hand and calls `STOPEN` (`drivers/shell.asm:243-249`).

`STOPEN` clears its script FCB, `SFCB`, copies drive byte 1 and
`STARTUP CMD` into it from `STNAME`, and opens the file. A missing file
opens nothing. Otherwise it marks the script's lines with the startup
origin, `FFh`, in `SORG`, and calls `SLINE` once to pass over the line the
ROM ran. A file with no line after the first is closed at once
(`drivers/shellio.asm:14-36`, `drivers/shellio.asm:43-63`).

`SLINE` reads the next line into `LTXT` with `SGET`, a byte at a time. CR, LF
and CR LF end a line, of which the first 127 characters are kept, and empty
lines and lines whose first character is `;` are passed over
(`drivers/shellio.asm:64-114`). `SGET` reads the script by record number with
function 33 into `0080h`, starting from record 0, and reads the record again
at each new line, since a program may use `0080h` in between. A zero, a `^Z`
or a read past the last record ends the script
(`drivers/shellio.asm:117-171`). The file is never closed, since it is only
read.

`NEXT` then echoes the line whole after the prompt and runs it as a typed
line, with its pieces, but with the startup origin, so the ROM's quiet paths
for an absent device and an unavailable PICO width line hold for every line
of the file (`drivers/shell.asm:243-274`). The script's FCB, its record
number and offset are in the shell's pages, so a program's warm boot leaves
the position intact, and the next `LINE` goes on with the next line.

A later `SHELL.SVC` line in the file enters the installed shell again. That
entry finds the hook already claimed, takes it back and changes nothing else,
so the file goes on from the line after it (`drivers/shell.asm:128-136`,
`docs/shell.md:135-139`). Typing `STARTUP.CMD` at the prompt runs the whole
file again as a typed script, with typed origin (`docs/shell.md:138-139`).

## Display loading and console selection

The PICO9918 console starts from ROM when the display answers and the Matrix
switch enables the matrix keyboard at cold boot. It needs no service line in the
file (`src/console.asm:42-45`, `src/video.asm:18-24`, `src/pico.asm:53-68`). The
supplied display line loads `GLCD.SVC`. The CCP compares all three type bytes in
`CMDFCB`: `SVC` calls `SVCGO` while another type goes to the `.COM` search
(`src/cpm/ccp.asm:385-422`). [Chapter 21](21-from-prompt-to-program.md) explains
that search.

`SVCGO` calls `LOADCOM` and `SVCLOAD`, returning carry on either failure
(`src/loader.asm:901-907`). Within `GLCD.SVC`, `INIT` first calls
`FONT`, service 15. A pre-5.1 ROM rejects that number and the driver
returns with carry. Next it calls `GLCWAIT`. An unanswered controller
returns `TNENODV`. Finally it passes its table through `DRVR`, service
12, with `B` at 3 for `UC1:` (`drivers/glcd.asm:60-73`).
[Chapter 25](25-loading-and-removing-services.md) covers the loader's
other checks and rollback.

`SVDRV` uses both the startup mark and the console field. A nonzero
table supplied from startup while that field is `CRT:` is rejected with
`TNENODV`, as for an absent device (`src/services.asm:540-556`). A
controller that answers still needs the matrix keyboard enabled by the
Matrix switch and a free UC1 table slot. `VIDHOOK` returns carry for
either a disabled keyboard or an occupied slot, which `SVDRV` returns
as `TNEBAD`
(`src/video.asm:142-166`, `src/services.asm:558-564`). A second
`GLCD.SVC` therefore fails while the first is installed. An older card's
`PICO.SVC` also fails when it passes a table for `CRT:` because `DRVR`
accepts only `UC1:` (`src/services.asm:532-538`).
[Chapter 17](17-console-paths.md) explains the console tables and claims.

After a successful load, `SVCGO` compares the new service's page in
`SVCHEAD` with the table page in `GLVEC`. No match leaves the console
unchanged. A match sets `CDGLC`. If `CONMOD` is `CMCRT`, it clears only
the LCD recovery word and keeps the PICO9918 selected. Otherwise
`CONSET` clears that word and passes `CMUC1` to `CONSW`
(`src/loader.asm:908-922`). `CONSW` selects the driver and writes the
effective mode to the console field (`src/console.asm:75-124`, `502-516`).
It tests `VTOWN` before restoring or clearing the screen so a selected
PICO9918 with an active claim is left alone (`src/console.asm:124-133`).

The startup and typed cases therefore have different results on a board
with both displays and the matrix keyboard enabled. Startup rejects
GLCD registration while `CRT:` is selected. A typed `GLCD.SVC` can
install the service while leaving the
PICO9918 console in use, ready for a later `CON UC1`. With the matrix
keyboard enabled by the Matrix switch and the controller answering but
no selected PICO9918 console, the startup line can select the graphics
LCD. Successful web-page card preparation sets the line for the chosen display
(`host/card.mjs:109-146`, `host/card.mjs:199-220`), as
[Appendix I](appendix-i-web-page.md) explains.

## Recovery words and row ownership

`CARD?` and `GLCD?` use row 3 of the 20 × 4 character LCD. `LCD3` sets
`B` to 3 and enters `LCDROW`. That routine selects the row and writes
up to the string's zero terminator, then returns carry set. A failure
path can finish with a jump to it (`src/lcd.asm:66-102`). Each word is
five characters. `PICCLR` is five blanks and a zero
(`src/text.asm:16`, `98-100`).

`GLCLD`, used by `CON UC1`, tests `CDGLC` and returns immediately if the
driver is already installed. A failed `SVCGO` instead restores the mode
from `CONMOD` into the console field with `CONFLD` and writes `GLCD?`
through `LCDWRD` (`src/loader.asm:873-887`, `src/console.asm:500-510`).
`LCDWRD` first sets `CDWRD`, bit 7 of `CONDEV`
(`src/lcd.asm:56-60`, `src/layout.asm:75`). `CONDEV` is
at `BFE7h`. Its stored bits are
(`src/ram.asm:418`, `src/layout.asm:70-75`):

| Bit | Name | Meaning |
| --- | --- | --- |
| 0 | `CDMTX` | The Matrix switch is on so the matrix keyboard is read |
| 1 | `CDTMS` | The PICO9918 answered at cold boot |
| 2 | `CDGLC` | `GLCD.SVC` is in |
| 3 | `CDRTC` | The DS1302 clock answered at cold boot |
| 7 | `CDWRD` | One of the ROM's words is on the LCD's row 3 |

`VCLAIM` separately stores `CDCLM` (`10h`) while a program has claimed the
PICO9918. `VIDEO` sets that byte on claim and clears it on release
(`src/ram.asm:128`, `src/services.asm:186-188`, `208-213`).
`INFO` combines `CONDEV` with `VCLAIM` using OR and returns the flags in `B`.
Its returned bit 4 reports the claim rather than a stored bit of `CONDEV`
(`src/services.asm:74-80`, `src/layout.asm:74`).

The row may have program text by the next console selection.
`WRDCLR` returns at once when `CDWRD` is clear. Otherwise it clears the
bit and writes five blanks. `CONSET` calls it, as does a successful typed
GLCD load that leaves the PICO9918 selected (`src/loader.asm:915-943`).
Hardware service `LCD` clears the bit when a program writes row 3,
without writing blanks
first (`src/services.asm:130-157`). A later console selection leaves
that program text alone. Direct port writes bypass the flag change.
If `CDWRD` remains set, a later selection overwrites the first five
characters of the program's row.

`DIAG` writes `CARD?` directly through `LCD3` without setting `CDWRD`.
No console selection occurs at its retry prompt. `R` returns to
`COLDRT`, where `LCDINIT` clears the whole display. Another mount
failure writes `CARD?` again (`src/boot.asm:92-101`, `632-652`).
Cold boot initialises `CONDEV` to zero before reading `CDMTX` from the
Matrix switch so no reset starts with a retained recovery-word flag
(`src/console.asm:32-45`).

## Startup origin and quiet results

The CCP records the source of each new line in `STFLAG`. After `STLINE`,
`CCF` and `SBC A,A` turn carry clear into `FFh` for startup and carry
set into zero for keyboard input. With a shell holding the prompt,
`SHLINE` stores the origin that the shell's `LINE` returns, `FFh` for every
piece of a line from `STARTUP.CMD` and 0 for the rest
(`src/cpm/ccp.asm:110-124`, `src/cpm/ccp.asm:141-158`,
`drivers/shell.asm:527-540`). `STFLAG`
is at `BF64h`.

There are three readers of this mark: the failed-service path, `DRVR`
registration and the PICO width command when `FIND` returns no console
(`src/cpm/ccp.asm:396-409`, `src/services.asm:540-556`,
`src/cpm/ccpcmd.asm:134-150`). `SVCLOAD` stores `INIT`'s returned `A`
in `SVCRA`, beside the result code `SVCRC`. Record rejection after a
successful `INIT` clears `SVCRA` so the later check cannot accept that
result as an `INIT` device-absence status (`src/loader.asm:365-370`, `426-430`,
`src/ram.asm:390-391`).

The failed-service path reads the two result bytes as a word, `SVCRC`
in `L` and `SVCRA` in `H`. `AND H` keeps the status only for startup.
`XOR TNENODV` gives zero only for status 2. `DEC L` and `OR L` keep
zero only for `SVCRC` 1, a failed installation with nothing left
resident. Only that combined result reaches `SVCOK` without a message.
Other failures returned to this check reach `BADCMD` and print the name with `?`
(`src/cpm/ccp.asm:396-412`, `536-568`, `src/loader.asm:436-480`).

An absent graphics controller and startup registration blocked by an
active PICO9918 console both return `TNENODV`. They can take that quiet
path. A load failure that returns before `INIT` leaves `SVCRC` zero
and prints the file's name with `?`. A disk error under the default
BDOS error mode instead prints its disk message, waits for a key and
warm boots through `CHDROP`, discarding the remaining chain. It does
not return to that name-reporting path (`src/cpm/bdoscon.asm:23-64`,
`src/cpm/bdos.asm:96-106`).

A controller that answers while the Matrix switch disables the matrix
keyboard fails with `TNEBAD`. That failure still prints the name from
startup. Typed on a board without the graphics controller, `GLCD.SVC`
prints `GLCD.SVC?`. Typed with both displays and the matrix keyboard
enabled it can install while leaving the PICO9918 selected
(`src/loader.asm:901-922`, `drivers/glcd.asm:60-73`,
`src/services.asm:532-564`).

The width path first uses `FIND` to locate the ROM PICO9918 console
before passing a width to it. A `CON PICO` or `CON CRT` width line from
startup reaches `STARTED` silently if that console is absent, as on a
serial board. The same line typed at the prompt reaches `BADCMD` and
prints the width with `?` (`src/cpm/ccpcmd.asm:134-168`).

Quiet handling also preserves the result that an `&` piece tests.
`MLTAKE` clears `PRGCODE` before each command. A quiet service or
unavailable-console width line leaves that zero intact. `BADCMD` instead
reaches `ERRGO`, which stores `RCFAIL`, `FF00h` (`src/cpm/ccp.asm:220-223`,
`src/cpm/ccp.asm:536-568`). The shell checks the code before the next piece
(`drivers/shell.asm:200-226`). On a board without the graphics controller,
the startup line `GLCD.SVC &CD` can therefore run `CD`. The same typed
line reports `GLCD.SVC?` and skips `CD`.
