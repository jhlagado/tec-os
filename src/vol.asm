; Container validation and volume mounting.
;
; Block 0 of the card holds the container header (container-format.md). The
; header and every descriptor are checked before any drive is mounted, and a
; volume is never written outside the range its descriptor gives. All block
; arithmetic is 32-bit and a carry out of the top byte is an error.

MEIO    EQU     $20             ; header block unreadable
MEMAGIC EQU     $21
MEVER   EQU     $22             ; unsupported major version
MESIZE  EQU     $23             ; header or descriptor size
MECOUNT EQU     $24             ; volume count
MESUM   EQU     $25             ; header checksum
MEDESC  EQU     $26             ; descriptor id, flags, geometry, length or alignment
MERANGE EQU     $27             ; payload beyond the container or wrapping
MEOVLAP EQU     $28             ; overlapping payloads
MEMOUNT EQU     $29             ; invalid or duplicate drive letter
MENOA   EQU     $2A             ; no volume mounted as drive A

; Returns Z when drive A and any other assigned drives are mounted; else NZ
; with an ME* code in A and no drive mounted.
MOUNT:  CALL    UNMOUNT
	LD	A,$FF		; every table block read afresh
	LD	(MNTCB),A
	XOR	A		; block 0, through a cache line
	CALL	MNBLK
        LD      A,MEIO
        JP      NZ,MNTERR
	CALL	MNHDR		; MNBUF = the header's first 32 bytes
        LD      HL,MNBUF        ; magic
        LD      DE,FMTMAG
        LD      B,8
MNMAG:  LD      A,(DE)
        CP      (HL)
        LD      A,MEMAGIC
        JP      NZ,MNTERR
        INC     HL
        INC     DE
        DJNZ    MNMAG
        LD      A,(MNBUF+HMAJOR)
        CP      FMTMAJ
        LD      A,MEVER
        JP      NZ,MNTERR
        LD      HL,(MNBUF+HHDRSZ)
        LD      DE,HDRSZ
        OR      A
        SBC     HL,DE
        LD      A,MESIZE
        JP      NZ,MNTERR
        LD      HL,(MNBUF+HDSCSZ)
        LD      DE,DSCSZ
        OR      A
        SBC     HL,DE
        JP      NZ,MNTERR
        LD      HL,(MNBUF+HCOUNT)
        LD      A,H
        OR      A
        LD      A,MECOUNT
        JP      NZ,MNTERR
        LD      A,L
        OR      A
        LD      A,MECOUNT
        JP      Z,MNTERR
        LD      A,L
        CP      MAXVOL+1
        LD      A,MECOUNT
        JP      NC,MNTERR
        LD      A,L
        LD      (MNTCNT),A
        CALL    HDRSUM          ; HL = sum of all bytes except the checksum
        OR      A
        SBC     HL,DE           ; DE = the checksum
        LD      A,MESUM
        JP      NZ,MNTERR
	CALL	MNHDR		; the header's fields again
        LD      HL,MNBUF+HBLOCKS
        LD      DE,MNTBLK
        LD      BC,4
        LDIR
        XOR     A
        LD      (MNTDRV),A
        LD      A,(MNBUF+HMINOR) ; a 1.0 card has no drives field or table sum;
        OR      A               ; its blocks 1-7 are free, as no volume starts
        JR      Z,MNV2          ; below block 8
   LD      A,(MNBUF+HDRIVES)
        LD      (MNTDRV),A
        CP      MAXDRV+1
        LD      A,MESIZE
        JP      NC,MNTERR
        LD      HL,(MNBUF+HTSUM)
        LD      (MNTSUM),HL
        ; Format 1.1: the table's blocks after block 0, count / 16 of them,
        ; sum to the header's tableSum.
        LD      A,(MNTCNT)
        RRCA
        RRCA
        RRCA
        RRCA
        AND     $0F
        JR      Z,MNV2
        LD      B,A
        LD      HL,0
        LD      (MNTPRV),HL     ; the sum so far
        LD      C,1
MNSUMB: PUSH    BC
        LD      A,C
        CALL    MNBLK
        POP     BC
        LD      A,MEIO
        JP      NZ,MNTERR
        PUSH    BC
	CALL	MNSUM		; the block added to MNTPRV, the sum so far
        POP     BC
        INC     C
        DJNZ    MNSUMB
        LD      DE,(MNTSUM)
        OR      A
        SBC     HL,DE
        LD      A,MESUM
        JP      NZ,MNTERR

        ; One pass in table order: each descriptor valid, starting at or after
        ; the previous one's end, and mounted as it is checked.
MNV2:   LD      HL,0
        LD      (MNTPRV),HL
        LD      (MNTPRV+2),HL
        XOR     A
        LD      (MNTI),A
MNDESC: LD      A,(MNTI)
        CALL    DESCIX
        LD      A,MEIO
        JP      NZ,MNTERR
        LD      A,(IX+DVOLID)   ; volume id must be nonzero
        OR      (IX+DVOLID+1)
        OR      (IX+DVOLID+2)
        OR      (IX+DVOLID+3)
	JP	Z,MNDBAD
        LD      A,(IX+DFLAGS)
        AND     $FF-DFREAD
	JP	NZ,MNDBAD
        LD      A,(IX+DGEOM)
        CALL    GEOFIND         ; HL -> geometry entry, Z if known
	JP	NZ,MNDBAD
        INC     HL              ; length must equal the geometry's payload
        INC     HL
        LD      A,(HL)
        CP      (IX+DLEN)
	JP	NZ,MNDBAD
        INC     HL
        LD      A,(HL)
        CP      (IX+DLEN+1)
	JP	NZ,MNDBAD
        LD      A,(IX+DLEN+2)
        OR      (IX+DLEN+3)
	JP	NZ,MNDBAD
        LD      A,(IX+DSTART)   ; start: nonzero and aligned
        AND     ALIGNB-1
	JP	NZ,MNDBAD
        LD      A,(IX+DSTART)
        OR      (IX+DSTART+1)
        OR      (IX+DSTART+2)
        OR      (IX+DSTART+3)
	JP	Z,MNDBAD
        PUSH    IX              ; start >= the previous end
        POP     HL
        LD      DE,DSTART
        ADD     HL,DE
        LD      DE,MNTPRV
        CALL    CMP32
        LD      A,MEOVLAP
	JP	C,MNTERR
        LD      IY,MNTPRV
        LD      L,(IX+DSTART)   ; end = start + length, no wrap
        LD      H,(IX+DSTART+1)
        LD      E,(IX+DLEN)
        LD      D,(IX+DLEN+1)
        ADD     HL,DE
        LD      (IY+0),L
        LD      (IY+1),H
        LD      L,(IX+DSTART+2)
        LD      H,(IX+DSTART+3)
        LD      E,(IX+DLEN+2)
        LD      D,(IX+DLEN+3)
        ADC     HL,DE
        LD      (IY+2),L
        LD      (IY+3),H
        LD      A,MERANGE
        JR      C,MNTERR
        LD      DE,MNTPRV       ; end <= container blocks
        LD      HL,MNTBLK
        CALL    CMP32
        LD      A,MERANGE
        JR      C,MNTERR
	LD	A,(SDBYTE)	; a standard card addresses bytes: its
	OR	A		; last block is 7FFFFFh (KE-158)
	JR	Z,MNSTOK	; block addressing: no such bound
	LD	A,(IY+3)	; the end, exclusive, at most 800000h
	OR	A
	JR	NZ,MNSTX
	LD	A,(IY+2)
	CP	$80
	JR	C,MNSTOK	; below 800000h
	JR	NZ,MNSTX	; above it
	LD	A,(IY+1)	; 80xxxxh: only 800000h itself
	OR	(IY+0)
	JR	Z,MNSTOK
MNSTX:	LD	A,MERANGE	; a block the card can't name
	JP	MNTERR
MNSTOK:
        LD      A,(IX+DMOUNT)   ; drive letter: none, or A-D, once
        CP      DUNMNT
        JR      Z,MNNEXT
        CP      MAXDRV
        LD      A,MEMOUNT
        JR      NC,MNTERR
	LD	A,(MNTDRV)	; N drives have slots: past them, none. N = 0
	DEC	A		; wraps, and every default drive is slotted
	CP	(IX+DMOUNT)
	LD	A,MEMOUNT
	JP	C,MNTERR
        LD      E,(IX+DMOUNT)
        LD      D,0
        LD      HL,DRVIDX
        ADD     HL,DE
        LD      A,(HL)
        OR      A
        LD      A,MEMOUNT
        JR      NZ,MNTERR
        LD      A,(MNTI)
        INC     A
        LD      (HL),A
        CALL    MNONE
MNNEXT: LD      HL,MNTI
        INC     (HL)
        LD      A,(MNTCNT)
        CP      (HL)
        JP      NZ,MNDESC
        LD      A,(DRVTAB+6)    ; drive A must have a volume
        OR      A
        LD      A,MENOA
        JR      Z,MNTERR
        XOR     A               ; Z: mounted
        RET
MNDBAD:	LD	A,MEDESC	; a descriptor check failed
MNTERR: PUSH    AF
        CALL    UNMOUNT
        POP     AF
        OR      A
        RET

; Card block A (0-7, the container's table) in a cache line, MNTLN: read from
; the card the first time it is asked for since MNTCB named another block, so
; a mount reads the table as the card holds it. The line is an ordinary clean
; one, left for the cache to take back in turn. NZ if the read fails.
; Destroys AF, BC, DE and HL.
MNBLK:	LD	(MNBUF+2),A	; the block, in MNBUF while it is free, so
	LD	L,A		; that the stack stays shallow
	LD	H,0
	LD	(SDLBA),HL
	LD	L,H
	LD	(SDLBA+2),HL
	CALL	CLOOK		; Z: a line holds it, A = the line
	JR	NZ,MNB1
	LD	C,A
	LD	A,(MNBUF+2)
	LD	B,A
	LD	A,(MNTCB)
	CP	B		; read already since MNTCB was last set
	LD	A,C
	JR	Z,MNB3
	JR	MNB2		; held from before: read again
MNB1:	CALL	CTAKE		; a line for it, the next in turn
	JR	NZ,MNBF
MNB2:	CALL	CFILL		; keeps A, the line; Z if the card gave it
	JR	NZ,MNBF
MNB3:	LD	(MNTLN),A
	LD	A,(MNBUF+2)
	LD	(MNTCB),A
	XOR	A
	RET
MNBF:	LD	A,$FF		; a failed read holds no table block
	LD	(MNTCB),A
	OR	A		; NZ
	RET

; MNBUF = the 32 bytes at offset HL of the table block in MNTLN, copied out
; of EXPAND 1 (MNCP); MNHDR the header's first 32, where its fields are.
; Destroys AF, BC, DE and HL.
MNHDR:	LD	HL,0
	JR	MNCPH
MNCP:	LD	HL,(MNTPRV+2)	; MNSUM's offset; MNHDR's and DESCIX's
MNCPH:	EX	DE,HL		; are given in HL: DE = the offset
	LD	A,(MNTLN)
	CALL	CLADR		; HL = the line
	ADD	HL,DE
	EX	DE,HL		; from the line, in EXPAND 1
	LD	HL,MNBUF	; to MNBUF
	LD	BC,$0100	; XMDST bank 0, XMSRC bank 1
	LD	(XMDST),BC
	LD	BC,32
	JP	MVCOPY

; MNTPRV's word = itself + the 512 bytes of the table block in MNTLN, 32 at a
; time through MNBUF, since nothing runs with EXPAND 1 in view while it uses the
; stack; the offset is kept in MNTPRV+2, so the stack stays shallow. Returns HL
; = the sum. Destroys AF, BC and DE.
MNSUM:	LD	HL,0
	LD	(MNTPRV+2),HL	; the offset
MNS1:	CALL	MNCP		; 32 bytes of it
	LD	HL,(MNTPRV)
	LD	DE,MNBUF
	LD	BC,32
	CALL	SUMDE		; added to the sum
	LD	(MNTPRV),HL
	LD	HL,(MNTPRV+2)
	LD	DE,32		; the next 32
	ADD	HL,DE
	LD	(MNTPRV+2),HL
	BIT	1,H		; 512 done
	JR	Z,MNS1
	LD	HL,(MNTPRV)
	RET

; IX = descriptor A of the table, copied into MNBUF from its block, which is
; read first if it is not already in its line (MNBLK). Block 0 holds 15 after
; the header, each later block 16. NZ if the read fails. Destroys AF, BC, DE
; and HL.
DESCIX: LD      C,0
        SUB     DSCBLK0
        JR      C,DX0
        LD      B,A
        RRCA
        RRCA
        RRCA
        RRCA
        AND     $0F
        INC     A
        LD      C,A
        LD      A,B
        AND     $0F
        JR      DX1
DX0:    ADD     A,DSCBLK0+1     ; block 0: after the header's slot
DX1:    LD      L,A
        LD      H,0
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
	LD	(MNBUF),HL	; its offset in the block, in MNBUF
	CALL	CDI		; while it is free (MNBLK keeps the
	LD	A,C		; block at MNBUF+2); the cache walked
	CALL	MNBLK		; with interrupts off, as a service's
	CALL	CEI		; caller may have them on
	RET	NZ
	LD	HL,(MNBUF)
	CALL	MNCPH
	LD	IX,MNBUF
	XOR	A		; Z
	RET

; Install the descriptor at IX as drive (IX+DMOUNT). Preserves B and IX.
MNONE:	PUSH	BC
	LD	A,(IX+DMOUNT)
	PUSH	AF		; the drive, across the entry
	CALL	DRVENT		; HL -> geometry byte, entry starts 6 earlier
	LD	DE,-6
	ADD	HL,DE
	CALL	MNFILL
	POP	AF		; the drive again, for its DPH
	LD	C,(IX+DGEOM)
	CALL	MNDPH
	POP	BC		; the caller's B
	RET

; The eight bytes of a drive-table entry for the descriptor at IX, at HL:
; start, length, geometry and the flags, with written-behind beside read-only.
; The start's four bytes and the length's low two follow each other in the
; descriptor (DSTART, DLEN), so they go in one LDIR. Keeps IX. Destroys A, BC
; and DE, and leaves HL at the eighth byte.
MNFILL:	EX	DE,HL		; DE = the entry
	PUSH	IX
	POP	HL
	LD	BC,DSTART	; HL = the descriptor's start field
	ADD	HL,BC
	LD	BC,6		; start, then the length's low half
	LDIR
	EX	DE,HL		; HL = the entry's seventh byte
	LD	A,(IX+DGEOM)	; geometry
	LD	(HL),A
	INC	HL
	LD	A,(IX+DCACHE)	; written behind (DCWB, bit 0): the drive's
	AND	DCWB		; flag bit 1
	ADD	A,A
	OR	(IX+DFLAGS)	; beside read-only
	LD	(HL),A
	RET

; Build drive A's DPH for geometry C. Leaves its ALV word, which ALVINIT sets.
; Keeps C and IX. Destroys AF, B, DE and HL.
MNDPH:	CALL	DPHADR		; HL = this drive's DPH
	LD	B,8		; XLT and BDOS scratch words are zero
MNZ:	LD	(HL),0
	INC	HL
	DJNZ	MNZ
	LD	DE,DIRBUF	; shared by every drive
	LD	(HL),E		; the DPH's words are little-endian
	INC	HL
	LD	(HL),D
	INC	HL
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
; slots nor TPA vary with the selection. Step 1 reads and changes nothing: one
; walk of the descriptors, each compared with every retained drive on the
; eight bytes MNFILL builds. A descriptor goes to the first drive it matches
; and no other is tried, so a second drive holding the same entry is left with
; no match. A drive of geometry 0 is not retained, whatever its other seven
; bytes: no descriptor MOUNT accepts has geometry 0, so none matches it. Step 1
; gives up, leaving the defaults whole, on a failed read, a volume whose slot
; wouldn't hold its vector by VMNT's rule, or a retained drive (geometry not
; 0) left with no match. Step
; 2 reads nothing and can't fail: RSLBUF replaces DRVTAB and DRVIDX, and each
; drive's DPH is built. Drives not retained stay empty, even if the card names
; them. Destroys AF, BC, DE, HL and IX.
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
RSDRV:	CALL	RSEQ
	JR	NZ,RSNEXT
	CALL	VSLOT		; a match: it must fit the drive's slot
	RET	C
	LD	HL,RSLIDX	; this drive's index + 1
	LD	B,0		; BC = the drive
	ADD	HL,BC
	LD	A,(MNTI)	; as DRVIDX counts them
	INC	A
	LD	(HL),A		; kept for step 2
	JR	RSDESC		; no other drive is tried: a duplicate is left
				; with no match, which gives up below
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
	JR	NZ,RSWALK
	LD	C,0		; every retained drive must have matched
	LD	HL,RSLBUF+6	; HL at each geometry
	LD	DE,RSLIDX	; DE at each index
RSCHK:	LD	A,(DE)
	OR	A
	JR	NZ,RSCHK1	; matched
	OR	(HL)		; no match, and A is its geometry
	RET	NZ		; retained: give up
RSCHK1:	INC	DE		; the next drive's index and geometry
	LD	A,L		; within RSLBUF's page
	ADD	A,DRVESZ
	LD	L,A
	INC	C
	LD	A,C
	CP	MAXDRV		; all four
	JR	C,RSCHK
	LD	HL,RSLBUF	; step 2: entries, then the indices
	LD	DE,DRVTAB
	LD	BC,MAXDRV*DRVESZ+MAXDRV
	LDIR
	LD	C,0		; each drive's DPH for what it now holds
RSDPH:	LD	A,C		; the drive
	CALL	DRVENT		; HL -> its geometry byte
	LD	A,(HL)
	OR	A
	JR	Z,RSDPH1	; empty: BSELDSK refuses it anyway
	PUSH	BC		; the loop's count
	LD	E,C		; the drive, while C takes the geometry
	LD	C,A
	LD	A,E		; and A the drive
	CALL	MNDPH
	POP	BC
RSDPH1:	INC	C
	LD	A,C		; all four
	CP	MAXDRV
	JR	C,RSDPH
	RET

; Z if the eight bytes at DE equal RSLTMP's. Keeps C and DE. Destroys AF, B,
; HL.
RSEQ:	PUSH	DE		; the caller's place in RSLBUF
	LD	HL,RSLTMP
	LD	B,DRVESZ
RSEQ1:	LD	A,(DE)		; a retained byte
	CP	(HL)
	JR	NZ,RSEQ2	; NZ goes back to the caller
	INC	DE		; the next of the eight
	INC	HL
	DJNZ	RSEQ1
RSEQ2:	POP	DE
	RET

; The volume services, TNMOUNT, TNUNMNT and TNDESC (abi.inc). B = the drive for
; a mount or unmount, E = the container index for a mount or a describe, HL ->
; 32 bytes for a describe, its mount byte the drive it is on now (FFh none).
; Returns A = 0 with carry clear, or A = TNEBAD with carry and nothing changed:
; an index past the table, a drive past D, a volume already on another drive,
; a slot too small, or drive A to be left empty. A mount or unmount resets the
; drive in the BDOS, as function 37 does, so its next access logs it in from
; its directory.
VSMNT:	CALL	VSIN
	JR	VMNT
VSUNM:	CALL	VSIN
	JR	VUNM
VSDSC:	CALL	VSIN
        LD      A,E             ; describe
	EX	DE,HL		; DE -> the caller's 32 bytes, which VDESC
        CALL    VDESC           ; keeps, so that the stack stays shallow
        JR      NZ,VBAD
        PUSH    IX
        POP     HL
        LD      BC,DSCSZ
        LDIR
        EX      DE,HL           ; the mount byte: where it is now
        LD      DE,DMOUNT-DSCSZ
        ADD     HL,DE
        LD      (HL),A
        XOR     A
        RET

VMNT:   LD      A,C
        CP      MAXDRV
        JR      NC,VBAD
        LD      A,E
        CALL    VDESC           ; IX -> its descriptor, A = its drive or FFh
        JR      NZ,VBAD
        INC     A
        JR      NZ,VBAD         ; on a drive already
	CALL	VSLOT
	JR	C,VBAD
	CALL	VFLUSH		; old data safe first
        JR      NZ,VBAD
        LD      (IX+DMOUNT),C   ; publish only after the old data is safe
        PUSH    BC
        PUSH    DE
        LD      A,C
        CALL    VCLEAR
        CALL    MNONE
        POP     DE
        POP     BC
        LD      HL,DRVIDX
        LD      B,0
        ADD     HL,BC
        INC     E
        LD      (HL),E
        JR      VRESET

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
	CP	(HL)
	CCF
	RET

VUNM:   LD      A,C
        OR      A
        JR      Z,VBAD          ; A is never left empty
        CP      MAXDRV
        JR      NC,VBAD
        CALL    VFLUSH
        JR      NZ,VBAD
        LD      A,C
        CALL    VCLEAR
VRESET: XOR     A
        LD      (BUFOK),A
        LD      HL,1            ; BDOS function 37 for drive C
        INC     C
VRS1:   DEC     C
        JR      Z,VRS2
        ADD     HL,HL
        JR      VRS1
VRS2:   EX      DE,HL
        LD      C,37
        CALL    BDOS
VOK:    XOR     A
        RET
VBAD:	LD	A,TNEBAD	; refused, nothing changed
	SCF
        RET

; C = the drive from B, and every table block to be read afresh. Keeps B, DE, HL.
VSIN:	LD	C,B
	LD	A,$FF
	LD	(MNTCB),A	; no table block read yet
	RET

; Before a drive's volume changes: write dirty cache lines, Z on success.
; Keep the requested drive (BC), descriptor index (DE) and pointer (IX).
; CDI/CEI use HL/AF; CFLALL and its SDWRITE/MAPREC path destroy BC/DE/HL.
VFLUSH: PUSH    BC
        PUSH    DE
        PUSH    IX
        CALL    CDI
        CALL    CFLALL
        CALL    CEI
        POP     IX
        POP     DE
        POP     BC
        RET

; Forget drive A's volume: its drive-table entry and DRVIDX. Keeps C.
VCLEAR: PUSH    BC
        CALL    DRVENT
        LD      DE,-6
        ADD     HL,DE
        LD      B,DRVESZ
VCL1:   LD      (HL),0
        INC     HL
        DJNZ    VCL1
        POP     BC
        LD      HL,DRVIDX
        LD      B,0
        ADD     HL,BC
        LD      (HL),0
        RET

; IX -> the descriptor at index A, A = the drive it is on (FFh none). NZ if A
; is past the table or its block does not read. Keeps BC and DE; uses MNTI.
VDESC:  LD      HL,MNTCNT
        CP      (HL)
        JR      NC,VDNO
        PUSH    BC
        PUSH    DE
	LD	(MNTI),A	; the index, off the stack, which a line
        CALL    DESCIX          ; taken and written runs deep
	LD	A,(MNTI)
	LD	D,A		; D = the index
        JR      NZ,VDX
        INC     D
        LD      HL,DRVIDX
        LD      B,MAXDRV
        LD      E,0
VDS1:   LD      A,(HL)
        CP      D
        LD      A,E
        JR      Z,VDX
        INC     HL
        INC     E
        DJNZ    VDS1
        LD      A,$FF
        CP      A               ; Z
VDX:    POP     DE
        POP     BC
        RET
VDNO:   OR      $FF             ; NZ
        RET

; Forget every mounted volume.
UNMOUNT:LD      HL,DRVTAB         ; and DRVIDX, which follows it
        LD      B,MAXDRV*DRVESZ+MAXDRV
UNM:    LD      (HL),0
        INC     HL
        DJNZ    UNM
        XOR     A
        LD      (BUFOK),A
        RET

; A = geometry id. Returns Z and HL -> its GEOTAB entry, or NZ.
GEOFIND:LD      HL,GEOTAB
        LD      B,GEOCNT
GEOF:   CP      (HL)
        RET     Z
        LD      DE,GEOESZ
        ADD     HL,DE
        DJNZ    GEOF
        OR      1
        RET

; Compare the 32-bit little-endian values at HL and DE. C when (HL) < (DE),
; Z when equal. Destroys A, B; HL and DE end at the low bytes.
CMP32:  INC     HL
        INC     HL
        INC     HL
        INC     DE
        INC     DE
        INC     DE
        LD      B,4
CMPL:   LD      A,(DE)
        CP      (HL)
        JR      NZ,CMPNE
        DEC     HL
        DEC     DE
        DJNZ    CMPL
        RET
CMPNE:  CCF                     ; flags now describe (HL) - (DE)
        RET     C
        OR      1               ; (HL) > (DE): clear Z, carry already clear
        RET

; HL = 16-bit sum of the header's bytes, block 0 in MNTLN with MNBUF its first
; 32, the checksum field left out, and DE = that checksum.
HDRSUM:	LD	DE,(MNBUF+HCKSUM)
	PUSH	DE		; the checksum, across the sum
	LD	HL,0
	LD	(MNTPRV),HL
	CALL	MNSUM		; every header byte
	POP	DE
        LD      A,E             ; take the two checksum bytes back out
        CALL    HSSUB
        LD      A,D
HSSUB:  LD      C,A
        LD      B,0
        OR      A
        SBC     HL,BC
        RET

; HL = HL + each of the BC bytes at DE, unsigned, for the header's sum and the
; table blocks' (MOUNT). BC from 1; 0 is 65,536. Returns DE past the bytes and
; BC = 0. Destroys AF.
SUMDE:	LD	A,(DE)
	ADD	A,L		; the byte into the low half,
	LD	L,A
	JR	NC,SUMDE1
	INC	H		; its carry into the high
SUMDE1:	INC	DE
	DEC	BC
	LD	A,B
	OR	C
	JR	NZ,SUMDE	; every byte
	RET

; IX -> the descriptor of the volume on drive C, read from its block of the
; table. NZ if the drive has none or the block does not read. Keeps C.
DRVDESC:LD      HL,DRVIDX
        LD      B,0
        ADD     HL,BC
        LD      A,(HL)
        SUB     1
        RET     C               ; NZ as well: none here
        PUSH    BC
        CALL    DESCIX
        POP     BC
        RET
