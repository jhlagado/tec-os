; Cold boot and warm boot. The reset jump is in reset.asm.

; ---- Cold boot ----------------------------------------------------------------
; Entered from RESET, at 0000h at reset, or BIOS function 0.
COLD:   DI
        LD      SP,BOOTSTK
        LD      A,LATCLAS
        OUT     (SYSLAT),A      ; overlay off, classic bank; execution is at C0xxh
        IM      1
        LD      HL,0            ; clear page zero
        LD      DE,1
        LD      BC,$FF
        LD      (HL),L
        LDIR
        LD      (LATCHV),A
        CALL    RAMCHK          ; does not return without RAM at 8000h-BFFFh
        LD      HL,WSBASE       ; clear the resident workspace
        LD      DE,WSBASE+1
        LD      BC,WSEND-WSBASE-1
        LD      (HL),0
        LDIR
        LD      SP,BSTK
        CALL    CONINIT
        LD      HL,BANNER
        CALL    PUTS
; DIAG's retry comes back here. LCDINIT clears the display, so CARD? goes
; with it, and a retry that fails shows it again.
COLDRT:	CALL	LCDINIT		; a blank display, CARD? gone
	LD	HL,LCDBAN	; LCDINIT's count left B = 0, the top row
	CALL	LCDROW
	CALL	SDINIT
	JP	NZ,DIAG		; no card, or one that won't start
	CALL	MOUNT
	JP	NZ,DIAG		; a card with no volume to mount
        CALL    ALVINIT
        LD      HL,(STUBAD)     ; no residents yet
        LD      (PZTOP),HL
        LD      HL,BIOSBAS      ; the RAM BIOS table, at cold boot only: warm
        LD      DE,RAMBIOS      ; boot leaves it, and any entry a program has
        LD      BC,BIOSLEN      ; replaced, alone, as CP/M 2.2 does
        LDIR
        CALL    SHOWVOL
        CALL    LCDVOLS
        XOR     A               ; drive A, user 0
        LD      (PZDU),A
        CALL    PZINIT
        CALL    MEMINIT

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
        LD      HL,CCPLVL       ; the window shuts
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
        LD      (XMARK),A       ; the level records at LVBASE and the history
                                ; at HRING, fixed; MOVE has no range in it
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

; Reset the CCP and BDOS writable state as a fresh disk load would, and
; forget the deblocking buffer so a changed card is reread.
CPMINIT:LD      HL,CCPRAM
        LD      DE,CCPRAM+1
        LD      BC,BDOSRME-CCPRAM-1
        LD      (HL),0
        LDIR
        LD      HL,DEFDMA
        LD      (CURDMA),HL
        LD      A,127
        LD      (CMDBUF),A
        LD      HL,STKGUARD
        LD      B,STKGUEND-STKGUARD
CPMIG:  LD      (HL),$A5
        INC     HL
        DJNZ    CPMIG
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
