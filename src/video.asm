; Video display selection. VIDINIT uses the TMS9918 when it answers and the
; ST7920 GLCD otherwise, and points the terminal's four driver vectors at the
; chosen driver: VPUT (A at row B, column C), VGET, VCLREOL, VSCROLL and
; VREST, which puts back the display mode and character set after a program
; may have changed them, leaving the picture alone.

VIDINIT:LD      HL,TMSVEC
        CALL    VIDSET
        CALL    TMSINIT
        RET     Z
        LD      HL,GLCVEC
        CALL    VIDSET
        JP      GLCINIT

VIDSET: LD      DE,VPUTV
        LD      BC,10
        LDIR
        RET

VPUT:   LD      HL,(VPUTV)
        JP      (HL)
VGET:   LD      HL,(VGETV)
        JP      (HL)
VCLREOL:LD      HL,(VCLRV)
        JP      (HL)
VSCROLL:LD      HL,(VSCRV)
        JP      (HL)
VREST:  LD      HL,(VRSTV)
        JP      (HL)

TMSVEC: DW      TMSPUT,TMSGET,TMSCLR,TMSSCR,TMSSET
GLCVEC: DW      GLCPUT,GLCGET,GLCCLR,GLCSCR,GLCRST
