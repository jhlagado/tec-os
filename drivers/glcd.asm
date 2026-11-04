; GLCD.SVC: the ST7920 128 x 64 GLCD console as a driver below (0006h), 21
; columns x 8 rows of 6 x 8 cells, built from the ROM's GLCD code. Its INIT
; checks that the controller answers and hands the ROM its video table through
; TNDRVR; the CCP then takes the console, unless a PICO9918 has it, and the
; ROM's terminal calls its six routines directly, on the caller's stack. It
; keeps its screen text and its counters here, draws from the ROM's font, and moves rows to
; and from the ROM's LINEBUF, whose address TNDRVR returns. Its REMOVE, at
; UNLOAD, gives the console back to serial.
%INCLUDE "../src/abi.inc"

GLCOLS  EQU     21
GLROWS  EQU     8
IOBYTE  EQU     $0003

        ORG     $0100
HDR:	DB	'D',SVCFMT,0,1	; removable
        DW      0,0,0,0         ; REMOVE, size, extra, relocation: the writer's
        DB      2,0,6           ; over the base: BDOS, BIOS, CCP
        DW      0               ; INIT: the writer's
        DB      "GLCD    "

; The video vector, in the ROM's order: VPUT, VGET, VCLREOL, VREST, VRDROW,
; VWRROW.
VTAB:   DW      GLCPUT,GLCGET,GLCCLR,GLCRST,GLRDR,GLWRR
        DW      0               ; only the PICO9918 has row moves to show
        DB      GLCOLS,GLROWS
LBUF:   DW      0               ; LINEBUF, from TNDRVR

; INIT refuses if the controller doesn't answer or another GLCD.SVC has the
; console. With another display the console, it loads all the same and the
; ROM's loader leaves the console where it is (SVCGO): a line in STARTUP.CMD
; gives way to PICO.SVC quietly (KE-150). It publishes no record. REMOVE gives
; the console back, to PICO.SVC if that is in.
INIT:	LD	C,TNFONT	; the ROM's font; a ROM before ABI 5.1
	CALL	ABICALL		; refuses the number, and INIT with it
	RET	C
	LD	(FONTP),HL
	CALL	GLCWAIT
	LD	A,TNENODV	; no controller answers: absent, which a
	SCF			; line in STARTUP.CMD passes over quietly
        RET     NZ
	LD	B,3		; UC1:
        LD      HL,VTAB
	LD	C,TNDRVR
	CALL	ABICALL
        RET     C
        LD      (LBUF),HL
        LD      HL,0
        OR      A
        RET
REMOVE: LD      DE,PICONAM
	LD	BC,$0100+TNFIND	; version 1 or later
	CALL	ABICALL
        JR      C,REMOV1
        LD      HL,IOBYTE       ; UC1: becomes CRT:, and no other field changes
        LD      A,(HL)
        CPL
        AND     3
        JR      NZ,REMOV1
        RES     1,(HL)
REMOV1:	LD	B,3		; UC1:'s table dropped
        LD      HL,0
	LD	C,TNDRVR
	JP	ABICALL
PICONAM:DB      "PICO    "

GLCCMD  EQU     $07
GLCDAT  EQU     $87

; Wait until the controller is ready. Z when ready, NZ after 256 polls.
; Preserves BC, DE, HL; the count is kept in GLWN, not on the stack, since
; the routines run on their caller's.
GLCWAIT:XOR     A
        LD      (GLWN),A
GLCWL:  IN      A,(GLCCMD)
        RLCA
        JR      NC,GLCWOK
        LD      A,(GLWN)
        DEC     A
        LD      (GLWN),A
        JR      NZ,GLCWL
        OR      1
        RET
GLCWOK: XOR     A
        RET

; Send command A, or data A, once the controller is ready. Preserve BC, DE,
; HL.
GLCC:   LD      (GLOUT),A
        CALL    GLCWAIT
        LD      A,(GLOUT)
        OUT     (GLCCMD),A
        RET
GLCDW:  LD      (GLOUT),A
        CALL    GLCWAIT
        LD      A,(GLOUT)
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

; Clear row B from column C to the end of the line. At a pending wrap C is past
; the row: the count would be 256 and the fill would run on through the text and
; the font.
GLCCLR:	LD	A,C
	CP	GLCOLS
	RET	NC		; no cells left to erase
	CALL	GLCADR
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
; of the character is set. Preserves DE; destroys BC, which GLCCMP keeps.
GLGLY:  LD      C,A
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
	LD	A,(FONTP)	; the font's start, added by hand so that C
	ADD	A,L		; and DE stay
        LD      L,A
	LD	A,(FONTP+1)
        ADC     A,H
        LD      H,A
        LD      A,(HL)
        BIT     7,C
        RET     Z
        CPL
        AND     $FC
        RET

; For each word: the first character it touches and how many.
GLCSPAN:DB      0,3, 2,4, 5,3, 8,3, 10,4, 13,3, 16,3, 18,3

; ---- State: the screen's characters and the drawing counters -----------------
GLTEXT: DS      GLCOLS*GLROWS,' '
GLY:    DS      1
GLW:    DS      1
GLROWP: DS      2
GLOFF:  DS      1
GLWN:   DS      1
GLOUT:  DS      1
FONTP:  DW      0               ; the ROM's font, from TNFONT

IMGEND:
