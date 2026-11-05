; The volume code's helpers, after
; vol.asm: the drive table cleared
; (UNMOUNT), a geometry looked up
; (GEOFIND), 32-bit block numbers
; compared (CMP32), the header's and the
; table's sums (HDRSUM, SUMDE), and a
; drive's descriptor read back (DRVDESC)
; for the boot listing and the LCD.

; Forget every mounted volume: DRVTAB
; and DRVIDX zeroed, and the BIOS's
; buffered record dropped. Destroys AF,
; B and HL.

UNMOUNT:
  ld hl,DRVTAB   ; and DRVIDX, which
                 ; follows it
  ld b,MAXDRV*DRVESZ+MAXDRV

UNM:
  ld (hl),0      ; every entry and index
                 ; byte zero
  inc hl
  djnz UNM
  xor a          ; BUFOK 0: no record
                 ; buffered
  ld (BUFOK),a
  ret

; A = geometry id. Returns Z and HL ->
; its GEOTAB entry (id, 0, payload
; blocks, DPB), or NZ. Keeps C, and A
; when found. Destroys B and DE.

GEOFIND:
  ld hl,GEOTAB   ; GEOCNT entries of
                 ; GEOESZ bytes
  ld b,GEOCNT

GEOF:
  cp (hl)        ; the entry's id
  ret z
  ld de,GEOESZ   ; the next entry
  add hl,de
  djnz GEOF
  or 1           ; NZ: no such geometry
  ret

; Compare the 32-bit little-endian
; values at HL and DE. C when (HL) <
; (DE), Z when equal, with HL and DE at
; the low bytes; otherwise they stop at
; the first byte, from the top, that
; differs. Destroys A and B.

CMP32:
  inc hl         ; from the top bytes
                 ; down
  inc hl
  inc hl         ; HL at its top byte
  inc de
  inc de
  inc de         ; and DE at its
  ld b,4         ; four bytes at most

CMPL:
  ld a,(de)
  cp (hl)        ; (DE) - (HL), the
                 ; first difference
                 ; decides
  jr nz,CMPNE
  dec hl         ; equal so far: the
                 ; next byte down
  dec de
  djnz CMPL
  ret            ; Z: all four equal

CMPNE:
  ccf            ; flags now describe
                 ; (HL) - (DE)
  ret c
  or 1           ; (HL) > (DE): clear Z,
                 ; carry already clear
  ret

; HL = 16-bit sum of the header's bytes,
; block 0 in MNTLN with MNBUF its first
; 32, the checksum field left out, and
; DE = that checksum. Destroys AF and
; BC.

HDRSUM:
  ld de,(MNBUF+HCKSUM)
  push de        ; the checksum, across
                 ; the sum
  ld hl,0        ; MNSUM adds to
                 ; MNTPRV's word, from 0
  ld (MNTPRV),hl
  call MNSUM     ; every header byte
  pop de
  ld a,e         ; take the two checksum
                 ; bytes back out
  call HSSUB
  ld a,d         ; HSSUB's second pass,
                 ; by falling in

HSSUB:
  ld c,a         ; HL less the byte in A
  ld b,0
  or a           ; no borrow in
  sbc hl,bc
  ret

; HL = HL + each of the BC bytes at DE,
; unsigned, for the header's sum and the
; table blocks' (MOUNT). BC from 1; 0 is
; 65,536. Returns DE past the bytes and
; BC = 0. Destroys AF.

SUMDE:
  ld a,(de)
  add a,l        ; the byte into the low
                 ; half,
  ld l,a
  jr nc,SUMDE1
  inc h          ; its carry into the
                 ; high

SUMDE1:
  inc de
  dec bc         ; BC counts the bytes
                 ; left
  ld a,b
  or c
  jr nz,SUMDE    ; every byte
  ret

; IX -> the descriptor of the volume on
; drive C, read from its block of the
; table. NZ if the drive has none or the
; block does not read. Keeps C. Destroys
; AF, B, DE and HL.

DRVDESC:
  ld hl,DRVIDX   ; the drive's index + 1
  ld b,0
  add hl,bc
  ld a,(hl)
  sub 1          ; carry from 0: no
                 ; volume
  ret c          ; NZ as well: none here
  push bc        ; C, which DESCIX
                 ; destroys
  call DESCIX    ; A = the index: IX ->
                 ; its copy
  pop bc
  ret
