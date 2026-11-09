; The clock, the devices TEC-OS looks
; for, interrupts and the keys.

; Read DS1302 register D, a read
; command. Returns A = D = the value and
; leaves CE low. The path costs 1196
; T-states with the RET, and SECCNT
; counts on that. Changes F/BC/DE.

RTCRD:
  ld c,RTCP      ; port FCh
  ld a,$10       ; CE high, clock low
  out (c),a
  ld b,8         ; the command's 8 bits

RTW:
  srl d          ; low bit first
  ld a,$20       ; with the CE bit, so
  rra            ; bit 7 is data, 4 CE
  out (c),a      ; data with clock low
  or $40         ; rising edge: the chip
  out (c),a      ; takes the bit
  djnz RTW       ; all 8 sent
  ld b,8         ; the value's 8 bits

RTR:
  ld a,$70       ; clock high, I/O free
  out (c),a
  ld a,$30       ; falling edge: the
                 ; chip
  out (c),a      ; drives the next bit
  in e,(c)       ; on input bit 0
  srl e
  rr d           ; into D, low bit first
  djnz RTR       ; all 8 read
  xor a          ; CE low
  out (c),a
  ld a,d
  ret            ; the value in A and D

; Find the RTC as TEC-OS does (RTCHAS in
; src/services.asm): a seconds byte
; below 60h. Sets RTCOK.

RTCPRB:
  ld d,$81       ; read the seconds
  call RTCRD
  cp $60         ; FFh: nothing there
  ret nc         ; 60h or more: absent
  ld a,1
  ld (RTCOK),a   ; found
  ret

; Read the seconds into OLDSEC, then
; count reads until they change. HL: the
; reads, KSEC T-states each. Carry when
; 65,535 reads see no change. Changes
; all registers.

SECCNT:
  ld d,$81       ; the seconds now
  call RTCRD
  ld (OLDSEC),a
  ld hl,0        ; the reads so far

SC2:
  ld d,$81       ; 7
  call RTCRD     ; 17 + 1196
  inc hl         ; 6
  ld c,a         ; 4
  ld a,h
  or l
  jr z,SCTO      ; 7
  ld a,(OLDSEC)  ; 13
  cp c           ; 4
  jr z,SC2       ; 12: 1274 in all
  ld a,c         ; the new second
  ld (OLDSEC),a
  or a           ; no carry
  ret            ; carry clear

SCTO:
  scf            ; the clock is stopped
  ret

; CLK: the CPU clock from one RTC
; second, reads x KSEC T-states.
; TEC-OS's serial and SD timing assume 4
; MHz; WARN outside 2% of it.

CLKCHK:
  ld hl,RCLK
  call BEGIN
  ld a,(RTCOK)   ; no RTC: no clock
  or a
  jp nz,CK1
  call SKIPR
  DB "nortc",0
  ret

CK1:
  call SECCNT    ; to a second's start
  jp c,CKTO      ; no change in time
  call SECCNT    ; and across it
  jp c,CKTO
  inc hl         ; and the read that
                 ; began
  ld (CLKN),hl   ; it
  ld b,h         ; the reads, with the
                 ; one
  ld c,l
  ld de,KSEC     ; reads x KSEC = Hz
  call MUL16     ; that began the second
  ld hl,M32A
  ld de,CLKHZ
  call CPY32     ; kept for VDP
  ld a,1         ; for the VDP's rate
  ld (CLKOK),a
  ld hl,M32A     ; rounded to hundredths
  ld de,HALF     ; of a MHz: + 5000,
  call ADD32     ; rounding
  ld hl,M32A     ; / 100,
  ld c,100
  call DIVB      ; / 100
  ld hl,M32A
  ld c,100
  call DIVB      ; / 100
  ld hl,(M32A)   ; below 3.92 MHz
  ld de,392
  or a
  sbc hl,de      ; under 3.92?
  ld a,RWARN
  jr c,CK2
  ld hl,(M32A)   ; or above 4.08
  ld de,409
  or a           ; 4.09 or more?
  sbc hl,de
  jr nc,CK2
  ld a,RPASS     ; within 2%

CK2:
  call RESULT
  call FIELDS
  DB " mhz=",0,FFIX
  DW M32A
  DB " reads=",0,FD16
  DW CLKN
  DB " hz=",0,FD32
  DW CLKHZ
  DB 0,0
  jp ENDL

CKTO:
  call SKIPR     ; the seconds stopped
  DB "rtc-stopped",0
  ret

; VDP: TEC-OS's probe (TMSINIT in
; src/tms.asm), then the frame length
; from eight frame flags, and the frame
; rate at the measured clock, or at 4
; MHz without one.

VDPCHK:
  ld hl,RVDP
  call BEGIN
  call TMSINIT   ; Z: VRAM answers
  jr z,VD1       ; VRAM answered
  call SKIPR
  DB "absent",0
  ret

VD1:
  ld a,1         ; for the INT check
  ld (VDPOK),a   ; present, for INT
  call FRMCNT    ; HL: the reads
  jp c,VDTO
  ld b,h         ; x KFRM T-states
  ld c,l
  ld de,KFRM
  call MUL16     ; in T-states
  ld b,3         ; / 8 frames

VD2:
  ld hl,M32A
  call SHR32
  djnz VD2       ; three halvings
  ld hl,M32A     ; T-states a frame
  ld de,FRMT
  call CPY32
  ld hl,CLKHZ    ; the clock measured,
  ld a,(CLKOK)   ; measured?
  or a
  jr nz,VD3
  ld hl,HZ4M     ; or 4 MHz

VD3:
  ld de,M32A     ; clock x 100 / frame:
  call CPY32     ; hundredths of a Hz
  ld a,100
  call MULA      ; x 100
  ld hl,FRMT
  ld de,M32B
  call CPY32
  call DIV32     ; / T-states a frame
  ld a,RPASS
  call RESULT
  call FIELDS    ; frame and rate
  DB " probe=ok frame=",0,FD32
  DW FRMT
  DB " hz=",0,FFIX
  DW M32A
  DB 0,0
  ld a,(CLKOK)   ; at 4 MHz: say so
  or a
  jp nz,ENDL     ; measured: done
  call PRI
  DB " at=4mhz",0
  jp ENDL

VDTO:
  ld a,RFAIL     ; no frame flag
  call RESULT    ; FAIL
  call PRI
  DB " probe=ok frame=none",0
  jp ENDL

; Wait for a frame flag, then count
; status reads over eight more: HL reads
; of KFRM T-states each. Carry if 65,535
; reads see no flag. Reading the status
; clears the flag.

FRMCNT:
  in a,(VDPC)    ; clear the flag
  ld hl,0        ; the wait's count

FC1:
  inc hl         ; a bound on the wait
  ld a,h
  or l
  jr z,FCTO
  in a,(VDPC)    ; bit 7: a frame
  rlca
  jr nc,FC1      ; until a frame flag
  ld hl,0        ; then count the reads
  ld b,8         ; over 8 frames

FC2:
  inc hl         ; 6
  ld a,h         ; 4
  or l
  jr z,FCTO      ; 7
  in a,(VDPC)    ; 11
  rlca           ; 4
  jr nc,FC2      ; 12: 48 in all
  djnz FC2       ; the next frame
  or a           ; no carry
  ret

FCTO:
  scf            ; no frame flag
  ret            ; carry: none

; LCD: set two DDRAM addresses through
; MON3 and read each back from the busy
; flag's port, 04h. TEC-OS only writes
; the LCD; a read-back shows it is
; there.

LCDCHK:
  ld hl,RLCD
  call BEGIN
  ld b,LROW2+5   ; address 45h
  ld c,MLCDCMD
  rst $10        ; set the address
  call LCDAC     ; read it back
  ld (PRON),a    ; as read back
  ld b,LROW4+3   ; address 57h
  ld c,MLCDCMD
  rst $10        ; set the address
  call LCDAC
  ld (PROFF),a   ; as read back
  cp $57         ; both as set?
  ld a,RFAIL
  jr nz,LC1      ; not as set
  ld a,(PRON)
  cp $45
  ld a,RFAIL
  jr nz,LC1      ; not as set
  ld a,RPASS     ; both as set

LC1:
  call RESULT
  call FIELDS
  DB " ac=",0,FHEX
  DW PRON
  DB ",",0,FHEX
  DW PROFF
  DB " want=45,57",0,0
  jp ENDL

; A = the LCD's address counter once the
; busy flag clears; FFh if it never does
; in 256 reads.

LCDAC:
  ld b,0         ; 256 reads

LA1:
  in a,(LCDC)    ; bit 7: busy
  rlca
  jr nc,LA2
  djnz LA1       ; 256 reads
  ld a,$FF       ; always busy
  ret            ; busy throughout

LA2:
  rrca           ; the address, bits 0-6
  and $7F
  ret            ; carry clear

; GLCD at 07h: present if its busy flag
; clears within 256 reads. Presence
; only.

GLCCHK:
  ld hl,RGLC
  call BEGIN
  ld b,0         ; 256 reads

GC1:
  in a,(GLCC)    ; bit 7: busy
  rlca           ; busy to carry
  jr nc,GC2      ; it answers
  djnz GC1       ; 256 reads
  call SKIPR     ; FFh: nothing there
  DB "absent",0
  ret

GC2:
  rrca           ; the status read
  ld (PRON),a    ; kept for the line
  ld a,RPASS
  call RESULT    ; present
  call FIELDS
  DB " status=",0,FHEX
  DW PRON
  DB 0,0
  jp ENDL

; RTC: read the seven time registers and
; the write-protect byte, and WARN when
; a field is not valid BCD below its
; limit.

RTCCHK:
  ld hl,RRTC
  call BEGIN
  ld a,(RTCOK)   ; found at the start?
  or a
  jr nz,RT1      ; present
  call SKIPR
  DB "absent",0
  ret

RT1:
  ld hl,RTCBUF   ; eight registers
  ld d,$81       ; seconds first

RT2:
  push de        ; RTCRD changes them
  push hl
  call RTCRD     ; one register
  pop hl
  pop de
  ld (hl),a      ; stored
  inc hl
  inc d          ; the next read command
  inc d
  ld a,d         ; past 8Fh, the control
  cp $91
  jr nz,RT2      ; 8 registers in all

; Check each field against its limit in
; RTCLIM, bit 7 (CH, or 12-hour mode)
; masked.

  ld hl,RTCBUF   ; the fields
  ld de,RTCLIM   ; and their limits
  ld c,RPASS     ; the status so far
  ld b,7         ; seven fields

RT3:
  push bc
  ld a,(hl)      ; the field
  and $7F        ; CH or 12h mode off
  ld b,a
  and $0F        ; a BCD units digit?
  cp 10          ; BCD digit below 10?
  ld a,b
  pop bc
  jr nc,RT4      ; no: WARN
  push bc        ; below the limit?
  ld b,a
  ld a,(de)      ; the limit
  cp b           ; carry: limit < field,
  pop bc         ; Z: equal
  jr c,RT4
  jr nz,RT5      ; below it: valid

RT4:
  ld c,RWARN     ; not valid

RT5:
  inc hl         ; the next field
  inc de
  djnz RT3       ; all seven
  ld a,c
  call RESULT    ; PASS or WARN
  call FIELDS
  DB " time=20",0,FHEX
  DW RTCBUF+6
  DB "-",0,FHEX
  DW RTCBUF+4
  DB "-",0,FHEX
  DW RTCBUF+3
  DB "_",0,FHEX
  DW RTCBUF+2
  DB ":",0,FHEX
  DW RTCBUF+1
  DB ":",0,0
  ld a,(RTCBUF)  ; the seconds
  and $7F        ; CH bit off
  call PRHEX     ; the seconds field
  ld a,(RTCBUF)  ; bit 7: halted
  rlca           ; CH, bit 7
  and 1
  ld (PRON),a
  ld a,(RTCBUF+7)
  rlca           ; bit 7:
                 ; write-protected
  and 1          ; WP, bit 7 of 8Fh
  ld (PROFF),a
  call FIELDS
  DB " ch=",0,FD8
  DW PRON
  DB " wp=",0,FD8
  DW PROFF
  DB 0,0
  jp ENDL

; INT: with MON3's user vectors at 0892h
; (IM 1) and 0894h (NMI) pointing here,
; turn on the VDP's frame interrupt for
; about 0.2 s and count both. PASS when
; IM 1 interrupts arrive; SKIP when the
; frames come only as NMIs. The vectors
; and the VDP's interrupt are put back.

INTCHK:
  ld hl,RINT
  call BEGIN
  ld a,(VDPOK)   ; no VDP: no source
  or a
  jr nz,IC1      ; a VDP is there
  call SKIPR
  DB "novdp",0
  ret

IC1:
  ld hl,(UINTV)  ; keep MON3's vectors
  ld (SAVINT),hl
  ld hl,(UNMIV)  ; kept for later
  ld (SAVNMI),hl
  xor a          ; none counted yet
  ld (INTCNT),a  ; kept for later
  ld (NMICNT),a  ; and no NMIs
  ld hl,INTH     ; ours instead
  ld (UINTV),hl  ; our IM 1 handler
  ld hl,NMIH
  ld (UNMIV),hl  ; our NMI handler
  im 1
  in a,(VDPC)    ; no flag pending
  ld a,$E0       ; R1: 16K, display, IE
  out (VDPC),a   ; R1's value
  ld a,$81
  out (VDPC),a   ; to register 1
  ei             ; interrupts on
  ld bc,30000    ; 26 T-states a turn

IC2:
  dec bc         ; about 0.2 s
  ld a,b
  or c           ; about 0.2 s of turns
  jr nz,IC2
  di             ; interrupts off
  ld a,$C0       ; R1 without IE
  out (VDPC),a   ; R1's value
  ld a,$81
  out (VDPC),a   ; to register 1
  in a,(VDPC)    ; no flag left
  ld hl,(SAVINT)
  ld (UINTV),hl  ; MON3's vectors back
  ld hl,(SAVNMI)
  ld (UNMIV),hl  ; NMI vector back
  ld a,(INTCNT)  ; IM 1 reached 0892h
  or a
  ld a,RPASS
  jr nz,IC4
  ld a,(NMICNT)  ; only NMIs came
  or a           ; NMIs came?
  jr nz,IC3
  ld a,RWARN     ; nothing came

IC4:
  call RESULT    ; PASS or WARN
  jr IC5

IC3:
  ld a,RSKIP     ; no IM 1 source
  call RESULT
  call PRI       ; no IM 1 source
  DB " reason=nmi-only",0

IC5:
  call FIELDS    ; both counts
  DB " int=",0,FD8
  DW INTCNT
  DB " nmi=",0,FD8
  DW NMICNT
  DB 0,0
  jp ENDL

; The handlers: read the VDP's status,
; which clears its interrupt, and count,
; stopping at FFh.

INTH:
  push af
  in a,(VDPC)    ; clear the interrupt
  ld a,(INTCNT)  ; the IM 1 count
  inc a
  jr z,IH1       ; already FFh
  ld (INTCNT),a  ; up to FFh

IH1:
  pop af
  ei             ; interrupts on again
  reti

NMIH:
  push af
  in a,(VDPC)    ; clear the interrupt
  ld a,(NMICNT)  ; the NMI count
  inc a
  jr z,NH1       ; already FFh
  ld (NMICNT),a  ; up to FFh

NH1:
  pop af
  retn           ; return from the NMI

; KEYS: echo keys until AD. Keypad keys
; come from MON3's scanKeys, matrix keys
; from port FEh with a row on each of
; A8-A15, 0 for a key down.

KEYCHK:
  ld hl,RKEY
  call BEGIN
  call NOTE
  DB "KEYS press keypad or matrix keys,"
  DB " AD ends",0
  call ENDL      ; the note's end
  ld hl,HKEYS    ; the hint on row 4
  ld a,LROW4
  call LCDROW    ; the hint
  ld hl,KMAP     ; no keys down
  ld b,8         ; eight rows

KC0:
  ld (hl),$FF    ; all up
  inc hl
  djnz KC0       ; eight rows
  xor a          ; none seen yet
  ld (NPAD),a
  ld (NMTX),a    ; and no matrix keys

KC1:
  call MTXSCAN   ; the matrix rows
  ld de,SEGBUF   ; one scan of the
  ld c,MSCANS    ; digits
  rst $10        ; the digits
  ld c,MSCANK    ; the keypad
  rst $10
  jr nz,KC1      ; no key
  jr nc,KC1      ; held from before
  cp KAD         ; AD: the end
  jr z,KC2       ; AD ends
  push af
  call NOTE      ; the key's line
  DB "KEY pad=",0
  pop af
  call PRHEX     ; its code
  call ENDL
  ld hl,NPAD     ; one more
  inc (hl)       ; one more key
  jr KC1

KC2:
  ld a,RPASS     ; the keys seen
  call RESULT    ; PASS
  call FIELDS
  DB " pad=",0,FD8
  DW NPAD
  DB " matrix=",0,FD8
  DW NMTX
  DB 0,0
  jp ENDL

; Scan the eight matrix rows and print a
; line for each key newly down: its row,
; bit and code, row x 8 + bit.

MTXSCAN:
  ld hl,KMAP     ; each row's last scan
  ld b,$FE       ; A8 low: row 0
  ld e,0         ; the row's number

MS1:
  ld c,MTXP      ; port FEh, row B
  in a,(c)       ; the row's keys
  ld c,a         ; the row now
  ld a,(hl)      ; the row before
  ld (hl),c      ; kept for next time
  ld d,a
  ld a,c         ; up before, down now
  cpl
  and d          ; print new ones
  call nz,MTXNEW
  inc hl         ; the next row
  inc e          ; the next row's number
  rlc b          ; its line low
  ld a,e
  cp 8
  jr nz,MS1      ; eight rows
  ret

; Print row E's new keys, the bits of A.
; Keeps BC, DE and HL.

MTXNEW:
  push bc        ; kept for the caller
  push de
  push hl
  ld c,a         ; the new keys
  ld b,0         ; the bit's number

MN1:
  srl c          ; the next bit
  jr nc,MN2      ; not down
  ld a,e         ; row x 8 + bit
  add a,a        ; x 8
  add a,a
  add a,a
  add a,b        ; + the bit
  ld (PROFF),a   ; the code
  ld a,e
  ld (PRON),a    ; the row
  ld a,b
  ld (PSAVE),a   ; the bit
  push bc
  push de
  call NOTE      ; the key's line
  DB "KEY matrix row=",0
  call FIELDS
  DB 0,FD8
  DW PRON
  DB " bit=",0,FD8
  DW PSAVE
  DB " code=",0,FD8
  DW PROFF
  DB 0,0
  call ENDL
  ld hl,NMTX     ; one more
  inc (hl)       ; one more key
  pop de
  pop bc

MN2:
  inc b          ; the next bit's number
  ld a,c         ; more new keys?
  or a
  jr nz,MN1      ; more bits set
  pop hl
  pop de
  pop bc
  ret            ; the caller's back

; RTC field limits in BCD (seconds,
; minutes, hours, date, month, day,
; year), the clock at 4 MHz, 5000 to
; round a rate, and the KEYS hint.

RTCLIM:   DB    $60,$60,$24,$32,$13,$08
  DB $A0
HZ4M:     DB    $00,$09,$3D,$00
HALF:     DB    $88,$13,0,0
HKEYS:    DB    "Keys echo, AD ends",0
