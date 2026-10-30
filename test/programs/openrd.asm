; OPENRD: a program that moves itself to 4100h, opens B:DATA.TXT, reads its
; first record and prints its first 8 bytes, shells out to a nested CCP through
; ABIXCCP with HL = 0100h, and after EXIT reads the next record through the
; same FCB and prints its first 8 bytes. A child level that remounts B:
; must give the parent its own B: back.
%INCLUDE "../../src/abi.inc"

BDOS    EQU     $0005

OFF     EQU     $4000           ; where it runs

        ORG     $0100
        JP      START
NO:     DB      "OPENRD FAILED",13,10,"$"
FCB:    DB      2,"DATA    TXT"
        DS      24
BUF:    DS      128

READ:   LD      DE,FCB+OFF
        LD      C,20
        CALL    BDOS
        OR      A
        JR      NZ,FAIL
        LD      HL,BUF+OFF
        LD      B,8
RD1:    LD      E,(HL)
        PUSH    BC
        PUSH    HL
        LD      C,2
        CALL    BDOS
        POP     HL
        POP     BC
        INC     HL
        DJNZ    RD1
        LD      E,13
        LD      C,2
        CALL    BDOS
        LD      E,10
        LD      C,2
        JP      BDOS
FAIL:   LD      DE,NO+OFF
        LD      C,9
        JP      BDOS

GO:     LD      DE,BUF+OFF
        LD      C,26
        CALL    BDOS
        LD      DE,FCB+OFF
        LD      C,15
        CALL    BDOS
        INC     A
        JR      Z,FAIL
        CALL    READ+OFF
        LD      HL,$0100        ; no image
        CALL    ABIXCCP
        LD      DE,BUF+OFF      ; the nested level moved the DMA address
        LD      C,26
        CALL    BDOS
        CALL    READ+OFF
        RET

START:  LD      HL,$0100
        LD      DE,$0100+OFF
        LD      BC,$0200
        LDIR
        JP      GO+OFF

