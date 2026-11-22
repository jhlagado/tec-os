; The CCP supplies an uppercased tail
; at 0080h. Copy it before LOAD can
; reuse the default DMA at 0080h.

MENTER:
  ld a,($0080)   ; tail length
  or a
  jp z,PROMPT    ; interactive entry
  cp 41          ; fits the line buffer?
  jp nc,BAD
  ld c,a
  ld b,0         ; BC = length
  ld hl,$0081
  ld de,LBUF+2
  ldir           ; copy the arguments
  xor a
  ld (de),a      ; terminate the copy
  ld hl,LBUF+2
  call SKIP      ; skip tail spaces
  push hl        ; start of filename
  call FCBP      ; parse the filename
  pop hl
  jp c,PROMPT    ; legacy switches
  push hl
  ld hl,FCB+9    ; extension field
  ld a,(hl)
  cp 'B'         ; choose the test
  jr z,MAUTBIN   ; BIN?
  ld de,THEX
  jr MAUTTYP

MAUTBIN:
  ld de,MTBIN

MAUTTYP:
  ld b,3         ; match the file type
  call SCMP
  pop hl
  jp nz,PROMPT   ; other legacy tails
  ld a,1         ; launch after load
  ld (AUTORUN),a
  jp CLOAD       ; use the same loader

MTBIN: DB "BIN"

; Exit only after a clean return from
; a one-shot run. Stop on a breakpoint
; or if the tables have been damaged.

MAUTRET:
  ld a,(AUTORUN)
  or a
  ret z          ; ordinary GO
  ld a,(BRKF)
  ld hl,DMG
  or (hl)        ; breakpoint or damage
  ret nz
  jp CEXIT


; Restore DMA and run after a
; successful one-shot load.

MAUTGOOD:
  call DMA80
  ld a,(AUTORUN)
  or a           ; a pending launch?
  jp nz,GO1
  jp PROMPT
