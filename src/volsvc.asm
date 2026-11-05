; Reselect a retained selection (RSLCAP)
; on the card MOUNT has just accepted,
; after ALVINIT has given the card's
; defaults their slots, so that neither
; slots nor TPA vary with the selection.
; Step 1 reads and changes nothing: one
; walk of the descriptors, each compared
; with every retained drive on the eight
; bytes MNFILL builds. A descriptor goes
; to the first drive it matches and no
; other is tried, so a second drive
; holding the same entry is left with no
; match. A drive of geometry 0 is not
; retained, whatever its other seven
; bytes: no descriptor MOUNT accepts has
; geometry 0, so none matches it. Step 1
; gives up, leaving the defaults whole,
; on a failed read, a volume whose slot
; wouldn't hold its vector by VMNT's
; rule, or a retained drive (geometry
; not 0) left with no match. Step 2
; reads nothing and can't fail: RSLBUF
; replaces DRVTAB and DRVIDX, and each
; drive's DPH is built. Drives not
; retained stay empty, even if the card
; names them. Takes the selection in
; RSLBUF, with RSLIDX and RSLTMP after
; it as scratch. Destroys AF, BC, DE, HL
; and IX.

RESEL:

; no retained A: means no selection

  ld a,(RSLBUF+6)
  or a
  ret z
  ld hl,0        ; no drive matched yet

; all four indices

  ld (RSLIDX),hl
  ld (RSLIDX+2),hl
  xor a          ; MNTI walks the table
  ld (MNTI),a

RSWALK:
  ld a,(MNTI)
  call DESCIX    ; IX -> the descriptor
  ret nz         ; a failed read: the
                 ; defaults stand
  ld hl,RSLTMP   ; as a drive-table
                 ; entry
  call MNFILL
  ld c,0         ; each retained drive,
                 ; with DE at its entry
  ld de,RSLBUF

RSDRV:
  call RSEQ      ; Z: this drive held
                 ; this descriptor
  jr nz,RSNEXT
  call VSLOT     ; a match: it must fit
                 ; the drive's slot
  ret c          ; too small: the
                 ; defaults stand
  ld hl,RSLIDX   ; this drive's index +
                 ; 1
  ld b,0         ; BC = the drive
  add hl,bc
  ld a,(MNTI)    ; as DRVIDX counts them
  inc a
  ld (hl),a      ; kept for step 2
  jr RSDESC      ; no other drive is
                 ; tried: a duplicate is

; left with no match, which gives up
; below

RSNEXT:
  ld hl,DRVESZ   ; the next retained
                 ; drive
  add hl,de
  ex de,hl       ; DE goes on, C counts
  inc c
  ld a,c
  cp MAXDRV      ; all four, retained or
                 ; not
  jr c,RSDRV

RSDESC:
  ld hl,MNTI     ; the next descriptor
  inc (hl)
  ld a,(MNTCNT)  ; MOUNT's count of them
  cp (hl)
  jr nz,RSWALK   ; until the table is
                 ; walked
  ld c,0         ; every retained drive
                 ; must have matched

; HL at each geometry

  ld hl,RSLBUF+6
  ld de,RSLIDX   ; DE at each index

RSCHK:
  ld a,(de)      ; the index + 1, 0 if
                 ; unmatched
  or a
  jr nz,RSCHK1   ; matched
  or (hl)        ; no match, and A is
                 ; its geometry
  ret nz         ; retained: give up

RSCHK1:
  inc de         ; the next drive's
                 ; index and geometry
  ld a,l         ; within RSLBUF's page
  add a,DRVESZ
  ld l,a
  inc c          ; C counts the drives
  ld a,c
  cp MAXDRV      ; all four
  jr c,RSCHK

; step 2: the entries, then the indices,

  ld hl,RSLBUF   ; over DRVTAB and the
                 ; DRVIDX after it
  ld de,DRVTAB
  ld bc,MAXDRV*DRVESZ+MAXDRV
  ldir           ; the selection is now
                 ; the mount
  ld c,0         ; each drive's DPH for
                 ; what it now holds

RSDPH:
  ld a,c         ; the drive
  call DRVENT    ; HL -> its geometry
                 ; byte
  ld a,(hl)      ; 0: the drive holds
                 ; nothing
  or a
  jr z,RSDPH1    ; empty: BSELDSK
                 ; refuses it anyway
  push bc        ; the loop's count
  ld e,c         ; the drive, while C
                 ; takes the geometry
  ld c,a
  ld a,e         ; and A the drive
  call MNDPH
  pop bc         ; the count again

RSDPH1:
  inc c
  ld a,c         ; all four
  cp MAXDRV
  jr c,RSDPH
  ret

