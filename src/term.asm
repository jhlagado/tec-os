; Video terminal: interprets console
; output for a character display of
; VWID columns by VHGT rows. Serial
; output is passed through untouched;
; the
; remote terminal does its own
; interpretation.
;
; A character in the last column leaves
; the cursor past the edge; the line
; wraps only when another printable
; character follows, as on a VT100.
;
; Supported: printable ASCII, CR, LF,
; BS, HT (8-column stops), FF (clear and
; home), and these ANSI sequences: ESC [
; n A/B/C/D (cursor moves), ESC [ r;c H
; and f (position, 1-based), ESC [ J and
; 2J (clear to end, clear screen),
; ESC [ K (clear to end of line), ESC [
; 0 m and 7 m (normal, reverse),
; ESC [ n @ and n P (insert and delete
; characters at the cursor, shifting the
; rest of the line), ESC [ t ; b r
; (scroll region), ESC [ n L and n M
; (insert
; and delete lines at the cursor row
; within the scroll region; the cursor
; goes to column 1). Other sequences are
; consumed and ignored. Characters at
; 80h-FFh are the reverse images of
; 00h-7Fh, which also draws the cursor.
; The
; cursor is shown only while console
; input is awaited, so output does not
; pay
; for redrawing it.
;
; The display driver's table, copied
; into the vectors by CONSW, supplies
; VPUT
; (A at row B, column C), VGET, VCLREOL
; (from row B, column C), and VRDROW and
; VWRROW (row B to and from LINEBUF);
; video.asm calls through them.

; Output C to the video terminal: a
; printable character at the cursor, a
; control character's action, or the
; next byte of an escape sequence. The
; cursor, if drawn, is removed first.
; Destroys AF, BC, DE, HL.
VTOUT:
  call CURHIDE
  ld a,(ESCST)   ; inside a sequence:
                 ; the parser
  or a
  jp nz,VTESC    ; not 0: the parser
                 ; takes the byte
  ld a,c         ; the character itself
  cp $20         ; below space: a
                 ; control character
  jr c,VTCTL
  cp $7F         ; DEL and 80h-FFh are
                 ; not shown
  jr nc,VTDONE
  ld hl,VATTR    ; 80h for reverse: the
                 ; reverse image
  or (hl)
  ld e,a
  ld a,(VCOL)    ; a pending wrap
                 ; happens before the
                 ; character
  ld hl,VWID
  cp (hl)        ; column VWID: past the
                 ; edge
  jr c,VTNOWR
  xor a          ; column 0 of the next
                 ; line
  ld (VCOL),a
  push de        ; the character,
                 ; through a scroll
  call VTLF
  pop de         ; the character back

VTNOWR:
  ld a,e         ; drawn as is or
                 ; reversed
  ld hl,(VROW)   ; L = row, H = column
  ld b,l
  ld c,h
  call VPUT      ; drawn at row B,
                 ; column C
  ld a,(VCOL)    ; may reach VWID: the
                 ; wrap waits
  inc a          ; one column on

VTCOL:
  ld (VCOL),a

VTDONE:
  ret

; The control characters VTOUT acts on,
; A = C = the character: CR, LF, BS,
; HT, FF, and ESC, which starts a
; sequence; the rest are ignored.
; Destroys
; AF, BC, DE, HL.
VTCTL:
  cp 13          ; CR
  jr z,VTCR
  cp 10          ; LF
  jr z,VTLF0
  cp 8           ; BS
  jr z,VTBS
  cp 9           ; HT
  jr z,VTTAB
  cp 12          ; FF
  jr z,VTFF
  cp 27          ; ESC
  jr nz,VTDONE
  ld a,1         ; the next byte should
                 ; be '['
  ld (ESCST),a
  jr VTDONE

VTCR:
  xor a          ; column 0, the row
                 ; kept
  ld (VCOL),a
  jr VTDONE

VTLF0:
  call VTLF      ; a scroll if at the
                 ; region's bottom
  jr VTDONE

VTBS:
  ld a,(VCOL)
  ld hl,VWID     ; from a pending wrap,
                 ; back to the last
                 ; column
  cp (hl)
  jr c,VTBS1     ; before the edge: as
                 ; it is
  ld a,(hl)      ; past it: from column
                 ; VWID

VTBS1:
  or a           ; at column 0 it stays
  jr z,VTDONE
  dec a          ; one column back
  ld (VCOL),a
  jr VTDONE

VTTAB:
  ld a,(VCOL)
  or 7           ; up to the next
                 ; multiple of 8
  inc a
  ld hl,VWID
  cp (hl)        ; no stop left: the
                 ; last column
  jr c,VTCOL     ; a stop before the
                 ; edge: taken
  ld a,(hl)      ; else the last column
  dec a
  jr VTCOL

VTFF:
  call VTCLS     ; clear, then home
  xor a          ; row 0, column 0
  ld (VROW),a
  ld (VCOL),a
  jr VTDONE

; Move down a line. At the bottom of the
; scroll region the region scrolls up
; a line; below the region the cursor
; stops at the last row. Destroys AF,
; HL, and when it scrolls BC and DE too.
VTLF:
  ld a,(VROW)
  ld hl,VSBOT
  cp (hl)        ; the region's last
                 ; row: scroll
  jr z,VTLFS
  inc a          ; else down a row
  ld hl,VHGT
  cp (hl)        ; the screen's last
                 ; row: stay
  ret nc         ; no row below: the
                 ; cursor stays
  ld (VROW),a    ; the row below
  ret

VTLFS:
  ld a,(VSTOP)   ; delete the region's
                 ; top line
  ld c,a
  ld b,1         ; B = 1: one line
  jp VTDLR

; The scroll region is the whole screen:
; rows 0 to VHGT-1. Destroys AF.
VTREGR:
  xor a
  ld (VSTOP),a   ; the top row, 0
  ld a,(VHGT)
  dec a          ; the bottom row,
                 ; VHGT-1
  ld (VSBOT),a
  ret

; Clear the whole screen, row by row
; through VCLREOL; the cursor is not
; moved. Destroys AF, BC and what the
; driver's VCLREOL does.
VTCLS:
  ld b,0         ; from row 0

VTCLL:
  ld c,0         ; each row from column
                 ; 0
  push bc
  call VCLREOL   ; from column C to the
                 ; row's end
  pop bc
  inc b          ; the next row
  ld a,(VHGT)    ; until the last row is
                 ; done
  cp b
  jr nz,VTCLL    ; VHGT rows cleared
  ret

; Escape sequences. ESCST: 1 after ESC,
; 2 in the first parameter, 3 in the
; second. Entered from VTOUT with A =
; ESCST and C = the byte; ESCP1 and
; ESCP2
; collect the parameters, ESCP2 FFh
; while there is no second one. A final
; byte, 40h or above, ends the sequence
; and is dispatched to its action.
; Destroys AF, BC, DE, HL.
VTESC:
  cp 1           ; past ESC: a parameter
                 ; or the end
  jr nz,VTPAR
  ld a,c
  cp '['         ; any other byte after
                 ; ESC ends it
  ld a,0
  jr nz,VTESCX
  ld (ESCP1),a   ; the first parameter
                 ; starts at 0
  dec a          ; no second parameter
                 ; yet
  ld (ESCP2),a
  ld a,2         ; state 2: the first
                 ; parameter next

VTESCX:
  ld (ESCST),a   ; state 2, or 0 when
                 ; dropped
  jp VTDONE

VTPAR:
  ld a,c
  cp '0'         ; a digit adds to the
                 ; parameter
  jr c,VTPNOD
  cp '9'+1       ; above '9': not a
                 ; digit
  jr nc,VTPNOD
  sub '0'        ; parameter = parameter
                 ; * 10 + digit
  ld b,a
  ld hl,ESCP1
  ld a,(ESCST)   ; state 3: the second
                 ; parameter
  cp 2           ; state 2: the first
                 ; parameter
  jr z,VTPD
  inc hl         ; HL = ESCP2

VTPD:
  ld a,(hl)      ; times 2, kept in E
  add a,a
  ld e,a
  add a,a        ; times 8, plus times
                 ; 2: times 10
  add a,a
  add a,e
  add a,b        ; modulo 256: a large
                 ; value wraps
  ld (hl),a
  jp VTDONE

VTPNOD:
  cp ';'         ; the second parameter
                 ; starts at 0
  jr nz,VTPFIN
  xor a          ; the second parameter
                 ; now collects
  ld (ESCP2),a
  ld a,3         ; state 3
  ld (ESCST),a
  jp VTDONE

VTPFIN:
  cp '?'         ; private marker:
                 ; ignore
  jp z,VTDONE
  cp $40
  jp c,VTDONE    ; other intermediates:
                 ; keep collecting
  xor a          ; a final byte: the
                 ; sequence ends
  ld (ESCST),a
  ld a,c         ; each final byte to
                 ; its action
  cp 'A'
  jp z,VTUP      ; cursor up
  cp 'B'
  jp z,VTDOWN    ; cursor down
  cp 'C'
  jp z,VTRIGHT   ; cursor right
  cp 'D'
  jp z,VTLEFT    ; cursor left
  cp 'H'         ; H and f both position
  jp z,VTPOS
  cp 'f'
  jp z,VTPOS     ; the same as H
  cp 'J'         ; erase in display
  jp z,VTED
  cp 'K'         ; erase in line
  jp z,VTEL
  cp 'm'         ; attributes
  jp z,VTSGR
  cp '@'         ; insert characters
  jp z,VTICH
  cp 'P'         ; delete characters
  jp z,VTDCH
  cp 'L'         ; insert lines
  jp z,VTIL
  cp 'M'         ; delete lines
  jp z,VTDL
  cp 'r'         ; the scroll region
  jr z,VTREG
  jp VTDONE      ; any other: ignored

; ESC [ t ; b r: scroll region rows t to
; b (1-based; absent or 0 means the
; screen's first or last row). The
; region must cover two rows or more;
; the
; cursor goes home, as on a VT100. A
; region that doesn't fit is ignored.
; Destroys AF, C, HL.
VTREG:
  ld a,(ESCP1)
  or a           ; 0 is row 1, else
                 ; 1-based to 0-based
  jr z,VTREG1
  dec a

VTREG1:
  ld c,a         ; top
  ld a,(ESCP2)
  inc a          ; FFh (absent) and 0
                 ; both mean the last
                 ; row
  jr z,VTREGB    ; FFh: no second
                 ; parameter
  dec a
  jr z,VTREGB    ; 0: the default too
  dec a          ; b-1, the 0-based
                 ; bottom
  jr VTREGC

VTREGB:
  ld a,(VHGT)
  dec a          ; the screen's last row

VTREGC:
  ld hl,VHGT     ; A = the 0-based
                 ; bottom
  cp (hl)        ; the bottom off the
                 ; screen: ignored
  jp nc,VTDONE
  cp c           ; bottom at or above
                 ; top: ignored
  jp c,VTDONE
  jp z,VTDONE
  ld (VSBOT),a   ; a region of two rows
                 ; or more
  ld a,c
  ld (VSTOP),a   ; the top
  xor a          ; cursor home
  ld (VROW),a
  ld (VCOL),a    ; column 0
  jp VTDONE

; Count from ESCP1, at least 1, in B.
; Destroys AF.
VTN:
  ld a,(ESCP1)
  or a           ; absent or 0 counts as
                 ; 1
  jr nz,VTN1     ; a count given: taken
  inc a

VTN1:
  ld b,a         ; B = the count
  ret

; The escape actions below run from
; VTPFIN with the sequence ended and the
; parameters in ESCP1 and ESCP2, and
; return through VTDONE. Each destroys
; AF,
; BC, DE, HL. Cursor moves stop at the
; screen's edges, not the region's.

; ESC [ n A: up n rows, stopping at row
; 0.
VTUP:
  call VTN
  ld a,(VROW)    ; row less the count
  sub b
  jr nc,VTSETR   ; no borrow: still on
                 ; the screen
  xor a          ; row 0

VTSETR:
  ld (VROW),a    ; the new row
  jp VTDONE
; ESC [ n B: down n rows, stopping at
; the last row.
VTDOWN:
  call VTN
  ld a,(VROW)    ; row plus the count
  add a,b
  jr nc,VTDN1
  ld a,$FF       ; saturate before
                 ; clipping to the
                 ; dimension

VTDN1:
  ld hl,VHGT
  call VTCLIP    ; to VHGT-1
  jr VTSETR
; ESC [ n C: right n columns, stopping
; at the last column.
VTRIGHT:
  call VTN
  ld a,(VCOL)    ; column plus the count
  add a,b
  jr nc,VTRT1    ; past 255: saturate as
                 ; above
  ld a,$FF

VTRT1:
  ld hl,VWID
  call VTCLIP    ; to VWID-1

VTSETC:
  ld (VCOL),a    ; the new column
  jp VTDONE
; ESC [ n D: left n columns, stopping at
; column 0.
VTLEFT:
  call VTN
  ld a,(VCOL)    ; column less the count
  sub b
  jr nc,VTSETC   ; no borrow: still on
                 ; the screen
  xor a
  jr VTSETC
; ESC [ r ; c H and f: row r, column c,
; each clipped to the screen.
VTPOS:
  ld a,(ESCP1)   ; 1-based, 0 means 1
  or a
  jr z,VTPR      ; absent or 0: row 0
  dec a          ; r-1, the 0-based row

VTPR:
  ld hl,VHGT
  call VTCLIP    ; to VHGT-1
  ld (VROW),a
  ld a,(ESCP2)   ; the column the same
                 ; way
  inc a          ; FFh (absent) and 0
                 ; both mean column 1
  jr z,VTPC      ; FFh: no second
                 ; parameter
  dec a
  jr z,VTPC      ; 0: column 0 too
  dec a          ; c-1, the 0-based
                 ; column

VTPC:
  ld hl,VWID
  call VTCLIP    ; to VWID-1
  jr VTSETC
; ESC [ 2 J clears the screen; ESC [ J,
; and any other parameter, clears
; from the cursor to the end of the
; screen. The cursor stays.
VTED:
  ld a,(ESCP1)
  cp 2           ; 2: the whole screen
  jr z,VTED2
  ld hl,(VROW)   ; clear to the end of
                 ; the screen
  ld b,l
  ld c,h

VTEDL:
  push bc        ; the rest of the
                 ; cursor row, then
  call VCLREOL   ; each row below it
                 ; whole
  pop bc
  ld c,0         ; later rows from
                 ; column 0
  inc b
  ld a,(VHGT)    ; until the last row is
                 ; done
  cp b
  jr nz,VTEDL
  jp VTDONE

VTED2:
  call VTCLS     ; the cursor kept
  jp VTDONE
; ESC [ K, whatever its parameter: clear
; from the cursor to the line's end.
VTEL:
  ld hl,(VROW)
  ld b,l         ; B = row, C = column
  ld c,h         ; C = column
  call VCLREOL   ; from the cursor to
                 ; the edge
  jp VTDONE
; ESC [ m: each of the two parameters, 0
; normal and 7 reverse, in turn.
VTSGR:
  ld a,(ESCP1)
  call VTSGR1    ; the first parameter
  ld a,(ESCP2)
  call VTSGR1    ; then the second
  jp VTDONE
; Act on one attribute parameter in A:
; FFh (absent) and values other than
; 0 and 7 change nothing. Destroys AF,
; B.
VTSGR1:
  cp $FF         ; absent
  ret z
  cp 7           ; 7: reverse, VATTR 80h
  ld b,$80
  jr z,VTSGRS
  or a           ; 0: normal, VATTR 0
  ret nz
  ld b,a         ; B = 0, normal

VTSGRS:
  ld a,b
  ld (VATTR),a   ; 80h reverses each
                 ; character drawn
  ret

; ---- Insert and delete
; --------------------------------------
; The cursor row is edited in LINEBUF
; and written back as one row.

; B = count clipped to the cells from
; the cursor to the end of the line, C =
; those cells. Z when the cursor is past
; the edge, else NZ. Destroys AF, HL.
VTNC:
  ld a,(VWID)
  ld hl,VCOL
  sub (hl)       ; cells from the cursor
                 ; to the edge
  jr z,VTNCZ     ; none: the cursor at
                 ; the edge
  jr c,VTNCZ     ; or past it, waiting
                 ; to wrap
  ld c,a         ; C = the cells from
                 ; the cursor
  call VTN
  ld a,b         ; no more than the
                 ; cells there are
  cp c
  jr c,VTNC1
  ld b,c         ; clipped to C

VTNC1:
  or 1           ; NZ for the caller
  ret

VTNCZ:
  xor a          ; Z: nothing to edit
  ret

; HL = LINEBUF + A. Preserves BC, DE.
LBADR:
  push de
  ld e,a         ; DE = the offset A
  ld d,0
  ld hl,LINEBUF  ; into LINEBUF
  add hl,de
  pop de
  ret

; Read the cursor row into LINEBUF.
; Destroys AF, B and what the driver's
; VRDROW does.
VTRDC:
  ld a,(VROW)
  ld b,a         ; B = the cursor row
  jp VRDROW      ; the driver reads it
                 ; to LINEBUF

; ESC [ n @: insert n blanks at the
; cursor; the cells from it move right
; and
; those pushed past the edge are lost.
; Destroys AF, BC, DE, HL.
VTICH:
  call VTNC
  jp z,VTDONE    ; past the edge:
                 ; nothing to do
  push bc
  call VTRDC     ; the cursor row into
                 ; LINEBUF
  pop bc
  push bc        ; B and C again for the
                 ; blanks
  ld a,c         ; cells that move right
  sub b          ; C less the count
  jr z,VTICF     ; none: only blanks to
                 ; write
  push af        ; the count to move,
                 ; kept
  ld a,(VWID)
  dec a
  call LBADR     ; HL = LINEBUF's last
                 ; cell
  ex de,hl       ; DE = last cell
  ld a,(VWID)
  dec a
  sub b          ; less the count
  call LBADR     ; HL = the cell that
                 ; lands there
  pop af
  ld c,a         ; BC = the cells to
                 ; move, from the
  ld b,0         ; right end so none is
                 ; overwritten
  lddr

VTICF:
  pop bc
  ld a,(VCOL)    ; the B cells opened at
                 ; the cursor

VTBLNK:
  call LBADR     ; B blanks from LINEBUF
                 ; + A

VTBLL:
  ld (hl),' '    ; a blank in each cell
  inc hl
  djnz VTBLL
  ld a,(VROW)    ; the row back on the
                 ; screen
  ld b,a
  call VWRROW    ; LINEBUF back to row B
  jp VTDONE

; ESC [ n P: delete n cells at the
; cursor; the cells after them move left
; and blanks fill in at the right.
; Destroys AF, BC, DE, HL.
VTDCH:
  call VTNC
  jp z,VTDONE    ; past the edge:
                 ; nothing to do
  push bc
  call VTRDC     ; the cursor row into
                 ; LINEBUF
  pop bc
  push bc        ; B and C again for the
                 ; blanks
  ld a,c         ; cells that move left
  sub b          ; C less the count
  jr z,VTDCF     ; none: only blanks to
                 ; write
  push af        ; the count to move,
                 ; kept
  ld a,(VCOL)
  call LBADR     ; HL = the cursor cell
  ex de,hl       ; DE = the cursor cell
  ld a,(VCOL)
  add a,b
  call LBADR     ; HL = the first cell
                 ; kept
  pop af
  ld c,a         ; BC = the cells to
                 ; move, left
  ld b,0         ; to right
  ldir

VTDCF:
  pop bc
  ld a,(VWID)    ; the last B cells
                 ; blanked
  sub b
  jr VTBLNK

; ESC [ n L and ESC [ n M work from the
; cursor row to the bottom of the
; scroll region, and do nothing when the
; cursor is outside it. B = the count
; clipped to those rows, C = the cursor
; row; Z when outside. Inside, the
; cursor goes to column 0. Destroys AF,
; E, HL.
VTNR:
  ld a,(VROW)
  ld hl,VSTOP
  cp (hl)        ; above the region
  jr c,VTNRNO
  ld c,a         ; C = the cursor row
  ld a,(VSBOT)   ; the region's bottom
  sub c          ; below the region
  jr c,VTNRNO
  inc a          ; E = the rows from the
                 ; cursor down
  ld e,a
  call VTN
  ld a,b         ; no more than those
                 ; rows
  cp e
  jr c,VTNR1
  ld b,e         ; clipped to E

VTNR1:
  xor a
  ld (VCOL),a    ; column 0
  inc a          ; NZ
  ret

VTNRNO:
  xor a          ; Z: outside the region
  ret

; ESC [ n L and ESC [ n M: insert or
; delete n lines at the cursor row.
; Destroys AF, BC, DE, HL.
VTIL:
  call VTNR
  call nz,VTILR  ; inside: lines
                 ; inserted
  jp VTDONE

VTDL:
  call VTNR
  call nz,VTDLR  ; inside: lines deleted
  jp VTDONE

; Insert B blank lines at row C: rows C
; to VSBOT move down, the last B lost.
; B is 1 or more and C+B at most
; VSBOT+1. Destroys AF, BC, DE, HL.
VTILR:
  push bc
  call VTMBEG    ; the driver told rows
                 ; C to VSBOT move
  pop bc
  ld a,(VSBOT)   ; D = destination row,
                 ; from the bottom up
  ld d,a

VTILL:
  ld a,c
  add a,b        ; C+B is at most
                 ; VSBOT+1
  ld e,a         ; E = C+B, the first
                 ; row moved into
  ld a,d
  cp e
  jr c,VTCLRN    ; the B rows from C are
                 ; blanked
  push bc
  push de
  sub b          ; row D-B is copied to
                 ; row D
  ld b,a
  call VRDROW    ; row D-B into LINEBUF
  pop de
  push de        ; D back for the write
  ld b,d
  call VWRROW    ; LINEBUF to row D
  pop de         ; the loop's rows and
                 ; count back
  pop bc
  dec d          ; the next row up
  jr VTILL

; Delete B lines at row C: rows below
; move up to VSBOT, blanks fill in.
; B is 1 or more and C+B at most
; VSBOT+1. Destroys AF, BC, DE, HL.
VTDLR:
  push bc
  call VTMBEG    ; the driver told rows
                 ; C to VSBOT move
  pop bc
  ld d,c         ; D = destination row,
                 ; from C down

VTDLL:
  ld a,(VSBOT)
  inc a          ; VSBOT+1 less the
                 ; count
  sub b
  ld e,a         ; E = VSBOT+1-B, the
                 ; first row blanked
  ld a,d
  cp e
  jr nc,VTDLC    ; D at E: only blanks
                 ; remain
  push bc        ; the loop's rows and
                 ; count kept
  push de
  add a,b        ; row D+B is copied to
                 ; row D
  ld b,a
  call VRDROW    ; row D+B into LINEBUF
  pop de
  push de        ; D back for the write
  ld b,d
  call VWRROW    ; LINEBUF to row D
  pop de         ; the loop's rows and
                 ; count back
  pop bc
  inc d          ; the next row down
  jr VTDLL

VTDLC:
  ld c,d         ; the B rows from E are
                 ; blanked

; Clear B rows from row C, then end the
; move. B must be 1 or more.
; Destroys AF, BC, DE, HL.
VTCLRN:
  push bc
  ld b,c         ; the whole of row C
  ld c,0         ; from column 0
  call VCLREOL
  pop bc
  inc c          ; the next row
  djnz VTCLRN    ; B rows in all
  jp VTMEND      ; the driver told the
                 ; move is done

; Limit A to one less than (HL).
; Destroys F.
VTCLIP:
  cp (hl)
  ret c          ; below the limit: kept
  ld a,(hl)      ; else the limit less
                 ; one
  dec a
  ret

; NZ while a program has claimed the
; PICO9918 and it is the console screen:
; the terminal then leaves it alone.
; Returns A = 1 then, else A = 0 and Z.
VTOWN:
  ld a,(VCLAIM)
  or a           ; not claimed: Z
  ret z
  ld a,(CONMOD)
  xor CMCRT      ; Z: the console is the
                 ; CRT, the claimed
  jr z,VTOWN1    ; screen
  xor a          ; elsewhere: A = 0, Z,
                 ; the terminal draws
  ret

VTOWN1:
  inc a          ; A = 1, NZ
  ret

; Draw or remove the cursor: the cell at
; the cursor shows its reverse image.
; VCURV records whether it is drawn, so
; each acts only once; neither touches
; a claimed display. Preserves BC;
; destroys AF, HL and what VGET and VPUT
; do.
CURSHOW:
  call VTOWN
  ret nz
  ld a,(VCURV)   ; already drawn
  or a           ; zero: not drawn yet
  ret nz
  inc a          ; VCURV 1: drawn
  ld (VCURV),a
  jr CURFLIP

CURHIDE:
  call VTOWN
  ret nz
  ld a,(VCURV)   ; not drawn
  or a           ; zero: nothing to
                 ; remove
  ret z
  xor a          ; VCURV 0: removed
  ld (VCURV),a

CURFLIP:
  ld a,(VCOL)    ; no cursor cell while
                 ; a wrap is pending
  ld hl,VWID
  cp (hl)        ; VCOL is VWID: past
                 ; the edge
  ret nc
  push bc        ; the caller's BC kept
  ld hl,(VROW)   ; L = row, H = column
  ld b,l         ; the cursor cell, row
                 ; B, column C
  ld c,h
  push bc
  call VGET      ; A = the character
                 ; there
  pop bc         ; its row and column
                 ; again
  xor $80        ; its reverse image
  call VPUT
  pop bc
  ret
