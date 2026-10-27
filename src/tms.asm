; PICO9918 console display on the TEC-Deck video card. The PICO9918 is a
; TMS9918A-compatible VDP with the F18A's 80-column text mode.
;
; Port BEh is VRAM data and BFh is control. TMSCOLS from the configuration
; selects 80-column text (80 x 24, 6-pixel cells), 40-column text or
; Graphics I (32 x 24, 8-pixel cells). VRAM: patterns at 0000h, names at 0800h, Graphics I colours at
; 2000h and sprite attributes at 1B00h. Patterns 00h-7Fh are the console font
; and 80h-FFh their reverse images. No VRAM access timing is enforced; the
; board's limits are not yet known.

VDPDAT  EQU     $BE
VDPCTL  EQU     $BF
TNAME   EQU     TMSNAME         ; 0800h, or 1000h for 80 columns (4 KiB aligned)
; A second name table one page up (2000h for 80 columns, 0C00h otherwise)
; lets row moves be built out of sight and shown with one register write.
%IF TMS80
TPGOFF  EQU     $10
%ELSE
TPGOFF  EQU     $04
%ENDIF
TCOLOR  EQU     $2000
TSPRITE EQU     $1B00

; Detect and initialise the display. Z when present. VIDINIT has already
; pointed the terminal's driver vectors here.
TMSINIT:LD      HL,$3FFF        ; VRAM answers with what was written
        LD      A,$5A
        CALL    TMSPOKE
        CALL    TMSPEEK
        CP      $5A
        RET     NZ
        LD      A,$A5
        CALL    TMSPOKE
        CALL    TMSPEEK
        CP      $A5
        RET     NZ
        CALL    TMSSET
        LD      A,TMSCOLS
        LD      (VWID),A
        LD      A,24
        LD      (VHGT),A
        XOR     A
        LD      (VROW),A
        LD      (VCOL),A
        CALL    VTCLS
        XOR     A
        RET

; Load registers 0-7, the font and its reverse images, and in Graphics I the
; colours and an empty sprite table. Warm boot calls this through VREST, so
; a program that changed the mode or the patterns leaves a working console.
; The name table, and so the text on the screen, is left alone.
TMSSET: LD      HL,TMSREGS
        LD      B,8
        LD      C,$80
TMSR:   LD      A,(HL)
        OUT     (VDPCTL),A
        LD      A,C
        OUT     (VDPCTL),A
        INC     HL
        INC     C
        DJNZ    TMSR
        XOR     A               ; show the latest page, any move finished
        LD      (TMVCOPY),A
        LD      A,(TPDRAW)
        LD      (TPSHOW),A
        CALL    TMSR2
        LD      HL,0            ; 256 patterns: font, then its reverse
        CALL    TMSWA
        LD      D,0             ; character code
TMSPAT: LD      A,D
        AND     $7F
        SUB     $20
        JR      C,TMSBLK        ; codes below 20h are blank
        LD      L,A             ; HL = FONT + 8 * (code - 20h)
        LD      H,0
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        LD      BC,FONT
        ADD     HL,BC
        JR      TMSGLY
TMSBLK: LD      HL,FONT         ; the space glyph
TMSGLY: LD      B,8
TMSROW: LD      A,(HL)
        BIT     7,D
        JR      Z,TMSOUT
        CPL
TMSOUT: OUT     (VDPDAT),A
        INC     HL
        DJNZ    TMSROW
        INC     D
        JR      NZ,TMSPAT
%IF TMS32
        LD      HL,TCOLOR       ; Graphics I: white on black for every group
        CALL    TMSWA
        LD      B,32
TMSCOL: LD      A,$F1
        OUT     (VDPDAT),A
        DJNZ    TMSCOL
        LD      HL,TSPRITE      ; no sprites
        CALL    TMSWA
        LD      A,$D0
        OUT     (VDPDAT),A
%ENDIF
        RET

; Write A to VRAM address HL.
TMSPOKE:PUSH    AF
        CALL    TMSWA
        POP     AF
        OUT     (VDPDAT),A
        RET
; Read VRAM address HL into A.
TMSPEEK:CALL    TMSRA
        IN      A,(VDPDAT)
        RET

; Set the VRAM write address to HL.
TMSWA:  LD      A,L
        OUT     (VDPCTL),A
        LD      A,H
        AND     $3F
        OR      $40
        OUT     (VDPCTL),A
        RET
; Set the VRAM read address to HL.
TMSRA:  LD      A,L
        OUT     (VDPCTL),A
        LD      A,H
        AND     $3F
        OUT     (VDPCTL),A
        RET

; HL = address of row B, column C in the page being drawn. Destroys AF, DE.
TMSCELL:LD      A,B
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,TMSROWT
        ADD     HL,DE
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        LD      A,(TPDRAW)
        ADD     A,H
        LD      H,A
        LD      E,C
        ADD     HL,DE
        RET
