; The BDOS's records: sequential and random reads and writes, the FCB's fields,
; block allocation and zero fill, and a record's place on the disk. Included
; after bdosfile.asm by rom.asm.

; Write the DMA's record at the FCB's current record, CR, and move CR on: for
; function 21 and, through RANDPREP, functions 34 and 40. CR at 128 moves the
; FCB to its next extent first (ADVEXT). Takes the FCB at PARAM and ZEROFIL,
; bit 0 to zero-fill a new block. Returns A = 0 written, 1 with the directory
; full, 2 with the disk full; a disk error goes to BADSECT. Destroys every
; register, SEQREC and WRTYPE.
WRITESEQ:
	CALL	FCBCR		; HL at CR
	LD	A,(HL)
	CP	128		; CR 0..127: a record in this extent
	JR	C,WRITEPOS
	CALL	ADVEXT		; past the extent: the next, made if new
	OR	A
	RET	NZ		; 1: no directory entry for it
	CALL	FCBCR		; CR, now 0 in the new extent
	LD	A,(HL)

; Write the DMA's record as record A of the FCB's extent, claiming a block
; for it when the map has none. Takes A = the record, 0..127, and the FCB at
; PARAM; returns as WRITESEQ.
WRITEPOS:
	LD	(SEQREC),A	; the record within the extent
	XOR	A		; write type 0: a block already allocated
	LD	(WRTYPE),A
	CALL	FCBLOCK		; DE = the record's block, 0 for none
	LD	A,D
	OR	E
	JR	NZ,WRITEBLK	; a block in the map: write to it
	CALL	ALLOCBLK	; a free block, put in the FCB's map
	OR	A
	RET	NZ		; 2: the disk is full
	LD	A,2		; write type 2: a block newly allocated,
	LD	(WRTYPE),A	; so the BIOS need not read it first
	LD	A,(ZEROFIL)
	RRA			; bit 0 into carry: function 40's fill
	CALL	C,ZEROBLK	; every record of block DE zeroed, DE kept

; Write the DMA's record, SEQREC of block DE, with WRTYPE's write type, then
; move the FCB on. Returns A = 0; a disk error goes to BADSECT.
WRITEBLK:
	CALL	POSREC		; the BIOS on the record's track and sector
	LD	A,(WRTYPE)
	LD	C,A		; C = the BIOS's write type
	CALL	BIOWRS
	OR	A
	JR	NZ,WRITEBAD	; nonzero: the BIOS failed the write
	JR	ADVWRITE	; the FCB moves on once the record is
				; written: function 45's returned error
				; leaves it on that record, as CP/M 3 does

; A failed write: the BDOS's disk I/O error, which does not come back.
WRITEBAD:
	JP	BADSECT

; A sequential write past record 127 moves to the next extent first, as CP/M
; 2.2's open_reel does: the write that needs the extent makes it. With the
; directory full that write returns 1 and the FCB is put back on its extent,
; record 128, so a write after an entry is freed makes the extent it needs.
; A close that fails, no entry holding the extent, returns 1 the same way.
; Takes the FCB at PARAM. Returns A = 0 with CR 0 in the next extent, or 1.
; Destroys every register, WRTYPE, TARGEX and TARGS2.
ADVEXT:
	CALL	CLOSEFCB	; this extent's entry brought up to date
	INC	A		; Z: the close returned FFh
	LD	A,1		; 1: the FCB left on record 128
	RET	Z
	CALL	FCBEX
	LD	E,(HL)		; EX and S2, for a make that fails
	INC	HL
	INC	HL
	LD	D,(HL)		; S2, two bytes past EX
	PUSH	DE		; kept on the stack for EXTFULL
	CALL	NEXTEXT		; EX on one, the extent opened if it exists
	OR	A
	JR	Z,EXTCLEAR	; found: its entry's map now in the FCB
	LD	A,1		; nonzero: MAKEFCB keeps the new EX and S2
	LD	(WRTYPE),A
	CALL	MAKEFCB		; a new directory entry for the extent
	INC	A
	JR	Z,EXTFULL	; FFh: the directory is full

; The FCB on its new extent: CR to 0. Takes the saved EX and S2 on the
; stack, dropped here. Returns A = 0.
EXTCLEAR:
	POP	DE		; the saved EX and S2, not needed
	CALL	FCBCR
	XOR	A
	LD	(HL),A		; CR 0: the extent's first record
	RET			; A = 0: the extent ready

; No room for the new extent: the FCB goes back to its EX and S2, saved on
; the stack, with CR still 128. Returns A = 1.
EXTFULL:
	CALL	FCBEX
	POP	DE		; E = the old EX, D = the old S2
	LD	(HL),E
	INC	HL
	INC	HL
	LD	(HL),D		; both put back
	LD	A,1		; 1: the directory is full
	RET

; A record written: CR on one, RC raised to CR when CR passes it, and the
; FCB marked changed, S2's bit 7 clear, for close to write its entry. Takes
; the FCB at PARAM. Returns A = 0; destroys B, DE, HL, F.
ADVWRITE:
	CALL	FCBCR
	INC	(HL)		; CR on to the next record
	LD	A,(HL)
	LD	B,A		; B = the new CR
	LD	DE,15
	CALL	FCBOFF		; HL at RC, the extent's record count
	CP	(HL)
	JR	C,WRITERC	; CR below RC: the count stands
	LD	(HL),B		; else the extent now holds CR records
WRITERC:
	DEC	HL		; S2, the byte before RC
	LD	A,(HL)
	AND	$7F		; bit 7 clear: the FCB has changed
	LD	(HL),A
	XOR	A		; 0: written
	RET

; Function 20, read sequential: the FCB's next record into the DMA, and
; READSEQ's result returned to the program.
FNREADSQ:
	CALL	READSEQ
	JP	RETA		; A to the program in A and HL

; Read the FCB's current record, CR, into the DMA and move CR on. CR at 128
; moves the FCB to its next extent first. Takes the FCB at PARAM. Returns
; A = 0 read, 1 at the end of the file; a disk error goes to BADSECT.
; Destroys every register and SEQREC.
READSEQ:
	CALL	FCBCR		; HL at CR
	LD	A,(HL)
	CP	128		; CR 0..127: a record in this extent
	JR	C,READCHK
				; Close before moving on, as CP/M 2.2's
				; open_reel does: the reopen replaces the
				; allocation map, so blocks written through
				; this FCB since its open must reach the
				; directory first.
	CALL	CLOSEFCB
	INC	A
	JR	Z,READ_EOF	; FFh: the close failed
	CALL	NEXTEXT		; the next extent, opened
	OR	A
	JR	NZ,READ_EOF	; none on the disk: the file ends
	CALL	FCBCR
	XOR	A
	LD	(HL),A		; CR 0 in the new extent

; Read record CR of the FCB's extent, HL at CR, if the extent's record count
; and its allocation map hold it. Returns as READSEQ.
READCHK:
	LD	A,(HL)
	LD	(SEQREC),A	; the record within the extent
	LD	B,A
	LD	DE,15
	CALL	FCBOFF		; HL at RC, the extent's record count
	LD	A,(HL)
	CP	B
	JR	Z,READ_EOF	; RC = CR: past the last record written
	JR	C,READ_EOF	; RC below CR: past it too
	CALL	FCBLOCK		; DE = the record's block
	LD	A,D
	OR	E
	JR	Z,READ_EOF	; no block in the map: read as the end
	CALL	POSREC		; the BIOS on the record's track and sector
	CALL	BIORDS
	OR	A
	JP	NZ,BADSECT	; returned: the FCB on the record unread
	CALL	FCBCR		; read: CR on to the next record
	INC	(HL)
	XOR	A		; 0: read
	RET

; The end of the file, or a record not yet written: A = 1.
READ_EOF:
	LD	A,1		; 1: no record read
	RET

; Function 33, read random: record r0-r1 of the FCB into the DMA, CR left on
; it. Returns A = 0, 1 for a record not written, 3 when the extent left
; cannot be closed, 4 for an extent not written, 6 past record 65535.
FNRREAD:
	XOR	A		; ZEROFIL 0: a read
	LD	(ZEROFIL),A
	CALL	RANDPREP	; the FCB on the record's extent and record
	JR	C,RANDRET	; carry: A = the error
	CALL	READSEQ		; the record read, CR moved on
	JR	RANDDONE

; ZEROFIL is zero for reads and sequential writes. Random writes set bit 7,
; which marks a write for RANDMISS, and function 40 also sets bit 0 to
; zero-fill each newly allocated block.
; Function 34, write random: the DMA's record to record r0-r1 of the FCB, CR
; left on it. Returns as function 40.
FNRWRITE:
	LD	A,$80		; a write, no zero fill
	JR	RANDWRT

; Function 40, write random with zero fill: as function 34, but a block newly
; claimed for the record has every record zeroed first. Returns A = 0, 2 with
; the disk full, 3 when the extent left cannot be closed, 5 with the
; directory full, 6 past record 65535.
FNWRZERO:
	LD	A,$81		; a write, with zero fill

; A random write in ZEROFIL's mode, A: a read-only drive or file goes no
; further (ROFCB); the record written and the result returned as function 40.
RANDWRT:
	LD	(ZEROFIL),A
	CALL	ROFCB		; R/O drive or file: an error, no return
	CALL	RANDPREP	; the FCB on the record's extent and record
	JR	C,RANDRET	; carry: A = the error
	CALL	WRITESEQ	; the record written, CR moved on

; The end of a random read or write: CR back on the record, SEQREC, as CP/M
; leaves it, and A, the result, returned to the program.
RANDDONE:
	PUSH	AF		; the result
	CALL	FCBCR
	LD	A,(SEQREC)
	LD	(HL),A		; CR back on the record read or written
	POP	AF

; Return A, a random read's or write's result, to the program.
RANDRET:
	JP	RETA

; Put the FCB on the extent that holds its random record, r0-r2, and CR on
; the record within it; an extent not on the disk is made for a write. Takes
; the FCB at PARAM and ZEROFIL, nonzero for a write. Returns no carry and
; A = 0, or carry and A = 3 (the extent left cannot be closed), 4 (a read of
; an extent not written), 5 (the directory full) or 6 (past record 65535).
; Destroys every register, SEQREC, TARGEX, TARGS2 and WRTYPE.
RANDPREP:
	CALL	FCBCR
	INC	HL
	LD	C,(HL)		; C = r0
	INC	HL
	LD	D,(HL)		; D = r1
	INC	HL
	LD	E,(HL)		; E = r2
	LD	A,E		; CP/M 2.2 records 0..65535; r2 is overflow
	OR	A
	LD	A,6		; 6: past the last record
	JR	NZ,RANDFAIL	; reject before changing any FCB field
	LD	A,C
	AND	$7F		; r0's low seven bits: the record in its extent
	LD	(SEQREC),A

	LD	A,C
	RLCA			; r0 bit 7 becomes EX bit 0
	LD	A,D
	RLA			; EX = the record / 128,
	AND	$1F		; in EX's five bits
	LD	(TARGEX),A

	LD	A,D		; S2 = the record / 4096: r1's top four
	RRCA			; bits, r2 being zero, proved above
	RRCA
	RRCA
	RRCA
	AND	$0F		; the module
	LD	(TARGS2),A

	CALL	FCBEX
	LD	A,(HL)
	AND	$1F		; the FCB's EX
	LD	B,A
	LD	A,(TARGEX)
	CP	B
	JR	NZ,RANDOPEN	; another extent: close this, open that
	INC	HL
	INC	HL
	LD	A,(HL)
	AND	$3F		; the FCB's S2, less its flag bits
	LD	B,A
	LD	A,(TARGS2)
	CP	B
	JR	Z,RANDPOS	; the same extent: only CR to set

; Leaving an extent closes it first, so its directory entry keeps the record
; count and blocks written through this FCB. The FCB then takes TARGEX and
; TARGS2 and opens that extent, going to RANDMISS when it is not on the disk.
RANDOPEN:
	CALL	CLOSEFCB
	INC	A		; Z: the close returned FFh
	LD	A,3		; 3: the extent cannot be closed
	JR	Z,RANDFAIL
	CALL	FCBEX
	LD	A,(TARGEX)
	LD	(HL),A		; EX = the record's extent
	INC	HL
	INC	HL
	LD	A,(HL)
	AND	$80		; S2's bit 7, the unchanged mark, kept
	LD	B,A
	LD	A,(TARGS2)
	OR	B
	LD	(HL),A		; S2 = the record's module
	CALL	NEXTFIND	; open the extent: its entry into the FCB
	OR	A
	JR	NZ,RANDMISS	; no entry for it on the disk

; The FCB on the record's extent: CR = SEQREC. Returns no carry and A = 0.
RANDPOS:
	CALL	FCBCR
	LD	A,(SEQREC)
	LD	(HL),A		; CR on the record
	XOR	A		; 0 and no carry: ready
	RET

; A read of an extent that was never made returns 4. A write makes the
; extent, as CP/M does, and returns 5 when the directory is full. Returns as
; RANDPREP.
RANDMISS:
	LD	A,(ZEROFIL)
	OR	A		; zero: a read
	LD	A,4		; 4: a read of an extent not written
	JR	Z,RANDFAIL
	LD	(WRTYPE),A	; any nonzero: MAKEFCB keeps EX and S2
	CALL	MAKEFCB		; a new directory entry for the extent
	INC	A
	JR	NZ,RANDPOS	; made: on to the record
	LD	A,5		; FFh: 5, the directory is full

; A random record refused: carry, with A = the error code.
RANDFAIL:
	SCF			; carry: A is an error, the FCB not ready
	RET

; Return in DE the block that holds record SEQREC of the FCB's extent, 0 for
; none. A map cell is one byte when DSM is below 256 and two otherwise. Takes
; the FCB at PARAM. Returns HL at the cell's last byte and IX = the DPB;
; destroys A, BC, F.
FCBLOCK:
	CALL	FCBADDR		; HL at the record's map cell
	LD	E,(HL)		; the block's low byte
	LD	D,0
	LD	IX,(DPBPTR)
	LD	A,(IX+6)	; DSM's high byte
	OR	A
	RET	Z		; DSM below 256: a one-byte cell
	INC	HL
	LD	D,(HL)		; the high byte of a two-byte cell
	RET

; Return HL at the FCB's CR, its current record, byte 32. Destroys DE and
; the carry.
FCBCR:
	LD	DE,32		; CR's offset in the FCB
	JR	FCBOFF

; Return HL at the FCB's EX, its extent, byte 12. Destroys DE and the carry.
FCBEX:
	LD	DE,12		; EX's offset in the FCB

; Return HL at byte DE of the program's FCB, at PARAM. Keeps A, BC and DE;
; destroys the carry.
FCBOFF:
	LD	HL,(PARAM)	; the FCB the program passed in DE
	ADD	HL,DE
	RET

; Return the allocation-map cell for SEQREC in HL. The record's place in the
; entry is (EX AND EXM) * 128 + SEQREC, shifted right by BSH. Takes the FCB
; at PARAM; BSH is at least 1. Destroys A, BC, DE, F.
FCBADDR:
	LD	HL,(DPBPTR)	; the drive's DPB: BSH at 2, EXM at 4
	INC	HL
	INC	HL
	LD	B,(HL)		; BSH
	INC	HL
	INC	HL
	LD	C,(HL)		; EXM
	CALL	FCBEX
	LD	A,(HL)
	AND	C		; the extent's place among the entry's
	LD	H,A
	LD	A,(SEQREC)
	ADD	A,A
	LD	L,A		; HL = that place * 256 + SEQREC * 2
	SRL	H		; HL = extent in entry * 128 + SEQREC
	RR	L
RECSHFT:
	SRL	H		; one shift for each bit of BSH: the
	RR	L		; record's block within the entry
	DJNZ	RECSHFT
	LD	A,L		; A = that block's index in the map
BLOCKIDX:
	LD	C,A
	LD	HL,(DPBPTR)
	LD	DE,6
	ADD	HL,DE
	LD	A,(HL)		; DSM's high byte
	OR	A
	LD	A,C
	JR	Z,BLOCKBYT	; one-byte cells: the index is the offset
	ADD	A,A		; two-byte cells: twice the index
BLOCKBYT:
	LD	E,A
	LD	D,0
	LD	HL,(PARAM)
	LD	BC,16		; the map from FCB byte 16
	ADD	HL,BC
	ADD	HL,DE		; HL at the cell
	RET

; Claim the first free block through the BIOS-owned allocation vector, publish
; it in the current FCB allocation cell, and return the block in DE. The cell
; is SEQREC's in the FCB's extent, and the drive is marked changed in its DPH
; byte 4. Returns A = 0, or A = 2 with no block free. Destroys BC, HL, F;
; leaves IX = the DPB.
ALLOCBLK:
	LD	HL,(ALVPTR)	; the vector: a bit for each block, bit 7
	LD	IX,(DPBPTR)	; of the first byte for block 0
	LD	DE,0		; DE = the block the bit stands for
	LD	C,$80		; C = its bit in the byte at HL
ALLOCLOP:
	LD	A,(HL)
	AND	C
	JR	Z,ALFOUND	; clear: the block is free
	LD	A,D
	CP	(IX+6)
	JR	NZ,ALNEXT	; not yet DSM, the last block
	LD	A,E
	CP	(IX+5)
	JR	Z,ALFULL	; DSM itself in use: no block free
ALNEXT:
	INC	DE		; the next block
	SRL	C
	JR	NZ,ALLOCLOP	; its bit in the same byte
	INC	HL
	LD	C,$80		; or bit 7 of the next byte
	JR	ALLOCLOP

; Block DE is free: its bit set, the drive marked changed, and the block
; written in the FCB's map cell for SEQREC. Returns A = 0.
ALFOUND:
	LD	A,(HL)
	OR	C		; the block now in use
	LD	(HL),A
	PUSH	HL		; TEC-OS: the vector changed, the drive dirty
	LD	HL,(DPHPTR)	; the drive's DPH
	INC	HL
	INC	HL
	INC	HL
	INC	HL
	LD	(HL),1		; its byte 4 set: the vector changed
	POP	HL
	PUSH	DE		; the block, kept through FCBADDR
	CALL	FCBADDR		; HL at the record's map cell
	POP	DE
	LD	(HL),E		; the block's low byte
	LD	A,(IX+6)
	OR	A
	JR	Z,ALLOCDON	; DSM below 256: a one-byte cell
	INC	HL
	LD	(HL),D		; the high byte of a two-byte cell
ALLOCDON:
	XOR	A		; 0: a block claimed
	RET

; Every block through DSM in use: A = 2, the disk full.
ALFULL:
	LD	A,2		; 2: no block free
	RET

; CP/M function 40 clears a newly allocated block before publishing the
; caller's target record. The BIOS directory buffer is reusable scratch here.
; Takes DE = the block and SEQREC = the target record. Writes 128 zero bytes
; to each of the block's records, the BIOS's DMA on them for each write and
; back on CURDMA after it (DMABACK), so a failed write that function 45
; returns leaves the program's DMA in the BIOS. Returns DE = the block and
; SEQREC as it was; a disk error goes to BADSECT. Destroys A, BC, HL, IX, F,
; and TARGEX and ALLEFT, used as scratch.
ZEROBLK:
	LD	(ZEROBN),DE	; the block, kept through POSREC
	LD	A,(SEQREC)
	LD	(TARGEX),A	; the target record, kept in TARGEX
	LD	HL,(DIRPTR)
	LD	(HL),0		; the directory buffer's first byte zero,
	LD	D,H
	LD	E,L
	INC	DE		; copied on through the rest:
	LD	BC,127
	LDIR			; 128 zero bytes
	LD	IX,(DPBPTR)
	LD	A,(IX+3)	; BLM: the records in a block, less one
	INC	A
	LD	(ALLEFT),A	; ALLEFT counts the records to write
	DEC	A
	CPL			; NOT BLM: the mask for a block's start
	LD	B,A
	LD	A,(SEQREC)
	AND	B		; the block's first record in the extent
	LD	(SEQREC),A
ZEROLOOP:
	LD	DE,(ZEROBN)
	CALL	POSREC		; the BIOS on record SEQREC of the block
	LD	HL,(DIRPTR)
	LD	B,H
	LD	C,L
	CALL	BIODMA		; the BIOS's DMA on the zeros
	LD	C,2		; write type 2: a block newly allocated
	CALL	BIOWRS
	CALL	DMABACK		; the DMA back; a failed write: error 1
	LD	A,(SEQREC)
	INC	A
	LD	(SEQREC),A	; the block's next record
	LD	A,(ALLEFT)
	DEC	A
	LD	(ALLEFT),A
	JR	NZ,ZEROLOOP	; until every record of the block is zero
	LD	A,(TARGEX)
	LD	(SEQREC),A	; the target record back
	LD	DE,(ZEROBN)	; DE = the block, as on entry
	RET

; Position the BIOS at SEQREC within allocation block DE: the track and the
; sector set through the BIOS, the sector translated by the drive's XLT. A
; block past DSM goes to BADSECT. Leaves the track, OFF added, in IOTRK and
; the untranslated sector in IOSEC. Destroys A, BC, DE, HL, IX, F.
POSREC:
	CALL	CHKBLK		; a block past DSM is a disk error
	EX	DE,HL		; HL = the block
	LD	DE,(DPBPTR)	; the drive's DPB: BSH at 2
	INC	DE
	INC	DE
	LD	A,(DE)		; BSH
	LD	B,A
	LD	A,B
	OR	A
	JR	Z,BLOCKSCA	; BSH 0: no shift
