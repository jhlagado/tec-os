---
title: Use the board's devices
parent: TEC-OS
nav_order: 12
nav_group: "Writing programs"
---

# 12. Use the board's devices

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A program may need to show a number on the digits, sound a note or draw
graphics while its console remains usable. The BDOS covers text and files.
TEC-OS adds numbered ROM calls for the board's devices. Checking their
signature and version first lets a program exit safely on a CP/M system
without that interface.

## Numbered calls and shared ports

A hardware port is separate from a memory address. Z80 IN and OUT instructions
use ports to read and write devices. A direct write can also affect a device
already in use by TEC-OS.

Port `01h` combines three uses: bits 0–5 select digits, bit 7 drives the
speaker and bit 6 transmits serial data. A digit scan or tone that leaves bit
6 low sends noise to a possible console. PICO9918 graphics share another
device with console output. The ROM calls hold the serial line idle during
digit and tone output and record a display claim before graphics access.

These routines are *numbered services* already in ROM. A resident service such
as `GLCD.SVC` is instead a file installed in RAM. Both kinds can participate
in the same program. A resident service can call a numbered routine through
its entry address. Chapter 14 explains resident code.

## The ABI and its entry address

Programs need a stable way to reach routines whose locations may change
between builds. An *application binary interface*, or ABI, defines that entry
together with register arguments and results. TEC-OS places its eight-byte
interface at `C003h`, after the reset jump:

| Address | Name | Contents |
| --- | --- | --- |
| `C003h` | `ABITAB` | the letters `TNA` |
| `C006h` | `ABIMAJ` | the major version, 5 |
| `C007h` | `ABIMIN` | the minor version, 1 |
| `C008h` | `ABICALL` | a jump: the numbered services |

The signature `TNA` distinguishes the interface from unrelated bytes at the
same addresses. `ABIMAJ` and `ABIMIN` identify ABI version 5.1. The ROM
product version reported by INFO is a separate value.

A caller checks `TNA` and major version 5 before entering `C008h`. Require an
exact major match because a new major can renumber services. A minor version
appends service numbers so code using 5.0 calls also runs on 5.1. A program
using a later addition must check the minor version too.

`ABICALL` jumps to a dispatcher that selects by service number. It is not a
table of fixed addresses for individual routines. Those routines may move
between builds while the entry, numbers and argument contracts remain stable.
The reset jump also has a fixed address at `C000h`.

The ROM and applications use constants from `src/abi.inc`, published as
`dist/abi.inc`. The examples include it as `ABI.INC` to obtain names such as
ABICALL and TNLCD. `%INCLUDE` inserts the file's source at that point. Its
constants emit no executable bytes.

## Registers, status and stack

The register sizes are the same as in Chapter 9. For a numbered call put the
service number in C. B supplies a byte argument while DE or HL supplies words
or buffer addresses according to the routine's contract. A cannot carry an
argument because dispatch changes it. Load the required inputs and call
ABICALL.

Hardware calls 0–8 return status in A and set these flags:

| Status | Flags | Meaning |
| ---: | --- | --- |
| 0 | zero set, carry clear | success |
| 1 | carry set | no such service, an argument out of range or a request rejected with nothing changed |
| 2 | carry set | the device isn't fitted or isn't the console |

For these hardware calls either `JP NZ` or `JP C` detects failure. Use the
documented result registers and preserve any other values still needed after
the call. The calls preserve IX, IY and the alternate registers. Appendix B
gives the individual contracts.

An invalid number at or above `TNCOUNT`, 17, returns status 1 while preserving
B, DE and HL. The hardware numbers are:

| Number | `abi.inc` | Does |
| ---: | --- | --- |
| 0 | `TNINFO` | reports the board's devices, the ROM's version and the console's size |
| 1 | `TNDIGIT` | makes one pass over the six 7-segment digits |
| 2 | `TNLCD` | writes one row of the 20 × 4 LCD |
| 3 | `TNVIDEO` | claims or releases the PICO9918 |
| 4 | `TNTONE` | sounds the speaker |
| 5 | `TNJOY` | reads the joystick |
| 6 | `TNKEYS` | reads the matrix keyboard's rows |
| 7 | `TNPUTAT` | writes text at a screen position on a video console |
| 8 | `TNRTC` | reads or sets the DS1302 clock |

