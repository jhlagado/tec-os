; GLCD.SVC: the ST7920 128 x 64 GLCD console as a driver below (0006h), 21
; columns x 8 rows of 6 x 8 cells, built from the ROM's GLCD code. Its INIT
; checks that the controller answers and hands the ROM its video table through
; TNDRVR; the CCP then takes the console, unless a PICO9918 has it, and the
; ROM's terminal calls its six routines directly, on the caller's stack. It
; keeps its screen text and its counters here, draws from the ROM's font, and
; moves rows to and from the ROM's LINEBUF, whose address TNDRVR returns. Its
; REMOVE, at UNLOAD, gives the console back: to CRT: if the ROM's PICO9918
; console started, otherwise to serial.
%INCLUDE "../src/abi.inc"

GLCOLS	EQU	21
GLROWS	EQU	8
IOBYTE	EQU	$0003

	ORG	$0100
HDR:	DB	'D',SVCFMT,0,1	; removable
	DW	0,0,0,0		; REMOVE, size, extra, relocation: the writer's
	DB	2,0,6		; over the base: BDOS, BIOS, CCP
	DW	0		; INIT: the writer's
	DB	"GLCD    "

; The video vector, in the ROM's order: VPUT, VGET, VCLREOL, VREST, VRDROW,
; VWRROW.
VTAB:	DW	GLCPUT,GLCGET,GLCCLR,GLCRST,GLRDR,GLWRR
	DW	0		; only the PICO9918 has row moves to show
	DB	GLCOLS,GLROWS
LBUF:	DW	0		; LINEBUF, from TNDRVR

; INIT refuses if the controller doesn't answer, or the ROM refuses UC1:'s
; table: another GLCD.SVC has the console, or there is no matrix keyboard.
; With another display the console, it loads all the same and the ROM's
; loader leaves the console where it is (SVCGO): a line in STARTUP.CMD gives
; way to the ROM's PICO9918 console quietly (KE-150). It publishes no record.
; Returns carry clear and HL = 0 when loaded, carry set and A = the status
; when refused. Destroys AF, BC, DE, HL.
INIT:	LD	C,TNFONT	; the ROM's font; a ROM before ABI 5.1
	CALL	ABICALL		; refuses the number, and INIT with it
	RET	C
	LD	(FONTP),HL	; kept for GLGLY
	CALL	GLCWAIT		; Z: the controller answers
	LD	A,TNENODV	; no controller answers: absent, which a
	SCF			; line in STARTUP.CMD passes over quietly
	RET	NZ
	LD	B,3		; UC1:
	LD	HL,VTAB		; the table the terminal calls through
	LD	C,TNDRVR
	CALL	ABICALL		; HL = LINEBUF, or carry: refused
	RET	C
	LD	(LBUF),HL	; where GLRDR and GLWRR move rows
	LD	HL,0		; no record to register
	OR	A		; carry clear: loaded
	RET

; REMOVE, at UNLOAD: if the ROM's PICO9918 console registered its record and
; UC1: is the console, the console field becomes CRT:. UC1:'s table then
; goes, and the ROM chooses the console again at its next call. Returns as
; TNDRVR does, A = 0 and carry clear. Destroys AF, BC, DE, HL.
REMOVE:	LD	DE,PICONAM
	LD	BC,$0100+TNFIND	; version 1 or later
	CALL	ABICALL		; carry: no record, the ROM's console
	JR	C,REMOV1	; never started
	LD	HL,IOBYTE	; UC1: becomes CRT:, and no other field changes
	LD	A,(HL)		; the console field, bits 0-1: 3 for
	CPL			; UC1:, so 0 once complemented
	AND	3
	JR	NZ,REMOV1	; another device has the console
	RES	1,(HL)		; 3 to 1: CRT:
REMOV1:	LD	B,3		; UC1:'s table dropped
	LD	HL,0		; HL = 0: no table
	LD	C,TNDRVR
	JP	ABICALL
PICONAM:
	DB	"PICO    "	; the ROM console's record

; The ST7920's ports: commands and the busy flag, and display data.
GLCCMD	EQU	$07
GLCDAT	EQU	$87

; Wait until the controller is ready, polling its busy flag at most 256
; times. Returns Z, NC and A = 0 when ready; NZ and A = 1 when it never was:
; no controller, or one stuck busy. Preserves BC, DE, HL; the count is kept
; in GLWN, not on the stack, since the routines run on their caller's.
GLCWAIT:
	XOR	A		; 0: the first DEC makes it 255,
	LD	(GLWN),A	; so 256 polls
GLCWL:	IN	A,(GLCCMD)	; bit 7, busy, into carry
	RLCA
	JR	NC,GLCWOK	; not busy: ready
	LD	A,(GLWN)	; one poll fewer left
	DEC	A
	LD	(GLWN),A
	JR	NZ,GLCWL
	OR	1		; A is 0 here: NZ for the timeout
	RET
GLCWOK:	XOR	A		; Z: ready
	RET

; Send command A once the controller is ready; after a timeout the byte is
; dropped, not sent. Returns A = the byte, Z if it was sent and NZ if not;
; destroys F. Preserves BC, DE, HL.
GLCC:	LD	(GLOUT),A	; held over the wait, off the stack
	CALL	GLCWAIT
	LD	A,(GLOUT)
	RET	NZ		; never ready: nothing sent (KE-198)
	OUT	(GLCCMD),A	; to the instruction register
	RET

; Send data A, as GLCC does a command, to the graphics RAM at the
; controller's address: two bytes make a word, left half first, and the
; address then moves to the next word. Returns A = the byte, Z if it was
; sent and NZ if not; destroys F. Preserves BC, DE, HL.
GLCDW:	LD	(GLOUT),A	; held over the wait, off the stack
	CALL	GLCWAIT
	LD	A,(GLOUT)
	RET	NZ		; never ready: nothing sent
	OUT	(GLCDAT),A	; to the data register
	RET

; VRDROW: copy text row B's 21 characters to LINEBUF. Destroys AF, BC, DE,
; HL.
GLRDR:	LD	C,0		; from column 0
	CALL	GLCADR		; HL = the row in GLTEXT
	LD	DE,(LBUF)	; to LINEBUF
	LD	BC,GLCOLS
	LDIR
	RET

; VWRROW: copy LINEBUF's 21 characters to text row B and redraw the row.
; Destroys AF, C, DE, HL; B is kept.
GLWRR:	PUSH	BC		; B, the row, for the redraw
	LD	C,0
	CALL	GLCADR		; DE = the row in GLTEXT, HL = LINEBUF
	EX	DE,HL
	LD	HL,(LBUF)
	LD	BC,GLCOLS
	LDIR			; the row in
	POP	BC
	JP	GLCROW		; and drawn

; VREST, at install and at warm boot: put the controller in graphics mode
; with the display on and its text layer clear. Graphics RAM keeps whatever
; a program drew until the console next writes over it. Returns NZ, nothing
; sent, if the controller doesn't answer. Destroys AF, B, HL.
GLCRST:	CALL	GLCWAIT		; NZ: no controller to set
	RET	NZ
	LD	HL,GLCMOD	; the five commands, in order
	LD	B,5
GLCRSL:	LD	A,(HL)
	CALL	GLCC		; each once the last has finished
	INC	HL
	DJNZ	GLCRSL
	RET
; 30h the basic set, 0Ch display on with no cursor, 01h clear the text
; layer, 34h the extended set, 36h the extended set with graphics shown.
GLCMOD:	DB	$30,$0C,$01,$34,$36

; HL = GLTEXT address of row B, column C: GLTEXT + 21B + C. Preserves BC, DE;
; destroys AF.
GLCADR:	PUSH	DE
	LD	HL,GLTEXT
	LD	DE,GLCOLS	; a row's length
	LD	A,B		; row 0: no rows to pass
	OR	A
	JR	Z,GLCAC
GLCAM:	ADD	HL,DE		; one row on, B times
	DEC	A
	JR	NZ,GLCAM
GLCAC:	LD	E,C		; D is 0: DE = the column
	ADD	HL,DE
	POP	DE
	RET

; Put A at row B, column C and redraw the words its cell touches: on each of
; the cell's eight pixel rows, the one or two words its six pixels fall in.
; Bit 7 of A set draws the cell reversed. Destroys AF, C, DE, HL; B is kept.
GLCPUT:	PUSH	AF		; the character, over the address
	CALL	GLCADR
	POP	AF
	LD	(HL),A		; into the screen text
	PUSH	BC
	LD	C,0		; the row's start, for GLCCMP
	CALL	GLCADR
	POP	BC
	LD	(GLROWP),HL
	LD	A,C		; the cell spans pixels 6C to 6C+5
	ADD	A,A
	LD	E,A
	ADD	A,A
	ADD	A,E		; A = 6C
	LD	E,A
	SRL	A		; 16 pixels a word
	SRL	A
	SRL	A
	SRL	A
	LD	D,A		; first word
	LD	A,E
	ADD	A,5		; the cell's last pixel
	SRL	A
	SRL	A
	SRL	A
	SRL	A
	LD	E,A		; last word
	LD	A,B		; pixel row 8B, the cell's top
	ADD	A,A
	ADD	A,A
	ADD	A,A
	LD	(GLY),A
	LD	C,8		; eight pixel rows
GLCPR:	LD	A,D		; each from the first word
GLCPW:	LD	(GLW),A
	PUSH	BC
	PUSH	DE		; the words, over GLCCMP
	CALL	GLCSETA		; an address for each word
	CALL	GLCCMP		; DE = the word's pixels
	LD	A,D		; left half first
	CALL	GLCDW
	LD	A,E
	CALL	GLCDW		; then the right
	POP	DE
	POP	BC
	LD	A,(GLW)
	CP	E		; the last word drawn: the next row
	JR	Z,GLCPN
	INC	A		; otherwise the next word
	JR	GLCPW
GLCPN:	LD	HL,GLY		; the next pixel row
	INC	(HL)
	DEC	C
	JR	NZ,GLCPR
	RET

; VGET: A = the character at row B, column C. Destroys F, HL.
GLCGET:	CALL	GLCADR
	LD	A,(HL)		; bit 7 set for a reversed cell
	RET

; VCLREOL: clear row B from column C to the end of the line and redraw the
; row. At a pending wrap C is past the row: the count would be 256 and the
; fill would run on through the text, the counters and FONTP. Destroys AF,
; C, DE, HL; B is kept.
GLCCLR:	LD	A,C
	CP	GLCOLS
	RET	NC		; no cells left to erase
	CALL	GLCADR
	LD	A,GLCOLS	; the cells from C to the end
	SUB	C
GLCCL:	LD	(HL),' '	; a space in each
	INC	HL
	DEC	A
	JR	NZ,GLCCL
	JR	GLCROW		; B kept: the row drawn

; Redraw text row B: eight pixel rows, each streamed as eight words from one
; address, the controller moving on a word by itself. Destroys AF, C, DE,
; HL; B is kept.
GLCROW:	LD	C,0
	CALL	GLCADR
	LD	(GLROWP),HL	; the row's text, for GLCCMP
	LD	A,B		; pixel row 8B, the text row's top
	ADD	A,A
	ADD	A,A
	ADD	A,A
	LD	(GLY),A
	LD	C,8		; eight pixel rows
GLCRL:	XOR	A		; each from word 0
	LD	(GLW),A
	PUSH	BC
	CALL	GLCSETA		; one address for the pixel row
GLCRW:	CALL	GLCCMP		; DE = the word's pixels
	LD	A,D		; left half, then right
	CALL	GLCDW
	LD	A,E
	CALL	GLCDW
	LD	HL,GLW		; the next word, up to the eighth
	INC	(HL)
	LD	A,(HL)
	CP	8
	JR	NZ,GLCRW	; no new address: the controller's moved on
	POP	BC
	LD	HL,GLY		; the next pixel row
	INC	(HL)
	DEC	C
	JR	NZ,GLCRL
	RET

; Set the graphics address to pixel row GLY, word GLW. The ST7920 maps the
; screen's lower half, rows 32-63, as rows 0-31 at words 8-15. Destroys AF,
; B.
GLCSETA:
	LD	A,(GLY)
	LD	B,0		; the upper half: words 0-7
	CP	32
	JR	C,GLCSU
	SUB	32		; the lower half: rows 0-31 again,
	LD	B,8		; words 8-15
GLCSU:	OR	$80		; the vertical address first
	CALL	GLCC
	LD	A,(GLW)		; then the horizontal
	ADD	A,B
	OR	$80
	JP	GLCC

; DE = the 16 pixels of word GLW on pixel row GLY, D on the left, from the
; text row at GLROWP. A cell's glyph row is 6 pixels (5 of glyph, 1 of
; space); a reverse cell inverts all 6. Destroys AF, BC, HL and GLOFF.
GLCCMP:	LD	A,(GLW)		; two bytes an entry in GLCSPAN
	ADD	A,A
	LD	HL,GLCSPAN
	ADD	A,L
	LD	L,A
	JR	NC,GLCCS	; the table may cross a page
	INC	H
GLCCS:	LD	B,(HL)		; first character
	INC	HL
	LD	C,(HL)		; how many
	LD	A,B		; offset = 6 * first - 16 * word, signed
	ADD	A,A
	LD	L,A
	ADD	A,A
	ADD	A,L
	LD	L,A		; L = 6 * first
	LD	A,(GLW)		; less 16 * word
	ADD	A,A
	ADD	A,A
	ADD	A,A
	ADD	A,A
	NEG			; made negative, and 6 * first added
	ADD	A,L
	LD	(GLOFF),A	; the first cell's start, from the word's
				; left edge
	LD	DE,0		; the word's pixels gathered here
GLCCH:	PUSH	BC
	LD	HL,(GLROWP)	; the character in the text row
	LD	A,B
	ADD	A,L
	LD	L,A
	JR	NC,GLCCG	; the row may cross a page
	INC	H
GLCCG:	LD	A,(HL)
	CALL	GLGLY		; A = its pixels on this pixel row
	LD	H,A		; HL = them at the left of 16 bits
	LD	L,0
	LD	A,(GLOFF)
	OR	A		; offset 0: in place
	JR	Z,GLCCO
	JP	M,GLCCLF	; negative: the cell starts in the word
				; to the left
GLCCR:	SRL	H		; positive: shifted right, and what
	RR	L		; leaves L is the next word's
	DEC	A
	JR	NZ,GLCCR
	JR	GLCCO
GLCCLF:	NEG			; shifted left by -offset, and what
GLCCLL:	ADD	HL,HL		; leaves H is the word to the left's
	DEC	A
	JR	NZ,GLCCLL
GLCCO:	LD	A,D		; merged into the word
	OR	H
	LD	D,A
	LD	A,E		; and its right half
	OR	L
	LD	E,A
	LD	A,(GLOFF)	; the next cell starts 6 pixels on
	ADD	A,6
	LD	(GLOFF),A
	POP	BC
	INC	B		; the next character
	DEC	C
	JR	NZ,GLCCH
	RET

; A = glyph row (GLY mod 8) of character A in bits 7-2, reversed when bit 7
; of the character is set; control codes draw as a space. Preserves B, DE;
; destroys F, C, HL, which GLCCMP keeps.
GLGLY:	LD	C,A		; bit 7, reverse, kept for the end
	AND	$7F
	SUB	$20		; the font starts at the space
	JR	NC,GLGL1
	XOR	A		; control codes draw as a space
GLGL1:	LD	L,A		; HL = 8 bytes a character
	LD	H,0
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	LD	A,(GLY)		; one byte a pixel row
	AND	7
	ADD	A,L		; L's low three bits are 0: no carry
	LD	L,A
	LD	A,(FONTP)	; the font's start, added by hand so that C
	ADD	A,L		; and DE stay
	LD	L,A
	LD	A,(FONTP+1)
	ADC	A,H
	LD	H,A
	LD	A,(HL)		; the glyph row's pixels
	BIT	7,C
	RET	Z		; normal video
	CPL			; reversed: the six pixels inverted,
	AND	$FC		; bits 1-0 left clear
	RET

; For each word: the first character it touches and how many.
GLCSPAN:
	DB	0,3, 2,4, 5,3, 8,3, 10,4, 13,3, 16,3, 18,3

; ---- State: the screen's characters and the drawing counters -----------------
; GLTEXT holds the 21 x 8 characters, row by row.
GLTEXT:	DS	GLCOLS*GLROWS,' '
GLY:	DS	1		; the pixel row being drawn, 0-63
GLW:	DS	1		; the word being drawn, 0-7
GLROWP:	DS	2		; the text row being drawn
GLOFF:	DS	1		; the cell's start from the word's edge
GLWN:	DS	1		; GLCWAIT's polls left
GLOUT:	DS	1		; GLCC's and GLCDW's byte over the wait
FONTP:	DW	0		; the ROM's font, from TNFONT

IMGEND:
