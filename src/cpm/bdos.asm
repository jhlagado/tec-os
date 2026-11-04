; Portable CP/M BDOS, CP/M 2.2 interface profile.
;
; TEC-OS ROM-resident adaptation of Portable CP/M (see PROVENANCE.md). Code
; and constant text stay in ROM. Every variable and the BDOS stack live in the
; BDOS RAM block in src/ram.asm, which the BIOS clears at cold and warm
; boot before setting CURDMA to $0080.

BDOSBAS:

; The BDOS reaches the BIOS through the RAM copy of its jump table, as CP/M
; 2.2 does with its BIOS in RAM, so a program that replaces an entry there
; sees the BDOS's own calls: its console output and input, ^C and the warm
; boot after a disk error.
BIOWBT	EQU	RAMBIOS+$03
BIOCST	EQU	RAMBIOS+$06
BIOCIN	EQU	RAMBIOS+$09
BIOCOT	EQU	RAMBIOS+$0C
BIOLST	EQU	RAMBIOS+$0F
BIOPUN	EQU	RAMBIOS+$12
BIORDR	EQU	RAMBIOS+$15
BIOHOM	EQU	RAMBIOS+$18
BIOSEL	EQU	RAMBIOS+$1B
BIOTRK	EQU	RAMBIOS+$1E
BIOSEC	EQU	RAMBIOS+$21
BIODMA	EQU	RAMBIOS+$24
BIORDS	EQU	RAMBIOS+$27
BIOWRS	EQU	RAMBIOS+$2A
BIOTRN	EQU	RAMBIOS+$30

CTRLC	EQU	3
CTRLE	EQU	5
BACKSP	EQU	8
TAB	EQU	9
LF	EQU	10
CR	EQU	13
CTRLP	EQU	16
CTRLR	EQU	18
CTRLS	EQU	19
CTRLU	EQU	21
CTRLX	EQU	24
CTRLW	EQU	23
CTRLN	EQU	14
SPACE	EQU	32
DELETE	EQU	$7F


; Function 47, chain (TEC-OS's, from CP/M 3's): the command at the DMA
; address, ended by a 0 within 128 bytes and holding no CR or LF, replaces
; what is left of the CCP's line, and the program ends by warm boot; the CCP
; runs it next, before any startup line. It may hold ! and :, and E is
; ignored. Otherwise A = FFh and the program goes on, the line unchanged.
; FNCHNO is also the FFh return for functions 44 and 99.
FNCHAIN:
	LD	HL,(CURDMA)	; the command at the DMA address
	LD	B,128		; its 0 must come within 128 bytes
FNCH1:	LD	A,(HL)		; the command's next byte
	OR	A
	JR	Z,FNCH2		; its 0: the command fits
	CP	CR		; a CR or LF would end the CCP's line
	JR	Z,FNCHNO
	CP	LF
	JR	Z,FNCHNO
	INC	HL		; none of those: on
	DJNZ	FNCH1		; no 0 in 128 bytes: refused
FNCHNO:	LD	A,$FF		; refused, or not supported: A = FFh
	JR	RETA
FNCH2:	LD	HL,(CURDMA)	; the command, its 0 and what follows
	LD	DE,CMDTXT	; over the CCP's command line
	LD	BC,128		; the 128 bytes the check allowed
	LDIR
	LD	A,1		; its first piece next
	LD	(CHPOS),A
	JP	BIOWBT		; the program ends; the CCP runs it

; ^C at a line's start and a BDOS error's exit end the program by warm boot,
; and the rest of a chained line goes with it. Never returns.
CHDROP:	XOR	A		; no chained piece left
	LD	(CHPOS),A	; the CCP reads it after warm boot
	JP	BIOWBT

; The BDOS's entry, reached by CALL 0005h with C the function and DE its
; parameter. It keeps the caller's SP in OLDSP and DE in PARAM, and runs on
; the BDOS's own stack. Functions 44 to 48, 99 and 108 go to their routines
; here, and any other past 40 returns A = 0. The rest go through FNTAB, those
; with their bit set in FCBMAP after their FCB's drive is bound (FCBSEL).
; Each routine is entered by a jump, with C the function and DE the
; parameter, and ends at RETZERO, RETA or RETWORD, which return to the
; program. Any register may change.
BENTRY:
	LD	(OLDSP),SP	; the caller's stack, for the return
	LD	SP,STKTOP	; the BDOS's own stack
	LD	(PARAM),DE	; the parameter, for the function
	LD	A,C
	CP	108		; the functions FNTAB does not hold
	JR	Z,FNRETC	; 108: the program's return code
	CP	47
	JP	Z,FNCHAIN	; 47: chain
	CP	44
	JR	Z,FNMULT	; 44: the multi-sector count
	CP	45
	JR	Z,FNERRM	; 45: the error mode
	CP	46
	JP	Z,FNFREE	; 46: free space
	CP	48
	JR	Z,FNFLSH	; 48: flush
	CP	99
	JR	Z,FNCHNO	; truncate: FFh, nothing changed
	CP	41		; FNTAB's 41: functions 0 to 40
	JR	NC,RETZERO	; any other past 40: A = 0
	ADD	A,A		; FNTAB's word for function C
	LD	E,A
	LD	D,0
	LD	HL,FNTAB
	ADD	HL,DE		; HL -> the routine's address
	LD	E,(HL)		; its address, low byte first
	INC	HL
	LD	D,(HL)		; DE = the routine
	LD	HL,FCBMAP-1	; its FCB bit: byte C/8, bit C mod 8
	LD	A,C
FCBBYTE:
	INC	HL		; a byte on for each 8 in C
	SUB	8		; until C/8 bytes are passed
	JR	NC,FCBBYTE
	LD	B,A		; (C mod 8) - 8
	LD	A,(HL)		; the function's byte of FCBMAP
FCBBIT:	RLCA			; 8 - (C mod 8) turns: the bit in carry
	INC	B
	JR	NZ,FCBBIT
	EX	DE,HL		; HL = the routine
	JR	NC,DISPATCH	; no FCB: straight to it
	PUSH	HL		; the routine, kept over FCBSEL
	CALL	FCBSEL		; the FCB's drive bound first
	POP	HL
DISPATCH:
	LD	DE,(PARAM)	; DE as the program gave it
	JP	(HL)		; the function; C still holds its number

; Function 44, CP/M 3's multi-sector count: E = 1, the only count, succeeds;
; any other returns FFh at FNCHNO, as function 99, truncate, does with nothing
; changed.
FNMULT:	DEC	E		; Z: a count of 1
	JR	NZ,FNCHNO

; A function's return with A = 0, as RETA below.
RETZERO:
	XOR	A		; success, or nothing to return

; A function's return with A, also in L, and H = 0, as RETWORD below.
RETA:
	LD	L,A		; the value in HL too
	LD	H,0

; A function's return with HL, also in A (L) and B (H), as CP/M 2.2 gives a
; function's value, to the program on its own stack (OLDSP). Any other
; register is as the function left it.
RETWORD:
	LD	A,L		; CP/M 2.2's convention: A = L, B = H
	LD	B,H
	LD	SP,(OLDSP)	; the caller's stack back
	RET			; to the program

; Function 0, system reset: the program ends by warm boot. Never returns.
FNZERO:
	JP	BIOWBT		; through the RAM jump table

; Function 45, CP/M 3's error mode: E = FFh, a BDOS error returns to the
; program with A = FFh and H its code, and no message; FEh, the message and
; then the same return; any other, the default: the message, a key, and the
; program ends with the rest of a chained line. Warm boot puts it back to 0.
; Returns A = 0.
FNERRM:	LD	A,E		; the mode, kept until warm boot
	LD	(ERRMODE),A
	JR	RETZERO

; Function 48, CP/M 3's flush: every changed line of the cache written. A = 0,
; or FFh if any write failed, its line then dropped; E = FFh's purge is the same
; flush, since dropping clean lines changes nothing a program can see.
FNFLSH:	CALL	VFLUSH		; A = FFh, the line CFLALL leaves
	JR	NZ,RETA		; a write failed: FFh
	JR	RETZERO

; Function 108, CP/M 3's program return code: DE = FFFFh gets it into HL;
; any other DE sets it, returning A = 0. One code for every program.
FNRETC:
	LD	HL,(PARAM)	; DE: FFFFh or the code
	LD	A,H
	AND	L
	INC	A		; Z: DE = FFFFh, a query
	JR	Z,FNRETG
	LD	(PRGCODE),HL	; any other: the new code
	JR	RETZERO
