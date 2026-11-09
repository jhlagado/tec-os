; Serial, LCD and digit output. A check
; calls BEGIN with its record, RESULT
; with a status, FIELDS with its values,
; and ENDL. Every result line reads "ID
; STATUS key=value ..."; other lines
; start "# ". docs/diagnostics.md gives
; the format.

; Send A as 8N2 at 4800 baud on port 01h
; bit 6. The loop is TEC-OS's TXBYTE
; (src/console.asm), and TXDLY/TXSTOP
; come from the derivation in
; tools/build.mjs, so the board runs
; TEC-OS's own timing. Interrupts are
; already off. Changes AF/B/DE.

TXBYTE:
  ld e,a         ; the byte to shift out
  ld b,9         ; a start bit and 8
                 ; data
  or a           ; carry clear: start
                 ; bit

TXB:
  sbc a,a        ; FFh for a 1 bit
  and $40        ; on the TX bit only
  out (DIGP),a   ; this bit on the line
  nop            ; pads as TEC-OS does
  ld d,TXDLY     ; the rest of the bit

TXD:
  dec d          ; 16 T-states a turn
  jr nz,TXD
  rr e           ; the next bit to carry
  djnz TXB       ; until 9 have gone
  ld a,TXIDLE    ; mark: two stop bits
  out (DIGP),a
  ld d,TXSTOP    ; their length

TXS:
  dec d          ; 16 T-states a turn
  jr nz,TXS
  ret

; Send A on the serial line. Keeps BC,
; DE and HL.

PUTC:
  push bc        ; TXBYTE changes B and
                 ; DE
  push de
  call TXBYTE
  pop de         ; DE back
  pop bc
  ret

; Print the zero-ended text at HL and
; return HL past its zero. Keeps BC and
; DE.

PRS:
  ld a,(hl)      ; the next character
  inc hl
  or a           ; zero ends the text
  ret z
  call PUTC      ; keeps HL
  jr PRS

; Print the zero-ended text after the
; CALL and return past it. Keeps BC, DE
; and HL.

PRI:
  ex (sp),hl     ; HL: the text
  call PRS       ; HL past its zero
  ex (sp),hl     ; return there
  ret

; Start a "# " line with the text after
; the CALL. Keeps BC, DE and HL.

NOTE:
  call PRI       ; the line's mark
  DB "# ",0
  jp PRI         ; then the caller's
                 ; text

; End the line. Sending clears port
; 01h's digit select, so the check's
; digit is lit again.

ENDL:
  ld a,13        ; CR LF
  call PUTC
  ld a,10
  call PUTC

; Light the check's hex digit on one
; display digit and leave it lit.

SHOWDIG:
  ld a,(DIGIT)   ; its segments
  out (SEGP),a
  ld a,TXIDLE+DIGSEL
  out (DIGP),a   ; one digit selected
  ret            ; TX idle,

; Print A as two hex digits. Keeps BC,
; DE and HL.

PRHEX:
  push af        ; the low digit for
                 ; later
  rrca           ; the high digit first
  rrca
  rrca           ; shifted down
  rrca
  call PRNIB
  pop af         ; the low digit

PRNIB:
  and $0F        ; one digit, 0-15
  add a,$90      ; the DAA trick: 0-9
  daa            ; or A-F in ASCII
  adc a,$40
  daa
  jp PUTC

; Print B bytes from HL as hex, in
; memory order. Returns HL past them and
; B=0.

PRHEXN:
  ld a,(hl)      ; the next byte
  inc hl
  call PRHEX     ; keeps B and HL
  djnz PRHEXN
  ret

; Print the 32-bit value at HL in
; decimal. A copy in NUM is divided by
; ten, the digits stacked. Changes
; AF/BC/DE/HL.

PRDEC:
  ld de,NUM      ; a copy to divide
  ld bc,4
  ldir
  ld b,0         ; the digits stacked

PD1:
  push bc        ; DIVB changes B
  ld hl,NUM
  ld c,10
  call DIVB      ; A: the lowest digit
  pop bc
  push af        ; stacked
  inc b
  ld hl,NUM
  call ISZ32     ; more digits to come?
  jr nz,PD1

PD2:
  pop af         ; the highest first
  add a,'0'      ; as ASCII
  call PUTC      ; keeps B
  djnz PD2
  ret

; Print A, or HL, in decimal. Changes
; AF/BC/DE/HL.

PRD8:
  ld l,a         ; A as a word
  ld h,0

PRD16:
  ld (NUM),hl    ; HL as 32 bits
  ld hl,0
  ld (NUM+2),hl
  ld hl,NUM      ; PRDEC copies it to
  jr PRDEC       ; itself: no change

; Print the 32-bit value at HL, a count
; of hundredths, as units, a point and
; two digits: 400 prints 4.00.

PRFIX2:
  ld de,NUM      ; a copy to divide
  ld bc,4
  ldir
  ld hl,NUM
  ld c,100       ; units and hundredths
  call DIVB      ; A: the hundredths
  push af
  ld hl,NUM
  call PRDEC     ; the units
  ld a,'.'
  call PUTC
  pop af         ; the hundredths, 00-99
  ld de,LCDBUF   ; as two digits there
  call D2
  ld hl,LCDBUF   ; and sent
  ld a,(hl)
  call PUTC
  inc hl         ; then the second
  ld a,(hl)
  jp PUTC

; Write A (0-99) as two decimal digits
; at DE and advance DE. Changes AF/BC.

D2:
  ld b,'0'-1     ; the tens, counted

D2A:
  inc b          ; one more ten
  sub 10
  jr nc,D2A      ; until A goes below 0
  add a,10+'0'   ; the units digit
  ld c,a
  ld a,b         ; tens first
  ld (de),a
  inc de
  ld a,c         ; then units
  ld (de),a
  inc de
  ret

; Copy the zero-ended text at HL to DE
; without its zero. Returns HL at the
; zero and DE past the copy.

CPYS:
  ld a,(hl)      ; the next character
  or a
  ret z          ; the end: not copied
  ld (de),a
  inc hl
  inc de
  jr CPYS

; Print the fields listed after the
; CALL, and return past the list. Each
; is a zero-ended text, then a kind byte
; and the value's address; kind 0, after
; a last text, ends the list. FD8, FD16,
; FD32 print a byte, word or 32-bit
; value in decimal; FHEX a byte in hex;
; FHEX4 four bytes in hex; FFIX a 32-bit
; count of hundredths. Changes all
; registers.

FIELDS:
  pop hl         ; the list

FL1:
  call PRS       ; the field's text
  ld a,(hl)      ; its kind
  inc hl
  or a           ; 0: the list's end
  jr z,FL3
  ld e,(hl)      ; the value's address
  inc hl
  ld d,(hl)
  inc hl
  push hl        ; the next field
  ex de,hl       ; HL: the value
  cp FHEX4       ; four hex bytes?
  jr nz,FL2
  ld b,4         ; four bytes
  call PRHEXN
  pop hl         ; the next field
  jr FL1

FL2:
  call FVAL      ; one value of kind A
  pop hl
  jr FL1

FL3:
  jp (hl)        ; past the list

; Print the value at HL of kind A (not
; FHEX4). Changes all registers.

FVAL:
  cp FD32        ; a 32-bit value
  jp z,PRDEC
  cp FFIX        ; hundredths
  jp z,PRFIX2
  ld c,a         ; the kind
  ld a,(hl)      ; the low byte
  inc hl
  ld h,(hl)      ; and the high
  ld l,a
  ld a,c
  cp FD16        ; HL: the word
  jp z,PRD16
  cp FHEX        ; or L: the byte
  ld a,l
  jp z,PRHEX     ; in hex
  jp PRD8        ; or decimal

; Start check HL: a record of its
; digit's value, its ID and its LCD
; title, both zero-ended. Shows the
; title on LCD row 2 and the digit.
; Changes all registers.

BEGIN:
  ld (CURCHK),hl
  ld a,(hl)      ; the digit's value
  inc hl         ; for RESULT
  push hl
  ld hl,SEGTAB   ; to its segments
  ld e,a
  ld d,0
  add hl,de
  ld a,(hl)
  ld (DIGIT),a   ; for SHOWDIG
  ld hl,SEGBUF   ; and for GETKEY's
  ld b,5         ; scans: five blank

BG1:
  ld (hl),0      ; digits, then this one
  inc hl
  djnz BG1
  ld (hl),a
  pop hl

BG2:
  ld a,(hl)      ; past the ID
  inc hl
  or a
  jr nz,BG2
  ld a,LROW2     ; the title on row 2
  call LCDROW
  jp SHOWDIG

; Print the current check's ID and the
; status word for A (RPASS-RSKIP), count
; it, and show both on LCD row 3 and the
; totals on row 4. Changes all
; registers.

RESULT:
  push af        ; the status
  ld hl,NRES     ; its total
  ld e,a
  ld d,0
  add hl,de      ; NRES + the status
  inc (hl)
  ld hl,(CURCHK)
  inc hl         ; the record's ID
  push hl
  call PRS       ; on the line
  ld a,' '
  call PUTC
  pop hl
  ld de,LCDBUF   ; and for the LCD
  call CPYS
  ld a,' '
  ld (de),a
  inc de
  pop af         ; the status's word
  push de
  call STWORD
  call PRS       ; on the line
  pop de
  ld bc,-5       ; back to its start
  add hl,bc
  call CPYS      ; and for the LCD
  xor a          ; the text's end
  ld (de),a
  ld hl,LCDBUF
  ld a,LROW3     ; ID and word on row 3
  call LCDROW

; Show the totals on LCD row 4 as P, W,
; F and S counts. Changes all registers.

TOTALS:
  ld de,LCDBUF   ; the text built here
  ld hl,NRES     ; the four totals
  ld bc,TOTCH    ; and their letters

TT1:
  ld a,(bc)      ; the next letter
  or a
  jr z,TT2       ; none left
  ld (de),a
  inc de
  ld a,(hl)      ; its total
  inc hl
  push bc
  call D2        ; as two digits
  pop bc
  ld a,' '       ; a space between
  ld (de),a
  inc de
  inc bc
  jr TT1

TT2:
  ld (de),a      ; the text's end
  ld hl,LCDBUF
  ld a,LROW4
  jp LCDROW

; HL = status A's word, five bytes each
; in STTXT. Changes AF/DE.

STWORD:
  ld hl,STTXT
  ld e,a         ; A x 5
  add a,a
  add a,a
  add a,e
  ld e,a         ; E: the offset
  ld d,0
  add hl,de      ; the word
  ret

; Print a SKIP line for the current
; check with the reason after the CALL,
; and return past the reason. Changes
; all registers.

SKIPR:
  ld a,RSKIP     ; "ID SKIP"
  call RESULT
  call PRI
  DB " reason=",0
  pop hl         ; the reason
  call PRS
  push hl        ; return past it
  jp ENDL

; Write the zero-ended text at HL to LCD
; row A through MON3, padded with spaces
; to 20 characters. Changes all
; registers.

LCDROW:
  push hl
  ld b,a         ; the row's address
  ld c,MLCDCMD   ; as a command
  rst $10
  pop hl
  ld b,20        ; characters a row

LR1:
  ld a,(hl)      ; the next character
  or a
  jr z,LR2       ; past the end: spaces
  inc hl
  jr LR3

LR2:
  ld a,' '       ; HL stays at the zero

LR3:
  push bc        ; MON3 may change them
  push hl
  ld c,MLCDCHR   ; one character
  rst $10
  pop hl         ; the row's pointer
  pop bc
  djnz LR1       ; the next character
  ret

; Wait for a newly pressed key through
; MON3's scanKeys, showing SEGBUF on the
; digits meanwhile. Return the key code
; in A. Changes all registers.

GETKEY:
  ld de,SEGBUF   ; one scan of the
  ld c,MSCANS    ; six digits
  rst $10
  ld c,MSCANK    ; then the keys
  rst $10
  jr nz,GETKEY   ; no key down
  jr nc,GETKEY   ; held since before
  ret

; Wait for GO or AD, passing over other
; keys. Z for GO, NZ for AD.

GOAD:
  call GETKEY
  cp KGO         ; Z: GO
  ret z
  cp KAD         ; another key: wait on
  jr nz,GOAD
  or a           ; NZ: AD
  ret

; Print "# " and the text after the CALL
; as a line, show the text at DE on LCD
; row 4 and wait for GO or AD: Z for GO.
; Returns past the text. Changes all
; registers but F.

ASK:
  push de        ; the LCD's text
  call PRI
  DB "# ",0
  pop de
  pop hl         ; the line's text
  call PRS
  push hl        ; return past it
  push de
  call ENDL
  pop hl
  ld a,LROW4     ; the keys' meaning
  call LCDROW    ; on row 4
  call GOAD      ; the answer
  push af
  call TOTALS    ; row 4 back
  call SHOWDIG   ; the digit back
  pop af
  ret

; The status words, the totals' letters
; and the hex digits' segments: a 01h, b
; 08h, c 20h, d 80h, e 40h, f 02h, g
; 04h.

STTXT:    DB    "PASS",0,"WARN",0,"FAIL"
  DB 0,"SKIP",0
TOTCH:    DB    "PWFS",0
SEGTAB:   DB    $EB,$28,$CD,$AD,$2E,$A7
  DB $E7,$29,$EF,$AF,$6F,$E6,$C3,$EC,$C7
  DB $47
