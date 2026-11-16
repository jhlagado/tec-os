; HD44780 character LCD console for a
; 40 x 4 panel, as a loaded driver for
; UC1. Such a panel is two controllers,
; each with two rows of 40 and its own
; ports: rows 0 and 1 on the first,
; rows 2 and 3 on the second. Each row
; is reached through a table of its
; controller's port and its first
; address.
; Loading the driver asks for 40
; columns. It installs only when both
; controllers answer and are not one
; controller seen at both ports.
; The panel's own display memory is the
; screen: a scroll reads rows back and
; writes them a row up, so the driver
; keeps no copy of the text. No
; transfer runs more than 20 cells past
; an address command.
; Calls use the caller's stack and the
; classic bank. Busy polling is bounded
; and a byte the panel will not take is
; dropped.

%INCLUDE "../src/abi.inc"

IOBYTE EQU $0003

LCCOLS EQU 40
LCROWS EQU 4

; The second controller. No board has
; one yet: these ports are the test
; panels' and stand until a board fixes
; them.

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
; columns and rows. LBUF keeps the
; returned LINEBUF.

VTAB: DW LCPUT,LCGET,LCCLR,LCRST,LCRDR,LCWRR
  DW 0
  DB LCCOLS,LCROWS
LBUF: DW 0

; For each row, its controller's command
; port and the command for its first
; cell.

LCTAB: DB LCDCMD,$80,LCDCMD,$C0,LC2CMD,$80,LC2CMD,$C0

; The port of the controller that shows
; the cursor, and 2 while it is shown.

LCCPRT: DB LCDCMD
LCCUR: DB 0

; Install UC1's hook last. No matrix
; keyboard, or not two controllers:
; TNENODV, which a startup line passes
; over quietly. Two controllers are
; proved by giving each its own address
; and reading both back: one controller
; at both ports holds only the last. A
; table already on UC1, or CRT in a
; startup line, fails as TNDRVR says.
; Success: A=0, NC, HL=0, no records.
; Changes AF/BC/DE/HL.

INIT:
  ld c,TNINFO
  call ABICALL
  bit 0,b        ; the matrix keyboard
  jr z,INIT9
  ld c,LCDCMD
  ld a,$95       ; address 15h
  call LCOUT
  ld c,LC2CMD
  ld a,$AA       ; address 2Ah
  call LCOUT
  ld e,$2A
  call INITA     ; the second's
  ld c,LCDCMD
  ld e,$15
  call INITA     ; and the first's
  ld b,3         ; UC1:
  ld hl,VTAB
  ld c,TNDRVR
  call ABICALL
  ret c
  ld (LBUF),hl
  ld hl,0
  or a
  ret

; The controller at port C is ready and
; its address counter is E, or INIT is
; left with TNENODV.

INITA:
  call LCWAIT
  jr c,INITB
  in a,(c)
  cp e
  ret z

INITB:
  pop hl         ; INIT's own return

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
  ld hl,LCTAB
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
; Keeps BC, DE and HL.

LCCSET:
  ld (LCCUR),a
  or $0C         ; display on
  push bc
  ld b,a
  ld a,(LCCPRT)
  ld c,a
  ld a,b
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
  jr LCOUT

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
  jr LCSEL       ; back on the cell

; VGET: 0. The terminal reads a cell
; only to flip its cursor, and LCPUT
; takes the 80h that follows as the
; flip.

LCGET:
  xor a
  ret

; VCLREOL: row B from column C to its
; end, a cell at a time. C at or past
; the width, a pending wrap, clears
; nothing. Keeps B. Changes AF, C, HL.

LCCLR:
  ld a,c
  cp LCCOLS
  ret nc
  call LCHID

LCC1:
  push bc
  call LCSEL
  ld a,' '
  call LCOUT
  pop bc
  inc c
  ld a,c
  cp LCCOLS
  jr nz,LCC1
  ret

; VRDROW: row B into LINEBUF, read from
; the panel in two runs of 20 cells.
; Changes AF, BC, DE and HL.

LCRDR:
  call LCHID
  ld de,(LBUF)
  ld c,0
  call LCRD20
  ld c,20

LCRD20:
  ld a,b
  ld (LCROWN),a  ; the row, kept off
                 ; the stack
  call LCSEL     ; C = the data port
  ex de,hl       ; HL = the buffer
  ld b,20

LCR1:
  call LCWAIT
  ini            ; a cell in, B counts
  jr nz,LCR1

LCR2:
  ex de,hl
  ld a,(LCROWN)
  ld b,a
  ret

; VWRROW: LINEBUF to row B, the same
; way. Changes AF, BC, DE and HL.

LCWRR:
  call LCHID
  ld de,(LBUF)
  ld c,0
  call LCWR20
  ld c,20

LCWR20:
  ld a,b
  ld (LCROWN),a
  call LCSEL
  ex de,hl
  ld b,20

LCWR1:
  call LCWAIT
  outi           ; a cell out
  jr nz,LCWR1
  jr LCR2

; VREST: each controller's modes again:
; 8-bit and two lines, addresses rising,
; display on with no cursor, home. The
; text stays, so a warm boot keeps the
; screen. Changes AF, C and HL.

LCRST:
  xor a
  ld (LCCUR),a
  ld c,LCDCMD
  call LCMODE
  ld c,LC2CMD

LCMODE:
  ld hl,LCSEQ

LCM1:
  ld a,(hl)
  or a
  ret z
  call LCOUT
  inc hl
  jr LCM1

LCSEQ: DB $38,$06,$0C,$02,0

LCBYTE: DB 0     ; byte over the wait
LCROWN: DB 0     ; row over a transfer

IMGEND:
