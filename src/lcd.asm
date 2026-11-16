; HD44780 20 x 4 LCD: boot status, and
; the console for UC1 while no loaded
; driver holds it. Cold boot uses row 0
; for the banner and rows 1/2 for A: and
; B: labels. While the LCD is the
; console it owns all four rows, and the
; status writers and the raw-row service
; leave it alone.

; Z while the LCD is the console: only
; its console has four rows. A=VHGT.
; Keeps BC, DE and HL.

LCDCON:
  ld a,(VHGT)
  cp 4
  ret

; Console restore: the three mode
; commands again, without the clear, so
; the screen stays over a warm boot.

LCVRST:
  ld b,3
  jr LCDI0

; Attempt LCDSEQ's four commands:
; 8-bit, two-line, display on, cursor
; off, incrementing writes, clear.
; Changes AF, B, HL; returns B=0 for
; cold boot's row-zero write. With the
; LCD as the console this clears its
; screen once, after the banner; the
; console's own cursor does not move.

LCDINIT:
  ld b,4

; B commands from LCDSEQ's start.

LCDI0:
  ld hl,LCDSEQ

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

; Console put: A at row B, column C.
; The panel has no reverse video, so
; bit 7 is dropped. 80h alone is the
; terminal's cursor flip, since the
; console's get returns 0: nothing is
; written, the hardware cursor goes on
; while the terminal shows its cursor
; (VCURV) and off otherwise, and the
; address returns to the cell, where
; that cursor stands.
; Changes AF, E and HL.

LCVPUT:
  cp $80
  jr z,LCVP1     ; a cursor flip
  and $7F
  ld e,a
  call LCSEL
  ld a,e
  jr LCDD

LCVP1:
  ld a,(VCURV)
  add a,a        ; 0Ch, or 0Eh shown
  or $0C
  call LCDC

; Address row B, column C: B=0..3,
; C below 20. LCDROWS lies in one page.
; Keeps BC and DE. Changes AF and HL.

LCSEL:
  ld hl,LCDROWS
  ld a,b
  add a,l
  ld l,a
  ld a,(hl)
  add a,c        ; the cell's address

; Output command A after the bounded
; wait, even if still busy. Keeps AF,
; BC, DE and HL.

LCDC:
  push af
  call LCDWAIT
  pop af
  out (LCDCMD),a
  ret

; Output data A the same way. The
; display steps to the next column.

LCDD:
  push af
  call LCDWAIT
  pop af
  out (LCDDAT),a
  ret

; Console clear: row B from column C to
; its end. C at or past the width, a
; pending wrap, clears nothing.
; Changes AF, E and HL.

LCVCLR:
  ld a,(VWID)
  sub c
  ret c
  ret z
  ld e,a         ; cells to blank
  call LCSEL

LCVC1:
  ld a,' '
  call LCDD
  dec e
  jr nz,LCVC1
  ret

; Console row read: row B into LINEBUF,
; from the panel's own display memory,
; which is the only copy of the screen.
; Changes AF, BC and HL.

LCVRD:
  call LCVROW

LCVR1:
  call LCDWAIT
  ini            ; a cell in, B counts
  jr nz,LCVR1
  ret

; Console row write: LINEBUF to row B.
; Changes AF, BC and HL.

LCVWR:
  call LCVROW

LCVW1:
  call LCDWAIT
  outi           ; a cell out
  jr nz,LCVW1
  ret

; Address row B's first cell. Returns
; HL=LINEBUF, B=20 cells, C=data port.

LCVROW:
  ld c,0
  call LCSEL
  ld hl,LINEBUF
  ld bc,20*256+LCDDAT
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
; the console: A=4, Z, HL unchanged.

LCDROW:
  call LCDCON
  ret z
  push hl
  ld c,0
  call LCSEL
  pop hl

LCDS:
  ld a,(hl)
  cp 1           ; zero: carry, NZ
  ret c
  call LCDD
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
