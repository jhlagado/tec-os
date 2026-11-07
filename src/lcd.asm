; HD44780 20 x 4 status LCD.
; Cold boot uses row 0 for the banner
; and rows 1/2 for A: and B: labels.


; Attempt LCDSEQ's four commands:
; 8-bit, two-line, display on, cursor
; off, incrementing writes, clear.
; Changes AF, B, HL; returns B=0 for
; cold boot's row-zero write.

LCDINIT:
  ld hl,LCDSEQ
  ld b,4

LCDI:
  ld a,(hl)
  call LCDC
  inc hl
  djnz LCDI
  ret

; Return after ready or 256 polls.
; Carry is the last busy bit (bit 7).
; Changes AF; keeps BC, DE and HL.

LCDWAIT:
  push bc
  ld b,0

LCDW:
  in a,(LCDCMD)
  rlca
  jr nc,LCDWX
  djnz LCDW

LCDWX:
  pop bc
  ret

; Output command A after the bounded
; wait, even if still busy. Keeps AF,
; BC, DE and HL.

LCDC:
  push af
  call LCDWAIT
  pop af
  out (LCDCMD),a
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
; Keeps BC/DE; changes AF/HL.
; Bytes are attempted even if busy.

LCDROW:
  ld a,b
  push hl
  ld hl,LCDROWS
  add a,l
  ld l,a
  jr nc,LCDR1
  inc h          ; table page carry

LCDR1:
  ld a,(hl)
  pop hl
  call LCDC

LCDS:
  ld a,(hl)
  cp 1           ; zero: carry, NZ
  ret c
  push af        ; LCDWAIT changes A
  call LCDWAIT
  pop af

; the display steps to the next column

  out (LCDDAT),a
  inc hl
  jr LCDS

; Show A:/B: labels on LCD rows 1/2.
; A missing volume or descriptor-read
; failure leaves that row unchanged.
; LINEBUF is scroll scratch: no console
; call while its label text is live.
; Changes AF, BC, DE, HL, IX. A physical
; descriptor fill can also change I;
; completed fills leave I=0, but reuse
; and early failure need not.

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
