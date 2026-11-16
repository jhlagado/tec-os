; HD44780 character LCD console as a
; loaded driver for UC1: 20 x 4 on one
; controller, or 40 x 4 on two, four
; rows either way. Each row is reached
; through a table of its controller's
; port and its first address, so a
; panel is a table and a width.
; The panel's own display memory is the
; screen: a scroll reads rows back and
; writes them a row up, so the driver
; keeps no copy of the text.
; Calls use the caller's stack and the
; classic bank. Busy polling is bounded
; and a byte the panel will not take is
; dropped.

%INCLUDE "../src/abi.inc"

IOBYTE EQU $0003

; The second controller of a 40 x 4
; panel, rows 2 and 3. No board has one
; yet: these ports are the test model's
; and stand until a board fixes them.

LC2CMD EQU $0C
LC2DAT EQU $8C

  ORG $0100

; Removable format-4 header, no deps.
; Declared stack use: BDOS 2, BIOS 0,
; CCP 6, as the GLCD's driver.

HDR: DB 'D',SVCFMT,0,1
  DW 0,0,0,0
  DB 2,0,6
  DW 0
  DB "LCD     "

; Six terminal vectors in ROM order,
; then no page-function vector, then
; columns and rows. INIT sets the
; columns from the panel it finds.
; LBUF keeps the returned LINEBUF.

VTAB: DW LCPUT,LCGET,LCCLR,LCRST,LCRDR,LCWRR
  DW 0
COLS: DB 20,4
LBUF: DW 0

; For each row, its controller's command
; port and the command for its first
; cell.

LCT20: DB LCDCMD,$80,LCDCMD,$C0,LCDCMD,$94,LCDCMD,$D4
LCT40: DB LCDCMD,$80,LCDCMD,$C0,LC2CMD,$80,LC2CMD,$C0

; The table in use, the port of the
; controller that shows the cursor, and
; 2 while the cursor is shown.

LCTAB: DW LCT20
LCCPRT: DB LCDCMD
LCCUR: DB 0

; Install UC1's hook last. No matrix
; keyboard or no panel: TNENODV, which a
; startup line passes over quietly. A
; table already on UC1, or CRT in a
; startup line, fails as TNDRVR says.
; A second controller that answers
; makes the panel 40 x 4.
; Success: A=0, NC, HL=0, no records.
; Changes AF/BC/DE/HL.

INIT:
  ld c,TNINFO
  call ABICALL
  bit 0,b        ; the matrix keyboard
  jr z,INIT9
  ld c,LCDCMD
  call LCWAIT    ; the panel answers?
  jr c,INIT9
  ld c,LC2CMD
  ld a,$AA       ; address 2Ah
  call LCOUT
  call LCWAIT
  jr c,INIT1     ; no second controller
  in a,(c)       ; its address counter
  cp $2A
  jr nz,INIT1
  ld hl,LCT40
  ld (LCTAB),hl
  ld a,40
  ld (COLS),a

INIT1:
  ld b,3         ; UC1:
  ld hl,VTAB
  ld c,TNDRVR
  call ABICALL
  ret c
  ld (LBUF),hl
  ld hl,0
  or a
  ret

INIT9:
  ld a,TNENODV
  scf
  ret

; UNLOAD: cursor off, then as the GLCD's
; driver: with a PICO record and CON at
; UC1, change that field to CRT, and
; drop UC1's hook. The ROM then chooses
; the console again.
; Returns A=0, Z, NC.

REMOVE:
  call LCHID
  ld de,PICONAM
  ld bc,$0100+TNFIND
  call ABICALL
  jr c,REMOV1
  ld hl,IOBYTE
  ld a,(hl)
  cpl
  and 3
  jr nz,REMOV1
  res 1,(hl)

REMOV1:
  ld b,3
  ld hl,0
  ld c,TNDRVR
  jp ABICALL

PICONAM:
  DB "PICO    "  ; the ROM console's
                 ; record

; Wait for the controller whose command
; or data port is C: ready, or 256
; polls. Carry is the last busy bit.
; Keeps BC, DE and HL.

LCWAIT:
  push bc
  res 7,c        ; busy is on the
  ld b,0         ; command port

LCW1:
  in a,(c)
  rlca
  jr nc,LCW2
  djnz LCW1

LCW2:
  pop bc
  ret

; Send A to port C, a command or data,
; after the wait. Still busy: dropped.
; Keeps BC, DE and HL.

LCOUT:
  ld (LCBYTE),a
  call LCWAIT
  ret c
  ld a,(LCBYTE)
  out (c),a
  ret

; Address row B, column C on the row's
; controller. Returns C = that
; controller's data port.
; Keeps B and DE. Changes AF and HL.

LCSEL:
  ld hl,(LCTAB)
  ld a,b
  add a,a        ; two bytes a row
  add a,l
  ld l,a
  jr nc,LCS1
  inc h          ; table page carry

LCS1:
  ld a,(hl)      ; the row's controller
  inc hl
  ld h,(hl)      ; its first address
  ld l,c
  ld c,a
  ld a,h
  add a,l        ; the cell's address
  call LCOUT
  set 7,c        ; data follows
  ret

; Cursor off, if it is on. The terminal
; hides its cursor before any output,
; so a cursor still on here is stale.
; Keeps BC, DE and HL.

LCHID:
  ld a,(LCCUR)
  or a
  ret z
  xor a

; Cursor state A, 0 or 2, to the
; controller that shows it.

LCCSET:
  ld (LCCUR),a
  or $0C         ; display on
  push bc
  ld c,a
  ld a,(LCCPRT)
  ld b,a
  ld a,c
  ld c,b
  call LCOUT
  pop bc
  ret

; VPUT: A at row B, column C. Bit 7,
; reverse video, is dropped: the panel
; has none. 80h alone is the terminal's
; cursor flip, since VGET returns 0:
; nothing is written, the cursor
; changes state on the cell's
; controller and the address returns to
; the cell, where the cursor stands.
; Changes AF, C, D and HL.

LCPUT:
  cp $80
  jr z,LCPF
  and $7F
  ld d,a
  call LCHID
  call LCSEL
  ld a,d
  jp LCOUT

LCPF:
  push bc
  call LCSEL     ; C = its data port
  res 7,c
  ld a,c
  ld (LCCPRT),a  ; the cursor is here
  ld a,(LCCUR)
  xor 2          ; shown, or hidden
  call LCCSET
  pop bc
  jp LCSEL       ; back on the cell

; VGET: 0. The terminal reads a cell
; only to flip its cursor, and LCPUT
; takes the 80h that follows as the
; flip.

LCGET:
  xor a
  ret

; VCLREOL: row B from column C to its
; end. C at or past the width, a
; pending wrap, clears nothing.
; Changes AF, C, D and HL.

LCCLR:
  ld a,(COLS)
  sub c
  ret c
  ret z
  ld d,a         ; cells to blank
  call LCHID
  call LCSEL

LCC1:
  ld a,' '
  call LCOUT
  dec d
  jr nz,LCC1
  ret

; VRDROW: row B into LINEBUF, read from
; the panel. Changes AF, BC and HL.

LCRDR:
  call LCROW

LCR1:
  call LCWAIT
  ini            ; a cell in, B counts
  jr nz,LCR1
  ret

; VWRROW: LINEBUF to row B.
; Changes AF, BC and HL.

LCWRR:
  call LCROW

LCWR1:
  call LCWAIT
  outi           ; a cell out
  jr nz,LCWR1
  ret

; Address row B's first cell. Returns
; HL=LINEBUF, B=columns, C=data port.

LCROW:
  call LCHID
  ld c,0
  call LCSEL
  ld hl,(LBUF)
  ld a,(COLS)
  ld b,a
  ret

; VREST: each controller's modes again:
; 8-bit and two lines, addresses rising,
; display on with no cursor. The text
; stays, so a warm boot keeps the
; screen. Changes AF, BC and HL.

LCRST:
  xor a
  ld (LCCUR),a
  ld hl,(LCTAB)
  ld c,(hl)      ; rows 0 and 1
  call LCMODE
  ld de,4
  add hl,de
  ld a,(hl)      ; rows 2 and 3
  cp c
  ret z          ; the same controller
  ld c,a

LCMODE:
  ld a,$38
  call LCOUT
  ld a,$06
  call LCOUT
  ld a,$0C
  jp LCOUT

LCBYTE: DB 0     ; byte over the wait

IMGEND:
