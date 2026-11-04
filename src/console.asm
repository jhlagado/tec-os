; Console: one device at a time, chosen
; by the IOBYTE CON: field.
;
; TTY: (0) serial terminal: keys and
; output on the serial port
; CRT: (1) PICO9918 screen and the
; matrix keyboard
; BAT: (2) CP/M batch: keys from the
; reader, the serial port; output to the
; list device, which discards it
; UC1: (3) GLCD screen and the matrix
; keyboard
;
; Cold boot takes CRT: before the banner
; when the PICO9918 answers and the
; matrix keyboard is fitted, and TTY:
; otherwise; GLCD.SVC's load takes UC1:.
; A
; program or the CCP's CON command may
; change the IOBYTE at any time; the
; next
; console call acts on it, clearing and
; homing the new screen. CRT: or UC1:
; without its display or keyboard falls
; back to the serial terminal. VWID and
; VHGT give the size of the console in
; use, 0 for the serial terminal.
;
; Serial is bit-banged at 4800 baud, 8
; data bits, no parity, 2 stop bits. TX
; is port 01h bit 6 (idle high), RX is
; port 03h bit 7. Reception has no
; hardware buffer, so a byte is caught
; only while one of these routines is
; polling. Reading port 00h first lets
; Debug80 start a queued input byte; on
; the board it reads the keypad encoder
; and has no effect. The delay counts
; (TXDLY, TXSTOP, RXHALF, RXDLY, RXPOLL)
; come from the generated configuration.
;
; The serial polling loops see a start
; bit up to 38 T-states late. RXHALF
; allows for half of that, so the
; samples land near the middle of each
; bit.

; Cold boot's console setup: the serial
; line idle, no byte waiting, the serial
; terminal in effect, the terminal's
; state cleared and the keyboard scan
; restarted at row 0 with no key held.
; CONDEV records the matrix keyboard if
; the board's switch enables it, and
; VIDINIT adds the PICO9918 if it
; answers.
; Destroys AF, B and HL.
CONINIT:
  ld a,$40       ; TX high: the line
                 ; idles at mark
  out (DIGPORT),a
  xor a          ; nothing received,
                 ; TTY:, normal video,
  ld (RXFULL),a  ; no cursor drawn, no
                 ; escape sequence
  ld (CONDEV),a
  ld (VATTR),a
  ld (VCURV),a
  ld (ESCST),a
  ld (CONMOD),a  ; CMTTY is 0
  ld (KBBASE),a  ; the scan starts at
                 ; key 0
  dec a          ; FFh: no key held or
                 ; seen
  ld (KBLAST),a  ; for the debounce and
                 ; for a scan's
  ld (KBE),a     ; last two keys
  ld (KBD),a
  ld a,$FE       ; select row 0, its bit
                 ; low
  ld (KBMASK),a
; the Matrix switch enables the keyboard
  in a,(STSPORT)
  and CDMTX
  ld (CONDEV),a  ; CDMTX or nothing
  jp VIDINIT     ; then look for the
                 ; PICO9918

; Act on a changed IOBYTE CON: field:
; one that isn't the mode in effect,
; since
; CONSW writes the mode it takes back
; into the field, the serial terminal
; for a
; display or keyboard that isn't there.
; Preserves BC and DE; destroys AF, HL.
CONSEL:
  ld a,(IOBYTE)
  and 3          ; the CON: field
  ld hl,CONMOD
  cp (hl)        ; unchanged: nothing to
                 ; do
  ret z
  push bc        ; kept for the BIOS
                 ; caller
  push de
  call CONSW     ; the new mode, A
  pop de
  pop bc
  ret

; Take console mode A (CMTTY to CMUC1).
; CRT: and UC1: need their driver's
; table in PIVEC or GLVEC: its vectors
; are copied to the terminal's, the
; geometry to VWID and VHGT, the scroll
; region reset, and, unless a program
; has claimed the display, the screen
; put back in its mode, cleared and the
; cursor homed. Without a table the
; serial terminal is taken. TTY: and
; BAT:
; set no geometry. The mode taken goes
; into CONMOD and the CON: field.
; Destroys AF, BC, DE, HL.
CONSW:
  ld b,a
  rrca           ; bit 0 set: a video
                 ; mode
  ld a,b
  jr nc,CONSW2
; CRT: or UC1:, its driver's table
  add a,LOW(PIVEC)-1
  ld l,a         ; 1 gives PIVEC, 3
                 ; GLVEC
  ld h,HIGH(PIVEC)
  ld a,(hl)      ; HL = the table, 0 if
                 ; none
  inc hl
  ld h,(hl)
  ld l,a
  or h           ; zero: no driver has
                 ; loaded
  jr nz,CONSWV   ; a driver is there
  jr CONSWT

CONSW2:
  cp CMBAT       ; BAT: stays BAT:, TTY:
                 ; is TTY:
  jr z,CONSWN

CONSWT:
  ld a,CMTTY     ; the serial terminal,
                 ; also the fallback

CONSWN:
  call CONMD
  ld hl,0        ; no screen geometry
  ld (VWID),hl   ; VWID and VHGT both 0
  ret

CONSWV:
  push bc        ; B = the video mode
  ld de,VPUTV    ; seven words: six
                 ; vectors and VFNV
  ld bc,14
  ldir           ; HL left on the
                 ; geometry
  ld e,(hl)      ; the table goes on
                 ; with columns, then
                 ; rows
  inc hl
  ld d,(hl)
  ld (VWID),de   ; VWID, then VHGT
  call VTREGR    ; the scroll region:
                 ; the new screen
  pop bc
  ld a,b         ; the mode, now in
                 ; effect
  call CONMD
  call VTOWN     ; NZ: a program owns
                 ; the PICO9918
  ret nz         ; selection must leave
                 ; a claimed display
                 ; alone
  call VREST     ; the display in its
                 ; mode before the clear
  xor a          ; cursor home, normal
                 ; video,
  ld (VROW),a    ; no escape sequence,
                 ; no cursor drawn
  ld (VCOL),a
  ld (VATTR),a
  ld (ESCST),a
  ld (VCURV),a
  jp VTCLS       ; a clear screen

; BIOS CONST: A = FFh if a character is
; ready, else 00h. With nothing ready
; on a video console the cursor is
; drawn, since a program that polls is
; waiting for a key; the next output
; removes it. The BDOS's own check for
; ^S
; during output uses BCONST, which draws
; nothing. Destroys F, BC, DE, HL.
BCONSTC:
  call BCONST
  or a           ; a character: no
                 ; cursor needed
  ret nz
  ld a,(CONMOD)
  rrca           ; bit 0 set: a video
                 ; console
  call c,CURSHOW
  xor a          ; not ready
  ret

; Console status without the cursor: A =
; FFh, NZ if a character is ready,
; else A = 0, Z. A byte found is held in
; RXCHAR with RXFULL set. On the
; serial port it listens for RXPOLL
; loops for a start bit. Acts first on a
; changed CON: field. Destroys BC, DE,
; HL.
BCONST:
  call CONSEL
  call VTFLIP    ; show the program the
                 ; screen it has drawn
  ld a,(RXFULL)  ; a byte already
                 ; waiting
  or a
  jr nz,CSTYES
  ld a,(CONMOD)
  rrca           ; bit 0 clear: TTY: or
                 ; BAT:, serial
  jr nc,CSTSER

CSTMX:
  call KBPOLL    ; a whole scan of the
                 ; matrix

CSTMXE:
  jr nz,CSTYES   ; NZ: a key, held in
                 ; RXCHAR
  xor a
  ret

CSTSER:
; lets Debug80 start a queued byte
  in a,(KEYPORT)
  ld e,RXPOLL    ; how long to listen

CSTPOLL:
  in a,(STSPORT)
  rlca           ; carry clear: RX low,
                 ; a start bit
  jr nc,CSTGOT
  dec e
  jr nz,CSTPOLL  ; listen again
  xor a          ; nothing came: not
                 ; ready
  ret

CSTGOT:
  call RXBITS

CSTRX:
  and $7F        ; seven bits for the
                 ; console
  ld e,RXPOLL    ; NUL: keep listening
                 ; for a byte behind it
  jr z,CSTPOLL
  ld (RXCHAR),a  ; held for CONIN
  ld a,$FF
  ld (RXFULL),a  ; FFh: a byte waits

CSTYES:
  ld a,$FF
  ret

; BIOS CONIN: wait for a character and
; return it in A with bit 7 clear.
; NUL is not delivered (Debug80 sends
; one ahead of its first input byte).
; Acts first on a changed CON: field.
; Destroys F, BC, DE, HL.
BCONIN:
  call CONSEL
  call VTFLIP    ; show the program the
                 ; screen it has drawn
  ld a,(RXFULL)  ; CONST may have caught
                 ; a byte
  or a
  jr nz,CINTAKE
  ld a,(CONMOD)
  rrca           ; bit 0 clear: serial
  jr nc,CINLP
  call CURSHOW   ; video: the cursor
                 ; shows while waiting

CINMX:
  call KBSTEP    ; scan the matrix a row
                 ; at a time

CINME:
  jr z,CINMX     ; Z: no new key yet
  call CINTAKE   ; the key KBSTEP held
  push af
  call CURHIDE   ; the cursor off before
                 ; returning
  pop af
  ret

; Return in A the byte held in RXCHAR.
; The rest of a keyboard arrow
; sequence (KBTN bytes in KBT1 and KBT2)
; moves up behind it and RXFULL stays
; set; with none left RXFULL is cleared.
; Destroys F.
CINTAKE:
  ld a,(KBTN)    ; bytes of an arrow
                 ; sequence still to
                 ; come
  or a
  jr nz,CINTAIL
  ld (RXFULL),a  ; the last byte:
                 ; nothing waits now
  ld a,(RXCHAR)  ; the byte itself
  ret

CINTAIL:
  dec a          ; deliver this byte,
                 ; move the next one up
  ld (KBTN),a
  ld a,(RXCHAR)
  push af        ; the byte delivered
                 ; now
  ld a,(KBT1)    ; KBT1 next, KBT2
                 ; behind it
  ld (RXCHAR),a
  ld a,(KBT2)
  ld (KBT1),a
  pop af         ; RXFULL stays set for
                 ; the rest
  ret

; Wait for a byte from the serial port
; (TTY: and BAT:), with no timeout, and
; return it in A with bit 7 clear; NUL
; is skipped. Destroys F, BC, D.
CINLP:
; lets Debug80 start a queued byte
  in a,(KEYPORT)
  in a,(STSPORT)
  rlca           ; carry set: RX high,
                 ; the line idle
  jr c,CINLP

CINWE:
  call RXBITS

CINRX:
  and $7F        ; seven bits; NUL is
                 ; waited past
  jr z,CINLP
  ret

; Receive the byte whose start bit has
; just been seen. Samples the middle of
; each data bit, least significant
; first, with interrupts off and then
; back
; as they were. Returns it in A;
; destroys F, BC, D.
RXBITS:
  call IFFGET    ; interrupts off for
                 ; the byte: 65 or 52
  push af        ; T-states of RXHALF's
                 ; allowance
  di
  ld d,RXHALF    ; on to the middle of
                 ; the start bit

RXH:
  dec d
  jr nz,RXH
  ld b,8         ; eight data bits

RXB:
  in a,(STSPORT)
  rlca           ; RX, bit 7, into carry
  rr c           ; and into C from the
                 ; top, so the first
  ld d,RXDLY     ; bit received ends in
                 ; bit 0

RXD:
  dec d          ; a bit's time to the
                 ; next middle
  jr nz,RXD
  djnz RXB
  pop af         ; P/V: the interrupt
                 ; state before
  ld a,c         ; the byte
  ret po         ; the flags kept:
                 ; interrupts as they
                 ; were
  ei
  ret

; BIOS CONOUT: send C to the serial port
; or the video terminal, by the
; console; BAT: discards it, as the list
; device does. Acts first on a changed
; CON: field. Destroys AF, BC, DE, HL.
BCONOUT:
  call CONSEL
  call VTOWN     ; a program owns the
                 ; PICO9918: drop the
                 ; output
  ret nz
  ld a,(CONMOD)
  rrca           ; bit 0: CRT: or UC1:
  jp c,VTOUT     ; CRT: or UC1:
  rrca           ; bit 1 alone: BAT:
  ret c          ; BAT: output goes to
                 ; the list device

BCOSER:
  ld a,c         ; TTY:, the serial port

; Send A on the serial port: a start
; bit, 8 data bits least significant
; first, two stop bits, with interrupts
; off and then back as they were. Each
; bit takes 49+16*TXDLY T-states.
; Destroys AF, B, DE.
TXBYTE:
  ld e,a         ; the byte, shifted out
                 ; from E
  call IFFGET    ; interrupts off for
                 ; the byte
  push af        ; P/V: the state to put
                 ; back
  di
  ld b,9         ; start bit, then 8
                 ; data bits
  or a           ; carry clear: the
                 ; start bit is low

TXB:
  sbc a,a        ; carry to 00h or FFh,
                 ; then
  and $40        ; bit 6, the TX line
  out (DIGPORT),a
  nop            ; pads the bit to
                 ; 49+16*TXDLY
  ld d,TXDLY

TXD:
  dec d          ; hold the bit
  jr nz,TXD
  rr e           ; the next data bit
                 ; into carry
  djnz TXB
  ld a,$40       ; two stop bits
  out (DIGPORT),a
  ld d,TXSTOP    ; held for both stop
                 ; bits' time

TXS:
  dec d
  jr nz,TXS
  pop af
  ret po         ; interrupts were off:
                 ; leave them so
  ei
  ret

; Print the zero-terminated string at HL
; on the console. Returns HL at the
; terminating zero. Destroys AF, BC, DE.
PUTS:
  ld a,(hl)
  or a           ; the zero ends it
  ret z
  push hl        ; CONOUT destroys HL
  ld c,a
  call BCONOUT
  pop hl
  inc hl         ; on to the next
                 ; character
  jr PUTS

; Print CR and LF on the console
; (PUTCRLF), or the character in A
; (PUTA).
; Destroys AF, BC, DE, HL.
PUTCRLF:
  ld a,13        ; CR, then LF by
                 ; falling into PUTA
  call PUTA
  ld a,10        ; LF

PUTA:
  ld c,a         ; CONOUT takes it in C
  jp BCONOUT

; Print A as two hex digits on the
; console (PUTHEX), or through the
; routine at
; HL, which takes each digit in A and
; may destroy any register (HEXHL); the
; CCP's CPHEX prints through BDOS
; function 2 so. Destroys AF, BCDE, HL.
PUTHEX:
  ld hl,PUTA     ; the console, by the
                 ; BIOS

HEXHL:
  push af
  rrca           ; the high digit first
  rrca
  rrca
  rrca
  push hl        ; the output, which may
                 ; destroy it
  call HEXNIB
  pop hl
  pop af         ; then the low

HEXNIB:
  and $0F
  add a,$90      ; 0-9 to 90h-99h, A-F
                 ; to 00h-05h
  daa
  adc a,$40      ; then '0'-'9' or
                 ; 'A'-'F'
  daa
  jp (hl)        ; the output takes it
                 ; and returns

; The list device is not fitted: its
; output is discarded and it reports
; ready.
; Punch and reader are the serial port,
; and BREADER waits for a byte with no
; timeout. BLIST changes nothing;
; BLISTST returns A = FFh.
BLIST:
  ret

BLISTST:
  ld a,$FF       ; always ready
  ret

; BIOS PUNCH and READER are the serial
; port, eight bits, whatever the console
; routing. A byte the console has
; already taken stays with the console.
; PUNCH sends C and destroys AF, B, DE;
; READER returns the byte in A and
; destroys F, BC, D.
BPUNCH:
  ld a,c         ; TXBYTE sends A
  jp TXBYTE

BREADER:
BRDWT:
; lets Debug80 start a queued byte
  in a,(KEYPORT)
  in a,(STSPORT)
  rlca           ; carry set: RX high,
                 ; no start bit
  jr c,BRDWT
  call RXBITS    ; all eight bits kept

BRDRX:
  ret

; A, the mode taken, in effect: CONMOD,
; and the IOBYTE's CON: field, so that a
; driver or program reads the console in
; use there. Returns B = A. Destroys AF.
CONMD:
  ld (CONMOD),a
  ld b,a         ; then into the IOBYTE
; Put B, a console mode, in the IOBYTE's
; CON: field. Keeps B. Destroys AF.
CONFLD:
  ld a,(IOBYTE)
  and $FC        ; the other devices'
                 ; fields kept
  or b           ; the mode in CON:,
                 ; bits 0-1
  ld (IOBYTE),a
  ret
