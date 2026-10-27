; SAY: prints "PRL" by BDOS function 9 from a string whose address the
; loader must relocate, then returns. Run as SAY.PRL beside a SAY.COM that
; prints something else, it shows which file the CCP chose.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,MSG
        LD      C,9
        CALL    BDOS
        RET
MSG:    DB      "PRL$"