; Z if the eight bytes at DE equal
; RSLTMP's. Keeps C and DE. Destroys AF,
; B and HL.

RSEQ:
  push de        ; the caller's place in
                 ; RSLBUF
  ld hl,RSLTMP   ; the descriptor, as
                 ; MNFILL built it
  ld b,DRVESZ

RSEQ1:
  ld a,(de)      ; a retained byte
  cp (hl)        ; against the
                 ; descriptor's
  jr nz,RSEQ2    ; NZ goes back to the
                 ; caller
  inc de         ; the next of the eight
  inc hl
  djnz RSEQ1

RSEQ2:
  pop de
  ret

; The volume services, TNMOUNT, TNUNMNT
; and TNDESC (abi.inc). B = the drive
; for a mount or unmount, E = the
; container index for a mount or a
; describe, HL -> 32 bytes for a
; describe, its mount byte the drive it
; is on now (FFh none). Returns A = 0
; with carry clear, or A = TNEBAD with
; carry and nothing changed: an index
; past the table, a drive past D, a
; volume already on another drive, a
; slot too small, or drive A to be left
; empty. A mount or unmount resets the
; drive in the BDOS, as function 37
; does, so its next access logs it in
; from its directory. Destroys AF, BC,
; DE, HL and IX.

VSMNT:
  call VSIN      ; C = the drive
  jr VMNT

VSUNM:
  call VSIN
  jr VUNM

VSDSC:
  call VSIN
  ld a,e         ; describe
  ex de,hl       ; DE -> the caller's 32
                 ; bytes, which VDESC
  call VDESC     ; keeps, so that the
                 ; stack stays shallow
  jr nz,VBAD
  push ix        ; the descriptor as the
                 ; card holds it
  pop hl
  ld bc,DSCSZ    ; all 32 bytes to the
                 ; caller
  ldir
  ex de,hl       ; the mount byte: where
                 ; it is now

; back from the copy's end

  ld de,DMOUNT-DSCSZ
  add hl,de
  ld (hl),a      ; VDESC's drive or FFh,
                 ; kept by the copy
  xor a          ; A = 0, carry clear
  ret

; TNMOUNT's body: put volume E on drive
; C, replacing any volume there, after
; the cache's dirty lines are written. A
; mount onto the default drive selects
; it again (function 14), so functions
; 27 and 31 answer for the new volume at
; once. Returns as VSMNT does.

VMNT:
  ld a,c         ; drive past D: refused
  cp MAXDRV
  jr nc,VBAD
  ld a,e         ; the container index
  call VDESC     ; IX -> its descriptor,
                 ; A = its drive or FFh
  jr nz,VBAD
  inc a          ; FFh becomes 0
  jr nz,VBAD     ; on a drive already
  call VSLOT     ; carry: the drive's
                 ; slot is too small
  jr c,VBAD
  call VFLUSH    ; old data safe first
  jr nz,VBAD

; publish only after the old data is
; safe

  ld (ix+DMOUNT),c
  push bc        ; the drive and index,
                 ; across the install
  push de
  ld a,c         ; the old volume
                 ; forgotten
  call VCLEAR
  call MNONE     ; the new one's entry
                 ; and DPH
  pop de
  pop bc         ; C the drive, E the
                 ; index again
  ld hl,DRVIDX   ; DRVIDX = the index +
                 ; 1
  ld b,0
  add hl,bc
  inc e
  ld (hl),e      ; the drive is the
                 ; volume's now
  jr VMNTRS      ; reset, and the
                 ; default selected
                 ; again

; Carry if the slot of drive C won't
; hold the vector of the volume at IX: a
; payload of 4096 blocks or more needs a
; G8M slot (2), and any other a slot.
; Keeps C, DE and IX. Destroys AF, B and
; HL.

VSLOT:

; the payload's high byte

  ld a,(ix+DLEN+1)
  cp $10
  ld a,2         ; 2 needed, or 1 with
                 ; the carry of a small
                 ; one
  sbc a,0
  ld hl,DRVSLOT  ; this drive's slot
  ld b,0
  add hl,bc
  dec a          ; carry: the slot is
                 ; above what's needed
                 ; less 1
  cp (hl)        ; the drive's slot, 0
                 ; to 2
  ccf            ; so carry now: the
                 ; slot is too small
  ret

; TNUNMNT's body: empty drive C, after
; the cache's dirty lines are written.
; Drive A is never emptied. VRESET,
; which TNMOUNT shares, resets drive C
; in the BDOS (function 37) and returns
; A = 0 with carry clear; VOK returns
; that alone and VBAD returns TNEBAD
; with carry.

VUNM:
  ld a,c         ; the drive
  or a
  jr z,VBAD      ; A is never left empty
  cp MAXDRV      ; nor a drive past D
                 ; touched
  jr nc,VBAD
  call VFLUSH    ; its data on the card
                 ; first
  jr nz,VBAD
  ld a,c         ; then its entry gone
  call VCLEAR

VRESET:
  xor a          ; the BIOS's buffered
                 ; record forgotten
  ld (BUFOK),a
  ld hl,1        ; BDOS function 37 for
                 ; drive C
  inc c          ; HL = 1 shifted left C
                 ; times: its bit

VRS1:
  dec c
  jr z,VRS2      ; shifted far enough
  add hl,hl
  jr VRS1

VRS2:
  ex de,hl       ; DE = the drive vector
  ld c,37        ; reset drive: logged
                 ; out, read again
  call BDOS      ; at its next access

VOK:
  xor a          ; A = 0, carry clear
  ret

VBAD:
  ld a,TNEBAD    ; refused, nothing
                 ; changed
  scf
  ret

; VMNT's end: drive C reset in the BDOS
; (VRESET), and selected again by
; function 14 when it is the default, so
; that its DPB and vector are the new
; volume's for functions 27 and 31.
; Returns A = 0 with carry clear.

VMNTRS:
  push bc        ; the drive, kept over
                 ; the reset
  call VRESET    ; the BDOS logs it in
                 ; afresh
  ld c,25        ; the default drive
  call BDOS
  pop de         ; E = the drive mounted
  cp e
  jr nz,VOK      ; another drive: done
  ld c,14        ; the default: selected
                 ; again, its DPB
  call BDOS      ; and vector the new
                 ; volume's
  jr VOK

; C = the drive from B, and every table
; block to be read afresh. Keeps B, DE
; and HL. Destroys AF.

VSIN:
  ld c,b         ; the drive argument,
                 ; in C as VMNT wants
  ld a,$FF
  ld (MNTCB),a   ; no table block read
                 ; yet
  ret

; Before a drive's volume changes: write
; dirty cache lines, Z on success. Keep
; the requested drive (BC), descriptor
; index (DE) and pointer (IX). CDI/CEI
; use HL/AF; CFLALL and its
; SDWRITE/MAPREC path destroy BC/DE/HL.
; Destroys AF and HL.

VFLUSH:
  push bc        ; the caller's drive,
                 ; index and
  push de
  push ix        ; descriptor, which
                 ; CFLALL destroys
  call CDI       ; interrupts off while
                 ; the cache is walked
  call CFLALL    ; every dirty line to
                 ; the card
  call CEI       ; as they were, the
                 ; flags kept
  pop ix         ; all three back for
                 ; the caller
  pop de
  pop bc
  ret

; Forget the volume on drive A, which C
; must also hold: its drive-table entry
; and DRVIDX. Keeps C. Destroys AF, B,
; DE and HL.

VCLEAR:
  push bc
  call DRVENT    ; HL -> the geometry
                 ; byte, offset 6
  ld de,-6       ; back to the entry's
                 ; start
  add hl,de
  ld b,DRVESZ    ; all eight bytes zero

VCL1:
  ld (hl),0
  inc hl
  djnz VCL1
  pop bc         ; C, the drive, again
  ld hl,DRVIDX   ; and the drive's
                 ; index, by C
  ld b,0
  add hl,bc
  ld (hl),0      ; 0: no volume
  ret

; IX -> the descriptor at index A, A =
; the drive it is on (FFh none). NZ if A
; is past the table or its block does
; not read. Keeps BC and DE; uses MNTI.
; Destroys HL.

VDESC:
  ld hl,MNTCNT   ; index past the table:
                 ; refused
  cp (hl)
  jr nc,VDNO
  push bc        ; the caller's BC and
                 ; DE
  push de
  ld (MNTI),a    ; the index, off the
                 ; stack, which a line
  call DESCIX    ; taken and written
                 ; runs deep
  ld a,(MNTI)    ; the index back, the
                 ; flags kept
  ld d,a         ; D = the index
  jr nz,VDX      ; DESCIX's NZ: the read
                 ; failed
  inc d          ; as DRVIDX holds it,
                 ; index + 1
  ld hl,DRVIDX   ; each drive's index +
                 ; 1
  ld b,MAXDRV
  ld e,0         ; E = the drive tried

VDS1:
  ld a,(hl)
  cp d           ; this volume's?
  ld a,e         ; Z: on drive E
  jr z,VDX
  inc hl
  inc e          ; the next drive
  djnz VDS1
  ld a,$FF       ; on no drive
  cp a           ; Z

VDX:
  pop de
  pop bc         ; the flags as they
                 ; were set
  ret

VDNO:
  or $FF         ; NZ
  ret
