; SHELL: a program that shells out, as a debugger does. It moves itself out of
; the way to 4100h, sets drive A and user 0, pushes two known words, and calls
; ABIXCCP with HL = 0100h, since nothing of the TPA is kept. After EXIT it
; prints "SHELL OK", then the return code in hex, if its stack words, drive
; (BDOS function 25), user (function 32) and 0004h are as they were; "SHELL
; BAD" otherwise, and "SHELL REFUSED" if the call returned carry.
;   MODE, code offset 21, = 1: it runs "SETRC 9" through ABIXCMD instead, with
;   no prompt, and prints the code it gets back the same way.
%INCLUDE "../../src/abi.inc"

BDOS    EQU     $0005

OFF     EQU     $4000           ; where it runs

        ORG     $0100
HDR:    JP      START
        DB      "SHELL   SHELL   ",0,0
MODE:   DB      0

LINE:   DB      7,"SETRC 9"
OK:     DB      13,10,"SHELL OK $"
NO:     DB      13,10,"SHELL BAD$"
NOGO:   DB      13,10,"SHELL REFUSED$"
CODE:   DW      0

NIB:    AND     $0F
        ADD     A,$90
        DAA
        ADC     A,$40
        DAA
        LD      E,A
        LD      C,2
        JP      BDOS
HEX:    PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    NIB+OFF
        POP     AF
        JR      NIB

GO:     LD      E,0
        LD      C,14
        CALL    BDOS
        LD      E,0
        LD      C,32
        CALL    BDOS
        LD      HL,$1234
        PUSH    HL
        LD      HL,$5678
        PUSH    HL
        LD      A,(MODE+OFF)
        OR      A
        LD      HL,$0100        ; no image
        JR      NZ,ONE
        CALL    ABIXCCP
        JR      BACK
ONE:    LD      DE,LINE+OFF
        CALL    ABIXCMD
BACK:   JR      C,REF
        LD      (CODE+OFF),HL
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
        LD      DE,OK+OFF
        LD      C,9
        CALL    BDOS
        LD      A,(CODE+1+OFF)
        CALL    HEX+OFF
        LD      A,(CODE+OFF)
        CALL    HEX+OFF
        RET
REF:    POP     HL
        POP     HL
        LD      DE,NOGO+OFF
        LD      C,9
        JP      BDOS
BAD:    LD      DE,NO+OFF           ; the stack is not as it was: warm boot
        LD      C,9
        CALL    BDOS
        JP      0

START:  LD      HL,$0100
        LD      DE,$0100+OFF
        LD      BC,$0100
        LDIR
        JP      GO+OFF

