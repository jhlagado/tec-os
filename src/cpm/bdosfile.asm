; The BDOS's drives and files: reset, selection, and the file functions that
; work on whole entries: open, close, search, delete, make, rename and the
; attributes. Included after bdos.asm, in this order, by rom.asm.

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
