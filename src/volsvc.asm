; Restore RSLBUF after MOUNT and
; ALVINIT. Match retained entries and
; slot capacities before changing
; DRVTAB/DRVIDX/DPHs. Early failure
; leaves default mappings, but
; scratch/cache/card effects remain.
; Success retains slots and TPA.
; RSLIDX/RSLTMP are scratch. Cold caller
; supplies maskable exclusion. Change
; AF/BC/DE/HL/IX. Full metadata reads
; set I=0. No public A/flag result.

RESEL:

; Drive A with geometry 0 means no saved
; selection. Other geometry-zero entries
; stay empty even if the card
; names them.

  ld a,(RSLBUF+6)
  or a
  ret z
  ld hl,0

  ld (RSLIDX),hl
  ld (RSLIDX+2),hl
  xor a
  ld (MNTI),a

RSWALK:
  ld a,(MNTI)
  call DESCIX
  ret nz
  ld hl,RSLTMP
  call MNFILL
  ld c,0
  ld de,RSLBUF

RSDRV:
  call RSEQ
  jr nz,RSNEXT

; Use the first retained drive whose
; eight-byte entry matches. A second
; identical retained entry stays
; unmatched and prevents publication.

  call VSLOT
  ret c
  ld hl,RSLIDX
  ld b,0
  add hl,bc
  ld a,(MNTI)
  inc a
  ld (hl),a
  jr RSDESC

RSNEXT:
  ld hl,DRVESZ
  add hl,de
  ex de,hl
  inc c
  ld a,c
  cp MAXDRV
  jr c,RSDRV

RSDESC:
  ld hl,MNTI
  inc (hl)
  ld a,(MNTCNT)
  cp (hl)
  jr nz,RSWALK

; Every retained geometry-nonzero entry
; must have an index before publication.

  ld c,0

  ld hl,RSLBUF+6
  ld de,RSLIDX

RSCHK:
  ld a,(de)
  or a
  jr nz,RSCHK1
  or (hl)
  ret nz

RSCHK1:
  inc de
  ld a,l         ; RSLBUF fits one page
  add a,DRVESZ
  ld l,a
  inc c
  ld a,c
  cp MAXDRV
  jr c,RSCHK

; Publish entries and indices together,
; then rebuild DPHs for nonempty drives.
; Unretained drives stay empty. After
; valid matches this phase has no card
; read or checked failure.

  ld hl,RSLBUF
  ld de,DRVTAB
  ld bc,MAXDRV*DRVESZ+MAXDRV
  ldir
  ld c,0

RSDPH:
  ld a,c
  call DRVENT
  ld a,(hl)
  or a
  jr z,RSDPH1
  push bc
  ld e,c
  ld c,a
  ld a,e
  call MNDPH
  pop bc

RSDPH1:
  inc c
  ld a,c
  cp MAXDRV
  jr c,RSDPH
  ret

; Compare eight bytes at DE with RSLTMP,
; stopping at the first mismatch. Return
; Z only if all match. Keep C and
; original DE. Change AF/B/HL. Equality
; leaves HL past eight bytes and B=0.
; Otherwise HL names the differing byte.

RSEQ:
  push de
  ld hl,RSLTMP
  ld b,DRVESZ

RSEQ1:
  ld a,(de)
  cp (hl)
  jr nz,RSEQ2
  inc de
  inc hl
  djnz RSEQ1

RSEQ2:
  pop de
  ret

; Volume services: B=drive for
; mount/unmount, E=index for
; mount/describe. Describe takes HL->32
; writable bytes. Return A=0/Z, carry
; clear, or A=TNEBAD/carry with Z
; unspecified. Keep IY. Other registers
; and alternates may change. Full
; metadata reads set I=0. Stack bound:
; 24 bytes below return, dispatch
; included. Mount/unmount call public
; BDOS with no active caller BDOS call.

VSMNT:
  call VSIN
  jr VMNT

VSUNM:
  call VSIN
  jr VUNM

; Describe copies all 32 card-descriptor
; bytes, replacing only DMOUNT with the
; current drive or FFh. A rejected query
; performs no output copy. Scratch/cache
; may still change, including writes to
; an aliased caller buffer.

VSDSC:
  call VSIN
  ld a,e
  ex de,hl
  call VDESC
  jr nz,VBAD
  push ix
  pop hl
  ld bc,DSCSZ
  ldir
  ex de,hl

  ld de,DMOUNT-DSCSZ
  add hl,de
  ld (hl),a
  xor a
  ret

; Mount descriptor E on drive C,
; replacing its current volume. Reject
; any already-mounted descriptor,
; including this drive. MOUNT.COM
; handles already-there before calling.
; Check the slot and complete global
; VFLUSH before publication. Early
; failure keeps drive assignment, not
; all cache/card effects. Finish through
; VMNTRS reset/reselection.

VMNT:
  ld a,c
  cp MAXDRV
  jr nc,VBAD
  ld a,e
  call VDESC
  jr nz,VBAD
  inc a
  jr nz,VBAD
  call VSLOT
  jr c,VBAD
  call VFLUSH
  jr nz,VBAD

; Change DMOUNT only in MNBUF, clear the
; old RAM entry and install the new
; entry/DPH. Publish DRVIDX=index+1
; separately. No card descriptor
; is rewritten.

  ld (ix+DMOUNT),c
  push bc
  push de
  ld a,c
  call VCLEAR
  call MNONE
  pop de
  pop bc
  ld hl,DRVIDX
  ld b,0
  add hl,bc
  inc e
  ld (hl),e
  jr VMNTRS

; Check valid descriptor IX against
; drive C's slot (0..3). Payload >=4096
; blocks needs slot 2 (256 bytes),
; otherwise slot 1 (64 bytes). Slot 0 is
; absent. Return carry if insufficient.
; Keep C/DE/IX. Change AF/B/HL. No
; vector is allocated or resized.

VSLOT:

  ld a,(ix+DLEN+1)
  cp $10
  ld a,2
  sbc a,0
  ld hl,DRVSLOT
  ld b,0
  add hl,bc
  dec a
  cp (hl)
  ccf
  ret

; Unmount drive C=1..3 after global
; VFLUSH. Drive A cannot be emptied.
; Failed flush keeps the mapping without
; rolling back cache/card effects.
; VRESET also resets A for internal
; mount use. VOK returns A=0/Z,
; carry clear.

VUNM:
  ld a,c
  or a
  jr z,VBAD
  cp MAXDRV
  jr nc,VBAD
  call VFLUSH
  jr nz,VBAD
  ld a,c
  call VCLEAR

VRESET:

; Clear BUFOK and pass mask 1<<C to
; public BDOS function 37. It clears
; LOGINV, ROVEC and WARMV, leaving the
; next selection to rebuild the
; directory/vector. BENTRY uses
; OLDSP/STKTOP and RETWORD restores the
; service stack.

  xor a
  ld (BUFOK),a
  ld hl,1
  inc c

VRS1:
  dec c
  jr z,VRS2
  add hl,hl
  jr VRS1

VRS2:
  ex de,hl
  ld c,37
  call BDOS

VOK:
  xor a
  ret

; Return A=TNEBAD with carry set. Keep
; prior Z and all earlier effects.

VBAD:
  ld a,TNEBAD
  scf
  ret

; Reset mounted drive C through
; VRESET/BDOS 37. Query the default (25)
; and select again (14) only if it is
; this drive, so 27/31 use its new
; DPB/vector. Fatal BDOS errors end the
; program. Returned errors reach VOK
; too. Neither rolls back the published
; mapping. The saved drive is popped
; before reselection. Return A=0/Z,
; carry clear.

VMNTRS:
  push bc
  call VRESET
  ld c,25
  call BDOS
  pop de
  cp e
  jr nz,VOK
  ld c,14
  call BDOS
  jr VOK

; Set C=B and MNTCB=FFh, forcing the
; next metadata request to refill even
; on a tag hit. Keep B/DE/HL and
; incoming flags. Return A=FFh. No
; validation or cache walk here.

VSIN:
  ld c,b
  ld a,$FF
  ld (MNTCB),a
  ret

; Globally flush dirty lines before a
; drive change. Keep BC=drive, DE=index
; and IX=descriptor. Return A=FFh/Z if
; all succeeded or none needed, NZ if
; any failed. Clean successful lines and
; drop failed ones. Continue after
; errors. Change AF/HL and mapping
; scratch. CWRITE remaps the current
; BIOS request, not arbitrary SDLBA.
; This write-only path leaves
; I unchanged.

VFLUSH:
  push bc
  push de
  push ix

; CDI/CEI restore sampled maskable IFF
; while keeping flush A/flags. DI does
; not exclude NMI.

  call CDI
  call CFLALL
  call CEI
  pop ix
  pop de
  pop bc
  ret

; Clear a drive's RAM entry and index. A
; and C must name the same valid drive.
; Keep C. Change AF/B/DE/HL, with B=0.
; Leave DPH, slots and vector addresses
; intact. No flush here.

VCLEAR:
  push bc
  call DRVENT
  ld de,-6
  add hl,de
  ld b,DRVESZ

VCL1:
  ld (hl),0
  inc hl
  djnz VCL1
  pop bc
  ld hl,DRVIDX
  ld b,0
  add hl,bc
  ld (hl),0
  ret

; Read descriptor index A into shared
; MNBUF. Return IX=MNBUF/Z and A=current
; drive or FFh for none. Range failure
; gives A=FFh/NZ. Read failure gives NZ
; without a valid IX result. Keep BC/DE.
; Change AF/HL/IX and MNTI/MNBUF. A full
; metadata fill sets I=0. The descriptor
; lasts until later metadata scratch
; use. No rollback or
; reentrancy protection.

VDESC:
  ld hl,MNTCNT
  cp (hl)
  jr nc,VDNO
  push bc
  push de
  ld (MNTI),a
  call DESCIX
  ld a,(MNTI)
  ld d,a
  jr nz,VDX
  inc d
  ld hl,DRVIDX
  ld b,MAXDRV
  ld e,0

VDS1:
  ld a,(hl)
  cp d
  ld a,e
  jr z,VDX
  inc hl
  inc e
  djnz VDS1
  ld a,$FF
  cp a

VDX:
  pop de
  pop bc
  ret

VDNO:
  or $FF
  ret
