; ABI 5.1 services: CALL ABICALL with
; C=number and B/DE/HL=arguments. See
; docs/rom-services.md and abi.inc.
; Hardware 0-8, hook 12 and font 15 are
; here. Volume and registry calls have
; their own results and effects.
; Hardware/font/hook use resident state
; and caller stack in the classic bank.
; No BDOS call. IX/IY, alternates and
; caller maskable-interrupt state stay.
; No console interrupt re-entry.
; Success: A=0, Z, NC. Failure: nonzero
; status, carry. Port 01h bit 6 is
; serial-idle during digit/tone output.
; No NMI exclusion.

RTCPORT EQU $FC  ; DS1302: enable bit4,
                 ; clock6, output7,
                 ; read mode5, input0.

SEGPORT EQU $02  ; segment latch
TXIDLE EQU $40   ; serial idle,
                 ; speaker/digits off

; Dispatch C through SVTAB, preserving
; B/C/DE/HL. C>=TNCOUNT returns
; TNEBAD with those registers unchanged.
; RET enters the selected service with
; the original caller return next on
; stack. Uses four temporary bytes.
; Changes AF and service-defined regs.

SVCDSP:
  ld a,c
  cp TNCOUNT
  ld a,TNEBAD
  jr nc,HWERR
  push hl
  push de
  ld a,c
  add a,a
  ld e,a
  ld d,0
  ld hl,SVTAB
  add hl,de
  ld e,(hl)
  inc hl
  ld d,(hl)
  ex de,hl
  pop de
  ex (sp),hl     ; the routine is the
                 ; return address,
  ret            ; and the caller's HL
                 ; comes back

; Failure exit: A must be nonzero.
; Returns the same A, NZ and carry set.
; Other registers stay. No rollback.

HWERR:
  or a
  scf
  ret

; Success exit: A=0, Z, carry clear.
; Other registers stay.

HWOK:
  xor a
  ret

; INFO: B=CONDEV OR VCLAIM, DE=ROMVER,
; L=columns, H=rows. Reads resident
; state, RTC flag from cold boot.
; No device I/O.
; Changes AF. Other registers stay.

HWSINFO:
  ld a,(CONDEV)
  ld hl,VCLAIM
  or (hl)
  ld b,a
  ld de,ROMVER
  ld hl,(VWID)
  jp HWOK

; DIGIT: HL -> six segment bytes,
; leftmost first. First latch assumes
; digits off.
; One scan, about 0.8 ms per digit at
; 4 MHz, then digits and speaker off.
; Serial TX stays idle. Each delay has
; 256 DJNZ iterations, not all 13T.
; Returns HL past six bytes.
; Changes AF/BC. DE stays.

HWSDIG:
  ld c,$20       ; bit 5 is the leftmost
                 ; digit

HWSDL:
  ld a,(hl)

; while every digit is off

  out (SEGPORT),a
  ld a,c
  or TXIDLE      ; the serial line kept
                 ; idle

; light this digit alone

  out (DIGPORT),a
  ld b,0

HWSDD:
  djnz HWSDD
  ld a,TXIDLE
  out (DIGPORT),a
  inc hl
  srl c
  jr nz,HWSDL
  jp HWOK

; LCD: B=row 0-3, HL -> 20 raw bytes.
; B>=4 returns TNEBAD before effects.
; Row 3 clears CDWRD so ROM cleanup
; cannot erase the program's text.
; All 20 bytes, including zero, are sent
; after bounded busy polling, including
; a timeout. No device acknowledgement.
; Returns HL past 20. Changes AF/B/DE.
; C stays.

HWSLCD:
  ld a,b
  cp 4
  ld a,TNEBAD
  jr nc,HWERR
  push hl
  ld a,b
  cp 3
  jr nz,HWSL1
  ld hl,CONDEV
  res 7,(hl)

HWSL1:
  ld hl,LCDROWS
  ld e,b
  ld d,0
  add hl,de
  ld a,(hl)
  call LCDC
  pop hl
  ld b,20

HWSLC:
  call LCDWAIT
  ld a,(hl)
  out (LCDDAT),a
  inc hl
  djnz HWSLC
  jp HWOK

; VIDEO: B=1 claims PICO, B=0 releases.
; Other B: TNEBAD before effects.
; No detected PICO: TNENODV. Claim hides
; the cursor only when CRT is current
; then sets VCLAIM. Output, cursor and
; page flips stop on that current PICO.
; UC1 remains usable. No owner identity.
; Release behaviour is HWVREL's below.
; Changes AF/DE/HL and callee registers,
; including BC during restoration.

HWSVID:
  ld a,b
  cp 2
  ld a,TNEBAD
  jp nc,HWERR
  ld a,(CONDEV)
  and CDTMS
  ld a,TNENODV
  jp z,HWERR
  ld a,b
  or a
  jr z,HWVREL
  ld a,(CONMOD)
  cp CMCRT
  call z,CURHIDE
  ld a,CDCLM
  ld (VCLAIM),a
  jp HWOK

; Release PICO. Real warm boot calls
; PIICLR before reaching this entry.
; No claim: no display action. Otherwise
; clear VCLAIM first. No PIVEC: no VDP
; restore. Else VREST restores mode/font
; and latest drawn page, even under UC1.
; Only current CRT is cleared and
; cursor homed. Supported v4 restore
; preserves tracked IE; ordinary release
; does not end the interrupt session.
; Returns A=0, Z, NC. Changes AF/DE/HL
; and restore/clear clobbers, including
; BC. Uses the caller stack.

HWVREL:
  ld a,(VCLAIM)
  or a
  jp z,HWOK
  xor a
  ld (VCLAIM),a
  ld hl,(PIVEC)
  ld a,h
  or l
  jp z,HWOK
  ld de,6        ; VREST table offset
  add hl,de
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a
  call VHLJP
  ld a,(CONMOD)
  cp CMCRT
  jp nz,HWOK
  call VTCLS
  xor a
  ld (VROW),a
  ld (VCOL),a
  jp HWOK

; TONE: DE half cycles, B delay units
; (0=256). DE=0 returns without output.
; Repeated intervals are 16*N+51T for
; N=B or 256, excluding entry/exit.
; Bit 7 toggles with serial TX idle.
; Ends with speaker/digits off. B and HL
; stay. Changes AF/C/DE.

HWSTONE:
  ld a,d
  or e
  jp z,HWOK
  ld a,TXIDLE

HWSTL:
  xor $80
  out (DIGPORT),a
  ld c,b

HWSTD:
  dec c
  jr nz,HWSTD
  dec de
  ld c,a
  ld a,d
  or e
  ld a,c
  jr nz,HWSTL
  ld a,TXIDLE
  out (DIGPORT),a
  jp HWOK

; JOY: sample F7FEh, complement into B.
; Set result bits mean pressed inputs.
; Raw sample, no debounce. Changes AF/C.

HWSJOY:
  ld bc,$F7FE    ; port FEh with address
                 ; line 11 low
  in a,(c)
  cpl            ; the port reads 0 for
                 ; pressed
  ld b,a
  jp HWOK

; KEYS: HL -> eight output bytes.
; Sample FEFEh then rotate the low row
; select bit through all eight rows.
; Set result bits mean keys down.
; Returns HL past eight. Changes AF/BC.

HWSKEYS:
  ld bc,$FEFE

HWSKL:
  in a,(c)
  cpl
  ld (hl),a
  inc hl
  rlc b
  jr c,HWSKL
  jp HWOK

; PUTAT: B raw bytes at HL to row D,
; column E, clipped without moving the
; cursor coordinates. Serial/batch or
; claimed current PICO: TNENODV before
; source access.
; Available video, B=0: no source read
; or cursor change. Otherwise hide the
; cursor before clipping. Off-screen
; coordinates succeed without writing
; but may have hidden the cursor. HL/E
; advance only for written cells.
; Changes AF/BC/DE/HL and driver regs.

HWSPUT:
  call VTOWN
  ld a,TNENODV
  jp nz,HWERR
  ld a,(CONMOD)
  rrca
  ld a,TNENODV
  jp nc,HWERR
  ld a,b
  or a
  jp z,HWOK
  push bc
  push de
  push hl
  call CURHIDE   ; the cursor's cell put
                 ; right first, so a
  pop hl         ; character written
                 ; there is not later
  pop de         ; turned to its reverse
                 ; image
  pop bc
  ld a,(VHGT)
  dec a
  cp d
  jp c,HWOK

HWSPL:
  ld a,(VWID)
  cp e
  jp z,HWOK
  jp c,HWOK
  ld a,(hl)
  push bc
  push de
  push hl
  ld b,d
  ld c,e
  call VPUT
  pop hl
  pop de
  pop bc
  inc hl
  inc e
  djnz HWSPL
  jp HWOK

; RTC: B=0 reads, B=1 writes seven bytes
; at HL: seconds, minutes, hours, date,
; month, weekday, year. Other B: TNEBAD
; before port I/O. Probe NZ gives
; TNENODV before buffer transfer.
; Write protection is disabled for the
; burst and enabled by its control byte.
; Chip disabled on completion. No BCD
; validation or rollback. HL advances 7.
; Changes AF/BC/D, also E when writing.

HWSRTC:
  ld a,b
  cp 2
  ld a,TNEBAD
  jp nc,HWERR
  push bc
  call RTCHAS
  pop bc
  ld a,TNENODV
  jp nz,HWERR
  ld a,b
  or a
  jr nz,HWSRW
  ld d,$BF
  call RTCCMD
  ld b,7

HWSRR:
  call RTCRD
  ld (hl),d
  inc hl
  djnz HWSRR
  jr RTCEND

HWSRW:
  ld de,$8E00    ; write protect off
  call RTCPUT
  ld d,$BE       ; burst write: 7 bytes
                 ; and the control
  call RTCCMD
  ld b,7

HWSRV:
  ld d,(hl)
  call RTCWR
  inc hl
  djnz HWSRV
  ld d,$80       ; the control byte:
                 ; write protect on
                 ; again
  call RTCWR

RTCEND:
  xor a
  out (RTCPORT),a
  jp HWOK

; Probe seconds using command 81h and
; disable the chip. Unsigned byte <60h:
; A=0, Z. Otherwise nonzero A, NZ. This
; is not full BCD validation. BC/E/HL
; stay. Changes AF/D. Callers use Z/NZ.

RTCHAS:
  ld d,$81
  call RTCCMD
  call RTCRD
  xor a
  out (RTCPORT),a
  ld a,d
  cp $60
  jr nc,RTCNO
  xor a
  ret

RTCNO:
  or 1           ; nonzero A, NZ
  ret

; Write register command D with value E
; then disable the chip. BC/E/HL stay.
; Changes AF/D. No data validation.

RTCPUT:
  call RTCCMD
  ld d,e
  call RTCWR
  xor a
  out (RTCPORT),a
  ret

; Enable the chip, clock low, then fall
; through RTCWR to send command D.
; Chip stays enabled. BC/E/HL stay.
; Changes AF/D.

RTCCMD:
  ld a,$10
  out (RTCPORT),a

; Send D, eight bits LSB first. Data is
; set with clock low before each rising
; edge. Ends enabled, clock high, D=0.
; BC/E/HL stay. Changes AF.

RTCWR:
  push bc
  ld b,8

RTCW1:
  srl d
  ld a,$20
  rra

; the bit set up with the clock low

  out (RTCPORT),a
  or $40         ; clock high

; the chip takes the bit on this edge

  out (RTCPORT),a
  djnz RTCW1
  pop bc
  ret

; Read eight bits LSB first into D from
; an enabled chip, sampling input bit 0
; after each falling clock edge. Ends
; enabled, clock low. BC/E/HL stay.
; Changes AF.

RTCRD:
  push bc
  ld bc,8*256+RTCPORT
  ld d,0

RTCR1:
  ld a,$70       ; clock high, read,
                 ; enabled
  out (c),a
  and $BF        ; clock low: the chip
                 ; puts out the next bit
  out (c),a
  in a,(c)       ; the bit on bit 0,
  rra            ; to carry
  rr d           ; and into D from the
                 ; top
  djnz RTCR1
  pop bc
  ret

; TNFONT (15): HL=FONT, the ROM font
; shared by PICO and GLCD (KD-159).
; Changes AF. Other registers stay.

HWSFONT:
  ld hl,FONT
  jp HWOK

; TNDRVR: B=3 (UC1), HL=eight-word
; table or 0 to drop. Other B: TNEBAD.
; Drop bypasses startup rejection.
; Startup + CRT field + nonzero HL:
; TNENODV before hook (KE-200), saving
; service stack room. Otherwise VIDHOOK
; requires a matrix and no UC1 table,
; else TNEBAD. Accepted: HL=LINEBUF.
; Table/code stay live until removal.
; Drop may defer console reselection.
; AF/DE may change, also HL on drop.

SVDRV:
  ld a,b
  cp CMUC1       ; UC1: alone: CRT:'s
                 ; table is the ROM's
  jr z,SVDRV1    ; (KS39), and no other
                 ; B has a word
  ld a,TNEBAD
  scf
  ret

SVDRV1:
  ld a,h
  or l
  jr z,SVDRV2
  ld a,(STFLAG)  ; FFh in a startup
                 ; line: D = 0 there
  cpl
  ld d,a
  ld a,(IOBYTE)  ; the CON: field, 1 for
                 ; CRT:
  and 3
  dec a
  or d           ; 0 for CRT: in a
                 ; startup line
  ld a,TNENODV   ; then refused, as an
                 ; absent device
  scf            ; is, nothing changed
  ret z

SVDRV2:
  ld a,b
  call VIDHOOK
  ld a,TNEBAD
  ret c
  xor a
  ret
