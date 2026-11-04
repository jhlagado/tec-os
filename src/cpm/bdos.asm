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

; Reset to drive A, restore the standard DMA address, and discover all disk
; geometry and work areas through the public BIOS DPH/DPB boundary. The user
; number stays as it is, as in CP/M 2.2.
FNRESET:
	LD	HL,WRFLAG	; the CCP's reset at its entry: WRESET
	LD	A,(HL)
	LD	(HL),0
	OR	A
	JR	NZ,WRESET
	LD	H,A
	LD	L,A
	LD	(LOGINV),HL
	LD	(WARMV),HL
RSTAIL:	XOR	A
	LD	(CURDRV),A
	LD	H,A
	LD	L,A
	LD	(ROVEC),HL
	LD	HL,$0080
	LD	(CURDMA),HL
	LD	B,H
	LD	C,L
	CALL	BIODMA
	CALL	LOGIN
	JR	SETDEF

; TEC-OS: the CCP's reset keeps each logged drive whose allocation vector
; nothing has changed since its last scan and that still sums as it did
; then. A drive the BDOS or a BIOS directory write has changed (its DPH's
; dirty flag) is rebuilt, at its next selection, from the entries up to its
; mark (WARMV); any other is scanned in full. ROVEC is cleared, as CP/M 2.2's
; warm boot clears it.
WRESET:	XOR	A
WRLOOP:	LD	(CURDRV),A
	CALL	LOGTEST
	JR	Z,WRNEXT
	CALL	LOGIN		; logged: its pointers bound, nothing read
	LD	HL,(DPHPTR)
	LD	BC,4
	ADD	HL,BC
	LD	A,(HL)
	OR	A
	JR	NZ,WRDIRTY
	CALL	ALVSUM
	LD	HL,(DPHPTR)
	INC	HL
	INC	HL
	LD	A,(HL)
	CP	E
	JR	NZ,WRFULL
	INC	HL
	LD	A,(HL)
	CP	D
	JR	Z,WRNEXT
WRFULL:	LD	HL,LOGINV
	CALL	VCLR
	JR	WRNEXT
WRDIRTY:
	LD	HL,LOGINV
	CALL	VCLR
	LD	HL,WARMV
	CALL	VSET
WRNEXT:	LD	A,(CURDRV)
	INC	A
	CP	16
	JR	NZ,WRLOOP
	JR	RSTAIL

FNSEL:
	LD	A,(PARAM)
	CALL	SELDRV

; Publish a logical default only after BIOS selection succeeds. Retained
; pointers let functions 27/31 query that default without replacing an active
; explicit-drive search's directory buffer or cursor.
SETDEF:
	LD	A,(CURDRV)
	LD	(DEFDRV),A
	LD	HL,(DPBPTR)
	LD	(DEFDPB),HL
	LD	HL,(ALVPTR)
	LD	(DEFALV),HL
	JP	RETZERO

; A is a zero-based physical drive. Bind its geometry before any file access.
; Clobbers AF/BC/DE/HL/IX. Same-drive access must still honor reset/login state.
; An invalid or absent drive takes the fatal selection path, never a return.
SELDRV:
	CP	16
	JP	NC,SELFAIL
	LD	B,A
	LD	A,(CURDRV)
	CP	B
	LD	A,B
	LD	(CURDRV),A
	JP	NZ,LOGIN
	CALL	LOGTEST
	RET	NZ
	JP	LOGIN

; PARAM names the caller FCB; its drive byte is never rewritten. C still
; identifies the dispatched function. Zero means logical default; 1..16 means
; A..P. Only Search First admits '?' as a raw-directory request.
FCBSEL:
	LD	HL,(PARAM)
	LD	A,(HL)
	CP	'?'
	JR	NZ,FCBORD
	LD	A,C
	CP	17
	JP	NZ,SELFAIL
	XOR	A
FCBORD:
	OR	A
	JR	NZ,FCBEXPL
	LD	A,(DEFDRV)
	JR	SELDRV
FCBEXPL:
	DEC	A
	JR	SELDRV

; Open uses the same public-directory iterator as search, then imports only
; the directory-owned FCB fields. Bit 7 of S2 marks the FCB unmodified, which
; lets close avoid a disk write until a later mutation function changes it.
FNOPEN:
	LD	A,1
	JR	SETSRCH

FNCLSE:
	CALL	CLOSEFCB
	JP	RETA

CLOSEFCB:
	LD	DE,14
	CALL	FCBOFF
	BIT	7,(HL)
	JR	Z,CLOSEDIR
	XOR	A
	RET

; An FCB on an earlier extent than its entry's writes back only the
; allocation map: the entry's extent and record count describe its last
; extent. On a read-only drive it writes nothing and returns success, as CP/M
; 2.2's close does (A8, restating KE-148).
CLOSEDIR:
	CALL	RONZ		; NZ: the drive is read-only
	LD	A,0
	RET	NZ		; nothing written, and success
	CALL	FINDEXCT
	CP	$FF
	RET	Z
	LD	HL,(PARAM)
	LD	BC,12
	ADD	HL,BC
	LD	DE,(MATCHPTR)
	EX	DE,HL
	ADD	HL,BC
	EX	DE,HL
	LD	A,(DE)
	AND	$1F
	LD	C,A
	LD	A,(HL)
	AND	$1F
	CP	C
	LD	BC,20
	JR	NC,CLOSECP
	LD	C,4		; skip EX, S1, S2 and RC
	ADD	HL,BC
	EX	DE,HL
	ADD	HL,BC
	EX	DE,HL
	LD	C,16
CLOSECP:
	LDIR
	CALL	WRITEDIR
	LD	A,(RETCODE)
	RET

FINDEXCT:
	LD	HL,(PARAM)
	LD	(SRCHFCB),HL
	LD	A,4
	LD	(OPENMOD),A
	CALL	NEWSRCH
	JP	FINDENT

FNSRCHF:
	LD	HL,(PARAM)
	LD	A,(HL)
	CP	'?'
	LD	A,5
	JR	Z,SETSRCH
	LD	DE,14
	ADD	HL,DE
	LD	(HL),0
	XOR	A

SETSRCH:
	LD	HL,(PARAM)
	LD	(SRCHFCB),HL
	LD	(OPENMOD),A
	CALL	NEWSRCH
	CALL	FINDENT
	JP	RETA

FNSRCHN:
				; Continue the saved search mode; DE is not an FCB argument here.
	CALL	FINDENT
	JP	RETA

; File R/O, as CP/M 2.2's check_rofile and check_rodir: a write's FCB, or the
; directory entry at HL of a rename or an erase, with t1's bit 7 set goes no
; further. ROFCB checks the drive first.
ROFCB:	CALL	CHKRO
	LD	HL,(PARAM)
ROTEST:	LD	DE,9
	ADD	HL,DE
	BIT	7,(HL)
	RET	Z
	LD	HL,ERRFILE
	LD	B,3		; read-only file
	JP	BDERR

FNDELETE:
	CALL	CHKRO
	LD	HL,(PARAM)
	LD	(SRCHFCB),HL
	LD	A,2
	LD	(OPENMOD),A
	CALL	NEWSRCH
	XOR	A
	LD	(WRTYPE),A

DELLOOP:
	CALL	FINDENT
	CP	$FF
	JR	Z,DELDONE
	LD	HL,(MATCHPTR)
	CALL	ROTEST
	CALL	FREEENT
	LD	HL,(MATCHPTR)
	LD	(HL),$E5
	CALL	WRDIRNOW
	LD	A,1
	LD	(WRTYPE),A
	JR	DELLOOP

DELDONE:
	LD	A,(WRTYPE)
	OR	A
	LD	A,$FF
	JP	Z,RETA
	XOR	A
	JP	RETA

; Create an empty extent in the first unused directory slot. The caller FCB
; is initialized independently of the directory-buffer representation.
FNMAKE:
	CALL	CHKRO
	XOR	A
	LD	(WRTYPE),A
	CALL	MAKEFCB
	JP	RETA

MAKEFCB:
	CALL	FCBEX
	LD	A,(WRTYPE)
	OR	A
	JR	Z,MAKESRCH
	LD	A,(HL)
	LD	(TARGEX),A
	INC	HL
	INC	HL
	LD	A,(HL)
	AND	$3F
	LD	(TARGS2),A

MAKESRCH:
	LD	HL,(PARAM)
	LD	(SRCHFCB),HL
	LD	A,3
	LD	(OPENMOD),A
	CALL	NEWSRCH
	CALL	FINDENT
	CP	$FF
	RET	Z

				; Clear EX through the allocation map; CR and r0-r2 are left alone.
	CALL	FCBEX
	LD	B,20
	XOR	A

MAKEZERO:
	LD	(HL),A
	INC	HL
	DJNZ	MAKEZERO

	LD	A,(WRTYPE)
	OR	A
	JR	Z,MAKECOPY
	CALL	FCBEX
	LD	A,(TARGEX)
	LD	(HL),A
	INC	HL
	INC	HL
	LD	A,(TARGS2)
	LD	(HL),A

MAKECOPY:
	LD	HL,(MATCHPTR)
	LD	A,(USERNO)
	LD	(HL),A
	INC	HL
	EX	DE,HL
	LD	HL,(PARAM)
	INC	HL
	LD	BC,31
	LDIR

	LD	DE,14
	CALL	FCBOFF
	LD	A,(HL)
	OR	$80
	LD	(HL),A
	LD	HL,(SRCHIDX)
	LD	DE,(DIRUSED)
	OR	A
	SBC	HL,DE
	JR	C,MAKEUSED
	LD	HL,(SRCHIDX)
	LD	(DIRUSED),HL
	CALL	DUSAVE

MAKEUSED:
	CALL	WRITEDIR
	LD	A,(RETCODE)
	RET

FNWRITE:
	CALL	ROFCB
	XOR	A
	LD	(ZEROFIL),A
	CALL	WRITESEQ
	JP	RETA

FNATTR:
	CALL	CHKRO
	LD	HL,(PARAM)
	INC	HL
	JR	MUTALL

FNRENAME:
	CALL	CHKRO
	LD	DE,17
	CALL	FCBOFF

; Rename and set-attributes apply to every extent belonging to the file. Keep
; the replacement field outside the directory buffer because FINDENT replaces
; that buffer whenever the scan crosses a physical directory record.
MUTALL:
	LD	(COPYPTR),HL
	LD	HL,(PARAM)
	LD	(SRCHFCB),HL
	LD	A,2
	LD	(OPENMOD),A
	XOR	A
	LD	(WRTYPE),A
	CALL	NEWSRCH

MUTLOOP:
	CALL	FINDENT
	CP	$FF
	JP	Z,DELDONE
	LD	A,(COPYPTR)	; a rename's name is 17 bytes in, function
	LD	HL,PARAM	; 30's 1: a rename of a read-only file is
	SUB	(HL)		; refused, as CP/M 2.2 refuses it, and its
	AND	$10		; attributes can still be changed
	JR	Z,MUTCOPY
	LD	HL,(MATCHPTR)
	CALL	ROTEST
MUTCOPY:
	LD	HL,(COPYPTR)
	LD	DE,(MATCHPTR)
	INC	DE
	LD	BC,11
	LDIR
	CALL	WRITEDIR
	LD	A,1
	LD	(WRTYPE),A
	JR	MUTLOOP

WRITESEQ:
	CALL	FCBCR
	LD	A,(HL)
	CP	128
	JR	C,WRITEPOS
	CALL	ADVEXT
	OR	A
	RET	NZ
	CALL	FCBCR
	LD	A,(HL)

WRITEPOS:
	LD	(SEQREC),A
	XOR	A
	LD	(WRTYPE),A
	CALL	FCBLOCK
	LD	A,D
	OR	E
	JR	NZ,WRITEBLK
	CALL	ALLOCBLK
	OR	A
	RET	NZ
	LD	A,2
	LD	(WRTYPE),A
	LD	A,(ZEROFIL)
	RRA
	CALL	C,ZEROBLK

WRITEBLK:
	CALL	POSREC
	LD	A,(WRTYPE)
	LD	C,A
	CALL	BIOWRS
	OR	A
	JR	NZ,WRITEBAD
	JR	ADVWRITE	; the FCB moves on once the record is
				; written: function 45's returned error
				; leaves it on that record, as CP/M 3 does

WRITEBAD:
	JP	BADSECT

; A sequential write past record 127 moves to the next extent first, as CP/M
; 2.2's open_reel does: the write that needs the extent makes it. With the
; directory full that write returns 1 and the FCB is put back on its extent,
; record 128, so a write after an entry is freed makes the extent it needs.
ADVEXT:
	CALL	CLOSEFCB
	CALL	FCBEX
	LD	E,(HL)		; EX and S2, for a make that fails
	INC	HL
	INC	HL
	LD	D,(HL)
	PUSH	DE
	CALL	NEXTEXT
	OR	A
	JR	Z,EXTCLEAR
	LD	A,1
	LD	(WRTYPE),A
	CALL	MAKEFCB
	INC	A
	JR	Z,EXTFULL

EXTCLEAR:
	POP	DE
	CALL	FCBCR
	XOR	A
	LD	(HL),A
	RET

EXTFULL:
	CALL	FCBEX
	POP	DE
	LD	(HL),E
	INC	HL
	INC	HL
	LD	(HL),D
	LD	A,1
	RET

ADVWRITE:
	CALL	FCBCR
	INC	(HL)
	LD	A,(HL)
	LD	B,A
	LD	DE,15
	CALL	FCBOFF
	CP	(HL)
	JR	C,WRITERC
	LD	(HL),B

WRITERC:
	DEC	HL
	LD	A,(HL)
	AND	$7F
	LD	(HL),A
	XOR	A
	RET

