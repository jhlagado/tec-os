; HD44780 20 x 4 LCD status display. Cold boot shows the banner on row 0 and
; the mounted drives on rows 1-2. Every wait on the busy flag is bounded, so
; a missing display costs only the time-out.

LCDCMD  EQU     $04
LCDDAT  EQU     $84

; Initialise: 8-bit, two-line addressing, display on, cursor off, clear.
LCDINIT:LD      HL,LCDSEQ
        LD      B,4
LCDI:   LD      A,(HL)
        CALL    LCDC
        INC     HL
        DJNZ    LCDI
        RET

; Wait while the display is busy, at most 256 polls. Preserves BC, DE, HL.
LCDWAIT:PUSH    BC
        LD      B,0
LCDW:   IN      A,(LCDCMD)
        RLCA
        JR      NC,LCDWX
        DJNZ    LCDW
LCDWX:  POP     BC
        RET

; Send command A.
LCDC:   PUSH    AF
        CALL    LCDWAIT
        POP     AF
        OUT     (LCDCMD),A
        RET

; Write the word at HL to row 3 and mark that it is there, so that a take can
; tell the row is the ROM's to clear. HL = PICMSG or GLCMSG. Returns as LCDROW.
LCDWRD:	PUSH	HL		; the word, across the flag
	LD	HL,CONDEV
	SET	7,(HL)		; CDWRD
	POP	HL

; Write the zero-terminated string at HL to row 3, the row for a recovery
; message: CARD?, GLCD? or PICO?, or blanks to clear one. Returns as LCDROW.
LCD3:	LD	B,3		; the bottom row, free of the volumes

; Write the zero-terminated string at HL from row B (0-3), column 0. Returns
; carry set, so a caller reporting a failure can end with a jump here, and NZ.
; Destroys AF, HL. BC and DE are kept.
LCDROW:	LD	A,B
	PUSH	HL
	LD	HL,LCDROWS	; the row's address on the display
	ADD	A,L
	LD	L,A
	JR	NC,LCDR1
	INC	H		; the table's page changed
LCDR1:	LD	A,(HL)
	POP	HL
	CALL	LCDC
LCDS:	LD	A,(HL)
	CP	1		; carry at the zero that ends the string
	RET	C
	PUSH	AF
	CALL	LCDWAIT
	POP	AF
	OUT	(LCDDAT),A
	INC	HL
	JR	LCDS
; Show the drive letters and labels of drives A and B on rows 1 and 2.
LCDVOLS:LD      C,0
LCDV:   PUSH    BC
        CALL    DRVDESC
        POP     BC
        JR      NZ,LCDVN
	LD	HL,LINEBUF	; the row's text, in the terminal's
	CALL	DRVLAB		; buffer, which the LCD may use
        PUSH    BC
        LD      A,C
        INC     A
        LD      B,A
        LD      HL,LINEBUF
        CALL    LCDROW
        POP     BC
LCDVN:  INC     C
        LD      A,C
        CP      2               ; only A and B fit
        JR      C,LCDV
        RET

; HL -> 15 bytes = drive C's letter, ": " and the 11-byte label of its
; descriptor at IX, then a 0: the drive walkers' shared text, LCDVOLS's rows
; in LINEBUF and SHOWVOL's lines in CMDTXT. Keeps BC and IX. Destroys AF, DE
; and HL.
DRVLAB:	LD	A,C
	PUSH	BC
	ADD	A,'A'		; the drive's letter, then ": "
	LD	(HL),A
	INC	HL
	LD	(HL),':'
	INC	HL
	LD	(HL),' '
	INC	HL
	PUSH	IX
	POP	DE
	EX	DE,HL		; DE = LINEBUF+3, HL = the descriptor
	LD	BC,DLABEL
	ADD	HL,BC
	LD	BC,11		; the label
	LDIR
	XOR	A		; and its end
	LD	(DE),A
	POP	BC
	RET
