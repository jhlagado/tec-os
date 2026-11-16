; AREA [n [NAME]]: the user area through
; BDOS function 32, for the tests of the
; BDOS's areas. The command processor
; stays in area 0, so a program is the
; only way into another.
;
; AREA alone prints AREA and the current
; area in decimal. AREA n sets area n,
; 0 to 31, and returns with it set and
; with its low four bits in the user
; nibble of 0004h, CP/M 2.2's way to ask
; for an area at the next prompt.
; AREA n NAME also makes NAME there and
; prints KEPT APART when a search finds
; it in area n and not in area 0, or
; MIXED otherwise.

DRIVE     EQU   $0004
BDOS      EQU   $0005
FCB2      EQU   $006C
TAIL      EQU   $0080

  ORG $0100

; n is read from the tail. The CCP
; parsed NAME into the FCB at 006Ch.

START:
  ld hl,TAIL+1   ; the tail as typed
  call SPACES    ; to n, if any
  or a
  jp z,SHOW      ; none: print the area
  call NUM
  jp c,USAGE     ; n is no number
  cp 32
  jp nc,USAGE    ; areas are 0 to 31
  ld (AREA),a    ; kept for the checks
  call SETA      ; area n from here on
  ld a,(AREA)
  rlca           ; to the high nibble
  rlca
  rlca
  rlca
  and $F0        ; its low four bits
  ld b,a
  ld a,(DRIVE)   ; drive and old area
  and $0F        ; the drive stays
  or b
  ld (DRIVE),a   ; asked of the prompt
  ld a,(FCB2+1)  ; NAME's first letter
  cp ' '
  ret z          ; no NAME: n stays set

; Copy NAME's 16 bytes to a whole FCB
; with the rest zero, and make the file
; in area n.

  ld hl,FCB2
  ld de,FCB      ; this program's FCB
  ld bc,16
  ldir           ; drive, name, type
  ld b,20        ; the 20 bytes after
  xor a

CLEAR:
  ld (de),a      ; extent to record
  inc de
  djnz CLEAR
  ld c,19        ; 19: delete
  call FILE
  ld c,22        ; 22: make
  call FILE
  inc a
  jr z,MIXED     ; FFh: no entry free
  ld c,16        ; 16: close
  call FILE

; The file must be found from area n and
; not from area 0, and the area asked
; for must still be the one set.

  ld c,17        ; 17: search, in n
  call FILE
  inc a
  jr z,MIXED     ; FFh: not found in n
  ld e,0
  ld c,32        ; 32: area 0
  call BDOS
  ld c,17        ; the same search
  call FILE
  push af        ; its answer
  call SETA      ; back to area n
  pop af
  inc a
  jr nz,MIXED    ; found in area 0 too
  call GETA      ; the area now
  ld hl,AREA
  cp (hl)
  jr nz,MIXED    ; not the area set
  ld de,APART    ; found in n alone
  jr PRINT

MIXED:
  ld de,MIXMSG   ; a check failed
  jr PRINT

USAGE:
  ld de,HELP     ; a bad operand

PRINT:
  ld c,9         ; 9: print
  jp BDOS

; Print AREA and the current area, with
; no leading zero.

SHOW:
  ld de,WORD
  ld c,9         ; 9: print
  call BDOS
  call GETA      ; 0 to 31
  ld b,'0'-1     ; the tens digit

TENS:
  inc b
  sub 10
  jr nc,TENS     ; another ten
  add a,10+'0'   ; the units digit
  push af        ; over the tens
  ld a,b
  cp '0'
  call nz,PUTA   ; tens, unless zero
  pop af
  call PUTA      ; units
  ld de,CRLF
  jr PRINT

; Print the character in A.

PUTA:
  ld e,a
  ld c,2         ; 2: print E
  jp BDOS

; Set the area kept in AREA.

SETA:
  ld a,(AREA)
  ld e,a
  jr USER

; Return the current area in A.

GETA:
  ld e,$FF       ; FFh asks for it

USER:
  ld c,32        ; 32: set or get area
  jp BDOS

; BDOS function C on the file's FCB.

FILE:
  ld de,FCB
  jp BDOS

; Skip spaces at HL. Returns A, the byte
; HL is left at: zero at the tail's end.

SPACES:
  ld a,(hl)
  cp ' '
  ret nz         ; a word, or the end
  inc hl
  jr SPACES

; Decimal digits at HL to A. The number
; ends at a space or a zero. Carry: no
; digit, another character or more than
; 255. Changes DE and HL.

NUM:
  ld a,(hl)
  sub '0'
  cp 10
  ccf
  ret c          ; no digit leads
  ld e,0         ; the number so far

NUM1:
  ld a,(hl)
  sub '0'
  cp 10
  jr nc,NUM2     ; past the digits
  ld d,a         ; this digit
  ld a,e
  cp 26
  ccf
  ret c          ; ten times is past 255
  add a,a
  ld e,a         ; twice
  add a,a
  add a,a        ; eight times
  add a,e        ; ten times
  add a,d        ; and the digit
  ret c          ; past 255
  ld e,a
  inc hl
  jr NUM1

NUM2:
  ld a,(hl)
  and $DF        ; a space or a zero
  scf
  ret nz         ; another character
  ld a,e
  or a           ; carry clear
  ret

WORD:     DB    "AREA $"
CRLF:     DB    13,10,"$"
APART:    DB    "KEPT APART$"
MIXMSG:   DB    "MIXED$"
HELP:     DB    "AREA [n [NAME]]$"
AREA:     DB    0
FCB:      DS    36
