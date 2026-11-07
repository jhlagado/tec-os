; ST7920 128x64 console: 21x8 cells,
; each 6x8 pixels. Resident text/state
; use the ROM font and LINEBUF.
; Pages lie below the prior top. The new
; (0006h) then names entry below body.
; Keep resident storage until removal.
; Calls use the caller stack and classic
; bank mapping. Resident code/state,
; font, LINEBUF and the return stack
; must be mapped during each call.
; No interrupt printing or overlapping
; calls: drawing, poll and saved-output
; scratch are shared.
; Busy polling neither identifies the
; device nor acknowledges rendering.

%INCLUDE "../src/abi.inc"

GLCOLS EQU 21
GLROWS EQU 8
IOBYTE EQU $0003

  ORG $0100

; Removable format-4 header, no deps.
; Writer fills REMOVE, size, relocation
; and INIT. Extra RAM is zero. Declared
; stack use: BDOS 2, BIOS 0, CCP 6.

HDR: DB 'D',SVCFMT,0,1
  DW 0,0,0,0
  DB 2,0,6
  DW 0
  DB "GLCD    "

; Six terminal vectors in ROM order,
; then no page-function vector: only
; CRT uses page moves. Geometry follows.
; LBUF keeps the returned LINEBUF until
; the hook is removed.

VTAB: DW GLCPUT,GLCGET,GLCCLR,GLCRST,GLRDR,GLWRR
  DW 0
  DB GLCOLS,GLROWS
LBUF: DW 0

; Install UC1's hook last. Font failure,
; busy timeout, no matrix or an occupied
; table causes failure. CON=CRT startup
; gives TNENODV (KE-200). Local state
; may change on failure. No hook/record
; is published. Typed load may stay as
; CRT keeps selection (SVCGO, KE-150).
; Success: A=0, NC, HL=0, no records,
; LBUF=LINEBUF. Selection is via SVCGO.
; Failure: carry, A=status.
; Changes AF/BC/DE/HL.

INIT:
  ld c,TNFONT
  call ABICALL
  ret c
  ld (FONTP),hl
  call GLCWAIT
  ld a,TNENODV
  scf
  ret nz
  ld b,3         ; UC1:
  ld hl,VTAB
  ld c,TNDRVR
  call ABICALL
  ret c
  ld (LBUF),hl
  ld hl,0
  or a
  ret

; UNLOAD: find PICO version >=1.
; Found and CON field=UC1: change only
; that field to CRT. Drop UC1's hook.
; If UC1 is in effect, reset CONMOD for
; lazy reselection. Other modes stay.
; No graphics reset. Returns A=0, Z, NC.
; Changes AF/BC/DE/HL.

REMOVE:
  ld de,PICONAM
  ld bc,$0100+TNFIND
  call ABICALL
  jr c,REMOV1
  ld hl,IOBYTE
  ld a,(hl)
  cpl
  and 3
  jr nz,REMOV1
  res 1,(hl)

REMOV1:
  ld b,3
  ld hl,0
  ld c,TNDRVR
  jp ABICALL

PICONAM:
  DB "PICO    "  ; the ROM console's
                 ; record

; The ST7920's ports: commands and the
; busy flag, and display data.

GLCCMD EQU $07
GLCDAT EQU $87

; Poll busy bit 7 at most 256 times.
; Ready: A=0, Z, NC. Timeout: A=1, NZ,
; NC. Keeps BC/DE/HL. Uses shared GLWN,
; no extra counter push. No elapsed-time
; or permanent-absence guarantee.

GLCWAIT:
  xor a
  ld (GLWN),a

GLCWL:
  in a,(GLCCMD)  ; bit 7, busy, into
                 ; carry
  rlca
  jr nc,GLCWOK
  ld a,(GLWN)
  dec a
  ld (GLWN),a
  jr nz,GLCWL
  or 1
  ret

GLCWOK:
  xor a
  ret

; Send command A after bounded polling.
; NZ: byte dropped, no OUT. Z: sent.
; Returns the original A, carry clear.
; Keeps BC/DE/HL. Changes F. Shared
; GLOUT makes overlapping calls unsafe.

GLCC:
  ld (GLOUT),a
  call GLCWAIT
  ld a,(GLOUT)
  ret nz         ; no OUT (KE-198)
  out (GLCCMD),a
  ret

; Data A, with GLCC's per-byte result:
; original A, Z sent/NZ dropped, NC.
; Keeps BC/DE/HL. Changes F.
; Graphics words send high byte first,
; then low. A drop is not rolled back
; or aggregated into a redraw result.

GLCDW:
  ld (GLOUT),a
  call GLCWAIT
  ld a,(GLOUT)
  ret nz
  out (GLCDAT),a
  ret

; VRDROW: valid row B=0..7 to installed
; LINEBUF, exactly 21 bytes of text.
; No graphics I/O. Changes AF/BC/DE/HL.
; BC ends at zero, HL/DE advance 21.

GLRDR:
  ld c,0
  call GLCADR
  ld de,(LBUF)   ; to LINEBUF
  ld bc,GLCOLS
  ldir
  ret

; VWRROW: 21 LINEBUF bytes to valid row
; B=0..7, then redraw. Keeps B through
; copy and redraw. Changes AF/C/DE/HL.
; Text is copied even if graphics bytes
; later drop.

GLWRR:
  push bc
  ld c,0
  call GLCADR

; Exchange that row address into DE,
; then use LINEBUF as the copy source.

  ex de,hl
  ld hl,(LBUF)
  ld bc,GLCOLS
  ldir
  pop bc
  jp GLCROW

; VREST: attempt graphics-mode setup.
; First poll timeout: A=1/NZ, no output.
; Else attempt all five GLCMOD bytes,
; even after an earlier byte drops.
; Final Z/NZ describes only the last
; byte, not the whole sequence. No
; GLTEXT clear or explicit graphics-RAM
; write occurs here.
; Changes AF/B/HL. Keeps C/DE.

GLCRST:
  call GLCWAIT
  ret nz
  ld hl,GLCMOD
  ld b,5

GLCRSL:
  ld a,(hl)
  call GLCC
  inc hl
  djnz GLCRSL
  ret

; Basic set, display on/no cursor, text
; clear, extended set, graphics on.

GLCMOD: DB $30,$0C,$01,$34,$36

; HL=GLTEXT+21*B+C, B=0..7/C=0..20.
; C=0 for row bases. No bounds check.
; Keeps BC/DE. Changes AF.

GLCADR:
  push de
  ld hl,GLTEXT
  ld de,GLCOLS
  ld a,b
  or a
  jr z,GLCAC

GLCAM:
  add hl,de
  dec a
  jr nz,GLCAM

GLCAC:
  ld e,c         ; D=0 from DE=21
  add hl,de
  pop de
  ret

; VPUT: A at valid B=0..7/C=0..20. Store
; the full byte, bit 7 means reverse.
; Redraw words floor(6*C/16) through
; floor((6*C+5)/16) on eight pixel rows
; from 8*B. Send high byte then low.
; Keeps B. Changes AF/C/DE/HL and shared
; drawing/poll/output scratch. Drops do
; not undo text or stop the loops.

GLCPUT:
  push af
  call GLCADR
  pop af
  ld (hl),a
  push bc
  ld c,0
  call GLCADR
  pop bc
  ld (GLROWP),hl
  ld a,c         ; pixels 6*C..6*C+5
  add a,a
  ld e,a
  add a,a
  add a,e
  ld e,a
  srl a
  srl a
  srl a
  srl a
  ld d,a         ; first word
  ld a,e
  add a,5
  srl a
  srl a
  srl a
  srl a
  ld e,a         ; last word
  ld a,b
  add a,a
  add a,a
  add a,a
  ld (GLY),a
  ld c,8

GLCPR:
  ld a,d

GLCPW:
  ld (GLW),a
  push bc
  push de        ; word bounds over
                 ; address/composition
  call GLCSETA
  call GLCCMP
  ld a,d
  call GLCDW
  ld a,e
  call GLCDW
  pop de
  pop bc
  ld a,(GLW)
  cp e
  jr z,GLCPN
  inc a
  jr GLCPW

GLCPN:
  ld hl,GLY
  inc (hl)
  dec c
  jr nz,GLCPR
  ret

; VGET: A=stored byte at valid row B,
; column C, including reverse bit 7.
; Software text, not graphics RAM.
; Changes F/HL. Keeps BC/DE.

GLCGET:
  call GLCADR
  ld a,(hl)
  ret

; VCLREOL: C>=21 keeps text/drawing
; unchanged. Else clear 21-C cells, draw
; valid row B. Pending-wrap C=21 would
; give a zero count and a 256-byte fill
; without this guard. Keeps B. Changes
; AF/C/DE/HL on redraw. Byte drops can
; leave graphics partial, text cleared.

GLCCLR:
  ld a,c
  cp GLCOLS
  ret nc
  call GLCADR
  ld a,GLCOLS
  sub c

GLCCL:
  ld (hl),' '
  inc hl
  dec a
  jr nz,GLCCL
  jr GLCROW

; Redraw valid row B=0..7: eight pixel
; rows from 8*B, eight high/low words
; each, composed from software text.
; One address pair per pixel row relies
; on controller word auto-advance.
; Keeps B. Changes AF/C/DE/HL and shared
; scratch. Byte drops do not stop the
; loops or form an aggregate status.

GLCROW:
  ld c,0
  call GLCADR
  ld (GLROWP),hl
  ld a,b
  add a,a
  add a,a
  add a,a
  ld (GLY),a
  ld c,8

GLCRL:
  xor a
  ld (GLW),a
  push bc
  call GLCSETA

GLCRW:
  call GLCCMP
  ld a,d
  call GLCDW
  ld a,e
  call GLCDW
  ld hl,GLW
  inc (hl)
  ld a,(hl)
  cp 8
  jr nz,GLCRW    ; controller advances
  pop bc
  ld hl,GLY
  inc (hl)
  dec c
  jr nz,GLCRL
  ret

; Address valid GLY=0..63/GLW=0..7.
; Lower rows subtract 32 from vertical
; and add 8 to horizontal: rows 32..63
; map to rows 0..31, words 8..15.
; Set bit 7 on both, vertical first.
; Final Z/NZ is horizontal only.
; Changes AF/B. Keeps C/DE/HL.

GLCSETA:
  ld a,(GLY)
  ld b,0
  cp 32
  jr c,GLCSU
  sub 32
  ld b,8

GLCSU:
  or $80
  call GLCC
  ld a,(GLW)
  add a,b
  or $80
  jp GLCC

; Compose word GLW=0..7 at GLY=0..63
; from a valid GLROWP 21-character row.
; Returns DE pixels, D left/high.
; Signed offset=6*first-16*word. Shift
; right for positive, left for negative,
; discard outside bits then OR pieces.
; GLGLY keeps accumulating DE. Only loop
; BC is saved around it, not whole-call
; BC or F/HL. Changes AF/BC/HL/GLOFF.

GLCCMP:
  ld a,(GLW)
  add a,a
  ld hl,GLCSPAN
  add a,l
  ld l,a
  jr nc,GLCCS    ; table page carry
  inc h

GLCCS:
  ld b,(hl)
  inc hl
  ld c,(hl)
  ld a,b
  add a,a
  ld l,a
  add a,a
  add a,l
  ld l,a
  ld a,(GLW)
  add a,a
  add a,a
  add a,a
  add a,a
  neg
  add a,l
  ld (GLOFF),a
  ld de,0

GLCCH:
  push bc
  ld hl,(GLROWP)
  ld a,b
  add a,l
  ld l,a
  jr nc,GLCCG    ; text-row page carry
  inc h

GLCCG:
  ld a,(hl)
  call GLGLY
  ld h,a
  ld l,0
  ld a,(GLOFF)
  or a
  jr z,GLCCO
  jp m,GLCCLF

GLCCR:
  srl h
  rr l
  dec a
  jr nz,GLCCR
  jr GLCCO

GLCCLF:
  neg

GLCCLL:
  add hl,hl
  dec a
  jr nz,GLCCLL

GLCCO:
  ld a,d
  or h
  ld d,a
  ld a,e
  or l
  ld e,a
  ld a,(GLOFF)
  add a,6
  ld (GLOFF),a
  pop bc
  inc b
  dec c
  jr nz,GLCCH
  ret

; A=character, FONTP from successful
; INIT. Return font row GLY&7 in A.
; Low-seven-bit controls use a space.
; Normal font: five pixels and a blank
; column in bits 7..2. Input bit 7
; reverses all six, low two bits stay 0.
; Keeps B/DE. Changes F/C/HL. GLCCMP
; saves only local BC around this call.

GLGLY:
  ld c,a
  and $7F
  sub $20
  jr nc,GLGL1
  xor a

GLGL1:
  ld l,a
  ld h,0
  add hl,hl
  add hl,hl
  add hl,hl
  ld a,(GLY)
  and 7
  add a,l        ; low three bits of
                 ; 8*glyph are zero
  ld l,a

; Add the full font pointer with carry,
; keeping character C and pixels DE.

  ld a,(FONTP)
  add a,l
  ld l,a
  ld a,(FONTP+1)
  adc a,h
  ld h,a
  ld a,(hl)
  bit 7,c
  ret z
  cpl
  and $FC
  ret

; For each word: the first character it
; touches and how many. Final two screen
; pixels remain blank.

GLCSPAN:
  DB 0,3, 2,4, 5,3, 8,3, 10,4, 13,3, 16,3, 18,3

; GLTEXT: 21x8 cells in row order.
; At GLCSETA/GLCCMP use, GLY=0..63
; and GLW=0..7. After eight pixel rows,
; GLY=8*B+8, up to 64 for valid B=7.
; GLCROW also leaves GLW=8. Early clear
; returns before redraw set no endpoint.
; GLROWP is established per operation.
; Shared scratch is not re-entrant.

GLTEXT: DS GLCOLS*GLROWS,' '
GLY: DS 1
GLW: DS 1
GLROWP: DS 2
GLOFF: DS 1      ; signed cell offset
                 ; from word edge
GLWN: DS 1       ; busy polls left
GLOUT: DS 1      ; byte over polling
FONTP: DW 0      ; INIT's ROM font

IMGEND:
