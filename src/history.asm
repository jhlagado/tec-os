; Command-line history: lines typed at
; the CCP prompt, kept in one page of
; EXPAND 1 from cold boot. ^W at the
; prompt recalls the line before, ^N the
; line after. Function 10 called by a
; program is CP/M 2.2's, with ^W and ^N
; as characters.
;
; The ring: each line followed by a 0,
; written forward from HHEAD with the
; offset wrapping at 256. After the
; terminator, bytes are zeroed forward
; up to and including the next one
; already 0, which removes what is left
; of the oldest line it overwrote. So
; ring[HHEAD-1] and ring[HHEAD] are both
; 0, and a walk back from the newest
; stops at an empty entry. A line
; holding a 0 is not stored; nor is one
; equal to the newest. The ring's page,
; HRING, is fixed, and cold boot clears
; it.

HRING EQU $BD00  ; its page, in EXPAND 1

; A = the ring's byte at L (HGET), or
; that byte = A (HPUT), with H the
; ring's page, HRING>>8. EXPAND 1 is in
; view for the access alone, with
; interrupts off, and no stack is used
; while it is, since it may cover the
; stack. Interrupts are left as they
; were. Keeps BC, DE and HL; destroys F.

HPUT:
  push bc
  ld b,a         ; B = the byte to write
  ld c,1         ; C = 1: write, then
                 ; read back
  jr HACC

HGET:
  push bc
  ld c,0         ; C = 0: read only

HACC:
  call IFFGET    ; P/V = interrupts on,
  di             ; kept on the stack
                 ; while they are off
  push af
  ld a,(LATCHV)  ; EXPAND 1 into view at
                 ; 8000h-BFFFh
  or LATEXP
  out (SYSLAT),a
  dec c          ; Z for HPUT only
  jr nz,HACC1
  ld (hl),b

HACC1:
  ld b,(hl)      ; the byte, read (or
                 ; read back)
  ld a,(LATCHV)  ; the usual memory
                 ; back, as the latch
                 ; had it
  out (SYSLAT),a
  pop af
  jp po,HACC2    ; interrupts were off:
                 ; leave them so
  ei

HACC2:
  ld a,b         ; the byte in A
  pop bc
  ret

; L = an entry's terminator: L = its
; first byte, L itself when it is empty.
; H the ring's page. Destroys AF.

HSTART:
  dec l          ; the byte before L: a
                 ; 0 there
  call HGET      ; makes L the entry's
                 ; start
  inc l
  or a
  ret z
  dec l          ; else one back and
                 ; look again
  jr HSTART

; ^W or ^N, in C, at the CCP prompt: the
; line in the buffer replaced by the
; line before or after the one shown.
; HPOS is the shown line's terminator,
; HHEAD's empty entry when none is
; shown. The new line is copied into the
; buffer (LINPTR, LINCNT, cut at LINMAX)
; and echoed. Changes AF, BC, HL and
; what LINERASE and ECHOCHAR change.

HREC:
  ld h,HRING>>8
  ld a,(HPOS)    ; L = the shown line's
                 ; terminator
  ld l,a
  ld a,c
  cp CTRLN
  jr z,HRNEW     ; ^N: the line after
  call HSTART    ; ^W: the shown line's
                 ; first byte,
  dec l          ; the line before's
                 ; terminator
  dec l          ; and its last byte: a
                 ; 0 there
  call HGET      ; means that line is
                 ; empty, the end
  inc l
  or a
  ret z          ; none before: stay
  jr HRSHOW

HRNEW:
  ld a,(HHEAD)
  cp l
  ret z          ; none shown

HRNEW1:
  inc l          ; forward to the next
                 ; terminator,
  call HGET      ; the next line's; past
                 ; the newest
  or a           ; that is HHEAD's empty
                 ; entry
  jr nz,HRNEW1

HRSHOW:
  ld a,l         ; the line to show, by
                 ; its terminator
  ld (HPOS),a
  call HSTART    ; L = its first byte
  push hl
  call LINERASE  ; the typed line off
                 ; the screen and out
  pop hl         ; of the buffer

HRCOPY:
  ld a,(HPOS)    ; up to the shown
                 ; line's terminator
  cp l
  ret z

; C the maximum, B the count

  ld bc,(LINMAX)
  ld a,c
  cp b
  ret z          ; cut at the buffer's
                 ; maximum
  call HGET      ; the next byte of the
                 ; line,
  ld c,a         ; into the buffer
  push hl
  ld hl,(LINPTR)
  ld (hl),c      ; at the buffer's next
                 ; place
  inc hl
  ld (LINPTR),hl
  ld hl,LINCNT   ; counted
  inc (hl)
  call ECHOCHAR  ; and echoed, as if
                 ; typed
  pop hl
  inc l
  jr HRCOPY

; The line function 10 returns, B bytes
; at DE (B not 0), into the ring, unless
; it holds a 0 or equals the newest
; line. HHEAD moves past it. Keeps C;
; destroys AF and HL, and B and DE when
; the line is stored.

HSTORE:
  ld h,HRING>>8
  ld a,(HHEAD)   ; HHEAD-1, the newest's
                 ; terminator
  dec a
  ld l,a
  call HSTART    ; L = the newest's
                 ; first byte
  push de
  push bc
  ld c,0         ; 0 while the line
                 ; matches the newest

HSCMP:
  ld a,(de)
  or a
  jr z,HSKEEP    ; a 0 in it: not stored
  call HGET      ; the newest's byte
                 ; against the line's
  ex de,hl
  cp (hl)
  ex de,hl
  jr z,HSCMP1
  inc c          ; a difference

HSCMP1:
  inc de
  inc l
  djnz HSCMP
  ld a,(HHEAD)   ; matched, and the
                 ; newest ends here too
  dec a          ; (L at its terminator,
                 ; HHEAD-1)
  sub l
  or c
  jr z,HSKEEP    ; the same as the
                 ; newest: not stored
  pop bc
  pop de
  ld a,(HHEAD)   ; written from HHEAD on
  ld l,a

HSPUT:
  ld a,(de)
  call HPUT
  inc de
  inc l          ; wrapping at 256
                 ; within the page
  djnz HSPUT
  xor a
  call HPUT      ; the terminator
  inc l
  ld a,l         ; HHEAD past it
  ld (HHEAD),a

HSCLR:
  call HGET      ; zero forward through
                 ; the next 0
  ld b,a         ; B = the byte as it
                 ; was
  xor a
  call HPUT
  inc l
  or b           ; stop once a 0 is
                 ; cleared
  jr nz,HSCLR
  ret

HSKEEP:
  pop bc         ; not stored: BC and DE
                 ; as they came
  pop de
  ret
