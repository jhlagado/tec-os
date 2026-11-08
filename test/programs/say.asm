; Mark a command-chain step by printing
; "SAY" through BDOS 9, then return.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,MSG
        LD      C,9
        CALL    BDOS
        RET
MSG:    DB      "SAY$"
