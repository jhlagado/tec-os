; The service loader and the registry. A
; .SVC file is read to 0100h: the header
; and image, made for page 0, then the
; dependencies, then the relocation
; data. The image runs where its header
; lands: header and image move together
; to a page boundary below the top, the
; loader writing its fields over those
; the load has finished with, so the
; file carries no padding. Services
; stack downwards from the stub in whole
; pages: SVCHEAD holds the lowest one's
; page, and each header's DOWN byte the
; page of the owner loaded before it,
; above it, 0 at the last.
;
; A record, as INIT returns it: the
; link, the name, 8 bytes, the interface
; version and the entry table's address.
; The registry is the list through those
; records, its head in REGHEAD, the
; newest first. When the ROM's PICO9918
; console started at cold boot its
; record, PIREC, is the list's permanent
; tail, which no UNLOAD reaches.
;
; Last come GLCD.SVC's load for CON UC1:
; and SVCGO's give-way rule.

; 'D', then the format, abi.inc's

DMAGIC EQU SVCFMT*256+'D'
DF EQU $0100     ; the file, where
                 ; LOADCOM reads it
DDEP EQU 2       ; dependencies, how
                 ; many
DFLG EQU 3       ; bit 0 removable, bits
                 ; 1-7 RST 1-7 claimed
DREM EQU 4       ; REMOVE, from the
                 ; header's start
DSIZ EQU 6       ; header and image, in
                 ; bytes
DOLD EQU 6       ; resident, the
                 ; registry's head
                 ; before it
DXTR EQU 8       ; extra memory after
                 ; the image
DOWN EQU 8       ; resident, the owner
                 ; before it, 0 at the
                 ; last
DREL EQU 10      ; relocation bytes
DSTK EQU 12      ; each stack's use:
                 ; BDOS, BIOS, CCP;

; resident, each one's room left below
; it

DINI EQU 15      ; INIT, from the
                 ; header's start
DNAM EQU 17      ; 8 bytes
DHLEN EQU 25     ; the header's length:
                 ; the image follows
DRECSZ EQU 13    ; link, name, version,
                 ; table

; startup's record: its last byte

STLAST EQU STREC+127

; Set the top from the owner list: the
; lowest owner's page, or with none the
; stub's address, into PZTOP and the
; word at 0006h. Returns carry clear, A
; = SVCHEAD and HL = the top. Destroys
; AF, HL.

SLTOP:

; the lowest owner's page, 0 for none

  ld a,(SVCHEAD)
  ld h,a
  ld l,0         ; HL at that page's
                 ; start
  or a           ; and carry clear for
                 ; the return
  jr nz,SLT1     ; an owner: its page is
                 ; the top

; none: the stub below the vectors

  ld hl,(STUBAD)

SLT1:
  ld (PZTOP),hl  ; the top warm boot
                 ; puts at 0006h

; and puts there now

  ld (PZBDOS+1),hl
  ret

; A refusal: returns carry set, with
; nothing changed.

SLFAIL:
  scf
  ret

; UNLOAD: remove the lowest resident, if
; no INIT or REMOVE is running, the top
; is its page and it is removable. Only
; a head of the owner list is a service:
; with none in, the top is the stub's
; and SVCHEAD, 0, matches no page. Its
; REMOVE runs; carry set, with
; everything as it was, if that or any
; check refuses. Then its claimed
; restart slots are freed, REGHEAD and
; SVCHEAD go back to what they were
; before it loaded, the generation
; rises, the top goes up to the next
; owner's page and vectors into the
; freed pages are cleared. Returns carry
; clear. Destroys AF, BC, DE, HL and
; what REMOVE destroys.

SVCUNL:
  ld a,(SVCBSY)  ; 0 here, and used as
                 ; such below
  or a
  jr nz,SLFAIL   ; an INIT or REMOVE is
                 ; running
  ld hl,(PZTOP)
  ld l,a         ; HL at the top's page
  ld a,(SVCHEAD)
  cp h           ; the top must be the
                 ; lowest owner's
  jr nz,SLFAIL   ; page
  ld l,DFLG
  bit 0,(hl)     ; the removable flag
  jr z,SLFAIL    ; never removable, or a
                 ; hook kept it
  push hl        ; H = the page, across
                 ; REMOVE
  ld l,DREM
  call SVCCALL   ; REMOVE: carry if it
                 ; refuses
  call SVCSHUT   ; the window closes,
                 ; carry kept
  pop hl
  ret c          ; refused: everything
                 ; as it was
  push hl        ; a slot it claimed
                 ; takes its default
                 ; below
  call SVCFRE
  pop hl
  ld l,DOLD      ; the registry's head
                 ; and the owner's, then
  ld de,REGHEAD  ; the generation and
                 ; the top
  ld bc,3        ; REGHEAD and SVCHEAD,
                 ; in RAM's order
  ldir
  ex de,hl       ; DE is left at SVCGEN,
                 ; which follows:
  inc (hl)       ; each removal raises
                 ; it
  ex de,hl
  call SLTOP     ; the top up to the
                 ; next owner's page
  jp PZSWP       ; a vector into the
                 ; freed pages goes

; Install the file at 0100h, up to
; LOADTOP, in the steps
; docs/services.md's Installation lists.
; Carry clear: installed. Carry set:
; SVCRC is 0 refused, nothing changed
; but the file; 1 INIT failed, nothing
; left; 2 failed, its pages reserved
; with no records. SVCRA holds INIT's A
; once INIT has run, or 0 once a record
; of INIT's is refused. Destroys AF, BC,
; DE, HL and whatever INIT and REMOVE
; destroy.

SVCLOAD:
  xor a
  ld (SVCRC),a   ; 0, a refusal, until a
                 ; later step
  ld a,(SVCBSY)  ; no INIT or REMOVE
                 ; running
  or a
  jr nz,SLFAIL
  ld hl,(DF)     ; 'D' and the format,
                 ; as one word
  ld de,DMAGIC
  sbc hl,de      ; carry clear from the
                 ; OR
  jr nz,SLFAIL   ; not a service, or
                 ; another format

; the image in the records

  ld bc,(DF+DSIZ)
  inc h          ; HL = 0: now the file
  call SVCEXT    ; the header and image
                 ; within it
  ret c

; INIT inside the image

  ld hl,(DF+DINI)
  call SVCIN
  ret c

; and REMOVE

  ld hl,(DF+DREM)
  call SVCIN
  ret c

; the pages; the base at 8000h or above

  ld hl,(DF+DXTR)
  add hl,bc      ; the bytes it holds,
                 ; with the extra
  ret c          ; past 64K
  dec hl         ; H = its last byte's
                 ; page, from 0
  ld a,(PZTOP+1)
  dec a          ; the page below the
                 ; top's
  sub h          ; less those above the
                 ; base
  ret c          ; no room under the top
  cp $80
  ret c          ; the base would be
                 ; below 8000h
  ld (SLDL),a    ; the base page, the
                 ; relocation delta
  ld h,b         ; the dependencies,
                 ; after the image
  ld l,c
  inc h          ; in the file at 0100h

; how many

  ld a,(DF+DDEP)

SVCDL:
  or a
  jr z,SVCDE     ; each one found
  push af
  push hl
  ld bc,9        ; a dependency's 9
                 ; bytes, which must
  call SVCEXT    ; lie in the file; B =
                 ; 0 for REGFIND
  ex (sp),hl     ; the next on the stack
  jr c,SVCDX     ; past the file
  ex de,hl
  ld a,(de)      ; the least version,
                 ; then the name
  ld c,a
  inc de
  call REGFIND   ; carry if none is
                 ; recent enough

SVCDX:
  pop hl         ; the next dependency
  pop bc         ; B = the count, this
                 ; one with them
  ret c
  ld a,b
  dec a          ; one fewer to find
  jr SVCDL

SVCDE:
  push hl        ; the relocation data
  ld bc,(DF+DREL)
  call SVCEXT    ; which must lie in the
                 ; file
  jr c,SVCSX
  ld hl,SVCLIM   ; each stack's room
                 ; left, carried in the
                 ; header

; with none in, the ROM's limits;

  ld a,(SVCHEAD)
  or a           ; else the lowest
                 ; owner's room left
  jr z,SVCS0
  ld h,a
  ld l,DSTK

SVCS0:
  ld de,DF+DSTK  ; this service's use of
                 ; each
  ld b,3         ; BDOS, BIOS and CCP

SVCSL:
  ld a,(hl)      ; the room left
  ex de,hl
  sub (hl)       ; less this service's
                 ; use
  jr c,SVCSX     ; more than is left:
                 ; refused
  ld (hl),a      ; its room left, into
                 ; its header
  ex de,hl
  inc hl
  inc de
  djnz SVCSL

SVCSX:
  pop de         ; DE = the relocation
                 ; data
  ret c

; Add the page to the image's marked
; bytes. The list at DE holds the gap
; from each fixup to the next, the first
; from the byte before the image; 255 is
; a gap and no fixup. A gap that lands
; past the image refuses, carry set. the
; list's length

  ld bc,(DF+DREL)

; the byte before the image

  ld hl,DF+DHLEN-1

SVCR1:
  ld a,b
  or c
  jr z,SVCMOV    ; the list done
  dec bc
  ld a,(de)      ; the gap to the next
  inc de
  push de
  ld e,a
  ld d,0
  add hl,de      ; HL at the marked
                 ; byte, carry clear
  inc a          ; 0 for a gap of 255,
                 ; no fixup
  push hl
  dec h          ; its offset from the
                 ; header's start,

; less the header and image:

  ld de,(DF+DSIZ)
  sbc hl,de      ; carry if it lies
                 ; inside them
  pop hl
  pop de
  ccf
  ret c          ; past the image:
                 ; refused
  or a           ; the SBC took Z: a gap
                 ; of 255 moves
  jr z,SVCR1     ; on, patching nothing
  ld a,(SLDL)
  add a,(hl)     ; the base page added
                 ; to the
  ld (hl),a      ; address's high byte
  jr SVCR1

; Each restart slot claimed in the
; flags, bits 1-7 for RST 1-7 at
; 0008h-0038h: one holding a JP already
; refuses the load, nothing changed.
; Then the move, INIT, the records'
; checks and the commit.

SVCMOV:

; a slot claimed that holds a jump
; refuses

  ld a,(DF+DFLG)
  ld hl,8        ; RST 1's slot, and
                 ; each 8 bytes up
  ld de,8
  srl a          ; bit 0, removable,
                 ; dropped

SVCMC:
  srl a          ; carry: this slot
                 ; claimed
  jr nc,SVCMN
  ld c,a         ; the claims left
  ld a,(hl)
  cp $C3         ; JP: another's vector
  jp z,SLFAIL
  ld a,c

SVCMN:
  add hl,de      ; the next slot
  or a           ; until no claim is
                 ; left
  jr nz,SVCMC

; the size, before the fields go over it

  ld bc,(DF+DSIZ)
  push bc
  ld hl,REGHEAD  ; the resident's
                 ; fields, in the header
  ld de,DF+DOLD  ; DOLD and DOWN:
                 ; REGHEAD and SVCHEAD,
  ld bc,3        ; the heads before it,
                 ; in RAM's order
  ldir
  ld hl,BENTRY   ; the page's offset 0
                 ; enters the BDOS
  ld (DF+1),hl
  ld a,$C3       ; JP BENTRY over the
                 ; magic and the
  ld (DF),a      ; format
  pop bc
  ld hl,DF       ; the move; only
                 ; (0006h) is lowered
  ld a,(SLDL)
  ld d,a         ; DE at the base page;
                 ; DF's low byte
  ld e,l         ; is 0
  ldir
  ld h,a
  ld l,b         ; BC is 0 after the
                 ; move

; 0006h at the page; PZTOP stays, so a

  ld (PZBDOS+1),hl

; warm boot during INIT puts it back

  ld l,DINI
  call SVCCALL   ; INIT: HL = its first
                 ; record, or 0;

; carry if it failed, undoing itself

  ld (SVCRA),a   ; INIT's A: SVCRC 1
                 ; makes it the cause
  call SVCBND    ; D and E bound the
                 ; service's pages
  jr c,SVCSCAN   ; INIT failed
  push hl        ; the first record

; B = the records this service may add:
; TNFIND walks 256 at most, so with N in
; the registry, B = 1 - N refuses the
; (257 - N)th (KE-AR4); with none in, or
; one, B = 0 refuses the 256th, as one
; service's limit. the registry, newest
; first

  ld hl,(REGHEAD)
  ld b,0
  ld a,h
  or l
  jr z,SVCNE     ; none in: 255 allowed

SVCNT:
  ld a,(hl)      ; on by the link
  inc hl
  ld h,(hl)
  ld l,a
  or h
  jr z,SVCNE     ; the last counted
  dec b          ; one fewer for each
                 ; after the first
  jr nz,SVCNT    ; a 257th link: refuse
  jr SVCRF       ; REMOVE undoes INIT

SVCNE:
  pop hl         ; the first record
                 ; again
  push hl

SVCWK:
  ld a,h
  or l
  jr z,SVCLK     ; the chain's end: link
                 ; it
  ld (SLN),hl    ; the last so far
  call SVCCK     ; the record's start in
                 ; the pages
  jr c,SVCRF
  push bc        ; B, the records still
                 ; allowed
  ld c,(hl)
  inc hl
  ld b,(hl)
  push bc        ; the link
  ld bc,DRECSZ-2
  add hl,bc      ; the record's last
                 ; byte, in the pages
  call SVCCK
  jr c,SVCWX
  ld a,(hl)      ; the table's high
                 ; byte: its page
  call SVCCKA    ; in them too

SVCWX:
  pop hl         ; the next record
  pop bc
  jr c,SVCRF     ; a check failed
  djnz SVCWK     ; past B's limit:
                 ; refused

SVCRF:
  pop hl         ; a record refused:
                 ; REMOVE undoes INIT
  xor a          ; and SVCRA 0: INIT's A
                 ; is no cause, so
  ld (SVCRA),a   ; it can't pass for
                 ; TNENODV (KE-192)
  ld h,d         ; the service's page
  ld l,DREM
  call SVCCALL   ; carry if REMOVE
                 ; refuses
  call SVCBND    ; D and E again, carry
                 ; kept
  jr c,SVCKEEP   ; refused: it stays,
                 ; with no records

; INIT failed, or REMOVE undid it after
; a record was refused. A hook left in
; the table keeps the pages: a RAM BIOS
; entry whose JP lands in them leaves
; the service in, not removable, with no
; records, SVCRC 2. With none, the pages
; go back: their claimed slots freed,
; (0006h) at PZTOP again, the restart
; vectors swept, and SVCRC 1.

SVCSCAN:

; the first entry's target, high byte

  ld hl,RAMBIOS+2

; each entry a JP, 3 bytes

  ld b,BIOSLEN/3

SVCSC1:
  ld a,(hl)
  call SVCCKA    ; a target in the
                 ; service's pages?
  jr nc,SVCHIT
  inc hl         ; the next entry's
  inc hl
  inc hl
  djnz SVCSC1
  ld h,d         ; a slot it claimed,
                 ; and any vector into
                 ; it,
  call SVCFRE    ; go with the pages
  ld hl,(PZTOP)  ; (0006h) back at the
                 ; top
  ld (PZBDOS+1),hl
  call PZSWP
  ld a,1         ; failed, nothing left
  jr SVCRET

SVCHIT:
  ld e,DFLG      ; DE at its flags
  xor a
  ld (de),a      ; not removable, no
                 ; slot claimed

SVCKEEP:
  ld a,2         ; failed, its pages
                 ; kept
  ld (SVCRC),a
  jr SVCCOM      ; committed, with no
                 ; records

SVCLK:
  pop hl         ; link the records,
                 ; then commit
  ld a,h
  or l
  jr z,SVCCOM    ; INIT gave none

; the old head goes after the last

  ld bc,(REGHEAD)

; and the first is the head

  ld (REGHEAD),hl
  ld hl,(SLN)
  ld (hl),c      ; the last's link
  inc hl
  ld (hl),b

SVCCOM:
  ld a,d         ; the service is the
                 ; lowest owner
  ld (SVCHEAD),a
  ld h,a
  ld l,0
  ld (PZTOP),hl  ; the commit
  ld a,(SVCRC)   ; 0 installed, or 2
                 ; kept

SVCRET:
  ld (SVCRC),a
  cp 1           ; carry for 0 alone,
                 ; which CCF turns
  ccf            ; round: carry for 1
                 ; and 2, failures

; Close the window: no INIT or REMOVE
; running. Keeps the flags. Destroys A.

SVCSHUT:
  ld a,0         ; not XOR A, which
                 ; would clear carry
  ld (SVCBSY),a
  ret

; Clear the first byte of each restart
; slot the service in page H claims in
; its flags, so that the sweep, PZSWP,
; gives the slot its default. Destroys
; AF, DE, HL; D = 0 on return.

SVCFRE:
  ld l,DFLG
  ld a,(hl)      ; bits 1-7 claim RST
                 ; 1-7
  ld hl,8        ; RST 1's slot
  ld de,8        ; D = 0, the byte
                 ; written
  srl a          ; bit 0, removable,
                 ; dropped

SVCUC:
  srl a          ; carry: this slot
                 ; claimed
  jr nc,SVCUN
  ld (hl),d      ; no longer a JP: the
                 ; sweep resets it

SVCUN:
  add hl,de      ; the next slot; ADD
                 ; keeps SRL's Z,
  jr nz,SVCUC    ; so the loop ends with
                 ; no claim left
  ret

; HL at the header field, the page in H:
; the window opens and that routine
; runs. The field holds the routine's
; offset from the header's start; SVCBSY
; becomes 80h, refusing loads and
; removals until SVCSHUT. The routine
; returns to SVCCALL's caller with what
; it returns. Destroys A, E, HL first.

SVCCALL:
  ld a,$80       ; an INIT or REMOVE is
                 ; running
  ld (SVCBSY),a
  ld e,(hl)      ; the offset's low byte
  inc l
  ld a,(hl)
  add a,h        ; its high byte, plus
                 ; the page
  ld h,a
  ld l,e
  jp (hl)        ; returns to the caller

; D = the service's page, E = the page
; above its last. Carry and HL kept. The
; page is SLDL's, and the page above is
; its owner's before it, from the
; header's DOWN byte, or the stub's with
; none. Destroys A.

SVCBND:
  ld a,(SLDL)    ; the base page
  ld d,a
  ld e,DOWN      ; the owner above it, 0
                 ; for none
  ld a,(de)
  call SVCABV
  ld e,a
  ret

; A = a service's owner: A = the page
; above that service. The owner byte is
; a header's DOWN, the owner's page, or
; 0 for the last, above which is the
; stub's page. Carry kept. Destroys the
; other flags.

SVCABV:
  inc a          ; Z for 0; INC and DEC
                 ; keep carry
  dec a
  ret nz         ; the owner's page

; none: the stub's page

  ld a,(STUBAD+1)
  ret

; Carry unless HL, or at SVCCKA the page
; A, is in the service's pages: from
; page D up to, not including, page E.
; SVCCK destroys A.

SVCCK:
  ld a,h

SVCCKA:
  cp d
  ret c          ; below the service
  cp e
  ccf            ; carry at or above E
  ret

; HL + BC, carry if that is past the
; file. HL = the sum, DE destroyed. The
; file ends at LOADTOP, exclusive, so a
; sum equal to it is inside.

SVCEXT:
  add hl,bc
  ret c          ; past 64K
  ex de,hl

; the file's end

  ld hl,(LOADTOP)
  sbc hl,de      ; carry if the sum is
                 ; past it
  ex de,hl
  ret

; Carry unless HL is an offset into the
; image, of BC bytes with the header:
; from DHLEN up to BC less one. Needs
; carry clear on entry, which each
; caller has from the check before.
; Destroys DE, HL.

SVCIN:
  ld de,DHLEN
  sbc hl,de      ; the caller's carry
                 ; clear
  ret c          ; inside the header
  add hl,de      ; the offset again,
                 ; carry clear
  sbc hl,bc
  ccf            ; carry at or past the
                 ; image's end
  ret

; TNFIND (abi.inc): DE = a name, 8 bytes
; padded with spaces, B = the least
; version. Returns carry clear, HL =
; that record's entry table and A = the
; generation; carry set if there is
; none. Keeps DE. Destroys BC.

SVFND:
  ld c,b         ; the version in C, for
                 ; REGFIND
  ld b,0         ; 256 records at most
  jr REGFIND

; TNLIST (abi.inc): B = an index from 0,
; the newest record first. Returns carry
; clear, HL = that record and A = the
; generation; carry set past the last.
; Destroys C.

SVLST:
  ld c,b

; from the newest

  ld hl,(REGHEAD)
  inc c          ; the count: 1 for
                 ; index 0

SVCS1:
  ld a,h
  or l
  scf
  ret z          ; the list's end, carry
                 ; set
  dec c
  jr z,REGGEN    ; the record asked for
  ld a,(hl)      ; on to the next by its
                 ; link
  inc hl
  ld h,(hl)
  ld l,a
  jr SVCS1

; Find the newest record named DE, 8
; bytes, whose version is C or above,
; walking from REGHEAD for at most B
; records, 0 for 256. Returns carry
; clear, HL = its entry table, A = the
; generation, BC = the record's address;
; carry set for none. Keeps DE.

REGFIND:
  ld hl,(REGHEAD)

REGF1:
  ld a,h
  or l
  scf
  ret z          ; the list's end: none
  push hl        ; the record, the name
                 ; and the limit
  push de
  push bc
  inc hl         ; past the link to the
                 ; name
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
  jr c,REGF3     ; older than the least
  inc hl         ; HL = its entry table
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a
  pop bc         ; the caller's version
                 ; and limit,
  pop de         ; and name
  pop bc         ; BC = the record

; Return A = the generation with carry
; clear.

REGGEN:
  ld a,(SVCGEN)  ; raised by each
                 ; removal
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

; ---- The displays' drivers, loaded
; --------------------------------------

; CON UC1:'s load: A:GLCD.SVC read and
; installed through SVCGO, which makes
; the GLCD the console, unless CDGLC
; says it is in already. Carry clear if
; it is in. Carry set if it won't read
; or load (no GLCD, say): the CON: field
; goes back to the mode in effect and
; the LCD says GLCD? on row 3. Destroys
; AF, BC, DE, HL.

GLCLD:
  ld a,(CONDEV)
  and CDGLC
  ret nz         ; in already, carry
                 ; clear
  ld hl,GLCFCB   ; the file's name, for
                 ; the loader
  ld de,CMDFCB
  ld bc,12       ; drive, name and type
  ldir
  call SVCGO
  ret nc         ; in, and the console
  ld a,(CONMOD)  ; the console stays, so
                 ; the field goes back
  ld b,a
  call CONFLD
  ld hl,GLCMSG   ; the LCD says so,
                 ; carry set
  jp LCDWRD

; Read CMDFCB's service and install it.
; If its page holds GLCD.SVC's table it
; takes the console unless the
; PICO9918's, the ROM's, is in effect,
; and the ROM's word goes from the LCD.
; Carry set if it wouldn't read or
; install, SVCRC and SVCRA then saying
; why (0 for a file that wouldn't read).
; Destroys AF, BC, DE, HL.

SVCGO:
  xor a          ; no load's failure yet
  ld (SVCRC),a
  call LOADCOM   ; the file to 0100h:
                 ; carry if it won't
                 ; read
  ret c
  call SVCLOAD
  ret c
  ld a,(SVCHEAD)
  ld hl,GLVEC+1  ; GLCD.SVC's table in
                 ; this service's page?
  xor (hl)       ; carry clear: any
                 ; other service has
                 ; loaded
  ret nz
  ld hl,CONDEV
  set 2,(hl)     ; CDGLC
  ld b,CMUC1     ; the GLCD's mode, for
                 ; CONSET
  ld a,(CONMOD)  ; the PICO9918 in
                 ; effect keeps the
                 ; console
  dec a          ; (KE-150), and GLCD?
                 ; is false
  jr z,WRDCLR    ; CMCRT: the word
                 ; cleared, nothing more

CONSET:
  call WRDCLR    ; a display has come:
                 ; the word is false
  ld a,b         ; the mode, in the CON:
                 ; field and in effect
  jp CONSW

; Clear the ROM's word from row 3 if it
; is still there, and otherwise leave
; the row as a program left it. Keeps B,
; and carry clear if it came clear: a
; word cleared returns carry clear in
; any case. Destroys AF, HL.

WRDCLR:
  ld hl,CONDEV
  bit 7,(hl)     ; CDWRD: a word of the
                 ; ROM's on row 3
  ret z          ; the row is a
                 ; program's, or empty
  res 7,(hl)     ; the word is going
  push bc        ; the console's mode,
                 ; across the LCD
  ld hl,PICCLR   ; blanks over the word
  call LCD3
  pop bc         ; LCD3 set B to the row
  or a           ; LCD3 leaves carry set
  ret
