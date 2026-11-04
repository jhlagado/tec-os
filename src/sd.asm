; SD card block driver: SPI mode,
; bit-banged on port FDh.
;
; Port bits out: 0 MOSI, 1 CLK, 2 /CS.
; In: bit 7 MISO. Data changes while CLK
; is low and the card samples on the
; rising edge. Every wait is bounded.
; Routines return Z on success; on
; failure NZ and A holds an SDE* code,
; also
; kept in SDERR.

SDIDLE EQU $05   ; /CS high, MOSI high,
                 ; CLK low

SDENOCD EQU 1    ; no response to CMD0
SDEINIT EQU 2    ; ACMD41 never ready,
                 ; or CMD55 refused
SDEOCR EQU 3     ; CMD58 failed
SDEBLEN EQU 4    ; CMD16 failed
SDECMD EQU 5     ; read or write command
                 ; rejected
SDETOK EQU 6     ; no data token
SDEWRSP EQU 7    ; write not accepted
SDEBUSY EQU 8    ; card stayed busy
SDERNG EQU 9     ; a standard card's
                 ; block past its 4 GiB
SDEDTOK EQU 10   ; a data error token in
                 ; place of the data
SDEVOLT EQU 11   ; CMD8's echo wrong:
                 ; voltage or pattern

; Send the byte in C to the card, most
; significant bit first. Selects the
; card: every write to SDIO here has /CS
; (bit 2) low. Takes C; returns C
; unchanged, as eight RLCs bring it
; round, and CLK left high. Destroys AF,
; B.
SPIW:
  ld b,8         ; eight bits

SPIWB:
  xor a          ; /CS low, CLK low,
                 ; MOSI 0 so far
  rlc c          ; next bit, top first,
                 ; to carry
  rla            ; and into bit 0, MOSI
  out (SDIO),a   ; data out while CLK is
                 ; low
  or 2           ; bit 1, CLK, high:
  out (SDIO),a   ; the card samples MOSI
                 ; on this edge
  djnz SPIWB
  ret

; Receive a byte from the card, sending
; FFh (MOSI held high), with /CS low.
; Returns the byte in A, CLK left low.
; Destroys F, B, E.
SPIR:
  ld b,8         ; eight bits

SPIRB:
  ld a,1         ; MOSI high, CLK low,
                 ; /CS low
  out (SDIO),a   ; the card shifts its
                 ; next bit out
  ld a,3         ; the same with CLK
                 ; high:
  out (SDIO),a   ; the bit is valid
                 ; after the rise
  in a,(SDIO)    ; MISO is bit 7
  rla            ; to carry,
  rl e           ; and into E, top bit
                 ; first
  djnz SPIRB
  ld a,1         ; finish with CLK low
  out (SDIO),a
  ld a,e         ; the byte received
  ret

; Deselect the card, then give it eight
; clocks with /CS high so that it
; lets go of MISO. Keeps every register,
; so a command's R1 in A and its
; flags pass through.
SPIEND:
  push af
  push bc
  ld b,8         ; eight clocks, one
                 ; byte's worth

SPIEB:
  ld a,SDIDLE+2  ; /CS high, MOSI high,
                 ; CLK high
  out (SDIO),a
  ld a,SDIDLE    ; and CLK low again
  out (SDIO),a
  djnz SPIEB
  pop bc         ; the caller's
                 ; registers back,
  pop af         ; R1 and flags included
  ret

; Send command A (its index, 0-63) with
; the 32-bit argument in SDARG and
; return its R1 response in A: 00h
; ready, bit 0 in the idle state, bit 2
; an illegal command; bit 7 is always
; clear. A with bit 7 set (FFh from an
; absent card) means no R1 came within
; 16 bytes. Leaves /CS low so that
; the caller can read the rest of a
; longer response. Destroys F, BC, DE,
; HL.
SDCMD:
  ld d,a         ; D keeps the index
  ld c,$FF       ; one idle byte first,
                 ; card selected
  call SPIW
  ld a,d         ; first byte: 01 then
                 ; the index,
  or $40         ; start bit 0,
                 ; transmission bit 1
  ld c,a
  call SPIW
  ld hl,SDARG    ; the argument, most
                 ; significant byte
                 ; first
  ld c,(hl)      ; bits 31-24
  call SPIW
  inc hl
  ld c,(hl)      ; bits 23-16
  call SPIW
  inc hl
  ld c,(hl)      ; bits 15-8
  call SPIW
  inc hl
  ld c,(hl)      ; bits 7-0
  call SPIW
; Last byte: CRC7 and the end bit. The
; card
; checks it only for CMD0 and CMD8 in
; SPI mode.
  ld c,$95       ; valid CRC for CMD0
  ld a,d
  or a           ; CMD0?
  jr z,SDCRC
  ld c,$87       ; valid CRC for CMD8
                 ; with argument 1AAh
  cp 8           ; CMD8?
  jr z,SDCRC
  ld c,$01       ; any other: no CRC,
                 ; just the end bit

SDCRC:
  call SPIW
  ld d,16        ; poll up to 16 bytes
                 ; for R1

SDR1:
  call SPIR
  bit 7,a        ; R1 has bit 7 clear;
                 ; FFh is idle line
  ret z          ; the response
  dec d
  jr nz,SDR1     ; not yet: read again
  ret            ; none: A has bit 7 set

; Set SDARG to the 32-bit value DEHL,
; stored big-endian as the card takes
; it: D first. Destroys A; the flags are
; kept.
SETARG:
  ld a,d         ; bits 31-24
  ld (SDARG),a
  ld a,e         ; bits 23-16
  ld (SDARG+1),a
  ld a,h         ; bits 15-8
  ld (SDARG+2),a
  ld a,l         ; bits 7-0
  ld (SDARG+3),a
  ret

; Run command A with argument DEHL and
; deselect the card, for commands whose
; response is R1 alone. Returns R1 in A,
; as SDCMD. Destroys F, BC, DE, HL.
SDCMDX:
  push af        ; SETARG uses A
  call SETARG
  pop af
  call SDCMD     ; R1 in A,
  jr SPIEND      ; which SPIEND keeps

; Start the card in SPI mode and make it
; ready for 512-byte block I/O:
; CMD0 to reset it, CMD8 for a version 2
; card (its echo checked), CMD55
; and ACMD41 until it is ready, then
; CMD58 to find whether it takes block
; or byte addresses, and CMD16 to fix a
; byte-addressed card's block at 512.
; Sets SDBYTE, SDERR and SDARG.
; Returns Z and A = 0 when ready; NZ and
; A = an SDE* code if not. Destroys
; F, BC, DE, HL.
SDINIT:
  xor a          ; block addresses until
                 ; CMD58 says
  ld (SDBYTE),a  ; otherwise
  ld a,SDIDLE    ; deselect: /CS high,
                 ; CLK low
  out (SDIO),a
  ld d,10        ; CMD0 attempts

SDI0:
  push de
  ld b,80        ; at least 74 clocks
                 ; with /CS high

SDICK:
  ld a,SDIDLE+2  ; the power-up clocks
                 ; the card needs
  out (SDIO),a   ; before its first
                 ; command
  ld a,SDIDLE
  out (SDIO),a
  djnz SDICK
  ld de,0        ; CMD0, GO_IDLE_STATE,
                 ; argument 0:
  ld hl,0        ; with /CS low it puts
                 ; the card into
  xor a          ; SPI mode
  call SDCMDX
  pop de
  cp 1           ; R1 01h: idle, as a
                 ; reset card is
  jr z,SDI8
  dec d
  jr nz,SDI0     ; try again, clocks
                 ; first
  ld a,SDENOCD   ; no card, or one that
                 ; never answered
  jp SDFAIL

SDI8:
  ld de,0        ; CMD8: 2.7-3.6 V,
                 ; check pattern AAh
  ld hl,$01AA    ; (SEND_IF_COND,
                 ; version 2 cards only)
  call SETARG
  ld a,8
  call SDCMD
  cp 1           ; idle, no error: a
                 ; version 2 card
  jr nz,SDI8X    ; version 1 card: no R7
                 ; payload
  call SPIR      ; R7 bytes 1 and 2: the
                 ; command
  call SPIR      ; version and reserved
                 ; bits, not needed
  call SPIR      ; byte 3: the voltage
                 ; the card accepts,
  and $0F        ; in its low four bits
  cp 1           ; 1: 2.7-3.6 V, the
                 ; range asked for
  jr nz,SDI8F
  call SPIR      ; byte 4: the check
                 ; pattern echoed
  cp $AA
  jr z,SDI8X     ; AAh: the card took
                 ; CMD8 as sent

SDI8F:
  call SPIEND    ; a wrong echo: a card
                 ; this board can't
  ld a,SDEVOLT   ; power, or that
                 ; misread the command
  jr SDFAIL

SDI8X:
  call SPIEND    ; deselect after CMD8
                 ; either way
  ld c,0         ; ACMD41 attempts, 256

SDI41:
  push bc
  ld de,0        ; CMD55, APP_CMD: the
                 ; next command is
  ld hl,0        ; an application
                 ; command
  ld a,55
  call SDCMDX
  and $FE        ; R1 00h, or 01h idle:
                 ; any other bit is an
  jr nz,SDI55F   ; error, and no ACMD41
                 ; can follow
  ld de,$4000    ; HCS: host supports
                 ; high capacity
  ld hl,0        ; (argument bit 30)
  ld a,41        ; ACMD41,
                 ; SD_SEND_OP_COND:
                 ; start the
  call SDCMDX    ; card's initialisation
  pop bc
  or a           ; R1 00h: initialised,
                 ; out of idle
  jr z,SDI58
  ld b,0         ; short pause between
                 ; attempts

SDI41W:
  djnz SDI41W    ; (256 turns of the
                 ; loop)
  dec c
  jr nz,SDI41    ; still idle: ask again
  jr SDI41F      ; never left the idle
                 ; state

SDI55F:
  pop bc         ; CMD55 refused: the
                 ; count off the stack

SDI41F:
  ld a,SDEINIT   ; no initialisation
  jr SDFAIL

SDI58:
  ld de,0        ; CMD58, READ_OCR,
                 ; argument 0
  ld hl,0
  call SETARG
  ld a,58
  call SDCMD     ; R3: R1, then the
                 ; 32-bit OCR
  or a           ; R1 must be 00h
  jr nz,SDI58F
  call SPIR      ; OCR byte 0: bit 6 is
                 ; CCS
  push af
  call SPIR      ; OCR bits 23-0: the
                 ; voltage window,
  call SPIR      ; not needed
  call SPIR
  call SPIEND
  pop af         ; OCR bits 31-24 again
  bit 6,a        ; CCS: card capacity
                 ; status
  jr nz,SDIOK    ; high capacity: block
                 ; addresses
  ld a,1         ; standard capacity:
                 ; the card takes
  ld (SDBYTE),a  ; byte addresses
                 ; (LBAARG converts)
  ld de,0        ; CMD16, SET_BLOCKLEN,
                 ; 512 bytes
  ld hl,512
  ld a,16
  call SDCMDX
  or a           ; R1 00h: block length
                 ; set
  jr z,SDIOK
  ld a,SDEBLEN
  jr SDFAIL

SDI58F:
  call SPIEND    ; CMD58 refused:
                 ; deselect
  ld a,SDEOCR    ; and fail through
                 ; SDFAIL

; Fail with the SDE* code in A, which is
; never 0: keep it in SDERR and
; return NZ with it in A. The common
; exit of every routine here.
SDFAIL:
  ld (SDERR),a
  or a           ; NZ
  ret

; Succeed: clear SDERR and return Z with
; A = 0.
SDIOK:
  xor a          ; A = 0, Z, carry clear
  ld (SDERR),a
  ret

; Load SDARG from SDLBA, converting to a
; byte address for standard-capacity
; cards. Carry, and SDARG unchanged, for
; a standard card's block at 800000h
; or above, whose byte address would
; lose its top bits and name a lower
; block
; (KE-151). Destroys AF, DE, HL.
LBAARG:
  ld hl,(SDLBA)  ; SDLBA is
                 ; little-endian: bits
                 ; 15-0
; and bits 31-16
  ld de,(SDLBA+2)
  ld a,(SDBYTE)
  or a           ; 0: the card takes
                 ; block numbers
  jp z,SETARG    ; block addressing:
                 ; carry clear
  ld a,d         ; bits 24-31 of the
                 ; block
  or a
  scf
  ret nz         ; past 4 GiB: refused
  bit 7,e        ; bit 23
  scf
  ret nz         ; and so is this
  ld d,e         ; DEHL = LBA << 8
  ld e,h
  ld h,l
  ld l,0
  add hl,hl      ; << 1 more, carrying
                 ; into DE
  ex de,hl       ; (bit 23 was clear, so
                 ; nothing
  adc hl,hl      ; carries out: carry
                 ; clear)
  ex de,hl
  jp SETARG      ; DEHL = LBA * 512

