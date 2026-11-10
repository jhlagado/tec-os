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

; MON-3's 63 calls. Those not built go
; to the error display, as MON-3 sends
; a call it does not have.

API:
  DW DERR,DERR,DERR,BEEP
  DW TOSEG,DERR,DERR,DERR
  DW DERR,DERR,SCANS,DERR
  DW LCDB,LCDSTR,LCDCHR,LCDCO
  DW SKEYS,KWAIT,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,TDLY,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR

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

; Call 16, scanKeys, for the keypad.
; NZ: no key. Z: a key in A, with
; carry for a new press and none while
; it is held, as MON-3 answers.

SKEYS:
  in a,(SSYS)    ; the system input
  rrca
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
  cp a           ; Z
  scf            ; a new press
  ld (KBUFF),a   ; the key held
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
