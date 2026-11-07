; Video console dispatch through vectors
; installed by CONSWV. VPUT/VGET use row
; B, column C. Row transfers use
; LINEBUF. Wrappers overwrite HL, then
; use the driver's contract. Installed
; vectors and valid coordinates are
; required. Scrolling is terminal line
; deletion.

; Cold CONINIT tail, CONDEV=CDMTX or 0.
; Probe failure returns. Success sets
; CDTMS and enters PISTART, which
; installs the console only with a
; keyboard. A bare VDP has no console
; table/record. Changes AF, BC, DE and
; HL.

VIDINIT:
  call TMSINIT   ; Z: both patterns
                 ; match.
  ret nz
  ld hl,CONDEV
  set 1,(hl)     ; CDTMS.
  jp PISTART

; Character and clear calls through the
; selected driver. No local pointer,
; coordinate or claim check.

; VPUT: A at row B, column C.

VPUT:
  ld hl,(VPUTV)
  jp (hl)

; VGET: A = the character at row B,
; column C.

VGET:
  ld hl,(VGETV)
  jp (hl)

; VCLREOL: row B cleared from column C
; to its end.

VCLREOL:
  ld hl,(VCLRV)
  jp (hl)

; Restore the selected driver. PICO
; reloads mode/font and shows the latest
; drawn page, keeping name bytes. GLCD
; restores graphics mode and clears its
; text layer, keeping graphics RAM.
; TMSSET/GLCRST define clobbers and
; failure.

VREST:
  ld hl,(VRSTV)

; Jump to valid HL. After CALL VHLJP the
; selected routine returns directly to
; that call's return address.

VHLJP:
  jp (hl)

; VRDROW: row B into LINEBUF.

VRDROW:
  ld hl,(VRDRV)
  jp (hl)

; VWRROW: LINEBUF to row B.

VWRROW:
  ld hl,(VWRRV)
  jp (hl)

; Begin moving inclusive rows C..VSBOT.
; For active CRT with an unclaimed PICO,
; call VFNV with A=1, B=C and C=VSBOT.
; Changes AF/HL/BC plus driver effects:
; D and LINEBUF for PICO begin. Gate
; flags are not a status result. UC1
; remains drawable under a PICO claim.

VTMBEG:
  ld b,c         ; Inclusive B..C.
  ld a,(VSBOT)
  ld c,a
  ld a,1
  jr VTFN

; End the row move without flipping:
; function 2 through VTFN's CRT/claim
; gates.

VTMEND:
  ld a,2
  jr VTFN

; Show the drawn page: function 0
; through VTFN's CRT/claim gates.

VTFLIP:
  xor a

VTFN:
  ld l,a
  ld a,(CONMOD)
  cp CMCRT
  ret nz
  call VTOWN
  ret nz
  ld a,l
  ld hl,(VFNV)
  jp (hl)

; GLCD.SVC installs its resident table
; through TNDRVR for UC1. REMOVE drops
; it with HL=0. CONSW copies the
; entries. Public SVDRV accepts UC1
; only. PIVEC is the ROM's CRT table
; from PISTART. SVCGO tests the table's
; high byte against SVCHEAD before
; automatic console selection.

; Internal hook: A=CMCRT/CMUC1, HL=table
; or 0 to drop. PIVEC/GLVEC must share a
; page. Table: six terminal words, VTFN
; word, columns byte and rows byte. RAM
; tables are at 0100h or above. Install
; needs matrix and an empty pointer.
; CF=1 refuses with table state
; unchanged. On install: CF=0,
; HL=LINEBUF. Caller keeps table/buffer
; valid and visible. Keeps BC. Changes
; AF/DE/HL. SVDRV adds UC1/startup
; checks.

VIDHOOK:

  add a,LOW(PIVEC)-1
  ld e,a
  ld d,HIGH(PIVEC)
  ld a,h
  or l
  jr z,VIDHOFF
  ld a,(CONDEV)
  rrca
  ccf
  ret c
  inc de
  ld a,(de)      ; High byte 0 = empty.
  dec de
  or a
  scf
  ret nz
  ex de,hl
  ld (hl),e
  inc hl
  ld (hl),d
  ld hl,LINEBUF
  or a
  ret

VIDHOFF:
  ex de,hl
  ld (hl),d
  inc hl
  ld (hl),d
  ld a,l

; Only GLVEC removal clears CDGLC.

  cp LOW(GLVEC+1)
  jr nz,VIDHF1
  ld hl,CONDEV
  res 2,(hl)

VIDHF1:

; Other active mode and screen stay
; unchanged (KE-190). If this mode was
; active, set CMTTY for next-call IOBYTE
; reselection. IOBYTE stays unchanged.
; No driver call or VRAM clear occurs
; here. Returns carry clear. Changes
; AF/DE/HL.

  sub LOW(PIVEC)
  ld hl,CONMOD
  xor (hl)
  ret nz
  ld (hl),a
  ret
