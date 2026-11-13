---
title: Use the board's devices
parent: TEC-OS
nav_order: 12
nav_group: "Writing programs"
---

# 12. Use the board's devices

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

The BDOS handles files and console text. TEC-OS's numbered ROM calls also let
your program light the digits, sound the speaker, read the clock or write the
board's displays. A signature and version check comes before those calls so the
program can still end safely on another CP/M system.

## Numbered calls and shared ports

A hardware port is an address used by Z80 IN and OUT instructions to read or
write a device. It is separate from a memory address. Direct port writes can
affect devices TEC-OS is using at the same time.

Port `01h` selects a 7-segment digit with bits 0–5, drives the speaker with bit
7 and carries serial transmission with bit 6. Leaving bit 6 low during a digit
scan or tone sends noise on a possible console connection. The PICO9918 can also
be the console so changing its registers can disrupt terminal output. The ROM
calls keep the serial line idle during digit and tone output and record display
claims before graphics access.

These *numbered services* are routines already in ROM. They are different from a
resident service such as `GLCD.SVC`, which is a file installed in RAM. A
numbered call selects a routine through an entry address. A resident service can
itself make such calls. Chapter 14 explains resident programs.

## The ABI and its entry address

An *application binary interface*, or ABI, specifies entry addresses, register
arguments and results that compiled programs can use. TEC-OS's fixed interface
occupies eight bytes at `C003h`, after the reset jump:

| Address | Name | Contents |
| --- | --- | --- |
| `C003h` | `ABITAB` | the letters `TNA` |
| `C006h` | `ABIMAJ` | the major version, 5 |
| `C007h` | `ABIMIN` | the minor version, 1 |
| `C008h` | `ABICALL` | a jump: the numbered services |

The three letters `TNA` are the *signature*. They distinguish this table from
unrelated bytes at the same address on another system. `ABIMAJ` and `ABIMIN`
give its ABI version, 5.1. That is separate from the ROM's product version,
which INFO reports later.

A program checks the signature and major version before calling `C008h`. The
major must be exactly 5. A new major may renumber services while a new minor
adds numbers at the end. Code using the 5.0 calls can therefore run on 5.1. A
program requiring an added minor-version call must check that version too.

`ABICALL` is a jump into the dispatcher, not a table of separate fixed routine
addresses. The selected routines can move between builds. Their numbers,
argument contracts and the fixed ABI entry remain the interface. The reset jump
itself also has a fixed location at `C000h`.

The ROM assembles from `src/abi.inc`, whose public copy is `dist/abi.inc`. The
examples include it as `ABI.INC` for names such as ABICALL and TNLCD. These
constants define no executable bytes. `%INCLUDE` inserts the named file's
contents into the assembly source.

## Registers, status and stack

Chapter 9 introduced byte registers and register pairs. For a numbered call, C
selects the service. B is a byte argument and DE or HL can hold word values or
buffer addresses according to that service's contract. A carries no argument
because the dispatcher uses it during selection. The program calls ABICALL after
loading those inputs.

The nine hardware calls, numbers 0–8, return status in A with these flags:

| Status | Flags | Meaning |
| ---: | --- | --- |
| 0 | zero set, carry clear | success |
| 1 | carry set | no such service, an argument out of range or a request rejected with nothing changed |
| 2 | carry set | the device isn't fitted or isn't the console |

`JP NZ` or `JP C` detects a hardware-call failure. The documented result
registers hold the outputs. Save any other values the program needs across the
call rather than depending on their previous contents. Hardware calls preserve
IX, IY and the alternate registers. Appendix B gives each complete register
contract.

A number from `TNCOUNT`, 17, upwards returns status 1 with B, DE and HL
unchanged. The hardware numbers identify these routines:

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

The other numbers extend the same ABI. Numbers 9–11 mount, unmount and describe
volumes, as Chapter 18 explains. Number 12 registers the GLCD video-driver
table. Numbers 13 and 14 find or enumerate named records in the registry
described in Chapter 14. Those registry calls have their own result convention,
including a generation in A, so their callers test carry rather than applying
the hardware status rule. Number 15 returns the ROM font and was added in ABI
5.1. Number 16, `TNSHELL`, sets the shell hook that Chapter 21 describes
(`src/abi.inc:208-236`).

The hardware services use the caller's stack. PUTAT has the largest bound: 22
bytes below the return address supplied by CALL. That fits the inherited 30-byte
allowance from Chapter 11 but a caller must also count its own nested calls and
saved registers. Appendix B lists the individual bounds. These are bounds, not
newly measured peaks.

None of the nine hardware services calls the BDOS. They can be called from code
already inside a BDOS call, such as a BIOS-table hook. This does not apply to
every numbered service: MOUNT and UNMNT call BDOS function 37 and must be called
from outside an active BDOS call. Their register-preservation exceptions are
also listed in Appendix B.

## The shared signature check and print routines

CHKHW compares four bytes: `TNA` followed by major version 5. It returns with Z
set only when all four match. On failure the examples branch to NOTHW, which
prints a message through BDOS function 9 and ends without using a hardware port.

The examples share this complete `HWLIB.ASM`. It contains both code
and data so each program includes it after its own entry code. SAY prints a
dollar-terminated string. A CALL to SAY returns to its caller while a top-level
jump to it prints and ends through the inherited return word. LABHEX prints a
label followed by A in hexadecimal. It saves A and HL across the string output.
A *nibble* is four bits, half a byte. HEX prints the two nibbles through NIBBLE.

A *binary-coded decimal* byte, or BCD byte, stores one decimal digit in each
nibble. Printing its two nibbles as hexadecimal also displays those decimal
digits. The clock examples use that representation.

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

The programs below assemble with the starter card's TAS.

## The board's report

INFO, number 0, reports device state without taking an argument. It returns B's
device bits, the ROM's version in DE and the console's size in HL. L is the
column count and H the row count. A program checks these results before using an
optional device. B's defined bits are:

| `B` bit | Value | Set when |
| ---: | ---: | --- |
| 0 | `01h` | the matrix keyboard is enabled by the board's Matrix switch |
| 1 | `02h` | a PICO9918 answered at cold boot |
| 2 | `04h` | `GLCD.SVC` is in |
| 3 | `08h` | a DS1302 clock answered at cold boot |
| 4 | `10h` | the PICO9918 is claimed |
| 7 | `80h` | the ROM's word `GLCD?` is on LCD row 3 |

D holds the ROM version's major and E its minor so `0001h` means version 0.1
rather than ABI 5.1. BOARD prints the report in hexadecimal and then calls
`TNCOUNT`, the first number past the last service, to demonstrate the
out-of-range status:

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

These host commands place ABI.INC, HWLIB.ASM and BOARD.ASM beside each other
on a copy of the starter card. TAS uses the included files on the card when it
assembles BOARD:

```sh
cp dist/starter.img hw.img
node tools/tecvol.mjs put hw.img B dist/abi.inc --text
node tools/tecvol.mjs put hw.img B hwlib.asm --text
node tools/tecvol.mjs put hw.img B board.asm --text
```

Each later example's source goes on `hw.img` in the same way. `TAS BOARD` reads
BOARD.ASM on the current drive and writes BOARD.COM beside it. TAS.COM is on A
so the program search described in Chapter 5 finds it from B. In the
serial-model configuration, the clock set INFO's bit 3 and the console size was
zero:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card hw.img B: 'TAS BOARD' BOARD. Complete captured console transcript. -->
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

The `--board pico` model configuration includes the PICO9918, graphics LCD and
matrix keyboard. Cold boot selected the PICO console at 40 columns. Its device
bits were `0Bh` and its size was `28h` by `18h` (40 by 24). The startup
GLCD.SVC line installed nothing while PICO was the console. This is a host-model
run, not a browser capture:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card hw.img --board pico B: 'TAS BOARD' BOARD. Complete captured console transcript. -->
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

In the GLCD-only configuration, `--board glcd`, GLCD.SVC installed and became
the console. The same report gave device bits `0Dh`, columns `15h` and rows
`08h`: 21 by 8.

A screen-layout program uses the size INFO returns. With a serial console, both
values are zero because TEC-OS cannot read the terminal's dimensions. The
program can use an 80-by-24 assumption, as the CCP does for pagination. A
console change can alter the values. After CON UC1 selects the graphics LCD,
INFO gives 21 by 8 so programs that change console must read them again.

## The LCD and the speaker

The 20 × 4 character LCD is separate from the console. LCD, number 2, writes
exactly 20 characters from HL to row B, numbered 0–3. Shorter messages need
space padding. B of 4 or more returns status 1 before any write. LCDMSG uses row
1 and then calls TONE, number 4, for a beep:

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

This run requested the character LCD's rows with `--lcd`:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card hw.img --lcd B: 'TAS LCDMSG' LCDMSG. Complete captured console transcript and LCD rows. -->
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

The same run's LCD text showed the message on its second row. The other rows
retained cold-boot text:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card hw.img --lcd B: 'TAS LCDMSG' LCDMSG. LCD rows only; trailing empty rows omitted. -->
```text
TEC-OS 0.1  TEC-1G
Hello on the LCD
B: WORK
```

The row remains after program exit. On another ABI major, the signature check
takes NOTHW instead, printing `not TEC-OS with ABI 5` and leaving the character
LCD untouched.

Row 3 has a separate ownership mark for the ROM's `GLCD?` message. When GLCD.SVC
installs, TEC-OS clears that message only while the mark is set. An LCD call
writing row 3 clears the mark. Later driver installation therefore preserves the
program's replacement text. Chapter 8 explains the startup message.

TONE toggles port `01h` bit 7. B controls the delay and DE the number of half
cycles. Between ordinary toggles the delay is 16 × B + 51 T-states. A full cycle
takes two such intervals. At 4 MHz the frequency is therefore 2,000,000 divided
by that sum.

With B = 120, the interval is 1,971 T-states and the frequency is about 1,015
Hz. DE = 400 gives about 0.2 seconds, as in LCDMSG. For a duration in seconds,
the half-cycle count is frequency × 2 × seconds. B = 0 counts as 256, giving
about 482 Hz, while B = 1 gives about 29,851 Hz. DE = 0 returns immediately
without sound. These are instruction-derived relationships. Appendix B
distinguishes the final interval and call overhead.

TONE blocks until its half cycles finish so the caller does no other work during
the sound. A nonempty tone ends with the speaker off. The routine keeps the
serial transmit line idle while driving the speaker.

## The digits and the clock

The six 7-segment digits share their segment wiring. Port `02h` sets the pattern
and port `01h` selects which digit lights. A steady-looking display requires
repeated scans, with each digit lit only during its own turn.

DIGIT, number 1, scans once through six pattern bytes at HL, leftmost first. It
turns every digit off at the end. On the host model it takes
20,660 T-states from the call target to return, about 5.2 ms at 4 MHz. Its
port writes put 3,348 T-states, about 0.84 ms, between selecting each digit
and turning it off. The caller repeats the scan and supplies its
own number-to-segment table.

RTC, number 8, transfers seven BCD bytes through HL: seconds, minutes, hours,
date, month, weekday and year. B = 0 reads and B = 1 sets them. Setting ends
with the clock's write protection enabled. Any other B gives status 1 without
changing the clock. A failed clock probe gives status 2. INFO bit 3 separately
records whether the clock answered at cold boot.

DIGCLK repeats DIGIT and checks for a key with BDOS function 6. Every 32nd pass
it first reads the clock and converts hours, minutes and seconds into six
patterns. Its initial counter value makes the first pass read too:

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

DIGIT leaves the digits dark between calls. Other work in the loop reduces the
time they are lit and can produce visible flicker if it takes too long. DIGCLK
does a BDOS input check each pass and a clock read every 32nd pass. When it
exits, the final DIGIT call has already turned the digits off.

NOW reads the same seven-byte clock buffer and prints its fields in date order.
The clock stores only two year digits so this example supplies the century text
`20` itself:

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

PLAN contains field-offset/separator pairs. NOW uses each offset to select a BCD
byte, prints it through HEX and then prints its separator. The TAS and run
capture was:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card hw.img B: 'TAS NOW' NOW. Complete captured console transcript. -->
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

That model run began with its clock at 12:00 on 1 November 2026. The clock
advances with emulated T-states, including those used while TAS assembles. Its
weekdays start at 1 for Monday so the captured Sunday is `07`.

## The keys and the joystick

Character input reports keys one at a time. A game may instead need the matrix
switches held down during a scan. KEYS, number 6, stores eight row bytes at HL,
row 0 first, with a 1 for each pressed switch. JOY, number 5, returns active
joystick lines as 1 bits in B.

KEYS and JOY always return status 0. They do not test the Matrix switch or
report device absence. ROWS therefore checks INFO bit 0 before waiting for a
key, then prints the matrix rows and joystick byte:

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

The `--board pico` configuration has a matrix keyboard. Its `@key` input
pressed `x`, which is in row 7:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card hw.img --board pico B: 'TAS ROWS' '@start ROWS' '@key x'. Complete captured console transcript. -->
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
JOY reads port `FEh` with address line 11 low. KEYS selects row 3 in the same
way so those inputs share wiring. In the alternate `5` run, the row was
`00 00 00 01 00 00 00 00  JOY 01`. A row-3 matrix key can therefore appear as a
joystick bit. A joystick line also appears in row 3, including at the console.
On the model, bit 0 types `5`. Appendix B gives the diagnostic names for the
joystick bits.

## Claiming the PICO9918

Before using PICO graphics, a program calls VIDEO, number 3, with B = 1 to claim
the chip. B = 0 releases it. Other values give status 1 without changing the
claim. When no PICO9918 answered at cold boot, both valid modes return status 2.

While the PICO is claimed, console output to it is discarded. The terminal also
suppresses its cursor and page flips. The program can set a graphics mode and
use the chip's video memory (VRAM) through data port `BEh` and control port
`BFh`. Messages intended for the PICO must be printed before the claim or after
release. The separate character LCD remains available during the graphics work.

A release restores the ROM PICO console's mode, font and displayed page when
that console started at cold boot. If it is the selected console, the release
also clears the screen and homes the cursor. With the Matrix switch disabled the
PICO console did not start so release leaves the chip's programmed state alone.
Warm boot first writes 80h to that chip's register 1, though, which blanks the
display.

The claim records a flag rather than an owner identity. Warm boot releases it
through the same path so an exiting program's claim ends too. Release with no
active claim does nothing and returns status 0.

When the ROM PICO console started, it also registered a named PICO record. That
record supplies the graphics entry table listed in Appendix B. The register,
fill, write and read entries require a claim. Programs obtain the table through
the registry rather than fixed internal ROM addresses. The record is
version 4. It keeps version 3's width entry, which instead requires an
unclaimed display.

FONT, number 15 in ABI 5.1, returns the ROM console font address in HL. It
contains 96 characters from `20h`, each eight bytes with the top row first.
The selected data is TEC Compact. Each row has five pixels in bits 7–3. Both
display drivers use this font. Its address is a result, not a fixed address for
a program to embed.

DEMO below claims the PICO when INFO bit 1 is set, draws through the ports until
a key is received and then releases it.

## Text at a screen position

PUTAT, number 7, writes text at a position without moving the console cursor or
scrolling. B is the count, HL the character address and D/E the zero-based
row/column. It bypasses the escape-sequence parser and clips at the right edge.

A usable video console is required before any count or position succeeds.
Serial/BAT output and a claimed PICO console return status 2, even for zero
characters. On an available video console, a count of 0 returns status 0 without
reading source bytes or changing the cursor image. For a nonzero count, PUTAT
removes the cursor image before checking the row. A row below the screen writes
nothing and returns status 0. The next input wait can draw the cursor again.

PLACE writes TEC-OS at two positions. The second string has bit 7 set in each
byte so the display driver draws the reverse images:

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

PUTAT sends bytes directly to the display routine. Both the ROM PICO console and
GLCD.SVC draw `80h–FFh` as reverse images of `00h–7Fh`. The ordinary
video-console path drops those high bytes, as Chapter 17 explains. Serial
output transmits all eight bits. This makes PUTAT a direct
route to reverse characters without an escape sequence. The PICO text capture
shows both strings alike because its decoder does not report reverse
presentation:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card hw.img --board pico --screen B: 'TAS PLACE' PLACE. Full screen; trailing empty rows omitted. -->
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

In this 40-column run the two copies went to rows 10 and 11 at column 30,
over the ends of the earlier command lines there. The cursor did not move, so
PLACE's status line and the next prompt appeared below them.

On the 8-row graphics LCD, PLACE's row 10 is below the display so it writes
nothing and reports status 0. On serial it reports status 2. It also reports 2
while the PICO is both claimed and the console. A claim on PICO leaves PUTAT
available on the graphics-LCD console. Portable code checks the ABI before PUTAT
and retains a BDOS path for status 2.

On the host model at 80 columns a PICO PUTAT character costs about an eighth
of BDOS function 2: one 61-character call takes 30,907 T-states, about 507 a
character, and function 2 takes 4,030 for one. On the graphics LCD a call of
15 characters from row 3, column 2 takes about 35,750 T-states a character,
against about 35,060 for function 2. Pixel drawing dominates both paths. Appendix B retains
the per-cell figures and their conditions.

## DEMO

DEMO combines INFO, TONE, LCD, VIDEO, DIGIT and RTC with its own drawing code.
It reports devices, beeps with B = 120 and DE = 400 and writes all four
character-LCD rows. When INFO bit 1 is set, it claims the PICO and sets Graphics
I through the ports for colour bars and a bouncing ball.

Every 32nd loop reads the clock for LCD row 3. Each loop scans a hexadecimal
counter onto the digits, scans the LED rows, moves the ball when graphics are
active and polls for a key. On exit it sends dark digit/LED patterns and
releases an active claim.

The source is `programs/DEMO.ASM`, and the one card, which the web page
also runs, holds that source in place of DEMO.COM. `TAS DEMO` builds
DEMO.COM on the card, `DEMO` then runs it and `TED DEMO.ASM` opens the source
(`tools/media.mjs:223-226`, `tools/media.mjs:273-274`,
`test/demo.test.mjs:1-4`, `test/starter.test.mjs:186-211`). This run builds
and runs it on the starter card:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen 'TAS DEMO' '@start DEMO' '@key x'. Complete console transcript; the separate trailing raw screen is omitted. -->
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

Here `GLCD: no` reports INFO bit 2, not the physical absence of the display. The
startup GLCD.SVC line installed nothing because PICO was the console. The
transcript contains the console bytes sent during the run. The PICO showed its
initial lines before the claim. The same run's text-screen dump after release
was:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen 'TAS DEMO' '@start DEMO' '@key x'. Full screen; trailing empty rows omitted. -->
```text

Demo stopped.

A:SYSTEM>
```

No hardware service scans the 8 × 8 LEDs. DEMO writes those ports itself, one
pass over eight rows each loop. Appendix G gives their wiring. Those ports carry
neither the serial transmit line nor console output so those writes do not
require the shared-port state used by DIGIT or VIDEO.
