; The video drivers' hook. PICO.DRV and GLCD.DRV hand the ROM a table through
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

; Load A:GLCD.DRV if there is a GLCD and its resident is not in, and make it
; the console: carry set if there is none or it will not load (the LCD says
; so).
GLCLD:	LD	A,(CONDEV)
	AND	CDGLC
	RET	NZ		; in already
	LD	HL,GLCFCB	; the file's name, for the loader
	LD	DE,CMDFCB
	LD	BC,12
	LDIR
	CALL	DRVGO
	RET	NC
	LD	HL,GLCMSG	; the LCD says so, carry set
	JP	LCD3

; Read CMDFCB's driver and install it. If its page holds a video table it takes
; the console: PICO.DRV always, GLCD.DRV unless PICO.DRV is in, and PICO? goes
; from the LCD. Carry set if it wouldn't read or install.
DRVGO:	CALL	LOADCOM
	RET	C
	CALL	DRVLOAD
	RET	C
	LD	A,(DRVHEAD)
	LD	B,CMCRT		; PICO.DRV's table in this driver's page?
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
	RET	NZ		; PICO.DRV keeps the console
	LD	B,CMUC1
CONSET:	LD	HL,CONDEV	; a display has come: PICO? goes, if it is up,
	BIT	7,(HL)		; and otherwise a program's row 3 stays (CDWRD)
	JR	Z,CONST1
	RES	7,(HL)
	PUSH	BC		; the console's mode, across the LCD
	LD	HL,PICCLR	; blanks over the word
	CALL	LCD3
	POP	BC
CONST1:	LD	A,(IOBYTE)	; the mode goes in the CON: field
	AND	$FC
	OR	B
	LD	(IOBYTE),A
	LD	A,$FF		; CONACT no field: CONSEL acts
	LD	(CONACT),A
	JP	CONSEL

