; EDIT address byte [...]. Stage the
; entire line before writing to RAM.
; The MEM row buffer is larger than
; the input line and is idle here.

CEDIT:
  call ADDRW     ; hex or register
  jp c,BAD       ; invalid address
  push de        ; destination
  ld ix,DUMPLN   ; staging buffer
  ld c,0         ; byte count
  call SKIP
  jp z,BAD       ; at least one byte

EDITNEXT:
  call HEXW      ; preserves C and IX
  jp c,BAD       ; malformed byte
  ld a,d
  or a
  jp nz,BAD      ; value above FFh
  ld (ix+0),e    ; stage the byte
  inc ix
  inc c          ; count staged bytes
  call SKIP
  jr nz,EDITNEXT

  pop de         ; destination
  ld b,0         ; BC = byte count
  ld h,b
  ld l,c         ; HL = byte count
  call RANGE     ; validate whole span
  jp c,BAD       ; outside program RAM
  dec hl         ; inclusive end
  push de
  push hl        ; save for readback
  ld hl,DUMPLN   ; validated bytes
  ldir           ; commit the edit
  pop de         ; last changed byte
  pop hl         ; first changed byte
  jp DUSELR      ; show changed bytes
