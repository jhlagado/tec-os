; Diagnostics reset, vectors and RAM.
; Overlay on: C000h-C7FFh also maps at
; 0000h-07FFh. Load SP, DI then jump to
; high COLD before removing overlay.
; DI masks IRQs, not NMI. This is reset,
; not the TEC-OS warm-entry test.

        ORG     $C000
RESET:  LD      SP,BOOTSTK
        DI
        JP      COLD

        DS      RST7-($-$C000),$FF
INT38:  EI
        RETI

        DS      NMIVEC-($-$C000),$FF

; Overlay NMI: RETN uses the CPU-pushed
; return word. DI does not block NMI.

NMIROM: RETN

ROMSIG: DB      "TEC-1G DIAG",0
ROMVERS:DW      ROMVER

; Remove overlay from high ROM, select
; IM 1 then install RAM's NMI return.
; Loading SP is not a stack access.

COLD:   DI
        LD      SP,BOOTSTK
        LD      A,LATSHAD
        OUT     (SYSLAT),A      ; overlay off; execution is at C0xxh
        IM      1
        LD      HL,$45ED        ; RETN at 0066h
        LD      (NMIVEC),HL
        LD      A,$40           ; serial idle, digits and speaker off
        OUT     (DIGPORT),A
        XOR     A
        OUT     (SEGPORT),A
        OUT     (LEDROW),A      ; 8 x 8 matrix dark
        OUT     (LEDRED),A
        OUT     (LEDGRN),A
        OUT     (LEDBLU),A
        LD      A,SDIDLE        ; SD deselected, activity lamp off
        OUT     (SDIO),A

; Fall through to HOMECHK.

; T01: destructive 7E00h-7FFFh check
; before explicit stack/workspace use.
; Four fill/verify passes use L XOR H
; XOR 00h/FFh/55h/AAh, not flat fills.
; Own instructions use no stack or
; initialised workspace and change
; AF/BC/HL/IX. Mismatch: HL=address,
; A=expected, NZ. HCBAD rereads actual.
; Success jumps to START to clear vars.

HOMECHK:LD      IX,HCPATS
        LD      B,4
HCPASS: LD      C,(IX+0)
        LD      HL,VARS
HCFILL: LD      A,L
        XOR     H
        XOR     C
        LD      (HL),A
        INC     HL
        LD      A,H
        CP      HIGH(BOOTSTK)
        JR      NZ,HCFILL
        LD      HL,VARS
HCVER:  LD      A,L
        XOR     H
        XOR     C
        CP      (HL)
        JR      NZ,HCBAD
        INC     HL
        LD      A,H
        CP      HIGH(BOOTSTK)
        JR      NZ,HCVER
        INC     IX
        DJNZ    HCPASS
        JP      START
HCPATS: DB      $00,$FF,$55,$AA

; HL=failed address, A=expected byte.
; Reread actual into E. EXX retains
; address and expected/actual DE while
; the other bank walks HCTEXT with C.
; Eight markers print address, expected
; then reread nibbles, high first.
; TXNS jumps through IY=HCNEXT.
; Repeat forever, never START.
; Own instructions use no stack.

HCBAD:  LD      D,A
        LD      E,(HL)
        EXX
HCMSG:  LD      HL,HCTEXT
        LD      C,0             ; next nibble: address, written, read
HCNEXT: LD      A,(HL)
        INC     HL
        OR      A
        JR      Z,HCWAIT
        CP      1
        JR      NZ,HCSEND
        LD      A,C
        INC     C
        EXX
        LD      B,A
        CP      2
        LD      A,H
        JR      C,HCN1
        LD      A,B
        CP      4
        LD      A,L
        JR      C,HCN1
        LD      A,B
        CP      6
        LD      A,D
        JR      C,HCN1
        LD      A,E
HCN1:   BIT     0,B
        JR      NZ,HCN2
        RRCA
        RRCA
        RRCA
        RRCA
HCN2:   EXX
        AND     $0F
        ADD     A,$90
        DAA
        ADC     A,$40
        DAA
HCSEND: LD      IY,HCNEXT
        JP      TXNS

; Sixteen 65536-count delays take about
; 6.816 s at nominal 4 MHz, plus message
; and branch overhead, then repeat.

HCWAIT: LD      B,16
HCW1:   LD      DE,0
HCW2:   DEC     DE
        LD      A,D
        OR      E
        JR      NZ,HCW2
        DJNZ    HCW1
        JR      HCMSG

HCTEXT: DB      13,10,"T01 HOME    FAIL  RAM 7E00-7FFF at ",1,1,1,1
        DB      " wrote ",1,1," read ",1,1,13,10,0

; Send A: start bit then 8 data bits,
; low first, on DIGPORT bit 6. Other
; digit/speaker outputs stay off.
; Drive TX high for TXSTOP then jump
; through mapped IY. Changes AF/B/D/E.
; Own code keeps C/HL and alternates
; without explicit stack access.

TXNS:   LD      E,A
        LD      B,9
        OR      A
TXNSB:  SBC     A,A
        AND     $40
        OUT     (DIGPORT),A
        NOP
        LD      D,TXDLY
TXNSD:  DEC     D
        JR      NZ,TXNSD
        RR      E
        DJNZ    TXNSB
        LD      A,$40
        OUT     (DIGPORT),A
        LD      D,TXSTOP
TXNSS:  DEC     D
        JR      NZ,TXNSS
        JP      (IY)
