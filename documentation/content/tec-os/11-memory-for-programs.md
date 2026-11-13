---
title: Memory for programs
parent: TEC-OS
nav_order: 11
nav_group: "Writing programs"
---

# 11. Memory for programs

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

Your program starts at `0100h` but its upper memory limit depends on the card
and installed services. Code, buffers and a private stack must fit below that
limit. The word at `0006h` supplies the boundary when the program runs.

## Program space and resident memory

TEC-OS requires 64 KiB of RAM: the board's fixed 32 KiB and the 32 KiB chip in
socket U9. Only half of U9 appears in the Z80's address space at once:

| Addresses | Size | Contents |
| --- | --- | --- |
| `0000h–7FFFh` | 32 KiB | the board's fixed RAM |
| `8000h–BFFFh` | 16 KiB | EXPAND 0 or EXPAND 1, the two halves of the RAM in socket U9 |
| `C000h–FFFFh` | 16 KiB | the TEC-OS ROM |

Bit 2 of the system latch at port `FFh` selects the half in that bank window.
EXPAND 0 is selected when a program starts. That gives 48 KiB of addressable RAM
below the ROM. EXPAND 1 holds the block cache. Switching it into view removes
EXPAND 0's contents from the same addresses.

Page zero occupies `0000h–00FFh` and contains the CP/M jumps and buffers. The
*transient program area*, or TPA, begins at `0100h`. Its upper bound is the
address stored in the jump at `0005h`, read as a word at `0006h`. That address
is the first byte outside the TPA. Your final usable byte is one below it.

Above the TPA are resident services, if any, the BDOS entry stub, the drives'
allocation vectors and TEC-OS's resident workspace. That workspace holds state
and stacks for the BIOS, CCP and BDOS. The RAM BIOS jump table is at `BF00h`. A
write into resident memory can corrupt file allocation or crash the machine.

The code of the CCP and BDOS is in ROM. CP/M 2.2 programs sometimes reused the
RAM occupied by the CCP, which warm boot loaded again from disk. TEC-OS supplies
no extra RAM that way. The whole TPA below its boundary is already available to
your program.

## The inherited stack and a private stack

The CCP starts a program with `0000h` on its stack. Balanced calls and saves
leave that word on top for the final `RET`, as Chapter 9 explained. There are 30
free bytes below it. That small inherited stack is in the resident workspace
above the TPA rather than in your own program space.

A private stack gives you room for deeper calls and saved registers. Reserve its
bytes within the TPA and set `SP` to the address just beyond them. The stack
grows downwards so the first `PUSH` uses the top two reserved bytes. Code,
buffers and the stack must have separate space below the word read from `0006h`.

Changing `SP` leaves the CCP's return word on the old stack. A top-level `RET`
on the new stack will not use it. Finish with `JP 0000h` or BDOS function 0
instead. An ordinary `RET` exit is also possible after you reinstate the
original stack and balance all its calls and saves.

The distinction becomes necessary for direct BIOS calls. Unlike the BDOS, the
BIOS uses the caller's stack. Its console calls can also enter the terminal and
display driver on that stack. The KEY example below reserves its own stack
before any such call.

## Memory readings

TOP and AREA read the boundary on the host model. They are assembled on the
PC by TAS, as Chapter 27 explains, and put on a copy of the starter card.

TOP prints the address in the word at `0006h`:

```asm
; TOP: print the word at 0006h, the first byte above the program area.
BDOS    EQU     $0005

        ORG     $0100
        LD      A,($0007)       ; the high byte first
        CALL    HEX
        LD      A,($0006)
        CALL    HEX
        LD      DE,CRLF
        LD      C,9
        JP      BDOS

HEX:    PUSH    AF              ; A as two hex digits
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    DIGIT
        POP     AF
DIGIT:  AND     $0F
        ADD     A,'0'
        CP      '9'+1
        JR      C,DIGIT1
        ADD     A,'A'-'9'-1
DIGIT1: LD      E,A
        LD      C,2
        JP      BDOS
CRLF:   DB      "h",13,10,"$"
```

`HEX` prints A's high digit through `DIGIT`, then its low digit. `DIGIT`
converts a nibble to `0` through `F` and ends with `JP BDOS`. For the high
digit, the BDOS returns to HEX after CALL DIGIT. The low digit is entered by
fall-through so its BDOS return goes to HEX's caller. The complete program
prints the high byte of the boundary before the low byte and appends `h`. These
commands, run in the repository root, assemble it and prepare a separate copy
of the starter card:

```sh
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { assembleProgram } from "./tools/lib/assemble.mjs";
const [src, out] = process.argv.slice(1);
writeFileSync(out, (await assembleProgram(src)).bytes);
' top.asm top.com
cp dist/starter.img mem.img
node tools/tecvol.mjs put mem.img B top.com
```

The serial-only model capture gave:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card mem.img B:TOP. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:TOP
A700h

A:SYSTEM>
```

The startup file had installed the shell, whose fifteen pages start at `A700h`.
On the dual-display configuration the PICO console code is in ROM and the
startup file's `GLCD.SVC` line installs nothing. `CON UC1` then installed the
GLCD driver below the shell and lowered the word. The first TOP output and
the echo of `CON UC1` went to the PICO9918. The reply and second TOP output
went to the graphics LCD. This is a host-model capture, not a browser or
physical-board observation:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --card mem.img B:TOP 'CON UC1' B:TOP. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:TOP
A700h

A:SYSTEM>CON UC1
CON: UC1:
A:SYSTEM>B:TOP
A400h

A:SYSTEM>
```

The following table gives the starter card's address map with nothing
installed. The boundary moves with the card and residents so these addresses
are not constants for programs to use:

| Addresses | What is there |
| --- | --- |
| `0000h–00FFh` | Page zero, with the CP/M jumps and buffers |
| `0100h–B6E8h` | Your program, up to 46,569 bytes on the starter card |
| `B6E9h–BFFFh` | TEC-OS's working memory |
| `C000h–FFFFh` | The ROM, which holds TEC-OS itself |

The drive and service combinations change that boundary as follows. The
starter card without its startup file gives the first two rows, the card with
it the next two. The four-drive card has four G8M volumes, made with
`tecvol create`, and `TOP.COM`, `GLCD.SVC` and `SHELL.SVC` on A, with no
startup file:

| Card | Services | Word at `0006h` | TPA in bytes | Largest `.COM` that loads |
| --- | --- | --- | ---: | ---: |
| starter card | none | `B6E9h` | 46,569 | 46,336 |
| starter card | `GLCD.SVC` | `B300h` | 45,568 | 45,568 |
| starter card | `SHELL.SVC` | `A700h` | 42,496 | 42,496 |
| starter card | `SHELL.SVC`, `GLCD.SVC` | `A400h` | 41,728 | 41,728 |
| four G8M volumes | none | `B6E9h` | 46,569 | 46,336 |
| four G8M volumes | `GLCD.SVC`, `SHELL.SVC` | `A400h` | 41,728 | 41,728 |

A drive's allocation vector holds one bit per allocation block. A set bit marks
allocated storage. The BDOS can locate free blocks through it without reading
the directory. A G1M vector occupies 64 bytes and a G8M vector 256 bytes. The
vectors lie directly below the workspace, with the stub below them. Reserving
vectors therefore reduces program space. Chapter 18 explains how the card's
drive count controls those reservations.

Services reduce the boundary in whole 256-byte pages. Each service ends below
the page containing the preceding boundary and installs a BDOS jump at its own
base. The jump at `0005h` then points to that lower address. On the starter
card with nothing installed, GLCD.SVC occupies `B300h–B5FFh`. Its three pages
use 768 bytes but also exclude the alignment gap at `B600h–B6E8h`. The total
reduction is 1,001 bytes. A second service ends below the first and reduces the
available TPA again. The starter card's startup file installs `SHELL.SVC`,
which takes fifteen pages and leaves `A700h`, 42,496 bytes, or 41,728 with
`GLCD.SVC` installed too (`docs/memory-map.md:12-21`, `docs/shell.md:22-30`,
`docs/compatibility.md:3-16`). The card's `MON3.SVC` takes 18 pages.
Installed alone it moves the word from `B6E9h` to `A400h`, leaving 41,728
bytes, and installed after `GLCD.SVC` it leaves 40,960
(`docs/mon3.md:47-52`). Installed after the shell, as on the starter card,
it leaves `9500h`, 37,888 bytes, and `9200h`, 37,120 bytes, with `GLCD.SVC`
too (`docs/mon3.md:45-57`, `test/shell2.test.mjs:719-741`).

AREA reads the boundary and subtracts `0100h` to obtain the size in bytes:

```asm
; AREA: print the size of the program area in bytes, in decimal.
BDOS	EQU	$0005

	ORG	$0100
	LD	HL,($0006)	; the first byte above the area
	LD	DE,$0100	; the area's first byte
	OR	A		; clear carry for the subtraction
	SBC	HL,DE		; HL = the size in bytes
	CALL	PUTDEC
	LD	DE,BYTES	; the text after the number
	LD	C,9		; BDOS function 9: print a string
	JP	BDOS		; print, and return from there

; PUTDEC: print HL in decimal, always as five digits. Takes HL.
; Returns nothing. Changes AF, BC, DE and HL.
PUTDEC:	LD	BC,-10000	; the ten-thousands digit
	CALL	DIGIT
	LD	BC,-1000	; the thousands, from what is left
	CALL	DIGIT
	LD	BC,-100		; the hundreds
	CALL	DIGIT
	LD	BC,-10		; the tens
	CALL	DIGIT
	LD	BC,-1		; the units: fall into DIGIT

; DIGIT: print how many times a power of ten goes into HL. Takes the
; negative of the power in BC and the number in HL. Returns the
; remainder in HL. Changes AF, BC and DE.
DIGIT:	LD	A,'0'-1		; one below the character for 0
DLOOP:	INC	A		; the next digit
	ADD	HL,BC		; take off one power of ten
	JR	C,DLOOP		; carry: HL is still 0 or more
	SBC	HL,BC		; one too many: add the power back
	PUSH	HL		; function 2 changes the registers
	LD	E,A
	LD	C,2		; BDOS function 2: print E
	CALL	BDOS
	POP	HL
	RET

BYTES:	DB	" bytes",13,10,"$"
```

PUTDEC prints five decimal digits. Each DIGIT call adds a negative power of ten
to HL until the addition stops producing carry. At that point the remainder
would be negative. The final SBC adds back the power subtracted once too often.
HL is saved across function 2's output. The complete source keeps its tabs and comments.

```sh
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { assembleProgram } from "./tools/lib/assemble.mjs";
const [src, out] = process.argv.slice(1);
writeFileSync(out, (await assembleProgram(src)).bytes);
' area.asm area.com
node tools/tecvol.mjs put mem.img B area.com
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card mem.img B:AREA. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:AREA
42496 bytes

A:SYSTEM>
```

## Loaded file size and working space

The loader reads a COM file from `0100h` in 128-byte records. Its ceiling is the
start of the 256-byte page containing the boundary address. It probes for end of
file using `LOADBUF` in the CCP workspace. An extra record is therefore
not loaded across the program's ceiling. An oversized file gets the same
name-and-question-mark failure as a missing program.

On the starter card with nothing installed, the last loaded record ends at
`B5FFh`. That allows a 46,336-byte COM file, 233 bytes less than the
46,569-byte TPA. A
page-aligned service boundary removes that gap. The loader limit applies to the
file's record-rounded size. Data allocated after entry can extend to the byte
below the word at `0006h`.

## Page zero and the program's arguments

Chapter 10 used page zero's default file control block (FCB) and command-tail
buffer. Page zero also holds the return vectors, console selection and BIOS
scratch:

| Addresses | Contents |
| --- | --- |
| `0000h–0002h` | Jump to the BIOS warm-boot entry at `BF03h` |
| `0003h` | IOBYTE, the CP/M device-selection byte described in Chapter 17 |
| `0004h` | Current drive in bits 0–3 and user area in bits 4–7 |
| `0005h–0007h` | BDOS jump, with the TPA boundary in its address word |
| `0008h–0037h` | Restart vectors for `RST 08h` through `RST 30h` |
| `0038h–003Ah` | Default `EI`/`RETI` for interrupt mode 1, unless a qualifying jump is retained |
| `0040h` | TEC-OS's copy of the system latch |
| `0041h–004Fh` | Unused after cold boot |
| `0050h` | The drive from which the CCP loaded the program |
| `005Ch–007Fh` | Default FCB parsed from the first argument |
| `006Ch–007Bh` | Second argument's name fields, overlapping the first FCB |
| `0080h–00FFh` | Command tail, then the default DMA buffer |

The CCP stores the current drive and user area at `0004h` before program entry.
Warm boot uses that byte to restore the selection so changing that byte changes
the selection used on exit. An unavailable drive falls back to A
(`src/cpm/ccp.asm:306-324`, `src/cpm/ccp.asm:32-88`).

The tail's first byte is its length and the characters follow it. They are in
capitals and include the leading space after the command's name. A read into the
default DMA buffer replaces the tail. A program that still needs it copies it
before file input. Chapter 10 explains the FCB fields and the overlap between the
two parsed names.

`0050h` is a different drive value from the current drive at `0004h`. It follows
CP/M 3's load-drive convention. A plain command loaded from the current drive
gives 0. A search that finds the program on A gives 1. An explicit prefix
supplies its drive number so `B:SHOW` at `A:SYSTEM>` leaves 2 there. The current drive
can remain A throughout that run.

TED reads `0050h` to prefix the commands it chains. When loaded from A with B
current, it generates `A:TAS` and `A:TED`. The source remains on B while the
tools run from A. Chapter 13 explains the chaining interface.

## SAVE as a memory snapshot

`SAVE` writes bytes already in RAM rather than assembling source. It starts at
`0100h` and writes a decimal number of 256-byte pages. `SAVE 2 TWO.COM` saves
the 512 bytes at `0100h–02FFh`. This was CP/M 2.2's route for keeping code
loaded and patched with a debugger. Zero pages makes an empty file.

The source bytes are whatever the last program loaded or left there. The count
must be at most 255 and must stop before the page containing the BDOS entry
address. Appendix J gives the complete command syntax.

This run used the starter card, whose startup file had installed the shell
at `A700h`. Its limit is 166 pages. The request for 167 is rejected and
166 accepted:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs B: 'SAVE 2 TWO.COM' 'SAVE 167 BIG.COM' 'SAVE 166 BIG.COM' DIR. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>SAVE 2 TWO.COM
B:WORK>SAVE 167 BIG.COM
167?

B:WORK>SAVE 166 BIG.COM
B:WORK>DIR

