
; Clear DRVTAB and following DRVIDX,
; then BUFOK. Return A=0/Z, carry clear,
; B=0 and HL past the indices. Change
; AF/B/HL. Leave DPHs, slots, vectors,
; mount scratch and cache lines alone.
; This is not the public
; unmount/flush service.

UNMOUNT:
  ld hl,DRVTAB
  ld b,MAXDRV*DRVESZ+MAXDRV

UNM:
  ld (hl),0
  inc hl
  djnz UNM
  xor a
  ld (BUFOK),a
  ret

; Find geometry id A in GEOTAB's GEOCNT
; six-byte entries: id, zero, payload
; word and DPB pointer. Return Z with HL
; at the entry and A unchanged, or NZ
; with A=input OR 1 and HL past the
; table. Keep C. Change AF/B/DE/HL.

GEOFIND:
  ld hl,GEOTAB
  ld b,GEOCNT

GEOF:
  cp (hl)
  ret z
  ld de,GEOESZ
  add hl,de
  djnz GEOF
  or 1
  ret

; Compare unsigned little-endian 32-bit
; values at HL and DE. C means first <
; second, Z means equal. On a
; difference, pointers stop at the
; highest differing byte. Equality
; leaves each pointer one byte before
; its original low byte, modulo 65536,
; and B=0. Change A/B/F.

CMP32:
  inc hl
  inc hl
  inc hl
  inc de
  inc de
  inc de
  ld b,4

CMPL:
  ld a,(de)
  cp (hl)
  jr nz,CMPNE
  dec hl
  dec de
  djnz CMPL
  ret

CMPNE:
  ccf
  ret c
  or 1
  ret

; Sum block 0 in MNTLN modulo 65536,
; excluding its two checksum bytes.
; MNBUF must hold its first 32 bytes.
; Return HL=sum and DE=stored checksum.
; Change AF/BC and MNBUF/MNTPRV scratch.
; Subtract each checksum byte, not the
; stored word.

HDRSUM:
  ld de,(MNBUF+HCKSUM)
  push de
  ld hl,0
  ld (MNTPRV),hl
  call MNSUM
  pop de

; HSSUB subtracts unsigned byte A from
; HL with no input borrow. Keep DE.
; Change BC/F. HDRSUM calls for E then
; falls through for D.

  ld a,e
  call HSSUB
  ld a,d

HSSUB:
  ld c,a
  ld b,0
  or a
  sbc hl,bc
  ret

; Add BC unsigned bytes at DE to HL
; modulo 65536. BC=0 means 65536 bytes.
; Return BC=0/Z, carry clear and DE past
; the bytes with 16-bit wrap. Change AF.
; Used for table/header sums and BDOS
; allocation-vector checksums. No
; source-bound check.

SUMDE:
  ld a,(de)
  add a,l
  ld l,a
  jr nc,SUMDE1
  inc h

SUMDE1:
  inc de
  dec bc
  ld a,b
  or c
  jr nz,SUMDE
  ret

; Read drive C's descriptor (C=0..3).
; Return A=FFh and carry/NZ for an empty
; drive. On read failure return NZ
; without an IX result guarantee.
; Success gives IX=MNBUF/Z. Keep C.
; Change AF/B/DE/HL and IX as result. A
; full metadata fill sets I=0. DESCIX's
; shared-buffer and bank/IFF
; conditions apply.

DRVDESC:
  ld hl,DRVIDX
  ld b,0
  add hl,bc
  ld a,(hl)
  sub 1
  ret c
  push bc
  call DESCIX
  pop bc
  ret
