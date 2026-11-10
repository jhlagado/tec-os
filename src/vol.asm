; Validate the card container and mount
; its defaults. Block 0 holds the header
; (container-format.md). Descriptors are
; checked and installed in table order.
; Success returns the complete default
; drive set. A later error clears every
; drive and index before returning.
; Payload ends use checked
; 32-bit arithmetic.

MEIO EQU $20     ; header block
                 ; unreadable
MEMAGIC EQU $21
MEVER EQU $22    ; unsupported major
                 ; version
MESIZE EQU $23   ; header or descriptor
                 ; size
MECOUNT EQU $24  ; volume count
MESUM EQU $25    ; header checksum
MEDESC EQU $26   ; descriptor id, flags,
                 ; geometry, length
                 ; or alignment

MERANGE EQU $27  ; payload beyond the
                 ; container or wrapping
MEOVLAP EQU $28  ; overlapping payloads
MEMOUNT EQU $29  ; invalid or duplicate
                 ; drive letter
MENOA EQU $2A    ; no volume mounted as
                 ; drive A

; Mount a started card at cold boot
; (SDINIT, SDBYTE set). Require usable
; classic workspace/stack and maskable
; interrupts off. Return A=0/Z with
; drive A mounted, or an ME* code/NZ
; with DRVTAB, DRVIDX and BUFOK clear.
; Use MNBUF/MNT* and the shared cache.
; Change AF/BC/DE/HL/IX. Full
; metadata reads also set I=0.

MOUNT:
  call UNMOUNT
  ld a,$FF
  ld (MNTCB),a
  xor a
  call MNBLK
  ld a,MEIO
  jr nz,MNTENZ
  call MNHDR
  ld hl,MNBUF
  ld de,FMTMAG
  ld b,8

MNMAG:
  ld a,(de)
  cp (hl)
  ld a,MEMAGIC
  jr nz,MNTENZ
  inc hl
  inc de
  djnz MNMAG

; Require FMTMAJ, exact HDRSZ/DSCSZ and
; a nonzero count. Minor 0 permits 1..8
; volumes. Any nonzero minor
; permits 1..127.

  ld a,(MNBUF+HMAJOR)
  cp FMTMAJ
  ld a,MEVER
  jr nz,MNTENZ

  ld hl,(MNBUF+HHDRSZ)
  ld de,HDRSZ
  or a
  sbc hl,de
  ld a,MESIZE
  jr nz,MNTENZ

  ld hl,(MNBUF+HDSCSZ)
  ld de,DSCSZ
  or a
  sbc hl,de

MNTENZ:
  jp nz,MNTERR

  ld hl,(MNBUF+HCOUNT)
  ld a,(MNBUF+HMINOR)
  or a
  ld a,MAXVOL0-1
  jr z,MNCNT1
  ld a,MAXVOL-1

MNCNT1:
  dec l          ; count-1: 0 wraps
  cp l           ; carry: 0 or too many
  inc l
  ld a,MECOUNT
  jp c,MNTERR
  inc h
  dec h          ; high byte must be 0
  jr nz,MNTENZ
  ld a,l
  ld (MNTCNT),a

; HDRSUM reuses MNBUF. Compare its byte
; sum to the stored checksum, then
; reload the header fields.

  call HDRSUM
  or a
  sbc hl,de
  ld a,MESUM
  jr nz,MNTENZ
  call MNHDR

; Keep the declared container length for
; range checks. Nonzero minors also
; enable HDRIVES (0..4) and HTSUM. Sum
; every byte of floor(count/16) complete
; table blocks after block 0, modulo
; 65536. A declared length is not
; measured card capacity.
; Count<=15 skips the HTSUM comparison.

  ld hl,MNBUF+HBLOCKS
  ld de,MNTBLK
  ld bc,4
  ldir
  xor a
  ld (MNTDRV),a

  ld a,(MNBUF+HMINOR)
  or a
  jr z,MNV2

  ld a,(MNBUF+HDRIVES)
  ld (MNTDRV),a
  cp MAXDRV+1
  ld a,MESIZE
  jp nc,MNTERR

  ld hl,(MNBUF+HTSUM)
  ld (MNTSUM),hl

  ld a,(MNTCNT)
  rrca
  rrca
  rrca
  rrca
  and $0F
  jr z,MNV2
  ld b,a
  ld hl,0

  ld (MNTPRV),hl
  ld c,1

