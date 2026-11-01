; CHAIN: BDOS function 47 with its DMA address at STR, the file's end, where
; a test puts the command and what follows it. Refused, it prints REFUSED
; when A is FFh, and NOT FF otherwise, and returns.

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
