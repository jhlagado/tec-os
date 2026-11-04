; The CCP's file commands: DIR with its
; paging and its footer, TYPE, ERA,
; REN and COPY, with the decimal and hex
; printers they share. Included after
; ccp.asm, in this order, by rom.asm.

; DIR [d:][name]: list the matching
; files, system files hidden, in as many
; columns of 13 as the console's width
; holds, through the pager, then a
; footer of the count of files and the
; drive's free space. Takes the operand
; at ARGSTRT: a bad command if it does
; not parse or more follows it. Uses
; CMDFCB, LOADBUF as the DMA record,
; DIRCOL, DIRNCOL and DIRNUM; returns to
; the prompt, by FILENO when nothing
; matched.
; DIR calls the BDOS for the DMA (26),
; search first and next (17, 18), the
; drive's free space (46) and, when a
; page fills, a key (6); it reads only
; the
; directory record search returns in the
; DMA.
CMDDIR:
  call ARGSKIP   ; the operand, past its
                 ; spaces,
  call CMDPARSE  ; into CMDFCB, or a bad
                 ; command,
  call ENDCHK    ; with nothing after it
; no name, with or without a drive:
; every file
  ld a,(CMDFCB+1)
  cp SPACE
; a name given: searched for as it is
  jr nz,DIRREADY
; else all 11 name and type bytes
  ld hl,CMDFCB+1
  ld b,11
  ld a,'?'

DIRWILD:
  ld (hl),a
  inc hl
  djnz DIRWILD   ; become ?, which
                 ; matches anything

; Set up the listing: the directory
; records the searches return go to
; LOADBUF, no row is started, no file
; counted, and DIRNCOL takes the count
; of entries a row holds, at least one.
; The pager starts a new screen, and
; the first search's result goes to
; DIRLOOP in A.
DIRREADY:
  ld de,LOADBUF  ; BDOS 26: the DMA
                 ; record, where each
  ld c,26        ; search returns a
                 ; directory record
  call BDOS
  xor a
  ld (DIRCOL),a  ; no row yet: the first
                 ; entry starts one
  ld h,a
  ld l,a
; no file listed yet
  ld (DIRNUM),hl
  ld a,(VWID)    ; TEC-OS: columns of 13
                 ; that fit the console
  or a           ; 0 when no video
                 ; console is fitted
  jr nz,DIRWID
  ld a,80        ; serial only: assume
                 ; 80

DIRWID:
  ld b,0         ; B counts the columns
                 ; that fit

DIRWDIV:
  sub 13         ; 12 for a name, one
                 ; space between
  jr c,DIRWSET   ; no room for another
  inc b
  jr DIRWDIV

DIRWSET:
  ld a,b
  or a           ; a console under 13
                 ; wide
  jr nz,DIRWOK
  inc a          ; still has one column

DIRWOK:
; the entries on a full row
  ld (DIRNCOL),a
  call PGINIT    ; the pager starts a
                 ; new screen
  call DOSSEQ    ; the first match, by
                 ; search first
  DB 17*2+0      ; BDOS 17, source FCB

; One search result in A: the matching
; entry's index, 0 to 3, in the
; directory record at LOADBUF, or FFh
; when no more match. A system file is
; passed over; any other is printed, a
; new row begun when the last is full.
DIRLOOP:
  inc a          ; FFh: the search is
                 ; over
  jp z,DIRDONE
  dec a
  ld l,a         ; the entry at LOADBUF
                 ; + 32 * index
  ld h,0
  add hl,hl      ; five doublings: 32
                 ; bytes an entry
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl
  ld de,LOADBUF  ; from the record's
                 ; start
  add hl,de
  push hl
  ld de,10       ; the type's second
                 ; byte, whose bit 7
  add hl,de
  bit 7,(hl)     ; is the system
                 ; attribute
  pop hl
  jr nz,DIRNEXT  ; a system file: not
                 ; listed
  push hl        ; live until DIRNAME;
                 ; abort resets SP
  ld a,(DIRCOL)  ; entries still to go
                 ; on this row
  or a
  jr z,DIRHEAD   ; none: this entry
                 ; starts a new row
  ld e,SPACE     ; else one space after
                 ; the last entry
  call PUTCHAR
  jr DIRNAME

; A new row: DIRCOL takes the count of
; entries a full row holds. Every row
; but the first begins with CR LF
; through the pager, which may pause
; there,
; and the listing stops if the key says
; so. The entry's address is on the
; stack.
DIRHEAD:
; columns remaining in this row
  ld a,(DIRNCOL)
  ld (DIRCOL),a
  ld hl,(DIRNUM)
  ld a,h         ; no file listed yet:
                 ; the first row
  or l           ; needs no line break
                 ; before it
  jr z,DIRNAME
  call PGCRLF    ; end the last row
  jp c,STARTED   ; stopped at a page
                 ; pause

; One entry as NAME.EXT, padded to 12
; unless it ends the line. Takes the
; entry's address on the stack; counts
; it in DIRNUM and DIRCOL and goes on
; to the next search.
DIRNAME:
; one more file listed
  ld hl,(DIRNUM)
  inc hl
  ld (DIRNUM),hl
  pop hl         ; the entry, its user
                 ; byte first,
  inc hl         ; and then its 8-byte
                 ; name
  ld b,8
  ld c,0         ; characters printed
  call PUTTRIM   ; the name without its
                 ; spaces
  ld a,(hl)      ; the type's first
                 ; byte, its attribute
  and $7F        ; cleared: a space when
                 ; there is no type
  cp SPACE
  jr z,DIRPAD    ; and then no dot
  ld e,'.'
  call PUTCHAR
  inc c          ; the dot counts toward
                 ; the 12
  ld b,3
  call PUTTRIM   ; then the 3-byte type

DIRPAD:
  ld hl,DIRCOL   ; one fewer entry left
                 ; on this row
  dec (hl)
  jr z,DIRNEXT   ; the row's last entry:
                 ; no padding

DIRPADC:
  ld a,c         ; spaces after the
                 ; entry
  cp 12
  jr nc,DIRNEXT  ; until it is 12 wide
  ld e,SPACE
  call PUTCHAR
  inc c
  jr DIRPADC

; The next match, by search next, to
; DIRLOOP with its result in A.
DIRNEXT:
  call DOSSEQ    ; the next match's
                 ; index, or FFh
  DB 18*2+0      ; BDOS 18, source FCB
  jp DIRLOOP

; The search is over: NO FILE when
; nothing was listed, else the footer.
; Returns to the prompt.
DIRDONE:
  ld hl,(DIRNUM)
  ld a,h         ; not one file listed
  or l
  jp z,FILENO    ; is the NO FILE error

; Footer: "n files, nK free" for the
; drive listed.
  call PGCRLF    ; end the last row
  jp c,STARTED   ; stopped at a page
                 ; pause
  ld hl,(DIRNUM)
  call PUTDEC    ; the count of files
; " files, " for any count
  ld de,FILESMSG
  ld hl,(DIRNUM)
  dec hl         ; but one: " file, "
  ld a,h
  or l
  jr nz,DIRSUM2
  ld de,FILEMSG

DIRSUM2:
  call PUTSTR    ; the word, singular or
                 ; plural
  ld a,(CMDFCB)  ; the drive named, 1
                 ; for A:,
  dec a          ; as the BDOS numbers
                 ; it, 0 for A:
  jp p,DIRFREE   ; a drive named: its
                 ; number
  ld a,(CURDSK)  ; none named: the
                 ; current drive, from
  and $0F        ; 0004h's low nibble;
                 ; the user is above

DIRFREE:
  ld e,a         ; BDOS 46: the drive's
                 ; free records,
  ld c,46        ; 24 bits, into the DMA
                 ; record LOADBUF
  call BDOS
; kilobytes = records / 8
  ld hl,(LOADBUF)
; the count in A:H:L
  ld a,(LOADBUF+2)
  ld b,3         ; three halvings

DIRFK:
  srl a
  rr h
  rr l
  djnz DIRFK     ; HL the kilobytes,
                 ; which a drive fits
  call PUTDEC
  ld de,FREEMSG  ; "K free"
  call PUTSTR
  jp STARTED     ; a new line and the
                 ; prompt

; ---- Page pauses (TEC-OS)
; --------------------------------------
; TYPE and DIR count the lines they
; print, including lines that wrap at
; the
; console width. One line short of a
; full screen they show [more] and wait
; for
; a key: ^C, Esc or Q stops the listing,
; anything else shows the next screen.
; The size comes from the console
; geometry; a serial-only console is 80
; x 24.

; Start a listing on a new screen: no
; lines counted and the column at 0,
; with the screen's rows, less one for
; the pause prompt, and its width from
; the console geometry, or 24 by 80 for
; a serial console. Destroys AF.
PGINIT:
  xor a
  ld (PGLINE),a  ; no lines printed on
                 ; this screen
  ld (PGCOL),a   ; at the start of a
                 ; line
  ld a,(VHGT)    ; the video console's
                 ; rows,
  or a           ; 0 when there is none
  jr nz,PGIH
  ld a,24        ; a serial terminal's
                 ; 24

PGIH:
  dec a          ; the last row holds
                 ; the pause prompt
  ld (PGROWS),a
  ld a,(VWID)    ; the columns,
                 ; likewise,
  or a
  jr nz,PGIW
  ld a,80        ; or a serial
                 ; terminal's 80

PGIW:
  ld (PGWID),a
  ret

; Print CR LF through the pager. Carry
; set when the user stops the listing.
; Destroys AF, DE and HL, and BC when it
; pauses.
PGCRLF:
  ld e,CR
  call PGPUT
  ret c          ; stopped at a page
                 ; pause
  ld e,LF        ; then the line feed,
                 ; by PGPUT below

; Print E, counting lines and pausing
; when the screen is full. Carry set
; when the user stops the listing. PGCOL
; follows the column: CR returns it
; to 0, a backspace steps it back, a tab
; moves it to the next multiple of 8,
; and a printable character at the width
; begins a wrapped line. Destroys AF,
; DE and HL, and BC when it pauses.
PGPUT:
  ld a,e
  cp LF          ; line feed: a new
                 ; line, perhaps a pause
  jr z,PGLF
  cp CR          ; carriage return:
                 ; column 0
  jr z,PGCR
  cp 8           ; backspace: one column
                 ; back
  jr z,PGBS
  cp 9           ; tab: to the next
                 ; multiple of 8
  jr z,PGTAB
  cp SPACE
  jr c,PGOUT     ; other control bytes
                 ; take no room
  ld a,(PGCOL)   ; a printable
                 ; character: at the
                 ; width
  ld hl,PGWID
  cp (hl)
  jr c,PGINC     ; or past it, it wraps;
                 ; short of it, fits
  push de        ; this character starts
                 ; a wrapped line
  call PGNEWL
  pop de
  ret c          ; stopped at a page
                 ; pause
  xor a          ; from column 0 of the
                 ; new line

PGINC:
  inc a          ; the column after this
                 ; character

PGSETC:
  ld (PGCOL),a

PGOUT:
  call PUTCHAR
  or a           ; carry clear: the
                 ; listing goes on
  ret

PGCR:
  xor a
  jr PGSETC      ; the column back to 0

PGBS:
  ld a,(PGCOL)
  or a           ; a backspace at column
                 ; 0 stays there
  jr z,PGOUT
  dec a          ; else one column left
  jr PGSETC

PGTAB:
  ld a,(PGCOL)
  or 7           ; the next column that
                 ; is a multiple of 8
  inc a
  jr PGSETC

PGLF:
  call PUTCHAR   ; the line feed itself
                 ; first
; A new line begins. Pause first if the
; screen is full: show [more], wait
; for a key and erase the prompt. ^C,
; Esc or Q return carry set to stop the
; listing; any other key starts a new
; screen. Otherwise the line is counted
; and the column set to 0, with carry
; clear. Destroys AF, DE and HL, and BC
; when it pauses.
PGNEWL:
  ld a,(PGLINE)
  inc a          ; this screen's lines
                 ; with the new one
  ld hl,PGROWS
  cp (hl)
  jr c,PGNL1     ; still room: count it
  ld de,MOREMSG  ; full: [more] on the
                 ; last row
  call PUTSTR

PGWAIT:
  ld e,$FF       ; direct console input,
                 ; no echo
  ld c,6         ; BDOS 6, which returns
                 ; 0 with no key
  call BDOS
  or a
  jr z,PGWAIT    ; wait for one
  push af        ; the key, kept across
                 ; the erase
  ld de,UNMORE   ; spaces over [more],
                 ; back to column 0
  call PUTSTR
  pop af
  and $DF        ; upper case; ^C and
                 ; Esc are unaffected
  cp 3           ; ^C
  jr z,PGDROP
  cp $1B         ; Esc
  jr z,PGSTOP
  cp 'Q'
  jr z,PGSTOP
  xor a          ; any other key: a new
                 ; screen

PGNL1:
  ld (PGLINE),a
  xor a          ; column 0, and carry
                 ; clear: go on
  ld (PGCOL),a
  ret
; ^C drops the rest of a chained line,
; as it does at a program's line input;
; Esc and Q stop only the listing. Both
; return carry set.
PGDROP:
  xor a
  ld (CHPOS),a   ; no chained piece left
                 ; to run

PGSTOP:
  scf            ; carry: the listing
                 ; stops
  ret

; Print up to B characters from HL,
; without their attribute bits and
; passing over spaces; count those
; printed in C, which runs on from its
; value at entry. Leaves HL after the
; field and B at 0. Destroys AF and DE.
PUTTRIM:
  ld a,(hl)
  and $7F        ; the character without
                 ; its attribute
  cp SPACE
  jr z,PUTTSK    ; a space is not
                 ; printed
  ld e,a
  call PUTCHAR   ; which keeps B, C and
                 ; HL
  inc c

PUTTSK:
  inc hl
  djnz PUTTRIM   ; the rest of the field
  ret

; Print HL in decimal without leading
; zeros: the remainders of division by
; 10 go on the stack above a 10, which
; no digit equals, and print in reverse.
; Destroys AF, BC, DE and HL.
PUTDEC:
  ld de,10       ; the divisor, and the
                 ; end marker
  push de

PUTDL:
  call DIV16     ; HL mod 10 in HL, HL /
                 ; 10 in DE
  push hl        ; a digit, the lowest
                 ; first
  ex de,hl       ; on with the quotient
  or l           ; A = H: DIV16 leaves A
                 ; = D
  ld de,10
  jr nz,PUTDL    ; until the quotient is
                 ; 0

PUTDP:
  pop hl         ; the digits, the
                 ; highest first
  ld a,l
  cp 10          ; the end marker: all
                 ; printed
  ret z
  add a,'0'      ; the digit as a
                 ; character
  ld e,a
  call PUTCHAR
  jr PUTDP

; TYPE name: print a text file through
; the pager, up to its first ^Z or
; its end, then close it. NO FILE when
; no name is given or the file is not
; there; a bad command for an ambiguous
; name or more after it. Uses CMDFCB
; and LOADBUF as the DMA record; returns
; to the prompt.
; TYPE streams public 128-byte records
; and stops at CP/M text EOF.
CMDTYPE:
  call ARGSKIP   ; the operand: none is
                 ; NO FILE
  jr z,FILENO
  call ONENAME   ; one unambiguous name
                 ; into CMDFCB
  call DOSSEQ    ; open it
  DB 15*2+0      ; BDOS 15, source FCB
  inc a
  jr z,FILENO    ; FFh: not found
  ld de,LOADBUF  ; BDOS 26: records are
                 ; read
  ld c,26        ; into LOADBUF
  call BDOS
  call PGINIT    ; the pager starts a
                 ; new screen

; The next record into LOADBUF. A
; nonzero result is the file's end, or a
; read error, and ends the listing.
TYPEREAD:
  call DOSSEQ    ; read sequential: A 0
                 ; for a record
  DB 20*2+0      ; BDOS 20, source FCB
  or a
  jr nz,TYPEEND  ; the file's end
  ld hl,LOADBUF  ; the record's 128
                 ; bytes in turn
  ld b,128

; Each byte of the record through the
; pager, up to a ^Z, CP/M's end of
; text. HL points to the byte and B
; counts those left in the record.
TYPEBYTE:
  ld a,(hl)
  cp $1A         ; ^Z: the text ends
                 ; here
  jr z,TYPEEND
  ld e,a
  push bc        ; the pager destroys
                 ; HL, and BC
  push hl        ; when it pauses
  call PGPUT
  pop hl
  pop bc
  jr c,TYPEEND   ; stopped at a page
                 ; pause
  inc hl
  djnz TYPEBYTE  ; the rest of the
                 ; record,
  jr TYPEREAD    ; then the next

; Close the file and return to the
; prompt on a new line.
TYPEEND:
  call DOSSEQ    ; close it
  DB 16*2+0      ; BDOS 16, source FCB
  jp STARTED     ; a new line and the
                 ; prompt

; The NO FILE error: the message, the
; failure code and the prompt.
FILENO:
  ld de,NOFILE
  jp ERRGO       ; the message at DE as
                 ; a failure
