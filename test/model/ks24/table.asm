; TABLE: every entry of TEC-OS's table, reached through abi.inc, with what
; each gives written at RESULT for the model to compare. Assembled at 7000h and
; run from the A> prompt as a stub; it ends in a loop at DONE. The same
; source runs on c9e421b with abi27.inc, the old table's addresses under the
; same names.

%INCLUDE "abi.inc"

BDOS    EQU     $0005
RESULT    EQU     $7800
SRC     EQU     $7900
DST     EQU     $7A00
DESC    EQU     $7B00

        ORG     $7000
        LD      IX,RESULT
        LD      HL,ABITAB       ; "TNA", major, minor: RESULT+0
        LD      DE,RESULT
        LD      BC,5
        LDIR
        LD      HL,(ABIVID)     ; columns and rows: RESULT+5
        LD      A,(HL)
        LD      (IX+5),A
        INC     HL
        LD      A,(HL)
        LD      (IX+6),A
        LD      C,0             ; INFO: RESULT+7
        CALL    ABIHW
        PUSH    AF
        LD      (IX+7),A
        LD      (IX+8),B
        LD      (IX+9),E
        LD      (IX+10),D
        LD      (IX+11),L
        LD      (IX+12),H
        POP     BC
        LD      (IX+13),C
        LD      A,$0B           ; HEX, digit B: RESULT+14
        LD      C,2
        CALL    ABIHW
        PUSH    AF
        LD      (IX+14),A
        LD      (IX+15),B
        POP     BC
        LD      (IX+16),C
        LD      HL,(ABIMAIN)    ; RESULT+17
        LD      A,(HL)
        LD      (IX+17),A
        LD      HL,(ABIXMRK)    ; RESULT+18
        LD      A,(HL)
        LD      (IX+18),A
        LD      HL,(ABIFONT)    ; the glyph for "A": RESULT+19
        LD      DE,8*$21      
        ADD     HL,DE
        LD      DE,RESULT+19
        LD      BC,8
        LDIR
        LD      HL,SRC          ; a pattern to MOVE
        LD      B,16
PAT:    LD      A,L
        XOR     $5A
        LD      (HL),A
        INC     HL
        DJNZ    PAT
        LD      BC,0            ; XMOVE bank 0 to bank 0: RESULT+27
        CALL    ABIXMOV
        PUSH    AF
        LD      (IX+27),A
        POP     BC
        LD      (IX+28),C
        LD      HL,DST          ; MOVE 16 bytes: RESULT+29, the bytes RESULT+31
        LD      DE,SRC
        LD      BC,16
        CALL    ABIMOVE
        PUSH    AF
        LD      (IX+29),A
        POP     BC
        LD      (IX+30),C
        LD      HL,DST
        LD      DE,RESULT+31
        LD      BC,16
        LDIR
        LD      A,2             ; describe volume 0: RESULT+47, the descriptor RESULT+49
        LD      E,0
        LD      HL,DESC
        CALL    ABIVOL
        PUSH    AF
        LD      (IX+47),A
        POP     BC
        LD      (IX+48),C
        LD      HL,DESC
        LD      DE,RESULT+49
        LD      BC,32
        LDIR
        LD      HL,0            ; the GLCD hook given 0: RESULT+81
        CALL    ABIGLCD
        PUSH    AF
        LD      (IX+81),A
        LD      (IX+83),L
        LD      (IX+84),H
        POP     BC
        LD      (IX+82),C
        LD      HL,$0100        ; one command line: RESULT+85
        LD      DE,LINE
        CALL    ABIXCMD
        PUSH    AF
        LD      (IX+85),A
        LD      (IX+87),L
        LD      (IX+88),H
        POP     BC
        LD      (IX+86),C
        LD      HL,$0100        ; a nested CCP, left with EXIT: RESULT+89
        CALL    ABIXCCP
        PUSH    AF
        LD      (IX+89),A
        LD      (IX+91),L
        LD      (IX+92),H
        POP     BC
        LD      (IX+90),C
DONE:   JR      DONE

LINE:   DB      3,"DIR"
