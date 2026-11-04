; Container validation and volume
; mounting.
;
; Block 0 of the card holds the
; container header
; (container-format.md). The
; header and every descriptor are
; checked before any drive is mounted,
; and a
; volume is never written outside the
; range its descriptor gives. All block
; arithmetic is 32-bit and a carry out
; of the top byte is an error.
;
; Here: the mount, the table's blocks
; through the cache, the descriptors,
; the
; drive table and DPHs, the reselection
; at cold boot and the volume services.
; The helpers they share (UNMOUNT,
; GEOFIND, CMP32, the sums, DRVDESC)
; follow in
; volutil.asm.

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

; Validate the card's container and
; mount its volumes on the drives their
; descriptors name, at cold boot. Takes
; the card started (SDINIT, SDBYTE
; set). Returns Z when drive A and any
; other assigned drives are mounted;
; else NZ with an ME* code in A and no
; drive mounted. Uses MNBUF and the
; MNT* workspace, and a cache line for
; each table block. Destroys AF, BC,
; DE, HL, IX and IY.
MOUNT:
  call UNMOUNT   ; every drive empty
                 ; while the card is
                 ; checked
  ld a,$FF       ; every table block
                 ; read afresh
  ld (MNTCB),a
  xor a          ; block 0, through a
                 ; cache line
  call MNBLK
  ld a,MEIO      ; the header block
                 ; won't read
  jp nz,MNTERR
  call MNHDR     ; MNBUF = the header's
                 ; first 32 bytes
  ld hl,MNBUF    ; magic
  ld de,FMTMAG   ; against the ROM's
                 ; copy, eight bytes
  ld b,8

MNMAG:
  ld a,(de)
  cp (hl)        ; the card's byte
                 ; against the ROM's
  ld a,MEMAGIC   ; a byte differs: no
                 ; container here
  jp nz,MNTERR
  inc hl         ; the next pair
  inc de
  djnz MNMAG
; only the major version this ROM reads
  ld a,(MNBUF+HMAJOR)
  cp FMTMAJ
  ld a,MEVER     ; another major
                 ; version: refused
  jp nz,MNTERR
; header size: exactly the format's
  ld hl,(MNBUF+HHDRSZ)
  ld de,HDRSZ
  or a           ; carry clear for the
                 ; compare
  sbc hl,de
  ld a,MESIZE    ; another size: refused
  jp nz,MNTERR
; descriptor size: exactly the format's
; too
  ld hl,(MNBUF+HDSCSZ)
  ld de,DSCSZ
  or a
  sbc hl,de
  jp nz,MNTERR   ; A still MESIZE
; volume count: 1 to MAXVOL, or to
; MAXVOL0
; on a 1.0 card (minor 0)
  ld hl,(MNBUF+HCOUNT)
  ld a,h         ; the word's high byte
                 ; must be 0
  or a
  ld a,MECOUNT
  jp nz,MNTERR
  ld a,l         ; and its low byte
                 ; nonzero
  or a
  ld a,MECOUNT
  jp z,MNTERR
  ld a,(MNBUF+HMINOR)
  or a           ; minor 0: a 1.0 card,
                 ; at most MAXVOL0
  ld a,l         ; and no more than the
                 ; table holds
  jr nz,MNCNT1
  cp MAXVOL0+1   ; 1.0: eight at most
  jr MNCNT2

MNCNT1:
  cp MAXVOL+1    ; 1.1 and on: 127 at
                 ; most

MNCNT2:
  ld a,MECOUNT
  jp nc,MNTERR
  ld a,l         ; the count, for every
                 ; walk of the table
  ld (MNTCNT),a
  call HDRSUM    ; HL = sum of all bytes
                 ; except the checksum
  or a
  sbc hl,de      ; DE = the checksum
  ld a,MESUM     ; they differ: a
                 ; damaged header
  jp nz,MNTERR
  call MNHDR     ; the header's fields
                 ; again
; the container's length, 32 bits, kept
  ld hl,MNBUF+HBLOCKS
  ld de,MNTBLK   ; in MNTBLK for the
                 ; range checks
  ld bc,4
  ldir
  xor a          ; no drives field until
                 ; read: 0 for 1.0
  ld (MNTDRV),a
; a 1.0 card (minor 0) has no drives
; field
  ld a,(MNBUF+HMINOR)
  or a           ; or table sum; its
                 ; blocks 1-7 are free,
                 ; as
  jr z,MNV2      ; no volume starts
                 ; below block 8
; format 1.1: the drives it wants, 0 to
; 4
  ld a,(MNBUF+HDRIVES)
  ld (MNTDRV),a
  cp MAXDRV+1
  ld a,MESIZE    ; more than there are:
                 ; refused
  jp nc,MNTERR
; the table's sum, for after the walk
  ld hl,(MNBUF+HTSUM)
  ld (MNTSUM),hl
; Format 1.1: the table's blocks after
; block 0, count / 16 of them, sum to
; the
; header's tableSum.
  ld a,(MNTCNT)
  rrca           ; count / 16: 15 in
                 ; block 0, then 16 a
  rrca           ; block, so this is the
                 ; blocks after it
  rrca
  rrca
  and $0F
  jr z,MNV2      ; the whole table in
                 ; block 0: no sum
  ld b,a         ; B counts the blocks
  ld hl,0
; the sum so far
  ld (MNTPRV),hl
  ld c,1         ; C = the block, from 1

MNSUMB:
  push bc        ; the count and block,
                 ; across the read
  ld a,c         ; block C into its line
  call MNBLK
  pop bc
  ld a,MEIO      ; a table block won't
                 ; read
  jp nz,MNTERR
  push bc        ; and across the sum
  call MNSUM     ; the block added to
                 ; MNTPRV, the sum so
                 ; far
  pop bc
  inc c          ; the next block
  djnz MNSUMB
; the walk's sum against the header's
  ld de,(MNTSUM)
  or a
  sbc hl,de
  ld a,MESUM     ; they differ: a
                 ; damaged table
  jp nz,MNTERR

; One pass in table order: each
; descriptor valid, starting at or after
; the previous one's end, and mounted as
; it
; is checked.
MNV2:
  ld hl,0        ; the previous end:
                 ; none yet, block 0
  ld (MNTPRV),hl
  ld (MNTPRV+2),hl
  xor a          ; MNTI walks the table
                 ; from index 0
  ld (MNTI),a

MNDESC:
  ld a,(MNTI)
  call DESCIX    ; IX -> the descriptor,
                 ; in MNBUF
  ld a,MEIO      ; its block won't read
  jp nz,MNTERR
; volume id must be nonzero
  ld a,(ix+DVOLID)
  or (ix+DVOLID+1)
  or (ix+DVOLID+2)
  or (ix+DVOLID+3)
  jp z,MNDBAD    ; all four zero: an
                 ; empty slot
; no flag but read-only may be set
  ld a,(ix+DFLAGS)
  and $FF-DFREAD
  jp nz,MNDBAD
; a geometry this ROM knows
  ld a,(ix+DGEOM)
  call GEOFIND   ; HL -> geometry entry,
                 ; Z if known
  jp nz,MNDBAD
  inc hl         ; length must equal the
                 ; geometry's payload
  inc hl
  ld a,(hl)      ; the low byte
  cp (ix+DLEN)
  jp nz,MNDBAD
  inc hl         ; the next byte up
  ld a,(hl)
  cp (ix+DLEN+1)
  jp nz,MNDBAD
; and the top two zero, as every payload
  ld a,(ix+DLEN+2)
; is under 65,536 blocks
  or (ix+DLEN+3)
  jp nz,MNDBAD
; start: nonzero and aligned
  ld a,(ix+DSTART)
  and ALIGNB-1
  jp nz,MNDBAD
; nonzero: all four bytes ORed
  ld a,(ix+DSTART)
  or (ix+DSTART+1)
  or (ix+DSTART+2)
  or (ix+DSTART+3)
  jp z,MNDBAD
  push ix        ; start >= the previous
                 ; end
  pop hl
  ld de,DSTART   ; HL -> the start field
  add hl,de
  ld de,MNTPRV   ; against MNTPRV, the
                 ; previous end
  call CMP32     ; carry: start below
                 ; the previous end
  ld a,MEOVLAP
  jp c,MNTERR
  ld iy,MNTPRV   ; the new end replaces
                 ; the previous one
; end = start + length, no wrap
  ld l,(ix+DSTART)
  ld h,(ix+DSTART+1)
  ld e,(ix+DLEN)
  ld d,(ix+DLEN+1)
  add hl,de      ; the low word
  ld (iy+0),l    ; into MNTPRV's low
                 ; word
  ld (iy+1),h
; the high word, with the low's carry
  ld l,(ix+DSTART+2)
  ld h,(ix+DSTART+3)
  ld e,(ix+DLEN+2)
  ld d,(ix+DLEN+3)
  adc hl,de      ; carry out: past 32
                 ; bits
  ld (iy+2),l    ; and its high word
  ld (iy+3),h
  ld a,MERANGE   ; a carry out of the
                 ; top: it wraps
  jr c,MNTERR
  ld de,MNTPRV   ; end <= container
                 ; blocks
  ld hl,MNTBLK
  call CMP32     ; carry: the container
                 ; ends first
  ld a,MERANGE
  jr c,MNTERR
  ld a,(SDBYTE)  ; a standard card
                 ; addresses bytes: its
  or a           ; last block is 7FFFFFh
                 ; (KE-158)
  jr z,MNSTOK    ; block addressing: no
                 ; such bound
  ld a,(iy+3)    ; the end, exclusive,
                 ; at most 800000h
  or a
  jr nz,MNSTX    ; 1000000h or more: too
                 ; far
  ld a,(iy+2)    ; the third byte
                 ; decides the rest
  cp $80
  jr c,MNSTOK    ; below 800000h
  jr nz,MNSTX    ; above it
  ld a,(iy+1)    ; 80xxxxh: only 800000h
                 ; itself
  or (iy+0)
  jr z,MNSTOK

MNSTX:
  ld a,MERANGE   ; a block the card
                 ; can't name
  jp MNTERR

MNSTOK:
; drive letter: none, or A-D, once
  ld a,(ix+DMOUNT)
  cp DUNMNT
  jr z,MNNEXT    ; unmounted: checked,
                 ; but on no drive
  cp MAXDRV
  ld a,MEMOUNT   ; past D
  jr nc,MNTERR
  ld a,(MNTDRV)  ; N drives have slots:
                 ; past them, none. N =
                 ; 0
  dec a          ; wraps, and every
                 ; default drive is
                 ; slotted
; carry: the drive is past the Nth
  cp (ix+DMOUNT)
  ld a,MEMOUNT
  jp c,MNTERR
; HL -> the drive's DRVIDX byte
  ld e,(ix+DMOUNT)
  ld d,0
  ld hl,DRVIDX
  add hl,de
  ld a,(hl)      ; nonzero: an earlier
                 ; volume has it
  or a
  ld a,MEMOUNT
  jr nz,MNTERR
  ld a,(MNTI)    ; DRVIDX holds the
                 ; index + 1
  inc a
  ld (hl),a      ; the drive is this
                 ; volume's now
  call MNONE     ; the drive's entry and
                 ; DPH

MNNEXT:
  ld hl,MNTI     ; the next descriptor
  inc (hl)
  ld a,(MNTCNT)  ; until the count is
                 ; reached
  cp (hl)
  jp nz,MNDESC
; drive A must have a volume
  ld a,(DRVTAB+6)
  or a           ; (its geometry byte, 0
                 ; when empty)
  ld a,MENOA     ; drive A empty:
                 ; refused
  jr z,MNTERR
  xor a          ; Z: mounted
  ret

MNDBAD:
  ld a,MEDESC    ; a descriptor check
                 ; failed

MNTERR:
  push af        ; the code, across the
                 ; unmount
  call UNMOUNT   ; nothing half-mounted
                 ; is left
  pop af
  or a           ; NZ, as every code is
                 ; nonzero
  ret

; Card block A (0-7, the container's
; table) in a cache line, MNTLN: read
; from
; the card the first time it is asked
; for since MNTCB named another block,
; so
; a mount reads the table as the card
; holds it. The line is an ordinary
; clean
; one, left for the cache to take back
; in turn. Walks the cache as it is:
; DESCIX turns interrupts off around it
; for a service. Returns Z with
; MNTLN and MNTCB set, or NZ if the read
; fails, with MNTCB FFh.
; Destroys AF, BC, DE and HL.
MNBLK:
; the block, in MNBUF while it is free,
; so
  ld (MNBUF+2),a
  call MNLBA     ; that the stack stays
                 ; shallow; SDLBA it
  call CLOOK     ; Z: a line holds it, A
                 ; = the line
  jr nz,MNB1
  ld c,a         ; the line, across the
                 ; test
  ld a,(MNTCB)   ; the block last read
                 ; for this mount
  ld hl,MNBUF+2
  cp (hl)        ; read already since
                 ; MNTCB was last set
  ld a,c
  jr nz,MNB2     ; held from before:
                 ; read again

MNB3:
  ld (MNTLN),a   ; the line, and the
                 ; block it now holds
; so that it is not read again
  ld a,(MNBUF+2)
  ld (MNTCB),a
  xor a          ; Z
  ret

MNB1:
  call CTAKE     ; a line for it, the
                 ; next in turn
  jr nz,MNBF     ; a dirty line's write
                 ; failed
  ld c,a         ; the line, kept
  call MNLBA     ; SDLBA the table block
                 ; again: a dirty
  ld a,c         ; line's write remaps
                 ; the BIOS's record

MNB2:
  call CFILL     ; keeps A, the line; Z
                 ; if the card gave it
  jr z,MNB3

MNBF:
  ld a,$FF       ; a failed read holds
                 ; no table block;
  ld (MNTCB),a   ; NZ still
  ret

; SDLBA = the table block kept in
; MNBUF+2, 32 bits, its top three bytes
; 0.
; Destroys A and HL.
MNLBA:
; the block, 0-7
  ld a,(MNBUF+2)
  ld l,a
  ld h,0         ; the low word
  ld (SDLBA),hl
  ld l,h         ; and the top word 0
  ld (SDLBA+2),hl
  ret

; MNBUF = the 32 bytes at offset HL of
; the table block in MNTLN, copied out
; of EXPAND 1 (MNCPH); MNHDR the
; header's first 32, where its fields
; are;
; MNCP the 32 at the offset in MNTPRV+2,
; MNSUM's. Returns A = 0. Destroys
; AF, BC, DE and HL.
MNHDR:
  ld hl,0        ; the header: offset 0
  jr MNCPH

MNCP:
; MNSUM's offset; MNHDR's and DESCIX's
  ld hl,(MNTPRV+2)

MNCPH:
  ex de,hl       ; are given in HL: DE =
                 ; the offset
  ld a,(MNTLN)
  call CLADR     ; HL = the line
  add hl,de      ; plus the offset
  ex de,hl       ; from the line, in
                 ; EXPAND 1
  ld hl,MNBUF    ; to MNBUF
  ld bc,$0100    ; XMDST bank 0, XMSRC
                 ; bank 1
  ld (XMDST),bc
  ld bc,32       ; one descriptor's
                 ; worth
  jp MVCOPY      ; which returns for the
                 ; caller

; MNTPRV's word = itself + the 512 bytes
; of the table block in MNTLN, 32 at a
; time through MNBUF, since nothing runs
; with EXPAND 1 in view while it uses
; the stack; the offset is kept in
; MNTPRV+2, so the stack stays shallow.
; Returns HL = the sum. Destroys AF, BC
; and DE.
MNSUM:
  ld hl,0
; the offset
  ld (MNTPRV+2),hl

MNS1:
  call MNCP      ; 32 bytes of it
; the sum so far
  ld hl,(MNTPRV)
  ld de,MNBUF
  ld bc,32
  call SUMDE     ; added to the sum
; kept off the stack
  ld (MNTPRV),hl
  ld hl,(MNTPRV+2)
  ld de,32       ; the next 32
  add hl,de
  ld (MNTPRV+2),hl
  bit 1,h        ; 512 done
  jr z,MNS1
; the sum, for the caller
  ld hl,(MNTPRV)
  ret

; IX = descriptor A of the table, copied
; into MNBUF from its block, which is
; read first if it is not already in its
; line (MNBLK). Block 0 holds 15 after
; the header, each later block 16.
; Returns Z with IX = MNBUF, or NZ if
; the
; read fails. Destroys AF, BC, DE and
; HL.
DESCIX:
  ld c,0         ; block 0, unless past
                 ; its fifteen
  sub DSCBLK0
  jr c,DX0       ; one of block 0's
  ld b,a         ; the index past block
                 ; 0's
  rrca           ; over 16: the later
                 ; block
  rrca
  rrca
  rrca
  and $0F
  inc a          ; counted from block 1
  ld c,a         ; C = the block
  ld a,b         ; and the remainder,
                 ; its slot there
  and $0F
  jr DX1         ; A = the slot

DX0:
; block 0: after the header's slot
  add a,DSCBLK0+1

DX1:
  ld l,a         ; HL = the slot * 32,
                 ; the descriptor size
  ld h,0
  add hl,hl
  add hl,hl
  add hl,hl      ; five doublings
  add hl,hl
  add hl,hl
  ld (MNBUF),hl  ; its offset in the
                 ; block, in MNBUF
  call CDI       ; while it is free
                 ; (MNBLK keeps the
  ld a,c         ; block at MNBUF+2);
                 ; the cache walked
  call MNBLK     ; with interrupts off,
                 ; as a service's
  call CEI       ; caller may have them
                 ; on
  ret nz         ; the block won't read
  ld hl,(MNBUF)  ; the descriptor's 32
                 ; bytes into MNBUF
  call MNCPH
  ld ix,MNBUF    ; IX for the fields
  xor a          ; Z
  ret

; Install the descriptor at IX as drive
; (IX+DMOUNT): its drive-table entry
; and DPH. Keeps BC and IX. Destroys AF,
; DE and HL.
MNONE:
  push bc
; the drive the descriptor names
  ld a,(ix+DMOUNT)
  push af        ; the drive, across the
                 ; entry
  call DRVENT    ; HL -> geometry byte,
                 ; entry starts 6
                 ; earlier
  ld de,-6
  add hl,de      ; HL -> the entry
  call MNFILL    ; the entry's eight
                 ; bytes
  pop af         ; the drive again, for
                 ; its DPH
; and its geometry
  ld c,(ix+DGEOM)
  call MNDPH
  pop bc         ; the caller's B
  ret

; The eight bytes of a drive-table entry
; for the descriptor at IX, at HL:
; start, length, geometry and the flags,
; with written-behind beside read-only.
; The start's four bytes and the
; length's low two follow each other in
; the
; descriptor (DSTART, DLEN), so they go
; in one LDIR. Keeps IX. Destroys A, BC
; and DE, and leaves HL at the eighth
; byte.
MNFILL:
  ex de,hl       ; DE = the entry
  push ix        ; HL = IX
  pop hl
  ld bc,DSTART   ; HL = the descriptor's
                 ; start field
  add hl,bc
  ld bc,6        ; start, then the
                 ; length's low half
  ldir
  ex de,hl       ; HL = the entry's
                 ; seventh byte
; geometry
  ld a,(ix+DGEOM)
  ld (hl),a
  inc hl         ; the eighth byte: the
                 ; drive's flags
; written behind (DCWB, bit 0): the
; drive's
  ld a,(ix+DCACHE)
  and DCWB       ; flag bit 1
  add a,a        ; bit 0 to bit 1
; beside read-only
  or (ix+DFLAGS)
  ld (hl),a
  ret

; Build drive A's DPH for geometry C: no
; XLT, zeroed scratch words, the
; shared DIRBUF, the geometry's DPB and
; CSVDUM. Leaves its ALV word, which
; ALVINIT sets. Keeps C and IX. Destroys
; AF, B, DE and HL.
MNDPH:
  call DPHADR    ; HL = this drive's DPH
  ld b,8         ; XLT and BDOS scratch
                 ; words are zero

MNZ:
  ld (hl),0
  inc hl
  djnz MNZ       ; four words
  ld de,DIRBUF   ; shared by every drive
  ld (hl),e      ; the DPH's words are
                 ; little-endian
  inc hl
  ld (hl),d
  inc hl         ; the DPB word next
  push hl        ; the DPB word's place,
                 ; across the lookup
  ld a,c
  call GEOFIND
  ld de,4        ; the entry's DPB word
  add hl,de
  ld e,(hl)      ; read through HL
  inc hl
  ld d,(hl)      ; DE = DPB
  pop hl         ; into the DPH
  ld (hl),e      ; after DIRBUF's word
  inc hl
  ld (hl),d
  inc hl
  ld de,CSVDUM   ; no directory check
                 ; vector
  ld (hl),e      ; the last word before
                 ; the ALV
  inc hl
  ld (hl),d
  ret
