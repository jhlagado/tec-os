; CP/M 2.2 BIOS. Cold boot copies the ROM table below to RAMBIOS. That
; page-aligned copy is the one that runs: the BDOS calls it, and programs
; reach it by the vector at 0001h.
;
; Disk records map to volumes linearly: record = track * 64 + sector. Every
; version 1 geometry has 64 records per track and no reserved tracks; the
; build checks this against format.json. Four records share one 512-byte SD
; block. Reads go through the block cache (cache.asm). Writes go through to
; the card before success is reported, except on the one volume written
; behind, whose writes stay in the cache until it writes them.

; BIOS HOME (track 0) and SETTRK: BC = the track, kept in DSKTRK for the
; next READ or WRITE. Nothing moves: the card has no head. HOME destroys BC.
BHOME:	LD	BC,0		; HOME is SETTRK with track 0
BSETTRK:
	LD	(DSKTRK),BC
	RET

; BIOS SETSEC: BC = the sector, kept in DSKSEC; MAPREC checks it.
BSETSEC:
	LD	(DSKSEC),BC
	RET

; BIOS SETDMA: BC = the address the next record goes to or comes from.
BSETDMA:
	LD	(DSKDMA),BC
	RET

; BIOS SECTRAN: BC = the logical sector, DE = the table, unused. Returns
; HL = BC, the same sector.
BSECTRN:
	LD	H,B		; no skew
	LD	L,C
	RET

; C = drive. Returns HL = DPH, or 0 when the drive has no mounted volume.
; A selected drive becomes DSKCUR; a refused one leaves it as it was. E's
; first-login bit is not looked at. Keeps BC; destroys A, DE and F.
BSELDSK:
	LD	A,C
	CP	MAXDRV		; past the last drive: refused
	JR	NC,SELBAD
	CALL	DRVENT
	LD	A,(HL)		; HL points at the geometry byte
	OR	A		; 0: no volume mounted on the drive
	JR	Z,SELBAD
	LD	A,C		; the drive selected
	LD	(DSKCUR),A
DPHADR:	LD	L,A		; HL = DPHTAB + 16 * drive A, for BSELDSK,
				; MNDPH and ALVINIT; keeps BC, destroys DE
	LD	H,0
	ADD	HL,HL		; 16 bytes a DPH
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	LD	DE,DPHTAB	; plus the table's base
	ADD	HL,DE
	RET
SELBAD:	LD	HL,0		; HL = 0: the BDOS's select error
	RET

; A = drive. Returns HL = address of its drive-table geometry byte (offset 6),
; and preserves BC. Destroys A and DE.
DRVENT:	ADD	A,A		; 8 bytes a drive's entry (DRVESZ)
	ADD	A,A
	ADD	A,A
	ADD	A,6		; past the start block (4) and length (2)
	LD	E,A		; DE = the offset into the table
	LD	D,0
	LD	HL,DRVTAB
	ADD	HL,DE
	RET

; Translate DSKTRK/DSKSEC on DSKCUR into BLKOFF, BLKSLOT and SDLBA. Returns Z
; with A = 0 when the record lies inside the volume; NZ when the sector,
; the track or the block is out of range, SDLBA then unchanged. Destroys
; BC, DE and HL.
MAPREC:	LD	HL,(DSKSEC)
	LD	A,H		; sectors 0-63 only
	OR	A
	JR	NZ,MAPBAD
	LD	A,L		; and below 64
	CP	64
	JR	NC,MAPBAD
	LD	HL,(DSKTRK)	; tracks 0-1023 only
	LD	A,H		; tracks above 1023 overflow 16-bit records
	CP	4
	JR	NC,MAPBAD
	ADD	HL,HL		; record = track * 64 + sector
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL		; six doublings: track * 64
	ADD	HL,HL
	ADD	HL,HL
	LD	A,(DSKSEC)	; the sector in the six low bits, which
	OR	L		; the shift left clear
	LD	L,A
	AND	3		; the record's place in its block
	LD	(BLKSLOT),A
	SRL	H		; block = record / 4
	RR	L
	SRL	H
	RR	L
	LD	(BLKOFF),HL	; the block within the volume
	LD	A,(DSKCUR)	; compare with the volume length
	CALL	DRVENT
	DEC	HL		; back from the geometry byte to the
	LD	D,(HL)		; length, high byte first
	DEC	HL
	LD	E,(HL)		; DE = length in blocks
	PUSH	HL		; the entry, kept for the start block
	LD	HL,(BLKOFF)
	OR	A
	SBC	HL,DE		; no borrow: the block is past the end
	POP	HL
	JR	NC,MAPBAD
	DEC	HL		; HL -> start block byte 3
	LD	DE,SDLBA+3
	LD	BC,(BLKOFF)	; the block, added below
	LD	A,(HL)		; SDLBA = start + block, little-endian
	DEC	HL		; copied from the top byte down
	LD	(DE),A
	DEC	DE
	LD	A,(HL)		; byte 2
	DEC	HL
	LD	(DE),A
	DEC	DE
	LD	A,(HL)		; byte 1
	DEC	HL
	LD	(DE),A
	DEC	DE
	LD	A,(HL)		; byte 0
	LD	(DE),A		; SDLBA now holds the start block
	LD	HL,(SDLBA)	; the block added to the low word
	ADD	HL,BC
	LD	(SDLBA),HL
	LD	HL,(SDLBA+2)	; and its carry to the high word
	LD	BC,0
	ADC	HL,BC
	LD	(SDLBA+2),HL
	XOR	A		; Z: inside the volume
	RET
MAPBAD:	OR	1		; NZ: outside it
	RET

; The no-pre-read rule's key: the block BLKOFF on drive DSKCUR, held as C
; says (BUFOK: 2 cleared, not read), so that the next block of its allocation
; block can be cleared rather than read. Returns Z. Destroys A and HL.
GETKEY:	LD	A,(DSKCUR)	; the drive and block, as BWRITE compares
	LD	(BUFDRV),A	; them
	LD	HL,(BLKOFF)
	LD	(BUFBLK),HL
	LD	A,C		; how the block was had
	LD	(BUFOK),A
	XOR	A
	RET

; BIOS READ: copy the record to DSKDMA, through the cache. A = 0 on
; success, 1 on error. Interrupts are off within, and back as they were.
; Destroys BC, DE and HL.
BREAD:	CALL	CDI
	CALL	MAPREC		; a record outside the volume: NZ, an error
	CALL	Z,CREAD
	JP	BRET

; A BIOS WRITE refused before any change: A = 1, with NZ from the test
; that came here.
DSKERR:	LD	A,1
	RET

; BIOS WRITE: the record goes into its block's line in the cache (CWRBH),
; the one write path. The block is read into the line first, unless nothing
; in it is the card's to keep: the write is of type 2 (C), the first to a newly
; allocated block, or the block before, cleared rather than read, is on this
; drive and in the same allocation block (GETKEY's key). On a volume written
; through the line goes to the card before the call returns; on the one written
; behind it stays dirty until a directory write, warm boot or remount. A = 0 on
; success, 1 on error; interrupts are off within, and back as they were.
; A directory write also marks its drive's DPH: the word at offset 4 set to
; 1, and the one at 6 raised to cover the block's entries. Destroys BC, DE
; and HL.
BWRITE:	CALL	CDI
	LD	A,C		; the type: 0 data, 1 directory, 2 the
	LD	(CWTYPE),A	; first of a new allocation block
	CALL	BWR0
	JP	BRET
BWR0:	PUSH	BC		; C, the type, kept over MAPREC
	CALL	MAPREC
	POP	BC
	JR	NZ,DSKERR	; outside the volume
	LD	A,(DSKCUR)	; read-only volumes refuse before any change
	CALL	DRVENT
	INC	HL		; the flags: bit 0 read-only
	BIT	0,(HL)
	JR	NZ,DSKERR
	DEC	HL		; the geometry byte again
	PUSH	HL		; a directory block: its drive dirty, its mark
	PUSH	BC		; raised over the block
	LD	B,(HL)		; the geometry: 1 G8M, 2 G1M
	LD	A,64
BWDN:	SRL	A		; the directory's SD blocks: 32 G8M, 16 G1M
	DJNZ	BWDN
	LD	BC,(BLKOFF)
	INC	B		; block 256 or more: data
	DEC	B
	JR	NZ,BWND
	CP	C		; at or past the directory's end: data
	JR	C,BWND
	JR	Z,BWND
	LD	A,(DSKCUR)	; a directory block: the drive's DPH
	CALL	DPHADR
	LD	DE,4		; the DPH's word at 4: 1, the drive dirty
	ADD	HL,DE
	LD	(HL),1
	INC	HL		; the word at 6, the mark
	INC	HL
	LD	A,C		; DE = (SD block + 1) * 16: the block's
	INC	A		; entries, all of them under the mark
	LD	E,A
	LD	D,0
	EX	DE,HL		; HL the count, DE the mark's address
	ADD	HL,HL		; 16 entries of 32 bytes an SD block
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	EX	DE,HL		; and back
	LD	A,E		; the mark at HL: raised to DE if lower
	SUB	(HL)
	INC	HL
	LD	A,D
	SBC	A,(HL)		; borrow: the mark is already past DE
	JR	C,BWND
	LD	(HL),D		; the new mark, high byte first
	DEC	HL
	LD	(HL),E
BWND:	POP	BC		; C, the type, and HL the geometry byte
	POP	HL
	LD	A,C
	CP	2
	JR	Z,BWNEW		; type 2: nothing in the block to keep
	LD	C,0		; read first, unless the key says otherwise
	LD	A,(BUFOK)
	CP	2		; the key's block was cleared, not read
	JR	NZ,BWGET
	LD	A,(BUFDRV)	; and on this drive
	LD	E,A
	LD	A,(DSKCUR)
	CP	E
	JR	NZ,BWGET	; another drive's key
	LD	B,(HL)		; the geometry: 1 G8M, 2 G1M
	LD	A,16
BWMASK:	SRL	A		; SD blocks in an allocation block
	DJNZ	BWMASK
	DEC	A		; the mask of a block's place in it
	LD	HL,(BLKOFF)
	AND	L
	JR	Z,BWGET		; the first of its allocation block
	DEC	HL		; the key names the block before this one
	LD	DE,(BUFBLK)
	OR	A
	SBC	HL,DE
	JR	NZ,BWGET	; another block: read first
BWNEW:	LD	C,1		; no pre-read
BWGET:	LD	A,(DSKCUR)	; C decided: the volume's policy next
	CALL	DRVENT
	INC	HL		; the flags: bit 1 written behind
	BIT	1,(HL)		; set: the line stays in the cache
	JP	NZ,CWRBH
	LD	HL,CWTYPE	; written through: bit 7 tells CWRBH to
	SET	7,(HL)		; write the line before it returns
	JP	CWRBH

; P/V = the interrupt state. The second read is for an NMOS Z80, which can
; clear P/V if an interrupt is accepted during the first. Destroys A.
IFFGET:	LD	A,I		; P/V = IFF2: PE, interrupts on
	RET	PE
	LD	A,I		; PO: off, or the NMOS fault; read again
	RET

; Interrupts off for a BIOS entry, their state kept in CIFF. Destroys A,
; F and HL.
CDI:	CALL	IFFGET
	DI
	PUSH	AF		; the flags, P/V among them, into HL
	POP	HL
	LD	(CIFF),HL	; L: the flags, P/V in bit 2
	RET

; BIOS READ and WRITE's exit: A = 0 for Z, 1 for NZ (BRET); then, for any
; entry, interrupts back as CDI found them, keeping A and the flags (CEI).
BRET:	LD	A,0		; BIOS READ and WRITE: A from Z or NZ, and
	JR	Z,CEI		; interrupts as they were
	INC	A		; 1: an error
CEI:	PUSH	AF		; A and the flags, kept
	LD	A,(CIFF)	; bit 2, P/V: they were on
	AND	4
	JR	Z,CEI1
	EI			; on again after the next instruction
CEI1:	POP	AF
	RET
