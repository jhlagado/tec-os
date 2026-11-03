; SAY: prints "SAY" by BDOS function 9, then returns: a program for the
; chain's tests, whose output marks each piece that ran.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,MSG
        LD      C,9
        CALL    BDOS
        RET
MSG:    DB      "SAY$"
