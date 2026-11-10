; A tour of the TEC-1G's hardware for
; TEC-OS. Build it with TAS DEMO. Run it
; with DEMO; any key stops it.

; It beeps, writes the LCD, counts in
; hex on the digits, runs a rainbow over
; the 8 x 8 LEDs and, with a PICO9918,
; moves a ball over colour bars. LCD row
; 3 shows the time while the clock can
; be read.

; The ROM drives the digits, the LCD,
; the tone and the clock. The LEDs have
; no service, so this program scans them
; itself. It needs TEC-OS with ABI 5.

; The ABI table: "TNA", then the major
; version. CALL ABICALL with the
; service's number in C.

ABITAB    EQU   $C003
ABIMAJ    EQU   $C006
ABICALL   EQU   $C008

; The services used: INFO, the digits,
; the LCD, the video claim, the tone
; and the clock.

TNINFO    EQU   0
TNDIGIT   EQU   1
TNLCD     EQU   2
TNVIDEO   EQU   3
TNTONE    EQU   4
TNRTC     EQU   8

; The PICO9918's data and control ports.

VDPDAT    EQU   $BE
VDPCTL    EQU   $BF

; CP/M's entry.

BDOS      EQU   $0005

; The 8 x 8 LEDs: the row select port,
; then red, green and blue.

LEDSEL    EQU   $05
LEDR      EQU   $06
LEDG      EQU   $F8
LEDB      EQU   $F9

  ORG $0100

; Check for TEC-OS: the table starts
; "TNA", and its major version must be
; 5, since service numbers can move.

  ld hl,ABITAB   ; the table's tag
  ld de,ABITAG   ; against "TNA"
  ld b,3         ; three letters

CHKTAG:
  ld a,(de)
  cp (hl)
  jp nz,NOHW     ; not TEC-OS
  inc hl         ; the next letters
  inc de
  djnz CHKTAG
  ld a,(ABIMAJ)  ; exactly major 5
  cp 5
  jp nz,NOHW     ; another major

; INFO's flags in B: the PICO9918 and
; the clock as cold boot found them, the
; GLCD as it is now. Keep them.

  ld c,TNINFO
  call ABICALL   ; INFO
  ld a,b
  ld (DEVS),a    ; the flags
  ld de,TITLE
  call PRINT     ; the title

; Say which devices are there.

  ld de,PICOMSG
  ld a,(DEVS)
  and 2          ; bit 1: PICO9918
  call YESNO
  ld de,GLCDMSG
  ld a,(DEVS)
  and 4          ; bit 2: GLCD
  call YESNO
  ld de,CLKMSG
  ld a,(DEVS)
  and 8          ; bit 3: the clock
  call YESNO
  ld de,KEYMSG   ; what to watch
  call PRINT

; About 1 kHz for 0.2 s at 4 MHz; the
; service's overhead and interrupts
; change it a little.

  ld b,120       ; the pitch
  ld de,400      ; half cycles
  ld c,TNTONE
  call ABICALL   ; the beep

; Four 20-character rows on the LCD.
; The service changes B and HL.

  ld hl,LCDTXT   ; the rows' text
  ld b,0         ; from row 0

LCDLP:
  push bc        ; the row
  push hl        ; and its text
  ld c,TNLCD
  call ABICALL   ; one row
  pop hl
  ld de,20       ; the next row's text
  add hl,de
  pop bc
  inc b          ; the next row
  ld a,b
  cp 4
  jr nz,LCDLP    ; until all four

; Claim the PICO9918 only when INFO saw
; it. The claim of a present device is
; accepted, so its result isn't read.
; CLAIMED says to release it at the end.

  ld a,(DEVS)
  and 2          ; the PICO9918?
  jr z,LOOP      ; no: no ball
  ld b,1         ; claim
  ld c,TNVIDEO
  call ABICALL   ; the video claim
  ld a,1
  ld (CLAIMED),a
  call VDPSET    ; Graphics I

; FR counts passes, not video frames.
; Read the clock every 32 passes. Each
; pass scans the digits and the LEDs
; once, then looks for a key.

LOOP:
  ld hl,FR
  inc (hl)       ; one more pass
  ld a,(hl)
  and 31
  call z,CLOCK   ; every 32nd
  call COUNT     ; the counter
  call MKDIG     ; as digits
  ld hl,DIGBUF   ; the six digits
  ld c,TNDIGIT
  call ABICALL   ; one scan
  call MKLED     ; the rainbow
  ld hl,LEDBUF   ; the eight rows
  call LEDSCAN
  ld a,(CLAIMED)
  or a
  call nz,BALL   ; with the PICO9918
  ld e,$FF       ; BDOS 6: a key or 0
  ld c,6
  call BDOS
  or a
  jr z,LOOP      ; no key yet

; A key: one scan of zeros darkens the
; digits and the LEDs. Release the
; PICO9918 if it was claimed; the ROM's
; console takes the screen back.

  ld hl,ZEROS
  ld c,TNDIGIT
  call ABICALL   ; dark digits
  ld hl,ZEROS
  call LEDSCAN   ; dark LEDs
  ld a,(CLAIMED)
  or a
  jr z,DONE      ; nothing to release
  ld b,0         ; release
  ld c,TNVIDEO
  call ABICALL

DONE:
  ld de,BYE
  jp PRINT       ; and back to the CCP

NOHW:
  ld de,NOHWMSG  ; and on into PRINT

; PRINT: print the string at DE, up to
; its $, by BDOS function 9.

PRINT:
  ld c,9
  jp BDOS        ; returns to caller

; YESNO: print the label at DE, then yes
; if A is nonzero, else no.

YESNO:
  push af        ; across the label
  call PRINT
  pop af
  ld de,YESMSG
  or a
  jr nz,PRINT    ; A nonzero: yes
  ld de,NOMSG
  jr PRINT       ; else no

; CLOCK: when INFO saw the clock, read
; it and show HH:MM:SS on LCD row 3.
; Each read asks the clock again; a
; failed read leaves the row as it was.

CLOCK:
  ld a,(DEVS)
  and 8          ; the clock?
  ret z
  ld hl,TIME     ; seven BCD bytes
  ld b,0         ; read
  ld c,TNRTC
  call ABICALL
  ret nz         ; the read failed

; HH:MM:SS from column 9 of the row.

  ld hl,CLKROW+9
  ld a,(TIME+2)  ; the hours
  call BCD2
  inc hl         ; past the colon
  ld a,(TIME+1)  ; the minutes
  call BCD2
  inc hl         ; past the colon
  ld a,(TIME)    ; the seconds
  call BCD2
  ld hl,CLKROW   ; the whole row
  ld b,3         ; LCD row 3
  ld c,TNLCD
  jp ABICALL     ; and it returns

; BCD2: write A's two BCD digits at HL
; as ASCII, high first; HL moves on by
; two. A isn't checked to be BCD.

BCD2:
  push af
  rrca           ; the high digit
  rrca
  rrca
  rrca
  call BCD1      ; first
  pop af         ; then the low one

; BCD1: write A's low digit at HL as
; ASCII; HL moves on by one.

BCD1:
  and $0F        ; one digit
  add a,'0'      ; as ASCII
  ld (hl),a
  inc hl         ; the next place
  ret

; COUNT: add one to the 24-bit counter
; CNT, low byte first.

COUNT:
  ld hl,CNT      ; the low byte
  inc (hl)
  ret nz         ; no carry
  inc hl         ; the middle byte
  inc (hl)
  ret nz         ; no carry
  inc hl         ; the high byte
  inc (hl)
  ret

; MKDIG: the counter's six hex digits as
; segment patterns in DIGBUF, leftmost
; first.

MKDIG:
  ld hl,CNT+2    ; the high byte
  ld de,DIGBUF
  ld b,3         ; three bytes

MKDL:
  push bc        ; the count
  push hl        ; and the byte's place
  ld a,(hl)
  push af
  rrca           ; the high digit
  rrca
  rrca
  rrca
  call SEG       ; first
  pop af         ; then the low one
  call SEG
  pop hl
  dec hl         ; the next byte down
  pop bc
  djnz MKDL
  ret

; SEG: A's low four bits as a segment
; pattern at DE, which moves on. Changes
; AF, BC and HL.

SEG:
  and $0F        ; one digit
  ld c,a
  ld b,0         ; BC: the digit
  ld hl,SEGTAB   ; the pattern table
  add hl,bc
  ld a,(hl)      ; its pattern
  ld (de),a
  inc de         ; the next place
  ret

; MKLED: eight RGB triples in LEDBUF, a
; row each. A LED's colour is row plus
; column plus the phase, mod 8, with
; zero shown as white; bits 0, 1 and 2
; light red, green and blue. The phase
; moves every eight passes, not at a
; measured rate.

MKLED:
  ld a,(FR)
  rrca           ; passes / 8
  rrca
  rrca
  and 7
  ld (PH),a      ; the phase
  ld hl,LEDBUF   ; the first triple
  ld (LPTR),hl
  ld d,0         ; D: the row

MKLR:
  ld bc,0        ; B: red, C: green
  ld h,0         ; H: blue
  ld e,7         ; E: the column

MKLC:
  ld a,(PH)
  add a,d        ; + the row
  add a,e        ; + the column
  and 7          ; the colour
  jr nz,MKL0
  ld a,7         ; zero as white

MKL0:
  ld l,a
  sla b          ; room for this LED
  sla c
  sla h
  srl l
  jr nc,MKL1     ; bit 0: red
  set 0,b

MKL1:
  srl l
  jr nc,MKL2     ; bit 1: green
  set 0,c

MKL2:
  srl l
  jr nc,MKL3     ; bit 2: blue
  set 0,h

MKL3:
  dec e
  jp p,MKLC      ; until column 0
  ld a,h
  ld hl,(LPTR)   ; store the triple
  ld (hl),b      ; red
  inc hl
  ld (hl),c      ; green
  inc hl
  ld (hl),a      ; blue
  inc hl
  ld (LPTR),hl
  inc d          ; the next row
  ld a,d
  cp 8
  jr nz,MKLR     ; until all eight
  ret

; LEDSCAN: light the eight RGB triples
; at HL a row at a time, darkening each
; row before the next. The rows must be
; dark on entry. Each row stays lit
; about 0.4 ms at 4 MHz. Leaves the rows
; dark; changes AF, BC and HL.

LEDSCAN:
  ld c,1         ; C: the row's bit

LEDSL:
  ld a,(hl)
  out (LEDR),a   ; red
  inc hl
  ld a,(hl)
  out (LEDG),a   ; green
  inc hl
  ld a,(hl)
  out (LEDB),a   ; blue
  inc hl
  ld a,c         ; light the row
  out (LEDSEL),a
  ld b,128       ; for a while

LEDSD:
  djnz LEDSD     ; let it show
  xor a          ; then darken it
  out (LEDSEL),a
  sla c          ; the next row
  jr nc,LEDSL    ; until all eight
  ret

; VDPSET: with the PICO9918 claimed, set
; Graphics I: names at 1800h, colours
; 2000h, patterns 0000h, sprite
; attributes 1B00h and their patterns
; 3800h, 16 x 16 sprites and a black
; border.

VDPSET:
  ld hl,VDPREGS
  ld c,$80       ; register 0's write

; Each register takes its value, then
; 80h plus its number.

VDPR:
  ld a,(hl)      ; the value
  out (VDPCTL),a
  ld a,c         ; then the register
  out (VDPCTL),a
  inc hl
  inc c          ; the next register
  ld a,c
  cp $88
  jr nz,VDPR     ; registers 0 to 7

; The patterns: every eighth character
; solid, the rest blank.

  ld hl,$0000    ; the pattern table
  call VWA
  ld d,0         ; D: the character

VPAT:
  ld a,d
  and 7
  ld a,0         ; blank
  jr nz,VPAT1
  dec a          ; solid

VPAT1:
  ld b,8         ; eight rows

VPAT2:
  out (VDPDAT),a
  djnz VPAT2
  inc d
  jr nz,VPAT     ; all 256

; The colours: eight bars, then black
; for the unused characters.

  ld hl,$2000    ; the colour table
  call VWA
  ld hl,BARS
  ld b,32        ; a byte per eight

VCOL:
  ld a,(hl)
  out (VDPDAT),a
  inc hl
  djnz VCOL

; The names: each row runs across the
; eight solid characters, four columns
; to a bar.

  ld hl,$1800    ; the name table
  call VWA
  ld d,24        ; D: rows left

VNR:
  ld e,0         ; E: the column

VNC:
  ld a,e
  and $1C        ; the bar, x 4
  add a,a        ; x 8: its character
  out (VDPDAT),a
  inc e
  ld a,e
  cp 32
  jr nz,VNC      ; 32 columns
  dec d
  jr nz,VNR      ; 24 rows

; The ball's pattern, then sprite 0 at
; the ball's place, white, and the end
; of the sprite table.

  ld hl,$3800    ; sprite patterns
  call VWA
  ld hl,BALLPAT
  ld b,32        ; 32 bytes

VBP:
  ld a,(hl)
  out (VDPDAT),a
  inc hl
  djnz VBP
  ld hl,$1B00    ; sprite attributes
  call VWA
  ld a,(BY)      ; Y
  out (VDPDAT),a
  ld a,(BX)      ; X
  out (VDPDAT),a
  xor a          ; pattern 0
  out (VDPDAT),a
  ld a,$0F       ; white
  out (VDPDAT),a
  ld a,$D0       ; the table's end
  out (VDPDAT),a
  ret

; BALL: move the ball by its two-pixel
; step on each axis, within 240 by 176.
; A bounce on either axis gives it a new
; colour, 8 to 15.

BALL:
  ld hl,BX
  ld de,DX
  ld c,240       ; X's bound
  call STEP
  ld hl,BY
  ld de,DY
  ld c,176       ; Y's bound
  call STEP
  ld hl,$1B00    ; sprite 0's place
  call VWA
  ld a,(BY)      ; Y
  out (VDPDAT),a
  ld a,(BX)      ; X
  out (VDPDAT),a
  ld a,(BOUNCE)
  or a
  ret z          ; no bounce
  xor a
  ld (BOUNCE),a  ; seen
  call RANDOM
  and 7
  or 8           ; a colour, 8 to 15
  push af
  ld hl,$1B03    ; sprite 0's colour
  call VWA
  pop af
  out (VDPDAT),a
  ret

; RANDOM: the xorshift16 (7, 9, 8)
; recurrence, whose period is 65,535
; for a nonzero state. Saves the next
; state and returns it in HL, and L in
; A. Changes F.

RANDOM:
  ld hl,(SEED)
  ld a,h         ; H's bit 0 to carry
  rra
  ld a,l         ; the 7 step, into H
  rra
  xor h
  ld h,a
  ld a,l         ; L's bit 0 to carry
  rra
  ld a,h         ; the 9 step, into L
  rra
  xor l
  ld l,a
  xor h          ; the 8 step, into H
  ld h,a
  ld (SEED),hl   ; the next state
  ld a,l         ; and A = L
  ret

; STEP: add the step at DE to the place
; at HL. At 0, or C or above, reverse
; the step and set BOUNCE. Places are
; even and steps 2 or -2; an overshoot
; isn't clamped.

STEP:
  ld a,(de)
  add a,(hl)     ; the new place
  ld (hl),a
  cp c
  jr nc,STEPR    ; at the bound
  or a
  ret nz         ; not yet at 0

STEPR:
  ld a,(de)
  neg            ; the other way
  ld (de),a
  ld (BOUNCE),a  ; nonzero: bounced
  ret

; VWA: set the VRAM write address to
; HL, low byte, then high with bit 6
; set. The two writes must not be
; split by another VDP access.

VWA:
  ld a,l         ; the low byte
  out (VDPCTL),a
  ld a,h
  or $40         ; a write
  out (VDPCTL),a
  ret

; TEC-OS's signature, then the messages.

ABITAG:   DB    "TNA"
TITLE:    DB    13,10,"TEC-OS hardware "
  DB "services demo",13,10,"$"
PICOMSG:  DB    "PICO9918: $"
GLCDMSG:  DB    "   GLCD: $"
CLKMSG:   DB    "   clock: $"
YESMSG:   DB    "yes$"
NOMSG:    DB    "no$"
KEYMSG:   DB    13,10,"Watch the LCD, "
  DB "the digits, the LEDs and "
  DB "the screen.",13,10
  DB "Press any key to stop.",13,10,"$"
BYE:      DB    13,10,"Demo stopped."
  DB 13,10,"$"
NOHWMSG:  DB    13,10,"DEMO needs "
  DB "TEC-OS with ABI 5.",13,10,"$"

; The LCD's four rows, 20 characters
; each.

LCDTXT:   DB    "TEC-OS hardware demo"
  DB "7-seg: hex counter  "
  DB "8x8: moving rainbow "
  DB "PICO9918: Graphics I"

; The VDP's registers 0 to 7.

VDPREGS:  DB    $00,$C2,$06,$80
  DB $00,$36,$07,$01

; The colour table: eight bars on
; black, then black on black.

BARS:     DB    $81,$91,$A1,$B1
  DB $31,$21,$71,$51
  DB $11,$11,$11,$11,$11,$11,$11,$11
  DB $11,$11,$11,$11,$11,$11,$11,$11
  DB $11,$11,$11,$11,$11,$11,$11,$11

; The ball, a 16 x 16 sprite.

BALLPAT:  DB    $07,$1F,$3F,$7F
  DB $7F,$FF,$FF,$FF
  DB $FF,$FF,$FF,$7F,$7F,$3F,$1F,$07
  DB $E0,$F8,$FC,$FE,$FE,$FF,$FF,$FF
  DB $FF,$FF,$FF,$FE,$FE,$FC,$F8,$E0

; The ball's place and its steps.

BX:       DB    40
BY:       DB    60
DX:       DB    2
DY:       DB    2

; The digits 0 to 9 and A to F as
; segment patterns.

SEGTAB:   DB    $EB,$28,$CD,$AD
  DB $2E,$A7,$E7,$29
  DB $EF,$AF,$6F,$E6,$C3,$EC,$C7,$47

; RANDOM's state, never zero.

SEED:     DW    $ACE1

; One scan of zeros darkens the digits
; and the LEDs.

ZEROS:    DB    0,0,0,0,0,0,0,0
  DB 0,0,0,0,0,0,0,0
  DB 0,0,0,0,0,0,0,0

; INFO's flags, whether the PICO9918 is
; claimed, and whether the ball bounced.

DEVS:     DB    0
CLAIMED:  DB    0
BOUNCE:   DB    0

; LCD row 3, and the clock's 7 bytes.

CLKROW:   DB    "Time     00:00:00   "
TIME:     DS    7

; The pass count, the LED phase, the hex
; counter and MKLED's place in LEDBUF.

FR:       DB    0
PH:       DB    0
CNT:      DB    0,0,0
LPTR:     DW    0

; The digits' and the LEDs' buffers.
; They come last: the build checks they
; are the file's final 6 + 24 bytes, all
; zero.

DIGBUF:   DS    6
LEDBUF:   DS    24
