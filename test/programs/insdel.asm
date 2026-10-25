; INSDEL.COM: exercises insert and delete on the video terminal.
; Row 1: "ABCDEFGH", two blanks inserted at column 3 and "xy" written into
; them, then three characters deleted at column 8: "ABxyCDE".
; Rows 2-4: "row2", "row3", "row4"; a line inserted at row 3, then row 2
; deleted: row 2 blank, row 3 "row3", row 4 "row4".

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,DRAW
        LD      C,9
        JP      BDOS

DRAW:   DB      27,"[2J",27,"[H","ABCDEFGH"
        DB      27,"[1;3H",27,"[2@xy"
        DB      27,"[1;8H",27,"[3P"
        DB      27,"[2;1Hrow2",27,"[3;1Hrow3",27,"[4;1Hrow4"
        DB      27,"[3;1H",27,"[L"
        DB      27,"[2;1H",27,"[M"
        DB      27,"[10;1H$"
