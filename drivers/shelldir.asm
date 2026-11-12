; SHELL.SVC's DIR, with each file's size
; in bytes, and the numbers it prints.
; Included by shell.asm, whose LINE
; enters CMDDIR with HL after its word.

; DIR /W is the ROM's wide listing. DIR
; [d:][name] lists each match not
; hidden, one a row: its name and its
; size, BDOS 35's records times 128.
; Then the count and the bytes, the
; drive's free space by BDOS 46 and its
; volume. BDOS 35 scans the directory
; and loses the search, so only a file
; that may have more than one entry is
; sized by it: docs/shell.md gives the
; cost.

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
; more than one entry, and only BDOS 35
; sizes it.

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
; one entry, RC records. Pass B lists
; the marked ones by BDOS 35, which
; replaces the search state, so the
; search is begun again after each and
; passes over the DSKIP matches taken.

DRH3:
  xor a          ; EX 0:
  ld (CFEX),a    ; first entries

DRPASS:
  ld hl,0
  ld (DSKIP),hl  ; none taken yet
  inc l          ; 1: the restart
  ld a,l
  ld (DRST),a    ; begin the search

DRNEXT:
  call DSRCH
  inc a          ; FFh: the end
  jp z,DRPEND    ; this pass ends
  call DRENT     ; HL: the entry
  ld de,(DSKIP)
  inc de         ; one more
  ld (DSKIP),de  ; one more taken
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
; RC in pass A, BDOS 35's in pass B.

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
  call DOSSEQ    ; 35: its size
  DB 35*2+0      ; its size
  ld a,1
  ld (DRST),a    ; the search again

; A row: the name and type padded, the
; size eight wide, and the size into
; DTOT.

DRN3:
  call LSTNL     ; the row's start
  jp c,BDONE     ; stopped
  ld hl,FCBONE+1
  ld b,8         ; its 8 bytes
  call PUTN      ; the name
  ld e,'.'       ; then a dot
  call PUTC
  ld b,3         ; its 3 bytes
  call PUTN      ; the type
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

; The search's next match in A, FFh at
; its end. With DRST set the search is
; begun again and DSKIP matches are
; passed over.

DSRCH:
  call SETDMA
  ld hl,DRST
  ld a,(hl)
  ld (hl),0      ; once
  or a           ; set?
  jr nz,DS1      ; begin again
  call DOSSEQ    ; BDOS 18
  DB 18*2+1      ; the next match
  ret

DS1:
  call DOSSEQ    ; BDOS 17
  DB 17*2+1      ; the first match
  ld hl,(DSKIP)  ; the matches taken

DS2:
  cp $FF
  ret z          ; the end
  ld b,a         ; keep the match
  ld a,h
  or l           ; none to pass?
  ld a,b
  ret z          ; past DSKIP
  dec hl         ; one fewer
  push hl
  call DOSSEQ
  DB 18*2+1      ; one passed over
  pop hl
  jr DS2         ; until the end

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
