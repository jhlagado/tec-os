; The CCP's other commands and its parsing: UNLOAD, CON, USER and SAVE, a
; transient's tail and page, a file name into an FCB, the keyword table's
; lookup, the console's output, services by name and the startup file.
; Included after ccpfile.asm by rom.asm.

; UNLOAD: the lowest resident goes, or the command comes back with a question
; mark.
CMDUNL:	CALL	SVCUNL
	JP	NC,STARTED	; carry: SVCUNL refused
	JP	BADCMD

; CON's name loop: not this name, so the next, or a bad command after six.
CONNO:
	POP	HL
CONSKIP:
	INC	DE		; to the next name
	DEC	C
	JR	NZ,CONSKIP
	INC	B
	LD	A,B
	CP	6
	JR	NZ,CONNXT
	JP	BADCMD

; TEC-OS: CON shows the console in use; CON TTY, CRT, BAT or UC1 (a colon
; may follow), or PICO for CRT: and GLCD for UC1:, sets the IOBYTE CON: field.
; After CRT or PICO a width, 80, 40 or 32, goes to PICO.SVC through its table's
; PICOWID entry, version 3 (KD-174); none in that takes it, or any other
; width, and the command is refused. The BIOS switches at the next console
; call, so the report appears on the new console, and names the serial
; terminal when the chosen display or keyboard is missing.
CMDCON:
	CALL	ARGSKIP		; an error names the argument
	JP	Z,CONSHOW
	LD	DE,CONNAMS
	LD	B,0
CONNXT:
	PUSH	HL
	LD	C,4
CONCMP:
	LD	A,(DE)
	CP	':'
	JR	Z,CONMAT	; a three-letter name's end
	CP	(HL)
	JR	NZ,CONNO
	INC	HL
	INC	DE
	DEC	C
	JR	NZ,CONCMP
CONMAT:	POP	AF		; matched: drop the saved text pointer
	LD	A,B		; GLCD (4) is UC1:, PICO (5) CRT:, 11 - 2B
	CP	4
	JR	C,CONHIT
	ADD	A,A
	CPL
	ADD	A,12
	LD	B,A
CONHIT:	LD	A,(HL)
	CP	':'
	JR	NZ,CONEND
	INC	HL
CONEND:	LD	A,(HL)		; a width only after a space: CRT80 is
	CP	SPACE		; a bad name, and its end ENDCHK's
	JR	NZ,CONNW
	CALL	CMDSKIP		; the width, named by an error
	JR	Z,CONNW		; spaces alone: no width
	LD	A,B
	CP	CMCRT
	JP	NZ,BADCMD	; a width after CRT: alone
	LD	DE,CONWID	; 80, 40 or 32: two digits, then the
	LD	B,3		; columns
CONW1:	LD	A,(DE)
	INC	DE
	CP	(HL)
	LD	A,(DE)
	INC	DE
	INC	HL
	JR	NZ,CONW2
	CP	(HL)
	JR	Z,CONW3
CONW2:	DEC	HL
	INC	DE
	DJNZ	CONW1
	JP	BADCMD
CONW3:	INC	HL
	CALL	ENDCHK
	LD	A,(DE)		; the columns
	PUSH	AF
	LD	DE,CONNAMS+20	; "PICO    " at version 3
	LD	BC,PICOVER*256+TNFIND
	CALL	ABICALL
	POP	BC		; B = the columns
	JP	C,BADCMD	; none in that takes a width
	LD	DE,PICOWID
	ADD	HL,DE
	LD	A,(HL)
	INC	HL
	LD	H,(HL)
	LD	L,A
	LD	A,B
	CALL	VHLJP		; A = the columns: carry if refused
	JP	C,BADCMD
	LD	B,CMCRT
	JR	CONFL
CONNW:	CALL	ENDCHK
CONFL:	CALL	CONFLD
	LD	A,B		; UC1: the GLCD's driver, if it is not in
	CP	CMUC1
	CALL	Z,GLCLD
CONSHOW:
	LD	DE,CONHDR
	CALL	PUTSTR		; the BIOS acts on the field: CONMOD next
	LD	A,(CONMOD)
	ADD	A,A
	ADD	A,A
	LD	L,A
	LD	H,0
	LD	DE,CONNAMS	; its name and colon, four bytes
	ADD	HL,DE
	LD	B,4
CONSH1:	LD	E,(HL)
	CALL	PUTCHAR		; keeps BC and HL
	INC	HL
	DJNZ	CONSH1
	LD	DE,CRLFMSG
	CALL	PUTSTR
	JP	MAINLOOP

; USER accepts one decimal user number in the CP/M 2.2 range 0..15.
CMDUSER:
	CALL	ARGSKIP
	CP	'0'
	JP	C,BADCMD
	CP	'9'+1
	JP	NC,BADCMD
	SUB	'0'
	LD	B,A
	INC	HL
	LD	A,(HL)
	CP	'0'
	JR	C,USERDONE
	CP	'9'+1
	JR	NC,USERDONE
	LD	A,B
	CP	1
	JP	NZ,BADCMD
	LD	A,(HL)
	CP	'6'
	JP	NC,BADCMD
	SUB	'0'-10
	LD	B,A
	INC	HL

USERDONE:
	CALL	ENDCHK
	LD	E,B
	LD	C,32
	CALL	BDOS
	JP	MAINLOOP

; SAVE writes 256-byte pages from the TPA. A count reaching the page of the
; BDOS entry jump is rejected rather than saving it or the workspace.
CMDSAVE:
	CALL	ARGSKIP
	CP	'0'
	JP	C,BADCMD
	CP	'9'+1
	JP	NC,BADCMD
	LD	B,0

SAVENUM:
	LD	A,(HL)
	CP	'0'
	JR	C,SAVENEND
	CP	'9'+1
	JR	NC,SAVENEND
	SUB	'0'
	LD	E,A
	LD	A,B
	ADD	A,A
	JP	C,BADCMD
	LD	D,A
	ADD	A,A
	ADD	A,A
	ADD	A,D
	JP	C,BADCMD
	ADD	A,E
	JP	C,BADCMD
	LD	B,A
	INC	HL
	JR	SAVENUM

SAVENEND:
	CP	SPACE
	JP	NZ,BADCMD
	LD	A,(PZBDOS+2)
	LD	C,A
	LD	A,B
	CP	C
	JP	NC,BADCMD
	LD	(SAVEPGS),A
	CALL	SKIPSP
	LD	A,(HL)
	OR	A
	JP	Z,BADCMD
	CALL	ONENAME

	CALL	DOSSEQ
	DB	19*2+0		; BDOS 19, source FCB
	CALL	DOSSEQ
	DB	22*2+0		; BDOS 22, source FCB
	INC	A
	JR	Z,SAVENOSP
	LD	HL,TPA
	LD	(SAVEADR),HL

SAVELOOP:
	LD	A,(SAVEPGS)
	OR	A
	JR	Z,SAVECLS
	CALL	SAVE128
	JR	C,SAVENOSP
	CALL	SAVE128
	JR	C,SAVENOSP
	LD	A,(SAVEPGS)
	DEC	A
	LD	(SAVEPGS),A
	JR	SAVELOOP

SAVE128:
	LD	DE,(SAVEADR)
	LD	C,26
	CALL	BDOS
	CALL	DOSSEQ
	DB	21*2+0		; BDOS 21, source FCB
	OR	A
	SCF
	RET	NZ
	LD	HL,(SAVEADR)
	LD	DE,128
	ADD	HL,DE
	LD	(SAVEADR),HL
	OR	A
	RET

SAVECLS:
	CALL	DOSSEQ
	DB	16*2+0		; BDOS 16, source FCB
	INC	A
	JR	Z,SAVENOSP
	JP	MAINLOOP

SAVENOSP:
	LD	DE,NOSPACE
	JP	ERRGO

; Publish only documented page-zero transient state after loading succeeds.
PREPPAGE:
	LD	HL,(ARGSTRT)
	PUSH	HL
	CALL	SKIPSP
	LD	DE,FCBONE
	CALL	PARSEFCB
	CALL	SKIPSP
	LD	DE,FCBTWO
	CALL	PARSEFCB
	POP	HL

	LD	DE,CMDTAIL+1
	LD	B,0

TAILLOOP:
	LD	A,(HL)
	OR	A
	JR	Z,TAILDONE
	LD	(DE),A
	INC	HL
	INC	DE
	INC	B
	JR	TAILLOOP

TAILDONE:
	LD	A,B
	LD	(CMDTAIL),A
	XOR	A
	LD	(DE),A
	LD	DE,CMDTAIL
	LD	C,26
	JP	BDOS

; Parse one CP/M file reference into a cleared 36-byte FCB. HL points
; at the first token byte and returns at its delimiter. A '*' expands to '?'
; through the remainder of its current field.
PARSEFCB:
	LD	(FCBBASE),DE
	PUSH	DE
	XOR	A
	LD	(DE),A
	INC	DE
	LD	B,11
	LD	A,SPACE

FCBSPACE:
	LD	(DE),A
	INC	DE
	DJNZ	FCBSPACE
	XOR	A
				; A parsed FCB is reusable command state, so reset the complete tail:
				; EX/S1/S2/RC, the allocation map, CR, and the random-record fields.
				; Leaving CR behind makes the command after TYPE begin loading at
				; record one rather than at the start of its COM file.
	LD	B,24

FCBZERO:
	LD	(DE),A
	INC	DE
	DJNZ	FCBZERO
	POP	DE

	LD	A,(HL)
	OR	A
	RET	Z
	INC	HL
	LD	A,(HL)
	DEC	HL
	CP	':'
	JR	NZ,FCBNAME
	LD	A,(HL)
	CP	'A'
	JR	C,FCBDRBAD
	CP	'Q'
	JR	NC,FCBDRBAD
	SUB	'A'-1
	LD	(DE),A
	INC	HL
	INC	HL

FCBNAME:
	INC	DE
	LD	B,8
	CALL	PARFLD
	RET	C
	LD	A,(HL)
	CP	'.'
	JR	Z,FCBDOT
	OR	A
	RET

FCBDOT:
	INC	HL
	LD	A,E		; B is the unfilled part of the name field
	ADD	A,B
	LD	E,A
	JR	NC,FCBTYP
	INC	D
FCBTYP:	LD	B,3
	JR	PARFLD

FCBDRBAD:
	SCF
	RET

PARFLD:
	CALL	FCBEND
	RET	Z
	CP	'*'
	JR	Z,PARSTAR
	CALL	VALIDCHR
	RET	C
	LD	(DE),A
	INC	DE
	INC	HL
	DJNZ	PARFLD

PARSKIP:
	CALL	FCBEND
	RET	Z

PARLONG:
	INC	HL
	CALL	FCBEND
	JR	NZ,PARLONG

PLEND:
	SCF
	RET

; Commands that name exactly one file reject an empty name or either wildcard.
; Preserve the parser's delimiter pointer in HL; FCBBASE identifies the FCB
; because PARSEFCB advances DE while filling it.
UNAMBIG:
	PUSH	HL
	PUSH	BC
	LD	HL,(FCBBASE)
	INC	HL
	LD	A,(HL)
	CP	SPACE
	JR	Z,CHRRET
	LD	BC,11
	LD	A,'?'
	CPIR			; equality means an ambiguous name
	JR	CHRRET

; CP/M 2.2 reserves these characters inside filename and filetype fields.
; Dot and equals are handled as grammar delimiters, while question mark and
; asterisk remain available to the ambiguous DIR and ERA forms.
VALIDCHR:
	PUSH	HL
	PUSH	BC
	LD	HL,BADCHARS
	LD	BC,13
	CPIR			; equality means a forbidden byte
; Both scans preserve HL/BC and return carry for a match (invalid/ambiguous).
CHRRET:	POP	BC
	POP	HL
	SCF
	RET	Z
	OR	A
	RET

PARSTAR:
	LD	A,'?'

STARLOOP:
	LD	(DE),A
	INC	DE
	DJNZ	STARLOOP
	INC	HL

PARIGN:
	CALL	FCBEND
	RET	Z
	INC	HL
	JR	PARIGN

; Z at the end of a name: a zero, a space, '=' or '.'. A holds the character.
FCBEND:	LD	A,(HL)
	OR	A
	RET	Z
	CP	SPACE
	RET	Z
	CP	'='
	RET	Z
	CP	'.'
	RET

SKIPSP:
	LD	A,(HL)
	CP	SPACE
	RET	NZ
	INC	HL
	JR	SKIPSP

; Compare the parsed command word with a zero-terminated keyword. Equality
; requires a command delimiter or end immediately after the keyword.
ISCMD:
	LD	HL,(CMDSTRT)

KEYLOOP:
	LD	A,(DE)
	OR	A
	JR	Z,KEYEND
	CP	(HL)
	RET	NZ
	INC	DE
	INC	HL
	JR	KEYLOOP

KEYEND:
	LD	A,(HL)
	OR	A
	RET	Z
	CP	SPACE
	RET

PUTSTR:
	LD	C,9
	JP	BDOS

; Print E by BDOS function 2, through OUTCHAR's column count and ^P echo.
; Keeps BC and HL, which every caller wants kept. Destroys AF and DE.
PUTCHAR:
	PUSH	BC
	PUSH	HL
	LD	C,2
	CALL	BDOS
	POP	HL
	POP	BC
	RET

; SERVICES: each service's name and pages, from the owner list.
CMDSVC:	LD	A,(SVCHEAD)
CMDDL:	OR	A
	JP	Z,MAINLOOP
	LD	H,A
	LD	L,DNAM
	LD	B,8
	CALL	PUTTRIM
	LD	E,' '
	CALL	PUTCHAR
	PUSH	HL
	LD	L,DOWN
	LD	A,(HL)
	CALL	SVCABV
	SUB	H
	LD	L,A
	LD	H,0
	CALL	PUTDEC
	LD	DE,CRLFMSG
	CALL	PUTSTR
	POP	HL
	LD	L,DOWN
	LD	A,(HL)
	JR	CMDDL

; Startup. Once after cold boot one record of A:STARTUP.CMD is read, the
; position marked finished first, so that a failure can't repeat. STPOS is 0
; until then, the next byte + 1 in the file, 80h up once it is finished, and FFh
; when STDONE has looked at the console.
STBOOT:	LD	HL,STPOS
	LD	A,(HL)
	OR	A
	RET	NZ		; cold boot has passed here already
	SET	7,(HL)		; finished, whatever follows
	IN	A,(STSPORT)	; a keypad key held skips it: bit 6 low
	AND	$40
	RET	Z
	LD	HL,STFCB	; the file's name, for the BDOS
	LD	DE,CMDFCB
	LD	BC,12
	LDIR
	LD	DE,STREC	; the record goes where STLINE reads it
	LD	C,26
	CALL	BDOS
	CALL	DOSSEQ
	DB	15*2+0		; BDOS 15, source FCB
	INC	A
	JR	Z,STBDMA
	CALL	DOSSEQ
	DB	20*2+0		; BDOS 20, source FCB
	OR	A
	JR	NZ,STBDMA
	INC	A		; STPOS 1, the file's first byte
	LD	(STPOS),A
STBDMA:	LD	HL,DEFDMA	; the DMA address programs expect
	LD	(CURDMA),HL
	RET

; With a line left: it goes in the command buffer, echoed as if
; typed, and carry clear. Lines end at CR or LF and blank ones are passed
; over; a line's characters after its 127th are passed over too, as a typed
; line has no more. ^Z, a zero or the record's last byte ends the
; file. Otherwise carry set, through STDONE once the file has finished.
; Destroys AF, B, DE, HL.
STLINE:	LD	HL,STPOS
	LD	A,(HL)
	RLCA			; top bit to carry: the file is finished
	JR	C,STDONE
	RRCA			; the position again
	ADD	A,LOW(STREC)-1
	LD	L,A
	LD	H,HIGH(STREC)
	LD	DE,CMDTXT
	LD	B,127		; the characters a line may hold
STL1:	LD	A,L
	CP	LOW(STREC+128)
	JR	Z,STLE		; the record has run out
	LD	A,(HL)
	INC	HL
	OR	A
	JR	Z,STLE		; a zero ends the file
	CP	26
	JR	Z,STLE		; and so does ^Z
	CP	13
	JR	Z,STL2
	CP	10
	JR	Z,STL2
	INC	B
	DEC	B
	JR	Z,STL1		; past the 127th: passed over
	LD	(DE),A		; a character of the line
	INC	DE
	DEC	B
	JR	STL1
STLE:	LD	L,LOW(STLAST)	; STPOS 80h, finished
STL2:	LD	A,L
	SUB	LOW(STREC)-1	; the next byte + 1
	LD	(STPOS),A
	LD	A,E
	SUB	LOW(CMDTXT)
	JR	Z,STLINE	; a blank line: the next one
	LD	(CMDLEN),A
	EX	DE,HL
	LD	(HL),13		; ends the line for the CCP, and
	INC	HL
	LD	(HL),'$'	; for the echo
	LD	DE,CMDTXT
	CALL	PUTSTR
	OR	A
	RET

; Once, at the first prompt after startup: with a PICO9918 and a
; matrix keyboard fitted and no display driver in, the LCD says PICO?. That
; board's screen is black and it may have no serial terminal. It covers a
; missing file, a bad file, no STARTUP.CMD and a skip. HL = STPOS, A = STPOS
; rotated left, carry set. Returns carry set for STLINE. Destroys AF, B, HL.
STDONE:	INC	A		; FFh has been seen, and carry stays
	RET	Z
	LD	(HL),$FF	; once only
	LD	A,(CONDEV)	; zero: both, no GLCD, whatever row 3 has
	AND	$FF-CDWRD-CDRTC	; GLCD? may be up from a failed CON UC1
	SUB	CDMTX+CDTMS	; CDGLC set means GLCD.SVC is in
	LD	HL,PIVEC+1	; and a word here means PICO.SVC is
	OR	(HL)
	SCF
	RET	NZ
	LD	HL,PICMSG	; carry set by LCDROW
	JP	LCDWRD
