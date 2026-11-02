; SAY: prints "PRL" by BDOS function 9, then returns. A program is moved
; to 0100h, not relocated. Run as SAY.PRL beside a SAY.COM that
; prints something else, it shows which file the CCP chose.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,MSG
        LD      C,9
        CALL    BDOS
        RET
MSG:    DB      "PRL$"
