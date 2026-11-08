; BDOS default/vector queries, DMA/user
; operations, free space and file size,
; position conversion and shared
; directory iteration.

; Function 24: return LOGINV in HL with
; A=L/B=H. Bit 0 is drive A through bit
; 15 for P. Changes AF/B/HL.

FNLOGIN:

  ld hl,(LOGINV)
  jp RETWORD

; Function 25: return logical default
; DEFDRV (0=A) through RETA: A=L, H=B=0.
; An explicit FCB drive can change
; CURDRV without changing this result.
; Changes AF/B/HL.

FNCURDSK:
  ld a,(DEFDRV)  ; logical default
  jp RETA

; Function 26: save caller DE in CURDMA
; and pass it as BC to RAM BIODMA.
; Record I/O and search use this DMA
; address. Directory I/O restores it
; before testing BIOS status, including
; on error.
; Return A=0. Changes AF/BC/HL and BIOS
; SETDMA clobbers.

FNSETDMA:
  ld hl,(PARAM)  ; saved caller DE
  ld (CURDMA),hl
  ld b,h         ; BIOS BC argument
  ld c,l
  call BIODMA    ; RAM SETDMA hook
  jp RETZERO

; Function 27: return DEFALV in HL with
; A=L/B=H without rebinding the drive or
; replacing search state. Blocks start
; at 0, bit 7 first in each byte.
; Changes AF/B/HL.

FNGETALV:

  ld hl,(DEFALV)
  jp RETWORD

; Function 46: select drive E=0..15
; through SELDRV, leaving DEFDRV
; unchanged and CURDRV selected. Count
; clear ALV bits for blocks 0..DSM
; inclusive.
; Write free blocks << BSH as three
; little-endian bytes at CURDMA and
; return A=0. BSH must be positive.
; Supplied G1M/G8M values are 4/5. IX is
; the DPB. All registers may change.
; Selection errors enter BDERR
; nonlocally.

FNFREE:
  ld a,e         ; 0=A..15=P
  call SELDRV    ; bind selected tables
  ld ix,(DPBPTR)

  ld hl,(ALVPTR)
  ld e,(ix+5)    ; DPB DSM low byte
  ld d,(ix+6)    ; DSM high byte
  inc de         ; count DSM+1 blocks
  ld bc,0        ; free-block count
  ld a,$80       ; MSB-first block mask

FRBIT:
  push af        ; mask across AND
  and (hl)       ; NZ: allocated
  jr nz,FRUSED
  inc bc

FRUSED:
  pop af
  rrca           ; carry on mask wrap
  jr nc,FRSAME   ; no wrap: same byte
  inc hl

FRSAME:
  dec de
  push af        ; mask across DE test
  ld a,d
  or e
  jr z,FREND     ; all blocks counted
  pop af         ; restore next bit mask
  jr FRBIT

FREND:
  pop af         ; balance mask push
  ld h,b         ; BC free blocks -> HL
  ld l,c
  xor a          ; 24-bit top byte
  ld b,(ix+2)    ; positive BSH required

FRSH:
  add hl,hl      ; shift low 16 bits
  rla            ; carry into top byte
  djnz FRSH
  ex de,hl

  ld hl,(CURDMA)
  ld (hl),e      ; low byte
  inc hl
  ld (hl),d      ; middle byte
  inc hl
  ld (hl),a      ; high byte
  jp RETZERO

; Function 28: OR the DEFDRV bit into
; ROVEC and return A=0. Functions 13/37
; clear software flags. LOGIN can
; reapply mounted-volume read-only
; state. Changes AF/B/DE/HL.

FNWRPROT:
  ld a,(DEFDRV)  ; logical default drive
  call MASKA     ; HL=drive mask
  ex de,hl
  ld hl,(ROVEC)  ; existing protection
  ld a,l
  or e           ; A..H bits
  ld l,a
  ld a,h
  or d           ; I..P bits
  ld h,a
  ld (ROVEC),hl
  jp RETZERO

