; READF NAME: a silent sequential-read workload for the block-cache tests.
; Uses the default FCB and DMA 0080h, reading 128-byte records while A is 0.
; OPEN FFh returns; any nonzero READ ends the loop, without explicit CLOSE.
; A default-mode BDOS disk error can warm boot instead.

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
