; SHELL: shells out to a nested CCP through FF1Ah and checks what it gets
; back at EXIT. It sets drive A and user 0, pushes two known words on the
; stack the CCP gave it, and passes the end of its own image in HL. After
; EXIT it prints "SHELL OK", then the return code in hex, if its stack
; words, drive (BDOS function 25), user (function 32) and 0004h are as they
; were; otherwise "SHELL BAD".
;   SHELL C  runs "SETRC 9" through FF1Dh instead, with no prompt, and prints
;            the code it gets back the same way.

BDOS    EQU     $0005

        ORG     $0100
        LD      E,0
        LD      C,14
        CALL    BDOS
        LD      E,0
        LD      C,32
        CALL    BDOS
        LD      HL,$1234
        PUSH    HL
        LD      HL,$5678
        PUSH    HL
        LD      A,($0080)       ; a command tail: one command line
        OR      A
        LD      HL,ENDIMG
        JR      NZ,ONE
        CALL    $FF1A
        JR      BACK
ONE:    LD      DE,LINE
        CALL    $FF1D
BACK:   LD      (CODE),HL
        POP     HL
        LD      DE,$5678
        OR      A
        SBC     HL,DE
        JR      NZ,BAD
        POP     HL
        LD      DE,$1234
        OR      A
        SBC     HL,DE
        JR      NZ,BAD
        LD      C,25
        CALL    BDOS
        OR      A
        JR      NZ,BAD
        LD      E,$FF
        LD      C,32
        CALL    BDOS
        OR      A
        JR      NZ,BAD
        LD      A,($0004)
        OR      A
        JR      NZ,BAD
        LD      DE,OK
        LD      C,9
        CALL    BDOS
        LD      A,(CODE+1)
        CALL    HEX
        LD      A,(CODE)
        CALL    HEX
        RET
BAD:    LD      DE,NO
        LD      C,9
        CALL    BDOS
        RET

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

LINE:   DB      7,"SETRC 9"
OK:     DB      13,10,"SHELL OK $"
NO:     DB      13,10,"SHELL BAD$"
CODE:   DW      0
ENDIMG:
