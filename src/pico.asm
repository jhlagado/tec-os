; The PICO9918's console and graphics
; entries, in the ROM (KS39): a
; TMS9918A- compatible VDP with the
; F18A's 80-column text mode, at 80 x 24
; in 6-pixel cells, 40 x 24, or Graphics
; I at 32 x 24 in 8-pixel cells, CON
; PICO choosing. When the VDP and the
; matrix keyboard both answer at cold
; boot, PISTART fills PIBLK from PITPL,
; sets the width, hands the table to the
; terminal through PIVEC, registers the
; record and puts CRT: in the IOBYTE's
; CON: field; the first console call
; then programs the VDP through CONSWV,
; as for a driver. PIBLK is the table,
; the record and the state in the order
; PICO.SVC had them (version 3), so
; abi.inc's offsets and a debugger's
; reading hold; it lies in the BIOS's
; state, which warm boot leaves, so the
; width is kept.

; Graphics I's colour table in VRAM

COLOUR EQU $2000

; and its sprite attribute table

SPRITE EQU $1B00

; PIBLK's first 39 bytes: the table, as
; the terminal and abi.inc's PICOREG to
; PICOWID read it, then the record, the
; permanent tail of the registry.

; The cold working width. Bare console
; selection keeps the current width.

PIDEFLT EQU 40

PITPL: DW TMSPUT,TMSGET,TMSCLR,TMSSET,TMSRDR,TMSWRR,TMSFN
  DB PIDEFLT,24  ; the columns, TMSW's,
                 ; and the rows

; PICOREG, PICOFIL

  DW GFXREG,GFXFIL

; PICOWR, PICORD

  DW GFXWR,GFXRD
  DW TMSWID      ; PICOWID
  DW 0           ; the record: no link,
                 ; its name, version
  DB "PICO    ",PICOVER
  DW PIBLK       ; and the table
PITPLN EQU $-PITPL

; The console at cold boot, from VIDINIT
; with CONDEV in HL: on a board with the
; VDP and the matrix keyboard, the block
; filled at 40 columns, the table hooked
; for CRT:, the record registered and
; CRT: in the field. Otherwise nothing.
; The VDP itself is programmed later, by
; VREST when CONSW takes CRT:. Destroys
; AF, BC, DE and HL.

PISTART:
  bit 0,(hl)     ; CDMTX: keys for the
                 ; screen
  ret z          ; none: the serial
                 ; console stays
  ld hl,PITPL    ; the template into the
                 ; block
  ld de,PIBLK
  ld bc,PITPLN
  ldir
  ld a,PIDEFLT   ; cold working width
  call TMSW      ; a width it knows: no
                 ; carry
  ld hl,PIBLK    ; CRT:'s table
  ld (PIVEC),hl
  ld hl,PIREC    ; the registry's tail
  ld (REGHEAD),hl
  ld a,CMCRT     ; CRT: in effect from
                 ; the first console
                 ; call
  ld (IOBYTE),a  ; the other fields 0;
                 ; CONMOD is still
  ret            ; CMTTY, so CONSEL sees
                 ; the change

; PICOWID: A = 80, 40 or 32 columns. The
; width set, and CRT:, if in effect,
; chosen again at the next console call,
; so the terminal takes the new columns
; and clears the screen. Carry, with
; nothing changed, for any other width
; or while the PICO9918 is claimed.
; Destroys AF, BC, DE and HL.

TMSWID:
  ld hl,VCLAIM
  inc (hl)       ; VCLAIM tested for
                 ; zero, left as it was
  dec (hl)
  scf            ; carry for the refusal
  ret nz         ; claimed: a program
                 ; may be using it
  call TMSW      ; the new width, in
                 ; memory alone
  ret c          ; no such width
  ld hl,CONMOD
  ld a,(hl)
  dec a          ; CRT: in effect:
                 ; serial for now, so
                 ; that
  ret nz         ; CONSEL takes CRT:
                 ; again (carry clear)
  ld (hl),a      ; CMTTY
  ret

; The console at A columns, 80, 40 or
; 32: PIWID, the name table's address
; and the second page's offset (1000h
; and 1000h at 80 columns, 0800h and
; 0400h at 40 and 32), the registers and
; the row table, and page 0 drawn and
; shown. Only memory changes: VREST
; (TMSSET) puts the registers in the
; VDP. Carry, with nothing changed, for
; any other A. Destroys AF, BC, DE and
; HL.

TMSW:
  ld hl,REGS80
  ld bc,$1010    ; B = the names' high
                 ; byte, C = PITPG
  cp 80
  jr z,TMSW1     ; 80 columns
  ld hl,REGS40
  ld bc,$0804    ; names at 0800h, the
                 ; second page 0400h on
  cp 40
  jr z,TMSW1     ; 40 columns
  ld hl,REGS32   ; Graphics I, at 40's
                 ; addresses
  cp 32
  scf            ; carry for the refusal
  ret nz         ; no such width

TMSW1:
  ld (PIWID),a

; this width's registers

  ld (PIREGP),hl
  ld a,c         ; the second page's
                 ; offset
  ld (PITPG),a
  ld h,b         ; each row's address:
                 ; names + row * PIWID
  ld l,0
  ld de,PIROWT   ; DE walks the row
                 ; table
  ld a,(PIWID)   ; C = a row's length
  ld c,a
  ld b,24        ; 24 rows at every
                 ; width

TMSW2:
  ex de,hl       ; the row's address
                 ; into the table
  ld (hl),e
  inc hl
  ld (hl),d
  inc hl
  ex de,hl       ; HL back on the
                 ; address
  ld a,l         ; on by one row's
                 ; length
  add a,c
  ld l,a
  jr nc,TMSW3
  inc h          ; the carry into the
                 ; high byte

TMSW3:
  djnz TMSW2
  xor a          ; page 0 drawn and
                 ; shown, no move
  ld (PITPD),a
  ld (PITPS),a
  ld (PIMV),a
  ret

; The ROM's word for VTFN: A = 0 show
; the page drawn, 1 begin a move of rows
; B to C, 2 end one. Destroys AF, and
; for 0 and 1 what TMSFLIP and TMSMBEG
; do.

TMSFN:
  or a
  jr z,TMSFLIP   ; 0: show the page
                 ; drawn
  dec a
  jp z,TMSMBEG   ; 1: a move begins
  dec a          ; 2 leaves 0
  ld (PIMV),a    ; the move over, shown
                 ; at the next flip
  ret

; Show the page drawn, if it is not
; already shown. Keeps BC and DE.
; Destroys AF, HL.

TMSFLIP:
  ld a,(PITPD)
  ld hl,PITPS
  cp (hl)
  ret z          ; already shown
  ld (hl),a      ; it becomes the page
                 ; shown

; Point register 2 at the page shown:
; the name table's base for this width
; plus PITPS's offset. Keeps BC and DE.
; Destroys AF, HL.

TMSR2:
  ld a,(PITPS)   ; the offset's high
                 ; byte, 00h, 04h or
                 ; 10h,
  rrca           ; in R2's units of
                 ; 0400h: 0, 1 or 4
  rrca

; register 2's value for this width

  ld hl,(PIREGP)
  inc hl
  inc hl
  add a,(hl)     ; plus the page's
                 ; offset
  ld l,a         ; the value first,
  ld h,$82       ; then register 2 with
                 ; the write flag
  jp VPAIR

; VREST: load registers 0-7, the font
; and its reverse images, and in
; Graphics I the colours and an empty
; sprite table, so a program that
; changed the mode or the patterns
; leaves a working console. The page
; drawn is shown, any move ended. The
; name table, and so the text on the
; screen, is left alone. Destroys AF,
; BC, D and HL.

TMSSET:

; this width's eight values

  ld hl,(PIREGP)
  ld b,8
  ld c,$80       ; register 0, with the
                 ; write flag

TMSR:
  ld a,(hl)      ; the value
  push hl
  ld l,a
  ld h,c         ; and the register, as
                 ; VPAIR's pair
  call VPAIR
  pop hl
  inc hl         ; the next value and
                 ; register
  inc c
  djnz TMSR
  xor a          ; show the latest page,
                 ; any move finished
  ld (PIMV),a
  ld a,(PITPD)
  ld (PITPS),a
  call TMSR2     ; register 2 on it,
                 ; over REGS's page 0
  ld hl,0        ; 256 patterns: font,
                 ; then its reverse
  call TMSWA     ; from 0000h, the
                 ; pattern table
  ld d,0         ; character code

TMSPAT:
  ld a,d
  and $7F        ; 80h-FFh: the glyph of
                 ; the code less 80h
  sub $20
  jr nc,TMSCH    ; 20h-7Fh: a glyph of
                 ; the font's
  xor a          ; codes below 20h are
                 ; blank, the space
                 ; glyph

TMSCH:
  ld l,a         ; HL = the font + 8 *
                 ; (code - 20h)
  ld h,0
  add hl,hl
  add hl,hl
  add hl,hl
  ld bc,FONT     ; the ROM's
  add hl,bc

TMSGLY:
  ld b,8         ; eight rows a glyph

TMSROW:
  ld a,(hl)
  bit 7,d        ; codes 80h and up:
                 ; reverse video
  jr z,TMSOUT
  cpl

TMSOUT:

; the VDP moves its own address on

  out (VDPDAT),a
  inc hl
  djnz TMSROW
  inc d
  jr nz,TMSPAT   ; until the code wraps
                 ; to 0
  ld a,(PIWID)
  cp 32
  ret nz         ; text mode: no colours
                 ; or sprites
  ld hl,COLOUR   ; Graphics I colours
  call TMSWA
  ld b,32        ; 32 groups of eight
                 ; codes

TMSCOL:
  ld a,$31       ; light green on black
  out (VDPDAT),a
  djnz TMSCOL
  ld hl,SPRITE   ; no sprites
  call TMSWA
  ld a,$D0       ; a Y of D0h ends the
                 ; sprite list
  out (VDPDAT),a
  ret

; The graphics entries, reached through
; the record's table. Each assumes that
; the caller holds the claim, as a
; program writing the ports does, and
; destroys AF, BC, DE and HL. A count of
; zero moves nothing.

; Set register B to A.

GFXREG:
  ld l,a         ; the value goes first
  ld a,b
  or $80         ; then the register,
                 ; with its write flag
  ld h,a
  jp VPAIR

; Fill DE bytes of VRAM from address HL
; with A.

GFXFIL:
  ld c,a         ; the value, across the
                 ; addressing
  call TMSWA

GFXFL:
  ld a,d         ; tested first, so that
                 ; 0 fills nothing
  or e
  ret z          ; the count has run out
  ld a,c         ; the VDP moves its own
                 ; address on
  out (VDPDAT),a
  dec de
  jr GFXFL

; Copy BC bytes from DE to VRAM address
; HL.

GFXWR:
  call TMSWA
  ex de,hl       ; HL = the source

GFXWL:
  ld a,b         ; tested first, so that
                 ; 0 copies nothing
  or c
  ret z          ; the count has run out
  ld a,(hl)      ; the VDP moves its own
                 ; address on
  out (VDPDAT),a
  inc hl
  dec bc
  jr GFXWL

; Copy BC bytes from VRAM address HL to
; DE.

GFXRD:
  call TMSRA
  ex de,hl       ; HL = the destination

GFXRL:
  ld a,b         ; tested first, so that
                 ; 0 copies nothing
  or c
  ret z          ; the count has run out
  in a,(VDPDAT)  ; the VDP moves its own
                 ; address on
  ld (hl),a
  inc hl
  dec bc
  jr GFXRL

; Set the VRAM write address to HL, of
; 0000h-3FFFh. Keeps BC, DE and L.
; Destroys AF and H.

TMSWA:
  ld a,h
  and $3F        ; the address's top six
                 ; bits
  or $40         ; and the write flag
  ld h,a
  jp VPAIR

; Set the VRAM read address to HL: the
; same, the flag clear.

TMSRA:
  ld a,h
  and $3F        ; the address's top six
                 ; bits, to read
  ld h,a

; Write L then H to the control port
; with interrupts off, and put their
; state back: an interrupt's own VDP
; read between the two would split the
; pair. IFFGET reads the state as an
; NMOS Z80 needs. Keeps BC, DE and HL.
; Destroys AF.

VPAIR:
  call IFFGET    ; P/V = the interrupt
                 ; state
  push af
  di
  ld a,l         ; the low byte, or a
                 ; register's value
  out (VDPCTL),a
  ld a,h         ; then the high bits
                 ; and flags
  out (VDPCTL),a
  pop af         ; P/V as IFFGET found
                 ; it
  ret po         ; they were off: left
                 ; off
  ei
  ret

; HL = address of row B, column C in the
; page being drawn. Keeps BC. Destroys
; AF, DE.

TMSCELL:
  ld a,b         ; DE = 2 * B, the row's
                 ; entry
  add a,a
  ld e,a
  ld d,0
  ld hl,PIROWT
  add hl,de      ; its place in the row
                 ; table
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a         ; HL = the row's
                 ; address on page 0
  ld a,(PITPD)   ; plus the page's
                 ; offset, a high byte
  add a,h
  ld h,a
  ld e,c         ; plus the column; D is
                 ; still 0
  add hl,de
  ret

; Copy row B to LINEBUF as one block.
; While a move builds the hidden page,
; rows are read from the page on show.
; Destroys AF, BC, DE, HL.

TMSRDR:
  ld a,(PIMV)
  or a
  jr z,TMSRD1    ; no move: from the
                 ; page drawn
  ld a,(PITPD)   ; else the page shown,
                 ; for this row,
  push af
  ld a,(PITPS)
  ld (PITPD),a
  call TMSRD1
  pop af         ; and the page drawn
                 ; put back
  ld (PITPD),a
  ret

TMSRD1:
  ld c,0         ; from column 0
  call TMSCELL
  call TMSRA
  ld a,(PIWID)   ; the row's length
  ld b,a
  ld c,VDPDAT
  ld hl,LINEBUF
  inir           ; the VDP moves its own
                 ; address on
  ret

; Copy LINEBUF to row B of the page
; drawn as one block. Destroys AF, BC,
; DE, HL.

TMSWRR:
  ld c,0         ; from column 0
  call TMSCELL
  call TMSWA
  ld a,(PIWID)   ; the row's length
  ld b,a
  ld c,VDPDAT
  ld hl,LINEBUF  ; the terminal's row
                 ; buffer
  otir
  ret

; Put A at row B, column C of the page
; drawn. Keeps BC. Destroys AF, DE, HL.

TMSPUT:
  push af        ; the character, across
                 ; the addressing
  call TMSCELL
  call TMSWA
  pop af

; into the cell

  out (VDPDAT),a
  ret

; A = the character at row B, column C
; of the page drawn. Keeps BC. Destroys
; F, DE, HL.

TMSGET:
  call TMSCELL
  call TMSRA     ; the cell, to read
  in a,(VDPDAT)
  ret

; Clear row B of the page drawn from
; column C to the end of the line,
; nothing when C is at or past the
; width. Keeps C. Destroys AF, B, DE,
; HL.

TMSCLR:
  ld a,(PIWID)
  cp c
  ret c          ; C past the row's end
  ret z          ; pending wrap has no
                 ; cells left to erase
  call TMSCELL
  call TMSWA
  ld a,(PIWID)   ; B = the cells from C
                 ; to the end
  sub c
  ld b,a

TMSCLL:
  ld a,' '       ; a space in each
  out (VDPDAT),a
  djnz TMSCLL
  ret

; Start a move of rows B to C. If the
; page drawn is already the page shown,
; draw the other one from now on,
; copying the rows outside B to C
; across; the move then reads the shown
; page and writes the hidden one. A move
; still waiting to be shown is shown
; first, so output is never more than
; one move behind. Keeps BC and E.
; Destroys AF, D, HL and LINEBUF.

TMSMBEG:
  ld a,(PITPD)
  ld hl,PITPS
  cp (hl)
  jr z,TMSMB1    ; nothing waiting to be
                 ; shown
  call TMSFLIP   ; the last move shown
                 ; first, BC kept

TMSMB1:
  ld hl,PITPG
  ld a,(PITPS)   ; draw the page not
                 ; shown
  xor (hl)
  ld (PITPD),a
  ld a,1         ; rows read from the
                 ; page shown
  ld (PIMV),a
  ld d,0         ; D = each row, 0 to 23

TMSMBL:
  ld a,d
  cp b
  jr c,TMSMBC    ; above the move:
                 ; copied across
  cp c
  jr c,TMSMBN    ; within B to C: the
                 ; move writes it
  jr z,TMSMBN

TMSMBC:
  push bc        ; the move's rows and
                 ; the row kept
  push de
  ld b,d         ; the row from the page
                 ; shown
  call TMSRDR
  pop de
  push de
  ld b,d         ; to the same row of
                 ; the page drawn
  call TMSWRR
  pop de
  pop bc

TMSMBN:
  inc d          ; the next row
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

REGS80: DB $04,$D0,$1000/$400+3,$00,$00,$00,$00,$31
REGS40: DB $00,$D0,$0800/$400,$00,$00,$00,$00,$31
REGS32: DB $00,$C0,$0800/$400,COLOUR/$40,$00,SPRITE/$80,$07,$31
