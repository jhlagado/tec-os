; MON3.SVC: the MON-3 restarts and the
; RST 10h calls, included by mon3.asm.

; MON-3's restarts. Each form pushed HL
; and came here through the latch stub,
; so each starts by taking HL back.

; RST 08h: wait for a key.

R08:
  pop hl         ; the caller's HL
  jp KWAIT

; RST 10h: MON-3's API, C the call.
; AF, BC and HL reach the routine as
; the caller left them. IX is lost, as
; in MON-3. A call past the table goes
; to the error display.

R10:
  pop hl         ; the caller's HL
  push af
  ld a,c         ; the call
  cp 63          ; MON-3's count
  jr nc,R10X     ; not MON-3's
  push bc
  push hl        ; kept for the call
  ld hl,API
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

R10X:
  pop af
  jp DERR        ; MON-3's refusal

; RST 18h: the graphics API, not built.

R18:
  pop hl
  jp DERR        ; refused

; RST 20h: scan the digits at DE, then
; the keys, then wait for the LCD, as
; MON-3's slot runs on into RST 28h.
; A and the flags are the key scan's.

R20:
  pop hl         ; the caller's HL
  call SCANS     ; the digits
  call SKEYS     ; the keys
  jr R28A

; RST 28h: wait for the LCD.

R28:
  pop hl         ; the caller's HL

R28A:
  push af
  call LCDB      ; wait for the LCD
  pop af         ; keep the flags
  ret

; RST 30h: a breakpoint. Say where and
; go back to the MON3> line.

R30:
  pop hl
  pop hl         ; the return address
  ld de,MBRK+4
  call HLSTR     ; into the message
  ld de,MBRK
  call PRINT     ; BRK and the address
  jp MRET        ; as a return

; RST 38h: MON-3's interrupt dispatch.

R38:
  pop hl
  push hl        ; HL kept below
  ld hl,(UINT)   ; the user's handler
  ex (sp),hl     ; on the stack
  ret            ; and run

; MON-3's 63 calls, by number and its
; name. Those not built go to the error
; display, as MON-3 sends a call it
; does not have.

API:
  DW DERR        ; 0 softwareID
  DW DERR        ; 1 versionID
  DW DERR        ; 2 preInit
  DW BEEP        ; 3 beepAlways
  DW TOSEG       ; 4 convAToSeg
  DW DERR        ; 5 regAToASCII
  DW DERR        ; 6 ASCIItoSegment
  DW DERR        ; 7 stringCompare
  DW DERR        ; 8 HLToString
  DW DERR        ; 9 AToString
  DW SCANS       ; 10 scanSegments
  DW DERR        ; 11 displayError
  DW LCDB        ; 12 LCDBusy
  DW LCDSTR      ; 13 stringToLCD
  DW LCDCHR      ; 14 charToLCD
  DW LCDCO       ; 15 commandToLCD
  DW SKEYS       ; 16 scanKeys
  DW KWAIT       ; 17 scanKeysWait
  DW MSCAN       ; 18 matrixScan
  DW DERR        ; 19 joystickScan
  DW DERR        ; 20 serialEnable
  DW DERR        ; 21 serialDisable
  DW DERR        ; 22 txByte
  DW DERR        ; 23 rxByte
  DW DERR        ; 24 intelHexLoad
  DW DERR        ; 25 sendToSerial
  DW DERR        ; 26 receiveFromSerial
  DW DERR        ; 27 sendAssembly
  DW DERR        ; 28 sendHex
  DW DERR        ; 29 genDataDump
  DW DERR        ; 30 checkStartEnd
  DW DERR        ; 31 menuDriver
  DW DERR        ; 32 paramDriver
  DW TDLY        ; 33 timeDelay
  DW DERR        ; 34 playNote
  DW DERR        ; 35 playTune
  DW DERR        ; 36 playTuneMenu
  DW GETCAP      ; 37 getCaps
  DW DERR        ; 38 getShadow
  DW DERR        ; 39 getProtect
  DW DERR        ; 40 getExpand
  DW DERR        ; 41 setCaps
  DW DERR        ; 42 setShadow
  DW DERR        ; 43 setProtect
  DW DERR        ; 44 setExpand
  DW DERR        ; 45 stringToSerial
  DW DERR        ; 46 RTCAPI
  DW DERR        ; 47 menuPop
  DW TOGCAP      ; 48 toggleCaps
  DW DERR        ; 49 random
  DW DERR        ; 50 setDisStart
  DW DERR        ; 51 getDisNext
  DW DERR        ; 52 getDisassembly
  DW MSASC       ; 53 matrixScanASCII
  DW PMSCN       ; 54 parseMatrixScan
  DW DERR        ; 55 LCDConfirm
  DW DERR        ; 56 getGLCDTerm
  DW DERR        ; 57 setGLCDTerm
  DW DERR        ; 58 loadFromDisk
  DW DERR        ; 59 openFile
  DW DERR        ; 60 readSector
  DW DERR        ; 61 writeSector
  DW DERR        ; 62 RGBScan

