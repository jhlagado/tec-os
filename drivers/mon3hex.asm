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

CHEX:
  xor a
  ld (HOVR),a    ; no base override
  call SKIP      ; optional destination
  jr z,HXARGS    ; retain file addresses
  call HEXW      ; the binary-load form
  jp c,BAD
  ld (HBASE),de  ; destination anchor
  ld a,1
  ld (HOVR),a    ; rebase requested

HXARGS:
  ld hl,0-1      ; no lower address yet
  ld (HMIN),hl   ; initial minimum
  call DMA80
  xor a          ; scan and check first

CHEX1:
  ld (HWRT),a    ; scan, check, copy
  xor a
  ld (FCB+12),a  ; first extent
  ld (FCB+32),a  ; first record
  ld (HANY),a    ; no data byte yet
  call OPEN
  jp z,LFAIL     ; no file at this pass
  call HPASS     ; whole file, to EOF
  jp c,LFAIL
  ld a,(HANY)
  or a
  jp z,LFAIL     ; no data was loaded
  ld a,(HWRT)
  or a
  jr nz,HXAFTER  ; a later pass
  call HSETGO    ; GO's address, once
  ld a,(HOVR)
  or a           ; a base override?
  ld a,2         ; plain files: copy
  jr z,CHEX1
  dec a          ; check rebased ranges
  jr CHEX1

HXAFTER:
  cp 1           ; validating or copied?
  jr nz,HXDONE
  ld a,2         ; final copying pass
  jr CHEX1

HXDONE:
  ld hl,(HGO)    ; GO's address
  jp LGOOD

; GO uses the lowest data address, or
; the requested base when the data is
; rebased. Changes AF and HL.

HSETGO:
  ld hl,(HMIN)   ; original lowest byte
  ld a,(HOVR)
  or a
  jr z,HBASE1    ; keep original base
  ld hl,(HBASE)  ; lowest destination

HBASE1:
  ld (HGO),hl    ; remember it
  ret

; DE's logical address rebased without
; wrapping. The subtraction cannot
; borrow for a valid data record.

HDEST:
  ld a,(HOVR)
  or a
  ret z          ; original addresses
  ex de,hl
  ld de,(HMIN)   ; source anchor
  or a
  sbc hl,de      ; offset from lowest
  ret c
  ld de,(HBASE)  ; destination anchor
  add hl,de      ; carry: wrapped base
  ex de,hl
  ret

; A pass reads text through DE. Deep
; syntax faults unwind to HSP.

HPASS:
  ld (HSP),sp
  call HREAD     ; first text record

HP1:
  call GETC
  cp ':'
  jr z,HREC
  cp 13          ; inter-record CR
  jr z,HP1
  cp 10          ; inter-record LF
  jr z,HP1
  scf
  ret

; A record sums bytes in C, with its
; data length in B and text at DE.

HREC:
  ld c,0         ; checksum accumulator
  call GETB
  ld b,a         ; bytes in this record
  call GETB
  ld (HADR+1),a  ; high address byte
  call GETB
  ld (HADR),a    ; low address byte
  call GETB
  cp 1           ; end-of-file record
  jp z,HEND
  cp 5           ; an entry record is
  jr z,HSKIP     ; read, not acted on
  or a
  scf
  ret nz         ; other types refused
  or b           ; any data bytes?
  scf
  ret z          ; empty data refused
  ld (HANY),a    ; at least one byte
  push de
  call HRANGE
  pop de
  ret c
  ld ix,(HTARG)  ; this record
  ld a,(HWRT)
  cp 2           ; only copying writes
  jr z,HW1

HC1:
  call GETB      ; validate, do not copy
  djnz HC1
  jr HSUM

; An entry record's bytes are summed
; like any record's and then dropped:
; its length and address fields may
; hold anything.

HSKIP:
  inc b
  dec b          ; no bytes to read?
  jr nz,HC1
  jr HSUM

HW1:
  call GETB      ; already checked
  ld (ix+0),a    ; final destination
  inc ix
  djnz HW1

HSUM:
  call GETB      ; include checksum
  ld a,c
  or a
  jp z,HP1       ; zero sum: next record
  scf
  ret

; First check the source arithmetic,
; allowing the last byte at FFFFh.
; With an override, only destination
; protection is relevant.

HRANGE:
  ld a,(HWRT)
  or a
  jr nz,HRMAP    ; source checked
  ld hl,(HADR)
  ld e,b         ; record length
  ld d,0         ; unsigned byte length
  add hl,de
  jr nc,HRMIN    ; source did not wrap
  ld a,h
  or l           ; exactly 10000h is OK
  scf
  ret nz         ; beyond 10000h

HRMIN:
  ld hl,(HADR)
  ld de,(HMIN)   ; source anchor
  or a
  sbc hl,de      ; compare source starts
  jr nc,HRKEEP   ; current minimum wins
  ld hl,(HADR)
  ld (HMIN),hl   ; new lowest address

HRKEEP:
  ld a,(HOVR)
  or a
  ret nz         ; no writing this pass

HRMAP:
  ld de,(HADR)
  call HDEST
  ret c
  ld (HTARG),de  ; resolved destination
  ld l,b
  ld h,0
  jp RANGE       ; full destination span

; EOF is exactly 00 0000 01 FF. After
; it only line ends and CP/M padding
; are accepted, up to the text's end.

HEND:
  ld a,b         ; EOF holds no data
  or a
  scf
  ret nz         ; wrong record length
  ld hl,(HADR)   ; record address
  ld a,h
  or l
  scf
  ret nz         ; EOF address not zero
  call GETB      ; EOF checksum
  ld a,c
  or a
  scf
  ret nz

HE1:
  call GETC      ; padding after EOF
  cp $1A         ; CP/M text end
  ret z
  or a
  jr z,HE1
  cp 13          ; permitted line ending
  jr z,HE1
  cp 10          ; permitted LF
  jr z,HE1
  scf
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

; HEX scan and rebase state.

HADR: DW 0       ; a HEX record's start
HWRT: DB 0       ; scan, check or copy
HANY: DB 0       ; a data record read
HSP: DW 0        ; the HEX pass's stack
HMIN: DW 0       ; lowest data address
HBASE: DW 0      ; requested new base
HGO: DW 0        ; GO's address
HTARG: DW 0      ; this record's target
HOVR: DB 0       ; a base was supplied
