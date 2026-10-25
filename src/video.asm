; Video displays. VIDINIT sets up every display that answers and records it
; in CONDEV; the console mode then points the terminal's driver vectors at
; one of them: VPUT (A at row B, column C), VGET, VCLREOL, VSCROLL and
; VREST, which puts back the display mode and character set after a program
; may have changed them, leaving the picture alone; VRDROW and VWRROW, which
; copy row B to and from LINEBUF.

VIDINIT:LD      HL,GLCVEC
        CALL    VIDSET
        CALL    GLCINIT
        JR      NZ,VIDT
        LD      HL,CONDEV
        SET     2,(HL)          ; CDGLC
VIDT:   LD      HL,TMSVEC
        CALL    VIDSET
        CALL    TMSINIT
        RET     NZ
        LD      HL,CONDEV
        SET     1,(HL)          ; CDTMS
        RET

VIDSET: LD      DE,VPUTV
        LD      BC,14
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
VRDROW: LD      HL,(VRDRV)
        JP      (HL)
VWRROW: LD      HL,(VWRRV)
        JP      (HL)

TMSVEC: DW      TMSPUT,TMSGET,TMSCLR,TMSSCR,TMSSET,TMSRDR,TMSWRR
GLCVEC: DW      GLCPUT,GLCGET,GLCCLR,GLCSCR,GLCRST,GLRDR,GLWRR
