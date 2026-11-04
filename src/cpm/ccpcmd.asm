; The CCP's other commands and its parsing: UNLOAD, CON, USER and SAVE, a
; transient's tail and page, a file name into an FCB, the keyword table's
; lookup, the console's output, services by name and the startup file.
; Included after ccpfile.asm by rom.asm.

; UNLOAD: the lowest resident goes, or the command comes back with a question
; mark. Takes nothing from the line; ends at STARTED or BADCMD.
CMDUNL:	CALL	SVCUNL		; its REMOVE run, and its pages freed
	JP	NC,STARTED	; carry: SVCUNL refused
	JP	BADCMD

; CON's name loop: not this name, so the next, or a bad command after six.
; Takes DE in CONNAMS at the byte that differed, C the name's bytes left
; there, B the name's number and the argument's address on the stack; goes
; back to CONNXT with HL at the argument again.
CONNO:
	POP	HL		; the argument's first letter again
CONSKIP:
	INC	DE		; to the next name
	DEC	C
	JR	NZ,CONSKIP
	INC	B		; the next name's number: six names,
	LD	A,B		; TTY, CRT, BAT, UC1, GLCD and PICO
	CP	6
	JR	NZ,CONNXT
	JP	BADCMD		; none of them matched

; TEC-OS: CON shows the console in use; CON TTY, CRT, BAT or UC1 (a colon
; may follow), or PICO for CRT: and GLCD for UC1:, sets the IOBYTE CON: field.
; After CRT or PICO a width, 80, 40 or 32, goes to the ROM's PICO9918 console
; through its table's PICOWID entry (KD-174); with that console not started,
; or any other width, the command is refused, but a line from STARTUP.CMD
; on a board with no such console is quiet, as for an absent device. The
; BIOS switches at the next console call, so the report appears on the new
; console, and names the serial terminal when the chosen display or keyboard
; is missing. UC1: loads GLCD.SVC first if it is not in. Takes the argument
; at ARGSTRT; ends at MAINLOOP, STARTED or BADCMD.
CMDCON:
	CALL	ARGSKIP		; an error names the argument
	JP	Z,CONSHOW	; no argument: show the console
	LD	DE,CONNAMS	; the names, four bytes each,
	LD	B,0		; counted in B from TTY's 0
CONNXT:
	PUSH	HL		; the argument, for the next name
	LD	C,4		; a name's bytes
CONCMP:
	LD	A,(DE)		; a letter of the name, or its colon
	CP	':'
	JR	Z,CONMAT	; a three-letter name's end
	CP	(HL)		; the argument's letter differs:
	JR	NZ,CONNO	; the next name
	INC	HL
	INC	DE
	DEC	C
	JR	NZ,CONCMP	; all four letters alike: a match
CONMAT:	POP	AF		; matched: drop the saved text pointer
	LD	A,B		; GLCD (4) is UC1:, PICO (5) CRT:, 11 - 2B
	CP	4
	JR	C,CONHIT	; TTY to UC1: the number is the mode
	ADD	A,A
	CPL			; -2B - 1, and 12 more makes 11 - 2B:
	ADD	A,12		; 3 for GLCD, 1 for PICO
	LD	B,A		; B = the console mode, CMTTY to CMUC1
CONHIT:	LD	A,(HL)
	CP	':'
	JR	NZ,CONEND
	INC	HL		; past a colon after the name
CONEND:	LD	A,(HL)		; a width only after a space: CRT80 is
	CP	SPACE		; a bad name, and its end ENDCHK's
	JR	NZ,CONNW
	CALL	CMDSKIP		; the width, named by an error
	JR	Z,CONNW		; spaces alone: no width
	LD	A,B
	CP	CMCRT
	JP	NZ,BADCMD	; a width after CRT: alone
	LD	A,(HL)		; two decimal digits: the columns, which
	SUB	'0'		; TMSWID judges (80, 40 or 32)
	CP	10
	JP	NC,BADCMD	; the first is no digit
	LD	C,A
	ADD	A,A		; the tens digit times 10:
	ADD	A,A		; four times, plus itself, doubled
	ADD	A,C
	ADD	A,A		; the tens
	LD	C,A
	INC	HL		; the units digit
	LD	A,(HL)
	SUB	'0'
	CP	10
	JP	NC,BADCMD	; the second is no digit
	ADD	A,C		; A = the columns
	INC	HL		; past the width
	PUSH	AF		; kept across ENDCHK and the ABI's call
	CALL	ENDCHK		; nothing after the width
	LD	DE,CONNAMS+20	; "PICO    " at version 3
	LD	BC,PICOVER*256+TNFIND
	CALL	ABICALL		; FIND: HL = the console's table, PIBLK
	POP	BC		; B = the columns
	JR	NC,CONWD	; found: the width goes to it
	LD	A,(STFLAG)	; none, as on a serial board: typed,
	OR	A		; refused; from STARTUP.CMD, quiet,
	JP	Z,BADCMD	; the code left 0, as for an absent
	JP	STARTED		; device's service (KD-173)
CONWD:	LD	DE,PICOWID	; the table's width entry, its
	ADD	HL,DE
	LD	A,(HL)		; address into HL
	INC	HL
	LD	H,(HL)
	LD	L,A
	LD	A,B
	CALL	VHLJP		; A = the columns: carry if refused
	JP	C,BADCMD
	LD	B,CMCRT		; the width set: CRT: the console
	JR	CONFL
CONNW:	CALL	ENDCHK		; nothing after the name
CONFL:	CALL	CONFLD		; B into the IOBYTE's CON: field
	LD	A,B		; UC1: the GLCD's driver, if it is not in
	CP	CMUC1		; (a failure puts the field back)
	CALL	Z,GLCLD
CONSHOW:
	LD	DE,CONHDR	; "CON: "
	CALL	PUTSTR		; the BIOS acts on the field: CONMOD next
	LD	A,(CONMOD)
	ADD	A,A		; the mode times four: its name's
	ADD	A,A		; offset in CONNAMS
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
	JP	MAINLOOP	; the next prompt

; USER accepts one decimal user number in the CP/M 2.2 range 0..15 and sets
; it by BDOS function 32; anything else is a bad command. Takes the argument
; at ARGSTRT; ends at MAINLOOP or BADCMD.
CMDUSER:
	CALL	ARGSKIP		; A = its first character
	CP	'0'
	JP	C,BADCMD
	CP	'9'+1
	JP	NC,BADCMD	; not a digit, or no argument
	SUB	'0'
	LD	B,A		; B = the first digit's value
	INC	HL
	LD	A,(HL)
	CP	'0'		; a second digit?
	JR	C,USERDONE
	CP	'9'+1
	JR	NC,USERDONE	; no: one digit, 0 to 9
	LD	A,B
	CP	1
	JP	NZ,BADCMD	; two digits must be 10 to 15
	LD	A,(HL)
	CP	'6'		; the second at most 5
	JP	NC,BADCMD
	SUB	'0'-10		; B = 10 + the second digit
	LD	B,A
	INC	HL		; past it
USERDONE:
	CALL	ENDCHK		; nothing after the number; B kept
	LD	E,B
	LD	C,32		; BDOS 32: set the user to E
	CALL	BDOS
	JP	MAINLOOP

; SAVE writes 256-byte pages from the TPA. A count reaching the page of the
; BDOS entry jump is rejected rather than saving it or the workspace. SAVE n
; NAME writes n pages from 0100h up as NAME. Takes the arguments at ARGSTRT;
; ends at MAINLOOP, BADCMD or NO SPACE.
CMDSAVE:
	CALL	ARGSKIP		; A = the count's first character
	CP	'0'
	JP	C,BADCMD
	CP	'9'+1
	JP	NC,BADCMD	; not a digit, or no argument
	LD	B,0		; B = the count so far
SAVENUM:
	LD	A,(HL)
	CP	'0'
	JR	C,SAVENEND
	CP	'9'+1
	JR	NC,SAVENEND	; not a digit: the count's end
	SUB	'0'
	LD	E,A		; E = the digit's value
	LD	A,B		; B times ten, a bad command past
	ADD	A,A		; 255: twice B, kept in D,
	JP	C,BADCMD
	LD	D,A
	ADD	A,A		; then four times B, a carry bad,
	JP	C,BADCMD
	ADD	A,A		; and eight times B, a carry bad
	JP	C,BADCMD
	ADD	A,D		; and twice B added, a carry bad
	JP	C,BADCMD
	ADD	A,E		; and the digit
	JP	C,BADCMD
	LD	B,A
	INC	HL
	JR	SAVENUM		; the next digit
SAVENEND:
	CP	SPACE		; a space must follow the count
	JP	NZ,BADCMD
	LD	A,(PZBDOS+2)	; the BDOS entry's page
	LD	C,A
	LD	A,B
	CP	C
	JP	NC,BADCMD	; the pages would reach it
	LD	(SAVEPGS),A	; the pages to write
	CALL	SKIPSP
	LD	A,(HL)
	OR	A
	JP	Z,BADCMD	; no name
	CALL	ONENAME		; one unambiguous name into CMDFCB

	CALL	DOSSEQ		; delete any file of that name
	DB	19*2+0		; BDOS 19, source FCB
	CALL	DOSSEQ		; and make it anew
	DB	22*2+0		; BDOS 22, source FCB
	INC	A
	JR	Z,SAVENOSP	; FFh: the directory is full
	LD	HL,TPA
	LD	(SAVEADR),HL	; the first record's bytes, 0100h
SAVELOOP:
	LD	A,(SAVEPGS)
	OR	A
	JR	Z,SAVECLS	; every page written: close it
	CALL	SAVE128		; a page is two records
	JR	C,SAVENOSP
	CALL	SAVE128
	JR	C,SAVENOSP	; either unwritten: the disk is full
	LD	A,(SAVEPGS)
	DEC	A
	LD	(SAVEPGS),A	; one page fewer to write
	JR	SAVELOOP

; Write the 128 bytes at SAVEADR as CMDFCB's next record, and move SAVEADR
; past them. Returns carry if the write failed, the disk or directory full.
; Destroys AF, BC, DE, HL.
SAVE128:
	LD	DE,(SAVEADR)
	LD	C,26		; BDOS 26: the DMA address, the record
	CALL	BDOS
	CALL	DOSSEQ		; write it as the file's next record
	DB	21*2+0		; BDOS 21, source FCB
	OR	A
	SCF
	RET	NZ		; A nonzero: not written, carry
	LD	HL,(SAVEADR)
	LD	DE,128
	ADD	HL,DE
	LD	(SAVEADR),HL	; the next record's bytes
	OR	A		; carry clear: written
	RET

; SAVE's end: the file closed, so that its directory entry is written. A
; failed close is NO SPACE too. Ends at MAINLOOP or the error.
SAVECLS:
	CALL	DOSSEQ		; close CMDFCB's file
	DB	16*2+0		; BDOS 16, source FCB
	INC	A
	JR	Z,SAVENOSP	; FFh: the close failed
	JP	MAINLOOP

; SAVE's failure: NO SPACE, through ERRGO, which marks the command failed.
SAVENOSP:
	LD	DE,NOSPACE	; "NO SPACE", then the prompt
	JP	ERRGO

; Publish only documented page-zero transient state after loading succeeds:
; the first two names in the arguments at ARGSTRT go in the FCBs at 005Ch and
; 006Ch, the arguments as the tail at 0080h, its length before it and a 0
; after it, and the DMA address is 0080h. Destroys AF, BC, DE, HL.
PREPPAGE:
	LD	HL,(ARGSTRT)	; the text after the command's name
	PUSH	HL		; kept for the tail
	CALL	SKIPSP
	LD	DE,FCBONE
	CALL	PARSEFCB	; the first name, any error ignored
	CALL	SKIPSP
	LD	DE,FCBTWO
	CALL	PARSEFCB	; the second: its 36 bytes reach 008Fh,
	POP	HL		; so the tail is copied after both
	LD	DE,CMDTAIL+1
	LD	B,0		; B counts the tail's bytes
TAILLOOP:
	LD	A,(HL)
	OR	A
	JR	Z,TAILDONE	; the piece's 0 ends it
	LD	(DE),A		; a byte of the tail,
	INC	HL
	INC	DE
	INC	B		; counted
	JR	TAILLOOP
TAILDONE:
	LD	A,B
	LD	(CMDTAIL),A	; the length before the tail,
	XOR	A
	LD	(DE),A		; and a 0 after it
	LD	DE,CMDTAIL
	LD	C,26		; BDOS 26: the DMA address 0080h
	JP	BDOS

; Parse one CP/M file reference into a cleared 36-byte FCB. HL points
; at the first token byte and returns at its delimiter. A '*' expands to '?'
; through the remainder of its current field. Takes the FCB at DE, noted in
; FCBBASE. Returns carry for a bad drive, a forbidden character or a field
; too long; an empty reference leaves the FCB blank. Destroys AF, B, DE.
PARSEFCB:
	LD	(FCBBASE),DE	; the FCB's start, for UNAMBIG
	PUSH	DE
	XOR	A
	LD	(DE),A		; drive 0: the current drive
	INC	DE
	LD	B,11
	LD	A,SPACE		; the name and type: 11 spaces
FCBSPACE:
	LD	(DE),A
	INC	DE
	DJNZ	FCBSPACE
	XOR	A
				; A parsed FCB is reusable command state, so
				; the whole tail is reset: EX, S1, S2, RC, the
				; allocation map, CR and the random record.
				; A CR left behind would make the command
				; after TYPE load from record one rather than
				; from the start of its COM file.
	LD	B,24		; the 24 bytes after the type
FCBZERO:
	LD	(DE),A
	INC	DE
	DJNZ	FCBZERO
	POP	DE		; DE = the FCB's drive byte
	LD	A,(HL)
	OR	A
	RET	Z		; nothing to parse: a blank name
	INC	HL
	LD	A,(HL)		; a colon second means a drive
	DEC	HL
	CP	':'
	JR	NZ,FCBNAME	; no colon: the current drive
	LD	A,(HL)		; the drive's letter
	CP	'A'
	JR	C,FCBDRBAD
	CP	'Q'
	JR	NC,FCBDRBAD	; A to P only
	SUB	'A'-1
	LD	(DE),A		; the drive byte: 1 for A to 16 for P
	INC	HL
	INC	HL		; past the letter and colon
FCBNAME:
	INC	DE		; the name field
	LD	B,8		; eight characters
	CALL	PARFLD
	RET	C		; a bad character or too long
	LD	A,(HL)
	CP	'.'
	JR	Z,FCBDOT	; a type follows
	OR	A		; carry clear: parsed
	RET
FCBDOT:
	INC	HL		; past the dot
	LD	A,E		; B is the unfilled part of the name field
	ADD	A,B
	LD	E,A
	JR	NC,FCBTYP
	INC	D		; DE at the type field
FCBTYP:	LD	B,3		; three characters, PARFLD returning
	JR	PARFLD		; for PARSEFCB
FCBDRBAD:
	SCF			; a drive letter past P: carry
	RET

; One field of an FCB, the name's 8 bytes or the type's 3: B characters
; from HL into DE, up to a delimiter as FCBEND finds one. Returns carry for
; a forbidden character or a field too long. Otherwise returns Z, carry
; clear, A and HL at the delimiter, DE past the field's filled bytes and B
; the bytes left unfilled. Destroys AF, B, DE.
PARFLD:
	CALL	FCBEND
	RET	Z		; the delimiter: the field ends early
	CP	'*'
	JR	Z,PARSTAR	; '?' to the field's end
	CALL	VALIDCHR
	RET	C		; a forbidden character
	LD	(DE),A
	INC	DE
	INC	HL
	DJNZ	PARFLD		; the next, while the field has room
PARSKIP:
	CALL	FCBEND
	RET	Z		; full, and a delimiter next
PARLONG:
	INC	HL
	CALL	FCBEND
	JR	NZ,PARLONG	; too long: on to its delimiter,
PLEND:
	SCF			; and carry
	RET

; Commands that name exactly one file reject an empty name or either wildcard.
; Preserve the parser's delimiter pointer in HL; FCBBASE identifies the FCB
; because PARSEFCB advances DE while filling it. Returns carry for an empty
; or ambiguous name. Keeps BC and HL; destroys AF.
UNAMBIG:
	PUSH	HL
	PUSH	BC
	LD	HL,(FCBBASE)
	INC	HL		; the name's first byte
	LD	A,(HL)
	CP	SPACE
	JR	Z,CHRRET	; a space: no name, carry
	LD	BC,11		; the name and type, for a '?'
	LD	A,'?'
	CPIR			; equality means an ambiguous name
	JR	CHRRET

; CP/M 2.2 reserves these characters inside filename and filetype fields.
; Dot and equals are handled as grammar delimiters, while question mark and
; asterisk remain available to the ambiguous DIR and ERA forms. Takes the
; character in A and keeps it; returns carry if it is forbidden. Keeps BC
; and HL; destroys F.
VALIDCHR:
	PUSH	HL
	PUSH	BC
	LD	HL,BADCHARS
	LD	BC,13		; the 13 forbidden characters
	CPIR			; equality means a forbidden byte
; Both scans preserve HL/BC and return carry for a match (invalid/ambiguous).
; Takes Z for a match, with BC and HL pushed in that order.
CHRRET:	POP	BC
	POP	HL
	SCF
	RET	Z		; Z from the scan: carry
	OR	A		; none found: carry clear
	RET

; A '*' in a field: '?' through the B bytes left of it at DE, and the rest
; of the field's text at HL passed over to its delimiter. Returns as PARFLD
; does when it succeeds.
PARSTAR:
	LD	A,'?'		; any character matches
STARLOOP:
	LD	(DE),A
	INC	DE
	DJNZ	STARLOOP	; the field's bytes left; B = 0 after
	INC	HL		; past the '*'
PARIGN:
	CALL	FCBEND
	RET	Z		; the delimiter
	INC	HL		; characters after the '*' are ignored
	JR	PARIGN

; Z at the end of a name: a zero, a space, '=' or '.'. A holds the character.
; Takes HL at the character; destroys AF only.
FCBEND:	LD	A,(HL)
	OR	A
	RET	Z		; the line's end
	CP	SPACE
	RET	Z		; the next argument
	CP	'='
	RET	Z		; a second name follows
	CP	'.'
	RET			; a type follows; NZ for any other
				; character

; Move HL past spaces. Returns A = the first other character, with NZ, and
; carry when it is below a space, as the line's 0 is. Destroys AF.
SKIPSP:
	LD	A,(HL)
	CP	SPACE
	RET	NZ		; not a space: HL at it
	INC	HL
	JR	SKIPSP

; Compare the parsed command word with a zero-terminated keyword. Equality
; requires a command delimiter or end immediately after the keyword. Takes
; DE at the keyword and the word at CMDSTRT. Returns Z for a match, with DE
; at the keyword's 0; NZ with DE at the byte that differed, or at the 0 when
; the word goes on. Destroys AF, HL.
ISCMD:
	LD	HL,(CMDSTRT)	; the command word
KEYLOOP:
	LD	A,(DE)
	OR	A
	JR	Z,KEYEND	; the keyword's 0: does the word end?
	CP	(HL)
	RET	NZ		; a letter differs: NZ
	INC	DE
	INC	HL
	JR	KEYLOOP		; alike: the next letter
KEYEND:
	LD	A,(HL)
	OR	A
	RET	Z		; the line's end: Z, a match
	CP	SPACE
	RET			; Z for a space after it, else NZ

; Print the '$'-terminated string at DE by BDOS function 9. Destroys AF,
; BC, DE and HL, as the BDOS may.
PUTSTR:
	LD	C,9		; BDOS 9: print a string
	JP	BDOS

; Print E by BDOS function 2, through OUTCHAR's column count and ^P echo.
; Keeps BC and HL, which every caller wants kept. Destroys AF and DE.
PUTCHAR:
	PUSH	BC		; kept for the caller, as the BDOS
	PUSH	HL		; may change them
	LD	C,2		; BDOS 2: the console, E
	CALL	BDOS
	POP	HL
	POP	BC
	RET

; SERVICES: each service's name and pages, from the owner list: one line
; each, from the lowest up, the name without its spaces and the pages in
; decimal. Ends at MAINLOOP.
CMDSVC:	LD	A,(SVCHEAD)	; the lowest owner's page, 0 for none
CMDDL:	OR	A
	JP	Z,MAINLOOP	; the list's end
	LD	H,A		; HL at the owner's name
	LD	L,DNAM
	LD	B,8
	CALL	PUTTRIM		; up to 8 characters, spaces passed over
	LD	E,' '		; a space before the pages
	CALL	PUTCHAR
	PUSH	HL		; H = the owner's page
	LD	L,DOWN
	LD	A,(HL)		; the next owner up, 0 for none,
	CALL	SVCABV		; gives the page above this one,
	SUB	H		; and less its own, its pages
	LD	L,A
	LD	H,0
	CALL	PUTDEC		; in decimal
	LD	DE,CRLFMSG
	CALL	PUTSTR
	POP	HL
	LD	L,DOWN
	LD	A,(HL)		; the next owner's page, 0 at the last
	JR	CMDDL

; Startup. Once after cold boot one record of A:STARTUP.CMD is read, the
; position marked finished first, so that a failure can't repeat. STPOS is 0
; until then, the next byte + 1 in the file, and 80h up once it is finished.
; Destroys AF, BC, DE, HL.
STBOOT:	LD	HL,STPOS	; startup's state
	LD	A,(HL)
	OR	A
	RET	NZ		; cold boot has passed here already
	SET	7,(HL)		; finished, whatever follows
	IN	A,(STSPORT)	; a keypad key held skips it: bit 6 low
	AND	$40
	RET	Z
	LD	HL,STFCB	; the file's name, for the BDOS
	LD	DE,CMDFCB
	LD	BC,12		; its drive, name and type
	LDIR
	LD	DE,STREC	; the record goes where STLINE reads it
	LD	C,26		; BDOS 26: the DMA address
	CALL	BDOS
	CALL	DOSSEQ		; open A:STARTUP.CMD
	DB	15*2+0		; BDOS 15, source FCB
	INC	A
	JR	Z,STBDMA	; FFh: no such file
	CALL	DOSSEQ		; read its first record
	DB	20*2+0		; BDOS 20, source FCB
	OR	A
	JR	NZ,STBDMA	; not read: finished, nothing to run
	INC	A		; STPOS 1, the file's first byte
	LD	(STPOS),A
STBDMA:	LD	HL,DEFDMA	; the DMA address programs expect
	LD	(CURDMA),HL	; set in the BDOS's own variable
	RET

; Startup's next line, from STREC at STPOS. With a line left: it goes in the
; command buffer, echoed as if typed, and carry clear. Lines end at CR or LF
; and blank ones are passed over; a line's characters after its 127th are
; passed over too, as a typed line has no more. ^Z, a zero or the record's
; last byte ends the file. Otherwise carry set, once the file has finished.
; Destroys AF, BC, DE, HL.
STLINE:	LD	HL,STPOS
	LD	A,(HL)
	RLCA			; top bit to carry: the file is finished
	RET	C		; the file finished: a line is typed
	RRCA			; the position again
	ADD	A,LOW(STREC)-1	; HL at the next byte: the record
	LD	L,A		; is in one page
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
	CP	13		; CR or LF: the line's end
	JR	Z,STL2
	CP	10
	JR	Z,STL2
	INC	B		; B 0, the line full? A kept
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
	LD	A,E		; the line's length
	SUB	LOW(CMDTXT)
	JR	Z,STLINE	; a blank line: the next one
	LD	(CMDLEN),A	; where function 10 leaves it
	EX	DE,HL
	LD	(HL),13		; a CR for the echo, which MLGOT
	INC	HL		; makes the line's 0
	LD	(HL),'$'	; and the echo's end, for PUTSTR
				; (at 127 characters this '$' is in
				; BOOTDRV, past CMDTXT, read only before)
	LD	DE,CMDTXT
	CALL	PUTSTR		; the echo, as if typed
	OR	A		; carry clear: a line
	RET
