; MON3.SVC: MON-3's graphics API for
; the 128x64 GLCD, RST 18h, included by
; mon3.asm. Calls 0 to 20 are MON-3's
; own routines, in its order, so each
; gives MON-3's results in MON-3's time.
; They draw into the buffer at VPORT,
; 1,024 bytes of 16 a row, and copy it
; to the ST7920 at plotToLCD. 21 to 33,
; the font and the terminal, are not
; built: docs/mon3.md.

GLCDI EQU $07    ; the ST7920's command
GLCDD EQU $87    ; and data ports
VDLY EQU $000A   ; delayUS's count

; MON-3's graphics workspace: the
; buffer the drawing calls use, then
; their variables. CLRBUF nonzero makes
; plotToLCD clear what it sends.

GBUF EQU $0A00   ; 128x64, a bit a pixel
ENDPT EQU $0E00  ; drawLine's end
SX EQU $0E02     ; steps and position
SY EQU $0E03
DX EQU $0E04     ; drawLine's deltas
DY EQU $0E06
ERR EQU $0E08    ; the error term
RAD EQU $0E0A    ; drawCircle's radius
CLRBUF EQU $0E0C
VPORT EQU $0E13  ; the buffer in use
GVEND EQU $0E1A  ; the variables' end

; RST 18h: MON-3's graphics API, A the
; call. BC, DE and HL reach the routine
; as the caller left them, and IX is
; lost, as in MON-3. Nothing of ours
; stays on the stack, so the routine
; returns to the caller, and
; printString finds its text at the
; return address. A call past 20 goes
; to the error display.

R18:
  pop hl         ; the caller's HL
  cp 21          ; calls 0 to 20
  jp nc,DERR     ; the rest refused
  push bc
  push hl        ; kept for the call
  ld hl,GAPI
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
  jp (ix)

; The calls, by number and MON-3's
; name. Those not built yet go to the
; error display.

GAPI:
  DW GINIT       ; 0 initLCD
  DW GCLRB       ; 1 clearGBUF
  DW GCLRG       ; 2 clearGrLCD
  DW GCLRT       ; 3 clearTxtLCD
  DW GGRM        ; 4 setGrMode
  DW GTXM        ; 5 setTxtMode
  DW DERR        ; 6 drawBox
  DW DERR        ; 7 drawLine
  DW DERR        ; 8 drawCircle
  DW DERR        ; 9 drawPixel
  DW DERR        ; 10 fillBox
  DW DERR        ; 11 fillCircle
  DW GPLOT       ; 12 plotToLCD
  DW DERR        ; 13 printString
  DW DERR        ; 14 printChars
  DW GDLYUS      ; 15 delayUS
  DW GDLYMS      ; 16 delayMS
  DW GBCLR       ; 17 setBufClear
  DW GBKEEP      ; 18 setBufNoClear
  DW DERR        ; 19 clearPixel
  DW DERR        ; 20 flipPixel

; The workspace as every MON-3 reset
; leaves it, through initLCD: GBUF and
; the variables zero, VPORT at GBUF.
; CLRBUF zero is the session's choice,
; as no reset writes it. A holds 0.
; Clobbers BC, DE and HL.

GWS:
  ld hl,GBUF
  ld de,GBUF+1
  ld bc,GVEND-GBUF-1
  ld (hl),a      ; the first zero
  ldir           ; and the rest
  ld hl,GBUF
  ld (VPORT),hl  ; drawing into GBUF
  ret

; Call 0, initLCD: the ST7920 set up,
; VPORT at GBUF, graphics mode with its
; RAM cleared, then on into clearGBUF.
; Clobbers A, BC, DE and HL.

GINIT:
  ld hl,GINITB   ; the commands
  ld b,$04       ; four of them

GINIT1:
  ld a,(hl)      ; the next command
  out (GLCDI),a  ; to the panel
  call GDLYUS    ; and its wait
  inc hl
  djnz GINIT1    ; each of them
  ld de,$0140    ; 1.6 ms for the clear
  call GDLYMS
  ld hl,GBUF     ; the default buffer
  ld (VPORT),hl  ; drawing into GBUF
  call GCLRG     ; the panel's RAM

; Call 1, clearGBUF: the buffer at
; VPORT zeroed. Clobbers A, BC, DE and
; HL.

GCLRB:
  ld hl,(VPORT)  ; from the buffer
  ld de,(VPORT)
  inc de         ; to one byte on
  xor a
  ld (hl),a      ; the first zero
  ld bc,$03FF
  ldir           ; and the other 1,023
  ret

