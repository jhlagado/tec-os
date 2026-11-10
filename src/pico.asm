; ROM PICO console, record version 4.
; 80 x 24 and 40 x 24 use 6-pixel cells.
; Graphics I is 32 x 24 in 8-pixel
; cells. CON PICO selects the width.
; Cold installation needs the VDP and
; matrix keyboard. Reset selects 40
; columns. Warm boot keeps the width;
; PIICLR ends its supported IE session.
; ABI state offsets retain v3 layout.

; Graphics I's colour table in VRAM

COLOUR EQU $2000

; and its sprite attribute table

SPRITE EQU $1B00

; Cold width and 39-byte PIBLK template:
; seven terminal words, columns/rows,
; four graphics words, PICOWID and the
; 13-byte record. The record is the
; permanent registry tail. Bare console
; selection keeps the current width.

PIDEFLT EQU 40

PITPL: DW TMSPUT,TMSGET,TMSCLR,TMSSET,TMSRDR,TMSWRR,TMSFN
  DB PIDEFLT,24  ; Columns, rows.

; PICOREG, PICOFIL

  DW GFXREG,GFXFIL

; PICOWR, PICORD

  DW GFXWR,GFXRD
  DW TMSWID      ; PICOWID
  DW 0           ; Record link = 0.
  DB "PICO    ",PICOVER
  DW PIBLK       ; Record table.
PITPLN EQU $-PITPL

; Install the cold console from VIDINIT
; after its successful VDP probe,
; HL=CONDEV. Without CDMTX, return. Copy
; PITPL, initialise width and publish
; PIVEC/REGHEAD. Set IOBYTE=CMCRT, other
; fields zero. CONMOD stays CMTTY for
; next-call selection/programming.
; Changes AF, BC, DE and HL.

PISTART:
  bit 0,(hl)
  ret z
  ld hl,PITPL
  ld de,PIBLK
  ld bc,PITPLN
  ldir
  ld a,PIDEFLT
  call TMSW
  ld hl,PIBLK
  ld (PIVEC),hl
  ld hl,PIREC
  ld (REGHEAD),hl
  ld a,CMCRT
  ld (IOBYTE),a
  ret

; Set the PICO console width.
; PICOWID is the public table offset
; of TMSWID's address, at byte 24.
; A=80, 40 or 32. CF=1 for a
; claim or invalid width, with stored
; width/mode unchanged on normal return.
; CF=0 selects RAM geometry. Active CRT
; is reselected and cleared at the next
; console call. Other consoles stay
; selected. Changes AF, BC, DE and HL.

TMSWID:
  ld hl,VCLAIM
  inc (hl)       ; Transient claim test.
  dec (hl)
  scf            ; CF=1 if claimed.
  ret nz
  call TMSW
  ret c
  ld hl,CONMOD
  ld a,(hl)
  dec a
  ret nz
  ld (hl),a
  ret

; Select RAM geometry for A=80, 40 or
; 32. CF=1 for invalid A before any
; store. Valid return: A=0, Z, CF=0.
; Build 24 row addresses at names + row
; * PIWID and reset drawn/shown pages
; and move state. TMSSET programs the
; VDP later. Changes AF, BC, DE and HL.

TMSW:
  ld hl,REGS80
  ld bc,$1010    ; Names/PITPG high
                 ; bytes.
  cp 80
  jr z,TMSW1
  ld hl,REGS40
  ld bc,$0804    ; Names 0800h, page
                 ; 0400h.
  cp 40
  jr z,TMSW1
  ld hl,REGS32
  cp 32
  scf
  ret nz

TMSW1:
  ld (PIWID),a

  ld (PIREGP),hl
  ld e,a         ; width
  ld a,c
  ld (PITPG),a
  ld c,e         ; C = width per row
  ld h,b         ; Row table base.
  ld l,0
  ld de,PIROWT
  ld b,24

TMSW2:
  ex de,hl
  ld (hl),e
  inc hl
  ld (hl),d
  inc hl
  ex de,hl
  ld a,l
  add a,c
  ld l,a
  jr nc,TMSW3
  inc h

TMSW3:
  djnz TMSW2
  ld hl,PITPD    ; PITPD,PITPS,PIMV
  xor a          ; Reset pages and move.
  ld (hl),a
  inc hl
  ld (hl),a
  inc hl
  ld (hl),a
  ret

; Page functions: A=0 shows the drawn
; page, 1 begins inclusive rows B..C, 2
; ends a move without flipping. Other
; values store A-2 in PIMV. Changes AF.
; Functions 0/1 inherit TMSFLIP/TMSMBEG
; clobbers.

TMSFN:
  or a
  jr z,TMSFLIP
  dec a
  jp z,TMSMBEG
  dec a
  ld (PIMV),a
  ret

; Show the drawn page if not already
; shown. Keeps BC/DE. Changes AF/HL.

TMSFLIP:
  ld a,(PITPD)
  ld hl,PITPS
  cp (hl)
  ret z
  ld (hl),a

; Select the shown name page in R2: this
; width's base plus PITPS's offset.
; PITPS holds high-byte offset 00h, 04h
; or 10h. Keeps BC/DE. Changes AF/HL.

TMSR2:
  ld a,(PITPS)   ; PITPS / 4: R2 units.
  rrca
  rrca

  ld hl,(PIREGP)
  inc hl
  inc hl
  add a,(hl)     ; Add selected R2 base.
  ld l,a
  ld h,$82
  jp VPAIR

; Restore mode, font and latest drawn
; page after a program. End any row
; move. Name bytes stay, but
; mode/font/page can change the picture.
; Write 256 eight-byte patterns at
; 0000h..07FFh. R1 combines mode bits
; with the supported IE shadow PITIE.
; Raw R1 writes do not update PITIE.
; Keeps E.
; Changes AF, BC, D and HL. Maskable
; interrupts are excluded only within
; each control pair.

TMSSET:

  ld hl,(PIREGP)
  ld b,8
  ld c,$80       ; R0, write flag.

TMSR:
  ld a,c         ; only R1 carries the
  cp $81         ; tracked IE bit
  ld a,(hl)
  jr nz,TMSRI
  ld a,(PITIE)   ; keep this session's
  or (hl)        ; supported IE setting

TMSRI:
  push hl
  ld l,a
  ld h,c
  call VPAIR
  pop hl
  inc hl
  inc c
  djnz TMSR
  xor a          ; End move, show PITPD.
  ld (PIMV),a
  ld a,(PITPD)
  ld (PITPS),a
  call TMSR2
  ld hl,0        ; Pattern base 0000h.
  call TMSWA
  ld d,0         ; Character code.

TMSPAT:
  ld a,d
  and $7F        ; Map low seven bits.
  sub $20
  jr nc,TMSCH    ; 20h..7Fh: FONT glyph.
  xor a          ; Controls use space.

TMSCH:
  ld l,a
  ld h,0
  add hl,hl
  add hl,hl
  add hl,hl
  ld bc,FONT
  add hl,bc

TMSGLY:
  ld b,8         ; Eight rows per glyph.

TMSROW:
  ld a,(hl)
  bit 7,d        ; High bit reverses.
  jr z,TMSOUT
  cpl

TMSOUT:

  out (VDPDAT),a
  inc hl
  djnz TMSROW
  inc d
  jr nz,TMSPAT
  ld a,(PIWID)
  cp 32
  ret nz         ; 32 only below.
  ld hl,COLOUR
  call TMSWA
  ld b,32        ; 32 groups of 8 codes.

TMSCOL:
  ld a,$31       ; Light green on black.
  out (VDPDAT),a
  djnz TMSCOL
  ld hl,SPRITE
  call TMSWA
  ld a,$D0       ; D0h terminator only.
  out (VDPDAT),a
  ret

; Graphics entries require the caller's
; PICO claim and valid
; register/address/buffer ranges and
; visibility. No local checks. Each may
; change AF, BC, DE and HL. With zero
; count, fill/copy entries program the
; VRAM address but transfer no payload.

; Write A to VDP register B. For B=1,
; save A bit 5 in PITIE before writing
; the original value. Other registers
; leave PITIE alone; raw port writes
; never update it. Claim and register
; range are the caller's responsibility.
; Changes AF/BC/DE/HL. No flag result.

GFXREG:
  ld l,a
  ld a,b
  dec a          ; R1?
  jr nz,GFXRG1   ; non-R1: no tracking
  ld a,l
  and $20
  ld (PITIE),a

GFXRG1:
  ld a,b
  or $80         ; register-write pair
  ld h,a
  jr VPAIR

; End the transient's supported VDP
; interrupt-enable session before real
; boot removes its handler.
; No arguments. Always clear PITIE.
; Without CDTMS, touch no VDP ports;
; otherwise write IE-off R1 from the
; current mode, or blanked 80h for a
; bare VDP with no PICO mode table.
; No ownership change or restoration of
; arbitrary transient mode bits. Keep
; BC/DE; change AF/HL, no flags result.

PIICLR:
  xor a
  ld (PITIE),a
  ld a,(CONDEV)
  and CDTMS
  ret z          ; no detected VDP

; A bare VDP gets 80h: 16K, display
; and IE off. Nonzero PIREGP high byte
; selects the current ROM mode table's
; R1. The high-byte test does not
; validate arbitrary pointers.

  ld l,$80       ; bare: blanked R1
  ld a,(PIREGP+1)
  or a
  jr z,PIICR1    ; zero: bare fallback
  ld hl,(PIREGP)
  inc hl
  ld l,(hl)      ; mode table's R1

PIICR1:
  ld h,$81       ; R1 write selector
  jr VPAIR

; Fill DE bytes at VRAM HL with A. No
; software wrap/range guard.

GFXFIL:
  ld c,a         ; Fill byte, past
                 ; TMSWA.
  call TMSWA

GFXFL:
  ld a,d
  or e
  ret z
  ld a,c
  out (VDPDAT),a
  dec de
  jr GFXFL

; Copy BC bytes from CPU source DE to
; VRAM destination HL. Keep source RAM
; visible and readable throughout.

GFXWR:
  call TMSWA
  ex de,hl

GFXWL:
  ld a,b
  or c
  ret z
  ld a,(hl)
  out (VDPDAT),a
  inc hl
  dec bc
  jr GFXWL

; Copy BC bytes from VRAM source HL to
; CPU destination DE, writable
; throughout. No explicit dummy read.

GFXRD:
  call TMSRA
  ex de,hl

GFXRL:
  ld a,b
  or c
  ret z
  in a,(VDPDAT)
  ld (hl),a
  inc hl
  dec bc
  jr GFXRL

; Set VRAM write address HL,
; 0000h..3FFFh. Higher bits are masked.
; Keeps BC/DE/L. Changes AF/H.

TMSWA:
  set 6,h        ; write flag
  jr TMSA7

; Set VRAM read address HL,
; 0000h..3FFFh, with the write flag
; clear. Higher bits are masked. Keeps
; BC/DE/L. Changes AF/H.

TMSRA:
  res 6,h        ; read: flag clear

TMSA7:
  res 7,h        ; 14-bit address

; Write L then H to VDPCTL without a
; maskable handler splitting the pair.
; IFFGET samples IFF2 with its NMOS
; workaround. Restore that sampled
; state. No NMI exclusion or
; payload-wide mask. Keeps BC/DE/HL and
; I. Changes AF.

VPAIR:
  call IFFGET
  push af
  di
  ld a,l
  out (VDPCTL),a
  ld a,h
  out (VDPCTL),a
  pop af
  ret po
  ei
  ret

; HL = drawn-page cell at valid row B
; (0..23), column C. Requires the
; width's PIROWT and page state. No
; bounds check. Keeps BC. Changes AF/DE.

TMSCELL:
  ld a,b
  add a,a
  ld e,a
  ld d,0
  ld hl,PIROWT
  add hl,de
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a
  ld a,(PITPD)
  add a,h
  ld h,a
  ld e,c
  add hl,de
  ret

; Read valid row B into LINEBUF: PIWID
; bytes at width 32, 40 or 80. During a
; move, read the shown page through
; temporary PITPD substitution, restored
; on normal return. Otherwise read the
; drawn page. Shared state/buffer.
; Changes AF, BC, DE and HL. No
; whole-row mask.

TMSRDR:
  ld a,(PIMV)
  or a
  jr z,TMSRD1
  ld a,(PITPD)   ; Save drawn page.
  push af
  ld a,(PITPS)
  ld (PITPD),a
  call TMSRD1
  pop af         ; Restore drawn page.
  ld (PITPD),a
  ret

TMSRD1:
  ld c,0
  call TMSCELL
  call TMSRA
  ld a,(PIWID)
  ld b,a
  ld c,VDPDAT
  ld hl,LINEBUF
  inir
  ret

; Write LINEBUF to valid row B of the
; drawn page: PIWID bytes at width 32,
; 40 or 80. Keep the buffer visible.
; Changes AF, BC, DE and HL. No
; whole-row mask.

TMSWRR:
  ld c,0
  call TMSCELL
  call TMSWA
  ld a,(PIWID)
  ld b,a
  ld c,VDPDAT
  ld hl,LINEBUF
  otir
  ret

; Put character A at valid row B, column
; C of the drawn page. Keeps BC. Changes
; AF, DE and HL.

TMSPUT:
  push af
  call TMSCELL
  call TMSWA
  pop af

  out (VDPDAT),a
  ret

; A = character at valid row B, column C
; of the drawn page, including during a
; move. Keeps BC. Changes F, DE and HL.

TMSGET:
  call TMSCELL
  call TMSRA
  in a,(VDPDAT)
  ret

; Clear valid row B of the drawn page
; from C to its edge. C at/past width
; returns before addressing or writing,
; including pending wrap. Keeps C.
; Changes AF, B, DE and HL.

TMSCLR:
  ld a,(PIWID)
  cp c
  ret c
  ret z
  call TMSCELL
  call TMSWA
  ld a,(PIWID)
  sub c
  ld b,a

TMSCLL:
  ld a,' '
  out (VDPDAT),a
  djnz TMSCLL
  ret

; Begin a move of valid inclusive rows
; B..C within 0..23. Show any pending
; page first, then draw the other page.
; Copy rows outside B..C from shown to
; hidden. The caller writes the
; interval, ends the move with TMSFN 2
; and polling later flips it. Keeps
; BC/E. Changes AF, D, HL and LINEBUF.

TMSMBEG:
  call TMSFLIP   ; Show pending page.
  ld hl,PITPG
  ld a,(PITPS)   ; Shown XOR PITPG.
  xor (hl)
  ld (PITPD),a
  ld a,1         ; Reads use shown page.
  ld (PIMV),a
  ld d,0

TMSMBL:
  ld a,d
  cp b
  jr c,TMSMBC    ; Outside: copy across.
  cp c
  jr c,TMSMBN    ; Inside: caller
                 ; writes.
  jr z,TMSMBN

TMSMBC:
  push bc
  push de
  ld b,d
  call TMSRDR
  pop de
  push de
  ld b,d
  call TMSWRR
  pop de
  pop bc

TMSMBN:
  inc d
  ld a,d
  cp 24
  jr nz,TMSMBL
  ret

; Registers 0-7.
; - 80 columns (PICO9918 TEXT80, also
; the F18A T80 mode): R0 bit 2 with
; text mode, names at a 4 KiB boundary
; (R2 low bits set), patterns at
; 0000h, light green on black. No unlock
; is needed. R1 is D0h: bit 7, the
; TMS9918A's 4/16K bit, set for 16K
; VRAM, like the 40 and 32-column sets.
; - 40 columns: text mode, the same
; colours.
; - Graphics I: patterns 0000h, colours
; 2000h, sprites 1B00h/3800h.

REGS80: DB $04,PIR180,$1000/$400+3,$00,$00,$00,$00,$31
REGS40: DB $00,PIR140,$0800/$400,$00,$00,$00,$00,$31
REGS32: DB $00,PIR132,$0800/$400,COLOUR/$40,$00,SPRITE/$80,$07,$31
