; REFUSE: asks for a nested CCP through ABIXCCP, then for one command line
; through ABIXCMD, each with HL = 0200h, as a program that wants its image
; kept would. Prints "REFUSED" if both return with carry set; "ACCEPTED"
; as soon as one does not.
%INCLUDE "../../src/abi.inc"

BDOS    EQU     $0005

        ORG     $0100
        LD      HL,$0200
        CALL    ABIXCCP
        JR      NC,YES
        LD      HL,$0200
        LD      DE,LINE
        CALL    ABIXCMD
        JR      NC,YES
        LD      DE,NO
        LD      C,9
        JP      BDOS
YES:    LD      DE,OK
        LD      C,9
        JP      BDOS

LINE:   DB      3,"DIR"
NO:     DB      "REFUSED",13,10,"$"
OK:     DB      "ACCEPTED",13,10,"$"
