; CCP ERA, REN and COPY commands.
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

; CPNAME parses one unambiguous
; reference. CPPARSE skips spaces,
; preserves DE across PARSEFCB and
; rejects carry through BADCMD. If drive
; is zero, store (CURDSK AND 0Fh)+1.
; CPPARSE returns that drive in A.
; Success leaves HL at the delimiter and
; DE at the FCB base. CPCHK preserves
; delimiter HL around UNAMBIG. CPNAME
; does not preserve CPPARSE's A result.

CPNAME:
  call CPPARSE

CPCHK:
  call UNAMBIG
  jr c,CPBAD
  ret

CPPARSE:
  call SKIPSP
  push de
  call PARSEFCB
  pop de
  jr c,CPBAD
  ld a,(de)
  or a
  ret nz
  ld a,(CURDSK)
  and $0F
  inc a
  ld (de),a
  ret

; COPY source destination: require two
; unambiguous references and validate
; the full tail before I/O. Source uses
; CMDFCB, destination RENFCB. A blank
; destination name copies all eleven
; source name/type bytes, replacing any
; supplied type. Use DEFDMA for 128-byte
; payloads and DIRNUM for the 16-bit
; successful-write count.

CMDCOPY:

  ld hl,(ARGSTRT)
  ld de,CMDFCB
  call CPNAME
  ld de,RENFCB
  call CPPARSE
  call ENDCHK
  inc de
  ld a,(de)
  cp SPACE
  jr nz,CPD1

  ld hl,CMDFCB+1
  ld bc,11
  ldir

CPD1:
  call CPCHK
  ld hl,CMDFCB
  ld de,RENFCB
  ld b,12

; Compare twelve raw drive/name/type
; bytes after default-drive filling. All
; equal enters BADCMD before I/O. Any
; difference enters CPGO. Unlike BDOS
; matching, no name-attribute masking
; occurs here.

CPSAME:
  ld a,(de)
  cp (hl)
  jr nz,CPGO
  inc hl
  inc de
  djnz CPSAME

CPBAD:
  jp BADCMD

; Use DMA=0080h and open the source. FFh
; open reports CPNOSRC through CPFAIL.
; Delete the destination before making
; it anew. FFh make reports CPNODST.
; Clear DIRNUM only after creation.
; Replacement is destructive before
; copying begins.

CPGO:
  ld de,DEFDMA
  call SETDMA    ; 26: DMA DEFDMA
  call DOSSEQ
  DB 15*2+0
  inc a
  ld de,CPNOSRC
  jr z,CPFAIL
  call DOSSEQ
  DB 19*2+1
  call DOSSEQ
  DB 22*2+1
  inc a
  ld de,CPNODST
  jr z,CPFAIL
  ld hl,0

  ld (DIRNUM),hl

; Read one source record. Any nonzero
; returned result, including read
; errors, enters CPDONE. Write a
; zero-result record to the destination.
; A nonzero write enters CPWERR. Count
; only successful writes, modulo 65536.

CPLOOP:
  call DOSSEQ
  DB 20*2+0
  or a
  jr nz,CPDONE
  call DOSSEQ
  DB 21*2+1
  or a
  jr nz,CPWERR

  ld hl,(DIRNUM)
  inc hl
  ld (DIRNUM),hl
  jr CPLOOP

; Close only the destination through
; function 16. FFh reports CPCLOSE
; through CPFAIL. Otherwise print COPIED
; and four hex digits of DIRNUM, high
; byte first, then CR/LF and PRTGO. No
; source close is attempted.

CPDONE:
  call DOSSEQ
  DB 16*2+1
  inc a
  ld de,CPCLOSE
  jr z,CPFAIL

  ld de,CPCOPIED
  call PUTSTR

  ld a,(DIRNUM+1)
  call CPHEX
  ld a,(DIRNUM)
  call CPHEX
  ld de,CRLFMSG
  jp PRTGO

; After a returned write failure,
; attempt destination close and ignore
; its ordinary result. Report CPWRITE
; through ERRGO. Earlier writes are not
; undone. BDOS errors can exit
; nonlocally. CPFAIL takes the message
; in DE.

CPWERR:
  call DOSSEQ
  DB 16*2+1
  ld de,CPWRITE

CPFAIL:
  jp ERRGO

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

; Print A as two uppercase hex digits
; through HEXHL. CPHEXC passes each
; digit in A through E to PUTCHAR/BDOS
; 2. CPHEX preserves BC and changes
; AF/DE/HL.

CPHEX:
  ld hl,CPHEXC
  jp HEXHL

CPHEXC:
  ld e,a
  jp PUTCHAR
