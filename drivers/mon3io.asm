; MON3.SVC: MON-3's calls for the ports
; beyond the digits, keys and LCD: the
; joystick, the serial line, the
; speaker and the 8x8 LEDs. Included by
; mon3.asm.

; Call 19, joystickScan: port FEh with
; A11 low, complemented. Z for none.

joyScan:
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
  ld a,TX_IDLE
  out (DIGITS),a    ; TX idle
  ld a,$44
  out (SEGMENTS),a  ; the LEDs
  ret

; Call 21, serialDisable: TX low until
; the program returns. A = 0.

serOff:
  xor a          ; all low
  out (DIGITS),a    ; TX and digits off
  out (SEGMENTS),a
  ret

; Call 22, txByte: A sent at 4800 8N2,
; each bit BAUD's delay long, MON-3's
; loop unchanged. Keeps every register.

txByte:
  push af
  push bc
  push hl        ; all kept
  ld hl,(BAUD)   ; the bit's delay
  ld c,a         ; the byte
  xor a          ; the start bit
  out (DIGITS),a
  out (SEGMENTS),a  ; and on the LEDs
  call delay     ; one bit's time
  ld b,8         ; eight data bits
  rrc c          ; bit 0 to bit 6 next

.bit:
  rrc c          ; the next to bit 6
  ld a,c
  and TX_IDLE    ; it alone
  out (DIGITS),a    ; the bit
  out (SEGMENTS),a
  call delay
  djnz .bit      ; each bit
  ld a,TX_IDLE   ; two stop bits
  out (DIGITS),a
  out (SEGMENTS),a
  call delay
  call delay     ; two bits' time
  pop hl
  pop bc
  pop af         ; all as they were
  ret

; Call 23, rxByte: a byte from port
; 03h's bit 7, each bit sampled in its
; middle. A = the byte, NC.

rxByte:
  push bc
  push hl        ; kept

.start:
  in a,(SYS_IN)
  rlca           ; bit 7: the line
  jr c,.start    ; idle
  ld hl,(BAUD)   ; a bit's time
  srl h
  rr l           ; half a bit
  call delay
  in a,(SYS_IN)  ; the start bit still?
  rlca
  jr c,.start    ; too short: again
  ld b,8         ; eight bits

.bit:
  ld hl,(BAUD)
  call delay     ; to the next bit
  in a,(SYS_IN)
  rlca           ; bit 7 to carry
  rr c           ; it in
  djnz .bit
  ld a,c
  or a           ; NC
  pop hl         ; both back
  pop bc
  ret

; MON-3's readyToTransmit: TX high, then
; a delay. Clobbers A.

txReady:
  call serOn     ; TX high
  push hl
  ld hl,$2000
  call delay     ; the line settles
  pop hl         ; kept
  ret

; Call 25, sendToSerial: DE bytes from
; HL, 0 for 65,536. BC 0, HL past them.

sendData:
  push de
  pop bc         ; BC = the count
  call txReady   ; TX high first

.byte:
  ld a,(hl)      ; the next byte
  call txByte    ; one byte
  cpi            ; HL on, BC down
  jp pe,.byte    ; until BC is 0
  ret

; Call 26, receiveFromSerial: DE bytes
; to HL, written where the program asks.

recvData:
  push de
  pop bc         ; BC = the count

.byte:
  call rxByte    ; one byte
  ld (hl),a      ; stored
  cpi            ; HL on, BC down
  jp pe,.byte
  ret

; Call 28, sendHex: DE bytes from HL as
; MON-3's dump lines, sixteen bytes a
; line, each made at DATA_ROW (0900h),
; the end at DATA_TO (08C2h).

sendHex:
  push de
  pop bc         ; BC = the count
  ex de,hl
  add hl,de      ; HL + DE
  ld (DUMP_END),hl  ; the end
  ex de,hl       ; HL the start again
  call txReady

.line:
  push hl        ; the line's start
  push bc
  pop hl         ; the bytes left
  ld de,0-16
  add hl,de      ; carry: 16 or more
  ld e,16        ; a full line
  jr c,.text
  push bc
  pop hl         ; fewer: all of them
  ld e,c

.text:
  ex (sp),hl     ; HL the start, and
  ld b,e         ; the rest kept
  ld de,DUMP_ROW
  call dataDump  ; the line's text
  push hl        ; the next line's start
  ld hl,DUMP_ROW    ; to send it

.byte:
  ld a,(hl)
  inc hl
  or a
  jr z,.eol      ; the text's end
  call txByte
  jr .byte       ; each character

.eol:
  ld a,13
  call txByte    ; CR
  ld a,10
  call txByte    ; LF
  pop de         ; the next start
  pop bc         ; the bytes left
  ld hl,(DUMP_END)
  or a
  sbc hl,de      ; past the end?
  ret z          ; at it, or
  ret c          ; past it
  ex de,hl
  jr .line       ; the next line

; Call 34, playNote: HL half cycles
; times 4 of B's length on the speaker,
; TX held idle. A = 0. Clobbers BC, HL.

playNote:
  add hl,hl
  add hl,hl      ; for 4 MHz
  xor a
  or TX_IDLE     ; TX idle, NC
  push de
  ld de,1        ; to count down
  ld c,b         ; the wavelength

.cycle:
  out (DIGITS),a    ; speaker's level
  ld b,3

.three:
  push bc        ; the three's count
  ld b,c
  djnz $         ; one wavelength
  pop bc
  djnz .three    ; three of them
  xor $80        ; the speaker bit
  sbc hl,de
  jr nz,.cycle   ; each half cycle
  pop de
  ld a,TX_IDLE   ; TX still idle
  out (DIGITS),a    ; speaker low
  xor a          ; A=0, as MON-3's
  ret

; Call 35, playTune: the notes at DE,
; 01h-18h, 00h a pause, 19h or more the
; end. DE ends past it. Clobbers A, HL.

playTune:
  ld a,(de)
  inc de         ; the next note
  cp $19
  ret nc         ; the end
  or a
  jr z,.note     ; a pause
  ld hl,NoteTab
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
  call playNote  ; played
  pop bc
  jr playTune

.note:
  push hl
  ld hl,$2000    ; MON-3's pause
  push de
  ld de,1        ; to count down

.wait:
  sbc hl,de
  jp nc,.wait    ; until it borrows
  pop de
  pop hl
  jr playTune    ; the next note

; MON-3's notes: a wavelength and half
; cycles for each, G to F sharp.

NoteTab:
  DB $8C,$19,$83,$1A,$7C,$1C,$75,$1D
  DB $70,$1E,$67,$20,$62,$23,$5C,$25
  DB $57,$27,$52,$29,$4E,$2C,$48,$2E
  DB $45,$31,$41,$33,$3C,$37,$39,$3A
  DB $36,$3D,$32,$41,$2F,$45,$2C,$49
  DB $2A,$4D,$27,$52,$25,$57,$23,$5C

; Call 45, stringToSerial: the string
; at HL, zero-ended. HL ends past the
; zero.

strToSer:
  call txReady   ; TX high first

.char:
  ld a,(hl)
  inc hl
  or a
  ret z          ; the end
  call txByte    ; the character
  jr .char

; Call 62, RGBScan: one scan of the 8x8
; LEDs, IY at eight rows each of red,
; green and blue. Keeps BC and IY.

rgbScan:
  push bc
  push iy        ; both kept
  ld c,$01       ; row 1's bit

.row:
  ld a,(iy+0)
  out (LED_RED),a   ; the row's red
  ld a,(iy+8)
  out (LED_GRN),a   ; green
  ld a,(iy+16)
  out (LED_BLUE),a  ; and blue
  ld a,c
  out (LED_ROW),a   ; the row on
  ld b,$40
  djnz $         ; for a while
  xor a
  out (LED_ROW),a   ; and off
  inc iy         ; the next row's data
  rl c           ; the next row
  jr nc,.row     ; eight rows
  pop iy
  pop bc
  ret
