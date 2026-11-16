; PUT n NAME [v]: write n 256-byte pages
; to NAME through the BDOS, for a test
; that needs a file of a known size and
; content. n and v are decimal, 0-255.
; Without v, byte k of record r is r+k,
; modulo 256. With v, every byte is v.
;
; PUT deletes NAME, makes it, writes two
; records for each page and closes it.
; A full disk or directory prints
; NO SPACE and sets return code FF00h.
; A bad n, NAME or v prints the usage
; and writes nothing.

BDOS      EQU   $0005
FCB1      EQU   $005C
FCB2      EQU   $006C
TAIL      EQU   $0080
RECORD    EQU   $0080

  ORG $0100

; The CCP parsed n into the FCB at 005Ch
; as a file name, and NAME into the one
; at 006Ch. v is read from the tail.

START:
  ld hl,FCB1+1   ; n's digits
  call NUM
  jp c,USAGE     ; no number
  ld l,a
  ld h,0
  add hl,hl      ; two records a page
  ld (RECS),hl
  ld a,(FCB2+1)  ; NAME's first letter
  cp ' '
  jp z,USAGE     ; no NAME
  ld hl,TAIL+1   ; the tail as typed
  call WORD      ; past n
  call WORD      ; past NAME
  or a
  jr z,OPEN      ; no v: the ramp
  call NUM
  jp c,USAGE     ; v is no number
  ld (FIRST),a   ; every byte is v
  xor a
  ld (STEP),a    ; and none counts up

; Copy NAME's 16 bytes to a whole FCB
; with the rest zero, then delete any
; old file and make the new one.

OPEN:
  ld hl,FCB2
  ld de,FCB
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
  jr z,FULL      ; FFh: no entry free

; Write the records left. The record is
; built in the default DMA buffer, which
; the CCP selected before entry.

NEXT:
  ld hl,(RECS)
  ld a,h
  or l
  jr z,CLOSE     ; none left
  dec hl         ; one fewer to write
  ld (RECS),hl
  ld hl,(FIRST)  ; L first byte, H step
  ld de,RECORD
  ld b,128       ; bytes in a record

BUILD:
  ld a,l
  ld (de),a
  add a,h        ; the next byte
  ld l,a
  inc de
  djnz BUILD
  ld a,(FIRST)
  add a,h        ; the next record
  ld (FIRST),a   ; starts a step higher
  ld c,21        ; 21: write a record
  call FILE
  or a
  jr z,NEXT      ; zero: written
  ld c,16        ; no room: close with
  call FILE      ; the records written

FULL:
  ld de,NOSPACE
  ld c,9         ; 9: print
  call BDOS
  ld de,$FF00    ; a failed command
  ld c,108       ; 108: return code
  jp BDOS

CLOSE:
  ld c,16        ; 16: close
  call FILE
  inc a
  jr z,FULL      ; FFh: not written
  ret

USAGE:
  ld de,HELP
  ld c,9         ; 9: print
  jp BDOS

; BDOS function C on the file's FCB.

FILE:
  ld de,FCB
  jp BDOS

; Skip spaces at HL, then one word and
; the spaces after it. Returns A, the
; byte HL is left at: zero at the end of
; the tail.

WORD:
  call SPACES

WORD1:
  ld a,(hl)
  or a
  ret z          ; the tail ended
  cp ' '
  jr z,SPACES    ; the word ended
  inc hl
  jr WORD1

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

NOSPACE:  DB    "NO SPACE$"
HELP:     DB    "PUT n NAME [v]$"

; The first byte of the next record and
; the step from each byte to the next:
; 0 and 1 for the ramp, v and 0 for v.

FIRST:    DB    0
STEP:     DB    1
RECS:     DW    0
FCB:      DS    36
