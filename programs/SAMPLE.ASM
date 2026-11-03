; SAMPLE.ASM: a first program for TEC-OS, in TAS's language. It says hello
; on the console through the BDOS, asks TEC-OS for the screen's size and
; prints it, writes a line on the LCD, shows 123456 on the digits for a
; moment, beeps, and goes back to the prompt. Build it and run it:
;
; 	A>TAS SAMPLE
; 	A>SAMPLE
;
; Any CP/M program can say hello. The rest uses TEC-OS's table, so the
; program looks for the table first and stops politely without it.

; TEC-OS's table and service numbers, by the names abi.inc gives them.
ABITAB	EQU	$C003		; "TNA", then the major version
ABIMAJ	EQU	$C006		; the major version this speaks: 5
ABICALL	EQU	$C008		; CALL here with the service in C
TNINFO	EQU	0		; -> L = columns, H = rows
TNDIGIT	EQU	1		; HL -> six digit patterns
TNLCD	EQU	2		; B = row 0-3, HL -> 20 characters
TNTONE	EQU	4		; B = pitch, DE = length
BDOS	EQU	5		; CP/M's entry, for the console

	ORG	$0100		; CP/M runs a program from here

; Say hello: BDOS function 9 prints from DE up to the $.
START:	LD	DE,HELLO
	CALL	SAY

; Is this TEC-OS? Its table starts "TNA", and this program needs major 5.
	LD	HL,ABITAB	; what is at the table's address
	LD	DE,TNA		; against the signature
	LD	B,3		; three letters
CHECK:	LD	A,(DE)
	CP	(HL)
	JR	NZ,OTHER	; another system: stop here
	INC	HL		; on to the next letter of each
	INC	DE
	DJNZ	CHECK
	LD	A,(ABIMAJ)	; the version of the table
	CP	5
	JR	NZ,OTHER	; a version this doesn't speak

; The screen's size from INFO: L columns, H rows, 0 on a serial terminal.
	LD	C,TNINFO	; service 0
	CALL	ABICALL
	LD	(SIZE),HL	; kept: the BDOS changes HL
	LD	DE,SCREEN	; "Screen: "
	CALL	SAY
	LD	A,(SIZE)	; the columns
	CALL	DECIMAL
	LD	DE,BY		; " by "
	CALL	SAY
	LD	A,(SIZE+1)	; the rows
	CALL	DECIMAL
	LD	DE,CRLF		; and the line's end
	CALL	SAY

; A line on the LCD's second row: rows count from 0.
	LD	B,1
	LD	HL,LCDTXT	; exactly 20 characters
	LD	C,TNLCD
	CALL	ABICALL

; 123456 on the digits. One call lights them once, for about 5 ms, so a
; loop of 200 calls shows them for about a second.
	LD	B,200		; the passes
SHOW:	PUSH	BC		; the service changes B
	LD	HL,DIGITS	; a pattern for each digit, left first
	LD	C,TNDIGIT
	CALL	ABICALL
	POP	BC
	DJNZ	SHOW		; until the passes are done

; A short beep. B sets the pitch: each half of a cycle is 16 x B + 51
; T-states, about 2 kHz here. DE half cycles make it about 0.1 s long.
	LD	B,60
	LD	DE,400
	LD	C,TNTONE
	CALL	ABICALL
	LD	DE,DONE		; and say so
; Print DE's message, then return to the CCP, which shows the prompt.
OTHER:	CALL	SAY
	RET			; the CCP's return address is on the stack

; SAY: print the string at DE, up to its $. Changes AF, BC, DE, HL.
SAY:	LD	C,9		; BDOS function 9
	JP	BDOS		; which returns to SAY's caller

; DECIMAL: print A, 0 to 255, in decimal without leading zeros. Changes
; AF, BC, DE, HL.
DECIMAL:	PUSH	AF	; the number, across the flag's reset
	XOR	A		; no digit printed yet
	LD	(LEAD),A
	POP	AF
	LD	B,100		; the hundreds
	CALL	PLACE
	LD	B,10		; the tens
	CALL	PLACE
	ADD	A,'0'		; the units, always printed
	LD	E,A
	LD	C,2		; BDOS function 2: one character
	JP	BDOS

; PLACE: print how many times B goes into A, unless it is a leading zero.
; Returns A less those times B. Changes BC, DE, HL.
PLACE:	LD	C,'0'-1		; one before the digit 0
PLACE1:	INC	C		; count each B taken away
	SUB	B
	JR	NC,PLACE1	; until A goes below 0
	ADD	A,B		; one B too many: put it back
	LD	D,A		; what is left, for the next place
	LD	A,C
	CP	'0'
	JR	NZ,PLACE2	; a digit above 0 is always printed
	LD	A,(LEAD)	; and 0 only after another digit
	OR	A
	JR	Z,PLACE3
PLACE2:	LD	(LEAD),A	; a digit is out now
	LD	E,C
	PUSH	DE		; the BDOS changes D
	LD	C,2		; BDOS function 2: one character
	CALL	BDOS
	POP	DE
PLACE3:	LD	A,D		; what is left
	RET

; The text and the patterns.
TNA:	DB	"TNA"		; TEC-OS's signature
HELLO:	DB	"Hello from TEC-OS.",13,10,"$"
SCREEN:	DB	"Screen: $"	; the size, as "80 by 24"
BY:	DB	" by $"
CRLF:	DB	13,10,"$"	; return, then a new line
DONE:	DB	"Back to the prompt.",13,10,"$"
; The LCD's row: 20 characters, padded with blanks.
LCDTXT:	DB	"Hello from SAMPLE   "
DIGITS:	DB	$28,$CD,$AD	; 1, 2 and 3, a bit a segment
	DB	$2E,$A7,$E7	; 4, 5 and 6
SIZE:	DW	0		; INFO's columns, then rows
LEAD:	DB	0		; 1 once a digit is printed
