; SHELL.SVC's drives and volumes: CD,
; handed to the ROM's, the labels the
; prompt shows, and CLS, ECHO and
; PAUSE. Included by shell.asm, whose
; LINE enters each handler with HL
; after its word.

; CD is the ROM's, which lists the
; volumes or puts one on a drive and
; shows it. From a script the shell
; first refuses CD NAME and CD d:NAME
; on the script's own drive, CD? with
; FF00h: its next record would be read
; from another volume. Any CD but CD ?
; may change a label, so the prompt's
; are read again.

CMDCD:
  call SKIPSP    ; to the operand
  cp '?'
  jr z,CDHAND    ; CD ?: no change
  xor a
  ld (LBL),a     ; labels read again
  ld a,(SOPEN)   ; from a script?
  or a
  jr z,CDHAND    ; typed
  ld a,(CURDSK)
  ld c,a         ; the current drive
  inc hl
  ld a,(hl)      ; a drive's colon
  dec hl         ; after one letter?
  cp ':'
  jr nz,CD1      ; no: a name, or none
  ld a,(hl)      ; its letter
  and $DF        ; d or D
  sub 'A'
  ld c,a         ; the drive named
  inc hl
  inc hl         ; past d:

CD1:
  ld a,(hl)      ; a name after it?
  or a
  jr z,CDHAND    ; CD or CD d: alone
  ld a,(SFCB)    ; the script's drive
  dec a          ; from 0
  cp c
  jr nz,CDHAND   ; another drive
  call CRLF      ; after the line
  jp BADW        ; the script's own

CDHAND:
  jp HAND        ; the ROM's CD

; Read each drive's volume label into
; LBL, all spaces first: the card's
; volumes from index 0, each described
; by TNDESC into CFCB, to the first
; index refused; one on A: to D: gives
; its drive's label. Changes all.

VWALK:
  ld hl,LBL
  ld de,LBL+1
  ld bc,4*11-1
  ld (hl),SPACE  ; no labels yet
  ldir           ; all spaces
  ld e,0         ; from index 0

VW1:
  push de        ; the index
  ld hl,CFCB     ; its 32 bytes
  ld c,TNDESC    ; describe it
  call ABICALL
  pop de
  ret c          ; past the last
  ld a,(DSDRV)   ; its drive, or FFh
  cp 4           ; on A: to D:?
  jr nc,VW2      ; on no drive
  call LBLADR    ; its row
  push de        ; the index
  ex de,hl
  ld hl,DSLBL    ; its label
  ld bc,11
  ldir           ; into the table
  pop de

VW2:
  inc e          ; the next index
  jr VW1

; HL = drive A's 11 bytes in LBL.
; Changes AF and BC.

LBLADR:
  ld hl,LBL      ; drive A:'s
  ld bc,11
  inc a

LA1:
  dec a
  ret z          ; at drive A's
  add hl,bc      ; the next drive
  jr LA1

; Drive A as d:NAME, its label trimmed,
; for the prompt and for CD. LBL is
; read from the card first when its
; first byte is zero. A drive past D:
; has no label. Changes all.

DRVLBL:
  push af        ; the drive
  call PUTDRV
  ld a,(LBL)
  or a
  call z,VWALK   ; the labels first
  pop af
  cp 4
  ret nc         ; past D:
  call LBLADR
  ld b,11
  jp PUTTRIM     ; the label

; Drive A as its letter and a colon.

PUTDRV:
  add a,'A'
  ld e,a
  call PUTC      ; the letter
  ld e,':'
  jp PUTC

; CLS: the screen cleared and the
; cursor home, by the terminal's codes.

CMDCLS:
  ld de,CLSMSG
  call PUTS      ; ESC [H, ESC [2J
  jp BDONE

CLSMSG:   DB    27,"[H",27,"[2J$"

; ECHO text: the text as typed, after
; its blanks.

CMDECHO:
  call SKIPSP    ; to the text
  call CRLF      ; HL kept
  call PUTZ      ; to its zero
  jp BDONE

; PAUSE [text]: the text, or the
; pager's [more], then a key, read with
; no echo. ^C ends the script and the
; rest of the line, with FF00h.

CMDPAU:
  call SKIPSP    ; to any text
  call CRLF      ; HL kept
  ld a,(hl)
  or a
  jr nz,PA1      ; text given
  ld de,MOREMSG
  call PUTS      ; [more]
  jr PA2

PA1:
  call PUTZ      ; the text

PA2:
  ld e,$FF
  ld c,6         ; 6: direct input
  call BDOS
  or a
  jr z,PA2       ; no key yet
  cp 3           ; ^C?
  jp nz,BDONE    ; any key but ^C
  xor a
  ld (SOPEN),a   ; the script ends
  ld h,a
  ld l,a
  ld (LPOS),hl   ; and the line
  jp FAILED      ; code FF00h