; Function 29: return ROVEC in HL with
; A=L/B=H, bit 0 for A. Includes
; explicit and mounted-volume
; protection. Changes AF/B/HL.

FNGETRO:
  ld hl,(ROVEC)  ; software/mount flags
  jp RETWORD

; Function 31: return DEFDPB in HL with
; A=L/B=H. Default selection retains
; this pointer, so the query leaves an
; explicit-drive search intact. Changes
; AF/B/HL.

FNGETDPB:

  ld hl,(DEFDPB)
  jp RETWORD

; Function 32: E=FFh queries through
; GETUSER. Otherwise set USERNO=E&1Fh
; and return A=0. User 0..31 cannot
; equal erased-entry marker E5h. Changes
; AF/B/HL.

FNUSER:
  ld a,(PARAM)   ; saved caller E
  cp $FF         ; FFh query
  jr z,GETUSER
  and $1F        ; five-bit user
  ld (USERNO),a
  jp RETZERO

; Return USERNO (0..31) through RETA in
; A/L with H=B=0. Changes AF/B/HL.

GETUSER:
  ld a,(USERNO)
  jp RETA

; Function 35: find the largest logical
; end across current-user/name matches
; at (PARAM), with '?' name wildcards.
; The dispatcher binds its FCB drive.
; Mode 2 scans to DIRUSED, replacing
; active search state.
; For each entry, compute
; ((S2&3Fh)*32+(EX&1Fh))*128+RC in 24
; bits. Keep the maximum in FSIZE0..2,
; zero if none. Wildcards can span
; files. This is not a sum. RC is not
; clamped.
; SIZEDONE publishes the result to
; r0..r2 and returns FFh. Any register
; may change.

FNSIZE:
  ld hl,(PARAM)

  ld (SRCHFCB),hl
  ld a,2         ; mode 2: all extents
  ld (OPENMOD),a
  xor a
  ld (FSIZE0),a  ; zero maximum
  ld (FSIZE1),a
  ld (FSIZE2),a
  call NEWSRCH

SIZELOOP:
  call FINDENT
  cp $FF         ; FFh: no next extent
  jr z,SIZEDONE

  ld hl,(MATCHPTR)
  call RECBASE   ; CAND=extent base
  ld hl,(MATCHPTR)
  ld de,15
  add hl,de
  ld e,(hl)      ; unsigned entry RC
  ld d,0
  ld hl,(CAND0)  ; CAND += RC
  add hl,de
  ld (CAND0),hl
  ld a,(CAND2)
  adc a,0        ; 24-bit carry
  ld (CAND2),a

  ld b,a         ; compare high to low
  ld a,(FSIZE2)
  cp b
  jr c,SIZEKEEP  ; larger end: keep it

  jr nz,SIZELOOP
  ld a,(CAND1)   ; high equal: middle
  ld b,a
  ld a,(FSIZE1)
  cp b
  jr c,SIZEKEEP  ; larger end

  jr nz,SIZELOOP
  ld a,(CAND0)   ; middle equal: low
  ld b,a
  ld a,(FSIZE0)
  cp b

  jr nc,SIZELOOP

SIZEKEEP:
  ld hl,(CAND0)  ; low/middle as word

  ld (FSIZE0),hl
  ld a,(CAND2)
  ld (FSIZE2),a  ; publish high byte
  jr SIZELOOP

; Publish FSIZE0..2 to caller FCB bytes
; 33..35, low first. Return FFh through
; RETA, also for no-match size zero.
; HL=00FFh and B=0. The size is in the
; FCB, not the return registers.

SIZEDONE:
  ld de,FSIZE0
  call PUBRR     ; size -> FCB r0..r2
  ld a,$FF
  jp RETA

; Function 36: convert sequential
; position in the FCB at (PARAM) to
; r0..r2. Add CR to RECBASE's masked
; EX/S2 base with 24-bit carry and
; publish low first.
; Normal CR is 0..128. Arbitrary input
; bytes are not clamped. Return A=0. Any
; register may change.