TMSROWT:DW      TNAME,TNAME+TMSCOLS,TNAME+2*TMSCOLS,TNAME+3*TMSCOLS
        DW      TNAME+4*TMSCOLS,TNAME+5*TMSCOLS,TNAME+6*TMSCOLS,TNAME+7*TMSCOLS
        DW      TNAME+8*TMSCOLS,TNAME+9*TMSCOLS,TNAME+10*TMSCOLS,TNAME+11*TMSCOLS
        DW      TNAME+12*TMSCOLS,TNAME+13*TMSCOLS,TNAME+14*TMSCOLS,TNAME+15*TMSCOLS
        DW      TNAME+16*TMSCOLS,TNAME+17*TMSCOLS,TNAME+18*TMSCOLS,TNAME+19*TMSCOLS
        DW      TNAME+20*TMSCOLS,TNAME+21*TMSCOLS,TNAME+22*TMSCOLS,TNAME+23*TMSCOLS

; Copy row B to LINEBUF, or LINEBUF to row B, as one block. Destroy AF, BC,
; DE, HL. While a move builds the hidden page, rows are read from the page
; on show.
TMSRDR: LD      A,(TMVCOPY)
        OR      A
        JR      Z,TMSRD1
        LD      A,(TPDRAW)
        PUSH    AF
        LD      A,(TPSHOW)
        LD      (TPDRAW),A
        CALL    TMSRD1
        POP     AF
        LD      (TPDRAW),A
        RET
TMSRD1: LD      C,0
        CALL    TMSCELL
        CALL    TMSRA
        LD      HL,LINEBUF
        LD      BC,TMSCOLS*256+VDPDAT
        INIR
        RET
TMSWRR: LD      C,0
        CALL    TMSCELL
        CALL    TMSWA
        LD      HL,LINEBUF
        LD      BC,TMSCOLS*256+VDPDAT
        OTIR
        RET

; Put A at row B, column C. Destroys AF, DE, HL.
TMSPUT: PUSH    AF
        CALL    TMSCELL
        CALL    TMSWA
        POP     AF
        OUT     (VDPDAT),A
        RET

; A = the character at row B, column C. Destroys DE, HL.
TMSGET: CALL    TMSCELL
        JP      TMSPEEK

; Clear row B from column C to the end of the line.
TMSCLR: CALL    TMSCELL
        CALL    TMSWA
        LD      A,TMSCOLS
        SUB     C
        LD      B,A
TMSCLL: LD      A,' '
        OUT     (VDPDAT),A
        DJNZ    TMSCLL
        RET

; Start a move of rows B to C. If the page drawn is already the page shown,
; draw the other one from now on, copying the rows outside B to C across;
; the move then reads the shown page and writes the hidden one. A move still
; waiting to be shown is shown first, so output is never more than one move
; behind.
TMSMBEG:LD      A,(TPDRAW)
        LD      HL,TPSHOW
        CP      (HL)
        JR      Z,TMSMB1
        PUSH    BC
        CALL    TMSFLIP
        POP     BC
TMSMB1: LD      A,(TPSHOW)
        XOR     TPGOFF
        LD      (TPDRAW),A
        LD      A,1
        LD      (TMVCOPY),A
        LD      D,0
TMSMBL: LD      A,D
        CP      B
        JR      C,TMSMBC
        CP      C
        JR      C,TMSMBN
        JR      Z,TMSMBN
TMSMBC: PUSH    BC
        PUSH    DE
        LD      B,D
        CALL    TMSRDR
        POP     DE
        PUSH    DE
        LD      B,D
        CALL    TMSWRR
        POP     DE
        POP     BC
TMSMBN: INC     D
        LD      A,D
        CP      24
        JR      NZ,TMSMBL
        RET

; Show the page drawn, if it is not already shown. Called when a program asks
; for a key, so a finished move appears in one frame. Destroys AF, HL.
TMSFLIP:LD      A,(VCLAIM)         ; a program owns the registers
        OR      A
        RET     NZ
        LD      A,(TPDRAW)
        LD      HL,TPSHOW
        CP      (HL)
        RET     Z
        LD      (HL),A
; Point register 2 at the page shown.
TMSR2:  LD      A,(TPSHOW)
        RRCA
        RRCA
        LD      HL,TMSREGS+2
        ADD     A,(HL)
        OUT     (VDPCTL),A
        LD      A,$82
        OUT     (VDPCTL),A
        RET

; Registers 0-7.
; - 80 columns (PICO9918 TEXT80, also the V9938 TEXT2 and F18A T80 mode):
;   R0 bit 2 with text mode, names at a 4 KiB boundary (R2 low bits set as
;   the V9938 requires), patterns at 0000h, white on dark blue. No unlock is
;   needed.
; - 40 columns: text mode, the same colours.
; - Graphics I: patterns 0000h, colours 2000h, sprites 1B00h/3800h.
%IF TMS32
TMSREGS:DB      $00,$C0,TNAME/$400,TCOLOR/$40,$00,TSPRITE/$80,$07,$F1
%ELSE
%IF TMS80
TMSREGS:DB      $04,$50,TNAME/$400+3,$00,$00,$00,$00,$F4
%ELSE
TMSREGS:DB      $00,$D0,TNAME/$400,$00,$00,$00,$00,$F4
%ENDIF
%ENDIF
