; SD SPI on FDh. Outputs are MOSI bit 0,
; CLK bit 1 and active-low CS bit 2.
; Input is MISO bit 7. Counts bound
; software polls, not wall time.
; SDINIT/SDREAD/SDWRITE return A=0/Z or
; nonzero SDE*/NZ and store A in SDERR.
; Helpers below have separate results.

SDIDLE EQU $05   ; /CS high, MOSI high,
                 ; CLK low

SDENOCD EQU 1    ; CMD0 never returned
                 ; 01h
SDEINIT EQU 2    ; ACMD41 never ready,
                 ; or CMD55 refused
SDEOCR EQU 3     ; CMD58 failed
SDEBLEN EQU 4    ; CMD16 failed
SDECMD EQU 5     ; read/write R1 nonzero
SDETOK EQU 6     ; no data token
SDEWRSP EQU 7    ; write not accepted
SDEBUSY EQU 8    ; card stayed busy
SDERNG EQU 9     ; SDSC LBA >=800000h
SDEDTOK EQU 10   ; read token not
                 ; FEh/FFh
SDEVOLT EQU 11   ; CMD8's echo wrong:
                 ; voltage or pattern

; Send C most significant bit first with
; CS low. Each bit sets data with CLK
; low then raises CLK. Return C
; unchanged after eight rotations, B=0
; and CLK high. Change AF. DE/HL and
; SDERR stay intact.

SPIW:
  ld b,8

SPIWB:
  xor a
  rlc c
  rla
  out (SDIO),a
  or 2
  out (SDIO),a
  djnz SPIWB
  ret

; Receive eight bits with CS low and
; MOSI high. Return the byte in A with
; CLK low and B=0. Change F/E. C/D/HL
; and SDERR stay intact. Eight shifts
; remove the old E bits.

SPIR:
  ld b,8

SPIRB:
  ld a,1
  out (SDIO),a
  ld a,3
  out (SDIO),a
  in a,(SDIO)
  rla
  rl e
  djnz SPIRB
  ld a,1
  out (SDIO),a
  ld a,e
  ret

; Deselect and emit eight trailing
; clocks with CS/MOSI high, ending CLK
; low. Preserve all registers and flags
; so the response in A passes through.

SPIEND:
  push af
  push bc
  ld b,8

SPIEB:
  ld a,SDIDLE+2
  out (SDIO),a
  ld a,SDIDLE
  out (SDIO),a
  djnz SPIEB
  pop bc
  pop af
  ret

; Send FFh, 40h OR command A=0..63, four
; big-endian SDARG bytes and CRC/end
; byte. Poll at most sixteen bytes for
; R1. A bit 7 clear means response, set
; means exhausted search. Both return Z.
; Leave CS low for longer responses.
; Change AF/BC/DE/HL. SDERR stays
; intact.

SDCMD:
  ld d,a
  ld c,$FF
  call SPIW
  ld a,d
  or $40
  ld c,a
  call SPIW
  ld hl,SDARG
  ld e,4

SDCA:
  ld c,(hl)      ; high byte first
  call SPIW
  inc hl
  dec e
  jr nz,SDCA

; CRC/end byte is 95h for CMD0 argument
; 0. CMD8 argument 1AAh uses 87h. Other
; commands use 01h. Callers must supply
; the matching arguments. No CRC is
; calculated here.

  ld c,$95
  ld a,d
  or a
  jr z,SDCRC
  ld c,$87
  cp 8
  jr z,SDCRC
  ld c,$01

SDCRC:
  call SPIW
  ld d,16

SDR1:
  call SPIR
  bit 7,a
  ret z
  dec d
  jr nz,SDR1
  ret

; Store 32-bit DEHL in SDARG, D first.
; Return A=L. Preserve flags/BC/DE/HL.
; No port access.

SETARG:
  ld a,d
  ld (SDARG),a
  ld a,e
  ld (SDARG+1),a
  ld a,h
  ld (SDARG+2),a
  ld a,l
  ld (SDARG+3),a
  ret

; SDCMDX with argument 0 (SDCMDZ) or
; with HL=0, DE the caller's (SDCMDH).

SDCMDZ:
  ld de,0

SDCMDH:
  ld hl,0

; Send command A with argument DEHL,
; then deselect through SPIEND. Return
; SDCMD byte/flags unchanged. Change
; AF/BC/DE/HL. SDERR stays intact.

SDCMDX:
  push af
  call SETARG
  pop af
  call SDCMD
  jr SPIEND

; Prepare SPI block I/O, initially using
; block addresses. Return A=0/Z or
; SDE*/NZ. Store A in SDERR. Set
; SDBYTE/SDARG and change F/BC/DE/HL.
; SDXB stays intact. CMD58 selects
; addressing mode and CMD16 sets
; byte-card blocks to 512 bytes.

SDINIT:
  xor a
  ld (SDBYTE),a
  ld a,SDIDLE
  out (SDIO),a
  ld d,10

; Up to ten CMD0 attempts, each preceded
; by 80 deselected clocks. Only R1=01h
; proceeds. Other responses or timeouts
; exhaust to SDENOCD.

SDI0:
  push de
  ld b,10        ; ten SPIENDs: 80

SDICK:
  call SPIEND
  djnz SDICK
  xor a
  call SDCMDZ
  pop de
  dec a          ; idle?
  jr z,SDI8
  dec d
  jr nz,SDI0
  ld a,SDENOCD
  jp SDFAIL

; CMD8 argument 1AAh: only R1=01h enters
; R7 checks. Discard two bytes, then
; test the third low nibble for 1.
; Read/test the fourth for AAh only if
; that passes. Mismatch deselects with
; SDEVOLT. Other R1/timeout outcomes
; skip R7 and continue, without
; identifying card generation.

SDI8:
  ld de,0
  ld hl,$01AA
  call SETARG
  ld a,8
  call SDCMD
  dec a          ; idle?
  jr nz,SDI8X
  call SPIR
  call SPIR
  call SPIR
  and $0F
  dec a
  jr nz,SDI8F
  call SPIR
  cp $AA
  jr z,SDI8X

SDI8F:
  ld a,SDEVOLT
  jr SDFEND

SDI8X:
  call SPIEND
  ld c,0

; Up to 256 attempts. Accept only CMD55
; R1=00h/01h, otherwise pop BC and fail
; SDEINIT. ACMD41 sends HCS=40000000h.
; Zero proceeds to OCR. Every nonzero
; result pauses 256 turns before retry.
; Exhaustion is SDEINIT.

SDI41:
  push bc
  ld a,55
  call SDCMDZ
  and $FE
  jr nz,SDI55F
  ld de,$4000
  ld a,41
  call SDCMDH
  pop bc
  or a
  jr z,SDI58
  ld b,0

SDI41W:
  djnz SDI41W
  dec c
  jr nz,SDI41
  jr SDI41F

SDI55F:
  pop bc

SDI41F:
  ld a,SDEINIT
  jr SDFAIL

; On CMD58 R1=0, read all four OCR bytes
; and retain first-byte CCS. Nonzero R1:
; deselect and return SDEOCR. Set CCS
; keeps block mode. Clear CCS sets
; SDBYTE=1 and requires CMD16(512) R1=0
; or SDEBLEN. Failure can follow a state
; change.

SDI58:
  ld de,0
  ld hl,0
  call SETARG
  ld a,58
  call SDCMD
  or a
  jr nz,SDI58F
  call SPIR
  push af
  call SPIR
  call SPIR
  call SPIR
  call SPIEND
  pop af
  bit 6,a
  jr nz,SDIOK
  ld a,1
  ld (SDBYTE),a
  ld de,0
  ld hl,512
  ld a,16
  call SDCMDX
  or a
  jr z,SDIOK
  ld a,SDEBLEN
  jr SDFAIL

SDI58F:
  ld a,SDEOCR

SDFEND:
  call SPIEND    ; keeps AF

; SDINIT/SDREAD/SDWRITE failure tail:
; nonzero SDE code A is stored in SDERR.
; Return A/NZ/carry clear. The caller
; must already have deselected or made
; no card access.

SDFAIL:
  ld (SDERR),a
  or a
  ret

; Success tail: store SDERR=0 and return
; A=0/Z/carry clear. Deselect is
; caller-owned.

SDIOK:
  xor a
  jr SDFAIL      ; stores 0, Z

; Convert little-endian SDLBA to
; big-endian SDARG. SDBYTE=0 uses block
; addressing. Otherwise multiply by 512,
; refusing LBA>=800000h with carry and
; SDARG unchanged (KE-151). Accepted
; paths return carry clear. Change
; AF/DE/HL. BC stays intact. No port
; access.

LBAARG:
  ld hl,(SDLBA)

  ld de,(SDLBA+2)
  ld a,(SDBYTE)
  or a
  jr z,SETARGJ1
  ld a,d
  or a
  scf
  ret nz
  bit 7,e
  scf
  ret nz
  ld d,e
  ld e,h
  ld h,l
  ld l,0
  add hl,hl
  ex de,hl
  adc hl,hl
  ex de,hl

SETARGJ1:
  jp SETARG

; Read SDLBA into 512 writable bytes at
; HL. SDXB=0 or LATEXP selects the
; buffer bank. Return A=0/Z or SDE*/NZ.
; Store A in SDERR. Change F/BC/DE/HL. A
; full payload sets I=0. Caller supplies
; safe bank/interrupt state. CRC bytes
; are consumed unchecked.

SDREAD:
  push hl
  call LBAARG
  jr c,SDRNG
  ld a,17
  call SDCMD
  pop hl
  or a
  jr nz,SDRCMD
  ld c,0
  ld d,0

; Up to 65,536 byte polls. FEh starts
; payload, FFh waits and every other
; byte is SDEDTOK after deselect.
; Exhaustion is SDETOK. No destination
; data is written before the payload.

SDRTOK:
  push de
  call SPIR
  pop de
  cp $FE
  jr z,SDRDAT
  inc a
  jr nz,SDRERR
  dec c
  jr nz,SDRTOK
  dec d
  jr nz,SDRTOK
  ld a,SDETOK
  jr SDFEND

SDRERR:
  ld a,SDEDTOK
  jr SDFEND

SDRDAT:
  call SDRBLK
  call SPIR
  call SPIR
  xor a
  jr SDFEND

; Read/write command failure with buffer
; word already popped: deselect then
; return SDECMD through SDFAIL.

SDRCMD:
  ld a,SDECMD
  jr SDFEND

; Range failure with buffer word still
; on stack: pop HL and return SDERNG
; before card access. SDARG stays
; unchanged.

SDRNG:
  pop hl
  ld a,SDERNG
  jr SDFAIL

; After start token with CS/CLK low,
; read 512 bytes to writable HL with
; MOSI high. SDXB=0/LATEXP selects
; LATCHV OR SDXB view. I counts 256
; two-byte passes. Return HL advanced,
; I=0 and CLK low. Change AF/BC/DE.
; Restore LATCHV before RET. The mapped
; loop uses no stack. Caller supplies
; interrupt protection.

SDRBLK:
  ld a,(SDXB)
  ld b,a
  ld a,(LATCHV)
  or b
  out (SYSLAT),a
  ld c,SDIO
  ld de,$0103
  xor a
  ld i,a

SDRB2:
  out (c),d      ; bit 7: CLK low, the
                 ; card shifts it out
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
  rl b
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
  rl b
  ld (hl),b
  inc hl
  ld a,i
  dec a
  ld i,a
  jp nz,SDRB2
  out (c),d
  ld a,(LATCHV)

  out (SYSLAT),a
  ret

; After start token with CS low, send
; 512 bytes from HL. SDXB=0/LATEXP
; selects LATCHV OR SDXB view. MOSI
; changes with CLK low. Two passes of
; 256 bytes advance HL. Return CLK low
; and latch=LATCHV. Change AF/BC/DE. I
; stays intact. The mapped loop uses no
; stack. Caller supplies interrupt
; protection.

SDWBLK:
  ld a,(SDXB)
  ld b,a
  ld a,(LATCHV)
  or b
  out (SYSLAT),a
  ld c,SDIO
  ld de,$0200

SDWB2:
  ld b,(hl)
  xor a          ; bit 7: /CS low, CLK
                 ; low
  rl b
  rla
  out (c),a
  or 2
  out (c),a
  xor a          ; bit 6
  rl b
  rla
  out (c),a
  or 2
  out (c),a
  xor a          ; bit 5
  rl b
  rla
  out (c),a
  or 2
  out (c),a
  xor a          ; bit 4
  rl b
  rla
  out (c),a
  or 2
  out (c),a
  xor a          ; bit 3
  rl b
  rla
  out (c),a
  or 2
  out (c),a
  xor a          ; bit 2
  rl b
  rla
  out (c),a
  or 2
  out (c),a
  xor a          ; bit 1
  rl b
  rla
  out (c),a
  or 2
  out (c),a
  xor a          ; bit 0
  rl b
  rla
  out (c),a
  or 2
  out (c),a
  inc hl
  dec e
  jp nz,SDWB2
  dec d
  jp nz,SDWB2
  and $FD
  out (c),a
  ld a,(LATCHV)
  out (SYSLAT),a
  ret

; Write SDLBA from 512 bytes at HL in
; SDXB=0 or LATEXP bank. Require CMD24
; R1=0, then send FFh, FEh and payload.
; Return A=0/Z or SDE*/NZ. Store A in
; SDERR. Change F/BC/DE/HL. Source is
; used through payload completion. A
; reported error may follow card
; effects. Caller supplies safe
; bank/interrupt state.

SDWRITE:
  push hl
  call LBAARG
  jp c,SDRNG
  ld a,24
  call SDCMD
  pop hl
  or a
  jp nz,SDRCMD
  ld c,$FF
  call SPIW
  ld c,$FE
  call SPIW
  call SDWBLK

; Send two FFh CRC bytes without local
; CRC calculation.

  ld c,$FF
  call SPIW
  call SPIW
  ld d,16

; Poll up to sixteen response bytes,
; skipping FFh. Accept only low five
; bits 05h. Rejection or exhaustion
; deselects with SDEWRSP.

SDWRS:
  push de
  call SPIR
  pop de
  cp $FF
  jr nz,SDWRG
  dec d
  jr nz,SDWRS

SDWRG:
  and $1F
  cp $05
  jr z,SDWBSY
  ld a,SDEWRSP

SDFENDJ1:
  jp SDFEND

; After accepted response, poll up to
; 65,536 bytes. Zero is busy. Any
; nonzero byte completes. Exhaustion
; deselects with SDEBUSY. Completion
; deselects, then SDIOK returns A=0/Z.
; No readback.

SDWBSY:
  ld c,0
  ld d,0

SDWB:
  push de
  call SPIR
  pop de
  or a
  jr nz,SDWDON
  dec c
  jr nz,SDWB
  dec d
  jr nz,SDWB
  ld a,SDEBUSY
  jr SDFENDJ1

SDWDON:
  xor a
  jr SDFENDJ1
