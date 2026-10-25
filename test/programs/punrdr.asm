; PUNRDR.COM: send "PUN" with BDOS function 4 (punch), then read three bytes
; with function 3 (reader) and print each in hex.

BDOS    EQU     $0005

        ORG     $0100
        LD      HL,TEXT
PUNCH:  LD      A,(HL)
        OR      A
        JR      Z,READ
        PUSH    HL
        LD      E,A
        LD      C,4
        CALL    BDOS
        POP     HL
        INC     HL
        JR      PUNCH
READ:   LD      B,3
RLOOP:  PUSH    BC
        LD      C,3
        CALL    BDOS
        CALL    HEX
        LD      E,' '
        LD      C,2
        CALL    BDOS
        POP     BC
        DJNZ    RLOOP
        RET

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
        LD      E,A
        LD      C,2
        JP      BDOS

TEXT:   DB      "PUN",0
