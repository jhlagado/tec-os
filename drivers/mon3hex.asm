; MON3.SVC: LOAD name.HEX, included by
; mon3.asm. The file is read twice by
; 128-byte records into 0080h. The
; first pass checks every record and
; writes nothing; the second writes
; them. So a file with any fault is
; refused with nothing written, and a
; good one ends runnable at 4000h.

; The rules: each record ':', a length,
; an address, a type and its checksum,
; in hex of either case. Data records
; hold at least one byte, each within
; the bounds a .BIN load has. Between
; records only CR and LF may come. One
; end record, type 01h with no data,
; ends the records; after it only CR,
; LF and 00h, to the text's end: the
; first 1Ah, or the file's last
; record's end. docs/mon3.md has more.

; LOAD name.HEX takes no address. HWRT
; is 0 for the checking pass and 1 for
; the writing one.

CHEX:
  call SKIP
  jp nz,BAD      ; an address: refused
  call DMA80     ; records into 0080h
  xor a          ; the checking pass

CHEX1:
  ld (HWRT),a    ; this pass
  xor a
  ld (FCB+12),a  ; from the file's start
  ld (FCB+32),a
  call OPEN
  jp z,LFAIL     ; not found
  call HPASS
  jp c,LFAIL     ; a fault: refused
  ld a,(HWRT)
  inc a          ; the next pass
  cp 2
  jr c,CHEX1     ; then the writing pass
  ld hl,$4000    ; GO's default
  jp LGOOD

; One pass over the open file. Carry if
; the text breaks a rule. GETB's faults
; come back here by HSP. D is 0 and E
; the place in the record buffer.

HPASS:
  ld (HSP),sp    ; for a fault deep in
  call HREAD     ; the first record

HP1:
  call GETC      ; between records
  cp ':'
  jr z,HREC      ; a record
  cp 13
  jr z,HP1       ; CR
  cp 10
  jr z,HP1       ; LF
  scf            ; anything else
  ret

; A record: C sums its bytes, B holds
; its length. The type decides.

HREC:
  ld c,0         ; the sum so far
  call GETB      ; the length
  ld b,a
  call GETB      ; the address
  ld (HADR+1),a  ; its high byte
  call GETB
  ld (HADR),a    ; and its low
  call GETB      ; the type
  dec a
  jr z,HEND      ; 01h: the end
  inc a          ; 00h: data
  scf
  ret nz         ; not data
  or b           ; A is 0: Z if B is
  scf
  ret z          ; no bytes in it
  push de        ; the buffer place
  ld de,(HADR)
  ld l,b
  ld h,0         ; HL = the length
  call RANGE     ; as a .BIN load is
  pop de
  ret c          ; out of bounds
  ld ix,(HADR)   ; where it goes
  ld a,(HWRT)
  or a           ; which pass
  jr nz,HW1      ; the writing pass

HC1:
  call GETB      ; checked only
  djnz HC1
  jr HSUM

HW1:
  call GETB      ; the next byte
  ld (ix+0),a    ; written
  inc ix
  djnz HW1       ; each byte

HSUM:
  call GETB      ; the checksum
  ld a,c
  or a           ; Z: the sum is 0
  jr z,HP1       ; good: the next
  scf
  ret

; The end record: no data and a good
; checksum. A is 0.

HEND:
  or b           ; Z: no data
  scf
  ret nz         ; data in it
  call GETB      ; the checksum
  ld a,c
  or a           ; Z: the sum is 0
  scf
  ret nz         ; a bad end record

HE1:
  call GETC      ; after the end
  cp $1A
  ret z          ; the text's end, NC
  or a
  jr z,HE1       ; 00h
  cp 13
  jr z,HE1       ; CR
  cp 10
  jr z,HE1       ; LF
  scf            ; anything else
  ret

; Two hex digits as the byte in A, also
; added to C. A fault returns from the
; pass with carry. Clobbers H.

GETB:
  call GETC
  call HEXD      ; the high digit
  jr c,HBAD      ; not a digit
  add a,a
  add a,a
  add a,a
  add a,a        ; to the high half
  ld h,a
  call GETC
  call HEXD      ; the low digit
  jr c,HBAD
  or h           ; the byte
  ld h,a
  add a,c
  ld c,a         ; summed
  ld a,h         ; the byte again
  ret

HBAD:
  ld sp,(HSP)    ; out of the pass
  scf
  ret

; The next text byte in A, at DE in the
; record buffer, the next record read
; when this one is used up.

GETC:
  ld a,(de)      ; the byte
  inc e          ; past 00FFh: E is 0
  ret nz
  push af
  call HREAD     ; the next record
  pop af
  ret

; Read the next record into 0080h, and
; point DE at it. At the file's end a
; 1Ah there ends the text. Keeps BC, HL
; and IX.

HREAD:
  push bc
  push hl
  push ix        ; kept over BDOS
  ld de,FCB
  ld c,20        ; read a record
  call BDOS
  pop ix
  pop hl
  pop bc
  ld de,$0080    ; D stays 0
  or a
  ret z          ; a record read
  ld a,$1A
  ld (de),a      ; the end: 1Ah
  ret
