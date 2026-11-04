; The BDOS's drive and file functions that read the tables: the login and
; read-only vectors, the DMA address, the allocation vector, free space, the
; DPB, the user, a file's size and random record, and the directory search.
; Included after bdosrec.asm by rom.asm.

; Function 24, the login vector: a bit for each drive logged in since its last
; reset, drive A in bit 0. Returns it in HL, with A = L and B = H. Changes AF,
; B and HL.
FNLOGIN:
	LD	HL,(LOGINV)	; bit n set: drive n is logged in
	JP	RETWORD

; Function 25, the current drive: the default drive, 0 for A. Returns it in A
; and HL, with B = 0. Changes AF, B and HL.
FNCURDSK:
	LD	A,(DEFDRV)	; not CURDRV, the last an FCB selected
	JP	RETA

; Function 26, set DMA: DE (PARAM) is where the next record read or written
; goes, and where a search puts its directory record. It is kept in CURDMA,
; which the directory's reads and writes go back to, and passed to the BIOS.
; Returns A = 0. Changes AF, BC, HL and what the BIOS's SETDMA changes.
FNSETDMA:
	LD	HL,(PARAM)	; the caller's DE
	LD	(CURDMA),HL
	LD	B,H
	LD	C,L
	CALL	BIODMA		; through the RAM copy of the BIOS's table
	JP	RETZERO

; Function 27, the allocation vector's address: the default drive's, a bit for
; each block, block 0 in bit 7 of its first byte. Returns it in HL, with A = L
; and B = H. Changes AF, B and HL.
FNGETALV:
	LD	HL,(DEFALV)	; kept from the default drive's selection
	JP	RETWORD

; Function 46, CP/M 3's free space: drive E's free blocks, from its allocation
; vector, as records, in the three bytes at the DMA address, low first. The
; drive is selected as an FCB's would be, and the default stays. E is 0 for
; A; a drive past P, or one absent, takes SELDRV's fatal path. Returns A = 0.
; Changes every register and IX; CURDRV is left on drive E.
FNFREE:	LD	A,E		; the drive, 0 for A
	CALL	SELDRV		; logged in if need be: DPBPTR, ALVPTR
	LD	IX,(DPBPTR)
	LD	HL,(ALVPTR)	; block 0 in bit 7 of the first byte
	LD	E,(IX+5)
	LD	D,(IX+6)	; DSM, the drive's last block
	INC	DE		; DE = the drive's blocks
	LD	BC,0		; the free ones
	LD	A,$80		; the bit within the current byte
FRBIT:	PUSH	AF
	AND	(HL)		; the block's bit set: in use
	JR	NZ,FRUSED
	INC	BC		; a free block counted
FRUSED:	POP	AF
	RRCA			; the next block's bit; a carry when it
	JR	NC,FRSAME	; wraps from bit 0 to bit 7, the next byte
	INC	HL
FRSAME:	DEC	DE		; one block fewer to look at
	PUSH	AF		; the mask kept while DE is tested
	LD	A,D
	OR	E
	JR	Z,FREND		; every block counted
	POP	AF
	JR	FRBIT
FREND:	POP	AF		; the mask dropped
	LD	H,B		; records = blocks << BSH, 24 bits
	LD	L,C
	XOR	A		; A: the top byte
	LD	B,(IX+2)	; BSH: a block holds 2^BSH records
FRSH:	ADD	HL,HL
	RLA			; H's top bit into A
	DJNZ	FRSH
	EX	DE,HL
	LD	HL,(CURDMA)	; the answer at the DMA address, low first
	LD	(HL),E
	INC	HL
	LD	(HL),D
	INC	HL
	LD	(HL),A		; the top byte
	JP	RETZERO

; Function 28, write protect: the default drive's bit set in ROVEC, the
; read-only vector, until a reset, function 13 or 37, clears it. Returns
; A = 0. Changes AF, B, DE and HL.
FNWRPROT:
	LD	A,(DEFDRV)
	CALL	MASKA		; HL = the drive's bit
	EX	DE,HL
	LD	HL,(ROVEC)	; ORed into the read-only vector:
	LD	A,L
	OR	E		; drives A to H
	LD	L,A
	LD	A,H
	OR	D		; and I to P
	LD	H,A
	LD	(ROVEC),HL
	JP	RETZERO

; Function 29, the read-only vector: a bit for each read-only drive, drive A
; in bit 0. Returns it in HL, with A = L and B = H. Changes AF, B and HL.
FNGETRO:
	LD	HL,(ROVEC)	; set by function 28 or a read-only mount
	JP	RETWORD

; Function 31, the DPB's address: the default drive's disk parameter block.
; Returns it in HL, with A = L and B = H. Changes AF, B and HL.
FNGETDPB:
	LD	HL,(DEFDPB)	; kept from the default drive's selection
	JP	RETWORD

; Function 32, the user number. E = FFh gets the user number; any other E sets
; it to its low five bits, as CP/M 2.2 does, so no E reaches E5h, an erased
; entry's user byte. Returns A = 0 after a set. Changes AF, B and HL.
FNUSER:
	LD	A,(PARAM)	; the caller's E
	CP	$FF
	JR	Z,GETUSER	; FFh: get it
	AND	$1F		; 0 to 31
	LD	(USERNO),A
	JP	RETZERO

; Function 32's get: returns the user number, 0 to 31, in A and HL, with
; B = 0. Changes AF, B and HL.
GETUSER:
	LD	A,(USERNO)	; the user the directory matches
	JP	RETA

; Function 35, file size: the FCB at DE (PARAM) names the file, a '?'
; matching any character. Every extent of it in the directory has an end,
; (S2 * 32 + EX) * 128 + RC records; the largest, the file's size in records,
; goes to the FCB's random-record field, r0 to r2, low first, 0 when there is
; no extent: the highest logical record boundary across every matching
; extent. The dispatch has selected the FCB's drive. Function 35 returns $FF
; like CP/M (SIZEDONE). Changes every register.
FNSIZE:
	LD	HL,(PARAM)
	LD	(SRCHFCB),HL	; the FCB the search matches
	LD	A,2		; mode 2: every extent of the name
	LD	(OPENMOD),A
	XOR	A
	LD	(FSIZE0),A	; the largest end so far: none
	LD	(FSIZE1),A
	LD	(FSIZE2),A
	CALL	NEWSRCH		; from the directory's first entry
SIZELOOP:
	CALL	FINDENT
	CP	$FF
	JR	Z,SIZEDONE	; no extent left
	LD	HL,(MATCHPTR)	; the entry: EX and S2 where an FCB has them
	CALL	RECBASE		; CAND = its last extent's first record
	LD	HL,(MATCHPTR)
	LD	DE,15
	ADD	HL,DE
	LD	E,(HL)		; RC, byte 15: that extent's records
	LD	D,0
	LD	HL,(CAND0)	; CAND += RC, 24 bits: this entry's end
	ADD	HL,DE
	LD	(CAND0),HL
	LD	A,(CAND2)
	ADC	A,0		; the carry into the top byte
	LD	(CAND2),A

	LD	B,A		; CAND against FSIZE, top bytes first
	LD	A,(FSIZE2)
	CP	B
	JR	C,SIZEKEEP	; this end is the larger
	JR	NZ,SIZELOOP	; the smaller: the next extent
	LD	A,(CAND1)	; top bytes equal: the middle ones
	LD	B,A
	LD	A,(FSIZE1)
	CP	B
	JR	C,SIZEKEEP	; larger
	JR	NZ,SIZELOOP	; smaller
	LD	A,(CAND0)	; and then the low ones
	LD	B,A
	LD	A,(FSIZE0)
	CP	B
	JR	NC,SIZELOOP	; not larger: FSIZE stands
SIZEKEEP:
	LD	HL,(CAND0)	; CAND0 and CAND1 as a word, into
	LD	(FSIZE0),HL	; FSIZE0 and FSIZE1, which follow
	LD	A,(CAND2)
	LD	(FSIZE2),A	; and the top byte
	JR	SIZELOOP

; FNSIZE's end: the largest end found, the file's size, to the FCB's
; random-record field. Returns A = FFh, as CP/M's search leaves it at the
; directory's end, in A and HL, with B = 0. Changes every register.
SIZEDONE:
	LD	DE,FSIZE0
	CALL	PUBRR		; r0 to r2 = FSIZE0 to FSIZE2
	LD	A,$FF
	JP	RETA

; Function 36, set random record: convert the sequential EX/S2/CR position
; of the FCB at DE (PARAM) to the public 24-bit random record,
; (S2 * 32 + EX) * 128 + CR, in its random-record field, r0 to r2, for a
; random read or write to go on from. Returns A = 0. Changes every register.
FNSETRR:
	LD	HL,(PARAM)
	CALL	RECBASE		; CAND = the extent's first record
	CALL	FCBCR		; HL = the FCB's CR, the next record
	LD	E,(HL)		; DE = CR, 0 to 128
	LD	D,0
	LD	HL,(CAND0)	; CAND += CR, 24 bits
	ADD	HL,DE
	LD	(CAND0),HL
	LD	A,(CAND2)
	ADC	A,0		; the carry into the top byte
	LD	(CAND2),A
	LD	DE,CAND0
	CALL	PUBRR		; r0 to r2 = CAND0 to CAND2
	JP	RETZERO

; Publish three bytes from DE, low first, to the caller's random-record
; field, r0 to r2, bytes 33 to 35 of the FCB at PARAM. Keeps A; changes BC,
; DE, HL and the flags. The callers finish through RETA or RETZERO.
PUBRR:	LD	HL,(PARAM)
	LD	BC,33		; r0, byte 33
	ADD	HL,BC
	EX	DE,HL		; from DE to the field
	LD	C,3		; B is already zero
	LDIR
	RET

; Convert an FCB-shaped EX/S2 position at HL, an FCB or a directory entry, to
; its 24-bit record base, the extent's first record: (S2 * 32 + EX) * 128,
; from EX's low five bits (byte 12) and S2's low six (byte 14), which leave
; out S2's bit 7, an FCB's unmodified mark. Returns it in CAND0 to CAND2, low
; first, with its top byte in A as well. Changes AF, BC, DE and HL; B is 0
; after.
RECBASE:
	LD	DE,12
	ADD	HL,DE		; EX, byte 12
	LD	A,(HL)
	AND	$1F		; the extent within its S2, 0 to 31
	LD	C,A
	INC	HL
	INC	HL		; S2, byte 14: 32 extents a step
	LD	A,(HL)
	AND	$3F		; without the unmodified mark
	LD	H,0
	LD	L,A
	ADD	HL,HL		; S2 * 32, five doublings
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	LD	E,C		; + EX: the extent's number, below 2048
	LD	D,0
	ADD	HL,DE
	XOR	A		; A: the result's top byte
	LD	B,7		; * 128: seven 24-bit doublings
RECBSHFT:
	ADD	HL,HL
	RLA			; H's top bit into A
	DJNZ	RECBSHFT
	LD	(CAND0),HL	; CAND0 and CAND1
	LD	(CAND2),A
	RET

; Function 37, reset drives: each drive whose bit is set in DE (PARAM), drive
; A in bit 0, comes out of the login vector, the read-only vector and WARMV,
; so that its next selection logs it in afresh, with a full directory scan.
; Returns A = 0. Changes AF, BC, DE and HL.
FNRESETD:
	LD	DE,(PARAM)
	LD	A,E		; BC = the mask complemented, a bit
	CPL			; for each drive kept
	LD	C,A
	LD	A,D
	CPL			; drives I to P
	LD	B,A
	LD	HL,LOGINV
	CALL	ANDV		; logged out
	LD	HL,ROVEC
	CALL	ANDV		; writable again
	LD	HL,WARMV
	CALL	ANDV		; no rebuild to a mark waiting
	JP	RETZERO

; Start a directory search at the first entry of the selected drive:
; SRCHIDX = 0, the drive homed, and CURTRK and CURSEC on the directory's first
; record, sector 0 of track OFF, the first past the reserved tracks. FINDENT
; reads that record when it first runs. Takes DPBPTR. Changes AF, BC, DE, HL
; and what the BIOS's HOME changes.
NEWSRCH:
	LD	HL,0
	LD	(SRCHIDX),HL	; the entry FINDENT looks at next
	CALL	BIOHOM		; the BIOS's HOME: track 0
	LD	HL,(DPBPTR)
	LD	BC,13
	ADD	HL,BC		; OFF, the DPB's byte 13
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	LD	(CURTRK),DE	; the directory's first track
	LD	HL,0
	LD	(CURSEC),HL	; and its first sector
	RET

