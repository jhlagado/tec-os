---
title: Console paths
parent: TEC-OS
nav_order: 17
nav_group: "Inside TEC-OS"
---

# 17. Console paths

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A key can arrive while a program is printing and still be available for its
next read. TEC-OS holds that byte while the output continues. At the other
end of the path, the same output byte can become a serial bit stream or a
character in display memory. The BDOS processes editing and output controls
before the BIOS transfers bytes to the selected device
(`src/cpm/bdoscon.asm:120-158`, `src/cpm/bdoscon.asm:169-224`,
`src/cpm/bdoscon.asm:299-330`, `src/console.asm:339-393`).

## The BIOS boundary

The BIOS jump table gives the BDOS and programs fixed offsets for machine
operations. TEC-OS supplies all seventeen CP/M 2.2 entries. Each is a
three-byte jump (`src/tables.asm:15-31`):

| Offset | Entry | Routine |
| ---: | --- | --- |
| `00h` | cold boot | `COLD` |
| `03h` | warm boot | `WBOOTR` |
| `06h` | `CONST` | `BCONSTC` |
| `09h` | `CONIN` | `BCONIN` |
| `0Ch` | `CONOUT` | `BCONOUT` |
| `0Fh` | `LIST` | `BLIST` |
| `12h` | `PUNCH` | `BPUNCH` |
| `15h` | `READER` | `BREADER` |
| `18h` | `HOME` | `BHOME` |
| `1Bh` | `SELDSK` | `BSELDSK` |
| `1Eh` | `SETTRK` | `BSETTRK` |
| `21h` | `SETSEC` | `BSETSEC` |
| `24h` | `SETDMA` | `BSETDMA` |
| `27h` | `READ` | `BREAD` |
| `2Ah` | `WRITE` | `BWRITE` |
| `2Dh` | `LISTST` | `BLISTST` |
| `30h` | `SECTRAN` | `BSECTRN` |

Cold boot copies the ROM table to `BF00h`. The word at `0001h` points to its
warm-boot entry, `BF03h`, so subtracting three gives the table base. The BDOS's
`BIOCST`, `BIOCIN` and `BIOCOT` names address entries in that RAM copy
(`src/boot.asm:108-111`, `src/boot.asm:300-305`, `src/cpm/bdos.asm:20-34`). A
program can replace a jump to receive the BDOS's calls as well as direct BIOS
calls. Warm boot leaves the table in place. A hook into a program's transient
program area (TPA) must be restored before that program ends, including a
replacement warm-boot jump.

The output-time status check is an exception to the BDOS's table route.
`CONSTQ` calls the ROM's `BCONST` directly so it can poll without drawing
a cursor. Its input still passes through `GETCHAR` and the RAM `CONIN`
entry. Private ROM printing routines can also call `BCONOUT` directly.
A BIOS-table hook therefore covers the named interface, not every internal
ROM call (`src/cpm/bdoscon.asm:120-158`, `src/cpm/bdoscon.asm:299-307`,
`src/console.asm:399-420`).

## Requested and applied consoles

`CON:` is the logical console. The IOBYTE at `0003h` selects its physical
device with bits 0–1. `TTY:`, `CRT:`, `BAT:` and `UC1:` are the four
physical console names. TEC-OS maps them to these board paths
(`src/console.asm:1-9`, `src/console.asm:75-90`,
`src/layout.asm:48-49`):

| Value | Physical console | Input source | Output path |
| ---: | --- | --- | --- |
| 0 | `TTY:` | serial port | serial port |
| 1 | `CRT:` | matrix keyboard | PICO9918 |
| 2 | `BAT:` | serial port, with console filtering | direct discard |
| 3 | `UC1:` | matrix keyboard | graphics LCD |

The other IOBYTE fields are `RDR:` in bits 2–3, `PUN:` in bits 4–5 and
`LST:` in bits 6–7. TEC-OS uses only the console field for routing.
The reader, punch and list calls have fixed implementations whatever those
upper fields contain (`src/console.asm:458-489`).

A program can write the IOBYTE directly or use BDOS function 8. Function 7
reads the byte back. A write changes the request immediately while
`CONMOD` records the mode actually applied. `CONSEL` compares the two
at BIOS console status, input and output calls. A changed request enters
`CONSW` (`src/cpm/bdos.asm:350-364`, `src/console.asm:54-65`,
`src/console.asm:158-166`, `src/console.asm:224-233`,
`src/console.asm:339-340`). This is the standard IOBYTE contract used by
`STAT CON:=CRT:` too.

For either odd mode, `CONSW` reads the display table address in `PIVEC`
or `GLVEC`. A zero pointer selects serial instead. A valid table supplies
seven vectors and the columns and rows. `CONSW` copies them, resets the
scroll region and records the applied mode. Unless that console display is
claimed, it restores the display mode, homes the cursor and clears the
screen. `TTY:` and `BAT:` instead set `VWID` and `VHGT` to zero
(`src/console.asm:75-133`).

`CONMD` writes the applied mode into `CONMOD` and the low IOBYTE field,
keeping the other six bits. After a console call has acted on a request,
that field names the selected device. A missing display or keyboard thus
changes a requested video mode back to `TTY:`. `INFO` returns the applied
dimensions in `L` and `H`. Both are zero for serial because TEC-OS cannot
read the PC terminal's dimensions. A screen-layout program reads the size
again after changing consoles (`src/console.asm:496-510`,
`src/services.asm:74-80`).

The `CON` command uses this same request. Its next output call applies the
change before printing the reply (`src/cpm/ccpcmd.asm:187-214`,
`src/console.asm:54-65`). In this capture the board's 40-column PICO
console had printed the banner, drive list, startup lines, first `CON` reply
and the typed `CON TTY` line. Only the new reply and subsequent input appear
in the serial capture:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --serial CON 'CON TTY' CON. Boot rows included in this complete serial transcript. -->
```text
CON: TTY:
A:SYSTEM>CON
CON: TTY:
A:SYSTEM>
```

## Input held at two levels

The BIOS keeps one received character in `RXCHAR`, with `RXFULL` marking
it ready. These bytes are above the RAM BIOS table. Serial reception and
keyboard delivery both publish there. `CINTAKE` returns the character and
clears the flag or advances a queued arrow sequence while leaving the
flag set (`src/ram.asm:295-297`, `src/ram.asm:416-417`,
`src/console.asm:201-209`,
`src/console.asm:253-271`, `src/keyboard.asm:111-124`).

`BCONST` first applies the console request and shows any completed PICO
row move. An already buffered byte returns ready without another physical
read. Otherwise a video mode calls `KBPOLL` while a serial mode listens
for a start bit. The public `CONST` entry, `BCONSTC`, also draws the cursor
when no character is ready on a video console. The BDOS's output check uses
the cursor-free entry (`src/console.asm:141-209`,
`src/cpm/bdoscon.asm:153-158`).

`BCONIN` also takes an already buffered byte first. When it must wait on a
video console, it draws the cursor and calls `KBSTEP` repeatedly. Once
that wait delivers a key it hides the cursor before returning. Serial
input instead waits for port `03h` bit 7 to go low. Console reception
clears bit 7 and skips a resulting `NUL`. The source documents a leading
`NUL` before Debug80's first input byte as a reason for that filter
(`src/console.asm:211-245`, `src/console.asm:280-331`).

Before waiting for serial input, the ROM reads port `00h`. In Debug80 that read
starts queued host model input. On the board it reads the hex-keypad encoder and
has no effect on the serial line. This is a model input trigger, not a hardware
receive buffer (`src/console.asm:10-18`, `src/console.asm:184-204`,
`src/console.asm:280-292`).

The BDOS has another one-character reserve, `PENDCHR` and `PENDING`, in its
own workspace. `GETCHAR` returns that byte first and otherwise calls the
RAM BIOS `CONIN` entry. `CONSTAT` reports it ready before consulting the
BIOS. Function 11 goes further: a character reported ready by the BIOS is
read into the BDOS reserve and the call returns 1. It returns 0 when
neither level has input (`src/ram.asm:222-225`,
`src/cpm/bdoscon.asm:120-143`, `src/cpm/bdos.asm:707-720`).

A direct BIOS read cannot return a byte already held inside the BDOS.
A program which prints with BDOS function 2 and reads only through BIOS
`CONIN` can therefore miss input retained during output. Keeping both
input and output at the same interface level avoids that split. Neither
one-byte reserve is a general queue for input arriving while the CPU is
busy elsewhere (`src/cpm/bdoscon.asm:120-158`,
`src/cpm/bdoscon.asm:299-330`, `src/console.asm:10-14`).

