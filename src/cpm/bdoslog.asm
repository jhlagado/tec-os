; The BDOS's directory blocks and
; drives: reading and writing directory
; records, login, the allocation vectors
; and their bits, and the drive masks.
; Included after bdosfn.asm by rom.asm.

; Read the directory record at
; CURTRK/CURSEC into the drive's
; directory
; buffer (DIRPTR), keeping its place in
; DIRTRK/DIRSEC for WRITEDIR, then
; step CURSEC/CURTRK on to the next
; record (ADVSEC). The DMA address is
; set back to CURDMA. A read error takes
; the BDOS's bad-sector path.
; Destroys AF, BC, DE, HL.
READDIR:
; the record's track,
  ld hl,(CURTRK)
; kept for WRITEDIR
  ld (DIRTRK),hl
  ld b,h
  ld c,l
  call BIOTRK    ; select read track
; its logical sector, kept too,
  ld hl,(CURSEC)
  ld (DIRSEC),hl
  ld b,h
  ld c,l
; through the DPH's skew table
  ld de,(XLTPTR)
  call BIOTRN    ; to the physical
                 ; sector
  ld b,h
  ld c,l
  call BIOSEC    ; select read sector
; read into the directory buffer
  ld hl,(DIRPTR)
  ld b,h
  ld c,l
  call BIODMA    ; use directory DMA
  call BIORDS    ; read directory record
  call DMABACK   ; the DMA back; a
                 ; failed read: error 1
  jr ADVSEC      ; on to the next
                 ; directory record

; Write the current directory buffer
; back to the exact record READDIR
; loaded.
; Takes DIRTRK/DIRSEC, then goes on as
; WRDIRNOW. A write error takes the
; BDOS's bad-sector path. Destroys AF,
; BC, DE, HL.
WRITEDIR:
; the record's track again,
  ld hl,(DIRTRK)
  ld b,h
  ld c,l
  call BIOTRK    ; select write track
; and its sector,
  ld hl,(DIRSEC)
  ld b,h
  ld c,l
; translated through the skew table
  ld de,(XLTPTR)
  call BIOTRN    ; translate sector
  ld b,h
  ld c,l
  call BIOSEC    ; select write sector
; On into WRDIRNOW's write.

; The delete loop writes immediately
; after READDIR, so the BIOS remains on
; the
; matching directory record and only the
; DMA needs changing. Writes the
; directory buffer (DIRPTR) as a
; directory write and sets the DMA
; address
; back to CURDMA. A write error takes
; the BDOS's bad-sector path.
; Destroys AF, BC, DE, HL.
WRDIRNOW:
; write from the directory buffer
  ld hl,(DIRPTR)
  ld b,h
  ld c,l
  call BIODMA    ; use directory DMA
  ld c,1         ; type 1: a directory
                 ; write, at once
  call BIOWRS    ; write directory

; After a BIOS read or write from a BDOS
; buffer: the BIOS's DMA address set
; back to CURDMA before A, the BIOS's
; result, is looked at, so that an error
; function 45 returns to the program
; leaves the program's DMA in the BIOS.
; Takes A = 0 for success; a failure
; takes the BDOS's bad-sector path.
; Destroys AF, BC, HL.
DMABACK:
  push af        ; the BIOS's result, 0
                 ; for success
; the program's DMA address back
  ld hl,(CURDMA)
  ld b,h
  ld c,l
  call BIODMA    ; restore caller DMA
  pop af         ; recover BIOS status
  or a           ; NZ: the read or write
                 ; failed
  ret z          ; success
  jp BADSECT     ; report disk error

; Step CURSEC on to the next directory
; record: past the track's last
; sector (the DPB's SPT), CURSEC returns
; to 0 and CURTRK moves on one.
; Destroys AF, BC, DE, HL.
ADVSEC:
; the next sector,
  ld hl,(CURSEC)
  inc hl
  ex de,hl       ; held in DE
; against the DPB's first word,
  ld hl,(DPBPTR)
  ld c,(hl)      ; SPT, the sectors on a
                 ; track
  inc hl
  ld b,(hl)      ; SPT high byte
  ex de,hl
  or a           ; clear carry
  sbc hl,bc      ; carry: still on this
                 ; track
  jr c,SECSAME
  ld hl,0        ; else sector 0
  ld (CURSEC),hl
; of the next track
  ld hl,(CURTRK)
  inc hl
  ld (CURTRK),hl
  ret

; ADVSEC's next sector on the same
; track: HL is that sector less SPT and
; BC
; is SPT. Sets CURSEC. Destroys HL and
; flags.
SECSAME:
  add hl,bc      ; the sector itself
                 ; again
  ld (CURSEC),hl
  ret

; Select the current drive and capture
; its public tables. Set the directory
; counters on each selection: by a scan
; on first login/reset, from the DPH's
; mark when already logged in. Clear
; allocations only on first login/reset:
; a logged-in vector also owns
; reservations in open, not-yet-closed
; FCBs.
; Takes CURDRV. Sets DPHPTR, XLTPTR,
; DIRPTR, DPBPTR, ALVPTR, DIRCNT and
; DIRUSED, marks the drive in LOGINV
; (and in ROVEC when its volume is
; read-only) and starts a new directory
; search. A drive with no volume
; takes the select-error path. Destroys
; AF, BC, DE, HL, IX.
LOGIN:
  call LOGTEST   ; Z: not yet logged in
  push af        ; kept to choose a scan
                 ; or the fast path
  ld e,0         ; E bit 0 for the BIOS:
                 ; 0 a first select,
  jr z,LOGSEL
  inc e          ; 1 a drive already
                 ; logged in

LOGSEL:
  ld a,(CURDRV)
  ld c,a         ; drive for BIOS
  call BIOSEL    ; HL = the DPH, 0 for
                 ; no volume
  ld a,h
  or l
  jr nz,LOGOK
  pop af         ; no volume: the select
                 ; error
  jp SELFAIL     ; drive unavailable

LOGOK:
  ld (DPHPTR),hl

  ld e,(hl)      ; DPH+0: the skew table
  inc hl
  ld d,(hl)
  ld (XLTPTR),de

  ld bc,7        ; HL is DPH+1 here: on
                 ; to DPH+8,
  add hl,bc
  ld e,(hl)      ; the directory buffer
  inc hl
  ld d,(hl)
  ld (DIRPTR),de
  inc hl
  ld e,(hl)      ; DPH+10: the DPB
  inc hl
  ld d,(hl)
  ld (DPBPTR),de
  inc hl         ; past DPH+12, the
                 ; check vector,
  inc hl
  inc hl
  ld e,(hl)      ; to DPH+14: the
                 ; allocation vector
  inc hl
  ld d,(hl)
  ld (ALVPTR),de

  ld a,(CURDRV)  ; a volume mounted
                 ; read-only is in ROVEC
  call DRVENT    ; from each selection,
                 ; past a warm boot's
                 ; clear
  inc hl         ; the drive entry's
                 ; byte 7, the volume's
                 ; flags:
  bit 0,(hl)     ; bit 0, read-only
  ld hl,ROVEC
  call nz,VSET   ; mark read-only
  pop af         ; NZ: logged in
                 ; already,
  jr nz,LOGFAST  ; its vector kept
  call INITALV   ; first login: a fresh
                 ; vector,
  ld hl,LOGINV   ; and the drive marked
                 ; logged in
  call VSET      ; mark drive logged in

  ld hl,0        ; no entries counted or
                 ; used yet
  ld (DIRCNT),hl
  ld (DIRUSED),hl

; the directory's records:
  ld hl,(DPBPTR)
  ld bc,7        ; DRM, the entries less
                 ; 1, at DPB+7,
  add hl,bc
  ld e,(hl)
  inc hl
  ld d,(hl)
  ex de,hl       ; DRM in HL,
  srl h          ; over 4 entries a
                 ; record,
  rr l
  srl h
  rr l
  inc hl         ; plus 1: every record
                 ; to scan
  ld (DIRLEFT),hl
  ld de,(WARMV)  ; TEC-OS: a rebuild, to
                 ; the mark only
  call VTEST     ; Z: not in WARMV, scan
                 ; every record
  jr z,LOGNEW
  call DUPTR     ; else the DPH's
                 ; directory mark,
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a
  ld de,3        ; rounded up to whole
                 ; records,
  add hl,de
  srl h          ; over 4 entries a
                 ; record,
  rr l
  srl h
  rr l
; the records to scan
  ld (DIRLEFT),hl

LOGNEW:
; Binding a disk replaces the directory
; iteration state: the same start as a
; new
; file search. Default-pointer queries
; do
; not enter LOGIN, so they keep their
; active search position.
  call NEWSRCH   ; the directory's first
                 ; record

DIRSCAN:
; records left to scan:
  ld hl,(DIRLEFT)
  ld a,h
  or l
  jr z,LOGDONE   ; none, the scan is
                 ; complete
  call READDIR   ; the next record,
  call PARDIR    ; its four entries
                 ; counted and marked

; one record fewer to go
  ld hl,(DIRLEFT)
  dec hl
  ld (DIRLEFT),hl
  jr DIRSCAN

; TEC-OS: a drive that is already logged
; in keeps its allocation vector, so
; only its directory high-water mark is
; restored, from the third DPH scratch
; word where DR's BDOS keeps the same
; value. DIRCNT covers every entry, as
; it
; does after a full scan. LOGCNT sets
; DIRCNT and starts a new search for
; LOGDONE too. Destroys AF, BC, DE, HL.
LOGFAST:
  call DUPTR     ; the DPH's directory
                 ; mark
  ld e,(hl)
  inc hl
  ld d,(hl)
; is the highest entry in use
  ld (DIRUSED),de

LOGCNT:
; DIRCNT counts every entry:
  ld hl,(DPBPTR)
  ld bc,7        ; DRM at DPB+7,
  add hl,bc
  ld e,(hl)
  inc hl
  ld d,(hl)
  inc de         ; plus 1
  ld (DIRCNT),de
  jp NEWSRCH     ; searches start from
                 ; the first record

; TEC-OS: the end of a scan. The mark
; saved, the vector's sum taken for the
; next warm boot, the dirty flag and
; WARMV's bit cleared. Then on as
; LOGCNT.
; Destroys AF, BC, DE, HL.
LOGDONE:
  call DUSAVE    ; the mark kept in the
                 ; DPH
  call ALVSUM    ; DE = the vector's
                 ; sum,
  ld hl,(DPHPTR)
  inc hl         ; into DPH+2, the first
                 ; scratch word
  inc hl
  ld (hl),e
  inc hl
  ld (hl),d
  inc hl         ; DPH+4: the dirty
                 ; flag, cleared
  ld (hl),0
  ld hl,WARMV    ; no rebuild left to do
  call VCLR      ; clear rebuild bit
  jr LOGCNT      ; DIRCNT set and a new
                 ; search

; Record DIRUSED for the current drive
; in its DPH, unless the mark there is
; higher already: a BIOS directory write
; may have raised it.
; Takes DPHPTR. Destroys AF, BC, DE, HL.
DUSAVE:
  call DUPTR     ; HL = the DPH's mark
  ld de,(DIRUSED)
  ld c,(hl)      ; BC = the mark there
  inc hl
  ld b,(hl)
  push hl        ; its high byte's
                 ; address
  ld h,b
  ld l,c
  or a
  sbc hl,de      ; no carry: the mark >=
                 ; DIRUSED,
  pop hl
  ret nc         ; so kept
  ld (hl),d      ; else DIRUSED replaces
                 ; it
  dec hl
  ld (hl),e
  ret

; DE = the sum of the current drive's
; allocation vector, DSM / 8 + 1 bytes.
; Returns HL past the vector and BC = 0.
; Destroys AF.
ALVSUM:
  call ALVLEN    ; BC bytes at HL
  ex de,hl       ; existing SUMDE takes
                 ; its source in DE
  ld hl,0        ; the sum from 0
  call SUMDE     ; sum directory bytes
  ex de,hl       ; sum in DE, pointer
                 ; past the vector in HL
  ret

; HL = the address of the current
; drive's directory mark, the third DPH
; scratch word (DPH+6). Takes DPHPTR.
; Destroys BC and flags.
DUPTR:
  ld hl,(DPHPTR)
  ld bc,6        ; past the skew table
                 ; and two scratch words
  add hl,bc
  ret

; Return BC = DSM / 8 + 1 allocation
; bytes, HL = the BIOS-owned vector.
; Uses BC/HL and flags; preserves
; A/DE/IX/IY.
ALVLEN:
; the vector's length:
  ld hl,(DPBPTR)
  ld bc,5        ; DSM, the last block,
                 ; at DPB+5,
  add hl,bc
  ld c,(hl)
  inc hl
  ld b,(hl)
  srl b          ; over 8 blocks a byte,
  rr c
  srl b
  rr c
  srl b          ; the third of three
                 ; halvings
  rr c
  inc bc         ; plus 1: the bytes
; and the vector itself
  ld hl,(ALVPTR)
  ret

; Clear the BIOS-owned allocation vector
; and copy the reserved-directory
; bits supplied by the selected drive's
; DPB. Destroys AF, BC, DE, HL.
INITALV:
  call ALVLEN    ; BC bytes at HL

CLRAVL:
  ld (hl),0      ; each byte cleared
  inc hl
  dec bc         ; DEC BC sets no flag:
                 ; the OR
  ld a,b         ; tests the count
  or c           ; until no bytes are
                 ; left
  jr nz,CLRAVL

; DPB+9: AL0 and AL1, the blocks
  ld hl,(DPBPTR)
  ld bc,9        ; the directory itself
                 ; takes,
  add hl,bc
; as the vector's first two bytes
  ld de,(ALVPTR)
  ld a,(hl)      ; AL0
  ld (de),a
  inc hl
  inc de
  ld a,(hl)      ; then AL1
  ld (de),a
  ret

; Count and mark the four 32-byte
; entries of the directory record in the
; directory buffer (DIRPTR), each
; through PARENT. Uses ENTPTR and
; ENTLEFT. Destroys AF, BC, DE, HL, IX.
PARDIR:
; from the record's first entry,
  ld hl,(DIRPTR)
  ld (ENTPTR),hl
  ld a,4         ; four entries to a
                 ; record
  ld (ENTLEFT),a

PARELOOP:
  call PARENT    ; each entry in turn
  ld a,(ENTLEFT)
  dec a
  ld (ENTLEFT),a
; until all four are done
  jr nz,PARELOOP
  ret

; Count the directory entry at ENTPTR
; and step ENTPTR to the next. DIRCNT
; counts every entry; a used one (first
; byte not E5h) sets DIRUSED, the
; directory mark, to that count and has
; each block in its allocation map
; marked in the vector (MARKBLK).
; Destroys AF, BC, DE, HL, IX.
PARENT:
; this entry,
  ld hl,(ENTPTR)
  push hl
  ld de,32       ; the next 32 bytes on
  add hl,de
  ld (ENTPTR),hl
  pop hl
; one more entry seen
  ld de,(DIRCNT)
  inc de
  ld (DIRCNT),de
  ld a,(hl)      ; the user byte:
  cp $E5         ; E5h, an empty entry,
  ret z          ; has no blocks
; used: the mark reaches it at least
  ld (DIRUSED),de
  ld de,16       ; the allocation map at
                 ; byte 16
  add hl,de
  ld ix,(DPBPTR)
  ld a,(ix+6)    ; DSM's high byte: 0
                 ; for 8-bit
  or a           ; block numbers, 16 of
                 ; them,
  ld a,16
  jr z,PARCNT
  ld a,8         ; else 8 of 16 bits

PARCNT:
  ld (ALLEFT),a  ; the map's cells left

PARCELL:
  ld e,(hl)      ; the block's low byte,
  ld d,0
  inc hl
  ld a,(ix+6)    ; DSM's high byte
                 ; again; IX is still
                 ; the
; DPB, which BLKPAST reloads
  or a
  jr z,PARHAVE   ; 8-bit blocks: no high
                 ; byte
  ld d,(hl)      ; else the high byte
                 ; too
  inc hl

PARHAVE:
  push hl        ; the map's place kept
  call MARKBLK   ; the block's bit set
  pop hl
  ld a,(ALLEFT)
  dec a
  ld (ALLEFT),a
  jr nz,PARCELL  ; every cell of the map
  ret

; Free the blocks of the directory entry
; at MATCHPTR: each block in its
; allocation map has its bit cleared in
; the vector (CLRBLK).
; Destroys AF, BC, DE, HL, IX.
FREEENT:
; the entry's allocation map,
  ld hl,(MATCHPTR)
  ld de,16       ; at byte 16
  add hl,de
  ld ix,(DPBPTR)
  ld a,(ix+6)    ; DSM's high byte: 0
                 ; for 8-bit
  or a           ; block numbers, 16 of
                 ; them,
  ld a,16
  jr z,FREECNT
  ld a,8         ; else 8 of 16 bits

FREECNT:
  ld (ALLEFT),a  ; the map's cells left

FREECELL:
  ld e,(hl)      ; the block's low byte,
  ld d,0
  inc hl
  ld a,(ix+6)    ; DSM's high byte
                 ; again; IX is still
                 ; the
; DPB, which BLKPAST reloads
  or a
  jr z,FREEHAVE  ; 8-bit blocks: no high
                 ; byte
  ld d,(hl)      ; else the high byte
                 ; too
  inc hl

FREEHAVE:
  push hl        ; the map's place kept
  call CLRBLK    ; the block's bit
                 ; cleared
  pop hl
  ld a,(ALLEFT)
  dec a
  ld (ALLEFT),a
; every cell of the map
  jr nz,FREECELL
  ret

; Set block DE's bit in the allocation
; vector, as an entry's block is
; logged; a block with no bit (BITPTR)
; is passed over.
; Destroys AF, BC, DE, HL; may set IX to
; the DPB.
MARKBLK:
  call BITPTR    ; HL = its byte, A =
                 ; its bit
  ret z          ; no bit: nothing to
                 ; mark
  or (hl)        ; the bit set among the
                 ; others
  ld (hl),a
  ret

; Clear block DE's bit in the allocation
; vector, as an entry's block is
; freed; a block with no bit (BITPTR) is
; passed over.
; Destroys AF, BC, DE, HL; may set IX to
; the DPB.
CLRBLK:
  call BITPTR    ; HL = its byte, A =
                 ; its bit
  ret z          ; no bit: nothing to
                 ; free
  cpl            ; every bit but this
                 ; block's
  and (hl)       ; kept as it was
  ld (hl),a
  ret

; Z if DE is 0 or past the volume's end:
; such a block has no bit, so a
; directory
; with one can still be logged in and
; its file erased. Reading it is
; refused.
; Else NZ, HL = the vector byte that
; holds block DE's bit and A = the bit,
; bit 7 for the byte's first block.
; Destroys BC, DE; sets IX to the DPB
; (BLKPAST) unless DE is 0.
BITPTR:
  ld a,d
  or e
  ret z          ; block 0: an unused
                 ; cell
  call BLKPAST   ; carry: past DSM
  sbc a,a        ; FFh if past the end
  inc a          ; then 0, so Z
  ret z
  ld a,e
  and 7          ; the bit's place in
                 ; its byte
  ld b,a
  ex de,hl       ; HL = the block,
  srl h          ; over 8 blocks a byte,
  rr l
  srl h
  rr l
  srl h          ; the third of three
                 ; halvings
  rr l
; into the vector
  ld de,(ALVPTR)
  add hl,de
  ld a,$80       ; a byte's first block
                 ; is bit 7,
  ld c,a
  ld a,b
  or a           ; Z: the first block,
                 ; no shift
  ld a,c
  jr z,BITDONE

SHIFBIT:
  rrca           ; one bit right for
                 ; each block on
  djnz SHIFBIT

BITDONE:
  or a           ; NZ: the block has its
                 ; bit
  ret

; LOGTEST: NZ if the current drive's bit
; is set in LOGINV, DE then the login
; vector; Z means the drive needs its
; allocation vector rebuilt. VTEST: the
; same against the vector in DE, which
; it keeps. Both destroy AF, B and HL.
LOGTEST:
; the logged-in drives
  ld de,(LOGINV)

VTEST:
  call DRVMASK   ; HL = the current
                 ; drive's bit,
  ld a,l
  and e
  ld l,a
  ld a,h         ; and with DE a byte at
                 ; a time
  and d
  or l           ; NZ: the bit is set in
                 ; DE
  ret

; The current drive's bit cleared (VCLR)
; or set (VSET) in the vector at HL;
; ANDV ands the vector at HL with BC.
; VCLR destroys AF, BC, HL; VSET AF, B,
; DE, HL; ANDV AF, HL.
VCLR:
  push hl        ; the vector's address
                 ; kept
  call DRVMASK
  ld a,l         ; BC = every drive but
                 ; this one:
  cpl
  ld c,a
  ld a,h         ; drives I to P in the
                 ; high byte
  cpl
  ld b,a
  pop hl

ANDV:
  ld a,(hl)      ; the vector's low
                 ; byte, A to H,
  and c
  ld (hl),a
  inc hl
  ld a,(hl)      ; then its high byte, I
                 ; to P
  and b
  ld (hl),a
  ret

VSET:
  push hl        ; the vector's address
                 ; kept
  call DRVMASK
  ex de,hl       ; DE = the drive's bit
  pop hl
  ld a,(hl)      ; added to the low byte
  or e
  ld (hl),a
  inc hl
  ld a,(hl)      ; and to the high
  or d
  ld (hl),a
  ret

; HL = the drive's bit in a 16-bit drive
; vector, bit 0 for A: to bit 15 for
; P:, for CURDRV (DRVMASK) or the drive
; in A (MASKA). Leaves A the drive.
; Destroys B and flags; keeps C and DE.
DRVMASK:
  ld a,(CURDRV)

MASKA:
  ld b,a         ; B = the drive, the
                 ; shifts to make
  ld hl,1        ; drive A's bit
  or a
  ret z          ; drive A: no shift

MASKLOOP:
  add hl,hl      ; the bit one drive
                 ; higher
  djnz MASKLOOP
  ret

; RONZ: NZ if the selected drive is
; read-only. Changes AF, B, DE, HL.
; CHKRO returns if the drive is
; writable, else takes the read-only
; error.
RONZ:
  ld de,(ROVEC)  ; the read-only drives
  jr VTEST       ; DRVMASK preserves DE;
                 ; same mask and Z
                 ; result

CHKRO:
  call RONZ      ; writable: on
  ret z
  ld hl,ERRRO    ; the read-only message
  ld b,2         ; read-only disk
  jr BDERR

; The select error: ERRSEL and code 4,
; through BDERR, which ends the function
; and never comes back here.
SELFAIL:
  ld hl,ERRSEL
  ld b,4         ; select
  jr BDERR
