; The BDOS's drive and file functions
; that read the tables: the login and
; read-only vectors, the DMA address,
; the allocation vector, free space, the
; DPB, the user, a file's size and
; random record, and the directory
; search.
; Included after bdosrec.asm by rom.asm.

; Function 24, the login vector: a bit
; for each drive logged in since its
; last
; reset, drive A in bit 0. Returns it in
; HL, with A = L and B = H. Changes AF,
; B and HL.
FNLOGIN:
; bit n set: drive n is logged in
  ld hl,(LOGINV)
  jp RETWORD     ; return the vector

; Function 25, the current drive: the
; default drive, 0 for A. Returns it in
; A
; and HL, with B = 0. Changes AF, B and
; HL.
FNCURDSK:
  ld a,(DEFDRV)  ; not CURDRV, the last
                 ; an FCB selected
  jp RETA

; Function 26, set DMA: DE (PARAM) is
; where the next record read or written
; goes, and where a search puts its
; directory record. It is kept in
; CURDMA,
; which the directory's reads and writes
; go back to, and passed to the BIOS.
; Returns A = 0. Changes AF, BC, HL and
; what the BIOS's SETDMA changes.
FNSETDMA:
  ld hl,(PARAM)  ; the caller's DE
  ld (CURDMA),hl
  ld b,h         ; BC for BIOS SETDMA
  ld c,l
  call BIODMA    ; through the RAM copy
                 ; of the BIOS's table
  jp RETZERO

; Function 27, the allocation vector's
; address: the default drive's, a bit
; for
; each block, block 0 in bit 7 of its
; first byte. Returns it in HL, with A =
; L
; and B = H. Changes AF, B and HL.
FNGETALV:
; kept from the default drive's
; selection
  ld hl,(DEFALV)
  jp RETWORD     ; return ALV address

; Function 46, CP/M 3's free space:
; drive E's free blocks, from its
; allocation
; vector, as records, in the three bytes
; at the DMA address, low first. The
; drive is selected as an FCB's would
; be, and the default stays. E is 0 for
; A; a drive past P, or one absent,
; takes SELDRV's fatal path. Returns A =
; 0.
; Changes every register and IX; CURDRV
; is left on drive E.
FNFREE:
  ld a,e         ; the drive, 0 for A
  call SELDRV    ; logged in if need be:
                 ; DPBPTR, ALVPTR
  ld ix,(DPBPTR)
; block 0 in bit 7 of the first byte
  ld hl,(ALVPTR)
  ld e,(ix+5)    ; DSM low byte
  ld d,(ix+6)    ; DSM, the drive's last
                 ; block
  inc de         ; DE = the drive's
                 ; blocks
  ld bc,0        ; the free ones
  ld a,$80       ; the bit within the
                 ; current byte

FRBIT:
  push af        ; save the bit mask
  and (hl)       ; the block's bit set:
                 ; in use
  jr nz,FRUSED
  inc bc         ; a free block counted

FRUSED:
  pop af
  rrca           ; the next block's bit;
                 ; a carry when it
  jr nc,FRSAME   ; wraps from bit 0 to
                 ; bit 7, the next byte
  inc hl         ; next vector byte

FRSAME:
  dec de         ; one block fewer to
                 ; look at
  push af        ; the mask kept while
                 ; DE is tested
  ld a,d         ; test remaining blocks
  or e
  jr z,FREND     ; every block counted
  pop af         ; restore the bit mask
  jr FRBIT

FREND:
  pop af         ; the mask dropped
  ld h,b         ; records = blocks <<
                 ; BSH, 24 bits
  ld l,c         ; free blocks low byte
  xor a          ; A: the top byte
  ld b,(ix+2)    ; BSH: a block holds
                 ; 2^BSH records

FRSH:
  add hl,hl      ; shift low 16 bits
  rla            ; H's top bit into A
  djnz FRSH
  ex de,hl
; the answer at the DMA address, low
; first
  ld hl,(CURDMA)
  ld (hl),e      ; store the low byte
  inc hl
  ld (hl),d      ; store the middle byte
  inc hl
  ld (hl),a      ; the top byte
  jp RETZERO

; Function 28, write protect: the
; default drive's bit set in ROVEC, the
; read-only vector, until a reset,
; function 13 or 37, clears it. Returns
; A = 0. Changes AF, B, DE and HL.
FNWRPROT:
  ld a,(DEFDRV)  ; default drive number
  call MASKA     ; HL = the drive's bit
  ex de,hl
  ld hl,(ROVEC)  ; ORed into the
                 ; read-only vector:
  ld a,l
  or e           ; drives A to H
  ld l,a
  ld a,h
  or d           ; and I to P
  ld h,a
  ld (ROVEC),hl  ; save read-only vector
  jp RETZERO

; Function 29, the read-only vector: a
; bit for each read-only drive, drive A
; in bit 0. Returns it in HL, with A = L
; and B = H. Changes AF, B and HL.
FNGETRO:
  ld hl,(ROVEC)  ; set by function 28 or
                 ; a read-only mount
  jp RETWORD     ; return the vector

; Function 31, the DPB's address: the
; default drive's disk parameter block.
; Returns it in HL, with A = L and B =
; H. Changes AF, B and HL.
FNGETDPB:
; kept from the default drive's
; selection
  ld hl,(DEFDPB)
  jp RETWORD     ; return DPB address

; Function 32, the user number. E = FFh
; gets the user number; any other E sets
; it to its low five bits, as CP/M 2.2
; does, so no E reaches E5h, an erased
; entry's user byte. Returns A = 0 after
; a set. Changes AF, B and HL.
FNUSER:
  ld a,(PARAM)   ; the caller's E
  cp $FF         ; read current user?
  jr z,GETUSER   ; FFh: get it
  and $1F        ; 0 to 31
  ld (USERNO),a
  jp RETZERO

; Function 32's get: returns the user
; number, 0 to 31, in A and HL, with
; B = 0. Changes AF, B and HL.
GETUSER:
  ld a,(USERNO)  ; the user the
                 ; directory matches
  jp RETA

; Function 35, file size: the FCB at DE
; (PARAM) names the file, a '?'
; matching any character. Every extent
; of it in the directory has an end,
; (S2 * 32 + EX) * 128 + RC records; the
; largest, the file's size in records,
; goes to the FCB's random-record field,
; r0 to r2, low first, 0 when there is
; no extent: the highest logical record
; boundary across every matching
; extent. The dispatch has selected the
; FCB's drive. Function 35 returns $FF
; like CP/M (SIZEDONE). Changes every
; register.
FNSIZE:
  ld hl,(PARAM)
; the FCB the search matches
  ld (SRCHFCB),hl
  ld a,2         ; mode 2: every extent
                 ; of the name
  ld (OPENMOD),a
  xor a
  ld (FSIZE0),a  ; the largest end so
                 ; far: none
  ld (FSIZE1),a
  ld (FSIZE2),a
  call NEWSRCH   ; from the directory's
                 ; first entry

SIZELOOP:
  call FINDENT
  cp $FF         ; directory exhausted?
  jr z,SIZEDONE  ; no extent left
; the entry: EX and S2 where an FCB has
; them
  ld hl,(MATCHPTR)
  call RECBASE   ; CAND = its last
                 ; extent's first record
  ld hl,(MATCHPTR)
  ld de,15
  add hl,de
  ld e,(hl)      ; RC, byte 15: that
                 ; extent's records
  ld d,0
  ld hl,(CAND0)  ; CAND += RC, 24 bits:
                 ; this entry's end
  add hl,de
  ld (CAND0),hl
  ld a,(CAND2)
  adc a,0        ; the carry into the
                 ; top byte
  ld (CAND2),a

  ld b,a         ; CAND against FSIZE,
                 ; top bytes first
  ld a,(FSIZE2)  ; compare high byte
  cp b
  jr c,SIZEKEEP  ; this end is the
                 ; larger
; the smaller: the next extent
  jr nz,SIZELOOP
  ld a,(CAND1)   ; top bytes equal: the
                 ; middle ones
  ld b,a
  ld a,(FSIZE1)  ; compare middle byte
  cp b
  jr c,SIZEKEEP  ; larger
; smaller
  jr nz,SIZELOOP
  ld a,(CAND0)   ; and then the low ones
  ld b,a
  ld a,(FSIZE0)  ; compare low byte
  cp b
; not larger: FSIZE stands
  jr nc,SIZELOOP

SIZEKEEP:
  ld hl,(CAND0)  ; CAND0 and CAND1 as a
                 ; word, into
; FSIZE0 and FSIZE1, which follow
  ld (FSIZE0),hl
  ld a,(CAND2)
  ld (FSIZE2),a  ; and the top byte
  jr SIZELOOP

; FNSIZE's end: the largest end found,
; the file's size, to the FCB's
; random-record field. Returns A = FFh,
; as CP/M's search leaves it at the
; directory's end, in A and HL, with B =
; 0. Changes every register.
SIZEDONE:
  ld de,FSIZE0
  call PUBRR     ; r0 to r2 = FSIZE0 to
                 ; FSIZE2
  ld a,$FF
  jp RETA

; Function 36, set random record:
; convert the sequential EX/S2/CR
; position
; of the FCB at DE (PARAM) to the public
; 24-bit random record,
; (S2 * 32 + EX) * 128 + CR, in its
; random-record field, r0 to r2, for a
; random read or write to go on from.
; Returns A = 0. Changes every register.
FNSETRR:
  ld hl,(PARAM)
  call RECBASE   ; CAND = the extent's
                 ; first record
  call FCBCR     ; HL = the FCB's CR,
                 ; the next record
  ld e,(hl)      ; DE = CR, 0 to 128
  ld d,0
  ld hl,(CAND0)  ; CAND += CR, 24 bits
  add hl,de
  ld (CAND0),hl
  ld a,(CAND2)
  adc a,0        ; the carry into the
                 ; top byte
  ld (CAND2),a
  ld de,CAND0
  call PUBRR     ; r0 to r2 = CAND0 to
                 ; CAND2
  jp RETZERO

; Publish three bytes from DE, low
; first, to the caller's random-record
; field, r0 to r2, bytes 33 to 35 of the
; FCB at PARAM. Keeps A; changes BC,
; DE, HL and the flags. The callers
; finish through RETA or RETZERO.
PUBRR:
  ld hl,(PARAM)
  ld bc,33       ; r0, byte 33
  add hl,bc
  ex de,hl       ; from DE to the field
  ld c,3         ; B is already zero
  ldir
  ret

; Convert an FCB-shaped EX/S2 position
; at HL, an FCB or a directory entry, to
; its 24-bit record base, the extent's
; first record: (S2 * 32 + EX) * 128,
; from EX's low five bits (byte 12) and
; S2's low six (byte 14), which leave
; out S2's bit 7, an FCB's unmodified
; mark. Returns it in CAND0 to CAND2,
; low
; first, with its top byte in A as well.
; Changes AF, BC, DE and HL; B is 0
; after.
RECBASE:
  ld de,12
  add hl,de      ; EX, byte 12
  ld a,(hl)
  and $1F        ; the extent within its
                 ; S2, 0 to 31
  ld c,a
  inc hl
  inc hl         ; S2, byte 14: 32
                 ; extents a step
  ld a,(hl)
  and $3F        ; without the
                 ; unmodified mark
  ld h,0
  ld l,a
  add hl,hl      ; S2 * 32, five
                 ; doublings
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl
  ld e,c         ; + EX: the extent's
                 ; number, below 2048
  ld d,0
  add hl,de
  xor a          ; A: the result's top
                 ; byte
  ld b,7         ; * 128: seven 24-bit
                 ; doublings

RECBSHFT:
  add hl,hl
  rla            ; H's top bit into A
  djnz RECBSHFT
  ld (CAND0),hl  ; CAND0 and CAND1
  ld (CAND2),a
  ret

; Function 37, reset drives: each drive
; whose bit is set in DE (PARAM), drive
; A in bit 0, comes out of the login
; vector, the read-only vector and
; WARMV,
; so that its next selection logs it in
; afresh, with a full directory scan.
; Returns A = 0. Changes AF, BC, DE and
; HL.
FNRESETD:
  ld de,(PARAM)
  ld a,e         ; BC = the mask
                 ; complemented, a bit
  cpl            ; for each drive kept
  ld c,a
  ld a,d
  cpl            ; drives I to P
  ld b,a
  ld hl,LOGINV
  call ANDV      ; logged out
  ld hl,ROVEC
  call ANDV      ; writable again
  ld hl,WARMV
  call ANDV      ; no rebuild to a mark
                 ; waiting
  jp RETZERO

; Start a directory search at the first
; entry of the selected drive:
; SRCHIDX = 0, the drive homed, and
; CURTRK and CURSEC on the directory's
; first
; record, sector 0 of track OFF, the
; first past the reserved tracks.
; FINDENT
; reads that record when it first runs.
; Takes DPBPTR. Changes AF, BC, DE, HL
; and what the BIOS's HOME changes.
NEWSRCH:
  ld hl,0
; the entry FINDENT looks at next
  ld (SRCHIDX),hl
  call BIOHOM    ; the BIOS's HOME:
                 ; track 0
  ld hl,(DPBPTR)
  ld bc,13
  add hl,bc      ; OFF, the DPB's byte
                 ; 13
  ld e,(hl)
  inc hl
  ld d,(hl)
; the directory's first track
  ld (CURTRK),de
  ld hl,0
; and its first sector
  ld (CURSEC),hl
  ret

; Return the next matching directory
; slot (0..3), or $FF when no entry is
; left: from SRCHIDX on, the next entry
; that matches the FCB at SRCHFCB as
; OPENMOD asks (MATCHFCB has the modes).
; The slot is the entry's place in the
; 128-byte record at DIRPTR, kept in
; RETCODE too, with MATCHPTR on the
; entry
; and SRCHIDX past it. Make (mode 3) and
; the raw search (5) look through every
; entry, DIRCNT; the others stop at
; DIRUSED, the directory's high-water
; mark.
; Search (modes 0 and 5) copies the
; containing 128-byte directory record
; to
; the caller's DMA; open (1) instead
; copies the entry's bytes 1 to 31, the
; name to the allocation map, into the
; supplied FCB. Takes NEWSRCH's start or
; the last call's place. Changes every
; register.
FINDENT:
  ld hl,(SRCHIDX)
; the limit: the high-water mark
  ld de,(DIRUSED)
  ld a,(OPENMOD)
  cp 3
  jr z,FULLDIR   ; make: free entries
                 ; past the mark too
  cp 5
  jr nz,FINDLIM

FULLDIR:
; make and raw search: every entry
  ld de,(DIRCNT)

FINDLIM:
  or a
  sbc hl,de      ; SRCHIDX against the
                 ; limit
  jp nc,NOENTRY  ; at the limit: no
                 ; entry left
  ld hl,(SRCHIDX)
  ld a,l
  and 3
; a record's first entry: the record
; read
  call z,READDIR

  ld hl,(SRCHIDX)
  ld a,l
  and 3          ; the entry's slot in
                 ; the record
; returned if it matches
  ld (RETCODE),a
  add a,a        ; scale slot to offset
  add a,a
  add a,a
  add a,a
  add a,a        ; 32 bytes a slot
  ld e,a
  ld d,0
  ld hl,(DIRPTR)
  add hl,de
; the entry
  ld (MATCHPTR),hl
  call MATCHFCB  ; A = 1 if it matches
                 ; the FCB
  or a
  jr nz,FOUNDIT  ; A = 1: it matches
  ld hl,(SRCHIDX)
  inc hl
; no match: the next entry
  ld (SRCHIDX),hl
  jr FINDENT

; FINDENT's match: SRCHIDX steps past
; it, and the mode says what is copied:
; the record to the DMA address in modes
; 0 and 5, the entry into the FCB in
; mode 1 (OPENHIT), nothing in any
; other. Returns A = the slot, 0 to 3.
; Changes every register.
FOUNDIT:
  ld hl,(SRCHIDX)
  inc hl
; the next call goes on past this entry
  ld (SRCHIDX),hl
  ld a,(OPENMOD)
  or a
  jr z,COPYDIR   ; mode 0, search: the
                 ; record copied
  cp 5
  jr nz,OPENHIT  ; and mode 5, the raw
                 ; search, the same

COPYDIR:
  ld hl,(DIRPTR)
  ld de,(CURDMA)
  ld bc,128      ; the whole record, as
                 ; CP/M 2.2's search
  ldir           ; returns it, the slot
                 ; its index
  ld a,(RETCODE)
  ret

; The FCB keeps the logical extent it
; asked for. The entry's extent byte is
; the highest it holds, and its record
; count is that extent's: an earlier
; extent in the entry is full (128
; records), a later one empty. In mode
; 1,
; open, the entry's bytes 1 to 31, the
; name, EX, S1, S2, RC and the
; allocation map, go into the FCB at
; SRCHFCB, and S2's bit 7 marks it
; unmodified; modes 2 to 4 go to NOCOPY.
; Takes A = OPENMOD. Returns A = the
; slot, 0 to 3. Changes every register.
OPENHIT:
  cp 1
  jr nz,NOCOPY   ; delete, size, make
                 ; and close: no copy
  ld hl,(SRCHFCB)
  ld de,12
  add hl,de
  ld a,(hl)      ; the FCB's EX: the
                 ; extent asked for
  and $1F
  push af        ; kept while the entry
                 ; overwrites it
  ld hl,(MATCHPTR)
  inc hl         ; from byte 1, the
                 ; name: the entry's
; user byte and the FCB's drive byte
  ld de,(SRCHFCB)
  inc de         ; are left as they are
  ld bc,31
  ldir           ; to byte 31, the map's
                 ; end
  ld hl,(SRCHFCB)
  ld de,12
  add hl,de
  ld a,(hl)      ; the entry's EX, now
                 ; in the FCB
  and $1F
  ld c,a         ; the entry's extent
  pop af         ; A = the extent asked
                 ; for
  ld (hl),a      ; the FCB's EX back to
                 ; the one asked for
  cp c
  jr z,OPENRC    ; the entry's last
                 ; extent: its RC stands
  ld b,$80       ; earlier than the
                 ; entry's: full
  jr c,OPENSET
  ld b,0         ; later: nothing in it
                 ; yet

OPENSET:
  inc hl
  inc hl
  inc hl
  ld (hl),b      ; RC, byte 15
  dec hl
  dec hl
  dec hl         ; back on EX

OPENRC:
  inc hl
  inc hl
  ld a,(hl)      ; S2, byte 14
  or $80         ; bit 7: unmodified, so
                 ; close writes
  ld (hl),a      ; nothing until a write
                 ; changes the FCB
; the slot
  ld a,(RETCODE)
  ret

; FINDENT's match in modes 2 to 4, which
; copy nothing. Returns A = the slot,
; 0 to 3. Changes A.
NOCOPY:
; the entry's slot in its record
  ld a,(RETCODE)
  ret

; FINDENT's end: no entry left to match.
; Returns A = FFh, CP/M's code for no
; file. Changes A.
NOENTRY:
  ld a,$FF       ; no further match
  ret

; Match the directory entry at HL
; against the FCB at SRCHFCB: A = 1 if
; it
; matches, 0 if not; the flags do not
; say. OPENMOD is the kind of match:
; 0 search, 1 open and 4 close: the
; user, the name and the extent;
; 2 delete, rename, attributes and size:
; the user and the name;
; 3 make: a free entry, its user byte
; E5h;
; 5 search with a '?' drive: every
; entry, used or free.
; The user is the current one and the
; name 8.3. Question marks in the FCB
; are
; single-character wildcards. Directory
; attribute bits are not name bits.
; Open also requires the requested
; logical extent: an entry holds EXM + 1
; logical extents, so the extent bytes
; are compared outside the EXM bits.
; A search's '?' in EX matches any
; extent. Changes AF, BC, DE and HL.
MATCHFCB:
  ld a,(OPENMOD)
  cp 5
  jr z,ISMATCH   ; the raw search: every
                 ; entry
  cp 3
  jr nz,MATCHUSR
  ld a,(hl)      ; make: the user byte
                 ; alone decides
  cp $E5
  jr z,ISMATCH   ; E5h: erased or never
                 ; used, free
  jr NOMATCH

; MATCHFCB's match in modes 0, 1, 2 and
; 4: the user, the 8.3 name and, but in
; mode 2, the extent and S2. Takes HL =
; the entry. Returns A = 1 for a match,
; 0 for none. Changes AF, BC, DE and HL.
MATCHUSR:
  ld a,(USERNO)
  ld b,a         ; the current user
  ld a,(hl)
  cp b           ; another user's, or a
                 ; free entry's E5h
  jr nz,NOMATCH
  inc hl         ; the name, bytes 1 to
                 ; 11
  ld de,(SRCHFCB)
  inc de
  ld b,11

NAMELOOP:
  ld a,(de)
  and $7F        ; the FCB's character,
                 ; attribute bit off
  cp '?'
  jr z,NAMEOK    ; a wildcard: any
                 ; character
  ld c,a
  ld a,(hl)
  and $7F        ; the entry's,
                 ; attribute bit off
  cp c
  jr nz,NOMATCH

NAMEOK:
  inc hl
  inc de
  djnz NAMELOOP  ; the eleven characters
  ld a,(OPENMOD)
  cp 2           ; the name matches; the
                 ; extent next
  jr z,ISMATCH   ; mode 2: the name
                 ; alone, any extent
  ld a,(de)      ; the FCB's EX, byte 12
  cp '?'
  jr z,ISMATCH   ; a search's '?': every
                 ; extent
  xor (hl)       ; extents differ only
                 ; in the bits EXM masks
  and $1F
  jr z,EXSAME    ; the same extent
  push hl
  ld c,a         ; the bits that differ
; the DPB: EXM is byte 4
  ld hl,(DPBPTR)
  inc hl         ; skip to extent mask
  inc hl
  inc hl
  inc hl
  ld a,(hl)      ; EXM
  cpl            ; the bits EXM leaves
                 ; out
  and c          ; one outside EXM:
                 ; another entry's
  pop hl         ; the entry's EX again
  jr nz,NOMATCH

EXSAME:
  inc hl
  inc hl
  inc de
  inc de         ; S2, byte 14; S1 is
                 ; not compared
  ld a,(de)
  and $3F        ; without an FCB's
                 ; unmodified mark
  ld c,a
  ld a,(hl)
  and $3F
  cp c
  jr nz,NOMATCH  ; another S2: 32
                 ; extents away

; MATCHFCB's yes: returns A = 1, the
; entry matches. Changes A.
ISMATCH:
  ld a,1
  ret

; MATCHFCB's no: returns A = 0, the
; entry does not match. Changes AF.
NOMATCH:
  xor a
  ret