FNREADSQ:
	CALL	READSEQ
	JP	RETA

READSEQ:
	CALL	FCBCR
	LD	A,(HL)
	CP	128
	JR	C,READCHK
				; Close before moving on, as CP/M 2.2's open_reel does: the reopen
				; replaces the allocation map, so blocks written through this FCB
				; since its open must reach the directory first.
	CALL	CLOSEFCB
	INC	A
	JR	Z,READ_EOF
	CALL	NEXTEXT
	OR	A
	JR	NZ,READ_EOF
	CALL	FCBCR
	XOR	A
	LD	(HL),A

READCHK:
	LD	A,(HL)
	LD	(SEQREC),A
	LD	B,A
	LD	DE,15
	CALL	FCBOFF
	LD	A,(HL)
	CP	B
	JR	Z,READ_EOF
	JR	C,READ_EOF
	CALL	FCBLOCK
	LD	A,D
	OR	E
	JR	Z,READ_EOF
	CALL	POSREC
	CALL	BIORDS
	OR	A
	JP	NZ,BADSECT	; returned: the FCB on the record unread
	CALL	FCBCR		; read: the next
	INC	(HL)
	XOR	A
	RET

READ_EOF:
	LD	A,1
	RET

FNRREAD:
	XOR	A
	LD	(ZEROFIL),A
	CALL	RANDPREP
	JR	C,RANDRET
	CALL	READSEQ
	JR	RANDDONE

; ZEROFIL is zero for reads and sequential writes. Random writes set bit 7,
; which marks a write for RANDMISS, and function 40 also sets bit 0 to
; zero-fill each newly allocated block.
FNRWRITE:
	LD	A,$80
	JR	RANDWRT

FNWRZERO:
	LD	A,$81

RANDWRT:
	LD	(ZEROFIL),A
	CALL	ROFCB
	CALL	RANDPREP
	JR	C,RANDRET
	CALL	WRITESEQ

RANDDONE:
	PUSH	AF
	CALL	FCBCR
	LD	A,(SEQREC)
	LD	(HL),A
	POP	AF

RANDRET:
	JP	RETA

RANDPREP:
	CALL	FCBCR
	INC	HL
	LD	C,(HL)
	INC	HL
	LD	D,(HL)
	INC	HL
	LD	E,(HL)
	LD	A,E		; CP/M 2.2 records 0..65535; r2 is overflow
	OR	A
	LD	A,6
	JR	NZ,RANDFAIL	; reject before changing any FCB field
	LD	A,C
	AND	$7F
	LD	(SEQREC),A

	LD	A,C
	RLCA			; r0 bit 7 becomes EX bit 0
	LD	A,D
	RLA
	AND	$1F
	LD	(TARGEX),A

	LD	A,D		; r2 was proved zero before any FCB write
	RRCA
	RRCA
	RRCA
	RRCA
	AND	$0F
	LD	(TARGS2),A

	CALL	FCBEX
	LD	A,(HL)
	AND	$1F
	LD	B,A
	LD	A,(TARGEX)
	CP	B
	JR	NZ,RANDOPEN
	INC	HL
	INC	HL
	LD	A,(HL)
	AND	$3F
	LD	B,A
	LD	A,(TARGS2)
	CP	B
	JR	Z,RANDPOS

; Leaving an extent closes it first, so its directory entry keeps the record
; count and blocks written through this FCB.
RANDOPEN:
	CALL	CLOSEFCB
	INC	A
	LD	A,3
	JR	Z,RANDFAIL
	CALL	FCBEX
	LD	A,(TARGEX)
	LD	(HL),A
	INC	HL
	INC	HL
	LD	A,(HL)
	AND	$80
	LD	B,A
	LD	A,(TARGS2)
	OR	B
	LD	(HL),A
	CALL	NEXTFIND
	OR	A
	JR	NZ,RANDMISS

RANDPOS:
	CALL	FCBCR
	LD	A,(SEQREC)
	LD	(HL),A
	XOR	A
	RET

; A read of an extent that was never made returns 4. A write makes the
; extent, as CP/M does, and returns 5 when the directory is full.
RANDMISS:
	LD	A,(ZEROFIL)
	OR	A
	LD	A,4
	JR	Z,RANDFAIL
	LD	(WRTYPE),A
	CALL	MAKEFCB
	INC	A
	JR	NZ,RANDPOS
	LD	A,5

RANDFAIL:
	SCF
	RET

; Locate the allocation block containing the FCB's current sequential record.
; DSM selects the public one-byte or two-byte allocation-map representation.
FCBLOCK:
	CALL	FCBADDR
	LD	E,(HL)
	LD	D,0
	LD	IX,(DPBPTR)
	LD	A,(IX+6)
	OR	A
	RET	Z
	INC	HL
	LD	D,(HL)
	RET

; Return the FCB sequential-record field in HL.
FCBCR:
	LD	DE,32
	JR	FCBOFF

; Return the FCB extent field in HL.
FCBEX:
	LD	DE,12

; Return the FCB byte at offset DE in HL.
FCBOFF:
	LD	HL,(PARAM)
	ADD	HL,DE
	RET

; Return the allocation-map cell for SEQREC in HL. The record's place in the
; entry is (EX AND EXM) * 128 + SEQREC, shifted right by BSH.
FCBADDR:
	LD	HL,(DPBPTR)
	INC	HL
	INC	HL
	LD	B,(HL)		; BSH
	INC	HL
	INC	HL
	LD	C,(HL)		; EXM
	CALL	FCBEX
	LD	A,(HL)
	AND	C
	LD	H,A
	LD	A,(SEQREC)
	ADD	A,A
	LD	L,A
	SRL	H		; HL = extent in entry * 128 + SEQREC
	RR	L
RECSHFT:
	SRL	H
	RR	L
	DJNZ	RECSHFT
	LD	A,L

BLOCKIDX:
	LD	C,A
	LD	HL,(DPBPTR)
	LD	DE,6
	ADD	HL,DE
	LD	A,(HL)
	OR	A
	LD	A,C
	JR	Z,BLOCKBYT
	ADD	A,A

BLOCKBYT:
	LD	E,A
	LD	D,0
	LD	HL,(PARAM)
	LD	BC,16
	ADD	HL,BC
	ADD	HL,DE
	RET

; Claim the first free block through the BIOS-owned allocation vector, publish
; it in the current FCB allocation cell, and return the block in DE.
ALLOCBLK:
	LD	HL,(ALVPTR)
	LD	IX,(DPBPTR)
	LD	DE,0
	LD	C,$80

ALLOCLOP:
	LD	A,(HL)
	AND	C
	JR	Z,ALFOUND
	LD	A,D
	CP	(IX+6)
	JR	NZ,ALNEXT
	LD	A,E
	CP	(IX+5)
	JR	Z,ALFULL

ALNEXT:
	INC	DE
	SRL	C
	JR	NZ,ALLOCLOP
	INC	HL
	LD	C,$80
	JR	ALLOCLOP

ALFOUND:
	LD	A,(HL)
	OR	C
	LD	(HL),A
	PUSH	HL		; TEC-OS: the vector changed, the drive dirty
	LD	HL,(DPHPTR)
	INC	HL
	INC	HL
	INC	HL
	INC	HL
	LD	(HL),1
	POP	HL
	PUSH	DE
	CALL	FCBADDR
	POP	DE
	LD	(HL),E
	LD	A,(IX+6)
	OR	A
	JR	Z,ALLOCDON
	INC	HL
	LD	(HL),D

ALLOCDON:
	XOR	A
	RET

ALFULL:
	LD	A,2
	RET

; CP/M function 40 clears a newly allocated block before publishing the
; caller's target record. The BIOS directory buffer is reusable scratch here.
ZEROBLK:
	LD	(ZEROBN),DE
	LD	A,(SEQREC)
	LD	(TARGEX),A
	LD	HL,(DIRPTR)
	LD	(HL),0
	LD	D,H
	LD	E,L
	INC	DE
	LD	BC,127
	LDIR
	LD	HL,(DIRPTR)
	LD	B,H
	LD	C,L
	CALL	BIODMA
	LD	IX,(DPBPTR)
	LD	A,(IX+3)
	INC	A
	LD	(ALLEFT),A
	DEC	A
	CPL
	LD	B,A
	LD	A,(SEQREC)
	AND	B
	LD	(SEQREC),A

ZEROLOOP:
	LD	DE,(ZEROBN)
	CALL	POSREC
	LD	C,2
	CALL	BIOWRS
	OR	A
	CALL	NZ,BADSECT
	LD	A,(SEQREC)
	INC	A
	LD	(SEQREC),A
	LD	A,(ALLEFT)
	DEC	A
	LD	(ALLEFT),A
	JR	NZ,ZEROLOOP
	LD	HL,(CURDMA)
	LD	B,H
	LD	C,L
	CALL	BIODMA
	LD	A,(TARGEX)
	LD	(SEQREC),A
	LD	DE,(ZEROBN)
	RET

; Position the BIOS at SEQREC within allocation block DE.
POSREC:
	CALL	CHKBLK
	EX	DE,HL
	LD	DE,(DPBPTR)
	INC	DE
	INC	DE
	LD	A,(DE)
	LD	B,A
	LD	A,B
	OR	A
	JR	Z,BLOCKSCA

BLOCKSHF:
	ADD	HL,HL
	DJNZ	BLOCKSHF

BLOCKSCA:
	LD	DE,(DPBPTR)
	INC	DE
	INC	DE
	INC	DE
	LD	A,(DE)
	LD	B,A
	LD	A,(SEQREC)
	AND	B
	LD	E,A
	LD	D,0
	ADD	HL,DE

	LD	IX,(DPBPTR)
	LD	E,(IX+0)
	LD	D,(IX+1)
	CALL	DIV16		; DE = the track, HL = the sector
	LD	(IOSEC),HL
	EX	DE,HL
	LD	E,(IX+13)
	LD	D,(IX+14)
	ADD	HL,DE
	LD	(IOTRK),HL

	LD	B,H
	LD	C,L
	CALL	BIOTRK
	LD	HL,(IOSEC)
	LD	B,H
	LD	C,L
	LD	DE,(XLTPTR)
	CALL	BIOTRN
	LD	B,H
	LD	C,L
	JP	BIOSEC

; HL div DE in DE, HL mod DE in HL, unsigned, for DE from 1 to 8000h: the
; remainder then never passes 16 bits. A:C shifts the dividend out and the
; quotient in, each bit a shift behind its trial subtraction. Returns A = D;
; destroys F, BC.
DIV16:	LD	A,H
	LD	C,L
	LD	HL,0
	LD	B,16
DIV16L:	RL	C
	RLA
	ADC	HL,HL
	SBC	HL,DE		; no carry in: HL < DE before the shift
	JR	NC,DIV16S
	ADD	HL,DE		; and carry out
DIV16S:	CCF
	DJNZ	DIV16L
	RL	C		; the last quotient bit in
	RLA
	LD	D,A
	LD	E,C
	RET

NEXTEXT:
	CALL	FCBEX
	LD	A,(HL)
	INC	A
	AND	$1F
	LD	(HL),A
	JR	NZ,NEXTFIND
	INC	HL
	INC	HL
	LD	A,(HL)
	LD	B,A
	AND	$3F
	INC	A
	AND	$3F
	LD	C,A
	LD	A,B
	AND	$80
	OR	C
	LD	(HL),A

NEXTFIND:
	LD	HL,(PARAM)
	LD	(SRCHFCB),HL
	LD	A,1
	LD	(OPENMOD),A
	CALL	NEWSRCH
	CALL	FINDENT
	CP	$FF
	JR	Z,NEXTMISS
	XOR	A
	RET

NEXTMISS:
	LD	A,1
	RET

FNLOGIN:
	LD	HL,(LOGINV)
	JP	RETWORD

FNCURDSK:
	LD	A,(DEFDRV)
	JP	RETA

FNSETDMA:
	LD	HL,(PARAM)
	LD	(CURDMA),HL
	LD	B,H
	LD	C,L
	CALL	BIODMA
	JP	RETZERO

FNGETALV:
	LD	HL,(DEFALV)
	JP	RETWORD

; Function 46, CP/M 3's free space: drive E's free blocks, from its allocation
; vector, as records, in the three bytes at the DMA address, low first. The
; drive is selected as an FCB's would be, and the default stays.
FNFREE:	LD	A,E
	CALL	SELDRV
	LD	IX,(DPBPTR)
	LD	HL,(ALVPTR)
	LD	E,(IX+5)
	LD	D,(IX+6)
	INC	DE		; DE = the drive's blocks
	LD	BC,0		; the free ones
	LD	A,$80		; the bit within the current byte
FRBIT:	PUSH	AF
	AND	(HL)
	JR	NZ,FRUSED
	INC	BC
FRUSED:	POP	AF
	RRCA
	JR	NC,FRSAME
	INC	HL
FRSAME:	DEC	DE
	PUSH	AF
	LD	A,D
	OR	E
	JR	Z,FREND
	POP	AF
	JR	FRBIT
FREND:	POP	AF
	LD	H,B		; records = blocks << BSH, 24 bits
	LD	L,C
	XOR	A
	LD	B,(IX+2)
FRSH:	ADD	HL,HL
	RLA
	DJNZ	FRSH
	EX	DE,HL
	LD	HL,(CURDMA)
	LD	(HL),E
	INC	HL
	LD	(HL),D
	INC	HL
	LD	(HL),A
	JP	RETZERO

FNWRPROT:
	LD	A,(DEFDRV)
	CALL	MASKA
	EX	DE,HL
	LD	HL,(ROVEC)
	LD	A,L
	OR	E
	LD	L,A
	LD	A,H
	OR	D
	LD	H,A
	LD	(ROVEC),HL
	JP	RETZERO

FNGETRO:
	LD	HL,(ROVEC)
	JP	RETWORD

FNGETDPB:
	LD	HL,(DEFDPB)
	JP	RETWORD

; E = FFh gets the user number; any other E sets it to its low five bits, as
; CP/M 2.2 does, so no E reaches E5h, an erased entry's user byte.
FNUSER:
	LD	A,(PARAM)
	CP	$FF
	JR	Z,GETUSER
	AND	$1F
	LD	(USERNO),A
	JP	RETZERO

GETUSER:
	LD	A,(USERNO)
	JP	RETA

; Compute the highest logical record boundary across every matching extent.
; Function 35 returns $FF like CP/M while publishing the 24-bit result in the
; FCB random-record field.
FNSIZE:
	LD	HL,(PARAM)
	LD	(SRCHFCB),HL
	LD	A,2
	LD	(OPENMOD),A
	XOR	A
	LD	(FSIZE0),A
	LD	(FSIZE1),A
	LD	(FSIZE2),A
	CALL	NEWSRCH

SIZELOOP:
	CALL	FINDENT
	CP	$FF
	JR	Z,SIZEDONE
	LD	HL,(MATCHPTR)
	CALL	RECBASE
	LD	HL,(MATCHPTR)
	LD	DE,15
	ADD	HL,DE
	LD	E,(HL)
	LD	D,0
	LD	HL,(CAND0)
	ADD	HL,DE
	LD	(CAND0),HL
	LD	A,(CAND2)
	ADC	A,0
	LD	(CAND2),A

	LD	B,A
	LD	A,(FSIZE2)
	CP	B
	JR	C,SIZEKEEP
	JR	NZ,SIZELOOP
	LD	A,(CAND1)
	LD	B,A
	LD	A,(FSIZE1)
	CP	B
	JR	C,SIZEKEEP
	JR	NZ,SIZELOOP
	LD	A,(CAND0)
	LD	B,A
	LD	A,(FSIZE0)
	CP	B
	JR	NC,SIZELOOP

SIZEKEEP:
	LD	HL,(CAND0)
	LD	(FSIZE0),HL
	LD	A,(CAND2)
	LD	(FSIZE2),A
	JR	SIZELOOP

SIZEDONE:
	LD	DE,FSIZE0
	CALL	PUBRR
	LD	A,$FF
	JP	RETA

; Convert the sequential EX/S2/CR position to the public 24-bit random record.
FNSETRR:
	LD	HL,(PARAM)
	CALL	RECBASE
	CALL	FCBCR
	LD	E,(HL)
	LD	D,0
	LD	HL,(CAND0)
	ADD	HL,DE
	LD	(CAND0),HL
	LD	A,(CAND2)
	ADC	A,0
	LD	(CAND2),A
	LD	DE,CAND0
	CALL	PUBRR
	JP	RETZERO

; Publish three bytes from DE to the caller's random-record field.
; HL/DE/BC are scratch; the callers finish through RETA or RETZERO.
PUBRR:	LD	HL,(PARAM)
	LD	BC,33
	ADD	HL,BC
	EX	DE,HL
	LD	C,3		; B is already zero
	LDIR
	RET

; Convert an FCB-shaped EX/S2 position at HL to its 24-bit record base.
RECBASE:
	LD	DE,12
	ADD	HL,DE
	LD	A,(HL)
	AND	$1F
	LD	C,A
	INC	HL
	INC	HL
	LD	A,(HL)
	AND	$3F
	LD	H,0
	LD	L,A
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	LD	E,C
	LD	D,0
	ADD	HL,DE
	XOR	A
	LD	B,7

RECBSHFT:
	ADD	HL,HL
	RLA
	DJNZ	RECBSHFT
	LD	(CAND0),HL
	LD	(CAND2),A
	RET

FNRESETD:
	LD	DE,(PARAM)
	LD	A,E
	CPL
	LD	C,A
	LD	A,D
	CPL
	LD	B,A
	LD	HL,LOGINV
	CALL	ANDV
	LD	HL,ROVEC
	CALL	ANDV
	LD	HL,WARMV
	CALL	ANDV
	JP	RETZERO

NEWSRCH:
	LD	HL,0
	LD	(SRCHIDX),HL
	CALL	BIOHOM
	LD	HL,(DPBPTR)
	LD	BC,13
	ADD	HL,BC
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	LD	(CURTRK),DE
	LD	HL,0
	LD	(CURSEC),HL
	RET

; Return the next matching directory slot (0..3), or $FF. Search copies the
; containing 128-byte directory record to the caller's DMA; open instead
; copies directory fields 12..31 into the supplied FCB.
FINDENT:
	LD	HL,(SRCHIDX)
	LD	DE,(DIRUSED)
	LD	A,(OPENMOD)
	CP	3
	JR	Z,FULLDIR
	CP	5
	JR	NZ,FINDLIM
FULLDIR:
	LD	DE,(DIRCNT)

FINDLIM:
	OR	A
	SBC	HL,DE
	JP	NC,NOENTRY
	LD	HL,(SRCHIDX)
	LD	A,L
	AND	3
	CALL	Z,READDIR

	LD	HL,(SRCHIDX)
	LD	A,L
	AND	3
	LD	(RETCODE),A
	ADD	A,A
	ADD	A,A
	ADD	A,A
	ADD	A,A
	ADD	A,A
	LD	E,A
	LD	D,0
	LD	HL,(DIRPTR)
	ADD	HL,DE
	LD	(MATCHPTR),HL
	CALL	MATCHFCB
	OR	A
	JR	NZ,FOUNDIT
	LD	HL,(SRCHIDX)
	INC	HL
	LD	(SRCHIDX),HL
	JR	FINDENT

FOUNDIT:
	LD	HL,(SRCHIDX)
	INC	HL
	LD	(SRCHIDX),HL
	LD	A,(OPENMOD)
	OR	A
	JR	Z,COPYDIR
	CP	5
	JR	NZ,OPENHIT
COPYDIR:
	LD	HL,(DIRPTR)
	LD	DE,(CURDMA)
	LD	BC,128
	LDIR
	LD	A,(RETCODE)
	RET

; The FCB keeps the logical extent it asked for. The entry's extent byte is
; the highest it holds, and its record count is that extent's: an earlier
; extent in the entry is full (128 records), a later one empty.
OPENHIT:
	CP	1
	JR	NZ,NOCOPY
	LD	HL,(SRCHFCB)
	LD	DE,12
	ADD	HL,DE
	LD	A,(HL)
	AND	$1F
	PUSH	AF
	LD	HL,(MATCHPTR)
	INC	HL
	LD	DE,(SRCHFCB)
	INC	DE
	LD	BC,31
	LDIR
	LD	HL,(SRCHFCB)
	LD	DE,12
	ADD	HL,DE
	LD	A,(HL)
	AND	$1F
	LD	C,A		; the entry's extent
	POP	AF
	LD	(HL),A
	CP	C
	JR	Z,OPENRC
	LD	B,$80		; earlier than the entry's: full
	JR	C,OPENSET
	LD	B,0		; later: nothing in it yet
