; SHELL.SVC's drives and volumes: CD,
; the labels the prompt shows, and CLS,
; ECHO and PAUSE. A volume goes on a
; drive through the ROM's TNMOUNT, which
; writes the cache out first. Included
; by shell.asm, whose LINE enters each
; handler with HL after its word.

; CD [d:][NAME], CD ? or CD alone. NAME
; goes on the current drive, or on d:.
; A volume on another drive is refused,
; naming that drive, and so is the
; drive a script is read from. CD alone
; and CD d: read the card again and show
; the drive's volume.

CMDCD:
  push hl        ; the operand
  call FOLD      ; folded
  call CRLF      ; after the line
  pop hl
  call SKIPSP    ; A: its first byte
  ld a,(CURDSK)  ; the logged drive
  and $0F
  ld (CDDRV),a   ; the current drive
  ld a,(hl)      ; after CD's blanks
  or a
  jp z,CDALONE   ; CD alone
  cp '?'         ; a question?
  jp z,CDLIST    ; CD ?
  inc hl
  ld a,(hl)      ; a drive's colon
  dec hl         ; after one letter?
  cp ':'
  jr nz,CDNAM    ; no: a name
  ld a,(hl)      ; its letter
  sub 'A'        ; the drive, from 0
  cp 4
  jp nc,BADW     ; past D:
  ld (CDDRV),a
  inc hl
  inc hl         ; past d:
  ld a,(hl)      ; anything after?
  or a
  jr z,CDALONE   ; CD d:

; The name, up to 11 bytes, padded with
; spaces into CDNAME. A longer name is
; refused, as is text after it.

CDNAM:
  ld de,CDNAME   ; the name's room
  ld b,11        ; the room left

CN1:
  ld a,(hl)      ; its next byte
  cp SPACE+1
  jr c,CNPAD     ; the name's end
  inc b          ; no room left?
  dec b
  jp z,BADW      ; past 11 bytes
  ld (de),a      ; a byte of it
  inc de
  inc hl
  dec b
  jr CN1         ; on through it

CNPAD:
  inc b          ; room left?
  dec b
  jr z,CN3       ; eleven bytes

CN2:
  ld a,SPACE     ; the rest blank
  ld (de),a
  inc de
  djnz CN2

; From a script, its own drive keeps
; its volume: the script's next record
; would be read from another.

CN3:
  call ENDCHK    ; nothing after it
  ld a,(SOPEN)   ; from a script?
  or a
  jr z,CN4       ; typed
  ld a,(SFCB)    ; its drive, from 1
  dec a          ; from 0
  ld hl,CDDRV
  cp (hl)
  jp z,BADW      ; the script's own

; Find the volume. Already on the drive
; is shown with no mount; on another,
; refused; on none, mounted, and its
; label written into the table.

CN4:
  call VWALKQ    ; CDIDX and CDON
  ld a,(CDIDX)   ; found?
  or a
  jr z,CDNONE    ; no such volume
  ld a,(CDON)    ; its drive
  ld hl,CDDRV
  cp (hl)
  jr z,CDSHOW    ; already there
  inc a          ; FFh: on no drive
  jr nz,CDELSE   ; on another drive
  ld a,(CDIDX)   ; the index, from 1
  dec a
  ld e,a         ; E: its index
  ld b,(hl)      ; B: the drive
  ld c,TNMOUNT
  call ABICALL   ; flush, then mount
  ld de,CDNOMSG  ; if refused
  jp c,ERRMSG    ; refused
  ld a,(CDDRV)
  call LBLADR    ; the drive's label
  ex de,hl
  ld hl,CDNAME   ; is the new one
  ld bc,11
  ldir           ; copied in
  jr CDSHOW

CDALONE:
  xor a          ; the table invalid:
  ld (LBL),a     ; read the card again

CDSHOW:
  ld a,(CDDRV)
  call DRVLBL    ; d:NAME
  jp BDONE

CDLIST:
  inc hl         ; past ?
  call ENDCHK    ; nothing after ?
  ld a,1
  ld (VLIST),a   ; each one listed
  call VWALK     ; listed
  jp BDONE

CDNONE:
  call PUTCDN    ; NAME, then ?
  jp BW2

; The name sought, its spaces left out.

PUTCDN:
  ld hl,CDNAME
  ld b,11
  jp PUTTRIM

CDELSE:
  call PUTCDN    ; NAME is on d:
  ld de,ISONMSG
  call PUTS
  ld a,(CDON)    ; its drive
  call PUTDRV
  call CRLF
  jp FAILED      ; code FF00h

ISONMSG: DB " is on $"
CDNOMSG: DB "CANNOT MOUNT$"

; Walk the card's volumes from index 0,
; each described by TNDESC into CFCB,
; to the first index refused. LBL takes
; the labels of those on A: to D:. One
; labelled CDNAME sets CDIDX to its
; index plus 1 and CDON to its drive,
; FFh for none. With VLIST set each is
; listed, its label and its drive; a
; listing stopped at [more] leaves LBL
; to be read again. VWALKQ clears VLIST
; first, for a walk that lists nothing.
; Changes all.

VWALKQ:
  xor a
  ld (VLIST),a   ; not listed

VWALK:
  ld hl,LBL
  ld de,LBL+1
  ld bc,4*11-1
  ld (hl),SPACE  ; no labels yet
  ldir           ; all spaces
  xor a
  ld (CDIDX),a   ; none found
  ld e,a         ; from index 0

VW1:
  ld a,e
  ld (VIDX),a
  ld hl,CFCB     ; its 32 bytes
  ld c,TNDESC    ; describe it
  call ABICALL
  ret c          ; past the last
  ld a,(DSDRV)   ; its drive, or FFh
  cp 4           ; on A: to D:?
  jr nc,VW2      ; on no drive
  call LBLADR    ; its row
  ex de,hl
  ld hl,DSLBL    ; its label
  ld bc,11
  ldir           ; into the table

; Compare the label with CDNAME.

VW2:
  ld hl,DSLBL
  ld de,CDNAME
  ld b,11

VW3:
  ld a,(de)
  cp (hl)        ; byte by byte
  jr nz,VW4      ; not the one sought
  inc hl
  inc de
  djnz VW3       ; all 11 bytes
  ld a,(VIDX)    ; found:
  inc a
  ld (CDIDX),a   ; its index plus 1
  ld a,(DSDRV)
  ld (CDON),a    ; and its drive

VW4:
  ld a,(VLIST)
  or a
  jr z,VW5       ; not listed
  call LSTNL     ; a row
  jr c,VWSTOP    ; stopped
  ld hl,DSLBL
  ld b,11
  call PUTN      ; the label, padded
  ld a,(DSDRV)
  cp 4           ; on a drive?
  jr nc,VW5      ; on no drive
  ld e,SPACE     ; a blank
  call PUTC
  ld a,(DSDRV)
  call PUTDRV    ; its drive

VW5:
  ld a,(VIDX)
  inc a
  ld e,a         ; the next index
  jr VW1

VWSTOP:
  xor a          ; labels part read:
  ld (LBL),a     ; the table invalid
  ret

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
  call z,VWALKQ  ; the labels first
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

; A row break through the pager, CR
; then LF. Carry: the listing stopped.

LSTNL:
  ld e,CR
  call PGPUT
  ret c          ; stopped at [more]
  ld e,LF
  jp PGPUT

; CLS: the screen cleared and the
; cursor home, by the terminal's codes.

CMDCLS:
  ld de,CLSMSG
  call PUTS      ; ESC [H, ESC [2J
  jp BDONE

CLSMSG: DB 27,"[H",27,"[2J$"

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
