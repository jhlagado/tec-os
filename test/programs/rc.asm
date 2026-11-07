; RC hhhh: consume four uppercase hex digits at 0082h, without validation.
; BDOS 108 sets that code except FFFFh, which queries the old code; return.

BDOS    EQU     $0005

        ORG     $0100
        LD      HL,$0082        ; the tail's first character, after its space
        LD      DE,0
        LD      B,4
DIGIT:  LD      A,(HL)
        INC     HL
        SUB     '0'
        CP      10
        JR      C,ADD4
        SUB     'A'-'0'-10
ADD4:   EX      DE,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        OR      L
        LD      L,A
        EX      DE,HL
        DJNZ    DIGIT
        LD      C,108
        CALL    BDOS
        RET
