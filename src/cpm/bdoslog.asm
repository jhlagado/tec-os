; The BDOS's directory blocks and drives: reading and writing directory
; records, login, the allocation vectors and their bits, and the drive masks.
; Included after bdosfn.asm by rom.asm.

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
