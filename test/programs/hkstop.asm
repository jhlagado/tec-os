  org $0100
  ld sp,$4000
  ld de,FCB
  ld c,15
  call $0005
  cp $FF
  jr z,FAIL
  ld hl,BUF
  ld de,BUF+1
  ld bc,127
  ld (hl),$5A
  ldir
  ld de,BUF
  ld c,26
  call $0005
  ld de,FCB
  ld c,21
  call $0005
  ld (STATUS),a
WRITEEND:
  ld a,(MODE)
  or a
  jr z,STOP
  ld c,12
  call $0005
STOP:
  jr STOP
FAIL:
  ld a,$FF
  ld (STATUS),a
  jr STOP
MODE: DB 0
STATUS: DB $EE
FCB: DB 1,"TARGET  DAT"
  ds 24
BUF: ds 128
