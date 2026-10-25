; FLIP.COM: writes three lines, deletes the first with ESC [ M, then asks
; for console status once (BDOS function 11) and returns.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,DRAW
        LD      C,9
        CALL    BDOS
        LD      C,11
        JP      BDOS

DRAW:   DB      27,"[2J",27,"[HL1",13,10,"L2",13,10,"L3",27,"[1;1H",27,"[M$"
