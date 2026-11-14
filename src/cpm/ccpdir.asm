; Directory-selection scratch in
; LOADBUF, live only while CD runs.

RCDDRV EQU LOADBUF
RCDIDX EQU LOADBUF+1
RCDON EQU LOADBUF+2
RVIDX EQU LOADBUF+3
RVLIST EQU LOADBUF+4
RLBL EQU LOADBUF+5
RCDNAME EQU LOADBUF+49
RCFCB EQU LOADBUF+60
RDSDRV EQU RCFCB+14
RDSLBL EQU RCFCB+16

; Parse CD's query, list or selection.
; Preserve current drive and user;
; failed selection keeps the old volume.
; Uses LOADBUF and changes all.

RCMDCD:
  ld hl,(ARGSTRT)
  call SKIPSP    ; A: its first byte
  ld a,(CURDSK)  ; the logged drive
  and $0F
  ld (RCDDRV),a  ; the current drive
  ld a,(hl)      ; after CD's blanks
  or a
  jp z,RCDALONE  ; CD alone
  cp '?'         ; a question?
  jp z,RCDLIST   ; CD ?
  inc hl
  ld a,(hl)      ; a drive's colon
  dec hl         ; after one letter?
  cp ':'
  jr nz,RCDNAM   ; no: a name
  ld a,(hl)      ; its letter
  sub 'A'        ; the drive, from 0
  cp 4

  jp nc,BADCMD   ; past D:
  ld (RCDDRV),a
  inc hl

  inc hl         ; past d:
  ld a,(hl)      ; anything after?
  or a

  jr z,RCDALONE  ; CD d:

; The name, up to 11 bytes, padded with
; spaces into RCDNAME. A longer name is
; refused, as is text after it.

RCDNAM:
  ld de,RCDNAME  ; the name's room
  ld b,11        ; the room left

RCN1:
  ld a,(hl)      ; its next byte
  cp SPACE+1
  jr c,RCNPAD    ; the name's end
  inc b          ; no room left?
  dec b
  jp z,BADCMD    ; past 11 bytes
  ld (de),a      ; a byte of it
  inc de
  inc hl
  dec b
  jr RCN1        ; on through it

RCNPAD:
  inc b          ; room left?
  dec b
  jr z,RCN3      ; eleven bytes

RCN2:
  ld a,SPACE     ; the rest blank
  ld (de),a
  inc de
  djnz RCN2

RCN3:
  call ENDCHK    ; nothing after it

RCN4:
  call RVWALKQ   ; RCDIDX and RCDON
  ld a,(RCDIDX)  ; found?
  or a
  jr z,RCDNONE   ; no such volume
  ld a,(RCDON)   ; its drive
  ld hl,RCDDRV
  cp (hl)
  jr z,RCDSHOW   ; already there
  inc a          ; FFh: on no drive
  jr nz,RCDELSE  ; on another drive
  ld a,(RCDIDX)  ; the index, from 1
  dec a
  ld e,a         ; E: its index
  ld b,(hl)      ; B: the drive
  ld c,TNMOUNT
  call VSMNT     ; flush, then select

; if refused

  ld de,RCDNOMSG
  jp c,ERRGO     ; refused
  ld a,(RCDDRV)
  call RLBLADR   ; the drive's label
  ex de,hl
  ld hl,RCDNAME  ; is the new one
  ld bc,11
  ldir           ; copied in
  jr RCDSHOW

RCDALONE:
  call RVWALKQ

RCDSHOW:
  ld a,(RCDDRV)
  call RDRVLBL   ; d:NAME
  jp STARTED

RCDLIST:
  inc hl         ; past ?
  call ENDCHK    ; nothing after ?
  ld a,1
  ld (RVLIST),a  ; each one listed
  call RVWALK    ; listed
  jp STARTED

RCDNONE:
  call RPUTCDN   ; NAME, then ?
  jp BADEND

; The name sought, its spaces left out.

RPUTCDN:
  ld hl,RCDNAME
  ld b,11
  jp RPUTTRIM

RCDELSE:

  call RPUTCDN   ; NAME is on d:
  ld de,RISONMSG
  call PUTSTR
  ld a,(RCDON)   ; its drive
  call RPUTDRV
  call RCRLF
  jp RCFAILR     ; code FF00h

RISONMSG:  DB    " is on $"
RCDNOMSG:  DB    "CD FAILED$"

; Walk the card's volumes from index 0,
; each described by TNDESC into RCFCB,
; to the first index refused. RLBL takes
; the labels of those on A: to D:. One
; labelled RCDNAME sets RCDIDX to its
; index plus 1 and RCDON to its drive,
; FFh for none. With RVLIST set each is
; listed, its label and its drive.
; RVWALKQ clears RVLIST first for a walk
; that lists nothing.
; Changes all.

RVWALKQ:
  xor a
  ld (RVLIST),a  ; not listed

RVWALK:
  ld hl,RLBL
  ld de,RLBL+1
  ld bc,4*11-1
  ld (hl),SPACE  ; no labels yet
  ldir           ; all spaces
  xor a
  ld (RCDIDX),a  ; none found
  ld e,a         ; from index 0

RVW1:
  ld a,e
  ld (RVIDX),a
  ld hl,RCFCB    ; its 32 bytes
  ld c,TNDESC    ; describe it
  call VSDSC
  ret c          ; past the last
  ld a,(RDSDRV)  ; its drive, or FFh
  cp 4           ; on A: to D:?
  jr nc,RVW2     ; on no drive
  call RLBLADR   ; its row
  ex de,hl
  ld hl,RDSLBL   ; its label
  ld bc,11
  ldir           ; into the table

; Compare the label with RCDNAME.

RVW2:
  ld hl,RDSLBL
  ld de,RCDNAME
  ld b,11

RVW3:
  ld a,(de)
  cp (hl)        ; byte by byte
  jr nz,RVW4     ; not the one sought
  inc hl
  inc de
  djnz RVW3      ; all 11 bytes

  ld a,(RVIDX)   ; found:
  inc a
  ld (RCDIDX),a  ; its index plus 1
  ld a,(RDSDRV)
  ld (RCDON),a   ; and its drive

RVW4:
  ld a,(RVLIST)
  or a
  jr z,RVW5      ; not listed
  call RLSTNL    ; a row
  jr c,RVWSTOP   ; stopped
  ld hl,RDSLBL
  ld b,11
  call RPUTN     ; the label, padded
  ld a,(RDSDRV)
  cp 4           ; on a drive?
  jr nc,RVW5     ; on no drive
  ld e,SPACE     ; a blank
  call PUTCHAR
  ld a,(RDSDRV)
  call RPUTDRV   ; its drive

RVW5:
  ld a,(RVIDX)
  inc a
  ld e,a         ; the next index
  jr RVW1

RVWSTOP:

  xor a          ; labels part read:
  ld (RLBL),a    ; the table invalid
  ret

; HL = drive A's 11 bytes in RLBL.
; Changes AF and BC.

RLBLADR:
  ld hl,RLBL     ; drive A:'s
  ld bc,11
  inc a

RLA1:
  dec a
  ret z          ; at drive A's
  add hl,bc      ; the next drive
  jr RLA1

; Drive A as d:NAME using its collected
; label, trimmed. A drive past D: has
; no label. Changes all.

RDRVLBL:
  push af        ; the drive
  call RPUTDRV
  pop af
  cp 4

  ret nc         ; past D:
  call RLBLADR
  ld b,11
  jp RPUTTRIM    ; the label

; Drive A as its letter and a colon.

RPUTDRV:
  add a,'A'
  ld e,a
  call PUTCHAR   ; the letter
  ld e,':'
  jp PUTCHAR

; A CR/LF row break, returning with
; carry clear.

RLSTNL:
  call RCRLF
  or a
  ret

; Print B label bytes from HL, including
; spaces. Changes AF, BC, DE and HL.

RPUTN:
  ld c,0         ; no byte left out
  jr RPT0

; The same with its spaces left out.

RPUTTRIM:
  ld c,SPACE     ; spaces left out

RPT0:
  ld a,(hl)      ; the next byte
  and $7F
  cp c           ; left out?
  jr z,RPTSK     ; a space: none
  ld e,a
  call PUTCHAR   ; print it

RPTSK:
  inc hl         ; on through the name
  djnz RPT0
  ret


; Emit a CR and LF through the console.

RCRLF:
  ld e,CR
  call PUTCHAR
  ld e,LF
  jp PUTCHAR

; Return selection failure FF00h to the
; command loop. No selection is changed.

RCFAILR:
  ld hl,RCFAIL
  ld (PRGCODE),hl
  jp STARTED
