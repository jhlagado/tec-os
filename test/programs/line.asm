; LINE: call BDOS 10 with a 20-character buffer; print GOT on return.
; Leading ^C warm boots before GOT. The chain tests use this input wait.

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
