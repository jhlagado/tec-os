; Video display selection. VIDINIT uses the TMS9918 when it answers and the
; ST7920 GLCD otherwise, and points the terminal's four driver vectors at the
; chosen driver: VPUT (A at row B, column C), VGET, VCLREOL and VSCROLL.

VIDINIT:LD      HL,TMSVEC
        CALL    VIDSET
        CALL    TMSINIT
        RET     Z
        LD      HL,GLCVEC
        CALL    VIDSET
        JP      GLCINIT

VIDSET: LD      DE,VPUTV
        LD      BC,8
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

TMSVEC: DW      TMSPUT,TMSGET,TMSCLR,TMSSCR
GLCVEC: DW      GLCPUT,GLCGET,GLCCLR,GLCSCR
