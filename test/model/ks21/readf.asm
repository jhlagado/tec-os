; READF NAME: reads the file named in the command tail to its end through
; the BDOS, 128 bytes at a time into the default DMA at 0080h, and prints
; nothing. KS21's model times its second run, for a file read again.

BDOS    EQU     $0005
FCB     EQU     $005C

        ORG     $0100
        XOR     A
        LD      (FCB+32),A
        LD      DE,FCB
        LD      C,15
        CALL    BDOS
        INC     A
        RET     Z
RD:     LD      DE,FCB
        LD      C,20
        CALL    BDOS
        OR      A
        JR      Z,RD
        RET
