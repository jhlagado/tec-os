---
title: Memory for programs
parent: TEC-OS
nav_order: 11
nav_group: "Writing programs"
---

# 11. Memory for programs

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

Before reserving a larger buffer or stack, a program needs its available
memory limit. The program always begins at `0100h` but the upper boundary
varies with the card and installed services. Reading the word at `0006h` gives
the first address beyond the space available for code, data and a private
stack.

## Program space and resident memory

The physical RAM totals 64 KiB: 32 KiB fixed on the board and another 32 KiB
in U9. The Z80 sees only half of U9 at a time:

| Addresses | Size | Contents |
| --- | --- | --- |
| `0000h–7FFFh` | 32 KiB | the board's fixed RAM |
| `8000h–BFFFh` | 16 KiB | EXPAND 0 or EXPAND 1, the two halves of the RAM in socket U9 |
| `C000h–FFFFh` | 16 KiB | the TEC-OS ROM |

The window at `8000h–BFFFh` selects a half through system-latch bit 2 at port
`FFh`. Program entry selects EXPAND 0, giving 48 KiB of RAM below the ROM.
EXPAND 1 contains the block cache. Selecting it hides EXPAND 0 at the same
addresses.

The program's usable region is the *transient program area*, or TPA. It begins
at `0100h` above page zero's CP/M jumps and buffers at `0000h–00FFh`. Its
upper boundary is the address in the jump at `0005h`, available as a word at
`0006h`. That address is outside the TPA so the last usable byte is
immediately below it.

Higher RAM is reserved for installed services, the BDOS entry stub, drive
allocation vectors and resident workspace. The workspace includes BIOS, CCP
and BDOS state and stacks. The RAM BIOS table is at `BF00h`. Overwriting these
regions can damage file allocation or crash the machine.

The CCP and BDOS code occupies ROM. Some CP/M 2.2 programs reclaimed the CCP's
RAM because warm boot would reload it from disk. TEC-OS has no additional CCP
RAM to reclaim. All available program memory is already included below the TPA
ceiling.

## The inherited stack and a private stack

The inherited stack is a small reservation in resident workspace above the
TPA. The CCP places `0000h` on it before program entry, leaving 30 bytes below
that word. Balanced calls and saves preserve the final `RET` exit described in
Chapter 9.

Reserve a private stack inside the TPA when you need deeper nesting. Set `SP`
just beyond its reserved bytes. The first `PUSH` uses the top two reserved
bytes as the stack grows downwards. Keep the reservation separate from code
and buffers and wholly below the boundary read at `0006h`.

A new `SP` no longer points to the inherited return word. A final `RET` on
that stack would read another address. End with `JP 0000h` or BDOS function 0.
Alternatively restore the original stack and balance its calls and saves
before using `RET`.

Direct BIOS calls also use your stack, unlike BDOS calls. Console BIOS
routines can enter the terminal and display driver on it. KEY below reserves a
private stack before making those calls.

## Memory readings

TOP and AREA demonstrate the boundary without assuming an address from a
particular card. Their retained runs use the host model. The programs are
assembled on the PC with TAS and added to a starter-card copy as described in
Chapter 27.

TOP prints the boundary word at `0006h` in hexadecimal:

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

TOP prints the high byte first and appends `h`. `HEX` passes each nibble to
`DIGIT`, which converts it to `0` through `F`. `DIGIT` ends with `JP BDOS`.
After `CALL DIGIT` that output returns to HEX for the low digit. The low-digit
fall-through instead returns to HEX's caller. These repository-root commands
assemble the program and prepare its separate starter-card copy:

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

On the serial-only host model TOP produced:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card mem.img B:TOP. Complete captured console transcript. -->
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

The value `A700h` is the base of the shell's fifteen installed pages. In the
dual-display configuration the PICO console code occupies ROM and startup's
`GLCD.SVC` installs nothing. A later `CON UC1` loads GLCD below the shell and
lowers the boundary. In this run the first TOP result and `CON UC1` echo went
to PICO9918. The reply and second result went to the graphics LCD. The capture
is from the host model, not a browser or physical board:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --card mem.img B:TOP 'CON UC1' B:TOP. Complete captured console transcript. -->
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