TWO     .COM     512
BIG     .COM   42496
2 files, 43008 bytes
8323072 free on B:WORK
B:WORK>
```

A count above 255 is rejected too: `SAVE 320 X.COM` gives `320?`. SAVE erases an
existing file of the chosen name before making the new one. A full directory
produces `NO SPACE` before file creation. If the disk or directory fills after
some records, SAVE closes the partial file before printing `NO SPACE`. A failed
close that returns failure also gives `NO SPACE`. A physical disk-write
error in the default BDOS mode can instead abort to warm boot before SAVE
receives a result. The successfully closed file retains the records
written.

CP/M 2.2's SAVE leaves that partial file open. Its final extent's records may
then have no directory entry. TEC-OS's close avoids that omission when it
succeeds. Closing file state and flushing pending card writes remain distinct
operations, as Chapter 10 explains.

## Restart vectors and interrupts

A program or debugger can use the restart vectors while it runs. Warm boot
sweeps each eight-byte vector from `0008h` through `003Fh`. It retains a `JP`
only when its target is strictly above the word at `0006h`, into resident memory
or ROM. The jump's three bytes remain and its other five bytes are cleared. Any
other vector becomes seven zero bytes and a `RET`. A restart through a finished
program's discarded vector then returns.

At `0038h`, TEC-OS installs `EI` followed by `RETI` only if no qualifying jump
survived. Cold boot sets interrupt mode 1, in which the Z80 enters `0038h` for a
maskable interrupt. The default handler returns rather than performing device
work. A retained handler has its own behaviour.

Programs start with maskable interrupts disabled by warm boot. A program can
enable them. TEC-OS temporarily disables them for card-block I/O, serial-byte
transfers and PICO9918 control-port byte pairs. It then restores the previous
state. The command history is the shell's, in its own pages, and needs no
bank switch.

The non-maskable interrupt (NMI) entry at `0066h` lies inside the default FCB.
With the keypad NMI jumper fitted, a hex-keypad press can execute the FCB's
bytes as instructions. The supported setup keeps that jumper off. Appendix G
explains the wiring and the difference between maskable interrupts and NMI.

## The bank window and latch copy

The system latch is write-only. TEC-OS keeps its last value at `0040h`, in
CP/M's BIOS scratch area. That fixed-RAM copy remains accessible when EXPAND 1
hides the workspace. The cache routines read it to restore the normal bank. A program that writes port `FFh` must also write the same value to
`0040h`. Otherwise a later TEC-OS latch write uses the old recorded bits. Leave
both alone unless the program changes the latch. Cold boot clears page zero and
initialises the latch copy. TEC-OS does not use `0041h–004Fh` afterwards,
but a `MON3.SVC` session holds them while it runs and gives them back at
`EXIT` or warm boot (`docs/memory-map.md:32-39`).

Cold boot clears EXPAND 1 for TEC-OS's cache. It holds
(`docs/memory-map.md:70-83`):

| Addresses | Contents |
| --- | --- |
| `8000h–BBFFh` | the block cache's 30 lines, each with room for one card block of 512 bytes |
| `BC00h–BC9Dh` | the cache's table: the card block each line holds and whether it has changes |
| `BD00h–BFFFh` | free |

The history of command lines is a 256-byte ring in the last page of
`SHELL.SVC`, not in this bank.

The free range means unused storage in that bank. It does not extend the TPA or
supply a bank-allocation interface to a program.

Selecting EXPAND 1 hides the BDOS entry, BIOS jump table, workspace and any
program code above `7FFFh`. It also hides the inherited stack and its return
word. A call through `0005h` then targets cache memory instead of the BDOS.
Stack operations can read or overwrite banked cache bytes. A write there can
damage cached data that a later flush sends to the card. A private stack in
fixed RAM does not make the missing BIOS or BDOS callable.

There is a limited exit path for a program that jumps to `0000h` with EXPAND 1
still selected. The page-zero jump targets `BF03h`. That unused part of EXPAND 1
contains zeros unless something wrote there. Execution runs through those zeros
into the ROM at `C000h`. The reset entry tests the high address byte at `0002h`
to distinguish this path from a reset, then takes warm boot. Warm boot restores
EXPAND 0 and flushes the cache. A failed flush drops failed lines and reports
`Write lost`, as Chapter 10 explains.

That path depends on the bank's bytes and the page-zero jump remaining intact.
It does not restore cache bytes a program has overwritten. Reset and BIOS
function 0 instead run cold boot. Reset can stop a crashed or nonterminating
program but discards pending cached writes. A recognised reset can retain the
selected volumes when they still match the card. Chapter 16 explains that check.

## The raw BIOS console interface

The memory and stack rules above also apply to direct BIOS calls. The BDOS uses
three entries of the RAM BIOS jump table for console operations. A program can
reach them through the word at `0001h`, which points to the second entry, warm
boot. Subtracting 3 finds the table's base. Each entry is a three-byte jump,
with cold boot numbered 0 and warm boot numbered 1.

The implementation places that table at `BF00h` but programs calculate its
address from page zero rather than hard-coding that location:

| BIOS function | Address | Name | Effect |
| --- | --- | --- | --- |
| 2 | `BF06h` | `CONST` | `A` = FFh if a key is waiting, 00h if not |
| 3 | `BF09h` | `CONIN` | waits for a key and returns it in `A`, with bit 7 clear |
| 4 | `BF0Ch` | `CONOUT` | prints the character in `C` |

CONIN returns a key without BDOS echo or line editing. Control keys such as
`^C`, `^S` and `^P` are returned as bytes. CONOUT sends C without BDOS tab
expansion or output-time key checks. The selected terminal still interprets its
own control characters.

These calls preserve the interrupt state but may change registers other than
their documented results. Their cursor, escape and video-attribute state is in
shared workspace. An interrupt handler must not print through the console. The
calls and display routines run on the caller's stack. A program that saves
registers before calling them sets up a private stack rather than adding those
saves to the small inherited stack.

## KEY with its own stack

KEY reads through CONIN and prints each key's hexadecimal code through CONOUT
until Return. Its 64-byte reserved stack is part of the program. `SP` is set to
STACK, just beyond those reserved bytes, before any call:

```asm
; KEY: read keys through the BIOS and print each one's code in hex, until
; Return.
        ORG     $0100
        LD      SP,STACK        ; the BIOS's routines run on this stack
        LD      HL,($0001)      ; the BIOS's warm boot entry, table + 3
        LD      DE,6
        ADD     HL,DE
        LD      (CONIN+1),HL    ; table + 9: CONIN
        LD      DE,3
        ADD     HL,DE
        LD      (CONOUT+1),HL   ; table + 0Ch: CONOUT
