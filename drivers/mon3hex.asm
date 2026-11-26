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

cHex:
  xor a
  ld (HOvr),a    ; no base override
  call skip      ; optional destination
  jr z,hxArgs    ; retain file addresses
  call hexW      ; the binary-load form
  jp c,bad
  ld (HBase),de  ; destination anchor
  ld a,1
  ld (HOvr),a    ; rebase requested

hxArgs:
  ld hl,0-1      ; no lower address yet
  ld (HMin),hl   ; initial minimum
  call dma80
  xor a          ; scan and check first

cHex1:
  ld (HWrt),a    ; scan, check, copy
  xor a
  ld (Fcb+12),a  ; first extent
  ld (Fcb+32),a  ; first record
  ld (HAny),a    ; no data byte yet
  call open
  jp z,lFail     ; no file at this pass
  call hPass     ; whole file, to EOF
  jp c,lFail
  ld a,(HAny)
  or a
  jp z,lFail     ; no data was loaded
  ld a,(HWrt)
  or a
  jr nz,hxAfter  ; a later pass
  call hSetGo    ; GO's address, once
  ld a,(HOvr)
  or a           ; a base override?
  ld a,2         ; plain files: copy
  jr z,cHex1
  dec a          ; check rebased ranges
  jr cHex1

hxAfter:
  cp 1           ; validating or copied?
  jr nz,hxDone
  ld a,2         ; final copying pass
  jr cHex1

hxDone:
  ld hl,(HGo)    ; GO's address
  jp lGood

; GO uses the lowest data address, or
; the requested base when the data is
; rebased. Changes AF and HL.

hSetGo:
  ld hl,(HMin)   ; original lowest byte
  ld a,(HOvr)
  or a
  jr z,hBase1    ; keep original base
  ld hl,(HBase)  ; lowest destination

hBase1:
  ld (HGo),hl    ; remember it
  ret

; DE's logical address rebased without
; wrapping. The subtraction cannot
; borrow for a valid data record.

hDest:
  ld a,(HOvr)
  or a
  ret z          ; original addresses
  ex de,hl
  ld de,(HMin)   ; source anchor
  or a
  sbc hl,de      ; offset from lowest
  ret c
  ld de,(HBase)  ; destination anchor
  add hl,de      ; carry: wrapped base
  ex de,hl
  ret

; A pass reads text through DE. Deep
; syntax faults unwind to HSP.

hPass:
  ld (HSp),sp
  call hRead     ; first text record

hp1:
  call getC
  cp ':'
  jr z,hRec
  cp 13          ; inter-record CR
  jr z,hp1
  cp 10          ; inter-record LF
  jr z,hp1
  scf
  ret

; A record sums bytes in C, with its
; data length in B and text at DE.

hRec:
  ld c,0         ; checksum accumulator
  call getB
  ld b,a         ; bytes in this record
  call getB
  ld (HAdr+1),a  ; high address byte
  call getB
  ld (HAdr),a    ; low address byte
  call getB
  cp 1           ; end-of-file record
  jp z,hEnd
  cp 5           ; an entry record is
  jr z,hSkip     ; read, not acted on
  or a
  scf
  ret nz         ; other types refused
  or b           ; any data bytes?
  scf
  ret z          ; empty data refused
  ld (HAny),a    ; at least one byte
  push de
  call hRange
  pop de
  ret c
  ld ix,(HTarg)  ; this record
  ld a,(HWrt)
  cp 2           ; only copying writes
  jr z,hw1

hc1:
  call getB      ; validate, do not copy
  djnz hc1
  jr hSum

; An entry record's bytes are summed
; like any record's and then dropped:
; its length and address fields may
; hold anything.

hSkip:
  inc b
  dec b          ; no bytes to read?
  jr nz,hc1
  jr hSum

hw1:
  call getB      ; already checked
  ld (ix+0),a    ; final destination
  inc ix
  djnz hw1

hSum:
  call getB      ; include checksum
  ld a,c
  or a
  jp z,hp1       ; zero sum: next record
  scf
  ret

; First check the source arithmetic,
; allowing the last byte at FFFFh.
; With an override, only destination
; protection is relevant.

hRange:
  ld a,(HWrt)
  or a
  jr nz,hrMap    ; source checked
  ld hl,(HAdr)
  ld e,b         ; record length
  ld d,0         ; unsigned byte length
  add hl,de
  jr nc,hrMin    ; source did not wrap
  ld a,h
  or l           ; exactly 10000h is OK
  scf
  ret nz         ; beyond 10000h

hrMin:
  ld hl,(HAdr)
  ld de,(HMin)   ; source anchor
  or a
  sbc hl,de      ; compare source starts
  jr nc,hrKeep   ; current minimum wins
  ld hl,(HAdr)
  ld (HMin),hl   ; new lowest address

hrKeep:
  ld a,(HOvr)
  or a
  ret nz         ; no writing this pass

hrMap:
  ld de,(HAdr)
  call hDest
  ret c
  ld (HTarg),de  ; resolved destination
  ld l,b
  ld h,0
  jp range       ; full destination span

; EOF is exactly 00 0000 01 FF. After
; it only line ends and CP/M padding
; are accepted, up to the text's end.

hEnd:
  ld a,b         ; EOF holds no data
  or a
  scf
  ret nz         ; wrong record length
  ld hl,(HAdr)   ; record address
  ld a,h
  or l
  scf
  ret nz         ; EOF address not zero
  call getB      ; EOF checksum
  ld a,c
  or a
  scf
  ret nz

he1:
  call getC      ; padding after EOF
  cp $1A         ; CP/M text end
  ret z
  or a
  jr z,he1
  cp 13          ; permitted line ending
  jr z,he1
  cp 10          ; permitted LF
  jr z,he1
  scf
  ret

; Two hex digits as the byte in A, also
; added to C. A fault returns from the
; pass with carry. Clobbers H.

getB:
  call getC
  call hexD      ; the high digit
  jr c,hBad      ; not a digit
  add a,a
  add a,a
  add a,a
  add a,a        ; to the high half
  ld h,a
  call getC
  call hexD      ; the low digit
  jr c,hBad
  or h           ; the byte
  ld h,a
  add a,c
  ld c,a         ; summed
  ld a,h         ; the byte again
  ret

hBad:
  ld sp,(HSp)    ; out of the pass
  scf
  ret

; The next text byte in A, at DE in the
; record buffer, the next record read
; when this one is used up.

getC:
  ld a,(de)      ; the byte
  inc e          ; past 00FFh: E is 0
  ret nz
  push af
  call hRead     ; the next record
  pop af
  ret

; Read the next record into 0080h, and
; point DE at it. At the file's end a
; 1Ah there ends the text. Keeps BC, HL
; and IX.

hRead:
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

HAdr: DW 0       ; a HEX record's start
HWrt: DB 0       ; scan, check or copy
HAny: DB 0       ; a data record read
HSp: DW 0        ; the HEX pass's stack
HMin: DW 0       ; lowest data address
HBase: DW 0      ; requested new base
HGo: DW 0        ; GO's address
HTarg: DW 0      ; this record's target
HOvr: DB 0       ; a base was supplied

; Read a hex word of one to four digits
; at HL into DE. Carry if it has no
; digit, a fifth digit, or anything but
; trailing spaces and the line's end
; after it. Clobbers A and B.

hexW:
  ld de,0
  ld b,4         ; at most four digits
  ld a,(hl)
  call hexD
  ret c          ; no digit

hexW1:
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
  call hexD
  jr c,hexW2     ; the number's end
  djnz hexW1
  scf            ; a fifth digit
  ret

hexW2:
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

hexD:
  cp 'a'
  jr c,hexD1     ; not lower case
  sub $20        ; a to A

hexD1:
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
; or A as two at HEXA. DE steps on.

hlStr:
  ld a,h
  call hexA      ; the high byte
  ld a,l

hexA:
  push af        ; the low digit
  rrca
  rrca
  rrca
  rrca           ; the high digit
  call hexN
  pop af

hexN:
  call hexC
  ld (de),a      ; the character
  inc de
  ret

; A's low four bits as a hex digit's
; character. Clobbers F.

hexC:
  and $0F
  add a,$90      ; DAA's hex trick
  daa
  adc a,$40
  daa            ; 0-9, A-F
  ret
