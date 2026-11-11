; MON3.SVC: MON-3's graphics API for
; the 128x64 GLCD, RST 18h, included by
; mon3.asm. Calls 0 to 20 are MON-3's
; own routines, in its order, so each
; gives MON-3's results in MON-3's time.
; They draw into the buffer at VPORT,
; 1,024 bytes of 16 a row, and copy it
; to the ST7920 at plotToLCD. 21 to 33,
; the font and the terminal, are not
; built: docs/mon3.md. Also here: the
; graphics workspace set at each entry,
; and the GLCD console's modes set at a
; program's return.

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
; name.

GAPI:
  DW GINIT       ; 0 initLCD
  DW GCLRB       ; 1 clearGBUF
  DW GCLRG       ; 2 clearGrLCD
  DW GCLRT       ; 3 clearTxtLCD
  DW GGRM        ; 4 setGrMode
  DW GTXM        ; 5 setTxtMode
  DW GBOX        ; 6 drawBox
  DW GLINE       ; 7 drawLine
  DW GCIRC       ; 8 drawCircle
  DW GPIX        ; 9 drawPixel
  DW GFBOX       ; 10 fillBox
  DW GFCIRC      ; 11 fillCircle
  DW GPLOT       ; 12 plotToLCD
  DW GPSTR       ; 13 printString
  DW GPCHR       ; 14 printChars
  DW GDLYUS      ; 15 delayUS
  DW GDLYMS      ; 16 delayMS
  DW GBCLR       ; 17 setBufClear
  DW GBKEEP      ; 18 setBufNoClear
  DW GPCLR       ; 19 clearPixel
  DW GPFLIP      ; 20 flipPixel

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

