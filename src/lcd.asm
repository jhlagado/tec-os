; HD44780 character LCD: boot status
; and the ROM console on UC1. Cold
; boot uses row 0
; for the banner and rows 1/2 for A: and
; B: labels. While the LCD is the
; console it owns all four rows, and the
; status writers and the raw-row service
; leave it alone.

; Z only for the active ROM LCD route.
; A registered driver may have any row
; count. Keeps BC, DE and HL.

LCDCON:
  ld a,(CONMOD)  ; physical route first
  cp CMUC1
  ret nz         ; other device owns
                 ; rows
  ld a,(CONAUX)  ; LCD versus live
                 ; driver
  or a
  ret            ; Z only for ROM LCD

; Console restore: the panel's width,
; then the mode commands and home on
; each controller, without the clear.

LCVRST:
  call LCDCOL    ; retained panel
                 ; profile
  ld (VWID),a
  ld b,4         ; omit power-on clear
  jp LCDI0

; The ROM panel's columns: 20, or 40 on
; two controllers. Changes AF.

LCDCOL:
  ld a,(LCDPRF)  ; explicit profile only
  or a
  ld a,20
  ret z          ; stock controller only
  add a,a        ; two 40-column halves
  ret

; Initialise the selected panel profile.
; Cold boot's zero profile uses only
; the original controller. A second
; controller is probed only by LCDWID.
; Nothing while LCD owns the console.

LCDINIT:
  call LCDCON    ; protect console text
  ret z
  ld b,5         ; cold clear included
  jp LCDI0

; A=20 or 40 selects that ROM profile.
; The explicit 40-column request proves
; two independent address counters.
; Failure keeps the profile and display
; data unchanged, returning carry/NZ.
; Success returns carry clear. Changes
; AF, BC, DE and HL.

LCDWID:
  cp 40          ; only supported widths
  jr z,LCDW40
  cp 20
  jp nz,LCD40F   ; NZ/CF refusal
                 ; contract
  ld a,(LCDPRF)
  or a
  ret z          ; no profile transition
  ld c,LCD2CMD   ; old second controller
  ld a,$0C       ; second cursor off
  call LCDC      ; hide its stale cursor
  xor a
  jr LCDWSET     ; retain primary screen

LCDW40:
  call LCD40     ; prove independent RAM
  jp nz,LCD40F   ; do not publish
                 ; failure
  ld a,8         ; second row-table half

LCDWSET:
  ld hl,LCDPRF
  cp (hl)        ; no needless reselect
  ret z
  ld (hl),a      ; publish proven
                 ; profile
  ld a,(CONMOD)
  cp CMUC1
  jr nz,LCDWOK   ; inactive route intact
  ld a,(CONAUX)
  or a
  jr nz,LCDWOK   ; registered route
                 ; intact
  ld (CONMOD),a  ; refresh LCD geometry

LCDWOK:
  xor a          ; success clears carry
  ret

; Probe without writing display data.
; Save both address counters before
; changing either, then restore them on
; success or mismatch. Initial busy
; failure precedes all address writes.

LCD40:
  ld c,LCDCMD    ; first address counter
  call LCDWAIT
  jr c,LCD40F    ; no writes before
                 ; ready
  in a,(c)
  and $7F
  ld e,a         ; retain first counter
  ld c,LCD2CMD
  call LCDWAIT
  jr c,LCD40F    ; retain profile if
                 ; busy
  in a,(c)
  and $7F
  ld d,a         ; retain second counter
  ld a,$AA       ; second proof address
  call LCDC
  ld c,LCDCMD
  ld a,$95       ; distinct first
                 ; address
  call LCDC
  ld b,$15       ; first must remain 15h
  call LCDPRB
  jr nz,LCD40R   ; alias or absent panel
  ld c,LCD2CMD
  ld b,$2A
  call LCDPRB    ; second must remain
                 ; 2Ah

LCD40R:
  push af        ; retain proof result
  ld c,LCDCMD
  ld a,e         ; restore first counter
  or $80
  call LCDC
  ld c,LCD2CMD   ; restore second also
  ld a,d
  or $80
  call LCDC
  pop af         ; return proof flags
  ret

LCD40F:
  ld a,1         ; defined nonzero error
  or a
  scf            ; all refusals set
                 ; carry
  ret

; B commands on each controller.

LCDI0:
  ld c,LCDCMD
  push bc        ; same sequence length
  call LCDI1
  pop bc
  ld a,(LCDPRF)
  or a
  ret z          ; no default port probe
  ld c,LCD2CMD

LCDI1:
  ld hl,LCDSEQ   ; home last on restore

LCDI:
  ld a,(hl)
  call LCDC      ; bounded command write
  inc hl
  djnz LCDI      ; positive command
                 ; count
  ret

; Z if the controller at port C is ready
; with address counter B.

LCDPRB:
  call LCDWAIT
  jr c,LCD40F    ; busy is failure, not
                 ; Z
  in a,(c)
  cp b           ; expected address only
  ret

; Wait for the controller whose command
; or data port is C: ready or 256 polls.
; Carry is the last busy bit.
; Changes AF; keeps BC, DE and HL.

LCDWAIT:
  push bc        ; retain port and count
  res 7,c        ; busy is on the
  ld b,0         ; command port

LCDW:
  in a,(c)
  rlca
  jr nc,LCDWX    ; ready returns CF
                 ; clear
  djnz LCDW      ; busy limit is 256

LCDWX:
  pop bc
  ret            ; keep last sampled CF

; Console put: A at row B, column C. As
; before; 80h is the cursor flip, sent
; to the cell's own controller. The
; terminal keeps its column in C.
; Changes AF, E and HL.

LCVPUT:
  push bc        ; terminal coordinates
  cp $80
  jr z,LCVP1     ; a cursor flip
  and $7F        ; LCD glyphs are 7-bit
  ld e,a
  call LCSEL     ; address owns port C
  ld a,e         ; retain character code

LCVPX:
  call LCDC
  pop bc         ; restore terminal C
  ret

LCVP1:
  call LCSEL     ; cursor cell
                 ; controller
  res 7,c        ; its command port
  ld a,(VCURV)
  add a,a        ; 0Ch, or 0Eh shown
  or $0C         ; display stays enabled
  jr LCVPX

; Address row B, column C on the row's
; controller. Returns C = its data port.
; LCDROWS lies in one page.
; Keeps B and DE. Changes AF and HL.

LCSEL:
  ld a,(LCDPRF)  ; profile table half
  add a,b
  add a,b        ; two bytes a row
  add a,LOW(LCDROWS)
  ld l,a         ; table does not
                 ; straddle
  ld h,HIGH(LCDROWS)
  ld a,(hl)      ; the row's controller
  inc hl
  ld h,(hl)      ; its first address
  ld l,c         ; terminal column
  ld c,a
  ld a,h
  add a,l        ; controller row offset
  call LCDC      ; position before data
  set 7,c        ; data follows
  ret

; Output A to port C, a command or data,
; after the bounded wait, even if still
; busy. Keeps AF, BC, DE and HL.

LCDC:
  push af        ; retain byte and flags
  call LCDWAIT   ; bounded busy probe
  pop af
  out (c),a      ; legacy attempt policy
  ret

; Console clear: row B from column C to
; its end. Changes AF, E and HL.

LCVCLR:
  ld a,(VWID)    ; current profile width
  sub c
  ret c          ; past right edge
  ret z          ; nothing to blank
  ld e,a         ; cells to blank
  push bc        ; retain terminal
                 ; cursor
  call LCSEL     ; one position per run

LCVC1:
  ld a,' '       ; blank glyph, not
                 ; clear
  call LCDC
  dec e
  jr nz,LCVC1    ; no control-sequence
                 ; use
  pop bc         ; caller keeps column
  ret

; Console row read and write between
; LINEBUF and row B, the panel's width
; after one address command.
; Changes AF, BC and HL.

