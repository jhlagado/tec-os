---
title: Console paths
parent: TEC-OS
nav_order: 17
nav_group: "Inside TEC-OS"
---

# 17. Console paths

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

A console call crosses several layers before reaching a key or display. The
BDOS handles editing and output controls while the BIOS routes bytes to
devices. A key taken during printing can be retained for a later read. An
output byte may become serial bits or a cell in video memory. Tracing those
transfers explains the pending-input rule from Chapter 9 and the hook limits
from Chapter 14 (`src/cpm/bdoscon.asm:120-158`, `src/cpm/bdoscon.asm:169-224`,
`src/cpm/bdoscon.asm:299-330`, `src/console.asm:339-393`).

## The BIOS boundary

The BIOS table separates machine operations from BDOS processing. TEC-OS
supplies all seventeen CP/M 2.2 entries as three-byte jumps at fixed table
offsets (`src/tables.asm:15-31`):

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

Cold boot copies the table to `BF00h`. Page zero's `0001h` word points to warm
boot at `BF03h`, identifying the base by subtraction. BDOS names BIOCST,
BIOCIN and BIOCOT address the RAM entries (`src/boot.asm:108-111`,
`src/boot.asm:300-305`, `src/cpm/bdos.asm:20-34`). Replacing a jump intercepts
BDOS calls through it as well as direct BIOS calls. Warm boot preserves the
table. A transient replacement must therefore be restored before exit,
including any changed warm-boot entry, or it can point into overwritten TPA
code.

Not every internal operation uses the table. CONSTQ polls ROM BCONST directly
to avoid drawing a cursor during output. A detected input byte still passes
through GETCHAR and RAM CONIN. Private ROM printing can call BCONOUT directly
too. A table hook intercepts its interface entry rather than all device
activity (`src/cpm/bdoscon.asm:120-158`, `src/cpm/bdoscon.asm:299-307`,
`src/console.asm:399-420`).

## Requested and applied consoles

The logical CON console is routed by IOBYTE bits 0–1 at `0003h`. The four
physical names are TTY, CRT, BAT and UC1. TEC-OS assigns their input and
output as follows (`src/console.asm:1-9`, `src/console.asm:75-90`,
`src/layout.asm:48-49`):

| Value | Physical console | Input source | Output path |
| ---: | --- | --- | --- |
| 0 | `TTY:` | serial port | serial port |
| 1 | `CRT:` | matrix keyboard | PICO9918 |
| 2 | `BAT:` | serial port, with console filtering | direct discard |
| 3 | `UC1:` | matrix keyboard | graphics LCD |

IOBYTE also reserves bits 2–3 for RDR, 4–5 for PUN and 6–7 for LST. TEC-OS
ignores those fields for routing. Its reader, punch and list implementations
remain fixed regardless of the upper bits (`src/console.asm:458-489`).

An IOBYTE write requests a console change. Programs may write it directly or
use BDOS function 8 and read it with function 7. CONMOD records the applied
mode separately. At BIOS status, input and output entries, CONSEL compares
request and applied state and enters CONSW when they differ
(`src/cpm/bdos.asm:350-364`, `src/console.asm:54-65`,
`src/console.asm:158-166`, `src/console.asm:224-233`,
`src/console.asm:339-340`). STAT's `CON:=CRT:` uses this same standard
request.

Odd modes require a display table from PIVEC or GLVEC. A zero pointer falls
back to serial. Otherwise CONSW copies seven routine vectors and the
dimensions, resets the scroll region and records the mode. Unless the display
is claimed it also restores display mode, homes the cursor and clears the
screen. TTY and BAT set VWID and VHGT to zero (`src/console.asm:75-133`).

CONMD records the applied selection in CONMOD and IOBYTE's console bits while
preserving its upper six bits. After the next console call, IOBYTE therefore
reflects the device actually selected. Missing display or keyboard support
changes a requested video mode to TTY. INFO returns the applied width and
height in L and H. Serial dimensions are zero because TEC-OS cannot read the
PC terminal's size. Programs must reread dimensions after changing consoles
(`src/console.asm:496-510`, `src/services.asm:74-80`).

