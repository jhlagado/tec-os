

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
