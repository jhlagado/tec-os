; Console transactions and cold choice.
; The command parser stays in ccpcmd.asm.
; All waits are cooperative and bounded.

; Snapshot the effective console, not
; just its two IOBYTE mode bits. The
; registered driver remains in GLVEC.
; Its saved address is an identity to
; compare, never a pointer to install.
; Changes AF, BC, DE and HL.

CONSAVE:
  call CONSEL
  ld a,(CONOLD)
  and $40        ; cold bypass latch
  ld b,a
  ld a,(CONMOD)
  or b
  or $80
  ld (CONOLD),a
  ld a,(CONAUX)
  ld (CAXOLD),a
  ld a,(PIWID)
  ld (CPIOLD),a
  ld a,(LCDPRF)
  ld (CLDOLD),a
  ld hl,(GLVEC)
  ld (CGLDOLD),hl
  ret

; Z when physical device and geometry
; match the snapshot. An auxiliary
; driver must be the same live table.
; Changes AF, B, DE and HL.

CONDIFF:
  ld a,(CONOLD)
  and 3
  ld b,a
  ld a,(CONMOD)
  xor b
  ret nz
  ld a,b
  cp CMCRT
  jr z,CONDPIC
  cp CMUC1
  jr nz,CONDYES
  ld a,(CAXOLD)
  ld hl,CONAUX
  xor (hl)
  ret nz
  ld a,(CONAUX)
  or a
  jr nz,CONDGLC
  ld a,(CLDOLD)
  ld hl,LCDPRF
  cp (hl)
  ret

CONDPIC:
  ld a,(CPIOLD)
  ld hl,PIWID
  cp (hl)
  ret

CONDGLC:
  ld hl,(CGLDOLD)
  ld de,(GLVEC)
  or a
  sbc hl,de
  ret

CONDYES:
  xor a
  ret

; Confirm only a changed device or
; width. This uses ROM console calls
; so cold startup can share it before
; the card and BDOS are available.
; KEYWT takes a fresh target key.

CONASK:
  call CONDIFF
  ret z
  ld hl,PRESSK
  call PUTS
  ld hl,KWPOLL
  call KEYWT
  push af
  call PUTCRLF
  pop af
  ret nz
  call CONROLL
  jp CONREP

; Restore the former profile and route.
; A driver drop clears CGLDOLD, so even
; a new installation at the same page
; cannot pass the identity comparison.
; GLVEC is never written here. Missing
; devices fall back to the ROM LCD,
; then serial when no matrix is fitted.
; Changes AF, BC, DE and HL.

CONROLL:
  ld a,(CLDOLD)
  or a
  jr nz,CONR40
  ld a,20
  call LCDWID
  jr CONRPIC

CONR40:
  call LCDWSET

CONRPIC:
  ld a,(CPIOLD)
  ld hl,PIWID
  cp (hl)
  jr z,CONRAUX
  or a
  jr z,CONRAUX   ; no former PICO
  call TMSWID
  jr nc,CONRAUX
  xor a
  call CONASEL
  ld a,CMUC1
  jp CONSW       ; unavailable width

CONRAUX:
  ld a,(CONOLD)
  and 3
  ld b,a
  ld a,(CAXOLD)
  or a
  jr z,CONRSET
  ld hl,(CGLDOLD)
  ld a,h
  or l
  jr z,CONRSET   ; old identity gone
  ld de,(GLVEC)
  or a
  sbc hl,de
  ld a,0
  jr nz,CONRSET
  inc a          ; the same live driver

CONRSET:
  call CONASEL
  ld a,b
  jp CONSW

; End a transaction after success or
; rollback. Error and warm-boot paths
; clear the same flag independently.

CONTEND:
  ld hl,CONOLD
  res 7,(hl)
  ret

; Report through ROM output, available
; before BDOS initialisation as well.

CONREP:
  ld hl,CONHDR
  call PUTS
  ld a,(CONMOD)
  add a,a
  add a,a
  ld l,a
  ld h,0
  ld de,CONNAMS
  add hl,de
  ld b,4

CONSH1:
  push bc
  push hl
  ld a,(hl)
  call PUTA
  pop hl
  pop bc
  inc hl
  djnz CONSH1
  jp PUTCRLF

; Wait a finite processor-work budget
; for a fresh key on the selected
; keyboard. Discard prior bytes and
; arrow tails. Matrix input first needs
; all keys released. Serial first needs
; at least twelve idle bit periods.
; No housekeeping or route change runs
; inside this timed wait. Normal BIOS
; input keeps its existing behaviour.
; HL is the calibrated slot budget.
; NZ: consumed key in A; Z: timeout.
; Changes AF, BC, DE and HL.

KEYWT:
  xor a
  ld (RXFULL),a
  ld (KBTN),a
  ld a,(CONMOD)
  rrca
  jr nc,KEYWS
  push hl
  call CURSHOW
  pop hl
  ld de,0        ; E: release observed

KEYWM:
  push hl
  push de
  call KEYUP
  pop de
  jr nz,KEYWM1
  ld e,1

KEYWM1:
  push de
  call KBPOLL
  pop de
  pop hl
  jr z,KEYWM3
  ld a,e
  or a
  jr z,KEYWM2
  ld a,(RXCHAR)
  jr KEYWTAKE

KEYWM2:
  xor a          ; held/pending input
  ld (RXFULL),a
  ld (KBTN),a

KEYWM3:
  ld b,KWPAD

KEYWM4:
  djnz KEYWM4
  dec hl
  ld a,h
  or l
  jr nz,KEYWM
  jr KEYWZERO

KEYWS:
  ld de,0        ; D: idle slots, E armed

KEYWS1:
  push hl
  call KWSPOLL
  pop hl
  jr nz,KEYWTAKE
  ld b,1
  jr nc,KEYWS2
  ld b,3         ; a received frame

KEYWS2:
  dec hl
  ld a,h
  or l
  jr z,KEYWZERO
  djnz KEYWS2
  jr KEYWS1

KEYWTAKE:
  push af
  xor a
  ld (RXFULL),a
  ld (KBTN),a
  call CURHIDE
  pop af
  or a
  ret

KEYWZERO:
  call CURHIDE
  xor a
  ret

; Scan every matrix row at fixed cost.
; Z means all keys are up. No key is
; translated or published here.
; Changes AF, BC and D.

KEYUP:
  ld bc,$FEFE
  ld d,$FF

KEYUP1:
  in a,(c)
  and d
  ld d,a
  rlc b
  jr c,KEYUP1
  inc d
  ret

; One bounded serial poll. Unarmed:
; accumulate complete idle windows, so
; a prior partial frame cannot confirm.
; Armed: detect a start with the normal
; tight poll, receive one byte and check
; both stop bits. Any rejected frame
; returns to idle qualification.
; A=0/Z for none, key/NZ for a fresh
; non-NUL frame. Carry charges a frame
; as three slots instead of one.
; Keeps HL. Changes AF, BC and DE.

KWSPOLL:
  in a,(KEYPORT)
  ld a,e
  or a
  jr nz,KWSARM
  ld c,$FF
  ld b,97

KWSIDLE:
  in a,(STSPORT)
  and c
  ld c,a
  djnz KWSIDLE
  rlc c
  jr nc,KWSLOW
  inc d
  ld a,d
  cp 4           ; over twelve bit times
  jr c,KWSNONE
  ld e,1

KWSNONE:
  xor a
  ret

KWSLOW:
  ld d,0
  jr KWSNONE

KWSARM:
  ld b,RXPOLL

KWSLOOK:
  in a,(STSPORT)
  rlca
  jr nc,KWSSTART
  djnz KWSLOOK
  ld b,38

KWSPAD:
  djnz KWSPAD
  xor a
  ret

KWSSTART:
  call RXBITS
  push af
  in a,(STSPORT)
  ld c,a         ; first stop sample
  ld d,RXDLY

KWSSTOP:
  dec d
  jr nz,KWSSTOP
  in a,(STSPORT)
  and c          ; both stops high
  and $80
  ld e,a
  pop af
  bit 7,e
  jr z,KWSBAD
  and $7F
  jr z,KWSBAD

KWSRX:
  or a
  scf
  ret

KWSBAD:
  ld de,0
  xor a
  scf
  ret

KWSEND:

; Cold choice runs once before card
; access. Fn/keypad bypass is latched
; outside CPMINIT's clear, so releasing
; the key during mounting still skips
; STARTUP.CMD. Serial boards keep TTY.
; Other targets share CON's confirmation
; and complete rollback.

STCHOOSE:
  call STBYP
  jr nz,STCH1
  ld hl,CONOLD
  set 6,(hl)
  ret

STCH1:
  call LCDCON
  ret nz
  ld hl,LCDBAN
  call PUTS
  call PUTCRLF
  ld hl,STCMSG
  call PUTS
  call CONSAVE
  ld hl,KWPOLL*3/10
  call KEYWT
  push af
  call PUTCRLF
  pop af
  jr z,STCHEND
  and $DF
  ld b,CMTTY
  cp 'S'
  jr z,STCHSEL
  cp 'C'
  jr nz,STCHEND
  ld a,(PIVEC+1)
  or a
  jr z,STCHEND
  ld b,CMCRT

STCHSEL:
  call CONFLD
  call CONREP
  call CONASK

STCHEND:
  jp CONTEND

; Z for a reset-bypass key held now.
; Matrix Fn is row 0, bit 2. Changes
; AF and BC. No queued input is read.

STBYP:
  in a,(STSPORT)
  and $40
  ret z
  ld bc,$FEFE
  in a,(c)
  and $04
  ret