; Return the next matching directory slot (0..3), or $FF when no entry is
; left: from SRCHIDX on, the next entry that matches the FCB at SRCHFCB as
; OPENMOD asks (MATCHFCB has the modes). The slot is the entry's place in the
; 128-byte record at DIRPTR, kept in RETCODE too, with MATCHPTR on the entry
; and SRCHIDX past it. Make (mode 3) and the raw search (5) look through every
; entry, DIRCNT; the others stop at DIRUSED, the directory's high-water mark.
; Search (modes 0 and 5) copies the containing 128-byte directory record to
; the caller's DMA; open (1) instead copies the entry's bytes 1 to 31, the
; name to the allocation map, into the supplied FCB. Takes NEWSRCH's start or
; the last call's place. Changes every register.
FINDENT:
	LD	HL,(SRCHIDX)
	LD	DE,(DIRUSED)	; the limit: the high-water mark
	LD	A,(OPENMOD)
	CP	3
	JR	Z,FULLDIR	; make: free entries past the mark too
	CP	5
	JR	NZ,FINDLIM
FULLDIR:
	LD	DE,(DIRCNT)	; make and raw search: every entry
FINDLIM:
	OR	A
	SBC	HL,DE		; SRCHIDX against the limit
	JP	NC,NOENTRY	; at the limit: no entry left
	LD	HL,(SRCHIDX)
	LD	A,L
	AND	3
	CALL	Z,READDIR	; a record's first entry: the record read

	LD	HL,(SRCHIDX)
	LD	A,L
	AND	3		; the entry's slot in the record
	LD	(RETCODE),A	; returned if it matches
	ADD	A,A
	ADD	A,A
	ADD	A,A
	ADD	A,A
	ADD	A,A		; 32 bytes a slot
	LD	E,A
	LD	D,0
	LD	HL,(DIRPTR)
	ADD	HL,DE
	LD	(MATCHPTR),HL	; the entry
	CALL	MATCHFCB	; A = 1 if it matches the FCB
	OR	A
	JR	NZ,FOUNDIT	; A = 1: it matches
	LD	HL,(SRCHIDX)
	INC	HL
	LD	(SRCHIDX),HL	; no match: the next entry
	JR	FINDENT

; FINDENT's match: SRCHIDX steps past it, and the mode says what is copied:
; the record to the DMA address in modes 0 and 5, the entry into the FCB in
; mode 1 (OPENHIT), nothing in any other. Returns A = the slot, 0 to 3.
; Changes every register.
FOUNDIT:
	LD	HL,(SRCHIDX)
	INC	HL
	LD	(SRCHIDX),HL	; the next call goes on past this entry
	LD	A,(OPENMOD)
	OR	A
	JR	Z,COPYDIR	; mode 0, search: the record copied
	CP	5
	JR	NZ,OPENHIT	; and mode 5, the raw search, the same
COPYDIR:
	LD	HL,(DIRPTR)
	LD	DE,(CURDMA)
	LD	BC,128		; the whole record, as CP/M 2.2's search
	LDIR			; returns it, the slot its index
	LD	A,(RETCODE)
	RET

; The FCB keeps the logical extent it asked for. The entry's extent byte is
; the highest it holds, and its record count is that extent's: an earlier
; extent in the entry is full (128 records), a later one empty. In mode 1,
; open, the entry's bytes 1 to 31, the name, EX, S1, S2, RC and the
; allocation map, go into the FCB at SRCHFCB, and S2's bit 7 marks it
; unmodified; modes 2 to 4 go to NOCOPY. Takes A = OPENMOD. Returns A = the
; slot, 0 to 3. Changes every register.
OPENHIT:
	CP	1
	JR	NZ,NOCOPY	; delete, size, make and close: no copy
	LD	HL,(SRCHFCB)
	LD	DE,12
	ADD	HL,DE
	LD	A,(HL)		; the FCB's EX: the extent asked for
	AND	$1F
	PUSH	AF		; kept while the entry overwrites it
	LD	HL,(MATCHPTR)
	INC	HL		; from byte 1, the name: the entry's
	LD	DE,(SRCHFCB)	; user byte and the FCB's drive byte
	INC	DE		; are left as they are
	LD	BC,31
	LDIR			; to byte 31, the map's end
	LD	HL,(SRCHFCB)
	LD	DE,12
	ADD	HL,DE
	LD	A,(HL)		; the entry's EX, now in the FCB
	AND	$1F
	LD	C,A		; the entry's extent
	POP	AF		; A = the extent asked for
	LD	(HL),A		; the FCB's EX back to the one asked for
	CP	C
	JR	Z,OPENRC	; the entry's last extent: its RC stands
	LD	B,$80		; earlier than the entry's: full
	JR	C,OPENSET
	LD	B,0		; later: nothing in it yet
OPENSET:
	INC	HL
	INC	HL
	INC	HL
	LD	(HL),B		; RC, byte 15
	DEC	HL
	DEC	HL
	DEC	HL		; back on EX
OPENRC:
	INC	HL
	INC	HL
	LD	A,(HL)		; S2, byte 14
	OR	$80		; bit 7: unmodified, so close writes
	LD	(HL),A		; nothing until a write changes the FCB
	LD	A,(RETCODE)	; the slot
	RET

; FINDENT's match in modes 2 to 4, which copy nothing. Returns A = the slot,
; 0 to 3. Changes A.
NOCOPY:
	LD	A,(RETCODE)	; the entry's slot in its record
	RET

; FINDENT's end: no entry left to match. Returns A = FFh, CP/M's code for no
; file. Changes A.
NOENTRY:
	LD	A,$FF		; no further match
	RET

; Match the directory entry at HL against the FCB at SRCHFCB: A = 1 if it
; matches, 0 if not; the flags do not say. OPENMOD is the kind of match:
;   0 search, 1 open and 4 close: the user, the name and the extent;
;   2 delete, rename, attributes and size: the user and the name;
;   3 make: a free entry, its user byte E5h;
;   5 search with a '?' drive: every entry, used or free.
; The user is the current one and the name 8.3. Question marks in the FCB are
; single-character wildcards. Directory attribute bits are not name bits.
; Open also requires the requested logical extent: an entry holds EXM + 1
; logical extents, so the extent bytes are compared outside the EXM bits.
; A search's '?' in EX matches any extent. Changes AF, BC, DE and HL.
MATCHFCB:
	LD	A,(OPENMOD)
	CP	5
	JR	Z,ISMATCH	; the raw search: every entry
	CP	3
	JR	NZ,MATCHUSR
	LD	A,(HL)		; make: the user byte alone decides
	CP	$E5
	JR	Z,ISMATCH	; E5h: erased or never used, free
	JR	NOMATCH

; MATCHFCB's match in modes 0, 1, 2 and 4: the user, the 8.3 name and, but in
; mode 2, the extent and S2. Takes HL = the entry. Returns A = 1 for a match,
; 0 for none. Changes AF, BC, DE and HL.
MATCHUSR:
	LD	A,(USERNO)
	LD	B,A		; the current user
	LD	A,(HL)
	CP	B		; another user's, or a free entry's E5h
	JR	NZ,NOMATCH
	INC	HL		; the name, bytes 1 to 11
	LD	DE,(SRCHFCB)
	INC	DE
	LD	B,11
NAMELOOP:
	LD	A,(DE)
	AND	$7F		; the FCB's character, attribute bit off
	CP	'?'
	JR	Z,NAMEOK	; a wildcard: any character
	LD	C,A
	LD	A,(HL)
	AND	$7F		; the entry's, attribute bit off
	CP	C
	JR	NZ,NOMATCH
NAMEOK:
	INC	HL
	INC	DE
	DJNZ	NAMELOOP	; the eleven characters
	LD	A,(OPENMOD)
	CP	2		; the name matches; the extent next
	JR	Z,ISMATCH	; mode 2: the name alone, any extent
	LD	A,(DE)		; the FCB's EX, byte 12
	CP	'?'
	JR	Z,ISMATCH	; a search's '?': every extent
	XOR	(HL)		; extents differ only in the bits EXM masks
	AND	$1F
	JR	Z,EXSAME	; the same extent
	PUSH	HL
	LD	C,A		; the bits that differ
	LD	HL,(DPBPTR)	; the DPB: EXM is byte 4
	INC	HL
	INC	HL
	INC	HL
	INC	HL
	LD	A,(HL)		; EXM
	CPL			; the bits EXM leaves out
	AND	C		; one outside EXM: another entry's
	POP	HL		; the entry's EX again
	JR	NZ,NOMATCH
EXSAME:
	INC	HL
	INC	HL
	INC	DE
	INC	DE		; S2, byte 14; S1 is not compared
	LD	A,(DE)
	AND	$3F		; without an FCB's unmodified mark
	LD	C,A
	LD	A,(HL)
	AND	$3F
	CP	C
	JR	NZ,NOMATCH	; another S2: 32 extents away

; MATCHFCB's yes: returns A = 1, the entry matches. Changes A.
ISMATCH:
	LD	A,1
	RET

; MATCHFCB's no: returns A = 0, the entry does not match. Changes AF.
NOMATCH:
	XOR	A
	RET
