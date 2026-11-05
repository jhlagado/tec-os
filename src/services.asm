; The numbered services, ABI 5.1
; (docs/rom-services.md). CALL ABICALL
; with the number in C and arguments in
; B, DE and HL; abi.inc names each
; number, its arguments, results, carry
; and stack. Returns A = 0 with Z and
; carry clear on success, or A = a
; status with carry. The hardware
; services, 0 to 8, and the driver
; hook's are here; the volumes' are
; vol.asm's and the registry's
; loader.asm's. Any program may call
; them: they run on the caller's stack
; and keep their state in the resident
; workspace.
;
; The hardware services are the calls
; that would otherwise fight the OS for
; a port: the digit and speaker port
; (01h) also carries the serial transmit
; line, which must stay idle, and the
; PICO9918 may be the console.

RTCPORT EQU $FC  ; DS1302: bit 4 enable,
                 ; 6 clock, 7 data out,

; 5 data in, read on bit 0

SEGPORT EQU $02  ; 7-segment segment
                 ; latch
TXIDLE EQU $40   ; port 01h bit 6:
                 ; serial line idle,
                 ; speaker off

; The dispatcher, ABICALL's target. C =
; the number, B, DE and HL its
; arguments, which reach the service
; whole: the service is entered by a RET
; to its address, so the caller's return
; address is next on the stack. Any
; number from TNCOUNT up returns TNEBAD
; with the other registers as they were.
; Destroys AF and what the service does.

SVCDSP:
  ld a,c
  cp TNCOUNT
  ld a,TNEBAD
  jr nc,HWERR    ; past the table
  push hl        ; the arguments, across
                 ; the lookup
  push de
  ld a,c         ; two bytes an entry
  add a,a
  ld e,a
  ld d,0         ; DE = the entry's
                 ; offset
  ld hl,SVTAB
  add hl,de
  ld e,(hl)      ; DE = its routine
  inc hl
  ld d,(hl)
  ex de,hl       ; HL = its routine
  pop de         ; the caller's DE back
  ex (sp),hl     ; the routine is the
                 ; return address,
  ret            ; and the caller's HL
                 ; comes back

; A service's failure: A = the status,
; set by the caller, returned with carry
; set and NZ (no status is 0). Other
; registers are kept.

HWERR:
  or a           ; NZ, carry clear
  scf            ; then carry: the
                 ; failure
  ret

; A service's success: A = 0 with Z and
; carry clear. Other registers kept.

HWOK:
  xor a          ; A = 0, Z, carry clear
  ret

; INFO. Returns B = CONDEV's bits, the
; clock's from cold boot, with HWBCLM,
; VCLAIM's value, while the PICO9918 is
; claimed; DE = the ROM's version; HL =
; columns and rows. It reads no device.
; Destroys AF.

HWSINFO:
  ld a,(CONDEV)
  ld hl,VCLAIM   ; holds HWBCLM's value
                 ; while claimed
  or (hl)
  ld b,a         ; the devices, the
                 ; claim among them
  ld de,ROMVER
  ld hl,(VWID)   ; L = VWID, H = VHGT,
                 ; the next byte
  jp HWOK

; DIGIT. HL -> six segment bytes,
; leftmost first: one pass over the six
; digits, each lit for about 0.8 ms;
; then all off. Returns HL past the six.
; Destroys AF and BC.

HWSDIG:
  ld c,$20       ; bit 5 is the leftmost
                 ; digit

HWSDL:
  ld a,(hl)      ; this digit's
                 ; segments, latched

; while every digit is off

  out (SEGPORT),a
  ld a,c
  or TXIDLE      ; the serial line kept
                 ; idle

; light this digit alone

  out (DIGPORT),a
  ld b,0

HWSDD:
  djnz HWSDD     ; 256 turns of 13
                 ; T-states, the lit
                 ; time
  ld a,TXIDLE    ; every digit off, the
                 ; line idle
  out (DIGPORT),a
  inc hl         ; the next byte, for
                 ; the digit to the
                 ; right
  srl c
  jr nz,HWSDL    ; until the select bit
                 ; leaves bit 0
  jp HWOK

; LCD. B = the row, 0 to 3, HL -> 20
; characters: the row written, every
; byte sent as it is. A row past 3
; returns TNEBAD with nothing written.
; Writing row 3 clears CDWRD: the
; program's text replaces any word of
; the ROM's. Returns HL past the 20.
; Destroys AF, B and DE.

HWSLCD:
  ld a,b
  cp 4
  ld a,TNEBAD    ; refused: no such row
  jr nc,HWERR
  push hl        ; the text, across the
                 ; row's address
  ld a,b         ; a program takes row
                 ; 3: no word of the
                 ; ROM's
  cp 3           ; is left there for a
                 ; take to clear
  jr nz,HWSL1
  ld hl,CONDEV
  res 7,(hl)     ; CDWRD

HWSL1:
  ld hl,LCDROWS  ; the row's DDRAM
                 ; address command,
  ld e,b         ; from the table
  ld d,0
  add hl,de
  ld a,(hl)
  call LCDC      ; the cursor to the
                 ; row's start
  pop hl
  ld b,20        ; the row's width

HWSLC:
  call LCDWAIT   ; each character once
                 ; the LCD is ready
  ld a,(hl)
  out (LCDDAT),a
  inc hl
  djnz HWSLC     ; all 20, zeros and all
  jp HWOK

; VIDEO. B = 1 claims the PICO9918, B =
; 0 releases it; any other B returns
; TNEBAD, and TNENODV with no PICO9918
; found at cold boot. Claim: the console
; stops drawing on the PICO9918 (output
; to it is dropped, no cursor, no page
; flips) and the program owns its
; registers and VRAM. Release, or warm
; boot through HWVREL: with the ROM's
; console started, text mode, font and
; page come back, and the screen is
; cleared while it is the console; with
; none, the VDP is left as the program
; left it. Destroys AF, DE, HL and what
; CURHIDE, the driver's restore and
; VTCLS do.

HWSVID:
  ld a,b         ; 0 or 1, and nothing
                 ; else
  cp 2
  ld a,TNEBAD
  jp nc,HWERR    ; refused, nothing
                 ; changed (A1)
  ld a,(CONDEV)
  and CDTMS      ; a PICO9918 answered
                 ; at cold boot
  ld a,TNENODV
  jp z,HWERR     ; none: no device to
                 ; claim
  ld a,b
  or a
  jr z,HWVREL    ; B = 0: give it back
  ld a,(CONMOD)
  cp CMCRT       ; the console's screen:
                 ; its cursor removed

; before the claim stops the terminal

  call z,CURHIDE
  ld a,CDCLM     ; HWBCLM, as INFO
                 ; reports it
  ld (VCLAIM),a
  jp HWOK

; The release, also warm boot's. Nothing
; is done unless the PICO9918 is
; claimed. Returns A = 0, Z and carry
; clear. Destroys F, DE, HL and what the
; driver's restore and VTCLS do.

HWVREL:
  ld a,(VCLAIM)
  or a
  jp z,HWOK      ; not claimed: nothing
                 ; to give back
  xor a
  ld (VCLAIM),a  ; the terminal may draw
                 ; again
  ld hl,(PIVEC)  ; registers, font, page
                 ; shown, by its driver
  ld a,h
  or l
  jp z,HWOK      ; none: nothing is
                 ; restored
  ld de,6        ; the table's fourth
                 ; word, VREST, the
  add hl,de      ; PICO9918's own even
                 ; while UC1: is the
  ld a,(hl)      ; console
  inc hl
  ld h,(hl)
  ld l,a         ; HL = the restore
                 ; routine
  call VHLJP
  ld a,(CONMOD)
  cp CMCRT
  jp nz,HWOK     ; not the console: the
                 ; screen left alone
  call VTCLS     ; a clear screen, the
                 ; cursor at the top
                 ; left
  xor a
  ld (VROW),a
  ld (VCOL),a
  jp HWOK

; ---- Speaker
; --------------------------------------
; TONE. Square wave on port 01h bit 7:
; DE half cycles of B units of 16
; T-states (plus 51 a half cycle; B = 0
; is 256 units), the serial line held
; idle throughout. DE = 0 sounds
; nothing. Destroys AF, C and DE.

HWSTONE:
  ld a,d
  or e
  jp z,HWOK      ; no half cycles
  ld a,TXIDLE    ; the port's byte: line
                 ; idle, speaker low

HWSTL:
  xor $80        ; the speaker bit
                 ; flipped, a half cycle
  out (DIGPORT),a
  ld c,b

HWSTD:
  dec c          ; B turns of 16
                 ; T-states
  jr nz,HWSTD
  dec de
  ld c,a         ; the port's byte kept
                 ; across the test
  ld a,d
  or e
  ld a,c
  jr nz,HWSTL    ; until DE half cycles
                 ; are sent
  ld a,TXIDLE    ; the speaker left low,
                 ; the line idle
  out (DIGPORT),a
  jp HWOK

; ---- Joystick and keys
; --------------------------------------
; JOY. Returns B = the joystick's bits,
; 1 for each one pressed. Destroys AF
; and C.

HWSJOY:
  ld bc,$F7FE    ; port FEh with address
                 ; line 11 low
  in a,(c)
  cpl            ; the port reads 0 for
                 ; pressed
  ld b,a
  jp HWOK

; KEYS. HL -> 8 bytes: the matrix's
; rows, one byte each, 1 for each key
; down. Returns HL past the eight.
; Destroys AF and BC.

HWSKEYS:
  ld bc,$FEFE    ; row select in the
                 ; high byte, one bit
                 ; low

HWSKL:
  in a,(c)       ; the row whose select
                 ; bit is low
  cpl            ; the port reads 0 for
                 ; down
  ld (hl),a
  inc hl
  rlc b          ; the low bit to the
                 ; next row; carry clear
  jr c,HWSKL     ; once it has left bit
                 ; 7, after eight
  jp HWOK

; ---- Text at a position
; --------------------------------------
; PUTAT. On a video console, B
; characters from HL at row D, column E,
; clipped to the screen, without moving
; the cursor. Status 2 on the serial
; terminal, or while the PICO9918 is
; claimed and is the console. A row past
; the screen writes nothing; a row is
; cut at its last column. Destroys AF,
; BC, DE, HL and what CURHIDE and VPUT
; do.

HWSPUT:
  call VTOWN
  ld a,TNENODV
  jp nz,HWERR    ; claimed and the
                 ; console: not ours
  ld a,(CONMOD)
  rrca           ; bit 0: CMCRT and
                 ; CMUC1, the video
                 ; modes
  ld a,TNENODV
  jp nc,HWERR    ; serial or batch: no
                 ; screen
  ld a,b
  or a
  jp z,HWOK      ; no source read or
                 ; cursor change for
                 ; zero count
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
  jp c,HWOK      ; row D past the last:
                 ; nothing written

HWSPL:
  ld a,(VWID)
  cp e
  jp z,HWOK      ; column E at or past
                 ; the width:
  jp c,HWOK      ; the rest is clipped
  ld a,(hl)
  push bc        ; count, row and
                 ; column, and the
                 ; source,
  push de        ; across the driver
  push hl
  ld b,d         ; VPUT takes row B,
                 ; column C
  ld c,e
  call VPUT      ; character A drawn in
                 ; the cell
  pop hl
  pop de
  pop bc
  inc hl         ; the next character,
                 ; one column on
  inc e
  djnz HWSPL
  jp HWOK

; ---- Clock
; --------------------------------------
; RTC. B = 0 reads, B = 1 sets, the
; seven BCD bytes at HL: seconds,
; minutes, hours, date, month, weekday,
; year. TNEBAD for any other B, TNENODV
; with no DS1302. Setting turns the
; clock's write protect off for the
; burst, whose control byte puts it on
; again. Returns HL past the seven.
; Destroys AF, BC, D, and E when
; setting.

HWSRTC:
  ld a,b         ; 0 read or 1 set, and
                 ; nothing else
  cp 2
  ld a,TNEBAD
  jp nc,HWERR    ; refused, the clock
                 ; untouched (A1)
  push bc        ; B, the direction,
                 ; across the probe
  call RTCHAS
  pop bc
  ld a,TNENODV
  jp nz,HWERR    ; no clock answered
  ld a,b
  or a
  jr nz,HWSRW    ; B = 1: set
  ld d,$BF       ; clock burst read
  call RTCCMD
  ld b,7         ; the seven time bytes,
                 ; not the control

HWSRR:
  call RTCRD
  ld (hl),d
  inc hl
  djnz HWSRR
  jr RTCEND      ; the burst ended by
                 ; the enable going low

HWSRW:
  ld de,$8E00    ; write protect off
  call RTCPUT
  ld d,$BE       ; burst write: 7 bytes
                 ; and the control
  call RTCCMD
  ld b,7

HWSRV:
  ld d,(hl)      ; each time byte in
                 ; turn
  call RTCWR
  inc hl
  djnz HWSRV
  ld d,$80       ; the control byte:
                 ; write protect on
                 ; again
  call RTCWR

RTCEND:
  xor a          ; enable low: the
                 ; transfer ends
  out (RTCPORT),a
  jp HWOK

; Z when a DS1302 answers: its seconds
; register reads below 60h. Returns A =
; 0 with Z, or A = 1 with NZ. Keeps BC.
; Destroys F and D.

RTCHAS:
  ld d,$81       ; read the seconds
                 ; register
  call RTCCMD
  call RTCRD
  xor a          ; enable low: the
                 ; transfer ends
  out (RTCPORT),a
  ld a,d
  cp $60         ; 60h or above is no
                 ; BCD second
  jr nc,RTCNO
  xor a          ; A = 0, Z
  ret

RTCNO:
  or 1           ; A = 1, NZ
  ret

; Write register D = E: D is the
; register's write command. Ends with
; the chip disabled. Keeps BC and E.
; Destroys AF and D.

RTCPUT:
  call RTCCMD
  ld d,e         ; the value follows the
                 ; command
  call RTCWR
  xor a          ; enable low: the write
                 ; is done
  out (RTCPORT),a
  ret

; Enable the chip and send the command
; byte in D. Keeps BC. Destroys AF and
; D.

RTCCMD:
  ld a,$10       ; enable high, clock
                 ; low
  out (RTCPORT),a

; Send D, least significant bit first,
; the chip left enabled with the clock
; high. Keeps BC. Destroys AF; D ends 0.

RTCWR:
  push bc
  ld b,8

RTCW1:
  srl d          ; the next bit, from
                 ; bit 0, to carry
  ld a,$20
  rra            ; data bit to bit 7,
                 ; enable to bit 4

; the bit set up with the clock low

  out (RTCPORT),a
  or $40         ; clock high

; the chip takes the bit on this edge

  out (RTCPORT),a
  djnz RTCW1
  pop bc
  ret

; D = the next byte from the clock,
; least significant bit first, the chip
; left enabled. Keeps BC. Destroys AF.

RTCRD:
  push bc
  ld bc,8*256+RTCPORT
  ld d,0         ; B = 8 bits, C = the
                 ; port, D the byte

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

; TNFONT: HL = the console font in the
; ROM, the one both display drivers draw
; from (KD-159). Destroys AF.

HWSFONT:
  ld hl,FONT
  jp HWOK

; TNDRVR: B = the mode, then VIDHOOK's:
; HL = the driver's table, or 0 to drop
; it. Returns A = 0, carry clear, and HL
; = LINEBUF for a table taken. A refusal
; returns A = TNEBAD with carry, or
; TNENODV for a table offered by a line
; from STARTUP.CMD while CON: is CRT::
; that driver would only give way to the
; ROM's console, so it stays out,
; quietly, and leaves the services'
; stack room to others (KE-200).
; Destroys DE, and HL for a drop.

SVDRV:
  ld a,b
  cp CMUC1       ; UC1: alone: CRT:'s
                 ; table is the ROM's
  jr z,SVDRV1    ; (KS39), and no other
                 ; B has a word
  ld a,TNEBAD    ; refused, nothing
                 ; changed
  scf
  ret

SVDRV1:
  ld a,h         ; a drop is never
                 ; refused
  or l
  jr z,SVDRV2
  ld a,(STFLAG)  ; FFh in a startup
                 ; line: D = 0 there
  cpl
  ld d,a
  ld a,(IOBYTE)  ; the CON: field, 1 for
                 ; CRT:
  and 3
  dec a          ; 0 for CRT:
  or d           ; 0 for CRT: in a
                 ; startup line
  ld a,TNENODV   ; then refused, as an
                 ; absent device
  scf            ; is, nothing changed
  ret z

SVDRV2:
  ld a,b         ; UC1:, the mode, for
                 ; VIDHOOK
  call VIDHOOK
  ld a,TNEBAD    ; kept already, or no
                 ; matrix keyboard
  ret c
  xor a          ; taken or dropped: A =
                 ; 0, carry clear
  ret