The remaining numbers use the same entry for other interfaces. Calls 9–11
mount, unmount and describe volumes as explained in Chapter 18. Call 12
registers a GLCD display table. Calls 13 and 14 find and enumerate registry
records described in Chapter 14. They return a generation in A on success, so
test carry for registry calls rather than treating A as hardware status. Call
15 supplies the font and was added in ABI 5.1. Call 16, `TNSHELL`, installs
the shell hook described in Chapter 21 (`src/abi.inc:208-236`).

Hardware calls run on the caller's stack. PUTAT's bound is the largest at 22
bytes below the CALL return address. That fits Chapter 11's inherited 30-byte
allowance only if the caller's nesting and saves leave enough room. Appendix B
lists every bound. These figures are documented bounds rather than newly
measured peaks.

The nine hardware services make no BDOS calls. They can therefore run inside a
BDOS operation, for example from a BIOS-table hook. That rule does not cover
every numbered service. MOUNT and UNMNT call BDOS function 37 and require a
caller outside an active BDOS call. Appendix B also records their
register-preservation exceptions.

## The shared signature check and print routines

Each example first calls CHKHW. It compares `TNA` and major version 5 and
returns Z only when all four bytes match. On failure NOTHW prints a message
with BDOS function 9 and exits before any hardware-port access.

The shared `HWLIB.ASM` contains that check, printing helpers and their data.
Include it after the program's entry code because it emits bytes. SAY prints a
dollar-terminated string. `CALL SAY` returns normally while a top-level jump
to SAY prints and exits through the inherited return word. LABHEX preserves A
and HL while printing a label, then prints A in hexadecimal. HEX prints its
two *nibbles*, the four-bit halves of a byte, through NIBBLE.

Clock fields use *binary-coded decimal*, or BCD. Each nibble holds a decimal
digit. Printing the nibbles as hexadecimal therefore displays the two decimal
digits unchanged.

```asm
; HWLIB.ASM: routines this chapter's programs share. It goes after a
; program's own code, since it makes bytes where it is included.

; Test for TEC-OS with ABI 5. Returns Z if the table's four bytes match,
; NZ if not. Changes AF, B, DE and HL.
CHKHW:	LD	HL,ABITAB	; signature, then the major version
	LD	DE,TAG		; what they must be
	LD	B,4		; a major of 6 fails as a wrong letter does
CHKH1:	LD	A,(DE)
	CP	(HL)
	RET	NZ		; NZ: not what TAG holds
	INC	HL		; on to the next of each
	INC	DE
	DJNZ	CHKH1
	RET			; Z from the last comparison

; End a program that found another system. Takes nothing, and returns to
; the CCP through the program's own return address.
NOTHW:	LD	DE,NOTMSG	; no board devices here, and no harm done
; Print the $-ended string at DE. A jump here prints and ends the program.
; Changes AF, BC, DE and HL.
SAY:	LD	C,9		; BDOS print string
	JP	BDOS		; its RET is this routine's

; Print the $-ended label at DE, then A in hex. Changes AF, BC and DE.
LABHEX:	PUSH	AF		; the value, across the BDOS call
	PUSH	HL		; the BDOS changes HL
	CALL	SAY
	POP	HL
	POP	AF		; on into HEX
; Print A as two hex digits, which also prints a BCD byte in decimal.
; Changes AF, BC and DE.
HEX:	PUSH	HL		; a caller may keep a value here
	PUSH	AF		; the low digit comes second
	RRCA			; the high digit down to bits 0 to 3
	RRCA
	RRCA
	RRCA
	CALL	NIBBLE		; the high digit
	POP	AF
	CALL	NIBBLE		; the low digit
	POP	HL
	RET

; Print the low four bits of A as a hex digit. Changes AF, BC, DE and HL.
NIBBLE:	AND	$0F		; one digit
	ADD	A,'0'
	CP	'9'+1		; past 9: the letters start seven later
	JR	C,NIBB1
	ADD	A,7
NIBB1:	LD	E,A		; BDOS console output
	LD	C,2
	JP	BDOS		; its RET is this routine's

TAG:	DB	"TNA",5
NOTMSG:	DB	"not TEC-OS with ABI 5",13,10,"$"
```


