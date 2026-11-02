; The video drivers' hook. PICO.SVC and GLCD.SVC hand the ROM a table through
; GLHOOK (ABIGLCD), and CONSW points the terminal's vector at it for CRT: and
; UC1:. Each REMOVE calls GLHOOK with 0.

; A = CMCRT or CMUC1, HL = the driver's table: the terminal's six words (VPUT,
; VGET, VCLREOL, VREST, VRDROW, VWRROW), the word for VTFN's functions, then
; columns and rows. Kept for CONSW, and HL = LINEBUF on return with carry clear,
; where VRDROW and VWRROW move a row; carry set and nothing changed if a table is
; kept already, or there is no matrix keyboard. HL = 0: the table dropped, and
; the console chosen again at its next call, carry clear.
GLHOOK: ADD     A,LOW(PIVEC)-1
        LD      E,A
        LD      D,HIGH(PIVEC)
        LD      A,H
        OR      L
        JR      Z,GLHOFF
        LD      A,(CONDEV)      ; CDMTX, bit 0
        RRCA
        CCF
        RET     C
        INC     DE
        LD      A,(DE)          ; a table in RAM is at 0100h or above
        DEC     DE
        OR      A
        SCF
        RET     NZ
        EX      DE,HL
        LD      (HL),E
        INC     HL
        LD      (HL),D
        LD      HL,LINEBUF
        OR      A
        RET
GLHOFF: EX      DE,HL
        LD      (HL),D
        INC     HL
        LD      (HL),D
        LD      A,L
        CP      LOW(GLVEC+1)
        JR      NZ,GLHF1
        LD      HL,CONDEV       ; CDGLC: no GLCD console now
        RES     2,(HL)
GLHF1:  XOR     A
        LD      (CONMOD),A
        DEC     A
        LD      (CONACT),A
        OR      A               ; carry clear
        RET

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
	LD	HL,GLCMSG	; the LCD says so, carry set
	JP	LCDWRD

; Read CMDFCB's driver and install it. If its page holds a video table it takes
; the console: PICO.SVC always, GLCD.SVC unless PICO.SVC is in, and the ROM's
; word goes from the LCD. Carry set if it wouldn't read or install.
SVCGO:	CALL	LOADCOM
	RET	C
	CALL	SVCLOAD
	RET	C
	LD	A,(SVCHEAD)
	LD	B,CMCRT		; PICO.SVC's table in this driver's page?
	LD	HL,PIVEC+1
	CP	(HL)
	JR	Z,CONSET
	LD	HL,GLVEC+1
	XOR	(HL)		; carry clear: any other driver has loaded
	RET	NZ
	LD	HL,CONDEV
	SET	2,(HL)		; CDGLC
	LD	A,(PIVEC+1)
	OR	A
	JR	NZ,WRDCLR	; PICO.SVC keeps the console, and GLCD? is false
	LD	B,CMUC1
CONSET:	CALL	WRDCLR		; a display has come: the word is false
	LD	A,(IOBYTE)	; the mode goes in the CON: field
	AND	$FC
	OR	B
	LD	(IOBYTE),A
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