FNSETRR:
  ld hl,(PARAM)
  call RECBASE   ; CAND=extent base
  call FCBCR     ; caller next-record CR
  ld e,(hl)      ; unsigned CR
  ld d,0
  ld hl,(CAND0)  ; CAND += CR
  add hl,de
  ld (CAND0),hl
  ld a,(CAND2)
  adc a,0        ; 24-bit carry
  ld (CAND2),a
  ld de,CAND0
  call PUBRR     ; position -> r0..r2
  jp RETZERO

; Copy three low-first bytes from DE to
; caller FCB bytes 33..35 at (PARAM).
; Preserve A. Changes BC/DE/HL/F.

PUBRR:
  ld hl,(PARAM)
  ld bc,33       ; caller r0 offset
  add hl,bc
  ex de,hl       ; DE source -> HL
  ld c,3         ; B=0 from BC=33
  ldir
  ret

; Compute a record base from the FCB or
; entry base in HL:
; ((S2&3Fh)*32+(EX&1Fh))*128. EX is byte
; 12 and S2 byte 14. Both upper S2 bits
; are excluded.
; Store three little-endian bytes in
; CAND0..2 and return its top byte in A,
; B=0. Changes AF/BC/DE/HL.

RECBASE:
  ld de,12
  add hl,de      ; EX offset
  ld a,(hl)
  and $1F        ; EX low five bits
  ld c,a
  inc hl
  inc hl         ; skip S1 to S2
  ld a,(hl)
  and $3F        ; S2 low six bits
  ld h,0
  ld l,a
  add hl,hl      ; five shifts: S2*32
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl
  ld e,c         ; EX adds extent index
  ld d,0
  add hl,de
  xor a          ; 24-bit top byte
  ld b,7         ; seven shifts: *128

RECBSHFT:
  add hl,hl
  rla            ; carry into top byte
  djnz RECBSHFT
  ld (CAND0),hl  ; low/middle bytes
  ld (CAND2),a
  ret

; Function 37: DE is a drive mask, bit
; 0=A. Clear selected LOGINV/ROVEC/WARMV
; bits through ANDV. The next bind
; performs a full scan. Mounted
; read-only flags can be reapplied.
; Return A=0. Changes AF/BC/DE/HL.

FNRESETD:
  ld de,(PARAM)
  ld a,e         ; complement drive mask
  cpl            ; bits for kept drives
  ld c,a
  ld a,d
  cpl            ; high eight drives
  ld b,a
  ld hl,LOGINV
  call ANDV      ; clear selected login
  ld hl,ROVEC
  call ANDV      ; clear software R/O
  ld hl,WARMV
  call ANDV      ; clear bounded rebuild
  jp RETZERO

; Restart directory iteration on DPBPTR:
; clear SRCHIDX, call RAM BIOHOM, set
; CURTRK from DPB+13 OFF and CURSEC=0.
; FINDENT reads the first record later.
; Changes AF/BC/DE/HL and BIOS HOME
; clobbers. BC is loaded with 13.

NEWSRCH:
  ld hl,0

  ld (SRCHIDX),hl
  call BIOHOM    ; RAM HOME hook
  ld hl,(DPBPTR)
  ld bc,13       ; DPB OFF offset
  add hl,bc      ; reserved-track count
  ld e,(hl)
  inc hl
  ld d,(hl)

  ld (CURTRK),de
  ld hl,0

  ld (CURSEC),hl
  ret

; Find the next match from SRCHIDX using
; SRCHFCB/OPENMOD. Keep the pointed-to
; pattern usable until continuation
; ends. Modes 3/5 stop at DIRCNT.
; Other modes stop at DIRUSED.
; READDIR fetches each four-entry record
; at slot 0 and advances the record
; cursor. Set RETCODE=index&3 and
; MATCHPTR=(DIRPTR)+32*slot. Test
; MATCHFCB's A explicitly. Its flags are
; not boolean.
; A match enters FOUNDIT. Otherwise
; advance SRCHIDX. Return FFh at the
; limit. Registers/search state may
; change.