## The board's report

INFO, service 0, reports the device state before a program uses optional
hardware. It takes no argument and returns device bits in B, ROM version in DE
and console dimensions in HL. L holds columns and H holds rows. B defines
these bits:

| `B` bit | Value | Set when |
| ---: | ---: | --- |
| 0 | `01h` | the matrix keyboard is enabled by the board's Matrix switch |
| 1 | `02h` | a PICO9918 answered at cold boot |
| 2 | `04h` | `GLCD.SVC` is in |
| 3 | `08h` | a DS1302 clock answered at cold boot |
| 4 | `10h` | the PICO9918 is claimed |
| 7 | `80h` | the ROM's word `GLCD?` is on LCD row 3 |

The version's major byte is D and its minor byte E. Thus `0001h` reports ROM
version 0.1, separate from ABI 5.1. BOARD prints the report in hexadecimal. It
also calls `TNCOUNT`, just beyond the valid range, to display a
rejected-number result:

```asm
; BOARD: print what INFO reports, then what a bad number returns.
BDOS	EQU	$0005
%INCLUDE "ABI.INC"

	ORG	$0100
	CALL	CHKHW		; the numbers below hold only on ABI 5
	JP	NZ,NOTHW
	LD	C,TNINFO
	CALL	ABICALL
	PUSH	HL		; the size, across the printing
	PUSH	DE		; and the version
	LD	A,B		; the device bits
	LD	DE,MSGB		; the first line
	CALL	LABHEX
	POP	HL		; the version, high byte first
	LD	A,H
	LD	DE,MSGVER	; the second
	CALL	LABHEX
	LD	A,L		; then the low byte on the same line
	CALL	HEX
	POP	HL		; the console's size
	PUSH	HL		; the rows, for the next line
	LD	A,L		; the columns
	LD	DE,MSGCOL	; the third
	CALL	LABHEX
	POP	HL		; the rows
	LD	A,H
	LD	DE,MSGROW	; the fourth
	CALL	LABHEX
	LD	C,TNCOUNT	; the number after the last service
	CALL	ABICALL
	PUSH	AF		; the status, and its carry
	LD	DE,MSGBAD
	CALL	LABHEX
	POP	AF		; only the carry is wanted now
	LD	DE,MSGNC
	JP	NC,SAY		; prints and ends the program
	LD	DE,MSGC		; the carry was set
	JP	SAY		; prints and ends the program

; What each line starts with, and how the last ends.
MSGB:	DB	"Devices  B = $"
MSGVER:	DB	13,10,"Version DE = $"
MSGCOL:	DB	13,10,"Columns  L = $"
MSGROW:	DB	13,10,"Rows     H = $"
; The last line: the status, then its carry.
MSGBAD:	DB	13,10,"Number 17: status $"
MSGC:	DB	", carry set",13,10,"$"
MSGNC:	DB	", carry clear",13,10,"$"
%INCLUDE "HWLIB.ASM"
```

These host commands copy ABI.INC, HWLIB.ASM and BOARD.ASM together onto a
starter-card copy. TAS then reads the includes from that card:

```sh
cp dist/starter.img hw.img
node tools/tecvol.mjs put hw.img B dist/abi.inc --text
node tools/tecvol.mjs put hw.img B hwlib.asm --text
node tools/tecvol.mjs put hw.img B board.asm --text
```

The later examples use the same copy operation for their sources. On B,
`TAS BOARD` writes BOARD.COM beside BOARD.ASM. Chapter 5's search finds
TAS.COM on A. In this serial-model run INFO reported clock bit 3 and zero
console dimensions:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card hw.img B: 'TAS BOARD' BOARD. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS BOARD
BOARD.COM written

B:WORK>BOARD
Devices  B = 08
Version DE = 0001
Columns  L = 00
Rows     H = 00
Number 17: status 01, carry set

B:WORK>
```

The `--board pico` model includes PICO9918, graphics LCD and matrix keyboard.
Cold boot selected PICO at 40 columns. INFO reported device byte `0Bh` and
dimensions `28h` by `18h`, or 40 by 24. Startup's GLCD.SVC installed nothing
while PICO was selected. This is a host-model capture rather than a browser
observation:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card hw.img --board pico B: 'TAS BOARD' BOARD. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS BOARD
BOARD.COM written

B:WORK>BOARD
Devices  B = 0B
Version DE = 0001
Columns  L = 28
Rows     H = 18
Number 17: status 01, carry set

B:WORK>
```

With `--board glcd`, GLCD.SVC installed as the console driver. The same report
gave device bits `0Dh`, columns `15h` and rows `08h`, or 21 by 8.

Use INFO's returned dimensions for screen layout. Both are zero for serial
because TEC-OS cannot read the remote terminal's size. A program may then
assume 80 by 24 as the shell's pager does. Read the dimensions again
after changing consoles. `CON UC1` selects the graphics LCD and changes them
to 21 by 8.

## The LCD and the speaker

A status message can use the separate 20 × 4 character LCD while console
output continues elsewhere. LCD, service 2, copies exactly 20 characters from
HL to row B, numbered 0–3. Pad a short message with spaces. B at 4 or above
returns status 1 before writing. LCDMSG writes row 1 and sounds a beep through
TONE, service 4:

```asm
; LCDMSG: write a row of the 20 x 4 LCD and beep, on TEC-OS only.
BDOS	EQU	$0005
%INCLUDE "ABI.INC"

	ORG	$0100
	CALL	CHKHW		; the numbers below hold only on ABI 5
	JP	NZ,NOTHW
	LD	B,1		; the LCD's second row
	LD	HL,TEXT		; exactly 20 characters
	LD	C,TNLCD
	CALL	ABICALL		; A is the status, 0 for this row
	LD	B,120		; about 1 kHz
	LD	DE,400		; 400 half cycles, about 0.2 s
	LD	C,TNTONE
	CALL	ABICALL		; returns when the tone ends
	LD	DE,DONE
	JP	SAY		; prints and ends the program

TEXT:	DB	"Hello on the LCD    "
DONE:	DB	"Written and beeped",13,10,"$"
%INCLUDE "HWLIB.ASM"
```

The capture's `--lcd` option includes the character-LCD rows:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card hw.img --lcd B: 'TAS LCDMSG' LCDMSG. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS LCDMSG
LCDMSG.COM written

B:WORK>LCDMSG
Written and beeped

B:WORK>
--- LCD
TEC-OS 0.1  TEC-1G
Hello on the LCD
B: WORK
```

The LCD portion shows the message on the second row. Cold-boot text remains on
the other rows:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card hw.img --lcd B: 'TAS LCDMSG' LCDMSG. The complete LCD rows, trailing spaces removed. -->
```text
TEC-OS 0.1  TEC-1G
Hello on the LCD
B: WORK
```

The LCD text survives program exit. On another ABI major the check instead
branches to NOTHW, prints `not TEC-OS with ABI 5` and leaves the LCD
unchanged.

TEC-OS tracks its `GLCD?` message on row 3 with a separate mark. GLCD.SVC
installation clears that message only while the mark is set. Writing row 3
through LCD clears the mark so a later driver installation preserves your
replacement text. Chapter 8 explains when the startup message appears.

TONE writes the speaker bit, port `01h` bit 7. B sets the delay and DE counts
half cycles. Instruction time is measured in T-states, or CPU clock periods.
Each ordinary toggle interval is 16 × B + 51 T-states. Two intervals form a
full cycle. At 4 MHz the frequency is 2,000,000 divided by that interval.

For B = 120 the interval is 1,971 T-states and the frequency about 1,015 Hz.
DE = 400 lasts about 0.2 seconds as in LCDMSG. For a duration in seconds,
calculate half cycles as frequency × 2 × seconds. B = 0 represents 256 and
gives about 482 Hz. B = 1 gives about 29,851 Hz. DE = 0 returns without sound.
These values follow from instructions rather than a hardware measurement.
Appendix B accounts for the final interval and call overhead.

The caller remains inside TONE until the sound finishes. A nonempty tone ends
with the speaker off. Throughout it the serial transmit bit remains idle so
the beep does not transmit console noise.

## The digits and the clock

The six 7-segment digits share segment wires. Port `02h` supplies a pattern
and port `01h` selects the lit digit. Repeatedly selecting each digit with its
own pattern gives a steady-looking display.

DIGIT, service 1, performs a single scan from six pattern bytes at HL,
leftmost first. All digits are off on return. The host model takes 20,660
T-states from call target to return, about 5.2 ms at 4 MHz. Each digit stays
selected for 3,348 T-states between port writes, about 0.84 ms. Your loop
repeats the call and converts numbers through its own segment-pattern table.

RTC, service 8, transfers seven BCD bytes at HL in order: seconds, minutes,
hours, date, month, weekday and year. B = 0 reads and B = 1 sets them. A set
finishes with write protection enabled. Other B values return status 1 with
the clock unchanged. A failed clock probe returns status 2. INFO bit 3 records
the separate cold-boot presence result.

DIGCLK repeats that scan until BDOS function 6 returns a key. Every 32nd pass
it reads the clock and converts hours, minutes and seconds into six patterns.
Initialising the counter to 31 also makes the first pass read the clock:

```asm
; DIGCLK: the time on the 7-segment digits, until a key.
BDOS	EQU	$0005
%INCLUDE "ABI.INC"

	ORG	$0100
	CALL	CHKHW		; the numbers below hold only on ABI 5
	JP	NZ,NOTHW