OPENSET:
	INC	HL
	INC	HL
	INC	HL
	LD	(HL),B
	DEC	HL
	DEC	HL
	DEC	HL
OPENRC:
	INC	HL
	INC	HL
	LD	A,(HL)
	OR	$80
	LD	(HL),A
	LD	A,(RETCODE)
	RET

NOCOPY:
	LD	A,(RETCODE)
	RET

NOENTRY:
	LD	A,$FF
	RET

; Match the current user and 8.3 name. Question marks in the FCB are
; single-character wildcards. Directory attribute bits are not name bits.
; Open also requires the requested logical extent: an entry holds EXM + 1
; logical extents, so the extent bytes are compared outside the EXM bits.
MATCHFCB:
	LD	A,(OPENMOD)
	CP	5
	JR	Z,ISMATCH
	CP	3
	JR	NZ,MATCHUSR
	LD	A,(HL)
	CP	$E5
	JR	Z,ISMATCH
	JR	NOMATCH

MATCHUSR:
	LD	A,(USERNO)
	LD	B,A
	LD	A,(HL)
	CP	B
	JR	NZ,NOMATCH
	INC	HL
	LD	DE,(SRCHFCB)
	INC	DE
	LD	B,11

NAMELOOP:
	LD	A,(DE)
	AND	$7F
	CP	'?'
	JR	Z,NAMEOK
	LD	C,A
	LD	A,(HL)
	AND	$7F
	CP	C
	JR	NZ,NOMATCH

NAMEOK:
	INC	HL
	INC	DE
	DJNZ	NAMELOOP
	LD	A,(OPENMOD)
	CP	2
	JR	Z,ISMATCH
	LD	A,(DE)
	CP	'?'
	JR	Z,ISMATCH
	XOR	(HL)		; extents differ only in the bits EXM masks
	AND	$1F
	JR	Z,EXSAME
	PUSH	HL
	LD	C,A
	LD	HL,(DPBPTR)
	INC	HL
	INC	HL
	INC	HL
	INC	HL
	LD	A,(HL)		; EXM
	CPL
	AND	C
	POP	HL
	JR	NZ,NOMATCH
EXSAME:
	INC	HL
	INC	HL
	INC	DE
	INC	DE
	LD	A,(DE)
	AND	$3F
	LD	C,A
	LD	A,(HL)
	AND	$3F
	CP	C
	JR	NZ,NOMATCH

ISMATCH:
	LD	A,1
	RET

NOMATCH:
	XOR	A
	RET

READDIR:
	LD	HL,(CURTRK)
	LD	(DIRTRK),HL
	LD	B,H
	LD	C,L
	CALL	BIOTRK
	LD	HL,(CURSEC)
	LD	(DIRSEC),HL
	LD	B,H
	LD	C,L
	LD	DE,(XLTPTR)
	CALL	BIOTRN
	LD	B,H
	LD	C,L
	CALL	BIOSEC
	LD	HL,(DIRPTR)
	LD	B,H
	LD	C,L
	CALL	BIODMA
	CALL	BIORDS
	PUSH	AF
	LD	HL,(CURDMA)
	LD	B,H
	LD	C,L
	CALL	BIODMA
	POP	AF
	OR	A
	JP	NZ,BADSECT
	JR	ADVSEC

; Write the current directory buffer back to the exact record READDIR loaded.
WRITEDIR:
	LD	HL,(DIRTRK)
	LD	B,H
	LD	C,L
	CALL	BIOTRK
	LD	HL,(DIRSEC)
	LD	B,H
	LD	C,L
	LD	DE,(XLTPTR)
	CALL	BIOTRN
	LD	B,H
	LD	C,L
	CALL	BIOSEC
				; Fall through to the common directory-buffer write suffix.

; The delete loop writes immediately after READDIR, so the BIOS remains on the
; matching directory record and only the DMA needs changing.
WRDIRNOW:
	LD	HL,(DIRPTR)
	LD	B,H
	LD	C,L
	CALL	BIODMA
	LD	C,1
	CALL	BIOWRS
	PUSH	AF
	LD	HL,(CURDMA)
	LD	B,H
	LD	C,L
	CALL	BIODMA
	POP	AF
	OR	A
	CALL	NZ,BADSECT
	RET

ADVSEC:
	LD	HL,(CURSEC)
	INC	HL
	EX	DE,HL
	LD	HL,(DPBPTR)
	LD	C,(HL)
	INC	HL
	LD	B,(HL)
	EX	DE,HL
	OR	A
	SBC	HL,BC
	JR	C,SECSAME
	LD	HL,0
	LD	(CURSEC),HL
	LD	HL,(CURTRK)
	INC	HL
	LD	(CURTRK),HL
	RET

SECSAME:
	ADD	HL,BC
	LD	(CURSEC),HL
	RET

; Select the current drive and capture its public tables. Rescan directory
; counters on each selection, but clear allocations only on first login/reset:
; a logged-in vector also owns reservations in open, not-yet-closed FCBs.
LOGIN:
	CALL	LOGTEST
	PUSH	AF
	LD	E,0
	JR	Z,LOGSEL
	INC	E
LOGSEL:
	LD	A,(CURDRV)
	LD	C,A
	CALL	BIOSEL
	LD	A,H
	OR	L
	JR	NZ,LOGOK
	POP	AF
	JP	SELFAIL
LOGOK:
	LD	(DPHPTR),HL

	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	LD	(XLTPTR),DE

				; HL still addresses DPH+1 after reading the translation pointer.
	LD	BC,7
	ADD	HL,BC
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	LD	(DIRPTR),DE
	INC	HL
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	LD	(DPBPTR),DE
	INC	HL
	INC	HL
	INC	HL
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	LD	(ALVPTR),DE

	LD	A,(CURDRV)	; a volume mounted read-only is in ROVEC
	CALL	DRVENT		; from each selection, past a warm boot's clear
	INC	HL
	BIT	0,(HL)
	LD	HL,ROVEC
	CALL	NZ,VSET
	POP	AF
	JR	NZ,LOGFAST
	CALL	INITALV
	LD	HL,LOGINV
	CALL	VSET

	LD	HL,0
	LD	(DIRCNT),HL
	LD	(DIRUSED),HL

	LD	HL,(DPBPTR)
	LD	BC,7
	ADD	HL,BC
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	EX	DE,HL
	SRL	H
	RR	L
	SRL	H
	RR	L
	INC	HL
	LD	(DIRLEFT),HL
	LD	DE,(WARMV)	; TEC-OS: a rebuild, to the mark only
	CALL	VTEST
	JR	Z,LOGNEW
	CALL	DUPTR
	LD	A,(HL)
	INC	HL
	LD	H,(HL)
	LD	L,A
	LD	DE,3
	ADD	HL,DE
	SRL	H
	RR	L
	SRL	H
	RR	L
	LD	(DIRLEFT),HL
LOGNEW:

				; Binding a disk replaces directory iteration state. Reuse the same
				; initial position as a new file search; default-pointer queries do
				; not enter LOGIN and therefore retain their active search position.
	CALL	NEWSRCH

DIRSCAN:
	LD	HL,(DIRLEFT)
	LD	A,H
	OR	L
	JR	Z,LOGDONE
	CALL	READDIR
	CALL	PARDIR

	LD	HL,(DIRLEFT)
	DEC	HL
	LD	(DIRLEFT),HL
	JR	DIRSCAN

; TEC-OS: a drive that is already logged in keeps its allocation vector, so
; only its directory high-water mark is restored, from the third DPH scratch
; word where DR's BDOS keeps the same value. DIRCNT covers every entry, as it
; does after a full scan.
LOGFAST:
	CALL	DUPTR
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	LD	(DIRUSED),DE
LOGCNT:	LD	HL,(DPBPTR)
	LD	BC,7
	ADD	HL,BC
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	INC	DE
	LD	(DIRCNT),DE
	JP	NEWSRCH

; TEC-OS: the end of a scan. The mark saved, the vector's sum taken for the
; next warm boot, the dirty flag and WARMV's bit cleared.
LOGDONE:
	CALL	DUSAVE
	CALL	ALVSUM
	LD	HL,(DPHPTR)
	INC	HL
	INC	HL
	LD	(HL),E
	INC	HL
	LD	(HL),D
	INC	HL
	LD	(HL),0
	LD	HL,WARMV
	CALL	VCLR
	JR	LOGCNT

; Record DIRUSED for the current drive in its DPH, unless the mark there is
; higher already: a BIOS directory write may have raised it.
DUSAVE:
	CALL	DUPTR
	LD	DE,(DIRUSED)
	LD	C,(HL)
	INC	HL
	LD	B,(HL)
	PUSH	HL
	LD	H,B
	LD	L,C
	OR	A
	SBC	HL,DE
	POP	HL
	RET	NC
	LD	(HL),D
	DEC	HL
	LD	(HL),E
	RET

; DE = the sum of the current drive's allocation vector, DSM / 8 + 1 bytes.
ALVSUM:	CALL	ALVLEN
	EX	DE,HL		; existing SUMDE takes its source in DE
	LD	HL,0
	CALL	SUMDE
	EX	DE,HL		; sum in DE, pointer past the vector in HL
	RET

DUPTR:
	LD	HL,(DPHPTR)
	LD	BC,6
	ADD	HL,BC
	RET

; Return BC = DSM / 8 + 1 allocation bytes, HL = the BIOS-owned vector.
; Uses BC/HL and flags; preserves A/DE/IX/IY.
ALVLEN:
	LD	HL,(DPBPTR)
	LD	BC,5
	ADD	HL,BC
	LD	C,(HL)
	INC	HL
	LD	B,(HL)
	SRL	B
	RR	C
	SRL	B
	RR	C
	SRL	B
	RR	C
	INC	BC
	LD	HL,(ALVPTR)
	RET

; Clear the BIOS-owned allocation vector and copy the reserved-directory
; bits supplied by the selected drive's DPB.
INITALV:
	CALL	ALVLEN

CLRAVL:
				; Test the remaining count directly. Restoring AF here would restore
				; the old Z flag and stop after the first allocation-vector byte.
	LD	(HL),0
	INC	HL
	DEC	BC
	LD	A,B
	OR	C
	JR	NZ,CLRAVL

	LD	HL,(DPBPTR)
	LD	BC,9
	ADD	HL,BC
	LD	DE,(ALVPTR)
	LD	A,(HL)
	LD	(DE),A
	INC	HL
	INC	DE
	LD	A,(HL)
	LD	(DE),A
	RET

PARDIR:
	LD	HL,(DIRPTR)
	LD	(ENTPTR),HL
	LD	A,4
	LD	(ENTLEFT),A

PARELOOP:
	CALL	PARENT
	LD	A,(ENTLEFT)
	DEC	A
	LD	(ENTLEFT),A
	JR	NZ,PARELOOP
	RET

PARENT:
	LD	HL,(ENTPTR)
	PUSH	HL
	LD	DE,32
	ADD	HL,DE
	LD	(ENTPTR),HL
	POP	HL
	LD	DE,(DIRCNT)
	INC	DE
	LD	(DIRCNT),DE
	LD	A,(HL)
	CP	$E5
	RET	Z
	LD	(DIRUSED),DE
	LD	DE,16
	ADD	HL,DE
	LD	IX,(DPBPTR)
	LD	A,(IX+6)
	OR	A
	LD	A,16
	JR	Z,PARCNT
	LD	A,8
PARCNT:
	LD	(ALLEFT),A
PARCELL:
	LD	E,(HL)
	LD	D,0
	INC	HL
	LD	A,(IX+6)	; BITPTR preserves/reloads this drive's DPB
	OR	A
	JR	Z,PARHAVE
	LD	D,(HL)
	INC	HL
PARHAVE:
	PUSH	HL
	CALL	MARKBLK
	POP	HL
	LD	A,(ALLEFT)
	DEC	A
	LD	(ALLEFT),A
	JR	NZ,PARCELL
	RET

FREEENT:
	LD	HL,(MATCHPTR)
	LD	DE,16
	ADD	HL,DE
	LD	IX,(DPBPTR)
	LD	A,(IX+6)
	OR	A
	LD	A,16
	JR	Z,FREECNT
	LD	A,8
FREECNT:
	LD	(ALLEFT),A
FREECELL:
	LD	E,(HL)
	LD	D,0
	INC	HL
	LD	A,(IX+6)	; BITPTR preserves/reloads this drive's DPB
	OR	A
	JR	Z,FREEHAVE
	LD	D,(HL)
	INC	HL
FREEHAVE:
	PUSH	HL
	CALL	CLRBLK
	POP	HL
	LD	A,(ALLEFT)
	DEC	A
	LD	(ALLEFT),A
	JR	NZ,FREECELL
	RET

MARKBLK:
	CALL	BITPTR
	RET	Z
	OR	(HL)
	LD	(HL),A
	RET

CLRBLK:
	CALL	BITPTR
	RET	Z
	CPL
	AND	(HL)
	LD	(HL),A
	RET

; Z if DE is 0 or past the volume's end: such a block has no bit, so a directory
; with one can still be logged in and its file erased. Reading it is refused.
BITPTR:
	LD	A,D
	OR	E
	RET	Z
	CALL	BLKPAST
	SBC	A,A		; FFh if past the end
	INC	A
	RET	Z
	LD	A,E
	AND	7
	LD	B,A
	EX	DE,HL
	SRL	H
	RR	L
	SRL	H
	RR	L
	SRL	H
	RR	L
	LD	DE,(ALVPTR)
	ADD	HL,DE
	LD	A,$80
	LD	C,A
	LD	A,B
	OR	A
	LD	A,C
	JR	Z,BITDONE

SHIFBIT:
	RRCA
	DJNZ	SHIFBIT

BITDONE:
	OR	A
	RET

; Z means the current drive needs its allocation vector rebuilt. The BIOS
; receives the normalized result separately in E; the mask itself may be wide.
; NZ if the current drive's bit is set in LOGINV (LOGTEST) or in DE (VTEST).
LOGTEST:
	LD	DE,(LOGINV)
VTEST:	CALL	DRVMASK
	LD	A,L
	AND	E
	LD	L,A
	LD	A,H
	AND	D
	OR	L
	RET

; The current drive's bit cleared (VCLR) or set (VSET) in the vector at HL;
; ANDV ands the vector at HL with BC.
VCLR:	PUSH	HL
	CALL	DRVMASK
	LD	A,L
	CPL
	LD	C,A
	LD	A,H
	CPL
	LD	B,A
	POP	HL
ANDV:	LD	A,(HL)
	AND	C
	LD	(HL),A
	INC	HL
	LD	A,(HL)
	AND	B
	LD	(HL),A
	RET
VSET:	PUSH	HL
	CALL	DRVMASK
	EX	DE,HL
	POP	HL
	LD	A,(HL)
	OR	E
	LD	(HL),A
	INC	HL
	LD	A,(HL)
	OR	D
	LD	(HL),A
	RET

DRVMASK:
	LD	A,(CURDRV)
MASKA:
	LD	B,A
	LD	HL,1
	OR	A
	RET	Z

MASKLOOP:
	ADD	HL,HL
	DJNZ	MASKLOOP
	RET

; RONZ: NZ if the selected drive is read-only. Changes AF, DE, HL.
RONZ:	LD	DE,(ROVEC)
	JR	VTEST		; DRVMASK preserves DE; same mask and Z result
CHKRO:	CALL	RONZ		; writable: on
	RET	Z
	LD	HL,ERRRO
	LD	B,2		; read-only disk
	JR	BDERR

; Failure diagnostics are deliberately kept behind one routine so later
; milestones can add the exact CP/M retry/abort interaction without coupling
; normal disk algorithms to console policy.
SELFAIL:
	LD	HL,ERRSEL
	LD	B,4		; select
	JR	BDERR

ERRTEXT:
	LD	A,(HL)
	OR	A
	RET	Z
	INC	HL
	PUSH	HL
	LD	C,A
	CALL	OUTCHAR
	POP	HL
	JR	ERRTEXT

BADSECT:
	LD	HL,ERRBAD
	LD	B,1		; disk I/O

; A BDOS error, the message at HL and its code in B, as function 45's mode
; says: returned to the program (FFh), said and returned (FEh), or said, a key
; waited for and the program ended with the rest of a chained line (default).
; A returned error leaves a chained line alone (KD-181).
BDERR:	LD	A,(ERRMODE)
	CP	$FE
	JR	C,BDDEF		; the default
	PUSH	BC
	CALL	Z,DISKMSG	; FEh: the message first
	POP	BC
	LD	H,B		; H = the code, A = L = FFh
	LD	L,$FF
	JP	RETWORD
BDDEF:	CALL	DISKMSG
	CALL	GETCHAR		; a key, then the program ends
	JP	CHDROP

; Reject corrupt allocation references before vector indexing or the 16-bit
; block-to-record shift. DE is the block; preserve it and HL/BC. IX identifies
; the current DPB on return. Invalid references follow the fatal I/O path.
CHKBLK:
	CALL	BLKPAST
	JR	C,BADSECT
	RET

; Carry if block DE is past the end of the current drive. Sets IX to its DPB.
BLKPAST:
	LD	IX,(DPBPTR)
	LD	A,(IX+5)
	CP	E
	LD	A,(IX+6)
	SBC	A,D
	RET

; The message at HL after "Bdos Err On X".
DISKMSG:
	PUSH	HL
	LD	HL,ERRHEAD
	CALL	ERRTEXT
	LD	A,(CURDRV)
	ADD	A,'A'
	LD	C,A
	CALL	OUTCHAR
	POP	HL
	JR	ERRTEXT

GETCHAR:
	LD	A,(PENDING)
	OR	A
	JP	Z,BIOCIN
	XOR	A
	LD	(PENDING),A
	LD	A,(PENDCHR)
	RET

CONSTAT:
	LD	A,(PENDING)
	OR	A
	RET	NZ
	JP	BIOCST

CONSTQ:
	LD	A,(PENDING)
	OR	A
	RET	NZ
	JP	BCONST

OUTCHAR:
	LD	A,C
	CP	TAB
	JR	NZ,OUTONE

TABLOOP:
	LD	C,SPACE
	CALL	OUTONE
	LD	A,(COLUMN)
	AND	7
	JR	NZ,TABLOOP
	RET

OUTONE:
	PUSH	BC
	CALL	CHKKEY
	POP	BC
	JR	ECHORAW

ECHOONE:
	PUSH	BC
	CALL	CONSTAT
	POP	BC

ECHORAW:
	CALL	BIOCOT
	LD	A,(LISTEN)
	OR	A
	CALL	NZ,BIOLST
	LD	A,C
	CP	CR
	JR	Z,COLZERO
	CP	BACKSP
	JR	Z,COLBACK
	CP	SPACE
	RET	C
	LD	A,(COLUMN)
	INC	A
	LD	(COLUMN),A
	RET

ECHOCHAR:
	LD	A,C
	CP	TAB
	JR	NZ,ECHOONE

ECHOTAB:
	LD	C,SPACE
	CALL	ECHOONE
	LD	A,(COLUMN)
	AND	7
	JR	NZ,ECHOTAB
	RET

COLZERO:
	XOR	A
	LD	(COLUMN),A
	RET

COLBACK:
	LD	A,(COLUMN)
	OR	A
	RET	Z
	DEC	A
	LD	(COLUMN),A
	RET

CHKKEY:
	CALL	CONSTQ		; TEC-OS: the check draws no cursor
	OR	A
	RET	Z
	CALL	GETCHAR
	CP	CTRLS
	JR	NZ,CHKPRN
	JP	GETCHAR

CHKPRN:
	CP	CTRLP
	JR	Z,TOGLIST
				; TEC-OS: any other key is kept for the next console read, as CP/M 2.2
				; does, so typing during output is not lost.
	LD	(PENDCHR),A
	LD	A,1
	LD	(PENDING),A
	RET

TOGLIST:
	LD	A,(LISTEN)
	XOR	1
	LD	(LISTEN),A
	RET

ERASE1:
	LD	C,BACKSP
	CALL	BIOCOT
	LD	C,SPACE
	CALL	BIOCOT
	LD	C,BACKSP
	CALL	BIOCOT
	JR	COLBACK
