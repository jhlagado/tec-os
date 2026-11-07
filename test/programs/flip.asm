; FLIP.COM: write three lines, delete the first, then ask for console status.
; BDOS 11 exposes the pending page flip; the program then returns.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,DRAW
        LD      C,9
        CALL    BDOS
        LD      C,11
        JP      BDOS

DRAW:   DB      27,"[2J",27,"[HL1",13,10,"L2",13,10,"L3",27,"[1;1H",27,"[M$"
