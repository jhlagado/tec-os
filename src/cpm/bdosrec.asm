; The BDOS's records: sequential and random reads and writes, the FCB's fields,
; block allocation and zero fill, and a record's place on the disk. Included
; after bdosfile.asm by rom.asm.

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
