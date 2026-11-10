; KG65's driver: one MON-3 call or
; restart a row, run the same way under
; MON-3 itself and under MON3.SVC. The
; harness writes the row into the
; parameters below and starts it at
; START; it stops at STOP.

; Each row copies the fixed image over
; 0800h-0DFFh, but USER_INT and
; USER_NMI, which each side keeps its
; own, then the row's memory input. It
; loads AF, BC, DE, HL and IY from R1
; and runs the restart at OP1. NEXT
; goes on to STOP, or to a second call
; from R2 at OP2.

IMAGE     EQU   $4800

  ORG $4000

START:
  im 1
  ld sp,$3F00    ; below 4000h-7FFFh
  ld hl,IMAGE
  ld de,$0800
  ld bc,$0092    ; up to USER_INT
  ldir
  ld hl,IMAGE+$96
  ld de,$0896
  ld bc,$056A    ; past USER_NMI
  ldir
  ld bc,(MEMN)   ; the row's memory
  ld a,b
  or c
  jr z,LOAD1     ; none
  ld de,(MEMTO)
  ld hl,MEMB
  ldir

LOAD1:
  ld sp,R1       ; the registers
  pop af
  pop bc
  pop de
  pop hl
  pop iy
  ld sp,$3F00

OP1:
  rst $10        ; the row's restart

NEXT:
  jp STOP        ; or CALL2

CALL2:
  ld sp,R2       ; a second call's
  pop af
  pop bc
  pop de
  pop hl
  pop iy
  ld sp,$3F00

OP2:
  rst $10

STOP:
  jp START

; A loop to wait in: for an interrupt,
; or while the harness sets up.

WAIT:
  jr WAIT

; The interrupt rows' handler.

INTH:
  jp STOP

R1:       DS    10
R2:       DS    10
MEMTO:    DW    0
MEMN:     DW    0
MEMB:     DS    256
