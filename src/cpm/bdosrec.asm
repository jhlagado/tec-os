; Sequential and random record I/O, FCB
; fields, block allocation, zero fill
; and disk positioning. PARAM holds the
; active FCB address.

; Write DMA data at the FCB's CR and
; advance CR after a successful write.
; Used by functions 21, 34 and 40.
; CR=128 advances to the next extent
; first.
; PARAM = FCB address. ZEROFIL bit 0
; requests zeroing of a new block.
; Returns A=0 written, 1 directory full
; or failed close, 2 disk full. Disk
; errors take BADSECT.
; Clobbers every register, SEQREC and
; WRTYPE. ADVEXT also clobbers
; TARGEX/TARGS2.

WRITESEQ:
  call FCBCR     ; HL at CR
  ld a,(hl)
  cp 128         ; CR 0..127: a record
                 ; in this extent
  jr c,WRITEPOS
  call ADVEXT    ; open/make next extent
  or a
  ret nz         ; 1: no directory entry
                 ; for it
  call FCBCR     ; new extent's CR=0
  ld a,(hl)

; Write DMA data to record A, 0..127, of
; PARAM's FCB extent. Allocate a block
; if its map cell is empty. Returns as
; WRITESEQ.

WRITEPOS:
  ld (SEQREC),a  ; record within extent
  xor a          ; type 0: existing
                 ; block
  ld (WRTYPE),a
  call FCBLOCK   ; DE: block, 0 if none
  ld a,d
  or e

  jr nz,WRITEBLK
  call ALLOCBLK  ; allocate/map block
  or a
  ret nz         ; 2: the disk is full
  ld a,2         ; type 2: new block
  ld (WRTYPE),a  ; skip BIOS preread
  ld a,(ZEROFIL)
  rra            ; carry: zero fill

; Zero all records in block DE when
; requested. ZEROBLK preserves DE.

  call c,ZEROBLK

; Write DMA data to record SEQREC in
; block DE using WRTYPE.
; Success advances CR and returns A = 0.
; A failed write leaves CR on that
; record and takes BADSECT. ERRMODE, set
; by function 45, selects return to the
; program or warm-boot abort.

WRITEBLK:
  call POSREC    ; set BIOS position
  ld a,(WRTYPE)
  ld c,a         ; BIOS write type
  call BIOWRS
  or a

  jr nz,WRITEBAD
  jr ADVWRITE    ; advance after success

; BADSECT does not return here.

WRITEBAD:
  jp BADSECT

; Advance PARAM's FCB past CR=128. Close
; the old extent before opening or
; making the next one.
; Returns A=0 with CR=0 in the next
; extent. A failed close or full
; directory returns A=1 with the old
; EX/S2 and CR=128 so a later write can
; retry.
; Clobbers every register.

ADVEXT:
  call CLOSEFCB  ; publish old extent
  inc a          ; Z: close returned FFh
  ld a,1         ; failure: keep CR128
  ret z
  call FCBEX
  ld e,(hl)      ; save old EX/S2
  inc hl
  inc hl
  ld d,(hl)      ; S2 is EX+2
  push de        ; for failed make
  call NEXTEXT   ; open next extent
  or a
  jr z,EXTCLEAR  ; found: map in FCB
  call MAKEFCB   ; make missing extent
  inc a
  jr z,EXTFULL   ; FFh: directory full

; Next extent ready: set CR=0 and return
; A=0. Pop the saved EX/S2 word without
; restoring it.

EXTCLEAR:
  pop de         ; discard saved EX/S2
  call FCBCR
  xor a
  ld (hl),a      ; first extent record
  ret            ; A=0: extent ready

; No new directory entry: restore EX/S2
; from the saved stack word. CR remains
; 128. Return A=1.

EXTFULL:
  call FCBEX
  pop de         ; E: old EX, D: old S2
  ld (hl),e
  inc hl
  inc hl
  ld (hl),d      ; both put back
  ld a,1         ; directory full
  ret

; After a successful write, increment CR
; and raise RC if needed. Clear S2 bit 7
; so close publishes the changed FCB.
; PARAM = FCB address. Returns A=0.
; Clobbers B, DE, HL and F.

ADVWRITE:
  call FCBCR
  inc (hl)       ; next CR
  ld a,(hl)
  ld b,a         ; B = the new CR
  ld de,15
  call FCBOFF    ; RC: record count
  cp (hl)
  jr c,WRITERC   ; RC already higher
  ld (hl),b      ; raise RC to new CR

WRITERC:
  dec hl         ; S2 precedes RC
  res 7,(hl)     ; mark FCB changed
  xor a          ; 0: written
  ret

; Function 20: read the FCB's next
; record into DMA. Return READSEQ's
; result through RETA.

FNREADSQ:
  call READSEQ
  ret            ; A result in A and HL

; Read PARAM's FCB record CR into DMA.
; Advance CR after a successful read.
; CR=128 closes and opens the next
; extent first. Returns A=0 read, 1 with
; no record read. A=1 includes failed
; close, absent extent, RC exhaustion or
; a missing map cell.
; Disk errors take BADSECT. Clobbers
; every register and SEQREC.

READSEQ:
  call FCBCR     ; HL at CR
  ld a,(hl)
  cp 128         ; record in this extent
  jr c,READCHK

; Close before reopen replaces the map.
; Publish this FCB's new blocks and
; record count to the directory first.

  call CLOSEFCB
  inc a
  jr z,READ_EOF  ; FFh: the close failed
  call NEXTEXT   ; open next extent
  or a

; No next extent on disk.

  jr nz,READ_EOF
  call FCBCR
  xor a
  ld (hl),a      ; first extent record

; Read CR with HL at that field,
; checking RC and the allocation map
; first. Returns as READSEQ.

READCHK:
  ld a,(hl)
  ld (SEQREC),a  ; record within extent
  ld b,a
  ld de,15
  call FCBOFF    ; HL at RC, the
                 ; extent's record count
  ld a,(hl)      ; RC
  cp b
  jr z,READ_EOF  ; CR at record count
  jr c,READ_EOF  ; CR exceeds count
  call FCBLOCK   ; DE: mapped block
  ld a,d
  or e
  jr z,READ_EOF  ; no block: no record
  call POSREC    ; set BIOS position
  call BIORDS
  or a
  jp nz,BADSECT  ; error: keep CR
  call FCBCR     ; read: advance CR
  inc (hl)
  xor a          ; 0: read
  ret

; Return A=1 with no record read.

READ_EOF:
  ld a,1         ; 1: no record read
  ret

; Function 33: read FCB random record
; r0-r1 into DMA. Returns A=0 read, 1
; unwritten record, 3 failed close, 4
; absent extent or 6 past record 65535.
; After successful preparation, any
; ordinary read return restores CR to
; SEQREC.

FNRREAD:
  xor a          ; ZEROFIL 0: a read
  ld (ZEROFIL),a
  call RANDPREP  ; prepare random record
  jr c,RANDRET   ; carry: A = the error
  call READSEQ   ; read and advance CR
  jr RANDDONE

; Function 34: write DMA data to FCB
; random record r0-r1. Returns as
; function 40.
; ZEROFIL=0 for reads/sequential writes.
; Random writes set bit 7 for RANDMISS.
; Function 40 also sets bit 0 to zero
; each newly allocated block.

FNRWRITE:
  ld a,$80       ; a write, no zero fill
  jr RANDWRT

; Function 40: random write with every
; record of a new block zeroed first.
; Returns A=0 written, 2 disk full, 3
; failed close, 5 directory full or 6
; past record 65535. CR restoration
; follows RANDDONE after any ordinary
; operation return.

FNWRZERO:
  ld a,$81       ; write with zero fill

; Write in mode A through ZEROFIL. ROFCB
; handles read-only drive/file errors
; without returning here. Prepare the
; target, write it and return the result
; through RANDDONE/RANDRET.

RANDWRT:
  ld (ZEROFIL),a
  call ROFCB     ; read-only error path
  call RANDPREP  ; prepare random record
  jr c,RANDRET   ; carry: A = the error
  call WRITESEQ  ; write and advance CR

; After RANDPREP succeeds, a returning
; READSEQ/WRITESEQ operation reaches
; this tail even with ordinary nonzero
; A. Restore CR to SEQREC and return A
; unchanged to the program.

RANDDONE:
  push af        ; the result
  call FCBCR
  ld a,(SEQREC)
  ld (hl),a      ; restore requested CR
  pop af

; Return random-operation result A to
; the program through RETA.

RANDRET:
  ret

; Prepare FCB random record r0-r2:
; select its extent and set CR. A write
; makes an absent extent. PARAM = FCB
; address. ZEROFIL is nonzero for a
; write.
; Carry clear/A=0: ready. Carry set: A=3
; failed close, 4 absent read extent, 5
; directory full or 6 past record 65535.
; Clobbers every register, SEQREC,
; TARGEX and TARGS2.

RANDPREP:
  call FCBCR
  inc hl
  ld c,(hl)      ; C = r0
  inc hl
  ld d,(hl)      ; D = r1
  inc hl
  ld e,(hl)      ; E = r2
  ld a,e         ; r2 must be zero
  or a
  ld a,6         ; past record 65535

; Reject before changing FCB fields.

  jr nz,RANDFAIL
  ld a,c
  and $7F        ; record within extent
  ld (SEQREC),a

  ld a,c
  rlca           ; r0 bit 7 to EX bit 0
  ld a,d
  rla            ; record / 128
  and $1F        ; in EX's five bits
  ld (TARGEX),a

  ld a,d         ; record / 4096
  rrca           ; r1 high4, r2=0
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

; Different extent: close and reopen.

  jr nz,RANDOPEN
  inc hl
  inc hl
  ld a,(hl)
  and $3F        ; S2 without flags
  ld b,a
  ld a,(TARGS2)
  cp b
  jr z,RANDPOS   ; same extent: set CR

; Close first to publish the old FCB's
; RC and map. EXSWAP puts the requested
; EX/S2 in the FCB and saves the old
; identity in TARGEX/TARGS2. Open the
; requested extent or continue at
; RANDMISS. Open sets S2 bit 7.

RANDOPEN:
  call CLOSEFCB
  inc a          ; Z: close returned FFh
  ld a,3         ; failed close
  jr z,RANDFAIL
  call EXSWAP    ; swap old/target ID
  call NEXTFIND  ; open target into FCB
  or a

; Target extent has no directory entry.

  jr nz,RANDMISS

; Set CR=SEQREC. Return carry clear and
; A=0 with the target extent ready.

RANDPOS:
  call FCBCR
  ld a,(SEQREC)
  ld (hl),a      ; CR on the record
  xor a          ; 0 and no carry: ready
  ret

; Absent extent: a read returns 4. A
; write makes the extent or returns 5
; for a full directory.
; On either failure, EXSWAP restores the
; old EX/S2 to match the surviving
; RC/map, so a later call opens the
; target again. Returns as RANDPREP.

RANDMISS:
  ld a,(ZEROFIL)
  or a           ; zero: a read
  ld a,4         ; absent read extent
  jr z,RANDBACK
  call MAKEFCB   ; make target extent
  inc a
  jr nz,RANDPOS  ; made: set target CR
  ld a,5         ; FFh: directory full

RANDBACK:
  ld b,a         ; save error for swap
  call EXSWAP    ; restore old EX/S2
  ld a,b

; Return carry set with error code A.

RANDFAIL:
  scf            ; target not ready
  ret

; Swap PARAM's FCB EX/S2 with adjacent
; TARGEX/TARGS2. Used to select the
; requested extent or restore its
; predecessor.
; Keeps B. Clobbers A, C, DE and HL.

EXSWAP:
  call FCBEX     ; HL at EX
  ld de,TARGEX
  call SWAPB     ; EX with TARGEX
  inc hl         ; skip S1 to S2

; Swap bytes at HL and DE, then advance
; both pointers.
; Clobbers A, C, DE and HL.

SWAPB:
  ld a,(de)
  ld c,(hl)
  ld (hl),a
  ld a,c         ; old HL byte from C
  ld (de),a
  inc hl
  inc de
  ret

; Return DE = SEQREC's allocation block
; in PARAM's FCB extent or 0 for none.
; DSM<256 uses one-byte map cells,
; otherwise two. HL points to the cell's
; last byte. IX = DPB.
; Clobbers A, BC and F.

FCBLOCK:
  call FCBADDR   ; map cell address
  ld e,(hl)      ; the block's low byte
  ld d,0
  ld ix,(DPBPTR)
  ld a,(ix+6)    ; DSM's high byte
  or a
  ret z          ; one-byte map cell
  inc hl
  ld d,(hl)      ; high byte of block
  ret

; Return HL at PARAM FCB byte 32, CR.
; Clobbers DE and carry.

FCBCR:
  ld de,32       ; CR offset
  jr FCBOFF

; Return HL at PARAM FCB byte 12, EX.
; Clobbers DE and carry.

FCBEX:
  ld de,12       ; EX offset

; Return HL at offset DE in PARAM's FCB.
; Keeps A, BC and DE. Carry changes.

FCBOFF:
  ld hl,(PARAM)  ; program FCB address
  add hl,de
  ret

; Return HL at SEQREC's allocation-map
; cell in PARAM's FCB. Block index =
; ((EX AND EXM)*128 + SEQREC) >> BSH.
; Requires BSH>=1. Clobbers A, BC, DE
; and F.

FCBADDR:

; DPB offsets: BSH=2, EXM=4.

  ld hl,(DPBPTR)
  inc hl
  inc hl
  ld b,(hl)      ; BSH
  inc hl
  inc hl
  ld c,(hl)      ; EXM
  call FCBEX
  ld a,(hl)
  and c          ; extent within entry
  ld h,a
  ld a,(SEQREC)
  add a,a
  ld l,a         ; twice record index
  srl h          ; extent*128 + SEQREC
  rr l

RECSHFT:
  srl h          ; divide by block size
  rr l
  djnz RECSHFT
  ld a,l         ; block index in map

BLOCKIDX:
  ld c,a
  ld hl,(DPBPTR)
  ld de,6
  add hl,de
  ld a,(hl)      ; DSM's high byte
  or a
  ld a,c
  jr z,BLOCKBYT  ; one-byte cell offset
  add a,a        ; two-byte cell offset

BLOCKBYT:
  ld e,a
  ld d,0
  ld hl,(PARAM)
  ld bc,16       ; FCB map offset 16
  add hl,bc
  add hl,de      ; HL at the cell
  ret

; Allocate the first free block from the
; BIOS-provided allocation vector.
; Publish it in PARAM's FCB map cell for
; SEQREC and mark DPH byte 4 changed.
; Returns A=0, DE=block, IX=DPB. A=2: no
; free block. Clobbers BC, HL and F.

ALLOCBLK:

; Allocation vector: bit 7 of its first
; byte represents block 0.

  ld hl,(ALVPTR)

  ld ix,(DPBPTR)
  ld de,0        ; block represented
  ld c,$80       ; bit for block DE

ALLOCLOP:
  ld a,(hl)
  and c
  jr z,ALFOUND   ; clear bit: free block
  ld a,d
  cp (ix+6)
  jr nz,ALNEXT   ; below DSM
  ld a,e
  cp (ix+5)
  jr z,ALFULL    ; DSM already in use

ALNEXT:
  inc de         ; the next block
  srl c

  jr nz,ALLOCLOP
  inc hl
  ld c,$80       ; next byte, bit 7
  jr ALLOCLOP

; Publish allocated block DE in the FCB
; map and clear S2 bit 7 immediately.
; Mark its allocation bit and DPH byte 4
; changed. A later close must publish
; this allocation even if the record
; write fails. Returns A=0.

ALFOUND:
  ld a,(hl)
  or c           ; the block now in use
  ld (hl),a

  ld hl,(DPHPTR) ; DPH base for byte 4
  inc hl
  inc hl
  inc hl
  inc hl
  ld (hl),1      ; allocation changed
  push de        ; save block number
  ld de,14       ; S2 dirty bit
  call FCBOFF    ; FCB map changed
  res 7,(hl)
  call FCBADDR   ; record map cell
  pop de
  ld (hl),e      ; the block's low byte
  ld a,(ix+6)
  or a
  jr z,ALLOCDON  ; one-byte map cell
  inc hl
  ld (hl),d      ; block high byte

ALLOCDON:
  xor a          ; 0: a block claimed
  ret

; All blocks through DSM are in use.
; Return A=2.

ALFULL:
  ld a,2         ; 2: no block free
  ret

; Zero each record of a new block for
; function 40 before the target write.
; Takes DE = block, SEQREC = target.
; Zeroes the 128-byte directory buffer
; addressed by DIRPTR. Each write uses
; it as BIOS DMA. DMABACK restores BIOS
; DMA to the address in CURDMA before
; testing the result. Errors take
; BADSECT under ERRMODE, set by function
; 45. Error handling does not resume
; here.
; Success restores DE and SEQREC.
; Clobbers AF, BC, HL, IX, TARGEX,
; ALLEFT, ZEROBN, IOTRK and IOSEC.

ZEROBLK:

  ld (ZEROBN),de
  ld a,(SEQREC)
  ld (TARGEX),a  ; save target record
  ld hl,(DIRPTR)
  ld (hl),0      ; zero first byte
  ld d,h
  ld e,l
  inc de         ; replicate zero byte
  ld bc,127
  ldir           ; 128 zero bytes
  ld ix,(DPBPTR)
  ld a,(ix+3)    ; BLM: records minus 1
  inc a
  ld (ALLEFT),a  ; records left to zero
  dec a
  cpl            ; mask block start
  ld b,a
  ld a,(SEQREC)
  and b          ; first record in block
  ld (SEQREC),a

ZEROLOOP:
  ld de,(ZEROBN)
  call POSREC    ; position zero record
  ld bc,(DIRPTR)
  call BIODMA    ; DMA at zero buffer
  ld c,2         ; type 2: new block
  call BIOWRS
  call DMABACK   ; restore DMA, test I/O
  ld hl,SEQREC
  inc (hl)       ; next record
  ld hl,ALLEFT
  dec (hl)       ; records left
  jr nz,ZEROLOOP
  ld a,(TARGEX)
  ld (SEQREC),a  ; restore target record

; Restore the input block number.

  ld de,(ZEROBN)
  ret

; Position the BIOS at SEQREC within
; allocation block DE. Validate DE<=DSM
; before the 16-bit block shift. Invalid
; blocks take BADSECT. BSH, BLM and SPT
; are read through IX, which CHKBLK
; leaves at the DPB.
; Divide the data-relative record by
; SPT. Add OFF to the quotient, then
; SEEKP selects IOTRK and translates
; IOSEC, the remainder, through XLT.
; Clobbers A, BC, DE, HL, IX and F.

POSREC:
  call CHKBLK    ; reject block past DSM
  ex de,hl       ; HL = the block
  ld a,(ix+2)    ; BSH: CHKBLK set IX
  or a
  jr z,BLOCKSCA  ; BSH 0: no shift
  ld b,a

BLOCKSHF:
  add hl,hl      ; block to first record
  djnz BLOCKSHF  ; one shift per BSH bit

BLOCKSCA:
  ld a,(SEQREC)
  and (ix+3)     ; BLM: record in block
  ld e,a
  ld d,0
  add hl,de      ; data-relative record
  ld e,(ix+0)
  ld d,(ix+1)    ; SPT: records/track
  call DIV16     ; DE track, HL sector
  ld (IOSEC),hl  ; untranslated sector
  ex de,hl
  ld e,(ix+13)
  ld d,(ix+14)   ; OFF: reserved tracks
  add hl,de      ; the track on the disk
  ld (IOTRK),hl

  ld hl,IOTRK    ; IOSEC follows
  jp SEEKP       ; track, XLT sector

; Unsigned HL / DE: quotient in DE,
; remainder in HL. Requires 1<=DE<=8000h
; so the shifted remainder fits 16 bits.
; Before each shift HL<DE.
; A:C shifts out dividend bits and
; shifts in quotient bits one trial
; subtraction later. Returns A=D.
; Clobbers F and BC.

DIV16:
  ld a,h
  ld c,l         ; A:C = the dividend
  ld hl,0        ; initial remainder
  ld b,16        ; one pass for each bit

DIV16L:
  rl c           ; previous quotient bit
  rla            ; next bit to carry
  adc hl,hl      ; append dividend bit
  sbc hl,de      ; carry clear from ADC
  jr nc,DIV16S   ; no borrow: quotient1
  add hl,de      ; restore remainder

DIV16S:
  ccf            ; quotient bit in carry
  djnz DIV16L
  rl c           ; final quotient bit
  rla
  ld d,a
  ld e,c         ; DE = the quotient
  ret

; Advance PARAM's FCB extent and open
; it. EX wraps after 31. On wrap,
; increment the six-bit S2 module while
; preserving bit 7.
; Returns A=0 with matched entry fields
; copied into the FCB or A=1 if absent.
; Clobbers every register.

NEXTEXT:
  call FCBEX
  ld a,(hl)
  inc a
  and $1F        ; wrap EX at 32
  ld (hl),a

; No EX wrap: leave S2 unchanged.

  jr nz,NEXTFIND
  inc hl
  inc hl
  ld a,(hl)      ; S2
  ld b,a
  and $3F
  inc a
  and $3F        ; module modulo 64
  ld c,a
  ld a,b
  and $80        ; with S2's bit 7 kept
  or c
  ld (hl),a

; Open PARAM's FCB extent as EX/S2
; stand. Search in OPENMOD=1 and copy a
; matching directory entry into the FCB.
; Returns A=0 found or A=1 absent.
; Clobbers every register.

NEXTFIND:
  ld a,1         ; mode 1: open into FCB
  call SRCHA     ; first directory entry
  call FINDENT
  add a,1        ; FFh: carry
  ld a,0
  adc a,a        ; 0 open, 1 not found
  ret
