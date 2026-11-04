; Video displays. VIDINIT records in CONDEV whether the PICO9918 answers; the
; console mode then points the terminal's driver vectors at a driver's table:
; VPUT (A at row B, column C), VGET, VCLREOL, VREST, which puts back the
; display mode and character set after a program may have changed them,
; leaving the picture alone, and VRDROW and VWRROW, which copy row B to and
; from LINEBUF. Scrolling is a line delete in the terminal.

; From CONINIT at cold boot, with CONDEV holding CDMTX or nothing: when the
; PICO9918 answers, CDTMS set in CONDEV and PISTART run, which makes it the
; console if the matrix keyboard is there too. Destroys AF, BC, DE and HL.
VIDINIT:
	CALL	TMSINIT		; Z: VRAM keeps what is written
	RET	NZ		; no PICO9918
	LD	HL,CONDEV
	SET	1,(HL)		; CDTMS
	JP	PISTART		; the console, with the matrix keyboard

; The terminal's calls into the driver in effect, each through the vector
; CONSWV copied from the driver's table. Registers are as the driver takes and
; leaves them.

; VPUT: A at row B, column C.
VPUT:	LD	HL,(VPUTV)	; the driver's entry
	JP	(HL)
; VGET: A = the character at row B, column C.
VGET:	LD	HL,(VGETV)	; the driver's entry
	JP	(HL)
; VCLREOL: row B cleared from column C to its end.
VCLREOL:
	LD	HL,(VCLRV)	; the driver's entry
	JP	(HL)
; VREST: the display's mode and character set back, the picture left alone.
VREST:	LD	HL,(VRSTV)	; the driver's entry
; Jump to HL, so that a CALL VHLJP calls the routine at HL.
VHLJP:	JP	(HL)
; VRDROW: row B into LINEBUF.
VRDROW:	LD	HL,(VRDRV)	; the driver's entry
	JP	(HL)
; VWRROW: LINEBUF to row B.
VWRROW:	LD	HL,(VWRRV)	; the driver's entry
	JP	(HL)

; The word for what only the PICO9918 does, when it is the console and no
; program has claimed it: A = 0 show a finished row move; 1 begin a move of rows
; C to VSBOT; 2 end one. Destroys AF, HL and what the driver's word does
; (the ROM's: D, for a move begun); VTMBEG also sets B and C for it.
VTMBEG:	LD	B,C		; the driver's B to C: rows C to VSBOT
	LD	A,(VSBOT)
	LD	C,A
	LD	A,1		; a move begins
	JR	VTFN
; End a row move: VTFN's 2.
VTMEND:	LD	A,2		; the move ends
	JR	VTFN
; Show the page drawn: VTFN's 0.
VTFLIP:	XOR	A		; the page drawn shown
VTFN:	LD	L,A		; the function, across the tests
	LD	A,(CONMOD)
	CP	CMCRT
	RET	NZ		; the PICO9918 is not the console
	CALL	VTOWN
	RET	NZ		; a program owns it: hands off
	LD	A,L
	LD	HL,(VFNV)	; the driver's word, A = the function
	JP	(HL)

; ---- The video drivers' hook -----------------------------------------------
; GLCD.SVC hands the ROM a table through TNDRVR (abi.inc), and CONSW points
; the terminal's vector at it for UC1:; its REMOVE calls it with HL = 0. CRT:'s
; table, PIVEC, is the ROM's own, set by PISTART.

; A = CMCRT or CMUC1, HL = the driver's table: the terminal's six words (VPUT,
; VGET, VCLREOL, VREST, VRDROW, VWRROW), the word for VTFN's functions, then
; columns and rows. Kept for CONSW, and HL = LINEBUF on return with carry clear,
; where VRDROW and VWRROW move a row; carry set and nothing changed if a table
; is kept already, or there is no matrix keyboard. HL = 0: the table dropped,
; and the console chosen again at its next call, carry clear. Destroys AF, DE.
VIDHOOK:
	ADD	A,LOW(PIVEC)-1	; DE = PIVEC or GLVEC, the mode's word
	LD	E,A
	LD	D,HIGH(PIVEC)
	LD	A,H
	OR	L
	JR	Z,VIDHOFF	; HL = 0: the table dropped
	LD	A,(CONDEV)	; CDMTX, bit 0
	RRCA			; into carry,
	CCF			; then carry if there is no keyboard
	RET	C
	INC	DE
	LD	A,(DE)		; a table in RAM is at 0100h or above
	DEC	DE
	OR	A		; so a high byte of 0 is no table
	SCF
	RET	NZ		; one is kept already
	EX	DE,HL		; HL = the word, DE = the table
	LD	(HL),E
	INC	HL
	LD	(HL),D
	LD	HL,LINEBUF	; where VRDROW and VWRROW move a row
	OR	A		; carry clear
	RET
VIDHOFF:
	EX	DE,HL		; HL = the word, D = 0
	LD	(HL),D		; the word cleared
	INC	HL
	LD	(HL),D
	LD	A,L
	CP	LOW(GLVEC+1)	; GLVEC's: GLCD.SVC has gone
	JR	NZ,VIDHF1
	LD	HL,CONDEV	; CDGLC: no GLCD console now
	RES	2,(HL)
VIDHF1:	XOR	A		; serial in effect, so a field naming the
	LD	(CONMOD),A	; display acts at the next console call
	RET			; carry clear
