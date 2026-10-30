; Video displays. VIDINIT records in CONDEV whether the PICO9918 answers; the
; console mode then points the terminal's driver vectors at a driver's table: VPUT (A at row B, column C), VGET, VCLREOL, VREST, which puts
; back the display mode and character set after a program may have changed
; them, leaving the picture alone, and VRDROW and VWRROW, which copy row B to
; and from LINEBUF. Scrolling is a line delete in the terminal.

VIDINIT:CALL    TMSINIT
        RET     NZ
        LD      HL,CONDEV
        SET     1,(HL)          ; CDTMS
        RET

VPUT:   LD      HL,(VPUTV)
        JP      (HL)
VGET:   LD      HL,(VGETV)
        JP      (HL)
VCLREOL:LD      HL,(VCLRV)
        JP      (HL)
VREST:  LD      HL,(VRSTV)
VHLJP:  JP      (HL)
VRDROW: LD      HL,(VRDRV)
        JP      (HL)
VWRROW: LD      HL,(VWRRV)
        JP      (HL)

; The word for what only the PICO9918 does, when it is the console and no
; program has claimed it: A = 0 show a finished row move; 1 begin a move of rows
; C to VSBOT; 2 end one. Destroys AF, HL.
VTMBEG: LD      B,C
        LD      A,(VSBOT)
        LD      C,A
        LD      A,1
        JR      VTFN
VTMEND: LD      A,2
        JR      VTFN
VTFLIP: XOR     A
VTFN:   LD      L,A
        LD      A,(CONMOD)
        CP      CMCRT
        RET     NZ
        CALL    VTOWN
        RET     NZ
        LD      A,L
        LD      HL,(VFNV)
        JP      (HL)
