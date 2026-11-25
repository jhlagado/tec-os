; SHELL.SVC's DIR, with each file's size
; in bytes, and the numbers it prints.
; Included by shell.asm, whose LINE
; enters CMDDIR with HL after its word.

; DIR /W is the ROM's wide listing. DIR
; [d:][name] lists each match not
; hidden, one a row: its name and its
; size, the maximum end record times
; 128. An extent prepass builds a
; transient name/size table in the TPA,
; then two output passes list the rows.
; Then the count and bytes, free space
; by BDOS 46, and the drive's volume.

CMDDIR:
  call SKIPSP    ; to the operand
  ld a,(hl)
  cp '/'         ; a switch?
  jr nz,DR0      ; no switch
  inc hl
  ld a,(hl)      ; its letter
  dec hl
  and $DF        ; w or W
  cp 'W'         ; another is a bad
  jr nz,DR0      ; name, refused there
  ld (hl),SPACE  ; /W blanked: the
  inc hl         ; ROM's DIR runs
  ld (hl),SPACE  ; the rest
  jp HAND        ; to the ROM

; The pattern into CFCB: every name if
; none, on the drive named or the
; current one. The totals and the marks
; start clear.

DR0:
  push hl        ; the operand
  call FOLD      ; folded
  call CRLF      ; after the line
  pop hl
  ld de,CFCB     ; the pattern
  call PARSEFCB
  jp c,BADW      ; not a name
  call ENDCHK    ; nothing after it
  ld hl,CFCB+1   ; the name's first
  ld a,(hl)
  cp SPACE       ; none given?
  jr nz,DR2      ; a name given
  ld b,11

DR1:
  ld (hl),'?'    ; every name
  inc hl
  djnz DR1       ; all 11

DR2:
  ld a,(CFCB)    ; the drive named
  dec a          ; A: is 1, to 0
  jp p,DR3       ; a drive named
  ld a,(CURDSK)  ; none: the
  and $0F        ; the current drive

DR3:
  ld (DDRV),a
  inc a          ; from 1
  ld (CFCB),a    ; named, from 1
  call DAGINIT   ; the table empty
  ld hl,0
  ld (DNUM),hl   ; no file shown
  ld (DTOT),hl   ; no bytes
  ld a,l
  ld (DTOT+2),a  ; DTOT 24 bits
  ld (DPASS),a   ; pass A first
  ld hl,HMAP
  ld b,16        ; its 16 bytes

DRH0:
  ld (hl),a      ; no name marked
  inc hl
  djnz DRH0      ; each one

; The marks: every entry of the
; pattern, EX '?'. An entry past a
; file's first, EX or S2 nonzero, marks
; its name's hash: such a file may hold
; more than one entry. The same scan
; keeps each name's maximum end record
; in the table.

  ld a,'?'       ; '?' as EX:
  ld (CFEX),a    ; every extent
  call SETDMA
  call DOSSEQ    ; BDOS 17 on CFCB
  DB 17*2+1      ; the first entry

DRH1:
  inc a
  jr z,DRH3      ; the end
  call DRENT     ; HL: the entry
  push hl
  call DAGADD    ; its maximum, then
  pop hl         ; the HMAP mark
  push hl
  ld de,12       ; to EX
  add hl,de
  ld a,(hl)      ; EX
  inc hl
  inc hl         ; past S1
  ld c,(hl)      ; S2
  pop hl
  or c           ; EX or S2
  and $3F
  jr z,DRH2      ; a first entry
  call HBIT      ; its name's mark
  or (hl)        ; marked
  ld (hl),a      ; set

DRH2:
  call DOSSEQ    ; BDOS 18 on CFCB
  DB 18*2+1      ; the next entry
  jr DRH1

; Pass A lists, from its first entry,
; each file whose name is not marked:
; one entry, RC records. Pass B uses
; the table's maximum. Each pass is one
; search: nothing between its matches
; calls the BDOS but for the console.

DRH3:
  xor a          ; EX 0:
  ld (CFEX),a    ; first entries

DRPASS:
  call DOSSEQ    ; BDOS 17
  DB 17*2+1      ; the first match
  jr DRN0

DRNEXT:
  call DOSSEQ    ; BDOS 18
  DB 18*2+1      ; the next match

DRN0:
  inc a          ; FFh: the end
  jp z,DRPEND    ; this pass ends
  call DRENT     ; HL: the entry
  push hl
  ld de,10       ; to T2
  add hl,de
  bit 7,(hl)     ; SYS: hidden
  pop hl
  jr nz,DRNEXT   ; SYS: passed over
  push hl
  call HBIT
  and (hl)       ; NZ: marked
  pop hl
  ld a,(DPASS)
  jr z,DRN1      ; unmarked: pass A's
  xor 1          ; marked: pass B's

DRN1:
  or a           ; pass A's file?
  jr nz,DRNEXT   ; the other pass's

; The file's name into FCBONE, and its
; records into FCBONE's random record:
; RC in pass A, the maximum in pass B.

  push hl        ; the entry
  ld a,(CFCB)    ; its drive
  ld (FCBONE),a  ; FCBONE's drive
  inc hl
  ld de,FCBONE+1
  ld bc,11
  ldir           ; the name
  pop hl         ; the entry
  ld a,(DPASS)
  or a
  jr nz,DRN2     ; pass B
  ld de,15       ; to RC
  add hl,de
  ld a,(hl)      ; RC: its records
  ld hl,0
  ld (FCBONE+33),a
  ld (FCBONE+34),hl
  jr DRN3        ; listed

DRN2:
  call DAGGET    ; the table's maximum

; A row: the complete filename, the
; size eight wide, and the size into
; DTOT.

DRN3:
  call LSTNL     ; the row's start
  jp c,BDONE     ; stopped
  call DRNAME
  ld hl,FCBONE+33
  call RECB      ; NUMV: its bytes
  ld hl,NUMV     ; into DTOT
  ld de,DTOT
  ld b,3
  or a           ; no carry in

DRADD:
  ld a,(de)      ; a byte of it
  adc a,(hl)     ; DTOT plus NUMV
  ld (de),a
  inc hl
  inc de
  djnz DRADD     ; three bytes
  call PUTNUM    ; eight wide
  ld de,DIGB     ; its digits
  call PUTS
  ld hl,(DNUM)
  inc hl
  ld (DNUM),hl   ; one more shown
  jp DRNEXT      ; the next match

DRPEND:
  ld hl,DPASS
  ld a,(hl)
  inc (hl)       ; pass B next
  or a
  jp z,DRPASS    ; after pass A

; NO FILE when none was shown, as the
; ROM's DIR says. Otherwise the count,
; the bytes, then the free space and
; the drive's volume.

  ld hl,(DNUM)   ; files shown
  ld a,h
  or l
  ld de,NOFMSG   ; NO FILE
  jp z,ERRMSG    ; none: FF00h
  ld (NUMV),hl
  xor a
  ld (NUMV+2),a
  call LSTNL     ; the summary row
  jp c,BDONE     ; stopped
  call PUTNT     ; the count
  ld de,FILESM   ; plural
  ld hl,(DNUM)
  dec hl
  ld a,h
  or l
  jr nz,DRD1     ; more than one
  ld de,FILEM    ; singular

DRD1:
  call PUTS      ; file or files
  ld hl,(DTOT)   ; the total
  ld (NUMV),hl
  ld a,(DTOT+2)
  ld (NUMV+2),a
  call PUTNT     ; the bytes
  ld de,BYTESM
  call PUTS
  call LSTNL     ; the free row
  jp c,BDONE     ; stopped
  call SETDMA
  ld a,(DDRV)
  ld e,a         ; the drive
  ld c,46        ; 46: free records
  call BDOS      ; at 0080h
  ld hl,DEFDMA   ; its 24 bits
  call RECB      ; in bytes
  call PUTNT
  ld de,FREEM
  call PUTS
  ld a,(DDRV)    ; its volume
  call DRVLBL    ; d:NAME
  jp BDONE

NOFMSG:   DB    "NO FILE$"
FILESM:   DB    " files, $"
FILEM:    DB    " file, $"
BYTESM:   DB    " bytes$"
FREEM:    DB    " free on $"

; HL = match A's entry in the record at
; 0080h, A being its slot plus 1.

DRENT:
  dec a          ; from 0
  rrca
  rrca           ; rotated right
  rrca           ; the slot times 32
  add a,LOW(DEFDMA)
  ld l,a
  ld h,0         ; in page zero
  ret

; HL = the byte in HMAP of the entry at
; HL's name, and A its bit. The hash
; takes each of the 11 bytes, seven
; bits, xored in after a rotate, so
; names that differ only in a digit
; fall on different marks. Changes BC.

HBIT:
  inc hl         ; past the user
  ld b,11        ; its 11 bytes
  xor a          ; the hash so far

HB1:
  rlca           ; rotated
  ld c,a
  ld a,(hl)      ; the name's byte
  and $7F        ; no attribute
  xor c
  inc hl
  djnz HB1
  ld c,a         ; the hash
  and 7          ; the bit number
  ld b,a
  inc b
  ld a,$80       ; rotated in below

HB2:
  rlca
  djnz HB2       ; bit hash AND 7
  ld b,a
  ld a,c
  rrca           ; hash/2
  rrca
  rrca
  and $0F        ; byte hash/8 AND 15
  ld hl,HMAP     ; 16 bytes
  add a,l
  ld l,a
  jr nc,HB3
  inc h          ; a carry into H

HB3:
  ld a,b         ; the bit
  ret

; DMA at 0080h.

SETDMA:
  ld de,DEFDMA
  ld c,26        ; 26: set the DMA
  jp BDOS

; NUMV = 128 times the 24-bit count of
; records at HL, low byte first: its
; bytes, below 8 MiB. Changes AF, BC,
; DE and HL.

RECB:
  ld e,(hl)
  inc hl
  ld d,(hl)
  inc hl
  ld c,(hl)      ; CDE: the records
  xor a
  srl c
  rr d
  rr e
  rra            ; shifted right one
  ld (NUMV),a    ; and up a byte
  ld (NUMV+1),de
  ret

; NUMV in decimal with no leading
; spaces. Changes all.

PUTNT:
  call PUTNUM
  ex de,hl       ; DE: the first digit
  jp PUTS

; NUMV into DIGB in decimal, eight wide
; with leading spaces, and HL at its
; first digit. NUMV ends at zero.
; Changes all.

PUTNUM:
  ld hl,DIGB
  ld de,DIGB+1
  ld bc,7
  ld (hl),SPACE  ; eight spaces
  ldir
  ld a,'$'
  ld (de),a      ; then the end
  ex de,hl       ; HL: past the digits

PN1:
  push hl
  call DIV10     ; A: the next digit
  pop hl
  dec hl
  add a,'0'
  ld (hl),a      ; right to left
  ld a,(NUMV)
  ld de,(NUMV+1)
  or d
  or e
  jr nz,PN1      ; more digits
  ret

; NUMV divided by 10, the remainder in
; A, by 24 shifts. Changes BC, DE and
; HL.

DIV10:
  ld hl,(NUMV)   ; low 16 bits
  ld a,(NUMV+2)
  ld e,a         ; EHL: the number
  xor a          ; A: the remainder
  ld b,24        ; 24 bits

DV1:
  add hl,hl
  rl e
  rla            ; the next bit in
  cp 10
  jr c,DV2       ; no 10 in it
  sub 10
  inc l          ; a quotient bit

DV2:
  djnz DV1
  ld (NUMV),hl   ; the quotient
  ld c,a
  ld a,e         ; the top byte
  ld (NUMV+2),a
  ld a,c         ; the remainder
  ret


; Print FCBONE's masked filename in
; twelve columns: trim trailing
; base/type padding, use a dot only with
; a type, pad after the whole name.
; Keeps the FCB. Changes AF, BC, DE and
; HL.

DRNAME:
  ld c,12        ; whole filename width
  ld hl,FCBONE+1
  ld b,8
  call DRTRIM    ; right padding only
  call DRPART    ; consume printed width
  ld hl,FCBONE+9
  ld b,3
  call DRTRIM    ; right padding only
  ld a,b
  or a           ; empty type: no dot
  jr z,DRPAD
  ld e,'.'
  call PUTC
  dec c          ; dot uses one column
  call DRPART    ; consume printed width

DRPAD:
  ld a,c
  or a           ; no padding at width 0
  ret z
  ld e,SPACE
  call PUTC      ; BC preserves width
  dec c          ; one padding column
  jr DRPAD

; HL is a field start, B its positive
; width. Return B trimmed at the right,
; possibly zero, with HL and C kept.
; Attributes are masked before the space
; test. Changes AF and DE.

DRTRIM:
  push hl        ; keep field start
  ld e,b         ; bounded field width
  ld d,0         ; ignore old D
  add hl,de      ; start after the field

DRTR1:
  dec hl
  ld a,(hl)
  and $7F        ; type attributes too
  cp SPACE       ; only rightmost spaces
  jr nz,DRTR2    ; interior spaces stay
  djnz DRTR1     ; all spaces gives B=0

DRTR2:
  pop hl         ; start even when empty
  ret

; Print B masked bytes at HL; B=0 prints
; none. Advance HL and reduce C by the
; printed width. PUTC keeps BC/HL.
; Changes AF and DE too.

DRPART:
  ld a,b
  or a           ; DJNZ(0) is not empty
  ret z          ; no speculative byte

DRPT1:
  ld a,(hl)
  and $7F        ; keep the old masking
  ld e,a
  call PUTC      ; keeps BC and HL
  dec c          ; interior spaces count
  inc hl
  djnz DRPT1     ; only trimmed prefix
  ret

; Private transient header, bucket heads
; and nodes. Each node has key[11],
; max[3], next[2]. DNEXT is the next
; free node: 0240h plus 16 times the
; names.
; The table lies in the TPA, which a
; service never takes below 8000h, and
; holds 512 names, as many entries as a
; G8M directory has, so it never fills.

DNEXT  EQU $0102
DKEY   EQU $0104
DCAND  EQU DKEY+11
DHASH  EQU DCAND+3
DLINK  EQU DHASH+1
DHEAD  EQU $0140
DNODE  EQU $0240

; Empty the table. Changes AF, BC, DE
; and HL.

DAGINIT:
  ld hl,DHEAD
  ld de,DHEAD+1
  ld bc,255      ; first byte plus 255
  ld (hl),0      ; null bucket links
  ldir
  ld hl,DNODE    ; no node taken
  ld (DNEXT),hl
  ret

; HL is an entry/FCB, before its eleven
; name bytes. Write DKEY and DHASH, with
; attributes masked and the HMAP's
; rotate/XOR hash. Return HL at EX.
; Changes AF, BC and DE.

DAGKEY:
  inc hl         ; past user/drive byte
  ld de,DKEY     ; masked full identity
  ld b,11        ; all eight plus three
  xor a          ; same HMAP hash seed

DAK1:
  rlca           ; the hash's rotation
  ld c,a         ; hash across masking
  ld a,(hl)
  and $7F        ; attributes share keys
  ld (de),a
  xor c          ; hash is not identity
  inc hl
  inc de
  djnz DAK1      ; HL ends at EX
  ld (DHASH),a   ; bucket uses low seven
  ret

; HL is at EX. Write DCAND as unsigned
; 24-bit ((S2&63)*32+(EX&31))*128+RC. S1
; is ignored; RC is not clamped. Return
; HL at RC; changes AF, BC and DE.

DAGREC:
  ld a,(hl)
  and $1F        ; ignore reserved EX
  ld d,a
  ld e,0         ; EX bit 0 goes here
  srl d          ; EX bits 1..4
  rr e           ; EX bit 0 at bit 7
  inc hl
  inc hl
  ld a,(hl)
  and $3F        ; logical S2 bits
  rlca
  rlca
  rlca
  rlca
  ld c,a         ; swapped S2 nibbles
  and $F0        ; S2 low four in middle
  or d           ; disjoint EX bits
  ld d,a
  ld a,c
  and 3          ; S2 high two
  ld b,a         ; third record byte
  inc hl
  ld a,(hl)
  add a,e        ; unsigned RC, no clamp
  ld e,a
  jr nc,DAR1     ; no low-byte carry
  inc d          ; carry into middle
  jr nz,DAR1     ; middle did not wrap
  inc b          ; carry into high byte

DAR1:
  ld (DCAND),de  ; low and middle
  ld a,b         ; high byte, with
                 ; any RC carry
  ld (DCAND+2),a
  ret

; Look up DKEY/DHASH. NC: HL points at
; its maximum. C: DLINK is the empty
; head/next word for insertion. Changes
; AF, BC and DE.

DAGFIND:
  ld a,(DHASH)
  and $7F        ; 128 two-byte heads
  ld l,a
  ld h,0         ; unsigned hash index
  add hl,hl      ; word-sized heads
  ld de,DHEAD    ; head, not node
  add hl,de

DAF1:
  ld (DLINK),hl  ; empty link for insert
  ld e,(hl)
  inc hl
  ld d,(hl)
  ld a,d
  or e           ; a null link
  scf            ; missing
  ret z          ; DLINK is still empty
  ex de,hl       ; linked node address
  push hl        ; base if key differs
  ld de,DKEY
  ld b,11        ; hash is not identity

DAF2:
  ld a,(de)
  cp (hl)        ; all masked key bytes
  jr nz,DAF3     ; next in same bucket
  inc de
  inc hl         ; ends at maximum low
  djnz DAF2
  pop de         ; discard saved base
  ret            ; matched: Z and NC

DAF3:
  pop hl         ; back to node base
  ld de,14       ; its next-link word
  add hl,de
  jr DAF1

; Maximise the three-byte value at HL
; with the candidate at DE. Borrow runs
; low to high; INC and DJNZ keep carry.
; Equality may copy identical bytes.
; Changes AF, BC, DE and HL.

DAGMAX:
  push hl        ; destination low
  push de        ; candidate low
  ld b,3         ; little-endian 24 bits
  xor a          ; initial borrow clear

DAM1:
  ld a,(de)
  sbc a,(hl)     ; propagate borrow
  inc hl         ; INC16 keeps carry
  inc de         ; so does this INC16
  djnz DAM1      ; DJNZ keeps carry
  pop hl         ; source low again
  pop de         ; destination low again
  ret c          ; candidate was smaller
  ld bc,3        ; equality copy is safe
  ldir           ; maximum, never sum
  ret

; HL is an extent entry. Coalesce its
; end record, or insert its full key.
; Changes AF, BC, DE and HL.

DAGADD:
  call DAGKEY    ; full masked key/hash
  call DAGREC    ; exact extent end
  call DAGFIND
  ld de,DCAND    ; header candidate
  jr nc,DAGMAX   ; coalesce same key
  ld de,(DNEXT)  ; the new node
  ld hl,DKEY     ; key then candidate
  ld bc,14       ; leave link separate
  ldir           ; filled before linked
  xor a          ; null new tail
  ld (de),a
  inc de
  ld (de),a
  inc de         ; the next free node
  ld hl,(DNEXT)  ; the new node
  ld (DNEXT),de
  ex de,hl       ; DE: the new node
  ld hl,(DLINK)  ; empty head/next word
  ld (hl),e      ; publish filled node
  inc hl         ; the link's high byte
  ld (hl),d      ; full sixteen-bit link
  ret

; Read FCBONE's marked-name maximum into
; its random-record bytes. A literal
; question mark keeps BDOS size's
; wildcard meaning. A marked name was
; put in the table by the same search.
; Changes AF, BC, DE and HL.

DAGGET:
  ld hl,FCBONE
  call DAGKEY    ; from copied anchor
  ld hl,DKEY     ; already masked
  ld b,11        ; literal wildcard test

DAGQ:
  ld a,(hl)
  cp '?'         ; raw wildcard anchor
  jr z,DAGWILD   ; not an exact-key size
  inc hl
  djnz DAGQ
  call DAGFIND   ; the marked key
  ld de,FCBONE+33
  ld bc,3        ; random record width
  ldir           ; maximum to caller FCB
  ret

; Maximise over the keys matching
; DKEY's masked wildcard pattern, which
; matches its own key at least. Writes
; FCBONE's random record; changes AF,
; BC, DE and HL.

DAGWILD:
  xor a          ; empty maximum
  ld (FCBONE+33),a
  ld (FCBONE+34),a
  ld (FCBONE+35),a
  ld hl,DNODE    ; not bucket heads

DAW1:
  ld de,(DNEXT)  ; the nodes' end
  or a
  sbc hl,de
  ret z          ; every node seen
  add hl,de      ; the node again
  push hl        ; node base for advance
  ld de,DKEY     ; wildcard pattern
  ld b,11        ; same width as BDOS

DAW2:
  ld a,(de)
  cp '?'
  jr z,DAW3      ; one-position wildcard
  cp (hl)        ; other bytes exact
  jr nz,DAWNEXT  ; not this full key

DAW3:
  inc hl
  inc de
  djnz DAW2      ; all eleven must match
  ex de,hl       ; candidate is node max
  ld hl,FCBONE+33
  call DAGMAX    ; unsigned maximum

DAWNEXT:
  pop hl         ; node base
  ld de,16       ; fixed node stride
  add hl,de
  jr DAW1
