; The volume code's helpers, after vol.asm: the drive table cleared
; (UNMOUNT), a geometry looked up (GEOFIND), 32-bit block numbers compared
; (CMP32), the header's and the table's sums (HDRSUM, SUMDE), and a drive's
; descriptor read back (DRVDESC) for the boot listing and the LCD.

; Forget every mounted volume: DRVTAB and DRVIDX zeroed, and the BIOS's
; buffered record dropped. Destroys AF, B and HL.
UNMOUNT:
	LD	HL,DRVTAB	; and DRVIDX, which follows it
	LD	B,MAXDRV*DRVESZ+MAXDRV
UNM:	LD	(HL),0		; every entry and index byte zero
	INC	HL
	DJNZ	UNM
	XOR	A		; BUFOK 0: no record buffered
	LD	(BUFOK),A
	RET

; A = geometry id. Returns Z and HL -> its GEOTAB entry (id, 0, payload
; blocks, DPB), or NZ. Keeps C, and A when found. Destroys B and DE.
GEOFIND:
	LD	HL,GEOTAB	; GEOCNT entries of GEOESZ bytes
	LD	B,GEOCNT
GEOF:	CP	(HL)		; the entry's id
	RET	Z
	LD	DE,GEOESZ	; the next entry
	ADD	HL,DE
	DJNZ	GEOF
	OR	1		; NZ: no such geometry
	RET

; Compare the 32-bit little-endian values at HL and DE. C when (HL) < (DE),
; Z when equal. Destroys A, B; HL and DE end at the low bytes.
CMP32:	INC	HL		; from the top bytes down
	INC	HL
	INC	HL		; HL at its top byte
	INC	DE
	INC	DE
	INC	DE		; and DE at its
	LD	B,4		; four bytes at most
CMPL:	LD	A,(DE)
	CP	(HL)		; (DE) - (HL), the first difference decides
	JR	NZ,CMPNE
	DEC	HL		; equal so far: the next byte down
	DEC	DE
	DJNZ	CMPL
	RET			; Z: all four equal
CMPNE:	CCF			; flags now describe (HL) - (DE)
	RET	C
	OR	1		; (HL) > (DE): clear Z, carry already clear
	RET

; HL = 16-bit sum of the header's bytes, block 0 in MNTLN with MNBUF its
; first 32, the checksum field left out, and DE = that checksum. Destroys
; AF and BC.
HDRSUM:	LD	DE,(MNBUF+HCKSUM)
	PUSH	DE		; the checksum, across the sum
	LD	HL,0		; MNSUM adds to MNTPRV's word, from 0
	LD	(MNTPRV),HL
	CALL	MNSUM		; every header byte
	POP	DE
	LD	A,E		; take the two checksum bytes back out
	CALL	HSSUB
	LD	A,D		; HSSUB's second pass, by falling in
HSSUB:	LD	C,A		; HL less the byte in A
	LD	B,0
	OR	A		; no borrow in
	SBC	HL,BC
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
	DEC	BC		; BC counts the bytes left
	LD	A,B
	OR	C
	JR	NZ,SUMDE	; every byte
	RET

; IX -> the descriptor of the volume on drive C, read from its block of the
; table. NZ if the drive has none or the block does not read. Keeps C.
; Destroys AF, B, DE and HL.
DRVDESC:
	LD	HL,DRVIDX	; the drive's index + 1
	LD	B,0
	ADD	HL,BC
	LD	A,(HL)
	SUB	1		; carry from 0: no volume
	RET	C		; NZ as well: none here
	PUSH	BC		; C, which DESCIX destroys
	CALL	DESCIX		; A = the index: IX -> its copy
	POP	BC
	RET
