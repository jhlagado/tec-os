---
title: The history ring
parent: TEC-OS
nav_order: 23
nav_group: "Inside TEC-OS"
---

# 23. The history ring

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

You can recall whole command lines even after newer input has overwritten
older history. The shell, `SHELL.SVC`, keeps those lines in a 256-byte ring
in its own pages. When an insertion cuts through an old line, the remaining
fragment is cleared before recall can reach it
(`drivers/shellio.asm:577-639`). The ROM's line input, BDOS function 10,
offers the keys and calls the shell to store and fetch lines. Without the
shell there is no ring and `^W` and `^N` recall nothing.

## A page of whole lines

The ring is the last page of the shell's memory. `RING` is the first page
boundary above the shell's own stack, and the shell's extra RAM ends 256
bytes later (`drivers/shell.asm:789-796`). Each entry contains a line's
characters followed by a zero byte. `HHEAD` is the offset where the next
entry will start, and `HPOS` the offset of the terminator of the line being
shown. Both are bytes among the shell's variables, below the ring
(`drivers/shell.asm:710-731`). After an insertion `HHEAD` points immediately
past the newest entry's zero (`drivers/shellio.asm:619-628`).

The high byte of a ring address is `HIGH(RING)` throughout. Only the low
byte changes as a routine steps along the page. `INC L` advances from offset
`FFh` to `00h` so a line can continue across the end of the page without a
separate wrap test (`drivers/shellio.asm:583-584`,
`drivers/shellio.asm:619-624`). A line's position in this order is
independent of whether its address is above or below another line's
address.

The byte at `HHEAD` is also zero. Together with the newest line's terminator
at `HHEAD − 1`, it forms an empty entry between the newest and oldest lines.
A backwards scan stops at that empty entry instead of continuing around the
page into the newest line again (`drivers/shellio.asm:521-528`,
`drivers/shellio.asm:568-575`). The ring therefore needs a zero beyond the
bytes occupied by its entries.

A line costs its character count plus a terminator. `DIR` occupies four
bytes. The shell reads a typed line with a capacity of 127 characters, so a
longest line occupies 128 bytes of the ring (`drivers/shell.asm:276-282`).
Long commands displace more history than short ones. There is no fixed
count of stored lines.

The ring is in the shell's pages below the TPA's ceiling, in fixed memory or
EXPAND 0, so the routines read and write its bytes directly with no bank
switch.

## Lines from the prompt

A program and the shell both call BDOS function 10 to read a line. The ROM
marks the shell's call. `SHLINE` sets `HFLAG` to `FFh` before it calls the
shell's `LINE` entry and clears it after `LINE` returns
(`src/cpm/ccp.asm:251-282`, `src/ram.asm:229`). `LINE` reads a typed line
with function 10 only when no piece, startup line or script line is waiting
(`drivers/shell.asm:236-282`). That call is the only one that can see the
flag set.

Function 10 completes a line at Return, at a line feed or when the buffer
fills (`src/cpm/bdos.asm:416-464`). At `LINDONE` it writes the character
count into the caller's buffer, reads `HFLAG` and clears it. It calls the
shell's `HSTORE`, the fourth word of the shell's table, only for a marked
line containing at least one character (`src/cpm/bdos.asm:645-665`). A
program's later input therefore has history disabled. An empty line adds no
entry.

An abandoned line at the prompt follows a different exit. `^C` at the start
of function 10 jumps through `CHDROP` to warm boot before `LINDONE` runs
(`src/cpm/bdos.asm:521-533`, `src/cpm/bdos.asm:96-106`). Warm boot clears
`HFLAG` with the BDOS workspace, so that abandoned read cannot enable
history in a later program (`src/boot.asm:398-403`, `src/ram.asm:158-288`).

A typed line of several pieces is stored as the whole line, including its
`!` and `&`. Its pieces add no entries because the shell takes them from
its own copy of the line. A line supplied through function 47, a script
line and a startup line also bypass the marked function-10 call
(`drivers/shell.asm:176-234`, `drivers/shell.asm:243-274`). History is empty
after the shell installs, since its `INIT` clears its variables and the ring
(`drivers/shell.asm:72-87`), until you complete a nonempty prompt line that
passes `HSTORE`'s checks.

The stored bytes keep the case you typed. `HSTORE` runs before function 10
returns to the shell, which only afterwards converts a piece's letters to
capitals (`src/cpm/bdos.asm:654-661`, `drivers/shell.asm:426-429`, `drivers/shell.asm:498-518`). In this
PICO9918 screen capture, recalling `con` preserves the small letters:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen con $'@start \x17'. The full screen, with trailing empty rows omitted. -->
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

A zero inside a line would end recall before the rest of its characters.
`HSTORE` checks every incoming character as it compares the line and
leaves the ring unchanged if it meets a zero (`drivers/shellio.asm:593-596`,
`drivers/shellio.asm:641-644`). That check occurs before any new bytes are
written so a rejected line cannot leave a partial entry.

Consecutive duplicates also consume no new space. `HSTORE` first locates
the newest entry from its terminator at `HHEAD − 1`. It calls `HSTART`,
which scans backwards until the preceding byte is zero. On return `L`
points to the entry's first byte (`drivers/shellio.asm:583-588`,
`drivers/shellio.asm:568-575`). This scan also handles an empty entry by
returning its original offset.

The comparison reads the newest entry alongside the incoming line. `C`
counts differing bytes. A duplicate requires both a zero difference count
and equal lengths, checked by comparing the final offset with `HHEAD − 1`
(`drivers/shellio.asm:591-613`). Repeating the newest command therefore
leaves its existing entry in place. In this capture `CON` was typed twice
before `DIR *.CMD`. Three `^W` presses reached `CON` and then stopped because
there were only two entries:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen CON CON 'DIR *.CMD' $'@start \x17\x17\x17'. The full screen, with trailing empty rows omitted. -->
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

STARTUP .CMD     128
1 file, 128 bytes
935936 free on A:SYSTEM
A:SYSTEM>CON
CON: CRT:
A:SYSTEM>
```

For an accepted line, `HSTORE` writes each character from `HHEAD` forwards.
It adds the zero terminator and advances `HHEAD` to the next byte
(`drivers/shellio.asm:614-628`). That byte may still contain part of an
older line. Returning at this point would permit recall of a suffix whose
first characters had already been overwritten.

`HSCLR` removes that suffix. It reads the byte at the new `HHEAD`, writes
zero over it and advances. The loop continues until it has also cleared a
byte that was already zero (`drivers/shellio.asm:630-639`). When an insertion
partly overwrote an old entry, that existing zero was its terminator. The
whole remainder of the entry is erased. When the new `HHEAD` already held
zero, the loop clears that byte and ends immediately.

After cleanup, the newest terminator at `HHEAD − 1` and the zero at
`HHEAD` separate the surviving whole entries. The backwards test can stop
before wrapping into newer text.

## The ROM's side

History storage is the shell's, and the ROM calls it through the shell's
table of four words: `LINE`, `PAGE`, `HREC` and `HSTORE`
(`drivers/shell.asm:61-64`, `docs/shell.md:283-315`). `SHENT` reads a word of
that table from the address the ROM keeps for the hook
(`src/cpm/ccp.asm:284-294`). There is no history entry in the numbered-
service table.

`HREC` and `HSTORE` run on the BDOS's stack, inside function 10, and neither
may call the BDOS. The shell declares 6 bytes of the BDOS's stack for them
(`docs/shell.md:309-310`, `drivers/shell.asm:32-43`).

## Recall in the line buffer

Function 10 compares input with the codes 23 and 14 for `^W` and `^N`
(`src/cpm/bdos.asm:47-48`, `src/cpm/bdos.asm:440-443`). Its `LINHIST`
branch tests `HFLAG`. At the shell's prompt the flag is set and the branch
calls the shell's `HREC`, the third word of its table, with the key in `C`.
In a program's ordinary function-10 call the codes enter the buffer as
characters, as in CP/M 2.2 (`src/cpm/bdos.asm:473-490`).

`HPOS` is the offset of the terminator of the entry currently shown. The
shell's `LINE` sets it to `HHEAD`, the empty entry, at each call
(`drivers/shell.asm:168-169`). You can move backwards from there through
older entries with `^W` and then forwards with `^N`. Moving forwards past
the newest entry selects the empty entry again.

For `^W`, `HREC` calls `HSTART` on the shown entry's terminator. It then
steps back to the previous entry's terminator and one byte further to test
its last character. A zero there means the previous entry is empty, so
`HREC` returns carry and the current line is unchanged
(`drivers/shellio.asm:514-529`). At the oldest line, another `^W` leaves the
buffer and its edited text as they are.

For `^N`, `HREC` first compares `HPOS` with `HHEAD`. Equality means there is
no newer entry to show, so it returns carry. Otherwise it advances through
the ring to the next zero, which terminates the next entry
(`drivers/shellio.asm:531-541`). The zero at `HHEAD` follows the newest
terminator. Selecting it gives an empty line.

`HRSHOW` stores the new `HPOS`, calls `HSTART` to find the entry's beginning
and copies the entry, zero-ended, into the shell's line text, `LTXT`, and
returns its address in HL (`drivers/shellio.asm:543-563`). `LTXT` is the
buffer that function 10 is filling for the shell. Back in the ROM, `LINHR`
calls `LINERASE`, which backs up `LINPTR` and reduces `LINCNT` to zero,
erasing each character with backspace, space and backspace through the BIOS
(`src/cpm/bdos.asm:670-673`, `src/cpm/bdos.asm:612-631`,
`src/cpm/bdoscon.asm:353-360`). The same routine implements `^X`
(`src/cpm/bdos.asm:599-601`). `LINHC` then copies the shell's line into the
buffer in place, advancing `LINPTR`, incrementing `LINCNT` and echoing each
character, until its zero or the buffer's maximum
(`src/cpm/bdos.asm:679-698`). Function 10 then resumes its input loop. You
can edit the recalled text with backspace and the other line-input keys
before pressing Return.

Here two commands were typed before `^W`, `^W` and Return selected `CON`:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen CON 'TYPE STARTUP.CMD' $'@start \x17\x17'. The full screen, with trailing empty rows omitted. -->
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

The capture records the PICO9918 screen after erasure so it shows the
replacement line. Serial output would also contain the backspace and space
bytes used to erase the previous input. In the capture recipe, `@start`
sends its keys and Return together (`tools/capture.mjs:102-106`). The shell
notation `$'\x17'` supplies `^W`.

## Warm boot, reset and UNLOAD

An ordinary program exit keeps the ring and `HHEAD`. Warm boot runs
`CPMINIT`, whose clear starts at `CCPCLR` and ends before `BDOSRME`, in the
ROM's workspace (`src/boot.asm:398-403`, `src/ram.asm:158-288`). The shell's
pages are a resident service's and lie outside that clear. `HFLAG` is
inside it, and the next `LINE` call sets `HPOS` from the retained `HHEAD`.

A program's exit, BDOS function 0 and `^C` at an empty prompt all reach
warm boot (`src/cpm/bdos.asm:216-221`, `src/cpm/bdos.asm:521-533`). In this
capture `^C` was followed by `^W`, which recalled `CON`:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs CON '^C' $'@start \x17'. Boot rows included in this complete serial transcript. -->
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

A reset enters cold boot, which forgets every service, the shell among them.
The startup file's `SHELL.SVC` line installs a new copy, whose `INIT` clears
its variables and its ring (`drivers/shell.asm:72-87`). Both the ring byte at
offset `00h` and its predecessor at `FFh` are then zero, the same empty-entry
boundary that insertion preserves. A recognised reset retains only the drive
selection, so the history goes too. In this run `^W` and Return after the
reset produced an empty line:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs CON @reset $'@start \x17'. Boot rows included in this complete serial transcript. -->
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

`HREC` started from the empty entry at `HHEAD`. Its backwards test found
zero before any stored line, so it returned carry without replacing the
empty buffer. The Return then completed an empty line, and the shell gave
another prompt (`drivers/shell.asm:296-299`, `drivers/shell.asm:520-540`).

`UNLOAD` with the shell as the newest service removes it, and its pages and
ring with it. The ROM's prompt then returns, and `^W` and `^N` enter the
line as characters, since nothing sets `HFLAG` (`docs/shell.md:263-267`).
