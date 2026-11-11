; HELLO3: a small MON-3 program that
; shows it is alive. It loads and runs
; at 4000h, as MON-3 programs do.

; On TEC-OS, type MON3.SVC /E, then
; LOAD HELLO3.BIN and GO at MON3>.
; TAS HELLO3 HELLO3.BIN builds it.

; It writes four lines to the LCD and
; beeps, through MON-3's RST 10h calls.
; Then it counts in hex on the six
; digits, using RST 20h to scan them.
; Any key beeps and shows its code on
; the right two digits. AD, or Esc on
; the matrix keyboard, returns to the
; monitor.

; MON-3's RST 10h calls: C picks one.

BEEP      EQU   3
TOSEG     EQU   4
LCDSTR    EQU   13
LCDCMD    EQU   15

KEYAD     EQU   $13
LCDCLR    EQU   $01
SCANS     EQU   40

  ORG $4000

START:
  ld b,LCDCLR    ; clear the LCD
  ld c,LCDCMD
  rst $10
  ld hl,LINES    ; four lines, each
                 ; with its address

LINE:
  ld b,(hl)      ; the row's LCD
  inc hl         ; address, 0 ends
  inc b
  dec b
  jr z,SHOWN
  ld c,LCDCMD
  rst $10        ; move to that row
  ld c,LCDSTR
  rst $10        ; HL ends past the
  jr LINE        ; text's zero

SHOWN:
  ld c,BEEP
  rst $10
  ld hl,0
  ld (COUNT),hl
  xor a
  ld (KEY),a

TICK:
  ld de,SEGS     ; the count, high
  ld a,(COUNT+1) ; byte first, then
  ld c,TOSEG     ; the last key, as
  rst $10        ; six digit codes
  ld a,(COUNT)
  ld c,TOSEG
  rst $10
  ld a,(KEY)
  ld c,TOSEG
  rst $10
  ld b,SCANS     ; show it for a
                 ; while

SCAN:
  push bc
  ld de,SEGS
  rst $20        ; scan the digits
  pop bc         ; and the keys
  jr nz,NOKEY    ; no key down
  jr nc,NOKEY    ; still held
  cp KEYAD
  ret z          ; AD: back to MON-3
  ld (KEY),a
  push bc
  ld c,BEEP
  rst $10
  pop bc

NOKEY:
  djnz SCAN
  ld hl,(COUNT)  ; count on
  inc hl
  ld (COUNT),hl
  jr TICK

; Each line: its LCD address, then
; its text, then a zero. A zero
; address ends the list.

LINES:
  DB $80
  DB "MON-3 ON TEC-OS",0
  DB $C0
  DB "LCD BY RST 10H",0
  DB $94
  DB "DIGITS BY RST 20H",0
  DB $D4
  DB "KEY BEEPS, AD QUITS",0
  DB 0

COUNT:    DW    0
KEY:      DB    0
SEGS:     DS    6
