; Cold boot, warm boot and the diagnostic console. The reset jump is in
; reset.asm.

; ---- Cold boot ---------------------------------------------------------------
; Entered from RSTENT at reset, or BIOS function 0. One entry, and
; three paths through the ROM: an ordinary exit is warm boot, below, and never
; comes here; a recognised reset keeps the selected volumes, by RSLCAP and
; RESEL; an unrecognised reset takes the card's defaults.
WSSPAN	EQU	WSEND-WSBASE-1	; the workspace, less the byte LDIR starts from

; ---- Reset entry -------------------------------------------------------------
; RESET's jump comes here, from 0000h at reset or from C000h when a program
; ends with EXPAND 1 in view: its JP 0 finds BF03h empty there and runs on
; through zeros into the ROM (B1). At reset the overlay is on and 0002h holds
; the jump's high byte; otherwise it holds the RAM BIOS's, and warm boot,
; which puts EXPAND 0 back, writes the cache's dirty lines as any exit does.
; No stack is set on entry. COLD, BIOS function 0, starts on the boot stack
; in fixed RAM and moves to STKTOP, the BDOS's, once the workspace is
; cleared; it runs on into warm boot and never returns.
RSTENT:	LD	A,($0002)	; the overlay's copy of RESET's target, or RAM's
	CP	HIGH(RSTENT)	; equal only at reset
	JP	NZ,WBOOTR	; a program's exit: keep its writes
COLD:	DI			; BIOS function 0 enters here
	LD	SP,BOOTSTK	; the boot stack, in fixed RAM below 8000h
	LD	A,LATCLAS	; overlay off, classic bank, code at C0xxh
	OUT	(SYSLAT),A
	IM	1		; a maskable interrupt is RST 38h
	CALL	RSLCAP		; before anything it reads is cleared
COLDZ:	LD	A,LATCLAS	; RSLCAP used A
	LD	HL,0		; clear page zero
	LD	DE,1
	LD	BC,$FF
	LD	(HL),L
	LDIR			; 0000h-00FFh: RSLBUF, at 0100h, is kept
	LD	(LATCHV),A	; A is still LATCLAS
	CALL	RAMCHK		; no return without RAM at 8000h-BFFFh
	LD	HL,WSBASE	; clear the resident workspace
	LD	DE,WSBASE+1
	LD	BC,WSSPAN
	LD	(HL),0
	LDIR			; to WSEND, above the RAM BIOS table
	LD	SP,STKTOP	; the workspace is there to hold it now: the
				; BDOS's stack, unused before the CCP, so that
				; the console's start and the banner keep off
				; the BIOS's (KE-173)
	CALL	CONINIT		; the serial line, keyboard and PICO9918
	CALL	RTCHAS		; the clock, once: INFO reads its bit
	JR	NZ,COLDNC	; no DS1302
	LD	HL,CONDEV
	SET	3,(HL)		; CDRTC
COLDNC:
	LD	HL,BANNER	; on the console just started
	CALL	PUTS
	CALL	MEMINIT		; the cache's lines empty, before any mount

; The card's part of cold boot, and DIAG's retry, which comes back here. It
; runs on STKTOP, the BDOS's stack, unused before the CCP runs: the mount,
; the listing and DIAG all run there, and the BIOS's stack keeps only warm
; boot's use (KE-173). LCDINIT clears the display, so CARD? goes with it,
; and a retry that fails shows it again. Mounted, it builds the vectors,
; the stub and the RAM BIOS table, lists the drives, and runs on into warm
; boot, whose PZINIT builds page zero, with drive A and user 0.
COLDRT:	LD	SP,STKTOP	; the BDOS's stack, afresh for a retry
	CALL	LCDINIT		; a blank display, CARD? gone
	LD	HL,LCDBAN	; LCDINIT's count left B = 0, the top row
	CALL	LCDROW
	CALL	SDINIT		; the card, in SPI mode
	JP	NZ,DIAG		; no card, or one that won't start
	CALL	MOUNT
	JP	NZ,DIAG		; a card with no volume to mount
	CALL	ALVINIT		; the vectors, and the stub below them
	CALL	RESEL		; a retained selection, if the card still has it
	LD	HL,(STUBAD)	; no residents yet: the TPA's top is the stub
	LD	(PZTOP),HL
	LD	HL,BIOSBAS	; the RAM BIOS table, at cold boot only: warm
	LD	DE,RAMBIOS	; boot leaves it, and any entry a program has
	LD	BC,BIOSLEN	; replaced, alone, as CP/M 2.2 does
	LDIR
	CALL	SHOWVOL		; the drives on the console
	CALL	LCDVOLS		; and A: and B: on the LCD
	XOR	A		; drive A, user 0
	LD	(PZDU),A	; then on into warm boot, which builds
				; page zero once (KE-199)

; ---- Warm boot ---------------------------------------------------------------
; BIOS function 1, the JP at 0000h, and RSTENT for a program's exit into
; C000h. Select the classic bank before the stack, because the BIOS's stack,
; BSTK, is in that bank; warm boot runs on it. Gives the PICO9918 back,
; rebuilds page zero and the CCP's and BDOS's state, puts the display mode
; and scroll region back, writes the cache's dirty lines, and enters the CCP
; with page zero's drive and user in C. Never returns.
WBOOTR:	DI			; no interrupt while page zero is rebuilt
	LD	A,LATCLAS	; EXPAND 0 in view
	LD	(LATCHV),A	; the shadow, then the latch
	OUT	(SYSLAT),A
	LD	SP,BSTK		; the BIOS's stack, now in view
	CALL	HWVREL		; a program that claimed the PICO9918 gives
				; it back first: its interrupt, an NMI, off
				; before page zero is rebuilt
	CALL	PZINIT		; the jumps, the stub and the RST vectors
	LD	HL,SVCBSY	; no INIT or REMOVE outlives a warm boot
	RES	7,(HL)
	CALL	CPMINIT		; the CCP and BDOS as a fresh load has them
	LD	A,(CONMOD)	; a program may have changed the display mode
	RRCA			; carry: an odd mode, a video display
	CALL	C,VREST		; its driver puts the mode back
	CALL	VTREGR		; and left a scroll region set
	CALL	CWBOOT		; the cache's dirty lines written
	LD	A,(PZDU)	; the drive and user, for the CCP in C
	LD	C,A
	JP	CCPENT		; the prompt; no return

; Recognise a TEC-OS of this layout from what it left in RAM, reading only, at
; fixed addresses, and running nothing old. RAM is recognised when page zero
; holds the warm boot jump to RAMBIOS+3 and a jump at 0005h, STUBAD's word S
; holds JP BENTRY, and the word W at 0006h is from 8000h up, and S or a
; page's start at most S's page. W is not compared with PZTOP: SVCLOAD
; lowers it before INIT, so the reset that recovers from a hung INIT is
; recognised too. BENTRY and STUBAD's own address are the layout's test, and
; ram.asm states the limit. Recognised, DRVTAB goes to RSLBUF, which nothing
; writes before MEMINIT, so DIAG's retry finds it. Otherwise RSLBUF's A:
; geometry is 0, which means no selection. Runs on the boot stack, clear of
; all it reads. Destroys AF, BC, DE and HL.
RSLCAP:	LD	A,($0000)	; the warm boot jump
	CP	$C3		; JP
	JR	NZ,RSLNO
	LD	HL,($0001)	; to the RAM BIOS table's warm boot entry
	LD	DE,RAMBIOS+3	; which never moves
	SBC	HL,DE		; carry is clear: the CP was equal
	JR	NZ,RSLNO	; a jump elsewhere
	LD	A,(PZBDOS)	; the jump at 0005h
	CP	$C3		; JP
	JR	NZ,RSLNO
	LD	HL,(STUBAD)	; S, the stub
	LD	A,(HL)		; S holds JP BENTRY, the layout's test
	CP	$C3
	JR	NZ,RSLNO	; no jump at S
	INC	HL
	LD	A,(HL)		; the target, low byte
	CP	LOW(BENTRY)
	JR	NZ,RSLNO
	INC	HL
	LD	A,(HL)		; and high
	CP	HIGH(BENTRY)
	JR	NZ,RSLNO	; another layout, or no BDOS behind it
	LD	HL,(PZBDOS+1)	; W, which any resident has lowered
	LD	A,H		; no service or stub goes below 8000h
	CP	$80
	JR	C,RSLNO
	LD	DE,(STUBAD)
	SBC	HL,DE		; W = S: no resident. Carry is clear
	JR	Z,RSLYES
	ADD	HL,DE		; W again
	LD	A,L		; each resident's entry is at offset 0
	OR	A
	JR	NZ,RSLNO	; W is not a page's start
	LD	A,D		; S's page, W's at most
	CP	H
	JR	C,RSLNO		; W above S's page
RSLYES:	LD	HL,DRVTAB	; recognised: the selection, for RESEL
	LD	DE,RSLBUF
	LD	BC,32		; MAXDRV*DRVESZ: all of DRVTAB
	LDIR
	RET
RSLNO:	XOR	A		; no selection: the card's defaults
	LD	(RSLBUF+6),A	; A:'s geometry, 0
	RET

; Cold boot: clear EXPAND 1, which RAMCHK found, and empty the cache's lines.
; EXPAND 1 hides the workspace and the stack in it, so nothing here touches
; the stack until EXPAND 0 is back. Destroys AF, BC, DE and HL.
MEMINIT:
	LD	A,(LATCHV)	; EXPAND 1 in view, no stack: clear it all
	OR	LATEXP
	OUT	(SYSLAT),A
	LD	HL,$8000	; 8000h-BFFFh: the lines, their table and
	LD	DE,$8001	; dirty bytes, and the history
	LD	BC,$3FFF
	LD	(HL),0
	LDIR
	LD	HL,CTAB		; the cache's lines all empty
	LD	DE,CTAB+1
	LD	BC,NLINES*4-1	; 4 bytes a line, FFFFFFFFh for no block
	LD	(HL),$FF
	LDIR
	LD	A,(LATCHV)	; EXPAND 0 back, and the stack with it
	OUT	(SYSLAT),A
	RET

; Whether latch bit A shows other RAM at HL: the complement of the byte seen
; without it is written with it set; if the byte without it is unchanged,
; there are two regions. Both bytes are put back, and no stack is used with
; the bit set. Takes LATCHV. Returns A = 1 or 2, and the latch as LATCHV.
; Destroys F, BC and DE.
DETECT:	LD	E,A		; E: the latch with the bit
	LD	A,(LATCHV)
	LD	D,A		; D: the latch as it is
	OR	E
	LD	E,A
	LD	B,(HL)		; the byte without the bit
	OUT	(SYSLAT),A	; the bit set
	LD	C,(HL)		; the byte with it, or the same one again
	LD	A,B
	CPL
	LD	(HL),A		; B's complement, written with the bit set
	LD	A,D
	OUT	(SYSLAT),A	; and clear again
	LD	A,(HL)		; the byte without the bit, after the write
	LD	(HL),B		; B back, should the write have landed here
	CP	B		; unchanged: the write went elsewhere
	LD	A,1
	RET	NZ		; one region saw the write
	LD	A,E		; two: C back in the other one
	OUT	(SYSLAT),A
	LD	(HL),C
	LD	A,D		; and the latch as it was
	OUT	(SYSLAT),A
	LD	A,2
	RET

; Rebuild the classic page-zero vectors and the BDOS entry jump, and
; put the restart vectors back as a clean boot leaves them. IOBYTE and the
; drive/user byte are left alone. Takes PZTOP, the TPA's top, and STUBAD,
; the stub's address. Runs on into PZSWP and returns as it does.
PZINIT:	LD	A,$C3		; JP, for each of the three jumps
	LD	($0000),A
	LD	HL,RAMBIOS+3	; warm boot, by the RAM BIOS table
	LD	($0001),HL
	LD	(PZBDOS),A
	LD	HL,(PZTOP)	; the lowest resident's entry, or the stub
	LD	(PZBDOS+1),HL
	LD	HL,(STUBAD)	; the stub: JP BENTRY
	LD	(HL),A
	INC	HL		; its target, low byte first
	LD	(HL),LOW(BENTRY)
	INC	HL
	LD	(HL),HIGH(BENTRY)
; The restart vectors 0008h-003Fh, here and after a service goes: each one
; that is not a jump above the top becomes seven zeros and a RET,
; so an RST through it returns at once, with the interrupt state unchanged,
; and never runs into the next vector, and 0038h takes EI; RETI. Such a jump,
; into a service, the workspace or ROM, keeps its three bytes and the rest of
; its vector is cleared. A program's vector into the TPA does not outlive it,
; one into a service's pages does not outlive the service, and a cold boot
; leaves the same bytes. Takes PZTOP. Returns carry clear. Destroys AF, BC
; and HL.
PZSWP:	LD	HL,$0008	; RST 08h's vector first
RSTCLR:	LD	BC,7*256+$C9	; seven zeros, then RET
	LD	A,(HL)
	CP	$C3		; a jump: its target decides
	JR	NZ,RSTZERO	; anything else goes
	INC	HL		; carry if the target is above the top
	LD	A,(PZTOP)
	SUB	(HL)
	INC	HL
	LD	A,(PZTOP+1)	; then the high bytes, with the borrow
	SBC	A,(HL)
	DEC	HL		; back to the vector's start
	DEC	HL
	JR	NC,RSTZERO	; into the TPA: it goes
	INC	HL		; keep JP nn, then five zeros
	INC	HL
	INC	HL
	LD	BC,4*256+0	; four zeros by B, the fifth from C
RSTZERO:
	LD	(HL),0		; B zeros
	INC	HL
	DJNZ	RSTZERO
	LD	(HL),C		; then C: RET, or 0 after a kept jump
	INC	HL
	LD	A,L		; the next vector, up to 0040h
	CP	$40
	JR	NZ,RSTCLR
	LD	A,(RST7)
	CP	$C3
	RET	Z		; a kept jump at 0038h
	XOR	A
	LD	(RST7+7),A	; zeros after EI; RETI, as a clean boot has
	LD	HL,$4DED	; RETI after EI
	LD	(RST7+1),HL
	LD	A,$FB		; EI
	LD	(RST7),A
	RET

; The stack guard's bytes.
STKGN	EQU	STKGUEND-STKGUARD

; Reset the CCP and BDOS writable state as a fresh disk load would: zeros
; from CCPCLR to BDOSRME, the BDOS's stack at STKTOP among them; the DMA at
; 0080h; the command buffer's size; and the stack guard's pattern. The
; command line, below CCPCLR, is kept for a chained line's next piece.
; BUFOK goes to 0, so BWRITE's key from before the warm boot (GETKEY) no
; longer lets a block be cleared rather than read. Runs on the BIOS's
; stack, outside the span it clears. Destroys AF, BC, DE and HL.
CPMINIT:
	LD	HL,CCPCLR	; zeros from CCPCLR to BDOSRME
	LD	DE,CCPCLR+1
	LD	BC,BDOSRME-CCPCLR-1
	LD	(HL),0
	LDIR
	LD	HL,DEFDMA	; the DMA at 0080h, as CP/M starts
	LD	(CURDMA),HL
	LD	A,127		; the longest line the CCP's buffer takes
	LD	(CMDBUF),A
	LD	HL,STKGUARD	; between the CCP's scratch and its stack
	LD	B,STKGN		; each guard byte gets the pattern a check reads
CPMIG:	LD	(HL),$A5
	INC	HL
	DJNZ	CPMIG
	XOR	A		; BUFOK 0: BWRITE's key gone
	LD	(BUFOK),A
	RET

; ---- RAM check ---------------------------------------------------------------
; TEC-OS needs 64K: RAM at 8000h-BFFFh, where the resident workspace and the
; CP/M stacks live, and EXPAND 1 behind it, the cache's and the history's. One
; check, before the banner. Write both ends of the window before reading
; either, so a floating bus cannot hand back the byte just written; then look
; for EXPAND 1 at 8000h. Without either, report on the serial port and stop:
; TXBYTE reads nothing above 8000h, and the workspace, CONDEV with it, is not
; cleared yet. The boot stack is in fixed RAM. Returns only with 64K.
; Destroys AF, BC, DE and HL.
RAMCHK:	LD	DE,$55AA	; one pattern, then its complement
	CALL	RAMPAT
	LD	DE,$AA55
	CALL	RAMPAT
	LD	A,LATEXP	; and EXPAND 1 behind the window
	LD	HL,DETEXP
	CALL	DETECT
	CP	2		; two regions at 8000h
	RET	Z		; 64K
	JR	RAMBAD		; the window alone, no EXPAND 1

; Write D at 8000h and E at BFFFh, then read both back. Returns if both
; held; otherwise goes to RAMBAD, which never returns. Destroys AF and HL.
RAMPAT:	LD	HL,$8000
	LD	(HL),D		; both ends written
	LD	A,E
	LD	($BFFF),A
	LD	A,(HL)		; before either is read back
	CP	D
	JR	NZ,RAMBAD	; 8000h did not hold it
	LD	A,($BFFF)
	CP	E
	RET	Z		; both held
; RAMMSG straight to the serial port, which needs nothing above 8000h, and
; stop for good.
RAMBAD:	LD	HL,RAMMSG
	LD	A,$40		; serial idle, for the first start bit
	OUT	(DIGPORT),A
RAMOUT:	LD	A,(HL)		; each byte, up to the zero
	OR	A
	JR	Z,RAMSTOP	; the message sent
	CALL	TXBYTE
	INC	HL
	JR	RAMOUT
RAMSTOP:
	JR	RAMSTOP		; nothing more runs

; Print the mounted drives: letter and label, and (read-only) for a volume
; so flagged, a line each. Runs at cold boot, before the CCP. Destroys AF,
; BC, DE, HL and IX.
SHOWVOL:
	LD	C,0		; each mounted drive, in drive order
SHV:	PUSH	BC		; the drive, across the printing
	CALL	DRVDESC		; IX at its volume's descriptor
	JR	NZ,SHVN		; none on this drive
	LD	HL,CMDTXT	; letter and label, in the CCP's line,
	CALL	DRVLAB		; free before the CCP has run; not in
	LD	HL,CMDTXT	; LINEBUF, where the terminal's scroll
	CALL	PUTS		; puts a row while PUTS prints it
	LD	A,(IX+DFLAGS)	; the volume's flags
	AND	DFREAD
	JR	Z,SHVRW		; writable: no note
	LD	HL,ROTXT
	CALL	PUTS
SHVRW:	CALL	PUTCRLF
SHVN:	POP	BC
	INC	C		; the next drive, up to MAXDRV
	LD	A,C
	CP	MAXDRV
	JR	C,SHV
	RET

; Pack the allocation vectors down from WSBASE, in drive order, and put
; each one's address in its DPH. A format 1.1 card that asks for N drives
; gets a G8M-sized slot (256 bytes) for each of drives 0 to N-1, mounted or
; not, so any drive may later take any volume; any other card gets a slot
; for each mounted drive, DSM / 8 + 1 bytes, as before. DRVSLOT records what
; each slot holds. The BDOS entry jump goes directly below them. Takes
; MOUNT's drive table and MNTDRV. Returns STUBAD at the jump's place.
; Destroys AF, BC, DE and HL.
ALVINIT:
	LD	HL,WSBASE	; the vectors end at WSBASE
	LD	(STUBAD),HL	; the lowest vector so far
	LD	C,0		; drive A first
ALVNX:	LD	A,C		; HL = the DPH's DPB word, at +10
	CALL	DPHADR		; the drive's DPH; C kept
	LD	DE,10
	ADD	HL,DE
	PUSH	HL		; for the ALV word, four bytes on
	LD	A,(MNTDRV)	; format 1.1: the drives wanted
	OR	A
	JR	Z,ALV10		; a 1.0 card: only drives mounted
	LD	B,A
	LD	A,C
	CP	B
	JR	NC,ALVNO	; past the drives asked for
	LD	DE,256		; a G8M slot, mounted or not
	JR	ALVPUT
ALV10:	LD	A,C
	CALL	DRVENT		; the drive's geometry byte
	LD	A,(HL)
	OR	A
	JR	Z,ALVNO		; not mounted
	POP	HL		; the DPB's address, from the DPH
	PUSH	HL
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	LD	HL,5		; DSM
	ADD	HL,DE
	LD	E,(HL)
	INC	HL
	LD	D,(HL)		; DE = DSM
	LD	B,3		; a bit a block: DSM / 8 + 1 bytes
ALVSH:	SRL	D
	RR	E
	DJNZ	ALVSH
	INC	DE
ALVPUT:	LD	HL,DRVSLOT	; 1 for 64 bytes, 2 for 256
	LD	B,0		; the drive's entry, DRVSLOT + C
	ADD	HL,BC
	LD	A,D		; D: 1 for 256 bytes, else 0
	INC	A
	LD	(HL),A
	LD	HL,(STUBAD)	; the slot goes below the last
	OR	A
	SBC	HL,DE
	LD	(STUBAD),HL
	EX	DE,HL		; DE: the vector's address
	POP	HL
	INC	HL		; the ALV word, at +14
	INC	HL
	INC	HL
	INC	HL
	LD	(HL),E		; the DPH points at its vector
	INC	HL
	LD	(HL),D
	JR	ALVSKP
ALVNO:	POP	HL		; no slot: the DPH's word dropped
ALVSKP:	INC	C		; the next drive, up to MAXDRV
	LD	A,C
	CP	MAXDRV
	JR	C,ALVNX
	LD	HL,(STUBAD)
	DEC	HL		; the JP, below the lowest vector
	DEC	HL
	DEC	HL
	LD	(STUBAD),HL
	RET

; Diagnostic console, entered by a jump from COLDRT when the card or
; container cannot be mounted. A = error code: SDE* (01h-0Fh) from the SD
; driver or ME* (20h-2Fh) from the mount checks. Shows CARD? on the LCD and
; the code on the console, then asks until R, which retries from COLDRT.
; The console stays usable without a card. Runs on STKTOP, the BDOS's
; stack, which COLDRT set and both its jumps here leave at its top, so the
; BIOS's keeps only warm boot's use (KE-173); a retry sets it afresh.
; Never returns.
DIAG:	PUSH	AF		; the code, kept across the messages
	LD	HL,DGCARD	; the LCD, for a board with no terminal
	CALL	LCD3		; CARD? on row 3
	LD	HL,DGERR	; and the message on the console
	CALL	PUTS
	POP	AF
	CALL	PUTHEX		; the code on the console
	CALL	PUTCRLF
DGLOOP:	LD	HL,DGPROM	; ask until the key is one of ours
	CALL	PUTS
	CALL	BCONIN		; wait for a key
	PUSH	AF
	CALL	PUTA		; echo it as typed, on a line of its own
	CALL	PUTCRLF
	POP	AF
	AND	$DF		; upper case, for the test alone (KE-195)
	CP	'R'
	JP	Z,COLDRT	; retry: LCD, card and mount from the start
	JR	DGLOOP		; any other key: the prompt again