; Call 3, beep: MON-3's tone, with the
; serial line held idle. A=0. Keeps BC.

BEEP:
  push bc        ; kept
  ld c,$40       ; half cycles
  ld a,TXI

BEEP1:
  out (SDIG),a   ; the speaker's level
  ld b,$40
  djnz $         ; half a period
  xor $80        ; the speaker bit
  dec c
  jr nz,BEEP1    ; each half cycle
  pop bc
  ld a,TXI
  out (SDIG),a   ; speaker low
  xor a          ; A=0, as MON-3's
  ret

; Call 4, convAToSeg: A as two segment
; bytes at DE, DE+2. Clobbers A and BC.

TOSEG:
  push af        ; the low digit
  rlca
  rlca
  rlca
  rlca           ; the high digit
  call TOSEG1    ; its segments
  pop af

TOSEG1:
  and $0F        ; one digit
  ld bc,SEGT
  add a,c
  ld c,a         ; BC at its code
  jr nc,TOSEG2
  inc b          ; past a page

TOSEG2:
  ld a,(bc)
  ld (de),a      ; the segments
  inc de
  ret

; MON-3's segment codes for 0 to F.

SEGT:
  DB $EB,$28,$CD,$AD,$2E,$A7,$E7,$29
  DB $EF,$2F,$6F,$E6,$C3,$EC,$C7,$47

; Call 10, scanSegments: one scan of the
; six digits from DE, leftmost first.
; DE+6, A=0. Clobbers B.

SCANS:
  ld b,$20       ; the leftmost

SCN1:
  ld a,(de)      ; its segments
  out (SSEG),a
  ld a,b
  or TXI         ; TX held idle
  out (SDIG),a   ; this digit on
  ld b,$40
  djnz $         ; on for a while
  inc de
  and $3F
  ld b,a         ; the digit's bit
  ld a,TXI
  out (SDIG),a   ; off again
  rrc b          ; the next digit
  jr nc,SCN1     ; six digits
  xor a
  out (SSEG),a   ; segments off
  ret

; Call 12, LCDBusy: wait for the LCD.
; Keeps every register.

LCDB:
  push af        ; kept

LCDB1:
  in a,(LCDI)
  rlca           ; the busy flag
  jr c,LCDB1     ; still busy
  pop af
  ret

; Call 13, stringToLCD: the zero-ended
; string at HL. HL ends past its zero.

LCDSTR:
  ld a,(hl)
  inc hl         ; past it
  or a
  ret z          ; the string's end
  call LCDB
  out (LCDD),a   ; the character
  jr LCDSTR

; Call 14, charToLCD: A.

LCDCHR:
  call LCDB
  out (LCDD),a   ; the character
  ret

; Call 15, commandToLCD: B. Keeps AF.

LCDCO:
  push af
  call LCDB      ; wait for it
  ld a,b
  out (LCDI),a   ; the command
  pop af
  ret

; Call 16, scanKeys: the keypad, or
; the matrix when port 03h's bit 0 is
; set. NZ: no key. Z: a key in A, with
; carry for a new press and none while
; it is held, as MON-3 answers.

SKEYS:
  in a,(SSYS)    ; the system input
  rrca
  jr c,KBSCAN    ; bit 0: the matrix
  and $20        ; the key-down bit
  jr z,SK1
  ld (KPRESS),a  ; none: NZ
  ret

SK1:
  ld a,(KPRESS)
  or a           ; Z: already down
  ld a,(KBUFF)   ; the key held
  ret z          ; held: no carry
  xor a
  ld (KPRESS),a  ; now held
  in a,(SKEYB)   ; the key's code
  and $3F
  xor $20        ; MON-3's Fn bit

SKEXIT:
  cp a           ; Z
  scf            ; a new press
  ld (KBUFF),a   ; the key held
  ret

; The matrix read as the keypad, as
; MON-3's keyboardScan reads it: 0-9,
; A-F, Esc as AD, Enter as GO, - and +.
; Fn with a key adds MON-3's Fn bit.
; Clobbers BC, DE and HL.

KBSCAN:
  call MSCAN     ; a key or two
  jr z,KBF
  ld (KPRESS),a  ; none: NZ
  ret

KBF:
  ld a,d
  ld (KSEC),a    ; the second key
  ld a,e
  cp $2A
  jr nc,KBBAD    ; past F
  cp $24
  jr c,KBNUM     ; below A
  sub $1A        ; A-F as 10-15
  jr KBGOOD

KBNUM:
  cp $1D
  jr nc,KBBAD    ; past 9
  cp $13
  jr c,KBSPEC    ; below 0
  sub $13        ; 0-9
  jr KBGOOD

KBSPEC:
  cp $0C
  jr nz,KBS1     ; not Esc
  ld a,$13       ; AD
  jr KBGOOD

KBS1:
  cp $0A
  jr nz,KBS2     ; not Enter
  ld a,$12       ; GO
  jr KBGOOD

KBS2:
  cp $07
  jr nc,KBBAD    ; no key of MON-3's
  cp $05
  jr c,KBBAD
  sub 3          ; - and + as
  xor $03        ; 11h and 10h
  add a,$10

KBGOOD:
  ld e,a         ; the key
  ld a,(KPRESS)
  or a           ; Z: already down
  ld a,(KBUFF)
  ret z          ; held: no carry
  xor a
  ld (KPRESS),a  ; now held
  ld a,d
  cp $02         ; Fn the second key?
  ld a,0
  jr nz,KBG1
  ld a,$20       ; MON-3's Fn bit

KBG1:
  add a,e
  jr SKEXIT      ; a new press

KBBAD:
  or 1           ; NZ: not a key
  ret

; Call 18, matrixScan: the matrix by
; port FEh, a row a read with B its
; row's line. E the last key found,
; 00h-3Fh, D the one before or FFh. Z
; for one key, or a key with Shift (0),
; Ctrl (1) or Fn (2). Clobbers A, BC
; and HL.

MSCAN:
  ld l,$FF       ; a row's base, less 1
  ld de,0-1      ; no keys yet
  ld bc,SMATX*257

MS1:
  in a,(c)       ; one row
  cpl
  and $FF        ; Z: no key down
  jr z,MS3
  ld h,a         ; its keys
  ld a,l

MS2:
  inc a          ; each key's number
  srl h
  jr nc,MS2      ; until its bit
  ld d,e         ; the one before
  ld e,a         ; and this one
  jr nz,MS2      ; more in the row

MS3:
  ld a,8
  add a,l
  ld l,a         ; the next row's base
  rlc b          ; the next row's line
  jr c,MS1       ; eight rows
  ld a,e
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

KWAIT:
  call SKEYS     ; the keys
  ld a,(KPRESS)
  or a
  jr z,KWAIT     ; still down

KW1:
  call SKEYS     ; until a press
  jr nz,KW1
  ret

; Call 33, timeDelay: HL loops. Keeps
; every register.

TDLY:
  push hl
  push de        ; kept
  ld de,1

TD1:
  sbc hl,de
  jp nc,TD1      ; until it borrows
  pop de         ; both back
  pop hl
  ret

; Call 11, displayError, and every call
; not built: MON-3's error on the
; digits until a key, then back to the
; caller. Clobbers AF, B and DE.

DERR:
  call SKEYS     ; the keys
  ld a,(KPRESS)
  or a
  jr z,DERR      ; wait for key up

DERR1:
  ld de,ERRT     ; Err on the digits
  call SCANS     ; one scan
  call SKEYS
  jr nz,DERR1    ; until a press
  ret

ERRT: DB $C7,$4B,$4B,$EB,$4B,$00

; Call 7, stringCompare: B bytes at HL
; and DE, 0 for 256. Z if they match.
; Clobbers A, BC, DE and HL.

SCMP:
  ld a,(hl)
  ld c,a
  ld a,(de)
  cp c           ; Z: equal so far
  ret nz
  inc hl
  inc de
  djnz SCMP      ; each byte
  ret

; Call 53, matrixScanASCII: the keys in
; DE from call 18 as ASCII in A, or the
; key's own code when it has none. Esc,
; Enter, space, the quote and the
; backslash first, then digits and
; punctuation, then letters, with Shift,
; Ctrl and Caps Lock. Clobbers BC and
; HL.

MSASC:
  ld a,e         ; the key
  ld hl,KMODT
  ld bc,5        ; five keys to find

MSA1:
  cpi
  jr z,MSA2      ; this one
  inc hl         ; past its ASCII
  jp pe,MSA1     ; until BC is 0
  jr MSA3

MSA2:
  ld a,(hl)      ; its ASCII
  cp $26
  ret c          ; Shift does not apply
  ld b,a
  ld a,d
  or a           ; Shift held?
  jr nz,MSAE
  ld a,$12       ; the shifted quote
  add a,c        ; or backslash
  jr KSIDX

; The key's code, then its ASCII: Esc,
; Enter, space, quote and backslash.

KMODT:
  DB $0A,$0D,$0C,$1B,$0D,$20
  DB $0E,$27,$3F,$5C

MSA3:
  cp $21
  jr nc,MSAL     ; past the digits
  cp $0F
  jr c,MSAL      ; below the comma
  add a,$1D      ; the digit or sign
  ld b,a
  ld a,d
  or a           ; Shift held?
  jr nz,MSAE
  ld a,b
  sub $2C        ; its place shifted

; A = the place in KSHT. MON-3 adds it
; to L at 10h of its table's page; F is
; that addition's, and A the entry.

KSIDX:
  add a,$10      ; F as MON-3 makes it
  push af
  ld hl,KSHT-$10
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

MSAL:
  cp $24
  ret c          ; no letter: the key
  add a,$3D      ; a to z
  ld b,a
  ld a,d
  dec a          ; Ctrl held?
  jr nz,MSAC
  ld a,b
  sub $60        ; a control code
  ret

MSAC:
  call GETCAP    ; Caps Lock
  or a
  jr nz,MSAU     ; on: upper case
  ld a,d
  or a           ; Shift held?
  jr nz,MSAE

MSAU:
  ld a,b
  sub $20        ; upper case
  ret

MSAE:
  ld a,b         ; as it is
  ret

; Shifted: , - . / 0-9 ; = and the quote
; and backslash, from 2Ch.

KSHT:
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

PMSCN:
  ld hl,KREPT    ; the repeat time
  jr z,PMK       ; a key down
  ld (hl),0
  xor a
  ld (KBUFF),a   ; no key held

PMSP:
  ld b,0
  djnz $         ; MON-3's delay
  djnz $
  or a           ; NC: no ASCII
  ret

PMK:
  ld a,(KBUFF)
  cp e           ; the key held?
  jr nz,PMN
  dec (hl)
  jr nz,PMSP     ; not yet repeated
  ld (hl),$20    ; then faster

PMN:
  ld a,e
  ld (KBUFF),a   ; this key held
  cp 3
  jr c,PMSP      ; Shift, Ctrl or Fn
  dec (hl)
  ld a,7         ; Caps Lock?
  cp e
  jr nz,PMM
  call TOGCAP
  jr PMSP

PMM:
  call MSASC     ; its ASCII
  scf
  ret

; Call 37, getCaps: A = CAPS_LOCK.

GETCAP:
  ld a,(CAPSL)
  ret

; Call 48, toggleCaps: CAPS_LOCK and
; SYS_MODE's bit 7 flipped, and the
; latch written. A = SYS_MODE.

TOGCAP:
  ld a,(CAPSL)
  xor $80
  ld (CAPSL),a   ; flipped
  ld a,(SYSMD)
  xor $80        ; and SYS_MODE's

; SYS_MODE = A, and the latch from it as
; GO takes it, with LATCHV equal. Keeps
; A and F.

LATSET:
  ld (SYSMD),a
  push af
  and GOKEEP     ; PROTECT and CAPS
  or LATSHD      ; the overlay off
  ld (LATCH),a
  out (SYSLAT),a
  pop af
  ret
