; Test BDOS 47 with a command appended
; at STR, the image's end. Acceptance
; warm boots without returning. A CR/LF
; or missing zero within 128 bytes
; causes rejection. Print REFUSED for
; FFh, NOT FF for another return.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,STR
        LD      C,26
        CALL    BDOS
        LD      C,47
        CALL    BDOS
        INC     A
        LD      DE,REFUSED
        JR      Z,SAY
        LD      DE,NOTFF
SAY:    LD      C,9
        CALL    BDOS
        RET
REFUSED:DB      "REFUSED",13,10,"$"
NOTFF:  DB      "NOT FF",13,10,"$"
STR:
