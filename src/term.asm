; Video terminal, VWID by VHGT. Serial
; output bypasses this interpreter.
; Require positive geometry, width <=80,
; valid vectors/state and classic bank.
; Use the caller stack, with no console
; interrupt re-entry. The public console
; boundary handles claims, not every
; helper. Driver clobbers apply.
; VPUT: A at row B, column C.
; VGET: A from that cell. VCLREOL clears
; from it. VRDROW/VWRROW transfer row B
; via LINEBUF.

; Input 20h-7Eh prints. DEL and 80h-FFh
; are ignored. High-bit stored glyphs
; encode reverse video and the cursor.
; Wrap occurs only at the next printable
; after the final column. The input wait
; shows the cursor, output hides it.
; CR, LF, BS, HT (8-column), FF and ESC:
;   CSI n A/B/C/D: move cursor
;   CSI r;c H/f: screen position
;   CSI J/2J, K: erase
;   CSI 0/7 m: normal/reverse
;   CSI n @/P: insert/delete characters
;   CSI t;b r: scroll region
;   CSI n L/M: insert/delete lines
; Other finals are consumed and ignored.

; Output byte C, hiding any drawn cursor
; first. ESCST routes an active sequence
; to VTESC. Otherwise controls go to
; VTCTL and printable ASCII uses VATTR.
; Pending wrap sets VCOL=0 and calls
; VTLF before drawing. Column may then
; equal VWID again.
; Changes AF/BC/DE/HL and driver regs.

VTOUT:
  call CURHIDE
  ld a,(ESCST)
  or a
  jp nz,VTESC
  ld a,c
  cp $20
  jr c,VTCTL
  cp $7F
  jr nc,VTDONE
  ld hl,VATTR
  or (hl)
  ld e,a
  ld a,(VCOL)
  ld hl,VWID
  cp (hl)
  jr c,VTNOWR
  xor a
  ld (VCOL),a
  push de        ; glyph over scroll
  call VTLF
  pop de

VTNOWR:
  ld a,e
  ld hl,(VROW)
  ld b,l
  ld c,h
  call VPUT
  ld a,(VCOL)
  inc a

VTCOL:
  ld (VCOL),a

VTDONE:
  ret

; Control byte A=C: CR sets column 0, LF
; moves down without changing column.
; BS moves left unless column is 0,
; including from pending wrap.
; HT reaches the next 8-column stop or
; last column. FF clears and homes but
; keeps region/attributes. ESC starts
; state 1. Other controls do nothing.
; Changes AF/BC/DE/HL and callee regs.

VTCTL:
  cp 13
  jr z,VTCR
  cp 10
  jr z,VTLF0
  cp 8
  jr z,VTBS
  cp 9
  jr z,VTTAB
  cp 12
  jr z,VTFF
  cp 27
  jr nz,VTDONE
  ld a,1
  ld (ESCST),a
  jr VTDONE

VTCR:
  xor a
  ld (VCOL),a
  jr VTDONE

VTLF0:
  call VTLF
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
  or a
  jr z,VTDONE
  dec a
  ld (VCOL),a
  jr VTDONE

VTTAB:
  ld a,(VCOL)
  or 7
  inc a
  ld hl,VWID
  cp (hl)
  jr c,VTCOL
  ld a,(hl)
  dec a
  jr VTCOL

VTFF:
  call VTCLS
  xor a
  ld (VROW),a
  ld (VCOL),a
  jr VTDONE

; Line feed: at VSBOT delete one row at
; VSTOP. Otherwise advance if below the
; screen's last row. Column stays.
; Scrolling keeps the logical cursor row
; and tail-calls VTDLR with B=1.
; Changes AF/HL, also BC/DE and driver
; registers when scrolling.

VTLF:
  ld a,(VROW)
  ld hl,VSBOT
  cp (hl)
  jr z,VTLFS
  inc a
  ld hl,VHGT
  cp (hl)
  ret nc
  ld (VROW),a
  ret

VTLFS:
  ld a,(VSTOP)   ; delete the region's
                 ; top line
  ld c,a
  ld b,1         ; B = 1: one line
  jp VTDLR

; Set region to 0..VHGT-1, VHGT>0.
; Cursor, attributes and parser stay.
; Changes AF.

VTREGR:
  xor a
  ld (VSTOP),a
  ld a,(VHGT)
  dec a
  ld (VSBOT),a
  ret

; Clear all rows through VCLREOL from
; column 0. Cursor and region stay.
; Caller supplies valid positive video
; geometry/vectors and handles claims.
; Changes AF/BC and driver clobbers,
; including DE/HL in supplied drivers.

VTCLS:
  ld b,0

VTCLL:
  ld c,0
  push bc
  call VCLREOL
  pop bc
  inc b
  ld a,(VHGT)
  cp b
  jr nz,VTCLL
  ret

; Escape parser: A=ESCST, C=input byte.
; State 1: '[' starts parameters. Any
; other byte is consumed and ends it.
; '[' sets ESCP1=0, ESCP2=FFh (absent),
; state 2. State 3 collects the second.
; Digits accumulate modulo 256. Each ';'
; resets the second parameter to zero.
; '?' and intermediates below 40h leave
; the state active. A final >=40h clears
; ESCST before dispatch. Second value
; 255 also means absent. No full ANSI
; grammar. Changes AF/BC/DE/HL.

VTESC:
  cp 1
  jr nz,VTPAR
  ld a,c
  cp '['
  ld a,0
  jr nz,VTESCX
  ld (ESCP1),a
  dec a
  ld (ESCP2),a
  ld a,2

VTESCX:
  ld (ESCST),a
  jp VTDONE

VTPAR:
  ld a,c
  cp '0'
  jr c,VTPNOD
  cp '9'+1
  jr nc,VTPNOD
  sub '0'
  ld b,a
  ld hl,ESCP1
  ld a,(ESCST)
  cp 2
  jr z,VTPD
  inc hl

VTPD:
  ld a,(hl)
  add a,a
  ld e,a
  add a,a
  add a,a
  add a,e
  add a,b        ; modulo 256: a large
                 ; value wraps
  ld (hl),a
  jp VTDONE

VTPNOD:
  cp ';'
  jr nz,VTPFIN
  xor a
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
  ld a,c
  cp 'A'
  jp z,VTUP
  cp 'B'
  jp z,VTDOWN
  cp 'C'
  jp z,VTRIGHT
  cp 'D'
  jp z,VTLEFT
  cp 'H'
  jp z,VTPOS
  cp 'f'
  jp z,VTPOS
  cp 'J'
  jp z,VTED
  cp 'K'
  jp z,VTEL
  cp 'm'
  jp z,VTSGR
  cp '@'
  jp z,VTICH
  cp 'P'
  jp z,VTDCH
  cp 'L'
  jp z,VTIL
  cp 'M'
  jp z,VTDL
  cp 'r'
  jr z,VTREG
  jp VTDONE

; CSI t;b r: 1-based scroll region.
; First 0 means top 0. Second FFh/0 is
; VHGT-1. Ignore bottom>=VHGT or <=top
; without changing region/cursor. Else
; commit at least two rows and home to
; screen row/column 0. Changes AF/C/HL.
; B and DE stay.

VTREG:
  ld a,(ESCP1)
  or a
  jr z,VTREG1
  dec a

VTREG1:
  ld c,a
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
  dec a

VTREGC:
  ld hl,VHGT
  cp (hl)        ; the bottom off the
                 ; screen: ignored
  jp nc,VTDONE
  cp c           ; bottom at or above
                 ; top: ignored
  jp c,VTDONE
  jp z,VTDONE
  ld (VSBOT),a
  ld a,c
  ld (VSTOP),a
  xor a
  ld (VROW),a
  ld (VCOL),a
  jp VTDONE

; B=ESCP1, absent/zero changed to 1.
; Other byte values stay, including 255.
; Changes AF. Other registers stay.

VTN:
  ld a,(ESCP1)
  or a
  jr nz,VTN1
  inc a

VTN1:
  ld b,a
  ret

; Final actions enter with ESCST=0 and
; ESCP1/ESCP2 set, return via VTDONE.
; They may change AF/BC/DE/HL. Cursor
; moves clip to screen, not the region.
; CSI n A: subtract VTN count from row,
; saturating at 0. VTSETR stores row.

VTUP:
  call VTN
  ld a,(VROW)
  sub b
  jr nc,VTSETR
  xor a

VTSETR:
  ld (VROW),a
  jp VTDONE

; CSI n B: add count to row, saturate
; byte overflow before clipping to
; VHGT-1. Column and region stay.
; Changes AF/B/HL.

VTDOWN:
  call VTN
  ld a,(VROW)
  add a,b
  jr nc,VTDN1
  ld a,$FF       ; saturate before
                 ; clipping to the
                 ; dimension

VTDN1:
  ld hl,VHGT
  call VTCLIP
  jr VTSETR

; CSI n C: add count to column, saturate
; byte overflow before clipping to
; VWID-1. Row and region stay. VTSETC
; also serves left and position actions.
; Changes AF/B/HL.

VTRIGHT:
  call VTN
  ld a,(VCOL)
  add a,b
  jr nc,VTRT1    ; past 255: saturate as
                 ; above
  ld a,$FF

VTRT1:
  ld hl,VWID
  call VTCLIP

VTSETC:
  ld (VCOL),a
  jp VTDONE

; CSI n D: subtract count from column,
; saturating at 0. Row and region stay.
; Changes AF/B.

VTLEFT:
  call VTN
  ld a,(VCOL)
  sub b
  jr nc,VTSETC
  xor a
  jr VTSETC

; CSI r;c H/f: 1-based screen position,
; clipped to VHGT/VWID. First 0 means
; row 0. Second FFh/0 means column 0.
; Coordinates are not region-relative.
; Changes AF/HL.

VTPOS:
  ld a,(ESCP1)
  or a
  jr z,VTPR
  dec a

VTPR:
  ld hl,VHGT
  call VTCLIP
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
  call VTCLIP
  jr VTSETC

; CSI 2J clears all. Any other first
; parameter clears from the cursor cell
; to screen end. Cursor coordinates
; stay, including pending wrap.
; Changes AF/BC/DE/HL and driver regs.

VTED:
  ld a,(ESCP1)
  cp 2
  jr z,VTED2
  ld hl,(VROW)
  ld b,l
  ld c,h

VTEDL:
  push bc
  call VCLREOL
  pop bc
  ld c,0
  inc b
  ld a,(VHGT)
  cp b
  jr nz,VTEDL
  jp VTDONE

VTED2:
  call VTCLS
  jp VTDONE

; CSI K ignores parameters: clear from
; the cursor cell to the row's end.
; Cursor and region stay. Driver/action
; register clobbers apply.

VTEL:
  ld hl,(VROW)
  ld b,l
  ld c,h
  call VCLREOL
  jp VTDONE

; CSI m: apply ESCP1 then ESCP2, later
; recognised value winning. 0=normal,
; 7=reverse. FFh and other values leave
; VATTR unchanged.

VTSGR:
  ld a,(ESCP1)
  call VTSGR1
  ld a,(ESCP2)
  call VTSGR1
  jp VTDONE

; Attribute A: 0 normal, 7 reverse.
; FFh/others leave VATTR unchanged.
; Changes AF/B. Other registers stay.

VTSGR1:
  cp $FF
  ret z
  cp 7
  ld b,$80
  jr z,VTSGRS
  or a
  ret nz
  ld b,a

VTSGRS:
  ld a,b
  ld (VATTR),a
  ret

; Character edits use LINEBUF, then
; write the complete row back. VTNC:
; Z at/past width, B/C not results.
; Else NZ, C=cells remaining and B=count
; clipped to C, at least 1. DE stays.
; Changes AF/HL plus B/C results.

VTNC:
  ld a,(VWID)
  ld hl,VCOL
  sub (hl)       ; cells from the cursor
                 ; to the edge
  jr z,VTNCZ     ; none: the cursor at
                 ; the edge
  jr c,VTNCZ     ; or past it, waiting
                 ; to wrap
  ld c,a
  call VTN
  ld a,b
  cp c
  jr c,VTNC1
  ld b,c

VTNC1:
  or 1           ; NZ for the caller
  ret

VTNCZ:
  xor a          ; Z: nothing to edit
  ret

; HL=LINEBUF+A. Caller bounds A first.
; Keeps A/BC/DE. Changes F.

LBADR:
  push de
  ld e,a
  ld d,0
  ld hl,LINEBUF
  add hl,de
  pop de
  ret

; Read cursor row VROW into LINEBUF
; through VRDROW. Changes AF/B and
; driver registers, including BC/DE/HL.
; Caller saves any required count/state.

VTRDC:
  ld a,(VROW)
  ld b,a
  jp VRDROW

; CSI n @: insert blanks at the cursor,
; shift retained cells right, lose those
; past the edge. VTNC supplies positive
; B and remaining C. Z bypasses row I/O.
; Skip a zero transfer before LDDR.
; VTBLNK fills B cells and writes back.
; Cursor coordinates stay.
; Changes AF/BC/DE/HL and driver regs.

VTICH:
  call VTNC
  jp z,VTDONE
  push bc
  call VTRDC
  pop bc
  push bc
  ld a,c
  sub b
  jr z,VTICF     ; none: only blanks to
                 ; write
  push af
  ld a,(VWID)
  dec a
  call LBADR
  ex de,hl
  ld a,(VWID)
  dec a
  sub b
  call LBADR
  pop af

; Copy from the right to preserve cells
; whose source and destination overlap.

  ld c,a
  ld b,0
  lddr

VTICF:
  pop bc
  ld a,(VCOL)

VTBLNK:
  call LBADR     ; B blanks from LINEBUF
                 ; + A

VTBLL:
  ld (hl),' '    ; a blank in each cell
  inc hl
  djnz VTBLL
  ld a,(VROW)
  ld b,a
  call VWRROW    ; LINEBUF back to row B
  jp VTDONE

; CSI n P: delete cells at the cursor,
; shift later cells left and blank the
; last B through VTBLNK. VTNC supplies
; positive B. Z bypasses row I/O. Skip
; a zero transfer before LDIR. Cursor
; coordinates stay. Changes AF/BC/DE/HL
; and driver registers.

VTDCH:
  call VTNC
  jp z,VTDONE
  push bc
  call VTRDC
  pop bc
  push bc
  ld a,c
  sub b
  jr z,VTDCF     ; none: only blanks to
                 ; write
  push af
  ld a,(VCOL)
  call LBADR
  ex de,hl
  ld a,(VCOL)
  add a,b
  call LBADR
  pop af
  ld c,a
  ld b,0
  ldir

VTDCF:
  pop bc
  ld a,(VWID)    ; the last B cells
                 ; blanked
  sub b
  jr VTBLNK

; Line edit count: Z outside the scroll
; region, no row/column edit and B/C/E
; not results. Inside: NZ, C=cursor row,
; E=rows through VSBOT, B=count clipped
; to E (>=1), VCOL=0.
; Changes AF/E/HL plus B/C results.

VTNR:
  ld a,(VROW)
  ld hl,VSTOP
  cp (hl)
  jr c,VTNRNO
  ld c,a
  ld a,(VSBOT)
  sub c
  jr c,VTNRNO
  inc a
  ld e,a
  call VTN
  ld a,b
  cp e
  jr c,VTNR1
  ld b,e

VTNR1:
  xor a
  ld (VCOL),a
  inc a
  ret

VTNRNO:
  xor a
  ret

; CSI n L/M: insert/delete lines only
; when VTNR returns NZ. Outside region
; no row/column edit. Inside, column 0
; and cursor row stays.
; Changes AF/BC/DE/HL and driver regs.

VTIL:
  call VTNR
  call nz,VTILR
  jp VTDONE

VTDL:
  call VTNR
  call nz,VTDLR
  jp VTDONE

; Insert B>=1 blank rows at C, with
; C+B<=VSBOT+1. Begin the row move then
; copy D-B to D from bottom up via
; LINEBUF, preserving overlap. VTCLRN
; blanks the first B rows from C. PICO
; reads shown and writes hidden page.
; Changes AF/BC/DE/HL and driver regs.

VTILR:
  push bc
  call VTMBEG
  pop bc
  ld a,(VSBOT)
  ld d,a

VTILL:
  ld a,c
  add a,b
  ld e,a
  ld a,d
  cp e
  jr c,VTCLRN
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

; Delete B>=1 rows at C, with
; C+B<=VSBOT+1. Begin the row move then
; copy D+B to D from top down via
; LINEBUF, preserving overlap. VTCLRN
; blanks the final B rows. Cursor row
; stays. VTLF uses this for scrolling.
; Changes AF/BC/DE/HL and driver regs.

VTDLR:
  push bc
  call VTMBEG
  pop bc
  ld d,c

VTDLL:
  ld a,(VSBOT)
  inc a          ; VSBOT+1 less the
                 ; count
  sub b
  ld e,a         ; E = VSBOT+1-B, the
                 ; first row blanked
  ld a,d
  cp e
  jr nc,VTDLC
  push bc
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

; Clear B>=1 rows from C within the
; active geometry, saving BC across each
; clear. Tail-call VTMEND to end the
; move without showing the PICO page.
; Console input calls VTFLIP separately.
; Changes AF/BC/DE/HL and driver regs.

VTCLRN:
  push bc
  ld b,c
  ld c,0
  call VCLREOL
  pop bc
  inc c          ; the next row
  djnz VTCLRN    ; B rows in all
  jp VTMEND

; A=min(A,(HL)-1), positive dimension.
; Keeps HL/BC/DE. Changes F.

VTCLIP:
  cp (hl)
  ret c
  ld a,(hl)
  dec a
  ret

; A=1, NZ only for VCLAIM!=0 and current
; CRT. Else A=0, Z. UC1 is unaffected
; by a PICO claim. No owner identity.
; Keeps BC/DE/HL. Changes F.

VTOWN:
  ld a,(VCLAIM)
  or a
  ret z
  ld a,(CONMOD)
  xor CMCRT
  jr z,VTOWN1
  xor a
  ret

VTOWN1:
  inc a
  ret

; Show/hide the cursor by inverting its
; cell. Claimed current PICO: no action.
; VCURV prevents repeated inversion.
; VCURV can update at pending wrap
; without accessing a cell. Keeps BC.
; Changes AF/HL and driver clobbers,
; including DE in supplied drivers.

CURSHOW:
  call VTOWN
  ret nz
  ld a,(VCURV)
  or a
  ret nz
  inc a
  ld (VCURV),a
  jr CURFLIP

CURHIDE:
  call VTOWN
  ret nz
  ld a,(VCURV)
  or a
  ret z
  xor a
  ld (VCURV),a

CURFLIP:
  ld a,(VCOL)    ; no cursor cell while
                 ; a wrap is pending
  ld hl,VWID
  cp (hl)
  ret nc
  push bc
  ld hl,(VROW)   ; L = row, H = column
  ld b,l
  ld c,h
  push bc
  call VGET
  pop bc         ; position over VGET
  xor $80        ; toggle reverse bit
  call VPUT
  pop bc
  ret
