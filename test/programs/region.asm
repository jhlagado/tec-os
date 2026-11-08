; Set a scroll region covering rows 2-4.
; Keep "top" on row 1 and "bottom" on
; row 5 while four lines scroll within
; the region.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,DRAW
        LD      C,9
        JP      BDOS

DRAW:   DB      27,"[2J",27,"[Htop",27,"[5;1Hbottom"
        DB      27,"[2;4r",27,"[2;1Ha",13,10,"b",13,10,"c",13,10,"d"
        DB      27,"[r",27,"[10;1H$"
