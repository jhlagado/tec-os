; Load services and publish records.
; A .SVC file at 0100h contains the
; page-0 header/image, dependencies and
; relocation data in that order.
; Move header/image together to a page
; boundary below the top. Reserve whole
; pages downwards from the stub.
; Relocation uses the header's base.
; Reuse file-header fields after their
; load-time values are no longer needed.
;
; SVCHEAD is the lowest service's page.
; DOWN links to the previous owner above
; it. Zero ends the owner list.
;
; INIT returns linked records: link,
; eight-byte name, version and entry
; table address. REGHEAD points to the
; newest record. If the ROM PICO console
; started at cold boot, PIREC is the
; permanent tail. UNLOAD cannot remove
; that record.

; Magic: 'D' followed by SVCFMT.

DMAGIC EQU SVCFMT*256+'D'
DF EQU $0100     ; LOADCOM staging base
DDEP EQU 2       ; dependency count
DFLG EQU 3       ; bit 0 removable, bits
                 ; 1-7 RST 1-7 claimed
DREM EQU 4       ; header-relative
                 ; REMOVE
DSIZ EQU 6       ; header/image bytes
DOLD EQU 6       ; saved REGHEAD
DXTR EQU 8       ; extra RAM after image
DOWN EQU 8       ; previous owner page
DREL EQU 10      ; relocation bytes
DSTK EQU 12      ; BDOS/BIOS/CCP stacks

; DSTK: declared stack use in the file,
; remaining room when resident.

DINI EQU 15      ; header-relative INIT
DNAM EQU 17      ; 8 bytes
DHLEN EQU 25     ; image starts here
DRECSZ EQU 13    ; registry record bytes

; Last byte of the startup record.

STLAST EQU STREC+127

; Set PZTOP and the word at 0006h to the
; lowest owner's page or the stub
; address when no owner remains.
; Returns carry clear, A = SVCHEAD and
; HL = top. Clobbers AF and HL.

SLTOP:

  ld a,(SVCHEAD)
  ld h,a
  ld l,0         ; page-aligned top
  or a           ; clear return carry
  jr nz,SLT1     ; resident top

; No resident: use the stub address.

  ld hl,(STUBAD)

SLT1:
  ld (PZTOP),hl  ; warm-boot ceiling

  ld (PZBDOS+1),hl
  ret

; Return carry set. Clobbers F. No
; memory writes.

SLFAIL:
  scf
  ret

; Remove the newest resident service.
; Reject removal if INIT/REMOVE is
; active, the top page differs from
; SVCHEAD or removal is disabled. No
; owner: fail.
; Carry set: a check failed or REMOVE
; set carry.
; No loader rollback of REMOVE effects.
; REMOVE must undo any partial changes
; before returning carry set.
; Success frees claimed restart slots,
; restores REGHEAD/SVCHEAD and the top,
; increments SVCGEN and resets vectors
; into the freed pages.
; Returns carry clear on success.
; Clobbers AF, BC, DE, HL and whatever
; REMOVE changes.

SVCUNL:
  ld a,(SVCBSY)  ; busy guard
  or a
  jr nz,SLFAIL   ; callback active
  ld hl,(PZTOP)
  ld l,a         ; HL at the top's page
  ld a,(SVCHEAD)
  cp h           ; top must match owner
  jr nz,SLFAIL   ; different top
  ld l,DFLG
  bit 0,(hl)     ; the removable flag
  jr z,SLFAIL    ; removal disabled
  push hl        ; save service page
  ld l,DREM
  call SVCCALL   ; REMOVE carry: failure
  call SVCSHUT   ; clear guard, keep C
  pop hl
  ret c          ; REMOVE must undo
  push hl        ; save page for cleanup
  call SVCFRE
  pop hl
  ld l,DOLD      ; saved registry head
  ld de,REGHEAD  ; restore saved heads
  ld bc,3        ; REGHEAD then SVCHEAD
  ldir
  ex de,hl       ; HL at SVCGEN
  inc (hl)
  ex de,hl
  call SLTOP     ; restore next ceiling
  jp PZSWP       ; reset freed vectors

; Install the staged service at 0100h,
; bounded by LOADTOP.
; Carry clear: installed. Carry set:
; SVCRC 0 rejected before INIT, 1 failed
; with pages released, 2 failed with
; pages retained but no records.
; SVCRA is INIT's A after INIT or 0
; after record rejection. Early failures
; leave SVCRA unchanged.
; Clobbers AF, BC, DE, HL and whatever
; INIT and REMOVE change.

SVCLOAD:
  xor a
  ld (SVCRC),a   ; pre-INIT status
  ld a,(SVCBSY)  ; callback busy guard
  or a
  jr nz,SLFAIL
  ld hl,(DF)     ; file signature
  ld de,DMAGIC
  sbc hl,de      ; carry clear from OR
  jr nz,SLFAIL   ; wrong magic/format

; Validate header/image extent in file.

  ld bc,(DF+DSIZ)
  inc h          ; HL = 0: now the file
  call SVCEXT    ; bound header/image
  ret c

; INIT must lie inside the image.

  ld hl,(DF+DINI)
  call SVCIN
  ret c

; REMOVE must also lie inside it.

  ld hl,(DF+DREM)
  call SVCIN
  ret c

; Allocate pages with base >= 8000h.

  ld hl,(DF+DXTR)
  add hl,bc      ; image plus extra RAM
  ret c          ; past 64K
  dec hl         ; H=pages-1
  ld a,(PZTOP+1)
  dec a          ; page below ceiling
  sub h          ; subtract pages-1
  ret c          ; no room under the top
  cp $80
  ret c          ; base below 8000h
  ld (SLDL),a    ; base/relocation delta
  ld h,b         ; dependencies follow
  ld l,c
  inc h          ; staged at 0100h

  ld a,(DF+DDEP)

SVCDL:
  or a
  jr z,SVCDE     ; dependencies checked
  push af
  push hl
  ld bc,9        ; nine-byte dependency
  call SVCEXT    ; bound it, B=0 lookup
  ex (sp),hl     ; save next pointer
  jr c,SVCDX     ; past the file
  ex de,hl
  ld a,(de)      ; min version then name
  ld c,a
  inc de
  call REGFIND   ; find compatible name

SVCDX:
  pop hl         ; the next dependency
  pop bc         ; B: remaining count
  ret c
  ld a,b
  dec a          ; one dependency done
  jr SVCDL

SVCDE:
  push hl        ; save relocation start
  ld bc,(DF+DREL)
  call SVCEXT    ; bound relocation data
  jr c,SVCSX
  ld hl,SVCLIM   ; ROM stack allowances

; Use the lowest resident's remaining
; allowances when present.

  ld a,(SVCHEAD)
  or a           ; resident allowances
  jr z,SVCS0
  ld h,a
  ld l,DSTK

SVCS0:
  ld de,DF+DSTK  ; declared stack use
  ld b,3         ; BDOS, BIOS and CCP

SVCSL:
  ld a,(hl)      ; remaining allowance
  ex de,hl
  sub (hl)       ; subtract declared use
  jr c,SVCSX     ; insufficient stack
  ld (hl),a      ; store remaining room
  ex de,hl
  inc hl
  inc de
  djnz SVCSL

SVCSX:
  pop de         ; DE: relocation start
  ret c

; Relocate marked image high bytes by
; the base page. DE addresses gap bytes.
; The first gap starts one byte before
; the image. A 255 gap advances without
; patching. Reject a position at or
; beyond the header/image end.

  ld bc,(DF+DREL)

  ld hl,DF+DHLEN-1

SVCR1:
  ld a,b
  or c
  jr z,SVCMOV    ; the list done
  dec bc
  ld a,(de)      ; next gap
  inc de
  push de
  ld e,a
  ld d,0
  add hl,de      ; advance fixup pointer
  inc a          ; 255: advance only
  push hl
  dec h          ; offset from header

; Compare with the header/image length.

  ld de,(DF+DSIZ)
  sbc hl,de      ; carry: below end
  pop hl
  pop de
  ccf
  ret c          ; outside image extent
  or a           ; restore gap Z test
  jr z,SVCR1     ; 255: no patch
  ld a,(SLDL)
  add a,(hl)     ; relocate high byte
  ld (hl),a
  jr SVCR1

; Check claimed RST 1-7 slots at
; 0008h-0038h before the move or INIT.
; Reject the load if a claimed slot
; already contains JP.

SVCMOV:

  ld a,(DF+DFLG)
  ld hl,8        ; RST1 slot
  ld de,8
  srl a          ; drop removable bit

SVCMC:
  srl a          ; carry: claimed slot
  jr nc,SVCMN
  ld c,a         ; the claims left
  ld a,(hl)
  cp $C3         ; JP already installed
  jp z,SLFAIL
  ld a,c

SVCMN:
  add hl,de      ; the next slot
  or a           ; claims remain?
  jr nz,SVCMC

; Save copy size before DOLD overwrites
; DSIZ.

  ld bc,(DF+DSIZ)
  push bc
  ld hl,REGHEAD  ; saved resident heads
  ld de,DF+DOLD  ; DOLD then DOWN
  ld bc,3        ; REGHEAD then SVCHEAD
  ldir
  ld hl,BENTRY   ; page entry to BDOS
  ld (DF+1),hl
  ld a,$C3       ; replace file magic
  ld (DF),a
  pop bc
  ld hl,DF       ; header/image source
  ld a,(SLDL)
  ld d,a         ; resident base page
  ld e,l         ; DF low byte is zero
  ldir
  ld h,a
  ld l,b         ; BC=0 after copy

  ld (PZBDOS+1),hl

; INIT runs with 0006h lowered and PZTOP
; at the previous ceiling.
; Warm boot restores that ceiling and
; abandons the load without REMOVE.
; INIT must undo its external changes
; before returning carry set.
; Carry clear: HL is the first record or
; 0. Carry set goes to SVCSCAN.

  ld l,DINI
  call SVCCALL   ; INIT record result

  ld (SVCRA),a   ; INIT A for status1
  call SVCBND    ; D/E: service interval
  jr c,SVCSCAN   ; INIT failed
  push hl        ; the first record

; Bound INIT's record chain to 255 new
; records and 256 records in total.
; TNFIND walks at most 256.
; With N existing records, B = 1-N
; limits the new chain. For N=0 or 1,
; B=0 rejects its 256th record.

  ld hl,(REGHEAD)
  ld b,0
  ld a,h
  or l
  jr z,SVCNE     ; none in: 255 allowed

SVCNT:
  ld a,(hl)      ; next registry link
  inc hl
  ld h,(hl)
  ld l,a
  or h
  jr z,SVCNE     ; the last counted
  dec b          ; decrease new limit
  jr nz,SVCNT    ; bound existing walk
  jr SVCRF       ; record-check failure

SVCNE:
  pop hl         ; INIT record head
  push hl

SVCWK:
  ld a,h
  or l
  jr z,SVCLK     ; chain end: link it
  ld (SLN),hl    ; the last so far
  call SVCCK     ; bound record start
  jr c,SVCRF
  push bc        ; save count limit
  ld c,(hl)
  inc hl
  ld b,(hl)
  push bc        ; the link
  ld bc,DRECSZ-2
  add hl,bc      ; record last byte
  call SVCCK
  jr c,SVCWX
  ld a,(hl)      ; entry-table page
  call SVCCKA    ; in them too

SVCWX:
  pop hl         ; the next record
  pop bc
  jr c,SVCRF     ; a check failed
  djnz SVCWK     ; new-record limit

SVCRF:
  pop hl         ; discard saved head
  xor a          ; no INIT error cause
  ld (SVCRA),a   ; record rejection A=0
  ld h,d         ; the service's page
  ld l,DREM
  call SVCCALL   ; REMOVE after bad list
  call SVCBND    ; bounds, carry kept
  jr c,SVCKEEP   ; keep unlisted pages

; After failed INIT or successful
; cleanup of rejected records, scan the
; RAM BIOS JP targets. If a RAM BIOS JP
; targets the service, retain its pages
; with removal disabled and no records:
; SVCRC 2.
; Otherwise free claimed slots, restore
; 0006h from PZTOP, sweep vectors and
; return SVCRC 1.

SVCSCAN:

; First RAM BIOS target high byte.

  ld hl,RAMBIOS+2

; Each JP entry is three bytes.

  ld b,BIOSLEN/3

SVCSC1:
  ld a,(hl)
  call SVCCKA    ; target in service?
  jr nc,SVCHIT
  inc hl         ; next target high byte
  inc hl
  inc hl
  djnz SVCSC1
  ld h,d         ; service page for free
  call SVCFRE    ; clear claimed slots
  ld hl,(PZTOP)  ; previous ceiling
  ld (PZBDOS+1),hl
  call PZSWP
  ld a,1         ; pages released
  jr SVCRET

SVCHIT:
  ld e,DFLG      ; DE at its flags
  xor a
  ld (de),a      ; disable flag bits

SVCKEEP:
  ld a,2         ; failed, pages kept
  ld (SVCRC),a
  jr SVCCOM      ; commit no records

