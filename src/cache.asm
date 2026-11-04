; The block cache: 30 lines of 512 bytes in EXPAND 1 at 8000h-BBFFh, keyed
; by card block, with its table in the page at BC00h: each line's block,
; 4 bytes from BC00h (FFFFFFFFh for an empty line), and its dirty byte from
; BC80h. Every volume's reads go through it. A volume whose descriptor has
; byte 15 bit 0 set is written behind: its writes stay in their lines until
; a directory write of the volume, no clean line left, warm boot or a
; remount writes them, data before directory. Every other volume is written
; through as before, and its line refreshed.
;
; Blocks go straight between the card and a line: SDREAD and SDWRITE put
; EXPAND 1 in view around their block loops when SDXB is LATEXP. Nothing
; here uses the stack while EXPAND 1 is in view, and the BIOS entries run
; with interrupts off (CDI, CEI), so none can arrive while it is.

; CTAB, CDIRTY and NLINES are in layout.asm.

; HL = line A's block in the table (CTADR), or entry A of the page (CTENT),
; and A = the latch value with EXPAND 1 in view (CXON), for the caller's OUT.
; Takes A < 64 for CTADR, so that A * 4 fits L. Destroys F.
CTADR:	ADD	A,A		; 4 bytes a line's block
	ADD	A,A
CTENT:	LD	L,A		; the table's page: CTAB is page-aligned
	LD	H,CTAB>>8
CXON:	LD	A,(LATCHV)	; the latch as it stands, with EXPAND 1
	OR	LATEXP		; behind the window at 8000h-BFFFh
	RET

; Look up SDLBA's block: Z with A = its line; NZ if no line has it.
; Takes SDLBA. Destroys BC, DE, HL; the latch is left as LATCHV.
CLOOK:	LD	DE,(SDLBA)	; the block wanted in BCDE, low byte in E
	LD	BC,(SDLBA+2)
	XOR	A		; from line 0's entry, the table in view
	CALL	CTENT
	OUT	(SYSLAT),A
CLK1:	LD	A,(HL)		; each byte against the block's, low first;
	CP	E		; any difference moves to the next line
	JR	NZ,CLK2
	INC	L		; the second byte
	LD	A,(HL)
	CP	D
	JR	NZ,CLK2
	INC	L		; the third
	LD	A,(HL)
	CP	C
	JR	NZ,CLK2
	INC	L		; the top byte decides it
	LD	A,(HL)
	CP	B
	JR	Z,CLK3
CLK2:	LD	A,L		; the next line's block
	OR	3		; past this entry's last byte, from any of
	INC	A		; its four, to the next multiple of 4
	LD	L,A
	CP	NLINES*4	; past the last line's entry: not cached
	JR	C,CLK1
	LD	A,(LATCHV)	; not found
	OUT	(SYSLAT),A
	OR	1		; NZ
	RET
CLK3:	LD	A,(LATCHV)	; EXPAND 0 back in view
	OUT	(SYSLAT),A
	LD	A,L		; found: A = the line, Z
	RRCA			; L is the entry's last byte, line * 4 + 3:
	RRCA			; its two low bits rotate to the top and go
	AND	$3F
	CP	A		; Z for found
	RET

; Line A's entry: block SDLBA and clean (CSET), or empty (CDROP). Keeps A.
; Returns Z. Destroys BC, DE, HL.
CSET:	LD	DE,(SDLBA)	; the block to enter, as CLOOK compares it
	LD	BC,(SDLBA+2)
	JR	CENT
CDROP:	LD	DE,$FFFF	; FFFFFFFFh: an empty line, which no
	LD	B,D		; block on a card can match
	LD	C,E
CENT:	PUSH	AF		; the line, kept
	CALL	CTADR		; the table in view, HL at the line's entry
	OUT	(SYSLAT),A
	LD	(HL),E		; four bytes, low first
	INC	L
	LD	(HL),D
	INC	L
	LD	(HL),C		; then the high word
	INC	L
	LD	(HL),B
	LD	A,(LATCHV)	; EXPAND 0 back in view
	OUT	(SYSLAT),A
	POP	AF		; the line again, its dirty byte next
CDCLR:	LD	C,0		; clean
	JR	CDPUT

; Line A's dirty byte: Z if it is clean (CDGET); set it (CDSET), clear it
; (CDCLR) or make it C (CDPUT). Each keeps A, returns Z for a clean line
; and NZ for a dirty one, and destroys B, C and HL.
CDGET:	LD	C,$FF		; FFh: read, nothing written
	JR	CDPUT
CDSET:	LD	C,1		; dirty
CDPUT:	PUSH	AF		; the line, kept
	ADD	A,CDIRTY-CTAB	; the dirty bytes follow the blocks in the
	CALL	CTENT		; table's page
	OUT	(SYSLAT),A
	LD	A,C
	INC	A
	JR	Z,CDP1		; FFh: only read it
	LD	(HL),C
CDP1:	LD	B,(HL)		; the byte as it now stands, for the flags
	LD	A,(LATCHV)	; EXPAND 0 back in view
	OUT	(SYSLAT),A
	POP	AF
	INC	B		; Z from the dirty byte, A kept
	DEC	B
	RET

; HL = line A's address: 8000h + A * 512. Destroys A.
CLADR:	ADD	A,A		; two pages a line, from 80h
	ADD	A,$80
	LD	H,A
	LD	L,0
	RET

; Read SDLBA's block straight into line A (CFILL), or write line A straight
; to its block (CWRITE). Z on success. CFILL enters the line on success and
; leaves it empty otherwise. CWRITE takes the block from the table, keeps
; SDLBA, marks the line clean on success, and on a failure leaves it dirty
; and returns NZ. CWRITE keeps A; CFILL keeps it on success only, a failure
; returning A = the line OR 1. Both destroy BC, DE and HL; CWRITE maps the
; record again (MAPREC), so BLKOFF and BLKSLOT are set as before.
CFILL:	PUSH	AF		; the line
	CALL	CLADR		; the card's block to the line's address,
	LD	A,LATEXP	; with EXPAND 1 in view for the transfer
	LD	(SDXB),A
	CALL	SDREAD
	PUSH	AF		; SDREAD's Z
	XOR	A		; the next transfer is the program's again
	LD	(SDXB),A
	POP	AF
	JR	NZ,CFL9
	POP	AF		; read: the line holds the block
	JR	CSET		; Z
CFL9:	POP	AF		; failed: the line's old bytes are gone,
	CALL	CDROP		; so it holds no block
	OR	1		; NZ
	RET
CWRITE:	PUSH	AF		; the line
	CALL	CTADR		; its block from the table, into BCDE
	OUT	(SYSLAT),A
	LD	E,(HL)		; low byte first
	INC	L
	LD	D,(HL)
	INC	L
	LD	C,(HL)		; then the high word
	INC	L
	LD	B,(HL)
	LD	A,(LATCHV)	; EXPAND 0 back in view
	OUT	(SYSLAT),A
	LD	(SDLBA),DE	; the block SDWRITE writes
	LD	(SDLBA+2),BC
	POP	AF
	PUSH	AF
	CALL	CLADR		; from the line's address, EXPAND 1 in
	LD	A,LATEXP	; view for the transfer
	LD	(SDXB),A
	CALL	SDWRITE
	PUSH	AF		; SDWRITE's Z
	XOR	A		; the next transfer is the program's again
	LD	(SDXB),A
	CALL	MAPREC		; SDLBA back as the caller mapped it
	POP	BC
	POP	AF
	BIT	6,C		; SDWRITE's Z
	JR	Z,CWR9
	CALL	CDCLR		; written: clean
	CP	A
	RET
CWR9:	LD	C,A		; the line, kept
	XOR	A
	INC	A		; NZ: the write failed
	LD	A,C
	RET

; Write every dirty line (CFLALL), or every one but line A (CFLUSH). Each
; is tried; one whose write fails is dropped, so the card's copy stands, and
; the flush returns NZ if any did, Z if none. Returns A = the line left (FFh
; for CFLALL). Destroys BC, DE and HL; SDLBA, BLKOFF and BLKSLOT are mapped
; again from the BIOS's track and sector, as CWRITE leaves them.
CFLALL:	LD	A,$FF		; no line is FFh: every one is written
CFLUSH:	LD	C,A		; the line to leave
	LD	B,0		; lines that failed
	XOR	A		; from line 0
CFS1:	CP	C
	JR	Z,CFS2		; the one left
	PUSH	BC
	CALL	CDGET		; Z: clean, nothing to write
	CALL	NZ,CWRITE	; keeps A, NZ if the card refused it
	POP	BC
	JR	Z,CFS2
	PUSH	BC
	CALL	CDROP		; failed: dropped, the card's copy stands
	POP	BC
	INC	B		; and counted