LOOP:	LD	HL,PASSES	; the clock is read one pass in 32
	INC	(HL)
	LD	A,(HL)
	AND	31		; 0 on every 32nd pass
	CALL	Z,TOSEG
	LD	HL,DIGS		; one pass over the six digits
	LD	C,TNDIGIT
	CALL	ABICALL
	LD	E,$FF		; BDOS direct input: a key, or 0
	LD	C,6
	CALL	BDOS
	OR	A
	JR	Z,LOOP		; no key: the digits need another pass
	RET			; DIGIT left them dark

; Read the clock and turn hours, minutes and seconds into six patterns at
; DIGS. Changes AF, BC, DE and HL; with no clock DIGS stays as it was.
TOSEG:	LD	HL,TIME		; seven BCD bytes, seconds first
	LD	B,0		; B = 0: read
	LD	C,TNRTC
	CALL	ABICALL
	RET	NZ		; status 2: no clock
	LD	DE,DIGS		; the leftmost digit's pattern first
	LD	A,(TIME+2)	; hours
	CALL	PAIR
	LD	A,(TIME+1)	; minutes
	CALL	PAIR
	LD	A,(TIME)	; seconds, and PAIR's RET ends TOSEG
; Store the two digits of the BCD byte in A as patterns at DE, which moves
; on by two. Changes AF, BC and HL.
PAIR:	PUSH	AF		; the units digit, for after the tens
	RRCA			; the tens digit down to bits 0 to 3
	RRCA
	RRCA
	RRCA
	CALL	SEG		; the tens
	POP	AF		; on into SEG for the units
; Store the low four bits of A as a pattern at DE, which moves on. Changes
; AF, BC and HL.
SEG:	AND	$0F		; one digit
	LD	C,A		; BC = the digit
	LD	B,0
	LD	HL,SEGTAB	; the digit's segments, one bit each
	ADD	HL,BC
	LD	A,(HL)
	LD	(DE),A		; into the row of six
	INC	DE
	RET

; The digits 0 to 9 as segment patterns.
SEGTAB:	DB	$EB,$28,$CD,$AD	; 0 to 3
	DB	$2E,$A7,$E7,$29	; 4 to 7
	DB	$EF,$AF		; 8 and 9
PASSES:	DB	31		; 31: the first pass reads the clock
DIGS:	DB	0,0,0,0,0,0
TIME:	DS	7
%INCLUDE "HWLIB.ASM"
```

Time spent outside DIGIT leaves the digits dark. A slow loop reduces
brightness and may flicker. DIGCLK limits clock reads to every 32nd pass while
checking input each time. Its final scan turns the digits off before exit.

NOW uses the same seven-byte buffer to print a date and time. The clock
supplies only two year digits so the example prefixes them with its own `20`
text:

```asm
; NOW: print the date and time from the clock.
BDOS	EQU	$0005
%INCLUDE "ABI.INC"

	ORG	$0100
	CALL	CHKHW		; the numbers below hold only on ABI 5
	JP	NZ,NOTHW
	LD	HL,TIME		; seven BCD bytes
	LD	B,0		; B = 0: read
	LD	C,TNRTC
	CALL	ABICALL
	LD	DE,NOCLK
	JP	NZ,SAY		; status 2: no clock answered
	LD	DE,CENTY	; the clock holds two digits of the year
	CALL	SAY
	LD	HL,PLAN		; each field's offset, then what follows it
