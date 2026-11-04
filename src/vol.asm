; Container validation and volume mounting.
;
; Block 0 of the card holds the container header (container-format.md). The
; header and every descriptor are checked before any drive is mounted, and a
; volume is never written outside the range its descriptor gives. All block
; arithmetic is 32-bit and a carry out of the top byte is an error.
;
; Here: the mount, the table's blocks through the cache, the descriptors, the
; drive table and DPHs, the reselection at cold boot and the volume services.
; The helpers they share (UNMOUNT, GEOFIND, CMP32, the sums, DRVDESC) follow in
; volutil.asm.

MEIO	EQU	$20		; header block unreadable
MEMAGIC	EQU	$21
MEVER	EQU	$22		; unsupported major version
MESIZE	EQU	$23		; header or descriptor size
MECOUNT	EQU	$24		; volume count
MESUM	EQU	$25		; header checksum
MEDESC	EQU	$26		; descriptor id, flags, geometry, length
				; or alignment
MERANGE	EQU	$27		; payload beyond the container or wrapping
MEOVLAP	EQU	$28		; overlapping payloads
MEMOUNT	EQU	$29		; invalid or duplicate drive letter
MENOA	EQU	$2A		; no volume mounted as drive A

; Validate the card's container and mount its volumes on the drives their
; descriptors name, at cold boot. Takes the card started (SDINIT, SDBYTE
; set). Returns Z when drive A and any other assigned drives are mounted;
; else NZ with an ME* code in A and no drive mounted. Uses MNBUF and the
; MNT* workspace, and a cache line for each table block. Destroys AF, BC,
; DE, HL, IX and IY.
MOUNT:	CALL	UNMOUNT		; every drive empty while the card is checked
	LD	A,$FF		; every table block read afresh
	LD	(MNTCB),A
	XOR	A		; block 0, through a cache line
	CALL	MNBLK
	LD	A,MEIO		; the header block won't read
	JP	NZ,MNTERR
	CALL	MNHDR		; MNBUF = the header's first 32 bytes
	LD	HL,MNBUF	; magic
	LD	DE,FMTMAG	; against the ROM's copy, eight bytes
	LD	B,8
MNMAG:	LD	A,(DE)
	CP	(HL)		; the card's byte against the ROM's
	LD	A,MEMAGIC	; a byte differs: no container here
	JP	NZ,MNTERR
	INC	HL		; the next pair
	INC	DE
	DJNZ	MNMAG
				; only the major version this ROM reads
	LD	A,(MNBUF+HMAJOR)
	CP	FMTMAJ
	LD	A,MEVER		; another major version: refused
	JP	NZ,MNTERR
				; header size: exactly the format's
	LD	HL,(MNBUF+HHDRSZ)
	LD	DE,HDRSZ
	OR	A		; carry clear for the compare
	SBC	HL,DE
	LD	A,MESIZE	; another size: refused
	JP	NZ,MNTERR
				; descriptor size: exactly the format's too
	LD	HL,(MNBUF+HDSCSZ)
	LD	DE,DSCSZ
	OR	A
	SBC	HL,DE
	JP	NZ,MNTERR	; A still MESIZE
				; volume count: 1 to MAXVOL, or to MAXVOL0
				; on a 1.0 card (minor 0)
	LD	HL,(MNBUF+HCOUNT)
	LD	A,H		; the word's high byte must be 0
	OR	A
	LD	A,MECOUNT
	JP	NZ,MNTERR
	LD	A,L		; and its low byte nonzero
	OR	A
	LD	A,MECOUNT
	JP	Z,MNTERR
	LD	A,(MNBUF+HMINOR)
	OR	A		; minor 0: a 1.0 card, at most MAXVOL0
	LD	A,L		; and no more than the table holds
	JR	NZ,MNCNT1
	CP	MAXVOL0+1	; 1.0: eight at most
	JR	MNCNT2
MNCNT1:	CP	MAXVOL+1	; 1.1 and on: 127 at most
MNCNT2:	LD	A,MECOUNT
	JP	NC,MNTERR
	LD	A,L		; the count, for every walk of the table
	LD	(MNTCNT),A
	CALL	HDRSUM		; HL = sum of all bytes except the checksum
	OR	A
	SBC	HL,DE		; DE = the checksum
	LD	A,MESUM		; they differ: a damaged header
	JP	NZ,MNTERR
	CALL	MNHDR		; the header's fields again
				; the container's length, 32 bits, kept
	LD	HL,MNBUF+HBLOCKS
	LD	DE,MNTBLK	; in MNTBLK for the range checks
	LD	BC,4
	LDIR
	XOR	A		; no drives field until read: 0 for 1.0
	LD	(MNTDRV),A
				; a 1.0 card (minor 0) has no drives field
	LD	A,(MNBUF+HMINOR)
	OR	A		; or table sum; its blocks 1-7 are free, as
	JR	Z,MNV2		; no volume starts below block 8
				; format 1.1: the drives it wants, 0 to 4
	LD	A,(MNBUF+HDRIVES)
	LD	(MNTDRV),A
	CP	MAXDRV+1
	LD	A,MESIZE	; more than there are: refused
	JP	NC,MNTERR
				; the table's sum, for after the walk
	LD	HL,(MNBUF+HTSUM)
	LD	(MNTSUM),HL
				; Format 1.1: the table's blocks after
				; block 0, count / 16 of them, sum to the
				; header's tableSum.
	LD	A,(MNTCNT)
	RRCA			; count / 16: 15 in block 0, then 16 a
	RRCA			; block, so this is the blocks after it
	RRCA
	RRCA
	AND	$0F
	JR	Z,MNV2		; the whole table in block 0: no sum
	LD	B,A		; B counts the blocks
	LD	HL,0
	LD	(MNTPRV),HL	; the sum so far
	LD	C,1		; C = the block, from 1
MNSUMB:	PUSH	BC		; the count and block, across the read
	LD	A,C		; block C into its line
	CALL	MNBLK
	POP	BC
	LD	A,MEIO		; a table block won't read
	JP	NZ,MNTERR
	PUSH	BC		; and across the sum
	CALL	MNSUM		; the block added to MNTPRV, the sum so far
	POP	BC
	INC	C		; the next block
	DJNZ	MNSUMB
	LD	DE,(MNTSUM)	; the walk's sum against the header's
	OR	A
	SBC	HL,DE
	LD	A,MESUM		; they differ: a damaged table
	JP	NZ,MNTERR

				; One pass in table order: each
				; descriptor valid, starting at or after
				; the previous one's end, and mounted as it
				; is checked.
MNV2:	LD	HL,0		; the previous end: none yet, block 0
	LD	(MNTPRV),HL
	LD	(MNTPRV+2),HL
	XOR	A		; MNTI walks the table from index 0
	LD	(MNTI),A
MNDESC:	LD	A,(MNTI)
	CALL	DESCIX		; IX -> the descriptor, in MNBUF
	LD	A,MEIO		; its block won't read
	JP	NZ,MNTERR
	LD	A,(IX+DVOLID)	; volume id must be nonzero
	OR	(IX+DVOLID+1)
	OR	(IX+DVOLID+2)
	OR	(IX+DVOLID+3)
	JP	Z,MNDBAD	; all four zero: an empty slot
	LD	A,(IX+DFLAGS)	; no flag but read-only may be set
	AND	$FF-DFREAD
	JP	NZ,MNDBAD
	LD	A,(IX+DGEOM)	; a geometry this ROM knows
	CALL	GEOFIND		; HL -> geometry entry, Z if known
	JP	NZ,MNDBAD
	INC	HL		; length must equal the geometry's payload
	INC	HL
	LD	A,(HL)		; the low byte
	CP	(IX+DLEN)
	JP	NZ,MNDBAD
	INC	HL		; the next byte up
	LD	A,(HL)
	CP	(IX+DLEN+1)
	JP	NZ,MNDBAD
	LD	A,(IX+DLEN+2)	; and the top two zero, as every payload
	OR	(IX+DLEN+3)	; is under 65,536 blocks
	JP	NZ,MNDBAD
	LD	A,(IX+DSTART)	; start: nonzero and aligned
	AND	ALIGNB-1
	JP	NZ,MNDBAD
	LD	A,(IX+DSTART)	; nonzero: all four bytes ORed
	OR	(IX+DSTART+1)
	OR	(IX+DSTART+2)
	OR	(IX+DSTART+3)
	JP	Z,MNDBAD
	PUSH	IX		; start >= the previous end
	POP	HL
	LD	DE,DSTART	; HL -> the start field
	ADD	HL,DE
	LD	DE,MNTPRV	; against MNTPRV, the previous end
	CALL	CMP32		; carry: start below the previous end
	LD	A,MEOVLAP
	JP	C,MNTERR
	LD	IY,MNTPRV	; the new end replaces the previous one
	LD	L,(IX+DSTART)	; end = start + length, no wrap
	LD	H,(IX+DSTART+1)
	LD	E,(IX+DLEN)
	LD	D,(IX+DLEN+1)
	ADD	HL,DE		; the low word
	LD	(IY+0),L	; into MNTPRV's low word
	LD	(IY+1),H
	LD	L,(IX+DSTART+2)	; the high word, with the low's carry
	LD	H,(IX+DSTART+3)
	LD	E,(IX+DLEN+2)
	LD	D,(IX+DLEN+3)
	ADC	HL,DE		; carry out: past 32 bits
	LD	(IY+2),L	; and its high word
	LD	(IY+3),H
	LD	A,MERANGE	; a carry out of the top: it wraps
	JR	C,MNTERR
	LD	DE,MNTPRV	; end <= container blocks
	LD	HL,MNTBLK
	CALL	CMP32		; carry: the container ends first
	LD	A,MERANGE
	JR	C,MNTERR
	LD	A,(SDBYTE)	; a standard card addresses bytes: its
	OR	A		; last block is 7FFFFFh (KE-158)
	JR	Z,MNSTOK	; block addressing: no such bound
	LD	A,(IY+3)	; the end, exclusive, at most 800000h
	OR	A
	JR	NZ,MNSTX	; 1000000h or more: too far
	LD	A,(IY+2)	; the third byte decides the rest
	CP	$80
	JR	C,MNSTOK	; below 800000h
	JR	NZ,MNSTX	; above it
	LD	A,(IY+1)	; 80xxxxh: only 800000h itself
	OR	(IY+0)
	JR	Z,MNSTOK
MNSTX:	LD	A,MERANGE	; a block the card can't name
	JP	MNTERR
MNSTOK:
	LD	A,(IX+DMOUNT)	; drive letter: none, or A-D, once
	CP	DUNMNT
	JR	Z,MNNEXT	; unmounted: checked, but on no drive
	CP	MAXDRV
	LD	A,MEMOUNT	; past D
	JR	NC,MNTERR
	LD	A,(MNTDRV)	; N drives have slots: past them, none. N = 0
	DEC	A		; wraps, and every default drive is slotted
	CP	(IX+DMOUNT)	; carry: the drive is past the Nth
	LD	A,MEMOUNT
	JP	C,MNTERR
	LD	E,(IX+DMOUNT)	; HL -> the drive's DRVIDX byte
	LD	D,0
	LD	HL,DRVIDX
	ADD	HL,DE
	LD	A,(HL)		; nonzero: an earlier volume has it
	OR	A
	LD	A,MEMOUNT
	JR	NZ,MNTERR
	LD	A,(MNTI)	; DRVIDX holds the index + 1
	INC	A
	LD	(HL),A		; the drive is this volume's now
	CALL	MNONE		; the drive's entry and DPH
MNNEXT:	LD	HL,MNTI		; the next descriptor
	INC	(HL)
	LD	A,(MNTCNT)	; until the count is reached
	CP	(HL)
	JP	NZ,MNDESC
	LD	A,(DRVTAB+6)	; drive A must have a volume
	OR	A		; (its geometry byte, 0 when empty)
	LD	A,MENOA		; drive A empty: refused
	JR	Z,MNTERR
	XOR	A		; Z: mounted
	RET
MNDBAD:	LD	A,MEDESC	; a descriptor check failed
MNTERR:	PUSH	AF		; the code, across the unmount
	CALL	UNMOUNT		; nothing half-mounted is left
	POP	AF
	OR	A		; NZ, as every code is nonzero
	RET

; Card block A (0-7, the container's table) in a cache line, MNTLN: read from
; the card the first time it is asked for since MNTCB named another block, so
; a mount reads the table as the card holds it. The line is an ordinary clean
; one, left for the cache to take back in turn. Walks the cache as it is:
; DESCIX turns interrupts off around it for a service. Returns Z with
; MNTLN and MNTCB set, or NZ if the read fails, with MNTCB FFh.
; Destroys AF, BC, DE and HL.
MNBLK:	LD	(MNBUF+2),A	; the block, in MNBUF while it is free, so
	CALL	MNLBA		; that the stack stays shallow; SDLBA it
	CALL	CLOOK		; Z: a line holds it, A = the line
	JR	NZ,MNB1
	LD	C,A		; the line, across the test
	LD	A,(MNTCB)	; the block last read for this mount
	LD	HL,MNBUF+2
	CP	(HL)		; read already since MNTCB was last set
	LD	A,C
	JR	NZ,MNB2		; held from before: read again
MNB3:	LD	(MNTLN),A	; the line, and the block it now holds
	LD	A,(MNBUF+2)	; so that it is not read again
	LD	(MNTCB),A
	XOR	A		; Z
	RET
MNB1:	CALL	CTAKE		; a line for it, the next in turn
	JR	NZ,MNBF		; a dirty line's write failed
	LD	C,A		; the line, kept
	CALL	MNLBA		; SDLBA the table block again: a dirty
	LD	A,C		; line's write remaps the BIOS's record
MNB2:	CALL	CFILL		; keeps A, the line; Z if the card gave it
	JR	Z,MNB3
MNBF:	LD	A,$FF		; a failed read holds no table block;
	LD	(MNTCB),A	; NZ still
	RET

; SDLBA = the table block kept in MNBUF+2, 32 bits, its top three bytes 0.
; Destroys A and HL.
MNLBA:	LD	A,(MNBUF+2)	; the block, 0-7
	LD	L,A
	LD	H,0		; the low word
	LD	(SDLBA),HL
	LD	L,H		; and the top word 0
	LD	(SDLBA+2),HL
	RET

; MNBUF = the 32 bytes at offset HL of the table block in MNTLN, copied out
; of EXPAND 1 (MNCPH); MNHDR the header's first 32, where its fields are;
; MNCP the 32 at the offset in MNTPRV+2, MNSUM's. Returns A = 0. Destroys
; AF, BC, DE and HL.
MNHDR:	LD	HL,0		; the header: offset 0
	JR	MNCPH
MNCP:	LD	HL,(MNTPRV+2)	; MNSUM's offset; MNHDR's and DESCIX's
MNCPH:	EX	DE,HL		; are given in HL: DE = the offset
	LD	A,(MNTLN)
	CALL	CLADR		; HL = the line
	ADD	HL,DE		; plus the offset
	EX	DE,HL		; from the line, in EXPAND 1
	LD	HL,MNBUF	; to MNBUF
	LD	BC,$0100	; XMDST bank 0, XMSRC bank 1
	LD	(XMDST),BC
	LD	BC,32		; one descriptor's worth
	JP	MVCOPY		; which returns for the caller

; MNTPRV's word = itself + the 512 bytes of the table block in MNTLN, 32 at a
; time through MNBUF, since nothing runs with EXPAND 1 in view while it uses
; the stack; the offset is kept in MNTPRV+2, so the stack stays shallow.
; Returns HL = the sum. Destroys AF, BC and DE.
MNSUM:	LD	HL,0
	LD	(MNTPRV+2),HL	; the offset
MNS1:	CALL	MNCP		; 32 bytes of it
	LD	HL,(MNTPRV)	; the sum so far
	LD	DE,MNBUF
	LD	BC,32
	CALL	SUMDE		; added to the sum
	LD	(MNTPRV),HL	; kept off the stack
	LD	HL,(MNTPRV+2)
	LD	DE,32		; the next 32
	ADD	HL,DE
	LD	(MNTPRV+2),HL
	BIT	1,H		; 512 done
	JR	Z,MNS1
	LD	HL,(MNTPRV)	; the sum, for the caller
	RET

; IX = descriptor A of the table, copied into MNBUF from its block, which is
; read first if it is not already in its line (MNBLK). Block 0 holds 15 after
; the header, each later block 16. Returns Z with IX = MNBUF, or NZ if the
; read fails. Destroys AF, BC, DE and HL.
DESCIX:	LD	C,0		; block 0, unless past its fifteen
	SUB	DSCBLK0
	JR	C,DX0		; one of block 0's
	LD	B,A		; the index past block 0's
	RRCA			; over 16: the later block
	RRCA
	RRCA
	RRCA
	AND	$0F
	INC	A		; counted from block 1
	LD	C,A		; C = the block
	LD	A,B		; and the remainder, its slot there
	AND	$0F
	JR	DX1		; A = the slot
DX0:	ADD	A,DSCBLK0+1	; block 0: after the header's slot
DX1:	LD	L,A		; HL = the slot * 32, the descriptor size
	LD	H,0
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL		; five doublings
	ADD	HL,HL
	ADD	HL,HL
	LD	(MNBUF),HL	; its offset in the block, in MNBUF
	CALL	CDI		; while it is free (MNBLK keeps the
	LD	A,C		; block at MNBUF+2); the cache walked
	CALL	MNBLK		; with interrupts off, as a service's
	CALL	CEI		; caller may have them on
	RET	NZ		; the block won't read
	LD	HL,(MNBUF)	; the descriptor's 32 bytes into MNBUF
	CALL	MNCPH
	LD	IX,MNBUF	; IX for the fields
	XOR	A		; Z
	RET

; Install the descriptor at IX as drive (IX+DMOUNT): its drive-table entry
; and DPH. Keeps BC and IX. Destroys AF, DE and HL.
MNONE:	PUSH	BC
	LD	A,(IX+DMOUNT)	; the drive the descriptor names
	PUSH	AF		; the drive, across the entry
	CALL	DRVENT		; HL -> geometry byte, entry starts 6 earlier
	LD	DE,-6
	ADD	HL,DE		; HL -> the entry
	CALL	MNFILL		; the entry's eight bytes
	POP	AF		; the drive again, for its DPH
	LD	C,(IX+DGEOM)	; and its geometry
	CALL	MNDPH
	POP	BC		; the caller's B
	RET

; The eight bytes of a drive-table entry for the descriptor at IX, at HL:
; start, length, geometry and the flags, with written-behind beside read-only.
; The start's four bytes and the length's low two follow each other in the
; descriptor (DSTART, DLEN), so they go in one LDIR. Keeps IX. Destroys A, BC
; and DE, and leaves HL at the eighth byte.
MNFILL:	EX	DE,HL		; DE = the entry
	PUSH	IX		; HL = IX
	POP	HL
	LD	BC,DSTART	; HL = the descriptor's start field
	ADD	HL,BC
	LD	BC,6		; start, then the length's low half
	LDIR
	EX	DE,HL		; HL = the entry's seventh byte
	LD	A,(IX+DGEOM)	; geometry
	LD	(HL),A
	INC	HL		; the eighth byte: the drive's flags
	LD	A,(IX+DCACHE)	; written behind (DCWB, bit 0): the drive's
	AND	DCWB		; flag bit 1
	ADD	A,A		; bit 0 to bit 1
	OR	(IX+DFLAGS)	; beside read-only
	LD	(HL),A
	RET

; Build drive A's DPH for geometry C: no XLT, zeroed scratch words, the
; shared DIRBUF, the geometry's DPB and CSVDUM. Leaves its ALV word, which
; ALVINIT sets. Keeps C and IX. Destroys AF, B, DE and HL.
MNDPH:	CALL	DPHADR		; HL = this drive's DPH
	LD	B,8		; XLT and BDOS scratch words are zero
MNZ:	LD	(HL),0
	INC	HL
	DJNZ	MNZ		; four words
	LD	DE,DIRBUF	; shared by every drive
	LD	(HL),E		; the DPH's words are little-endian
	INC	HL
	LD	(HL),D
	INC	HL		; the DPB word next
	PUSH	HL		; the DPB word's place, across the lookup
	LD	A,C
	CALL	GEOFIND
	LD	DE,4		; the entry's DPB word
	ADD	HL,DE
	LD	E,(HL)		; read through HL
	INC	HL
	LD	D,(HL)		; DE = DPB
	POP	HL		; into the DPH
	LD	(HL),E		; after DIRBUF's word
	INC	HL
	LD	(HL),D
	INC	HL
	LD	DE,CSVDUM	; no directory check vector
	LD	(HL),E		; the last word before the ALV
	INC	HL
	LD	(HL),D
	RET

; Reselect a retained selection (RSLCAP) on the card MOUNT has just accepted,
; after ALVINIT has given the card's defaults their slots, so that neither
; slots nor TPA vary with the selection. Step 1 reads and changes nothing:
; one walk of the descriptors, each compared with every retained drive on
; the eight bytes MNFILL builds. A descriptor goes to the first drive it
; matches and no other is tried, so a second drive holding the same entry is
; left with no match. A drive of geometry 0 is not retained, whatever its
; other seven bytes: no descriptor MOUNT accepts has geometry 0, so none
; matches it. Step 1 gives up, leaving the defaults whole, on a failed read,
; a volume whose slot wouldn't hold its vector by VMNT's rule, or a retained
; drive (geometry not 0) left with no match. Step 2 reads nothing and can't
; fail: RSLBUF replaces DRVTAB and DRVIDX, and each drive's DPH is built.
; Drives not retained stay empty, even if the card names them. Takes the
; selection in RSLBUF, with RSLIDX and RSLTMP after it as scratch.
; Destroys AF, BC, DE, HL and IX.
RESEL:	LD	A,(RSLBUF+6)	; no retained A: means no selection
	OR	A
	RET	Z
	LD	HL,0		; no drive matched yet
	LD	(RSLIDX),HL	; all four indices
	LD	(RSLIDX+2),HL
	XOR	A		; MNTI walks the table
	LD	(MNTI),A
RSWALK:	LD	A,(MNTI)
	CALL	DESCIX		; IX -> the descriptor
	RET	NZ		; a failed read: the defaults stand
	LD	HL,RSLTMP	; as a drive-table entry
	CALL	MNFILL
	LD	C,0		; each retained drive, with DE at its entry
	LD	DE,RSLBUF
RSDRV:	CALL	RSEQ		; Z: this drive held this descriptor
	JR	NZ,RSNEXT
	CALL	VSLOT		; a match: it must fit the drive's slot
	RET	C		; too small: the defaults stand
	LD	HL,RSLIDX	; this drive's index + 1
	LD	B,0		; BC = the drive
	ADD	HL,BC
	LD	A,(MNTI)	; as DRVIDX counts them
	INC	A
	LD	(HL),A		; kept for step 2
	JR	RSDESC		; no other drive is tried: a duplicate is
				; left with no match, which gives up below
RSNEXT:	LD	HL,DRVESZ	; the next retained drive
	ADD	HL,DE
	EX	DE,HL		; DE goes on, C counts
	INC	C
	LD	A,C
	CP	MAXDRV		; all four, retained or not
	JR	C,RSDRV
RSDESC:	LD	HL,MNTI		; the next descriptor
	INC	(HL)
	LD	A,(MNTCNT)	; MOUNT's count of them
	CP	(HL)
	JR	NZ,RSWALK	; until the table is walked
	LD	C,0		; every retained drive must have matched
	LD	HL,RSLBUF+6	; HL at each geometry
	LD	DE,RSLIDX	; DE at each index
RSCHK:	LD	A,(DE)		; the index + 1, 0 if unmatched
	OR	A
	JR	NZ,RSCHK1	; matched
	OR	(HL)		; no match, and A is its geometry
	RET	NZ		; retained: give up
RSCHK1:	INC	DE		; the next drive's index and geometry
	LD	A,L		; within RSLBUF's page
	ADD	A,DRVESZ
	LD	L,A
	INC	C		; C counts the drives
	LD	A,C
	CP	MAXDRV		; all four
	JR	C,RSCHK
				; step 2: the entries, then the indices,
	LD	HL,RSLBUF	; over DRVTAB and the DRVIDX after it
	LD	DE,DRVTAB
	LD	BC,MAXDRV*DRVESZ+MAXDRV
	LDIR			; the selection is now the mount
	LD	C,0		; each drive's DPH for what it now holds
RSDPH:	LD	A,C		; the drive
	CALL	DRVENT		; HL -> its geometry byte
	LD	A,(HL)		; 0: the drive holds nothing
	OR	A
	JR	Z,RSDPH1	; empty: BSELDSK refuses it anyway
	PUSH	BC		; the loop's count
	LD	E,C		; the drive, while C takes the geometry
	LD	C,A
	LD	A,E		; and A the drive
	CALL	MNDPH
	POP	BC		; the count again
RSDPH1:	INC	C
	LD	A,C		; all four
	CP	MAXDRV
	JR	C,RSDPH
	RET

; Z if the eight bytes at DE equal RSLTMP's. Keeps C and DE. Destroys AF, B
; and HL.
RSEQ:	PUSH	DE		; the caller's place in RSLBUF
	LD	HL,RSLTMP	; the descriptor, as MNFILL built it
	LD	B,DRVESZ
RSEQ1:	LD	A,(DE)		; a retained byte
	CP	(HL)		; against the descriptor's
	JR	NZ,RSEQ2	; NZ goes back to the caller
	INC	DE		; the next of the eight
	INC	HL
	DJNZ	RSEQ1
RSEQ2:	POP	DE
	RET

; The volume services, TNMOUNT, TNUNMNT and TNDESC (abi.inc). B = the drive
; for a mount or unmount, E = the container index for a mount or a describe,
; HL -> 32 bytes for a describe, its mount byte the drive it is on now (FFh
; none). Returns A = 0 with carry clear, or A = TNEBAD with carry and nothing
; changed: an index past the table, a drive past D, a volume already on
; another drive, a slot too small, or drive A to be left empty. A mount or
; unmount resets the drive in the BDOS, as function 37 does, so its next
; access logs it in from its directory. Destroys AF, BC, DE, HL and IX.
VSMNT:	CALL	VSIN		; C = the drive
	JR	VMNT
VSUNM:	CALL	VSIN
	JR	VUNM
VSDSC:	CALL	VSIN
	LD	A,E		; describe
	EX	DE,HL		; DE -> the caller's 32 bytes, which VDESC
	CALL	VDESC		; keeps, so that the stack stays shallow
	JR	NZ,VBAD
	PUSH	IX		; the descriptor as the card holds it
	POP	HL
	LD	BC,DSCSZ	; all 32 bytes to the caller
	LDIR
	EX	DE,HL		; the mount byte: where it is now
	LD	DE,DMOUNT-DSCSZ	; back from the copy's end
	ADD	HL,DE
	LD	(HL),A		; VDESC's drive or FFh, kept by the copy
	XOR	A		; A = 0, carry clear
	RET

; TNMOUNT's body: put volume E on drive C, replacing any volume there, after
; the cache's dirty lines are written. A mount onto the default drive selects
; it again (function 14), so functions 27 and 31 answer for the new volume
; at once. Returns as VSMNT does.
VMNT:	LD	A,C		; drive past D: refused
	CP	MAXDRV
	JR	NC,VBAD
	LD	A,E		; the container index
	CALL	VDESC		; IX -> its descriptor, A = its drive or FFh
	JR	NZ,VBAD
	INC	A		; FFh becomes 0
	JR	NZ,VBAD		; on a drive already
	CALL	VSLOT		; carry: the drive's slot is too small
	JR	C,VBAD
	CALL	VFLUSH		; old data safe first
	JR	NZ,VBAD
	LD	(IX+DMOUNT),C	; publish only after the old data is safe
	PUSH	BC		; the drive and index, across the install
	PUSH	DE
	LD	A,C		; the old volume forgotten
	CALL	VCLEAR
	CALL	MNONE		; the new one's entry and DPH
	POP	DE
	POP	BC		; C the drive, E the index again
	LD	HL,DRVIDX	; DRVIDX = the index + 1
	LD	B,0
	ADD	HL,BC
	INC	E
	LD	(HL),E		; the drive is the volume's now
	JR	VMNTRS		; reset, and the default selected again

; Carry if the slot of drive C won't hold the vector of the volume at IX: a
; payload of 4096 blocks or more needs a G8M slot (2), and any other a slot.
; Keeps C, DE and IX. Destroys AF, B and HL.
VSLOT:	LD	A,(IX+DLEN+1)	; the payload's high byte
	CP	$10
	LD	A,2		; 2 needed, or 1 with the carry of a small one
	SBC	A,0
	LD	HL,DRVSLOT	; this drive's slot
	LD	B,0
	ADD	HL,BC
	DEC	A		; carry: the slot is above what's needed less 1
	CP	(HL)		; the drive's slot, 0 to 2
	CCF			; so carry now: the slot is too small
	RET

; TNUNMNT's body: empty drive C, after the cache's dirty lines are written.
; Drive A is never emptied. VRESET, which TNMOUNT shares, resets drive C in
; the BDOS (function 37) and returns A = 0 with carry clear; VOK returns
; that alone and VBAD returns TNEBAD with carry.
VUNM:	LD	A,C		; the drive
	OR	A
	JR	Z,VBAD		; A is never left empty
	CP	MAXDRV		; nor a drive past D touched
	JR	NC,VBAD
	CALL	VFLUSH		; its data on the card first
	JR	NZ,VBAD
	LD	A,C		; then its entry gone
	CALL	VCLEAR
VRESET:	XOR	A		; the BIOS's buffered record forgotten
	LD	(BUFOK),A
	LD	HL,1		; BDOS function 37 for drive C
	INC	C		; HL = 1 shifted left C times: its bit
VRS1:	DEC	C
	JR	Z,VRS2		; shifted far enough
	ADD	HL,HL
	JR	VRS1
VRS2:	EX	DE,HL		; DE = the drive vector
	LD	C,37		; reset drive: logged out, read again
	CALL	BDOS		; at its next access
VOK:	XOR	A		; A = 0, carry clear
	RET
VBAD:	LD	A,TNEBAD	; refused, nothing changed
	SCF
	RET

; VMNT's end: drive C reset in the BDOS (VRESET), and selected again by
; function 14 when it is the default, so that its DPB and vector are the new
; volume's for functions 27 and 31. Returns A = 0 with carry clear.
VMNTRS:	PUSH	BC		; the drive, kept over the reset
	CALL	VRESET		; the BDOS logs it in afresh
	LD	C,25		; the default drive
	CALL	BDOS
	POP	DE		; E = the drive mounted
	CP	E
	JR	NZ,VOK		; another drive: done
	LD	C,14		; the default: selected again, its DPB
	CALL	BDOS		; and vector the new volume's
	JR	VOK

; C = the drive from B, and every table block to be read afresh. Keeps B, DE
; and HL. Destroys AF.
VSIN:	LD	C,B		; the drive argument, in C as VMNT wants
	LD	A,$FF
	LD	(MNTCB),A	; no table block read yet
	RET

; Before a drive's volume changes: write dirty cache lines, Z on success.
; Keep the requested drive (BC), descriptor index (DE) and pointer (IX).
; CDI/CEI use HL/AF; CFLALL and its SDWRITE/MAPREC path destroy BC/DE/HL.
; Destroys AF and HL.
VFLUSH:	PUSH	BC		; the caller's drive, index and
	PUSH	DE
	PUSH	IX		; descriptor, which CFLALL destroys
	CALL	CDI		; interrupts off while the cache is walked
	CALL	CFLALL		; every dirty line to the card
	CALL	CEI		; as they were, the flags kept
	POP	IX		; all three back for the caller
	POP	DE
	POP	BC
	RET

; Forget the volume on drive A, which C must also hold: its drive-table
; entry and DRVIDX. Keeps C. Destroys AF, B, DE and HL.
VCLEAR:	PUSH	BC
	CALL	DRVENT		; HL -> the geometry byte, offset 6
	LD	DE,-6		; back to the entry's start
	ADD	HL,DE
	LD	B,DRVESZ	; all eight bytes zero
VCL1:	LD	(HL),0
	INC	HL
	DJNZ	VCL1
	POP	BC		; C, the drive, again
	LD	HL,DRVIDX	; and the drive's index, by C
	LD	B,0
	ADD	HL,BC
	LD	(HL),0		; 0: no volume
	RET

; IX -> the descriptor at index A, A = the drive it is on (FFh none). NZ if A
; is past the table or its block does not read. Keeps BC and DE; uses MNTI.
; Destroys HL.
VDESC:	LD	HL,MNTCNT	; index past the table: refused
	CP	(HL)
	JR	NC,VDNO
	PUSH	BC		; the caller's BC and DE
	PUSH	DE
	LD	(MNTI),A	; the index, off the stack, which a line
	CALL	DESCIX		; taken and written runs deep
	LD	A,(MNTI)	; the index back, the flags kept
	LD	D,A		; D = the index
	JR	NZ,VDX		; DESCIX's NZ: the read failed
	INC	D		; as DRVIDX holds it, index + 1
	LD	HL,DRVIDX	; each drive's index + 1
	LD	B,MAXDRV
	LD	E,0		; E = the drive tried
VDS1:	LD	A,(HL)
	CP	D		; this volume's?
	LD	A,E		; Z: on drive E
	JR	Z,VDX
	INC	HL
	INC	E		; the next drive
	DJNZ	VDS1
	LD	A,$FF		; on no drive
	CP	A		; Z
VDX:	POP	DE
	POP	BC		; the flags as they were set
	RET
VDNO:	OR	$FF		; NZ
	RET
