; SPDX-License-Identifier: GPL-3.0-only
; Adapted from MarkJelic/TEC-1G
; ROMs/MON3/source/disassembler.z80
; Upstream blob db62ad1837569c7307548cbe50267bfcd9503014
;
; The caller supplies writable labels
; DISLINE1 (19), DISLINE2 (19),
; DISPTR (2), DISFLAG (1), DISFROM (2).
; Reserve space after the workspace.
; Set DISFROM, call disStart, then
; read DISFROM for the next address.
; DISLINE1 holds address and bytes,
; DISLINE2 holds the instruction text.
;
; jims disassembler source code
; -----------------------------

; note: this file was updated so i can place it in any memory location.
; for full annotation please look at the pdf "disassembler_listing.pdf"
;
; edits by craig hart: removed junk code
; fixed two remaining fixed memory references; code can now run anywhere in address apce
; update to add in (xx),a and out (xx),a brackets
; update to add "," in call/jp/jr <flag> opcodes
; optimze by removing code such as jp => jp => dest.
;
; edit by brian chiha: formatted code
; remove extra space from call/jp/jr <flag> opcodes
; fixed missing opcode LD SP,IX and LD SP,IY
; TEC-OS handles LD (IX/IY+d),n separately.

disStart:
  ld hl,disline1
  xor a
  ld (disflag),a
  ld (disptr),hl
  ld hl,(disfrom)
  push hl
  call ZD318A ; write address to disline1
  ld b,$22
  call ZD31B9 ;fill rest with spaces

  ld hl,disline1 ; patch to fix absoute memory addressing
  ld bc,5
  add hl,bc

  ld (disptr),hl
  pop hl
  ld a,(hl)
  push hl
  ld d,$01
  call ZD351D
  pop hl
  jr nc,ZD302E
  call ZD3031
  ld c,(hl)
  ld a,(hl)
  call nc,ZD340E
ZD302E: ; why jp to this code; just do it here?
  ld hl,(disfrom)
  inc hl
  ld (disfrom),hl
  ret
ZD3031:
  cp $40
  jr c,ZD304D
  cp $0C0
  jr c,ZD304F
  cp $0CB
  jp z,ZD31DE
  ld c,$00
  cp $0DD
  jr z,ZD3049
  cp $0FD
  jr nz,ZD304D
  inc c
ZD3049:
  inc c
  jp ZD30D7
ZD304D:
  or a
  ret
ZD304F:
  push af
  call ZD3055
  jr ZD305A
ZD3055:
  ld b,$01
  jp ZD31FF
ZD305A:
  pop af
ZD305B:
  cp $80
  jr nc,ZD3073
  push af
  call ZD3205
  pop af
  call ZD31AC
  push af
  call ZD3106
  call ZD3164
  pop af
  ld c,a
  jp ZD3107
ZD3073:
  and $3F
  call ZD31AC
  push af
  ld a,$86
  add a,c
  add a,c
  add a,c
  call ZD3153
  call ZD3086
  jr ZD3092
ZD3086:
  call ZD317B
  ret nz
  ld c,$07
  call ZD310B
  jp ZD3164
ZD3092:
  pop af
  ld c,a
  jr ZD3106
ZD3096:
  cp $40
  jr nc,ZD30B0
  call ZD31AC
  push af
  ld a,c
  cp $07
  jr nz,ZD30A4
  dec c
ZD30A4:
  ld a,$9E
  add a,c
  add a,c
  add a,c
  call ZD3153
  pop af
  ld c,a
  jr ZD3106
ZD30B0:
  sub $40
  push af
  ld b,$0B3
  cp $40
  jr c,ZD30C1
  ld b,$0B6
  cp $80
  jr c,ZD30C1
  ld b,$0B9
ZD30C1:
  ld a,b
  call ZD3153
  pop af
  and $3F
  call ZD31AC
  push af
  ld a,c
  call ZD319A
  call ZD3164
  pop af
  ld c,a
  jr ZD3106
ZD30D7:
  ld hl,(disfrom)
  inc hl
  ld a,(hl)
  cp $0CB
  jr z,ZD30EA
  cp $0BF
  dec hl
  ret nc
  cp $40
  jr nc,ZD30ED
  and a
  ret
ZD30EA:
  set 7,c
  inc hl
ZD30ED:
  inc hl
  ld a,(hl)
  push af
  ld b,$04
  ld a,c
  ld (disflag),a
  bit 7,c
  jr nz,ZD30FB
  dec b
ZD30FB:
  call ZD31FF
  pop af
  bit 7,c
  jr nz,ZD3096
  jp ZD305B
ZD3106:
  ld a,c
ZD3107:
  cp $06
  jr z,ZD3112
ZD310B:
  ld a,$01
ZD310D:
  ld hl,tableREG
  jr ZD3145
ZD3112:
  ld a,(disflag)
  or a
  jr nz,ZD311E
  ld c,$08
  ld a,$04
  jr ZD310D
ZD311E:
  push af
  rra
  ld c,$0C
  jr c,ZD3126
  ld c,$13
ZD3126:
  ld a,$07
  call ZD310D
  pop af
  rla
  ld de,(disfrom)
  jr nc,ZD3134
  dec de
ZD3134:
  ld hl,(disptr)
  dec hl
  dec hl
  dec hl
  ld (disptr),hl
  ld a,(de)
  call ZD3191
  inc hl
  ld (disptr),hl
  ret
ZD3145:
  ld de,(disptr)
  add hl,bc
  ld c,a
  ldir
  ld (disptr),de
  scf
  ret
ZD3153:
  ld hl,tableOPS ; patch to fix absolute memory addressing
  sub $82
  ld e,a
  ld d,0
  add hl,de
  ex de,hl
  jr ZD3169
ZD315D:
  ld hl,disline2
  ld (disptr),hl
  ret
ZD3164:
  ld bc,$0006
  jr ZD310B
ZD3169:
  ld hl,(disptr)
  ld a,(de)
  ld (hl),a
  res 7,(hl)
  inc hl
  ld (disptr),hl
  inc de
  or a
  jp m,ZD31B7
  jr ZD3169
ZD317B:
  ld a,c
  cp $04
  jr c,ZD3182
  or a
  ret
ZD3182:
  cp $02
  jr nz,ZD3188
  dec a
  ret
ZD3188:
  xor a
  ret
ZD318A:
  push hl
  ld a,h
  call ZD3191
  pop hl
  ld a,l
ZD3191:
  push af
  rra
  rra
  rra
  rra
  call ZD319A
  pop af
ZD319A:
  and $0F
  add a,$90
  daa
  adc a,$40
  daa
  ld hl,(disptr)
  ld (hl),a
  inc hl
  ld (disptr),hl
  scf
  ret
ZD31AC:
  push af
  and $38
  rra
  rra
  rra
  ld c,a
  pop af
  and $07
  ret
ZD31B7:
  ld b,$01
ZD31B9:
  ld a,$20
  ld hl,(disptr)
ZD31BE:
  ld (hl),a
  inc hl
  djnz ZD31BE
  ld (disptr),hl
  ret
ZD31C6:
  ld de,(disfrom)
ZD31CA:
  push bc
  ld a,(de)
  push af
  call ZD3191
  call ZD31B7
  pop af
  inc de
  pop bc
  djnz ZD31CA
  dec de
  ld (disfrom),de
  ret
ZD31DE:
  ld b,$02
  call ZD31C6
  call ZD315D
  jp ZD3096
ZD31E9:
  and $0CF
  cp $01
  jr nz,ZD3236
  call ZD31FD
  call ZD3205
  call ZD320A
  call ZD3164
  jr ZD3221
ZD31FD:
  ld b,$03
ZD31FF:
  call ZD31C6
  jp ZD315D
ZD3205:
  ld a,$83
  jp ZD3153
ZD320A:
  ld a,c
ZD320B:
  push af
  and $30
  call ZD35A6
  add a,$1A
  ld b,$00
  ld c,a
  ld a,$02
  ld hl,tableREG
  call ZD3145
  pop af
  ld c,a
  ret
ZD3221:
  ld hl,(disfrom)
  ld a,(hl)
  push hl
  call ZD3191
  pop hl
  dec hl
  ld a,(hl)
  push hl
  call ZD3191
  pop hl
  inc hl
  ld (disfrom),hl
  ret
ZD3236:
  and $0C7
  cp $06
  jr nz,ZD3254
  ld b,$02
  call ZD32BE
  ld a,c
  call ZD31AC
  ld b,$00
  call ZD35E7
  call ZD3164
ZD324D:
  ld hl,(disfrom)
  ld a,(hl)
  jp ZD3191
ZD3254:
  ld a,c
  push af
  and $0EF
  cp $0A
  jr nz,ZD327B
  ld b,$01
  call ZD32BE
  ld a,c
  ld bc,$0007
  call ZD310B
  call ZD3164
ZD326B:
  ld bc,$0008
  call ZD310B
  pop af
  call ZD320B
  ld bc,$000B
  jp ZD310B
ZD327B:
  cp $02
  jr nz,ZD3290
  ld b,$01
  call ZD32BE
  call ZD3603
ZD3287:
  call ZD3164
  ld bc,$0007
  jp ZD310B
ZD3290:
  cp $22
  jr nz,ZD32C4
  ld b,$03
  call ZD32BE
  call ZD32AF
  call ZD3164
  pop af
ZD32A0:
  bit 4,a
  jr nz,ZD32A7
ZD32A4:
  jp ZD35CD
ZD32A7:
  ld a,$01
  ld bc,$0007
  jp ZD310D
ZD32AF:
  ld bc,$0008
  call ZD310B
  call ZD3221
  ld bc,$000B
  jp ZD310B
ZD32BE:
  call ZD31FF
  jp ZD3205
ZD32C4:
  cp $2A
  jr nz,ZD32D6
  ld b,$03
  call ZD32BE
  pop af
  call ZD32A0
  call ZD3164
  jr ZD32AF
ZD32D6:
  and $0CF
  cp $03
  jr nz,ZD32EB
  call ZD32E3
  pop af
  jp ZD320B
ZD32E3:
  call ZD3055
  ld a,$0BC
ZD32E8:
  jp ZD3153
ZD32EB:
  cp $0B
  jr nz,ZD32FB
  call ZD32F6
  pop af
  jp ZD320B
ZD32F6:
  ld a,$0BF
  jp ZD3511
ZD32FB:
  and $0C7
  cp $04
  jr nz,ZD330B
  call ZD32E3
  pop af
ZD3305:
  call ZD31AC
  jp ZD3106
ZD330B:
  cp $05
  jr nz,ZD3315
  call ZD32F6
  pop af
  jr ZD3305
ZD3315:
  ld a,c
  and $0CF
  cp $09
  jr nz,ZD332B
  ld a,$86
  call ZD3511
  call ZD32A4
  call ZD3164
  pop af
  jp ZD320B
ZD332B:
  pop af
  cp $10
  jr nz,ZD334B
  ld a,$0D9
ZD3332:
  push af
  ld b,$02
  call ZD31FF
  pop af
  call ZD3153
  jp ZD35F3
ZD334B:
  cp $18
  jr nz,ZD3353
  ld a,$0D5
  jr ZD3332
ZD3353:
  ld a,c
  and $0C7
  or a
  jr nz,ZD3377
  ld a,c
  push af
  ld b,$02
  call ZD31FF
  ld a,$0D5
  call ZD3153
  pop af
  call ZD336C
  call fixcomma
  jp ZD35F3

fixcomma: ; comma fix for jp/jr <flag>, xxx
  push hl
  push af
  ld hl,(disptr)
  dec hl
  ld a,$2C ; ","
  ld (hl),a
; inc hl
; ld a, 20H       ; " "
; ld (hl), a
  inc hl
  ld (disptr),hl
  pop af
  pop hl
  ret

ZD336C:
  and $18
ZD336E:
  rra
  rra
  rra
  add a,a
  add a,$0DD
  jp ZD3153
ZD3377:
  ld a,c
  cp $0C3
  jr z,ZD3391
  cp $0CD
  jr z,ZD338D
  jr ZD33A7
ZD3389:
  and $38
  jr ZD336E
ZD338D:
  ld a,$0C8
  jr ZD3393
ZD3391:
  ld a,$0CC
ZD3393:
  ld b,$03
  push af
  call ZD31FF
  pop af
  cp $0A6
  jr nz,ZD33A1
  jp ZD3153
ZD33A1:
  call ZD32E8
  jp ZD3221
ZD33A7:
  and $0C7
  cp $0C0
  jr nz,ZD33C5
  ld a,$0C5
  ld b,$01
  call ZD33B8
  dec hl
  ld (hl),$20
  ret
ZD33B8:
  push bc
  push af
  call ZD31FF
  pop af
  call ZD32E8
  pop bc
  ld a,c
  jr ZD3389
ZD33C5:
  ld a,c
  and $0C7
  cp $0C4
  jr nz,ZD33D6
  ld a,$0C8
ZD33CE:
  ld b,$03
  call ZD33B8
  call fixcomma
  jp ZD3221
ZD33D6:
  cp $0C2
  jr nz,ZD33DE
  ld a,$0CC
  jr ZD33CE
ZD33DE:
  ld a,c
  and $0CF
  cp $0C1
  jr nz,ZD33E9
  ld a,$0CE
  jr ZD33EE
ZD33E9:
  cp $0C5
  ret nz
  ld a,$0D1
ZD33EE:
  push bc
  push af
  call ZD3055
  pop af
  call ZD32E8
  pop bc
  ld a,c
  cp $0F1
  jr z,ZD3401
  cp $0F5
  jr nz,ZD340B
ZD3401:
  ld (hl),$41
  inc hl
  ld (hl),$46
  inc hl
  ld (disptr),hl
  ret
ZD340B:
  jp ZD320B
ZD340E:
  and $0C7
  cp $0C7
  jr nz,ZD3421
  ld a,c
  push af
  ld a,$0C2
  call ZD3511
  pop af
  and $38
  jp ZD3191
ZD3421:
  and $0C6
  cp $0C6
  ld a,c
  jr nz,ZD3440
  xor a
  call ZD34F7
  ld a,c
  push bc
  call ZD31AC
  ld a,$86
  add a,c
  add a,c
  add a,c
  call ZD3153
ZD3439:
  call ZD3086
  pop bc
  jp ZD324D
ZD3440:
  cp $0ED
  jp nz,ZD34E8
  ld hl,(disfrom)
  inc hl
  ld a,(hl)
  ld c,a
  and $0C7
  cp $43
  jr nz,ZD3471
  ld b,$04
  call ZD31FF
  call ZD3205
  bit 3,c
  jr nz,ZD3468
  push bc
  call ZD32AF
  call ZD3164
  pop bc
  jp ZD320A
ZD3468:
  call ZD320A
  call ZD3164
  jp ZD32AF
ZD3471:
  ld b,$02
  jr ZD34DF
ZD3475:
  ld a,c
  and $0C7
  cp $40
  jr nz,ZD3496
  push bc
  ld a,$0F0
  call ZD3153
  pop bc
  ld a,c
  call ZD31AC
  ld a,c
  call ZD310B
  call ZD3164
ZD348E:
  ld bc,$0022
  ld a,$03
  jp ZD310D
ZD3496:
  cp $41
  jr nz,ZD34AF
  push bc
  ld a,$0ED
  call ZD3153
  call ZD348E
  call ZD3164
  pop bc
  ld a,c
  call ZD31AC
  ld a,c
  jp ZD310B
ZD34AF:
  cp $42
  jr nz,ZD34E8
  push bc
  ld a,c
  bit 3,a
  jr nz,ZD34C0
  ld a,$8F
  call ZD3153
  jr ZD34C5
ZD34C0:
  ld a,$89
  call ZD3153
ZD34C5:
  call ZD32A4
  call ZD3164
  pop bc
  jp ZD320A
ZD34CF:
  ld b,$1C
  ld hl,(disfrom)
  inc hl
  ld a,(hl)
  ld hl,tableEXC
  ld b,$1C
  ld d,$02
  jr ZD3522
ZD34DF:
  and $84
  jr nz,ZD34CF
  call ZD31FF
  jr ZD3475
ZD34E8:
  cp $0D3
  jr nz,ZD3502
  ld a,$0ED
  call ZD34F7
  call ZD34FB
  jp ZD3287
ZD34F7:
  ld b,$02
  jr ZD3513
ZD34FB:
  ld hl,(disptr) ; re-write to add () to in/out (xx),a
  ld a,$28 ; "("
  ld (hl),a
  inc hl
  ld (disptr),hl
  call ZD324D
  ld hl,(disptr)
  ld a,$29 ; ")"
  ld (hl),a
  inc hl
  ld (disptr),hl
  ret
ZD3502:
  cp $0DB
  jr nz,ZD354B
  ld a,$0F0
  call ZD34F7
  ld c,$00
  call ZD3086 ; optimization, skips push/pop not needed
  jp ZD34FB
ZD3511:
  ld b,$01
ZD3513:
  push af
  call ZD31FF
  pop af
  or a
  jp nz,ZD3153
  ret
ZD351D:
  ld b,$13
  ld hl,tableOBT
ZD3522:
  cp (hl)
  jr z,ZD352F
ZD3525:
  inc hl
  bit 7,(hl)
  jr z,ZD3525
  inc hl
  djnz ZD3522
  scf
  ret
ZD352F:
  push hl
  ld b,d
  call ZD31FF
  pop hl
  ld de,(disptr)
ZD3539:
  inc hl
  ld a,(hl)
  ld (de),a
  inc de
  bit 7,a
  jr z,ZD3539
  ex de,hl
  dec hl
  res 7,(hl)
  inc hl
  ld (disptr),hl
  or a
  ret
ZD354B:
  ld hl,(disptr)
  cp $0DD
  jr nz,ZD3559
  ld (hl),$44
  inc hl
  ld a,$11
  jr ZD3562
ZD3559:
  cp $0FD
  jr nz,ZD3590
  ld (hl),$46
  inc hl
  ld a,$22
ZD3562:
  ld (disflag),a
  ld (hl),$44
  inc hl
  inc hl
  ld (disptr),hl
  ld hl,(disfrom)
  inc hl
  ld c,(hl)
  ld a,(hl)
  ld (disfrom),hl
  cp $36
  jp z,ZDIDXIMM
  push hl
  ld a,c
  and $0FE
  cp $34
  ld b,$02
  call z,ZD31FF
  pop hl
  ld a,(hl)
  cp $0E9
  jr z,ZD358D
  cp $0F9
  jr z,ZD358D
  cp $0E3
ZD358D:
  jr z,ZD360A
  ld a,c
ZD3590:
  jp ZD31E9
ZD3593:
  ld hl,(disfrom)
  dec hl
  dec hl
  ld (disfrom),hl
  call ZD3106
ZD35A6:
  rra
  rra
  rra
  cp $04
  ret nz
  ld a,(disflag)
  rrca
  jr nc,ZD35B5
  ld a,$0F3
  ret
ZD35B5:
  rrca
  jr nc,ZD35BB
  ld a,$0FA
  ret
ZD35BB:
  ld a,$04
  ret
  ld bc,$0008
  call ZD310B
  call ZD35CD
  ld bc,$000B
  jp ZD310B
ZD35CD:
  ld a,(disflag)
  ld b,$00
  rrca
  jr nc,ZD35D9
  ld c,$0D
  jr ZD35E2
ZD35D9:
  rrca
  jr nc,ZD35E0
  ld c,$14
  jr ZD35E2
ZD35E0:
  ld c,$04
ZD35E2:
  ld a,$02
  jp ZD310D
ZD35E7:
  ld a,(disflag)
  rrca