; Call 2, clearGrLCD: graphics mode and
; its RAM zero, 32 row pairs of 16
; words. Clobbers A, BC and DE.

GCLRG:
  call GGRM      ; graphics mode
  ld c,$00       ; the row pair

GCLRG1:
  ld a,$80       ; set the address
  or c
  out (GLCDI),a  ; its row address
  call GDLYUS
  ld a,$80       ; and the column
  out (GLCDI),a  ; column 0
  call GDLYUS
  xor a          ; a clear byte
  ld b,$10       ; 16 words a row

GCLRG2:
  out (GLCDD),a  ; a word's two bytes
  call GDLYUS
  out (GLCDD),a
  call GDLYUS
  djnz GCLRG2    ; across the row
  inc c          ; the next pair
  ld a,c
  cp $20         ; 32 pairs
  jr nz,GCLRG1
  ret

; Call 3, clearTxtLCD: text mode, and
; 64 spaces from DDRAM's first address.
; Clobbers A, B and DE.

GCLRT:
  call GTXM      ; text mode
  ld a,$80       ; DDRAM address 0
  out (GLCDI),a  ; DDRAM's start
  call GDLYUS
  ld b,$40       ; 64 characters

GCLRT1:
  ld a,' '       ; a space
  out (GLCDD),a  ; to the panel
  call GDLYUS
  djnz GCLRT1    ; each of them
  ret

; Call 4, setGrMode: the extended set,
; then graphics on. Clobbers A and DE.

GGRM:
  ld a,$34       ; the extended set
  out (GLCDI),a
  call GDLYUS
  ld a,$36       ; and graphics on
  out (GLCDI),a
  jp GDLYUS      ; its wait

; Call 5, setTxtMode: the basic set.
; Clobbers A and DE.

GTXM:
  ld a,$30       ; the basic set
  out (GLCDI),a
  jp GDLYUS      ; its wait

; Call 12, plotToLCD: the buffer at
; VPORT to the panel's graphics RAM,
; 64 rows of 16 bytes. With CLRBUF
; nonzero each byte is cleared once
; sent. Clobbers A, BC, DE and HL.

GPLOT:
  ld hl,(VPORT)  ; the buffer
  ld c,$80       ; row 0

GPLOT1:
  ld a,c         ; the row
  and $9F
  out (GLCDI),a  ; the row, 0 to 31
  call GDLYUS
  ld a,$80       ; column 0
  bit 5,c        ; rows 32 to 63?
  jr z,GPLOT3    ; the upper half
  or $08         ; or the lower

GPLOT3:
  out (GLCDI),a  ; its column
  call GDLYUS
  ld b,$10       ; 16 bytes a row

GPLOT2:
  ld a,(hl)      ; the buffer's byte
  out (GLCDD),a  ; out to the panel
  call GDLYUS
  ld a,(CLRBUF)  ; clear it?
  or a
  jr z,GPLOT4    ; no: kept
  ld (hl),$00    ; or cleared

GPLOT4:
  inc hl
  djnz GPLOT2    ; across the row
  inc c          ; the next row
  bit 6,c
  jr z,GPLOT1    ; until row 64
  ret

; Call 15, delayUS: the wait the ST7920
; needs after a byte, about 70 us at
; 4 MHz, by delayMS. Clobbers A and DE.

GDLYUS:
  ld de,VDLY     ; 10 counts

; Call 16, delayMS: DE counts, 26 T
; each, 0 for 65,536. Clobbers A and
; DE.

GDLYMS:
  dec de         ; one count
  ld a,d
  or e
  jr nz,GDLYMS   ; until DE is 0
  ret

; Call 17, setBufClear: plotToLCD
; clears what it sends from now on, and
; the buffer is cleared. Clobbers A,
; BC, DE and HL.

GBCLR:
  ld a,$FF       ; nonzero
  ld (CLRBUF),a  ; clear after a plot
  jp GCLRB       ; and the buffer

; Call 18, setBufNoClear: plotToLCD
; keeps the buffer. Clobbers A.

GBKEEP:
  xor a          ; zero
  ld (CLRBUF),a  ; keep after a plot
  ret

; The ST7920's set-up commands: 8-bit
; and the basic set; display on, no
; cursor; cursor right; DDRAM clear.

GINITB: DB $30,$0C,$06,$01
