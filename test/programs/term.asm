; TERM.COM: clear screen, leave AB on row 1, X at row 5, column 10,
; and reverse R after X. Any nonempty tail (including S) adds 30 scroll lines.
; A fresh L00 image yields L00-L29; entry resets only units, not tens.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,DRAW
        LD      C,9
        CALL    BDOS
        LD      A,($0080)       
        OR      A
        RET     Z
        LD      B,30
        LD      A,'0'
        LD      (LINE+2),A
LOOP:   PUSH    BC
        LD      DE,LINE
        LD      C,9
        CALL    BDOS
        LD      HL,LINE+2       
        INC     (HL)
        LD      A,(HL)
        CP      '9'+1
        JR      NZ,NEXT
        LD      (HL),'0'
        DEC     HL
        INC     (HL)
NEXT:   POP     BC
        DJNZ    LOOP
        RET

DRAW:   DB      27,"[2J",27,"[H","ABCDEFG",27,"[1;3H",27,"[K"
        DB      27,"[5;10HX",27,"[7mR",27,"[0m",13,10,"$"
LINE:   DB      "L00",13,10,"$"
