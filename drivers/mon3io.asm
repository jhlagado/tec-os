; MON3.SVC: MON-3's calls for the ports
; beyond the digits, keys and LCD: the
; joystick, the serial line, the
; speaker and the 8x8 LEDs. Included by
; mon3.asm.

; Call 19, joystickScan: port FEh with
; A11 low, complemented. Z for none.

joyS:
  push bc        ; kept
  ld bc,0-$0802  ; B F7h, C FEh
  in a,(c)
  cpl            ; a 1 for each input
  and $FF        ; Z: nothing
  pop bc
  ret

; Call 20, serialEnable: TX high, and
; the LEDs blue. A = 44h.

serOn:
  ld a,TXI
  out (SDIG),a   ; TX idle
  ld a,$44
  out (SSEG),a   ; the LEDs
  ret

; Call 21, serialDisable: TX low until
; the program returns. A = 0.

serOff:
  xor a          ; all low
  out (SDIG),a   ; TX and digits off
  out (SSEG),a
  ret

; Call 22, txByte: A sent at 4800 8N2,
; each bit BAUD's delay long, MON-3's
; loop unchanged. Keeps every register.

txB:
  push af
  push bc
  push hl        ; all kept
  ld hl,(BAUD)   ; the bit's delay
  ld c,a         ; the byte
  xor a          ; the start bit
  out (SDIG),a
  out (SSEG),a   ; and on the LEDs
  call tDly      ; one bit's time
  ld b,8         ; eight data bits
  rrc c          ; bit 0 to bit 6 next

txB1:
  rrc c          ; the next to bit 6
  ld a,c
  and TXI        ; it alone
  out (SDIG),a   ; the bit
  out (SSEG),a
  call tDly
  djnz txB1      ; each bit
  ld a,TXI       ; two stop bits
  out (SDIG),a
  out (SSEG),a
  call tDly
  call tDly      ; two bits' time
  pop hl
  pop bc
  pop af         ; all as they were
  ret

; Call 23, rxByte: a byte from port
; 03h's bit 7, each bit sampled in its
; middle. A = the byte, NC.

rxB:
  push bc
  push hl        ; kept

rxB1:
  in a,(SSYS)
  rlca           ; bit 7: the line
  jr c,rxB1      ; idle
  ld hl,(BAUD)   ; a bit's time
  srl h
  rr l           ; half a bit
  call tDly
  in a,(SSYS)    ; the start bit still?
  rlca
  jr c,rxB1      ; too short: again
  ld b,8         ; eight bits

rxB2:
  ld hl,(BAUD)
  call tDly      ; to the next bit
  in a,(SSYS)
  rlca           ; bit 7 to carry
  rr c           ; it in
  djnz rxB2
  ld a,c
  or a           ; NC
  pop hl         ; both back
  pop bc
  ret

; MON-3's readyToTransmit: TX high, then
; a delay. Clobbers A.

txRdy:
  call serOn     ; TX high
  push hl
  ld hl,$2000
  call tDly      ; the line settles
  pop hl         ; kept
  ret

; Call 25, sendToSerial: DE bytes from
; HL, 0 for 65,536. BC 0, HL past them.

sndS:
  push de
  pop bc         ; BC = the count
  call txRdy     ; TX high first

sndS1:
  ld a,(hl)      ; the next byte
  call txB       ; one byte
  cpi            ; HL on, BC down
  jp pe,sndS1    ; until BC is 0
  ret

; Call 26, receiveFromSerial: DE bytes
; to HL, written where the program asks.

rcvS:
  push de
  pop bc         ; BC = the count

rcvS1:
  call rxB       ; one byte
  ld (hl),a      ; stored
  cpi            ; HL on, BC down
  jp pe,rcvS1
  ret

; Call 28, sendHex: DE bytes from HL as
; MON-3's dump lines, sixteen bytes a
; line, each made at DATA_ROW (0900h),
; the end at DATA_TO (08C2h).

sHex:
  push de
  pop bc         ; BC = the count
  ex de,hl
  add hl,de      ; HL + DE
  ld (DATTO),hl  ; the end
  ex de,hl       ; HL the start again
  call txRdy

sHex1:
  push hl        ; the line's start
  push bc
  pop hl         ; the bytes left
  ld de,0-16
  add hl,de      ; carry: 16 or more
  ld e,16        ; a full line
  jr c,sHex2
  push bc
  pop hl         ; fewer: all of them
  ld e,c

sHex2:
  ex (sp),hl     ; HL the start, and
  ld b,e         ; the rest kept
  ld de,DROW
  call gDump     ; the line's text
  push hl        ; the next line's start
  ld hl,DROW     ; to send it

sHex3:
  ld a,(hl)
  inc hl
  or a
  jr z,sHex4     ; the text's end
  call txB
  jr sHex3       ; each character

sHex4:
  ld a,13
  call txB       ; CR
  ld a,10
  call txB       ; LF
  pop de         ; the next start
  pop bc         ; the bytes left
  ld hl,(DATTO)
  or a
  sbc hl,de      ; past the end?
  ret z          ; at it, or
  ret c          ; past it
  ex de,hl
  jr sHex1       ; the next line

; Call 34, playNote: HL half cycles
; times 4 of B's length on the speaker,
; TX held idle. A = 0. Clobbers BC, HL.

pNote:
  add hl,hl
  add hl,hl      ; for 4 MHz
  xor a
  or TXI         ; TX idle, NC
  push de
  ld de,1        ; to count down
  ld c,b         ; the wavelength

pn1:
  out (SDIG),a   ; the speaker's level
  ld b,3

pn2:
  push bc        ; the three's count
  ld b,c
  djnz $         ; one wavelength
  pop bc
  djnz pn2       ; three of them
  xor $80        ; the speaker bit
  sbc hl,de
  jr nz,pn1      ; each half cycle
  pop de
  ld a,TXI       ; TX still idle
  out (SDIG),a   ; speaker low
  xor a          ; A=0, as MON-3's
  ret

; Call 35, playTune: the notes at DE,
; 01h-18h, 00h a pause, 19h or more the
; end. DE ends past it. Clobbers A, HL.

pTune:
  ld a,(de)
  inc de         ; the next note
  cp $19
  ret nc         ; the end
  or a
  jr z,ptP       ; a pause
  ld hl,FreqT
  dec a          ; from 01h
  add a,a        ; two bytes a note
  add a,l
  ld l,a
  ld a,0
  adc a,h        ; with the carry
  ld h,a         ; HL at the note
  ld a,(hl)
  push bc
  ld b,a         ; its wavelength
  inc hl
  ld a,(hl)
  ld l,a
  ld h,0         ; its half cycles
  call pNote     ; played
  pop bc
  jr pTune

ptP:
  push hl
  ld hl,$2000    ; MON-3's pause
  push de
  ld de,1        ; to count down

ptP1:
  sbc hl,de
  jp nc,ptP1     ; until it borrows
  pop de
  pop hl
  jr pTune       ; the next note

; MON-3's notes: a wavelength and half
; cycles for each, G to F sharp.

FreqT:
  DB $8C,$19,$83,$1A,$7C,$1C,$75,$1D
  DB $70,$1E,$67,$20,$62,$23,$5C,$25
  DB $57,$27,$52,$29,$4E,$2C,$48,$2E
  DB $45,$31,$41,$33,$3C,$37,$39,$3A
  DB $36,$3D,$32,$41,$2F,$45,$2C,$49
  DB $2A,$4D,$27,$52,$25,$57,$23,$5C

; Call 45, stringToSerial: the string
; at HL, zero-ended. HL ends past the
; zero.

strSer:
  call txRdy     ; TX high first

strS1:
  ld a,(hl)
  inc hl
  or a
  ret z          ; the end
  call txB       ; the character
  jr strS1

; Call 62, RGBScan: one scan of the 8x8
; LEDs, IY at eight rows each of red,
; green and blue. Keeps BC and IY.

rgbS:
  push bc
  push iy        ; both kept
  ld c,$01       ; row 1's bit

rgb1:
  ld a,(iy+0)
  out (SRED),a   ; the row's red
  ld a,(iy+8)
  out (SGRN),a   ; green
  ld a,(iy+16)
  out (SBLU),a   ; and blue
  ld a,c
  out (SLED),a   ; the row on
  ld b,$40
  djnz $         ; for a while
  xor a
  out (SLED),a   ; and off
  inc iy         ; the next row's data
  rl c           ; the next row
  jr nc,rgb1     ; eight rows
  pop iy
  pop bc
  ret
