; The service loader and the registry. A .SVC file is read to 0100h:
; the header and image, made for page 0, then the dependencies, then the
; relocation data. The image runs where its header lands: header and image
; move together to a page boundary, the loader writing its fields over those
; the load has finished with, so the file carries no padding.
;
; A record, as INIT returns it: the link, the name, 8 bytes, the interface
; version and the entry table's address. The registry is the list through
; those records, its head in REGHEAD.

DMAGIC	EQU	SVCFMT*256+'D'	; 'D', then the format, abi.inc's
DF      EQU     $0100           ; the file
DDEP    EQU     2               ; dependencies
DFLG    EQU     3               ; bit 0 removable, bits 1-7 RST 1-7 claimed
DREM    EQU     4               ; REMOVE, from the header's start
DSIZ    EQU     6               ; header and image
DOLD    EQU     6               ; resident, the registry's head before it
DXTR    EQU     8               ; extra memory after the image
DOWN    EQU     8               ; resident, the owner before it, 0 at the last
DREL    EQU     10              ; relocation bytes
DSTK    EQU     12              ; BDOS, BIOS and CCP stack; resident, the room left
DINI    EQU     15              ; INIT, from the header's start
DNAM    EQU     17              ; 8 bytes
DHLEN   EQU     25
DRECSZ  EQU     13              ; link, name, version, table
STLAST	EQU	STREC+127	; startup's record: its last byte

; The top goes back to the next owner's page, or the stub with none. Carry
; clear.
SLTOP: LD      A,(SVCHEAD)
        LD      H,A
        LD      L,0
        OR      A
        JR      NZ,SLT1
        LD      HL,(STUBAD)
SLT1:  LD      (PZTOP),HL
        LD      (PZBDOS+1),HL
        RET
SLFAIL: SCF
        RET

; UNLOAD: the lowest resident, with no INIT or REMOVE running. Only a head of
; the owner list is a service.
SVCUNL:	LD	A,(SVCBSY)	; 0 here, and used as such below
        OR      A
        JR      NZ,SLFAIL
        LD      HL,(PZTOP)
        LD      L,A
        LD      A,(SVCHEAD)
        CP      H
        JR      NZ,SLFAIL
        LD      L,DFLG
        BIT     0,(HL)
        JR      Z,SLFAIL
        PUSH    HL
        LD      L,DREM
        CALL    SVCCALL
        CALL    SVCSHUT
        POP     HL
        RET     C
        PUSH    HL              ; a slot it claimed takes its default below
        CALL    SVCFRE
        POP     HL
        LD      L,DOLD          ; the registry's head and the owner's, then
        LD      DE,REGHEAD      ; the generation and the top
        LD      BC,3
        LDIR
        EX      DE,HL
        INC     (HL)
        EX      DE,HL
        CALL    SLTOP
        JP      PZSWP           ; a vector into the freed pages goes

; Install the file at 0100h, up to LOADTOP. Carry clear: installed. Carry set:
; SVCRC is 0 refused, nothing changed; 1 INIT failed, nothing left; 2 failed,
; its pages reserved with no records.
SVCLOAD:XOR     A
        LD      (SVCRC),A
	LD	A,(SVCBSY)	; no INIT or REMOVE running
        OR      A
        JR      NZ,SLFAIL
        LD      HL,(DF)
        LD      DE,DMAGIC
        SBC     HL,DE
        JR      NZ,SLFAIL
        LD      BC,(DF+DSIZ)    ; the image in the records
        INC     H               ; HL = 0: now the file
        CALL    SVCEXT
        RET     C
        LD      HL,(DF+DINI)
        CALL    SVCIN
        RET     C
        LD      HL,(DF+DREM)
        CALL    SVCIN
        RET     C
        LD      HL,(DF+DXTR)    ; the pages; the base at 8000h or above
        ADD     HL,BC
        RET     C
        DEC     HL
        LD      A,(PZTOP+1)
        DEC     A
        SUB     H
        RET     C
        CP      $80
        RET     C
        LD      (SLDL),A
        LD      H,B             ; the dependencies, after the image
        LD      L,C
        INC     H
        LD      A,(DF+DDEP)
SVCDL:  OR      A
        JR      Z,SVCDE
        PUSH    AF
        PUSH    HL
        LD      BC,9
        CALL    SVCEXT
        EX      (SP),HL         ; the next on the stack
        JR      C,SVCDX
        EX      DE,HL
        LD      A,(DE)          ; the least version, then the name
        LD      C,A
        INC     DE
        CALL    REGFIND
SVCDX:  POP     HL
        POP     BC
        RET     C
        LD      A,B
        DEC     A
        JR      SVCDL
SVCDE:  PUSH    HL              ; the relocation data
        LD      BC,(DF+DREL)
        CALL    SVCEXT
        JR      C,SVCSX
        LD      HL,SVCLIM       ; each stack's room left, carried in the header
        LD      A,(SVCHEAD)
        OR      A
        JR      Z,SVCS0
        LD      H,A
        LD      L,DSTK
SVCS0:  LD      DE,DF+DSTK
        LD      B,3
SVCSL:  LD      A,(HL)
        EX      DE,HL
        SUB     (HL)
        JR      C,SVCSX
        LD      (HL),A
        EX      DE,HL
        INC     HL
        INC     DE
        DJNZ    SVCSL
SVCSX:  POP     DE
        RET     C
; Add the page to the image's marked bytes. The list at DE holds the gap from
; each fixup to the next; 255 is a gap and no fixup. Carry past the image.
        LD      BC,(DF+DREL)
        LD      HL,DF+DHLEN-1
SVCR1:  LD      A,B
        OR      C
        JR      Z,SVCMOV
        DEC     BC
        LD      A,(DE)
        INC     DE
        PUSH    DE
        LD      E,A
        LD      D,0
        ADD     HL,DE
        INC     A
        PUSH    HL
        DEC     H
        LD      DE,(DF+DSIZ)
        SBC     HL,DE
        POP     HL
        POP     DE
        CCF
        RET     C
        OR      A
        JR      Z,SVCR1
        LD      A,(SLDL)
        ADD     A,(HL)
        LD      (HL),A
        JR      SVCR1
SVCMOV:
        LD      A,(DF+DFLG)     ; a slot claimed that holds a jump refuses
        LD      HL,8
        LD      DE,8
        SRL     A
SVCMC:  SRL     A
        JR      NC,SVCMN
        LD      C,A
        LD      A,(HL)
        CP      $C3
        JP      Z,SLFAIL
        LD      A,C
SVCMN:  ADD     HL,DE
        OR      A
        JR      NZ,SVCMC
        LD      BC,(DF+DSIZ)    ; the size, before the fields go over it
        PUSH    BC
        LD      HL,REGHEAD      ; the resident's fields, in the header
        LD      DE,DF+DOLD
        LD      BC,3
        LDIR
        LD      HL,BENTRY       ; the page's offset 0 enters the BDOS
        LD      (DF+1),HL
        LD      A,$C3
        LD      (DF),A
        POP     BC
        LD      HL,DF           ; the move; only (0006h) is lowered
        LD      A,(SLDL)
        LD      D,A
        LD      E,L
        LDIR
        LD      H,A
        LD      L,B
        LD      (PZBDOS+1),HL
        LD      L,DINI
        CALL    SVCCALL
        CALL    SVCBND
        JR      C,SVCSCAN
        PUSH    HL              ; the first record
        LD      B,0             ; 255 records at most
SVCWK:  LD      A,H
        OR      L
        JR      Z,SVCLK
        LD      (SLN),HL       ; the last so far
        CALL    SVCCK
        JR      C,SVCRF
        PUSH    BC
        LD      C,(HL)
        INC     HL
        LD      B,(HL)
        PUSH    BC              ; the link
        LD      BC,DRECSZ-2
        ADD     HL,BC           ; the record's last byte
        CALL    SVCCK
        JR      C,SVCWX
        LD      A,(HL)          ; the table
        CALL    SVCCKA
SVCWX:  POP     HL
        POP     BC
        JR      C,SVCRF
        DJNZ    SVCWK
SVCRF:  POP     HL              ; a record refused: REMOVE undoes INIT
        LD      H,D
        LD      L,DREM
        CALL    SVCCALL
        CALL    SVCBND
        JR      C,SVCKEEP
; INIT failed. A hook left in the table keeps the pages.
SVCSCAN:LD      HL,RAMBIOS+2
        LD      B,BIOSLEN/3
SVCSC1: LD      A,(HL)
        CALL    SVCCKA
        JR      NC,SVCHIT
        INC     HL
        INC     HL
        INC     HL
        DJNZ    SVCSC1
        LD      H,D             ; a slot it claimed, and any vector into it,
        CALL    SVCFRE          ; go with the pages
        LD      HL,(PZTOP)
        LD      (PZBDOS+1),HL
        CALL    PZSWP
        LD      A,1
        JR      SVCRET
SVCHIT: LD      E,DFLG
        XOR     A
        LD      (DE),A          ; not removable
SVCKEEP:LD      A,2
        LD      (SVCRC),A
        JR      SVCCOM
SVCLK:  POP     HL              ; link the records, then commit
        LD      A,H
        OR      L
        JR      Z,SVCCOM
        LD      BC,(REGHEAD)
        LD      (REGHEAD),HL
        LD      HL,(SLN)
        LD      (HL),C
        INC     HL
        LD      (HL),B
SVCCOM: LD      A,D
        LD      (SVCHEAD),A
        LD      H,A
        LD      L,0
        LD      (PZTOP),HL      ; the commit
        LD      A,(SVCRC)
SVCRET: LD      (SVCRC),A
        CP      1
        CCF
SVCSHUT:LD      A,0
	LD	(SVCBSY),A
        RET

; The first byte of each slot claimed by the service in page H is cleared,
; so that the sweep gives it its default.
SVCFRE: LD      L,DFLG
        LD      A,(HL)
        LD      HL,8
        LD      DE,8
        SRL     A
SVCUC:  SRL     A
        JR      NC,SVCUN
        LD      (HL),D
SVCUN:  ADD     HL,DE
        JR      NZ,SVCUC
        RET

; HL at the header field, the page in H: the window opens and that routine runs.
SVCCALL:LD      A,$80
	LD	(SVCBSY),A
        LD      E,(HL)
        INC     L
        LD      A,(HL)
        ADD     A,H
        LD      H,A
        LD      L,E
        JP      (HL)

; D = the service's page, E = the page above its last. Carry and HL kept.
SVCBND: LD      A,(SLDL)
        LD      D,A
        LD      E,DOWN
        LD      A,(DE)
        CALL    SVCABV
        LD      E,A
        RET

; A = a service's owner: A = the page above that service. Carry kept.
SVCABV: INC     A
        DEC     A
        RET     NZ
        LD      A,(STUBAD+1)
        RET

; Carry unless HL, or at SVCCKA the page A, is in the service's pages.
SVCCK:  LD      A,H
SVCCKA: CP      D
        RET     C
        CP      E
        CCF
        RET

; HL + BC, carry if that is past the file. HL = the sum, DE destroyed.
SVCEXT: ADD     HL,BC
        RET     C
        EX      DE,HL
        LD      HL,(LOADTOP)
        SBC     HL,DE
        EX      DE,HL
        RET

; Carry unless HL is an offset into the image, of BC bytes with the header.
SVCIN:  LD      DE,DHLEN
        SBC     HL,DE
        RET     C
        ADD     HL,DE
        SBC     HL,BC
        CCF
        RET

; SERVICES: each service's name and pages, from the owner list.
CMDSVC: LD      A,(SVCHEAD)
CMDDL:  OR      A
        JP      Z,MAINLOOP
        LD      H,A
        LD      L,DNAM
        LD      B,8
        CALL    PUTTRIM
        PUSH    HL
        LD      E,' '
        CALL    PUTCHAR
        POP     HL
        PUSH    HL
        LD      L,DOWN
        LD      A,(HL)
        CALL    SVCABV
        SUB     H
        LD      L,A
        LD      H,0
        CALL    PUTDEC
        LD      DE,CRLFMSG
        CALL    PUTSTR
        POP     HL
        LD      L,DOWN
        LD      A,(HL)
        JR      CMDDL

; Startup. Once after cold boot one record of A:STARTUP.CMD is read, the
; position marked finished first, so that a failure can't repeat. STPOS is 0
; until then, the next byte + 1 in the file, 80h up once it is finished, and FFh
; when STDONE has looked at the console.
STBOOT:	LD	HL,STPOS
	LD	A,(HL)
	OR	A
	RET	NZ		; cold boot has passed here already
	SET	7,(HL)		; finished, whatever follows
	IN	A,(STSPORT)	; a keypad key held skips it: bit 6 low
	AND	$40
	RET	Z
	LD	HL,STFCB	; the file's name, for the BDOS
	LD	DE,CMDFCB
	LD	BC,12
	LDIR
	LD	DE,STREC	; the record goes where STLINE reads it
	LD	C,26
	CALL	BDOS
	LD	DE,CMDFCB	; no file ends here
	LD	C,15
	CALL	BDOS
	INC	A
	JR	Z,STBDMA
	LD	DE,CMDFCB	; one record, and an empty file ends here
	LD	C,20
	CALL	BDOS
	OR	A
	JR	NZ,STBDMA
	INC	A		; STPOS 1, the file's first byte
	LD	(STPOS),A
STBDMA:	LD	HL,DEFDMA	; the DMA address programs expect
	LD	(CURDMA),HL
	RET

; With a line left: it goes in the command buffer, echoed as if
; typed, and carry clear. Lines end at CR or LF and blank ones are passed
; over; a line's characters after its 127th are passed over too, as a typed
; line has no more. ^Z, a zero or the record's last byte ends the
; file. Otherwise carry set, through STDONE once the file has finished.
; Destroys AF, B, DE, HL.
STLINE:	LD	HL,STPOS
	LD	A,(HL)
	RLCA			; top bit to carry: the file is finished
	JR	C,STDONE
	RRCA			; the position again
	ADD	A,LOW(STREC)-1
	LD	L,A
	LD	H,HIGH(STREC)
	LD	DE,CMDTXT
	LD	B,127		; the characters a line may hold
STL1:	LD	A,L
	CP	LOW(STREC+128)
	JR	Z,STLE		; the record has run out
	LD	A,(HL)
	INC	HL
	OR	A
	JR	Z,STLE		; a zero ends the file
	CP	26
	JR	Z,STLE		; and so does ^Z
	CP	13
	JR	Z,STL2
	CP	10
	JR	Z,STL2
	INC	B
	DEC	B
	JR	Z,STL1		; past the 127th: passed over
	LD	(DE),A		; a character of the line
	INC	DE
	DEC	B
	JR	STL1
STLE:	LD	L,LOW(STLAST)	; STPOS 80h, finished
STL2:	LD	A,L
	SUB	LOW(STREC)-1	; the next byte + 1
	LD	(STPOS),A
	LD	A,E
	SUB	LOW(CMDTXT)
	JR	Z,STLINE	; a blank line: the next one
	LD	(CMDLEN),A
	EX	DE,HL
	LD	(HL),13		; ends the line for the CCP, and
	INC	HL
	LD	(HL),'$'	; for the echo
	LD	DE,CMDTXT
	CALL	PUTSTR
	OR	A
	RET

; Once, at the first prompt after startup: with a PICO9918 and a
; matrix keyboard fitted and no display driver in, the LCD says PICO?. That
; board's screen is black and it may have no serial terminal. It covers a
; missing file, a bad file, no STARTUP.CMD and a skip. HL = STPOS, A = STPOS
; rotated left, carry set. Returns carry set for STLINE. Destroys AF, B, HL.
STDONE:	INC	A		; FFh has been seen, and carry stays
	RET	Z
	LD	(HL),$FF	; once only
	LD	A,(CONDEV)	; zero: both, no GLCD, whatever row 3 has
	AND	$FF-CDWRD-CDRTC	; GLCD? may be up from a failed CON UC1
	SUB	CDMTX+CDTMS	; CDGLC set means GLCD.SVC is in
	LD	HL,PIVEC+1	; and a word here means PICO.SVC is
	OR	(HL)
	SCF
	RET	NZ
	LD	HL,PICMSG	; carry set by LCDROW
	JP	LCDWRD
