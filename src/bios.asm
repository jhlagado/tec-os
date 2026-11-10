; Cold boot copies BIOSBAS from
; tables.asm to page-aligned RAMBIOS.
; BDOS calls that table. The page-zero
; vector reaches its warm-boot entry.
; Record = track*64+sector, four
; 128-byte records per SD block. Version
; 1 geometries require SPT=64 and OFF=0,
; checked by geometryInfo during the
; build. Reads use the block cache.
; Write-through completion and
; write-behind persistence differ.

; HOME sets BC=0 and falls into SETTRK.
; SETTRK stores BC in DSKTRK for later
; MAPREC validation. Flags are
; preserved. SETTRK keeps BC, HOME
; changes it. No physical seek occurs.

BHOME:
  ld bc,0

BSETTRK:
  ld (DSKTRK),bc
  ret

; BIOS SETSEC: BC = the sector, kept in
; DSKSEC; MAPREC checks it.
; Preserve registers and flags.

BSETSEC:
  ld (DSKSEC),bc
  ret

; BIOS SETDMA: BC = the address the next
; record goes to or comes from.
; Preserve registers and flags. Keep the
; DMA buffer valid through that call.

BSETDMA:
  ld (DSKDMA),bc
  ret

; BIOS SECTRAN: BC = the logical sector,
; DE = the table, unused. Returns HL =
; BC, the same sector.
; Preserve BC/DE and flags.

BSECTRN:
  ld h,b
  ld l,c
  ret

; Select C below MAXDRV with nonzero
; mounted geometry. Return its DPH in HL
; and store DSKCUR. Failure returns HL=0
; without changing DSKCUR, with no
; common error-flag result. Ignore E's
; first-login flag. Preserve BC.
; AF/DE/HL may change.

BSELDSK:
  ld a,c
  cp MAXDRV
  jr nc,SELBAD
  call DRVENT
  ld a,(hl)
  or a
  jr z,SELBAD
  ld a,c
  ld (DSKCUR),a

; For valid drive A, return
; HL=DPHTAB+16*A. Preserve BC. Change
; DE/F. This computes an address without
; validation. SELBAD returns HL=0
; without setting flags.

DPHADR:
  ld l,a

  ld h,0
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl
  ld de,DPHTAB
  add hl,de
  ret

SELBAD:
  ld hl,0
  ret

; DRVENT for the current drive DSKCUR:
; load it and fall into DRVENT.

CURENT:
  ld a,(DSKCUR)

; For valid drive A=0..MAXDRV-1, return
; HL=DRVTAB+8*A+6, its geometry byte. No
; bounds check occurs here. Preserve BC.
; Change AF/DE.

DRVENT:
  add a,a
  add a,a
  add a,a
  add a,6
  ld e,a
  ld d,0
  ld hl,DRVTAB
  add hl,de
  ret

; Map DSKTRK/DSKSEC on mounted DSKCUR.
; Require sector 0..63, track 0..1023
; and block below volume length. The
; block is track*16 plus sector/4, kept
; in BC. Store BLKSLOT=sector AND 3 and
; BLKOFF=block before checking length.
; Only then set 32-bit SDLBA to the
; volume's start plus the block.
; Success: A=0/Z/carry clear. Failure:
; NZ, SDLBA unchanged, mapping scratch
; may have changed. Change AF/BC/DE/HL.

MAPREC:
  ld hl,(DSKSEC)
  ld a,h
  or a
  jr nz,MAPBAD
  ld a,l
  cp 64
  jr nc,MAPBAD

  ld hl,(DSKTRK)
  ld a,h
  cp 4
  jr nc,MAPBAD
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl
  ld a,(DSKSEC)
  ld e,a
  and 3          ; record in the block
  ld (BLKSLOT),a
  xor e          ; sector less its slot
  rrca
  rrca           ; sector/4
  or l           ; with track*16
  ld l,a

  ld (BLKOFF),hl
  ld b,h
  ld c,l         ; BC=block number
  call CURENT
  dec hl
  ld d,(hl)
  dec hl
  ld e,(hl)      ; DE=volume length
  ld a,c
  sub e
  ld a,b
  sbc a,d        ; block below it?
  jr nc,MAPBAD
  dec hl
  ld d,(hl)
  dec hl
  ld e,(hl)      ; DE=start, high word
  dec hl
  ld a,(hl)
  dec hl
  ld l,(hl)
  ld h,a         ; HL=start, low word
  add hl,bc
  ld (SDLBA),hl
  jr nc,MAPLBA
  inc de

MAPLBA:
  ld (SDLBA+2),de
  xor a
  ret

MAPBAD:
  or 1
  ret

; Save DSKCUR/BLKOFF and C as
; BUFDRV/BUFBLK/BUFOK. C=2 means cleared
; without pre-read. This key can qualify
; only the next block on the same drive
; within the allocation block. Cache
; writeback can invalidate it. Warm
; CPMINIT clears it. Return A=0/Z/carry
; clear. Change HL.

GETKEY:
  ld a,(DSKCUR)
  ld (BUFDRV),a
  ld hl,(BLKOFF)
  ld (BUFBLK),hl
  ld a,c
  ld (BUFOK),a
  xor a
  ret

; Refuse before record/cache output.
; Return A=1 with incoming NZ from
; mapping or the read-only test. CWTYPE
; and mapping scratch may already have
; changed.

DSKERR:
  ld a,1
  ret

; Preserve incoming BC across MAPREC.
; Mapping/read-only refusal precedes
; record output, after possible
; CWTYPE/mapping changes. Classify
; directory blocks by address,
; independently of C write type: first
; 32 SD blocks for geometry 1, 16 for
; geometry 2.

BWR0:
  push bc
  call MAPREC
  pop bc
  jr nz,DSKERR
  call CURENT
  inc hl
  bit 0,(hl)
  jr nz,DSKERR
  dec hl
  push hl
  push bc
  ld b,(hl)
  ld a,64

BWDN:
  rrca           ; ids 1,2: no wrap
  djnz BWDN
  ld bc,(BLKOFF)
  inc b
  dec b
  jr nz,BWND
  cp c
  jr c,BWND
  jr z,BWND

; Mark mapped directory output before
; CWRBH: DPH+4 low byte=1, with its high
; byte zero from MNDPH. Raise the
; little-endian word at +6 to at least
; 16*(BLKOFF+1). Marks may remain raised
; after later cache/card failure.

  ld a,(DSKCUR)
  call DPHADR
  ld de,4
  add hl,de
  ld (hl),1
  inc hl
  inc hl
  ld a,c
  inc a
  ld e,a
  ld d,0
  ex de,hl
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl
  ex de,hl
  ld a,e
  sub (hl)
  inc hl
  ld a,d
  sbc a,(hl)
  jr c,BWND
  ld (hl),d
  dec hl
  ld (hl),e

; Stack: saved BC above geometry HL.
; Choose C=1 for no pre-read, otherwise
; C=0. Type 2 qualifies directly. Other
; types need BUFOK=2, the same drive and
; BUFBLK exactly one block before
; BLKOFF. Reject the first block of an
; allocation block: geometry 1 has eight
; SD blocks, geometry 2 four.

BWND:
  pop bc
  pop hl
  ld a,c
  cp 2
  jr z,BWNEW
  ld c,0
  ld a,(BUFOK)
  cp 2
  jr nz,BWGET
  ld a,(BUFDRV)
  ld e,a
  ld a,(DSKCUR)
  cp e
  jr nz,BWGET
  ld b,(hl)
  ld a,16

BWMASK:
  rrca
  djnz BWMASK
  dec a
  ld hl,(BLKOFF)
  and l
  jr z,BWGET
  dec hl
  ld de,(BUFBLK)
  or a
  sbc hl,de
  jr nz,BWGET

BWNEW:
  ld c,1

; Keep C's pre-read choice.
; Selected-drive flag bit 1 chooses
; write-behind, otherwise set CWTYPE bit
; 7 for write-through completion.
; Tail-enter the common CWRBH path.

BWGET:
  call CURENT
  inc hl
  bit 1,(hl)
  jr nz,BWGO
  ld hl,CWTYPE
  set 7,(hl)

BWGO:
  jp CWRBH

; Return IFF2 in P/V through LD A,I. On
; initial PO read again for the NMOS Z80
; interrupt-acceptance case. Change A/F
; without disabling interrupts. Callers
; save the result and apply DI
; separately.

IFFGET:
  ld a,i
  ret pe
  ld a,i
  ret

; Sample IFFGET, disable interrupts and
; store AF in CIFF. Flag bit 2 in its
; low byte records the prior enable
; state. Pair CDI/CEI around a
; non-nested interval: CIFF is shared
; storage. Change AF/HL.

CDI:
  call IFFGET
  di
  push af
  pop hl
  ld (CIFF),hl
  ret

; Read 128 bytes into DSKDMA through the
; cache after successful MAPREC. CDI
; disables interrupts, BRET restores the
; saved state and returns A=0 success or
; 1 error. DMA is needed only through
; this call. Change BC/DE/HL and flags.
; A full cache fill also changes I.

BREAD:
  call CDI
  call MAPREC
  call z,CREAD
  jr BRET

; Write 128 bytes from DSKDMA through
; CWRBH. C=0 data, 1 directory, 2 new
; allocation block's first record. Save
; CWTYPE before validation. Type 2 or
; the exact no-pre-read key permits
; zero-fill. Otherwise retain/read
; neighbouring bytes.
; Write-through success includes card
; output. Write-behind may defer it to
; directory writes, warm boot, remount
; or eviction. BRET returns A=0 success
; or 1 error and restores saved
; interrupt state. Change BC/DE/HL/F.
; A full cache pre-read also changes I.
; Falls into BRET.

BWRITE:
  call CDI
  ld a,c
  ld (CWTYPE),a
  call BWR0

; BRET maps incoming Z to A=0, NZ to 1,
; then enters CEI. CEI restores the
; saved enable state from CIFF bit 2
; while preserving entry AF. It may also
; follow CDI directly to retain a
; caller's status. EI takes effect after
; POP AF, before RET.

BRET:
  ld a,0
  jr z,CEI
  inc a

CEI:
  push af
  ld a,(CIFF)
  and 4
  jr z,CEI1
  ei

CEI1:
  pop af
  ret
