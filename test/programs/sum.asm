; SUM NAME: print byte sum and record count, both modulo 65536, in hex.
; Includes all 128 bytes of each record, including padding. OPEN FFh is silent;
; any nonzero READ prints current totals. No explicit close; a BDOS disk
; error may warm boot instead.

BDOS    EQU     $0005
FCB     EQU     $005C
DMA     EQU     $0080

        ORG     $0100
        XOR     A
        LD      (FCB+32),A
        LD      DE,FCB
        LD      C,15
        CALL    BDOS
        INC     A
        RET     Z
RD:     LD      DE,FCB
        LD      C,20
        CALL    BDOS
        OR      A
        JR      NZ,DONE
        LD      HL,(RECS)
        INC     HL
        LD      (RECS),HL
        LD      HL,DMA
        LD      DE,(TOTAL)
        LD      B,128
AD:     LD      A,(HL)
        ADD     A,E
        LD      E,A
        JR      NC,AD1
        INC     D
AD1:    INC     HL
        DJNZ    AD
        LD      (TOTAL),DE
        JR      RD
DONE:   LD      DE,SUMM
        LD      C,9
        CALL    BDOS
        LD      HL,(TOTAL)
        CALL    HEX4
        LD      DE,RECM
        LD      C,9
        CALL    BDOS
        LD      HL,(RECS)
        CALL    HEX4
        LD      DE,CRLF
        LD      C,9
        JP      BDOS

; HEX4 keeps HL across BDOS output so the low byte survives the high byte.
HEX4:   LD      A,H
        CALL    HEX2
        LD      A,L
HEX2:   PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    NIB
        POP     AF
NIB:    AND     $0F
        ADD     A,$90
        DAA
        ADC     A,$40
        DAA
        PUSH    HL
        LD      E,A
        LD      C,2
        CALL    BDOS
        POP     HL
        RET

SUMM:   DB      "SUM $"
RECM:   DB      " RECS $"
CRLF:   DB      13,10,"$"
TOTAL:  DW      0
RECS:   DW      0
