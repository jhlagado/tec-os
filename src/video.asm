; Video displays. VIDINIT sets up every display that answers and records it
; in CONDEV; the console mode then points the terminal's driver vectors at
; one of them: VPUT (A at row B, column C), VGET, VCLREOL, VREST, which puts
; back the display mode and character set after a program may have changed
; them, leaving the picture alone, and VRDROW and VWRROW, which copy row B to
; and from LINEBUF. Scrolling is a line delete in the terminal.

VIDINIT:CALL    GLCPRB          ; a GLCD: its driver, GLCD.PRL, is loaded later
        JR      NZ,VIDT
        LD      A,1
        LD      (GLCWANT),A
VIDT:   LD      HL,TMSVEC
        CALL    VIDSET
        CALL    TMSINIT
        RET     NZ
        LD      HL,CONDEV
        SET     1,(HL)          ; CDTMS
        RET

VIDSET: LD      DE,VPUTV
        LD      BC,12
        LDIR
        RET

VPUT:   LD      HL,(VPUTV)
        JP      (HL)
VGET:   LD      HL,(VGETV)
        JP      (HL)
VCLREOL:LD      HL,(VCLRV)
        JP      (HL)
VREST:  LD      HL,(VRSTV)
        JP      (HL)
VRDROW: LD      HL,(VRDRV)
        JP      (HL)
VWRROW: LD      HL,(VWRRV)
        JP      (HL)

TMSVEC: DW      TMSPUT,TMSGET,TMSCLR,TMSSET,TMSRDR,TMSWRR

; Whether the ST7920 GLCD answers on port 07h: Z when its busy flag clears
; within 256 polls. The GLCD console itself is a resident, GLCD.PRL.
GLCCMD  EQU     $07
GLCPRB: LD      B,0
GLCPL:  IN      A,(GLCCMD)
        RLCA
        JR      NC,GLCPOK
        DJNZ    GLCPL
        OR      1
        RET
GLCPOK: XOR     A
        RET

; Around a row move of rows C to VSBOT (the rest of the screen stays): on the
; PICO9918 the move is built in the hidden page, shown at the next flip.
VTMBEG: LD      A,(CONMOD)
        CP      CMCRT
        RET     NZ
        LD      B,C             ; rows C to VSBOT move
        LD      A,(VSBOT)
        LD      C,A
        JP      TMSMBEG
VTMEND: XOR     A
        LD      (TMVCOPY),A
        RET
