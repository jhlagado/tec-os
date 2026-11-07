; SETRC n: use one expected digit at 0082h to set BDOS 108's return code.
; No tail/digit validation: byte minus '0' modulo 256, D=0; then return.

BDOS    EQU     $0005

        ORG     $0100
        LD      A,($0082)       ; the tail's first character, after its space
        SUB     '0'
        LD      E,A
        LD      D,0
        LD      C,108
        CALL    BDOS
        RET