CFS2:	INC	A		; every line, failures or not
	CP	NLINES
	JR	C,CFS1
	LD	A,C		; the line left, for CWB3
	INC	B
	DEC	B		; NZ if any failed
	RET

; A line for SDLBA's block: the next clean one in turn, or, with every line
; dirty, the next in turn written first. Z with A = the line; NZ if that
; write failed, the line left dirty for a flush to try (KE-187). CNEXT moves
; past the line taken, or the line that failed, so the next miss tries
; another. The line keeps its entry: the caller fills or enters it.
; Destroys BC, DE, HL.
CTAKE:	LD	B,NLINES	; every line looked at once at most
	LD	A,(CNEXT)	; from the next in turn, in the dirty bytes
	ADD	A,CDIRTY-CTAB
	CALL	CTENT
	OUT	(SYSLAT),A	; the table in view
CTK1:	LD	A,(HL)		; 0: clean
	OR	A
	JR	Z,CTK3		; clean
	INC	L		; dirty: the next, past the last line
	LD	A,L		; back to line 0
	CP	CDIRTY-CTAB+NLINES
	JR	C,CTK2
	LD	L,CDIRTY-CTAB
CTK2:	DJNZ	CTK1
CTK3:	LD	A,(LATCHV)	; EXPAND 0 back in view
	OUT	(SYSLAT),A
	LD	A,L		; the line: CNEXT's again if all were dirty
	SUB	CDIRTY-CTAB
	INC	B		; B counts down only past dirty lines:
	DEC	B		; 0 when none was clean
	JR	NZ,CTK5		; a clean line
	CALL	CWRITE		; every line dirty: this one written first
	JR	Z,CTK5
	CALL	CTK5		; failed: CNEXT past it all the same
	OR	1		; NZ
	RET
CTK5:	LD	E,A		; the line taken
	INC	A		; the next in turn is the one after it,
	CP	NLINES		; line 0 after the last
	JR	C,CTK4
	XOR	A
CTK4:	LD	(CNEXT),A
	LD	A,E
	CP	A		; Z: A is the line
	RET

; Copy the mapped record between line A and DSKDMA: to DSKDMA (CRDREC) or
; from it (CWRREC), by MVCOPY. Takes BLKSLOT, the record in the block.
; Returns A = 0. Destroys BC, DE and HL. CRECAD alone returns HL = the
; record's address in line A, and destroys A.
CRECAD:	CALL	CLADR
	LD	A,(BLKSLOT)	; slot * 128: its half page in L, its page
	SRL	A		; added to H
	RR	L
	ADD	A,H
	LD	H,A
	RET
CRDREC:	CALL	CRECAD		; HL = the record in the line
	EX	DE,HL		; from the line in DE, to DSKDMA in HL
	LD	HL,(DSKDMA)
	LD	BC,$0100	; XMDST bank 0, XMSRC bank 1
	JR	CREC
CWRREC:	CALL	CRECAD		; to the line in HL, from DSKDMA in DE
	LD	DE,(DSKDMA)
	LD	BC,$0001	; XMDST bank 1, XMSRC bank 0
CREC:	LD	(XMDST),BC	; XMSRC follows XMDST: both set at once
	LD	BC,128		; one record
	JP	MVCOPY

; BIOS READ, every volume: a hit is copied from its line; a miss is read
; straight into the next line, then copied from it. Takes SDLBA and
; BLKSLOT from MAPREC. Z with A = 0 on success; NZ on a card error.
; Destroys BC, DE and HL.
CREAD:	CALL	CLOOK
	JR	Z,CRD1		; a hit: A is its line
	CALL	CTAKE		; a miss: a line for it, and the block read
	RET	NZ		; into it
	CALL	CFILL
	RET	NZ
CRD1:	CALL	CRDREC		; the record to the program
	XOR	A		; Z: read
	RET

; BIOS WRITE, every volume, from BWRITE with its checks done and C = 1 when
; the block needs no pre-read. The record goes into the block's line, which is
; dirty. On a volume written through (CWTYPE bit 7) the line is written to the
; card before the call returns, and dropped if that fails. On the one written
; behind a directory write then writes every dirty line and its own last, and
; never leaves its line dirty. Z on success. Takes CWTYPE (the BDOS's write
; type in bits 0 and 1, bit 7 written through) and sets its bit 6 when a
; line is taken for the write. Destroys A, BC, DE and HL.
CWRBH:	PUSH	BC		; C, the pre-read rule's answer, kept
	CALL	CLOOK
	POP	BC
	JR	Z,CWB1		; the line has it
	PUSH	BC
	CALL	CTAKE
	POP	BC
	RET	NZ		; no line: a dirty one's write failed
	LD	HL,CWTYPE	; a line taken for this write
	SET	6,(HL)
	INC	C
	DEC	C
	JR	Z,CWBF		; the card's block first
CWB1:	DEC	C
	JR	NZ,CWBK		; a line's bytes kept
	PUSH	AF		; nothing to keep, a hit's old bytes too:
	CALL	CLADR		; cleared, as written through
	CALL	CXON
	OUT	(SYSLAT),A
	LD	D,H		; 512 zeros: the first stored, then LDIR
	LD	E,L		; spreads it over the other 511
	INC	DE
	LD	BC,511
	LD	(HL),0
	LDIR
	LD	A,(LATCHV)	; EXPAND 0 back in view
	OUT	(SYSLAT),A
	LD	C,2		; BWRITE's key: this block cleared
	CALL	GETKEY
	POP	AF
	CALL	CSET		; the line holds the block, clean so far
	JR	CWB2
CWBF:	CALL	CFILL		; the card's block first
	RET	NZ
				; A write that keeps a line's bytes, to
				; any block but the key's own, ends the
				; run of blocks cleared rather than read:
				; the key goes, so that the rule never
				; clears a block written after the key's,
				; records and all (KE-AR7).
CWBK:	LD	C,A		; C = the line, kept
	LD	HL,(BLKOFF)	; this block against the key's
	LD	DE,(BUFBLK)
	OR	A		; carry clear for the compare
	SBC	HL,DE
	JR	NZ,CWBK0	; another block: the key goes
	LD	A,(BUFDRV)	; the key's block number: on this drive?
	LD	HL,DSKCUR
	CP	(HL)
	JR	Z,CWBK1		; the key's own block: it stands
CWBK0:	XOR	A		; the key dropped, BUFOK 0: not cleared,
	LD	(BUFOK),A	; not read
CWBK1:	LD	A,C		; the line again
CWB2:	PUSH	AF
	CALL	CWRREC		; the record into the line, now dirty
	POP	AF
	CALL	CDSET
	LD	C,A		; the line, kept over the type's test
	LD	A,(CWTYPE)
	OR	A		; bit 7 to the sign
	JP	M,CWBT		; written through: to the card now
	RRCA			; type 1, a directory block: bit 0, as
	JR	C,CWB3		; bit 6 may say a line was taken
	XOR	A		; data: done
	RET
CWBT:	LD	A,C		; written through: the line to the card
	CALL	CWRITE
	JR	NZ,CWBX		; failed: the line goes
	LD	HL,CWTYPE
	BIT	6,(HL)		; a line taken for this write is the next
	RET	Z		; in turn again: writing through churns
	LD	(CNEXT),A	; that one line, not the programs' blocks,
	CP	A		; and keeps the block for its next record
	RET
CWB3:	LD	A,C		; a directory block: the volume's data first,
	CALL	CFLUSH		; then the directory line; if either fails,
	CALL	Z,CWRITE	; the line goes, so the card's directory
	RET	Z		; stays the truth and is read again
CWBX:	CALL	CDROP		; A is the line, from CWRITE or CFLUSH
	OR	1		; NZ
	RET

; Warm boot: every dirty line tried, and, if any failed and was dropped,
; Write lost said once. The rest of a chained line goes, as it does on a BDOS
; error's exit. Returns Z when every line was written. Destroys A, BC, DE
; and HL.
CWBOOT:	CALL	CFLALL
	RET	Z		; every line written
	XOR	A
	LD	(CHPOS),A	; the chained line goes
	LD	HL,CWMSG	; Write lost; PUTS returns to the caller
	JP	PUTS

CEND:

; MVCOPY: the cache's copy between EXPAND 0 and EXPAND 1. BC bytes from DE to
; HL, forward as LDIR does, XMDST and XMSRC the destination's and source's
; banks: 0 the program's view, 1 EXPAND 1. Returns A = 0 with HL and DE
; advanced by BC. Destroys BC and F, and MVREST; the alternate registers are
; kept, and the latch and the interrupt state are as it found them.
;
; With interrupts off, EXPAND 1 is switched in only around code that uses no
; stack, as the caller's stack may be in EXPAND 0. Within one bank: LDIR in
; that bank's view. Across banks, the bank-0 end's part below 8000h, in the
; fixed RAM, copies by LDIR with EXPAND 1 in view; its part in EXPAND 0
; copies a byte at a time, the latch switched between each read and write,
; with the two latch values in D' and E'.
MVCOPY:	LD	A,B		; nothing to copy: done at once
	OR	C
	JP	Z,MVOK
	CALL	IFFGET		; P/V: the interrupt state, kept with the
	DI			; flags until the end
	PUSH	AF
	EXX			; the alternate set holds the latch values
	PUSH	BC		; and the port: the caller's BC' and DE'
	PUSH	DE		; kept
	LD	C,SYSLAT
	LD	A,(LATCHV)
	LD	D,A		; the source's latch
	LD	E,A		; the destination's
	LD	A,(XMSRC)
	OR	A
	JR	Z,MV1		; source in bank 0: EXPAND 0 for it
	SET	2,D
				; the destination's bank, the same way
MV1:	LD	A,(XMDST)
	OR	A
	JR	Z,MV2
	SET	2,E
				; equal latches: both ends in one bank
MV2:	LD	A,D
	CP	E
	EXX
	JR	Z,MVLDIR	; one bank
	PUSH	HL		; the destination, kept
	LD	A,(XMDST)
	OR	A
	JR	Z,MV3		; the destination is the bank-0 end
	LD	H,D		; HL = the bank-0 end
	LD	L,E
MV3:	PUSH	DE		; the source, kept
	EX	DE,HL
	LD	HL,$8000	; 8000h less the bank-0 end
	OR	A
	SBC	HL,DE		; bytes below 8000h
	POP	DE
	JR	C,MVNONE	; the bank-0 end is at 8000h or above:
	JR	Z,MVNONE	; every byte one at a time
	SBC	HL,BC		; carry is clear
	JR	C,MV4
	LD	HL,0		; all of it is below 8000h
MV4:	ADD	HL,BC		; HL = the part below 8000h
	PUSH	HL		; BC = that part, HL = the count
	LD	H,B
	LD	L,C
	POP	BC
	OR	A
	SBC	HL,BC		; the count less that part
	LD	(MVREST),HL	; and the part in EXPAND 0
	POP	HL		; the destination again
	EXX
	LD	A,D		; one latch has the EXPAND bit, the other
	OR	E		; EXPAND 1 in view
	OUT	(C),A
	EXX
	EX	DE,HL		; LDIR copies from HL to DE
	LDIR
	EX	DE,HL
	EXX
	LD	A,D		; the bit taken out of both
	AND	E		; EXPAND 0 in view
	OUT	(C),A
	EXX
	LD	BC,(MVREST)	; the rest by the byte loop, from where
	JR	MVBYTE		; LDIR left HL and DE
MVNONE:	POP	HL		; the destination again
MVBYTE:	LD	A,B		; nothing for the byte loop: done
	OR	C
	JR	Z,MVEND
MVBL:	EXX			; the source's bank in view for the read
	OUT	(C),D
	EXX
	LD	A,(DE)
	EXX			; the destination's for the write
	OUT	(C),E
	EXX
	LD	(HL),A
	INC	HL		; forward, as LDIR, until BC is 0
	INC	DE
	DEC	BC
	LD	A,B		; the count's two bytes: 0 ends it
	OR	C
	JR	NZ,MVBL
	JR	MVEND		; the caller's latch back
MVLDIR:	EXX			; one bank: its view, and one LDIR
	OUT	(C),D
	EXX
	EX	DE,HL		; LDIR copies from HL to DE
	LDIR
	EX	DE,HL
MVEND:	LD	A,(LATCHV)	; page zero is in MAIN 0, always in view
	OUT	(SYSLAT),A
	EXX			; the caller's BC' and DE' back
	POP	DE
	POP	BC
	EXX
	POP	AF		; P/V clear (PO): interrupts were off,
				; and stay so
	JP	PO,MVOK
	EI
MVOK:	XOR	A
	RET