## BDOS output and line input

Functions 2 and 9 print through `OUTCHAR`. Function 9 reads the string at
`DE` up to a dollar sign. `OUTCHAR` expands a tab to spaces until the
BDOS's `COLUMN` reaches a multiple of eight. Before every output character,
`CHKKEY` checks for input (`src/cpm/bdos.asm:294-297`,
`src/cpm/bdos.asm:373-385`, `src/cpm/bdoscon.asm:169-193`).

A waiting `^S` pauses output until another key. A `^C` used to resume it
jumps through `CHDROP` to warm boot and cancels a pending command chain.
Any other resume key is consumed. A `^P` outside that pause toggles
`LISTEN`, the copy-to-list flag. Other keys are placed in `PENDCHR` for
the next BDOS read (`src/cpm/bdoscon.asm:299-341`,
`src/cpm/bdos.asm:103-105`).

`ECHORAW` updates `COLUMN` before calling either output hook. A carriage
return sets it to zero, backspace reduces it toward zero and a byte from
space upwards increments it. With `LISTEN` set the character is sent
through `LIST` first, with `BC` saved across that call. It then jumps to
`CONOUT`. Either replacement BIOS routine may change `C` so column
tracking must already be complete (`src/cpm/bdoscon.asm:214-244`,
`src/cpm/bdoscon.asm:268-282`).

Function 1 obtains a character with `GETCHAR` and echoes it through
`ECHOCHAR`, including a control byte. Tabs are echoed as spaces. Function
6's input form, `E = FFh`, returns a waiting character without echo or
returns zero. Its output form sends `E` straight to BIOS `CONOUT`.
The BDOS then performs no tab expansion, key check, list copy or column
update. A video BIOS may still interpret the byte as a terminal control
(`src/cpm/bdos.asm:280-286`, `src/cpm/bdos.asm:329-347`,
`src/cpm/bdoscon.asm:252-264`, `src/console.asm:339-345`).

Function 10 takes a buffer at `DE`. Its first byte gives the maximum
character count, from 1 to 255. The returned count goes in the second byte
and the characters follow. CR or LF ends the line and is echoed rather
than stored. Filling the buffer also ends it, with a CR echo. The input
loop recognises these editing controls (`src/cpm/bdos.asm:403-464`,
`src/cpm/bdos.asm:645-662`):

| Key | Input and echo effect |
| --- | --- |
| Backspace, `08h` | Remove the last character and send backspace, space, backspace to erase it |
| Delete, `7Fh` | Remove the last character and echo that character as a printing-terminal rubout |
| `^U` | Print `#`, start a new screen line and empty the input buffer |
| `^R` | Print `#` and retype the buffered text on a new screen line |
| `^X` | Erase the displayed input and empty the buffer |
| `^E` | Start a new screen line while retaining the input buffer |
| `^P` | Toggle the list copy without storing the key |
| `^C` | Print `^C` and warm boot only while the buffer is empty, otherwise ignore the key |

The deletion paths update `LINPTR` and `LINCNT`. `ERASE1` sends its three
bytes directly through BIOS `CONOUT`, bypassing the printer echo.
`LINERASE` repeats it for `^X` and history replacement
(`src/cpm/bdos.asm:499-630`, `src/cpm/bdoscon.asm:353-360`).

This example shows `^U` discarding a partial command and `^R` retyping a
complete one before Return:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs $'TYPE X\x15DIR *.CMD' $'DIR *.CMD\x12'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>TYPE X#
DIR *.CMD

STARTUP .CMD     128
1 file, 128 bytes
935936 free on A:SYSTEM
A:SYSTEM>DIR *.CMD#
DIR *.CMD

STARTUP .CMD     128
1 file, 128 bytes
935936 free on A:SYSTEM
A:SYSTEM>
```

The history belongs to the shell, `SHELL.SVC`. The ROM's `SHLINE` sets
`HFLAG` before it calls the shell's `LINE` entry, so only the shell's own
function 10 call can see it. Only then do `^W` and `^N` replace the line
from history: with the flag set, either key calls the shell's `HREC` for
the older or newer line. In an ordinary program call they are stored as
characters. Completion consumes `HFLAG` and passes a nonempty marked line to
the shell's `HSTORE`. Abandoned empty-line `^C` instead clears the flag
through warm boot. With no shell installed nothing sets the flag.
[Chapter 23](23-the-history-ring.md) explains storage and traversal
(`src/cpm/ccp.asm:251-282`, `src/cpm/bdos.asm:473-490`,
`src/cpm/bdos.asm:645-662`, `src/boot.asm:398-403`, `docs/shell.md:301-315`).

## Serial bits and timing

The TEC-1G has no UART. The CPU sends on port `01h` bit 6 and receives
on port `03h` bit 7. Port `01h` also selects the seven-segment digits.
The serial setting is 4800 baud with eight data bits, no parity and two
stop bits. The timing counts assume the 4 MHz FAST clock
(`src/layout.asm:12-14`, `src/console.asm:10-18`,
`tools/build.mjs:26-27`).

`TXBYTE` saves the interrupt state and disables maskable interrupts for
the byte. Nine passes send a start bit followed by eight data bits, least
significant first. `SBC A,A` turns carry into `00h` or `FFh` then
`AND 40h` selects the output level. Each pass writes the port, delays
and shifts the next bit into carry. A pass costs `49 + 16 × TXDLY`
T-states. The stop bits hold the line high for `TXSTOP` delay passes.
The saved interrupt state is restored after them (`src/console.asm:363-393`).

`RXBITS` begins after a poll detects the low start bit. It also saves
and masks interrupts then waits `RXHALF` delay passes before sampling
the first data bit. Eight samples enter `C` through carry. A sampling
pass costs `38 + 16 × RXDLY` T-states. The routine restores the saved
interrupt state before returning the byte (`src/console.asm:306-331`).

The build derives the five counts from a bit time of
`4,000,000 / 4800`, about 833.3 T-states (`tools/build.mjs:39-59`):

| Count | Derivation | Value |
| --- | --- | ---: |
| `TXDLY` | Round `(bit time − 49) / 16` | 49 |
| `RXDLY` | Round `(bit time − 38) / 16` | 50 |
| `TXSTOP` | Round `2 × bit time / 16` then add 1 | 105 |
| `RXPOLL` | Round `3.5 × bit time / 38` upwards | 77 |
| `RXHALF` | Round `(1.5 × bit time − 51 − 58.5 − 19) / 16` | 70 |

A transmit pass therefore takes 833 T-states and a receive pass 838.
The `RXHALF` deductions cover the fixed 51 T-states around its loop,
the mean of the interrupt-state paths at 65 and 52 T-states and half
the maximum 38-T-state polling delay. `RXPOLL` covers roughly three and
a half bit times for one status-listening attempt. A received `NUL` starts
another attempt rather than becoming a character. The generated counts
are written to `src/gen/config.asm` (`tools/build.mjs:39-77`,
`src/console.asm:184-204`, `src/console.asm:306-315`).

On the model a whole `TXBYTE` character takes 9,293 T-states and one
through serial `BCONOUT` 9,448. At 4 MHz the latter is
roughly 420 characters a second.

Reception has no hardware buffer. A byte arriving while the CPU is not
polling can be lost. A PC therefore cannot send an uninterrupted stream
merely because TEC-OS has a one-byte software reserve. The receiving
program must return to `CONIN` or `READER` before the next start bit
(`src/console.asm:10-14`, `src/console.asm:280-292`,
`src/console.asm:478-489`).

## Reader, punch and list

BDOS functions 3, 4 and 5 call the BIOS's `READER`, `PUNCH` and `LIST`
entries. The reader waits without a timeout and returns all eight bits,
including `NUL`. It reads the serial line directly so a byte already in
`RXCHAR` stays with the console. The punch sends all eight bits of `C`
through `TXBYTE`, whatever console is selected. On a serial console its
bytes interleave with console output (`src/cpm/bdos.asm:299-319`,
`src/console.asm:465-489`).

`LIST` discards each character with a direct return. `LISTST` always
returns `FFh`, ready. A program waiting for printer readiness can therefore
continue even though the board has no printer (`src/console.asm:453-463`).
A display-console program can use punch and reader as a separate byte
channel to a PC, provided it also respects the unbuffered receive timing.

BAT uses the console's serial input path, which strips bit 7 and skips
`NUL`. Its output returns directly from `BCONOUT`. It neither calls
`LIST` nor copies output to the punch. The BDOS's independently enabled
`^P` copy can still call the RAM `LIST` hook before that BAT discard
(`src/console.asm:280-293`, `src/console.asm:339-347`,
`src/cpm/bdoscon.asm:214-224`).

## Matrix scan and key bytes

The keyboard uses port `FEh`. With `C = FEh`, `IN A,(C)` puts the row
mask in `B` on the high address lines. Its single low bit selects one of
eight rows. A low bit in the returned byte marks a pressed key. Key
number k is row k / 8 and bit k mod 8. Keys 0–2 are Shift, Ctrl and Fn,
keys 3–6 are arrows and key 7 is Caps Lock (`src/keyboard.asm:1-7`,
`src/keyboard.asm:39-72`, `src/keyboard.asm:90-112`).

Cold boot copies the Matrix switch's bit 0 from port `03h` into
`CONDEV`. Without `CDMTX`, `KBPOLL` returns immediately. Otherwise it
calls up to eight `KBSTEP`s, returning early when a character is ready.
Blocking video input calls `KBSTEP` repeatedly instead
(`src/console.asm:42-45`, `src/console.asm:236-245`,
`src/keyboard.asm:17-30`).

`KBMASK` rotates after each row and `KBBASE` advances by eight. For each
pressed key, `KBSTEP` moves the previous `KBE` into `KBD` and stores the
new key in `KBE`. At row 7 the scan has retained its two highest-numbered
pressed keys. `KBEVAL` compares the highest with `KBLAST`, records releases
and delivers a held key only once. Holding it produces no automatic repeat
(`src/keyboard.asm:39-99`). A press and release entirely between scans
is lost.

`abi.inc` publishes `KBLAST` at `BFEFh`: the
highest-numbered matrix key down, row × 8 + column, or `FFh` for none. A
service that scans the matrix itself writes the key it finds there, as
`MON3.SVC` does, so a key held from a program is not read again as new
when TEC-OS's scan resumes. The workspace byte's own label there is
`KBSLOT`, and the build checks that the two addresses agree
(`src/abi.inc:311-318`, `docs/services.md:433-444`,
`src/ram.asm:426`).

Two ordinary keys produce no character. A retained second key below 3 is
a modifier and a modifier alone also produces none. Caps Lock toggles
bit 7 in both `LATCHV` and the system latch. `KBASCII` uses plain/shifted
`KBSPEC` entries for Return, Esc, space, quote and backslash. Digits and
punctuation use `KBSHIFT`. Letters are lowercase normally, uppercase with Shift or Caps Lock and
control codes `01h–1Ah` with Ctrl. Fn uses the ordinary character
(`src/keyboard.asm:90-137`, `src/keyboard.asm:145-215`,
`src/tables.asm:38-42`).

Return is `0Dh` and Esc is `1Bh`. `^H` (`08h`) is backspace and
`^I` (`09h`) is tab. The arrows produce three-byte sequences:

| Arrow | Bytes |
| --- | --- |
| Up | `ESC [ A` |
| Down | `ESC [ B` |
| Right | `ESC [ C` |
| Left | `ESC [ D` |

The keyboard puts `ESC` in `RXCHAR` and queues the other bytes in
`KBT1` and `KBT2`, with `KBTN = 2`. `CINTAKE` advances them on successive
reads, keeping `RXFULL` set until the sequence is consumed
(`src/keyboard.asm:100-124`, `src/console.asm:253-271`,
`src/tables.asm:38-40`). The table-derived character set and these arrow
bytes let an editor read the matrix keyboard through the same console
interface as serial input.

## Bytes to display cells

On serial output the PC's terminal interprets controls and escape sequences.
The ROM sends the output bytes unchanged. For a video console `BCONOUT`
instead enters `VTOUT`, which draws through the selected display vectors.
A claimed PICO console suppresses that output before the terminal runs
(`src/console.asm:339-393`, `src/term.asm:39-73`,
`src/term.asm:810-822`).

`VROW` and `VCOL` store the cursor position. `VPUT` writes a cell, `VGET`
reads one and `VCLREOL` clears from a column to its row's end. `VRDROW`
and `VWRROW` transfer a row through the 80-byte `LINEBUF`
(`src/ram.asm:116-125`, `src/ram.asm:419-422`, `src/video.asm:30-78`).

Printable bytes `20h–7Eh` are drawn with `VATTR` ORed into them.
Reverse video sets `VATTR` to `80h`, selecting the reverse glyph.
Ordinary output bytes `7Fh–FFh` are dropped. A last-column character
leaves `VCOL` one past the edge. Only the next printable character
wraps so an exactly full row followed by CR and LF adds no blank row
(`src/term.asm:39-73`, `src/term.asm:497-506`).

The control path recognises six bytes (`src/term.asm:85-170`):

| Byte | Control | Effect |
| --- | --- | --- |
| `08h` | BS | Move left one column, stopping at the first |
| `09h` | HT | Move to the next eight-column tab stop, clipped to the last column |
| `0Ah` | LF | Move down, scrolling at the region's bottom |
| `0Ch` | FF | Clear the screen and home the cursor |
| `0Dh` | CR | Move to the first column |
| `1Bh` | ESC | Start escape parsing |

Other control bytes have no action in `VTCTL`. At the bottom of the scroll
region, LF deletes its top line. Elsewhere LF moves down
until the screen's last row. A scroll copies rows through `LINEBUF` and
clears the freed bottom row. Console selection and warm boot restore the
region to the whole screen (`src/term.asm:154-182`,
`src/term.asm:742-792`, `src/console.asm:119-120`,
`src/boot.asm:145-148`).

## Escape state and row editing

Output arrives one byte at a time so `ESCST` records the parser's progress.
Zero is ordinary text, 1 follows `ESC`, 2 collects the first number and
3 collects the second. An opening `[` sets the first parameter to zero
and the absent second parameter to `FFh`. Another byte immediately after
`ESC` ends the sequence and is dropped (`src/term.asm:184-209`).

Digits build a byte-sized decimal value, modulo 256. A semicolon starts
the second value at zero. `?` and other intermediate bytes below `40h`
are skipped while parsing continues. A final byte at `40h` or above
ends the sequence and selects an action. An unsupported final byte performs
no action. Skipping a private `?` marker does not prevent a recognised
final action (`src/term.asm:212-253`).

| Sequence | Action |
| --- | --- |
| `ESC [ n A`, `B`, `C`, `D` | Move up, down, right or left n places, with omitted or zero n meaning 1 and movement clipped to the screen |
| `ESC [ r ; c H` or `f` | Position at row r and column c, counted from 1, with missing or zero values meaning 1 |
| `ESC [ J` or any parameter except 2 | Clear from the cursor to the screen's end |
| `ESC [ 2 J` | Clear the screen while retaining the cursor position |
| `ESC [ K` with any parameter | Clear from the cursor to the line's end |
| `ESC [ 0 m`, `ESC [ 7 m` | Normal or reverse video |
| `ESC [ n @`, `ESC [ n P` | Insert blanks or delete characters at the cursor, shifting the remainder of that row |
| `ESC [ t ; b r` | Set the scroll region and home the cursor |
| `ESC [ r` | Restore the full-screen scroll region and home the cursor |
| `ESC [ n L`, `ESC [ n M` | Insert or delete lines within the scroll region and return to the first column |

Movement and insertion/deletion counts use `VTN`, with omitted or zero
counts meaning 1. Cursor moves stop at the screen's edges, not the scroll
region. Positioning clips to the dimensions. The second parameter's `FFh` sentinel also means that an explicit value of 255 uses
its default. A scroll region must fit the screen and contain at least
two rows. Missing or zero bounds mean the first and last rows
(`src/term.asm:281-434`).

The erase actions differ from a full VT100. `ESC [ 1 J` clears forwards
here, as every J parameter except 2 does. K ignores its parameter so
`ESC [ 1 K` and `ESC [ 2 K` also clear forwards. Attribute processing
applies each parameter in turn, changing only 0 and 7
(`src/term.asm:442-506`).

Character insert/delete reads the cursor row into `LINEBUF`, shifts its
cells and writes the row back. Counts are clipped to the cells remaining.
Line insert/delete similarly clips to the rows between the cursor and the
region's bottom. It does nothing outside the region. Insertions copy from
the bottom upwards and deletions from the top down so the source rows
survive until copied (`src/term.asm:518-643`, `src/term.asm:652-792`).

## A terminal example

`TERM` exercises that subset: it clears the screen, writes `ABCDEFG`,
positions at row 1 column 3 and clears forwards to leave `AB`. It then
writes `X` at row 5 column 10 and a reverse `R` beside it. Its source is
`test/programs/term.asm`, not a file supplied on the starter card
(`test/programs/term.asm:1-34`). This PC recipe, run in the repository root,
assembles it with TAS, as Chapter 27 explains, and puts it on a starter-card
copy, `con.img`:

```sh
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { assembleProgram } from "./tools/lib/assemble.mjs";
const [src, out] = process.argv.slice(1);
writeFileSync(out, (await assembleProgram(src)).bytes);
' test/programs/term.asm term.com
cp dist/starter.img con.img
node tools/tecvol.mjs put con.img B term.com
```

The 40-column PICO screen capture shows the result after exit.
The textual screen extraction omits attributes so the reverse `R` appears
as an ordinary letter:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen --card con.img B:TERM. The full screen, with trailing empty rows omitted. -->
```text
AB



         XR

A:SYSTEM>
```

With any command tail, such as `B:TERM S`, the program continues with
30 numbered lines, `L00` through `L29`, to exercise scrolling
(`test/programs/term.asm:11-35`).

## Cursor cells and display pages

The cursor is an inversion of the existing cell. `CURFLIP` reads it with
`VGET`, flips bit 7 and writes it with `VPUT`. `VCURV` gates repeated
show and hide operations. `CONIN`'s video wait and an empty public
`CONST` poll request it. Output removes it before processing its byte.
A pending wrap has no drawable cursor cell. Functions 2 and 9 use the
cursor-free status check so their output avoids redrawing the cursor between characters
(`src/term.asm:832-867`, `src/console.asm:141-149`,
`src/console.asm:224-245`, `src/term.asm:39-40`).

The display table contains eight words: six drawing/row routines, the
page-operation routine and a final columns/rows pair. `PIVEC` and `GLVEC`
hold the PICO and GLCD table addresses. The six routines are `VPUT`,
`VGET`, `VCLREOL`, `VREST`, `VRDROW` and `VWRROW`
(`src/video.asm:129-141`, `src/console.asm:111-119`,
`src/ram.asm:343-344`).

The PICO console has two name tables in video memory (VRAM). Page function 0
shows the page already drawn. Functions 1 and 2 begin and end a row move. At the
beginning, `TMSMBEG` selects the hidden destination page and copies across the
rows outside the move. The move reads the shown page and writes the hidden one.
A previous pending move is shown before another begins. Ending a move marks it
complete while `CONST` or `CONIN` shows it with a register-2 update
(`src/pico.asm:157-199`, `src/pico.asm:479-527`, `src/pico.asm:575-620`,
`src/console.asm:158-160`, `src/console.asm:224-227`).

The terminal brackets scrolling and line insert/delete with those page
operations. `VTFN` calls them only for a PICO console without a program
claim. A GLCD table has zero in that seventh slot because it needs no
PICO page operations (`src/term.asm:704-792`, `src/video.asm:88-118`,
`drivers/glcd.asm:37-45`).

## Display registration and claims

At cold boot `TMSINIT` writes `5Ah` and `A5h` to VRAM address `3FFFh`
through ports `BFh` and `BEh` and reads each back. Both must match.
`VIDINIT` then sets `CDTMS` and enters `PISTART`. With the Matrix switch
enabled, `PISTART` copies `PITPL` into the BIOS workspace's `PIBLK`,
sets 40 columns and installs its address in `PIVEC`
(`src/tms.asm:13-41`, `src/video.asm:18-24`, `src/pico.asm:53-68`).
With the switch disabled or a failed probe, serial remains the console.
A chip that answers the probe with the switch disabled gets no console
table. Boot's `PIICLR` writes `80h` to its register 1, which leaves its
display blanked (`src/pico.asm:326-362`).

`TMSW` supports 80, 40 and 32 columns, all with 24 rows. It selects the
register template, name-table address and row-address table for that width.
`PIBLK` also contains the permanent registry-tail record `PICO`, version 4.
A program finds it with `TNFIND`. Version 4 keeps version 3's table and
state offsets. It also reserves VRAM `3000h–37FFh` from console writes at
every width (`src/abi.inc:276-344`). `CON` changes width through `PICOWID`
at offset 24 in its table. Width changes are rejected while the PICO is
claimed (`src/pico.asm:19-42`, `src/pico.asm:81-155`,
`src/cpm/ccpcmd.asm:134-171`, `src/abi.inc:276-286`).

For an active CRT console, `TMSWID` temporarily sets `CONMOD` to serial
while the IOBYTE still requests CRT. The next console call then copies
the new dimensions and clears the screen. The selected width remains in
the BIOS workspace across warm boot. Bare `CON CRT` and `CON PICO` bypass
the width entry and preserve the selected width and any claim
(`src/cpm/ccpcmd.asm:105-191`, `src/pico.asm:1-9`,
`src/pico.asm:81-94`, `src/console.asm:111-133`).

Normal PICO text at this source pin is light green on black at all three
widths. Four ROM byte values select the palette: the `31h` immediate in
`TMSCOL` and the colour byte in each register template. Colour selection
adds no field to the display table (`src/pico.asm:285-288`,
`src/pico.asm:622-638`). Patterns `80h–FFh` are complements of their
`00h–7Fh` partners, built from the ROM font (`src/pico.asm:242-277`).

The graphics LCD is a loaded service. Its table gives 21 columns and
eight rows on the 128 × 64 display. `INIT` obtains the ROM font, probes
the controller and registers its table through `DRVR`, service 12, with
`B = 3` and `HL` pointing to the table (`drivers/glcd.asm:1-21`,
`drivers/glcd.asm:37-77`). `SVDRV` accepts only UC1 mode 3. Other values
return `TNEBAD` and carry without changing the table. That rejects the
older `PICO.SVC` which used CRT mode 1. PICO's table is now the ROM's
(`src/services.asm:532-538`).

`SVDRV` returns `TNENODV` for a nonzero table passed from a startup line
while the requested IOBYTE field is CRT. The CCP suppresses the error
for that startup absent-device result. A typed `GLCD.SVC`
installation can instead succeed while PICO remains the applied console.
`SVCGO` keeps that mode when `CONMOD` is CRT, otherwise it selects UC1.
A later `CON UC1` can select the loaded table without loading it again
(`src/services.asm:540-556`, `src/cpm/ccp.asm:403-412`,
`src/loader.asm:873-922`).

`VIDHOOK` rejects a nonzero table if the Matrix switch was disabled at
cold boot or a GLCD table is already present. On success it stores `GLVEC` and
returns `HL = LINEBUF`, the row buffer used by the driver. A zero table
pointer removes the hook without those rejection tests
(`src/services.asm:558-564`, `src/video.asm:142-172`).

Removal has two parts. `GLCD.SVC` first finds the PICO record. If it exists
and the requested console is UC1, `REMOVE` changes that request to CRT.
It then drops the UC1 table through `DRVR`. `VIDHOOK` invalidates an
applied UC1 mode by setting `CONMOD` to serial without changing the request.
The next console call can therefore take the available PICO console or
fall back to serial when no PICO request was made. Removing an idle GLCD
while CRT is active leaves PICO and its text in place
(`drivers/glcd.asm:87-103`, `src/video.asm:168-197`).

A program drawing directly on PICO uses `VIDEO`, service 3, to claim it.
`VTOWN` reports a claim only when PICO is also the console. In that case
console output is dropped and cursor and page operations leave the display
alone. A different console can continue while PICO is claimed
(`src/services.asm:172-188`, `src/term.asm:810-822`,
`src/video.asm:109-118`, `src/console.asm:339-345`).

Release and warm boot both enter `HWVREL`. It returns immediately when
there is no claim. After a claim, an installed PICO table supplies the
routine to restore the registers, font and page even if UC1 is the console.
The screen is cleared and homed only when PICO is the console. Without a
PICO table release leaves the display as the program set it, but warm boot
first runs `PIICLR`, which writes 80h to register 1 of a bare chip and so
blanks it (`src/pico.asm:326-362`). Warm boot releases
the claim before rebuilding page zero (`src/services.asm:206-230`,
`src/boot.asm:139-141`).
