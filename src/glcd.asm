; The GLCD console. Its drawing code is a resident, GLCD.PRL, below
; (0006h); its INIT hands the ROM its video table through GLHOOK (FF25h),
; and CONSW then points the terminal's vector at that table for UC1:. Its
; REMOVE calls GLHOOK with 0, which puts the console back to serial.

; HL = the resident's video table, six words in TMSVEC's order (VPUT, VGET,
; VCLREOL, VREST, VRDROW, VWRROW): kept for CONSW, and HL = LINEBUF on
; return, where VRDROW and VWRROW move a row. HL = 0: the table dropped,
; the console back to serial and the vector back to the TMS9918's.
GLHOOK: LD      (GLVEC),HL
        LD      A,H
        OR      L
        LD      HL,LINEBUF
        RET     NZ
        LD      HL,CONDEV       ; CDGLC: no GLCD console now
        RES     2,(HL)
        LD      HL,TMSVEC
        CALL    VIDSET
        JR      SERCON

; The CCP's first entry after a cold boot that found a GLCD, with the matrix
; keyboard and no PICO9918: load A:GLCD.PRL and make it the console. Until
; then the console is serial, with the 20 x 4 LCD; without the file it stays
; so, and the LCD shows GLCD?. GLCWANT: 0 no GLCD, 1 one to load, 2 tried.
GLCBOOT:LD      HL,GLCWANT
        LD      A,(HL)
        DEC     A
        RET     NZ
        INC     (HL)
        LD      A,(CONDEV)
        AND     CDTMS+CDMTX
        CP      CDMTX
        RET     NZ

; Load A:GLCD.PRL if there is a GLCD and its resident is not in, and make it
; the console: carry set if there is none or it will not load (the LCD says
; so).
GLCLD:  LD      A,(CONDEV)
        AND     CDGLC
        RET     NZ              ; in already
        LD      A,(GLCWANT)
        OR      A
        SCF
        RET     Z
        LD      HL,GLCFCB
        LD      DE,CMDFCB
        LD      BC,12
        LDIR
        CALL    LOADCOM
        JR      C,GLCNO
        CALL    PRLGO
        JR      C,GLCNO
        JR      Z,GLCNO         ; a program, not a resident
        LD      HL,CONDEV
        SET     2,(HL)          ; CDGLC: the resident is in
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
GLCNO:  LD      HL,GLCMSG
        LD      B,3
        CALL    LCDROW
        SCF
        RET

GLCFCB: DB      1,"GLCD    PRL"
GLCMSG: DB      "GLCD?",0

