; GLCD.PRL as a resident (KS20's model, not the product): the driver of
; drivers/glcd.asm loaded below (0006h) as kind 1. INIT hands the six video
; routines to the ROM, REMOVE puts the console back to serial; the rows move
; straight between the screen text and LINEBUF, so the ROM's row wrappers,
; its transfer buffer and XCALL are not used. It runs on its caller's stack.
;
; The model has no new ROM entry: glcd.mjs patches CONSW's LD HL,DRVVEC to
; LD HL,(GLVEC), and INIT and REMOVE store and call the ROM's own symbols,
; which the model puts in place of the EQUs line below. The entry the brief adds would take HL = VTAB and
; return HL = LINEBUF (INIT), or HL = 0 to restore the console (REMOVE).

; ROM EQUS

GLCOLS  EQU     21
GLROWS  EQU     8

        ORG     $0100
HDR:    DB      "TNM",1,1,0     ; a resident
        JP      0
        DW      INIT,REMOVE
        DB      "GLCD    "

; The video vector, in the ROM's order: VPUT, VGET, VCLREOL, VREST, VRDROW,
; VWRROW.
VTAB:   DW      GLCPUT,GLCGET,GLCCLR,GLCRST,GLRDR,GLWRR
LBUF:   DW      0               ; LINEBUF, from the ROM

INIT:   LD      HL,VTAB         ; the entry: LD HL,VTAB / CALL entry
        LD      (GLVEC),HL
        LD      HL,LINEBUF
        LD      (LBUF),HL
        RET
REMOVE: LD      HL,CONDEV       ; the entry with HL = 0: UNLOAD's driver branch
        RES     2,(HL)
        LD      HL,TMSVEC
        CALL    VIDSET
        JP      SERCON

GLCCMD  EQU     $07
GLCDAT  EQU     $87

; Wait until the controller is ready. Z when ready, NZ after the time-out.
; Preserves BC, DE, HL.
GLCWAIT:PUSH    BC
        LD      B,0
GLCWL:  IN      A,(GLCCMD)
        RLCA
        JR      NC,GLCWOK
        DJNZ    GLCWL
        POP     BC
        OR      1
        RET
GLCWOK: POP     BC
        XOR     A
        RET

; Send command A, or data A. Preserve BC, DE, HL.
GLCC:   PUSH    AF
        CALL    GLCWAIT
        POP     AF
        OUT     (GLCCMD),A
        RET
GLCDW:  PUSH    AF
        CALL    GLCWAIT
        POP     AF
        OUT     (GLCDAT),A
        RET

; Copy row B to LINEBUF, or LINEBUF to row B and redraw it.
GLRDR:  LD      C,0
        CALL    GLCADR
        LD      DE,(LBUF)
        LD      BC,GLCOLS
        LDIR
        RET
GLWRR:  PUSH    BC
        LD      C,0
        CALL    GLCADR
        EX      DE,HL
        LD      HL,(LBUF)
        LD      BC,GLCOLS
        LDIR
        POP     BC
        JP      GLCROW

; VREST, at install and at warm boot: put the controller in graphics mode
; with the display on and its text layer clear. Graphics RAM keeps whatever
; a program drew until the console next writes over it.
GLCRST: CALL    GLCWAIT
        RET     NZ
        LD      HL,GLCMOD
        LD      B,5
GLCRSL: LD      A,(HL)
        CALL    GLCC
        INC     HL
        DJNZ    GLCRSL
        RET
GLCMOD: DB      $30,$0C,$01,$34,$36

; HL = GLTEXT address of row B, column C. Preserves BC, DE.
GLCADR: PUSH    DE
        LD      HL,GLTEXT
        LD      DE,GLCOLS
        LD      A,B
        OR      A
        JR      Z,GLCAC
GLCAM:  ADD     HL,DE
        DEC     A
        JR      NZ,GLCAM
GLCAC:  LD      E,C
        ADD     HL,DE
        POP     DE
        RET

; Put A at row B, column C and redraw the words its cell touches.
GLCPUT: PUSH    AF
        CALL    GLCADR
        POP     AF
        LD      (HL),A
        PUSH    BC
        LD      C,0
        CALL    GLCADR
        POP     BC
        LD      (GLROWP),HL
        LD      A,C             ; the cell spans pixels 6C to 6C+5
        ADD     A,A
        LD      E,A
        ADD     A,A
        ADD     A,E
        LD      E,A
        SRL     A
        SRL     A
        SRL     A
        SRL     A
        LD      D,A             ; first word
        LD      A,E
        ADD     A,5
        SRL     A
        SRL     A
        SRL     A
        SRL     A
        LD      E,A             ; last word
        LD      A,B
        ADD     A,A
        ADD     A,A
        ADD     A,A
        LD      (GLY),A
        LD      C,8
GLCPR:  LD      A,D
GLCPW:  LD      (GLW),A
        PUSH    BC
        PUSH    DE
        CALL    GLCSETA
        CALL    GLCCMP
        LD      A,D
        CALL    GLCDW
        LD      A,E
        CALL    GLCDW
        POP     DE
        POP     BC
        LD      A,(GLW)
        CP      E
        JR      Z,GLCPN
        INC     A
        JR      GLCPW
GLCPN:  LD      HL,GLY
        INC     (HL)
        DEC     C
        JR      NZ,GLCPR
        RET

; A = the character at row B, column C.
GLCGET: CALL    GLCADR
        LD      A,(HL)
        RET

; Clear row B from column C to the end of the line.
GLCCLR: CALL    GLCADR
        LD      A,GLCOLS
        SUB     C
GLCCL:  LD      (HL),' '
        INC     HL
        DEC     A
        JR      NZ,GLCCL
        JR      GLCROW

; Redraw text row B: eight pixel rows, each streamed as eight words.
GLCROW: LD      C,0
        CALL    GLCADR
        LD      (GLROWP),HL
        LD      A,B
        ADD     A,A
        ADD     A,A
        ADD     A,A
        LD      (GLY),A
        LD      C,8
GLCRL:  XOR     A
        LD      (GLW),A
        PUSH    BC
        CALL    GLCSETA
GLCRW:  CALL    GLCCMP
        LD      A,D
        CALL    GLCDW
        LD      A,E
        CALL    GLCDW
        LD      HL,GLW
        INC     (HL)
        LD      A,(HL)
        CP      8
        JR      NZ,GLCRW
        POP     BC
        LD      HL,GLY
        INC     (HL)
        DEC     C
        JR      NZ,GLCRL
        RET

; Set the graphics address to pixel row GLY, word GLW.
GLCSETA:LD      A,(GLY)
        LD      B,0
        CP      32
        JR      C,GLCSU
        SUB     32
        LD      B,8
GLCSU:  OR      $80
        CALL    GLCC
        LD      A,(GLW)
        ADD     A,B
        OR      $80
        JP      GLCC

; DE = the 16 pixels of word GLW on pixel row GLY, D on the left. A cell's
; glyph row is 6 pixels (5 of glyph, 1 of space); a reverse cell inverts all 6.
GLCCMP: LD      A,(GLW)
        ADD     A,A
        LD      HL,GLCSPAN
        ADD     A,L
        LD      L,A
        JR      NC,GLCCS
        INC     H
GLCCS:  LD      B,(HL)          ; first character
        INC     HL
        LD      C,(HL)          ; how many
        LD      A,B             ; offset = 6 * first - 16 * word, signed
        ADD     A,A
        LD      L,A
        ADD     A,A
        ADD     A,L
        LD      L,A
        LD      A,(GLW)
        ADD     A,A
        ADD     A,A
        ADD     A,A
        ADD     A,A
        NEG
        ADD     A,L
        LD      (GLOFF),A
        LD      DE,0
GLCCH:  PUSH    BC
        LD      HL,(GLROWP)
        LD      A,B
        ADD     A,L
        LD      L,A
        JR      NC,GLCCG
        INC     H
GLCCG:  LD      A,(HL)
        CALL    GLGLY
        LD      H,A
        LD      L,0
        LD      A,(GLOFF)
        OR      A
        JR      Z,GLCCO
        JP      M,GLCCLF
GLCCR:  SRL     H
        RR      L
        DEC     A
        JR      NZ,GLCCR
        JR      GLCCO
GLCCLF: NEG
GLCCLL: ADD     HL,HL
        DEC     A
        JR      NZ,GLCCLL
GLCCO:  LD      A,D
        OR      H
        LD      D,A
        LD      A,E
        OR      L
        LD      E,A
        LD      A,(GLOFF)
        ADD     A,6
        LD      (GLOFF),A
        POP     BC
        INC     B
        DEC     C
        JR      NZ,GLCCH
        RET

; A = glyph row (GLY mod 8) of character A in bits 7-2, reversed when bit 7
; of the character is set. Preserves DE.
GLGLY:  PUSH    DE
        LD      E,A
        AND     $7F
        SUB     $20
        JR      NC,GLGL1
        XOR     A               ; control codes draw as a space
GLGL1:  LD      L,A
        LD      H,0
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        LD      A,(GLY)
        AND     7
        ADD     A,L
        LD      L,A
        LD      BC,($FF23)      ; the ROM's font, through the FF00h table
        ADD     HL,BC
        LD      A,(HL)
        BIT     7,E
        JR      Z,GLGL2
        CPL
        AND     $FC
GLGL2:  POP     DE
        RET

; For each word: the first character it touches and how many.
GLCSPAN:DB      0,3, 2,4, 5,3, 8,3, 10,4, 13,3, 16,3, 18,3

; ---- State: the screen's characters and the drawing counters -----------------
GLTEXT: DS      GLCOLS*GLROWS,' '
GLY:    DS      1
GLW:    DS      1
GLROWP: DS      2
GLOFF:  DS      1
