; TERM.COM: draws with the ANSI subset the video terminal supports.
; Clears the screen, writes X at row 5 column 10 and a reverse R after it,
; and clears the rest of row 1 after "AB". TERM S also prints 30 numbered
; lines, to scroll.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,DRAW
        LD      C,9
        CALL    BDOS
        LD      A,($0080)       ; any command tail: scroll test
        OR      A
        RET     Z
        LD      B,30
        LD      A,'0'
        LD      (LINE+2),A
LOOP:   PUSH    BC
        LD      DE,LINE
        LD      C,9
        CALL    BDOS
        LD      HL,LINE+2       ; next two-digit number
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