BLOCKSHF:
	ADD	HL,HL		; the block's first record: the block
	DJNZ	BLOCKSHF	; shifted left by BSH
BLOCKSCA:
	LD	DE,(DPBPTR)	; the DPB again: BLM at 3
	INC	DE
	INC	DE
	INC	DE
	LD	A,(DE)		; BLM
	LD	B,A
	LD	A,(SEQREC)
	AND	B		; SEQREC's record within the block
	LD	E,A
	LD	D,0
	ADD	HL,DE		; HL = the record from the data's start

	LD	IX,(DPBPTR)
	LD	E,(IX+0)
	LD	D,(IX+1)	; DE = SPT, the sectors on a track
	CALL	DIV16		; DE = the track, HL = the sector
	LD	(IOSEC),HL	; the sector before translation
	EX	DE,HL
	LD	E,(IX+13)
	LD	D,(IX+14)	; OFF, the reserved tracks
	ADD	HL,DE		; the track on the disk
	LD	(IOTRK),HL

	LD	B,H
	LD	C,L
	CALL	BIOTRK		; the BIOS on track BC
	LD	HL,(IOSEC)
	LD	B,H
	LD	C,L
	LD	DE,(XLTPTR)
	CALL	BIOTRN		; HL = sector BC translated through XLT
	LD	B,H
	LD	C,L
	JP	BIOSEC		; the BIOS on that sector

; HL div DE in DE, HL mod DE in HL, unsigned, for DE from 1 to 8000h: the
; remainder then never passes 16 bits. A:C shifts the dividend out and the
; quotient in, each bit a shift behind its trial subtraction. Returns A = D;
; destroys F, BC.
DIV16:	LD	A,H
	LD	C,L		; A:C = the dividend
	LD	HL,0		; HL = the remainder, from 0
	LD	B,16		; one pass for each bit
DIV16L:	RL	C		; the last quotient bit in, the
	RLA			; dividend's next bit out to carry
	ADC	HL,HL		; and on into the remainder
	SBC	HL,DE		; no carry in: HL < DE before the shift
	JR	NC,DIV16S	; no borrow: DE fits, the bit is 1
	ADD	HL,DE		; and carry out
DIV16S:	CCF			; carry = the quotient bit
	DJNZ	DIV16L
	RL	C		; the last quotient bit in
	RLA
	LD	D,A
	LD	E,C		; DE = the quotient
	RET

; Move the FCB to its next extent and open it: EX on one, and past 31 back to
; 0 with S2, the module, on one, its bit 7 kept. Takes the FCB at PARAM.
; Returns A = 0 with the entry's fields in the FCB, or A = 1 with no entry for
; the extent. Destroys every register.
NEXTEXT:
	CALL	FCBEX
	LD	A,(HL)
	INC	A
	AND	$1F		; EX on one, 31 wrapping to 0
	LD	(HL),A
	JR	NZ,NEXTFIND	; no wrap: S2 stands
	INC	HL
	INC	HL
	LD	A,(HL)		; S2
	LD	B,A
	AND	$3F
	INC	A
	AND	$3F		; the module on one, in six bits
	LD	C,A
	LD	A,B
	AND	$80		; with S2's bit 7 kept
	OR	C
	LD	(HL),A

; Open the FCB's extent as its EX and S2 stand: the directory searched in
; mode 1, open, a match's fields copied into the FCB. Takes the FCB at PARAM.
; Returns A = 0 found, 1 not; destroys every register.
NEXTFIND:
	LD	HL,(PARAM)
	LD	(SRCHFCB),HL	; the search's FCB: the program's
	LD	A,1		; mode 1: open, the entry into the FCB
	LD	(OPENMOD),A
	CALL	NEWSRCH		; from the directory's first entry
	CALL	FINDENT
	CP	$FF
	JR	Z,NEXTMISS	; FFh: no entry
	XOR	A		; 0: the extent open
	RET

; No directory entry for the extent: A = 1.
NEXTMISS:
	LD	A,1		; 1: not found
	RET