With no services installed the starter card has the following layout. These
addresses describe that configuration and must not be embedded as program
limits:

| Addresses | What is there |
| --- | --- |
| `0000h–00FFh` | Page zero, with the CP/M jumps and buffers |
| `0100h–B6C4h` | Your program, up to 46,533 bytes on the starter card |
| `B6C5h–BFFFh` | TEC-OS's working memory |
| `C000h–FFFFh` | The ROM, which holds TEC-OS itself |

The card and services give the boundaries below. The first two rows use the
starter card without startup and the next two include it. The four-drive
example has four G8M volumes created with `tecvol create`. A holds `TOP.COM`,
`GLCD.SVC` and `SHELL.SVC` with no startup file:

| Card | Services | Word at `0006h` | TPA in bytes | Largest `.COM` that loads |
| --- | --- | --- | ---: | ---: |
| starter card | none | `B6C5h` | 46,533 | 46,336 |
| starter card | `GLCD.SVC` | `B300h` | 45,568 | 45,568 |
| starter card | `SHELL.SVC` | `A700h` | 42,496 | 42,496 |
| starter card | `SHELL.SVC`, `GLCD.SVC` | `A400h` | 41,728 | 41,728 |
| four G8M volumes | none | `B6C5h` | 46,533 | 46,336 |
| four G8M volumes | `GLCD.SVC`, `SHELL.SVC` | `A400h` | 41,728 | 41,728 |

An allocation vector reserves a bit per allocation block so the BDOS can find
free storage without rereading the directory. A set bit marks a block already
in use. G1M needs 64 bytes and G8M needs 256. These vectors occupy RAM below
the workspace and above the BDOS stub. Their reservation reduces TPA space.
Chapter 18 explains how the card's drive count sets the reservation.

Services allocate whole 256-byte pages below the preceding boundary's page.
Each installs a BDOS jump at its base and the jump at `0005h` points there. On
the bare starter card GLCD.SVC occupies `B300h–B5FFh`. Its 768 bytes also
exclude the alignment gap at `B600h–B6C4h`, reducing the TPA by 965 bytes.
Later services allocate below the first. Startup's fifteen-page `SHELL.SVC`
leaves `A700h`, or 42,496 bytes. Adding GLCD leaves 41,728
(`docs/memory-map.md:12-22`, `docs/shell.md:23-31`,
`docs/compatibility.md:3-16`). MON3.SVC uses 18 pages. Alone it lowers `B6C5h`
to `A400h`, leaving 41,728 bytes, or 40,960 after GLCD (`docs/mon3.md:49-54`).
After the shell it leaves `9500h` and 37,888 bytes. Adding GLCD lowers it to
`9200h` with 37,120 (`docs/mon3.md:47-59`, `test/shell2.test.mjs:719-741`).

AREA subtracts the program start, `0100h`, from the boundary to print the
available byte count:

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

PUTDEC emits five decimal digits. DIGIT repeatedly adds a negative power of
ten to HL until carry stops. It then uses SBC to reverse the last subtraction
and leave the remainder. Saving HL across function 2 preserves that remainder
for the next digit.

