; The service loader and the registry. A .SVC file is read to 0100h: the
; header and image, made for page 0, then the dependencies, then the
; relocation data. The image runs where its header lands: header and image
; move together to a page boundary below the top, the loader writing its
; fields over those the load has finished with, so the file carries no
; padding. Services stack downwards from the stub in whole pages: SVCHEAD
; holds the lowest one's page, and each header's DOWN byte the page of the
; owner loaded before it, above it, 0 at the last.
;
; A record, as INIT returns it: the link, the name, 8 bytes, the interface
; version and the entry table's address. The registry is the list through
; those records, its head in REGHEAD, the newest first. When the ROM's
; PICO9918 console started at cold boot its record, PIREC, is the list's
; permanent tail, which no UNLOAD reaches.
;
; Last come GLCD.SVC's load for CON UC1: and SVCGO's give-way rule.

DMAGIC	EQU	SVCFMT*256+'D'	; 'D', then the format, abi.inc's
DF	EQU	$0100		; the file, where LOADCOM reads it
DDEP	EQU	2		; dependencies, how many
DFLG	EQU	3		; bit 0 removable, bits 1-7 RST 1-7 claimed
DREM	EQU	4		; REMOVE, from the header's start
DSIZ	EQU	6		; header and image, in bytes
DOLD	EQU	6		; resident, the registry's head before it
DXTR	EQU	8		; extra memory after the image
DOWN	EQU	8		; resident, the owner before it, 0 at the last
DREL	EQU	10		; relocation bytes
DSTK	EQU	12		; each stack's use: BDOS, BIOS, CCP;
				; resident, each one's room left below it
DINI	EQU	15		; INIT, from the header's start
DNAM	EQU	17		; 8 bytes
DHLEN	EQU	25		; the header's length: the image follows
DRECSZ	EQU	13		; link, name, version, table
STLAST	EQU	STREC+127	; startup's record: its last byte

; Set the top from the owner list: the lowest owner's page, or with none the
; stub's address, into PZTOP and the word at 0006h. Returns carry clear, A =
; SVCHEAD and HL = the top. Destroys AF, HL.
SLTOP:	LD	A,(SVCHEAD)	; the lowest owner's page, 0 for none
	LD	H,A
	LD	L,0		; HL at that page's start
	OR	A		; and carry clear for the return
	JR	NZ,SLT1		; an owner: its page is the top
	LD	HL,(STUBAD)	; none: the stub below the vectors
SLT1:	LD	(PZTOP),HL	; the top warm boot puts at 0006h
	LD	(PZBDOS+1),HL	; and puts there now
	RET

; A refusal: returns carry set, with nothing changed.
SLFAIL:	SCF
	RET

; UNLOAD: remove the lowest resident, if no INIT or REMOVE is running, the top
; is its page and it is removable. Only a head of the owner list is a service:
; with none in, the top is the stub's and SVCHEAD, 0, matches no page. Its
; REMOVE runs; carry set, with everything as it was, if that or any check
; refuses. Then its claimed restart slots are freed, REGHEAD and SVCHEAD go
; back to what they were before it loaded, the generation rises, the top goes
; up to the next owner's page and vectors into the freed pages are cleared.
; Returns carry clear. Destroys AF, BC, DE, HL and what REMOVE destroys.
SVCUNL:	LD	A,(SVCBSY)	; 0 here, and used as such below
	OR	A
	JR	NZ,SLFAIL	; an INIT or REMOVE is running
	LD	HL,(PZTOP)
	LD	L,A		; HL at the top's page
	LD	A,(SVCHEAD)
	CP	H		; the top must be the lowest owner's
	JR	NZ,SLFAIL	; page
	LD	L,DFLG
	BIT	0,(HL)		; the removable flag
	JR	Z,SLFAIL	; never removable, or a hook kept it
	PUSH	HL		; H = the page, across REMOVE
	LD	L,DREM
	CALL	SVCCALL		; REMOVE: carry if it refuses
	CALL	SVCSHUT		; the window closes, carry kept
	POP	HL
	RET	C		; refused: everything as it was
	PUSH	HL		; a slot it claimed takes its default below
	CALL	SVCFRE
	POP	HL
	LD	L,DOLD		; the registry's head and the owner's, then
	LD	DE,REGHEAD	; the generation and the top
	LD	BC,3		; REGHEAD and SVCHEAD, in RAM's order
	LDIR
	EX	DE,HL		; DE is left at SVCGEN, which follows:
	INC	(HL)		; each removal raises it
	EX	DE,HL
	CALL	SLTOP		; the top up to the next owner's page
	JP	PZSWP		; a vector into the freed pages goes

