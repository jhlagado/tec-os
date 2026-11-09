; Memory checks: RAM, PROTECT and the
; latch's bit 0. Latch changes go
; through MON3's set calls where MON3
; has one, and LATCHV follows them for
; TEC-OS's SD routines, which write the
; latch.

; Set PROTECT (A = 0 or LATPROT), or
; EXPAND (A = 0 or LATEXP), through
; MON3, and the same bit of LATCHV.
; Changes all registers.

SETPRT:
  push af        ; the setting
  ld c,MSETPRT   ; MON3's setPROTECT
  rst $10
  pop af
  ld b,LATPROT   ; LATCHV's bit
  jr SETLV       ; and LATCHV's bit

SETEXP:
  push af        ; the setting
  ld c,MSETEXP   ; MON3's setEXPAND
  rst $10
  pop af
  ld b,LATEXP    ; LATCHV's bit

SETLV:
  ld c,a         ; the setting
  ld a,(LATCHV)  ; the bit cleared
  or b
  xor b
  inc c          ; A was 0: leave it so
  dec c
  jr z,SL1
  or b           ; else set it

SL1:
  ld (LATCHV),a  ; LATCHV as MON3 has it
  ret

; Test BC bytes from HL in two passes.
; Each byte is written L xor H, then its
; complement, and all are read back
; after all are written, so aliased
; addresses show. Z: good. NZ: FAILAD,
; FAILW and FAILR hold the first bad
; byte.

MEMTST:
  ld (MTBEG),hl  ; the area
  ld (MTLEN),bc
  xor a          ; the first pass
  call MTPASS    ; the first pattern
  ret nz
  ld a,$FF       ; the complement

MTPASS:
  ld e,a         ; this pass's mask
  ld hl,(MTBEG)
  ld bc,(MTLEN)

MW1:
  ld a,l         ; the address's pattern
  xor h
  xor e
  ld (hl),a      ; written
  inc hl
  dec bc         ; to the area's end
  ld a,b
  or c
  jr nz,MW1      ; the whole area
  ld hl,(MTBEG)  ; then read it all
  ld bc,(MTLEN)

MV1:
  ld a,l         ; the pattern again
  xor h
  xor e          ; this pass's mask
  cp (hl)        ; as written?
  jr nz,MBAD
  inc hl
  dec bc         ; to the area's end
  ld a,b
  or c
  jr nz,MV1      ; all read
  ret            ; Z: all as written

MBAD:
  ld (FAILW),a   ; written,
  ld a,(hl)      ; read,
  ld (FAILR),a   ; the byte read
  ld (FAILAD),hl
  or 1           ; NZ, and FAILAD where
  ret

; RAM: 1000h-3FFFh after the variables,
; 4000h-7FFFh after the program, and the
; 8000h-BFFFh window with EXPAND off and
; on. PROTECT is off meanwhile. A tag in
; each EXPAND setting must survive the
; other: TEC-OS keeps its cache in
; EXPAND 1, so the two must be different
; RAM.

RAMCHK:
  ld hl,RRAM     ; the record for BEGIN
  call BEGIN
  xor a          ; PROTECT off
  call SETPRT
  ld hl,VARSEND  ; area 1: low RAM
  ld bc,$4000-VARSEND
  ld a,1         ; area 1
  call MTAREA
  jp nz,RMF      ; a bad byte
  ld de,PROGEND  ; area 2: high RAM,
  ld hl,$8000    ; to 7FFFh
  or a
  sbc hl,de
  ld b,h         ; BC: the count
  ld c,l
  ex de,hl       ; HL: the start
  ld a,2
  call MTAREA    ; area 2
  jp nz,RMF
  xor a          ; area 3: EXPAND 0
  call SETEXP
  ld a,3         ; area 3
  call MTWIN
  jp nz,RMF      ; a bad byte
  ld a,LATEXP    ; area 4: EXPAND 1
  call SETEXP
  ld a,4         ; area 4
  call MTWIN
  jp nz,RMF      ; a bad byte

; Tag both settings, then read each tag
; back.

  ld hl,$3145    ; "E1" in EXPAND 1
  ld ($8000),hl  ; at 8000h
  xor a
  call SETEXP    ; EXPAND 0
  ld hl,$3045    ; "E0" in EXPAND 0
  ld ($8000),hl  ; at the same address
  ld hl,($8000)  ; EXPAND 0's tag
  ld de,$3045
  or a
  sbc hl,de
  jr nz,RMD      ; EXPAND 0 lost its tag
  ld a,LATEXP    ; EXPAND 1's tag
  call SETEXP
  ld hl,($8000)
  ld de,$3145    ; EXPAND 1's own tag?
  or a
  sbc hl,de
  jr nz,RMD      ; overwritten: the same
  call RMBACK    ; MON3's settings back
  ld a,RPASS
  call RESULT    ; PASS
  call PRI
  DB " low=",0
  ld hl,VARSEND  ; the areas tested
  call PRHL      ; as hex
  call PRI
  DB "-3FFF high=",0
  ld hl,PROGEND
  call PRHL      ; as hex
  call PRI
  DB "-7FFF exp0=ok exp1=ok"
  DB " distinct=yes",0
  jp ENDL

RMD:
  call RMBACK    ; one RAM for both
  ld a,RFAIL     ; the window's two
  call RESULT    ; settings share RAM
  call PRI
  DB " distinct=no",0
  jp ENDL

RMF:
  call RMBACK    ; a bad byte
  ld a,RFAIL     ; FAIL
  call RESULT
  call PRI
  DB " area=",0
  ld a,(CTBUF)   ; the area's name
  ld hl,AREAS    ; the names

RF1:
  dec a          ; this one's?
  jr z,RF2       ; found it

RF3:
  bit 7,(hl)     ; past one name
  inc hl
  jr z,RF3       ; until bit 7 was set
  jr RF1

RF2:
  ld a,(hl)      ; its letters, the last
  push af        ; with bit 7
  and $7F
  call PUTC      ; one letter
  inc hl
  pop af
  rlca
  jr nc,RF2      ; until the last
  call PRI
  DB " at=",0
  ld hl,(FAILAD)
  call PRHL      ; as hex
  call FIELDS    ; where, and the bytes
  DB " wrote=",0,FHEX
  DW FAILW
  DB " read=",0,FHEX
  DW FAILR
  DB 0,0
  jp ENDL

; MON3's EXPAND and PROTECT settings
; back.

RMBACK:
  ld a,(SVEXP)   ; EXPAND as MON3 had it
  call SETEXP
  ld a,(SVPRT)   ; PROTECT as MON3 had
                 ; it
  jp SETPRT

; MEMTST on the window 8000h-BFFFh as
; area A, or on BC bytes at HL. CTBUF
; keeps the area's number for RMF.

MTWIN:
  ld hl,$8000    ; the 16 KiB window
  ld bc,$4000    ; 16 KiB

MTAREA:
  ld (CTBUF),a   ; the area's number
  jp MEMTST      ; and test it

; Print HL as four hex digits.

PRHL:
  ld a,h         ; high byte first
  call PRHEX     ; the high byte
  ld a,l
  jp PRHEX       ; the low byte

; PROTECT: with it set through MON3, a
; write to the byte after the program
; must not land; with it clear, it must.
; The byte and MON3's setting are put
; back.

PRTCHK:
  ld hl,RPRT
  call BEGIN
  ld a,(PROGEND)
  ld (PSAVE),a   ; kept for later
  ld a,LATPROT   ; PROTECT on
  call SETPRT    ; the spare byte
  ld a,(PSAVE)   ; its complement
  cpl            ; the complement
  ld hl,PROGEND
  ld (hl),a      ; should not land
  ld a,(hl)      ; what is there now
  ld (PRON),a
  xor a          ; PROTECT off
  call SETPRT    ; off again
  ld a,(PSAVE)
  cpl            ; the complement again
  ld hl,PROGEND
  ld (hl),a      ; should land
  ld a,(hl)
  ld (PROFF),a   ; what is there now
  ld a,(PSAVE)   ; the byte back
  ld (hl),a      ; put back
  ld a,(SVPRT)   ; MON3's setting back
  call SETPRT
  ld a,(PSAVE)   ; the original
  ld hl,PRON     ; kept while on?
  cp (hl)
  ld c,RFAIL     ; not kept: FAIL
  jr nz,PC1
  cpl            ; written while off?
  ld hl,PROFF
  cp (hl)        ; written while off?
  jr nz,PC1
  ld c,RPASS     ; both

PC1:
  ld a,c
  call RESULT
  call PRI
  DB " addr=",0
  ld hl,PROGEND
  call PRHL      ; as hex
  call PRI
  DB " on=",0
  ld a,(PSAVE)   ; kept or written
  ld hl,PRON     ; as read with it on
  call PRKEPT
  call PRI
  DB " off=",0
  ld a,(PSAVE)
  ld hl,PROFF
  call PRKEPT    ; as read with it off
  jp ENDL

; Print "kept" if (HL) = A, else
; "written".

PRKEPT:
  cp (hl)        ; the same: kept
  jr nz,PK1      ; written
  call PRI       ; the same byte
  DB "kept",0
  ret

PK1:
  call PRI       ; a different byte
  DB "written",0
  ret

