; The CCP's terminal work: the pager for
; TYPE and DIR, and the prompt's history
; for ^W, ^N, Up and Down. Names follow
; Origo MD-16. Included by rom.asm.

; ---- The pager

; Put E through the pager, keeping the
; row and column as the screen does: LF,
; CR, BS and tab move the column, other
; controls take none, and a byte past
; the width wraps first. One row short
; of a full screen it waits at [more].
; TNPAGE gives it to the shell. Carry:
; the listing stopped. Changes AF, DE,
; HL, and BC at [more].

pgPut:
  ld a,e         ; the byte
  cp LF
  jr z,.lf       ; out, then counted
  cp CR
  jr z,.cr       ; column 0
  cp 8
  jr z,.bs       ; a column back
  cp TAB
  jr z,.tab      ; to the next eighth
  cp SPACE
  jr c,.out      ; a control: no column
  ld a,(VWID)    ; the screen's width
  or a           ; 0 on serial
  jr nz,.wide
  ld a,80        ; serial: 80 columns

.wide:
  ld hl,PgCol
  sub (hl)       ; Z: the row is full
  ld a,(hl)      ; the column
  jr nz,.next    ; room on the row
  push de        ; the byte across
  call pgNewLn   ; wrap to a new row
  pop de
  ret c          ; stopped: not shown
  xor a          ; at column 0

.next:
  inc a          ; one column on

.set:
  ld (PgCol),a   ; the new column

.out:
  call PUTCHAR   ; E to the screen
  or a           ; NC: go on
  ret

.cr:
  xor a          ; back to column 0
  jr .set

.bs:
  ld a,(PgCol)
  or a           ; at column 0
  jr z,.out      ; it stays there
  dec a          ; else one back
  jr .set

.tab:
  ld a,(PgCol)
  or 7           ; the eighth's end
  inc a          ; and the next start
  jr .set

.lf:
  call PUTCHAR   ; LF first, then
                 ; count the row

; A new row: one more counted, and one
; row short of a full screen, [more]
; and a key, read with no echo. ^C
; stops and drops the rest of the line
; (CHPOS bit 1); Esc or Q stops; any
; other key starts a new page. Carry:
; stopped.

pgNewLn:
  ld a,(VHGT)    ; the screen's rows
  or a           ; 0 on serial
  jr nz,.rows
  ld a,24        ; serial: 24 rows

.rows:
  dec a          ; a row for [more]
  ld hl,PgLine
  inc (hl)       ; one more row out
  cp (hl)
  jr z,.more     ; the page is full
  jr nc,.room    ; room on the page

.more:
  ld de,MoreMsg  ; [more] at the foot
  call PUTSTR

.wait:
  ld e,$FF       ; BDOS 6: a key, not
  ld c,6         ; echoed, or 0
  call BDOS
  or a
  jr z,.wait     ; none yet
  push af        ; the key, kept
  ld de,UnMore   ; [more] erased
  call PUTSTR
  pop af
  and $DF        ; q as Q
  cp 3           ; ^C
  jr z,.drop
  cp $1B         ; Esc
  jr z,.stop
  cp 'Q'
  jr z,.stop
  xor a          ; any other key:
  ld (PgLine),a  ; a new page

.room:
  xor a          ; column 0, NC
  ld (PgCol),a
  ret

.drop:
  ld hl,CHPOS    ; the line's rest is
  set 1,(hl)     ; dropped, for a shell

.stop:
  scf            ; the listing stops
  ret

; ---- The prompt's history

; L one on in HistRing, wrapping from
; its end to its start. Changes AF.

hstNext:
  inc l          ; one on
  ld a,l
  cp LOW(HistRing+HIST_LEN)
  ret nz         ; still within it
  ld l,LOW(HistRing)
  ret

; L one back in HistRing, wrapping from
; its start to its end. Changes AF.

hstPrev:
  ld a,l
  cp LOW(HistRing)
  jr nz,.back    ; not at the start
  ld l,LOW(HistRing+HIST_LEN)

.back:
  dec l          ; one back
  ret

; Recall a line, from BDOS 10 at the
; prompt: C = ^W, older, or ^N, newer.
; Carry: none to show. Otherwise HL is
; the line's first byte in HistRing,
; zero-ended, which line input copies
; over the line being typed, stepping
; with hstNext. Changes AF, BC, DE, HL.

hstRecal:
  ld h,HIGH(HistRing)
  ld a,(HistPos)
  ld l,a         ; the shown line's end
  ld a,c
  cp CTRLN
  jr z,.newer    ; ^N: the newer one
  call hstStart  ; this line's start
  call hstPrev   ; the older one's zero
  call hstPrev   ; and its last byte
  ld a,(hl)
  or a           ; 0: no older line
  scf
  ret z
  call hstNext   ; L at its zero
  jr .show

.newer:
  ld a,(HistHead)
  cp l           ; at the newest:
  scf            ; nothing newer
  ret z

.scan:
  call hstNext   ; on to the next
  ld a,(hl)      ; line's zero
  or a
  jr nz,.scan

.show:
  ld a,l         ; its end, now the
  ld (HistPos),a
  call hstStart  ; HL at its start
  or a           ; NC: a line to show
  ret

; L back to the first byte of the line
; whose zero is at L. Changes AF.

hstStart:
  call hstPrev   ; the byte before
  ld a,(hl)
  or a           ; the older's zero?
  jr nz,hstStart
  jr hstNext     ; the line's first

; Keep a typed line, from BDOS 10 at the
; prompt: DE = the line, B = its
; length. It is not kept if it holds a
; zero, repeats the newest or would
; fill the ring. The oldest lines it
; covers are cleared to their zero.
; Changes AF, BC, DE, HL.

hstStore:
  ld a,b
  cp HIST_LEN-1  ; it and its zero
  ret nc         ; must leave a zero
  ld h,HIGH(HistRing)
  ld a,(HistHead)
  ld l,a
  call hstPrev   ; the newest's zero
  call hstStart  ; its first byte
  push de        ; the line, kept
  push bc        ; with its length
  ld c,0         ; bytes that differ

.cmp:
  ld a,(de)
  or a           ; a zero in it:
  jr z,.keep     ; not kept
  cp (hl)        ; as the newest's?
  jr z,.same
  inc c          ; one differs

.same:
  inc de
  call hstNext
  djnz .cmp
  call hstNext   ; past its end
  ld a,(HistHead)
  cp l           ; the head next?
  jr nz,.new     ; the newest is longer
  inc c
  dec c          ; Z: no byte differed
  jr z,.keep     ; a repeat

.new:
  pop bc
  pop de
  ld a,(HistHead)
  ld l,a         ; stored at the head

.put:
  ld a,(de)      ; a byte of the line
  ld (hl),a
  inc de
  call hstNext   ; wrapping
  djnz .put
  ld (hl),0      ; its zero
  call hstNext
  ld a,l         ; the new head
  ld (HistHead),a

.clear:
  ld a,(hl)      ; an overwritten
  ld (hl),0      ; line's byte, cleared
  push af
  call hstNext
  pop af
  or a           ; to its zero
  jr nz,.clear
  ret

.keep:
  pop bc         ; not kept
  pop de
  ret