NEXT:   CALL    CONIN           ; wait for a key; A = its code
        PUSH    AF
        CALL    HEX
        LD      C,' '
        CALL    CONOUT
        POP     AF
        CP      13
        JR      NZ,NEXT
        LD      C,13
        CALL    CONOUT
        LD      C,10
        CALL    CONOUT
        JP      $0000           ; no return word on this stack
CONOUT: JP      0               ; print C; the address goes here
CONIN:  JP      0               ; the address goes here

HEX:    PUSH    AF              ; A as two hex digits
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    DIGIT
        POP     AF
DIGIT:  AND     $0F
        ADD     A,'0'
        CP      '9'+1
        JR      C,DIGIT1
        ADD     A,'A'-'9'-1
DIGIT1: LD      C,A
        JR      CONOUT

        DS      64
STACK:
```

The address in `0001h` is table + 3. Adding 6 obtains CONIN at table + 9 and
adding another 3 obtains CONOUT at table + `0Ch`. KEY writes those addresses
into the operands of its own JP instructions. CALL CONIN and CALL CONOUT then
reach the actual BIOS entries.

KEY saves AF across HEX and the following space output so it can compare the
original key with Return. HEX saves A across its high-nibble output, then
converts the low nibble. The final jump to `0000h` ends the program without
reading a return word from its private stack.

These commands assemble KEY on the PC and put it on drive B of a separate
starter-card copy:

```sh
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { assembleProgram } from "./tools/lib/assemble.mjs";
const [src, out] = process.argv.slice(1);
writeFileSync(out, (await assembleProgram(src)).bytes);
' key.asm key.com
cp dist/starter.img con.img
node tools/tecvol.mjs put con.img B key.com
```

This serial capture supplied `a`, `Z`, `^C`, Esc and Return:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card con.img '@start B:KEY' $'@key aZ\x03\x1b\x0d'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:KEY
61 5A 03 1B 0D

A:SYSTEM>
```

The `^C` is printed as `03` and KEY continues. BDOS function 10 instead ends a
program when `^C` is the first key of an input line.

## Input held at the BDOS level

Functions 2, 9 and 11 can read a waiting key and keep it inside the BDOS for the
next BDOS input call. BIOS CONIN cannot return that pending byte. A function-2
output call can take a key typed during printing. A subsequent raw CONIN read
bypasses that byte because it is already held inside the BDOS. Keeping input and
output at the same level avoids that split. Function 6 supplies direct un-echoed
BDOS input without a raw BIOS read.
