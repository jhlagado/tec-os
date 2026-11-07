; First TEC-OS program: TAS SAMPLE to
; build, SAMPLE to run. Say hello via
; CP/M BDOS before checking ABI 5. Then
; print geometry, write LCD row 2, scan
; 123456 and beep. Service status is not
; checked by this example.

; Standalone ABI 5 declarations avoid a
; shipped include. ABITAB starts "TNA",
; ABIMAJ is the major byte. CALL ABICALL
; with C=service and its arguments.

ABITAB EQU $C003
ABIMAJ EQU $C006
ABICALL EQU $C008
TNINFO EQU 0     ; -> L columns, H rows
TNDIGIT EQU 1    ; HL -> six patterns
TNLCD EQU 2      ; B row, HL -> 20 bytes
TNTONE EQU 4     ; B delay, DE halves
BDOS EQU 5       ; CP/M console entry

  ORG $0100      ; CP/M transient entry

; Say hello: BDOS function 9 prints from
; DE up to the $.

START:
  ld de,HELLO
  call SAY

; Require "TNA" and major 5, no minor
; check. Mismatch reaches OTHER before
; hardware calls. Signature failure
; leaves DE within TNA. After all three
; comparisons DE points at HELLO.

  ld hl,ABITAB
  ld de,TNA
  ld b,3

CHECK:
  ld a,(de)
  cp (hl)
  jr nz,OTHER
  inc hl
  inc de
  djnz CHECK
  ld a,(ABIMAJ)
  cp 5
  jr nz,OTHER

; INFO returns L=columns, H=rows, both
; zero for serial. Save before BDOS
; output can change register values.

  ld c,TNINFO
  call ABICALL
  ld (SIZE),hl
  ld de,SCREEN
  call SAY
  ld a,(SIZE)
  call DECIMAL
  ld de,BY
  call SAY
  ld a,(SIZE+1)
  call DECIMAL
  ld de,CRLF
  call SAY

; B=1 selects LCD row two, counting from
; zero. Exactly 20 bytes, no terminator.
; HWSLCD attempts output after timeout.

  ld b,1
  ld hl,LCDTXT
  ld c,TNLCD
  call ABICALL

; Each call scans all six patterns,
; leftmost first, then digits off. About
; 5 ms per scan at nominal 4 MHz gives
; about 1 s for 200 scans plus overhead.

  ld b,200

SHOW:
  push bc        ; DIGIT changes B/C
  ld hl,DIGITS
  ld c,TNDIGIT
  call ABICALL
  pop bc
  djnz SHOW

; B=60 gives repeated half cycles of
; 16*60+51=1011 T, about 1.98 kHz at
; nominal 4 MHz. DE=400 gives about
; 0.101 s apart from boundary costs.

  ld b,60
  ld de,400
  ld c,TNTONE
  call ABICALL
  ld de,DONE

; Print current DE, then RET through the
; CCP's WBOOT return word. Normal path
; uses DONE, mismatches keep DE from the
; guard. No replacement stack is made.

OTHER:
  call SAY
  ret

; SAY: DE -> '$'-terminated text.
; BDOS 9 tail jump returns to caller on
; its restored SP. AF/BC/DE/HL and any
; installed BIOS-hook clobbers apply.

SAY:
  ld c,9
  jp BDOS

; Print byte A=0..255 without leading
; zeros. Keep A while clearing LEAD. Use
; PLACE for hundreds/tens, always print
; units. LEAD is shared state.
; Changes AF/BC/DE/HL and BDOS effects.
; BDOS returns its result to the caller,
; not the original input byte.

DECIMAL:
  push af
  xor a
  ld (LEAD),a
  pop af
  ld b,100
  call PLACE
  ld b,10
  call PLACE
  add a,'0'      ; units always print,
                 ; without setting LEAD
  ld e,a
  ld c,2
  jp BDOS

; B=100 on byte input, then B=10 on its
; remainder. Print the quotient unless
; it is a leading zero. Return remainder
; in A, saving it across BDOS output.
; Changes F/BC/DE/HL and callee effects.
; No result flags or arbitrary-B use.

PLACE:
  ld c,'0'-1

PLACE1:
  inc c
  sub b
  jr nc,PLACE1
  add a,b
  ld d,a
  ld a,c
  cp '0'
  jr nz,PLACE2
  ld a,(LEAD)
  or a
  jr z,PLACE3

PLACE2:
  ld (LEAD),a
  ld e,c
  push de        ; keep remainder over
                 ; BDOS output
  ld c,2
  call BDOS
  pop de

PLACE3:
  ld a,d
  ret

; TNA immediately precedes HELLO, so a
; signature mismatch prints its current
; DE through the same '$' terminator.

TNA: DB "TNA"
HELLO: DB "Hello from TEC-OS.",13,10,"$"

; Geometry text is illustrative, not a
; fixed 80x24 screen requirement.

SCREEN: DB "Screen: $"
BY: DB " by $"
CRLF: DB 13,10,"$"
DONE: DB "Back to the prompt.",13,10,"$"

; Fixed 20-byte LCD row, padded with
; blanks and no terminator.

LCDTXT: DB "Hello from SAMPLE   "

; Six segment patterns for 123456,
; leftmost first.

DIGITS: DB $28,$CD,$AD
  DB $2E,$A7,$E7
SIZE: DW 0       ; columns, then rows
LEAD: DB 0       ; ASCII higher-place
                 ; state, 0 if none

; PLACE sets or keeps nonzero ASCII
; state. Units output does not update
; LEAD. Inputs 0..9 can leave it zero.
