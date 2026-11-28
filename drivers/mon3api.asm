; MON3.SVC: the MON-3 restarts and the
; RST 10h calls, included by mon3.asm.

; MON-3's restarts. Each form pushed HL
; and came here through the latch stub,
; so each starts by taking HL back.

; RST 08h: wait for a key.

r08:
  pop hl         ; the caller's HL
  jp kWait

; RST 10h: MON-3's API, C the call.
; AF, BC and HL reach the routine as
; the caller left them. IX is lost, as
; in MON-3. A call past the table goes
; to the error display.

r10:
  pop hl         ; the caller's HL
  push af
  ld a,c         ; the call
  cp 63          ; MON-3's count
  jr nc,r10X     ; not MON-3's
  push bc
  push hl        ; kept for the call
  ld hl,Api
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

r10X:
  pop af
  jp dErr        ; MON-3's refusal

; RST 20h: scan the digits at DE, then
; the keys, then wait for the LCD, as
; MON-3's slot runs on into RST 28h.
; A and the flags are the key scan's.

r20:
  pop hl         ; the caller's HL
  call scanS     ; the digits
  call sKeys     ; the keys
  jr r28A

; RST 28h: wait for the LCD.

r28:
  pop hl         ; the caller's HL

r28A:
  push af
  call lcdB      ; wait for the LCD
  pop af         ; keep the flags
  ret

; RST 30h: a breakpoint. Go back to the
; MON3> line as a return, which prints
; the address. The digits go to HEXT,
; outside the summed bytes.

r30:
  pop hl
  pop hl         ; the return address
  ld de,HexT
  call hlStr     ; its digits
  ld a,'$'
  ld (de),a      ; for BDOS 9
  ld (BrkF),a    ; nonzero: say BRK
  jp mRet        ; as a return

; RST 38h: MON-3's interrupt dispatch.

r38:
  pop hl
  push hl        ; HL kept below
  ld hl,(UINT)   ; the user's handler
  ex (sp),hl     ; on the stack
  ret            ; and run

; MON-3's 63 calls, by number and its
; name. Those not built go to the error
; display, as MON-3 sends a call it
; does not have.

Api:
  DW swId        ; 0 softwareID
  DW verId       ; 1 versionID
  DW preIn       ; 2 preInit
  DW beep        ; 3 beepAlways
  DW toSeg       ; 4 convAToSeg
  DW aToAs       ; 5 regAToASCII
  DW a2s         ; 6 ASCIItoSegment
  DW sCmp        ; 7 stringCompare
  DW hlStr       ; 8 HLToString
  DW hexA        ; 9 AToString
  DW scanS       ; 10 scanSegments
  DW dErr        ; 11 displayError
  DW lcdB        ; 12 LCDBusy
  DW lcdStr      ; 13 stringToLCD
  DW lcdChr      ; 14 charToLCD
  DW lcdCo       ; 15 commandToLCD
  DW sKeys       ; 16 scanKeys
  DW kWait       ; 17 scanKeysWait
  DW mScan       ; 18 matrixScan
  DW joyS        ; 19 joystickScan
  DW serOn       ; 20 serialEnable
  DW serOff      ; 21 serialDisable
  DW txB         ; 22 txByte
  DW rxB         ; 23 rxByte
  DW dErr        ; 24 intelHexLoad
  DW sndS        ; 25 sendToSerial
  DW rcvS        ; 26 receiveFromSerial
  DW dErr        ; 27 sendAssembly
  DW sHex        ; 28 sendHex
  DW gDump       ; 29 genDataDump
  DW chkSe       ; 30 checkStartEnd
  DW dErr        ; 31 menuDriver
  DW dErr        ; 32 paramDriver
  DW tDly        ; 33 timeDelay
  DW pNote       ; 34 playNote
  DW pTune       ; 35 playTune
  DW dErr        ; 36 playTuneMenu
  DW getCap      ; 37 getCaps
  DW getShd      ; 38 getShadow
  DW getPrt      ; 39 getProtect
  DW getExp      ; 40 getExpand
  DW setCap      ; 41 setCaps
  DW dErr        ; 42 setShadow
  DW setPrt      ; 43 setProtect
  DW dErr        ; 44 setExpand
  DW strSer      ; 45 stringToSerial
  DW rtcApi      ; 46 RTCAPI
  DW dErr        ; 47 menuPop
  DW togCap      ; 48 toggleCaps
  DW rand        ; 49 random
  DW dErr        ; 50 setDisStart
  DW dErr        ; 51 getDisNext
  DW dErr        ; 52 getDisassembly
  DW msAsc       ; 53 matrixScanASCII
  DW pmScn       ; 54 parseMatrixScan
  DW lcdCf       ; 55 LCDConfirm
  DW getGt       ; 56 getGLCDTerm
  DW dErr        ; 57 setGLCDTerm
  DW dErr        ; 58 loadFromDisk
  DW dErr        ; 59 openFile
  DW dErr        ; 60 readSector
  DW dErr        ; 61 writeSector
  DW rgbS        ; 62 RGBScan

