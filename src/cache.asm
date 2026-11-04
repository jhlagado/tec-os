; The block cache: 30 lines of 512 bytes
; in EXPAND 1 at 8000h-BBFFh, keyed
; by card block, with its table in the
; page at BC00h: each line's block,
; 4 bytes from BC00h (FFFFFFFFh for an
; empty line), and its dirty byte from
; BC80h. Every volume's reads go through
; it. A volume whose descriptor has
; byte 15 bit 0 set is written behind:
; its writes stay in their lines until
; a directory write of the volume, no
; clean line left, warm boot or a
; remount writes them, data before
; directory. Every other volume is
; written
; through as before, and its line
; refreshed.
;
; Blocks go straight between the card
; and a line: SDREAD and SDWRITE put
; EXPAND 1 in view around their block
; loops when SDXB is LATEXP. Nothing
; here uses the stack while EXPAND 1 is
; in view, and the BIOS entries run
; with interrupts off (CDI, CEI), so
; none can arrive while it is.

; CTAB, CDIRTY and NLINES are in
; layout.asm.

; HL = line A's block in the table
; (CTADR), or entry A of the page
; (CTENT),
; and A = the latch value with EXPAND 1
; in view (CXON), for the caller's OUT.
; Takes A < 64 for CTADR, so that A * 4
; fits L. Destroys F.
CTADR:
  add a,a        ; 4 bytes a line's
                 ; block
  add a,a

CTENT:
  ld l,a         ; the table's page:
                 ; CTAB is page-aligned
  ld h,CTAB>>8

CXON:
  ld a,(LATCHV)  ; the latch as it
                 ; stands, with EXPAND 1
  or LATEXP      ; behind the window at
                 ; 8000h-BFFFh
  ret

; Look up SDLBA's block: Z with A = its
; line; NZ if no line has it.
; Takes SDLBA. Destroys BC, DE, HL; the
; latch is left as LATCHV.
CLOOK:
  ld de,(SDLBA)  ; the block wanted in
                 ; BCDE, low byte in E
  ld bc,(SDLBA+2)
  xor a          ; from line 0's entry,
                 ; the table in view
  call CTENT
  out (SYSLAT),a

CLK1:
  ld a,(hl)      ; each byte against the
                 ; block's, low first;
  cp e           ; any difference moves
                 ; to the next line
  jr nz,CLK2
  inc l          ; the second byte
  ld a,(hl)
  cp d
  jr nz,CLK2
  inc l          ; the third
  ld a,(hl)
  cp c
  jr nz,CLK2
  inc l          ; the top byte decides
                 ; it
  ld a,(hl)
  cp b
  jr z,CLK3

CLK2:
  ld a,l         ; the next line's block
  or 3           ; past this entry's
                 ; last byte, from any
                 ; of
  inc a          ; its four, to the next
                 ; multiple of 4
  ld l,a
  cp NLINES*4    ; past the last line's
                 ; entry: not cached
  jr c,CLK1
  ld a,(LATCHV)  ; not found
  out (SYSLAT),a
  or 1           ; NZ
  ret

CLK3:
  ld a,(LATCHV)  ; EXPAND 0 back in view
  out (SYSLAT),a
  ld a,l         ; found: A = the line,
                 ; Z
  rrca           ; L is the entry's last
                 ; byte, line * 4 + 3:
  rrca           ; its two low bits
                 ; rotate to the top and
                 ; go
  and $3F
  cp a           ; Z for found
  ret

; Line A's entry: block SDLBA and clean
; (CSET), or empty (CDROP). Keeps A.
; Returns Z. Destroys BC, DE, HL.
CSET:
  ld de,(SDLBA)  ; the block to enter,
                 ; as CLOOK compares it
  ld bc,(SDLBA+2)
  jr CENT

CDROP:
  ld de,$FFFF    ; FFFFFFFFh: an empty
                 ; line, which no
  ld b,d         ; block on a card can
                 ; match
  ld c,e

CENT:
  push af        ; the line, kept
  call CTADR     ; the table in view, HL
                 ; at the line's entry
  out (SYSLAT),a
  ld (hl),e      ; four bytes, low first
  inc l
  ld (hl),d
  inc l
  ld (hl),c      ; then the high word
  inc l
  ld (hl),b
  ld a,(LATCHV)  ; EXPAND 0 back in view
  out (SYSLAT),a
  pop af         ; the line again, its
                 ; dirty byte next

CDCLR:
  ld c,0         ; clean
  jr CDPUT

; Line A's dirty byte: Z if it is clean
; (CDGET); set it (CDSET), clear it
; (CDCLR) or make it C (CDPUT). Each
; keeps A, returns Z for a clean line
; and NZ for a dirty one, and destroys
; B, C and HL.
CDGET:
  ld c,$FF       ; FFh: read, nothing
                 ; written
  jr CDPUT

CDSET:
  ld c,1         ; dirty

CDPUT:
  push af        ; the line, kept
; the dirty bytes follow the blocks in
; the
  add a,CDIRTY-CTAB
  call CTENT     ; table's page
  out (SYSLAT),a
  ld a,c
  inc a
  jr z,CDP1      ; FFh: only read it
  ld (hl),c

CDP1:
  ld b,(hl)      ; the byte as it now
                 ; stands, for the flags
  ld a,(LATCHV)  ; EXPAND 0 back in view
  out (SYSLAT),a
  pop af
  inc b          ; Z from the dirty
                 ; byte, A kept
  dec b
  ret

; HL = line A's address: 8000h + A *
; 512. Destroys A.
CLADR:
  add a,a        ; two pages a line,
                 ; from 80h
  add a,$80
  ld h,a
  ld l,0
  ret

; Read SDLBA's block straight into line
; A (CFILL), or write line A straight
; to its block (CWRITE). Z on success.
; CFILL enters the line on success and
; leaves it empty otherwise. CWRITE
; takes the block from the table, keeps
; SDLBA, marks the line clean on
; success, and on a failure leaves it
; dirty
; and returns NZ. CWRITE keeps A; CFILL
; keeps it on success only, a failure
; returning A = the line OR 1. Both
; destroy BC, DE and HL; CWRITE maps the
; record again (MAPREC), so BLKOFF and
; BLKSLOT are set as before.
CFILL:
  push af        ; the line
  call CLADR     ; the card's block to
                 ; the line's address,
  ld a,LATEXP    ; with EXPAND 1 in view
                 ; for the transfer
  ld (SDXB),a
  call SDREAD
  push af        ; SDREAD's Z
  xor a          ; the next transfer is
                 ; the program's again
  ld (SDXB),a
  pop af
  jr nz,CFL9
  pop af         ; read: the line holds
                 ; the block
  jr CSET        ; Z

CFL9:
  pop af         ; failed: the line's
                 ; old bytes are gone,
  call CDROP     ; so it holds no block
  or 1           ; NZ
  ret

CWRITE:
  push af        ; the line
  call CTADR     ; its block from the
                 ; table, into BCDE
  out (SYSLAT),a
  ld e,(hl)      ; low byte first
  inc l
  ld d,(hl)
  inc l
  ld c,(hl)      ; then the high word
  inc l
  ld b,(hl)
  ld a,(LATCHV)  ; EXPAND 0 back in view
  out (SYSLAT),a
  ld (SDLBA),de  ; the block SDWRITE
                 ; writes
  ld (SDLBA+2),bc
  pop af
  push af
  call CLADR     ; from the line's
                 ; address, EXPAND 1 in
  ld a,LATEXP    ; view for the transfer
  ld (SDXB),a
  call SDWRITE
  push af        ; SDWRITE's Z
  xor a          ; the next transfer is
                 ; the program's again
  ld (SDXB),a
  call MAPREC    ; SDLBA back as the
                 ; caller mapped it
  pop bc
  pop af
  bit 6,c        ; SDWRITE's Z
  jr z,CWR9
  call CDCLR     ; written: clean
  cp a
  ret

CWR9:
  ld c,a         ; the line, kept
  xor a
  inc a          ; NZ: the write failed
  ld a,c
  ret

; Write every dirty line (CFLALL), or
; every one but line A (CFLUSH). Each
; is tried, and the flush returns NZ if
; any write failed, Z if none. CFLALL
; drops a line whose write fails, so the
; card's copy stands; CFLUSH, a
; directory write's, leaves it dirty,
; the only copy of its records, for a
; later flush to try (KE-AR8). Returns A
; = the line left (FFh for
; CFLALL). Destroys BC, DE and HL;
; SDLBA, BLKOFF and BLKSLOT are mapped
; again from the BIOS's track and
; sector, as CWRITE leaves them.
CFLALL:
  ld a,$FF       ; no line is FFh: every
                 ; one is written

CFLUSH:
  ld c,a         ; the line to leave
  ld b,0         ; lines that failed
  xor a          ; from line 0

CFS1:
  cp c
  jr z,CFS2      ; the one left
  push bc
  call CDGET     ; Z: clean, nothing to
                 ; write
; keeps A, NZ if the card refused it
  call nz,CWRITE
  pop bc
  jr z,CFS2
  inc b          ; failed: counted
  ld e,a         ; the line, kept
  ld a,c         ; C FFh: CFLALL, which
                 ; drops it
  inc a
  ld a,e
  jr nz,CFS2     ; CFLUSH: the line
                 ; stays dirty
  push bc
  call CDROP     ; dropped, the card's
                 ; copy stands
  pop bc

CFS2:
  inc a          ; every line, failures
                 ; or not
  cp NLINES
  jr c,CFS1
  ld a,c         ; the line left, for
                 ; CWB3
  inc b
  dec b          ; NZ if any failed
  ret

; A line for SDLBA's block: the next
; clean one in turn, or, with every line
; dirty, the next in turn written first.
; Z with A = the line; NZ if that
; write failed, the line left dirty for
; a flush to try (KE-187). CNEXT moves
; past the line taken, or the line that
; failed, so the next miss tries
; another. The line keeps its entry: the
; caller fills or enters it.
; Destroys BC, DE, HL.
CTAKE:
  ld b,NLINES    ; every line looked at
                 ; once at most
  ld a,(CNEXT)   ; from the next in
                 ; turn, in the dirty
                 ; bytes
  add a,CDIRTY-CTAB
  call CTENT
; the table in view
  out (SYSLAT),a

CTK1:
  ld a,(hl)      ; 0: clean
  or a
  jr z,CTK3      ; clean
  inc l          ; dirty: the next, past
                 ; the last line
  ld a,l         ; back to line 0
  cp CDIRTY-CTAB+NLINES
  jr c,CTK2
  ld l,CDIRTY-CTAB

CTK2:
  djnz CTK1

CTK3:
  ld a,(LATCHV)  ; EXPAND 0 back in view
  out (SYSLAT),a
  ld a,l         ; the line: CNEXT's
                 ; again if all were
                 ; dirty
  sub CDIRTY-CTAB
  inc b          ; B counts down only
                 ; past dirty lines:
  dec b          ; 0 when none was clean
  jr nz,CTK5     ; a clean line
  call CWRITE    ; every line dirty:
                 ; this one written
                 ; first
  jr z,CTK5
  call CTK5      ; failed: CNEXT past it
                 ; all the same
  or 1           ; NZ
  ret

CTK5:
  ld e,a         ; the line taken
  inc a          ; the next in turn is
                 ; the one after it,
  cp NLINES      ; line 0 after the last
  jr c,CTK4
  xor a

CTK4:
  ld (CNEXT),a
  ld a,e
  cp a           ; Z: A is the line
  ret

; Copy the mapped record between line A
; and DSKDMA: to DSKDMA (CRDREC) or
; from it (CWRREC), by MVCOPY. Takes
; BLKSLOT, the record in the block.
; Returns A = 0. Destroys BC, DE and HL.
; CRECAD alone returns HL = the
; record's address in line A, and
; destroys A.
CRECAD:
  call CLADR
; slot * 128: its half page in L, its
; page
  ld a,(BLKSLOT)
  srl a          ; added to H
  rr l
  add a,h
  ld h,a
  ret

CRDREC:
  call CRECAD    ; HL = the record in
                 ; the line
  ex de,hl       ; from the line in DE,
                 ; to DSKDMA in HL
  ld hl,(DSKDMA)
  ld bc,$0100    ; XMDST bank 0, XMSRC
                 ; bank 1
  jr CREC

CWRREC:
  call CRECAD    ; to the line in HL,
                 ; from DSKDMA in DE
  ld de,(DSKDMA)
  ld bc,$0001    ; XMDST bank 1, XMSRC
                 ; bank 0

CREC:
  ld (XMDST),bc  ; XMSRC follows XMDST:
                 ; both set at once
  ld bc,128      ; one record
  jp MVCOPY

; BIOS READ, every volume: a hit is
; copied from its line; a miss is read
; straight into the next line, then
; copied from it. Takes SDLBA and
; BLKSLOT from MAPREC. Z with A = 0 on
; success; NZ on a card error.
; Destroys BC, DE and HL.
CREAD:
  call CLOOK
  jr z,CRD1      ; a hit: A is its line
  call CTAKE     ; a miss: a line for
                 ; it, and the block
                 ; read
  ret nz         ; into it
  call CFILL
  ret nz

CRD1:
  call CRDREC    ; the record to the
                 ; program
  xor a          ; Z: read
  ret

; BIOS WRITE, every volume, from BWRITE
; with its checks done and C = 1 when
; the block needs no pre-read. The
; record goes into the block's line,
; which is
; dirty. On a volume written through
; (CWTYPE bit 7) the line is written to
; the
; card before the call returns, and
; dropped if that fails. On the one
; written
; behind a directory write then writes
; every dirty line and its own last, and
; never leaves its line dirty. Z on
; success. Takes CWTYPE (the BDOS's
; write
; type in bits 0 and 1, bit 7 written
; through) and sets its bit 6 when a
; line is taken for the write. Destroys
; A, BC, DE and HL.
CWRBH:
  push bc        ; C, the pre-read
                 ; rule's answer, kept
  call CLOOK
  pop bc
  jr z,CWB1      ; the line has it
  push bc
  call CTAKE
  pop bc
  ret nz         ; no line: a dirty
                 ; one's write failed
  ld hl,CWTYPE   ; a line taken for this
                 ; write
  set 6,(hl)
  inc c
  dec c
  jr z,CWBF      ; the card's block
                 ; first

CWB1:
  dec c
  jr nz,CWBK     ; a line's bytes kept
  push af        ; nothing to keep, a
                 ; hit's old bytes too:
  call CLADR     ; cleared, as written
                 ; through
  call CXON
  out (SYSLAT),a
  ld d,h         ; 512 zeros: the first
                 ; stored, then LDIR
  ld e,l         ; spreads it over the
                 ; other 511
  inc de
  ld bc,511
  ld (hl),0
  ldir
  ld a,(LATCHV)  ; EXPAND 0 back in view
  out (SYSLAT),a
  ld c,2         ; BWRITE's key: this
                 ; block cleared
  call GETKEY
  pop af
  call CSET      ; the line holds the
                 ; block, clean so far
  jr CWB2

CWBF:
  call CFILL     ; the card's block
                 ; first
  ret nz
; A write that keeps a line's bytes, to
; any block but the key's own, ends the
; run of blocks cleared rather than
; read:
; the key goes, so that the rule never
; clears a block written after the
; key's,
; records and all (KE-AR7).
CWBK:
  ld c,a         ; C = the line, kept
; this block against the key's
  ld hl,(BLKOFF)
  ld de,(BUFBLK)
  or a           ; carry clear for the
                 ; compare
  sbc hl,de
  jr nz,CWBK0    ; another block: the
                 ; key goes
  ld a,(BUFDRV)  ; the key's block
                 ; number: on this
                 ; drive?
  ld hl,DSKCUR
  cp (hl)
  jr z,CWBK1     ; the key's own block:
                 ; it stands

CWBK0:
  xor a          ; the key dropped,
                 ; BUFOK 0: not cleared,
  ld (BUFOK),a   ; not read

CWBK1:
  ld a,c         ; the line again

CWB2:
  push af
  call CWRREC    ; the record into the
                 ; line, now dirty
  pop af
  call CDSET
  ld c,a         ; the line, kept over
                 ; the type's test
  ld a,(CWTYPE)
  or a           ; bit 7 to the sign
  jp m,CWBT      ; written through: to
                 ; the card now
  rrca           ; type 1, a directory
                 ; block: bit 0, as
  jr c,CWB3      ; bit 6 may say a line
                 ; was taken
  xor a          ; data: done
  ret

CWBT:
  ld a,c         ; written through: the
                 ; line to the card
  call CWRITE
  jr nz,CWBX     ; failed: the line goes
  ld hl,CWTYPE
  bit 6,(hl)     ; a line taken for this
                 ; write is the next
  ret z          ; in turn again:
                 ; writing through
                 ; churns
  ld (CNEXT),a   ; that one line, not
                 ; the programs' blocks,
  cp a           ; and keeps the block
                 ; for its next record
  ret

CWB3:
  ld a,c         ; a directory block:
                 ; the volume's data
                 ; first,
  call CFLUSH    ; then the directory
                 ; line; if either
                 ; fails,
  call z,CWRITE  ; the directory line
                 ; goes, so the card's
  ret z          ; directory stays the
                 ; truth and is read
; again; a data line that failed stays
; dirty, for the next flush
CWBX:
  call CDROP     ; A is the line, from
                 ; CWRITE or CFLUSH
  or 1           ; NZ
  ret

; Warm boot: every dirty line tried,
; and, if any failed and was dropped,
; Write lost said once. The rest of a
; chained line goes, as it does on a
; BDOS
; error's exit. Returns Z when every
; line was written. Destroys A, BC, DE
; and HL.
CWBOOT:
  call CFLALL
  ret z          ; every line written
  xor a
  ld (CHPOS),a   ; the chained line goes
  ld hl,CWMSG    ; Write lost; PUTS
                 ; returns to the caller
  jp PUTS

CEND:

; MVCOPY: the cache's copy between
; EXPAND 0 and EXPAND 1. BC bytes from
; DE to
; HL, forward as LDIR does, XMDST and
; XMSRC the destination's and source's
; banks: 0 the program's view, 1 EXPAND
; 1. Returns A = 0 with HL and DE
; advanced by BC. Destroys BC and F, and
; MVREST; the alternate registers are
; kept, and the latch and the interrupt
; state are as it found them.
;
; With interrupts off, EXPAND 1 is
; switched in only around code that uses
; no
; stack, as the caller's stack may be in
; EXPAND 0. Within one bank: LDIR in
; that bank's view. Across banks, the
; bank-0 end's part below 8000h, in the
; fixed RAM, copies by LDIR with EXPAND
; 1 in view; its part in EXPAND 0
; copies a byte at a time, the latch
; switched between each read and write,
; with the two latch values in D' and
; E'.
MVCOPY:
  ld a,b         ; nothing to copy: done
                 ; at once
  or c
  jp z,MVOK
  call IFFGET    ; P/V: the interrupt
                 ; state, kept with the
  di             ; flags until the end
  push af
  exx            ; the alternate set
                 ; holds the latch
                 ; values
  push bc        ; and the port: the
                 ; caller's BC' and DE'
  push de        ; kept
  ld c,SYSLAT
  ld a,(LATCHV)
  ld d,a         ; the source's latch
  ld e,a         ; the destination's
  ld a,(XMSRC)
  or a
  jr z,MV1       ; source in bank 0:
                 ; EXPAND 0 for it
  set 2,d
; the destination's bank, the same way
MV1:
  ld a,(XMDST)
  or a
  jr z,MV2
  set 2,e
; equal latches: both ends in one bank
MV2:
  ld a,d
  cp e
  exx
  jr z,MVLDIR    ; one bank
  push hl        ; the destination, kept
  ld a,(XMDST)
  or a
  jr z,MV3       ; the destination is
                 ; the bank-0 end
  ld h,d         ; HL = the bank-0 end
  ld l,e

MV3:
  push de        ; the source, kept
  ex de,hl
  ld hl,$8000    ; 8000h less the bank-0
                 ; end
  or a
  sbc hl,de      ; bytes below 8000h
  pop de
  jr c,MVNONE    ; the bank-0 end is at
                 ; 8000h or above:
  jr z,MVNONE    ; every byte one at a
                 ; time
  sbc hl,bc      ; carry is clear
  jr c,MV4
  ld hl,0        ; all of it is below
                 ; 8000h

MV4:
  add hl,bc      ; HL = the part below
                 ; 8000h
  push hl        ; BC = that part, HL =
                 ; the count
  ld h,b
  ld l,c
  pop bc
  or a
  sbc hl,bc      ; the count less that
                 ; part
; and the part in EXPAND 0
  ld (MVREST),hl
  pop hl         ; the destination again
  exx
  ld a,d         ; one latch has the
                 ; EXPAND bit, the other
  or e           ; EXPAND 1 in view
  out (c),a
  exx
  ex de,hl       ; LDIR copies from HL
                 ; to DE
  ldir
  ex de,hl
  exx
  ld a,d         ; the bit taken out of
                 ; both
  and e          ; EXPAND 0 in view
  out (c),a
  exx
; the rest by the byte loop, from where
  ld bc,(MVREST)
  jr MVBYTE      ; LDIR left HL and DE

MVNONE:
  pop hl         ; the destination again

MVBYTE:
  ld a,b         ; nothing for the byte
                 ; loop: done
  or c
  jr z,MVEND

MVBL:
  exx            ; the source's bank in
                 ; view for the read
  out (c),d
  exx
  ld a,(de)
  exx            ; the destination's for
                 ; the write
  out (c),e
  exx
  ld (hl),a
  inc hl         ; forward, as LDIR,
                 ; until BC is 0
  inc de
  dec bc
  ld a,b         ; the count's two
                 ; bytes: 0 ends it
  or c
  jr nz,MVBL
  jr MVEND       ; the caller's latch
                 ; back

MVLDIR:
  exx            ; one bank: its view,
                 ; and one LDIR
  out (c),d
  exx
  ex de,hl       ; LDIR copies from HL
                 ; to DE
  ldir
  ex de,hl

MVEND:
  ld a,(LATCHV)  ; page zero is in MAIN
                 ; 0, always in view
  out (SYSLAT),a
  exx            ; the caller's BC' and
                 ; DE' back
  pop de
  pop bc
  exx
  pop af         ; P/V clear (PO):
                 ; interrupts were off,
; and stay so
  jp po,MVOK
  ei

MVOK:
  xor a
  ret