; Latch bit 0 at 0000h-07FFh, measured:
; the bytes that differ from the ROM at
; C000h-C7FFh with the bit 0, with it 1,
; and with MON3's setShadow "on" (01h).
; None differ where the ROM shows.
; TEC-OS expects the ROM with the bit 0.
; Interrupts are off: the vectors at
; 0038h and 0066h are the ROM's
; meanwhile.

SHDCHK:
  ld hl,RSHD
  call BEGIN
  di             ; no interrupts
                 ; meanwhile
  ld a,(LATCHV)  ; bit 0 clear
  and $FE
  out (SYSLAT),a
  call OVCMP     ; through the latch
  ld (SH0),hl    ; the bytes not the ROM
  ld a,(LATCHV)  ; bit 0 set
  or LATSHAD
  out (SYSLAT),a
  call OVCMP     ; through the latch
  ld (SH1),hl    ; the bytes not the ROM
  ld a,(LATCHV)  ; as it was, with the
  out (SYSLAT),a

; MON3's setShadow(01h) is called with
; the latch as found, so its RST 10h
; runs through RAM. The latch is then
; written back directly, before MON3 is
; called again to put its own copy back.

  ld a,LATSHAD   ; MON3's "on"
  ld c,MSETSHD
  rst $10
  call OVCMP
  ld (SHM),hl    ; what MON3's "on"
                 ; shows
  ld a,(LATCHV)  ; the latch as found,
  out (SYSLAT),a
  ld a,(SVSHD)   ; before any RST 10h,
  ld c,MSETSHD   ; then MON3's copy of
  rst $10        ; the same state
  ld a,(LATCHV)
  out (SYSLAT),a

; PASS: bit 0 clear shows the ROM and
; set shows RAM, as TEC-OS's /SHADOW.
; Any other result is a WARN naming what
; was found; the other checks go on,
; with LATCHV as measured at the start.

  ld hl,(SH0)    ; clear: the ROM?
  ld a,h
  or l
  jr nz,SH0L
  ld hl,(SH1)    ; set: RAM?
  ld a,h
  or l
  ld hl,CVTEC    ; as TEC-OS expects
  ld c,RPASS
  jr nz,SH1L
  ld hl,CVNONE   ; the ROM both ways
  jr SH2L

SH0L:
  ld hl,(SH1)    ; clear shows RAM:
  ld a,h         ; set the ROM?
  or l
  ld hl,CVINV    ; the other way round
  jr z,SH2L
  ld hl,CVNONE   ; RAM both ways

SH2L:
  ld c,RWARN

SH1L:
  ld (DESC),hl   ; the convention's name
  ld a,c
  call RESULT    ; the status
  call PRI
  DB " convention=",0
  ld hl,(DESC)
  call PRS       ; its name
  call PRI
  DB " bit0=0:",0
  ld hl,(SH0)    ; what each showed
  call PRVIEW
  call PRI
  DB " bit0=1:",0
  ld hl,(SH1)
  call PRVIEW    ; what bit 0 = 1 shows
  call PRI
  DB " mon3on:",0
  ld hl,(SHM)
  call PRVIEW    ; what MON3's "on"
                 ; shows
  jp ENDL

; Print "rom" for HL = 0 differing
; bytes, else "ram", and the count in
; brackets.

PRVIEW:
  push hl        ; the count
  ld a,h
  or l
  jr nz,PV1      ; some differ
  call PRI       ; none differ
  DB "rom",0
  jr PV2         ; the count next

PV1:
  call PRI       ; some differ
  DB "ram",0

PV2:
  ld a,'('
  call PUTC      ; the count
  pop hl
  call PRD16
  ld a,')'
  jp PUTC        ; and close it

; HL = the bytes of 0000h-07FFh that
; differ from C000h-C7FFh. Uses no stack
; between the reads. Changes
; AF/DE/HL/IX.

OVCMP:
  ld hl,0        ; the low view
  ld de,ROMLO    ; the ROM itself
  ld ix,0        ; the count

OC1:
  ld a,(de)
  cp (hl)        ; the same byte?
  jr z,OC2
  inc ix         ; one more different

OC2:
  inc hl
  inc de
  ld a,h         ; up to 0800h
  cp OVLEND
  jr nz,OC1
  push ix        ; the count to HL
  pop hl
  ret

; The areas' names, each ending with bit
; 7 set on its last letter.

CVTEC:    DB    "tecos",0
CVINV:    DB    "inverted",0
CVNONE:   DB    "none",0
AREAS:    DB    "lo",'w'+$80,"hig"
  DB 'h'+$80,"exp",'0'+$80,"exp",'1'+$80
