; An optional resident COMSTART v1 record supplies a callback.
; It sees HL=0100h and DE=LOADTOP after page zero is prepared.
; A returning callback leaves launch to the CCP. A debugger
; taking ownership may enter the COM itself and warm boot.
; Preserve the normal COM launch registers on return.

COMHOOK:
  push bc
  push de
  ld de,COMFILE
  ld bc,1
  call REGFIND
  jr nc,COMHNEW
  ld de,COMREC
  ld bc,1        ; 256 records, version 1
  call REGFIND
  jr c,COMHRET
  call COMHDSP
COMHRET:
  pop de
  pop bc
  ret

COMHDSP:
  push hl        ; the destination
  ld hl,TPA
  ld de,(LOADTOP)
  ret            ; dispatch, with COMHRET as return

; COMFILE additionally gets BC=the loaded name FCB and A=its user.
COMHNEW:
  call COMHID
  jr COMHRET
COMHID:
  push hl
  ld hl,TPA
  ld de,(LOADTOP)
  ld bc,CMDFCB
  ld a,(CMDFCB+35)
  ret
COMUSER:
  ld e,$FF
  ld c,32
  call BDOS
  ld (CMDFCB+35),a ; The closed loader FCB's unused random high byte.
  ret
COMFILE: DB "COMFILE "
COMREC: DB "COMSTART"

; Only the blocking matrix loop calls this, with a new byte
; pending. Consume Ctrl-X when a KEYBREAK v1 provider exists.
; Its callback runs on the blocked read's stack. It must switch
; stacks for substantial work and never call BDOS on this path.
KEYBREAK:
  ld a,(RXCHAR)
  cp $18
  jr nz,KEYKEEP
  ld a,(KBSLOT)
  cp $3B
  jr nz,KEYKEEP
  ; Only the direct GETCHAR call in LINLOOP can offer a parked read.
  ld hl,2
  add hl,sp
  ld e,(hl)
  inc hl
  ld d,(hl)
  ld hl,LINLOOP+3
  or a
  sbc hl,de
  jr nz,KEYOLD
  ld a,(HKDEP)
  cp 1
  jr nz,KEYOLD
  ld de,PARKREC
  ld bc,1
  call REGFIND
  jr c,KEYOLD
  ld bc,LINEPARK
  ld de,BDOSRME-BDOSRAM
  jr KEYDISP
KEYOLD:
  ld de,KEYREC
  ld bc,1
  call REGFIND
  jr c,KEYKEEP
KEYDISP:
  call KEYCALL
  jr nc,KEYKEEP  ; provider declined the current context
  xor a
  ld (RXFULL),a
  ret
KEYKEEP:
  or 1
  ret
KEYCALL:
  jp (hl)

KEYREC: DB "KEYBREAK"

; KEYPARK v1 enters on the suspended BDOS stack. BC is LINEPARK and
; DE is its backup length. Move to a private stack before calling LINEPARK.
; LINEPARK takes HL=returning disk callback and DE=private backup buffer.
; The callback may use disk calls only and must not abort or warm boot.
; Register results are unspecified apart from its returned A and flags.
; Keep disk/BIOS caches live so committed writes survive restoration.
LINEPARK:
  push de
  push hl
  ld hl,BDOSRAM
  ld bc,BDOSRME-BDOSRAM
  ldir
  ld a,$FF
  ld (ERRMODE),a
  pop hl
  call KEYCALL
  pop hl
  push af
  ld de,BDOSRAM
  ld bc,BDOSRME-BDOSRAM
  ldir
  pop af
  ret

PARKREC: DB "KEYPARK "