; Call 3, beep: MON-3's tone, with the
; serial line held idle. A=0. Keeps BC.

beep:
  push bc        ; kept
  ld c,$40       ; half cycles
  ld a,TXI

beep1:
  out (SDIG),a   ; the speaker's level
  ld b,$40
  djnz $         ; half a period
  xor $80        ; the speaker bit
  dec c
  jr nz,beep1    ; each half cycle
  pop bc
  ld a,TXI
  out (SDIG),a   ; speaker low
  xor a          ; A=0, as MON-3's
  ret

; Call 4, convAToSeg: A as two segment
; bytes at DE, DE+2. Clobbers A and BC.
; F is that of MON-3's lookup, which
; adds the digit to 1Fh, its table's
; place in its page.

toSeg:
  push af        ; the low digit
  rlca
  rlca
  rlca
  rlca           ; the high digit
  call toSeg1    ; its segments
  pop af

toSeg1:
  and $0F        ; one digit
  add a,$1F      ; F as MON-3 makes it
  push af
  ld bc,SegT-$1F
  add a,c
  ld c,a         ; BC at its code
  jr nc,toSeg2
  inc b          ; past a page

toSeg2:
  ld a,(bc)
  ld (de),a      ; the segments
  inc de
  pop bc         ; C: that F
  ld b,a
  push bc
  pop af         ; the code, that F
  ret

; MON-3's segment codes for 0 to F.

SegT:
  DB $EB,$28,$CD,$AD,$2E,$A7,$E7,$29
  DB $EF,$2F,$6F,$E6,$C3,$EC,$C7,$47

; Call 10, scanSegments: one scan of the
; six digits from DE, leftmost first.
; DE+6, A=0, F as MON-3 leaves it.
; Clobbers B.

scanS:
  ld b,$20       ; the leftmost

scn1:
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
  jr nc,scn1     ; six digits
  ld a,0         ; not XOR A: keeps F
                 ; from RRC B, as MON-3
  out (SSEG),a   ; segments off
  ret

; Call 12, LCDBusy: wait for the LCD.
; Keeps every register.

lcdB:
  push af        ; kept

lcdB1:
  in a,(LCDI)
  rlca           ; the busy flag
  jr c,lcdB1     ; still busy
  pop af
  ret

; Call 13, stringToLCD: the zero-ended
; string at HL. HL ends past its zero.

lcdStr:
  ld a,(hl)
  inc hl         ; past it
  or a
  ret z          ; the string's end
  call lcdB
  out (LCDD),a   ; the character
  jr lcdStr

; Call 14, charToLCD: A.

lcdChr:
  call lcdB
  out (LCDD),a   ; the character
  ret

; Call 15, commandToLCD: B. Keeps AF.

lcdCo:
  push af
  call lcdB      ; wait for it
  ld a,b
  out (LCDI),a   ; the command
  pop af
  ret

; Call 16, scanKeys: the keypad, or
; the matrix when port 03h's bit 0 is
; set. NZ: no key. Z: a key in A, with
; carry for a new press and none while
; it is held, as MON-3 answers.

sKeys:
  in a,(SSYS)    ; the system input
  rrca
  jr c,kbScan    ; bit 0: the matrix
  and $20        ; the key-down bit
  jr z,sk1
  ld (KPRESS),a  ; none: NZ
  ret

sk1:
  ld a,(KPRESS)
  or a           ; Z: already down
  ld a,(KBUFF)   ; the key held
  ret z          ; held: no carry
  xor a
  ld (KPRESS),a  ; now held
  in a,(SKEYB)   ; the key's code
  and $3F
  xor $20        ; MON-3's Fn bit

skExit:
  cp a           ; Z
  scf            ; a new press
  ld (KBUFF),a   ; the key held
  ret

; The matrix read as the keypad, as
; MON-3's keyboardScan reads it: 0-9,
; A-F, Esc as AD, Enter as GO, - and +.
; Fn with a key adds MON-3's Fn bit.
; Clobbers BC, DE and HL.

kbScan:
  call mScan     ; a key or two
  jr z,kbF
  ld (KPRESS),a  ; none: NZ
  ret

kbF:
  ld a,d
  ld (KSEC),a    ; the second key
  ld a,e
  cp $2A
  jr nc,kbBad    ; past F
  cp $24
  jr c,kbNum     ; below A
  sub $1A        ; A-F as 10-15
  jr kbGood

kbNum:
  cp $1D
  jr nc,kbBad    ; past 9
  cp $13
  jr c,kbSpec    ; below 0
  sub $13        ; 0-9
  jr kbGood

kbSpec:
  cp $0C
  jr nz,kbS1     ; not Esc
  ld a,$13       ; AD
  jr kbGood

kbS1:
  cp $0A
  jr nz,kbS2     ; not Enter
  ld a,$12       ; GO
  jr kbGood

kbS2:
  cp $07
  jr nc,kbBad    ; no key of MON-3's
  cp $05
  jr c,kbBad
  sub 3          ; - and + as
  xor $03        ; 11h and 10h
  add a,$10

kbGood:
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
  jr nz,kbG1
  ld a,$20       ; MON-3's Fn bit

kbG1:
  add a,e
  jr skExit      ; a new press

kbBad:
  or 1           ; NZ: not a key
  ret

; Call 18, matrixScan: the matrix by
; port FEh, a row a read with B its
; row's line. E the last key found,
; 00h-3Fh, D the one before or FFh. Z
; for one key, or a key with Shift (0),
; Ctrl (1) or Fn (2). Clobbers A, BC
; and HL. E goes to Tecos's KBLAST,
; as its own scan records the key: so
; Tecos doesn't take a key held from a
; program as new, and a host that holds
; a key until Tecos reads it lets go.

mScan:
  ld l,$FF       ; a row's base, less 1
  ld de,0-1      ; no keys yet
  ld bc,SMATX*257

ms1:
  in a,(c)       ; one row
  cpl
  and $FF        ; Z: no key down
  jr z,ms3
  ld h,a         ; its keys
  ld a,l

ms2:
  inc a          ; each key's number
  srl h
  jr nc,ms2      ; until its bit
  ld d,e         ; the one before
  ld e,a         ; and this one
  jr nz,ms2      ; more in the row

ms3:
  ld a,8
  add a,l
  ld l,a         ; the next row's base
  rlc b          ; the next row's line
  jr c,ms1       ; eight rows
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

kWait:
  call sKeys     ; the keys
  ld a,(KPRESS)
  or a
  jr z,kWait     ; still down

kw1:
  call sKeys     ; until a press
  jr nz,kw1
  ret

; Call 33, timeDelay: HL loops. Keeps
; every register.

tDly:
  push hl
  push de        ; kept
  ld de,1

td1:
  sbc hl,de
  jp nc,td1      ; until it borrows
  pop de         ; both back
  pop hl
  ret

; Call 11, displayError, and every call
; not built: MON-3's error, written to
; DISP_BUFF and shown on the digits
; until a key, then back to the caller
; with A the key, Z and C, as a key
; press gives. Clobbers BC, DE and HL.

dErr:
  ld hl,ErrT
  ld de,DISPB
  ld bc,6
  ldir           ; Err into DISP_BUFF

dErr0:
  call sKeys     ; the keys
  ld a,(KPRESS)
  or a
  jr z,dErr0     ; wait for key up

