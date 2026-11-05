; HD44780 20 x 4 LCD status display.
; Cold boot shows the banner on row 0
; and the mounted drives on rows 1-2.
; Every wait on the busy flag is
; bounded, so a missing display costs
; only the time-out.


; Initialise: 8-bit, two-line
; addressing, display on, cursor off,
; clear: the four commands of LCDSEQ.
; Destroys AF, B and HL.

LCDINIT:
  ld hl,LCDSEQ
  ld b,4         ; four commands

LCDI:
  ld a,(hl)
  call LCDC      ; each sent once the
                 ; display is ready
  inc hl
  djnz LCDI
  ret

; Wait while the display is busy, at
; most 256 polls. Preserves BC, DE, HL.
; Destroys AF.

LCDWAIT:
  push bc
  ld b,0         ; 256 polls at most

LCDW:
  in a,(LCDCMD)  ; bit 7 high while busy
  rlca           ; bit 7, the busy flag,
                 ; to carry
  jr nc,LCDWX    ; ready
  djnz LCDW

LCDWX:
  pop bc         ; ready, or timed out
                 ; with no display
  ret

; Send command A once the display is
; ready. Keeps every register.

LCDC:
  push af        ; the command, across
                 ; the wait
  call LCDWAIT
  pop af
  out (LCDCMD),a
  ret

; Write the word at HL to row 3 and mark
; that it is there, so that a take can
; tell the row is the ROM's to clear. HL
; = GLCMSG. Returns as LCDROW.

LCDWRD:
  push hl        ; the word, across the
                 ; flag
  ld hl,CONDEV
  set 7,(hl)     ; CDWRD
  pop hl

; Write the zero-terminated string at HL
; to row 3, the row for a recovery
; message: CARD? or GLCD?, or blanks to
; clear one. Returns as LCDROW.

LCD3:
  ld b,3         ; the bottom row, free
                 ; of the volumes

; Write the zero-terminated string at HL
; from row B (0-3), column 0. Returns
; carry set, so a caller reporting a
; failure can end with a jump here, and
; NZ. Destroys AF, HL. BC and DE are
; kept.

LCDROW:
  ld a,b
  push hl        ; the string, across
                 ; the lookup
  ld hl,LCDROWS  ; the row's address on
                 ; the display
  add a,l
  ld l,a
  jr nc,LCDR1
  inc h          ; the table's page
                 ; changed

LCDR1:
  ld a,(hl)
  pop hl
  call LCDC      ; the cursor to the
                 ; row's start

LCDS:
  ld a,(hl)
  cp 1           ; carry at the zero
                 ; that ends the string
  ret c
  push af        ; the character, across
                 ; the wait
  call LCDWAIT
  pop af

; the display steps to the next column

  out (LCDDAT),a
  inc hl
  jr LCDS

; Show the drive letters and labels of
; drives A and B on rows 1 and 2; an
; unmounted drive's row is left as it
; was. Destroys AF, BC, DE, HL and IX.

LCDVOLS:
  ld c,0         ; drive A first

LCDV:
  push bc
  call DRVDESC   ; IX = drive C's
                 ; descriptor
  pop bc
  jr nz,LCDVN    ; no volume on it
  ld hl,LINEBUF  ; the row's text, in
                 ; the terminal's row
  call DRVLAB    ; buffer, free between
                 ; console calls
  push bc
  ld a,c
  inc a
  ld b,a         ; row 1 for A, 2 for B
  ld hl,LINEBUF  ; the text DRVLAB made,
                 ; which LCDROW
  call LCDROW    ; writes without the
                 ; console
  pop bc

LCDVN:
  inc c          ; the next drive
  ld a,c
  cp 2           ; only A and B fit
  jr c,LCDV
  ret

; HL -> 15 bytes = drive C's letter, ":
; " and the 11-byte label at DLABEL in
; its descriptor at IX, then a 0: the
; drive walkers' shared text, LCDVOLS's
; rows in LINEBUF and SHOWVOL's lines in
; CMDTXT. Keeps BC and IX. Destroys AF,
; DE and HL: DE ends at the 0 and HL
; past the descriptor's label.

DRVLAB:
  ld a,c
  push bc
  add a,'A'      ; the drive's letter
  ld (hl),a
  inc hl
  ld (hl),':'    ; then ": "
  inc hl
  ld (hl),' '
  inc hl         ; HL = where the label
                 ; goes
  push ix        ; DE = IX
  pop de
  ex de,hl       ; DE = the buffer's
                 ; fourth byte, HL = the
  ld bc,DLABEL   ; descriptor, then its
                 ; label
  add hl,bc
  ld bc,11       ; the label
  ldir
  xor a          ; and its end
  ld (de),a
  pop bc
  ret