; At a program's return, with CON: on
; UC1: (IOBYTE's low bits 3), GLCD.SVC's
; own mode bytes go to the ST7920, each
; with 2.1 ms (8,389 T at 4 MHz), so
; the console's text is on show after
; the form feed; the 01h
; clears DDRAM. It reads no status, so
; it cannot hang, and with no GLCD the
; writes go nowhere. On another console
; the panel stays as the program left
; it, as under MON-3. Clobbers A, B, DE
; and HL.

GRST:
  ld a,(IOBYTE)
  and 3
  cp 3           ; CON: on UC1:?
  ret nz         ; no: left alone
  ld hl,GMODE
  ld b,5         ; five bytes

GRST1:
  ld a,(hl)
  out (GLCDI),a  ; a mode byte
  ld de,$0140    ; and 2.1 ms
  call GDLYMS
  inc hl
  djnz GRST1     ; each of them
  ret

; GLCD.SVC's GLCMOD bytes: the basic
; set, display on, DDRAM clear, the
; extended set, graphics on.

GMODE: DB $30,$0C,$01,$34,$36

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
  ld de,$0140    ; 2.1 ms: the clear
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

; Call 6, drawBox: the outline from
; X0,Y0 in BC to X1,Y1 in DE, by
; drawPixel, so off-panel points are
; dropped. Clobbers A and HL.

GBOX:
  push bc        ; X0,Y0 kept

GBOX1:
  call GPIX      ; the top, X0 to X1
  ld a,d         ; X1
  inc b          ; the next X
  cp b
  jr nc,GBOX1    ; up to X1
  pop bc         ; X0,Y0
  push bc
  ld c,e         ; the bottom, at Y1

GBOX2:
  call GPIX
  ld a,d         ; X1
  inc b          ; the next X
  cp b
  jr nc,GBOX2    ; up to X1
  pop bc         ; X0,Y0
  push bc

GBOX3:
  call GPIX      ; the left, Y0 to Y1
  ld a,e         ; Y1
  inc c          ; the next Y
  cp c
  jr nc,GBOX3    ; up to Y1
  pop bc         ; X0,Y0
  push bc
  ld b,d         ; the right, at X1

GBOX4:
  call GPIX
  ld a,e         ; Y1
  inc c          ; the next Y
  cp c
  jr nc,GBOX4    ; up to Y1
  pop bc         ; X0,Y0 back
  ret

; Call 10, fillBox: every pixel from
; X0,Y0 in BC to X1,Y1 in DE, a column
; at a time. Clobbers A, B and HL.

GFBOX:
  push bc        ; the column's top

GFBOX1:
  call GPIX      ; down the column
  ld a,e         ; Y1
  inc c          ; the next Y
  cp c
  jr nc,GFBOX1   ; up to Y1
  pop bc         ; the column's top
  ld a,d         ; X1
  inc b          ; the next column
  cp b
  jr nc,GFBOX    ; up to X1
  ret

; Call 7, drawLine: Bresenham's line
; from X0,Y0 in BC to X1,Y1 in DE.
; Nothing is drawn if either end is off
; the panel. SX and SY are the steps,
; DX and DY the deltas, DY negative,
; ERR the error, ENDPT the end.
; Clobbers A, BC, DE and HL.

GLINE:
  ld a,c
  cp $40         ; 64 rows
  ret nc         ; Y0 off the panel
  ld a,b
  cp $80         ; 128 columns
  ret nc         ; X0 off it
  ld a,e
  cp $40
  ret nc         ; Y1 off it
  ld a,d
  cp $80
  ret nc         ; X1 off it
  ld h,$01       ; SX: 1 if X0 < X1
  ld a,b
  cp d
  jr c,GLSX
  ld h,$FF       ; else -1

GLSX:
  ld a,h
  ld (SX),a      ; the X step
  ld h,$01       ; SY: 1 if Y0 < Y1
  ld a,c
  cp e
  jr c,GLSY
  ld h,$FF       ; else -1

GLSY:
  ld a,h
  ld (SY),a      ; the Y step
  ld (ENDPT),de  ; where the line ends
  push bc        ; X0,Y0 kept
  ld l,d
  ld h,0         ; X1
  ld c,b
  ld b,0         ; less X0
  or a
  sbc hl,bc
  call GABS
  ld (DX),hl     ; DX = |X1-X0|
  pop bc
  push bc        ; kept again
  ld l,e
  ld h,0         ; Y1
  ld b,0         ; less Y0
  or a
  sbc hl,bc
  call GABS      ; made positive
  xor a          ; then negated
  sub l
  ld l,a         ; its low byte
  sbc a,a
  sub h
  ld h,a
  ld (DY),hl     ; DY = -|Y1-Y0|
  pop bc         ; X0,Y0
  ld de,(DX)
  add hl,de
  ld (ERR),hl    ; ERR = DX+DY

GLINE1:
  call GPIX      ; the point at BC
  ld a,(ENDPT+1)
  cp b           ; X at X1?
  jr nz,GLINE4   ; not the end
  ld a,(ENDPT)   ; Y1
  cp c
  ret z          ; the end point

GLINE4:
  ld hl,(ERR)
  add hl,hl      ; E2 = 2*ERR
  ld de,(DY)
  or a           ; no carry in
  sbc hl,de      ; E2 less DY
  add hl,de      ; E2 again
  jp m,GLINE2    ; E2 < DY: X stays
  push hl
  ld hl,(ERR)
  add hl,de
  ld (ERR),hl    ; ERR += DY
  ld a,(SX)
  add a,b
  ld b,a         ; X += SX
  pop hl         ; E2 again

GLINE2:
  ld de,(DX)
  or a           ; no carry in
  sbc hl,de      ; E2 less DX
  add hl,de
  jr z,GLINE3    ; E2 = DX: step Y
  jp p,GLINE1    ; E2 > DX: Y stays

GLINE3:
  ld hl,(ERR)
  add hl,de
  ld (ERR),hl    ; ERR += DX
  ld a,(SY)
  add a,c
  ld c,a         ; Y += SY
  jr GLINE1      ; the next point

; HL made positive. Clobbers A.

GABS:
  bit 7,h
  ret z          ; already
  xor a          ; 0 less HL
  sub l
  ld l,a
  sbc a,a
  sub h
  ld h,a         ; its high byte
  ret

; Call 8, drawCircle: Bresenham's
; circle about BC, radius E, a point in
; each quadrant a step. SX holds X,
; from -R up to 0, SY holds Y, ERR the
; error and RAD R. Off-panel points
; are dropped. Clobbers A, DE and HL.

GCIRC:
  xor a          ; 0 less R
  sub e
  ld (SX),a      ; X = -R
  xor a
  ld (SY),a      ; Y = 0
  ld d,$00       ; DE = R
  ld a,e
  ld (RAD),de    ; R
  ex de,hl
  add hl,hl
  ex de,hl       ; DE = 2R
  ld hl,$0002    ; 2 less 2R
  or a
  sbc hl,de
  ld (ERR),hl    ; ERR = 2-2R

GCIRC1:
  push bc        ; the centre kept
  ld a,(SX)      ; -X
  neg
  add a,b
  ld b,a         ; XM-X
  ld a,(SY)
  add a,c
  ld c,a         ; YM+Y
  call GPIX      ; quadrant I
  pop bc         ; the centre
  push bc
  ld a,(SX)
  add a,b
  ld b,a         ; XM+X
  ld a,(SY)      ; -Y
  neg
  add a,c
  ld c,a         ; YM-Y
  call GPIX      ; quadrant III
  pop bc         ; the centre
  push bc
  ld a,(SY)      ; -Y
  neg
  add a,b
  ld b,a         ; XM-Y
  ld a,(SX)      ; -X
  neg
  add a,c
  ld c,a         ; YM-X
  call GPIX      ; quadrant II
  pop bc         ; the centre
  push bc
  ld a,(SY)
  add a,b
  ld b,a         ; XM+Y
  ld a,(SX)
  add a,c
  ld c,a         ; YM+X
  call GPIX      ; quadrant IV
  pop bc         ; the centre
  ld hl,(ERR)
  ld (RAD),hl    ; R = ERR
  ld a,(SY)      ; Y
  ld e,a
  ld d,0         ; DE = Y
  or a
  sbc hl,de      ; R less Y
  add hl,de
  jr z,GCIRC5    ; R = Y: step Y
  jp p,GCIRC2    ; R > Y: Y stays

GCIRC5:
  ld a,(SY)      ; Y
  inc a
  ld (SY),a      ; Y += 1
  add a,a
  inc a
  ld e,a
  ld d,0         ; DE = 2Y+1
  ld hl,(ERR)
  add hl,de
  ld (ERR),hl    ; added to ERR

GCIRC2:
  ld hl,(RAD)    ; R
  ld a,(SX)
  ld d,$FF
  ld e,a         ; DE = X, negative
  or a
  sbc hl,de      ; R less X
  add hl,de
  jr z,GCIRC6    ; R = X: test ERR
  jp p,GCIRC3    ; R > X: step X

GCIRC6:
  ld hl,(ERR)    ; ERR
  ld a,(SY)
  ld d,0
  ld e,a         ; DE = Y
  or a
  sbc hl,de      ; ERR less Y
  add hl,de
  jr z,GCIRC4    ; ERR = Y: X stays
  jp m,GCIRC4    ; ERR < Y: X stays

GCIRC3:
  ld a,(SX)      ; X
  inc a
  ld (SX),a      ; X += 1
  add a,a
  inc a
  ld e,a
  ld d,$FF       ; DE = 2X+1
  ld hl,(ERR)
  add hl,de
  ld (ERR),hl    ; added to ERR

GCIRC4:
  ld a,(SX)      ; X reached 0?
  or a
  jp nz,GCIRC1   ; until X is 0
  ret

; Call 11, fillCircle: circles of
; radius 1 to E about BC. Clobbers A, D
; and HL.

GFCIRC:
  ld d,$01       ; the first radius

GFCIR1:
  push de        ; E: the last
  ld e,d
  call GCIRC     ; radius D
  pop de
  ld a,e
  inc d          ; the next radius
  cp d
  jr nc,GFCIR1   ; up to E
  ret

; Call 9, drawPixel: the pixel at X in
; B (0-127), Y in C (0-63) set; nothing
; off the panel. Clobbers A and HL.

GPIX:
  ld a,c
  cp $40         ; 64 rows
  ret nc         ; Y off the panel
  ld a,b
  cp $80         ; 128 columns
  ret nc         ; X off it
  push de        ; kept
  call GSETB     ; its byte and bit
  ld a,d
  or (hl)        ; the bit set
  ld (hl),a      ; back in the buffer
  pop de
  ret

; Call 19, clearPixel: the same, the
; bit cleared. Clobbers A and HL.

GPCLR:
  ld a,c
  cp $40         ; 64 rows
  ret nc         ; Y off the panel
  ld a,b
  cp $80         ; 128 columns
  ret nc         ; X off it
  push de        ; kept
  call GSETB     ; its byte and bit
  ld a,d
  cpl
  and (hl)       ; the bit cleared
  ld (hl),a      ; back in the buffer
  pop de
  ret

; Call 20, flipPixel: the same, the bit
; flipped. Clobbers A and HL.

GPFLIP:
  ld a,c
  cp $40         ; 64 rows
  ret nc         ; Y off the panel
  ld a,b
  cp $80         ; 128 columns
  ret nc         ; X off it
  push de        ; kept
  call GSETB     ; its byte and bit
  ld a,d
  xor (hl)       ; the bit flipped
  ld (hl),a      ; back in the buffer
  pop de
  ret

; The pixel at X in B, Y in C: HL at
; its byte in the buffer at VPORT, D
; its bit, the leftmost bit 7.
; Clobbers A and E.

GSETB:
  ld l,c
  ld h,$00       ; HL = Y
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl      ; times 16
  ld de,(VPORT)
  dec de
  add hl,de      ; the row, less one
  ld a,b
  ld d,$08       ; 8 pixels a byte

GSETB1:
  inc hl         ; a byte to the right
  sub d
  jr nc,GSETB1   ; for each 8 of X
  cpl            ; 7 less X mod 8
  ld d,$01       ; bit 0
  or a
  ret z          ; it is bit 0

GSETB2:
  sla d          ; one bit up
  dec a
  jr nz,GSETB2   ; the bit moved up
  ret

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

; Call 13, printString: the zero-ended
; text after the RST, in text mode, on
; row C, 0 to 3. It returns past the
; zero. A row of 4 to 7 reads
; INIT_BASIC's bytes as the address,
; as in MON-3, so GINITB follows GROWS.
; Clobbers A, B, DE and HL.

GPSTR:
  ld b,c         ; the row
  call GTXM      ; text mode
  ld hl,GROWS
  ld a,b
  add a,l        ; the row's entry
  jr nc,GPSTR1
  inc h          ; with its carry

GPSTR1:
  ld l,a
  ld a,(hl)      ; the row's address
  out (GLCDI),a  ; its DDRAM address
  call GDLYUS
  pop hl         ; the text

GPSTR2:
  ld a,(hl)      ; the next character
  inc hl
  or a
  jr z,GPSTR3    ; its zero
  out (GLCDD),a  ; a character
  call GDLYUS
  jr GPSTR2

GPSTR3:
  jp (hl)        ; back past the text

; Call 14, printChars: the zero-ended
; text at HL in text mode, from column
; word B (0-7) of row C (0-3). HL ends
; past the zero and DE in GROWS.
; Clobbers A and DE.

GPCHR:
  call GTXM      ; text mode
  ld de,GROWS
  ld a,c
  add a,e        ; the row's entry
  jr nc,GPCHR1
  inc d          ; with its carry

GPCHR1:
  ld e,a
  ld a,(de)      ; the row's address
  add a,b        ; and the column
  out (GLCDI),a  ; the DDRAM address
  call GDLYUS

GPCHR2:
  ld a,(hl)      ; the next character
  inc hl
  or a
  ret z          ; its zero
  out (GLCDD),a  ; a character
  call GDLYUS
  jr GPCHR2

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

; Each text row's first DDRAM address,
; then the ST7920's set-up commands:
; 8-bit and the basic set; display on,
; no cursor; cursor right; DDRAM
; clear.

GROWS: DB $80,$90,$88,$98
GINITB: DB $30,$0C,$06,$01
