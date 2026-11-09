; A first program for TEC-OS. Build it
; with TAS SAMPLE. Run it with SAMPLE.

; Say hello through CP/M BDOS, then
; check for the TEC-OS ABI 5 table.
; Print the screen size, write to LCD
; row 2, show 123456 and beep.

; TEC-OS's table and service numbers use
; the names from abi.inc. ABITAB points
; to "TNA", then the major version.

ABITAB    EQU   $C003

; The major version this speaks: 5.

ABIMAJ    EQU   $C006

; CALL here with the service in C.

ABICALL   EQU   $C008

; INFO returns L=columns, H=rows.

TNINFO    EQU   0

; HL points to six digit patterns.

TNDIGIT   EQU   1

; B=row 0-3, HL points to 20 characters.

TNLCD     EQU   2

; B=pitch, DE=length.

TNTONE    EQU   4

; CP/M's entry for the console.

BDOS      EQU   5

; CP/M runs a program from here.

  ORG $0100

; Say hello: BDOS function 9 prints from
; DE up to the $.

START:
  ld de,HELLO
  call SAY

; Is this TEC-OS? Its table starts
; "TNA", and this program needs major 5.

  ld hl,ABITAB   ; table's address
  ld de,TNA      ; against the signature
  ld b,3         ; three letters

CHECK:
  ld a,(de)
  cp (hl)
  jr nz,OTHER    ; not TEC-OS: stop
  inc hl         ; next letter of each
  inc de
  djnz CHECK
  ld a,(ABIMAJ)  ; table's version
  cp 5
  jr nz,OTHER    ; unsupported version

; INFO returns L columns and H rows,
; both 0 on a serial terminal.

  ld c,TNINFO    ; service 0
  call ABICALL
  ld (SIZE),hl   ; save HL across BDOS
  ld de,SCREEN   ; "Screen: "
  call SAY
  ld a,(SIZE)    ; the columns
  call DECIMAL
  ld de,BY       ; " by "
  call SAY
  ld a,(SIZE+1)  ; the rows
  call DECIMAL
  ld de,CRLF     ; and the line's end
  call SAY

; A line on the LCD's second row: rows
; count from 0.

  ld b,1
  ld hl,LCDTXT   ; exactly 20 characters
  ld c,TNLCD
  call ABICALL

; Each digit call lights 123456 once
; for about 5 ms. Repeating it 200 times
; shows the digits for about a second.

  ld b,200       ; the passes

SHOW:
  push bc        ; the service changes B
  ld hl,DIGITS   ; leftmost digit first
  ld c,TNDIGIT
  call ABICALL
  pop bc
  djnz SHOW      ; more display passes

; A short beep. B sets the pitch: each
; half cycle is 16 x B + 51 T-states,
; about 2 kHz here. DE counts half
; cycles, about 0.1 s here.

  ld b,60
  ld de,400
  ld c,TNTONE
  call ABICALL
  ld de,DONE     ; and say so

; Print DE's message, then return to the
; CCP, which shows the prompt.

OTHER:
  call SAY

; Return via the CCP address on stack.

  ret

; SAY: print the string at DE, up to its
; $. Changes AF, BC, DE, HL.

SAY:
  ld c,9         ; BDOS function 9
  jp BDOS        ; returns to caller

; DECIMAL: print A, 0 to 255, in decimal
; without leading zeros. Changes AF, BC,
; DE, HL.

DECIMAL:
  push af        ; A across LEAD reset
  xor a          ; no digit printed yet
  ld (LEAD),a
  pop af
  ld b,100       ; the hundreds
  call PLACE
  ld b,10        ; the tens
  call PLACE
  add a,'0'      ; units always printed
  ld e,a
  ld c,2         ; BDOS 2: one character
  jp BDOS

; PLACE: print how many times B goes
; into A, unless it is a leading zero.
; Returns A less those times B. Changes
; BC, DE, HL.

PLACE:
  ld c,'0'-1     ; one before '0'

PLACE1:
  inc c          ; count subtractions
  sub b
  jr nc,PLACE1   ; until A goes below 0
  add a,b        ; restore last B
  ld d,a         ; next place remainder
  ld a,c
  cp '0'
  jr nz,PLACE2   ; print nonzero digit
  ld a,(LEAD)    ; zero after a digit
  or a
  jr z,PLACE3

PLACE2:
  ld (LEAD),a    ; a digit is out now
  ld e,c
  push de        ; the BDOS changes D
  ld c,2         ; BDOS 2: one character
  call BDOS
  pop de

PLACE3:
  ld a,d         ; what is left
  ret

; TEC-OS's signature, text and patterns.

TNA:      DB    "TNA"
HELLO:    DB    "Hello from TEC-OS."
  DB 13,10,"$"

; The size, as "80 by 24".

SCREEN:   DB    "Screen: $"
BY:       DB    " by $"

; Return, then a new line.

CRLF:     DB    13,10,"$"
DONE:     DB    "Back to the prompt."
  DB 13,10,"$"

; The LCD's row: 20 characters, padded
; with blanks.

LCDTXT:   DB    "Hello from SAMPLE   "

; 1, 2 and 3, a bit a segment.

DIGITS:   DB    $28,$CD,$AD

; 4, 5 and 6.

  DB $2E,$A7,$E7

; INFO's columns, then rows.

SIZE:     DW    0

; Leading-zero suppression flag.

LEAD:     DB    0
