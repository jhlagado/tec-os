; A stand-in for MON3 at C000h, for the
; emulator test of the diagnostics
; (test/diag.test.mjs). It has only the
; RST 00h, 08h and 10h calls the program
; uses, and starts it at 4000h. Keys
; come from port 30h, which the test
; scripts: FFh means none.

KEYQ      EQU   $30
LATCH     EQU   $0880
SAVA      EQU   $0881
TRAMP     EQU   $0882
BEEPS     EQU   $0885
BADAPI    EQU   $0886
UINTV     EQU   $0892
UNMIV     EQU   $0894
CALLS     EQU   $08A0

  ORG $C000

RESET:
  di             ; at reset the overlay
                 ; shows
  jp COLD        ; this ROM at 0000h

  ORG $C008

RST08:
  jp KWAIT       ; wait for a key

  ORG $C010

RST10:
  jp API         ; the API, C = the call

  ORG $C038

RST38:
  jp INTDSP      ; IM 1

  ORG $C066

NMI66:
  jp NMIDSP      ; through 0894h

; Remove the overlay, put MON3's vectors
; in RAM as MON3 leaves them, and start
; the program with MONRST as its return.

COLD:
  ld sp,$0880    ; MON3's stack
  ld a,$01       ; bit 0 set: RAM at 0
  ld (LATCH),a
  out ($FF),a    ; the latch
  ld a,$C3       ; JP at each vector
  ld ($0000),a
  ld ($0008),a   ; RST 08h
  ld ($0010),a   ; RST 10h
  ld ($0038),a   ; RST 38h
  ld ($0066),a   ; NMI
  ld (TRAMP),a   ; and the trampoline
  ld hl,MONRST   ; their targets
  ld ($0001),hl  ; RST 00h's
  ld hl,KWAIT
  ld ($0009),hl  ; RST 08h's
  ld hl,API
  ld ($0011),hl  ; RST 10h's
  ld hl,INTDSP
  ld ($0039),hl  ; RST 38h's
  ld hl,NMIDSP
  ld ($0067),hl  ; the NMI's
  ld hl,0        ; no user vectors
  ld (UINTV),hl
  ld (UNMIV),hl  ; both clear
  xor a          ; no beeps, no bad call
  ld (BEEPS),a
  ld (BADAPI),a  ; and no bad call
  ld hl,CALLS    ; no calls seen
  ld b,8

CL1:
  ld (hl),a      ; cleared
  inc hl
  djnz CL1       ; eight bytes
  ld hl,MONRST   ; a RET ends there too
  push hl        ; under the program
  jp $4000       ; the program

; RST 00h: the test stops here.

MONRST:
  di             ; and stay here
  jr MONRST      ; the test's end mark

; RST 10h: mark call C in CALLS, then
; enter its handler with the caller's
; registers through the JP at TRAMP.

API:
  ld (SAVA),a    ; the caller's A
  push hl
  push de
  push bc        ; the caller's
                 ; registers
  ld a,c         ; past call 63:
  cp 64          ; unknown
  jr nc,APIX     ; an unknown number
  rrca           ; its CALLS byte: C / 8
  rrca
  rrca
  and 7          ; the byte's index
  ld e,a
  ld d,0
  ld hl,CALLS
  add hl,de      ; CALLS + C / 8
  ld a,c         ; its bit: C mod 8
  and 7
  ld b,a
  inc b
  ld a,$80       ; bit C mod 8

AP1:
  rlca
  djnz AP1       ; up to that bit
  or (hl)        ; marked
  ld (hl),a      ; marked
  ld a,c         ; its handler from
  add a,a        ; APITAB
  ld e,a         ; C x 2
  ld hl,APITAB
  add hl,de      ; its table entry
  ld e,(hl)
  inc hl
  ld d,(hl)      ; in DE
  ld (TRAMP+1),de
  pop bc         ; JP to it
  pop de
  pop hl         ; the caller's back
  ld a,(SAVA)    ; the caller's A back
  jp TRAMP       ; enter it

APIX:
  pop bc         ; an unknown call
  pop de
  pop hl         ; as they were

; An unknown call: keep its number for
; the test.

BADC:
  ld a,c         ; the call's number
  ld (BADAPI),a
  ret            ; the caller sees no
                 ; change

; beep: counted only.

BEEP:
  ld a,(BEEPS)   ; one more beep
  inc a          ; one more
  ld (BEEPS),a
  ret            ; A destroyed, as MON3

; scanSegments: DE past its six bytes.

SCANS:
  ld a,e         ; DE + 6
  add a,6
  ld e,a         ; E + 6
  ret nc
  inc d          ; the carry
  ret

; stringToLCD, charToLCD and
; commandToLCD, each after the busy flag
; clears.

LCDSTR:
  ld a,(hl)      ; the next character
  inc hl
  or a           ; zero ends it
  ret z          ; the end
  call LCDCHR
  jr LCDSTR      ; the next one

LCDCHR:
  push af        ; the character
  call LCDWT
  pop af         ; the character
  out ($84),a    ; as data
  ret            ; sent

LCDCMD:
  push af
  call LCDWT
  ld a,b         ; the command
  out ($04),a    ; the command
  pop af
  ret            ; sent

LCDWT:
  in a,($04)     ; busy flag: bit 7
  rlca
  jr c,LCDWT     ; busy: wait
  ret            ; ready

; scanKeys: a scripted key gives Z and
; carry, a new press; none gives NZ.

SCANK:
  in a,(KEYQ)    ; the script's next key
  cp $FF         ; FFh: none
  jr z,SKN       ; none
  cp a           ; Z, A kept
  scf            ; and carry: a new
                 ; press
  ret            ; A: the key

SKN:
  or a           ; NZ, no carry
  ret            ; none

; scanKeysWait and RST 08h: wait for a
; key.

KWAIT:
  call SCANK     ; until one comes
  jr nz,KWAIT    ; until a key
  ret            ; A: the key

; timeDelay: HL turns of 26 T-states.

DELAY:
  push af        ; it destroys nothing
  push hl        ; HL kept

DL1:
  dec hl         ; HL turns
  ld a,h
  or l
  jr nz,DL1      ; down to zero
  pop hl
  pop af
  ret            ; HL and A kept

; The latch calls, on the copy at LATCH
; and written to port FFh. Shadow "on"
; (01h) clears bit 0, which shows the
; ROM.

GETCAP:
  ld a,(LATCH)   ; 80h: on
  and $80
  ret            ; 0 or 80h

GETSHD:
  ld a,(LATCH)   ; bit 0 clear: on
  and 1
  xor 1
  ret            ; 1 or 0

GETPRT:
  ld a,(LATCH)   ; 02h: on
  and 2
  ret            ; 0 or 02h

GETEXP:
  ld a,(LATCH)   ; 04h: on
  and 4
  ret            ; 0 or 04h

SETCAP:
  push bc        ; kept
  ld b,$80       ; the CAPS bit
  jr SETB

SETPRT:
  push bc        ; kept
  ld b,2         ; PROTECT
  jr SETB

SETEXP:
  push bc        ; kept
  ld b,4         ; EXPAND

SETB:
  ld c,a         ; the setting
  ld a,(LATCH)   ; the bit cleared
  or b
  xor b          ; the bit clear
  inc c          ; 0: off, left clear
  dec c
  jr z,SB1       ; zero: leave it
  or b           ; else set

SB1:
  ld (LATCH),a   ; kept and written
  out ($FF),a    ; to the port
  pop bc
  ret            ; done

SETSHD:
  push bc        ; kept
  ld c,a         ; the setting
  ld a,(LATCH)   ; off: bit 0 set
  or 1
  inc c          ; zero: off
  dec c
  jr z,SB2       ; off: bit 0 set
  and $FE        ; on: bit 0 clear

SB2:
  ld (LATCH),a   ; kept and written
  out ($FF),a    ; to the port
  pop bc
  ret            ; done

; IM 1 and NMI: through MON3's user
; vectors at 0892h and 0894h when they
; are set.

INTDSP:
  push hl
  push af        ; kept
  ld hl,(UINTV)  ; a user handler?
  ld a,h
  or l
  jr z,INTNO     ; none set
  pop af         ; A back
  ex (sp),hl     ; HL back, the handler
  ret            ; on the stack: enter
                 ; it

INTNO:
  pop af         ; none: return
  pop hl
  ei
  reti           ; back where it was

NMIDSP:
  push hl
  push af        ; kept
  ld hl,(UNMIV)  ; a user handler?
  ld a,h
  or l
  jr z,NMINO     ; none set
  pop af         ; A back
  ex (sp),hl     ; enter it
  ret            ; enter it

NMINO:
  pop af         ; none: return
  pop hl
  retn           ; back where it was

; The handlers of calls 0-63.

APITAB:
  DW BADC,BADC,BADC,BEEP,BADC,BADC
  DW BADC,BADC,BADC,BADC,SCANS,BADC
  DW BADC,LCDSTR,LCDCHR,LCDCMD,SCANK
  DW KWAIT,BADC,BADC,BADC,BADC,BADC
  DW BADC,BADC,BADC,BADC,BADC,BADC
  DW BADC,BADC,BADC,BADC,DELAY,BADC
  DW BADC,BADC,GETCAP,GETSHD,GETPRT
  DW GETEXP,SETCAP,SETSHD,SETPRT
  DW SETEXP,BADC,BADC,BADC,BADC,BADC
  DW BADC,BADC,BADC,BADC,BADC,BADC
  DW BADC,BADC,BADC,BADC,BADC,BADC
  DW BADC,BADC
