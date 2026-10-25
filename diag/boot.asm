; Reset, interrupt vectors and the first RAM check.
;
; This mirrors src/boot.asm. At reset the latch is 00h, so the first 2 KiB of
; the image also appear at 0000h. The CPU starts there, loads SP with fixed
; RAM, then jumps to the same code at its C000h alias before removing the
; overlay. Interrupts stay disabled; IM 1 and the RETN at 0066h match TEC-OS.

        ORG     $C000
RESET:  LD      SP,BOOTSTK
        DI
        JP      COLD

        DS      RST7-($-$C000),$FF
INT38:  EI
        RETI

        DS      NMIVEC-($-$C000),$FF
        ; NMI while the overlay is on: return at once.
NMIROM: RETN

ROMSIG: DB      "TEC-1G DIAG",0
ROMVERS:DW      ROMVER

COLD:   DI
        LD      SP,BOOTSTK
        LD      A,LATSHAD
        OUT     (SYSLAT),A      ; overlay off; execution is at C0xxh
        IM      1
        LD      HL,$45ED        ; RETN at 0066h before anything else
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
        ; fall through

; ---- T01: the variables and stack page ---------------------------------------
; 7E00h-7FFFh holds the variables and the stack, so it is proved before
; anything uses it: four fill-and-verify passes with registers only. On a
; failure the address and bits go to the serial port, again with no stack,
; and the ROM goes no further.
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

; HL = failing address, A = the value written. The alternate registers hold
; them while the message is printed a nibble at a time.
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
HCWAIT: LD      B,16            ; about 1.7 s, then say it again
HCW1:   LD      DE,0
HCW2:   DEC     DE
        LD      A,D
        OR      E
        JR      NZ,HCW2
        DJNZ    HCW1
        JR      HCMSG

HCTEXT: DB      13,10,"T01 HOME    FAIL  RAM 7E00-7FFF at ",1,1,1,1
        DB      " wrote ",1,1," read ",1,1,13,10,0

; TXBYTE without a stack: send A, then continue at IY. Destroys AF, BDE.
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
