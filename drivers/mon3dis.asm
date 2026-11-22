; DIS [start [end]]. Decode forward
; up to eight instructions by default.
; An explicit end limits their starts.

CDIS:
  ld a,8         ; default row count
  ld (DISLEFT),a
  ld de,0-1      ; end of memory
  jr z,DISBARE
  call ADDRW     ; first address
  jp c,BAD
  call SKIP      ; optional end
  jr z,DISONE
  push de        ; keep the start
  call ADDRW     ; inclusive end
  jp c,BAD
  call SKIP      ; no extra operands
  jp nz,BAD
  pop hl         ; start in HL
  or a           ; compare unsigned
  sbc hl,de
  jr c,DISVALID
  jp nz,BAD      ; descending range

DISVALID:
  add hl,de      ; recover start
  xor a          ; no row limit
  ld (DISLEFT),a
  jr DISSET      ; use this range

DISONE:
  ex de,hl       ; explicit start
  ld de,0-1
  jr DISSET      ; use this range

DISBARE:
  ld hl,(DISFROM)

DISSET:
  ld (DISEND),de
  ld (DISFROM),hl

; Print the decoder's address, bytes
; and mnemonic, then check its cursor.

DISROW:
  ld hl,(DISFROM)
  push hl        ; detect address wrap
  call DISSTART
  ld hl,DISLINE1+37
  ld b,33        ; trim trailing blanks

DISTRIM:
  ld a,(hl)
  cp ' '         ; last text character?
  jr nz,DISLN
  dec hl         ; skip padding
  djnz DISTRIM

DISLN:
  inc hl         ; end the output
  ld (hl),'$'
  ld de,DISLINE1
  call PRINT     ; decoded line
  ld de,MCRLF    ; end the row
  call PRINT
  ld hl,DISLEFT  ; rows remaining
  ld a,(hl)
  or a           ; explicit range?
  jr z,DISNEXT
  dec (hl)       ; one line shown
  jr z,DISDONE

DISNEXT:
  pop de         ; previous address
  ld hl,(DISFROM)
  or a           ; next must be higher
  sbc hl,de
  jp c,PROMPT    ; wrapped
  jp z,PROMPT
  add hl,de      ; recover next address
  ld de,(DISEND)
  or a           ; clear carry
  sbc hl,de      ; next at or below end
  jr c,DISROW
  jr z,DISROW
  jp PROMPT

DISDONE:
  pop hl         ; drop previous PC
  jp PROMPT
