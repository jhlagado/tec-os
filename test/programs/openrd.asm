; OPENRD.PRL: a resident whose INIT opens B:DATA.TXT, reads its first
; record and prints its first 8 bytes, shells out to a nested CCP through
; FF1Ah with HL = 0100h, and after EXIT reads the next record through the
; same FCB and prints its first 8 bytes. A child level that remounts B:
; must give the parent its own B: back.

BDOS    EQU     $0005

        ORG     $0100
HDR:    DB      "TNM",1,1,0     ; a resident
        JP      0
        DW      INIT,REMOVE
        DB      "OPENRD  "

INIT:   LD      DE,BUF
        LD      C,26
        CALL    BDOS
        LD      DE,FCB
        LD      C,15
        CALL    BDOS
        INC     A
        JR      Z,FAIL
        CALL    READ
        LD      HL,$0100        ; no image
        CALL    $FF1A
        LD      DE,BUF          ; the nested level moved the DMA address
        LD      C,26
        CALL    BDOS
        CALL    READ
        RET

READ:   LD      DE,FCB
        LD      C,20
        CALL    BDOS
        OR      A
        JR      NZ,FAIL
        LD      HL,BUF
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
REMOVE: RET
FAIL:   LD      DE,NO
        LD      C,9
        JP      BDOS

NO:     DB      "OPENRD FAILED",13,10,"$"
FCB:    DB      2,"DATA    TXT"
        DS      24
BUF:    DS      128