FNRETG:
	LD	HL,(PRGCODE)	; the code, returned in HL
	JR	RETWORD

; Function 1, console input: the next key, waited for and echoed, a tab as
; spaces. Returns it in A. Any register may change.
FNCIN:
	CALL	GETCHAR		; a key kept by a status check first
	LD	C,A		; ECHOCHAR takes it in C
	PUSH	AF		; the key, kept over the echo
	CALL	ECHOCHAR
	POP	AF
	JR	RETA

; Function 2, console output: E to the console, a tab as spaces, ^S and ^P
; taken from the keyboard first. Returns A = 0.
FNCOUT:
	LD	A,(PARAM)	; E, the character
	LD	C,A		; OUTCHAR takes it in C
	CALL	OUTCHAR
	JR	RETZERO

; Function 3, reader input: a byte from the BIOS's reader, returned in A.
FNREAD:
	CALL	BIORDR		; through the RAM jump table
	JR	RETA

; Function 4, punch output: E to the BIOS's punch. Returns A = 0.
FNPUNCH:
	LD	A,(PARAM)	; E, the byte
	LD	C,A		; the BIOS takes it in C
	CALL	BIOPUN
	JR	RETZERO

; Function 5, list output: E to the BIOS's printer. Returns A = 0.
FNLIST:
	LD	A,(PARAM)	; E, the byte
	LD	C,A		; the BIOS takes it in C
	CALL	BIOLST
	JP	RETZERO

; Function 6, direct console I/O: E = FFh returns a key in A, or 0 with none
; ready, neither waiting nor echoing. Any other E goes to DIROUT.
FNDIRECT:
	LD	A,(PARAM)	; E
	CP	$FF		; FFh: input
	JR	NZ,DIROUT	; not FFh: output
	CALL	CONSTAT		; a key ready, or one kept?
	OR	A
	JP	Z,RETZERO	; none: A = 0
	CALL	GETCHAR		; the key, not echoed
	JP	RETA

; Function 6's output: A, its E, to the console as it is, with no tab
; expanded, no ^S or ^P taken and no column counted. Returns A = 0.
DIROUT:
	LD	C,A		; the BIOS takes it in C
	CALL	BIOCOT		; straight to the BIOS's console output
	JP	RETZERO

; Function 7, get IOBYTE: the I/O assignments, returned in A.
FNGETIO:
	LD	A,(IOBYTE)	; at 0003h
	JP	RETA

; Function 8, set IOBYTE: E becomes the I/O assignments. Returns A = 0.
FNSETIO:
	LD	A,(PARAM)	; E
	LD	(IOBYTE),A
	JP	RETZERO

; Function 9, print string: the text at DE, up to a '$', to the console as
; function 2 sends each character. Returns A = 0.
FNPRINT:
	LD	HL,(PARAM)	; DE, the text
PRLOOP:
	LD	A,(HL)
	CP	'$'		; its end, not sent
	JP	Z,RETZERO
	INC	HL		; the next character's place
	PUSH	HL		; the place, kept over the output
	LD	C,A
	CALL	OUTCHAR
	POP	HL
	JR	PRLOOP

; Function 10, read console buffer: a line typed into the buffer at DE,
; whose first byte is its maximum; the count goes in the second and the
; characters follow. CR or LF ends it, as does reaching the maximum. The
; editing keys: BS and DEL take the last character back (BS erases it, DEL
; echoes it), ^C at the line's start ends the program, ^E starts a new
; screen line, ^R retypes the line, ^U discards it, ^X erases it and ^P turns
; the printer echo on or off. At the CCP's prompt (HFLAG) ^W and ^N recall
; the history's lines, and the line is stored there. Returns A = 0. Any
; register may change. The labels from LINTGL to LINDONE are its parts.
FNLINE:
	LD	A,(HHEAD)	; no line shown from the history yet
	LD	(HPOS),A	; HREC's starting point
	LD	HL,(PARAM)	; the buffer
	LD	A,(HL)
	LD	(LINMAX),A	; its maximum
	INC	HL
	XOR	A		; nothing typed yet
	LD	(HL),A		; its count 0, and LINCNT's
	LD	(LINCNT),A
	INC	HL
	LD	(LINPTR),HL	; the next character goes at its start
LINLOOP:
	CALL	GETCHAR		; the next key, not yet echoed
	LD	C,A		; the key, in C for the echo
	CP	CR		; CR or LF: the line ends
	JP	Z,LINDONE
	CP	LF
	JP	Z,LINDONE
	CP	CTRLP		; ^P: the printer echo
	JR	Z,LINTGL
	CP	BACKSP		; BS: back one, erased
	JR	Z,LINBACK
	CP	DELETE		; DEL: back one, echoed
	JR	Z,LINDEL
	CP	CTRLC		; ^C: the program ends
	JP	Z,LINABRT
	CP	CTRLE		; ^E: a new screen line
	JP	Z,LINEOL
	CP	CTRLR		; ^R: the line retyped
	JP	Z,LINRETY
	CP	CTRLU		; ^U: the line discarded
	JP	Z,LINCTU
	CP	CTRLX		; ^X: the line erased
	JP	Z,LINCLEAR
	CP	CTRLW		; ^W or ^N: the history
	JR	Z,LINHIST
	CP	CTRLN		; ^N: the line after
	JR	Z,LINHIST
LINCHR:
	LD	A,(LINCNT)	; any other: a character, if it fits
	LD	B,A
	LD	A,(LINMAX)
	CP	B
	JP	Z,LINDONE	; full: the key echoed and the line ends
	LD	A,C		; the character stored
	LD	HL,(LINPTR)	; at the buffer's next place
	LD	(HL),A
	INC	HL
	LD	(LINPTR),HL
	LD	A,B		; and counted
	INC	A
	LD	(LINCNT),A
	CALL	ECHOCHAR	; the character shown
	LD	A,(LINCNT)	; full now?
	LD	B,A
	LD	A,(LINMAX)
	CP	B
	JR	NZ,LINLOOP	; room for more
	LD	C,CR		; full: the line ends as if by CR
	JP	LINDONE

; ^P in a line: the printer echo turned on or off; nothing stored.
LINTGL:
	CALL	TOGLIST		; LISTEN 0 or 1
	JR	LINLOOP

; ^W or ^N in a line, in C: at the CCP's prompt, the history's line before
; or after the one shown replaces the line; in a program's line, a character.
LINHIST:
	LD	A,(HFLAG)	; FFh at the CCP's prompt
	OR	A
	JR	Z,LINCHR	; a program's call: a character
	CALL	HREC		; the line before (^W) or after (^N)
	JR	LINLOOP

; BS in a line: the last character taken back and erased from the screen;
; nothing at the line's start.
LINBACK:
	LD	A,(LINCNT)	; any character to take back?
	OR	A
	JR	Z,LINLOOP	; an empty line: nothing to take back
	DEC	A		; one fewer counted
	LD	(LINCNT),A
	LD	HL,(LINPTR)	; the buffer's place back one
	DEC	HL
	LD	(LINPTR),HL
	CALL	ERASE1		; backspace, space, backspace
	JP	LINLOOP

; DEL in a line: the last character taken back and echoed, as CP/M 2.2's
; rubout shows it; nothing at the line's start.
LINDEL:
	LD	A,(LINCNT)	; any character to take back?
	OR	A
	JP	Z,LINLOOP	; an empty line: nothing to take back
	DEC	A		; one fewer counted
	LD	(LINCNT),A
	LD	HL,(LINPTR)	; the buffer's place back one
	DEC	HL
	LD	(LINPTR),HL
	LD	C,(HL)		; the character taken back, echoed
	CALL	ECHOCHAR
	JP	LINLOOP

; ^C in a line: at its start, ^C is echoed and the program ends by warm boot
; with the rest of a chained line (CHDROP); anywhere else it is ignored.
LINABRT:
	LD	A,(LINCNT)	; the line's start?
	OR	A
	JP	NZ,LINLOOP	; within a line: ignored
	LD	HL,(LINPTR)	; a ^C left at the buffer's start
	LD	(HL),CTRLC
	LD	C,'^'		; echoed as ^C
	CALL	ECHOCHAR
	LD	C,'C'
	CALL	ECHOCHAR
	JP	CHDROP		; the program ends by warm boot

; ^E in a line: CR and LF to the console, the line going on; nothing stored.
LINEOL:
	LD	C,CR
	CALL	ECHOONE		; a new screen line, the column 0
	LD	C,LF
	CALL	ECHOONE
	JP	LINLOOP

; ^R in a line: # and a new screen line, then the line so far retyped.
LINRETY:
	LD	C,'#'		; the old screen line marked as left
	CALL	ECHOONE
	LD	C,CR		; then a new screen line
	CALL	ECHOONE
	LD	C,LF
	CALL	ECHOONE
	LD	HL,(PARAM)	; the buffer's characters
	INC	HL		; past the maximum and the count
	INC	HL
	LD	A,(LINCNT)	; B = how many
	LD	B,A
RETYLP:
	LD	A,B
	OR	A
	JP	Z,LINLOOP	; an empty line: nothing to retype
	LD	C,(HL)		; the next character
	PUSH	BC		; the count and place, kept over the echo
	PUSH	HL
	CALL	ECHOCHAR	; the character, a tab as spaces
	POP	HL
	POP	BC
	INC	HL
	DJNZ	RETYLP		; the next
	JP	LINLOOP

; ^U in a line: # and a new screen line, and the line discarded, its count 0.
LINCTU:
	LD	C,'#'		; the old screen line marked as left
	CALL	ECHOONE
	LD	C,CR		; then a new screen line
	CALL	ECHOONE
	LD	C,LF
	CALL	ECHOONE
	XOR	A		; the line discarded: its count 0
	LD	(LINCNT),A
	LD	HL,(PARAM)	; and the next character at its start
	INC	HL		; past the maximum and the count
	INC	HL
	LD	(LINPTR),HL
	JP	LINLOOP

; ^X in a line: every character erased from the screen and the buffer.
LINCLEAR:
	CALL	LINERASE
	JP	LINLOOP
; The line so far erased from the screen, a character at a time, and from
; the buffer: LINCNT to 0 and LINPTR back to the buffer's start. Also called
; by the history (HRSHOW). Changes A, C, HL and what the BIOS's output does.
LINERASE:
	LD	A,(LINCNT)	; any character left?
	OR	A
	RET	Z		; nothing left
	CALL	ERASE1		; the last character erased
	LD	A,(LINCNT)	; one fewer counted
	DEC	A
	LD	(LINCNT),A
	LD	HL,(LINPTR)	; the buffer's place back one
	DEC	HL
	LD	(LINPTR),HL	; and taken from the buffer
	JR	LINERASE

; The line ended by the key in C, which is echoed: CR or LF, or the key
; that found the buffer full. The count goes in the buffer's second byte,
; and at the CCP's prompt a line of a byte or more goes into the history.
; HFLAG is cleared, so a program's later line is not stored. Returns A = 0.
LINDONE:
	CALL	ECHOCHAR	; the key that ended the line
	LD	HL,(PARAM)	; the count into the buffer
	INC	HL
	LD	A,(LINCNT)	; the count, in the second byte
	LD	(HL),A
	INC	HL		; DE = its characters, B = the count
	EX	DE,HL
	LD	B,A
	LD	HL,HFLAG	; the CCP's line, once: warm boot clears it too
	LD	A,(HL)		; FFh at the CCP's prompt, else 0
	LD	(HL),0
	AND	B		; NZ: the CCP's prompt and a count
	CALL	NZ,HSTORE	; a CCP line of at least one byte
	JP	RETZERO

; Function 11, console status: A = 1 if a key is ready, else 0. A key found
; ready is read at once and kept (PENDING, PENDCHR) for the next read.
FNSTAT:
	LD	A,(PENDING)	; a key already kept?
	OR	A
	JR	NZ,STATYES	; one kept: ready
	CALL	BIOCST		; the BIOS's status, FFh or 0
	OR	A
	JP	Z,RETZERO	; none: A = 0
	CALL	BIOCIN		; read and kept for the next read
	LD	(PENDCHR),A
	LD	A,1		; marked as kept
	LD	(PENDING),A
STATYES:
	LD	A,1		; ready: A = 1, as CP/M 2.2 returns
	JP	RETA

; Function 12, version: HL = 0022h, CP/M 2.2 (A = 22h, B = H = 0).
FNVERS:
	LD	A,$22		; 2.2; H = 0: CP/M, not MP/M
	JP	RETA
