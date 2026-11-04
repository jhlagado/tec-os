; The BDOS's drive and file functions that read the tables: the login and
; read-only vectors, the DMA address, the allocation vector, free space, the
; DPB, the user, a file's size and random record, and the directory search.
; Included after bdosrec.asm by rom.asm.

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