SVCLK:
  pop hl         ; INIT record head
  ld a,h
  or l
  jr z,SVCCOM    ; INIT gave none

; Prepend the new chain. Its last link
; points to the old REGHEAD.

  ld bc,(REGHEAD)

  ld (REGHEAD),hl
  ld hl,(SLN)
  ld (hl),c      ; last new record link
  inc hl
  ld (hl),b

SVCCOM:
  ld a,d         ; lowest resident page
  ld (SVCHEAD),a
  ld h,a
  ld l,0
  ld (PZTOP),hl  ; the commit
  ld a,(SVCRC)   ; 0 loaded, 2 retained

SVCRET:
  ld (SVCRC),a
  cp 1           ; C for 0 before CCF
  ccf            ; C for failures 1/2

; Clear SVCBSY after INIT/REMOVE.
; Keeps flags. Clobbers A.

SVCSHUT:
  ld a,0         ; LD preserves carry
  ld (SVCBSY),a
  ret

; Clear the first byte of each RST slot
; claimed by service page H. PZSWP then
; restores slot defaults.
; Clobbers AF, DE and HL. Returns D=0.

SVCFRE:
  ld l,DFLG
  ld a,(hl)      ; RST1-7 claim bitmap
  ld hl,8        ; RST 1's slot
  ld de,8        ; slot stride, D=0 byte
  srl a          ; drop removable bit

SVCUC:
  srl a          ; carry: claimed slot
  jr nc,SVCUN
  ld (hl),d      ; mark for default

SVCUN:
  add hl,de      ; ADD keeps SRL Z
  jr nz,SVCUC    ; claims remain
  ret

; Call the header-relative offset stored
; at HL, with header page in H.
; Set SVCBSY=80h until SVCSHUT to block
; loads and removals during INIT/REMOVE.
; The callback returns directly to
; SVCCALL's caller. Clobbers A, E and HL
; before entering the callback.

SVCCALL:
  ld a,$80       ; callback busy guard
  ld (SVCBSY),a
  ld e,(hl)      ; the offset's low byte
  inc l
  ld a,(hl)
  add a,h        ; offset high + page
  ld h,a
  ld l,e
  jp (hl)        ; returns to the caller

; Return D = SLDL base page and E =
; exclusive upper page, from the
; resident DOWN byte or the stub page.
; Keeps carry and HL. Clobbers A.

SVCBND:
  ld a,(SLDL)    ; the base page
  ld d,a
  ld e,DOWN      ; DOWN byte offset
  ld a,(de)
  call SVCABV
  ld e,a
  ret

; A = previous owner page or 0.
; Return that page or the stub page for
; 0 as the exclusive upper boundary.
; Keeps carry. Other flags change.

SVCABV:
  inc a          ; INC/DEC keep carry
  dec a          ; Z: original A was 0
  ret nz         ; the owner's page

; No owner above: use the stub page.

  ld a,(STUBAD+1)
  ret

; Test page H or A at SVCCKA against D
; <= page < E. Carry set: outside.
; SVCCK loads A from H.

SVCCK:
  ld a,h

SVCCKA:
  cp d
  ret c          ; below the service
  cp e
  ccf            ; carry at or above E
  ret

; Return HL+BC in HL. Carry set on
; overflow or an endpoint beyond
; LOADTOP. An endpoint equal to LOADTOP
; is valid. Clobbers DE.

SVCEXT:
  add hl,bc
  ret c          ; past 64K
  ex de,hl

  ld hl,(LOADTOP)
  sbc hl,de      ; carry: endpoint past
  ex de,hl
  ret

; Check DHLEN <= HL < BC, where BC is
; header/image length.
; Requires carry clear on entry,
; supplied by the callers' preceding
; checks.
; Carry set: invalid offset. Clobbers DE
; and HL.

SVCIN:
  ld de,DHLEN
  sbc hl,de      ; carry clear required
  ret c          ; inside the header
  add hl,de      ; restore valid offset
  sbc hl,bc
  ccf            ; carry: at/past end
  ret

; TNFIND: DE = eight-byte name padded
; with spaces, B = minimum version.
; Carry clear: HL = entry table, A =
; generation. Carry set: no match.
; Keeps DE. Clobbers BC. See abi.inc.

SVFND:
  ld c,b         ; private version in C
  ld b,0         ; 256 records at most
  jr REGFIND

; TNLIST: B = index, newest first at 0.
; Carry clear: HL = record, A =
; generation. Carry set: past the end.
; Clobbers C. See abi.inc.

SVLST:
  ld c,b

  ld hl,(REGHEAD)
  inc c          ; index 0 means count1

SVCS1:
  ld a,h
  or l
  scf
  ret z          ; end: carry set
  dec c
  jr z,REGGEN    ; requested record
  ld a,(hl)      ; follow record link
  inc hl
  ld h,(hl)
  ld l,a
  jr SVCS1

; Find the newest record with the
; eight-byte name at DE and version >=
; C.
; Walk at most B records or 256 for B=0.
; Carry clear: HL = entry table, A =
; generation, BC = record address. Carry
; set: no match. Keeps DE.

REGFIND:
  ld hl,(REGHEAD)

REGF1:
  ld a,h
  or l
  scf
  ret z          ; the list's end: none
  push hl        ; save record/inputs
  push de
  push bc
  inc hl         ; skip link to name
  inc hl
  ld b,8

REGF2:
  ld a,(de)
  cp (hl)
  jr nz,REGF3    ; another name
  inc de
  inc hl
  djnz REGF2
  ld a,(hl)      ; the version
  cp c
  jr c,REGF3     ; version too old
  inc hl         ; HL = its entry table
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a
  pop bc         ; discard saved inputs
  pop de         ; restore name pointer
  pop bc         ; BC = the record

; Return A = SVCGEN with carry clear.

REGGEN:
  ld a,(SVCGEN)  ; changes on removal
  or a           ; carry clear: found
  ret

REGF3:
  pop bc         ; on to the next record
  pop de
  pop hl
  ld a,(hl)      ; by its link
  inc hl
  ld h,(hl)
  ld l,a
  djnz REGF1     ; until the limit
  scf
  ret

; Loaded display driver

; CON UC1: load A:GLCD.SVC through SVCGO
; unless CDGLC is already set.
; Carry clear: installed. On returned
; carry-set failure, restore the CON:
; field to CONMOD and write GLCD? on LCD
; row 3. Default BDOS disk errors may
; exit without returning here.
; Clobbers AF, BC, DE and HL.

GLCLD:
  ld a,(CONDEV)
  and CDGLC
  ret nz         ; loaded, carry clear
  ld hl,GLCFCB   ; A:GLCD.SVC name
  ld de,CMDFCB
  ld bc,12       ; drive, name and type
  ldir
  call SVCGO
  ret nc         ; installed
  ld a,(CONMOD)  ; restore current mode
  ld b,a
  call CONFLD
  ld hl,GLCMSG   ; GLCD? status word
  jp LCDWRD

; Read the service named by CMDFCB and
; install it. If its page contains
; GLCD.SVC's table, clear the ROM's LCD
; status word and select GLCD unless
; PICO is active.
; Carry set: read/install failed.
; SVCRC=0 before INIT, 1 clean failure,
; 2 pages retained. SVCRA holds INIT's A
; or 0 after record rejection. Early
; failures leave it unchanged.
; Clobbers AF, BC, DE and HL.

SVCGO:
  xor a          ; clear load status
  ld (SVCRC),a
  call LOADCOM   ; stage at 0100h
  ret c
  call SVCLOAD
  ret c
  ld a,(SVCHEAD)
  ld hl,GLVEC+1  ; GLCD table page
  xor (hl)       ; not GLCD: carry clear
  ret nz
  ld hl,CONDEV
  set 2,(hl)     ; CDGLC
  ld b,CMUC1     ; GLCD console mode
  ld a,(CONMOD)  ; keep active PICO
  dec a          ; CMCRT is 1
  jr z,WRDCLR    ; clear status only

CONSET:
  call WRDCLR    ; clear ROM status word
  ld a,b         ; field and active mode
  jp CONSW

; Clear the ROM's LCD row-3 status word
; only while CDWRD marks it present.
; Leave a program's replacement row
; unchanged.
; Keeps B. Carry stays clear if clear on
; entry. Clearing the word always
; returns carry clear. Clobbers AF and
; HL.

WRDCLR:
  ld hl,CONDEV
  bit 7,(hl)     ; CDWRD: ROM word
  ret z          ; program row or empty
  res 7,(hl)     ; clear ownership flag
  push bc        ; save console mode
  ld hl,PICCLR   ; blank the status word
  call LCD3
  pop bc         ; LCD3 set B to the row
  or a           ; LCD3 leaves carry set
  ret
