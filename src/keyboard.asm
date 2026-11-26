; Matrix keys for PICO9918 and GLCD. The
; console polls port FEh by row. Key k
; is row k/8, bit k%8. One low address
; bit in the high byte picks the row.
; Keys 0-2 are Shift, Ctrl and Fn. Key 7
; toggles Caps Lock. Fn with a digit key
; sends F1-F9 (Fn+1-9) and F10 (Fn+0) as
; xterm sends them; Fn with an arrow sends
; Page Up, Page Down, Home and End, and
; Shift with one the modified arrow. A
; held key does not repeat.

; Poll up to eight rows for a new key.
; Starts at KBMASK. NZ ends the poll:
; RXCHAR ready and RXFULL set.
; Z: none ready. Disabled: A = 0.
; CDMTX in CONDEV enables scanning.
; Requires RXFULL = 0.
; Clobbers AF, BC, DE and HL.

KBPOLL:
  ld a,(CONDEV)
  and CDMTX
  ret z          ; keyboard absent
  ld l,8

KBPL:
  push hl
  call KBSTEP
  pop hl
  ret nz         ; key ready
  dec l
  jr nz,KBPL
  ret            ; Z from count

; Scan one KBMASK row. KBE/KBD hold the
; last two pressed keys. Evaluate after
; row 7. NZ: RXCHAR ready and RXFULL
; set. Z: none ready.
; Requires RXFULL = 0. Clobbers AF, BC,
; DE and HL.

KBSTEP:
  ld hl,KBMASK
  ld b,(hl)      ; Active-low row mask
  ld c,$FE       ; Keyboard port
  in a,(c)       ; Pressed bits low
  cpl
  jr z,KBSNEXT   ; Z from IN: raw 00h
  ld d,a
  inc hl
  ld a,(hl)      ; KBBASE: first key

KBSBIT:
  srl d          ; lowest bit first
  jr nc,KBSN
  ld hl,(KBE)    ; KBD follows KBE
  ld h,l         ; the prior key to KBD
  ld l,a         ; the new one to KBE
  ld (KBE),hl

KBSN:
  inc a
  inc d          ; any bits left?
  dec d
  jr nz,KBSBIT
  ld hl,KBMASK

KBSNEXT:
  rlc (hl)
  inc hl
  ld a,(hl)
  add a,8        ; eight keys per row
  ld (hl),a
  cp 64          ; past the last row
  jr z,KBEVAL
  xor a          ; Z: nothing yet
  ret

KBEVAL:
  xor a
  ld (hl),a      ; start at key 0
  ld hl,(KBE)    ; L: last, H: prior
  ld de,$FFFF    ; clear for next scan
  ld (KBE),de
  ex de,hl       ; E: last, D: prior
  ld a,e
  ld hl,KBLAST   ; previous scan's key
  cp (hl)
  jr z,KBNONE    ; still held
  ld (hl),a      ; record releases too
  inc a
  jr z,KBNONE    ; nothing pressed
  ld a,d         ; second key, if any
  cp 3           ; modifiers come first
  jr c,KBMOD
  inc a          ; FFh: no second key
  jr nz,KBNONE   ; two ordinary keys

KBMOD:
  ld a,e
  cp 3
  jr c,KBNONE    ; modifier alone
  cp 7           ; Caps Lock key
  jr z,KBCAPS
  jr nc,KBNOARR  ; Keys 3-6: ESC [ A-D
  ld b,a         ; keys 3-6
  ld a,d         ; FFh none, 0 Shift,
  add a,a        ; 1 Ctrl, 2 Fn: four
  add a,a        ; tails each, from
  add a,b        ; 4(D+1) + key - 2,
  add a,2        ; mod 256: arrow 1-4
  ld b,a

; Queue tail B (1 the first) of KBTAILS
; and send ESC. CINTAKE gives the tail
; after it. A tail ends at its first byte
; from 40h after the first.

KBTAILN:
  ld hl,KBTAILS

KBSEEK:
  ld (KBTP),hl
  ld c,1

KBSEEK1:
  inc hl
  inc c
  ld a,(hl)
  cp '@'
  jr c,KBSEEK1   ; C: the tail's length
  inc hl
  djnz KBSEEK
  ld a,c
  ld (KBTN),a
  ld a,$1B       ; deliver ESC now
  jr KBDELIV

KBNOARR:
  ld a,d
  cp 2           ; Fn held?
  jr nz,KBPLAIN
  ld a,e
  sub $13        ; digit keys 13h-1Ch
  cp 10
  jr nc,KBPLAIN  ; Fn with another key
  add a,17       ; past the arrows' 16
  ld b,a
  jr KBTAILN

KBPLAIN:
  call KBASCII
  or a
  jr z,KBNONE    ; no character

KBDELIV:
  ld (RXCHAR),a  ; publish the key
  ld a,$FF
  ld (RXFULL),a
  or a           ; NZ: key ready
  ret

KBNONE:
  xor a          ; Z: no character
  ret

KBCAPS:
  ld hl,LATCHV
  ld a,(hl)
  xor $80        ; Caps bit and LED
  ld (hl),a
  out (SYSLAT),a
  xor a          ; Z: no character
  ret

; Translate key E to ASCII in A.
; D: FFh none, 0 Shift, 1 Ctrl, 2 Fn.
; Letters use Ctrl first, then Shift or
; Caps Lock in LATCHV bit 7.
; Clobbers F, B, C and HL.

KBASCII:
  ld a,e
  ld hl,KBSPEC   ; Return, Esc, space,
                 ; quote and backslash
  ld b,5         ; key, plain, shifted

KBSP:
  cp (hl)
  inc hl         ; keeps Z from compare
  jr z,KBSPHIT
  inc hl         ; skip the two values
  inc hl
  djnz KBSP
  cp $0F         ; ordinary keys
  ret c          ; 03h-0Eh: controls
  cp $21
  jr nc,KBALPHA
  add a,$1D      ; digits/punct 2Ch-3Dh
  inc d
  dec d          ; Z: Shift (D=0)
  ret nz         ; plain character
  sub $2C        ; index into KBSHIFT
  ld hl,KBSHIFT
  jr KBIDX

KBSPHIT:
  ld a,(hl)
  inc hl         ; then shifted value
  inc d
  dec d          ; Z: Shift (D=0)
  ret nz         ; plain unless Shift
  ld a,(hl)
  ret

KBALPHA:
  cp $24
  ret c          ; 21h-23h unchanged
  add a,$3D      ; 24h-3Dh: a to z
  ld c,a
  ld a,d
  dec a          ; Z: Ctrl (D=1)
  jr nz,KBNOCTL
  ld a,c         ; Ctrl makes 01h-1Ah
  sub $60
  ret

KBNOCTL:
  inc a          ; D again, Z: Shift
  jr z,KBUPPER
  ld a,(LATCHV)  ; Caps Lock
  rlca           ; bit 7 into carry
  ld a,c
  ret nc         ; Caps off: lower case

KBUPPER:
  ld a,c
  sub $20
  ret

; Return A = the byte at HL+A, in any
; page. Changes F and HL.

KBIDX:
  add a,l
  ld l,a
  jr nc,KBIDX1   ; handle page carry
  inc h

KBIDX1:
  ld a,(hl)
  ret
