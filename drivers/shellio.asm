; SHELL.SVC's input and output: .CMD
; scripts and the rest of STARTUP.CMD,
; the prompt and console helpers, the
; pager behind PAGE and the history
; ring behind HREC and HSTORE. Included
; by shell.asm.

; Open A:STARTUP.CMD as the script and
; pass over its first line, which the
; ROM ran. Its lines keep the startup
; line's origin. Nothing is open if the
; file has no line after the first.

STOPEN:
  xor a          ; A = 0
  ld (STSKIP),a  ; once only
  ld hl,SFCB     ; SFCB zero
  ld de,SFCB+1
  ld bc,35
  ld (hl),a
  ldir           ; a clear FCB
  ld hl,STNAME   ; A:STARTUP.CMD
  ld de,SFCB
  ld bc,12
  ldir           ; drive A, the name
  call SOPENF    ; open it
  ret c          ; no file
  ld a,$FF       ; its lines quiet
  ld (SORG),a    ; the startup origin
  call SLINE     ; past the ROM's line
  ret nc         ; a line follows
  xor a          ; none: closed
  ld (SOPEN),a   ; nothing after it
  ret

STNAME: DB 1,"STARTUP CMD"

; Open SFCB. Carry: no file. Otherwise
; the script is open at its start: its
; records are read by number into
; 0080h, the first being 0.

SOPENF:
  ld de,SFCB     ; the script's FCB
  ld c,15        ; 15: open
  call BDOS
  inc a          ; FFh to zero
  scf
  ret z          ; FFh: no file
  ld a,1         ; open now
  ld (SOPEN),a
  ld hl,-1       ; one before 0
  ld (SFCB+33),hl
  ld a,128       ; at its end
  ld (SOFF),a    ; no record yet
  xor a          ; not ended
  ld (SEOF),a
  ret

; The script's next line into LTXT,
; zero-ended, at most 127 characters;
; the rest of a longer line is read
; past. CR, LF and CR LF each end a
; line, and an empty line or one
; starting with ; is passed over.
; Carry at the script's end. Programs
; may use 0080h between lines, so the
; record is read again at each line.

SLINE:
  xor a          ; A = 0
  ld (SLOAD),a   ; read the record again
  ld de,LTXT     ; the line's text
  ld b,127       ; slots left

SL1:
  call SGET      ; the next byte
  jr c,SLEOF     ; the script's end
  cp CR          ; CR ends it
  jr z,SLEOL
  cp LF          ; LF ends it
  jr z,SLEOL
  inc b          ; full? A is kept
  dec b          ; B = 0: full
  jr z,SL1       ; full: drop the rest
  ld (de),a      ; store the byte
  inc de
  dec b          ; a slot fewer
  jr SL1         ; the next byte

SLEOL:
  ld a,e         ; nothing stored?
  cp LOW(LTXT)
  jr z,SL1       ; empty so far

SLDONE:
  xor a          ; A = 0
  ld (de),a      ; zero-ended
  ld a,(LTXT)    ; its first byte
  cp ';'
  jr z,SLINE     ; a comment
  or a           ; a line, NC
  ret

SLEOF:
  ld a,e         ; nothing stored?
  cp LOW(LTXT)
  jr nz,SLDONE   ; a last, unended line
  scf            ; carry: the end
  ret

; The script's next byte in A. Zero,
; 1Ah or the end of its last record:
; carry, then carry at every later
; call. Keeps BC and DE.

SGET:
  ld a,(SEOF)    ; ended before?
  or a
  scf
  ret nz         ; carry: no more
  ld a,(SOFF)    ; the byte's offset
  cp 128         ; past the record?
  jr nz,SG0      ; within the record
  ld hl,(SFCB+33)
  inc hl         ; its number
  ld (SFCB+33),hl
  xor a          ; offset 0
  ld (SOFF),a
  ld (SLOAD),a   ; not read yet

; Read the record by number into 0080h
; if it is not there.

SG0:
  ld a,(SLOAD)   ; is it read?
  or a
  jr nz,SG1      ; it is there
  push de        ; the line pointer
  push bc        ; the slots left
  call SETDMA    ; DMA 0080h
  ld de,SFCB
  ld c,33        ; 33: random read
  call BDOS      ; read it by number
  pop bc
  pop de
  or a
  jr nz,SGEND    ; past the last record
  inc a          ; A = 1
  ld (SLOAD),a   ; it is there

SG1:
  ld a,(SOFF)    ; the byte's offset
  ld l,a
  inc a
  ld (SOFF),a    ; the next byte's
  ld h,0         ; HL = 0080h plus
  set 7,l        ; HL in 0080h-00FFh
  ld a,(hl)      ; the byte
  or a
  jr z,SGEND     ; a zero ends it
  cp 26          ; 1Ah?
  jr z,SGEND     ; 1Ah ends it
  or a           ; a byte, NC
  ret

SGEND:
  ld a,1         ; so later calls end
  ld (SEOF),a    ; ended
  scf
  ret

; Past spaces at HL. A is the byte.

SKIPSP:
  ld a,(hl)      ; the byte
  cp SPACE
  ret nz         ; not a space
  inc hl         ; past it
  jr SKIPSP

; Past blanks, spaces and tabs, and !
; at HL: Z at the line's end, else A
; the first other byte.

SKIPSB:
  ld a,(hl)      ; the byte
  cp '!'         ; ! is passed over
  jr z,SKB1
  cp SPACE
  jr z,SKB1      ; a space
  cp TAB
  jr z,SKB1      ; a tab
  or a           ; Z: the line's end
  ret

SKB1:
  inc hl
  jr SKIPSB

; The prompt: the drive at 0004h, its
; volume and >. The mask keeps it right
; on a ROM that leaves a user there.

PROMPT:
  ld a,(CURDSK)  ; 0004h: the drive
  and $0F        ; without the user
  ld e,a
  ld c,TNPRMPT
  call ABICALL   ; drive and volume
  ld e,'>'       ; then >

; E through BDOS 2, keeping BC and HL.

PUTC:
  push bc
  push hl        ; both kept over BDOS
  ld c,2         ; 2: output E
  call BDOS
  pop hl
  pop bc
  ret

; CR and LF. Keeps BC and HL.

CRLF:
  ld e,CR        ; a carriage return
  call PUTC
  ld e,LF        ; then a line feed
  jr PUTC

; The dollar-ended string at DE.

PUTS:
  ld c,9         ; 9: output to $
  jp BDOS

; The zero-ended string at HL. Returns
; HL at its zero.

PUTZ:
  ld a,(hl)      ; the next byte
  or a
  ret z          ; zero: the end
  ld e,a
  call PUTC      ; print it
  inc hl
  jr PUTZ

; B bytes at HL, each masked to seven
; bits: a name, its spaces left out.

PUTTRIM:
  ld c,SPACE     ; spaces left out

PT0:
  ld a,(hl)      ; the next byte
  and $7F
  cp c           ; left out?
  jr z,PTSK      ; a space: none
  ld e,a
  call PUTC      ; print it

PTSK:
  inc hl         ; on through the name
  djnz PT0
  ret

; DMA at 0080h.

SETDMA:
  ld de,DEFDMA
  ld c,26        ; 26: set the DMA
  jp BDOS

