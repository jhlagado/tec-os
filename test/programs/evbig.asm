; EVBIG.COM: a program that takes the whole TPA. It prints the word at
; 0006h in hex, writes a changing byte to every address from its own end
; to the byte below that word, reads them all back, and prints OK or BAD.
; A tail starting with J ends it by JP 0000h; otherwise it returns. It
; runs on the CCP's stack, which is outside the TPA.

        ORG     $0100
        LD      HL,($0006)
        LD      A,H
        CALL    HEX
        LD      A,($0006)
        CALL    HEX
        LD      DE,($0006)
        LD      HL,END
FILL:   LD      A,L
        XOR     H
        LD      (HL),A
        INC     HL
        CALL    ATTOP
        JR      NZ,FILL
        LD      HL,END
VER:    LD      A,L
        XOR     H
        CP      (HL)
        JR      NZ,BAD
        INC     HL
        CALL    ATTOP
        JR      NZ,VER
        LD      DE,OKMSG
        JR      SAY
BAD:    LD      DE,BADMSG
SAY:    LD      C,9
        CALL    $0005
        LD      A,($0082)
        CP      'J'
        JP      Z,$0000
        RET

; Z when HL has reached DE.

ATTOP:  LD      A,H
        CP      D
        RET     NZ
        LD      A,L
        CP      E
        RET

; Print A as two hex digits. Keeps DE.

HEX:    PUSH    AF
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
        PUSH    DE
        LD      E,A
        LD      C,2
        CALL    $0005
        POP     DE
        RET

OKMSG:  DB      " OK$"
BADMSG: DB      " BAD$"
END:
