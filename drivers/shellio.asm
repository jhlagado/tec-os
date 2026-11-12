; SHELL.SVC's input and output: .CMD
; scripts and the rest of STARTUP.CMD,
; the prompt and console helpers, the
; pager behind PAGE and the history
; ring behind HREC and HSTORE. Included
; by shell.asm.

; Open A:STARTUP.CMD as the script and
; pass over its first line, which the
; ROM ran. Its lines keep the startup
; line's origin. Nothing is open if the
; file has no line after the first.

STOPEN:
  xor a          ; A = 0
  ld (STSKIP),a  ; once only
  ld hl,SFCB     ; SFCB zero
  ld de,SFCB+1
  ld bc,35
  ld (hl),a
  ldir           ; a clear FCB
  ld hl,STNAME   ; A:STARTUP.CMD
  ld de,SFCB
  ld bc,12
  ldir           ; drive A, the name
  call SOPENF    ; open it
  ret c          ; no file
  ld a,$FF       ; its lines quiet
  ld (SORG),a    ; the startup origin
  call SLINE     ; past the ROM's line
  ret nc         ; a line follows
  xor a          ; none: closed
  ld (SOPEN),a   ; nothing after it
  ret

STNAME: DB 1,"STARTUP CMD"

; Open SFCB. Carry: no file. Otherwise
; the script is open at its start: its
; records are read by number into
; 0080h, the first being 0.

SOPENF:
  ld de,SFCB     ; the script's FCB
  ld c,15        ; 15: open
  call BDOS
  inc a          ; FFh to zero
  scf
  ret z          ; FFh: no file
  ld a,1         ; open now
  ld (SOPEN),a
  ld hl,-1       ; one before 0
  ld (SFCB+33),hl
  ld a,128       ; at its end
  ld (SOFF),a    ; no record yet
  xor a          ; not ended
  ld (SEOF),a
  ret

; The script's next line into LTXT,
; zero-ended, at most 127 characters;
; the rest of a longer line is read
; past. CR, LF and CR LF each end a
; line, and an empty line or one
; starting with ; is passed over.
; Carry at the script's end. Programs
; may use 0080h between lines, so the
; record is read again at each line.

SLINE:
  xor a          ; A = 0
  ld (SLOAD),a   ; read the record again
  ld de,LTXT     ; the line's text
  ld b,127       ; slots left

SL1:
  call SGET      ; the next byte
  jr c,SLEOF     ; the script's end
  cp CR          ; CR ends it
  jr z,SLEOL
  cp LF          ; LF ends it
  jr z,SLEOL
  inc b          ; full? A is kept
  dec b          ; B = 0: full
  jr z,SL1       ; full: drop the rest
  ld (de),a      ; store the byte
  inc de
  dec b          ; a slot fewer
  jr SL1         ; the next byte

SLEOL:
  ld a,e         ; nothing stored?
  cp LOW(LTXT)
  jr z,SL1       ; empty so far

SLDONE:
  xor a          ; A = 0
  ld (de),a      ; zero-ended
  ld a,(LTXT)    ; its first byte
  cp ';'
  jr z,SLINE     ; a comment
  or a           ; a line, NC
  ret

SLEOF:
  ld a,e         ; nothing stored?
  cp LOW(LTXT)
  jr nz,SLDONE   ; a last, unended line
  scf            ; carry: the end
  ret

; The script's next byte in A. Zero,
; 1Ah or the end of its last record:
; carry, then carry at every later
; call. Keeps BC and DE.

SGET:
  ld a,(SEOF)    ; ended before?
  or a
  scf
  ret nz         ; carry: no more
  ld a,(SOFF)    ; the byte's offset
  cp 128         ; past the record?
  jr nz,SG0      ; within the record
  ld hl,(SFCB+33)
  inc hl         ; its number
  ld (SFCB+33),hl
  xor a          ; offset 0
  ld (SOFF),a
  ld (SLOAD),a   ; not read yet

; Read the record by number into 0080h
; if it is not there.

SG0:
  ld a,(SLOAD)   ; is it read?
  or a
  jr nz,SG1      ; it is there
  push de        ; the line pointer
  push bc        ; the slots left
  call SETDMA    ; DMA 0080h
  ld de,SFCB
  ld c,33        ; 33: random read
  call BDOS      ; read it by number
  pop bc
  pop de
  or a
  jr nz,SGEND    ; past the last record
  inc a          ; A = 1
  ld (SLOAD),a   ; it is there

SG1:
  ld a,(SOFF)    ; the byte's offset
  ld l,a
  inc a
  ld (SOFF),a    ; the next byte's
  ld h,0         ; HL = 0080h plus
  set 7,l        ; HL in 0080h-00FFh
  ld a,(hl)      ; the byte
  or a
  jr z,SGEND     ; a zero ends it
  cp 26          ; 1Ah?
  jr z,SGEND     ; 1Ah ends it
  or a           ; a byte, NC
  ret

SGEND:
  ld a,1         ; so later calls end
  ld (SEOF),a    ; ended
  scf
  ret

; Past spaces at HL. A is the byte.

SKIPSP:
  ld a,(hl)      ; the byte
  cp SPACE
  ret nz         ; not a space
  inc hl         ; past it
  jr SKIPSP

; Past blanks, spaces and tabs, and !
; at HL: Z at the line's end, else A
; the first other byte.

SKIPSB:
  ld a,(hl)      ; the byte
  cp '!'         ; ! is passed over
  jr z,SKB1
  cp SPACE
  jr z,SKB1      ; a space
  cp TAB
  jr z,SKB1      ; a tab
  or a           ; Z: the line's end
  ret

SKB1:
  inc hl
  jr SKIPSB

; The prompt: the user if not 0, the
; drive and >, from 0004h.

PROMPT:
  ld a,(CURDSK)  ; 0004h: user, drive
  push af
  rrca           ; user to the low
  rrca
  rrca
  rrca           ; the user, high
  and $0F        ; 0: none shown
  call nz,PUTDEC8
  pop af         ; drive in the low
  and $0F
  call DRVLBL    ; drive and volume
  ld e,'>'       ; then >

; E through BDOS 2, keeping BC and HL.

PUTC:
  push bc
  push hl        ; both kept over BDOS
  ld c,2         ; 2: output E
  call BDOS
  pop hl
  pop bc
  ret

; CR and LF. Keeps BC and HL.

CRLF:
  ld e,CR        ; a carriage return
  call PUTC
  ld e,LF        ; then a line feed
  jr PUTC

; The dollar-ended string at DE.

PUTS:
  ld c,9         ; 9: output to $
  jp BDOS

; The zero-ended string at HL. Returns
; HL at its zero.

PUTZ:
  ld a,(hl)      ; the next byte
  or a
  ret z          ; zero: the end
  ld e,a
  call PUTC      ; print it
  inc hl
  jr PUTZ

; B bytes at HL, each masked to seven
; bits: a name, its spaces kept.

PUTN:
  ld c,0         ; no byte left out
  jr PT0

; The same with its spaces left out.

PUTTRIM:
  ld c,SPACE     ; spaces left out

PT0:
  ld a,(hl)      ; the next byte
  and $7F
  cp c           ; left out?
  jr z,PTSK      ; a space: none
  ld e,a
  call PUTC      ; print it

PTSK:
  inc hl         ; on through the name
  djnz PT0
  ret

; A, 0 to 99, in decimal, with no
; leading zero: a user number or a
; service's pages, below 58. PDNZ is
; set once a digit is printed.

PUTDEC8:
  ld b,a         ; the value
  xor a
  ld (PDNZ),a    ; none printed yet
  ld a,b
  ld c,10        ; tens first
  call PD1       ; the tens
  add a,'0'      ; the units
  ld e,a         ; print it
  jr PUTC

; The digit of A in base C, printed if
; it is not a leading zero. Returns A
; less that digit's part.

PD1:
  ld b,'0'-1     ; the digit, from 0

PD2:
  inc b          ; one more C
  sub c
  jr nc,PD2      ; one more C
  add a,c        ; one C back
  ld c,a         ; the remainder
  ld a,b         ; the digit
  cp '0'
  jr nz,PD3      ; a nonzero digit
  ld a,(PDNZ)    ; one printed yet?
  or a
  ld a,c
  ret z          ; a leading zero

PD3:
  ld e,b         ; print it
  push bc
  call PUTC
  pop bc
  ld a,1         ; so later ones show
  ld (PDNZ),a    ; a digit printed
  ld a,c         ; the remainder
  ret

; A as two hex digits.

PUTHEX:
  push af        ; keep the value
  rrca
  rrca
  rrca
  rrca           ; the high digit
  call PH1       ; print it
  pop af         ; the low digit

PH1:
  and $0F        ; the low nibble
  add a,$90      ; 90h to 9Fh
  daa            ; A to F: 00h-05h, CY
  adc a,$40      ; D0h-D9h or 41h-46h
  daa            ; '0'-'9' or 'A'-'F'
  ld e,a         ; print it
  jr PUTC

; The pager, as the ROM's was. PGRST
; at each LINE takes the geometry from
; INFO: L columns and H rows, 0 for the
; serial terminal's 80 by 24. It pauses
; one row before a full screen.

PGRST:
  ld c,TNINFO    ; 0: INFO
  call ABICALL   ; L columns, H rows
  ld a,h         ; 0 rows?
  or a
  jr nz,PGR1
  ld a,24        ; serial: 24 rows

PGR1:
  dec a          ; less one
  ld (PGROWS),a  ; a row for [more]
  ld a,l         ; 0 columns?
  or a
  jr nz,PGR2
  ld a,80        ; serial: 80 columns

PGR2:
  ld (PGWID),a   ; the width
  xor a          ; the page starts
  ld (PGLINE),a  ; a new page
  ld (PGCOL),a
  ret

; PAGE, called by TYPE for each byte
; and by DIR for its row breaks, on the
; CCP's stack: E = the byte. It takes
; the shell's stack, which no LINE
; holds while a listing runs, so it
; uses none of the CCP's. Carry stops
; the listing. Changes AF, DE and HL,
; and BC on a pause.

PAGE:
  ld (PGSP),sp   ; the caller's SP
  ld sp,STKTOP   ; the shell's stack
  call PGPUT     ; the byte
  ld sp,(PGSP)   ; back, carry kept
  ret

; E with the page's accounting: LF, CR,
; BS and tab move the column as the
; screen does, other controls take no
; column, and a byte past the width
; wraps first. Carry stops the listing.

PGPUT:
  ld a,e         ; the byte
  cp LF          ; LF?
  jr z,PGLF      ; out, then count it
  cp CR          ; CR?
  jr z,PGCR      ; column 0
  cp 8           ; BS?
  jr z,PGBS      ; a column back
  cp TAB         ; tab?
  jr z,PGTAB     ; the next eighth
  cp SPACE       ; other controls
  jr c,PGOUT     ; no column
  ld a,(PGCOL)   ; the column
  ld hl,PGWID
  cp (hl)        ; past the width?
  jr c,PGINC     ; it fits
  push de        ; the byte across
  call PGNEWL    ; wrap first
  pop de
  ret c          ; stopped: not shown
  xor a          ; column 0

PGINC:
  inc a          ; the next column

PGSETC:
  ld (PGCOL),a

PGOUT:
  call PUTC      ; print E
  or a           ; go on, NC
  ret

PGCR:
  xor a          ; column 0
  jr PGSETC

PGBS:
  ld a,(PGCOL)   ; the column
  or a
  jr z,PGOUT     ; at 0 it stays
  dec a          ; one back
  jr PGSETC

PGTAB:
  ld a,(PGCOL)   ; the column
  or 7
  inc a          ; the next eighth
  jr PGSETC

PGLF:
  call PUTC      ; LF out first

; A new line: below the page's rows,
; count it. At the last, print [more]
; and wait for a key, masked with DFh.
; ^C stops the listing and drops the
; rest of the line; Esc and Q stop the
; listing only; any other key starts a
; new page.

PGNEWL:
  ld a,(PGLINE)  ; lines so far
  inc a
  ld hl,PGROWS   ; the page's rows
  cp (hl)
  jr c,PGNL1     ; room on the page
  ld de,MOREMSG  ; wait at [more]
  call PUTS

PGWAIT:
  ld e,$FF       ; FFh: input
  ld c,6         ; 6: direct console
  call BDOS      ; a key, not echoed
  or a           ; 0: no key
  jr z,PGWAIT    ; none yet
  push af        ; keep the key
  ld de,UNMORE   ; erase [more]
  call PUTS      ; [more] erased
  pop af
  and $DF        ; upper case
  cp 3           ; ^C?
  jr z,PGDROP    ; ^C
  cp $1B         ; Esc?
  jr z,PGSTOP    ; Esc
  cp 'Q'         ; Q?
  jr z,PGSTOP
  xor a          ; a new page

PGNL1:
  ld (PGLINE),a  ; lines so far
  xor a
  ld (PGCOL),a   ; column 0, NC
  ret

PGDROP:
  ld hl,0        ; no next piece
  ld (LPOS),hl   ; drop the rest

PGSTOP:
  scf            ; stop the listing
  ret

MOREMSG: DB "[more]$"
UNMORE: DB CR,"      ",CR,'$'

; HREC, on the BDOS's stack inside line
; input: C = ^W, older, or ^N, newer.
; Carry: nothing to show. Otherwise HL
; = the line, zero-ended, copied to
; LTXT, which is the line being edited:
; the ROM erases that line, then copies
; this one over it, byte for byte in
; place. The ring holds zero-ended
; lines; HPOS ends the one shown.

HREC:
  ld h,HIGH(RING)
  ld a,(HPOS)    ; the line shown
  ld l,a
  ld a,c         ; which key?
  cp CTRLN
  jr z,HRNEW     ; ^N: newer
  call HSTART    ; this line's start
  dec l          ; the older line's zero
  dec l
  ld a,(hl)      ; its last byte, or 0
  inc l          ; L at its zero
  or a           ; another line?
  scf
  ret z          ; no older line
  jr HRSHOW      ; show it

HRNEW:
  ld a,(HHEAD)   ; the next store
  cp l
  scf            ; carry: none
  ret z          ; at the newest

HRNEW1:
  inc l          ; the next line's
  ld a,(hl)      ; end, at its zero
  or a
  jr nz,HRNEW1   ; to the next's end

HRSHOW:
  ld a,l         ; its end
  ld (HPOS),a    ; the line shown
  call HSTART    ; its start
  ld de,LTXT     ; copied to LTXT

HRC:
  ld a,(HPOS)    ; the line's end
  cp l
  jr z,HRE       ; its end
  ld a,(hl)      ; a ring byte
  ld (de),a      ; copied out
  inc de
  inc l          ; within the ring
  jr HRC

HRE:
  xor a          ; A = 0
  ld (de),a      ; zero-ended
  ld hl,LTXT     ; the line shown
  ret

; L to the first byte of the ring's
; line that ends at L.

HSTART:
  dec l          ; the byte before
  ld a,(hl)
  inc l
  or a           ; its zero?
  ret z          ; the zero before it
  dec l          ; go back one
  jr HSTART

; HSTORE, on the BDOS's stack: DE = a
; typed line, B = its length. Store it
; unless it holds a zero or repeats the
; newest, then clear the oldest lines
; it overwrote.

HSTO:
  ld h,HIGH(RING)
  ld a,(HHEAD)   ; the newest's
  dec a
  ld l,a         ; the newest's zero
  call HSTART    ; its start
  push de        ; the line
  push bc        ; its length, in B
  ld c,0         ; differences

HSCMP:
  ld a,(de)      ; the line's byte
  or a           ; zero?
  jr z,HSKEEP    ; a zero: not stored
  cp (hl)        ; the newest's
  jr z,HSCMP1
  inc c          ; a difference

HSCMP1:
  inc de
  inc l
  djnz HSCMP     ; all B bytes

; Equal only if no byte differed and
; the newest ends where the line does.

  ld a,(HHEAD)   ; the newest's end
  dec a
  sub l          ; at L?
  or c           ; and no difference
  jr z,HSKEEP    ; a repeat
  pop bc         ; the length
  pop de         ; and the line
  ld a,(HHEAD)   ; the next store
  ld l,a

HSPUT:
  ld a,(de)      ; a byte of it
  ld (hl),a      ; the line, wrapping
  inc de
  inc l
  djnz HSPUT
  ld (hl),0      ; its zero
  inc l          ; past the zero
  ld a,l         ; the new head
  ld (HHEAD),a   ; the next store

; Clear what is left of the oldest line
; overwritten, to its zero.

HSCLR:
  ld a,(hl)      ; a stale byte
  ld (hl),0      ; cleared
  inc l
  or a           ; its zero?
  jr nz,HSCLR
  ret

HSKEEP:
  pop bc         ; drop the line
  pop de
  ret