MNSUMB:
  push bc
  ld a,c
  call MNBLK
  pop bc
  ld a,MEIO
  jr nz,MNTEN2
  push bc
  call MNSUM
  pop bc
  inc c
  djnz MNSUMB

  ld de,(MNTSUM)
  or a
  sbc hl,de
  ld a,MESUM

MNTEN2:
  jp nz,MNTERR

; Check every descriptor, mounted or
; not: nonzero id, only DFREAD, known
; geometry, exact payload length and
; nonzero eight-block-aligned start.
; Require start >= the previous
; exclusive end. The ROM does not check
; unique ids/labels or cache-policy
; combinations.

MNV2:
  ld hl,0
  ld (MNTPRV),hl
  ld (MNTPRV+2),hl
  xor a
  ld (MNTI),a

MNDESC:
  ld a,(MNTI)
  call DESCIX
  ld a,MEIO
  jr nz,MNTEN2

  ld a,(ix+DVOLID)
  or (ix+DVOLID+1)
  or (ix+DVOLID+2)
  or (ix+DVOLID+3)
  jr z,MNDBZ

  ld a,(ix+DFLAGS)
  and $FF-DFREAD
  jr nz,MNDBNZ

  ld a,(ix+DGEOM)
  call GEOFIND
  jr nz,MNDBNZ
  inc hl
  inc hl
  ld a,(hl)
  cp (ix+DLEN)
  jr nz,MNDBNZ
  inc hl
  ld a,(hl)
  cp (ix+DLEN+1)
  jr nz,MNDBNZ

  ld a,(ix+DLEN+2)

  or (ix+DLEN+3)
  jr nz,MNDBNZ

  ld a,(ix+DSTART)
  and ALIGNB-1

MNDBNZ:
  jp nz,MNDBAD

  ld a,(ix+DSTART)
  or (ix+DSTART+1)
  or (ix+DSTART+2)
  or (ix+DSTART+3)

MNDBZ:
  jp z,MNDBAD
  push ix
  pop hl
  ld de,DSTART
  add hl,de
  ld de,MNTPRV
  call CMP32
  ld a,MEOVLAP
  jp c,MNTERR

; Store start+length as an exclusive
; end. Reject 32-bit wrap or end beyond
; the container. Byte-addressed cards
; also require end <= 00800000h, making
; the last included block at most
; 007FFFFFh.

  ld l,(ix+DSTART)
  ld h,(ix+DSTART+1)
  ld e,(ix+DLEN)
  ld d,(ix+DLEN+1)
  add hl,de
  ld (MNTPRV),hl

  ld l,(ix+DSTART+2)
  ld h,(ix+DSTART+3)
  ld e,(ix+DLEN+2)
  ld d,(ix+DLEN+3)
  adc hl,de
  ld (MNTPRV+2),hl
  jr c,MNSTX
  ld de,MNTPRV
  ld hl,MNTBLK
  call CMP32
  jr c,MNSTX
  ld a,(SDBYTE)
  or a
  jr z,MNSTOK
  ld hl,(MNTPRV+2)
  ld a,h
  or a
  jr nz,MNSTX
  ld a,l
  cp $80
  jr c,MNSTOK
  jr nz,MNSTX
  ld hl,(MNTPRV)
  ld a,h
  or l
  jr z,MNSTOK

MNSTX:
  ld a,MERANGE

MNTEJ:
  jr MNTERR      ; MOUNT's failure exit

MNEMNT:
  ld a,MEMOUNT   ; bad mount letter
  jr MNTEJ

MNSTOK:

; DMOUNT is FFh for no drive or 0..3,
; below MNTDRV when nonzero. Each drive
; may be assigned once. Install each
; accepted default before advancing to
; the next descriptor.

  ld a,(ix+DMOUNT)
  cp DUNMNT
  jr z,MNNEXT
  cp MAXDRV
  jr nc,MNEMNT
  ld e,a         ; the drive
  ld a,(MNTDRV)
  dec a

  cp e
  jr c,MNEMNT

  ld d,0
  ld hl,DRVIDX
  add hl,de
  ld a,(hl)
  or a
  jr nz,MNEMNT
  ld a,(MNTI)
  inc a
  ld (hl),a
  call MNONE

MNNEXT:
  ld hl,MNTI
  inc (hl)
  ld a,(MNTCNT)
  cp (hl)
  jp nz,MNDESC

; Require drive A after the complete
; walk. On any later rejection MNTERR
; clears drive/index entries and BUFOK,
; retaining the nonzero error code/NZ.
; DPH/cache/card effects are not
; rolled back.

  ld a,(DRVTAB+6)
  or a
  ld a,MENOA
  jr z,MNTERR
  xor a
  ret

MNDBAD:
  ld a,MEDESC

MNTERR:
  push af
  call UNMOUNT
  pop af
  or a
  ret

; Fetch absolute table block A (0..7)
; into a shared cache line. Reuse a hit
; only if MNTCB names that block.
; Otherwise refill it from the card.
; Return A=0/Z with MNTLN/MNTCB set, or
; NZ with MNTCB=FFh. Change AF/BC/DE/HL.
; A full payload fill sets I=0. Caller
; supplies safe bank/stack state and
; maskable exclusion. DI does not
; exclude NMI.

MNBLK:

  ld (MNBUF+2),a
  call MNLBA
  call CLOOK
  jr nz,MNB1
  ld c,a
  ld a,(MNTCB)
  ld hl,MNBUF+2
  cp (hl)
  ld a,c
  jr nz,MNB2

MNB3:
  ld (MNTLN),a

  ld a,(MNBUF+2)
  ld (MNTCB),a
  xor a
  ret

MNB1:

; A miss may evict dirty data. CWRITE
; then remaps SDLBA from the BIOS
; request, so restore this metadata
; block before filling. A failed fill
; drops its line. Any take/fill failure
; invalidates MNTCB.

  call CTAKE
  jr nz,MNBF
  ld c,a
  call MNLBA
  ld a,c

MNB2:
  call CFILL
  jr z,MNB3

MNBF:
  ld a,$FF
  ld (MNTCB),a
  ret

; Restore SDLBA from valid block byte
; MNBUF+2 (0..7), with its top three
; bytes zero. Change A/HL. Preserve
; incoming flags.

MNLBA:

  ld a,(MNBUF+2)
  ld l,a
  ld h,0
  ld (SDLBA),hl
  ld l,h
  ld (SDLBA+2),hl
  ret

; Copy 32 bytes from cache line MNTLN in
; EXPAND 1 to MNBUF in bank 0. MNHDR
; selects offset 0, MNCP uses MNTPRV+2
; and MNCPH takes HL. Tail-enter MVCOPY
; with XMDST=0/XMSRC=1. Return A=0/Z,
; carry clear and BC=0, with pointers
; advanced. Change AF/BC/DE/HL and copy
; scratch. Use a valid 32-byte span.
; MVCOPY keeps alternates and restores
; the latch from LATCHV. It restores
; sampled maskable IFF and uses the
; stack only while visible.

MNHDR:
  ld hl,0
  jr MNCPH

MNCP:

  ld hl,(MNTPRV+2)

MNCPH:
  ex de,hl
  ld a,(MNTLN)
  call CLADR
  add hl,de
  ex de,hl
  ld hl,MNBUF
  ld bc,$0100
  ld (XMDST),bc
  ld bc,32
  jp MVCOPY

; Add all 512 unsigned bytes of MNTLN to
; MNTPRV's low word, modulo 65536. Stage
; sixteen 32-byte spans through MNBUF so
; the stack remains visible. MNTPRV+2 is
; offset scratch, ending at 512. Return
; HL=sum. Change AF/BC/DE. No SD read or
; I change here.

MNSUM:
  ld hl,0

  ld (MNTPRV+2),hl

MNS1:
  call MNCP

  ld hl,(MNTPRV)
  ld de,MNBUF
  ld bc,32
  call SUMDE

  ld (MNTPRV),hl
  ld hl,(MNTPRV+2)
  ld de,32
  add hl,de
  ld (MNTPRV+2),hl
  bit 1,h
  jr z,MNS1

  ld hl,(MNTPRV)
  ret

; Copy valid descriptor index A into
; shared MNBUF. Return A=0/Z, carry
; clear and IX=MNBUF, or NZ without a
; valid IX result on read failure.
; Change AF/BC/DE/HL. A full metadata
; fill sets I=0. Later metadata reads,
; sums or MNBUF use invalidate the
; descriptor contents. Block 0 slots
; 1..15 hold indices 0..14, then sixteen
; descriptors per block: index+1 is
; block*16+slot; DSCBLK0 must be 15.
; The caller checks the table count.

DESCIX:
  inc a          ; header is block 0's
                 ; slot 0
  ld c,a
  and $0F        ; slot in the block
  ld l,a
  ld h,0
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl      ; slot*32: its offset

; Keep the slot offset in MNBUF while
; MNBLK uses MNBUF+2 for its request.
; CDI/CEI restore sampled maskable IFF
; and preserve read flags. Their shared
; CIFF is not nested/NMI-safe.

  ld (MNBUF),hl
  call CDI
  ld a,c         ; index+1
  rrca
  rrca
  rrca
  rrca
  and $0F        ; its block
  call MNBLK
  call CEI
  ret nz
  ld hl,(MNBUF)
  call MNCPH
  ld ix,MNBUF
  xor a
  ret

; Install validated descriptor IX on its
; DMOUNT drive (0..3): DRVTAB entry and
; DPH. Keep BC/IX. Change AF/DE/HL.
; Caller provides vector slots and
; publishes DRVIDX separately.

MNONE:
  push bc

  ld a,(ix+DMOUNT)
  push af
  call DRVENT
  ld de,-6
  add hl,de
  call MNFILL
  pop af

  ld c,(ix+DGEOM)
  call MNDPH
  pop bc
  ret

; Build an eight-byte drive entry at HL
; from descriptor IX: DSTART (4), DLEN
; (2), DGEOM and DFLAGS OR ((DCACHE AND
; DCWB)<<1). Read-only stays bit 0.
; Write-behind becomes bit 1. Keep IX
; and leave HL at the eighth destination
; byte. Change AF/BC/DE. No policy or
; slot validation here.

MNFILL:
  ex de,hl
  push ix
  pop hl
  ld bc,DSTART
  add hl,bc
  ld bc,6
  ldir
  ex de,hl

  ld a,(ix+DGEOM)
  ld (hl),a
  inc hl

  ld a,(ix+DCACHE)
  and DCWB
  add a,a

  or (ix+DFLAGS)
  ld (hl),a
  ret

; Build DPH: A=drive 0..3,
; C=valid geometry. Clear +0..7, store
; DIRBUF/DPB/CSVDUM at +8/+10/+12 and
; retain ALV at +14. ALVINIT supplies
; that pointer. Keep C/IX. Change
; AF/B/DE/HL. Geometry and writable DPH
; storage are caller preconditions.

MNDPH:
  call DPHADR
  ld b,8

MNZ:
  ld (hl),0
  inc hl
  djnz MNZ
  ld (hl),LOW(DIRBUF)
  inc hl
  ld (hl),HIGH(DIRBUF)
  inc hl
  push hl
  ld a,c
  call GEOFIND
  ld de,4
  add hl,de
  ld e,(hl)
  inc hl
  ld d,(hl)
  pop hl
  ld (hl),e
  inc hl
  ld (hl),d
  inc hl
  ld (hl),LOW(CSVDUM)
  inc hl
  ld (hl),HIGH(CSVDUM)
  ret