LCVRD:
  call LCVROW    ; select row and width

LCVR1:
  call LCDWAIT   ; wait for each data
                 ; read
  ini            ; a cell in, B counts
  jr nz,LCVR1    ; exactly panel width
  ret

LCVWR:
  call LCVROW    ; same row geometry

LCVW1:
  call LCDWAIT   ; wait for each write
  outi           ; a cell out
  jr nz,LCVW1    ; never beyond panel
                 ; row
  ret

LCVROW:
  ld c,0         ; start at left edge
  call LCSEL
  ld hl,LINEBUF  ; shared terminal row
  ld a,(VWID)
  ld b,a         ; 20 or 40 cells
  ret

; Mark row 3 ROM-owned (CDWRD), then
; attempt HL's zero-terminated text.
; Returns B=3; otherwise as LCDROW.

LCDWRD:
  push hl        ; retain pending text
  ld hl,CONDEV
  set 7,(hl)     ; mark status ownership
  pop hl

; Attempt recovery text at HL on row 3.
; It must end in zero; ownership stays
; unchanged. B=3; otherwise as LCDROW.

LCD3:
  ld b,3         ; reserved status row

; Requires row B=0..3, a readable
; zero-terminated string at HL.
; Starts at column 0; no 20-column
; clipping. Empty text sets the address.
; HL stops on zero; A=0, carry set, NZ.
; Keeps B/DE; changes AF/C/HL.
; Bytes are attempted even if busy.
; Nothing is written while the LCD is
; the console: A=0, Z, carry set as
; after a write, HL unchanged.

LCDROW:
  call LCDCON    ; test active identity
  scf            ; GLCLD's failure sign
  ret z          ; console row untouched
  push hl        ; retain source address
  ld c,0
  call LCSEL     ; status starts at left
  pop hl

LCDS:
  ld a,(hl)
  cp 1           ; zero: carry, NZ
  ret c          ; stop before zero
  call LCDC      ; bounded data attempt
  inc hl
  jr LCDS        ; no width clipping
                 ; here

; Show A:/B: labels on LCD rows 1/2.
; A missing volume or descriptor-read
; failure leaves that row unchanged.
; LINEBUF is scroll scratch: no console
; call while its label text is live.
; Changes AF, BC, DE, HL, IX.

LCDVOLS:
  ld c,0         ; first CP/M drive

LCDV:
  push bc        ; retain drive index
  call DRVDESC   ; Z: IX=descriptor
  pop bc
  jr nz,LCDVN    ; absent/read error
  ld hl,LINEBUF
  call DRVLAB    ; label into row
                 ; scratch
  push bc        ; protect index in C
  ld a,c
  inc a          ; A/B become rows 1/2
  ld b,a
  ld hl,LINEBUF
  call LCDROW    ; may refuse ROM LCD
  pop bc

LCDVN:
  inc c          ; only two status rows
  ld a,c
  cp 2
  jr c,LCDV      ; stop after B label
  ret

; Format C's drive letter, ": ", the
; 11 raw label bytes at IX+DLABEL and
; a zero into 15 writable bytes at HL.
; C=0..3; buffer must allow the forward
; copy. Keeps BC/IX; changes AF/DE/HL.
; DE ends on zero; HL just past label.
; LCDVOLS uses LINEBUF; SHOWVOL uses
; CMDTXT because PUTS can scroll.

DRVLAB:
  ld a,c
  push bc        ; retain drive and row
  add a,'A'      ; CP/M letter display
  ld (hl),a
  inc hl
  ld (hl),':'    ; label separator
  inc hl
  ld (hl),' '
  inc hl
  push ix        ; descriptor is in IX
  pop de
  ex de,hl       ; DE=buffer+3, HL=IX
  ld bc,DLABEL   ; skip descriptor
                 ; header
  add hl,bc
  ld bc,11       ; copy fixed label
                 ; field
  ldir
  xor a          ; zero ends PUTS text
  ld (de),a
  pop bc         ; restore drive index
  ret
