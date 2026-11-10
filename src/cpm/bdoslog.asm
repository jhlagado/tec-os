; BDOS directory-record I/O, drive
; login, allocation-vector access and
; drive masks.

; Read the next logical directory record
; at CURTRK/CURSEC into the buffer at
; (DIRPTR). Save its coordinates in
; DIRTRK/DIRSEC for WRITEDIR. Translate
; the sector through XLTPTR and use RAM
; BIOS entries.
; DMABACK restores caller DMA before
; testing status. Only a successful read
; advances CURSEC/CURTRK through ADVSEC.
; Failure enters BADSECT nonlocally.
; Changes AF/BC/DE/HL and BIOS clobbers.

READDIR:

  ld hl,(CURTRK)

  ld (DIRTRK),hl
  ld hl,(CURSEC)
  ld (DIRSEC),hl
  ld hl,DIRTRK   ; that pair
  call SEEKP

  ld bc,(DIRPTR)
  call BIODMA    ; temporary BIOS DMA
  call BIORDS    ; read before advance
  call DMABACK   ; restore before error
  jr ADVSEC      ; success: next record

; Seek the track word at HL and the
; sector word after it: BIOTRK, the
; skew table at (XLTPTR) through BIOTRN,
; then BIOSEC. Changes AF/BC/DE/HL and
; BIOS clobbers.

SEEKP:
  ld c,(hl)
  inc hl
  ld b,(hl)
  inc hl
  push hl
  call BIOTRK
  pop hl
  ld c,(hl)
  inc hl
  ld b,(hl)
  ld de,(XLTPTR)
  call BIOTRN
  ld b,h
  ld c,l         ; translated sector
  jp BIOSEC

; Write the modified buffer at (DIRPTR)
; back to READDIR's saved DIRTRK/DIRSEC
; using the skew table at (XLTPTR). Fall
; into WRDIRNOW. Do not use the
; advancing CURTRK/CURSEC.
; Errors enter BADSECT after DMA
; restoration. Changes AF/BC/DE/HL and
; BIOS clobbers.

WRITEDIR:

  ld hl,DIRTRK   ; READDIR's pair
  call SEEKP

; Write the directory buffer at (DIRPTR)
; using the BIOS's current record
; position. The delete loop enters here
; before freeing blocks, while that
; position still matches READDIR. Other
; callers must establish it first.
; Set directory DMA, write with type 1
; and fall into DMABACK. Failure follows
; BDERR policy. Changes AF/BC/DE/HL and
; BIOS clobbers.

WRDIRNOW:

  ld bc,(DIRPTR)
  call BIODMA    ; temporary BIOS DMA
  ld c,1         ; type 1: directory
  call BIOWRS

; Restore BIOS DMA to the address in
; CURDMA before testing input A, the
; saved BIOS I/O status. A=0 returns.
; Nonzero enters BADSECT without
; resuming this caller.
; This restoration also precedes an I/O
; error returned to the program under
; ERRMODE, set by function 45. Changes
; AF/BC/HL and BIOS SETDMA clobbers.

DMABACK:
  push af        ; status across SETDMA

  ld bc,(CURDMA)
  call BIODMA    ; restore before test
  pop af         ; saved BIOS status
  or a           ; NZ: failed I/O
  ret z
  jp BADSECT     ; nonlocal error 1

; Advance a valid logical directory
; cursor by one record. Compare
; incremented CURSEC with the 16-bit SPT
; at (DPBPTR). Below SPT enters SECSAME.
; Otherwise set CURSEC=0 and increment
; CURTRK. Changes AF/BC/DE/HL.

ADVSEC:

  ld hl,(CURSEC)
  inc hl
  ex de,hl

  ld hl,(DPBPTR)
  ld c,(hl)      ; DPB SPT low byte
  inc hl
  ld b,(hl)      ; SPT high byte
  ex de,hl
  or a           ; unsigned comparison
  sbc hl,bc      ; borrow: below SPT
  jr c,SECSAME
  ld hl,0        ; roll over to sector 0
  ld (CURSEC),hl

  ld hl,(CURTRK)
  inc hl
  ld (CURTRK),hl
  ret

; Recover a same-track next sector: HL
; is incremented CURSEC minus SPT, with
; borrow. BC=SPT. Add BC back and
; publish CURSEC. Changes HL/F.

SECSAME:
  add hl,bc
  ld (CURSEC),hl
  ret

; Bind CURDRV through BIOS SELDSK. E bit
; 0: 0=first login, 1=already logged. A
; zero DPH enters SELFAIL. Import
; XLTPTR/DIRPTR/DPBPTR/ALVPTR from
; DPH+0/8/10/14. Reapply mounted
; read-only state.
; Keep logged vectors, including
; open-FCB reservations, through LOGFAST
; without rescan. Otherwise
; clear/reserve ALV, set LOGINV, clear
; counters and scan all records or
; ceil(saved mark/4) for WARMV.
; Binding resets search state.
; Default-pointer queries do not bind.
; Changes AF/BC/DE/HL/IX.

LOGIN:
  call LOGTEST   ; Z: not logged
  push af        ; login state across
                 ; BIOS
  ld e,0         ; BIOS E bit 0: first
  jr z,LOGSEL
  inc e          ; already logged

LOGSEL:
  ld a,(CURDRV)
  ld c,a         ; BIOS drive C
  call BIOSEL    ; HL=DPH, 0=absent
  ld a,h
  or l
  jr nz,LOGOK
  pop af         ; balance saved status
  jp SELFAIL     ; no volume: error 4

LOGOK:
  ld (DPHPTR),hl

  ld e,(hl)      ; DPH+0: skew pointer
  inc hl
  ld d,(hl)
  ld (XLTPTR),de

  ld bc,7        ; from DPH+1 to +8
  add hl,bc
  ld e,(hl)      ; buffer pointer low
  inc hl
  ld d,(hl)
  ld (DIRPTR),de
  inc hl
  ld e,(hl)      ; DPH+10: DPB pointer
  inc hl
  ld d,(hl)
  ld (DPBPTR),de
  inc hl         ; skip check-vector
                 ; word
  inc hl
  inc hl
  ld e,(hl)      ; DPH+14: ALV pointer
  inc hl
  ld d,(hl)
  ld (ALVPTR),de

  ld a,(CURDRV)  ; selected drive
  call DRVENT
  inc hl         ; volume flags byte 7
  bit 0,(hl)     ; mounted read-only
  ld hl,ROVEC
  call nz,VSET   ; reapply software bit
  pop af         ; recover login state
  jr nz,LOGFAST  ; keep reservations
  call INITALV   ; clear/reserve ALV
  ld hl,LOGINV   ; publish login bit
  call VSET

  ld hl,0        ; rebuild counters
  ld (DIRCNT),hl
  ld (DIRUSED),hl

  ld hl,(DPBPTR)
  ld bc,7        ; DPB+7: DRM
  add hl,bc
  ld e,(hl)
  inc hl
  ld d,(hl)
  ex de,hl       ; DRM in HL
  call SRLHL2    ; entries/4
  inc hl         ; floor(DRM/4)+1
  ld (DIRLEFT),hl
  ld de,(WARMV)  ; bounded-rebuild bits
  call VTEST     ; Z: full scan
  jr z,LOGNEW
  call DUPTR     ; saved DPH mark
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a
  ld de,3        ; round up mark/4
  add hl,de
  call SRLHL2

  ld (DIRLEFT),hl

LOGNEW:

; Rebuild allocation state from DIRLEFT
; directory records. NEWSRCH resets the
; cursor. READDIR fetches each record,
; PARDIR processes its four entries and
; DIRLEFT counts down to LOGDONE.
; Binding replaces active search state.
; Default-pointer queries do not enter
; this path.

  call NEWSRCH   ; replace search state

DIRSCAN:

  ld hl,(DIRLEFT)
  ld a,h
  or l
  jr z,LOGDONE   ; all records processed
  call READDIR   ; fetch/advance record
  call PARDIR    ; mark four entries

  ld hl,(DIRLEFT)
  dec hl
  ld (DIRLEFT),hl
  jr DIRSCAN

; LOGFAST preserves the logged vector
; and restores DIRUSED from DPH+6. This
; one-past high-water mark may stay high
; after deletion. It is not a live-entry
; count.
; LOGCNT sets DIRCNT=DRM+1 for total
; capacity and enters NEWSRCH. LOGDONE
; joins it after a scan. Changes
; AF/BC/DE/HL.

LOGFAST:
  call DUPTR     ; saved high-water
  ld e,(hl)
  inc hl
  ld d,(hl)

  ld (DIRUSED),de

LOGCNT:

  ld hl,(DPBPTR)
  ld bc,7        ; DPB+7: DRM
  add hl,bc
  ld e,(hl)
  inc hl
  ld d,(hl)
  inc de         ; total slots=DRM+1
  ld (DIRCNT),de
  jp NEWSRCH     ; reset shared iterator

; Finish a rebuild: retain the maximum
; mark through DUSAVE and save ALVSUM's
; 16-bit sum at DPH+2. Clear dirty byte
; DPH+4 and the current WARMV bit. Join
; LOGCNT for total capacity and search
; reset. Changes AF/BC/DE/HL.

LOGDONE:
  call DUSAVE    ; retain maximum mark
  call ALVSUM    ; DE=ALV checksum
  ld hl,(DPHPTR)
  inc hl         ; DPH+2 checksum word
  inc hl
  ld (hl),e
  inc hl
  ld (hl),d
  inc hl         ; DPH+4 dirty byte
  ld (hl),0
  ld hl,WARMV    ; clear pending rebuild
  call VCLR
  jr LOGCNT

; Raise the current drive's saved DPH+6
; mark to DIRUSED only when lower. A
; BIOS write may already have raised it.
; Input DPHPTR identifies the DPH.
; Changes AF/BC/DE/HL.

DUSAVE:
  call DUPTR     ; HL=DPH+6 mark
  ld de,(DIRUSED)
  ld c,(hl)      ; saved mark low
  inc hl
  ld b,(hl)
  push hl        ; save high-byte
                 ; address
  ld h,b
  ld l,c
  or a
  sbc hl,de      ; saved mark vs DIRUSED
  pop hl
  ret nc         ; NC: saved mark >= it
  ld (hl),d      ; publish larger mark
  dec hl
  ld (hl),e
  ret

; Sum floor(DSM/8)+1 allocation-vector
; bytes from ALVLEN, modulo 65536
; through SUMDE. Return DE=sum, HL past
; the vector and BC=0. Changes AF. Equal
; sums do not prove identical bytes.

ALVSUM:
  call ALVLEN    ; vector bytes at HL
  ex de,hl       ; SUMDE source in DE
  ld hl,0        ; 16-bit sum from zero
  call SUMDE     ; allocation bytes
  ex de,hl       ; DE=sum, HL=end
  ret

; Return HL=(DPHPTR)+6, the current
; drive's directory-mark word. Changes
; BC/F.

DUPTR:
  ld hl,(DPHPTR)
  ld bc,6        ; DPH directory mark
  add hl,bc
  ret

; Return BC=floor(DSM/8)+1 from DPB
; bytes 5/6 and HL=(ALVPTR), the BIOS
; allocation vector. Preserve
; A/DE/IX/IY. Changes BC/HL/F.

ALVLEN:

  ld hl,(DPBPTR)
  ld bc,5        ; DPB+5: DSM word
  add hl,bc
  ld c,(hl)
  inc hl
  ld b,(hl)
  srl b          ; three shifts: /8
  rr c
  srl b
  rr c
  srl b
  rr c
  inc bc         ; include final byte

  ld hl,(ALVPTR)
  ret

; Clear the current allocation vector
; using ALVLEN's base/count. Reserve
; directory blocks by copying DPB
; AL0/AL1 (bytes 9/10) to its first two
; bytes. The supported vector must hold
; both bytes. Changes AF/BC/DE/HL.

INITALV:
  call ALVLEN    ; vector length/base

CLRAVL:
  ld (hl),0
  inc hl
  dec bc         ; DEC BC keeps flags
  ld a,b         ; explicit count test
  or c
  jr nz,CLRAVL

  ld hl,(DPBPTR)
  ld bc,9        ; DPB+9: AL0/AL1
  add hl,bc

  ld de,(ALVPTR)
  ld a,(hl)      ; reserved blocks 0..7
  ld (de),a
  inc hl
  inc de
  ld a,(hl)      ; reserved blocks 8..15
  ld (de),a
  ret

; Process the four 32-byte entries at
; (DIRPTR) through PARENT. Set ENTPTR to
; the record base and ENTLEFT=4. Uses
; that shared scratch. Changes
; AF/BC/DE/HL/IX.

PARDIR:

  ld hl,(DIRPTR)
  ld (ENTPTR),hl
  ld a,4         ; four slots/record
  ld (ENTLEFT),a

PARELOOP:
  call PARENT    ; count/mark next entry
  ld hl,ENTLEFT
  dec (hl)
  jr nz,PARELOOP
  ret

; Process the entry at (ENTPTR), advance
; ENTPTR and increment DIRCNT. If the
; user byte is E5h, skip allocation
; work. Otherwise set DIRUSED to that
; one-past count and mark blocks from
; byte 16.
; DSM<256 uses 16 byte cells. Otherwise
; use eight little-endian words. ALLEFT
; counts cells. Save traversal HL around
; MARKBLK, which skips zero/past-DSM
; references. IX remains the DPB for
; width tests, even after a zero cell.
; Changes AF/BC/DE/HL/IX.

PARENT:

  ld hl,(ENTPTR)
  push hl        ; keep current entry
  ld de,32       ; 32-byte stride
  add hl,de
  ld (ENTPTR),hl
  pop hl

  ld de,(DIRCNT)
  inc de
  ld (DIRCNT),de
  ld a,(hl)
  cp $E5         ; E5h: empty only
  ret z

  ld (DIRUSED),de
  call ENTCNT    ; ALLEFT cells, IX=DPB

PARCELL:
  call ENTCELL   ; DE=next block
  push hl        ; save map pointer
  call MARKBLK
  ld hl,ALLEFT
  dec (hl)
  pop hl
  jr nz,PARCELL
  ret

; Free blocks from the deleted entry at
; (MATCHPTR), after its caller has
; successfully written the deletion.
; Walk byte 16's map: 16 byte cells for
; DSM<256 or eight little-endian words
; otherwise.
; CLRBLK skips zero/past-DSM cells. Save
; traversal HL around it. ALLEFT counts
; cells and IX remains the DPB for width
; tests. Changes AF/BC/DE/HL/IX.

FREEENT:

  ld hl,(MATCHPTR)
  call ENTCNT    ; ALLEFT cells, IX=DPB

FREECELL:
  call ENTCELL   ; DE=next block
  push hl        ; save map pointer
  call CLRBLK
  ld hl,ALLEFT
  dec (hl)
  pop hl
  jr nz,FREECELL
  ret

; HL=a directory entry. Step HL to its
; block map at byte 16, set IX=DPB and
; ALLEFT to the cell count: 16 bytes
; for DSM<256, else eight words.
; Changes AF/DE.

ENTCNT:
  ld de,16       ; map offset 16
  add hl,de
  ld ix,(DPBPTR)
  ld a,(ix+6)    ; DSM high byte
  or a
  ld a,16
  jr z,ENTCN1
  ld a,8

ENTCN1:
  ld (ALLEFT),a
  ret

; DE=the block number in the map cell
; at HL, HL stepped past it. IX=DPB.
; Changes AF.

ENTCELL:
  ld e,(hl)
  ld d,0
  inc hl
  ld a,(ix+6)    ; DSM high byte
  or a
  ret z          ; byte cells
  ld d,(hl)
  inc hl
  ret

; Mark block DE allocated. BITPTR skips
; 0/past-DSM references. Otherwise OR
; its mask into the vector byte. Changes
; AF/BC/DE/HL. IX may become the DPB.

MARKBLK:
  call BITPTR    ; HL=byte, A=mask
  ret z          ; Z: no vector bit
  or (hl)
  ld (hl),a
  ret

; Free block DE's allocation bit. BITPTR
; skips 0/past-DSM references. Otherwise
; AND the vector byte with the
; complemented mask, keeping other bits.
; Changes AF/BC/DE/HL. IX may become the
; DPB.

CLRBLK:
  call BITPTR    ; HL=byte, A=mask
  ret z          ; Z: no vector bit
  cpl            ; keep every other bit
  and (hl)
  ld (hl),a
  ret

; Locate block DE's MSB-first vector
; bit. For DE=0 return Z without loading
; IX. For DE>DSM return Z after BLKPAST
; sets IX. Marking/freeing tolerate
; these cells. A zero block reads as
; EOF. A nonzero past-DSM read instead
; takes CHKBLK's error.
; Otherwise return NZ,
; HL=(ALVPTR)+floor(DE/8) and
; A=80h>>(DE&7). BC/DE change. A/HL/F
; are results. IX is the DPB for nonzero
; input.

BITPTR:
  ld a,d
  or e
  ret z          ; 0: unallocated cell
  call BLKPAST   ; carry: past DSM
  sbc a,a        ; carry -> FFh
  inc a          ; FFh -> 0/Z
  ret z
  ld a,e
  and 7          ; bit position 0..7
  ld b,a
  ex de,hl       ; block index -> HL
  call SRLHL2
  call SRLHL     ; block/8

  ld de,(ALVPTR)
  add hl,de
  inc b
  ld a,1         ; 80h after the first

SHIFBIT:
  rrca           ; MSB-first mask
  djnz SHIFBIT
  or a           ; NZ: valid mask
  ret

; HL shifted right two places (SRLHL2)
; or one (SRLHL). Changes F.

SRLHL2:
  srl h
  rr l

SRLHL:
  srl h
  rr l
  ret

; Test CURDRV's bit. LOGTEST loads
; LOGINV's 16-bit value into DE. VTEST
; takes that value directly and
; preserves DE. Return NZ if set or Z if
; clear. An absent login bit requires a
; rebuild at next login. Changes
; AF/B/HL.

LOGTEST:

  ld de,(LOGINV)

VTEST:
  call DRVMASK   ; HL=current drive bit
  ld a,l
  and e
  ld l,a
  ld a,h         ; high eight drives
  and d
  or l           ; NZ: drive bit set
  ret

; VCLR clears CURDRV's bit in the
; two-byte vector at HL. Save its
; address over DRVMASK and form BC as
; the complemented drive mask. Changes
; AF/BC/HL.
; ANDV applies input BC as a keep mask
; to both bytes at HL. Changes AF/HL.
; Both entries update the vector in
; place.

VCLR:
  push hl        ; keep vector address
  call DRVMASK
  ld a,l         ; complement low mask
  cpl
  ld c,a
  ld a,h         ; complement high mask
  cpl
  ld b,a
  pop hl

ANDV:
  ld a,(hl)      ; A..H byte
  and c
  ld (hl),a
  inc hl
  ld a,(hl)      ; I..P byte
  and b
  ld (hl),a
  ret

; Set CURDRV's bit in the two-byte
; vector at HL. Save the address across
; DRVMASK and OR its DE mask into both
; bytes. Keep other bits. Changes
; AF/B/DE/HL.

VSET:
  push hl        ; keep vector address
  call DRVMASK
  ex de,hl       ; DE=current drive bit
  pop hl

VSETDE:
  ld a,(hl)      ; A..H byte
  or e
  ld (hl),a
  inc hl
  ld a,(hl)      ; I..P byte
  or d
  ld (hl),a
  ret

; Form HL=1<<drive for a valid drive
; 0..15. DRVMASK reads CURDRV. MASKA
; takes A directly. Return A=drive,
; preserving C/DE. Changes B/F. Drive 0
; needs no loop. No input validation is
; performed here.

DRVMASK:
  ld a,(CURDRV)

MASKA:
  ld b,a         ; drive shift count
  ld hl,1        ; drive A bit
  or a
  ret z          ; drive 0: no shift

MASKLOOP:
  add hl,hl
  djnz MASKLOOP
  ret

; RONZ returns NZ when CURDRV is
; read-only in ROVEC, using VTEST. CHKRO
; returns only when writable. Otherwise
; enter BDERR with ERRRO and error 2.
; The internal caller is not resumed,
; including under returned-error policy.
; Changes AF/B/DE/HL.

RONZ:
  ld de,(ROVEC)  ; software/mount R/O
  jr VTEST       ; VTEST preserves DE

CHKRO:
  call RONZ
  ret z
  ld hl,ERRRO
  ld b,2         ; error 2: drive R/O
  jr BDERR

; End the function through BDERR with
; HL=ERRSEL and B=4. Error policy
; chooses return to the program or
; abort. The internal caller is not
; resumed.

SELFAIL:
  ld hl,ERRSEL
  ld b,4         ; error 4: select
  jr BDERR
