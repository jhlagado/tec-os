; The PICO9918's console and graphics entries, in the ROM (KS39): a TMS9918A-
; compatible VDP with the F18A's 80-column text mode, at 80 x 24 in 6-pixel
; cells, 40 x 24, or Graphics I at 32 x 24 in 8-pixel cells, CON PICO choosing.
; When the VDP and the matrix keyboard both answer at cold boot, PISTART fills
; PIBLK from PITPL, sets the width, hands the table to the terminal through
; PIVEC, registers the record and puts CRT: in the IOBYTE's CON: field; the
; first console call then programs the VDP through CONSWV, as for a driver.
; PIBLK is the table, the record and the state in the order PICO.SVC had them
; (version 3), so abi.inc's offsets and a debugger's reading hold; it lies in
; the BIOS's state, which warm boot leaves, so the width is kept.

COLOUR  EQU     $2000
SPRITE  EQU     $1B00

; PIBLK's first 39 bytes: the table, as the terminal and abi.inc's PICOREG to
; PICOWID read it, then the record, the permanent tail of the registry.
PITPL:	DW	TMSPUT,TMSGET,TMSCLR,TMSSET,TMSRDR,TMSWRR,TMSFN
	DB	80,24		; the columns, TMSW's, and the rows
	DW	GFXREG,GFXFIL	; PICOREG, PICOFIL
	DW	GFXWR,GFXRD	; PICOWR, PICORD
	DW	TMSWID		; PICOWID
	DW	0		; the record: no link, its name, version
	DB	"PICO    ",PICOVER
	DW	PIBLK		; and the table
PITPLN	EQU	$-PITPL

; The console at cold boot, from VIDINIT with CONDEV in HL: on a board with the
; VDP and the matrix keyboard, the block filled at 80 columns, the table hooked
; for CRT:, the record registered and CRT: in the field. Otherwise nothing.
PISTART:BIT	0,(HL)		; CDMTX: keys for the screen
	RET	Z
	LD	HL,PITPL
	LD	DE,PIBLK
	LD	BC,PITPLN
	LDIR
	LD	A,80
	CALL	TMSW
	LD	HL,PIBLK	; CRT:'s table
	LD	(PIVEC),HL
	LD	HL,PIREC	; the registry's tail
	LD	(REGHEAD),HL
	LD	A,CMCRT		; CRT: in effect from the first console call
	LD	(IOBYTE),A
	RET

; PICOWID: A = 80, 40 or 32 columns. The width set, and CRT:, if in effect,
; chosen again at the next console call, so the terminal takes the new columns
; and clears the screen. Carry, with nothing changed, for any other width or
; while the PICO9918 is claimed. Destroys AF, BC, DE and HL.
TMSWID:	LD	HL,VCLAIM
	INC	(HL)
	DEC	(HL)
	SCF
	RET	NZ		; claimed: a program may be using it
	CALL	TMSW
	RET	C		; no such width
	LD	HL,CONMOD
	LD	A,(HL)
	DEC	A		; CRT: in effect: serial for now, so that
	RET	NZ		; CONSEL takes CRT: again (carry clear)
	LD	(HL),A
	RET

; The console at A columns, 80, 40 or 32: PIWID, the name table's address and
; the second page's offset (1000h and 1000h at 80 columns, 0800h and 0400h at
; 40 and 32), the registers and the row table, and page 0 drawn and shown.
; Carry, with nothing changed, for any other A. Destroys AF, BC, DE and HL.
TMSW:	LD	HL,REGS80
	LD	BC,$1010	; B = the names' high byte, C = PITPG
	CP	80
	JR	Z,TMSW1
	LD	HL,REGS40
	LD	BC,$0804
	CP	40
	JR	Z,TMSW1
	LD	HL,REGS32
	CP	32
	SCF
	RET	NZ		; no such width
TMSW1:	LD	(PIWID),A
	LD	(PIREGP),HL	; this width's registers
	LD	A,C
	LD	(PITPG),A
	LD	H,B		; each row's address: names + row * PIWID
	LD	L,0
	LD	DE,PIROWT
	LD	A,(PIWID)
	LD	C,A
	LD	B,24
TMSW2:	EX	DE,HL
	LD	(HL),E
	INC	HL
	LD	(HL),D
	INC	HL
	EX	DE,HL
	LD	A,L
	ADD	A,C
	LD	L,A
	JR	NC,TMSW3
	INC	H
TMSW3:	DJNZ	TMSW2
	XOR	A		; page 0 drawn and shown, no move
	LD	(PITPD),A
	LD	(PITPS),A
	LD	(PIMV),A
	RET

; The ROM's three: A = 0 show the page drawn, 1 begin a move of rows B to C,
; 2 end one.
TMSFN:  OR      A
        JR      Z,TMSFLIP
        DEC     A
        JP      Z,TMSMBEG
        DEC     A
        LD      (PIMV),A     ; 0
        RET

; Show the page drawn, if it is not already shown. Destroys AF, HL.
TMSFLIP:LD      A,(PITPD)
        LD      HL,PITPS
        CP      (HL)
        RET     Z
        LD      (HL),A
; Point register 2 at the page shown.
TMSR2:  LD      A,(PITPS)
        RRCA
        RRCA
	LD	HL,(PIREGP)	; register 2's value for this width
	INC	HL
	INC	HL
        ADD     A,(HL)
        LD      L,A
        LD      H,$82
        JP      VPAIR

; Load registers 0-7, the font and its reverse images, and in Graphics I the
; colours and an empty sprite table. VREST calls this, so a program that changed
; the mode or the patterns leaves a working console. The name table, and so the
; text on the screen, is left alone.
TMSSET: LD	HL,(PIREGP)
        LD      B,8
        LD      C,$80
TMSR:   LD      A,(HL)
        PUSH    HL
        LD      L,A
        LD      H,C
        CALL    VPAIR
        POP     HL
        INC     HL
        INC     C
        DJNZ    TMSR
        XOR     A               ; show the latest page, any move finished
        LD      (PIMV),A
        LD      A,(PITPD)
        LD      (PITPS),A
        CALL    TMSR2
        LD      HL,0            ; 256 patterns: font, then its reverse
        CALL    TMSWA
        LD      D,0             ; character code
TMSPAT: LD      A,D
        AND     $7F
        SUB     $20
        JR      NC,TMSCH
        XOR     A               ; codes below 20h are blank, the space glyph
TMSCH:  LD      L,A             ; HL = the font + 8 * (code - 20h)
        LD      H,0
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
	LD	BC,FONT		; the ROM's
        ADD     HL,BC
TMSGLY: LD      B,8
TMSROW: LD      A,(HL)
        BIT     7,D
        JR      Z,TMSOUT
        CPL
TMSOUT: OUT     (VDPDAT),A
        INC     HL
        DJNZ    TMSROW
        INC     D
        JR      NZ,TMSPAT
	LD	A,(PIWID)
	CP	32
	RET	NZ		; text mode: no colours or sprites
        LD      HL,COLOUR       ; Graphics I: white on black for every group
        CALL    TMSWA
        LD      B,32
TMSCOL: LD      A,$F1
        OUT     (VDPDAT),A
        DJNZ    TMSCOL
        LD      HL,SPRITE       ; no sprites
        CALL    TMSWA
        LD      A,$D0
        OUT     (VDPDAT),A
        RET

; The graphics entries, reached through the record's table. Each assumes that
; the caller holds the claim, as a program writing the ports does, and destroys
; AF, BC, DE and HL. A count of zero moves nothing.

; Set register B to A.
GFXREG:	LD	L,A		; the value goes first
	LD	A,B
	OR	$80		; then the register, with its write flag
	LD	H,A
	JP	VPAIR

; Fill DE bytes of VRAM from address HL with A.
GFXFIL:	LD	C,A		; the value, across the addressing
	CALL	TMSWA
GFXFL:	LD	A,D		; tested first, so that 0 fills nothing
	OR	E
	RET	Z		; the count has run out
	LD	A,C		; the VDP moves its own address on
	OUT	(VDPDAT),A
	DEC	DE
	JR	GFXFL

; Copy BC bytes from DE to VRAM address HL.
GFXWR:	CALL	TMSWA
	EX	DE,HL		; HL = the source
GFXWL:	LD	A,B		; tested first, so that 0 copies nothing
	OR	C
	RET	Z		; the count has run out
	LD	A,(HL)		; the VDP moves its own address on
	OUT	(VDPDAT),A
	INC	HL
	DEC	BC
	JR	GFXWL

; Copy BC bytes from VRAM address HL to DE.
GFXRD:	CALL	TMSRA
	EX	DE,HL		; HL = the destination
GFXRL:	LD	A,B		; tested first, so that 0 copies nothing
	OR	C
	RET	Z		; the count has run out
	IN	A,(VDPDAT)	; the VDP moves its own address on
	LD	(HL),A
	INC	HL
	DEC	BC
	JR	GFXRL

; Set the VRAM write address to HL.
TMSWA:  LD      A,H
        AND     $3F
        OR      $40
        LD      H,A
        JP      VPAIR
; Set the VRAM read address to HL.
TMSRA:  LD      A,H
        AND     $3F
        LD      H,A
; Write L then H to the control port with interrupts off, and put their state
; back: an interrupt's own VDP read between the two would split the pair.
; IFFGET reads the state as an NMOS Z80 needs. Keeps BC and DE. Destroys AF.
VPAIR:	CALL	IFFGET		; P/V = the interrupt state
	PUSH	AF
        DI
        LD      A,L
        OUT     (VDPCTL),A
        LD      A,H
        OUT     (VDPCTL),A
        POP     AF
        RET     PO
        EI
        RET

; HL = address of row B, column C in the page being drawn. Destroys AF, DE.
TMSCELL:LD      A,B
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,PIROWT
        ADD     HL,DE
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        LD      A,(PITPD)
        ADD     A,H
        LD      H,A
        LD      E,C
        ADD     HL,DE
        RET

; Copy row B to LINEBUF, or LINEBUF to row B, as one block. Destroy AF, BC,
; DE, HL. While a move builds the hidden page, rows are read from the page
; on show.
TMSRDR: LD      A,(PIMV)
        OR      A
        JR      Z,TMSRD1
        LD      A,(PITPD)
        PUSH    AF
        LD      A,(PITPS)
        LD      (PITPD),A
        CALL    TMSRD1
        POP     AF
        LD      (PITPD),A
        RET
TMSRD1: LD      C,0
        CALL    TMSCELL
        CALL    TMSRA
	LD	A,(PIWID)
	LD	B,A
	LD	C,VDPDAT
        LD      HL,LINEBUF
        INIR
        RET
TMSWRR: LD      C,0
        CALL    TMSCELL
        CALL    TMSWA
	LD	A,(PIWID)
	LD	B,A
	LD	C,VDPDAT
        LD      HL,LINEBUF
        OTIR
        RET

; Put A at row B, column C. Destroys AF, DE, HL.
TMSPUT: PUSH    AF
        CALL    TMSCELL
        CALL    TMSWA
        POP     AF
        OUT     (VDPDAT),A
        RET

; A = the character at row B, column C. Destroys DE, HL.
TMSGET: CALL    TMSCELL
        CALL    TMSRA
        IN      A,(VDPDAT)
        RET

; Clear row B from column C to the end of the line.
TMSCLR: LD      A,(PIWID)
	CP	C
	RET	C
	RET	Z		; pending wrap has no cells left to erase
        CALL    TMSCELL
        CALL    TMSWA
	LD	A,(PIWID)
        SUB     C
        LD      B,A
TMSCLL: LD      A,' '
        OUT     (VDPDAT),A
        DJNZ    TMSCLL
        RET

; Start a move of rows B to C. If the page drawn is already the page shown,
; draw the other one from now on, copying the rows outside B to C across;
; the move then reads the shown page and writes the hidden one. A move still
; waiting to be shown is shown first, so output is never more than one move
; behind.
TMSMBEG:LD      A,(PITPD)
        LD      HL,PITPS
        CP      (HL)
        JR      Z,TMSMB1
        PUSH    BC
        CALL    TMSFLIP
        POP     BC
TMSMB1: LD	HL,PITPG
	LD	A,(PITPS)
	XOR	(HL)
        LD      (PITPD),A
        LD      A,1
        LD      (PIMV),A
        LD      D,0
TMSMBL: LD      A,D
        CP      B
        JR      C,TMSMBC
        CP      C
        JR      C,TMSMBN
        JR      Z,TMSMBN
TMSMBC: PUSH    BC
        PUSH    DE
        LD      B,D
        CALL    TMSRDR
        POP     DE
        PUSH    DE
        LD      B,D
        CALL    TMSWRR
        POP     DE
        POP     BC
TMSMBN: INC     D
        LD      A,D
        CP      24
        JR      NZ,TMSMBL
        RET


; Registers 0-7.
; - 80 columns (PICO9918 TEXT80, also the V9938 TEXT2 and F18A T80 mode):
;   R0 bit 2 with text mode, names at a 4 KiB boundary (R2 low bits set as
;   the V9938 requires), patterns at 0000h, white on dark blue. No unlock is
;   needed.
; - 40 columns: text mode, the same colours.
; - Graphics I: patterns 0000h, colours 2000h, sprites 1B00h/3800h.
REGS80: DB      $04,$50,$1000/$400+3,$00,$00,$00,$00,$F4
REGS40: DB      $00,$D0,$0800/$400,$00,$00,$00,$00,$F4
REGS32: DB      $00,$C0,$0800/$400,COLOUR/$40,$00,SPRITE/$80,$07,$F1

