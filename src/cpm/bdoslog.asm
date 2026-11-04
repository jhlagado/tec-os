; The BDOS's directory blocks and drives: reading and writing directory
; records, login, the allocation vectors and their bits, and the drive masks.
; Included after bdosfn.asm by rom.asm.

; Read the directory record at CURTRK/CURSEC into the drive's directory
; buffer (DIRPTR), keeping its place in DIRTRK/DIRSEC for WRITEDIR, then
; step CURSEC/CURTRK on to the next record (ADVSEC). The DMA address is
; set back to CURDMA. A read error takes the BDOS's bad-sector path.
; Destroys AF, BC, DE, HL.
READDIR:
	LD	HL,(CURTRK)	; the record's track,
	LD	(DIRTRK),HL	; kept for WRITEDIR
	LD	B,H
	LD	C,L
	CALL	BIOTRK
	LD	HL,(CURSEC)	; its logical sector, kept too,
	LD	(DIRSEC),HL
	LD	B,H
	LD	C,L
	LD	DE,(XLTPTR)	; through the DPH's skew table
	CALL	BIOTRN		; to the physical sector
	LD	B,H
	LD	C,L
	CALL	BIOSEC
	LD	HL,(DIRPTR)	; read into the directory buffer
	LD	B,H
	LD	C,L
	CALL	BIODMA
	CALL	BIORDS
	CALL	DMABACK		; the DMA back; a failed read: error 1
	JR	ADVSEC		; on to the next directory record

; Write the current directory buffer back to the exact record READDIR loaded.
; Takes DIRTRK/DIRSEC, then goes on as WRDIRNOW. A write error takes the
; BDOS's bad-sector path. Destroys AF, BC, DE, HL.
WRITEDIR:
	LD	HL,(DIRTRK)	; the record's track again,
	LD	B,H
	LD	C,L
	CALL	BIOTRK
	LD	HL,(DIRSEC)	; and its sector,
	LD	B,H
	LD	C,L
	LD	DE,(XLTPTR)	; translated through the skew table
	CALL	BIOTRN
	LD	B,H
	LD	C,L
	CALL	BIOSEC
				; On into WRDIRNOW's write.

; The delete loop writes immediately after READDIR, so the BIOS remains on the
; matching directory record and only the DMA needs changing. Writes the
; directory buffer (DIRPTR) as a directory write and sets the DMA address
; back to CURDMA. A write error takes the BDOS's bad-sector path.
; Destroys AF, BC, DE, HL.
WRDIRNOW:
	LD	HL,(DIRPTR)	; write from the directory buffer
	LD	B,H
	LD	C,L
	CALL	BIODMA
	LD	C,1		; type 1: a directory write, at once
	CALL	BIOWRS

; After a BIOS read or write from a BDOS buffer: the BIOS's DMA address set
; back to CURDMA before A, the BIOS's result, is looked at, so that an error
; function 45 returns to the program leaves the program's DMA in the BIOS.
; Takes A = 0 for success; a failure takes the BDOS's bad-sector path.
; Destroys AF, BC, HL.
DMABACK:
	PUSH	AF		; the BIOS's result, 0 for success
	LD	HL,(CURDMA)	; the program's DMA address back
	LD	B,H
	LD	C,L
	CALL	BIODMA
	POP	AF
	OR	A		; NZ: the read or write failed
	RET	Z
	JP	BADSECT

; Step CURSEC on to the next directory record: past the track's last
; sector (the DPB's SPT), CURSEC returns to 0 and CURTRK moves on one.
; Destroys AF, BC, DE, HL.
ADVSEC:
	LD	HL,(CURSEC)	; the next sector,
	INC	HL
	EX	DE,HL		; held in DE
	LD	HL,(DPBPTR)	; against the DPB's first word,
	LD	C,(HL)		; SPT, the sectors on a track
	INC	HL
	LD	B,(HL)
	EX	DE,HL
	OR	A
	SBC	HL,BC		; carry: still on this track
	JR	C,SECSAME
	LD	HL,0		; else sector 0
	LD	(CURSEC),HL
	LD	HL,(CURTRK)	; of the next track
	INC	HL
	LD	(CURTRK),HL
	RET

; ADVSEC's next sector on the same track: HL is that sector less SPT and BC
; is SPT. Sets CURSEC. Destroys HL and flags.
SECSAME:
	ADD	HL,BC		; the sector itself again
	LD	(CURSEC),HL
	RET

; Select the current drive and capture its public tables. Set the directory
; counters on each selection: by a scan on first login/reset, from the DPH's
; mark when already logged in. Clear allocations only on first login/reset:
; a logged-in vector also owns reservations in open, not-yet-closed FCBs.
; Takes CURDRV. Sets DPHPTR, XLTPTR, DIRPTR, DPBPTR, ALVPTR, DIRCNT and
; DIRUSED, marks the drive in LOGINV (and in ROVEC when its volume is
; read-only) and starts a new directory search. A drive with no volume
; takes the select-error path. Destroys AF, BC, DE, HL, IX.
LOGIN:
	CALL	LOGTEST		; Z: not yet logged in
	PUSH	AF		; kept to choose a scan or the fast path
	LD	E,0		; E bit 0 for the BIOS: 0 a first select,
	JR	Z,LOGSEL
	INC	E		; 1 a drive already logged in
LOGSEL:
	LD	A,(CURDRV)
	LD	C,A
	CALL	BIOSEL		; HL = the DPH, 0 for no volume
	LD	A,H
	OR	L
	JR	NZ,LOGOK
	POP	AF		; no volume: the select error
	JP	SELFAIL
LOGOK:
	LD	(DPHPTR),HL

	LD	E,(HL)		; DPH+0: the skew table
	INC	HL
	LD	D,(HL)
	LD	(XLTPTR),DE

	LD	BC,7		; HL is DPH+1 here: on to DPH+8,
	ADD	HL,BC
	LD	E,(HL)		; the directory buffer
	INC	HL
	LD	D,(HL)
	LD	(DIRPTR),DE
	INC	HL
	LD	E,(HL)		; DPH+10: the DPB
	INC	HL
	LD	D,(HL)
	LD	(DPBPTR),DE
	INC	HL		; past DPH+12, the check vector,
	INC	HL
	INC	HL
	LD	E,(HL)		; to DPH+14: the allocation vector
	INC	HL
	LD	D,(HL)
	LD	(ALVPTR),DE

	LD	A,(CURDRV)	; a volume mounted read-only is in ROVEC
	CALL	DRVENT		; from each selection, past a warm boot's clear
	INC	HL		; the drive entry's byte 7, the volume's flags:
	BIT	0,(HL)		; bit 0, read-only
	LD	HL,ROVEC
	CALL	NZ,VSET
	POP	AF		; NZ: logged in already,
	JR	NZ,LOGFAST	; its vector kept
	CALL	INITALV		; first login: a fresh vector,
	LD	HL,LOGINV	; and the drive marked logged in
	CALL	VSET

	LD	HL,0		; no entries counted or used yet
	LD	(DIRCNT),HL
	LD	(DIRUSED),HL

	LD	HL,(DPBPTR)	; the directory's records:
	LD	BC,7		; DRM, the entries less 1, at DPB+7,
	ADD	HL,BC
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	EX	DE,HL		; DRM in HL,
	SRL	H		; over 4 entries a record,
	RR	L
	SRL	H
	RR	L
	INC	HL		; plus 1: every record to scan
	LD	(DIRLEFT),HL
	LD	DE,(WARMV)	; TEC-OS: a rebuild, to the mark only
	CALL	VTEST		; Z: not in WARMV, scan every record
	JR	Z,LOGNEW
	CALL	DUPTR		; else the DPH's directory mark,
	LD	A,(HL)
	INC	HL
	LD	H,(HL)
	LD	L,A
	LD	DE,3		; rounded up to whole records,
	ADD	HL,DE
	SRL	H		; over 4 entries a record,
	RR	L
	SRL	H
	RR	L
	LD	(DIRLEFT),HL	; the records to scan
LOGNEW:
				; Binding a disk replaces the directory
				; iteration state: the same start as a new
				; file search. Default-pointer queries do
				; not enter LOGIN, so they keep their
				; active search position.
	CALL	NEWSRCH		; the directory's first record
DIRSCAN:
	LD	HL,(DIRLEFT)	; records left to scan:
	LD	A,H
	OR	L
	JR	Z,LOGDONE	; none, the scan is complete
	CALL	READDIR		; the next record,
	CALL	PARDIR		; its four entries counted and marked

	LD	HL,(DIRLEFT)	; one record fewer to go
	DEC	HL
	LD	(DIRLEFT),HL
	JR	DIRSCAN

; TEC-OS: a drive that is already logged in keeps its allocation vector, so
; only its directory high-water mark is restored, from the third DPH scratch
; word where DR's BDOS keeps the same value. DIRCNT covers every entry, as it
; does after a full scan. LOGCNT sets DIRCNT and starts a new search for
; LOGDONE too. Destroys AF, BC, DE, HL.
LOGFAST:
	CALL	DUPTR		; the DPH's directory mark
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	LD	(DIRUSED),DE	; is the highest entry in use
LOGCNT:	LD	HL,(DPBPTR)	; DIRCNT counts every entry:
	LD	BC,7		; DRM at DPB+7,
	ADD	HL,BC
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	INC	DE		; plus 1
	LD	(DIRCNT),DE
	JP	NEWSRCH		; searches start from the first record

; TEC-OS: the end of a scan. The mark saved, the vector's sum taken for the
; next warm boot, the dirty flag and WARMV's bit cleared. Then on as LOGCNT.
; Destroys AF, BC, DE, HL.
LOGDONE:
	CALL	DUSAVE		; the mark kept in the DPH
	CALL	ALVSUM		; DE = the vector's sum,
	LD	HL,(DPHPTR)
	INC	HL		; into DPH+2, the first scratch word
	INC	HL
	LD	(HL),E
	INC	HL
	LD	(HL),D
	INC	HL		; DPH+4: the dirty flag, cleared
	LD	(HL),0
	LD	HL,WARMV	; no rebuild left to do
	CALL	VCLR
	JR	LOGCNT		; DIRCNT set and a new search

; Record DIRUSED for the current drive in its DPH, unless the mark there is
; higher already: a BIOS directory write may have raised it.
; Takes DPHPTR. Destroys AF, BC, DE, HL.
DUSAVE:
	CALL	DUPTR		; HL = the DPH's mark
	LD	DE,(DIRUSED)
	LD	C,(HL)		; BC = the mark there
	INC	HL
	LD	B,(HL)
	PUSH	HL		; its high byte's address
	LD	H,B
	LD	L,C
	OR	A
	SBC	HL,DE		; no carry: the mark >= DIRUSED,
	POP	HL
	RET	NC		; so kept
	LD	(HL),D		; else DIRUSED replaces it
	DEC	HL
	LD	(HL),E
	RET

; DE = the sum of the current drive's allocation vector, DSM / 8 + 1 bytes.
; Returns HL past the vector and BC = 0. Destroys AF.
ALVSUM:	CALL	ALVLEN		; BC bytes at HL
	EX	DE,HL		; existing SUMDE takes its source in DE
	LD	HL,0		; the sum from 0
	CALL	SUMDE
	EX	DE,HL		; sum in DE, pointer past the vector in HL
	RET

; HL = the address of the current drive's directory mark, the third DPH
; scratch word (DPH+6). Takes DPHPTR. Destroys BC and flags.
DUPTR:
	LD	HL,(DPHPTR)
	LD	BC,6		; past the skew table and two scratch words
	ADD	HL,BC
	RET

; Return BC = DSM / 8 + 1 allocation bytes, HL = the BIOS-owned vector.
; Uses BC/HL and flags; preserves A/DE/IX/IY.
ALVLEN:
	LD	HL,(DPBPTR)	; the vector's length:
	LD	BC,5		; DSM, the last block, at DPB+5,
	ADD	HL,BC
	LD	C,(HL)
	INC	HL
	LD	B,(HL)
	SRL	B		; over 8 blocks a byte,
	RR	C
	SRL	B
	RR	C
	SRL	B		; the third of three halvings
	RR	C
	INC	BC		; plus 1: the bytes
	LD	HL,(ALVPTR)	; and the vector itself
	RET

; Clear the BIOS-owned allocation vector and copy the reserved-directory
; bits supplied by the selected drive's DPB. Destroys AF, BC, DE, HL.
INITALV:
	CALL	ALVLEN		; BC bytes at HL
CLRAVL:
	LD	(HL),0		; each byte cleared
	INC	HL
	DEC	BC		; DEC BC sets no flag: the OR
	LD	A,B		; tests the count
	OR	C		; until no bytes are left
	JR	NZ,CLRAVL

	LD	HL,(DPBPTR)	; DPB+9: AL0 and AL1, the blocks
	LD	BC,9		; the directory itself takes,
	ADD	HL,BC
	LD	DE,(ALVPTR)	; as the vector's first two bytes
	LD	A,(HL)		; AL0
	LD	(DE),A
	INC	HL
	INC	DE
	LD	A,(HL)		; then AL1
	LD	(DE),A
	RET

; Count and mark the four 32-byte entries of the directory record in the
; directory buffer (DIRPTR), each through PARENT. Uses ENTPTR and
; ENTLEFT. Destroys AF, BC, DE, HL, IX.
PARDIR:
	LD	HL,(DIRPTR)	; from the record's first entry,
	LD	(ENTPTR),HL
	LD	A,4		; four entries to a record
	LD	(ENTLEFT),A
PARELOOP:
	CALL	PARENT		; each entry in turn
	LD	A,(ENTLEFT)
	DEC	A
	LD	(ENTLEFT),A
	JR	NZ,PARELOOP	; until all four are done
	RET

; Count the directory entry at ENTPTR and step ENTPTR to the next. DIRCNT
; counts every entry; a used one (first byte not E5h) sets DIRUSED, the
; directory mark, to that count and has each block in its allocation map
; marked in the vector (MARKBLK). Destroys AF, BC, DE, HL, IX.
PARENT:
	LD	HL,(ENTPTR)	; this entry,
	PUSH	HL
	LD	DE,32		; the next 32 bytes on
	ADD	HL,DE
	LD	(ENTPTR),HL
	POP	HL
	LD	DE,(DIRCNT)	; one more entry seen
	INC	DE
	LD	(DIRCNT),DE
	LD	A,(HL)		; the user byte:
	CP	$E5		; E5h, an empty entry,
	RET	Z		; has no blocks
	LD	(DIRUSED),DE	; used: the mark reaches it at least
	LD	DE,16		; the allocation map at byte 16
	ADD	HL,DE
	LD	IX,(DPBPTR)
	LD	A,(IX+6)	; DSM's high byte: 0 for 8-bit
	OR	A		; block numbers, 16 of them,
	LD	A,16
	JR	Z,PARCNT
	LD	A,8		; else 8 of 16 bits
PARCNT:
	LD	(ALLEFT),A	; the map's cells left
PARCELL:
	LD	E,(HL)		; the block's low byte,
	LD	D,0
	INC	HL
	LD	A,(IX+6)	; DSM's high byte again; IX is still the
				; DPB, which BLKPAST reloads
	OR	A
	JR	Z,PARHAVE	; 8-bit blocks: no high byte
	LD	D,(HL)		; else the high byte too
	INC	HL
PARHAVE:
	PUSH	HL		; the map's place kept
	CALL	MARKBLK		; the block's bit set
	POP	HL
	LD	A,(ALLEFT)
	DEC	A
	LD	(ALLEFT),A
	JR	NZ,PARCELL	; every cell of the map
	RET

; Free the blocks of the directory entry at MATCHPTR: each block in its
; allocation map has its bit cleared in the vector (CLRBLK).
; Destroys AF, BC, DE, HL, IX.
FREEENT:
	LD	HL,(MATCHPTR)	; the entry's allocation map,
	LD	DE,16		; at byte 16
	ADD	HL,DE
	LD	IX,(DPBPTR)
	LD	A,(IX+6)	; DSM's high byte: 0 for 8-bit
	OR	A		; block numbers, 16 of them,
	LD	A,16
	JR	Z,FREECNT
	LD	A,8		; else 8 of 16 bits
FREECNT:
	LD	(ALLEFT),A	; the map's cells left
FREECELL:
	LD	E,(HL)		; the block's low byte,
	LD	D,0
	INC	HL
	LD	A,(IX+6)	; DSM's high byte again; IX is still the
				; DPB, which BLKPAST reloads
	OR	A
	JR	Z,FREEHAVE	; 8-bit blocks: no high byte
	LD	D,(HL)		; else the high byte too
	INC	HL
FREEHAVE:
	PUSH	HL		; the map's place kept
	CALL	CLRBLK		; the block's bit cleared
	POP	HL
	LD	A,(ALLEFT)
	DEC	A
	LD	(ALLEFT),A
	JR	NZ,FREECELL	; every cell of the map
	RET

; Set block DE's bit in the allocation vector, as an entry's block is
; logged; a block with no bit (BITPTR) is passed over.
; Destroys AF, BC, DE, HL; may set IX to the DPB.
MARKBLK:
	CALL	BITPTR		; HL = its byte, A = its bit
	RET	Z		; no bit: nothing to mark
	OR	(HL)		; the bit set among the others
	LD	(HL),A
	RET

; Clear block DE's bit in the allocation vector, as an entry's block is
; freed; a block with no bit (BITPTR) is passed over.
; Destroys AF, BC, DE, HL; may set IX to the DPB.
CLRBLK:
	CALL	BITPTR		; HL = its byte, A = its bit
	RET	Z		; no bit: nothing to free
	CPL			; every bit but this block's
	AND	(HL)		; kept as it was
	LD	(HL),A
	RET

; Z if DE is 0 or past the volume's end: such a block has no bit, so a directory
; with one can still be logged in and its file erased. Reading it is refused.
; Else NZ, HL = the vector byte that holds block DE's bit and A = the bit,
; bit 7 for the byte's first block. Destroys BC, DE; sets IX to the DPB
; (BLKPAST) unless DE is 0.
BITPTR:
	LD	A,D
	OR	E
	RET	Z		; block 0: an unused cell
	CALL	BLKPAST		; carry: past DSM
	SBC	A,A		; FFh if past the end
	INC	A		; then 0, so Z
	RET	Z
	LD	A,E
	AND	7		; the bit's place in its byte
	LD	B,A
	EX	DE,HL		; HL = the block,
	SRL	H		; over 8 blocks a byte,
	RR	L
	SRL	H
	RR	L
	SRL	H		; the third of three halvings
	RR	L
	LD	DE,(ALVPTR)	; into the vector
	ADD	HL,DE
	LD	A,$80		; a byte's first block is bit 7,
	LD	C,A
	LD	A,B
	OR	A		; Z: the first block, no shift
	LD	A,C
	JR	Z,BITDONE
SHIFBIT:
	RRCA			; one bit right for each block on
	DJNZ	SHIFBIT
BITDONE:
	OR	A		; NZ: the block has its bit
	RET

; LOGTEST: NZ if the current drive's bit is set in LOGINV, DE then the login
; vector; Z means the drive needs its allocation vector rebuilt. VTEST: the
; same against the vector in DE, which it keeps. Both destroy AF, B and HL.
LOGTEST:
	LD	DE,(LOGINV)	; the logged-in drives
VTEST:	CALL	DRVMASK		; HL = the current drive's bit,
	LD	A,L
	AND	E
	LD	L,A
	LD	A,H		; and with DE a byte at a time
	AND	D
	OR	L		; NZ: the bit is set in DE
	RET

; The current drive's bit cleared (VCLR) or set (VSET) in the vector at HL;
; ANDV ands the vector at HL with BC. VCLR destroys AF, BC, HL; VSET AF, B,
; DE, HL; ANDV AF, HL.
VCLR:	PUSH	HL		; the vector's address kept
	CALL	DRVMASK
	LD	A,L		; BC = every drive but this one:
	CPL
	LD	C,A
	LD	A,H		; drives I to P in the high byte
	CPL
	LD	B,A
	POP	HL
ANDV:	LD	A,(HL)		; the vector's low byte, A to H,
	AND	C
	LD	(HL),A
	INC	HL
	LD	A,(HL)		; then its high byte, I to P
	AND	B
	LD	(HL),A
	RET
VSET:	PUSH	HL		; the vector's address kept
	CALL	DRVMASK
	EX	DE,HL		; DE = the drive's bit
	POP	HL
	LD	A,(HL)		; added to the low byte
	OR	E
	LD	(HL),A
	INC	HL
	LD	A,(HL)		; and to the high
	OR	D
	LD	(HL),A
	RET

; HL = the drive's bit in a 16-bit drive vector, bit 0 for A: to bit 15 for
; P:, for CURDRV (DRVMASK) or the drive in A (MASKA). Leaves A the drive.
; Destroys B and flags; keeps C and DE.
DRVMASK:
	LD	A,(CURDRV)
MASKA:
	LD	B,A		; B = the drive, the shifts to make
	LD	HL,1		; drive A's bit
	OR	A
	RET	Z		; drive A: no shift
MASKLOOP:
	ADD	HL,HL		; the bit one drive higher
	DJNZ	MASKLOOP
	RET

; RONZ: NZ if the selected drive is read-only. Changes AF, B, DE, HL.
; CHKRO returns if the drive is writable, else takes the read-only error.
RONZ:	LD	DE,(ROVEC)	; the read-only drives
	JR	VTEST		; DRVMASK preserves DE; same mask and Z result
CHKRO:	CALL	RONZ		; writable: on
	RET	Z
	LD	HL,ERRRO	; the read-only message
	LD	B,2		; read-only disk
	JR	BDERR

; The select error: ERRSEL and code 4, through BDERR, which ends the function
; and never comes back here.
SELFAIL:
	LD	HL,ERRSEL
	LD	B,4		; select
	JR	BDERR
