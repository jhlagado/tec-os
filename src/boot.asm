; Reset, interrupt vectors, cold boot and warm boot.
;
; At reset the latch is 00h, so the first 2 KiB of this image also appear at
; 0000h. The CPU starts there, loads SP with fixed RAM, then jumps to the same
; code at its C000h alias before removing the overlay. TEC-OS never writes
; 0000h-07FFh while the overlay is on.

        ORG     $C000
RESET:  LD      SP,BOOTSTK
        DI
        JP      COLD

        DS      RST7-($-$C000),$FF
        ; RST 38h while the overlay is on. Interrupts stay disabled, so this
        ; runs only if a program executes RST 38h; it returns at once.
INT38:  EI
        RETI

ROMSIG: DB      "TEC-OS",0
ROMVERS:DW      ROMVER

; ---- Cold boot ----------------------------------------------------------------
; Entered from RESET (stack in fixed RAM) or BIOS function 0.
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
        LD      A,LATCLAS
        LD      (LATCHV),A
        CALL    RAMCHK          ; does not return without RAM at 8000h-BFFFh
        LD      HL,WSBASE       ; clear the resident workspace
        LD      DE,WSBASE+1
        LD      BC,(WSCLRN)
        LD      (HL),0
        LDIR
        LD      SP,BSTK
        CALL    CONINIT
        CALL    CONPICK
COLDCON:CALL    LCDINIT
        LD      HL,LCDBAN
        LD      B,0
        CALL    LCDROW
        LD      HL,BANNER
        CALL    PUTS
COLDRT: CALL    SDINIT
        JR      NZ,COLDERR
        CALL    MOUNT
        JR      NZ,COLDERR
        CALL    ALVINIT
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
        JP      WBOOTR
COLDERR:JP      DIAG

; ---- Warm boot ----------------------------------------------------------------
; BIOS function 1 and the JP at 0000h. Select the classic bank before the
; stack, because the BIOS stack is in that bank.
WBOOTR: DI
        LD      A,(EXPANDS)     ; without EXPAND 1 this would be the table
        CP      2
        JR      NZ,WBMAIN0
        LD      A,LATCLAS+LATEXP ; EXPAND 1: its warm-boot jump, for an
        OUT     (SYSLAT),A      ; exit from a program that left it in
        LD      A,$C3
        LD      (RAMBIOS+3),A
        LD      HL,WBOOTR
        LD      (RAMBIOS+4),HL
WBMAIN0:LD      A,LATCLAS       ; MAIN 0, EXPAND 0
        LD      (LATCHV),A
        OUT     (SYSLAT),A
        LD      SP,BSTK
        CALL    PZINIT
        CALL    CPMINIT
        CALL    HWVREL          ; a program that claimed the PICO9918 gives it back
        LD      A,(CONMOD)      ; a program may have changed the display mode
        RRCA
        CALL    C,VREST
        CALL    VTREGR          ; and left a scroll region set
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
        LD      HL,(STUBAD)
        LD      (PZBDOS+1),HL
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
        LD      BC,(CPMCLRN)
        LD      (HL),0
        LDIR
        LD      HL,DEFDMA
        LD      (CURDMA),HL
        LD      A,127
        LD      (CMDBUF),A
        LD      HL,STKGUARD
        LD      A,(GUARDN)
        LD      B,A
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
; Straight to the serial port: the console's state is in the missing RAM.
RAMBAD: LD      A,$40           ; serial idle, for the first start bit
        OUT     (DIGPORT),A
        LD      HL,RAMMSG
RAMOUT: LD      A,(HL)
        OR      A
        JR      Z,RAMSTOP
        CALL    TXBYTE
        INC     HL
        JR      RAMOUT
RAMSTOP:JR      RAMSTOP

RAMMSG: DB      13,10,"TEC-OS needs 48K RAM: none at 8000h-BFFFh",13,10,0

BANNER: DB      13,10,"TEC-OS ",VERHI+'0','.',VERLO+'0'," for TEC-1G",13,10,0
