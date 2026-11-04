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
FNCHAIN:
	LD	HL,(CURDMA)
	LD	B,128
FNCH1:	LD	A,(HL)
	OR	A
	JR	Z,FNCH2
	CP	CR
	JR	Z,FNCHNO
	CP	LF
	JR	Z,FNCHNO
	INC	HL
	DJNZ	FNCH1
FNCHNO:	LD	A,$FF
	JR	RETA
FNCH2:	LD	HL,(CURDMA)	; the command, its 0 and what follows
	LD	DE,CMDTXT
	LD	BC,128
	LDIR
	LD	A,1		; its first piece next
	LD	(CHPOS),A
	JP	BIOWBT

; ^C at a line's start and a BDOS error's exit end the program by warm boot,
; and the rest of a chained line goes with it.
CHDROP:	XOR	A
	LD	(CHPOS),A
	JP	BIOWBT



BENTRY:
	LD	(OLDSP),SP
	LD	SP,STKTOP
	LD	(PARAM),DE
	LD	A,C
	CP	108
	JR	Z,FNRETC
	CP	47
	JP	Z,FNCHAIN
	CP	44
	JR	Z,FNMULT
	CP	45
	JR	Z,FNERRM
	CP	46
	JP	Z,FNFREE
	CP	48
	JR	Z,FNFLSH
	CP	99
	JR	Z,FNCHNO	; truncate: FFh, nothing changed
	CP	41
	JR	NC,RETZERO
	ADD	A,A
	LD	E,A
	LD	D,0
	LD	HL,FNTAB
	ADD	HL,DE
	LD	E,(HL)
	INC	HL
	LD	D,(HL)		; DE = the routine
	LD	HL,FCBMAP-1	; its FCB bit: byte C/8, bit C mod 8
	LD	A,C
FCBBYTE:
	INC	HL
	SUB	8
	JR	NC,FCBBYTE
	LD	B,A		; (C mod 8) - 8
	LD	A,(HL)
FCBBIT:	RLCA			; 8 - (C mod 8) turns: the bit in carry
	INC	B
	JR	NZ,FCBBIT
	EX	DE,HL
	JR	NC,DISPATCH
	PUSH	HL
	CALL	FCBSEL
	POP	HL
DISPATCH:
	LD	DE,(PARAM)
	JP	(HL)

; Function 44, CP/M 3's multi-sector count: E = 1, the only count, succeeds;
; any other returns FFh at FNCHNO, as function 99, truncate, does with nothing
; changed.
FNMULT:	DEC	E
	JR	NZ,FNCHNO

RETZERO:
	XOR	A

RETA:
	LD	L,A
	LD	H,0

RETWORD:
	LD	A,L
	LD	B,H
	LD	SP,(OLDSP)
	RET

FNZERO:
	JP	BIOWBT

; Function 45, CP/M 3's error mode: E = FFh, a BDOS error returns to the
; program with A = FFh and H its code, and no message; FEh, the message and
; then the same return; any other, the default: the message, a key, and the
; program ends with the rest of a chained line. Warm boot puts it back to 0.
FNERRM:	LD	A,E
	LD	(ERRMODE),A
	JR	RETZERO

; Function 48, CP/M 3's flush: every changed line of the cache written. A = 0,
; or FFh if any write failed, its line then dropped; E = FFh's purge is the same
; flush, since dropping clean lines changes nothing a program can see.
FNFLSH:	CALL	VFLUSH		; A = FFh, the line CFLALL leaves
	JR	NZ,RETA		; a write failed: FFh
	JR	RETZERO

; Function 108, CP/M 3's program return code: DE = FFFFh gets it into HL;
; any other DE sets it. One code for every program.
FNRETC:
	LD	HL,(PARAM)
	LD	A,H
	AND	L
	INC	A
	JR	Z,FNRETG
	LD	(PRGCODE),HL
	JR	RETZERO
FNRETG:
	LD	HL,(PRGCODE)
	JR	RETWORD

FNCIN:
	CALL	GETCHAR
	LD	C,A
	PUSH	AF
	CALL	ECHOCHAR
	POP	AF
	JR	RETA

FNCOUT:
	LD	A,(PARAM)
	LD	C,A
	CALL	OUTCHAR
	JR	RETZERO

FNREAD:
	CALL	BIORDR
	JR	RETA

FNPUNCH:
	LD	A,(PARAM)
	LD	C,A
	CALL	BIOPUN
	JR	RETZERO

FNLIST:
	LD	A,(PARAM)
	LD	C,A
	CALL	BIOLST
	JP	RETZERO

FNDIRECT:
	LD	A,(PARAM)
	CP	$FF
	JR	NZ,DIROUT
	CALL	CONSTAT
	OR	A
	JP	Z,RETZERO
	CALL	GETCHAR
	JP	RETA

DIROUT:
	LD	C,A
	CALL	BIOCOT
	JP	RETZERO

FNGETIO:
	LD	A,(IOBYTE)
	JP	RETA

FNSETIO:
	LD	A,(PARAM)
	LD	(IOBYTE),A
	JP	RETZERO

FNPRINT:
	LD	HL,(PARAM)

PRLOOP:
	LD	A,(HL)
	CP	'$'
	JP	Z,RETZERO
	INC	HL
	PUSH	HL
	LD	C,A
	CALL	OUTCHAR
	POP	HL
	JR	PRLOOP