NEXT:	LD	C,(HL)		; BC = the field's offset in TIME
	LD	B,0
	INC	HL
	PUSH	HL		; the plan, across the printing
	LD	HL,TIME
	ADD	HL,BC
	LD	A,(HL)		; a BCD byte prints as decimal
	CALL	HEX
	POP	HL
	LD	E,(HL)		; the separator
	INC	HL
	PUSH	HL		; the plan again
	LD	C,2		; BDOS console output
	CALL	BDOS
	POP	HL
	LD	A,(HL)		; another field?
	INC	A
	JR	NZ,NEXT		; FFh ends the plan
	LD	DE,ENDLN
	JP	SAY		; prints and ends the program

PLAN:	DB	6,'-',4,'-'	; year, month
	DB	3,' ',2,':'	; date, hours
	DB	1,':',0,' '	; minutes, seconds
	DB	5,13,$FF	; weekday, 1 to 7; FFh ends the plan
CENTY:	DB	"20$"
NOCLK:	DB	"no clock",13,10,"$"
ENDLN:	DB	10,"$"		; after the plan's carriage return
TIME:	DS	7
%INCLUDE "HWLIB.ASM"
```

PLAN pairs each buffer offset with an output separator. NOW selects the BCD
byte at that offset, prints it through HEX and prints the separator. The
captured build and run produced:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card hw.img B: 'TAS NOW' NOW. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS NOW
NOW.COM written

B:WORK>NOW
2026-11-01 12:00:09 07

B:WORK>
```

This host-model run started at 12:00 on 1 November 2026. Its clock advances
with emulated T-states, including assembly time. Weekday 1 means Monday in the
model so Sunday appears as `07`.

## The keys and the joystick

Games often need held-switch state rather than a sequence of characters. KEYS,
service 6, copies eight matrix rows to HL with row 0 first and a 1 for each
pressed switch. JOY, service 5, returns active joystick lines as 1 bits in B.

Neither call tests for absence or checks the Matrix switch. KEYS and JOY
always return status 0. ROWS checks INFO bit 0 before waiting for matrix
input, then prints the eight rows and joystick byte:

```asm
; ROWS: wait for a key on the matrix keyboard, then print the eight rows
; and the joystick's byte.
BDOS	EQU	$0005
%INCLUDE "ABI.INC"

	ORG	$0100
	CALL	CHKHW		; the numbers below hold only on ABI 5
	JP	NZ,NOTHW
	LD	C,TNINFO	; is there a matrix keyboard to wait for?
	CALL	ABICALL
	BIT	0,B		; INFO's matrix bit
	LD	DE,NOMTX
	JP	Z,SAY		; none: the wait would never end
WAIT:	CALL	SCAN		; until a key is down
	JR	Z,WAIT
	LD	C,TNJOY		; the same moment, read as the joystick
	CALL	ABICALL
	LD	A,B		; its bits
	LD	(STICK),A	; printed after the rows
	LD	HL,BUF		; the eight rows, on one line
	LD	B,8
SHOW:	LD	A,(HL)		; one row's byte
	INC	HL
	PUSH	BC		; the count, across the printing
	CALL	HEX
	LD	E,' '		; BDOS console output
	LD	C,2
	PUSH	HL		; the BDOS changes HL
	CALL	BDOS
	POP	HL
	POP	BC
	DJNZ	SHOW
	LD	A,(STICK)	; JOY's bits
	LD	DE,MSGJOY
	CALL	LABHEX
	LD	DE,CRLF		; end the line
	CALL	SAY
DRAIN:	CALL	SCAN		; end only when every key is up
	JR	NZ,DRAIN
	RET

; Read the rows into BUF. Returns Z if no key is down, NZ if one is.
; Changes AF, BC, DE and HL.
SCAN:	LD	HL,BUF		; eight bytes, row 0 first
	LD	C,TNKEYS
	CALL	ABICALL
	LD	HL,BUF		; OR the rows together
	LD	B,8
	XOR	A		; nothing seen yet
SCAN1:	OR	(HL)		; a key leaves a bit set
	INC	HL
	DJNZ	SCAN1
	OR	A		; Z if every row was 0
	RET

NOMTX:	DB	"no matrix keyboard",13,10,"$"
MSGJOY:	DB	" JOY $"
CRLF:	DB	13,10,"$"
BUF:	DS	8		; the rows, as KEYS leaves them
STICK:	DS	1		; JOY's byte
%INCLUDE "HWLIB.ASM"
```

In the `--board pico` model the `@key` operation held `x`, located in row 7:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card hw.img --board pico B: 'TAS ROWS' '@start ROWS' '@key x'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS ROWS
ROWS.COM written

B:WORK>ROWS
00 00 00 00 00 00 00 08  JOY 00

B:WORK>
```

<!-- TEC-OS 8b69e51, the same run with "@key 5": node tools/capture.mjs --card hw.img
     --board pico B: "TAS ROWS" "@start ROWS" "@key 5" -->
The joystick and matrix share inputs. JOY reads port `FEh` with address line
11 low, the same selection as KEYS row 3. The alternate `5` run therefore
printed:

```text
00 00 00 01 00 00 00 00  JOY 01
```

Row-3 keys can set joystick bits and joystick lines appear as row-3 keys,
including through console input. Model bit 0 produces `5`. Appendix B names
the joystick bits for diagnosis.

## Claiming the PICO9918

Graphics require a PICO claim before changing the chip. VIDEO, service 3,
takes B = 1 to claim and B = 0 to release. Other values return status 1
without changing the flag. Both valid modes return status 2 if no PICO
answered at cold boot.

A claim suppresses console output, cursor drawing and page flips on PICO. The
program may then select a graphics mode and access video memory, VRAM, through
data port `BEh` and control port `BFh`. Print PICO console messages before
claiming or after releasing. The separate character LCD remains available
throughout.

Release restores the mode, font and displayed page if the ROM PICO console
started at cold boot. It also clears the screen and homes the cursor when PICO
is selected. With the Matrix switch disabled that console never started so
release leaves the programmed display alone. Warm boot still writes 80h to
register 1 first, blanking the display.

The claim is a flag with no owner identity. Warm boot clears it through the
same path so it ends with the program. Releasing an unclaimed display has no
effect and returns status 0.

Starting the ROM PICO console also publishes the named PICO registry record.
Programs can obtain its graphics entry table through that record instead of
internal ROM addresses. Appendix B lists the table. Its register, fill, write
and read entries require a claim. Record version 4 retains version 3's width
entry, which requires the display to be unclaimed.

FONT, service 15 added in ABI 5.1, returns the font address in HL. TEC Compact
has 96 characters beginning at `20h`, each represented by eight bytes from the
top row down. Five pixels occupy bits 7–3 in each row. Both display drivers
use it. Obtain its address from the result instead of embedding a ROM address.


## Text at a screen position

Positioned text needs no cursor movement or scrolling. PUTAT, service 7,
writes B characters from HL at zero-based row D and column E. It bypasses
escape parsing and clips at the right edge.

PUTAT first requires a usable video console. Serial/BAT and a claimed PICO
console return status 2 even for a zero count. On an available display a zero
count succeeds without reading text or changing the cursor image. For nonzero
text the call removes the cursor image before testing the row. A row below the
display writes nothing and returns status 0. A later input wait may draw the
cursor again.

PLACE demonstrates plain and reverse text. It writes TEC-OS twice with bit 7
set in every byte of the second copy:

```asm
; PLACE: write a word at two screen positions with PUTAT, plain and in
; reverse, leaving the cursor where it is.
BDOS	EQU	$0005
%INCLUDE "ABI.INC"

	ORG	$0100
	CALL	CHKHW		; the numbers below hold only on ABI 5
	JP	NZ,NOTHW
	LD	DE,$0A1E	; row 10, column 30
	LD	HL,PLAIN
	CALL	WRITE
	LD	DE,$0B1E	; the row below
	LD	HL,INVERT
	CALL	WRITE
	LD	DE,MSG		; A holds the second call's status
	CALL	LABHEX
	LD	DE,CRLF		; end the line
	JP	SAY		; prints and ends the program

