; LINE: reads a line from the console by BDOS function 10, then prints GOT
; and returns.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,BUF
        LD      C,10
        CALL    BDOS
        LD      DE,GOT
        LD      C,9
        CALL    BDOS
        RET
GOT:    DB      13,10,"GOT",13,10,"$"
BUF:    DB      20,0
        DS      20
