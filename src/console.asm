; IOBYTE CON bits select TTY serial I/O,
; CRT PICO/matrix, BAT serial input with
; discarded output or UC1 GLCD/matrix.
; Cold PICO selection requires CDMTX
; enable and a successful probe. Loading
; GLCD retains active CRT. Console calls
; apply later route changes, falling
; back to TTY if the selected driver
; table is absent.
; Serial design: 4800 baud, eight data
; bits, no parity and two stop bits. TX
; uses DIGPORT bit 6, RX STSPORT bit 7.
; Receive polling alone samples input.
; KEYPORT reads prime queued emulator
; input. Build-generated delays assume
; nominal clock timing. The 38-T
; start-detection allowance is not a
; measured physical bound.

; Cold setup requires cleared workspace
; and disabled maskable interrupts. Set
; TX idle high. RXFULL, VATTR/VCURV,
; ESCST/CONMOD and KBBASE keep the zero
; of that cleared workspace.
; Initialise last-key bytes to FFh and
; row mask FEh. Take matrix enable from
; CDMTX and tail-enter VIDINIT. Geometry
; and effective routing follow later
; selection. Changes AF/BC/DE/HL,
; including PISTART's effects.

CONINIT:
  ld a,$40
  out (DIGPORT),a
  ld a,$FF       ; no last key
  ld (KBLAST),a
  ld (KBE),a
  ld (KBD),a
  ld a,$FE
  ld (KBMASK),a

  in a,(STSPORT)
  and CDMTX
  ld (CONDEV),a
  jp VIDINIT

; Apply IOBYTE CON bits if they differ
; from CONMOD. Preserve BC/DE around
; CONSW and write back the effective
; mode. Changes AF/HL. Queued RXCHAR and
; arrow-tail input survive a route
; change.

CONSEL:
  ld a,(IOBYTE)
  and 3
  ld hl,CONMOD
  cp (hl)
  ret z
  push bc
  push de
  call CONSW
  pop de
  pop bc
  ret

; Select valid A=0..3. CRT/UC1 need
; their adjacent PIVEC/GLVEC table,
; otherwise fall back to TTY. BAT
; remains BAT. Nonvideo modes clear
; geometry and publish the effective
; mode. Video modes enter CONSWV.
; Changes AF/BC/DE/HL and driver state.

CONSW:
  ld b,a
  rrca
  ld a,b
  jr c,CONSWO    ; CRT/UC1: a table?
  cp CMBAT
  jr z,CONSWN

CONSWT:
  ld a,CMTTY

CONSWN:
  call CONMD
  ld hl,0
  ld (VWID),hl
  ret

CONSWO:
  add a,LOW(PIVEC)-1
  ld l,a         ; 1: PIVEC, 3: GLVEC
  ld h,HIGH(PIVEC)
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a         ; HL = the table
  or h
  jr z,CONSWT    ; none: TTY

; Copy seven vector words VPUTV..VFNV
; and geometry. Reset region and publish
; mode before testing VTOWN. Claimed CRT
; skips only the later restore/clear
; steps. Otherwise restore video, home,
; reset attributes/escape/cursor state
; and clear the screen.

CONSWV:
  push bc
  ld de,VPUTV
  ld bc,14
  ldir
  ld e,(hl)
  inc hl
  ld d,(hl)
  ld (VWID),de
  call VTREGR
  pop bc
  ld a,b
  call CONMD
  call VTOWN
  ret nz
  call VREST
  xor a
  ld (VROW),a
  ld (VCOL),a
  ld (VATTR),a
  ld (ESCST),a
  ld (VCURV),a
  jp VTCLS

; Return BCONST's ready FFh/NZ. If none
; is ready, show the video cursor where
; ownership permits and return zero/Z.
; BDOS pause polling uses BCONST without
; this cursor step.

BCONSTC:
  call BCONST
  or a
  ret nz
  ld a,(CONMOD)
  rrca
  call c,CURSHOW
  xor a
  ret

; Poll effective console input after
; CONSEL and VTFLIP. Return FFh/NZ for
; pending input or a newly polled key,
; zero/Z otherwise. RXFULL takes
; priority over the selected device.
; Changes AF/BC/DE/HL.

BCONST:
  call CONSEL
  call VTFLIP
  ld a,(RXFULL)
  or a
  jr nz,CSTYES
  ld a,(CONMOD)
  rrca
  jr nc,CSTSER

CSTMX:
  call KBPOLL

CSTMXE:
  jr nz,CSTYES
  xor a
  ret

; Prime KEYPORT and poll RX low for one
; RXPOLL window. No start returns
; zero/Z. A received NUL restarts the
; window, so NUL streams can extend the
; call indefinitely. KBDELIV stores
; other seven-bit characters in
; RXCHAR/RXFULL and returns FFh/NZ.

CSTSER:

  in a,(KEYPORT)
  ld e,RXPOLL

CSTPOLL:
  in a,(STSPORT)
  rlca
  jr nc,CSTGOT
  dec e
  jr nz,CSTPOLL
  xor a
  ret

CSTGOT:
  call RXBITS

CSTRX:
  and $7F
  ld e,RXPOLL
  jr z,CSTPOLL
  jp KBDELIV     ; pending: A=FFh/NZ

CSTYES:
  ld a,$FF
  ret

; Read effective console input after
; CONSEL and VTFLIP. Pending input
; enters CINTAKE directly. Otherwise
; wait on serial or show the video
; cursor and poll KBSTEP. Save the
; returned character across CURHIDE. The
; pending-input path has no explicit
; CURHIDE. Changes AF/BC/DE/HL.

BCONIN:
  call CONSEL
  call VTFLIP
  ld a,(RXFULL)
  or a
  jr nz,CINTAKE
  ld a,(CONMOD)
  rrca
  jr nc,CINLP
  call CURSHOW

CINMX:
  call KBSTEP

CINME:
  jr z,CINMX
  call CINTAKE
  push af
  call CURHIDE
  pop af
  ret

; Take the pending RXCHAR in A. With no
; arrow tail, clear RXFULL. Otherwise
; shift KBT1/KBT2, decrement KBTN and
; leave RXFULL set for the next byte.
; Preserve BC/DE/HL. F changes.

CINTAKE:
  ld a,(KBTN)
  or a
  jr nz,CINTAIL
  ld (RXFULL),a
  ld a,(RXCHAR)
  ret

CINTAIL:
  dec a
  ld (KBTN),a
  ld a,(RXCHAR)
  push af
  ld a,(KBT1)
  ld (RXCHAR),a
  ld a,(KBT2)
  ld (KBT1),a
  pop af
  ret

; Prime KEYPORT, then wait without
; timeout for serial input. Receive
; seven-bit characters and discard NULs.
; Return a nonzero character in A.
; Changes F/BC/D, preserving E/HL
; locally.

CINLP:

  in a,(KEYPORT)
  in a,(STSPORT)
  rlca
  jr c,CINLP

CINWE:
  call RXBITS

CINRX:
  and $7F
  jr z,CINLP
  ret

; Receive after a detected low start
; bit. Sample maskable IFF through
; IFFGET/PV, disable interrupts and
; restore that sampled state on return.
; Sample eight LSB-first bits into C and
; return the raw byte in A. Changes
; F/BC/D. No stop-bit or framing check
; is performed. RXHALF includes the
; 65/52-T setup allowance and targets
; the bit-0 midpoint.

RXBITS:
  call IFFGET
  push af
  di
  ld d,RXHALF

RXH:
  dec d
  jr nz,RXH
  ld b,8

RXB:
  in a,(STSPORT)
  rlca
  rr c
  ld d,RXDLY

RXD:
  dec d
  jr nz,RXD
  djnz RXB
  pop af
  ld a,c
  ret po
  ei
  ret

; Output C after applying the route.
; Drop output for claimed CRT or BAT.
; Dispatch other video output through
; VTOUT, and TTY through TXBYTE. Changes
; AF/BC/DE/HL and driver state.

BCONOUT:
  call CONSEL
  call VTOWN
  ret nz
  ld a,(CONMOD)
  rrca
  jp c,VTOUT
  rrca
  ret c

BCOSER:
  ld a,c

; Transmit raw A as 8N2, saving the byte
; before IFFGET. Disable maskable
; interrupts and restore the sampled IFF
; state afterwards. Changes AF/B/DE.
; Without wait states, continuing data
; intervals take 49+16*TXDLY T-states.
; The final data-to-stop interval takes
; 40+16*TXDLY. TXSTOP supplies the stop
; delay. These are static timing
; assumptions.

TXBYTE:
  ld e,a
  call IFFGET
  push af
  di
  ld b,9
  or a

TXB:
  sbc a,a
  and $40
  out (DIGPORT),a
  nop            ; pads continuing bit
  ld d,TXDLY

TXD:
  dec d
  jr nz,TXD
  rr e
  djnz TXB
  ld a,$40
  out (DIGPORT),a
  ld d,TXSTOP

TXS:
  dec d
  jr nz,TXS
  pop af
  ret po
  ei
  ret

; Print the zero-ended string at HL.
; Save HL across each BCONOUT. Return HL
; at the zero byte. Changes AF/BC/DE.

PUTS:
  ld a,(hl)
  or a
  ret z
  push hl
  ld c,a
  call BCONOUT
  pop hl
  inc hl
  jr PUTS

; Print CR then LF through PUTA. PUTA
; passes A to BCONOUT as C. Changes
; AF/BC/DE/HL.

PUTCRLF:
  ld a,13
  call PUTA
  ld a,10

PUTA:
  ld c,a
  jr BCONOUT

; PUTHEX prints A as two uppercase hex
; digits through PUTA. HEXHL takes A and
; an HL callback. Save the byte and
; callback across the high digit, then
; tail-enter the callback for the low
; digit. The callback may change
; AF/BC/DE/HL.

PUTHEX:
  ld hl,PUTA

HEXHL:
  push af
  rrca
  rrca
  rrca
  rrca
  push hl
  call HEXNIB
  pop hl
  pop af

HEXNIB:
  and $0F
  add a,$90
  daa
  adc a,$40
  daa
  jp (hl)

; No list device is attached. BLIST
; discards output without register
; changes. BLISTST returns A=FFh without
; setting a ready Z/NZ result.

BLIST:
  ret

BLISTST:
  ld a,$FF
  ret

; Raw punch/reader bypass console
; routing and the pending-input queue.
; BPUNCH sends all eight bits of C
; through TXBYTE. BREADER primes KEYPORT
; and waits indefinitely for a start
; bit, then returns RXBITS' raw A,
; including NUL/high-bit bytes. Punch
; changes AF/B/DE, reader F/BC/D.

BPUNCH:
  ld a,c
  jr TXBYTE

BREADER:

BRDWT:

  in a,(KEYPORT)
  in a,(STSPORT)
  rlca
  jr c,BRDWT
  call RXBITS

BRDRX:
  ret

; Store valid A=0..3 in CONMOD and pass
; it in B to CONFLD. B retains the mode.
; A/F change. Returned A includes the
; higher IOBYTE fields.

CONMD:
  ld (CONMOD),a
  ld b,a

; Set IOBYTE CON bits from valid B=0..3.
; Preserve higher fields and B. Change
; AF. Arbitrary B values are not
; validated.

CONFLD:
  ld a,(IOBYTE)
  and $FC
  or b
  ld (IOBYTE),a
  ret