; Read block SDLBA into the 512 bytes at
; HL (CMD17), a cache line in
; EXPAND 1 when SDXB is LATEXP. Returns
; Z and A = 0, or NZ and A = SDERNG,
; SDECMD, SDETOK or SDEDTOK, also in
; SDERR. Destroys F, BC, DE, HL, I.
SDREAD:
  push hl        ; the buffer, across
                 ; the command
  call LBAARG
  jr c,SDRNG     ; no command for a
                 ; block it can't name
  ld a,17        ; CMD17,
                 ; READ_SINGLE_BLOCK
  call SDCMD
  pop hl
  or a           ; R1 00h: accepted
  jr nz,SDRCMD
  ld c,0         ; token wait: 65536
                 ; polls
  ld d,0         ; (C inner, D outer)

SDRTOK:
  push de        ; SPIR destroys E
  call SPIR
  pop de
  cp $FE         ; the start block
                 ; token; FFh while
  jr z,SDRDAT    ; the card reads
  inc a          ; any other byte is a
                 ; data error
  jr nz,SDRERR   ; token, 000xxxxx: no
                 ; data follows
  dec c
  jr nz,SDRTOK
  dec d
  jr nz,SDRTOK
  call SPIEND    ; no token in time
  ld a,SDETOK
  jr SDFAIL

SDRERR:
  call SPIEND    ; the card refused the
                 ; read
  ld a,SDEDTOK
  jr SDFAIL

SDRDAT:
  call SDRBLK    ; the 512 data bytes
  call SPIR      ; CRC, not checked
  call SPIR
  call SPIEND
  jr SDIOK

; Fail with SDECMD after the card
; rejected CMD17 or CMD24: deselect it
; first. Jumped to from SDREAD and
; SDWRITE, with the buffer popped.
SDRCMD:
  call SPIEND    ; /CS high: the card is
                 ; left idle
  ld a,SDECMD
  jr SDFAIL

; Fail with SDERNG, from SDREAD or
; SDWRITE when LBAARG refuses the block:
; the buffer's address is still on the
; stack, and the card is untouched.
SDRNG:
  pop hl         ; the buffer's address
  ld a,SDERNG    ; refused before any
                 ; command
  jr SDFAIL

; Receive 512 bytes into the buffer at
; HL, sending FFh, after the start
; token; HL ends 512 bytes on. /CS low
; and CLK low on entry and on return.
; Two bytes a pass, each bit unrolled; I
; counts the 256 passes. Destroys AF,
; BC, DE, I.
SDRBLK:
  ld a,(SDXB)    ; LATEXP: the buffer is
                 ; a cache line, and
  ld b,a         ; EXPAND 1 is in view
                 ; for the loop, which
  ld a,(LATCHV)  ; uses no stack
  or b           ; (SDXB 0: the latch as
                 ; it was)
  out (SYSLAT),a
  ld c,SDIO      ; for OUT (C) and IN
                 ; (C)
  ld de,$0103    ; D: CLK low, E: CLK
                 ; high; MOSI high, /CS
                 ; low
  xor a          ; I = 0: 256 passes
  ld i,a         ; (I, as the stack may
                 ; be out of view)

SDRB2:
  out (c),d      ; bit 7: CLK low, the
                 ; card shifts it out
  out (c),e      ; and high again
  in a,(c)       ; MISO, in bit 7, to
                 ; carry
  rla
  rl b           ; and into B, top bit
                 ; first
  out (c),d      ; bit 6
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 5
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 4
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 3
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 2
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 1
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 0
  out (c),e
  in a,(c)
  rla
  rl b           ; B is the pass's first
                 ; byte
  ld (hl),b
  inc hl
  out (c),d      ; second byte: bit 7
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 6
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 5
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 4
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 3
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 2
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 1
  out (c),e
  in a,(c)
  rla
  rl b
  out (c),d      ; bit 0
  out (c),e
  in a,(c)
  rla
  rl b           ; B is the second byte
  ld (hl),b
  inc hl
  ld a,i         ; count the pass in I
  dec a
  ld i,a
  jp nz,SDRB2    ; Z from DEC A: 256
                 ; passes done
  out (c),d      ; leave CLK low
  ld a,(LATCHV)  ; the latch as it was:
                 ; EXPAND 1 out
; of view again if it was brought in
  out (SYSLAT),a
  ret

; Send the 512 bytes at HL after the
; start token; HL ends 512 bytes on.
; /CS low on entry (CLK may be high, as
; SPIW leaves it); CLK low on return.
; Each bit unrolled; MOSI changes with
; CLK low. Destroys AF, BC, DE.
SDWBLK:
  ld a,(SDXB)    ; as SDRBLK
  ld b,a
  ld a,(LATCHV)
  or b           ; EXPAND 1 in view for
                 ; a cache line
  out (SYSLAT),a
  ld c,SDIO      ; for OUT (C)
  ld de,$0200    ; 2 passes of 256 bytes

SDWB2:
  ld b,(hl)      ; the next byte
  xor a          ; bit 7: /CS low, CLK
                 ; low
  rl b           ; the bit to carry
  rla            ; and on to MOSI
  out (c),a
  or 2           ; CLK high: the card
                 ; takes it
  out (c),a
  xor a          ; bit 6
  rl b
  rla
  out (c),a
  or 2           ; CLK high
  out (c),a
  xor a          ; bit 5
  rl b
  rla
  out (c),a
  or 2           ; CLK high
  out (c),a
  xor a          ; bit 4
  rl b
  rla
  out (c),a
  or 2           ; CLK high
  out (c),a
  xor a          ; bit 3
  rl b
  rla
  out (c),a
  or 2           ; CLK high
  out (c),a
  xor a          ; bit 2
  rl b
  rla
  out (c),a
  or 2           ; CLK high
  out (c),a
  xor a          ; bit 1
  rl b
  rla
  out (c),a
  or 2           ; CLK high
  out (c),a
  xor a          ; bit 0
  rl b
  rla
  out (c),a
  or 2           ; CLK high
  out (c),a
  inc hl
  dec e          ; 256 bytes a pass
  jp nz,SDWB2
  dec d          ; then the second pass
  jp nz,SDWB2
  and $FD        ; CLK low
  out (c),a
  ld a,(LATCHV)  ; the latch as it was
  out (SYSLAT),a
  ret

; Write the 512 bytes at HL to block
; SDLBA (CMD24), waiting until the card
; has finished programming; the buffer
; is a cache line in EXPAND 1 when SDXB
; is LATEXP. Returns Z and A = 0, or NZ
; and A = SDERNG, SDECMD, SDEWRSP or
; SDEBUSY, also in SDERR. Destroys F,
; BC, DE, HL.
SDWRITE:
  push hl        ; the buffer, across
                 ; the command
  call LBAARG
  jp c,SDRNG     ; nothing written for a
                 ; block it can't name
  ld a,24        ; CMD24, WRITE_BLOCK
  call SDCMD
  pop hl
  or a           ; R1 00h: accepted
  jp nz,SDRCMD
  ld c,$FF       ; one idle byte, then
                 ; the start token
  call SPIW
  ld c,$FE       ; FEh: a single block's
                 ; data follows
  call SPIW
  call SDWBLK
  ld c,$FF       ; CRC, ignored in SPI
                 ; mode
  call SPIW      ; (C comes back FFh for
                 ; the
  call SPIW      ; second byte)
  ld d,16        ; data response token

SDWRS:
  push de        ; SPIR destroys E
  call SPIR
  pop de
  cp $FF         ; FFh until the token
                 ; comes
  jr nz,SDWRG
  dec d
  jr nz,SDWRS

SDWRG:
  and $1F        ; token xxx0sss1: sss
                 ; 010 accepted,
  cp $05         ; 101 CRC error, 110
                 ; write error
  jr z,SDWBSY
  call SPIEND    ; rejected, or no token
                 ; at all
  ld a,SDEWRSP
  jp SDFAIL

SDWBSY:
  ld c,0         ; busy while the card
                 ; returns 00h
  ld d,0         ; (holding MISO low):
                 ; 65536 polls

SDWB:
  push de
  call SPIR
  pop de
  or a           ; anything but 00h:
                 ; programmed
  jr nz,SDWDON
  dec c
  jr nz,SDWB
  dec d          ; C wrapped: the next
                 ; 256
  jr nz,SDWB
  call SPIEND    ; still busy after
                 ; every poll
  ld a,SDEBUSY
  jp SDFAIL

SDWDON:
  call SPIEND    ; deselect: written
  jp SDIOK