FNLINE:
	LD	A,(HHEAD)	; no line shown from the history yet
	LD	(HPOS),A
	LD	HL,(PARAM)
	LD	A,(HL)
	LD	(LINMAX),A
	INC	HL
	XOR	A
	LD	(HL),A
	LD	(LINCNT),A
	INC	HL
	LD	(LINPTR),HL

LINLOOP:
	CALL	GETCHAR
	LD	C,A
	CP	CR
	JP	Z,LINDONE
	CP	LF
	JP	Z,LINDONE
	CP	CTRLP
	JR	Z,LINTGL
	CP	BACKSP
	JR	Z,LINBACK
	CP	DELETE
	JR	Z,LINDEL
	CP	CTRLC
	JP	Z,LINABRT
	CP	CTRLE
	JP	Z,LINEOL
	CP	CTRLR
	JP	Z,LINRETY
	CP	CTRLU
	JP	Z,LINCTU
	CP	CTRLX
	JP	Z,LINCLEAR
	CP	CTRLW
	JR	Z,LINHIST
	CP	CTRLN
	JR	Z,LINHIST
LINCHR:
	LD	A,(LINCNT)
	LD	B,A
	LD	A,(LINMAX)
	CP	B
	JP	Z,LINDONE
	LD	A,C
	LD	HL,(LINPTR)
	LD	(HL),A
	INC	HL
	LD	(LINPTR),HL
	LD	A,B
	INC	A
	LD	(LINCNT),A
	CALL	ECHOCHAR
	LD	A,(LINCNT)
	LD	B,A
	LD	A,(LINMAX)
	CP	B
	JR	NZ,LINLOOP
	LD	C,CR
	JP	LINDONE

LINTGL:
	CALL	TOGLIST
	JR	LINLOOP

LINHIST:
	LD	A,(HFLAG)
	OR	A
	JR	Z,LINCHR	; a program's call: a character
	CALL	HREC
	JR	LINLOOP

LINBACK:
	LD	A,(LINCNT)
	OR	A
	JR	Z,LINLOOP
	DEC	A
	LD	(LINCNT),A
	LD	HL,(LINPTR)
	DEC	HL
	LD	(LINPTR),HL
	CALL	ERASE1
	JP	LINLOOP

LINDEL:
	LD	A,(LINCNT)
	OR	A
	JP	Z,LINLOOP
	DEC	A
	LD	(LINCNT),A
	LD	HL,(LINPTR)
	DEC	HL
	LD	(LINPTR),HL
	LD	C,(HL)
	CALL	ECHOCHAR
	JP	LINLOOP

LINABRT:
	LD	A,(LINCNT)
	OR	A
	JP	NZ,LINLOOP
	LD	HL,(LINPTR)
	LD	(HL),CTRLC
	LD	C,'^'
	CALL	ECHOCHAR
	LD	C,'C'
	CALL	ECHOCHAR
	JP	CHDROP

LINEOL:
	LD	C,CR
	CALL	ECHOONE
	LD	C,LF
	CALL	ECHOONE
	JP	LINLOOP

LINRETY:
	LD	C,'#'
	CALL	ECHOONE
	LD	C,CR
	CALL	ECHOONE
	LD	C,LF
	CALL	ECHOONE
	LD	HL,(PARAM)
	INC	HL
	INC	HL
	LD	A,(LINCNT)
	LD	B,A

RETYLP:
	LD	A,B
	OR	A
	JP	Z,LINLOOP
	LD	C,(HL)
	PUSH	BC
	PUSH	HL
	CALL	ECHOCHAR
	POP	HL
	POP	BC
	INC	HL
	DJNZ	RETYLP
	JP	LINLOOP

LINCTU:
	LD	C,'#'
	CALL	ECHOONE
	LD	C,CR
	CALL	ECHOONE
	LD	C,LF
	CALL	ECHOONE
	XOR	A
	LD	(LINCNT),A
	LD	HL,(PARAM)
	INC	HL
	INC	HL
	LD	(LINPTR),HL
	JP	LINLOOP

LINCLEAR:
	CALL	LINERASE
	JP	LINLOOP
LINERASE:
	LD	A,(LINCNT)
	OR	A
	RET	Z
	CALL	ERASE1
	LD	A,(LINCNT)
	DEC	A
	LD	(LINCNT),A
	LD	HL,(LINPTR)
	DEC	HL
	LD	(LINPTR),HL
	JR	LINERASE

LINDONE:
	CALL	ECHOCHAR
	LD	HL,(PARAM)
	INC	HL
	LD	A,(LINCNT)
	LD	(HL),A
	INC	HL
	EX	DE,HL
	LD	B,A
	LD	HL,HFLAG	; the CCP's line, once: warm boot clears it too
	LD	A,(HL)
	LD	(HL),0
	AND	B
	CALL	NZ,HSTORE	; a CCP line of at least one byte
	JP	RETZERO

FNSTAT:
	LD	A,(PENDING)
	OR	A
	JR	NZ,STATYES
	CALL	BIOCST
	OR	A
	JP	Z,RETZERO
	CALL	BIOCIN
	LD	(PENDCHR),A
	LD	A,1
	LD	(PENDING),A

STATYES:
	LD	A,1
	JP	RETA

FNVERS:
	LD	A,$22
	JP	RETA
