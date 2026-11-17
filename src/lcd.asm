; HD44780 character LCD: boot status
; and the ROM console selected on UC1. Cold boot uses row 0
; for the banner and rows 1/2 for A: and
; B: labels. While the LCD is the
; console it owns all four rows, and the
; status writers and the raw-row service
; leave it alone.

; Z only for the active ROM LCD route.
; A registered driver may have any row
; count. Keeps BC, DE and HL.

LCDCON:
  ld a,(CONMOD)
  cp CMUC1
  ret nz
  ld a,(CONAUX)
  or a
  ret

; Console restore: the panel's width,
; then the mode commands and home on
; each controller, without the clear.

LCVRST:
  call LCDCOL
  ld (VWID),a
  ld b,4
  jp LCDI0

; The ROM panel's columns: 20, or 40 on
; two controllers. Changes AF.

LCDCOL:
  ld a,(LCDPRF)
  or a
  ld a,20
  ret z
  add a,a
  ret

; Initialise the selected panel profile.
; Cold boot's zero profile uses only
; the original controller. A second
; controller is probed only by LCDWID.
; Nothing while LCD owns the console.

LCDINIT:
  call LCDCON
  ret z
  ld b,5
  jp LCDI0

; A=20 or 40 selects that ROM profile.
; The explicit 40-column request proves
; two independent address counters.
; Failure keeps the profile and display
; data unchanged, returning carry/NZ.
; Success returns carry clear. Changes
; AF, BC, DE and HL.

LCDWID:
  cp 40
  jr z,LCDW40
  cp 20
  jp nz,LCD40F
  ld a,(LCDPRF)
  or a
  ret z
  ld c,LCD2CMD
  ld a,$0C       ; second cursor off
  call LCDC
  xor a
  jr LCDWSET

LCDW40:
  call LCD40
  jp nz,LCD40F
  ld a,8

LCDWSET:
  ld hl,LCDPRF
  cp (hl)
  ret z
  ld (hl),a
  ld a,(CONMOD)
  cp CMUC1
  jr nz,LCDWOK
  ld a,(CONAUX)
  or a
  jr nz,LCDWOK
  ld (CONMOD),a  ; refresh LCD geometry

LCDWOK:
  xor a
  ret

; Probe without writing display data.
; Save both address counters before
; changing either, then restore them on
; success or mismatch. Initial busy
; failure precedes all address writes.

LCD40:
  ld c,LCDCMD
  call LCDWAIT
  jr c,LCD40F
  in a,(c)
  and $7F
  ld e,a
  ld c,LCD2CMD
  call LCDWAIT
  jr c,LCD40F
  in a,(c)
  and $7F
  ld d,a
  ld a,$AA
  call LCDC
  ld c,LCDCMD
  ld a,$95
  call LCDC
  ld b,$15
  call LCDPRB
  jr nz,LCD40R
  ld c,LCD2CMD
  ld b,$2A
  call LCDPRB

LCD40R:
  push af
  ld c,LCDCMD
  ld a,e
  or $80
  call LCDC
  ld c,LCD2CMD
  ld a,d
  or $80
  call LCDC
  pop af
  ret

LCD40F:
  ld a,1
  or a
  scf
  ret

; B commands on each controller.

LCDI0:
  ld c,LCDCMD
  push bc
  call LCDI1
  pop bc
  ld a,(LCDPRF)
  or a
  ret z
  ld c,LCD2CMD

LCDI1:
  ld hl,LCDSEQ

LCDI:
  ld a,(hl)
  call LCDC
  inc hl
  djnz LCDI
  ret

; Z if the controller at port C is ready
; with address counter B.

LCDPRB:
  call LCDWAIT
  jr c,LCD40F
  in a,(c)
  cp b
  ret

; Wait for the controller whose command
; or data port is C: ready or 256 polls.
; Carry is the last busy bit.
; Changes AF; keeps BC, DE and HL.

LCDWAIT:
  push bc
  res 7,c        ; busy is on the
  ld b,0         ; command port

LCDW:
  in a,(c)
  rlca
  jr nc,LCDWX
  djnz LCDW

LCDWX:
  pop bc
  ret

; Console put: A at row B, column C. As
; before; 80h is the cursor flip, sent
; to the cell's own controller. The
; terminal keeps its column in C.
; Changes AF, E and HL.

LCVPUT:
  push bc
  cp $80
  jr z,LCVP1     ; a cursor flip
  and $7F
  ld e,a
  call LCSEL
  ld a,e

LCVPX:
  call LCDC
  pop bc
  ret

LCVP1:
  call LCSEL
  res 7,c        ; its command port
  ld a,(VCURV)
  add a,a        ; 0Ch, or 0Eh shown
  or $0C
  jr LCVPX

; Address row B, column C on the row's
; controller. Returns C = its data port.
; LCDROWS lies in one page.
; Keeps B and DE. Changes AF and HL.

LCSEL:
  ld a,(LCDPRF)
  add a,b
  add a,b        ; two bytes a row
  add a,LOW(LCDROWS)
  ld l,a
  ld h,HIGH(LCDROWS)
  ld a,(hl)      ; the row's controller
  inc hl
  ld h,(hl)      ; its first address
  ld l,c
  ld c,a
  ld a,h
  add a,l
  call LCDC
  set 7,c        ; data follows
  ret

; Output A to port C, a command or data,
; after the bounded wait, even if still
; busy. Keeps AF, BC, DE and HL.

LCDD:
LCDC:
  push af
  call LCDWAIT
  pop af
  out (c),a
  ret

; Console clear: row B from column C to
; its end. Changes AF, E and HL.

LCVCLR:
  ld a,(VWID)
  sub c
  ret c
  ret z
  ld e,a         ; cells to blank
  push bc
  call LCSEL

LCVC1:
  ld a,' '
  call LCDC
  dec e
  jr nz,LCVC1
  pop bc
  ret

; Console row read and write between
; LINEBUF and row B, the panel's width
; after one address command.
; Changes AF, BC and HL.

LCVRD:
  call LCVROW

LCVR1:
  call LCDWAIT
  ini            ; a cell in, B counts
  jr nz,LCVR1
  ret

LCVWR:
  call LCVROW

LCVW1:
  call LCDWAIT
  outi           ; a cell out
  jr nz,LCVW1
  ret

LCVROW:
  ld c,0
  call LCSEL
  ld hl,LINEBUF
  ld a,(VWID)
  ld b,a
  ret

; Mark row 3 ROM-owned (CDWRD), then
; attempt HL's zero-terminated text.
; Returns B=3; otherwise as LCDROW.

LCDWRD:
  push hl
  ld hl,CONDEV
  set 7,(hl)
  pop hl

; Attempt recovery text at HL on row 3.
; It must end in zero; ownership stays
; unchanged. B=3; otherwise as LCDROW.

LCD3:
  ld b,3

; Requires row B=0..3, a readable
; zero-terminated string at HL.
; Starts at column 0; no 20-column
; clipping. Empty text sets the address.
; HL stops on zero; A=0, carry set, NZ.
; Keeps B/DE; changes AF/C/HL.
; Bytes are attempted even if busy.
; Nothing is written while the LCD is
; the console: A=4, Z, carry set as
; after a write, HL unchanged.

LCDROW:
  call LCDCON
  scf            ; GLCLD's failure sign
  ret z
  push hl
  ld c,0
  call LCSEL
  pop hl

LCDS:
  ld a,(hl)
  cp 1           ; zero: carry, NZ
  ret c
  call LCDC
  inc hl
  jr LCDS

; Show A:/B: labels on LCD rows 1/2.
; A missing volume or descriptor-read
; failure leaves that row unchanged.
; LINEBUF is scroll scratch: no console
; call while its label text is live.
; Changes AF, BC, DE, HL, IX.

LCDVOLS:
  ld c,0

LCDV:
  push bc
  call DRVDESC   ; Z: IX=descriptor
  pop bc
  jr nz,LCDVN    ; absent/read error
  ld hl,LINEBUF
  call DRVLAB
  push bc
  ld a,c
  inc a
  ld b,a
  ld hl,LINEBUF
  call LCDROW
  pop bc

LCDVN:
  inc c
  ld a,c
  cp 2
  jr c,LCDV
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
  push bc
  add a,'A'
  ld (hl),a
  inc hl
  ld (hl),':'
  inc hl
  ld (hl),' '
  inc hl
  push ix
  pop de
  ex de,hl       ; DE=buffer+3, HL=IX
  ld bc,DLABEL
  add hl,bc
  ld bc,11
  ldir
  xor a
  ld (de),a
  pop bc
  ret
