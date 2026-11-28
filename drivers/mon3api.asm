; MON3.SVC: the MON-3 restarts and the
; RST 10h calls, included by mon3.asm.

; MON-3's restarts. Each form pushed HL
; and came here through the latch stub,
; so each starts by taking HL back.

; RST 08h: wait for a key.

rst08:
  pop hl         ; the caller's HL
  jp keysWait

; RST 10h: MON-3's API, C the call.
; AF, BC and HL reach the routine as
; the caller left them. IX is lost, as
; in MON-3. A call past the table goes
; to the error display.

rst10:
  pop hl         ; the caller's HL
  push af
  ld a,c         ; the call
  cp 63          ; MON-3's count
  jr nc,.refuse  ; not MON-3's
  push bc
  push hl        ; kept for the call
  ld hl,ApiTable
  add a,a        ; two bytes a call
  ld c,a
  ld b,0         ; BC = the offset
  add hl,bc      ; the call's word
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a         ; its routine
  push hl
  pop ix         ; IX = the routine
  pop hl
  pop bc         ; HL and BC back
  pop af         ; as the caller had
  jp (ix)

.refuse:
  pop af
  jp dispErr     ; MON-3's refusal

; RST 20h: scan the digits at DE, then
; the keys, then wait for the LCD, as
; MON-3's slot runs on into RST 28h.
; A and the flags are the key scan's.

rst20:
  pop hl         ; the caller's HL
  call scanSegs  ; the digits
  call scanKeys  ; the keys
  jr rst28Wt

; RST 28h: wait for the LCD.

rst28:
  pop hl         ; the caller's HL

rst28Wt:
  push af
  call lcdBusy   ; wait for the LCD
  pop af         ; keep the flags
  ret

; RST 30h: a breakpoint. Go back to the
; MON3> line as a return, which prints
; the address. The digits go to HexText,
; outside the summed bytes.

rst30:
  pop hl
  pop hl         ; the return address
  ld de,HexText
  call hlToStr   ; its digits
  ld a,'$'
  ld (de),a      ; for BDOS 9
  ld (BrkFlag),a    ; nonzero: say BRK
  jp progRet     ; as a return

; RST 38h: MON-3's interrupt dispatch.

rst38:
  pop hl
  push hl        ; HL kept below
  ld hl,(USER_INT)  ; the user's handler
  ex (sp),hl     ; on the stack
  ret            ; and run

; MON-3's 63 calls, by number and its
; name. Those not built go to the error
; display, as MON-3 sends a call it
; does not have.

ApiTable:
  DW softId      ; 0 softwareID
  DW verId       ; 1 versionID
  DW preInit     ; 2 preInit
  DW beep        ; 3 beepAlways
  DW aToSeg      ; 4 convAToSeg
  DW aToAscii    ; 5 regAToASCII
  DW ascToSeg    ; 6 ASCIItoSegment
  DW strCmp      ; 7 stringCompare
  DW hlToStr     ; 8 HLToString
  DW aToStr      ; 9 AToString
  DW scanSegs    ; 10 scanSegments
  DW dispErr     ; 11 displayError
  DW lcdBusy     ; 12 LCDBusy
  DW strToLcd    ; 13 stringToLCD
  DW chrToLcd    ; 14 charToLCD
  DW cmdToLcd    ; 15 commandToLCD
  DW scanKeys    ; 16 scanKeys
  DW keysWait    ; 17 scanKeysWait
  DW matScan     ; 18 matrixScan
  DW joyScan     ; 19 joystickScan
  DW serOn       ; 20 serialEnable
  DW serOff      ; 21 serialDisable
  DW txByte      ; 22 txByte
  DW rxByte      ; 23 rxByte
  DW dispErr     ; 24 intelHexLoad
  DW sendData    ; 25 sendToSerial
  DW recvData    ; 26 receiveFromSerial
  DW dispErr     ; 27 sendAssembly
  DW sendHex     ; 28 sendHex
  DW dataDump    ; 29 genDataDump
  DW startEnd    ; 30 checkStartEnd
  DW dispErr     ; 31 menuDriver
  DW dispErr     ; 32 paramDriver
  DW delay       ; 33 timeDelay
  DW playNote    ; 34 playNote
  DW playTune    ; 35 playTune
  DW dispErr     ; 36 playTuneMenu
  DW getCaps     ; 37 getCaps
  DW getShad     ; 38 getShadow
  DW getProt     ; 39 getProtect
  DW getExpnd    ; 40 getExpand
  DW setCaps     ; 41 setCaps
  DW dispErr     ; 42 setShadow
  DW setProt     ; 43 setProtect
  DW dispErr     ; 44 setExpand
  DW strToSer    ; 45 stringToSerial
  DW rtcApi      ; 46 RTCAPI
  DW dispErr     ; 47 menuPop
  DW flipCaps    ; 48 toggleCaps
  DW random      ; 49 random
  DW dispErr     ; 50 setDisStart
  DW dispErr     ; 51 getDisNext
  DW dispErr     ; 52 getDisassembly
  DW matAscii    ; 53 matrixScanASCII
  DW parseMat    ; 54 parseMatrixScan
  DW confirm     ; 55 LCDConfirm
  DW getGTerm    ; 56 getGLCDTerm
  DW dispErr     ; 57 setGLCDTerm
  DW dispErr     ; 58 loadFromDisk
  DW dispErr     ; 59 openFile
  DW dispErr     ; 60 readSector
  DW dispErr     ; 61 writeSector
  DW rgbScan     ; 62 RGBScan

; Call 3, beep: MON-3's tone, with the
; serial line held idle. A=0. Keeps BC.

beep:
  push bc        ; kept
  ld c,$40       ; half cycles
  ld a,TX_IDLE

.cycle:
  out (DIGITS),a    ; speaker's level
  ld b,$40
  djnz $         ; half a period
  xor $80        ; the speaker bit
  dec c
  jr nz,.cycle   ; each half cycle
  pop bc
  ld a,TX_IDLE
  out (DIGITS),a    ; speaker low
  xor a          ; A=0, as MON-3's
  ret

; Call 4, convAToSeg: A as two segment
; bytes at DE, DE+2. Clobbers A and BC.
; F is that of MON-3's lookup, which
; adds the digit to 1Fh, its table's
; place in its page.

aToSeg:
  push af        ; the low digit
  rlca
  rlca
  rlca
  rlca           ; the high digit
  call .digit    ; its segments
  pop af

.digit:
  and $0F        ; one digit
  add a,$1F      ; F as MON-3 makes it
  push af
  ld bc,SegTable-$1F
  add a,c
  ld c,a         ; BC at its code
  jr nc,.lookup
  inc b          ; past a page

.lookup:
  ld a,(bc)
  ld (de),a      ; the segments
  inc de
  pop bc         ; C: that F
  ld b,a
  push bc
  pop af         ; the code, that F
  ret

; MON-3's segment codes for 0 to F.

SegTable:
  DB $EB,$28,$CD,$AD,$2E,$A7,$E7,$29
  DB $EF,$2F,$6F,$E6,$C3,$EC,$C7,$47

; Call 10, scanSegments: one scan of the
; six digits from DE, leftmost first.
; DE+6, A=0, F as MON-3 leaves it.
; Clobbers B.

scanSegs:
  ld b,$20       ; the leftmost

.digit:
  ld a,(de)      ; its segments
  out (SEGMENTS),a
  ld a,b
  or TX_IDLE     ; TX held idle
  out (DIGITS),a    ; this digit on
  ld b,$40
  djnz $         ; on for a while
  inc de
  and $3F
  ld b,a         ; the digit's bit
  ld a,TX_IDLE
  out (DIGITS),a    ; off again
  rrc b          ; the next digit
  jr nc,.digit   ; six digits
  ld a,0         ; not XOR A: keeps F
                 ; from RRC B, as MON-3
  out (SEGMENTS),a  ; segments off
  ret

; Call 12, LCDBusy: wait for the LCD.
; Keeps every register.

lcdBusy:
  push af        ; kept

.wait:
  in a,(LCD_CMD)
  rlca           ; the busy flag
  jr c,.wait     ; still busy
  pop af
  ret

; Call 13, stringToLCD: the zero-ended
; string at HL. HL ends past its zero.

strToLcd:
  ld a,(hl)
  inc hl         ; past it
  or a
  ret z          ; the string's end
  call lcdBusy
  out (LCD_DATA),a  ; the character
  jr strToLcd

; Call 14, charToLCD: A.

chrToLcd:
  call lcdBusy
  out (LCD_DATA),a  ; the character
  ret

; Call 15, commandToLCD: B. Keeps AF.

cmdToLcd:
  push af
  call lcdBusy   ; wait for it
  ld a,b
  out (LCD_CMD),a   ; the command
  pop af
  ret

; Call 16, scanKeys: the keypad, or
; the matrix when port 03h's bit 0 is
; set. NZ: no key. Z: a key in A, with
; carry for a new press and none while
; it is held, as MON-3 answers.

scanKeys:
  in a,(SYS_IN)  ; the system input
  rrca
  jr c,matKeys   ; bit 0: the matrix
  and $20        ; the key-down bit
  jr z,.keypad
  ld (KEYPRESS),a   ; none: NZ
  ret

.keypad:
  ld a,(KEYPRESS)
  or a           ; Z: already down
  ld a,(KEY_BUFF)   ; the key held
  ret z          ; held: no carry
  xor a
  ld (KEYPRESS),a   ; now held
  in a,(KEYPAD)  ; the key's code
  and $3F
  xor $20        ; MON-3's Fn bit

noKey:
  cp a           ; Z
  scf            ; a new press
  ld (KEY_BUFF),a   ; the key held
  ret

; The matrix read as the keypad, as
; MON-3's keyboardScan reads it: 0-9,
; A-F, Esc as AD, Enter as GO, - and +.
; Fn with a key adds MON-3's Fn bit.
; Clobbers BC, DE and HL.

matKeys:
  call matScan   ; a key or two
  jr z,.down
  ld (KEYPRESS),a   ; none: NZ
  ret

.down:
  ld a,d
  ld (KEY_2ND),a    ; the second key
  ld a,e
  cp $2A
  jr nc,.bad     ; past F
  cp $24
  jr c,.digit    ; below A
  sub $1A        ; A-F as 10-15
  jr .good

.digit:
  cp $1D
  jr nc,.bad     ; past 9
  cp $13
  jr c,.special  ; below 0
  sub $13        ; 0-9
  jr .good

.special:
  cp $0C
  jr nz,.enter   ; not Esc
  ld a,$13       ; AD
  jr .good

.enter:
  cp $0A
  jr nz,.plusmin    ; not Enter
  ld a,$12       ; GO
  jr .good

.plusmin:
  cp $07
  jr nc,.bad     ; no key of MON-3's
  cp $05
  jr c,.bad
  sub 3          ; - and + as
  xor $03        ; 11h and 10h
  add a,$10

.good:
  ld e,a         ; the key
  ld a,(KEYPRESS)
  or a           ; Z: already down
  ld a,(KEY_BUFF)
  ret z          ; held: no carry
  xor a
  ld (KEYPRESS),a   ; now held
  ld a,d
  cp $02         ; Fn the second key?
  ld a,0
  jr nz,.addfn
  ld a,$20       ; MON-3's Fn bit

.addfn:
  add a,e
  jr noKey       ; a new press

.bad:
  or 1           ; NZ: not a key
  ret

; Call 18, matrixScan: the matrix by
; port FEh, a row a read with B its
; row's line. E the last key found,
; 00h-3Fh, D the one before or FFh. Z
; for one key, or a key with Shift (0),
; Ctrl (1) or Fn (2). Clobbers A, BC
; and HL. E goes to TEC-OS's KBLAST,
; as its own scan records the key: so
; TEC-OS doesn't take a key held from a
; program as new, and a host that holds
; a key until TEC-OS reads it lets go.

matScan:
  ld l,$FF       ; a row's base, less 1
  ld de,0-1      ; no keys yet
  ld bc,MATRIX*257

matRow:
  in a,(c)       ; one row
  cpl
  and $FF        ; Z: no key down
  jr z,matNext
  ld h,a         ; its keys
  ld a,l

.key:
  inc a          ; each key's number
  srl h
  jr nc,.key     ; until its bit
  ld d,e         ; the one before
  ld e,a         ; and this one
  jr nz,.key     ; more in the row

matNext:
  ld a,8
  add a,l
  ld l,a         ; the next row's base
  rlc b          ; the next row's line
  jr c,matRow    ; eight rows
  ld a,e
  ld (KBLAST),a  ; the key read
  cp $40
  ret nc         ; no key: NZ
  ld a,d
  inc a
  ret z          ; one key
  dec a
  ret z          ; with Shift
  dec a
  ret z          ; with Ctrl
  dec a          ; Z: with Fn
  ret

; Call 17 and RST 08h, scanKeysWait:
; wait for the keys to be up, then for
; a press. A = the key, Z.

keysWait:
  call scanKeys  ; the keys
  ld a,(KEYPRESS)
  or a
  jr z,keysWait  ; still down

.press:
  call scanKeys  ; until a press
  jr nz,.press
  ret

; Call 33, timeDelay: HL loops. Keeps
; every register.

delay:
  push hl
  push de        ; kept
  ld de,1

.loop:
  sbc hl,de
  jp nc,.loop    ; until it borrows
  pop de         ; both back
  pop hl
  ret

; Call 11, displayError, and every call
; not built: MON-3's error, written to
; DISP_BUFF and shown on the digits
; until a key, then back to the caller
; with A the key, Z and C, as a key
; press gives. Clobbers BC, DE and HL.

dispErr:
  ld hl,ErrSegs
  ld de,DISP_BUF
  ld bc,6
  ldir           ; Err into DISP_BUFF

.keys:
  call scanKeys  ; the keys
  ld a,(KEYPRESS)
  or a
  jr z,.keys     ; wait for key up

.digits:
  ld de,DISP_BUF    ; Err on the digits
  call scanSegs  ; one scan
  call scanKeys
  jr nz,.digits  ; until a press
  ret

ErrSegs: DB $C7,$4B,$4B,$EB,$4B,$00

; Call 7, stringCompare: B bytes at HL
; and DE, 0 for 256. Z if they match.
; Clobbers A, BC, DE and HL.

strCmp:
  ld a,(hl)
  ld c,a
  ld a,(de)
  cp c           ; Z: equal so far
  ret nz
  inc hl
  inc de
  djnz strCmp    ; each byte
  ret

; Call 53, matrixScanASCII: the keys in
; DE from call 18 as ASCII in A, or the
; key's own code when it has none. Esc,
; Enter, space, the quote and the
; backslash first, then digits and
; punctuation, then letters, with Shift,
; Ctrl and Caps Lock. Clobbers BC and
; HL.

matAscii:
  ld a,e         ; the key
  ld hl,KeyAscii
  ld bc,5        ; five keys to find

.search:
  cpi
  jr z,.found    ; this one
  inc hl         ; past its ASCII
  jp pe,.search  ; until BC is 0
  jr matSym

.found:
  ld a,(hl)      ; its ASCII
  cp $26
  ret c          ; Shift does not apply
  ld b,a
  ld a,d
  or a           ; Shift held?
  jr nz,matAsIs
  ld a,$12       ; the shifted quote
  add a,c        ; or backslash
  jr shiftIdx

; The key's code, then its ASCII: Esc,
; Enter, space, quote and backslash.

KeyAscii:
  DB $0A,$0D,$0C,$1B,$0D,$20
  DB $0E,$27,$3F,$5C

matSym:
  cp $21
  jr nc,matAlpha    ; past the digits
  cp $0F
  jr c,matAlpha  ; below the comma
  add a,$1D      ; the digit or sign
  ld b,a
  ld a,d
  or a           ; Shift held?
  jr nz,matAsIs
  ld a,b
  sub $2C        ; its place shifted

; A = the place in ShiftTab. MON-3 adds
; it to L at 10h of its table's page; F
; is that addition's, and A the entry.

shiftIdx:
  add a,$10      ; F as MON-3 makes it
  push af
  ld hl,ShiftTab-$10
  add a,l        ; the entry's address
  ld l,a
  adc a,h        ; with the carry
  sub l
  ld h,a         ; HL at the entry
  ld a,(hl)
  pop hl         ; L: that F
  ld h,a
  push hl
  pop af         ; the entry, that F
  ret

matAlpha:
  cp $24
  ret c          ; no letter: the key
  add a,$3D      ; a to z
  ld b,a
  ld a,d
  dec a          ; Ctrl held?
  jr nz,.caps
  ld a,b
  sub $60        ; a control code
  ret

.caps:
  call getCaps   ; Caps Lock
  or a
  jr nz,.upper   ; on: upper case
  ld a,d
  or a           ; Shift held?
  jr nz,matAsIs

.upper:
  ld a,b
  sub $20        ; upper case
  ret

matAsIs:
  ld a,b         ; as it is
  ret

; Shifted: , - . / 0-9 ; = and the quote
; and backslash, from 2Ch.

ShiftTab:
  DB $3C,$5F,$3E,$3F,$29,$21,$40,$23
  DB $24,$25,$5E,$26,$2A,$28,$20,$3A
  DB $20,$2B,$7C,$22

; Call 54, parseMatrixScan: DE and Z
; from call 18 as one keystroke. C set
; with A the ASCII, or NC for none: no
; key, a key held within its repeat
; time, Shift, Ctrl or Fn alone, or
; Caps Lock, which toggles caps.
; Clobbers BC and HL.

parseMat:
  ld hl,KEY_REPT    ; the repeat time
  jr z,.held     ; a key down
  ld (hl),0
  xor a
  ld (KEY_BUFF),a   ; no key held

.delay:
  ld b,0
  djnz $         ; MON-3's delay
  djnz $
  or a           ; NC: no ASCII
  ret

.held:
  ld a,(KEY_BUFF)
  cp e           ; the key held?
  jr nz,.new
  dec (hl)
  jr nz,.delay   ; not yet repeated
  ld (hl),$20    ; then faster

.new:
  ld a,e
  ld (KEY_BUFF),a   ; this key held
  cp 3
  jr c,.delay    ; Shift, Ctrl or Fn
  dec (hl)
  ld a,7         ; Caps Lock?
  cp e
  jr nz,.ascii
  call flipCaps
  jr .delay

.ascii:
  call matAscii  ; its ASCII
  scf
  ret

; Call 37, getCaps: A = CAPS_LOCK.

getCaps:
  ld a,(CAPSLOCK)
  ret

; Call 48, toggleCaps: CAPS_LOCK and
; SYS_MODE's bit 7 flipped, and the
; latch written. A = SYS_MODE.

flipCaps:
  ld a,(CAPSLOCK)
  xor $80
  ld (CAPSLOCK),a   ; flipped
  ld a,(SYS_MODE)
  xor $80        ; and SYS_MODE's

; SYS_MODE = A, and the latch from it as
; GO takes it, with LATCHV equal. Keeps
; A and F.

setLatch:
  ld (SYS_MODE),a
  push af
  and GO_KEEP    ; PROTECT and CAPS
  or OVL_OFF     ; the overlay off
  ld (LATCH),a
  out (SYSLAT),a
  pop af
  ret

; Call 0, softwareID: HL at "MON3.1G".

softId:
  ld hl,RomSig
  ret

; Call 1, versionID: HL at MON-3's own
; release, with its numbers in BC and
; DE as MON-3 gives them.

verId:
  ld hl,Release  ; "2025.16"
  ld bc,$07E9    ; 2025
  ld de,$0016    ; 16
  ret

; Call 5, regAToASCII: A as two hex
; digits, the high in H, the low in L
; and A.

aToAscii:
  push af
  rrca
  rrca
  rrca
  rrca           ; the high digit
  call hexChar
  ld h,a
  pop af
  call hexChar   ; the low digit
  ld l,a
  ret

; Call 6, ASCIItoSegment: A as a digit's
; segments, 0 outside 20h-7Fh. Keeps
; HL. As in MON-3, F is that of adding
; A-20h to 4Fh, its table's place in
; its page, and 7Fh reads the byte
; after the table.

ascToSeg:
  sub $20
  jr c,.none     ; below the space
  cp $60
  jr c,.lookup   ; in the table

.none:
  xor a          ; none
  ret

.lookup:
  push hl
  add a,$4F      ; F as MON-3 makes it
  push af
  ld hl,AscSegs-$4F
  add a,l        ; the entry's address
  ld l,a
  adc a,h        ; with the carry
  sub l
  ld h,a
  ld a,(hl)      ; the segments
  pop hl         ; L: that F
  ld h,a
  push hl
  pop af         ; the entry, that F
  pop hl
  ret

; MON-3's segments for 20h to 7Eh, and
; the byte it reads for 7Fh.

AscSegs:
  DB $00,$18,$0A,$EE,$A7,$5C,$2C,$02
  DB $83,$89,$A3,$46,$40,$04,$10,$4C
  DB $EB,$28,$CD,$AD,$2E,$A7,$E7,$29
  DB $EF,$AF,$81,$A1,$07,$84,$0D,$5D
  DB $ED,$6F,$E6,$C3,$EC,$C7,$47,$E3
  DB $6E,$42,$E8,$67,$C2,$61,$6B,$EB
  DB $4F,$8F,$4B,$A7,$C6,$EA,$EA,$8A
  DB $6E,$AE,$CD,$C3,$26,$A9,$0B,$80
  DB $08,$ED,$E6,$C4,$EC,$CF,$47,$AF
  DB $66,$40,$A0,$67,$42,$60,$64,$E4
  DB $4F,$2F,$44,$A7,$C6,$E0,$E0,$60
  DB $6E,$AE,$CD,$2C,$42,$46,$01,$4F

; Call 29, genDataDump: "AAAA: xx ...",0
; at DE for B bytes from HL. DE ends at
; the zero, HL past the bytes.

dataDump:
  push bc
  call hlToStr   ; the address
  ld a,':'
  ld (de),a
  inc de

.byte:
  ld a,' '
  ld (de),a      ; a space
  inc de
  ld a,(hl)
  call aToStr    ; and the byte
  inc hl
  djnz .byte
  xor a
  ld (de),a      ; the end
  pop bc
  ret

; Call 30, checkStartEnd: HL at START
; and END. HL = START, BC = END-START+1,
; carry if END is below START.
; Clobbers DE.

startEnd:
  ld e,(hl)
  inc hl
  ld d,(hl)      ; DE = START
  inc hl
  ld c,(hl)
  inc hl
  ld h,(hl)
  ld l,c         ; HL = END
  or a
  sbc hl,de      ; carry: END below
  ld c,l
  ld b,h
  inc bc         ; the length
  ex de,hl
  ret

; Call 38, getShadow: A = (SYS_MODE AND
; 01h) XOR 01h, 0 in a session.

getShad:
  ld a,(SYS_MODE)
  and $01        ; the overlay bit
  xor $01        ; active low
  ret

; Call 39, getProtect: A = PROT_MODE.

getProt:
  ld a,(PROTMODE)
  ret

; Call 40, getExpand: A = SYS_MODE AND
; 04h, 0 in a session.

getExpnd:
  ld a,(SYS_MODE)
  and $04
  ret

; Call 41, setCaps: CAPS_LOCK = A AND
; 80h, and SYS_MODE's bit 7 with it.
; A = SYS_MODE. The latch takes it as
; GO does.

setCaps:
  push bc
  and $80
  ld (CAPSLOCK),a
  ld b,a         ; the new bit
  ld a,(SYS_MODE)
  and $7F        ; the old one out

; SYS_MODE = A OR B, and the latch.

setMode:
  or b
  call setLatch
  pop bc
  ret

; Call 43, setProtect: PROT_MODE = A AND
; 02h, and SYS_MODE's bit 1 with it, in
; the latch at once, as in MON-3.

setProt:
  push bc
  and $02
  ld (PROTMODE),a
  ld b,a         ; the new bit
  ld a,(SYS_MODE)
  and $FD        ; the old one out
  jr setMode

; Call 46, RTCAPI, not built: carry and
; A = B, as MON-3 answers a function it
; does not have. No port is touched.

rtcApi:
  ld a,b
  cp 19          ; MON-3's count
  scf
  ret

; Call 49, random: MON-3's generator.
; RNG_SEED and B the new seed, A the
; seed plus R. Clobbers B.

random:
  ld a,(RND_SEED)
  ld b,a
  sla b
  sbc a,a        ; FFh if bit 7 was set
  and $5F
  xor b
  ld (RND_SEED),a   ; the new seed
  ld b,a
  ld a,r
  add a,b
  ret

; Call 55, LCDConfirm: the question on a
; clear LCD, then a key. Z if it is C.
; Clobbers B and HL.

confirm:
  ld hl,MsgConf
  ld b,$01       ; clear the LCD
  call cmdToLcd
  call strToLcd
  rst $08        ; a key
  cp $0C         ; C?
  ret

MsgConf: DB "Press 'C' to Confirm",0

; Call 56, getGLCDTerm: A = GLCD_TERM,
; 0 until the GLCD terminal is built.

getGTerm:
  ld a,(GLCD_TRM)
  ret