; The registry's services (abi.inc). TNFIND: DE = the name, B = the least
; version; HL = the entry table. TNLIST: B = an index; HL = that record. A = the
; generation. Carry if there is none. BC, DE destroyed.
SVFND:	LD	C,B
	LD	B,0
	JR	REGFIND
SVLST:	LD	C,B
        LD      HL,(REGHEAD)
        INC     C
SVCS1:  LD      A,H
        OR      L
        SCF
        RET     Z
        DEC     C
        JR      Z,REGGEN
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        JR      SVCS1

; DE = the name, C = the least version, B = 0.
REGFIND:LD      HL,(REGHEAD)
REGF1:  LD      A,H
        OR      L
        SCF
        RET     Z
        PUSH    HL
        PUSH    DE
        PUSH    BC
        INC     HL
        INC     HL
        LD      B,8
REGF2:  LD      A,(DE)
        CP      (HL)
        JR      NZ,REGF3
        INC     DE
        INC     HL
        DJNZ    REGF2
        LD      A,(HL)          ; the version
        CP      C
        JR      C,REGF3
        INC     HL
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        POP     BC
        POP     DE
        POP     BC
REGGEN: LD      A,(SVCGEN)
        OR      A
        RET
REGF3:  POP     BC
        POP     DE
        POP     HL
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        DJNZ    REGF1
        SCF
        RET

; ---- The displays' drivers, loaded -------------------------------------------


; Load A:GLCD.SVC if there is a GLCD and its resident is not in, and make it
; the console: carry set if there is none or it will not load (the LCD says
; so).
GLCLD:	LD	A,(CONDEV)
	AND	CDGLC
	RET	NZ		; in already
	LD	HL,GLCFCB	; the file's name, for the loader
	LD	DE,CMDFCB
	LD	BC,12
	LDIR
	CALL	SVCGO
	RET	NC
	LD	A,(CONMOD)	; the console stays, so the field goes back
	LD	B,A
	CALL	CONFLD
	LD	HL,GLCMSG	; the LCD says so, carry set
	JP	LCDWRD

; Read CMDFCB's service and install it. If its page holds a video table it takes
; the console: PICO.SVC always, GLCD.SVC unless PICO.SVC is in, and the ROM's
; word goes from the LCD. Carry set if it wouldn't read or install.
SVCGO:	CALL	LOADCOM
	RET	C
	CALL	SVCLOAD
	RET	C
	LD	A,(SVCHEAD)
	LD	B,CMCRT		; PICO.SVC's table in this service's page?
	LD	HL,PIVEC+1
	CP	(HL)
	JR	Z,CONSET
	LD	HL,GLVEC+1
	XOR	(HL)		; carry clear: any other service has loaded
	RET	NZ
	LD	HL,CONDEV
	SET	2,(HL)		; CDGLC
	LD	A,(PIVEC+1)
	OR	A
	JR	NZ,WRDCLR	; PICO.SVC keeps the console, and GLCD? is false
	LD	B,CMUC1
CONSET:	CALL	WRDCLR		; a display has come: the word is false
	CALL	CONFLD		; the mode goes in the CON: field
	LD	A,$FF		; CONACT no field: CONSEL acts
	LD	(CONACT),A
	JP	CONSEL

; Clear the ROM's word from row 3 if it is still there, and otherwise leave the
; row as a program left it. Keeps B, and carry clear if it came clear. Destroys
; AF, HL.
WRDCLR:	LD	HL,CONDEV
	BIT	7,(HL)		; CDWRD
	RET	Z		; the row is a program's, or empty
	RES	7,(HL)
	PUSH	BC		; the console's mode, across the LCD
	LD	HL,PICCLR	; blanks over the word
	CALL	LCD3
	POP	BC
	OR	A		; LCD3 leaves carry set
	RET