CON sets the request and its reply's output call applies it
(`src/cpm/ccpcmd.asm:187-214`, `src/console.asm:54-65`). In this 40-column
PICO run the banner, startup, first CON reply and typed `CON TTY` went to
PICO. The serial capture begins with the changed console's reply and contains
later input:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --serial CON 'CON TTY' CON. Complete serial transcript. -->
```text
CON: TTY:
A:SYSTEM>CON
CON: TTY:
A:SYSTEM>
```

## Input held at two levels

The BIOS reserves a received byte in RXCHAR and marks it with RXFULL above the
BIOS table. Both serial and keyboard input use that storage. CINTAKE returns
the byte and clears RXFULL. A queued arrow sequence instead advances its next
byte while keeping the flag set (`src/ram.asm:301-303`, `src/ram.asm:422-423`,
`src/console.asm:201-209`, `src/console.asm:253-271`,
`src/keyboard.asm:111-124`).

BCONST applies any console request and displays a completed PICO row move
before polling. It returns ready without another device read when RXFULL is
set. Otherwise it calls KBPOLL for video or listens for a serial start bit.
Public CONST, BCONSTC, also shows a cursor when video input is empty. BDOS
output polling uses the cursor-free entry (`src/console.asm:141-209`,
`src/cpm/bdoscon.asm:153-158`).

BCONIN consumes buffered input first. A blocking video read shows the cursor
and repeatedly calls KBSTEP until a key is delivered, then hides the cursor.
Serial input waits for port `03h` bit 7 to go low. Console receive strips bit
7 and skips a resulting NUL. The source identifies a leading NUL before
Debug80's first input as the reason for filtering it
(`src/console.asm:211-245`, `src/console.asm:280-331`).

Before serial waiting, a read from port `00h` triggers queued host-model input
in Debug80. On a board the same read accesses the keypad encoder and leaves
serial unchanged. It is a model trigger rather than a hardware receive buffer
(`src/console.asm:10-18`, `src/console.asm:184-204`,
`src/console.asm:280-292`).

The BDOS has its own single-byte reserve in PENDCHR and PENDING. GETCHAR
consumes it before calling RAM CONIN. CONSTAT reports it ready before asking
the BIOS. Function 11 also takes a BIOS-ready byte into that reserve and
returns 1. Only with neither level ready does it return 0
(`src/ram.asm:228-231`, `src/cpm/bdoscon.asm:120-143`,
`src/cpm/bdos.asm:707-720`).

Raw CONIN cannot retrieve a byte already transferred to the BDOS reserve. A
program printing through function 2 and reading through CONIN can therefore
bypass input taken during output. Using the same interface for both directions
avoids this split. Each reserve holds a byte already received, not an
arbitrary queue while the CPU works elsewhere (`src/cpm/bdoscon.asm:120-158`,
`src/cpm/bdoscon.asm:299-330`, `src/console.asm:10-14`).

## BDOS output and line input

BDOS functions 2 and 9 reach OUTCHAR. Function 9 reads from DE until `$`.
OUTCHAR expands tabs by emitting spaces until COLUMN is a multiple of eight.
CHKKEY checks input before each emitted character (`src/cpm/bdos.asm:294-297`,
`src/cpm/bdos.asm:373-385`, `src/cpm/bdoscon.asm:169-193`).

CHKKEY pauses on `^S`. A following `^C` goes through CHDROP to warm boot,
cancelling any pending command remainder. Another resume key is consumed.
Outside the pause, `^P` toggles LISTEN for list output. Other keys enter
PENDCHR for the next BDOS read (`src/cpm/bdoscon.asm:299-341`,
`src/cpm/bdos.asm:103-105`).

ECHORAW updates COLUMN before calling output hooks because either replacement
routine may change C. CR resets the column, backspace reduces it toward zero
and bytes from space upwards increment it. With LISTEN enabled the byte goes
to LIST first with BC saved. The routine then jumps to CONOUT
(`src/cpm/bdoscon.asm:214-244`, `src/cpm/bdoscon.asm:268-282`).

Function 1 reads through GETCHAR and echoes through ECHOCHAR, including
control bytes, with tabs expanded. Function 6 with `E = FFh` returns a waiting
byte without echo or returns zero. Its output form sends E directly to CONOUT
with no BDOS tab processing, polling, list copy or column update. A selected
video terminal may still interpret controls (`src/cpm/bdos.asm:280-286`,
`src/cpm/bdos.asm:329-347`, `src/cpm/bdoscon.asm:252-264`,
`src/console.asm:339-345`).

Function 10 stores an edited line through DE. Buffer byte 0 sets a maximum of
1–255 characters. Byte 1 receives the count and text follows. CR or LF ends
input and is echoed without being stored. Reaching the maximum also ends input
and echoes CR. The loop handles these editing keys
(`src/cpm/bdos.asm:403-464`, `src/cpm/bdos.asm:645-662`):

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

Deletion adjusts LINPTR and LINCNT. ERASE1 sends backspace, space and
backspace directly to CONOUT so erasing does not copy those bytes to the
printer. LINERASE repeats that operation for `^X` and history replacement
(`src/cpm/bdos.asm:499-630`, `src/cpm/bdoscon.asm:353-360`).

In this run `^U` discards a partial command and `^R` reprints a complete
command before Return:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs $'TYPE X\x15DIR *.CMD' $'DIR *.CMD\x12'. Complete captured console transcript. -->
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
937984 free on A:SYSTEM
A:SYSTEM>DIR *.CMD#
DIR *.CMD

STARTUP .CMD     128
1 file, 128 bytes
937984 free on A:SYSTEM
A:SYSTEM>
```

History recall is enabled only for SHELL.SVC's prompt. ROM SHLINE sets HFLAG
before entering the shell's LINE routine. Its function-10 call can then use
`^W` or `^N` to call HREC for an older or newer line. An ordinary program
receives those control bytes as text. Completing a marked line consumes HFLAG
and passes nonempty input to HSTORE. Empty-line `^C` clears the flag through
warm boot. Without a shell HFLAG remains clear. [Chapter
23](23-the-history-ring.md) explains the ring (`src/cpm/ccp.asm:251-282`,
`src/cpm/bdos.asm:473-490`, `src/cpm/bdos.asm:645-662`,
`src/boot.asm:398-403`, `docs/shell.md:308-322`).

## Serial bits and timing

Serial transfers use CPU timing because the TEC-1G has no UART for hardware
transmission or reception. Port `01h` bit 6 transmits and port `03h` bit 7
receives. Digit selection shares port `01h`. The line runs at 4800 baud with
eight data bits, no parity and two stop bits. All timing assumes 4 MHz FAST
(`src/layout.asm:12-14`, `src/console.asm:10-18`, `tools/build.mjs:26-27`).

TXBYTE saves entry interrupt state and disables maskable interrupts until the
byte finishes. Nine passes send the start bit and eight data bits from least
significant to most significant. SBC A,A forms `00h` or `FFh` from carry and
AND 40h selects the port level. A pass writes, delays and shifts the next bit
to carry, costing `49 + 16 × TXDLY` T-states. TXSTOP keeps the line high for
its delay passes before interrupt state is restored
(`src/console.asm:363-393`).

After start-bit detection RXBITS also saves and masks interrupts. After RXHALF
delay passes the eight data bits enter C through carry. Each sampling pass
costs `38 + 16 × RXDLY` T-states. The routine restores entry interrupt state
before returning (`src/console.asm:306-331`).

The build calculates five delays from `4,000,000 / 4800`, about 833.3 T-states
per bit (`tools/build.mjs:39-59`):

| Count | Derivation | Value |
| --- | --- | ---: |
| `TXDLY` | Round `(bit time − 49) / 16` | 49 |
| `RXDLY` | Round `(bit time − 38) / 16` | 50 |
| `TXSTOP` | Round `2 × bit time / 16` then add 1 | 105 |
| `RXPOLL` | Round `3.5 × bit time / 38` upwards | 77 |
| `RXHALF` | Round `(1.5 × bit time − 51 − 58.5 − 19) / 16` | 70 |

These values produce transmit passes of 833 T-states and receive passes of
838. RXHALF subtracts 51 fixed T-states, the mean of 65- and 52-T-state
interrupt paths and half the maximum 38-T-state polling delay. RXPOLL permits
roughly three and a half bit times per status-listen attempt. A NUL restarts
listening instead of returning console input. The build writes counts to
`src/gen/config.asm` (`tools/build.mjs:39-77`, `src/console.asm:184-204`,
`src/console.asm:306-315`).

A complete model TXBYTE takes 9,293 T-states. Serial BCONOUT takes 9,448
including its surrounding work, about 420 characters per second at 4 MHz.

Software buffering begins only after reception. A byte arriving between polls
can be lost because the hardware provides no receive buffer. The PC must
therefore leave time for the receiving program to reenter CONIN or READER
before another start bit. The one-byte reserve does not support an
uninterrupted stream (`src/console.asm:10-14`, `src/console.asm:280-292`,
`src/console.asm:478-489`).

## Reader, punch and list

BDOS functions 3, 4 and 5 use the BIOS READER, PUNCH and LIST entries. READER
waits indefinitely on the serial line and returns all eight bits, including
NUL. It bypasses RXCHAR so already buffered console input stays there. PUNCH
sends C's full byte through TXBYTE regardless of console selection. On serial
its bytes share the line with console output (`src/cpm/bdos.asm:299-319`,
`src/console.asm:465-489`).

LIST returns without storing or transmitting its character. LISTST always
returns ready, `FFh`, so printer-waiting code continues despite the absent
printer (`src/console.asm:453-463`). With a video console, programs can use
PUNCH and READER as a separate PC byte channel while still respecting
unbuffered receive timing.

BAT takes console serial input with bit 7 stripped and NUL skipped. Its output
returns directly from BCONOUT and goes to neither LIST nor PUNCH. BDOS `^P`
copying remains independent: it may call RAM LIST before the byte reaches
BAT's discard (`src/console.asm:280-293`, `src/console.asm:339-347`,
`src/cpm/bdoscon.asm:214-224`).

## Matrix scan and key bytes

Matrix input reads port FEh with a row mask on the high address lines. With
`C = FEh`, IN A,(C) uses B's single low bit to select a row. Returned low bits
indicate pressed switches. Key k is at row k / 8, bit k mod 8. Keys 0–2 are
Shift, Ctrl and Fn, 3–6 are arrows and 7 is Caps Lock (`src/keyboard.asm:1-7`,
`src/keyboard.asm:39-72`, `src/keyboard.asm:90-112`).

Cold boot records port `03h`'s Matrix-switch bit 0 in CONDEV. Without CDMTX,
KBPOLL returns immediately. With it, a poll runs up to eight KBSTEP calls and
stops early on a character. Blocking video input repeats KBSTEP until delivery
(`src/console.asm:42-45`, `src/console.asm:236-245`,
`src/keyboard.asm:17-30`).

KBMASK rotates between rows while KBBASE advances by eight. Each pressed key
replaces KBE after moving its previous value to KBD. At row 7 those bytes hold
the two highest-numbered pressed keys. KBEVAL compares the highest with KBLAST
and records release transitions. It delivers a held key once with no automatic
repeat. A complete press and release between scans is lost
(`src/keyboard.asm:39-99`).

The public KBLAST address in abi.inc is `BFEFh`. It stores the highest pressed
key as row × 8 + column or `FFh` for none. A service performing its own scan
updates that byte so resuming the normal scan does not deliver a still-held
key again. MON3.SVC uses this convention. The internal label is KBSLOT and the
build checks its address against KBLAST (`src/abi.inc:311-318`,
`docs/services.md:436-447`, `src/ram.asm:432`).

Two ordinary keys produce no character. A second retained key below 3 is a
modifier and a modifier alone also produces none. Caps Lock toggles bit 7 in
LATCHV and the port. KBASCII uses KBSPEC's plain/shifted values for Return,
Esc, space, quote and backslash and KBSHIFT for digits and punctuation.
Letters are normally lowercase, uppercase with Shift or Caps Lock and
`01h–1Ah` with Ctrl. Fn leaves the ordinary character unchanged
(`src/keyboard.asm:90-137`, `src/keyboard.asm:145-215`,
`src/tables.asm:38-42`).

Character keys include Return `0Dh`, Esc `1Bh`, backspace `^H` at `08h` and
tab `^I` at `09h`. Each arrow instead produces three bytes:

| Arrow | Bytes |
| --- | --- |
| Up | `ESC [ A` |
| Down | `ESC [ B` |
| Right | `ESC [ C` |
| Left | `ESC [ D` |

For an arrow the keyboard puts ESC in RXCHAR, its following bytes in KBT1 and
KBT2 and count 2 in KBTN. Successive CINTAKE reads advance the sequence while
retaining RXFULL until the last byte (`src/keyboard.asm:100-124`,
`src/console.asm:253-271`, `src/tables.asm:38-40`). An editor therefore
receives matrix characters and arrow sequences through the ordinary console
byte interface.

## Bytes to display cells

Serial sends bytes unchanged for the PC terminal to interpret. Video BCONOUT
instead calls VTOUT, whose terminal processing uses selected display vectors.
A claim on the selected PICO console discards output before that processing
(`src/console.asm:339-393`, `src/term.asm:39-73`, `src/term.asm:810-822`).

The terminal tracks position in VROW and VCOL. Its driver operations write
with VPUT, read with VGET and clear row tails with VCLREOL. VRDROW and VWRROW
transfer rows through the 80-byte LINEBUF (`src/ram.asm:116-125`,
`src/ram.asm:425-428`, `src/video.asm:30-78`).

VTOUT draws printable `20h–7Eh` after ORing VATTR into the byte. Reverse mode
sets VATTR to `80h` for the reverse glyph. Ordinary output drops `7Fh–FFh`.
Printing the last column leaves VCOL just beyond the edge and delays wrap
until another printable byte. An exactly filled row followed by CR and LF
therefore adds no extra row (`src/term.asm:39-73`, `src/term.asm:497-506`).

VTCTL handles these six control bytes (`src/term.asm:85-170`):

| Byte | Control | Effect |
| --- | --- | --- |
| `08h` | BS | Move left one column, stopping at the first |
| `09h` | HT | Move to the next eight-column tab stop, clipped to the last column |
| `0Ah` | LF | Move down, scrolling at the region's bottom |
| `0Ch` | FF | Clear the screen and home the cursor |
| `0Dh` | CR | Move to the first column |
| `1Bh` | ESC | Start escape parsing |

VTCTL ignores other controls. LF at the scroll region's bottom removes the top
row and clears a new bottom row after copying through LINEBUF. Outside that
case it moves down to the screen's last row. Console selection and warm boot
restore full-screen scroll bounds (`src/term.asm:154-182`,
`src/term.asm:742-792`, `src/console.asm:119-120`, `src/boot.asm:145-148`).

## Escape state and row editing

Escape sequences span output calls so ESCST retains parser state between
bytes. State 0 is text, 1 follows ESC, 2 collects the first parameter and 3
collects the second. `[` initialises the first to zero and the absent second
to `FFh`. Another byte directly after ESC terminates the sequence and is
discarded (`src/term.asm:184-209`).

Decimal digits accumulate modulo 256. A semicolon starts the second parameter
at zero. Intermediate bytes below `40h`, including `?`, are skipped. A final
byte at `40h` or above terminates parsing and dispatches an action if
supported. A skipped private `?` marker therefore does not disable a
recognised final action (`src/term.asm:212-253`).

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

VTN converts absent or zero movement and editing counts to 1. Cursor movement
clips to screen edges rather than scroll bounds and positioning clips to
dimensions. The second parameter's `FFh` marker also makes explicit 255 select
its default. A scroll region needs at least two rows within the screen.
Missing or zero bounds select the first and last rows
(`src/term.asm:281-434`).

This subset differs from full VT100 erasure. Every J parameter except 2,
including 1, clears forwards. K ignores its parameter so `ESC [ 1 K` and
`ESC [ 2 K` also clear forwards. Attribute processing applies parameters in
order but recognises only 0 and 7 (`src/term.asm:442-506`).

Character insertion and deletion read a row into LINEBUF, shift its cells and
write it back, clipping counts to remaining cells. Line edits clip to the
cursor-to-region-bottom span and do nothing outside the region. Insertion
copies upwards from the bottom and deletion downwards from the top. This order
prevents overwriting source rows before use (`src/term.asm:518-643`,
`src/term.asm:652-792`).

## A terminal example

TERM exercises erasure, positioning and attributes. It writes ABCDEFG, moves
to row 1 column 3 and clears forwards to leave AB. It also places X at row 5
column 10 with a reverse R beside it. The source is `test/programs/term.asm`,
absent from the starter card (`test/programs/term.asm:1-34`). These
repository-root commands assemble it with TAS as in Chapter 27 and add it to
`con.img`, a starter-card copy:

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

The 40-column PICO capture after exit contains the expected cells. Its text
extraction omits attributes so R appears ordinary:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen --card con.img B:TERM. Full screen; trailing empty rows omitted. -->
```text
AB



         XR

A:SYSTEM>
```

Any command tail, for example `B:TERM S`, enables another 30 lines numbered
L00–L29 to exercise scrolling (`test/programs/term.asm:11-35`).

## Cursor cells and display pages

The cursor inverts an existing cell. CURFLIP reads with VGET, flips bit 7 and
writes with VPUT. VCURV prevents repeated show or hide operations. A video
input wait or empty public CONST poll displays it. Output removes it first.
There is no cursor cell while wrap is pending. Functions 2 and 9 poll without
drawing a cursor, avoiding repeated inversions between characters
(`src/term.asm:832-867`, `src/console.asm:141-149`, `src/console.asm:224-245`,
`src/term.asm:39-40`).

Both video consoles use an eight-word display table addressed by PIVEC or
GLVEC. Six words name VPUT, VGET, VCLREOL, VREST, VRDROW and VWRROW. The
seventh selects page operations and the last pairs columns with rows
(`src/video.asm:129-141`, `src/console.asm:111-119`, `src/ram.asm:349-350`).

PICO uses two VRAM name tables to complete row moves off-screen. Page function
0 shows a finished page, 1 begins a move and 2 ends it. TMSMBEG selects the
hidden destination and copies rows outside the move. The move reads the shown
page and writes the hidden one. A previous completed move is shown before the
next starts. Completion marks the page pending and CONST or CONIN reveals it
by updating register 2 (`src/pico.asm:157-199`, `src/pico.asm:479-527`,
`src/pico.asm:575-620`, `src/console.asm:158-160`, `src/console.asm:224-227`).

Terminal scrolling and line editing bracket their row copies with these page
calls. VTFN dispatches them only for unclaimed PICO console output. GLCD needs
no PICO page operation and leaves its seventh table word zero
(`src/term.asm:704-792`, `src/video.asm:88-118`, `drivers/glcd.asm:37-45`).

## Display registration and claims

A display table is installed only after detection. TMSINIT tests VRAM `3FFFh`
by writing and reading `5Ah` and `A5h` through ports BFh and BEh. Both must
match. VIDINIT marks CDTMS and enters PISTART. With Matrix enabled it copies
PITPL into PIBLK, selects 40 columns and writes PIVEC (`src/tms.asm:13-41`,
`src/video.asm:18-24`, `src/pico.asm:53-68`). Failed detection or disabled
Matrix leaves serial selected. A responding chip with Matrix off has no
console table and PIICLR's register-1 write of `80h` blanks it
(`src/pico.asm:326-362`).

TMSW selects 80, 40 or 32 columns with 24 rows by changing register template
and row-address tables. PIBLK also contains the permanent PICO registry
record, version 4, found through TNFIND. It retains version 3's offsets and
reserves VRAM `3000h–37FFh` from console writes at every width
(`src/abi.inc:276-344`). CON uses PICOWID at offset 24 to change width. A
claim prevents that operation (`src/pico.asm:19-42`, `src/pico.asm:81-155`,
`src/cpm/ccpcmd.asm:134-171`, `src/abi.inc:276-286`).

For active CRT, TMSWID temporarily marks CONMOD serial while leaving the CRT
request. The next console call reapplies the new dimensions and clears the
display. Selected width survives warm boot in BIOS workspace. Bare CON CRT or
CON PICO skips the width operation, preserving width and any claim
(`src/cpm/ccpcmd.asm:105-191`, `src/pico.asm:1-9`, `src/pico.asm:81-94`,
`src/console.asm:111-133`).

At the cited revision PICO text is light green on black at every width.
Palette values are the `31h` immediate in TMSCOL and the colour bytes in three
register templates, with no added display-table field (`src/pico.asm:285-288`,
`src/pico.asm:622-638`). Font loading builds `80h–FFh` as complements of
`00h–7Fh` (`src/pico.asm:242-277`).

GLCD.SVC supplies 21 columns and eight rows for the 128 × 64 graphics LCD.
INIT gets the ROM font and probes the controller. It registers the table
through DRVR, service 12, with `B = 3` and HL pointing to the table
(`drivers/glcd.asm:1-21`, `drivers/glcd.asm:37-77`). SVDRV accepts UC1 mode 3
only. Other modes return TNEBAD with carry and unchanged registration. This
rejects the former PICO.SVC's CRT mode 1 because ROM now supplies that table
(`src/services.asm:532-538`).

During startup a nonzero table with IOBYTE set to CRT returns TNENODV. The CCP
suppresses it as device absence. A typed GLCD.SVC may instead install while
PICO remains applied. SVCGO retains CRT when CONMOD is CRT and otherwise
selects UC1. Later CON UC1 can select the installed table without another load
(`src/services.asm:540-556`, `src/cpm/ccp.asm:403-412`,
`src/loader.asm:873-922`).

VIDHOOK rejects nonzero registration when Matrix was disabled at cold boot or
GLVEC already holds a table. Success stores GLVEC and returns `HL = LINEBUF`
for driver row transfers. A zero pointer removes registration without those
rejection tests (`src/services.asm:558-564`, `src/video.asm:142-172`).

GLCD removal adjusts request and applied state separately. REMOVE first finds
PICO and changes a UC1 request to CRT when that record exists. It then
unregisters UC1 through DRVR. VIDHOOK marks an applied UC1 mode serial without
changing IOBYTE. The next call therefore selects available PICO or falls back
to serial. Removing idle GLCD during CRT operation leaves PICO text
undisturbed (`drivers/glcd.asm:87-103`, `src/video.asm:168-197`).

Direct PICO drawing starts with a VIDEO claim through service 3. VTOWN reports
the claim to terminal code only while PICO is the console. That combination
suppresses output, cursor changes and page operations. Another selected
console can continue during PICO graphics (`src/services.asm:172-188`,
`src/term.asm:810-822`, `src/video.asm:109-118`, `src/console.asm:339-345`).

Release and warm boot enter HWVREL. With no claim it returns immediately.
Otherwise a PICO table supplies restoration of registers, font and page even
when UC1 is current. Clearing and homing occur only for a PICO console.
Without a PICO table release preserves the program's display state. Warm boot
first runs PIICLR, however, whose `80h` register-1 write blanks a bare chip
(`src/pico.asm:326-362`). This release precedes page-zero rebuilding
(`src/services.asm:206-230`, `src/boot.asm:139-141`).
