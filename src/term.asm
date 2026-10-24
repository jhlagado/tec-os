; Video terminal: interprets console output for a character display of
; VWID columns by VHGT rows. Serial output is passed through untouched; the
; remote terminal does its own interpretation.
;
; Supported: printable ASCII, CR, LF, BS, HT (8-column stops), FF (clear and
; home), and these ANSI sequences: ESC [ n A/B/C/D (cursor moves), ESC [ r;c H
; and f (position, 1-based), ESC [ J and 2J (clear to end, clear screen),
; ESC [ K (clear to end of line), ESC [ 0 m and 7 m (normal, reverse). Other
; sequences are consumed and ignored. Characters at 80h-FFh are the reverse
; images of 00h-7Fh, which also draws the cursor.
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
        LD      HL,(VROW)       ; L = row, H = column
        LD      B,L
        LD      C,H
        CALL    VPUT
        LD      A,(VCOL)
        INC     A
        LD      HL,VWID
        CP      (HL)
        JP      C,VTCOL
        XOR     A
        LD      (VCOL),A
        CALL    VTLF
        JP      VTDONE
VTCOL:  LD      (VCOL),A
VTDONE: JP      CURSHOW

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
        OR      A
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
CURFLIP:PUSH    BC
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
