; Cold boot and warm boot. The reset jump is in reset.asm.

; ---- Cold boot ----------------------------------------------------------------
; Entered from RESET, at 0000h at reset, or BIOS function 0. One entry, and
; three paths through the ROM: an ordinary exit is warm boot, below, and never
; comes here; a recognised reset keeps the selected volumes, by RSLCAP and
; RESEL; an unrecognised reset takes the card's defaults.
WSSPAN	EQU	WSEND-WSBASE-1	; the workspace, less the byte LDIR starts from
COLD:	DI
	LD	SP,BOOTSTK
	LD	A,LATCLAS	; overlay off, classic bank, code at C0xxh
	OUT	(SYSLAT),A
	IM	1
	CALL	RSLCAP		; before anything it reads is cleared
COLDZ:	LD	A,LATCLAS	; RSLCAP used A
	LD	HL,0		; clear page zero
	LD	DE,1
	LD	BC,$FF
	LD	(HL),L
	LDIR
	LD	(LATCHV),A	; A is still LATCLAS
	CALL	RAMCHK		; no return without RAM at 8000h-BFFFh
	LD	HL,WSBASE	; clear the resident workspace
	LD	DE,WSBASE+1
	LD	BC,WSSPAN
	LD	(HL),0
	LDIR
	LD	SP,BSTK		; the workspace is there to hold it now
	CALL	CONINIT
	LD	HL,BANNER
	CALL	PUTS
; DIAG's retry comes back here. LCDINIT clears the display, so CARD? goes
; with it, and a retry that fails shows it again.
COLDRT:	CALL	LCDINIT		; a blank display, CARD? gone
	LD	HL,LCDBAN	; LCDINIT's count left B = 0, the top row
	CALL	LCDROW
	CALL	SDINIT
	JP	NZ,DIAG		; no card, or one that won't start
	CALL	MOUNT
	JP	NZ,DIAG		; a card with no volume to mount
	CALL	ALVINIT
	CALL	RESEL		; a retained selection, if the card still has it
	LD	HL,(STUBAD)	; no residents yet
	LD	(PZTOP),HL
	LD	HL,BIOSBAS	; the RAM BIOS table, at cold boot only: warm
	LD	DE,RAMBIOS	; boot leaves it, and any entry a program has
	LD	BC,BIOSLEN	; replaced, alone, as CP/M 2.2 does
	LDIR
	CALL	SHOWVOL
	CALL	LCDVOLS
	XOR	A		; drive A, user 0
	LD	(PZDU),A
	CALL	PZINIT
	CALL	MEMINIT		; then on into warm boot

; ---- Warm boot ----------------------------------------------------------------
; BIOS function 1 and the JP at 0000h. Select the classic bank before the
; stack, because the BIOS stack is in that bank.
WBOOTR: DI
        LD      A,LATCLAS+LATEXP ; EXPAND 1: its warm-boot jump, for an
        OUT     (SYSLAT),A      ; exit from a program that left it in
        LD      A,$C3
        LD      (RAMBIOS+3),A
        LD      HL,WBOOTR
        LD      (RAMBIOS+4),HL
        LD      A,LATCLAS       ; MAIN 0, EXPAND 0
        LD      (LATCHV),A
        OUT     (SYSLAT),A
        LD      SP,BSTK
        CALL    PZINIT
	LD	HL,SVCBSY	; no INIT or REMOVE outlives a warm boot
        RES     7,(HL)
        CALL    CPMINIT
        CALL    HWVREL          ; a program that claimed the PICO9918 gives it back
        LD      A,(CONMOD)      ; a program may have changed the display mode
        RRCA
        CALL    C,VREST
        CALL    VTREGR          ; and left a scroll region set
        CALL    CWBOOT          ; the cache's dirty lines written
        LD      A,(PZDU)
        LD      C,A
        JP      CCPENT

; Recognise a TEC-OS of this layout from what it left in RAM, reading only, at
; fixed addresses, and running nothing old. RAM is recognised when page zero
; holds the warm boot jump to RAMBIOS+3 and a jump at 0005h, STUBAD's word S
; is an xx06h address holding JP BENTRY, and the word W at 0006h is an xx06h
; address from 8000h to S. W is not compared with PZTOP: SVCLOAD lowers it
; before INIT, so the reset that recovers from a hung INIT is recognised too.
; BENTRY and STUBAD's own address are the layout's test, and ram.asm states
; the limit. Recognised, DRVTAB goes to RSLBUF, which nothing writes before
; MEMINIT, so DIAG's retry finds it. Otherwise RSLBUF's A: geometry is 0,
; which means no selection. Runs on the boot stack, clear of all it reads.
; Destroys AF, BC, DE and HL.
RSLCAP:	LD	A,($0000)	; the warm boot jump
	CP	$C3		; JP
	JR	NZ,RSLNO
	LD	HL,($0001)	; to the RAM BIOS table's warm boot entry
	LD	DE,RAMBIOS+3	; which never moves
	SBC	HL,DE		; carry is clear: the CP was equal
	JR	NZ,RSLNO
	LD	A,(PZBDOS)	; the jump at 0005h
	CP	$C3		; JP
	JR	NZ,RSLNO
	LD	HL,(STUBAD)	; S, the stub
	LD	A,L		; on a page's offset 6, as ALVINIT puts it
	CP	6
	JR	NZ,RSLNO
	LD	E,H		; its page, W's upper limit
	LD	A,(HL)		; S holds JP BENTRY, the layout's test
	CP	$C3
	JR	NZ,RSLNO
	INC	HL
	LD	A,(HL)		; the target, low byte
	CP	LOW(BENTRY)
	JR	NZ,RSLNO
	INC	HL
	LD	A,(HL)		; and high
	CP	HIGH(BENTRY)
	JR	NZ,RSLNO
	LD	HL,(PZBDOS+1)	; W, which any resident has lowered
	LD	A,L		; each resident's JP is at offset 6
	CP	6
	JR	NZ,RSLNO
	LD	A,H		; no service goes below 8000h
	CP	$80
	JR	C,RSLNO
	LD	A,E		; S's page, W's at most
	CP	H
	JR	C,RSLNO
RSLYES:	LD	HL,DRVTAB	; recognised: the selection, for RESEL
	LD	DE,RSLBUF
	LD	BC,32		; MAXDRV*DRVESZ: all of DRVTAB
	LDIR
	RET
RSLNO:	XOR	A		; no selection: the card's defaults
	LD	(RSLBUF+6),A
	RET

; Cold boot: count the MAIN and EXPAND regions, and give MAIN 1 a copy of
; page zero. MAIN 1's 0000h then reaches the RAM BIOS table in EXPAND 0, so
; an exit from MAIN 1 warm boots into MAIN 0.
MEMINIT:LD      A,LATEXP
        LD      HL,DETEXP
        CALL    DETECT
        LD      (EXPANDS),A
        CP      2
        JP      NZ,RAMBAD       ; no EXPAND 1: TEC-OS needs 64K
        LD      A,E             ; EXPAND 1 in view, no stack: clear it all
        OUT     (SYSLAT),A
        LD      HL,$8000
        LD      DE,$8001
        LD      BC,$3FFF
        LD      (HL),0
        LDIR
        LD      HL,CTAB         ; the cache's lines all empty
        LD      DE,CTAB+1
        LD      BC,NLINES*4-1
        LD      (HL),$FF
        LDIR
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        LD      A,XMLOW         ; EXPAND 1 is TEC-OS's: the reserved page,
	LD	(XMARK),A	; the history at HRING and the cache, fixed:
				; MOVE has no range in it
        LD      A,LATMAIN
        LD      HL,DETADR
        CALL    DETECT
        LD      (MAINS),A
        CP      2
        RET     NZ
        LD      HL,0
MNCOPY: LD      A,D
        OUT     (SYSLAT),A
        LD      C,(HL)
        LD      A,E
        OUT     (SYSLAT),A
        LD      (HL),C
        INC     L
        JR      NZ,MNCOPY
        LD      A,D
        OUT     (SYSLAT),A
        RET

; Whether latch bit A shows other RAM at HL: the complement of the byte seen
; without it is written with it set; if the byte without it is unchanged,
; there are two regions. Both bytes are put back, and no stack is used with
; the bit set. Returns A = 1 or 2, D = the latch without the bit, E = with.
DETECT: LD      E,A
        LD      A,(LATCHV)
        LD      D,A
        OR      E
        LD      E,A
        LD      B,(HL)          ; the byte without the bit
        OUT     (SYSLAT),A
        LD      C,(HL)          ; the byte with it, or the same one again
        LD      A,B
        CPL
        LD      (HL),A
        LD      A,D
        OUT     (SYSLAT),A
        LD      A,(HL)
        LD      (HL),B
        CP      B
        LD      A,1
        RET     NZ              ; one region saw the write
        LD      A,E
        OUT     (SYSLAT),A
        LD      (HL),C
        LD      A,D
        OUT     (SYSLAT),A
        LD      A,2
        RET

; Rebuild the classic page-zero vectors and the BDOS entry jump, and
; put the restart vectors back as a clean boot leaves them. IOBYTE and the
; drive/user byte are left alone.
PZINIT: LD      A,$C3
        LD      ($0000),A
        LD      HL,RAMBIOS+3
        LD      ($0001),HL
        LD      (PZBDOS),A
        LD      HL,(PZTOP)      ; the lowest resident's entry, or the stub
        LD      (PZBDOS+1),HL
        LD      HL,(STUBAD)
        LD      (HL),A
        INC     HL
        LD      (HL),LOW(BENTRY)
        INC     HL
        LD      (HL),HIGH(BENTRY)
        LD      HL,$4DED        ; RETI after EI at 0038h
        LD      (RST7+1),HL
        LD      A,$FB
        LD      (RST7),A
; The restart vectors 0008h-0037h: each one that is not a jump into ROM
; becomes seven zeros and a RET, so an RST through it returns at once, with
; the interrupt state unchanged, and never runs into the next vector. A jump
; into ROM keeps its three bytes and the rest of its vector is cleared. A
; program's vector into the TPA does not outlive it, and a cold boot leaves
; the same bytes.
        LD      HL,$0008
RSTCLR: LD      BC,7*256+$C9    ; seven zeros, then RET
        LD      A,(HL)
        CP      $C3
        JR      NZ,RSTZERO
        INC     HL
        INC     HL
        LD      A,(HL)          ; the target's high byte
        DEC     HL
        DEC     HL
        CP      $C0
        JR      C,RSTZERO
        INC     HL              ; keep JP nn into ROM, then five zeros
        INC     HL
        INC     HL
        LD      BC,4*256+0
RSTZERO:LD      (HL),0
        INC     HL
        DJNZ    RSTZERO
        LD      (HL),C
        INC     HL
        LD      A,L
        CP      $38
        JR      NZ,RSTCLR
        RET

; The stack guard's bytes.
STKGN	EQU	STKGUEND-STKGUARD

; Reset the CCP and BDOS writable state as a fresh disk load would, and
; forget the deblocking buffer so a changed card is reread. The command line,
; below CCPCLR, is kept for a chained line's next piece.
CPMINIT:LD      HL,CCPCLR
        LD      DE,CCPCLR+1
        LD      BC,BDOSRME-CCPCLR-1
        LD      (HL),0
        LDIR
        LD      HL,DEFDMA
        LD      (CURDMA),HL
        LD      A,127
        LD      (CMDBUF),A
        LD      HL,STKGUARD
	LD	B,STKGN		; each guard byte gets the pattern a check reads
CPMIG:	LD	(HL),$A5
	INC	HL
	DJNZ	CPMIG
        XOR     A
        LD      (BUFOK),A
        RET

;---- RAM check -----------------------------------------------------------------
; TEC-OS needs RAM at 8000h-BFFFh: the resident workspace and the CP/M stacks
; live there. Write both ends of the window before reading either, so a
; floating bus cannot hand back the byte just written. Without that RAM,
; report on the serial console (CONDEV is still 0) and stop. The boot stack
; is in fixed RAM.
RAMCHK: LD      DE,$55AA
        CALL    RAMPAT
        LD      DE,$AA55
RAMPAT: LD      HL,$8000
        LD      (HL),D
        LD      A,E
        LD      ($BFFF),A
        LD      A,(HL)
        CP      D
        JR      NZ,RAMBAD
        LD      A,($BFFF)
        CP      E
        RET     Z
; Straight to the serial port, which needs nothing above 8000h.
RAMBAD: LD      HL,RAMMSG
        LD      A,$40           ; serial idle, for the first start bit
        OUT     (DIGPORT),A
RAMOUT: LD      A,(HL)
        OR      A
        JR      Z,RAMSTOP
        CALL    TXBYTE
        INC     HL
        JR      RAMOUT
RAMSTOP:JR      RAMSTOP
