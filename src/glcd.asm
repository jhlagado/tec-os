; The GLCD console. Its drawing code is a driver, GLCD.DRV, below
; (0006h); its INIT hands the ROM its video table through GLHOOK (ABIGLCD),
; and CONSW then points the terminal's vector at that table for UC1:. Its
; REMOVE calls GLHOOK with 0, which puts the console back to serial.

; HL = the resident's video table, six words in TMSVEC's order (VPUT, VGET,
; VCLREOL, VREST, VRDROW, VWRROW): kept for CONSW, and HL = LINEBUF on
; return with carry clear, where VRDROW and VWRROW move a row; carry set
; and nothing changed if a table is kept already. HL = 0: the table
; dropped, the console back to serial and the vector back to the TMS9918's.
GLHOOK: LD      A,H
        OR      L
        JR      Z,GLHOFF
        LD      A,(CONDEV)      ; CDMTX, bit 0: no keyboard, no GLCD console
        RRCA
        CCF
        RET     C
        LD      A,(GLVEC+1)     ; a table in RAM is at 0100h or above
        OR      A
        SCF
        RET     NZ
        LD      (GLVEC),HL
        LD      HL,LINEBUF
        OR      A
        RET
GLHOFF: LD      (GLVEC),HL
        LD      HL,CONDEV       ; CDGLC: no GLCD console now
        RES     2,(HL)
        LD      HL,TMSVEC
        CALL    VIDSET
        LD      A,$FF           ; the console is chosen again at its next call
        LD      (CONACT),A
        OR      A
        RET

; Load A:GLCD.DRV if there is a GLCD and its resident is not in, and make it
; the console: carry set if there is none or it will not load (the LCD says
; so).
GLCLD:  LD      A,(CONDEV)
        AND     CDGLC
        RET     NZ              ; in already
        LD      HL,GLCFCB
        LD      DE,CMDFCB
        LD      BC,12
        LDIR
        CALL    DRVGO
        RET     NC
GLCNO:  LD      HL,GLCMSG
        LD      B,3
        CALL    LCDROW
        SCF
        RET

; Read CMDFCB's driver and install it. A driver that gave GLHOOK a table is the
; GLCD: CDGLC goes on, and it is the console unless a PICO9918 is. Carry set if
; it wouldn't read or install.
DRVGO:  CALL    LOADCOM
        RET     C
        CALL    DRVLOAD
        RET     C
        LD      HL,CONDEV
        BIT     2,(HL)
        RET     NZ
        LD      A,(GLVEC+1)
        OR      A
        RET     Z
        SET     2,(HL)          ; CDGLC
        BIT     1,(HL)          ; CDTMS
        RET     NZ
        LD      B,CMUC1
        JR      CONSET
SERCON: LD      B,CMTTY         ; the console mode B, at once
CONSET: LD      A,(IOBYTE)
        AND     $FC
        OR      B
        LD      (IOBYTE),A
        LD      A,$FF
        LD      (CONACT),A
        JP      CONSEL

