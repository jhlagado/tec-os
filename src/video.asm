; Video displays. VIDINIT records in CONDEV whether the PICO9918 answers; the
; console mode then points the terminal's driver vectors at a driver's table: VPUT (A at row B, column C), VGET, VCLREOL, VREST, which puts
; back the display mode and character set after a program may have changed
; them, leaving the picture alone, and VRDROW and VWRROW, which copy row B to
; and from LINEBUF. Scrolling is a line delete in the terminal.

VIDINIT:CALL    TMSINIT
        RET     NZ
        LD      HL,CONDEV
        SET     1,(HL)          ; CDTMS
	JP	PISTART		; the console, with the matrix keyboard

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

; ---- The video drivers' hook -----------------------------------------------
; GLCD.SVC hands the ROM a table through TNDRVR (abi.inc), and CONSW points
; the terminal's vector at it for UC1:; its REMOVE calls it with HL = 0. CRT:'s
; table, PIVEC, is the ROM's own, set by PISTART.

; A = CMCRT or CMUC1, HL = the driver's table: the terminal's six words (VPUT,
; VGET, VCLREOL, VREST, VRDROW, VWRROW), the word for VTFN's functions, then
; columns and rows. Kept for CONSW, and HL = LINEBUF on return with carry clear,
; where VRDROW and VWRROW move a row; carry set and nothing changed if a table is
; kept already, or there is no matrix keyboard. HL = 0: the table dropped, and
; the console chosen again at its next call, carry clear.
VIDHOOK: ADD     A,LOW(PIVEC)-1
        LD      E,A
        LD      D,HIGH(PIVEC)
        LD      A,H
        OR      L
        JR      Z,VIDHOFF
        LD      A,(CONDEV)      ; CDMTX, bit 0
        RRCA
        CCF
        RET     C
        INC     DE
        LD      A,(DE)          ; a table in RAM is at 0100h or above
        DEC     DE
        OR      A
        SCF
        RET     NZ
        EX      DE,HL
        LD      (HL),E
        INC     HL
        LD      (HL),D
        LD      HL,LINEBUF
        OR      A
        RET
VIDHOFF: EX      DE,HL
        LD      (HL),D
        INC     HL
        LD      (HL),D
        LD      A,L
        CP      LOW(GLVEC+1)
        JR      NZ,VIDHF1
        LD      HL,CONDEV       ; CDGLC: no GLCD console now
        RES     2,(HL)
VIDHF1: XOR     A               ; serial in effect, so a field naming the
        LD      (CONMOD),A      ; display acts at the next console call
        RET                     ; carry clear