dErr1:
  ld de,DISPB    ; Err on the digits
  call scanS     ; one scan
  call sKeys
  jr nz,dErr1    ; until a press
  ret

ErrT: DB $C7,$4B,$4B,$EB,$4B,$00

; Call 7, stringCompare: B bytes at HL
; and DE, 0 for 256. Z if they match.
; Clobbers A, BC, DE and HL.

sCmp:
  ld a,(hl)
  ld c,a
  ld a,(de)
  cp c           ; Z: equal so far
  ret nz
  inc hl
  inc de
  djnz sCmp      ; each byte
  ret

; Call 53, matrixScanASCII: the keys in
; DE from call 18 as ASCII in A, or the
; key's own code when it has none. Esc,
; Enter, space, the quote and the
; backslash first, then digits and
; punctuation, then letters, with Shift,
; Ctrl and Caps Lock. Clobbers BC and
; HL.

msAsc:
  ld a,e         ; the key
  ld hl,KModT
  ld bc,5        ; five keys to find

msa1:
  cpi
  jr z,msa2      ; this one
  inc hl         ; past its ASCII
  jp pe,msa1     ; until BC is 0
  jr msa3

msa2:
  ld a,(hl)      ; its ASCII
  cp $26
  ret c          ; Shift does not apply
  ld b,a
  ld a,d
  or a           ; Shift held?
  jr nz,msaE
  ld a,$12       ; the shifted quote
  add a,c        ; or backslash
  jr ksIdx

; The key's code, then its ASCII: Esc,
; Enter, space, quote and backslash.

KModT:
  DB $0A,$0D,$0C,$1B,$0D,$20
  DB $0E,$27,$3F,$5C

msa3:
  cp $21
  jr nc,msaL     ; past the digits
  cp $0F
  jr c,msaL      ; below the comma
  add a,$1D      ; the digit or sign
  ld b,a
  ld a,d
  or a           ; Shift held?
  jr nz,msaE
  ld a,b
  sub $2C        ; its place shifted

; A = the place in KSHT. MON-3 adds it
; to L at 10h of its table's page; F is
; that addition's, and A the entry.

ksIdx:
  add a,$10      ; F as MON-3 makes it
  push af
  ld hl,KShT-$10
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

msaL:
  cp $24
  ret c          ; no letter: the key
  add a,$3D      ; a to z
  ld b,a
  ld a,d
  dec a          ; Ctrl held?
  jr nz,msaC
  ld a,b
  sub $60        ; a control code
  ret

msaC:
  call getCap    ; Caps Lock
  or a
  jr nz,msaU     ; on: upper case
  ld a,d
  or a           ; Shift held?
  jr nz,msaE

msaU:
  ld a,b
  sub $20        ; upper case
  ret

msaE:
  ld a,b         ; as it is
  ret

; Shifted: , - . / 0-9 ; = and the quote
; and backslash, from 2Ch.

KShT:
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

pmScn:
  ld hl,KREPT    ; the repeat time
  jr z,pmK       ; a key down
  ld (hl),0
  xor a
  ld (KBUFF),a   ; no key held

pmSp:
  ld b,0
  djnz $         ; MON-3's delay
  djnz $
  or a           ; NC: no ASCII
  ret

pmK:
  ld a,(KBUFF)
  cp e           ; the key held?
  jr nz,pmN
  dec (hl)
  jr nz,pmSp     ; not yet repeated
  ld (hl),$20    ; then faster

pmN:
  ld a,e
  ld (KBUFF),a   ; this key held
  cp 3
  jr c,pmSp      ; Shift, Ctrl or Fn
  dec (hl)
  ld a,7         ; Caps Lock?
  cp e
  jr nz,pmM
  call togCap
  jr pmSp

pmM:
  call msAsc     ; its ASCII
  scf
  ret

; Call 37, getCaps: A = CAPS_LOCK.

getCap:
  ld a,(CAPSL)
  ret

; Call 48, toggleCaps: CAPS_LOCK and
; SYS_MODE's bit 7 flipped, and the
; latch written. A = SYS_MODE.

togCap:
  ld a,(CAPSL)
  xor $80
  ld (CAPSL),a   ; flipped
  ld a,(SYSMD)
  xor $80        ; and SYS_MODE's

; SYS_MODE = A, and the latch from it as
; GO takes it, with LATCHV equal. Keeps
; A and F.

latSet:
  ld (SYSMD),a
  push af
  and GOKEEP     ; PROTECT and CAPS
  or LATSHD      ; the overlay off
  ld (LATCH),a
  out (SYSLAT),a
  pop af
  ret

; Call 0, softwareID: HL at "MON3.1G".

swId:
  ld hl,Sig
  ret

; Call 1, versionID: HL at MON-3's own
; release, with its numbers in BC and
; DE as MON-3 gives them.

verId:
  ld hl,Vers     ; "2025.16"
  ld bc,$07E9    ; 2025
  ld de,$0016    ; 16
  ret

; Call 5, regAToASCII: A as two hex
; digits, the high in H, the low in L
; and A.

aToAs:
  push af
  rrca
  rrca
  rrca
  rrca           ; the high digit
  call hexC
  ld h,a
  pop af
  call hexC      ; the low digit
  ld l,a
  ret

; Call 6, ASCIItoSegment: A as a digit's
; segments, 0 outside 20h-7Fh. Keeps
; HL. As in MON-3, F is that of adding
; A-20h to 4Fh, its table's place in
; its page, and 7Fh reads the byte
; after the table.

a2s:
  sub $20
  jr c,a2sX      ; below the space
  cp $60
  jr c,a2sL      ; in the table

a2sX:
  xor a          ; none
  ret

a2sL:
  push hl
  add a,$4F      ; F as MON-3 makes it
  push af
  ld hl,AscT-$4F
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

AscT:
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

gDump:
  push bc
  call hlStr     ; the address
  ld a,':'
  ld (de),a
  inc de

gDump1:
  ld a,' '
  ld (de),a      ; a space
  inc de
  ld a,(hl)
  call hexA      ; and the byte
  inc hl
  djnz gDump1
  xor a
  ld (de),a      ; the end
  pop bc
  ret

; Call 30, checkStartEnd: HL at START
; and END. HL = START, BC = END-START+1,
; carry if END is below START.
; Clobbers DE.

chkSe:
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

getShd:
  ld a,(SYSMD)
  and $01        ; the overlay bit
  xor $01        ; active low
  ret

; Call 39, getProtect: A = PROT_MODE.

getPrt:
  ld a,(PROTM)
  ret

; Call 40, getExpand: A = SYS_MODE AND
; 04h, 0 in a session.

getExp:
  ld a,(SYSMD)
  and $04
  ret

; Call 41, setCaps: CAPS_LOCK = A AND
; 80h, and SYS_MODE's bit 7 with it.
; A = SYS_MODE. The latch takes it as
; GO does.

setCap:
  push bc
  and $80
  ld (CAPSL),a
  ld b,a         ; the new bit
  ld a,(SYSMD)
  and $7F        ; the old one out

; SYS_MODE = A OR B, and the latch.

updMd:
  or b
  call latSet
  pop bc
  ret

; Call 43, setProtect: PROT_MODE = A AND
; 02h, and SYS_MODE's bit 1 with it, in
; the latch at once, as in MON-3.

setPrt:
  push bc
  and $02
  ld (PROTM),a
  ld b,a         ; the new bit
  ld a,(SYSMD)
  and $FD        ; the old one out
  jr updMd

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

rand:
  ld a,(RNGSD)
  ld b,a
  sla b
  sbc a,a        ; FFh if bit 7 was set
  and $5F
  xor b
  ld (RNGSD),a   ; the new seed
  ld b,a
  ld a,r
  add a,b
  ret

; Call 55, LCDConfirm: the question on a
; clear LCD, then a key. Z if it is C.
; Clobbers B and HL.

lcdCf:
  ld hl,ConfT
  ld b,$01       ; clear the LCD
  call lcdCo
  call lcdStr
  rst $08        ; a key
  cp $0C         ; C?
  ret

ConfT: DB "Press 'C' to Confirm",0

; Call 56, getGLCDTerm: A = GLCD_TERM,
; 0 until the GLCD terminal is built.

getGt:
  ld a,(GTERM)
  ret
