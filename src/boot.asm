; Cold boot, warm boot and the diagnostic console. The reset jump is in
; reset.asm.

; ---- Cold boot ----------------------------------------------------------------
; Entered from RSTENT at reset, or BIOS function 0. One entry, and
; three paths through the ROM: an ordinary exit is warm boot, below, and never
; comes here; a recognised reset keeps the selected volumes, by RSLCAP and
; RESEL; an unrecognised reset takes the card's defaults.
WSSPAN	EQU	WSEND-WSBASE-1	; the workspace, less the byte LDIR starts from

; ---- Reset entry ----------------------------------------------------------------
; RESET's jump comes here, from 0000h at reset or from C000h when a program
; ends with EXPAND 1 in view: its JP 0 finds BF03h empty there and runs on
; through zeros into the ROM (B1). At reset the overlay is on and 0002h holds
; the jump's high byte; otherwise it holds the RAM BIOS's, and warm boot,
; which puts EXPAND 0 back, writes the cache's dirty lines as any exit does.
RSTENT:	LD	A,($0002)	; the overlay's copy of RESET's target, or RAM's
	CP	HIGH(RSTENT)	; equal only at reset
	JP	NZ,WBOOTR	; a program's exit: keep its writes
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
	CALL	RTCHAS		; the clock, once: INFO reads its bit
	JR	NZ,COLDNC
	LD	HL,CONDEV
	SET	3,(HL)		; CDRTC
COLDNC:
	LD	HL,BANNER
	CALL	PUTS
	CALL	MEMINIT		; the cache's lines empty, before any mount
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
	CALL	PZINIT		; then on into warm boot

; ---- Warm boot ----------------------------------------------------------------
; BIOS function 1 and the JP at 0000h. Select the classic bank before the
; stack, because the BIOS stack is in that bank.
WBOOTR: DI
        LD      A,LATCLAS       ; EXPAND 0 in view
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
; holds JP BENTRY, and the word W at 0006h is from 8000h up, and S or a page's
; start at most S's page. W is not compared with PZTOP: SVCLOAD lowers it before INIT,
; so the reset that recovers from a hung INIT is recognised too.
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
	LD	A,H		; no service or stub goes below 8000h
	CP	$80
	JR	C,RSLNO
	LD	DE,(STUBAD)
	SBC	HL,DE		; W = S: no resident. Carry is clear
	JR	Z,RSLYES
	ADD	HL,DE
	LD	A,L		; each resident's entry is at offset 0
	OR	A
	JR	NZ,RSLNO
	LD	A,D		; S's page, W's at most
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

; Cold boot: clear EXPAND 1, which RAMCHK found, and empty the cache's lines.
MEMINIT:LD	A,(LATCHV)	; EXPAND 1 in view, no stack: clear it all
	OR	LATEXP
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
        RET

; Whether latch bit A shows other RAM at HL: the complement of the byte seen
; without it is written with it set; if the byte without it is unchanged,
; there are two regions. Both bytes are put back, and no stack is used with
; the bit set. Returns A = 1 or 2.
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
; The restart vectors 0008h-003Fh, here and after a service goes: each one
; that is not a jump above the top becomes seven zeros and a RET,
; so an RST through it returns at once, with the interrupt state unchanged,
; and never runs into the next vector, and 0038h takes EI; RETI. Such a jump,
; into a service, the workspace or ROM, keeps its three bytes and the rest of
; its vector is cleared. A program's vector into the TPA does not outlive it,
; one into a service's pages does not outlive the service, and a cold boot
; leaves the same bytes. Carry clear.
PZSWP:  LD      HL,$0008
RSTCLR: LD      BC,7*256+$C9    ; seven zeros, then RET
        LD      A,(HL)
        CP      $C3
        JR      NZ,RSTZERO
        INC     HL              ; carry if the target is above the top
        LD      A,(PZTOP)
        SUB     (HL)
        INC     HL
        LD      A,(PZTOP+1)
        SBC     A,(HL)
        DEC     HL
        DEC     HL
        JR      NC,RSTZERO
        INC     HL              ; keep JP nn, then five zeros
        INC     HL
        INC     HL
        LD      BC,4*256+0
RSTZERO:LD      (HL),0
        INC     HL
        DJNZ    RSTZERO
        LD      (HL),C
        INC     HL
        LD      A,L
        CP      $40
        JR      NZ,RSTCLR
        LD      A,(RST7)
        CP      $C3
        RET     Z               ; a kept jump at 0038h
        XOR     A
        LD      (RST7+7),A      ; zeros after EI; RETI, as a clean boot has
        LD      HL,$4DED        ; RETI after EI
        LD      (RST7+1),HL
        LD      A,$FB
        LD      (RST7),A
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
; TEC-OS needs 64K: RAM at 8000h-BFFFh, where the resident workspace and the
; CP/M stacks live, and EXPAND 1 behind it, the cache's and the history's. One
; check, before the banner. Write both ends of the window before reading
; either, so a floating bus cannot hand back the byte just written; then look
; for EXPAND 1 at 8000h. Without either, report on the serial console (CONDEV
; is still 0) and stop. The boot stack is in fixed RAM.
RAMCHK: LD      DE,$55AA
        CALL    RAMPAT
        LD      DE,$AA55
	CALL	RAMPAT
	LD	A,LATEXP	; and EXPAND 1 behind the window
	LD	HL,DETEXP
	CALL	DETECT
	CP	2
	RET	Z		; 64K
	JR	RAMBAD
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

; Print the mounted drives: letter and label.
SHOWVOL:LD      C,0             ; each mounted drive, in drive order
SHV:    PUSH    BC
        CALL    DRVDESC
        JR      NZ,SHVN
	LD	HL,CMDTXT	; letter and label, in the CCP's line,
	CALL	DRVLAB		; free at cold boot, before the CCP
	LD	HL,CMDTXT	; has run; LINEBUF is the terminal's
	CALL	PUTS
        LD      A,(IX+DFLAGS)
        AND     DFREAD
        JR      Z,SHVRW
        LD      HL,ROTXT
        CALL    PUTS
SHVRW:  CALL    PUTCRLF
SHVN:   POP     BC
        INC     C
        LD      A,C
        CP      MAXDRV
        JR      C,SHV
        RET

; Pack the allocation vectors down from WSBASE, in drive order, and put
; each one's address in its DPH. A format 1.1 card that asks for N drives
; gets a G8M-sized slot (256 bytes) for each of drives 0 to N-1, mounted or
; not, so any drive may later take any volume; any other card gets a slot
; for each mounted drive, DSM / 8 + 1 bytes, as before. DRVSLOT records what
; each slot holds. The BDOS entry jump goes directly below them.
ALVINIT:LD      HL,WSBASE
        LD      (STUBAD),HL     ; the lowest vector so far
        LD      C,0
ALVNX:  LD      A,C             ; HL = the DPH's DPB word, at +10
	CALL	DPHADR		; the drive's DPH; C kept
	LD	DE,10
	ADD	HL,DE
        PUSH    HL
        LD      A,(MNTDRV)
        OR      A
        JR      Z,ALV10
        LD      B,A
        LD      A,C
        CP      B
        JR      NC,ALVNO
        LD      DE,256
        JR      ALVPUT
ALV10:  LD      A,C
        CALL    DRVENT
        LD      A,(HL)
        OR      A
        JR      Z,ALVNO         ; not mounted
        POP     HL
        PUSH    HL
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      HL,5            ; DSM
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      B,3
ALVSH:  SRL     D
        RR      E
        DJNZ    ALVSH
        INC     DE
ALVPUT: LD      HL,DRVSLOT      ; 1 for 64 bytes, 2 for 256
        LD      B,0
        ADD     HL,BC
        LD      A,D
        INC     A
        LD      (HL),A
        LD      HL,(STUBAD)
        OR      A
        SBC     HL,DE
        LD      (STUBAD),HL
        EX      DE,HL
        POP     HL
        INC     HL              ; the ALV word, at +14
        INC     HL
        INC     HL
        INC     HL
        LD      (HL),E
        INC     HL
        LD      (HL),D
        JR      ALVSKP
ALVNO:  POP     HL
ALVSKP: INC     C
        LD      A,C
        CP      MAXDRV
        JR      C,ALVNX
        LD      HL,(STUBAD)
        DEC     HL              ; the JP, below the lowest vector
        DEC     HL
        DEC     HL
        LD      (STUBAD),HL
        RET

; Diagnostic console, entered when the card or container cannot be mounted.
; A = error code: SDE* (01h-0Fh) from the SD driver or ME* (20h-2Fh) from
; the mount checks. The console stays usable without a card.

DIAG:	LD	SP,BSTK		; the stack the failed mount may have left deep
	PUSH	AF		; the code, kept across the messages
	LD	HL,DGCARD	; the LCD, for a board with no terminal
	CALL	LCD3
	LD	HL,DGERR
	CALL	PUTS
	POP	AF
	CALL	PUTHEX		; the code on the console
	CALL	PUTCRLF
DGLOOP:	LD	HL,DGPROM	; ask until the key is one of ours
	CALL	PUTS
	CALL	BCONIN
	AND	$DF		; upper case
	PUSH	AF
	CALL	PUTA		; echo it, on a line of its own
	CALL	PUTCRLF
	POP	AF
	CP	'R'
	JP	Z,COLDRT	; retry: LCD, card and mount from the start
	JR	DGLOOP		; any other key: the prompt again
