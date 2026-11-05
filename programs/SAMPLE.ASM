; A first program for TEC-OS. Build it
; with TAS SAMPLE. Run it with SAMPLE.
;
; Say hello through CP/M BDOS, then
; check for the TEC-OS ABI 5 table.
; Print the screen size, write to LCD
; row 2, show 123456 and beep.

; TEC-OS's table and service numbers, by
; the names abi.inc gives them. "TNA",
; then the major version

ABITAB EQU $C003

; the major version this speaks: 5

ABIMAJ EQU $C006

; CALL here with the service in C

ABICALL EQU $C008
TNINFO EQU 0     ; -> L = columns, H =
                 ; rows
TNDIGIT EQU 1    ; HL -> six digit
                 ; patterns
TNLCD EQU 2      ; B = row 0-3, HL -> 20
                 ; characters
TNTONE EQU 4     ; B = pitch, DE =
                 ; length
BDOS EQU 5       ; CP/M's entry, for the
                 ; console

  ORG $0100      ; CP/M runs a program
                 ; from here

; Say hello: BDOS function 9 prints from
; DE up to the $.

START:
  ld de,HELLO
  call SAY

; Is this TEC-OS? Its table starts
; "TNA", and this program needs major 5.

  ld hl,ABITAB   ; what is at the
                 ; table's address
  ld de,TNA      ; against the signature
  ld b,3         ; three letters

CHECK:
  ld a,(de)
  cp (hl)
  jr nz,OTHER    ; another system: stop
                 ; here
  inc hl         ; on to the next letter
                 ; of each
  inc de
  djnz CHECK
  ld a,(ABIMAJ)  ; the version of the
                 ; table
  cp 5
  jr nz,OTHER    ; a version this
                 ; doesn't speak

; The screen's size from INFO: L
; columns, H rows, 0 on a serial
; terminal.

  ld c,TNINFO    ; service 0
  call ABICALL
  ld (SIZE),hl   ; kept: the BDOS
                 ; changes HL
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

; 123456 on the digits. One call lights
; them once, for about 5 ms, so a loop
; of 200 calls shows them for about a
; second.

  ld b,200       ; the passes

SHOW:
  push bc        ; the service changes B
  ld hl,DIGITS   ; a pattern for each
                 ; digit, left first
  ld c,TNDIGIT
  call ABICALL
  pop bc
  djnz SHOW      ; until the passes are
                 ; done

; A short beep. B sets the pitch: each
; half of a cycle is 16 x B + 51
; T-states, about 2 kHz here. DE half
; cycles make it about 0.1 s long.

  ld b,60
  ld de,400
  ld c,TNTONE
  call ABICALL
  ld de,DONE     ; and say so

; Print DE's message, then return to the
; CCP, which shows the prompt.

OTHER:
  call SAY

; the CCP's return address is on the
; stack

  ret

; SAY: print the string at DE, up to its
; $. Changes AF, BC, DE, HL.

SAY:
  ld c,9         ; BDOS function 9
  jp BDOS        ; which returns to
                 ; SAY's caller

; DECIMAL: print A, 0 to 255, in decimal
; without leading zeros. Changes AF, BC,
; DE, HL.

DECIMAL:
  push af        ; the number, across
                 ; the flag's reset
  xor a          ; no digit printed yet
  ld (LEAD),a
  pop af
  ld b,100       ; the hundreds
  call PLACE
  ld b,10        ; the tens
  call PLACE
  add a,'0'      ; the units, always
                 ; printed
  ld e,a
  ld c,2         ; BDOS function 2: one
                 ; character
  jp BDOS

; PLACE: print how many times B goes
; into A, unless it is a leading zero.
; Returns A less those times B. Changes
; BC, DE, HL.

PLACE:
  ld c,'0'-1     ; one before the digit
                 ; 0

PLACE1:
  inc c          ; count each B taken
                 ; away
  sub b
  jr nc,PLACE1   ; until A goes below 0
  add a,b        ; one B too many: put
                 ; it back
  ld d,a         ; what is left, for the
                 ; next place
  ld a,c
  cp '0'
  jr nz,PLACE2   ; a digit above 0 is
                 ; always printed
  ld a,(LEAD)    ; and 0 only after
                 ; another digit
  or a
  jr z,PLACE3

PLACE2:
  ld (LEAD),a    ; a digit is out now
  ld e,c
  push de        ; the BDOS changes D
  ld c,2         ; BDOS function 2: one
                 ; character
  call BDOS
  pop de

PLACE3:
  ld a,d         ; what is left
  ret

; The text and the patterns.

TNA: DB "TNA"    ; TEC-OS's signature
HELLO: DB "Hello from TEC-OS.",13,10,"$"

; the size, as "80 by 24"

SCREEN: DB "Screen: $"
BY: DB " by $"

; return, then a new line

CRLF: DB 13,10,"$"
DONE: DB "Back to the prompt.",13,10,"$"

; The LCD's row: 20 characters, padded
; with blanks.

LCDTXT: DB "Hello from SAMPLE   "

; 1, 2 and 3, a bit a segment

DIGITS: DB $28,$CD,$AD

; 4, 5 and 6

  DB $2E,$A7,$E7
SIZE: DW 0       ; INFO's columns, then
                 ; rows
LEAD: DB 0       ; 1 once a digit is
                 ; printed