```sh
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { assembleProgram } from "./tools/lib/assemble.mjs";
const [src, out] = process.argv.slice(1);
writeFileSync(out, (await assembleProgram(src)).bytes);
' area.asm area.com
node tools/tecvol.mjs put mem.img B area.com
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card mem.img B:AREA. Complete captured console transcript. -->
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

The COM loader has a stricter limit than runtime storage. It reads from
`0100h` in 128-byte records and stops at the start of the 256-byte page
containing the TPA boundary. Its end-of-file probe uses the CCP's `LOADBUF`
instead of loading another record across that ceiling. An oversized file fails
with the same name and question mark as a missing program.

On the bare starter card the last loaded record ends at `B5FFh`. The largest
COM is therefore 46,336 bytes, 197 below the 46,533-byte TPA. A page-aligned
service boundary has no such gap. This loading limit includes record padding.
Storage allocated after entry may extend to the byte below the word at
`0006h`.

## Page zero and the program's arguments

Page zero holds more than Chapter 10's FCB and command tail. Its fixed fields
also provide exit jumps, console selection and BIOS scratch:

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

Before launching a program the CCP writes the current drive and user area to
`0004h`. Warm boot restores selection from that byte so a program can supply a
different exit drive or user area there. A drive that is unavailable falls
back to A (`src/cpm/ccp.asm:306-324`, `src/cpm/ccp.asm:32-88`).

The command tail begins with a length byte followed by capitalised text,
including the space after the command name. A read into the default DMA buffer
overwrites it. Copy the text before file input if it is still needed. Chapter
10 explains the parsed FCB names and their overlap.

The load-drive byte at `0050h` records a different value from the current
drive at `0004h`. It follows CP/M 3's convention: 0 for a plain command found
on the current drive or 1 for fallback to A. An explicit drive prefix records
that drive number. Thus `B:SHOW` from `A:SYSTEM>` writes 2 even though A
remains current.

TED uses that byte when prefixing chained tool names. Loaded from A while B is
current, it supplies `A:TAS` and `A:TED`. The source stays on B. Chapter 13
explains how those commands are supplied.

## SAVE as a memory snapshot

`SAVE` stores bytes already in RAM. It does not assemble source. Its decimal
count is in 256-byte pages beginning at `0100h`, so `SAVE 2 TWO.COM` stores
`0100h–02FFh`, or 512 bytes. This was CP/M 2.2's way to retain debugger-loaded
or patched code. A zero count creates an empty file.

The saved bytes are whatever a preceding program loaded or left in memory. A
valid count is at most 255 and ends before the page containing the BDOS entry.
Appendix J gives the command syntax.

With the startup shell at `A700h`, this starter-card run could save 166 pages.
The next page would cross the limit so 167 was rejected:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs B: 'SAVE 2 TWO.COM' 'SAVE 167 BIG.COM' 'SAVE 166 BIG.COM' DIR. Complete captured console transcript. -->
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

`SAVE 320 X.COM` also fails with `320?` because 320 exceeds 255. SAVE erases
an existing file of the selected name before creating its replacement. A full
directory gives `NO SPACE` before creation. If space runs out later, SAVE
closes the partial file before reporting `NO SPACE`. A returned close failure
gives that message too. In default BDOS error mode a physical write error can
instead abort through warm boot. A successfully closed partial file retains
the records written.

CP/M 2.2's SAVE leaves a partial file open, which can omit its final extent's
records from the directory. TEC-OS attempts the close to avoid that loss.
Closing file state and flushing cached card writes remain separate operations
as Chapter 10 explains.

## Restart vectors and interrupts

Restart vectors are available to a running program or debugger. Warm boot
sweeps the eight-byte slots at `0008h–003Fh`. It preserves a `JP` only when
the target is strictly above the boundary word at `0006h`, in resident memory
or ROM. The jump's three bytes stay and its remaining five are cleared. Every
other slot receives seven zero bytes and `RET`, allowing a later restart
through that slot to return.

The default at `0038h` is instead `EI` followed by `RETI`. A qualifying jump
there is preserved. Cold boot selects interrupt mode 1 so maskable interrupts
enter at `0038h`. The default returns without device work while a retained
handler performs its own operation.

Warm boot starts programs with maskable interrupts disabled. Programs may
enable them. TEC-OS temporarily masks them for card-block I/O, serial-byte
transfers and PICO9918 control-port byte pairs. It restores the entry state
afterwards. The shell's history occupies its resident pages and requires no
bank switch.

The non-maskable interrupt entry, NMI at `0066h`, is inside the default FCB. A
keypad press with the NMI jumper fitted can execute FCB bytes as instructions.
The supported setup keeps this jumper off. Appendix G explains the wiring and
distinguishes NMI from maskable interrupts.

## The bank window and latch copy

A write-only latch needs a RAM copy for later updates. TEC-OS keeps the last
system-latch value at `0040h` in fixed BIOS scratch RAM. Cache routines can
read it even while EXPAND 1 hides the workspace. Any program writing port
`FFh` must write the same value to `0040h` or later latch updates will reuse
stale bits. Leave both untouched unless changing the latch. Cold boot clears
page zero and initialises the copy. TEC-OS leaves `0041h–004Fh` unused
afterwards. MON3.SVC reserves those bytes during a session and releases them
at `EXIT` or warm boot (`docs/memory-map.md:34-41`).

Cold boot clears EXPAND 1 and prepares the following cache storage
(`docs/memory-map.md:70-83`):

| Addresses | Contents |
| --- | --- |
| `8000h–BBFFh` | the block cache's 30 lines, each with room for one card block of 512 bytes |
| `BC00h–BC9Dh` | the cache's table: the card block each line holds and whether it has changes |
| `BD00h–BFFFh` | free |

The 256-byte command-history ring occupies SHELL.SVC's last page rather than
this bank.

Unused bank storage is not additional TPA. TEC-OS supplies no program
bank-allocation interface for the free range.

Selecting EXPAND 1 hides the BDOS entry, BIOS table, workspace and program
code above `7FFFh`. The inherited stack and return word disappear too. A call
through `0005h` then jumps into cache bytes. Stack writes can corrupt data
that a later flush sends to the card. Putting a private stack in fixed RAM
does not restore access to the hidden BIOS or BDOS.

A limited recovery path exists for `JP 0000h` with EXPAND 1 selected. Its
page-zero jump enters `BF03h` in the other bank. If untouched, those unused
bytes are zero and execute through to ROM at `C000h`. The reset entry tests
the high byte at `0002h` and selects warm boot instead of cold boot. Warm boot
restores EXPAND 0 and flushes the cache. Failed lines are dropped with
`Write lost`, as Chapter 10 describes.

Recovery depends on the page-zero jump and bank bytes remaining intact. It
cannot repair overwritten cache data. Reset and BIOS function 0 take the cold
path instead. Reset stops a crashed or looping program but discards pending
writes. It may retain volume assignments after checking them against the card.
Chapter 16 explains that recognition.

## The raw BIOS console interface

Direct BIOS access requires the same memory and stack discipline. The BDOS
console uses three entries of the RAM BIOS table. To locate the table, read
the word at `0001h` and subtract 3. That word identifies warm boot, entry 1.
Each table entry is a three-byte jump and cold boot is entry 0.

Although this build places the table at `BF00h`, a program derives the base
from page zero. The console offsets identify these entries:

| BIOS function | Address | Name | Effect |
| --- | --- | --- | --- |
| 2 | `BF06h` | `CONST` | `A` = FFh if a key is waiting, 00h if not |
| 3 | `BF09h` | `CONIN` | waits for a key and returns it in `A`, with bit 7 clear |
| 4 | `BF0Ch` | `CONOUT` | prints the character in `C` |

CONIN waits and returns a key without echo or line editing. It returns control
keys such as `^C`, `^S` and `^P` as bytes. CONOUT prints `C` without BDOS tab
expansion or output-time checks. The terminal still processes its own
controls.

BIOS calls preserve interrupt state but may change registers beyond the
documented results. Cursor, escape and attribute state is shared, so an
interrupt handler must not print through the console. Console and display
routines use the caller's stack. Set up a private stack before adding register
saves to a direct BIOS call.

## KEY with its own stack

KEY displays each CONIN byte in hexadecimal through CONOUT and stops at
Return. It reserves a 64-byte private stack and sets `SP` to STACK, the
address beyond it, before making any call:

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

KEY derives CONIN by adding 6 to the warm-boot address at `0001h`, giving
table + 9. Another 3 gives CONOUT at table + `0Ch`. It patches its own JP
operands with those addresses. `CALL CONIN` and `CALL CONOUT` then use the
calculated entries.

Saving AF across HEX and the following space preserves the key for comparison
with Return. HEX also saves A while printing the high nibble before converting
the low one. KEY ends with a jump to `0000h` because its private stack has no
CCP return word.

These PC commands assemble KEY and put it on B in a separate starter-card
copy:

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

The serial capture supplies `a`, `Z`, `^C`, Esc and Return:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card con.img '@start B:KEY' $'@key aZ\x03\x1b\x0d'. Complete captured console transcript. -->
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

CONIN returns `^C` as `03` and KEY continues. Function-10 BDOS input would
instead end the program on that key at the start of a line.

## Input held at the BDOS level

BDOS functions 2, 9 and 11 may retain a waiting key inside the BDOS. Raw CONIN
cannot retrieve it. Printing through function 2 then reading through CONIN can
therefore bypass a key already taken during output. Function 6 supplies
un-echoed direct input while keeping both directions at the BDOS level.
