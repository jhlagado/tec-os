; PICO.DRV, PICO40.DRV and PICO32.DRV: the console on the PICO9918, a
; TMS9918A-compatible VDP with the F18A's 80-column text mode, as a driver below
; (0006h): 80 x 24 in 6-pixel cells, 40 x 24, or Graphics I at 32 x 24 in 8-pixel
; cells, one file a width. Its INIT refuses if the ROM's probe found no VDP, and
; hands the ROM its table through ABIGLCD; the load then makes it the console, and
; the ROM's terminal calls its routines directly, on the caller's stack. REMOVE
; refuses while it is the console, since CON CRT can't load it back. Its service,
; "PICO", is how another driver sees it.
;
; VRAM: patterns at 0000h, names at 0800h (1000h for 80 columns), Graphics I
; colours at 2000h and sprite attributes at 1B00h. Patterns 00h-7Fh are the
; console font and 80h-FFh their reverse images. A second name table one page up
; lets row moves be built out of sight and shown with one register write. No VRAM
; access timing is enforced.
%INCLUDE "../src/abi.inc"

VDPDAT  EQU     $BE
VDPCTL  EQU     $BF
COLOUR  EQU     $2000
SPRITE  EQU     $1B00

        ORG     $0100
HDR:    DB      'D',1,0,1       ; removable
        DW      0,0,0,0         ; REMOVE, size, extra, relocation: the writer's
        DB      0,0,0           ; over the base: BDOS, BIOS, CCP
        DW      0               ; INIT: the writer's
        DB      "PICO    "

; In the ROM's order: VPUT, VGET, VCLREOL, VREST, VRDROW, VWRROW, the row moves,
; columns and rows.
VTAB:   DW      TMSPUT,TMSGET,TMSCLR,TMSSET,TMSRDR,TMSWRR,TMSFN
        DB      COLS,24
REC:    DW      0
        DB      "PICO    ",1
        DW      VTAB
LBUF:   DW      0               ; LINEBUF, from ABIGLCD
TPDRAW: DB      0               ; the page drawn and the page shown: offset
TPSHOW: DB      0               ; high byte, 0 or TPG
TMVCOPY:DB      0               ; 1 while a row move builds the hidden page

INIT:   LD      C,0             ; INFO: B = what answered at cold boot
        CALL    ABIHW
        BIT     1,B
        SCF
        RET     Z
        LD      A,1             ; CRT:
        LD      HL,VTAB
        CALL    ABIGLCD
        RET     C
        LD      (LBUF),HL
        LD      HL,REC
        OR      A
        RET

REMOVE: LD      HL,(ABIVID)
        LD      A,(HL)
        CP      COLS
        SCF
        RET     Z
        LD      A,1
        LD      HL,0
        JP      ABIGLCD

; The ROM's three: A = 0 show the page drawn, 1 begin a move of rows B to C,
; 2 end one.
TMSFN:  OR      A
        JR      Z,TMSFLIP
        DEC     A
        JP      Z,TMSMBEG
        LD      (TMVCOPY),A     ; A = 0
        RET

; Show the page drawn, if it is not already shown. Destroys AF, HL.
TMSFLIP:LD      A,(TPDRAW)
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

; Load registers 0-7, the font and its reverse images, and in Graphics I the
; colours and an empty sprite table. VREST calls this, so a program that changed
; the mode or the patterns leaves a working console. The name table, and so the
; text on the screen, is left alone.
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
        JR      NC,TMSCH
        XOR     A               ; codes below 20h are blank, the space glyph
TMSCH:  LD      L,A             ; HL = FONT + 8 * (code - 20h)
        LD      H,0
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        LD      BC,(ABIFONT)
        ADD     HL,BC
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
%IF COLS == 32
        LD      HL,COLOUR       ; Graphics I: white on black for every group
        CALL    TMSWA
        LD      B,32
TMSCOL: LD      A,$F1
        OUT     (VDPDAT),A
        DJNZ    TMSCOL
        LD      HL,SPRITE       ; no sprites
        CALL    TMSWA
        LD      A,$D0
        OUT     (VDPDAT),A
%ENDIF
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
        LD      HL,(LBUF)
        LD      BC,COLS*256+VDPDAT
        INIR
        RET
TMSWRR: LD      C,0
        CALL    TMSCELL
        CALL    TMSWA
        LD      HL,(LBUF)
        LD      BC,COLS*256+VDPDAT
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
        CALL    TMSRA
        IN      A,(VDPDAT)
        RET

; Clear row B from column C to the end of the line.
TMSCLR: LD      A,C
        CP      COLS
        RET     NC              ; pending wrap has no cells left to erase
        CALL    TMSCELL
        CALL    TMSWA
        LD      A,COLS
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
        XOR     TPG
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

TMSROWT:DW      NAMES,NAMES+COLS,NAMES+2*COLS,NAMES+3*COLS
        DW      NAMES+4*COLS,NAMES+5*COLS,NAMES+6*COLS,NAMES+7*COLS
        DW      NAMES+8*COLS,NAMES+9*COLS,NAMES+10*COLS,NAMES+11*COLS
        DW      NAMES+12*COLS,NAMES+13*COLS,NAMES+14*COLS,NAMES+15*COLS
        DW      NAMES+16*COLS,NAMES+17*COLS,NAMES+18*COLS,NAMES+19*COLS
        DW      NAMES+20*COLS,NAMES+21*COLS,NAMES+22*COLS,NAMES+23*COLS

; Registers 0-7.
; - 80 columns (PICO9918 TEXT80, also the V9938 TEXT2 and F18A T80 mode):
;   R0 bit 2 with text mode, names at a 4 KiB boundary (R2 low bits set as
;   the V9938 requires), patterns at 0000h, white on dark blue. No unlock is
;   needed.
; - 40 columns: text mode, the same colours.
; - Graphics I: patterns 0000h, colours 2000h, sprites 1B00h/3800h.
%IF COLS == 32
TMSREGS:DB      $00,$C0,NAMES/$400,COLOUR/$40,$00,SPRITE/$80,$07,$F1
%ENDIF
%IF COLS == 80
TMSREGS:DB      $04,$50,NAMES/$400+3,$00,$00,$00,$00,$F4
%ENDIF
%IF COLS == 40
TMSREGS:DB      $00,$D0,NAMES/$400,$00,$00,$00,$00,$F4
%ENDIF
IMGEND:
