; PICO.SVC: the console on the PICO9918, a TMS9918A-compatible VDP with the
; F18A's 80-column text mode, as a driver below (0006h): 80 x 24 in 6-pixel
; cells, 40 x 24, or Graphics I at 32 x 24 in 8-pixel cells, one driver for
; every width (KD-174). It starts at COLS, which the build sets (PICO40.SVC and
; PICO32.SVC are the same driver starting at 40 and 32), and CON PICO 80, 40 or
; 32 changes it through PICOWID. Its INIT refuses if the ROM's probe found no
; VDP, and hands the ROM its table through TNDRVR; the load then makes it the
; console, and the ROM's terminal calls its routines directly, on the caller's
; stack. REMOVE refuses while it is the console, since CON CRT can't load it
; back, and while the PICO9918 is claimed, since the entries below may be in
; use. Its record, "PICO", is how another service sees it. Version 3 of the
; record's table goes on after the console's words with the graphics entries,
; abi.inc's PICOREG to PICORD, and the width, PICOWID. A program finds them
; with TNFIND, holds the claim while it uses them, and looks them up again
; rather than keep them across its own exit. Everything that follows the
; width, the name table, the second page, the row table and the registers,
; is set by TMSW, so the state lies here and nowhere in the header.
;
; VRAM: patterns at 0000h, names at 0800h (1000h for 80 columns), Graphics I
; colours at 2000h and sprite attributes at 1B00h. Patterns 00h-7Fh are the
; console font, copied from the ROM's at INIT, and 80h-FFh their reverse images. A
; second name table one page up lets row moves be built out of sight and shown
; with one register write. No VRAM access timing is enforced.
%INCLUDE "../src/abi.inc"

IOBYTE  EQU     $0003           ; CP/M's; its CON: field the console in use
VDPDAT  EQU     $BE
VDPCTL  EQU     $BF
COLOUR  EQU     $2000
SPRITE  EQU     $1B00

        ORG     $0100
HDR:	DB	'D',SVCFMT,0,1	; removable
        DW      0,0,0,0         ; REMOVE, size, extra, relocation: the writer's
        DB      0,0,0           ; over the base: BDOS, BIOS, CCP
        DW      0               ; INIT: the writer's
        DB      "PICO    "

; In the ROM's order: VPUT, VGET, VCLREOL, VREST, VRDROW, VWRROW, the row moves,
; columns and rows. Then the graphics entries, at PICOREG to PICORD, and the
; width, at PICOWID. abi.inc names each offset after VTAB, PICOVRB, PICOTPD and
; PICOTPS among them, and the build checks them here.
VTAB:   DW      TMSPUT,TMSGET,TMSCLR,TMSSET,TMSRDR,TMSWRR,TMSFN
WID:    DB      COLS,24         ; the columns, TMSW's, and the rows
	DW	GFXREG,GFXFIL	; PICOREG, PICOFIL
	DW	GFXWR,GFXRD	; PICOWR, PICORD
	DW	TMSWID		; PICOWID
REC:    DW      0
	DB	"PICO    ",PICOVER
        DW      VTAB
LBUF:   DW      0               ; LINEBUF, from TNDRVR
TPDRAW: DB      0               ; the page drawn and the page shown: offset
TPSHOW: DB      0               ; high byte, 0 or TPGV's
TMVCOPY:DB      0               ; 1 while a row move builds the hidden page
TPGV:   DB      0               ; the second page's offset, high byte

INIT:	LD	C,TNFONT	; the ROM's font; a ROM before ABI 5.1
	CALL	ABICALL		; refuses the number, and INIT with it
	RET	C
	LD	(FONTP),HL
	LD	C,TNINFO	; B = what answered at cold boot
	CALL	ABICALL
	LD	A,TNENODV	; no PICO9918: absent, which a line in
	BIT	1,B		; HWBPICO; STARTUP.CMD passes over quietly
        SCF
        RET     Z
	LD	A,(WID)		; the width it starts at
	CALL	TMSW
TMSHK:	LD	B,1		; CRT:
        LD      HL,VTAB
	LD	C,TNDRVR
	CALL	ABICALL
        RET     C
        LD      (LBUF),HL
        LD      HL,REC
        OR      A
        RET

; PICOWID: A = 80, 40 or 32 columns. The table is dropped from the ROM, the
; width set, and the table handed back, so the ROM chooses the console again at
; its next call and clears it at the new width. Carry, with nothing changed,
; for any other width or while the PICO9918 is claimed. Destroys AF, BC, DE
; and HL.
TMSWID:	CP	80
	JR	Z,TMSWD1
	CP	40
	JR	Z,TMSWD1
	CP	32
	SCF
	RET	NZ		; no such width
TMSWD1:	PUSH	AF
	LD	C,TNINFO	; B = the devices, with the claim bit
	CALL	ABICALL
	LD	A,B
	AND	HWBCLM
	JR	Z,TMSWD2
	POP	AF		; claimed: a program may be using it
	SCF
	RET
TMSWD2:	LD	B,1		; CRT:'s table dropped
	LD	HL,0
	LD	C,TNDRVR
	CALL	ABICALL
	POP	AF
	CALL	TMSW
	JR	TMSHK

; The driver at A columns: WID, the name table's address and the second page's
; offset (1000h and 1000h at 80 columns, 0800h and 0400h at 40 and 32), the
; registers and the row table, and page 0 drawn and shown. Destroys AF, BC, DE
; and HL.
TMSW:	LD	(WID),A
	LD	HL,REGS80
	LD	BC,$1010	; B = the names' high byte, C = TPGV
	CP	80
	JR	Z,TMSW1
	LD	HL,REGS40
	LD	BC,$0804
	CP	40
	JR	Z,TMSW1
	LD	HL,REGS32
TMSW1:	LD	A,C
	LD	(TPGV),A
	PUSH	BC
	LD	DE,TMSREGS	; this width's registers
	LD	BC,8
	LDIR
	POP	HL		; H = the names' high byte
	LD	L,C		; 0, from the LDIR
	LD	DE,TMSROWT	; each row's address: names + row * WID
	LD	A,(WID)
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
	LD	(TPDRAW),A
	LD	(TPSHOW),A
	LD	(TMVCOPY),A
	RET

; UNLOAD's check, and the undo of a refused record. Refuses, with carry, while
; the PICO9918 is claimed, or while this driver is the console. Otherwise takes
; its table back from the ROM. Destroys AF, BC, DE and HL.
REMOVE:	LD	C,TNINFO	; B = the devices, with the claim bit
	CALL	ABICALL
	LD	A,B
	AND	HWBCLM		; a claim: a program may be using the entries
	SCF
	RET	NZ
	LD	A,(IOBYTE)	; the console field, which the ROM keeps as
	AND	3		; the mode in effect: CRT: is this driver
	DEC	A
	SCF
	RET	Z
	LD	B,1		; CRT:
	LD	HL,0		; no table
	LD	C,TNDRVR
	JP	ABICALL

; The ROM's three: A = 0 show the page drawn, 1 begin a move of rows B to C,
; 2 end one.
TMSFN:  OR      A
        JR      Z,TMSFLIP
        DEC     A
        JP      Z,TMSMBEG
        DEC     A
        LD      (TMVCOPY),A     ; 0
        RET

; Show the page drawn, if it is not already shown. Destroys AF, HL.
TMSFLIP:LD      A,(TPDRAW)
        LD      HL,TPSHOW
        CP      (HL)
        RET     Z
        LD      (HL),A
; Point register 2 at the page shown.
TMSR2:  LD      A,(TPSHOW)
        RRCA
        RRCA
        LD      HL,TMSREGS+2
        ADD     A,(HL)
        LD      L,A
        LD      H,$82
        JP      VPAIR

; Load registers 0-7, the font and its reverse images, and in Graphics I the
; colours and an empty sprite table. VREST calls this, so a program that changed
; the mode or the patterns leaves a working console. The name table, and so the
; text on the screen, is left alone.
TMSSET: LD      HL,TMSREGS
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
        LD      (TMVCOPY),A
        LD      A,(TPDRAW)
        LD      (TPSHOW),A
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
	LD	BC,(FONTP)	; the ROM's, from TNFONT
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
	LD	A,(WID)
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
; back: an interrupt's own VDP read between the two would split the pair. The
; second LD A,I is for an NMOS Z80, which can clear P/V if an interrupt comes
; during the first. Keeps BC and DE. Destroys AF.
VPAIR:  LD      A,I
        JP      PE,VPAIR1
        LD      A,I
VPAIR1: PUSH    AF
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
        LD      HL,TMSROWT
        ADD     HL,DE
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        LD      A,(TPDRAW)
        ADD     A,H
        LD      H,A
        LD      E,C
        ADD     HL,DE
        RET

; Copy row B to LINEBUF, or LINEBUF to row B, as one block. Destroy AF, BC,
; DE, HL. While a move builds the hidden page, rows are read from the page
; on show.
TMSRDR: LD      A,(TMVCOPY)
        OR      A
        JR      Z,TMSRD1
        LD      A,(TPDRAW)
        PUSH    AF
        LD      A,(TPSHOW)
        LD      (TPDRAW),A
        CALL    TMSRD1
        POP     AF
        LD      (TPDRAW),A
        RET
TMSRD1: LD      C,0
        CALL    TMSCELL
        CALL    TMSRA
	LD	A,(WID)
	LD	B,A
	LD	C,VDPDAT
        LD      HL,(LBUF)
        INIR
        RET
TMSWRR: LD      C,0
        CALL    TMSCELL
        CALL    TMSWA
	LD	A,(WID)
	LD	B,A
	LD	C,VDPDAT
        LD      HL,(LBUF)
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
TMSCLR: LD      A,(WID)
	CP	C
	RET	C
	RET	Z		; pending wrap has no cells left to erase
        CALL    TMSCELL
        CALL    TMSWA
	LD	A,(WID)
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
TMSMBEG:LD      A,(TPDRAW)
        LD      HL,TPSHOW
        CP      (HL)
        JR      Z,TMSMB1
        PUSH    BC
        CALL    TMSFLIP
        POP     BC
TMSMB1: LD	HL,TPGV
	LD	A,(TPSHOW)
	XOR	(HL)
        LD      (TPDRAW),A
        LD      A,1
        LD      (TMVCOPY),A
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

TMSROWT:DS      48              ; each row's address, TMSW's
TMSREGS:DS      8               ; this width's registers 0-7, TMSW's

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

FONTP:	DW	0		; the ROM's font, from TNFONT
IMGEND:
