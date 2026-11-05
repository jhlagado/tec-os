; The BDOS's records: sequential and
; random reads and writes, the FCB's
; fields, block allocation and zero
; fill, and a record's place on the
; disk. Included after bdosfile.asm by
; rom.asm.

; Write the DMA's record at the FCB's
; current record, CR, and move CR on:
; for function 21 and, through RANDPREP,
; functions 34 and 40. CR at 128 moves
; the FCB to its next extent first
; (ADVEXT). Takes the FCB at PARAM and
; ZEROFIL, bit 0 to zero-fill a new
; block. Returns A = 0 written, 1 with
; the directory full, 2 with the disk
; full; a disk error goes to BADSECT.
; Destroys every register, SEQREC and
; WRTYPE, and through ADVEXT TARGEX and
; TARGS2.

WRITESEQ:
  call FCBCR     ; HL at CR
  ld a,(hl)
  cp 128         ; CR 0..127: a record
                 ; in this extent
  jr c,WRITEPOS
  call ADVEXT    ; past the extent: the
                 ; next, made if new
  or a
  ret nz         ; 1: no directory entry
                 ; for it
  call FCBCR     ; CR, now 0 in the new
                 ; extent
  ld a,(hl)

; Write the DMA's record as record A of
; the FCB's extent, claiming a block for
; it when the map has none. Takes A =
; the record, 0..127, and the FCB at
; PARAM; returns as WRITESEQ.

WRITEPOS:
  ld (SEQREC),a  ; the record within the
                 ; extent
  xor a          ; write type 0: a block
                 ; already allocated
  ld (WRTYPE),a
  call FCBLOCK   ; DE = the record's
                 ; block, 0 for none
  ld a,d
  or e

; a block in the map: write to it

  jr nz,WRITEBLK
  call ALLOCBLK  ; a free block, put in
                 ; the FCB's map
  or a
  ret nz         ; 2: the disk is full
  ld a,2         ; write type 2: a block
                 ; newly allocated,
  ld (WRTYPE),a  ; so the BIOS need not
                 ; read it first
  ld a,(ZEROFIL)
  rra            ; bit 0 into carry:
                 ; function 40's fill

; every record of block DE zeroed, DE
; kept

  call c,ZEROBLK

; Write the DMA's record, SEQREC of
; block DE, with WRTYPE's write type,
; then move the FCB on. Returns A = 0; a
; disk error goes to BADSECT.

WRITEBLK:
  call POSREC    ; the BIOS on the
                 ; record's track and
                 ; sector
  ld a,(WRTYPE)
  ld c,a         ; C = the BIOS's write
                 ; type
  call BIOWRS
  or a

; nonzero: the BIOS failed the write

  jr nz,WRITEBAD
  jr ADVWRITE    ; the FCB moves on once
                 ; the record is

; written: function 45's returned error
; leaves it on that record, as CP/M 3
; does

; A failed write: the BDOS's disk I/O
; error, which does not come back.

WRITEBAD:
  jp BADSECT

; A sequential write past record 127
; moves to the next extent first, as
; CP/M 2.2's open_reel does: the write
; that needs the extent makes it. With
; the directory full that write returns
; 1 and the FCB is put back on its
; extent, record 128, so a write after
; an entry is freed makes the extent it
; needs. A close that fails, no entry
; holding the extent, returns 1 the same
; way. Takes the FCB at PARAM. Returns A
; = 0 with CR 0 in the next extent, or
; 1. Destroys every register.

ADVEXT:
  call CLOSEFCB  ; this extent's entry
                 ; brought up to date
  inc a          ; Z: the close returned
                 ; FFh
  ld a,1         ; 1: the FCB left on
                 ; record 128
  ret z
  call FCBEX
  ld e,(hl)      ; EX and S2, for a make
                 ; that fails
  inc hl
  inc hl
  ld d,(hl)      ; S2, two bytes past EX
  push de        ; kept on the stack for
                 ; EXTFULL
  call NEXTEXT   ; EX on one, the extent
                 ; opened if it exists
  or a
  jr z,EXTCLEAR  ; found: its entry's
                 ; map now in the FCB
  call MAKEFCB   ; a new directory entry
                 ; for the extent
  inc a
  jr z,EXTFULL   ; FFh: the directory is
                 ; full

; The FCB on its new extent: CR to 0.
; Takes the saved EX and S2 on the
; stack, dropped here. Returns A = 0.

EXTCLEAR:
  pop de         ; the saved EX and S2,
                 ; not needed
  call FCBCR
  xor a
  ld (hl),a      ; CR 0: the extent's
                 ; first record
  ret            ; A = 0: the extent
                 ; ready

; No room for the new extent: the FCB
; goes back to its EX and S2, saved on
; the stack, with CR still 128. Returns
; A = 1.

EXTFULL:
  call FCBEX
  pop de         ; E = the old EX, D =
                 ; the old S2
  ld (hl),e
  inc hl
  inc hl
  ld (hl),d      ; both put back
  ld a,1         ; 1: the directory is
                 ; full
  ret

; A record written: CR on one, RC raised
; to CR when CR passes it, and the FCB
; marked changed, S2's bit 7 clear, for
; close to write its entry. Takes the
; FCB at PARAM. Returns A = 0; destroys
; B, DE, HL, F.

ADVWRITE:
  call FCBCR
  inc (hl)       ; CR on to the next
                 ; record
  ld a,(hl)
  ld b,a         ; B = the new CR
  ld de,15
  call FCBOFF    ; HL at RC, the
                 ; extent's record count
  cp (hl)
  jr c,WRITERC   ; CR below RC: the
                 ; count stands
  ld (hl),b      ; else the extent now
                 ; holds CR records

WRITERC:
  dec hl         ; S2, the byte before
                 ; RC
  ld a,(hl)
  and $7F        ; bit 7 clear: the FCB
                 ; has changed
  ld (hl),a
  xor a          ; 0: written
  ret

; Function 20, read sequential: the
; FCB's next record into the DMA, and
; READSEQ's result returned to the
; program.

FNREADSQ:
  call READSEQ
  jp RETA        ; A to the program in A
                 ; and HL

; Read the FCB's current record, CR,
; into the DMA and move CR on. CR at 128
; moves the FCB to its next extent
; first. Takes the FCB at PARAM. Returns
; A = 0 read, 1 at the end of the file;
; a disk error goes to BADSECT. Destroys
; every register and SEQREC.

READSEQ:
  call FCBCR     ; HL at CR
  ld a,(hl)
  cp 128         ; CR 0..127: a record
                 ; in this extent
  jr c,READCHK

; Close before moving on, as CP/M 2.2's
; open_reel does: the reopen replaces
; the allocation map, so blocks written
; through this FCB since its open must
; reach the directory first.

  call CLOSEFCB
  inc a
  jr z,READ_EOF  ; FFh: the close failed
  call NEXTEXT   ; the next extent,
                 ; opened
  or a

; none on the disk: the file ends

  jr nz,READ_EOF
  call FCBCR
  xor a
  ld (hl),a      ; CR 0 in the new
                 ; extent

; Read record CR of the FCB's extent, HL
; at CR, if the extent's record count
; and its allocation map hold it.
; Returns as READSEQ.

READCHK:
  ld a,(hl)
  ld (SEQREC),a  ; the record within the
                 ; extent
  ld b,a
  ld de,15
  call FCBOFF    ; HL at RC, the
                 ; extent's record count
  ld a,(hl)
  cp b
  jr z,READ_EOF  ; RC = CR: past the
                 ; last record written
  jr c,READ_EOF  ; RC below CR: past it
                 ; too
  call FCBLOCK   ; DE = the record's
                 ; block
  ld a,d
  or e
  jr z,READ_EOF  ; no block in the map:
                 ; read as the end
  call POSREC    ; the BIOS on the
                 ; record's track and
                 ; sector
  call BIORDS
  or a
  jp nz,BADSECT  ; returned: the FCB on
                 ; the record unread
  call FCBCR     ; read: CR on to the
                 ; next record
  inc (hl)
  xor a          ; 0: read
  ret

; The end of the file, or a record not
; yet written: A = 1.

READ_EOF:
  ld a,1         ; 1: no record read
  ret

; Function 33, read random: record r0-r1
; of the FCB into the DMA, CR left on
; it. Returns A = 0, 1 for a record not
; written, 3 when the extent left cannot
; be closed, 4 for an extent not
; written, 6 past record 65535.

FNRREAD:
  xor a          ; ZEROFIL 0: a read
  ld (ZEROFIL),a
  call RANDPREP  ; the FCB on the
                 ; record's extent and
                 ; record
  jr c,RANDRET   ; carry: A = the error
  call READSEQ   ; the record read, CR
                 ; moved on
  jr RANDDONE

; ZEROFIL is zero for reads and
; sequential writes. Random writes set
; bit 7, which marks a write for
; RANDMISS, and function 40 also sets
; bit 0 to zero-fill each newly
; allocated block. Function 34, write
; random: the DMA's record to record
; r0-r1 of the FCB, CR left on it.
; Returns as function 40.

FNRWRITE:
  ld a,$80       ; a write, no zero fill
  jr RANDWRT

; Function 40, write random with zero
; fill: as function 34, but a block
; newly claimed for the record has every
; record zeroed first. Returns A = 0, 2
; with the disk full, 3 when the extent
; left cannot be closed, 5 with the
; directory full, 6 past record 65535.

FNWRZERO:
  ld a,$81       ; a write, with zero
                 ; fill

; A random write in ZEROFIL's mode, A: a
; read-only drive or file goes no
; further (ROFCB); the record written
; and the result returned as function
; 40.

RANDWRT:
  ld (ZEROFIL),a
  call ROFCB     ; R/O drive or file: an
                 ; error, no return
  call RANDPREP  ; the FCB on the
                 ; record's extent and
                 ; record
  jr c,RANDRET   ; carry: A = the error
  call WRITESEQ  ; the record written,
                 ; CR moved on

; The end of a random read or write: CR
; back on the record, SEQREC, as CP/M
; leaves it, and A, the result, returned
; to the program.

RANDDONE:
  push af        ; the result
  call FCBCR
  ld a,(SEQREC)
  ld (hl),a      ; CR back on the record
                 ; read or written
  pop af

; Return A, a random read's or write's
; result, to the program.

RANDRET:
  jp RETA

; Put the FCB on the extent that holds
; its random record, r0-r2, and CR on
; the record within it; an extent not on
; the disk is made for a write. Takes
; the FCB at PARAM and ZEROFIL, nonzero
; for a write. Returns no carry and A =
; 0, or carry and A = 3 (the extent left
; cannot be closed), 4 (a read of an
; extent not written), 5 (the directory
; full) or 6 (past record 65535).
; Destroys every register, SEQREC,
; TARGEX and TARGS2.

RANDPREP:
  call FCBCR
  inc hl
  ld c,(hl)      ; C = r0
  inc hl
  ld d,(hl)      ; D = r1
  inc hl
  ld e,(hl)      ; E = r2
  ld a,e         ; CP/M 2.2 records
                 ; 0..65535; r2 is
                 ; overflow
  or a
  ld a,6         ; 6: past the last
                 ; record

; reject before changing any FCB field

  jr nz,RANDFAIL
  ld a,c
  and $7F        ; r0's low seven bits:
                 ; the record in its
                 ; extent
  ld (SEQREC),a

  ld a,c
  rlca           ; r0 bit 7 becomes EX
                 ; bit 0
  ld a,d
  rla            ; EX = the record /
                 ; 128,
  and $1F        ; in EX's five bits
  ld (TARGEX),a

  ld a,d         ; S2 = the record /
                 ; 4096: r1's top four
  rrca           ; bits, r2 being zero,
                 ; proved above
  rrca
  rrca
  rrca
  and $0F        ; the module
  ld (TARGS2),a

  call FCBEX
  ld a,(hl)
  and $1F        ; the FCB's EX
  ld b,a
  ld a,(TARGEX)
  cp b

; another extent: close this, open that

  jr nz,RANDOPEN
  inc hl
  inc hl
  ld a,(hl)
  and $3F        ; the FCB's S2, less
                 ; its flag bits
  ld b,a
  ld a,(TARGS2)
  cp b
  jr z,RANDPOS   ; the same extent: only
                 ; CR to set

; Leaving an extent closes it first, so
; its directory entry keeps the record
; count and blocks written through this
; FCB. The FCB then takes TARGEX and
; TARGS2, which keep its own EX and S2
; (EXSWAP), and opens that extent, going
; to RANDMISS when it is not on the
; disk. An open sets S2's bit 7.

RANDOPEN:
  call CLOSEFCB
  inc a          ; Z: the close returned
                 ; FFh
  ld a,3         ; 3: the extent cannot
                 ; be closed
  jr z,RANDFAIL
  call EXSWAP    ; EX and S2 the
                 ; record's, the old
                 ; kept
  call NEXTFIND  ; open the extent: its
                 ; entry into the FCB
  or a

; no entry for it on the disk

  jr nz,RANDMISS

; The FCB on the record's extent: CR =
; SEQREC. Returns no carry and A = 0.

RANDPOS:
  call FCBCR
  ld a,(SEQREC)
  ld (hl),a      ; CR on the record
  xor a          ; 0 and no carry: ready
  ret

; A read of an extent that was never
; made returns 4. A write makes the
; extent, as CP/M does, and returns 5
; when the directory is full. Either
; failure puts the FCB's EX and S2 back
; (EXSWAP), so they name the extent its
; RC and map still describe, and the
; next call opens the record's extent
; again. Returns as RANDPREP.

RANDMISS:
  ld a,(ZEROFIL)
  or a           ; zero: a read
  ld a,4         ; 4: a read of an
                 ; extent not written
  jr z,RANDBACK
  call MAKEFCB   ; a new directory entry
                 ; for the extent
  inc a
  jr nz,RANDPOS  ; made: on to the
                 ; record
  ld a,5         ; FFh: 5, the directory
                 ; is full

RANDBACK:
  ld b,a         ; the error, kept over
                 ; the swap
  call EXSWAP    ; the FCB's own EX and
                 ; S2 back
  ld a,b

; A random record refused: carry, with A
; = the error code.

RANDFAIL:
  scf            ; carry: A is an error,
                 ; the FCB not ready
  ret

; The FCB's EX and S2 exchanged with
; TARGEX and TARGS2, which follow each
; other in memory: the FCB on the extent
; RANDPREP found, or back on its own.
; Takes the FCB at PARAM. Changes A, C,
; DE, HL; keeps B.

EXSWAP:
  call FCBEX     ; HL at EX
  ld de,TARGEX
  call SWAPB     ; EX with TARGEX
  inc hl         ; past S1 to S2, with
                 ; TARGS2

; The byte at HL exchanged with the byte
; at DE, and both moved on one. Changes
; A, C, DE, HL.

SWAPB:
  ld a,(de)
  ld c,(hl)
  ld (hl),a      ; one way
  ld a,c
  ld (de),a      ; and the other
  inc hl
  inc de
  ret

; Return in DE the block that holds
; record SEQREC of the FCB's extent, 0
; for none. A map cell is one byte when
; DSM is below 256 and two otherwise.
; Takes the FCB at PARAM. Returns HL at
; the cell's last byte and IX = the DPB;
; destroys A, BC, F.

FCBLOCK:
  call FCBADDR   ; HL at the record's
                 ; map cell
  ld e,(hl)      ; the block's low byte
  ld d,0
  ld ix,(DPBPTR)
  ld a,(ix+6)    ; DSM's high byte
  or a
  ret z          ; DSM below 256: a
                 ; one-byte cell
  inc hl
  ld d,(hl)      ; the high byte of a
                 ; two-byte cell
  ret

; Return HL at the FCB's CR, its current
; record, byte 32. Destroys DE and the
; carry.

FCBCR:
  ld de,32       ; CR's offset in the
                 ; FCB
  jr FCBOFF

; Return HL at the FCB's EX, its extent,
; byte 12. Destroys DE and the carry.

FCBEX:
  ld de,12       ; EX's offset in the
                 ; FCB

; Return HL at byte DE of the program's
; FCB, at PARAM. Keeps A, BC and DE;
; destroys the carry.

FCBOFF:
  ld hl,(PARAM)  ; the FCB the program
                 ; passed in DE
  add hl,de
  ret

; Return the allocation-map cell for
; SEQREC in HL. The record's place in
; the entry is (EX AND EXM) * 128 +
; SEQREC, shifted right by BSH. Takes
; the FCB at PARAM; BSH is at least 1.
; Destroys A, BC, DE, F.

FCBADDR:

; the drive's DPB: BSH at 2, EXM at 4

  ld hl,(DPBPTR)
  inc hl
  inc hl
  ld b,(hl)      ; BSH
  inc hl
  inc hl
  ld c,(hl)      ; EXM
  call FCBEX
  ld a,(hl)
  and c          ; the extent's place
                 ; among the entry's
  ld h,a
  ld a,(SEQREC)
  add a,a
  ld l,a         ; HL = that place * 256
                 ; + SEQREC * 2
  srl h          ; HL = extent in entry
                 ; * 128 + SEQREC
  rr l

RECSHFT:
  srl h          ; one shift for each
                 ; bit of BSH: the
  rr l           ; record's block within
                 ; the entry
  djnz RECSHFT
  ld a,l         ; A = that block's
                 ; index in the map

BLOCKIDX:
  ld c,a
  ld hl,(DPBPTR)
  ld de,6
  add hl,de
  ld a,(hl)      ; DSM's high byte
  or a
  ld a,c
  jr z,BLOCKBYT  ; one-byte cells: the
                 ; index is the offset
  add a,a        ; two-byte cells: twice
                 ; the index

BLOCKBYT:
  ld e,a
  ld d,0
  ld hl,(PARAM)
  ld bc,16       ; the map from FCB byte
                 ; 16
  add hl,bc
  add hl,de      ; HL at the cell
  ret

; Claim the first free block through the
; BIOS-owned allocation vector, publish
; it in the current FCB allocation cell,
; and return the block in DE. The cell
; is SEQREC's in the FCB's extent, and
; the drive is marked changed in its DPH
; byte 4. Returns A = 0, or A = 2 with
; no block free. Destroys BC, HL, F;
; leaves IX = the DPB.

ALLOCBLK:

; the vector: a bit for each block, bit
; 7

  ld hl,(ALVPTR)

; of the first byte for block 0

  ld ix,(DPBPTR)
  ld de,0        ; DE = the block the
                 ; bit stands for
  ld c,$80       ; C = its bit in the
                 ; byte at HL

ALLOCLOP:
  ld a,(hl)
  and c
  jr z,ALFOUND   ; clear: the block is
                 ; free
  ld a,d
  cp (ix+6)
  jr nz,ALNEXT   ; not yet DSM, the last
                 ; block
  ld a,e
  cp (ix+5)
  jr z,ALFULL    ; DSM itself in use: no
                 ; block free

ALNEXT:
  inc de         ; the next block
  srl c

; its bit in the same byte

  jr nz,ALLOCLOP
  inc hl
  ld c,$80       ; or bit 7 of the next
                 ; byte
  jr ALLOCLOP

; Block DE is free: its bit set, the
; drive marked changed, and the block
; written in the FCB's map cell for
; SEQREC, the FCB marked changed (S2's
; bit 7 clear) at once, so that close
; writes the entry that holds the block
; even when the record's write then
; fails. Returns A = 0.

ALFOUND:
  ld a,(hl)
  or c           ; the block now in use
  ld (hl),a

; TEC-OS: the vector changed, the drive

  ld hl,(DPHPTR)
  inc hl         ; dirty
  inc hl
  inc hl
  inc hl
  ld (hl),1      ; its byte 4 set: the
                 ; vector changed
  push de        ; the block, kept
                 ; through FCBADDR
  ld de,14       ; S2's bit 7 clear: the
                 ; FCB's map has
  call FCBOFF    ; changed
  res 7,(hl)
  call FCBADDR   ; HL at the record's
                 ; map cell
  pop de
  ld (hl),e      ; the block's low byte
  ld a,(ix+6)
  or a
  jr z,ALLOCDON  ; DSM below 256: a
                 ; one-byte cell
  inc hl
  ld (hl),d      ; the high byte of a
                 ; two-byte cell

ALLOCDON:
  xor a          ; 0: a block claimed
  ret

; Every block through DSM in use: A = 2,
; the disk full.

ALFULL:
  ld a,2         ; 2: no block free
  ret

; CP/M function 40 clears a newly
; allocated block before publishing the
; caller's target record. The BIOS
; directory buffer is reusable scratch
; here. Takes DE = the block and SEQREC
; = the target record. Writes 128 zero
; bytes to each of the block's records,
; the BIOS's DMA on them for each write
; and back on CURDMA after it (DMABACK),
; so a failed write that function 45
; returns leaves the program's DMA in
; the BIOS. Returns DE = the block and
; SEQREC as it was; a disk error goes to
; BADSECT. Destroys A, BC, HL, IX, F,
; and TARGEX, ALLEFT and ZEROBN, used as
; scratch, and through POSREC IOTRK and
; IOSEC.

ZEROBLK:

; the block, kept through POSREC

  ld (ZEROBN),de
  ld a,(SEQREC)
  ld (TARGEX),a  ; the target record,
                 ; kept in TARGEX
  ld hl,(DIRPTR)
  ld (hl),0      ; the directory
                 ; buffer's first byte
                 ; zero,
  ld d,h
  ld e,l
  inc de         ; copied on through the
                 ; rest:
  ld bc,127
  ldir           ; 128 zero bytes
  ld ix,(DPBPTR)
  ld a,(ix+3)    ; BLM: the records in a
                 ; block, less one
  inc a
  ld (ALLEFT),a  ; ALLEFT counts the
                 ; records to write
  dec a
  cpl            ; NOT BLM: the mask for
                 ; a block's start
  ld b,a
  ld a,(SEQREC)
  and b          ; the block's first
                 ; record in the extent
  ld (SEQREC),a

ZEROLOOP:
  ld de,(ZEROBN)
  call POSREC    ; the BIOS on record
                 ; SEQREC of the block
  ld hl,(DIRPTR)
  ld b,h
  ld c,l
  call BIODMA    ; the BIOS's DMA on the
                 ; zeros
  ld c,2         ; write type 2: a block
                 ; newly allocated
  call BIOWRS
  call DMABACK   ; the DMA back; a
                 ; failed write: error 1
  ld a,(SEQREC)
  inc a
  ld (SEQREC),a  ; the block's next
                 ; record
  ld a,(ALLEFT)
  dec a
  ld (ALLEFT),a

; until every record of the block is
; zero

  jr nz,ZEROLOOP
  ld a,(TARGEX)
  ld (SEQREC),a  ; the target record
                 ; back

; DE = the block, as on entry

  ld de,(ZEROBN)
  ret

; Position the BIOS at SEQREC within
; allocation block DE: the track and the
; sector set through the BIOS, the
; sector translated by the drive's XLT.
; A block past DSM goes to BADSECT.
; Leaves the track, OFF added, in IOTRK
; and the untranslated sector in IOSEC.
; Destroys A, BC, DE, HL, IX, F.

POSREC:
  call CHKBLK    ; a block past DSM is a
                 ; disk error
  ex de,hl       ; HL = the block

; the drive's DPB: BSH at 2

  ld de,(DPBPTR)
  inc de
  inc de
  ld a,(de)      ; BSH
  ld b,a
  ld a,b
  or a
  jr z,BLOCKSCA  ; BSH 0: no shift

BLOCKSHF:
  add hl,hl      ; the block's first
                 ; record: the block
  djnz BLOCKSHF  ; shifted left by BSH

BLOCKSCA:

; the DPB again: BLM at 3

  ld de,(DPBPTR)
  inc de
  inc de
  inc de
  ld a,(de)      ; BLM
  ld b,a
  ld a,(SEQREC)
  and b          ; SEQREC's record
                 ; within the block
  ld e,a
  ld d,0
  add hl,de      ; HL = the record from
                 ; the data's start

  ld ix,(DPBPTR)
  ld e,(ix+0)
  ld d,(ix+1)    ; DE = SPT, the sectors
                 ; on a track
  call DIV16     ; DE = the track, HL =
                 ; the sector
  ld (IOSEC),hl  ; the sector before
                 ; translation
  ex de,hl
  ld e,(ix+13)
  ld d,(ix+14)   ; OFF, the reserved
                 ; tracks
  add hl,de      ; the track on the disk
  ld (IOTRK),hl

  ld b,h
  ld c,l
  call BIOTRK    ; the BIOS on track BC
  ld hl,(IOSEC)
  ld b,h
  ld c,l
  ld de,(XLTPTR)
  call BIOTRN    ; HL = sector BC
                 ; translated through
                 ; XLT
  ld b,h
  ld c,l
  jp BIOSEC      ; the BIOS on that
                 ; sector

; HL div DE in DE, HL mod DE in HL,
; unsigned, for DE from 1 to 8000h: the
; remainder then never passes 16 bits.
; A:C shifts the dividend out and the
; quotient in, each bit a shift behind
; its trial subtraction. Returns A = D;
; destroys F, BC.

DIV16:
  ld a,h
  ld c,l         ; A:C = the dividend
  ld hl,0        ; HL = the remainder,
                 ; from 0
  ld b,16        ; one pass for each bit

DIV16L:
  rl c           ; the last quotient bit
                 ; in, the
  rla            ; dividend's next bit
                 ; out to carry
  adc hl,hl      ; and on into the
                 ; remainder
  sbc hl,de      ; no carry in: HL < DE
                 ; before the shift
  jr nc,DIV16S   ; no borrow: DE fits,
                 ; the bit is 1
  add hl,de      ; and carry out

DIV16S:
  ccf            ; carry = the quotient
                 ; bit
  djnz DIV16L
  rl c           ; the last quotient bit
                 ; in
  rla
  ld d,a
  ld e,c         ; DE = the quotient
  ret

; Move the FCB to its next extent and
; open it: EX on one, and past 31 back
; to 0 with S2, the module, on one, its
; bit 7 kept. Takes the FCB at PARAM.
; Returns A = 0 with the entry's fields
; in the FCB, or A = 1 with no entry for
; the extent. Destroys every register.

NEXTEXT:
  call FCBEX
  ld a,(hl)
  inc a
  and $1F        ; EX on one, 31
                 ; wrapping to 0
  ld (hl),a

; no wrap: S2 stands

  jr nz,NEXTFIND
  inc hl
  inc hl
  ld a,(hl)      ; S2
  ld b,a
  and $3F
  inc a
  and $3F        ; the module on one, in
                 ; six bits
  ld c,a
  ld a,b
  and $80        ; with S2's bit 7 kept
  or c
  ld (hl),a

; Open the FCB's extent as its EX and S2
; stand: the directory searched in mode
; 1, open, a match's fields copied into
; the FCB. Takes the FCB at PARAM.
; Returns A = 0 found, 1 not; destroys
; every register.

NEXTFIND:
  ld hl,(PARAM)

; the search's FCB: the program's

  ld (SRCHFCB),hl
  ld a,1         ; mode 1: open, the
                 ; entry into the FCB
  ld (OPENMOD),a
  call NEWSRCH   ; from the directory's
                 ; first entry
  call FINDENT
  cp $FF
  jr z,NEXTMISS  ; FFh: no entry
  xor a          ; 0: the extent open
  ret

; No directory entry for the extent: A =
; 1.

NEXTMISS:
  ld a,1         ; 1: not found
  ret