ZD35EB:
  jr c,ZD3593
  rrca
  jr c,ZD35EB
  jp ZD3106
ZD35F3:
  ld hl,(disfrom)
  ld e,(hl)
  xor a
  bit 7,e
  jr z,ZD35FD
  cpl
ZD35FD:
  ld d,a
  inc hl
  add hl,de
  jp ZD318A
ZD3603:
  pop hl
  pop af
  push hl
  push af
  jp ZD326B
ZD360A:
  ld a,c
  call ZD351D
ZD360E:
  dec hl
  ld a,(hl)
  cp $48
  jr nz,ZD360E
  ld (hl),$49
  inc hl
  ld (hl),$58
  ld a,(disflag)
  rrca
  ret c
  inc (hl)
  ret

;start of loopup tables
;org 3620
ZDIDXIMM:
  call ZD31FD ; emit opcode, displacement and immediate
  call ZD3205 ; LD
  ld hl,(disfrom)
  dec hl
  ld (disfrom),hl ; indexed operand reads the displacement
  ld bc,6
  call ZD3106
  call ZD3164 ; comma
  ld hl,(disfrom)
  inc hl
  ld (disfrom),hl ; immediate is also the last byte
  jp ZD324D

tableOPS:
  DB      $49 ;I 82 < WHERE "82H" IS THE INDEX HERE
  DB      $4C,$0C4,$00 ;LD 83
  DB      $41,$44,$0C4 ;ADD 86
  DB      $41,$44,$0C3 ;ADC 89
  DB      $53,$55,$0C2 ;SUB 8C
  DB      $53,$42,$0C3 ;SBC 8F
  DB      $41,$4E,$0C4 ;AND 92
  DB      $58,$4F,$0D2 ;XOR 95
  DB      $4F,$0D2,$00 ;OR 98
  DB      $43,$0D0,$00 ;CP 9B
  DB      $52,$4C,$0C3 ;RLC 9E
  DB      $52,$52,$0C3 ;RRC A1
  DB      $52,$0CC,$00 ;RL A4
  DB      $52,$0D2,$00 ;RR A7
  DB      $53,$4C,$0C1 ;SLA AA
  DB      $53,$52,$0C1 ;SRA AD
  DB      $53,$52,$0CC ;SRL B0
  DB      $42,$49,$0D4 ;BIT B3
  DB      $52,$45,$0D3 ;RES B6
  DB      $53,$45,$0D4 ;SET B9
  DB      $49,$4E,$0C3 ;INC BC
  DB      $44,$45,$0C3 ;DEC BF
  DB      $52,$53,$0D4 ;RST C2
  DB      $52,$45,$0D4 ;RET C5
  DB      $43,$41,$4C,$0CC ;CALL C8
  DB      $4A,$0D0 ;JP CC
  DB      $50,$4F,$0D0 ;POP CE
  DB      $50,$55,$53,$0C8 ;PUSH D1
  DB      $4A,$0D2 ;JR D5
  DB      $45,$0D8 ;EX D7
  DB      $44,$4A,$4E,$0DA ;DJNZ D9

tableFLG:
  DB      $4E,$0DA ;NZ DD
  DB      $0DA,$20 ;Z_ DF
  DB      $4E,$0C3 ;NC E1
  DB      $0C3,$00 ;C_E3
  DB      $50,$0CF ;PO E5
  DB      $50,$0C5 ;PE E7
  DB      $0D0,$00 ;P_ E9
  DB      $0CD,$00 ;M_ EB
  DB      $4F,$55,$0D4 ;OUT ED
  DB      $49,$0CE ;IN F0

tableOBT:
  DB      $00,$4E,$4F,$0D0 ;NOP
  DB      $07,$52,$4C,$43,$0C1 ;RLCA
  DB      $08,$45,$58,$20,$41,$46,$2C,$41,$46,$0A7 ;EX AF,AF'
  DB      $0F,$52,$52,$43,$0C1 ;RRCA
  DB      $17,$52,$4C,$0C1 ;RLA
  DB      $1F,$52,$52,$0C1 ;RRA
  DB      $27,$44,$41,$0C1 ;DAA
  DB      $2F,$43,$50,$0CC ;CPL
  DB      $37,$53,$43,$0C6 ;SCF
  DB      $3F,$43,$43,$0C6 ;CCF
  DB      $76,$48,$41,$4C,$0D4 ;HALT
  DB      $0C9,$52,$45,$0D4 ;RET
  DB      $0D9,$45,$58,$0D8 ;EXX
  DB      $0E3,$45,$58,$20,$28,$53,$50,$29,$2C,$48,$0CC ;EX (SP),HL
  DB      $0E9,$4A,$50,$20,$28,$48,$4C,$0A9 ;JP (HL)
  DB      $0EB,$45,$58,$20,$44,$45,$2C,$48,$0CC ;EX DE,HL
  DB      $0F3,$44,$0C9 ;DI
  DB      $0F9,$4C,$44,$20,$53,$50,$2C,$48,$0CC ;LD SP,HL
  DB      $0FB,$45,$0C9 ;EI

tableEXC:
  DB      $44,$4E,$45,$0C7 ;NEG
  DB      $45,$52,$45,$54,$0CE ;RETN
  DB      $46,$49,$4D,$20,$0B0 ;IM 0
  DB      $47,$4C,$44,$20,$49,$2C,$0C1 ;LD I,A
  DB      $4D,$52,$45,$54,$0C9 ;RETI
  DB      $4F,$4C,$44,$20,$52,$2C,$0C1 ;LD R,A
  DB      $56,$49,$4D,$20,$0B1 ;IM 1
  DB      $57,$4C,$44,$20,$41,$2C,$0C9 ;LD A,I
  DB      $5E,$49,$4D,$20,$0B2 ;IM 2
  DB      $5F,$4C,$44,$20,$41,$2C,$0D2 ;LD A,R
  DB      $67,$52,$52,$0C4 ;RRD
  DB      $6F,$52,$4C,$0C4 ;RLD
  DB      $0A0,$4C,$44,$0C9 ;LDI
  DB      $0A1,$43,$50,$0C9 ;CPI
  DB      $0A2,$49,$4E,$0C9 ;INI
  DB      $0A3,$4F,$55,$54,$0C9 ;OUTI
  DB      $0A8,$4C,$44,$0C4 ;LDD
  DB      $0A9,$43,$50,$0C4 ;CPD
  DB      $0AA,$49,$4E,$0C4 ;IND
  DB      $0AB,$4F,$55,$54,$0C4 ;OUTD
  DB      $0B0,$4C,$44,$49,$0D2 ;LDIR
  DB      $0B1,$43,$50,$49,$0D2 ;CPIR
  DB      $0B2,$49,$4E,$49,$0D2 ;INIR
  DB      $0B3,$4F,$54,$49,$0D2 ;OTIR
  DB      $0B8,$4C,$44,$44,$0D2 ;LDDR
  DB      $0B9,$43,$50,$44,$0D2 ;CPDR
  DB      $0BA,$49,$4E,$44,$0D2 ;INDR
  DB      $0BB,$4F,$54,$44,$0D2 ;OTDR

tableREG:
  DB      $42,$43 ;BC
  DB      $44,$45 ;DE
  DB      $48,$4C ;HL
  DB      $2C,$41 ;,A
  DB      $28,$48,$4C,$29 ;(HL)
  DB      $28,$49,$58,$2B,$20,$1F,$29 ;(IX+__)
  DB      $28,$49,$59,$2B,$20,$1F,$29 ;(IY+__)

ZDSREG:
  DB      $42 ;B
  DB      $43 ;C
  DB      $44 ;D
  DB      $45 ;E
  DB      $48 ;H
  DB      $4C ;L
  DB      $53 ;S
  DB      $50 ;P
  DB      $28,$43,$29 ;(C)

  DB      $0FF,$0FF,$0FF,$0FF,$0FF,$0FF,$0FF,$0FF,$0FF,$0FF ;FILL
