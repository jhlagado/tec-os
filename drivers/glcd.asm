; GLCD.SVC: the ST7920 128 x 64 GLCD
; console as a driver below (0006h), 21
; columns x 8 rows of 6 x 8 cells, built
; from the ROM's GLCD code. Its INIT
; checks that the controller answers and
; hands the ROM its video table through
; TNDRVR; the CCP then takes the
; console, unless a PICO9918 has it, and
; the
; ROM's terminal calls its six routines
; directly, on the caller's stack. It
; keeps its screen text and its counters
; here, draws from the ROM's font, and
; moves rows to and from the ROM's
; LINEBUF, whose address TNDRVR returns.
; Its
; REMOVE, at UNLOAD, gives the console
; back: to CRT: if the ROM's PICO9918
; console started, otherwise to serial.
%INCLUDE "../src/abi.inc"

GLCOLS EQU 21
GLROWS EQU 8
IOBYTE EQU $0003

  ORG $0100
; removable
HDR: DB 'D',SVCFMT,0,1
  DW 0,0,0,0     ; REMOVE, size, extra,
                 ; relocation: the
                 ; writer's
  DB 2,0,6       ; over the base: BDOS,
                 ; BIOS, CCP
  DW 0           ; INIT: the writer's
  DB "GLCD    "

; The video vector, in the ROM's order:
; VPUT, VGET, VCLREOL, VREST, VRDROW,
; VWRROW.
VTAB: DW GLCPUT,GLCGET,GLCCLR,GLCRST,GLRDR,GLWRR
  DW 0           ; only the PICO9918 has
                 ; row moves to show
  DB GLCOLS,GLROWS
LBUF: DW 0       ; LINEBUF, from TNDRVR

; INIT refuses if the controller doesn't
; answer, or the ROM refuses UC1:'s
; table: another GLCD.SVC has the
; console, or there is no matrix
; keyboard,
; or, with TNENODV, a line in
; STARTUP.CMD offers it while CON: is
; CRT:, the
; ROM's PICO9918 console, which it would
; only give way to (KE-200). Typed with
; another display the console, it loads
; all the same and the ROM's loader
; leaves the console where it is (SVCGO,
; KE-150). It publishes no record.
; Returns carry clear and HL = 0 when
; loaded, carry set and A = the status
; when refused. Destroys AF, BC, DE, HL.
INIT:
  ld c,TNFONT    ; the ROM's font; a ROM
                 ; before ABI 5.1
  call ABICALL   ; refuses the number,
                 ; and INIT with it
  ret c
  ld (FONTP),hl  ; kept for GLGLY
  call GLCWAIT   ; Z: the controller
                 ; answers
  ld a,TNENODV   ; no controller
                 ; answers: absent,
                 ; which a
  scf            ; line in STARTUP.CMD
                 ; passes over quietly
  ret nz
  ld b,3         ; UC1:
  ld hl,VTAB     ; the table the
                 ; terminal calls
                 ; through
  ld c,TNDRVR
  call ABICALL   ; HL = LINEBUF, or
                 ; carry: refused
  ret c
  ld (LBUF),hl   ; where GLRDR and GLWRR
                 ; move rows
  ld hl,0        ; no record to register
  or a           ; carry clear: loaded
  ret

; REMOVE, at UNLOAD: if the ROM's
; PICO9918 console registered its record
; and
; UC1: is the console, the console field
; becomes CRT:. UC1:'s table then
; goes, and the ROM chooses the console
; again at its next call. Returns as
; TNDRVR does, A = 0 and carry clear.
; Destroys AF, BC, DE, HL.
REMOVE:
  ld de,PICONAM
; version 1 or later
  ld bc,$0100+TNFIND
  call ABICALL   ; carry: no record, the
                 ; ROM's console
  jr c,REMOV1    ; never started
  ld hl,IOBYTE   ; UC1: becomes CRT:,
                 ; and no other field
                 ; changes
  ld a,(hl)      ; the console field,
                 ; bits 0-1: 3 for
  cpl            ; UC1:, so 0 once
                 ; complemented
  and 3
  jr nz,REMOV1   ; another device has
                 ; the console
  res 1,(hl)     ; 3 to 1: CRT:

REMOV1:
  ld b,3         ; UC1:'s table dropped
  ld hl,0        ; HL = 0: no table
  ld c,TNDRVR
  jp ABICALL

PICONAM:
  DB "PICO    "  ; the ROM console's
                 ; record

; The ST7920's ports: commands and the
; busy flag, and display data.
GLCCMD EQU $07
GLCDAT EQU $87

; Wait until the controller is ready,
; polling its busy flag at most 256
; times. Returns Z, NC and A = 0 when
; ready; NZ and A = 1 when it never was:
; no controller, or one stuck busy.
; Preserves BC, DE, HL; the count is
; kept
; in GLWN, not on the stack, since the
; routines run on their caller's.
GLCWAIT:
  xor a          ; 0: the first DEC
                 ; makes it 255,
  ld (GLWN),a    ; so 256 polls

GLCWL:
  in a,(GLCCMD)  ; bit 7, busy, into
                 ; carry
  rlca
  jr nc,GLCWOK   ; not busy: ready
  ld a,(GLWN)    ; one poll fewer left
  dec a
  ld (GLWN),a
  jr nz,GLCWL
  or 1           ; A is 0 here: NZ for
                 ; the timeout
  ret

GLCWOK:
  xor a          ; Z: ready
  ret

; Send command A once the controller is
; ready; after a timeout the byte is
; dropped, not sent. Returns A = the
; byte, Z if it was sent and NZ if not;
; destroys F. Preserves BC, DE, HL.
GLCC:
  ld (GLOUT),a   ; held over the wait,
                 ; off the stack
  call GLCWAIT
  ld a,(GLOUT)
  ret nz         ; never ready: nothing
                 ; sent (KE-198)
; to the instruction register
  out (GLCCMD),a
  ret

; Send data A, as GLCC does a command,
; to the graphics RAM at the
; controller's address: two bytes make a
; word, left half first, and the
; address then moves to the next word.
; Returns A = the byte, Z if it was
; sent and NZ if not; destroys F.
; Preserves BC, DE, HL.
GLCDW:
  ld (GLOUT),a   ; held over the wait,
                 ; off the stack
  call GLCWAIT
  ld a,(GLOUT)
  ret nz         ; never ready: nothing
                 ; sent
; to the data register
  out (GLCDAT),a
  ret

; VRDROW: copy text row B's 21
; characters to LINEBUF. Destroys AF,
; BC, DE,
; HL.
GLRDR:
  ld c,0         ; from column 0
  call GLCADR    ; HL = the row in
                 ; GLTEXT
  ld de,(LBUF)   ; to LINEBUF
  ld bc,GLCOLS
  ldir
  ret

; VWRROW: copy LINEBUF's 21 characters
; to text row B and redraw the row.
; Destroys AF, C, DE, HL; B is kept.
GLWRR:
  push bc        ; B, the row, for the
                 ; redraw
  ld c,0
  call GLCADR    ; DE = the row in
                 ; GLTEXT, HL = LINEBUF
  ex de,hl
  ld hl,(LBUF)
  ld bc,GLCOLS
  ldir           ; the row in
  pop bc
  jp GLCROW      ; and drawn

; VREST, at install and at warm boot:
; put the controller in graphics mode
; with the display on and its text layer
; clear. Graphics RAM keeps whatever
; a program drew until the console next
; writes over it. Returns NZ, nothing
; sent, if the controller doesn't
; answer. Destroys AF, B, HL.
GLCRST:
  call GLCWAIT   ; NZ: no controller to
                 ; set
  ret nz
  ld hl,GLCMOD   ; the five commands, in
                 ; order
  ld b,5

GLCRSL:
  ld a,(hl)
  call GLCC      ; each once the last
                 ; has finished
  inc hl
  djnz GLCRSL
  ret
; 30h the basic set, 0Ch display on with
; no cursor, 01h clear the text
; layer, 34h the extended set, 36h the
; extended set with graphics shown.
GLCMOD: DB $30,$0C,$01,$34,$36

; HL = GLTEXT address of row B, column
; C: GLTEXT + 21B + C. Preserves BC, DE;
; destroys AF.
GLCADR:
  push de
  ld hl,GLTEXT
  ld de,GLCOLS   ; a row's length
  ld a,b         ; row 0: no rows to
                 ; pass
  or a
  jr z,GLCAC

GLCAM:
  add hl,de      ; one row on, B times
  dec a
  jr nz,GLCAM

GLCAC:
  ld e,c         ; D is 0: DE = the
                 ; column
  add hl,de
  pop de
  ret

; Put A at row B, column C and redraw
; the words its cell touches: on each of
; the cell's eight pixel rows, the one
; or two words its six pixels fall in.
; Bit 7 of A set draws the cell
; reversed. Destroys AF, C, DE, HL; B is
; kept.
GLCPUT:
  push af        ; the character, over
                 ; the address
  call GLCADR
  pop af
  ld (hl),a      ; into the screen text
  push bc
  ld c,0         ; the row's start, for
                 ; GLCCMP
  call GLCADR
  pop bc
  ld (GLROWP),hl
  ld a,c         ; the cell spans pixels
                 ; 6C to 6C+5
  add a,a
  ld e,a
  add a,a
  add a,e        ; A = 6C
  ld e,a
  srl a          ; 16 pixels a word
  srl a
  srl a
  srl a
  ld d,a         ; first word
  ld a,e
  add a,5        ; the cell's last pixel
  srl a
  srl a
  srl a
  srl a
  ld e,a         ; last word
  ld a,b         ; pixel row 8B, the
                 ; cell's top
  add a,a
  add a,a
  add a,a
  ld (GLY),a
  ld c,8         ; eight pixel rows

GLCPR:
  ld a,d         ; each from the first
                 ; word

GLCPW:
  ld (GLW),a
  push bc
  push de        ; the words, over
                 ; GLCCMP
  call GLCSETA   ; an address for each
                 ; word
  call GLCCMP    ; DE = the word's
                 ; pixels
  ld a,d         ; left half first
  call GLCDW
  ld a,e
  call GLCDW     ; then the right
  pop de
  pop bc
  ld a,(GLW)
  cp e           ; the last word drawn:
                 ; the next row
  jr z,GLCPN
  inc a          ; otherwise the next
                 ; word
  jr GLCPW

GLCPN:
  ld hl,GLY      ; the next pixel row
  inc (hl)
  dec c
  jr nz,GLCPR
  ret

; VGET: A = the character at row B,
; column C. Destroys F, HL.
GLCGET:
  call GLCADR
  ld a,(hl)      ; bit 7 set for a
                 ; reversed cell
  ret

; VCLREOL: clear row B from column C to
; the end of the line and redraw the
; row. At a pending wrap C is past the
; row: the count would be 256 and the
; fill would run on through the text,
; the counters and FONTP. Destroys AF,
; C, DE, HL; B is kept.
GLCCLR:
  ld a,c
  cp GLCOLS
  ret nc         ; no cells left to
                 ; erase
  call GLCADR
  ld a,GLCOLS    ; the cells from C to
                 ; the end
  sub c

GLCCL:
  ld (hl),' '    ; a space in each
  inc hl
  dec a
  jr nz,GLCCL
  jr GLCROW      ; B kept: the row drawn

; Redraw text row B: eight pixel rows,
; each streamed as eight words from one
; address, the controller moving on a
; word by itself. Destroys AF, C, DE,
; HL; B is kept.
GLCROW:
  ld c,0
  call GLCADR
; the row's text, for GLCCMP
  ld (GLROWP),hl
  ld a,b         ; pixel row 8B, the
                 ; text row's top
  add a,a
  add a,a
  add a,a
  ld (GLY),a
  ld c,8         ; eight pixel rows

GLCRL:
  xor a          ; each from word 0
  ld (GLW),a
  push bc
  call GLCSETA   ; one address for the
                 ; pixel row

GLCRW:
  call GLCCMP    ; DE = the word's
                 ; pixels
  ld a,d         ; left half, then right
  call GLCDW
  ld a,e
  call GLCDW
  ld hl,GLW      ; the next word, up to
                 ; the eighth
  inc (hl)
  ld a,(hl)
  cp 8
  jr nz,GLCRW    ; no new address: the
                 ; controller's moved on
  pop bc
  ld hl,GLY      ; the next pixel row
  inc (hl)
  dec c
  jr nz,GLCRL
  ret

; Set the graphics address to pixel row
; GLY, word GLW. The ST7920 maps the
; screen's lower half, rows 32-63, as
; rows 0-31 at words 8-15. Destroys AF,
; B.
GLCSETA:
  ld a,(GLY)
  ld b,0         ; the upper half: words
                 ; 0-7
  cp 32
  jr c,GLCSU
  sub 32         ; the lower half: rows
                 ; 0-31 again,
  ld b,8         ; words 8-15

GLCSU:
  or $80         ; the vertical address
                 ; first
  call GLCC
  ld a,(GLW)     ; then the horizontal
  add a,b
  or $80
  jp GLCC

; DE = the 16 pixels of word GLW on
; pixel row GLY, D on the left, from the
; text row at GLROWP. A cell's glyph row
; is 6 pixels (5 of glyph, 1 of
; space); a reverse cell inverts all 6.
; Destroys AF, BC, HL and GLOFF.
GLCCMP:
  ld a,(GLW)     ; two bytes an entry in
                 ; GLCSPAN
  add a,a
  ld hl,GLCSPAN
  add a,l
  ld l,a
  jr nc,GLCCS    ; the table may cross a
                 ; page
  inc h

GLCCS:
  ld b,(hl)      ; first character
  inc hl
  ld c,(hl)      ; how many
  ld a,b         ; offset = 6 * first -
                 ; 16 * word, signed
  add a,a
  ld l,a
  add a,a
  add a,l
  ld l,a         ; L = 6 * first
  ld a,(GLW)     ; less 16 * word
  add a,a
  add a,a
  add a,a
  add a,a
  neg            ; made negative, and 6
                 ; * first added
  add a,l
  ld (GLOFF),a   ; the first cell's
                 ; start, from the
                 ; word's
; left edge
  ld de,0        ; the word's pixels
                 ; gathered here

GLCCH:
  push bc
; the character in the text row
  ld hl,(GLROWP)
  ld a,b
  add a,l
  ld l,a
  jr nc,GLCCG    ; the row may cross a
                 ; page
  inc h

GLCCG:
  ld a,(hl)
  call GLGLY     ; A = its pixels on
                 ; this pixel row
  ld h,a         ; HL = them at the left
                 ; of 16 bits
  ld l,0
  ld a,(GLOFF)
  or a           ; offset 0: in place
  jr z,GLCCO
  jp m,GLCCLF    ; negative: the cell
                 ; starts in the word
; to the left
GLCCR:
  srl h          ; positive: shifted
                 ; right, and what
  rr l           ; leaves L is the next
                 ; word's
  dec a
  jr nz,GLCCR
  jr GLCCO

GLCCLF:
  neg            ; shifted left by
                 ; -offset, and what

GLCCLL:
  add hl,hl      ; leaves H is the word
                 ; to the left's
  dec a
  jr nz,GLCCLL

GLCCO:
  ld a,d         ; merged into the word
  or h
  ld d,a
  ld a,e         ; and its right half
  or l
  ld e,a
  ld a,(GLOFF)   ; the next cell starts
                 ; 6 pixels on
  add a,6
  ld (GLOFF),a
  pop bc
  inc b          ; the next character
  dec c
  jr nz,GLCCH
  ret

; A = glyph row (GLY mod 8) of character
; A in bits 7-2, reversed when bit 7
; of the character is set; control codes
; draw as a space. Preserves B, DE;
; destroys F, C, HL, which GLCCMP keeps.
GLGLY:
  ld c,a         ; bit 7, reverse, kept
                 ; for the end
  and $7F
  sub $20        ; the font starts at
                 ; the space
  jr nc,GLGL1
  xor a          ; control codes draw as
                 ; a space

GLGL1:
  ld l,a         ; HL = 8 bytes a
                 ; character
  ld h,0
  add hl,hl
  add hl,hl
  add hl,hl
  ld a,(GLY)     ; one byte a pixel row
  and 7
  add a,l        ; L's low three bits
                 ; are 0: no carry
  ld l,a
  ld a,(FONTP)   ; the font's start,
                 ; added by hand so that
                 ; C
  add a,l        ; and DE stay
  ld l,a
  ld a,(FONTP+1)
  adc a,h
  ld h,a
  ld a,(hl)      ; the glyph row's
                 ; pixels
  bit 7,c
  ret z          ; normal video
  cpl            ; reversed: the six
                 ; pixels inverted,
  and $FC        ; bits 1-0 left clear
  ret

; For each word: the first character it
; touches and how many.
GLCSPAN:
  DB 0,3, 2,4, 5,3, 8,3, 10,4, 13,3, 16,3, 18,3

; ---- State: the screen's characters
; and the drawing counters
; -----------------
; GLTEXT holds the 21 x 8 characters,
; row by row.
GLTEXT: DS GLCOLS*GLROWS,' '
GLY: DS 1        ; the pixel row being
                 ; drawn, 0-63
GLW: DS 1        ; the word being drawn,
                 ; 0-7
GLROWP: DS 2     ; the text row being
                 ; drawn
GLOFF: DS 1      ; the cell's start from
                 ; the word's edge
GLWN: DS 1       ; GLCWAIT's polls left
GLOUT: DS 1      ; GLCC's and GLCDW's
                 ; byte over the wait
FONTP: DW 0      ; the ROM's font, from
                 ; TNFONT

IMGEND:
