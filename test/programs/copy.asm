; COPY.COM: COPY SOURCE DEST copies a file record by record.
; Prints "COPIED nnnn" (records, hex) or an error, then returns to the CCP.

BDOS    EQU     $0005
FCB1    EQU     $005C
FCB2    EQU     $006C
DMA     EQU     $0080

        ORG     $0100
START:  LD      HL,FCB2         ; keep the destination name before FCB1 is used
        LD      DE,DEST
        LD      BC,16
        LDIR
        XOR     A
        LD      (FCB1+32),A
        LD      (DEST+32),A
        LD      DE,FCB1
        LD      C,15
        CALL    BDOS
        INC     A
        LD      DE,MNOSRC
        JR      Z,FAIL
        LD      DE,DEST
        LD      C,19
        CALL    BDOS
        LD      DE,DEST
        LD      C,22
        CALL    BDOS
        INC     A
        LD      DE,MNODST
        JR      Z,FAIL
        LD      HL,0
        LD      (COUNT),HL
LOOP:   LD      DE,DMA
        LD      C,26
        CALL    BDOS
        LD      DE,FCB1
        LD      C,20
        CALL    BDOS
        OR      A
        JR      NZ,DONE
        LD      DE,DEST
        LD      C,21
        CALL    BDOS
        OR      A
        LD      DE,MWRITE
        JR      NZ,FAIL
        LD      HL,(COUNT)
        INC     HL
        LD      (COUNT),HL
        JR      LOOP
DONE:   LD      DE,DEST
        LD      C,16
        CALL    BDOS
        INC     A
        LD      DE,MCLOSE
        JR      Z,FAIL
        LD      DE,MCOPIED
        LD      C,9
        CALL    BDOS
        LD      A,(COUNT+1)
        CALL    HEX
        LD      A,(COUNT)
        CALL    HEX
        LD      DE,MCRLF
FAIL:   LD      C,9
        JP      BDOS

HEX:    PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    NIB
        POP     AF
NIB:    AND     $0F
        ADD     A,$90
        DAA
        ADC     A,$40
        DAA
        LD      E,A
        LD      C,2
        JP      BDOS

COUNT:  DW      0
MNOSRC: DB      "NO SOURCE",13,10,"$"
MNODST: DB      "CANNOT MAKE DEST",13,10,"$"
MWRITE: DB      "WRITE ERROR",13,10,"$"
MCLOSE: DB      "CLOSE ERROR",13,10,"$"
MCOPIED:DB      "COPIED $"
MCRLF:  DB      13,10,"$"
DEST:   DS      36
