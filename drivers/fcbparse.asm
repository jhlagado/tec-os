; The ROM's name parser, copied, for
; SHELL.SVC and DIR.COM: included by
; shellcmd.asm and by dir.asm. Each
; defines FCBBASE, SPACE and the FCB.

; The name at HL into the 36-byte FCB at
; DE, whose drive, name, type and rest
; are cleared first. Carry for a bad
; name or drive. Returns HL at the
; delimiter. FCBBASE keeps the FCB for
; UNAMBIG.

PARSEFCB:
  ld (FCBBASE),de
  push de        ; the FCB's base
  xor a
  ld (de),a      ; the default drive
  inc de         ; the name next
  ld b,11
  ld a,SPACE     ; blank it

FCBSPC:
  ld (de),a      ; a blank in the name
  inc de
  djnz FCBSPC    ; all eleven bytes
  xor a
  ld b,24        ; 24 zero bytes next

FCBZERO:
  ld (de),a      ; the rest zero
  inc de
  djnz FCBZERO   ; to byte 35
  pop de
  ld a,(hl)      ; the name's first
  or a
  ret z          ; no name
  inc hl         ; look at the next
  ld a,(hl)
  dec hl
  cp ':'         ; a drive's colon?
  jr nz,FCBNAME  ; no drive
  ld a,(hl)
  sub 'A'        ; A=0 for A:
  cp 16
  jr nc,PLEND    ; past P: refused
  inc a
  ld (de),a      ; the drive, 1 for A
  inc hl
  inc hl         ; past 'd:'

FCBNAME:
  inc de
  ld b,8         ; eight bytes
  call PARFLD    ; the name
  ret c
  ld a,(hl)      ; after the name
  cp '.'
  jr z,FCBDOT    ; a type follows
  or a           ; NZ for a name
  ret

FCBDOT:
  inc hl
  ld a,e         ; E past the unused
  add a,b        ; past the name's
  ld e,a         ; unused bytes
  jr nc,FCBTYP
  inc d          ; carry into D

FCBTYP:
  ld b,3         ; the type

; A field of B bytes: its characters,
; or ? for each left after a *. Carry
; for a bad character or a field too
; long.

PARFLD:
  call FCBEND    ; Z at the field's end
  ret z          ; the field's end
  cp '*'         ; a star fills it
  jr z,PARSTAR
  call VALIDCHR  ; refused characters
  ret c          ; a bad character
  ld (de),a      ; store it
  inc de
  inc hl
  djnz PARFLD    ; the field's next
  call FCBEND    ; past its end?
  ret z          ; it fits exactly

PARLONG:
  inc hl
  call FCBEND    ; a longer field
  jr nz,PARLONG  ; past the extra

PLEND:
  scf            ; carry: refused
  ret

; Carry if A is one of BADCHARS. HL and
; BC are kept.

VALIDCHR:
  push hl
  push bc
  ld hl,BADCHARS
  ld bc,13       ; thirteen of them
  cpir           ; Z if A is one

CHRRET:
  pop bc         ; restore
  pop hl
  scf            ; Z: carry, refused
  ret z          ; refused
  or a           ; NZ: clear carry
  ret

PARSTAR:
  ld a,'?'       ; a star means ?s

STARLP:
  ld (de),a      ; to the field's end
  inc de
  djnz STARLP
  inc hl         ; past the *

PARIGN:
  call FCBEND    ; Z: its end
  ret z          ; past what follows *
  inc hl
  jr PARIGN

; Z at a name's end: a zero, a space,
; = or the dot. A is the byte.

FCBEND:
  ld a,(hl)
  or a           ; zero ends it
  ret z
  cp SPACE
  ret z          ; space ends it
  cp '='
  ret z          ; = ends it
  cp '.'
  ret            ; Z for the dot

BADCHARS: DB "<>,;:[]%|()/",92
