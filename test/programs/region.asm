; REGION.COM: a scroll region of rows 2-4. "top" on row 1 and "bottom" on
; row 5 stay put while four lines written into the region scroll it.

BDOS    EQU     $0005

        ORG     $0100
        LD      DE,DRAW
        LD      C,9
        JP      BDOS

DRAW:   DB      27,"[2J",27,"[Htop",27,"[5;1Hbottom"
        DB      27,"[2;4r",27,"[2;1Ha",13,10,"b",13,10,"c",13,10,"d"
        DB      27,"[r",27,"[10;1H$"
