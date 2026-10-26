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

        DS      NMIVEC-($-$C000),$FF
        ; NMI while the overlay is on: return with no stack use beyond the
        ; return address the CPU pushed.
NMIROM: RETN

ROMSIG: DB      "TEC-OS",0
ROMVERS:DW      ROMVER

; ---- Cold boot ----------------------------------------------------------------
; Entered from RESET (stack in fixed RAM) or BIOS function 0.
COLD:   DI
        LD      SP,BOOTSTK
        LD      A,LATCLAS
        OUT     (SYSLAT),A      ; overlay off, classic bank; execution is at C0xxh
        IM      1
        LD      HL,$45ED        ; RETN at 0066h before anything else in page
        LD      (NMIVEC),HL     ; zero changes: an NMI may arrive at any time
        LD      HL,0            ; clear the rest of page zero
        LD      DE,1
        LD      BC,NMIVEC-1
        LD      (HL),L
        LDIR
        LD      HL,NMIVEC+2
        LD      DE,NMIVEC+3
        LD      BC,$FF-NMIVEC-2
        LD      (HL),L
        LDIR
        LD      A,LATCLAS
        LD      (LATCHV),A
        CALL    RAMCHK          ; does not return without RAM at 8000h-BFFFh
        LD      HL,TPATOP       ; clear the resident workspace
        LD      DE,TPATOP+1
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
        CALL    SHOWVOL
        CALL    LCDVOLS
        XOR     A               ; drive A, user 0
        LD      (PZDU),A
        CALL    PZINIT
        CALL    LOWINIT
        JP      WBOOTR
COLDERR:JP      DIAG

; ---- Warm boot ----------------------------------------------------------------
; BIOS function 1 and the JP at 0000h. Select the classic bank before the
; stack, because the BIOS stack is in that bank.
WBOOTR: DI
        LD      HL,$45ED        ; the program that ended may have used 0066h
        LD      (NMIVEC),HL
        LD      A,LATCLAS+LATEXP ; U9 half 1: its warm-boot jump, for an
        OUT     (SYSLAT),A      ; exit from a program that left it in
        LD      A,$C3
        LD      (RAMBIOS+3),A
        LD      HL,WBOOTR
        LD      (RAMBIOS+4),HL
        LD      A,LATCLAS       ; low page 0, U9 half 0
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

; Cold boot: count the low pages, and give low page 1 a copy of page zero.
; With LOWPAGE set, the complement of page 0's byte at DETADR is written; if
; page 0 then still holds its own byte, a second page is fitted. Both bytes
; are put back. The copy switches the latch for every byte and uses no stack,
; and gives page 1 its NMI vector first. Page 1's 0000h then reaches the RAM
; BIOS table in the window, so an exit from page 1 warm boots into page 0.
LOWINIT:LD      A,(LATCHV)
        LD      D,A             ; page 0
        OR      LATLOW1
        LD      E,A             ; page 1
        LD      HL,DETADR
        LD      B,(HL)          ; page 0's byte
        OUT     (SYSLAT),A
        LD      C,(HL)          ; page 1's byte, or page 0's again
        LD      A,B
        CPL
        LD      (HL),A
        LD      A,D
        OUT     (SYSLAT),A
        LD      A,(HL)
        LD      (HL),B
        CP      B
        LD      A,1
        JR      NZ,PGSET        ; page 0 saw the write: one page
        LD      A,E
        OUT     (SYSLAT),A
        LD      (HL),C
        LD      HL,$45ED        ; RETN at 0066h in page 1
        LD      (NMIVEC),HL
        LD      A,D
        OUT     (SYSLAT),A
        LD      A,2
        LD      (PAGES),A
        LD      HL,0
PGCOPY: LD      A,D
        OUT     (SYSLAT),A
        LD      C,(HL)
        LD      A,E
        OUT     (SYSLAT),A
        LD      (HL),C
        INC     L
        JR      NZ,PGCOPY
        LD      A,D
        OUT     (SYSLAT),A
        RET
PGSET:  LD      (PAGES),A
        RET

; Rebuild the classic page-zero vectors, BDOS stub and RAM BIOS table, and
; put the restart vectors back as a clean boot leaves them. IOBYTE and the
; drive/user byte are left alone.
PZINIT: LD      A,$C3
        LD      ($0000),A
        LD      HL,RAMBIOS+3
        LD      ($0001),HL
        LD      (PZBDOS),A
        LD      HL,BDOSSTB
        LD      (PZBDOS+1),HL
        LD      (BDOSSTB),A
        LD      HL,BENTRY
        LD      (BDOSSTB+1),HL
        LD      HL,BIOSBAS
        LD      DE,RAMBIOS
        LD      BC,BIOSLEN
        LDIR
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
RAMBAD: LD      HL,RAMMSG
        CALL    PUTS
RAMSTOP:JR      RAMSTOP         ; NMI returns here through 0066h

RAMMSG: DB      13,10,"TEC-OS needs 48K RAM: none at 8000h-BFFFh",13,10,0

BANNER: DB      13,10,"TEC-OS ",VERHI+'0','.',VERLO+'0'," for TEC-1G",13,10,0
