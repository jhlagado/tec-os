---
title: Startup inside the CCP
parent: TEC-OS
nav_order: 26
nav_group: "Inside TEC-OS"
---

# 26. Startup inside the CCP

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

Startup must survive a program's normal warm boot yet avoid repeating a
boot command that fails during file I/O. TEC-OS divides this work between
two readers. The ROM reads the first record of `A:STARTUP.CMD` once after
cold boot and executes its first line. If that line installs `SHELL.SVC`,
the resident shell reads the remaining file across all its records.
Its pages retain script position outside the warm clear.
[Chapter 8](08-commands-at-startup.md) explains preparing the file.

## The ROM's one line

A retained byte makes the ROM reader a one-shot operation. `STPOS`
precedes `CHPOS` (`src/ram.asm:405-410`) and records these states
(`src/cpm/ccpcmd.asm:745-790`, `src/cpm/ccpcmd.asm:792-874`):

| `STPOS` | Meaning |
| --- | --- |
| `00h` | `STBOOT` hasn't run since cold boot |
| `01h` | A record waits in `LOADBUF` for `STLINE` |
| `80h` | Finished: the line was taken, or there was none |

Warm boot preserves `STPOS` above the RAM BIOS table while `CPMINIT`
clears the lower span from `CCPCLR` to `BDOSRME`. Reset enters `COLD`
and clears the entire workspace, returning startup progress to zero
(`src/ram.asm:292-301`, `src/boot.asm:22-65`, `src/boot.asm:398-403`).
[Chapter 15](15-state-and-memory.md#the-workspace-across-a-program-exit)
compares these spans. Bytes after `CHPOS` up to console state are unused
(`src/ram.asm:412-416`).

Diagnostic retry still permits that first attempt. It resumes at
`COLDRT` after the cold clear and before CCP entry. `STPOS` is zero,
so mounting successfully allows ordinary startup to begin
(`src/boot.asm:92-115`).

## The first read and the bypass

`CCPENT` calls `STBOOT` after disk reset and user restoration but before
selecting the entry drive (`src/cpm/ccp.asm:39-88`). Cold boot initialises
page zero for A and user 0. Warm boot passes that byte onward, so the
initial startup open uses user 0 (`src/boot.asm:114-115`,
`src/boot.asm:149-152`). Subsequent `STBOOT` calls return immediately
because `STPOS` is nonzero (`src/cpm/ccpcmd.asm:760-764`).

The finished mark is written before the risky operation. Setting bit 7
makes `STPOS = 80h` before open or read (`src/cpm/ccpcmd.asm:765`). If a
BDOS error then warm-boots, the next entry skips the attempt instead of
repeating it. The source test injects failure at the startup block and
asserts `Bad Sector`, an available prompt and no stored-command execution
(`test/startup.test.mjs:235-258`).

The keypad bypass uses that same finished state. Before opening,
`STBOOT` samples port `03h` once and returns when bit 6 is low for a
pressed hex-keypad key (`src/layout.asm:14`, `src/cpm/ccpcmd.asm:767-769`).
`STPOS` remains `80h`, no line runs and no shell is installed. Holding a
key through reset covers the sample.

In the host model, the web-page board with the starter card reaches it
5,821,320 T-states after reset, about 1.46 seconds. This timing is not a
physical-board deadline. Held-key recovery is exercised by hanging-INIT
and repeated-cold-boot tests (`test/startup.test.mjs:57-69`,
`test/startup.test.mjs:260-273`, `test/startup.test.mjs:320-324`).

Without bypass, the ROM constructs an explicit A reference. It copies
twelve bytes from `STFCB` to `CMDFCB`: drive 1 and `STARTUP CMD`.
Cold boot has zeroed the remaining FCB (`src/tables.asm:139`,
`src/cpm/ccpcmd.asm:770-773`, `src/ram.asm:148-149`). Recognised reset has
already called `RESEL`, so A means its retained volume assignment. It
need not be the card's original SYSTEM volume (`src/boot.asm:101-104`,
`src/volsvc.asm:1-22`). Chapter 8 demonstrates this with SPARE.

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

ROM processing ends with that record. It neither reads another nor
closes the file. `STLINE` extracts its command from the available 128 bytes.

## Taking the line

The command is taken at the ordinary input boundary. Without a shell,
`MLDRV` prints the prompt and first checks function 47 input. `STLINE`
then precedes keyboard input, returning carry clear for a line or set
for none. Keyboard function 10 runs with `HFLAG` clear, so startup adds
no history (`src/cpm/ccp.asm:138-158`). If the line installs the shell,
that hook supplies later prompts and bypasses `STLINE` until reset.

Extraction consumes the pending state before scanning. `STLINE` requires
`STPOS = 1` and writes `80h` before reading. It starts `HL` at `LOADBUF`,
`DE` at `CMDTXT`, `B` at 127 available characters and `C` at 128 record
bytes (`src/cpm/ccpcmd.asm:805-814`). A second call cannot extract the
same record again.

The scan accepts at most the first 127 characters of a line. Zero,
`^Z` or record end terminates text and CR or LF ends the current line.
Further characters after capacity are scanned but discarded until that
line ends (`src/cpm/ccpcmd.asm:819-840`). A line crossing the record
boundary executes in its shortened form.

At CR or LF, `STLCR` skips empty input, including the LF after CR.
A first-byte `;` marks a comment. `STLCR` resets `DE` to `CMDTXT` and
`B` to 127 before scanning the next line (`src/cpm/ccpcmd.asm:842-851`). A leading blank prevents
comment recognition because `;` then occupies a later position. At the text's end `STLE`
returns carry for a last line that is a comment or for no line at all
(`src/cpm/ccpcmd.asm:853-861`). The tests cover execution of the first command only and skipping empty
or comment input without echo. They also cover the 127-character cut
and record-end termination
(`test/startup.test.mjs:291-318`).

## The echo and the command buffer

The echo has a different terminator from command execution. For a
nonempty line, `STLINE` stores `CMDLEN`, appends CR and `$` and calls
function 9 through `PUTSTR` (`src/cpm/ccpcmd.asm:862-874`). An existing
`$` truncates the echo while the buffer still holds the complete original
case. `NOTDRIVE` prints `CRLFMSG` before dispatch so output begins on a
new row even when echo stopped early (`src/cpm/ccp.asm:339-342`).

This fixture uses a dollar character in the filename to expose the
separate echo and execution boundaries. With no shell, its startup line
types `NOTE$.TXT`:

```sh
printf 'It ran whole.\n' > 'NOTE$.TXT'
printf 'TYPE NOTE$.TXT\n' > startup.cmd
cp dist/starter.img dollar.img
node tools/tecvol.mjs put dollar.img A startup.cmd --text
node tools/tecvol.mjs put dollar.img A 'NOTE$.TXT' --text
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card dollar.img. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>TYPE NOTE
It ran whole.

A>
```

Installing the shell first changes only the echo mechanism in this
comparison. Its zero-ended `PUTZ` prints the complete second line:

```sh
printf 'SHELL.SVC\nTYPE NOTE$.TXT\n' > startup.cmd
cp dollar.img dollar2.img
node tools/tecvol.mjs put dollar2.img A startup.cmd --text
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card dollar2.img. Complete captured console transcript. -->
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

At the maximum length, appended CR occupies the final byte of 128-byte
`CMDTXT`. The following `$` reaches the low byte of `APIRTPC`, a reserved
two-byte slot immediately after the buffer. `BOOTDRV` follows that slot
and remains untouched (`src/ram.asm:156-166`, `src/cpm/ccpcmd.asm:864-870`).
This recovery-only firmware does not use `APIRTPC`, so the terminator
occupies unused scratch. The source comment still describes the previous
layout's `BOOTDRV`; it needs correction before housekeeping uses the slot.

Execution normalises the retained command after echo. `MLGOT` replaces
appended CR with zero and `MLTAKE` uppercases text in place
(`src/cpm/ccp.asm:184-223`). The source test compares file and typed paths
from `MLGOT` through the next `MLREAD`, including BDOS calls. Output
comparison normalises letter case (`test/startup.test.mjs:186-233`).

## The rest of the file in the shell

Continued startup requires transferring the read position to resident
memory. The first `SHELL.SVC` installs and enters the shell with
`A = FFh`, the startup origin. It claims the hook and sets `STSKIP`
(`drivers/shell.asm:128-144`). At the next prompt, `LINE` has no pending
piece and calls `STOPEN` (`drivers/shell.asm:243-249`).

`STOPEN` reopens the file using cleared `SFCB` plus drive 1 and
`STARTUP CMD` from `STNAME`. An absent file leaves no script open.
Otherwise `SORG` becomes `FFh` and `SLINE` skips the line already run by
ROM. If no later line exists, the script closes immediately
(`drivers/shellio.asm:14-36`, `drivers/shellio.asm:43-63`).

The shell reader can span records. `SLINE` obtains bytes from `SGET`
into `LTXT`, ending on CR, LF or CR LF and retaining the first 127
characters. Empty lines and lines beginning with `;` are skipped
(`drivers/shellio.asm:64-114`). `SGET` uses function 33 to read by record
number into `0080h`, beginning at record zero. Each new line rereads its
record because a program may have reused DMA memory. Zero, `^Z` or
reading past the final record ends the script (`drivers/shellio.asm:117-171`).
The read-only script is never closed.

`NEXT` echoes each line after the prompt and executes its pieces through
the ordinary command path. Startup origin remains attached, preserving
the absent-device and unavailable-PICO-width exceptions
(`drivers/shell.asm:243-274`). Script FCB, record number and offset stay
in shell pages. A program's warm boot leaves them intact for the next
`LINE` call.

Re-entering the installed shell leaves this position intact. A later
`SHELL.SVC` takes back its existing hook without restarting the file
(`drivers/shell.asm:128-136`, `docs/shell.md:136-140`). Typing
`STARTUP.CMD` instead runs the complete file as a typed script with typed
origin (`docs/shell.md:139-140`).

## Startup origin and quiet results

Quiet device handling depends on line origin. Without a shell, carry
from `STLINE` becomes `STFLAG` through `CCF` and `SBC A,A`: `FFh` for
startup and zero for keyboard input. With a shell, `SHLINE` stores the
origin returned by `LINE`. Every startup piece has `FFh`. Other input
has zero (`src/cpm/ccp.asm:110-124`, `src/cpm/ccp.asm:141-158`,
`drivers/shell.asm:527-540`). `STFLAG` occupies `BF64h`.

There are three readers of this mark: the failed-service path, `DRVR`
registration and the PICO width command when `FIND` returns no console
(`src/cpm/ccp.asm:396-409`, `src/services.asm:540-556`,
`src/cpm/ccpcmd.asm:134-150`). `SVCLOAD` stores `INIT`'s returned `A`
in `SVCRA`, beside the result code `SVCRC`. Record rejection after a
successful `INIT` clears `SVCRA` so the later check cannot accept that
result as an `INIT` device-absence status (`src/loader.asm:365-370`, `426-430`,
`src/ram.asm:396-397`).

The failed-service path reads the two result bytes as a word, `SVCRC`
in `L` and `SVCRA` in `H`. `AND H` keeps the status only for startup.
`XOR TNENODV` gives zero only for status 2. `DEC L` and `OR L` keep
zero only for `SVCRC` 1, a failed installation with nothing left
resident. Only that combined result reaches `SVCOK` without a message.
Other failures returned to this check reach `BADCMD` and print the name with `?`
(`src/cpm/ccp.asm:396-412`, `536-568`, `src/loader.asm:436-480`).

An absent graphics controller and startup registration blocked by active
PICO both return `TNENODV`, permitting quiet handling. Failure before
INIT leaves `SVCRC` zero and prints the command with `?`. A default-mode
BDOS disk error has its own path: it prints the disk message, waits for
a key and warm-boots through `CHDROP`, dropping the chain. It never
returns to the command-name error path (`src/cpm/bdoscon.asm:23-64`,
`src/cpm/bdos.asm:96-106`).

A controller that answers while the Matrix switch disables the matrix
keyboard fails with `TNEBAD`. That failure still prints the name from
startup. Typed on a board without the graphics controller, `GLCD.SVC`
prints `GLCD.SVC?`. Typed with both displays and the matrix keyboard
enabled it can install while leaving the PICO9918 selected
(`src/loader.asm:901-922`, `drivers/glcd.asm:60-73`,
`src/services.asm:532-564`).

PICO width selection has a parallel startup exception. It first uses
FIND to locate the ROM console. If absent, a startup `CON PICO` or
`CON CRT` width line silently reaches `STARTED`. Typed input instead
reaches `BADCMD` and prints the width followed by `?`
(`src/cpm/ccpcmd.asm:134-168`).

Quiet completion also determines conditional continuation. `MLTAKE`
sets `PRGCODE` to zero before execution. Quiet device and unavailable-width
paths leave it unchanged. `BADCMD` reaches `ERRGO` and stores `FF00h`,
`RCFAIL` (`src/cpm/ccp.asm:220-223`, `src/cpm/ccp.asm:536-568`). The
shell tests that result before the next piece (`drivers/shell.asm:200-226`).
On a board without graphics LCD, startup `GLCD.SVC &CD` can run CD.
The same typed line prints `GLCD.SVC?` and skips CD.

## Display loading and console selection

Display startup combines ROM detection with optional service loading.
PICO9918 starts from ROM when its probe succeeds and the Matrix switch
enables the keyboard, requiring no service line (`src/console.asm:42-45`,
`src/video.asm:18-24`, `src/pico.asm:53-68`). The supplied service line
loads `GLCD.SVC`. The CCP sends exact type SVC to `SVCGO`. Other suffixes
use COM search (`src/cpm/ccp.asm:385-422`).
[Chapter 21](21-from-prompt-to-program.md) explains lookup.

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

On a board with both displays and matrix keyboard enabled, startup and
typed installation therefore differ. Startup rejects GLCD registration
while CRT is selected. Typed `GLCD.SVC` can install without replacing the
PICO9918 console, allowing later `CON UC1`. Without a selected PICO9918,
an answering controller and enabled matrix keyboard permit startup to
select graphics LCD. Web-page card preparation writes the startup line
for the selected display (`host/card.mjs:109-146`, `host/card.mjs:199-220`),
as [Appendix I](appendix-i-web-page.md) explains.

## Recovery words and row ownership

Recovery output uses a small part of the status LCD. `CARD?` and
`GLCD?` occupy row 3 on its 20 × 4 display. `LCD3` selects row 3 through
`LCDROW`, which writes to zero then returns carry set. Failure paths can
therefore jump to it as their exit (`src/lcd.asm:66-102`). Each word
has five characters. `PICCLR` contains five blanks followed by zero
(`src/text.asm:16`, `98-100`).

`GLCLD`, used by `CON UC1`, tests `CDGLC` and returns immediately if the
driver is already installed. A failed `SVCGO` instead restores the mode
from `CONMOD` into the console field with `CONFLD` and writes `GLCD?`
through `LCDWRD` (`src/loader.asm:873-887`, `src/console.asm:500-510`).
`LCDWRD` first sets `CDWRD`, bit 7 of `CONDEV`
(`src/lcd.asm:56-60`, `src/layout.asm:76`). `CONDEV` is
at `BFE7h`. Its stored bits are
(`src/ram.asm:424`, `src/layout.asm:71-76`):

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
(`src/services.asm:74-80`, `src/layout.asm:75`).

Application output can replace this row before another console selection.
`WRDCLR` writes five blanks only when `CDWRD` is set, clearing the bit
first. `CONSET` and successful typed GLCD installation that retains PICO
call it (`src/loader.asm:915-943`). Service LCD clears the mark when
writing row 3 without first blanking the row (`src/services.asm:130-157`).
Later selection then preserves application text. Direct port writes do
not clear the mark. If it stays set, selection overwrites the row's first
five characters.

`DIAG` writes `CARD?` directly through `LCD3` without setting `CDWRD`.
No console selection occurs at its retry prompt. `R` returns to
`COLDRT`, where `LCDINIT` clears the whole display. Another mount
failure writes `CARD?` again (`src/boot.asm:92-101`, `632-652`).
Cold boot initialises `CONDEV` to zero before reading `CDMTX` from the
Matrix switch so no reset starts with a retained recovery-word flag
(`src/console.asm:32-45`).
