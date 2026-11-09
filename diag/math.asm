; 32-bit arithmetic on little-endian
; values in memory, for block numbers,
; poll counts and rates. HL and DE point
; at the values.

; Z if the 32-bit value at HL is zero.
; Changes A/HL.

ISZ32:
  ld a,(hl)      ; OR all four bytes
  inc hl
  or (hl)
  inc hl         ; the third byte
  or (hl)
  inc hl
  or (hl)        ; Z only if all are 0
  ret

; Copy the 32-bit value at HL to DE.
; Changes BC/DE/HL.

CPY32:
  ld bc,4        ; four bytes
  ldir
  ret

; Store HL at DE as a 32-bit value, its
; high word zero. Keeps the flags.
; Changes DE/HL.

LD16:
  ex de,hl       ; HL: the place
  ld (hl),e      ; the low word
  inc hl
  ld (hl),d
  inc hl
  ld (hl),0      ; the high word
  inc hl
  ld (hl),0
  ret

; (HL) = (HL) + (DE). Carry out on a
; wrap. Changes AF/B/DE/HL.

ADD32:
  ld b,4         ; four bytes, low first
  or a           ; no carry in

AD1:
  ld a,(de)      ; add with carry
  adc a,(hl)
  ld (hl),a
  inc hl         ; INC keeps the carry
  inc de
  djnz AD1
  ret

; (HL) = (HL) - (DE). Carry: a borrow,
; so (HL) was smaller. Changes
; AF/BC/DE/HL.

SUB32:
  ld b,4         ; four bytes, low first
  or a           ; no borrow in

SB1:
  ld a,(de)      ; the subtrahend
  ld c,a
  ld a,(hl)
  sbc a,c        ; with the borrow
  ld (hl),a
  inc hl         ; INC keeps the carry
  inc de
  djnz SB1
  ret

; Carry if (HL) < (DE), unsigned. Stores
; nothing. Changes AF/BC/DE/HL.

CMP32:
  ld b,4         ; as SUB32, but only
  or a           ; the borrow is kept

CP1:
  ld a,(de)
  ld c,a
  ld a,(hl)
  sbc a,c        ; only the borrow
                 ; counts
  inc hl
  inc de
  djnz CP1
  ret

; Raise the 32-bit maximum at DE to the
; value at HL if that is larger. Changes
; AF/BC/DE/HL.

MAX32:
  push hl        ; both pointers kept
  push de
  ex de,hl       ; HL: the maximum
  call CMP32     ; carry: max < value
  pop de
  pop hl
  ret nc         ; not larger: keep it
  jr CPY32       ; the new maximum

; Shift (HL) left one bit; RL32 shifts
; the carry in. Carry out: the old top
; bit. Changes F/HL.

SHL32:
  or a           ; a 0 shifts in

RL32:
  rl (hl)        ; low byte first
  inc hl
  rl (hl)
  inc hl         ; the third byte
  rl (hl)
  inc hl
  rl (hl)        ; the top bit to carry
  ret

; Shift (HL) right one bit. Changes
; F/HL.

SHR32:
  inc hl         ; to the top byte
  inc hl
  inc hl
  srl (hl)       ; a 0 into bit 31
  dec hl
  rr (hl)        ; then down the bytes
  dec hl
  rr (hl)
  dec hl         ; the second byte
  rr (hl)
  ret

; Add one to (HL). Changes F/HL.

INC32:
  inc (hl)       ; the low byte
  ret nz         ; no carry to pass on
  inc hl
  inc (hl)       ; it wrapped: the next
  ret nz
  inc hl
  inc (hl)       ; the third byte
  ret nz
  inc hl
  inc (hl)       ; the top byte
  ret

; Take one from (HL). Changes AF/HL.

DEC32:
  ld a,(hl)      ; the low byte
  dec (hl)
  or a           ; it was 0: a borrow
  ret nz
  inc hl         ; the second byte
  ld a,(hl)
  dec (hl)
  or a           ; it was 0: a borrow
  ret nz
  inc hl         ; the third byte
  ld a,(hl)
  dec (hl)
  or a           ; it was 0: a borrow
  ret nz
  inc hl
  dec (hl)       ; the top byte
  ret

; Divide (HL) by C (1-255) in place,
; from the top byte down. A: the
; remainder. Changes F/B/DE/HL.

DIVB:
  inc hl         ; to the top byte
  inc hl
  inc hl
  ld b,4         ; four bytes
  xor a          ; the remainder so far

DB1:
  ld d,(hl)      ; this byte's 8 bits
  ld e,8

DB2:
  sla d          ; the next dividend bit
  rla            ; into the remainder
  jr c,DB3       ; past 255: C fits
  cp c
  jr c,DB4       ; too small: a 0 bit

DB3:
  sub c          ; take C off
  inc d          ; and set this bit

DB4:
  dec e          ; the byte's next bit
  jr nz,DB2
  ld (hl),d      ; this quotient byte
  dec hl
  djnz DB1
  ret

; M32A = BC x DE, unsigned. Changes
; AF/DE/HL.

MUL16:
  ld hl,0        ; DE:HL, the product
  ld a,16        ; 16 bits of DE

ML1:
  add hl,hl      ; shift DE:HL left
  rl e
  rl d           ; DE's top bit to carry
  jr nc,ML2      ; a 0: no add
  add hl,bc      ; a 1: add BC
  jr nc,ML2
  inc de         ; and its carry

ML2:
  dec a
  jr nz,ML1
  ld (M32A),hl   ; the product
  ld (M32A+2),de
  ret

; M32A = M32A x A. Changes AF/BC/DE/HL
; and M32T.

MULA:
  ld c,a         ; the multiplier
  ld hl,M32A     ; the multiplicand
  ld de,M32T     ; to M32T
  push bc
  call CPY32
  pop bc
  ld hl,0        ; the product from 0
  ld (M32A),hl
  ld (M32A+2),hl
  ld b,8         ; eight bits of C

MA1:
  ld hl,M32A     ; shift the product
  call SHL32
  sla c          ; C's next bit, top
                 ; first
  jr nc,MA2      ; a 0: no add
  push bc        ; ADD32 changes B
  ld hl,M32A
  ld de,M32T
  call ADD32     ; a 1: add M32T
  pop bc

MA2:
  djnz MA1
  ret

; M32A = M32A / M32B, and M32R the
; remainder, by shift and subtract. M32B
; must not be zero. Changes AF/BC/DE/HL
; and M32T.

DIV32:
  ld hl,0        ; the remainder from 0
  ld (M32R),hl
  ld (M32R+2),hl
  ld b,32        ; one quotient bit each

DV1:
  push bc        ; the routines change B
  ld hl,M32A     ; the dividend's top
  call SHL32     ; bit out of M32A
  ld hl,M32R     ; and into the
  call RL32      ; remainder
  ld hl,M32R     ; try R - B in M32T
  ld de,M32T
  call CPY32
  ld hl,M32T     ; R - B
  ld de,M32B
  call SUB32
  jr c,DV2       ; R < B: the bit is 0
  ld hl,M32T     ; else keep R - B
  ld de,M32R
  call CPY32
  ld hl,M32A     ; and the bit is 1,
  set 0,(hl)     ; in the space shifted

DV2:
  pop bc
  djnz DV1
  ret
