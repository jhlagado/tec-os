; SETRC n: sets BDOS function 108's program return code to the digit n
; given in its command tail, then returns.

BDOS    EQU     $0005

        ORG     $0100
        LD      A,($0082)       ; the tail's first character, after its space
        SUB     '0'
        LD      E,A
        LD      D,0
        LD      C,108
        CALL    BDOS
        RET