; Install the file at 0100h, up to LOADTOP, in the steps docs/services.md's
; Installation lists. Carry clear: installed. Carry set: SVCRC is 0 refused,
; nothing changed but the file; 1 INIT failed, nothing left; 2 failed, its
; pages reserved with no records. SVCRA holds INIT's A once INIT has run.
; Destroys AF, BC, DE, HL and whatever INIT and REMOVE destroy.
SVCLOAD:
	XOR	A
	LD	(SVCRC),A	; 0, a refusal, until a later step
	LD	A,(SVCBSY)	; no INIT or REMOVE running
	OR	A
	JR	NZ,SLFAIL
	LD	HL,(DF)		; 'D' and the format, as one word
	LD	DE,DMAGIC
	SBC	HL,DE		; carry clear from the OR
	JR	NZ,SLFAIL	; not a service, or another format
	LD	BC,(DF+DSIZ)	; the image in the records
	INC	H		; HL = 0: now the file
	CALL	SVCEXT		; the header and image within it
	RET	C
	LD	HL,(DF+DINI)	; INIT inside the image
	CALL	SVCIN
	RET	C
	LD	HL,(DF+DREM)	; and REMOVE
	CALL	SVCIN
	RET	C
	LD	HL,(DF+DXTR)	; the pages; the base at 8000h or above
	ADD	HL,BC		; the bytes it holds, with the extra
	RET	C		; past 64K
	DEC	HL		; H = its last byte's page, from 0
	LD	A,(PZTOP+1)
	DEC	A		; the page below the top's
	SUB	H		; less those above the base
	RET	C		; no room under the top
	CP	$80
	RET	C		; the base would be below 8000h
	LD	(SLDL),A	; the base page, the relocation delta
	LD	H,B		; the dependencies, after the image
	LD	L,C
	INC	H		; in the file at 0100h
	LD	A,(DF+DDEP)	; how many
SVCDL:	OR	A
	JR	Z,SVCDE		; each one found
	PUSH	AF
	PUSH	HL
	LD	BC,9		; a dependency's 9 bytes, which must
	CALL	SVCEXT		; lie in the file; B = 0 for REGFIND
	EX	(SP),HL		; the next on the stack
	JR	C,SVCDX		; past the file
	EX	DE,HL
	LD	A,(DE)		; the least version, then the name
	LD	C,A
	INC	DE
	CALL	REGFIND		; carry if none is recent enough
SVCDX:	POP	HL		; the next dependency
	POP	BC		; B = the count, this one with them
	RET	C
	LD	A,B
	DEC	A		; one fewer to find
	JR	SVCDL
SVCDE:	PUSH	HL		; the relocation data
	LD	BC,(DF+DREL)
	CALL	SVCEXT		; which must lie in the file
	JR	C,SVCSX
	LD	HL,SVCLIM	; each stack's room left, carried in the header
	LD	A,(SVCHEAD)	; with none in, the ROM's limits;
	OR	A		; else the lowest owner's room left
	JR	Z,SVCS0
	LD	H,A
	LD	L,DSTK
SVCS0:	LD	DE,DF+DSTK	; this service's use of each
	LD	B,3		; BDOS, BIOS and CCP
SVCSL:	LD	A,(HL)		; the room left
	EX	DE,HL
	SUB	(HL)		; less this service's use
	JR	C,SVCSX		; more than is left: refused
	LD	(HL),A		; its room left, into its header
	EX	DE,HL
	INC	HL
	INC	DE
	DJNZ	SVCSL
SVCSX:	POP	DE		; DE = the relocation data
	RET	C
; Add the page to the image's marked bytes. The list at DE holds the gap from
; each fixup to the next, the first from the byte before the image; 255 is a
; gap and no fixup. A gap that lands past the image refuses, carry set.
	LD	BC,(DF+DREL)	; the list's length
	LD	HL,DF+DHLEN-1	; the byte before the image
SVCR1:	LD	A,B
	OR	C
	JR	Z,SVCMOV	; the list done
	DEC	BC
	LD	A,(DE)		; the gap to the next
	INC	DE
	PUSH	DE
	LD	E,A
	LD	D,0
	ADD	HL,DE		; HL at the marked byte, carry clear
	INC	A		; 0 for a gap of 255, no fixup
	PUSH	HL
	DEC	H		; its offset from the header's start,
	LD	DE,(DF+DSIZ)	; less the header and image:
	SBC	HL,DE		; carry if it lies inside them
	POP	HL
	POP	DE
	CCF
	RET	C		; past the image: refused
	OR	A		; the SBC took Z: a gap of 255 moves
	JR	Z,SVCR1		; on, patching nothing
	LD	A,(SLDL)
	ADD	A,(HL)		; the base page added to the
	LD	(HL),A		; address's high byte
	JR	SVCR1

; Each restart slot claimed in the flags, bits 1-7 for RST 1-7 at 0008h-0038h:
; one holding a JP already refuses the load, nothing changed. Then the move,
; INIT, the records' checks and the commit.
SVCMOV:
	LD	A,(DF+DFLG)	; a slot claimed that holds a jump refuses
	LD	HL,8		; RST 1's slot, and each 8 bytes up
	LD	DE,8
	SRL	A		; bit 0, removable, dropped
SVCMC:	SRL	A		; carry: this slot claimed
	JR	NC,SVCMN
	LD	C,A		; the claims left
	LD	A,(HL)
	CP	$C3		; JP: another's vector
	JP	Z,SLFAIL
	LD	A,C
SVCMN:	ADD	HL,DE		; the next slot
	OR	A		; until no claim is left
	JR	NZ,SVCMC
	LD	BC,(DF+DSIZ)	; the size, before the fields go over it
	PUSH	BC
	LD	HL,REGHEAD	; the resident's fields, in the header
	LD	DE,DF+DOLD	; DOLD and DOWN: REGHEAD and SVCHEAD,
	LD	BC,3		; the heads before it, in RAM's order
	LDIR
	LD	HL,BENTRY	; the page's offset 0 enters the BDOS
	LD	(DF+1),HL
	LD	A,$C3		; JP BENTRY over the magic and the
	LD	(DF),A		; format
	POP	BC
	LD	HL,DF		; the move; only (0006h) is lowered
	LD	A,(SLDL)
	LD	D,A		; DE at the base page; DF's low byte
	LD	E,L		; is 0
	LDIR
	LD	H,A
	LD	L,B		; BC is 0 after the move
	LD	(PZBDOS+1),HL	; 0006h at the page; PZTOP stays, so a
				; warm boot during INIT puts it back
	LD	L,DINI
	CALL	SVCCALL		; INIT: HL = its first record, or 0;
				; carry if it failed, undoing itself
	LD	(SVCRA),A	; INIT's A: SVCRC 1 makes it the cause
	CALL	SVCBND		; D and E bound the service's pages
	JR	C,SVCSCAN	; INIT failed
	PUSH	HL		; the first record
	LD	B,0		; 255 records at most
SVCWK:	LD	A,H
	OR	L
	JR	Z,SVCLK		; the chain's end: link it
	LD	(SLN),HL	; the last so far
	CALL	SVCCK		; the record's start in the pages
	JR	C,SVCRF
	PUSH	BC		; B, the records still allowed
	LD	C,(HL)
	INC	HL
	LD	B,(HL)
	PUSH	BC		; the link
	LD	BC,DRECSZ-2
	ADD	HL,BC		; the record's last byte, in the pages
	CALL	SVCCK
	JR	C,SVCWX
	LD	A,(HL)		; the table's high byte: its page
	CALL	SVCCKA		; in them too
SVCWX:	POP	HL		; the next record
	POP	BC
	JR	C,SVCRF		; a check failed
	DJNZ	SVCWK		; a 256th record is refused
SVCRF:	POP	HL		; a record refused: REMOVE undoes INIT
	LD	H,D		; the service's page
	LD	L,DREM
	CALL	SVCCALL		; carry if REMOVE refuses
	CALL	SVCBND		; D and E again, carry kept
	JR	C,SVCKEEP	; refused: it stays, with no records
; INIT failed, or REMOVE undid it after a record was refused. A hook left in
; the table keeps the pages: a RAM BIOS entry whose JP lands in them leaves the
; service in, not removable, with no records, SVCRC 2. With none, the pages go
; back: their claimed slots freed, (0006h) at PZTOP again, the restart vectors
; swept, and SVCRC 1.
SVCSCAN:
	LD	HL,RAMBIOS+2	; the first entry's target, high byte
	LD	B,BIOSLEN/3	; each entry a JP, 3 bytes
SVCSC1:	LD	A,(HL)
	CALL	SVCCKA		; a target in the service's pages?
	JR	NC,SVCHIT
	INC	HL		; the next entry's
	INC	HL
	INC	HL
	DJNZ	SVCSC1
	LD	H,D		; a slot it claimed, and any vector into it,
	CALL	SVCFRE		; go with the pages
	LD	HL,(PZTOP)	; (0006h) back at the top
	LD	(PZBDOS+1),HL
	CALL	PZSWP
	LD	A,1		; failed, nothing left
	JR	SVCRET
SVCHIT:	LD	E,DFLG		; DE at its flags
	XOR	A
	LD	(DE),A		; not removable, no slot claimed
SVCKEEP:
	LD	A,2		; failed, its pages kept
	LD	(SVCRC),A
	JR	SVCCOM		; committed, with no records
SVCLK:	POP	HL		; link the records, then commit
	LD	A,H
	OR	L
	JR	Z,SVCCOM	; INIT gave none
	LD	BC,(REGHEAD)	; the old head goes after the last
	LD	(REGHEAD),HL	; and the first is the head
	LD	HL,(SLN)
	LD	(HL),C		; the last's link
	INC	HL
	LD	(HL),B
SVCCOM:	LD	A,D		; the service is the lowest owner
	LD	(SVCHEAD),A
	LD	H,A
	LD	L,0
	LD	(PZTOP),HL	; the commit
	LD	A,(SVCRC)	; 0 installed, or 2 kept
SVCRET:	LD	(SVCRC),A
	CP	1		; carry for 0 alone, which CCF turns
	CCF			; round: carry for 1 and 2, failures
; Close the window: no INIT or REMOVE running. Keeps the flags. Destroys A.
SVCSHUT:
	LD	A,0		; not XOR A, which would clear carry
	LD	(SVCBSY),A
	RET

; Clear the first byte of each restart slot the service in page H claims in
; its flags, so that the sweep, PZSWP, gives the slot its default. Destroys AF,
; DE, HL; D = 0 on return.
SVCFRE:	LD	L,DFLG
	LD	A,(HL)		; bits 1-7 claim RST 1-7
	LD	HL,8		; RST 1's slot
	LD	DE,8		; D = 0, the byte written
	SRL	A		; bit 0, removable, dropped
SVCUC:	SRL	A		; carry: this slot claimed
	JR	NC,SVCUN
	LD	(HL),D		; no longer a JP: the sweep resets it
SVCUN:	ADD	HL,DE		; the next slot; ADD keeps SRL's Z,
	JR	NZ,SVCUC	; so the loop ends with no claim left
	RET

; HL at the header field, the page in H: the window opens and that routine
; runs. The field holds the routine's offset from the header's start; SVCBSY
; becomes 80h, refusing loads and removals until SVCSHUT. The routine returns
; to SVCCALL's caller with what it returns. Destroys A, E, HL first.
SVCCALL:
	LD	A,$80		; an INIT or REMOVE is running
	LD	(SVCBSY),A
	LD	E,(HL)		; the offset's low byte
	INC	L
	LD	A,(HL)
	ADD	A,H		; its high byte, plus the page
	LD	H,A
	LD	L,E
	JP	(HL)		; returns to the caller

; D = the service's page, E = the page above its last. Carry and HL kept.
; The page is SLDL's, and the page above is its owner's before it, from the
; header's DOWN byte, or the stub's with none. Destroys A.
SVCBND:	LD	A,(SLDL)	; the base page
	LD	D,A
	LD	E,DOWN		; the owner above it, 0 for none
	LD	A,(DE)
	CALL	SVCABV
	LD	E,A
	RET

; A = a service's owner: A = the page above that service. The owner byte is a
; header's DOWN, the owner's page, or 0 for the last, above which is the stub's
; page. Carry kept. Destroys the other flags.
SVCABV:	INC	A		; Z for 0; INC and DEC keep carry
	DEC	A
	RET	NZ		; the owner's page
	LD	A,(STUBAD+1)	; none: the stub's page
	RET

; Carry unless HL, or at SVCCKA the page A, is in the service's pages: from
; page D up to, not including, page E. SVCCK destroys A.
SVCCK:	LD	A,H
SVCCKA:	CP	D
	RET	C		; below the service
	CP	E
	CCF			; carry at or above E
	RET

; HL + BC, carry if that is past the file. HL = the sum, DE destroyed. The
; file ends at LOADTOP, exclusive, so a sum equal to it is inside.
SVCEXT:	ADD	HL,BC
	RET	C		; past 64K
	EX	DE,HL
	LD	HL,(LOADTOP)	; the file's end
	SBC	HL,DE		; carry if the sum is past it
	EX	DE,HL
	RET

; Carry unless HL is an offset into the image, of BC bytes with the header:
; from DHLEN up to BC less one. Needs carry clear on entry, which each caller
; has from the check before. Destroys DE, HL.
SVCIN:	LD	DE,DHLEN
	SBC	HL,DE		; the caller's carry clear
	RET	C		; inside the header
	ADD	HL,DE		; the offset again, carry clear
	SBC	HL,BC
	CCF			; carry at or past the image's end
	RET

; TNFIND (abi.inc): DE = a name, 8 bytes padded with spaces, B = the least
; version. Returns carry clear, HL = that record's entry table and A = the
; generation; carry set if there is none. Keeps DE. Destroys BC.
SVFND:	LD	C,B		; the version in C, for REGFIND
	LD	B,0		; 256 records at most
	JR	REGFIND

; TNLIST (abi.inc): B = an index from 0, the newest record first. Returns
; carry clear, HL = that record and A = the generation; carry set past the
; last. Destroys C.
SVLST:	LD	C,B
	LD	HL,(REGHEAD)	; from the newest
	INC	C		; the count: 1 for index 0
SVCS1:	LD	A,H
	OR	L
	SCF
	RET	Z		; the list's end, carry set
	DEC	C
	JR	Z,REGGEN	; the record asked for
	LD	A,(HL)		; on to the next by its link
	INC	HL
	LD	H,(HL)
	LD	L,A
	JR	SVCS1

; Find the newest record named DE, 8 bytes, whose version is C or above,
; walking from REGHEAD for at most B records, 0 for 256. Returns carry clear,
; HL = its entry table, A = the generation, BC = the record's address; carry
; set for none. Keeps DE.
REGFIND:
	LD	HL,(REGHEAD)
REGF1:	LD	A,H
	OR	L
	SCF
	RET	Z		; the list's end: none
	PUSH	HL		; the record, the name and the limit
	PUSH	DE
	PUSH	BC
	INC	HL		; past the link to the name
	INC	HL
	LD	B,8
REGF2:	LD	A,(DE)
	CP	(HL)
	JR	NZ,REGF3	; another name
	INC	DE
	INC	HL
	DJNZ	REGF2
	LD	A,(HL)		; the version
	CP	C
	JR	C,REGF3		; older than the least
	INC	HL		; HL = its entry table
	LD	A,(HL)
	INC	HL
	LD	H,(HL)
	LD	L,A
	POP	BC		; the caller's version and limit,
	POP	DE		; and name
	POP	BC		; BC = the record
; Return A = the generation with carry clear.
REGGEN:	LD	A,(SVCGEN)	; raised by each removal
	OR	A		; carry clear: found
	RET
REGF3:	POP	BC		; on to the next record
	POP	DE
	POP	HL
	LD	A,(HL)		; by its link
	INC	HL
	LD	H,(HL)
	LD	L,A
	DJNZ	REGF1		; until the limit
	SCF
	RET

; ---- The displays' drivers, loaded -------------------------------------------


; CON UC1:'s load: A:GLCD.SVC read and installed through SVCGO, which makes the
; GLCD the console, unless CDGLC says it is in already. Carry clear if it is
; in. Carry set if it won't read or load (no GLCD, say): the CON: field goes
; back to the mode in effect and the LCD says GLCD? on row 3. Destroys AF, BC,
; DE, HL.
GLCLD:	LD	A,(CONDEV)
	AND	CDGLC
	RET	NZ		; in already, carry clear
	LD	HL,GLCFCB	; the file's name, for the loader
	LD	DE,CMDFCB
	LD	BC,12		; drive, name and type
	LDIR
	CALL	SVCGO
	RET	NC		; in, and the console
	LD	A,(CONMOD)	; the console stays, so the field goes back
	LD	B,A
	CALL	CONFLD
	LD	HL,GLCMSG	; the LCD says so, carry set
	JP	LCDWRD

; Read CMDFCB's service and install it. If its page holds GLCD.SVC's table it
; takes the console unless the PICO9918's, the ROM's, is in effect, and the
; ROM's word goes from the LCD. Carry set if it wouldn't read or install,
; SVCRC and SVCRA then saying why (0 for a file that wouldn't read). Destroys
; AF, BC, DE, HL.
SVCGO:	XOR	A		; no load's failure yet
	LD	(SVCRC),A
	CALL	LOADCOM		; the file to 0100h: carry if it won't read
	RET	C
	CALL	SVCLOAD
	RET	C
	LD	A,(SVCHEAD)
	LD	HL,GLVEC+1	; GLCD.SVC's table in this service's page?
	XOR	(HL)		; carry clear: any other service has loaded
	RET	NZ
	LD	HL,CONDEV
	SET	2,(HL)		; CDGLC
	LD	B,CMUC1		; the GLCD's mode, for CONSET
	LD	A,(CONMOD)	; the PICO9918 in effect keeps the console
	DEC	A		; (KE-150), and GLCD? is false
	JR	Z,WRDCLR	; CMCRT: the word cleared, nothing more
CONSET:	CALL	WRDCLR		; a display has come: the word is false
	LD	A,B		; the mode, in the CON: field and in effect
	JP	CONSW

; Clear the ROM's word from row 3 if it is still there, and otherwise leave the
; row as a program left it. Keeps B, and carry clear if it came clear: a word
; cleared returns carry clear in any case. Destroys AF, HL.
WRDCLR:	LD	HL,CONDEV
	BIT	7,(HL)		; CDWRD: a word of the ROM's on row 3
	RET	Z		; the row is a program's, or empty
	RES	7,(HL)		; the word is going
	PUSH	BC		; the console's mode, across the LCD
	LD	HL,PICCLR	; blanks over the word
	CALL	LCD3
	POP	BC		; LCD3 set B to the row
	OR	A		; LCD3 leaves carry set
	RET