; Write the six characters at HL at row D, column E. Returns the status
; in A. Changes F, BC, DE and HL.
WRITE:	LD	B,6
	LD	C,TNPUTAT
	JP	ABICALL		; its RET is this routine's

PLAIN:	DB	"TEC-OS"
INVERT:	DB	$D4,$C5,$C3	; "TEC" with bit 7 set: reverse images
	DB	$AD,$CF,$D3	; "-OS", the same
MSG:	DB	"PUTAT status $"
CRLF:	DB	13,10,"$"
%INCLUDE "HWLIB.ASM"
```

PUTAT passes each byte directly to the display routine. PICO and GLCD.SVC
interpret `80h–FFh` as reverse images of `00h–7Fh`. Ordinary video-console
output drops those high bytes as Chapter 17 explains. Serial transmits all
eight bits. PUTAT can therefore select reverse characters without escapes. The
text decoder used for this PICO capture omits attributes so both copies appear
alike:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card hw.img --board pico --screen B: 'TAS PLACE' PLACE. The full screen, with trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:                   TEC-OS
B:WORK>TAS PLACE              TEC-OS
PLACE.COM written

B:WORK>PLACE
PUTAT status 00

B:WORK>
```

At 40 columns the copies occupy rows 10 and 11 from column 30, replacing the
ends of the earlier command lines. PUTAT leaves the cursor where it was so the
status and next prompt appear below them.

On the 8-row GLCD, row 10 is outside the display. PLACE writes nothing and
reports 0. It reports 2 on serial or when a claimed PICO is the console. A
PICO claim leaves PUTAT usable on a selected GLCD console. Portable code
checks the ABI first and retains a BDOS fallback for status 2.

The host model shows a different cost balance on the two displays. At 80
columns a 61-character PICO PUTAT call takes 30,907 T-states, about 507 per
character. Function 2 takes 4,030 for a character, roughly eight times as
much. For 15 GLCD characters starting at row 3 column 2, PUTAT takes about
35,750 T-states per character against function 2's 35,060. Pixel drawing
dominates there. Appendix B gives the per-cell figures and measurement
conditions.

## DEMO

DEMO combines the individual calls with direct drawing. It reports INFO, beeps
through TONE with B = 120 and DE = 400 and writes four LCD rows. With INFO bit
1 set it claims PICO and uses Graphics I through the ports for colour bars and
a bouncing ball.

Its main loop scans a hexadecimal counter onto the digits, scans the LED rows,
moves an active graphics ball and polls input. Every 32nd pass also reads the
clock for LCD row 3. Exit sends dark patterns to the digits and LEDs and
releases any active claim.

The starter card, also used by the web page, contains `programs/DEMO.ASM` as
source rather than DEMO.COM. `TAS DEMO` builds the executable on the card and
`DEMO` runs it. `TED DEMO.ASM` opens the source (`tools/media.mjs:229-232`,
`tools/media.mjs:282-283`, `test/demo.test.mjs:1-4`,
`test/starter.test.mjs:191-216`). This capture builds and runs it there:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen 'TAS DEMO' '@start DEMO' '@key x'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>TAS DEMO
DEMO.COM written

A:SYSTEM>DEMO

TEC-OS hardware services demo
PICO9918: yes   GLCD: no   clock: yes
Watch the LCD, the digits, the LEDs and the screen.
Press any key to stop.

Demo stopped.

A:SYSTEM>
```

`GLCD: no` is INFO bit 2's result. It does not establish physical absence.
Startup installed no GLCD service because PICO was selected. The transcript
records console bytes, including lines printed before the claim. After release
the same run's text-screen dump contained:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen 'TAS DEMO' '@start DEMO' '@key x'. The full screen; trailing empty rows omitted. -->
```text

Demo stopped.

A:SYSTEM>
```

DEMO itself scans the 8 × 8 LEDs because no hardware service does so. Each
loop writes a pass over eight rows using the wiring in Appendix G. Those
independent ports require no shared-port state like DIGIT or VIDEO.
