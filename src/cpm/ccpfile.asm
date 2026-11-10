; CCP DIR, paging, field/decimal output
; and TYPE. ERA/REN/COPY and hex output
; belong to ccpmut.asm.

; DIR [d:][name]: list visible matches
; through the pager, then file count and
; free space. System entries are hidden.
; NO FILE: none was listed, even if
; hidden entries matched.
; Parse the optional operand into CMDFCB
; and reject errors/non-space suffixes.
; If the first name byte is SPACE, fill
; all 11 name/type bytes with '?' while
; keeping any explicit drive. Uses
; LOADBUF as public search DMA.

CMDDIR:
  call ARGSKIP   ; optional operand
  call CMDPARSE  ; parse pattern
  call ENDCHK    ; reject extra text

  ld a,(CMDFCB+1)
  cp SPACE

  jr nz,DIRREADY

  ld hl,CMDFCB+1
  ld b,11        ; whole name/type
  ld a,'?'       ; wildcard fill byte

DIRWILD:
  ld (hl),a
  inc hl
  djnz DIRWILD

; Set DMA=LOADBUF and clear
; DIRCOL/DIRNUM. Use
; DIRNCOL=max(1,floor(width/13)), with
; VWID=0 meaning 80. A formatted entry
; uses up to 12 positions plus an
; inter-entry space. Initialise the
; pager and search first through BDOS
; 17. Pass result A to DIRLOOP.

DIRREADY:
  call SETLB
  xor a
  ld (DIRCOL),a  ; no row yet
  ld h,a
  ld l,a

  ld (DIRNUM),hl
  call PGINIT    ; A=the paging width

DIRWID:
  ld b,$FF       ; columns that fit

DIRWDIV:
  inc b
  sub 13         ; 12 plus separator
  jr nc,DIRWDIV
  ld a,b
  or a           ; width below 13
  jr nz,DIRWOK
  inc a          ; minimum one column

DIRWOK:

  ld (DIRNCOL),a
  call DOSSEQ    ; first public match
  DB 17*2+0      ; 17: CMDFCB

; Handle search result A: FFh ends.
; Otherwise slot 0..3 selects
; LOADBUF+32*slot. Skip entry byte 10
; bit 7 (system) without changing the
; visible count.
; For a visible entry save its pointer
; until DIRNAME. DIRCOL=0 starts a row.
; Otherwise print one separator. Pager
; abort abandons that word until
; MAINLOOP resets SP.

DIRLOOP:
  inc a          ; FFh: search ended
  jr z,DIRDONE
  dec a
  rrca
  rrca
  rrca           ; slot*32
  ld l,a
  ld h,0
  ld de,LOADBUF  ; DMA record base
  add hl,de
  push hl        ; keep entry base
  ld de,10       ; system byte offset
  add hl,de
  bit 7,(hl)     ; t2 attribute bit
  pop hl
  jr nz,DIRNEXT  ; hidden: no count
  push hl        ; entry until DIRNAME
  ld a,(DIRCOL)  ; columns remaining
  or a
  jr z,DIRHEAD   ; new visible row
  ld e,SPACE     ; inter-entry separator
  call PUTCHAR
  jr DIRNAME

; Start a row with DIRCOL=DIRNCOL. The
; first visible row needs no leading
; newline. Later rows use PGCRLF. Carry
; enters STARTED with the saved entry
; pointer abandoned until MAINLOOP
; resets SP.

DIRHEAD:

  ld a,(DIRNCOL)
  ld (DIRCOL),a
  ld hl,(DIRNUM)
  ld a,h
  or l
  jr z,DIRNAME   ; first row: no newline
  call PGCRLF    ; pager row break

STARTC:
  jp c,STARTED   ; abort abandons word

; Print the saved entry and increment
; visible DIRNUM. Skip its user byte,
; set C=0 and print eight name bytes
; through PUTTRIM. If the first type
; byte is SPACE, omit dot and the entire
; type. Otherwise count the dot and
; print three type bytes. Attribute bits
; and all spaces are omitted.

DIRNAME:

  ld hl,(DIRNUM)
  inc hl
  ld (DIRNUM),hl
  pop hl         ; recover entry base
  inc hl         ; skip user byte
  ld b,8         ; positive name length
  ld c,0         ; printed width count
  call PUTTRIM   ; all spaces omitted
  ld a,(hl)      ; first type byte
  and $7F        ; ignore attribute bit
  cp SPACE
  jr z,DIRPAD    ; SPACE: omit all type
  ld e,'.'
  call PUTCHAR
  inc c          ; dot adds to width
  ld b,3         ; positive type length
  call PUTTRIM   ; print masked type

; After an entry decrement DIRCOL. The
; row's last column skips padding.
; Others add spaces until C=12. The next
; visible entry supplies its separate
; one-space separator.

DIRPAD:
  ld hl,DIRCOL   ; one fewer column
  dec (hl)
  jr z,DIRNEXT   ; last column: no pad

DIRPADC:
  ld a,c         ; current printed width
  cp 12
  jr nc,DIRNEXT  ; pad only to 12
  ld e,SPACE
  call PUTCHAR
  inc c          ; include padding
  jr DIRPADC

; Continue through BDOS 18 and enter
; DIRLOOP with A's result. Hidden system
; entries reach this path without
; changing the visible count or columns.

DIRNEXT:
  call DOSSEQ    ; public continuation
  DB 18*2+0      ; 18: CMDFCB
  jr DIRLOOP

; Finish DIR: zero visible DIRNUM enters
; FILENO, including an all-hidden
; result. Otherwise complete the row
; through PGCRLF and allow pager abort
; before the footer.

DIRDONE:
  ld hl,(DIRNUM)
  ld a,h         ; visible count only
  or l
  jp z,FILENO    ; none visible: NO FILE

; Print the visible count, singular only
; for one. Query BDOS 46 for the
; explicit CMDFCB drive (1..16 mapped to
; 0..15) or CURDSK's low nibble. Current
; DMA LOADBUF receives a 24-bit
; free-record count.
; Shift right three for KiB and print HL
; plus K free, then STARTED. The
; supported drive sizes fit this 16-bit
; KiB result. Arbitrary 24-bit counts
; need not.

  call PGCRLF    ; last row break
  jr c,STARTC    ; pager abort
  ld hl,(DIRNUM)
  call PUTDEC    ; decimal visible count

  ld de,FILESMSG
  ld hl,(DIRNUM)
  dec hl         ; one file is singular
  ld a,h
  or l
  jr nz,DIRSUM2
  ld de,FILEMSG

DIRSUM2:
  call PUTSTR
  ld a,(CMDFCB)  ; encoded drive byte
  dec a          ; FCB 1..16 -> 0..15
  jp p,DIRFREE   ; explicit drive
  ld a,(CURDSK)  ; saved default drive
  and $0F        ; remove user nibble

DIRFREE:
  ld e,a         ; 0-based query drive
  ld c,46        ; 46: records to DMA
  call BDOS

  ld hl,(LOADBUF)

  ld a,(LOADBUF+2)
  ld b,3         ; records /8 -> KiB

DIRFK:
  srl a
  rr h
  rr l
  djnz DIRFK     ; KiB in HL
  call PUTDEC
  ld de,FREEMSG  ; K free suffix
  call PUTSTR
  jp STARTED

; TYPE and DIR share geometry-aware page
; accounting. Pause one row before a
; full screen. Serial fallback is 80x24.
; Mask each key with DFh. Value 03h
; drops remaining chained pieces and
; stops the listing. Value 1Bh or Q
; stops only the listing. Other masked
; values continue.

; Start pager bookkeeping:
; PGLINE=PGCOL=0, PGROWS=height-1 and
; PGWID=width. Zero VHGT defaults to 24.
; Zero VWID to 80 independently. Active
; video requires supported geometry.
; Returns A=PGWID. Changes AF/HL.

PGINIT:
  ld hl,0        ; PGLINE and PGCOL
  ld (PGLINE),hl
  ld a,(VHGT)    ; active video height
  or a
  jr nz,PGIH
  ld a,24        ; serial height 24

PGIH:
  dec a          ; reserve pause row
  ld (PGROWS),a
  ld a,(VWID)    ; active video width
  or a
  jr nz,PGIW
  ld a,80        ; serial width 80

PGIW:
  ld (PGWID),a
  ret

