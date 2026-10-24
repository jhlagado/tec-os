; TMS9918/TMS9929 console display on the TEC-Deck video card.
;
; Port BEh is VRAM data and BFh is control. TMSCOLS from the configuration
; selects text mode (40 x 24, 6-pixel cells) or Graphics I (32 x 24, 8-pixel
; cells). VRAM: patterns at 0000h, names at 0800h, Graphics I colours at
; 2000h and sprite attributes at 1B00h. Patterns 00h-7Fh are the console font
; and 80h-FFh their reverse images. No VRAM access timing is enforced; the
; board's limits are an open item.

VDPDAT  EQU     $BE
VDPCTL  EQU     $BF
TNAME   EQU     $0800
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
        LD      HL,TMSREGS      ; registers 0-7
        LD      B,8
        LD      C,$80
TMSR:   LD      A,(HL)
        OUT     (VDPCTL),A
        LD      A,C
        OUT     (VDPCTL),A
        INC     HL
        INC     C
        DJNZ    TMSR
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

; HL = name-table address of row B, column C. Destroys DE.
TMSCELL:LD      HL,TNAME
        LD      E,C
        LD      D,0
        ADD     HL,DE
        LD      A,B
        OR      A
        RET     Z
        LD      E,TMSCOLS
TMSCL:  ADD     HL,DE
        DEC     A
        JR      NZ,TMSCL
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
        JR      TMSPEEK

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

; Move rows 1-23 up one row through LINEBUF and clear the last row.
TMSSCR: LD      B,1
TMSSCL: PUSH    BC
        LD      C,0
        CALL    TMSCELL
        CALL    TMSRA
        LD      HL,LINEBUF
        LD      B,TMSCOLS
TMSSRR: IN      A,(VDPDAT)
        LD      (HL),A
        INC     HL
        DJNZ    TMSSRR
        POP     BC
        PUSH    BC
        DEC     B
        LD      C,0
        CALL    TMSCELL
        CALL    TMSWA
        LD      HL,LINEBUF
        LD      B,TMSCOLS
TMSSRW: LD      A,(HL)
        OUT     (VDPDAT),A
        INC     HL
        DJNZ    TMSSRW
        POP     BC
        INC     B
        LD      A,B
        CP      24
        JR      NZ,TMSSCL
        LD      B,23
        LD      C,0
        JR      TMSCLR

; Registers 0-7. Text mode: M1, 16K, display on, interrupts off, white on
; dark blue. Graphics I: patterns 0000h, colours 2000h, sprites 1B00h/3800h.
%IF TMS32
TMSREGS:DB      $00,$C0,TNAME/$400,TCOLOR/$40,$00,TSPRITE/$80,$07,$F1
%ELSE
TMSREGS:DB      $00,$D0,TNAME/$400,$00,$00,$00,$00,$F4
%ENDIF
