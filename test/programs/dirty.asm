; Attempt eight writes to B:DIRTY.DAT,
; then warm boot without CLOSE.
; The stack test uses a successful
; write-behind volume, leaving dirty
; lines for warm boot. DELETE, MAKE and
; WRITE results are ignored. Data at
; DMA 0200h is not initialised.

BDOS    EQU     $0005

        ORG     $0100
        LD      HL,NAME
        LD      DE,FCB
        LD      BC,12
        LDIR
        LD      DE,FCB
        LD      C,19
        CALL    BDOS
        LD      DE,FCB
        LD      C,22
        CALL    BDOS
        LD      DE,$0200
        LD      C,26
        CALL    BDOS
        LD      B,8
WR:     PUSH    BC
        LD      DE,FCB
        LD      C,21
        CALL    BDOS
        POP     BC
        DJNZ    WR
        JP      0

NAME:   DB      2,"DIRTY   DAT"
FCB:    DS      36
