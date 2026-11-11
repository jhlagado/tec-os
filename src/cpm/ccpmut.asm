; CCP ERA and REN commands.
; ERA: require one complete pattern
; before deleting. For eleven '?'
; name/type bytes, ask ALLQUERY and
; drain the reply through CR. Only
; first-character Y/y confirms. An
; immediate CR cancels. Cancellation
; enters STARTED without ERRGO.

CMDERA:
  call ARGSKIP
  jr z,RENBAD
  call CMDPARSE
  call ENDCHK
  xor a
  ld (ERAALL),a

  ld hl,CMDFCB+1
  ld b,11

ERACHK:
  ld a,(hl)
  cp '?'
  jr nz,ERADEL
  inc hl
  djnz ERACHK

  ld de,ALLQUERY
  call PUTSTR
  ld c,1
  call BDOS
  cp CR
  jp z,STARTED
  and $DF
  ld (ERAANS),a

ERADRAIN:
  ld c,1
  call BDOS
  cp CR
  jr nz,ERADRAIN

ERAGOT:
  ld a,(ERAANS)
  cp 'Y'

STARTNZ:
  jp nz,STARTED
  ld a,1
  ld (ERAALL),a

; Delete CMDFCB through DOSSEQ 19. FFh
; enters FILENO. Otherwise a confirmed
; wildcard delete enters STARTED, and an
; unprompted delete enters MAINLOOP.

ERADEL:
  call DOSSEQ
  DB 19*2+0
  inc a
  jr z,FILENO
  ld a,(ERAALL)
  or a
  jr nz,STARTNZ

ERAMAIN:
  jp MAINLOOP

RENBAD:
  jp BADCMD      ; ERA and REN refusals

; REN NEW=OLD: require unambiguous
; complete names with no spaces around
; '='. Parse NEW into RENFCB and OLD
; into CMDFCB. Copy a single explicit
; drive to the omitted side. Reject two
; distinct explicit drives. Both omitted
; drives stay zero for BDOS default
; selection.

CMDREN:
  call ARGSKIP
  jr z,RENBAD
  cp '='
  jr z,RENBAD
  ld de,RENFCB
  call FCBPARSE
  call CPCHK
  ld a,(hl)
  cp '='
  jr nz,RENBAD
  inc hl
  ld a,(hl)
  or a
  jr z,RENBAD
  cp SPACE
  jr z,RENBAD
  cp '='
  jr z,RENBAD
  call ONENAME

  ld hl,CMDFCB
  ld a,(RENFCB)
  or a
  jr z,RENOLD
  cp (hl)
  jr z,RENTEST
  ld b,a
  ld a,(hl)
  or a
  jr nz,RENBAD
  ld (hl),b

RENOLD:
  ld a,(hl)
  ld (RENFCB),a

; Set search DMA to LOADBUF and search
; RENFCB with BDOS 17. Any non-FFh
; result enters RENEXIST. Otherwise copy
; its twelve reference bytes to
; CMDFCB+16 and rename through DOSSEQ
; 23. FFh enters FILENO, other returned
; results MAINLOOP. H is not inspected.

RENTEST:
  call SETLB     ; search DMA LOADBUF
  call DOSSEQ
  DB 17*2+1      ; 17: RENFCB
  inc a
  jr nz,RENEXIST

  ld hl,RENFCB

  ld de,CMDFCB+16
  ld bc,12
  ldir
  call DOSSEQ
  DB 23*2+0
  inc a
  jp z,FILENO
  jr ERAMAIN

; Report FILEEX through ERRGO before
; rename. ERRGO sets PRGCODE=FF00h.

RENEXIST:
  ld de,FILEEX
  jp ERRGO

; CPCHK: reject an empty or wildcard
; name at (FCBBASE) through BADCMD,
; keeping HL.

CPCHK:
  call UNAMBIG
  jp c,BADCMD
  ret

; Call BDOS using the byte after CALL:
; function*2 plus FCB selector bit 0.
; Zero selects CMDFCB, one RENFCB.
; Advance the saved return PC past this
; byte.
; A/B/HL are preserved only during
; decoding. Tail-enter BDOS without
; another CALL frame. Returned values
; follow BDOS, including A=L and B=H.
; READSRC's terminal CALL/byte/RET holds
; one extra return word.

DOSSEQ:
  ex (sp),hl
  ld c,(hl)
  inc hl
  ex (sp),hl
  srl c
  ld de,CMDFCB
  jr nc,DOSGO
  ld de,RENFCB

DOSGO:
  jp BDOS

