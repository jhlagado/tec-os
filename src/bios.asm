; CP/M 2.2 BIOS. Cold boot copies the
; ROM table below to RAMBIOS. That
; page-aligned copy is the one that
; runs: the BDOS calls it, and programs
; reach it by the vector at 0001h.
;
; Disk records map to volumes linearly:
; record = track * 64 + sector. Every
; version 1 geometry has 64 records per
; track and no reserved tracks; the
; build checks this against format.json.
; Four records share one 512-byte SD
; block. Reads go through the block
; cache (cache.asm). Writes go through
; to the card before success is
; reported, except on the one volume
; written behind, whose writes stay in
; the cache until it writes them.

; BIOS HOME (track 0) and SETTRK: BC =
; the track, kept in DSKTRK for the next
; READ or WRITE. Nothing moves: the card
; has no head. HOME destroys BC.

BHOME:
  ld bc,0        ; HOME is SETTRK with
                 ; track 0

BSETTRK:
  ld (DSKTRK),bc
  ret

; BIOS SETSEC: BC = the sector, kept in
; DSKSEC; MAPREC checks it.

BSETSEC:
  ld (DSKSEC),bc
  ret

; BIOS SETDMA: BC = the address the next
; record goes to or comes from.

BSETDMA:
  ld (DSKDMA),bc
  ret

; BIOS SECTRAN: BC = the logical sector,
; DE = the table, unused. Returns HL =
; BC, the same sector.

BSECTRN:
  ld h,b         ; no skew
  ld l,c
  ret

; C = drive. Returns HL = DPH, or 0 when
; the drive has no mounted volume. A
; selected drive becomes DSKCUR; a
; refused one leaves it as it was. E's
; first-login bit is not looked at.
; Keeps BC; destroys A, DE and F.

BSELDSK:
  ld a,c
  cp MAXDRV      ; past the last drive:
                 ; refused
  jr nc,SELBAD
  call DRVENT
  ld a,(hl)      ; HL points at the
                 ; geometry byte
  or a           ; 0: no volume mounted
                 ; on the drive
  jr z,SELBAD
  ld a,c         ; the drive selected
  ld (DSKCUR),a

DPHADR:
  ld l,a         ; HL = DPHTAB + 16 *
                 ; drive A, for BSELDSK,

; MNDPH and ALVINIT; keeps BC, destroys
; DE

  ld h,0
  add hl,hl      ; 16 bytes a DPH
  add hl,hl
  add hl,hl
  add hl,hl
  ld de,DPHTAB   ; plus the table's base
  add hl,de
  ret

SELBAD:
  ld hl,0        ; HL = 0: the BDOS's
                 ; select error
  ret

; A = drive. Returns HL = address of its
; drive-table geometry byte (offset 6),
; and preserves BC. Destroys A and DE.

DRVENT:
  add a,a        ; 8 bytes a drive's
                 ; entry (DRVESZ)
  add a,a
  add a,a
  add a,6        ; past the start block
                 ; (4) and length (2)
  ld e,a         ; DE = the offset into
                 ; the table
  ld d,0
  ld hl,DRVTAB
  add hl,de
  ret

; Translate DSKTRK/DSKSEC on DSKCUR into
; BLKOFF, BLKSLOT and SDLBA. Returns Z
; with A = 0 when the record lies inside
; the volume; NZ when the sector, the
; track or the block is out of range,
; SDLBA then unchanged. Destroys BC, DE
; and HL.

MAPREC:
  ld hl,(DSKSEC)
  ld a,h         ; sectors 0-63 only
  or a
  jr nz,MAPBAD
  ld a,l         ; and below 64
  cp 64
  jr nc,MAPBAD

; tracks 0-1023 only

  ld hl,(DSKTRK)
  ld a,h         ; tracks above 1023
                 ; overflow 16-bit
                 ; records
  cp 4
  jr nc,MAPBAD
  add hl,hl      ; record = track * 64 +
                 ; sector
  add hl,hl
  add hl,hl
  add hl,hl      ; six doublings: track
                 ; * 64
  add hl,hl
  add hl,hl
  ld a,(DSKSEC)  ; the sector in the six
                 ; low bits, which
  or l           ; the shift left clear
  ld l,a
  and 3          ; the record's place in
                 ; its block
  ld (BLKSLOT),a
  srl h          ; block = record / 4
  rr l
  srl h
  rr l

; the block within the volume

  ld (BLKOFF),hl
  ld a,(DSKCUR)  ; compare with the
                 ; volume length
  call DRVENT
  dec hl         ; back from the
                 ; geometry byte to the
  ld d,(hl)      ; length, high byte
                 ; first
  dec hl
  ld e,(hl)      ; DE = length in blocks
  push hl        ; the entry, kept for
                 ; the start block
  ld hl,(BLKOFF)
  or a
  sbc hl,de      ; no borrow: the block
                 ; is past the end
  pop hl
  jr nc,MAPBAD
  dec hl         ; HL -> start block
                 ; byte 3
  ld de,SDLBA+3

; the block, added below

  ld bc,(BLKOFF)
  ld a,(hl)      ; SDLBA = start +
                 ; block, little-endian
  dec hl         ; copied from the top
                 ; byte down
  ld (de),a
  dec de
  ld a,(hl)      ; byte 2
  dec hl
  ld (de),a
  dec de
  ld a,(hl)      ; byte 1
  dec hl
  ld (de),a
  dec de
  ld a,(hl)      ; byte 0
  ld (de),a      ; SDLBA now holds the
                 ; start block
  ld hl,(SDLBA)  ; the block added to
                 ; the low word
  add hl,bc
  ld (SDLBA),hl

; and its carry to the high word

  ld hl,(SDLBA+2)
  ld bc,0
  adc hl,bc
  ld (SDLBA+2),hl
  xor a          ; Z: inside the volume
  ret

MAPBAD:
  or 1           ; NZ: outside it
  ret

; The no-pre-read rule's key: the block
; BLKOFF on drive DSKCUR, held as C says
; (BUFOK: 2 cleared, not read), so that
; the next block of its allocation block
; can be cleared rather than read.
; Returns Z. Destroys A and HL.

GETKEY:
  ld a,(DSKCUR)  ; the drive and block,
                 ; as BWRITE compares
  ld (BUFDRV),a  ; them
  ld hl,(BLKOFF)
  ld (BUFBLK),hl
  ld a,c         ; how the block was had
  ld (BUFOK),a
  xor a
  ret

; BIOS READ: copy the record to DSKDMA,
; through the cache. A = 0 on success, 1
; on error. Interrupts are off within,
; and back as they were. Destroys BC, DE
; and HL.

BREAD:
  call CDI
  call MAPREC    ; a record outside the
                 ; volume: NZ, an error
  call z,CREAD
  jp BRET

; A BIOS WRITE refused before any
; change: A = 1, with NZ from the test
; that came here.

DSKERR:
  ld a,1
  ret

; BIOS WRITE: the record goes into its
; block's line in the cache (CWRBH), the
; one write path. The block is read into
; the line first, unless nothing in it
; is the card's to keep: the write is of
; type 2 (C), the first to a newly
; allocated block, or the block before,
; cleared rather than read, is on this
; drive and in the same allocation block
; (GETKEY's key). On a volume written
; through the line goes to the card
; before the call returns; on the one
; written behind it stays dirty until a
; directory write, warm boot or remount.
; A = 0 on success, 1 on error;
; interrupts are off within, and back as
; they were. A directory write also
; marks its drive's DPH: the word at
; offset 4 set to 1, and the one at 6
; raised to cover the block's entries.
; Destroys BC, DE and HL.

BWRITE:
  call CDI
  ld a,c         ; the type: 0 data, 1
                 ; directory, 2 the
  ld (CWTYPE),a  ; first of a new
                 ; allocation block
  call BWR0
  jp BRET

BWR0:
  push bc        ; C, the type, kept
                 ; over MAPREC
  call MAPREC
  pop bc
  jr nz,DSKERR   ; outside the volume
  ld a,(DSKCUR)  ; read-only volumes
                 ; refuse before any
                 ; change
  call DRVENT
  inc hl         ; the flags: bit 0
                 ; read-only
  bit 0,(hl)
  jr nz,DSKERR
  dec hl         ; the geometry byte
                 ; again
  push hl        ; a directory block:
                 ; its drive dirty, its
                 ; mark
  push bc        ; raised over the block
  ld b,(hl)      ; the geometry: 1 G8M,
                 ; 2 G1M
  ld a,64

BWDN:
  srl a          ; the directory's SD
                 ; blocks: 32 G8M, 16
                 ; G1M
  djnz BWDN
  ld bc,(BLKOFF)
  inc b          ; block 256 or more:
                 ; data
  dec b
  jr nz,BWND
  cp c           ; at or past the
                 ; directory's end: data
  jr c,BWND
  jr z,BWND
  ld a,(DSKCUR)  ; a directory block:
                 ; the drive's DPH
  call DPHADR
  ld de,4        ; the DPH's word at 4:
                 ; 1, the drive dirty
  add hl,de
  ld (hl),1
  inc hl         ; the word at 6, the
                 ; mark
  inc hl
  ld a,c         ; DE = (SD block + 1) *
                 ; 16: the block's
  inc a          ; entries, all of them
                 ; under the mark
  ld e,a
  ld d,0
  ex de,hl       ; HL the count, DE the
                 ; mark's address
  add hl,hl      ; 16 entries of 32
                 ; bytes an SD block
  add hl,hl
  add hl,hl
  add hl,hl
  ex de,hl       ; and back
  ld a,e         ; the mark at HL:
                 ; raised to DE if lower
  sub (hl)
  inc hl
  ld a,d
  sbc a,(hl)     ; borrow: the mark is
                 ; already past DE
  jr c,BWND
  ld (hl),d      ; the new mark, high
                 ; byte first
  dec hl
  ld (hl),e

BWND:
  pop bc         ; C, the type, and HL
                 ; the geometry byte
  pop hl
  ld a,c
  cp 2
  jr z,BWNEW     ; type 2: nothing in
                 ; the block to keep
  ld c,0         ; read first, unless
                 ; the key says
                 ; otherwise
  ld a,(BUFOK)
  cp 2           ; the key's block was
                 ; cleared, not read
  jr nz,BWGET
  ld a,(BUFDRV)  ; and on this drive
  ld e,a
  ld a,(DSKCUR)
  cp e
  jr nz,BWGET    ; another drive's key
  ld b,(hl)      ; the geometry: 1 G8M,
                 ; 2 G1M
  ld a,16

BWMASK:
  srl a          ; SD blocks in an
                 ; allocation block
  djnz BWMASK
  dec a          ; the mask of a block's
                 ; place in it
  ld hl,(BLKOFF)
  and l
  jr z,BWGET     ; the first of its
                 ; allocation block
  dec hl         ; the key names the
                 ; block before this one
  ld de,(BUFBLK)
  or a
  sbc hl,de
  jr nz,BWGET    ; another block: read
                 ; first

BWNEW:
  ld c,1         ; no pre-read

BWGET:
  ld a,(DSKCUR)  ; C decided: the
                 ; volume's policy next
  call DRVENT
  inc hl         ; the flags: bit 1
                 ; written behind
  bit 1,(hl)     ; set: the line stays
                 ; in the cache
  jp nz,CWRBH
  ld hl,CWTYPE   ; written through: bit
                 ; 7 tells CWRBH to
  set 7,(hl)     ; write the line before
                 ; it returns
  jp CWRBH

; P/V = the interrupt state. The second
; read is for an NMOS Z80, which can
; clear P/V if an interrupt is accepted
; during the first. Destroys A.

IFFGET:
  ld a,i         ; P/V = IFF2: PE,
                 ; interrupts on
  ret pe
  ld a,i         ; PO: off, or the NMOS
                 ; fault; read again
  ret

; Interrupts off for a BIOS entry, their
; state kept in CIFF. Destroys A, F and
; HL.

CDI:
  call IFFGET
  di
  push af        ; the flags, P/V among
                 ; them, into HL
  pop hl
  ld (CIFF),hl   ; L: the flags, P/V in
                 ; bit 2
  ret

; BIOS READ and WRITE's exit: A = 0 for
; Z, 1 for NZ (BRET); then, for any
; entry, interrupts back as CDI found
; them, keeping A and the flags (CEI).

BRET:
  ld a,0         ; BIOS READ and WRITE:
                 ; A from Z or NZ, and
  jr z,CEI       ; interrupts as they
                 ; were
  inc a          ; 1: an error

CEI:
  push af        ; A and the flags, kept
  ld a,(CIFF)    ; bit 2, P/V: they were
                 ; on
  and 4
  jr z,CEI1
  ei             ; on again after the
                 ; next instruction

CEI1:
  pop af
  ret
