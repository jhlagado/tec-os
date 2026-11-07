; KEYS.COM: print six nonzero results from un-echoed BDOS 6 polling in hex.
; Returned NUL looks like no ready input and is not counted.

BDOS    EQU     $0005

        ORG     $0100
        LD      B,6
LOOP:   PUSH    BC
WAIT:   LD      E,$FF
        LD      C,6
        CALL    BDOS
        OR      A
        JR      Z,WAIT
        CALL    HEX
        LD      E,' '
        LD      C,2
        CALL    BDOS
        POP     BC
        DJNZ    LOOP
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
