; SHELL.SVC's built-ins that left the
; ROM: SERVICES and COPY, with a copy
; of the ROM's name parser. Included by
; shell.asm, whose LINE enters each
; handler with HL after its word.

; SERVICES: each resident from the
; lowest owner, B at LINE, upward: its
; header's name and its pages, up to
; the next owner or the stub's page, C
; at LINE. Each line starts with CR LF,
; so the ROM's blank line after the
; last is its line end, as before.

CMDSVC:
  ld a,(LOWPG)   ; the lowest owner

SV1:
  or a
  jr z,SV3       ; the list's end
  ld h,a         ; its header page
  call CRLF      ; a new line, HL kept
  ld l,17        ; the header's name
  ld b,8
  call PUTTRIM   ; its name
  ld e,SPACE
  call PUTC      ; then a space
  push hl        ; the owner's page
  ld l,8         ; the next owner's page
  ld a,(hl)      ; 0: the stub next
  or a
  jr nz,SV2      ; 0: the stub is next
  ld a,(STUBPG)  ; the stub's page

SV2:
  sub h          ; the pages it owns
  call PUTDEC8   ; then the count
  pop hl         ; the owner's page
  ld l,8
  ld a,(hl)      ; the next owner
  jr SV1         ; the next owner

SV3:
  jp BDONE       ; code 0

; COPY source destination, as the ROM's
; was: two unambiguous names, checked
; before any I/O. FCBONE is the source,
; CFCB the destination, 0080h the
; record. A blank destination name
; takes the source's name and type. The
; same name twice is refused.

CMDCOPY:
  push hl        ; the tail
  call CRLF      ; after the line
  pop hl
  ld de,FCBONE   ; the source FCB
  call CPNAME    ; the source
  ld de,CFCB     ; the destination's
  call CPPARSE   ; the destination
  call ENDCHK    ; nothing after it
  inc de         ; the name's first byte
  ld a,(de)
  cp SPACE       ; blank?
  jr nz,CPD1     ; a name was given
  ld hl,FCBONE+1
  ld bc,11
  ldir           ; the source's name

CPD1:
  call CPCHK     ; the destination
  ld hl,FCBONE   ; compare the two
  ld de,CFCB
  ld b,12        ; drive, name, type

CPSAME:
  ld a,(de)
  cp (hl)        ; same byte?
  jr nz,CPGO     ; they differ
  inc hl
  inc de
  djnz CPSAME    ; all twelve

CPBAD:
  jp BADW

; Open the source, then delete and make
; the destination: replacing a file is
; destructive before copying begins.

CPGO:
  ld de,DEFDMA
  ld c,26        ; 26: set the DMA
  call BDOS      ; DMA 0080h
  call DOSSEQ
  DB 15*2+0      ; open the source
  inc a          ; FFh to zero
  ld de,CPNOSRC
  jr z,CPFAIL    ; FFh: none
  call DOSSEQ
  DB 19*2+1      ; delete the old one
  call DOSSEQ
  DB 22*2+1      ; then make it
  inc a          ; FFh to zero
  ld de,CPNODST
  jr z,CPFAIL    ; FFh: no room
  ld hl,0        ; no records yet
  ld (CCOUNT),hl

; Read a record and write it, counting
; the writes, until a read fails.

CPLOOP:
  call DOSSEQ
  DB 20*2+0      ; read the source
  or a           ; 0: a record read
  jr nz,CPDONE   ; its end or an error
  call DOSSEQ
  DB 21*2+1      ; write the destination
  or a           ; 0: written
  jr nz,CPWERR
  ld hl,(CCOUNT)
  inc hl         ; one more record
  ld (CCOUNT),hl
  jr CPLOOP      ; the next record

; Close the destination, then print
; COPIED and the count in hex.

CPDONE:
  call DOSSEQ
  DB 16*2+1      ; close the destination
  inc a          ; FFh to zero
  ld de,CPCLOSE
  jr z,CPFAIL    ; FFh: not closed
  ld de,CPCOPIED
  call PUTS      ; COPIED
  ld a,(CCOUNT+1)
  call PUTHEX    ; high byte first
  ld a,(CCOUNT)
  call PUTHEX    ; low byte
  call CRLF      ; after the count
  jp BDONE       ; code 0

; A failed write: close the destination
; and report it. Earlier writes stay.

CPWERR:
  call DOSSEQ    ; close it anyway
  DB 16*2+1      ; close it
  ld de,CPWRITE

CPFAIL:
  jp ERRMSG      ; code FF00h

; A name at HL into the FCB at DE, as
; CPPARSE, and refused through BADW if
; empty or wild. CPCHK checks the FCB
; parsed last. HL is kept.

CPNAME:
  call CPPARSE   ; parse, then check

CPCHK:
  call UNAMBIG   ; empty or wild?
  jr c,CPBAD     ; empty or wild
  ret

; Past spaces, parse a name at HL into
; the FCB at DE, refusing a bad one
; through BADW. A zero drive becomes
; the current one. Returns HL at the
; delimiter and DE at the FCB.

CPPARSE:
  call SKIPSP
  push de        ; keep the FCB
  call PARSEFCB
  pop de
  jr c,CPBAD     ; a bad name
  ld a,(de)      ; its drive byte
  or a
  ret nz         ; a drive was named
  ld a,(CURDSK)
  and $0F        ; the current drive
  inc a          ; the current drive
  ld (de),a
  ret

; Refuse text after the last name.

ENDCHK:
  call SKIPSP    ; past spaces
  or a
  ret z          ; the tail's end
  jp BADW        ; refused

; BDOS by the byte after the CALL: the
; function times two, with bit 0 the
; FCB, 0 FCBONE and 1 CFCB.

DOSSEQ:
  ex (sp),hl     ; HL: after CALL
  ld c,(hl)      ; the byte after CALL
  inc hl         ; past the byte
  ex (sp),hl     ; return past it
  srl c          ; C = the function
  ld de,FCBONE   ; bit 0 clear
  jr nc,DOSGO    ; bit 0 clear
  ld de,CFCB     ; bit 0 set

DOSGO:
  jp BDOS

CPNOSRC: DB "NO SOURCE$"
CPNODST: DB "CANNOT MAKE DEST$"
CPWRITE: DB "WRITE ERROR$"
CPCLOSE: DB "CLOSE ERROR$"
CPCOPIED: DB "COPIED $"

; The ROM's name parser, copied: the
; name at HL into the 36-byte FCB at
; DE, whose drive, name, type and rest
; are cleared first. Carry for a bad
; name or drive. Returns HL at the
; delimiter. FCBBASE keeps the FCB for
; UNAMBIG.

PARSEFCB:
  ld (FCBBASE),de
  push de        ; the FCB's base
  xor a
  ld (de),a      ; the default drive
  inc de         ; the name next
  ld b,11
  ld a,SPACE     ; blank it

FCBSPC:
  ld (de),a      ; a blank in the name
  inc de
  djnz FCBSPC    ; all eleven bytes
  xor a
  ld b,24        ; 24 zero bytes next

FCBZERO:
  ld (de),a      ; the rest zero
  inc de
  djnz FCBZERO   ; to byte 35
  pop de
  ld a,(hl)      ; the name's first
  or a
  ret z          ; no name
  inc hl         ; look at the next
  ld a,(hl)
  dec hl
  cp ':'         ; a drive's colon?
  jr nz,FCBNAME  ; no drive
  ld a,(hl)
  sub 'A'        ; A=0 for A:
  cp 16
  jr nc,PLEND    ; past P: refused
  inc a
  ld (de),a      ; the drive, 1 for A
  inc hl
  inc hl         ; past 'd:'

FCBNAME:
  inc de
  ld b,8         ; eight bytes
  call PARFLD    ; the name
  ret c
  ld a,(hl)      ; after the name
  cp '.'
  jr z,FCBDOT    ; a type follows
  or a           ; NZ for a name
  ret

FCBDOT:
  inc hl
  ld a,e         ; E past the unused
  add a,b        ; past the name's
  ld e,a         ; unused bytes
  jr nc,FCBTYP
  inc d          ; carry into D

FCBTYP:
  ld b,3         ; the type

; A field of B bytes: its characters,
; or ? for each left after a *. Carry
; for a bad character or a field too
; long.

PARFLD:
  call FCBEND    ; Z at the field's end
  ret z          ; the field's end
  cp '*'         ; a star fills it
  jr z,PARSTAR
  call VALIDCHR  ; refused characters
  ret c          ; a bad character
  ld (de),a      ; store it
  inc de
  inc hl
  djnz PARFLD    ; the field's next
  call FCBEND    ; past its end?
  ret z          ; it fits exactly

PARLONG:
  inc hl
  call FCBEND    ; a longer field
  jr nz,PARLONG  ; past the extra

PLEND:
  scf            ; carry: refused
  ret

; Carry if the FCB at FCBBASE has no
; name, or a ? in its name or type.
; HL and BC are kept.

UNAMBIG:
  push hl
  push bc
  ld hl,(FCBBASE)
  inc hl
  ld a,(hl)      ; the name's first
  cp SPACE       ; blank: no name
  jr z,CHRRET    ; no name: Z, carry
  ld bc,11       ; name and type
  ld a,'?'       ; wild?
  cpir           ; Z if a ? is found
  jr CHRRET

; Carry if A is one of BADCHARS. HL and
; BC are kept.

VALIDCHR:
  push hl
  push bc
  ld hl,BADCHARS
  ld bc,13       ; thirteen of them
  cpir           ; Z if A is one

CHRRET:
  pop bc         ; restore
  pop hl
  scf            ; Z: carry, refused
  ret z          ; refused
  or a           ; NZ: clear carry
  ret

PARSTAR:
  ld a,'?'       ; a star means ?s

STARLP:
  ld (de),a      ; to the field's end
  inc de
  djnz STARLP
  inc hl         ; past the *

PARIGN:
  call FCBEND    ; Z: its end
  ret z          ; past what follows *
  inc hl
  jr PARIGN

; Z at a name's end: a zero, a space,
; = or the dot. A is the byte.

FCBEND:
  ld a,(hl)
  or a           ; zero ends it
  ret z
  cp SPACE
  ret z          ; space ends it
  cp '='
  ret z          ; = ends it
  cp '.'
  ret            ; Z for the dot

BADCHARS: DB "<>,;:[]%|()/",92
