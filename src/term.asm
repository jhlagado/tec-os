; Video terminal: interprets console output for a character display of
; VWID columns by VHGT rows. Serial output is passed through untouched; the
; remote terminal does its own interpretation.
;
; A character in the last column leaves the cursor past the edge; the line
; wraps only when another printable character follows, as on a VT100.
;
; Supported: printable ASCII, CR, LF, BS, HT (8-column stops), FF (clear and
; home), and these ANSI sequences: ESC [ n A/B/C/D (cursor moves), ESC [ r;c H
; and f (position, 1-based), ESC [ J and 2J (clear to end, clear screen),
; ESC [ K (clear to end of line), ESC [ 0 m and 7 m (normal, reverse),
; ESC [ n @ and n P (insert and delete characters at the cursor, shifting the
; rest of the line), ESC [ n L and n M (insert and delete lines at the
; cursor row, shifting the rows below; the cursor goes to column 1). Other
; sequences are consumed and ignored. Characters at 80h-FFh are the reverse
; images of 00h-7Fh, which also draws the cursor. The cursor is shown only
; while console input is awaited, so output does not pay for redrawing it.
;
; The driver supplies VIDINIT (Z when a display is present), VPUT (A at row
; B, column C), VGET, VSCROLL and VCLREOL (from row B, column C).

; Output C to the video terminal. Destroys AF, BC, DE, HL.
VTOUT:  CALL    CURHIDE
        LD      A,(ESCST)
        OR      A
        JP      NZ,VTESC
        LD      A,C
        CP      $20
        JR      C,VTCTL
        CP      $7F
        JP      NC,VTDONE
        LD      HL,VATTR
        OR      (HL)
        LD      E,A
        LD      A,(VCOL)        ; a pending wrap happens before the character
        LD      HL,VWID
        CP      (HL)
        JR      C,VTNOWR
        XOR     A
        LD      (VCOL),A
        PUSH    DE
        CALL    VTLF
        POP     DE
VTNOWR: LD      A,E
        LD      HL,(VROW)       ; L = row, H = column
        LD      B,L
        LD      C,H
        CALL    VPUT
        LD      A,(VCOL)        ; may reach VWID: the wrap waits for the next one
        INC     A
VTCOL:  LD      (VCOL),A
VTDONE: RET

VTCTL:  CP      13
        JP      Z,VTCR
        CP      10
        JP      Z,VTLF0
        CP      8
        JP      Z,VTBS
        CP      9
        JP      Z,VTTAB
        CP      12
        JP      Z,VTFF
        CP      27
        JP      NZ,VTDONE
        LD      A,1
        LD      (ESCST),A
        JP      VTDONE
VTCR:   XOR     A
        LD      (VCOL),A
        JP      VTDONE
VTLF0:  CALL    VTLF
        JP      VTDONE
VTBS:   LD      A,(VCOL)
        LD      HL,VWID         ; from a pending wrap, back to the last column
        CP      (HL)
        JR      C,VTBS1
        LD      A,(HL)
VTBS1:  OR      A
        JP      Z,VTDONE
        DEC     A
        LD      (VCOL),A
        JP      VTDONE
VTTAB:  LD      A,(VCOL)
        OR      7
        INC     A
        LD      HL,VWID
        CP      (HL)
        JP      C,VTCOL
        LD      A,(HL)
        DEC     A
        JP      VTCOL
VTFF:   CALL    VTCLS
        XOR     A
        LD      (VROW),A
        LD      (VCOL),A
        JP      VTDONE

; Move down a line, scrolling at the bottom.
VTLF:   LD      A,(VROW)
        INC     A
        LD      HL,VHGT
        CP      (HL)
        JR      NC,VTSCRL
        LD      (VROW),A
        RET
VTSCRL: JP      VSCROLL

; Clear the whole screen.
VTCLS:  LD      B,0
VTCLL:  LD      C,0
        PUSH    BC
        CALL    VCLREOL
        POP     BC
        INC     B
        LD      A,(VHGT)
        CP      B
        JR      NZ,VTCLL
        RET

; Escape sequences. ESCST: 1 after ESC, 2 in the first parameter, 3 in the
; second.
VTESC:  CP      1
        JP      NZ,VTPAR
        LD      A,C
        CP      '['
        LD      A,0
        JR      NZ,VTESCX
        LD      (ESCP1),A
        DEC     A               ; no second parameter yet
        LD      (ESCP2),A
        LD      A,2
VTESCX: LD      (ESCST),A
        JP      VTDONE
VTPAR:  LD      A,C
        CP      '0'
        JP      C,VTPNOD
        CP      '9'+1
        JP      NC,VTPNOD
        SUB     '0'             ; parameter = parameter * 10 + digit
        LD      B,A
        LD      HL,ESCP1
        LD      A,(ESCST)
        CP      2
        JR      Z,VTPD
        INC     HL
VTPD:   LD      A,(HL)
        ADD     A,A
        LD      E,A
        ADD     A,A
        ADD     A,A
        ADD     A,E
        ADD     A,B
        LD      (HL),A
        JP      VTDONE
VTPNOD: CP      ';'
        JP      NZ,VTPFIN
        XOR     A
        LD      (ESCP2),A
        LD      A,3
        LD      (ESCST),A
        JP      VTDONE
VTPFIN: CP      '?'             ; private marker: ignore
        JP      Z,VTDONE
        CP      $40
        JP      C,VTDONE        ; other intermediates: keep collecting
        XOR     A
        LD      (ESCST),A
        LD      A,C
        CP      'A'
        JP      Z,VTUP
        CP      'B'
        JP      Z,VTDOWN
        CP      'C'
        JP      Z,VTRIGHT
        CP      'D'
        JP      Z,VTLEFT
        CP      'H'
        JP      Z,VTPOS
        CP      'f'
        JP      Z,VTPOS
        CP      'J'
        JP      Z,VTED
        CP      'K'
        JP      Z,VTEL
        CP      'm'
        JP      Z,VTSGR
        CP      '@'
        JP      Z,VTICH
        CP      'P'
        JP      Z,VTDCH
        CP      'L'
        JP      Z,VTIL
        CP      'M'
        JP      Z,VTDL
        JP      VTDONE

; Count from ESCP1, at least 1, in B.
VTN:    LD      A,(ESCP1)
        OR      A
        JR      NZ,VTN1
        INC     A
VTN1:   LD      B,A
        RET
VTUP:   CALL    VTN
        LD      A,(VROW)
        SUB     B
        JP      NC,VTSETR
        XOR     A
VTSETR: LD      (VROW),A
        JP      VTDONE
VTDOWN: CALL    VTN
        LD      A,(VROW)
        ADD     A,B
        LD      HL,VHGT
        CALL    VTCLIP
        JP      VTSETR
VTRIGHT:CALL    VTN
        LD      A,(VCOL)
        ADD     A,B
        LD      HL,VWID
        CALL    VTCLIP
VTSETC: LD      (VCOL),A
        JP      VTDONE
VTLEFT: CALL    VTN
        LD      A,(VCOL)
        SUB     B
        JP      NC,VTSETC
        XOR     A
        JP      VTSETC
VTPOS:  LD      A,(ESCP1)       ; 1-based, 0 means 1
        OR      A
        JR      Z,VTPR
        DEC     A
VTPR:   LD      HL,VHGT
        CALL    VTCLIP
        LD      (VROW),A
        LD      A,(ESCP2)
        INC     A               ; FFh (absent) and 0 both mean column 1
        JR      Z,VTPC
        DEC     A
        JR      Z,VTPC
        DEC     A
VTPC:   LD      HL,VWID
        CALL    VTCLIP
        JP      VTSETC
VTED:   LD      A,(ESCP1)
        CP      2
        JR      Z,VTED2
        LD      HL,(VROW)       ; clear to the end of the screen
        LD      B,L
        LD      C,H
VTEDL:  PUSH    BC
        CALL    VCLREOL
        POP     BC
        LD      C,0
        INC     B
        LD      A,(VHGT)
        CP      B
        JR      NZ,VTEDL
        JP      VTDONE
VTED2:  CALL    VTCLS
        JP      VTDONE
VTEL:   LD      HL,(VROW)
        LD      B,L
        LD      C,H
        CALL    VCLREOL
        JP      VTDONE
VTSGR:  LD      A,(ESCP1)
        CALL    VTSGR1
        LD      A,(ESCP2)
        CALL    VTSGR1
        JP      VTDONE
VTSGR1: CP      $FF             ; absent
        RET     Z
        CP      7
        LD      B,$80
        JR      Z,VTSGRS
        OR      A
        RET     NZ
        LD      B,A
VTSGRS: LD      A,B
        LD      (VATTR),A
        RET

; ---- Insert and delete -------------------------------------------------------
; The cursor row is edited in LINEBUF and written back as one row.

; B = count clipped to the cells from the cursor to the end of the line, C =
; those cells. Z when the cursor is past the edge.
VTNC:   LD      A,(VWID)
        LD      HL,VCOL
        SUB     (HL)
        JR      Z,VTNCZ
        JR      C,VTNCZ
        LD      C,A
        CALL    VTN
        LD      A,B
        CP      C
        JR      C,VTNC1
        LD      B,C
VTNC1:  OR      1
        RET
VTNCZ:  XOR     A
        RET

; HL = LINEBUF + A. Preserves BC, DE.
LBADR:  PUSH    DE
        LD      E,A
        LD      D,0
        LD      HL,LINEBUF
        ADD     HL,DE
        POP     DE
        RET

VTRDC:  LD      A,(VROW)
        LD      B,A
        JP      VRDROW

VTICH:  CALL    VTNC
        JP      Z,VTDONE
        PUSH    BC
        CALL    VTRDC
        POP     BC
        PUSH    BC
        LD      A,C             ; cells that move right
        SUB     B
        JR      Z,VTICF
        PUSH    AF
        LD      A,(VWID)
        DEC     A
        CALL    LBADR
        EX      DE,HL           ; DE = last cell
        LD      A,(VWID)
        DEC     A
        SUB     B
        CALL    LBADR           ; HL = the cell that lands there
        POP     AF
        LD      C,A
        LD      B,0
        LDDR
VTICF:  POP     BC
        LD      A,(VCOL)
VTBLNK: CALL    LBADR           ; B blanks from LINEBUF + A
VTBLL:  LD      (HL),' '
        INC     HL
        DJNZ    VTBLL
        LD      A,(VROW)
        LD      B,A
        CALL    VWRROW
        JP      VTDONE

VTDCH:  CALL    VTNC
        JP      Z,VTDONE
        PUSH    BC
        CALL    VTRDC
        POP     BC
        PUSH    BC
        LD      A,C             ; cells that move left
        SUB     B
        JR      Z,VTDCF
        PUSH    AF
        LD      A,(VCOL)
        CALL    LBADR
        EX      DE,HL           ; DE = the cursor cell
        LD      A,(VCOL)
        ADD     A,B
        CALL    LBADR           ; HL = the first cell kept
        POP     AF
        LD      C,A
        LD      B,0
        LDIR
VTDCF:  POP     BC
        LD      A,(VWID)
        SUB     B
        JR      VTBLNK

; B = count clipped to the rows from the cursor row to the bottom.
VTNR:   LD      A,(VHGT)
        LD      HL,VROW
        SUB     (HL)
        LD      C,A
        CALL    VTN
        LD      A,B
        CP      C
        RET     C
        LD      B,C
        RET

VTIL:   CALL    VTNR
        XOR     A
        LD      (VCOL),A
        LD      A,(VHGT)        ; C = destination row, from the bottom up
        DEC     A
        LD      C,A
VTILL:  LD      A,(VROW)
        ADD     A,B
        LD      E,A
        LD      A,C
        CP      E
        JR      C,VTILC         ; rows above cursor + count stay
        PUSH    BC
        SUB     B
        LD      B,A
        CALL    VRDROW
        POP     BC
        PUSH    BC
        LD      B,C
        CALL    VWRROW
        POP     BC
        DEC     C
        JR      VTILL
VTILC:  LD      A,(VROW)        ; blank the inserted rows
        LD      C,A
        JR      VTCLRN

VTDL:   CALL    VTNR
        XOR     A
        LD      (VCOL),A
        LD      A,(VROW)        ; C = destination row, from the cursor down
        LD      C,A
VTDLL:  LD      A,(VHGT)
        SUB     B
        LD      E,A
        LD      A,C
        CP      E
        JR      NC,VTCLRN       ; the last count rows are blanked
        PUSH    BC
        ADD     A,B
        LD      B,A
        CALL    VRDROW
        POP     BC
        PUSH    BC
        LD      B,C
        CALL    VWRROW
        POP     BC
        INC     C
        JR      VTDLL

; Clear B rows from row C.
VTCLRN: PUSH    BC
        LD      B,C
        LD      C,0
        CALL    VCLREOL
        POP     BC
        INC     C
        DJNZ    VTCLRN
        JP      VTDONE

; Limit A to one less than (HL).
VTCLIP: CP      (HL)
        RET     C
        LD      A,(HL)
        DEC     A
        RET

; Draw or remove the cursor: the cell at the cursor shows its reverse image.
CURSHOW:LD      A,(VCURV)
        OR      A
        RET     NZ
        INC     A
        LD      (VCURV),A
        JR      CURFLIP
CURHIDE:LD      A,(VCURV)
        OR      A
        RET     Z
        XOR     A
        LD      (VCURV),A
CURFLIP:LD      A,(VCOL)        ; no cursor cell while a wrap is pending
        LD      HL,VWID
        CP      (HL)
        RET     NC
        PUSH    BC
        LD      HL,(VROW)
        LD      B,L
        LD      C,H
        PUSH    BC
        CALL    VGET
        POP     BC
        XOR     $80
        CALL    VPUT
        POP     BC
        RET
