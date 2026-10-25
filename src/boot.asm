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
        CALL    LCDINIT
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
        JP      WBOOTR
COLDERR:JP      DIAG

; ---- Warm boot ----------------------------------------------------------------
; BIOS function 1 and the JP at 0000h. Select the classic bank before the
; stack, because the BIOS stack is in that bank.
WBOOTR: DI
        LD      HL,$45ED        ; the program that ended may have used 0066h
        LD      (NMIVEC),HL
        LD      A,LATCLAS
        LD      (LATCHV),A
        OUT     (SYSLAT),A
        XOR     A
        LD      (CURBANK),A
        LD      (OSMODE),A
        LD      SP,BSTK
        CALL    PZINIT
        CALL    CPMINIT
        LD      A,(PZDU)
        LD      C,A
        JP      CCPENT

; Rebuild the classic page-zero vectors, BDOS stub and RAM BIOS table.
; IOBYTE and the drive/user byte are left alone.
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
