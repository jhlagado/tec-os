---
title: The history ring
parent: TEC-OS
nav_order: 23
nav_group: "Inside TEC-OS"
---

# 23. The history ring

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

Command recall remains useful only if an old entry is complete. The
shell, `SHELL.SVC`, has 256 bytes for history, so new lines eventually
replace old text. If insertion cuts through an entry, the shell clears its
remaining fragment before recall can reach it (`b95b2a9:drivers/shellio.asm:577-639`).
BDOS function 10 supplies the editing keys and calls shell storage and
recall hooks. Without the shell there is no ring to recall through `^W`
or `^N`.

## A page of whole lines

History occupies the shell's last memory page. `RING` is the first page
boundary above its stack and extra RAM ends 256 bytes later
(`b95b2a9:drivers/shell.asm:789-796`). Each entry contains characters followed by
zero. Byte offsets `HHEAD` and `HPOS` sit below the ring: the former marks
the next insertion and the latter the displayed entry's terminator
(`b95b2a9:drivers/shell.asm:710-731`). Insertion advances `HHEAD` immediately past
the newest zero (`b95b2a9:drivers/shellio.asm:619-628`).

Wrapping uses the Z80 address low byte. The high byte stays `HIGH(RING)`
while `INC L` carries offset `FFh` back to `00h` within the page
(`b95b2a9:drivers/shellio.asm:583-584`, `b95b2a9:drivers/shellio.asm:619-624`). An entry
can cross that boundary without a separate wrap test. Numeric address order
therefore does not determine which command is older.

A zero at `HHEAD` bounds the surviving history. Alongside the newest
terminator at `HHEAD − 1`, it forms an empty entry between newest and oldest.
Backward recall stops there instead of circling into recent text again
(`b95b2a9:drivers/shellio.asm:521-528`, `b95b2a9:drivers/shellio.asm:568-575`). The ring
must reserve this extra zero beyond its occupied entries.

Capacity is measured in bytes rather than command count. `DIR` needs four
bytes including its terminator. The maximum typed line of 127 characters
needs 128 (`b95b2a9:drivers/shell.asm:276-282`). A long command therefore displaces
more history than a short command.

The resident shell lies outside the TPA, in fixed memory or EXPAND
0. Its history routines access ring bytes directly without bank switching.

## Lines from the prompt

Only prompt input should enter command history. Applications also use
function 10, so `SHLINE` marks the shell's call with `HFLAG = FFh` and
clears it after `LINE` returns (`b95b2a9:src/cpm/ccp.asm:297-328`, `b95b2a9:src/ram.asm:235`).
`LINE` reads typed input only after pending pieces, startup and script
input are exhausted (`b95b2a9:drivers/shell.asm:236-282`). That prompt read is
the only function-10 call with the flag set.

Return, LF or a full buffer completes function 10
(`b95b2a9:src/cpm/bdos.asm:418-466`). `LINDONE` writes the count to the caller's
buffer, reads `HFLAG` then clears it. A marked nonempty line invokes the
fourth hook word, `HSTORE` (`b95b2a9:src/cpm/bdos.asm:647-667`). Empty input stores
nothing and later application input has history disabled.

Abandoning an empty prompt with `^C` bypasses that completion path.
Function 10 reaches `CHDROP` and warm boot before `LINDONE`
(`b95b2a9:src/cpm/bdos.asm:523-535`, `b95b2a9:src/cpm/bdos.asm:96-106`). The warm clear
removes `HFLAG`, preventing the abandoned read from enabling history in
a later program (`b95b2a9:src/boot.asm:402-407`, `b95b2a9:src/ram.asm:164-294`).

A typed chain is stored whole, including `!` and `&`. Taking its pieces
from shell memory causes no additional history writes. Function 47,
script and startup input also bypass the marked read
(`b95b2a9:drivers/shell.asm:176-234`, `b95b2a9:drivers/shell.asm:243-274`). Installation
starts with empty history because `INIT` clears variables and ring
(`b95b2a9:drivers/shell.asm:72-87`). The first accepted nonempty prompt line
creates the first entry.

History also preserves the typed case. `HSTORE` runs before function 10
returns. The shell folds command pieces afterwards (`57a8c38:src/cpm/bdos.asm:654-661`,
`57a8c38:drivers/shell.asm:426-429`, `57a8c38:drivers/shell.asm:498-518`). Recalling `con`
in this PICO9918 capture therefore retains lowercase text:

<!-- TEC-OS 57a8c38: node tools/capture.mjs --board pico --screen con $'@start \x17'. Full screen; trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>con
CON: CRT:
A:SYSTEM>con
CON: CRT:
A:SYSTEM>
```

## Insertion and the oldest line

Before insertion, `HSTORE` validates the complete incoming text. An
embedded zero would truncate recall, so finding one leaves the ring
unchanged (`b95b2a9:drivers/shellio.asm:593-596`, `b95b2a9:drivers/shellio.asm:641-644`).
Validation finishes before any new entry bytes are written.

The same pass avoids storing consecutive duplicates. `HSTORE` starts
at the newest terminator, `HHEAD − 1`, and calls `HSTART`. A backward
scan stops when the preceding byte is zero, returning the first character
in `L` (`b95b2a9:drivers/shellio.asm:583-588`, `b95b2a9:drivers/shellio.asm:568-575`). For
an empty entry it returns the original offset.

The incoming bytes are compared with this newest entry. `C` counts
differences. A duplicate requires `C = 0` and a final offset equal to
`HHEAD − 1`, establishing equal contents and length (`57a8c38:drivers/shellio.asm:591-613`). A duplicate
keeps the existing entry. After two CON commands and `DIR *.CMD`, three
`^W` presses therefore reach CON then stop: only two entries exist.

<!-- TEC-OS with the sized DIR (ROM c9586263, starter card 1cdc614e): node tools/capture.mjs --board pico --screen CON CON 'DIR *.CMD' $'@start \x17\x17\x17'. Full screen; trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON
CON: CRT:
A:SYSTEM>CON
CON: CRT:
A:SYSTEM>DIR *.CMD

STARTUP.CMD      128
1 file, 128 bytes
909312 free on A:SYSTEM
A:SYSTEM>CON
CON: CRT:
A:SYSTEM>
```

Accepted text is written forward from `HHEAD`, followed by zero. The
head advances beyond that terminator (`b95b2a9:drivers/shellio.asm:614-628`).
The new head can now lie inside an older entry. Recall would expose a
suffix of that command unless insertion also removes its remainder.

`HSCLR` removes the remainder by zeroing bytes from the new head until
it has cleared a byte that was already zero (`b95b2a9:drivers/shellio.asm:630-639`).
For a partly overwritten entry, that final zero is its terminator. If the
head already points to zero, cleanup ends after that byte.

Cleanup leaves both `HHEAD − 1` and `HHEAD` zero. These adjacent zeros
separate the surviving whole entries and stop backward scanning before
it wraps into newer text.

## The ROM's side

The ROM reaches history through the shell table rather than numbered
ROM services. Its four words are `LINE`, `PAGE`, `HREC` and `HSTORE`
(`b95b2a9:drivers/shell.asm:61-64`, `b95b2a9:docs/shell.md:290-322`). `SHENT` reads an
entry from the registered hook address (`b95b2a9:src/cpm/ccp.asm:330-340`).

History hooks run inside function 10 on the BDOS stack. `HREC` and
`HSTORE` must therefore avoid BDOS calls. The shell declares six bytes of
BDOS stack use for them (`b95b2a9:docs/shell.md:316-317`, `b95b2a9:drivers/shell.asm:32-43`).

## Recall in the line buffer

Function 10 recognises codes 23 and 14 as `^W` and `^N`
(`b95b2a9:src/cpm/bdos.asm:47-48`, `b95b2a9:src/cpm/bdos.asm:442-445`). `LINHIST` tests
the prompt mark. With `HFLAG` set it calls third hook word `HREC` with
the key in `C`. In ordinary program input those codes become characters
in the line buffer, matching CP/M 2.2 (`b95b2a9:src/cpm/bdos.asm:475-492`).

Recall starts after the newest entry. Each `LINE` sets `HPOS` to
`HHEAD`, the empty entry (`b95b2a9:drivers/shell.asm:168-169`). `^W` walks towards
older entries and `^N` towards newer ones. Moving beyond the newest
selects empty input again.

Backward movement first calls `HSTART` on the displayed terminator.
`HREC` then steps to the previous terminator and tests the character
before it. Zero indicates the empty boundary and returns carry without
changing the current buffer (`b95b2a9:drivers/shellio.asm:514-529`). Another
`^W` at the oldest line therefore preserves any edits to that line.

Forward movement first compares `HPOS` with `HHEAD`. Equality returns
carry because recall is already at the empty entry. Otherwise `HREC`
scans forward to the next zero (`b95b2a9:drivers/shellio.asm:531-541`). The zero
at `HHEAD` follows the newest terminator, providing the empty line after
newest history.

Successful movement replaces editable input. `HRSHOW` stores `HPOS`,
finds the entry start with `HSTART` and copies zero-ended text to `LTXT`,
returning its address in HL (`b95b2a9:drivers/shellio.asm:543-563`). This is the
shell buffer currently being filled by function 10.

ROM `LINHR` calls `LINERASE` to retreat `LINPTR` and reduce `LINCNT` to
zero. Each character is erased through BIOS with backspace, space and
backspace (`b95b2a9:src/cpm/bdos.asm:672-675`, `b95b2a9:src/cpm/bdos.asm:614-633`,
`b95b2a9:src/cpm/bdoscon.asm:354-361`). `^X` uses the same erase routine
(`b95b2a9:src/cpm/bdos.asm:601-603`). `LINHC` then copies and echoes the recalled
text, advancing pointer and count until zero or capacity
(`b95b2a9:src/cpm/bdos.asm:681-700`). Normal editing resumes before Return.

After two typed commands, two `^W` presses and Return select CON in this
capture:

<!-- TEC-OS 57a8c38: node tools/capture.mjs --board pico --screen CON 'TYPE STARTUP.CMD' $'@start \x17\x17'. Full screen; trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON
CON: CRT:
A:SYSTEM>TYPE STARTUP.CMD
SHELL.SVC
GLCD.SVC

A:SYSTEM>CON
CON: CRT:
A:SYSTEM>
```

The PICO9918 screen shows the final replacement after erasure. Serial
output would also contain the backspace and space bytes used during
replacement. `@start` sends its keys together with Return
(`57a8c38:tools/capture.mjs:102-106`) and shell notation `$'\x17'` supplies `^W`.

## Warm boot, reset and UNLOAD

Warm boot retains the ring because it clears resident workspace rather than
service pages. `CPMINIT` clears `CCPCLR` through exclusive `BDOSRME`
(`b95b2a9:src/boot.asm:402-407`, `b95b2a9:src/ram.asm:164-294`). `HFLAG` is cleared but
ring text and `HHEAD` survive. The next `LINE` resets recall position
from that retained head.

Normal exit, function 0 and `^C` at an empty prompt all use warm boot
(`57a8c38:src/cpm/bdos.asm:216-221`, `57a8c38:src/cpm/bdos.asm:521-533`). Here, `^W` after
`^C` still recalls CON:

<!-- TEC-OS 57a8c38: node tools/capture.mjs CON '^C' $'@start \x17'. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON
CON: TTY:
A:SYSTEM>^C
A:SYSTEM>CON
CON: TTY:
A:SYSTEM>
```

Reset removes service registration, including the shell. Startup's
`SHELL.SVC` installs a new copy and `INIT` clears its variables and ring
(`57a8c38:drivers/shell.asm:72-87`). Offsets `00h` and `FFh` are both zero,
establishing the empty boundary preserved by insertion. Recognised reset
retains only drive selection, so history is still lost. In this capture,
`^W` and Return after reset produce empty input:

<!-- TEC-OS 57a8c38: node tools/capture.mjs CON @reset $'@start \x17'. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CON
CON: TTY:
A:SYSTEM>
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>
A:SYSTEM>
```

Recall begins at the empty `HHEAD` entry and finds zero before any stored
command. `HREC` returns carry without replacing the empty buffer. Return
then completes empty input and produces another prompt
(`57a8c38:drivers/shell.asm:296-299`, `57a8c38:drivers/shell.asm:520-540`).

UNLOAD also removes history when the shell is the newest service. Its
pages, including the ring, become available again. At the restored ROM
prompt nothing sets `HFLAG`, so `^W` and `^N` enter ordinary characters
(`b95b2a9:docs/shell.md:270-274`).
