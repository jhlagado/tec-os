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

COLOUR	EQU	$2000		; Graphics I's colour table in VRAM
SPRITE	EQU	$1B00		; and its sprite attribute table

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
; The VDP itself is programmed later, by VREST when CONSW takes CRT:.
; Destroys AF, BC, DE and HL.
PISTART:
	BIT	0,(HL)		; CDMTX: keys for the screen
	RET	Z		; none: the serial console stays
	LD	HL,PITPL	; the template into the block
	LD	DE,PIBLK
	LD	BC,PITPLN
	LDIR
	LD	A,80		; the widest text first
	CALL	TMSW		; a width it knows: no carry
	LD	HL,PIBLK	; CRT:'s table
	LD	(PIVEC),HL
	LD	HL,PIREC	; the registry's tail
	LD	(REGHEAD),HL
	LD	A,CMCRT		; CRT: in effect from the first console call
	LD	(IOBYTE),A	; the other fields 0; CONMOD is still
	RET			; CMTTY, so CONSEL sees the change

; PICOWID: A = 80, 40 or 32 columns. The width set, and CRT:, if in effect,
; chosen again at the next console call, so the terminal takes the new columns
; and clears the screen. Carry, with nothing changed, for any other width or
; while the PICO9918 is claimed. Destroys AF, BC, DE and HL.
TMSWID:	LD	HL,VCLAIM
	INC	(HL)		; VCLAIM tested for zero, left as it was
	DEC	(HL)
	SCF			; carry for the refusal
	RET	NZ		; claimed: a program may be using it
	CALL	TMSW		; the new width, in memory alone
	RET	C		; no such width
	LD	HL,CONMOD
	LD	A,(HL)
	DEC	A		; CRT: in effect: serial for now, so that
	RET	NZ		; CONSEL takes CRT: again (carry clear)
	LD	(HL),A		; CMTTY
	RET

; The console at A columns, 80, 40 or 32: PIWID, the name table's address and
; the second page's offset (1000h and 1000h at 80 columns, 0800h and 0400h at
; 40 and 32), the registers and the row table, and page 0 drawn and shown.
; Only memory changes: VREST (TMSSET) puts the registers in the VDP.
; Carry, with nothing changed, for any other A. Destroys AF, BC, DE and HL.
TMSW:	LD	HL,REGS80
	LD	BC,$1010	; B = the names' high byte, C = PITPG
	CP	80
	JR	Z,TMSW1		; 80 columns
	LD	HL,REGS40
	LD	BC,$0804	; names at 0800h, the second page 0400h on
	CP	40
	JR	Z,TMSW1		; 40 columns
	LD	HL,REGS32	; Graphics I, at 40's addresses
	CP	32
	SCF			; carry for the refusal
	RET	NZ		; no such width
TMSW1:	LD	(PIWID),A
	LD	(PIREGP),HL	; this width's registers
	LD	A,C		; the second page's offset
	LD	(PITPG),A
	LD	H,B		; each row's address: names + row * PIWID
	LD	L,0
	LD	DE,PIROWT	; DE walks the row table
	LD	A,(PIWID)	; C = a row's length
	LD	C,A
	LD	B,24		; 24 rows at every width
TMSW2:	EX	DE,HL		; the row's address into the table
	LD	(HL),E
	INC	HL
	LD	(HL),D
	INC	HL
	EX	DE,HL		; HL back on the address
	LD	A,L		; on by one row's length
	ADD	A,C
	LD	L,A
	JR	NC,TMSW3
	INC	H		; the carry into the high byte
TMSW3:	DJNZ	TMSW2
	XOR	A		; page 0 drawn and shown, no move
	LD	(PITPD),A
	LD	(PITPS),A
	LD	(PIMV),A
	RET

; The ROM's word for VTFN: A = 0 show the page drawn, 1 begin a move of rows B
; to C, 2 end one. Destroys AF, and for 0 and 1 what TMSFLIP and TMSMBEG do.
TMSFN:	OR	A
	JR	Z,TMSFLIP	; 0: show the page drawn
	DEC	A
	JP	Z,TMSMBEG	; 1: a move begins
	DEC	A		; 2 leaves 0
	LD	(PIMV),A	; the move over, shown at the next flip
	RET

; Show the page drawn, if it is not already shown. Keeps BC and DE.
; Destroys AF, HL.
TMSFLIP:
	LD	A,(PITPD)
	LD	HL,PITPS
	CP	(HL)
	RET	Z		; already shown
	LD	(HL),A		; it becomes the page shown
; Point register 2 at the page shown: the name table's base for this width
; plus PITPS's offset. Keeps BC and DE. Destroys AF, HL.
TMSR2:	LD	A,(PITPS)	; the offset's high byte, 00h, 04h or 10h,
	RRCA			; in R2's units of 0400h: 0, 1 or 4
	RRCA
	LD	HL,(PIREGP)	; register 2's value for this width
	INC	HL
	INC	HL
	ADD	A,(HL)		; plus the page's offset
	LD	L,A		; the value first,
	LD	H,$82		; then register 2 with the write flag
	JP	VPAIR

; VREST: load registers 0-7, the font and its reverse images, and in Graphics I
; the colours and an empty sprite table, so a program that changed the mode or
; the patterns leaves a working console. The page drawn is shown, any move
; ended. The name table, and so the text on the screen, is left alone.
; Destroys AF, BC, D and HL.
TMSSET:	LD	HL,(PIREGP)	; this width's eight values
	LD	B,8
	LD	C,$80		; register 0, with the write flag
TMSR:	LD	A,(HL)		; the value
	PUSH	HL
	LD	L,A
	LD	H,C		; and the register, as VPAIR's pair
	CALL	VPAIR
	POP	HL
	INC	HL		; the next value and register
	INC	C
	DJNZ	TMSR
	XOR	A		; show the latest page, any move finished
	LD	(PIMV),A
	LD	A,(PITPD)
	LD	(PITPS),A
	CALL	TMSR2		; register 2 on it, over REGS's page 0
	LD	HL,0		; 256 patterns: font, then its reverse
	CALL	TMSWA		; from 0000h, the pattern table
	LD	D,0		; character code
TMSPAT:	LD	A,D
	AND	$7F		; 80h-FFh: the glyph of the code less 80h
	SUB	$20
	JR	NC,TMSCH	; 20h-7Fh: a glyph of the font's
	XOR	A		; codes below 20h are blank, the space glyph
TMSCH:	LD	L,A		; HL = the font + 8 * (code - 20h)
	LD	H,0
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	LD	BC,FONT		; the ROM's
	ADD	HL,BC
TMSGLY:	LD	B,8		; eight rows a glyph
TMSROW:	LD	A,(HL)
	BIT	7,D		; codes 80h and up: reverse video
	JR	Z,TMSOUT
	CPL
TMSOUT:	OUT	(VDPDAT),A	; the VDP moves its own address on
	INC	HL
	DJNZ	TMSROW
	INC	D
	JR	NZ,TMSPAT	; until the code wraps to 0
	LD	A,(PIWID)
	CP	32
	RET	NZ		; text mode: no colours or sprites
	LD	HL,COLOUR	; Graphics I: white on black for every group
	CALL	TMSWA
	LD	B,32		; 32 groups of eight codes
TMSCOL:	LD	A,$F1		; foreground 15, white; background 1, black
	OUT	(VDPDAT),A
	DJNZ	TMSCOL
	LD	HL,SPRITE	; no sprites
	CALL	TMSWA
	LD	A,$D0		; a Y of D0h ends the sprite list
	OUT	(VDPDAT),A
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

; Set the VRAM write address to HL, of 0000h-3FFFh. Keeps BC, DE and L.
; Destroys AF and H.
TMSWA:	LD	A,H
	AND	$3F		; the address's top six bits
	OR	$40		; and the write flag
	LD	H,A
	JP	VPAIR
; Set the VRAM read address to HL: the same, the flag clear.
TMSRA:	LD	A,H
	AND	$3F		; the address's top six bits, to read
	LD	H,A
; Write L then H to the control port with interrupts off, and put their state
; back: an interrupt's own VDP read between the two would split the pair.
; IFFGET reads the state as an NMOS Z80 needs. Keeps BC, DE and HL.
; Destroys AF.
VPAIR:	CALL	IFFGET		; P/V = the interrupt state
	PUSH	AF
	DI
	LD	A,L		; the low byte, or a register's value
	OUT	(VDPCTL),A
	LD	A,H		; then the high bits and flags
	OUT	(VDPCTL),A
	POP	AF		; P/V as IFFGET found it
	RET	PO		; they were off: left off
	EI
	RET

; HL = address of row B, column C in the page being drawn. Keeps BC.
; Destroys AF, DE.
TMSCELL:
	LD	A,B		; DE = 2 * B, the row's entry
	ADD	A,A
	LD	E,A
	LD	D,0
	LD	HL,PIROWT
	ADD	HL,DE		; its place in the row table
	LD	A,(HL)
	INC	HL
	LD	H,(HL)
	LD	L,A		; HL = the row's address on page 0
	LD	A,(PITPD)	; plus the page's offset, a high byte
	ADD	A,H
	LD	H,A
	LD	E,C		; plus the column; D is still 0
	ADD	HL,DE
	RET

; Copy row B to LINEBUF as one block. While a move builds the hidden page,
; rows are read from the page on show. Destroys AF, BC, DE, HL.
TMSRDR:	LD	A,(PIMV)
	OR	A
	JR	Z,TMSRD1	; no move: from the page drawn
	LD	A,(PITPD)	; else the page shown, for this row,
	PUSH	AF
	LD	A,(PITPS)
	LD	(PITPD),A
	CALL	TMSRD1
	POP	AF		; and the page drawn put back
	LD	(PITPD),A
	RET
TMSRD1:	LD	C,0		; from column 0
	CALL	TMSCELL
	CALL	TMSRA
	LD	A,(PIWID)	; the row's length
	LD	B,A
	LD	C,VDPDAT
	LD	HL,LINEBUF
	INIR			; the VDP moves its own address on
	RET

; Copy LINEBUF to row B of the page drawn as one block. Destroys AF, BC, DE,
; HL.
TMSWRR:	LD	C,0		; from column 0
	CALL	TMSCELL
	CALL	TMSWA
	LD	A,(PIWID)	; the row's length
	LD	B,A
	LD	C,VDPDAT
	LD	HL,LINEBUF	; the terminal's row buffer
	OTIR
	RET

; Put A at row B, column C of the page drawn. Keeps BC. Destroys AF, DE, HL.
TMSPUT:	PUSH	AF		; the character, across the addressing
	CALL	TMSCELL
	CALL	TMSWA
	POP	AF
	OUT	(VDPDAT),A	; into the cell
	RET

; A = the character at row B, column C of the page drawn. Keeps BC.
; Destroys F, DE, HL.
TMSGET:	CALL	TMSCELL
	CALL	TMSRA		; the cell, to read
	IN	A,(VDPDAT)
	RET

; Clear row B of the page drawn from column C to the end of the line, nothing
; when C is at or past the width. Keeps C. Destroys AF, B, DE, HL.
TMSCLR:	LD	A,(PIWID)
	CP	C
	RET	C		; C past the row's end
	RET	Z		; pending wrap has no cells left to erase
	CALL	TMSCELL
	CALL	TMSWA
	LD	A,(PIWID)	; B = the cells from C to the end
	SUB	C
	LD	B,A
TMSCLL:	LD	A,' '		; a space in each
	OUT	(VDPDAT),A
	DJNZ	TMSCLL
	RET

; Start a move of rows B to C. If the page drawn is already the page shown,
; draw the other one from now on, copying the rows outside B to C across;
; the move then reads the shown page and writes the hidden one. A move still
; waiting to be shown is shown first, so output is never more than one move
; behind. Keeps BC and E. Destroys AF, D, HL and LINEBUF.
TMSMBEG:
	LD	A,(PITPD)
	LD	HL,PITPS
	CP	(HL)
	JR	Z,TMSMB1	; nothing waiting to be shown
	CALL	TMSFLIP		; the last move shown first, BC kept
TMSMB1:	LD	HL,PITPG
	LD	A,(PITPS)	; draw the page not shown
	XOR	(HL)
	LD	(PITPD),A
	LD	A,1		; rows read from the page shown
	LD	(PIMV),A
	LD	D,0		; D = each row, 0 to 23
TMSMBL:	LD	A,D
	CP	B
	JR	C,TMSMBC	; above the move: copied across
	CP	C
	JR	C,TMSMBN	; within B to C: the move writes it
	JR	Z,TMSMBN
TMSMBC:	PUSH	BC		; the move's rows and the row kept
	PUSH	DE
	LD	B,D		; the row from the page shown
	CALL	TMSRDR
	POP	DE
	PUSH	DE
	LD	B,D		; to the same row of the page drawn
	CALL	TMSWRR
	POP	DE
	POP	BC
TMSMBN:	INC	D		; the next row
	LD	A,D
	CP	24
	JR	NZ,TMSMBL
	RET


; Registers 0-7.
; - 80 columns (PICO9918 TEXT80, also the V9938 TEXT2 and F18A T80 mode):
;   R0 bit 2 with text mode, names at a 4 KiB boundary (R2 low bits set as
;   the V9938 requires), patterns at 0000h, white on dark blue. No unlock is
;   needed.
; - 40 columns: text mode, the same colours.
; - Graphics I: patterns 0000h, colours 2000h, sprites 1B00h/3800h.
REGS80:	DB	$04,$50,$1000/$400+3,$00,$00,$00,$00,$F4
REGS40:	DB	$00,$D0,$0800/$400,$00,$00,$00,$00,$F4
REGS32:	DB	$00,$C0,$0800/$400,COLOUR/$40,$00,SPRITE/$80,$07,$F1