FINDENT:
  ld hl,(SRCHIDX)

  ld de,(DIRUSED)
  ld a,(OPENMOD)
  cp 3
  jr z,FULLDIR   ; make scans past mark
  cp 5
  jr nz,FINDLIM

FULLDIR:

  ld de,(DIRCNT)

FINDLIM:
  or a
  sbc hl,de      ; index against limit
  jp nc,NOENTRY  ; at/past exclusive end
  ld hl,(SRCHIDX)
  ld a,l
  and 3

  call z,READDIR

  ld hl,(SRCHIDX)
  ld a,l
  and 3          ; slot 0..3

  ld (RETCODE),a
  add a,a        ; slot *32
  add a,a
  add a,a
  add a,a
  add a,a        ; byte offset in record
  ld e,a
  ld d,0
  ld hl,(DIRPTR)
  add hl,de

  ld (MATCHPTR),hl
  call MATCHFCB  ; A result, not flags
  or a           ; normalize match flags
  jr nz,FOUNDIT  ; NZ: A=1
  ld hl,(SRCHIDX)
  inc hl

  ld (SRCHIDX),hl
  jr FINDENT

; Advance SRCHIDX after a match. Modes
; 0/5 copy the whole 128-byte record at
; (DIRPTR) to the address in CURDMA.
; Mode 1 enters OPENHIT. Other modes
; return without copying.
; Return RETCODE, slot 0..3 in the
; record. Registers may change.

FOUNDIT:
  ld hl,(SRCHIDX)
  inc hl

  ld (SRCHIDX),hl
  ld a,(OPENMOD)
  or a
  jr z,COPYDIR   ; normal search copy
  cp 5
  jr nz,OPENHIT  ; other modes: OPENHIT

COPYDIR:
  ld hl,(DIRPTR)
  ld de,(CURDMA)
  ld bc,128      ; whole DMA record
  ldir           ; DIRPTR -> CURDMA
  ld a,(RETCODE)
  ret

; Import an open entry. Input A=OPENMOD:
; mode 1 copies entry bytes 1..31 into
; the caller FCB at (SRCHFCB),
; preserving drive/CR/random bytes.
; Other modes enter NOCOPY.
; Save requested EX&1Fh and restore it
; after copying. Against entry EX&1Fh:
; equal keeps RC, earlier request sets
; RC=128 and later sets RC=0. Set caller
; S2 bit 7 unmodified after the import.
; S2 otherwise comes from the entry.
; Return slot 0..3. Registers may
; change.

OPENHIT:
  cp 1
  jr nz,NOCOPY   ; only mode 1 imports
  ld hl,(SRCHFCB)
  ld de,12
  add hl,de
  ld a,(hl)      ; requested EX
  and $1F
  push af        ; save masked request
  ld hl,(MATCHPTR)
  inc hl         ; entry source byte 1

  ld de,(SRCHFCB)
  inc de         ; caller destination +1
  ld bc,31
  ldir           ; through map byte 31
  ld hl,(SRCHFCB)
  ld de,12
  add hl,de
  ld a,(hl)      ; copied entry EX
  and $1F
  ld c,a         ; entry EX&1Fh
  pop af         ; restore request
  ld (hl),a      ; normalized caller EX
  cp c
  jr z,OPENRC    ; same: retain RC
  ld b,$80       ; earlier: full 128
  jr c,OPENSET
  ld b,0         ; later: zero records

OPENSET:
  inc hl
  inc hl
  inc hl
  ld (hl),b      ; caller RC byte 15
  dec hl
  dec hl
  dec hl         ; back to EX

OPENRC:
  inc hl
  inc hl
  ld a,(hl)      ; caller S2 byte 14
  or $80         ; unmodified marker
  ld (hl),a      ; only caller FCB

  ld a,(RETCODE)
  ret

; Modes 2..4: return RETCODE (slot 0..3)
; in A without copying entry or record.
; This tail changes A only.

NOCOPY:

  ld a,(RETCODE)
  ret

; Return A=FFh when no candidate
; remains. This tail changes A only.
; FINDENT may already have changed other
; registers.

NOENTRY:
  ld a,$FF
  ret

; Choose the directory match policy. HL
; points to an entry. SRCHFCB holds the
; pattern address and OPENMOD the mode.
; Mode 5 accepts every entry, used/free.
; Mode 3 accepts E5h only. Modes 0/1/2/4
; compare user/name at MATCHUSR. Mode 2
; ignores extent. Modes 0/1/4 use masked
; EX/S2 except for the literal EX='?'
; bypass there.
; Return A=1 for match or 0 for none.
; Callers must test A. Flags are not a
; boolean result. Changes AF/BC/DE/HL.

MATCHFCB:
  ld a,(OPENMOD)
  cp 5
  jr z,ISMATCH   ; mode 5: used/free
  cp 3
  jr nz,MATCHUSR
  ld a,(hl)
  cp $E5         ; E5h free marker
  jr z,ISMATCH
  jr NOMATCH

; Match USERNO and 11 name/type bytes
; with bit 7 masked on both sides. A
; pattern '?' matches one position. HL
; is the entry base. SRCHFCB points to
; the pattern.
; Mode 2 accepts after the name. Modes
; 0/1/4 accept literal EX=3Fh before EXM
; or S2 checks. Otherwise low-five EX
; differences must lie within DPB.EXM,
; then S2&3Fh must agree. S1 is skipped.
; Return A=1/0 through shared tails.
; Flags are not boolean. Changes
; AF/BC/DE/HL.

MATCHUSR:
  ld a,(USERNO)
  ld b,a         ; current user number
  ld a,(hl)
  cp b           ; exclude other/free
  jr nz,NOMATCH
  inc hl         ; name/type byte 1
  ld de,(SRCHFCB)
  inc de
  ld b,11

NAMELOOP:
  ld a,(de)
  and $7F        ; mask pattern
                 ; attribute
  cp '?'
  jr z,NAMEOK    ; ?: one name position
  ld c,a
  ld a,(hl)
  and $7F        ; mask entry attribute
  cp c
  jr nz,NOMATCH

NAMEOK:
  inc hl
  inc de
  djnz NAMELOOP  ; 11 name/type bytes
  ld a,(OPENMOD)
  cp 2
  jr z,ISMATCH   ; mode 2 skips extent
  ld a,(de)      ; FCB EX, unmasked
  cp '?'
  jr z,ISMATCH   ; 3Fh skips EXM/S2
  xor (hl)       ; differing EX bits
  and $1F
  jr z,EXSAME    ; same EX: test S2
  push hl
  ld c,a         ; retain differences

  ld hl,(DPBPTR)
  inc hl         ; four steps to EXM
  inc hl
  inc hl
  inc hl
  ld a,(hl)      ; extent mask
  cpl            ; outside-mask bits
  and c          ; mismatch outside EXM
  pop hl         ; restore entry EX
  jr nz,NOMATCH

EXSAME:
  inc hl
  inc hl
  inc de
  inc de         ; skip S1 to S2
  ld a,(de)
  and $3F        ; pattern S2 low six
  ld c,a
  ld a,(hl)
  and $3F
  cp c
  jr nz,NOMATCH  ; module mismatch

; Return A=1. LD preserves incoming
; flags. Z/carry do not encode match.
; This tail changes A only.

ISMATCH:
  ld a,1
  ret

; Return A=0 and change flags (XOR A).
; The shared matcher still requires an A
; test because ISMATCH preserves flags.
; Changes AF.

NOMATCH:
  xor a
  ret
