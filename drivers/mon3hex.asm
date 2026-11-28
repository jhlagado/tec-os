; Intel HEX loading. A checking pass
; reads the whole file before writes.
; An override maps the lowest data
; address to its requested base. A
; further checking pass validates all
; rebased ranges. Absolute machine
; operands are not relocated. The last
; pass copies data. GO's address is the
; lowest data address, rebased with the
; data: an entry record in the file is
; read and passed over.

loadHex:
  xor a
  ld (HxRebase),a   ; no base override
  call skip      ; optional destination
  jr z,.args     ; retain file addresses
  call hexWord   ; the binary-load form
  jp c,bad
  ld (HxBase),de    ; destination anchor
  ld a,1
  ld (HxRebase),a   ; rebase requested

.args:
  ld hl,0-1      ; no lower address yet
  ld (HxLowest),hl  ; initial minimum
  call dmaReset
  xor a          ; scan and check first

.pass:
  ld (HxMode),a  ; scan, check, copy
  xor a
  ld (Fcb+12),a  ; first extent
  ld (Fcb+32),a  ; first record
  ld (HxData),a  ; no data byte yet
  call open
  jp z,loadFail  ; no file at this pass
  call hxPass    ; whole file, to EOF
  jp c,loadFail
  ld a,(HxData)
  or a
  jp z,loadFail  ; no data was loaded
  ld a,(HxMode)
  or a
  jr nz,.after   ; a later pass
  call hxSetGo   ; GO's address, once
  ld a,(HxRebase)
  or a           ; a base override?
  ld a,2         ; plain files: copy
  jr z,.pass
  dec a          ; check rebased ranges
  jr .pass

.after:
  cp 1           ; validating or copied?
  jr nz,.done
  ld a,2         ; final copying pass
  jr .pass

.done:
  ld hl,(HxGo)   ; GO's address
  jp loadGood

; GO uses the lowest data address, or
; the requested base when the data is
; rebased. Changes AF and HL.

hxSetGo:
  ld hl,(HxLowest)  ; original lowest
  ld a,(HxRebase)
  or a
  jr z,.store    ; keep original base
  ld hl,(HxBase)    ; lowest destination

.store:
  ld (HxGo),hl   ; remember it
  ret

; DE's logical address rebased without
; wrapping. The subtraction cannot
; borrow for a valid data record.

hxDest:
  ld a,(HxRebase)
  or a
  ret z          ; original addresses
  ex de,hl
  ld de,(HxLowest)  ; source anchor
  or a
  sbc hl,de      ; offset from lowest
  ret c
  ld de,(HxBase)    ; destination anchor
  add hl,de      ; carry: wrapped base
  ex de,hl
  ret

; A pass reads text through DE. Deep
; syntax faults unwind to HxStack.

hxPass:
  ld (HxStack),sp
  call hxRead    ; first text record

hxNext:
  call hxChar
  cp ':'
  jr z,hxRecord
  cp 13          ; inter-record CR
  jr z,hxNext
  cp 10          ; inter-record LF
  jr z,hxNext
  scf
  ret

; A record sums bytes in C, with its
; data length in B and text at DE.

hxRecord:
  ld c,0         ; checksum accumulator
  call hxByte
  ld b,a         ; bytes in this record
  call hxByte
  ld (HxAddr+1),a   ; high address byte
  call hxByte
  ld (HxAddr),a  ; low address byte
  call hxByte
  cp 1           ; end-of-file record
  jp z,hxEnd
  cp 5           ; an entry record is
  jr z,.entry    ; read, not acted on
  or a
  scf
  ret nz         ; other types refused
  or b           ; any data bytes?
  scf
  ret z          ; empty data refused
  ld (HxData),a  ; at least one byte
  push de
  call hxRange
  pop de
  ret c
  ld ix,(HxTarget)  ; this record
  ld a,(HxMode)
  cp 2           ; only copying writes
  jr z,.write

.check:
  call hxByte    ; validate, do not copy
  djnz .check
  jr .sum

; An entry record's bytes are summed
; like any record's and then dropped:
; its length and address fields may
; hold anything.

.entry:
  inc b
  dec b          ; no bytes to read?
  jr nz,.check
  jr .sum

.write:
  call hxByte    ; already checked
  ld (ix+0),a    ; final destination
  inc ix
  djnz .write

.sum:
  call hxByte    ; include checksum
  ld a,c
  or a
  jp z,hxNext    ; zero sum: next record
  scf
  ret

; First check the source arithmetic,
; allowing the last byte at FFFFh.
; With an override, only destination
; protection is relevant.

hxRange:
  ld a,(HxMode)
  or a
  jr nz,.map     ; source checked
  ld hl,(HxAddr)
  ld e,b         ; record length
  ld d,0         ; unsigned byte length
  add hl,de
  jr nc,.lowest  ; source did not wrap
  ld a,h
  or l           ; exactly 10000h is OK
  scf
  ret nz         ; beyond 10000h

.lowest:
  ld hl,(HxAddr)
  ld de,(HxLowest)  ; source anchor
  or a
  sbc hl,de      ; compare source starts
  jr nc,.keep    ; current minimum wins
  ld hl,(HxAddr)
  ld (HxLowest),hl  ; new lowest address

.keep:
  ld a,(HxRebase)
  or a
  ret nz         ; no writing this pass

.map:
  ld de,(HxAddr)
  call hxDest
  ret c
  ld (HxTarget),de  ; the destination
  ld l,b
  ld h,0
  jp range       ; full destination span

; EOF is exactly 00 0000 01 FF. After
; it only line ends and CP/M padding
; are accepted, up to the text's end.

hxEnd:
  ld a,b         ; EOF holds no data
  or a
  scf
  ret nz         ; wrong record length
  ld hl,(HxAddr)    ; record address
  ld a,h
  or l
  scf
  ret nz         ; EOF address not zero
  call hxByte    ; EOF checksum
  ld a,c
  or a
  scf
  ret nz

.pad:
  call hxChar    ; padding after EOF
  cp $1A         ; CP/M text end
  ret z
  or a
  jr z,.pad
  cp 13          ; permitted line ending
  jr z,.pad
  cp 10          ; permitted LF
  jr z,.pad
  scf
  ret

; Two hex digits as the byte in A, also
; added to C. A fault returns from the
; pass with carry. Clobbers H.

hxByte:
  call hxChar
  call hexDigit  ; the high digit
  jr c,.bad      ; not a digit
  add a,a
  add a,a
  add a,a
  add a,a        ; to the high half
  ld h,a
  call hxChar
  call hexDigit  ; the low digit
  jr c,.bad
  or h           ; the byte
  ld h,a
  add a,c
  ld c,a         ; summed
  ld a,h         ; the byte again
  ret

.bad:
  ld sp,(HxStack)   ; out of the pass
  scf
  ret

; The next text byte in A, at DE in the
; record buffer, the next record read
; when this one is used up.

hxChar:
  ld a,(de)      ; the byte
  inc e          ; past 00FFh: E is 0
  ret nz
  push af
  call hxRead    ; the next record
  pop af
  ret

; Read the next record into 0080h, and
; point DE at it. At the file's end a
; 1Ah there ends the text. Keeps BC, HL
; and IX.

hxRead:
  push bc
  push hl
  push ix        ; kept over BDOS
  ld de,Fcb
  ld c,20        ; read a record
  call Bdos
  pop ix
  pop hl
  pop bc
  ld de,$0080    ; D stays 0
  or a
  ret z          ; a record read
  ld a,$1A
  ld (de),a      ; the end: 1Ah
  ret

; HEX scan and rebase state.

HxAddr: DW 0     ; a HEX record's start
HxMode: DB 0     ; scan, check or copy
HxData: DB 0     ; a data record read
HxStack: DW 0    ; the HEX pass's stack
HxLowest: DW 0   ; lowest data address
HxBase: DW 0     ; requested new base
HxGo: DW 0       ; GO's address
HxTarget: DW 0   ; this record's target
HxRebase: DB 0   ; a base was supplied

; Read a hex word of one to four digits
; at HL into DE. Carry if it has no
; digit, a fifth digit, or anything but
; trailing spaces and the line's end
; after it. Clobbers A and B.

hexWord:
  ld de,0
  ld b,4         ; at most four digits
  ld a,(hl)
  call hexDigit
  ret c          ; no digit

.digit:
  ex de,hl       ; HL = the word
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl      ; one digit up
  or l
  ld l,a         ; the new digit in
  ex de,hl
  inc hl
  ld a,(hl)
  call hexDigit
  jr c,.end      ; the number's end
  djnz .digit
  scf            ; a fifth digit
  ret

.end:
  ld a,(hl)
  cp ' '+1       ; a space or the end
  ccf            ; carry: text joined
  ret c
  call skip      ; no further operand
  ret z
  scf
  ret

; A hex digit's value from A, either
; case. Carry if it is none.

hexDigit:
  cp 'a'
  jr c,.value    ; not lower case
  sub $20        ; a to A

.value:
  sub '0'
  ret c          ; below 0
  cp 10
  ccf
  ret nc         ; 0 to 9
  sub 7          ; A to F as 10-15
  cp 10
  ret c          ; between 9 and A
  cp 16
  ccf            ; carry past F
  ret

; Write HL as four hex digits at DE,
; or A as two at aToStr. DE steps on.

hlToStr:
  ld a,h
  call aToStr    ; the high byte
  ld a,l

aToStr:
  push af        ; the low digit
  rrca
  rrca
  rrca
  rrca           ; the high digit
  call .nibble
  pop af

.nibble:
  call hexChar
  ld (de),a      ; the character
  inc de
  ret

; A's low four bits as a hex digit's
; character. Clobbers F.

hexChar:
  and $0F
  add a,$90      ; DAA's hex trick
  daa
  adc a,$40
  daa            ; 0-9, A-F
  ret
