; HD44780 20 x 4 LCD status display. Cold boot shows the banner on row 0 and
; the mounted drives on rows 1-2. Every wait on the busy flag is bounded, so
; a missing display costs only the time-out.

LCDCMD	EQU	$04		; command write, busy flag and address read
LCDDAT	EQU	$84		; character data

; Initialise: 8-bit, two-line addressing, display on, cursor off, clear: the
; four commands of LCDSEQ. Destroys AF, B and HL.
LCDINIT:LD	HL,LCDSEQ
	LD	B,4		; four commands
LCDI:	LD	A,(HL)
	CALL	LCDC		; each sent once the display is ready
	INC	HL
	DJNZ	LCDI
	RET

; Wait while the display is busy, at most 256 polls. Preserves BC, DE, HL.
; Destroys AF.
LCDWAIT:PUSH	BC
	LD	B,0		; 256 polls at most
LCDW:	IN	A,(LCDCMD)	; bit 7 high while busy
	RLCA			; bit 7, the busy flag, to carry
	JR	NC,LCDWX	; ready
	DJNZ	LCDW
LCDWX:	POP	BC		; ready, or timed out with no display
	RET

; Send command A once the display is ready. Keeps every register.
LCDC:	PUSH	AF		; the command, across the wait
	CALL	LCDWAIT
	POP	AF
	OUT	(LCDCMD),A
	RET

; Write the word at HL to row 3 and mark that it is there, so that a take can
; tell the row is the ROM's to clear. HL = GLCMSG. Returns as LCDROW.
LCDWRD:	PUSH	HL		; the word, across the flag
	LD	HL,CONDEV
	SET	7,(HL)		; CDWRD
	POP	HL

; Write the zero-terminated string at HL to row 3, the row for a recovery
; message: CARD? or GLCD?, or blanks to clear one. Returns as LCDROW.
LCD3:	LD	B,3		; the bottom row, free of the volumes

; Write the zero-terminated string at HL from row B (0-3), column 0. Returns
; carry set, so a caller reporting a failure can end with a jump here, and NZ.
; Destroys AF, HL. BC and DE are kept.
LCDROW:	LD	A,B
	PUSH	HL		; the string, across the lookup
	LD	HL,LCDROWS	; the row's address on the display
	ADD	A,L
	LD	L,A
	JR	NC,LCDR1
	INC	H		; the table's page changed
LCDR1:	LD	A,(HL)
	POP	HL
	CALL	LCDC		; the cursor to the row's start
LCDS:	LD	A,(HL)
	CP	1		; carry at the zero that ends the string
	RET	C
	PUSH	AF		; the character, across the wait
	CALL	LCDWAIT
	POP	AF
	OUT	(LCDDAT),A	; the display steps to the next column
	INC	HL
	JR	LCDS
; Show the drive letters and labels of drives A and B on rows 1 and 2; an
; unmounted drive's row is left as it was. Destroys AF, BC, DE, HL and IX.
LCDVOLS:LD	C,0		; drive A first
LCDV:	PUSH	BC
	CALL	DRVDESC		; IX = drive C's descriptor
	POP	BC
	JR	NZ,LCDVN	; no volume on it
	LD	HL,LINEBUF	; the row's text, in the terminal's row
	CALL	DRVLAB		; buffer, free between console calls
	PUSH	BC
	LD	A,C
	INC	A
	LD	B,A		; row 1 for A, 2 for B
	LD	HL,LINEBUF	; the text DRVLAB made, which LCDROW
	CALL	LCDROW		; writes without the console
	POP	BC
LCDVN:	INC	C		; the next drive
	LD	A,C
	CP	2		; only A and B fit
	JR	C,LCDV
	RET

; HL -> 15 bytes = drive C's letter, ": " and the 11-byte label at DLABEL in
; its descriptor at IX, then a 0: the drive walkers' shared text, LCDVOLS's
; rows in LINEBUF and SHOWVOL's lines in CMDTXT. Keeps BC and IX. Destroys
; AF, DE and HL: DE ends at the 0 and HL past the descriptor's label.
DRVLAB:	LD	A,C
	PUSH	BC
	ADD	A,'A'		; the drive's letter
	LD	(HL),A
	INC	HL
	LD	(HL),':'	; then ": "
	INC	HL
	LD	(HL),' '
	INC	HL		; HL = where the label goes
	PUSH	IX		; DE = IX
	POP	DE
	EX	DE,HL		; DE = the buffer's fourth byte, HL = the
	LD	BC,DLABEL	; descriptor, then its label
	ADD	HL,BC
	LD	BC,11		; the label
	LDIR
	XOR	A		; and its end
	LD	(DE),A
	POP	BC
	RET