; Print CR through PGPUT and propagate
; carry abort. Otherwise fall into PGPUT
; with E=LF. LF is output before its
; pause check. Changes AF/DE/HL and BC
; on a pause.

PGCRLF:
  ld e,CR        ; CR first
  call PGPUT
  ret c          ; propagate abort
  ld e,LF        ; fall through with LF

; Print E with pager accounting.
; Dispatch LF/CR/BS/tab separately.
; Other bytes below SPACE take no
; columns. For other bytes at least
; SPACE, check width before output.
; At/beyond it call PGNEWL with DE saved
; and suppress the byte on abort.
; Otherwise advance PGCOL and output.
; Carry set stops the listing. Clear
; continues. Changes AF/DE/HL and BC on
; pause.

PGPUT:
  ld a,e
  cp LF          ; LF: output then count
  jr z,PGLF
  cp CR          ; CR: reset column
  jr z,PGCR
  cp 8           ; BS: saturating left
  jr z,PGBS
  cp 9           ; tab: next multiple 8
  jr z,PGTAB
  cp SPACE
  jr c,PGOUT     ; controls: no column
  ld a,(PGCOL)   ; current column
  ld hl,PGWID    ; width threshold
  cp (hl)
  jr c,PGINC     ; below width: fits
  push de        ; keep pending byte
  call PGNEWL    ; wrap before output
  pop de
  ret c          ; abort suppresses byte
  xor a          ; new line column zero

PGINC:
  inc a          ; column after byte

PGSETC:
  ld (PGCOL),a   ; publish column

PGOUT:
  call PUTCHAR   ; output original E
  or a           ; continue: carry clear
  ret

; CR resets PGCOL to zero. BS decrements
; it only when nonzero. Both output the
; original control byte through
; PGSETC/PGOUT and return carry clear.

PGCR:
  xor a          ; CR column zero
  jr PGSETC

PGBS:
  ld a,(PGCOL)
  or a           ; BS at zero stays
  jr z,PGOUT
  dec a          ; BS one column left
  jr PGSETC

; Set PGCOL=(PGCOL OR 7)+1 in its
; eight-bit counter and output the tab.
; No PGNEWL call occurs here. A later
; byte at least SPACE performs the width
; check.

PGTAB:
  ld a,(PGCOL)
  or 7           ; next multiple of 8
  inc a
  jr PGSETC

; Output LF first, then enter PGNEWL.
; Printable-wrap entry instead checks
; before outputting its pending
; character.

PGLF:
  call PUTCHAR   ; LF before pause

; Begin a line: compare PGLINE+1 with
; PGROWS. Below threshold count it and
; reset column/carry. At/above threshold
; print [more] and poll BDOS 6, E=FFh,
; until a nonzero key.
; Save the key across prompt erasure,
; then mask with DFh. Value 03h enters
; PGDROP. Value 1Bh or Q enters PGSTOP.
; Other masked values reset PGLINE/PGCOL
; to zero. Abort leaves these counters
; unchanged here. Changes AF/DE/HL and
; BC on pause.

PGNEWL:
  ld a,(PGLINE)  ; current line count
  inc a          ; new line candidate
  ld hl,PGROWS   ; pause threshold
  cp (hl)
  jr c,PGNL1     ; room: keep count
  ld de,MOREMSG  ; pause prompt
  call PUTSTR

PGWAIT:
  ld e,$FF       ; non-echo input
  ld c,6         ; 6: poll until key
  call BDOS
  or a
  jr z,PGWAIT    ; 0: poll again
  push af        ; key across erasure
  ld de,UNMORE   ; erase prompt only
  call PUTSTR
  pop af
  and $DF        ; mask every key
  cp 3           ; 03h: drop chain
  jr z,PGDROP
  cp $1B         ; 1Bh: stop listing
  jr z,PGSTOP
  cp 'Q'         ; Q stops listing
  jr z,PGSTOP
  xor a          ; continue: page zero

PGNL1:
  ld (PGLINE),a  ; publish new count
  xor a          ; reset column/carry
  ld (PGCOL),a
  ret

; Masked value 03h clears CHPOS before
; the shared carry-set return. Values
; 1Bh/Q leave CHPOS intact and stop only
; this listing. No STPOS/startup-file
; position is cleared.

PGDROP:
  xor a
  ld (CHPOS),a   ; drop chained pieces

PGSTOP:
  scf            ; listing abort carry
  ret

; Print a field from HL with positive
; B=1..255. Current callers use 8 or 3.
; Examine exactly B bytes, mask bit 7
; and skip every SPACE, including
; internal ones. Increment C per output
; from its incoming value.
; Return HL advanced by original B and
; B=0. Changes AF/DE. B=0 would iterate
; 256 times, not perform a zero-length
; operation.

PUTTRIM:
  ld a,(hl)
  and $7F        ; ignore attribute bit
  cp SPACE
  jr z,PUTTSK    ; skip every SPACE
  ld e,a
  call PUTCHAR   ; keeps BC/HL
  inc c          ; accumulate width

PUTTSK:
  inc hl
  djnz PUTTRIM   ; positive-B loop
  ret

; Print unsigned HL in decimal,
; including zero, without leading zeros.
; Divide repeatedly by 10 through DIV16
; and push remainder digits above
; sentinel word 10. Pop/print in reverse
; until that sentinel.
; At most five digit words plus sentinel
; are used, excluding call frames.
; Divisor 10 meets DIV16's 1..8000h
; bound. Changes AF/BC/DE/HL.

PUTDEC:
  ld de,10       ; divisor and sentinel
  push de

PUTDL:
  call DIV16     ; quotient DE, rem HL
  push hl        ; low digit first
  ex de,hl       ; continue quotient
  or l           ; A=H: test quotient
  ld de,10       ; restore divisor 10
  jr nz,PUTDL    ; nonzero quotient

PUTDP:
  pop hl         ; high digit first
  ld a,l
  cp 10          ; sentinel, not digit
  ret z
  add a,'0'      ; digit character
  ld e,a
  call PUTCHAR
  jr PUTDP

; TYPE name: require one unambiguous
; complete reference. No operand or FFh
; open result enters FILENO. Set
; DMA=LOADBUF, initialise the pager and
; stream 128-byte records, stopping
; before 1Ah.

CMDTYPE:
  call ARGSKIP   ; missing operand
  jr z,FILENO    ; NO FILE branch
  call ONENAME   ; one complete name
  call DOSSEQ    ; open descriptor
  DB 15*2+0      ; 15: CMDFCB
  inc a
  jr z,FILENO    ; FFh open: NO FILE
  call SETLB
  call PGINIT    ; pager initial state

; Read CMDFCB's next record through BDOS
; 20. On zero set HL=LOADBUF and B=128
; for the byte loop. Any nonzero
; returned result enters TYPEEND without
; distinguishing EOF/read error. Other
; BDOS errors may abort nonlocally.

TYPEREAD:
  call DOSSEQ    ; sequential read
  DB 20*2+0      ; 20: CMDFCB
  or a
  jr nz,TYPEEND  ; all nonzero statuses
  ld hl,LOADBUF  ; record start
  ld b,128       ; 128 byte counter

; Print record bytes until 1Ah, detected
; before output. Preserve BC/HL around
; PGPUT, restoring count/pointer even on
; carry abort. Carry enters TYPEEND.
; Otherwise advance until the next
; record.

TYPEBYTE:
  ld a,(hl)
  cp $1A         ; 1Ah before output
  jr z,TYPEEND
  ld e,a
  push bc        ; count across pager
  push hl        ; pointer across pager
  call PGPUT
  pop hl
  pop bc
  jr c,TYPEEND   ; carry after restore
  inc hl
  djnz TYPEBYTE  ; remaining record
  jr TYPEREAD    ; next record

; Attempt to close CMDFCB, ignoring its
; ordinary result, then enter STARTED
; for newline and command loop. This
; handles text EOF, nonzero reads and
; pager abort.

TYPEEND:
  call DOSSEQ    ; unchecked close
  DB 16*2+0      ; 16: CMDFCB
  jp STARTED     ; newline/prompt

; Report NOFILE through ERRGO: set
; PRGCODE=FF00h, print the message and
; join STARTED. Includes missing TYPE
; operand/FFh open and DIR with no
; visible entries.

FILENO:
  ld de,NOFILE
  jp ERRGO       ; failure-code message
