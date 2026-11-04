; The CCP's file commands: DIR with its paging and its footer, TYPE, ERA,
; REN and COPY, with the decimal and hex printers they share. Included after
; ccp.asm, in this order, by rom.asm.

; DIR [d:][name]: list the matching files, system files hidden, in as many
; columns of 13 as the console's width holds, through the pager, then a
; footer of the count of files and the drive's free space. Takes the operand
; at ARGSTRT: a bad command if it does not parse or more follows it. Uses
; CMDFCB, LOADBUF as the DMA record, DIRCOL, DIRNCOL and DIRNUM; returns to
; the prompt, by FILENO when nothing matched.
; DIR uses only search-first/search-next and the public DMA directory record.
CMDDIR:
	CALL	ARGSKIP		; the operand, past its spaces,
	CALL	CMDPARSE	; into CMDFCB, or a bad command,
	CALL	ENDCHK		; with nothing after it
	LD	A,(CMDFCB+1)	; no name, with or without a drive: every file
	CP	SPACE
	JR	NZ,DIRREADY	; a name given: searched for as it is
	LD	HL,CMDFCB+1	; else all 11 name and type bytes
	LD	B,11
	LD	A,'?'
DIRWILD:
	LD	(HL),A
	INC	HL
	DJNZ	DIRWILD		; become ?, which matches anything

; Set up the listing: the directory records the searches return go to
; LOADBUF, no row is started, no file counted, and DIRNCOL takes the count
; of entries a row holds, at least one. The pager starts a new screen, and
; the first search's result goes to DIRLOOP in A.
DIRREADY:
	LD	DE,LOADBUF	; BDOS 26: the DMA record, where each
	LD	C,26		; search returns a directory record
	CALL	BDOS
	XOR	A
	LD	(DIRCOL),A	; no row yet: the first entry starts one
	LD	H,A
	LD	L,A
	LD	(DIRNUM),HL	; no file listed yet
	LD	A,(VWID)	; TEC-OS: columns of 13 that fit the console
	OR	A		; 0 when no video console is fitted
	JR	NZ,DIRWID
	LD	A,80		; serial only: assume 80
DIRWID:
	LD	B,0		; B counts the columns that fit
DIRWDIV:
	SUB	13		; 12 for a name, one space between
	JR	C,DIRWSET	; no room for another
	INC	B
	JR	DIRWDIV
DIRWSET:
	LD	A,B
	OR	A		; a console under 13 wide
	JR	NZ,DIRWOK
	INC	A		; still has one column
DIRWOK:
	LD	(DIRNCOL),A	; the entries on a full row
	CALL	PGINIT		; the pager starts a new screen
	CALL	DOSSEQ		; the first match, by search first
	DB	17*2+0		; BDOS 17, source FCB

; One search result in A: the matching entry's index, 0 to 3, in the
; directory record at LOADBUF, or FFh when no more match. A system file is
; passed over; any other is printed, a new row begun when the last is full.
DIRLOOP:
	INC	A		; FFh: the search is over
	JP	Z,DIRDONE
	DEC	A
	LD	L,A		; the entry at LOADBUF + 32 * index
	LD	H,0
	ADD	HL,HL		; five doublings: 32 bytes an entry
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	LD	DE,LOADBUF	; from the record's start
	ADD	HL,DE
	PUSH	HL
	LD	DE,10		; the type's second byte, whose bit 7
	ADD	HL,DE
	BIT	7,(HL)		; is the system attribute
	POP	HL
	JR	NZ,DIRNEXT	; a system file: not listed
	PUSH	HL		; live until DIRNAME; abort resets SP
	LD	A,(DIRCOL)	; entries still to go on this row
	OR	A
	JR	Z,DIRHEAD	; none: this entry starts a new row
	LD	E,SPACE		; else one space after the last entry
	CALL	PUTCHAR
	JR	DIRNAME

; A new row: DIRCOL takes the count of entries a full row holds. Every row
; but the first begins with CR LF through the pager, which may pause there,
; and the listing stops if the key says so. The entry's address is on the
; stack.
DIRHEAD:
	LD	A,(DIRNCOL)	; columns remaining in this row
	LD	(DIRCOL),A
	LD	HL,(DIRNUM)
	LD	A,H		; no file listed yet: the first row
	OR	L		; needs no line break before it
	JR	Z,DIRNAME
	CALL	PGCRLF		; end the last row
	JP	C,STARTED	; stopped at a page pause

; One entry as NAME.EXT, padded to 12 unless it ends the line. Takes the
; entry's address on the stack; counts it in DIRNUM and DIRCOL and goes on
; to the next search.
DIRNAME:
	LD	HL,(DIRNUM)	; one more file listed
	INC	HL
	LD	(DIRNUM),HL
	POP	HL		; the entry, its user byte first,
	INC	HL		; and then its 8-byte name
	LD	B,8
	LD	C,0		; characters printed
	CALL	PUTTRIM		; the name without its spaces
	LD	A,(HL)		; the type's first byte, its attribute
	AND	$7F		; cleared: a space when there is no type
	CP	SPACE
	JR	Z,DIRPAD	; and then no dot
	LD	E,'.'
	CALL	PUTCHAR
	INC	C		; the dot counts toward the 12
	LD	B,3
	CALL	PUTTRIM		; then the 3-byte type
DIRPAD:
	LD	HL,DIRCOL	; one fewer entry left on this row
	DEC	(HL)
	JR	Z,DIRNEXT	; the row's last entry: no padding
DIRPADC:
	LD	A,C		; spaces after the entry
	CP	12
	JR	NC,DIRNEXT	; until it is 12 wide
	LD	E,SPACE
	CALL	PUTCHAR
	INC	C
	JR	DIRPADC

; The next match, by search next, to DIRLOOP with its result in A.
DIRNEXT:
	CALL	DOSSEQ		; the next match's index, or FFh
	DB	18*2+0		; BDOS 18, source FCB
	JP	DIRLOOP

; The search is over: NO FILE when nothing was listed, else the footer.
; Returns to the prompt.
DIRDONE:
	LD	HL,(DIRNUM)
	LD	A,H		; not one file listed
	OR	L
	JP	Z,FILENO	; is the NO FILE error

; Footer: "n files, nK free" for the drive listed.
	CALL	PGCRLF		; end the last row
	JP	C,STARTED	; stopped at a page pause
	LD	HL,(DIRNUM)
	CALL	PUTDEC		; the count of files
	LD	DE,FILESMSG	; " files, " for any count
	LD	HL,(DIRNUM)
	DEC	HL		; but one: " file, "
	LD	A,H
	OR	L
	JR	NZ,DIRSUM2
	LD	DE,FILEMSG
DIRSUM2:
	CALL	PUTSTR		; the word, singular or plural
	LD	A,(CMDFCB)	; the drive named, 1 for A:,
	DEC	A		; as the BDOS numbers it, 0 for A:
	JP	P,DIRFREE	; a drive named: its number
	LD	A,(CURDSK)	; none named: the current drive, from
	AND	$0F		; 0004h's low nibble; the user is above
DIRFREE:
	LD	E,A		; BDOS 46: the drive's free records,
	LD	C,46		; 24 bits, into the DMA record LOADBUF
	CALL	BDOS
	LD	HL,(LOADBUF)	; kilobytes = records / 8
	LD	A,(LOADBUF+2)	; the count in A:H:L
	LD	B,3		; three halvings
DIRFK:	SRL	A
	RR	H
	RR	L
	DJNZ	DIRFK		; HL the kilobytes, which a drive fits
	CALL	PUTDEC
	LD	DE,FREEMSG	; "K free"
	CALL	PUTSTR
	JP	STARTED		; a new line and the prompt

; ---- Page pauses (TEC-OS) --------------------------------------------------
; TYPE and DIR count the lines they print, including lines that wrap at the
; console width. One line short of a full screen they show [more] and wait for
; a key: ^C, Esc or Q stops the listing, anything else shows the next screen.
; The size comes from the console geometry; a serial-only console is 80 x 24.

; Start a listing on a new screen: no lines counted and the column at 0,
; with the screen's rows, less one for the pause prompt, and its width from
; the console geometry, or 24 by 80 for a serial console. Destroys AF.
PGINIT:
	XOR	A
	LD	(PGLINE),A	; no lines printed on this screen
	LD	(PGCOL),A	; at the start of a line
	LD	A,(VHGT)	; the video console's rows,
	OR	A		; 0 when there is none
	JR	NZ,PGIH
	LD	A,24		; a serial terminal's 24
PGIH:
	DEC	A		; the last row holds the pause prompt
	LD	(PGROWS),A
	LD	A,(VWID)	; the columns, likewise,
	OR	A
	JR	NZ,PGIW
	LD	A,80		; or a serial terminal's 80
PGIW:
	LD	(PGWID),A
	RET

; Print CR LF through the pager. Carry set when the user stops the listing.
; Destroys AF, DE and HL, and BC when it pauses.
PGCRLF:
	LD	E,CR
	CALL	PGPUT
	RET	C		; stopped at a page pause
	LD	E,LF		; then the line feed, by PGPUT below

; Print E, counting lines and pausing when the screen is full. Carry set
; when the user stops the listing. PGCOL follows the column: CR returns it
; to 0, a backspace steps it back, a tab moves it to the next multiple of 8,
; and a printable character at the width begins a wrapped line. Destroys AF,
; DE and HL, and BC when it pauses.
PGPUT:
	LD	A,E
	CP	LF		; line feed: a new line, perhaps a pause
	JR	Z,PGLF
	CP	CR		; carriage return: column 0
	JR	Z,PGCR
	CP	8		; backspace: one column back
	JR	Z,PGBS
	CP	9		; tab: to the next multiple of 8
	JR	Z,PGTAB
	CP	SPACE
	JR	C,PGOUT		; other control bytes take no room
	LD	A,(PGCOL)	; a printable character: at the width
	LD	HL,PGWID
	CP	(HL)
	JR	C,PGINC		; or past it, it wraps; short of it, fits
	PUSH	DE		; this character starts a wrapped line
	CALL	PGNEWL
	POP	DE
	RET	C		; stopped at a page pause
	XOR	A		; from column 0 of the new line
PGINC:
	INC	A		; the column after this character
PGSETC:
	LD	(PGCOL),A
PGOUT:
	CALL	PUTCHAR
	OR	A		; carry clear: the listing goes on
	RET
PGCR:
	XOR	A
	JR	PGSETC		; the column back to 0
PGBS:
	LD	A,(PGCOL)
	OR	A		; a backspace at column 0 stays there
	JR	Z,PGOUT
	DEC	A		; else one column left
	JR	PGSETC
PGTAB:
	LD	A,(PGCOL)
	OR	7		; the next column that is a multiple of 8
	INC	A
	JR	PGSETC
PGLF:
	CALL	PUTCHAR		; the line feed itself first
; A new line begins. Pause first if the screen is full: show [more], wait
; for a key and erase the prompt. ^C, Esc or Q return carry set to stop the
; listing; any other key starts a new screen. Otherwise the line is counted
; and the column set to 0, with carry clear. Destroys AF, DE and HL, and BC
; when it pauses.
PGNEWL:
	LD	A,(PGLINE)
	INC	A		; this screen's lines with the new one
	LD	HL,PGROWS
	CP	(HL)
	JR	C,PGNL1		; still room: count it
	LD	DE,MOREMSG	; full: [more] on the last row
	CALL	PUTSTR
PGWAIT:
	LD	E,$FF		; direct console input, no echo
	LD	C,6		; BDOS 6, which returns 0 with no key
	CALL	BDOS
	OR	A
	JR	Z,PGWAIT	; wait for one
	PUSH	AF		; the key, kept across the erase
	LD	DE,UNMORE	; spaces over [more], back to column 0
	CALL	PUTSTR
	POP	AF
	AND	$DF		; upper case; ^C and Esc are unaffected
	CP	3		; ^C
	JR	Z,PGDROP
	CP	$1B		; Esc
	JR	Z,PGSTOP
	CP	'Q'
	JR	Z,PGSTOP
	XOR	A		; any other key: a new screen
PGNL1:
	LD	(PGLINE),A
	XOR	A		; column 0, and carry clear: go on
	LD	(PGCOL),A
	RET
; ^C drops the rest of a chained line, as it does at a program's line input;
; Esc and Q stop only the listing. Both return carry set.
PGDROP:
	XOR	A
	LD	(CHPOS),A	; no chained piece left to run
PGSTOP:
	SCF			; carry: the listing stops
	RET

; Print up to B characters from HL, without their attribute bits and
; passing over spaces; count those printed in C, which runs on from its
; value at entry. Leaves HL after the field and B at 0. Destroys AF and DE.
PUTTRIM:
	LD	A,(HL)
	AND	$7F		; the character without its attribute
	CP	SPACE
	JR	Z,PUTTSK	; a space is not printed
	LD	E,A
	CALL	PUTCHAR		; which keeps B, C and HL
	INC	C
PUTTSK:
	INC	HL
	DJNZ	PUTTRIM		; the rest of the field
	RET

; Print HL in decimal without leading zeros: the remainders of division by
; 10 go on the stack above a 10, which no digit equals, and print in reverse.
; Destroys AF, BC, DE and HL.
PUTDEC:	LD	DE,10		; the divisor, and the end marker
	PUSH	DE
PUTDL:	CALL	DIV16		; HL mod 10 in HL, HL / 10 in DE
	PUSH	HL		; a digit, the lowest first
	EX	DE,HL		; on with the quotient
	OR	L		; A = H: DIV16 leaves A = D
	LD	DE,10
	JR	NZ,PUTDL	; until the quotient is 0
PUTDP:	POP	HL		; the digits, the highest first
	LD	A,L
	CP	10		; the end marker: all printed
	RET	Z
	ADD	A,'0'		; the digit as a character
	LD	E,A
	CALL	PUTCHAR
	JR	PUTDP

; TYPE name: print a text file through the pager, up to its first ^Z or
; its end, then close it. NO FILE when no name is given or the file is not
; there; a bad command for an ambiguous name or more after it. Uses CMDFCB
; and LOADBUF as the DMA record; returns to the prompt.
; TYPE streams public 128-byte records and stops at CP/M text EOF.
CMDTYPE:
	CALL	ARGSKIP		; the operand: none is NO FILE
	JR	Z,FILENO
	CALL	ONENAME		; one unambiguous name into CMDFCB
	CALL	DOSSEQ		; open it
	DB	15*2+0		; BDOS 15, source FCB
	INC	A
	JR	Z,FILENO	; FFh: not found
	LD	DE,LOADBUF	; BDOS 26: records are read
	LD	C,26		; into LOADBUF
	CALL	BDOS
	CALL	PGINIT		; the pager starts a new screen

; The next record into LOADBUF. A nonzero result is the file's end, or a
; read error, and ends the listing.
TYPEREAD:
	CALL	DOSSEQ		; read sequential: A 0 for a record
	DB	20*2+0		; BDOS 20, source FCB
	OR	A
	JR	NZ,TYPEEND	; the file's end
	LD	HL,LOADBUF	; the record's 128 bytes in turn
	LD	B,128

; Each byte of the record through the pager, up to a ^Z, CP/M's end of
; text. HL points to the byte and B counts those left in the record.
TYPEBYTE:
	LD	A,(HL)
	CP	$1A		; ^Z: the text ends here
	JR	Z,TYPEEND
	LD	E,A
	PUSH	BC		; the pager destroys HL, and BC
	PUSH	HL		; when it pauses
	CALL	PGPUT
	POP	HL
	POP	BC
	JR	C,TYPEEND	; stopped at a page pause
	INC	HL
	DJNZ	TYPEBYTE	; the rest of the record,
	JR	TYPEREAD	; then the next

; Close the file and return to the prompt on a new line.
TYPEEND:
	CALL	DOSSEQ		; close it
	DB	16*2+0		; BDOS 16, source FCB
	JP	STARTED		; a new line and the prompt

; The NO FILE error: the message, the failure code and the prompt.
FILENO:
	LD	DE,NOFILE
	JP	ERRGO		; the message at DE as a failure

; ERA name: delete the files the name matches, which may be ambiguous. A
; name that is all ? (*.*, on any drive) first asks ALL (Y/N)? and deletes
; nothing unless the answer starts with Y. NO FILE when nothing matched; a
; bad command with no operand, or one that does not parse. Uses CMDFCB,
; ERAANS and ERAALL; returns to the prompt.
; ERA deletes through BDOS only after the complete operand has parsed.
CMDERA:
	CALL	ARGSKIP
	JP	Z,BADCMD	; no operand
	CALL	CMDPARSE	; the name into CMDFCB,
	CALL	ENDCHK		; with nothing after it
	XOR	A
	LD	(ERAALL),A	; not a whole-drive erase unless confirmed
	LD	HL,CMDFCB+1	; is every name and type byte ?
	LD	B,11
ERACHK:
	LD	A,(HL)
	CP	'?'
	JR	NZ,ERADEL	; one is not: delete without asking
	INC	HL
	DJNZ	ERACHK
	LD	DE,ALLQUERY	; all are: ask ALL (Y/N)?
	CALL	PUTSTR
	LD	C,1		; BDOS 1, a key, echoed
	CALL	BDOS
	CP	CR		; Return alone is no:
	JP	Z,STARTED	; nothing is deleted
	AND	$DF		; the answer in upper case, kept
	LD	(ERAANS),A	; while the line is read out
ERADRAIN:
	LD	C,1		; the rest of the answer's line,
	CALL	BDOS		; read and dropped up to its Return
	CP	CR
	JR	NZ,ERADRAIN
ERAGOT:
	LD	A,(ERAANS)
	CP	'Y'		; an answer starting with Y or y
	JP	NZ,STARTED	; erases; any other erases nothing
	LD	A,1
	LD	(ERAALL),A	; confirmed

; Delete every file CMDFCB matches; NO FILE when none does. After the ALL
; question the prompt starts on a new line.
ERADEL:
	CALL	DOSSEQ		; delete: A FFh when nothing matched
	DB	19*2+0		; BDOS 19, source FCB
	INC	A
	JR	Z,FILENO	; nothing matched: NO FILE
	LD	A,(ERAALL)
	OR	A		; after the question's answer,
	JP	NZ,STARTED	; a new line before the prompt
	JP	MAINLOOP	; else the prompt at once

; REN's public syntax is NEW=OLD. A separate destination FCB permits an
; existence check before the function-23 mutation FCB is assembled.
; Both names are unambiguous and on one drive: either one's, the other
; naming none or the same. FILE EXISTS when NEW is there already, NO FILE
; when OLD is not, and a bad command otherwise. Uses CMDFCB for OLD, RENFCB
; for NEW, and LOADBUF as the DMA record; returns to the prompt.
CMDREN:
	CALL	ARGSKIP
	JP	Z,BADCMD	; no operand
	CP	'='
	JP	Z,BADCMD	; no new name before the =
	LD	DE,RENFCB	; the new name into RENFCB,
	CALL	FCBPARSE
	CALL	CPCHK		; unambiguous,
	LD	A,(HL)
	CP	'='		; with the = straight after it
	JP	NZ,BADCMD
	INC	HL
	LD	A,(HL)		; the old name straight after the =:
	OR	A		; not the line's end,
	JP	Z,BADCMD
	CP	SPACE		; a space
	JP	Z,BADCMD
	CP	'='		; or a second =
	JP	Z,BADCMD
	CALL	ONENAME		; the old name into CMDFCB, and no more

	LD	HL,CMDFCB	; one drive for both names: the new one's
	LD	A,(RENFCB)	; or the old one's; two different are bad
	OR	A
	JR	Z,RENOLD	; the new names none: the old one's
	CP	(HL)
	JR	Z,RENTEST	; both name the same drive
	LD	B,A
	LD	A,(HL)
	OR	A		; the old names another: a bad command
	JP	NZ,BADCMD
	LD	(HL),B		; the old names none: the new one's
RENOLD:
	LD	A,(HL)		; CMDFCB's drive into RENFCB
	LD	(RENFCB),A
RENTEST:
	LD	DE,LOADBUF	; BDOS 26: the search's directory
	LD	C,26		; record goes to LOADBUF
	CALL	BDOS
	LD	DE,RENFCB	; BDOS 17, search first, for the new
	LD	C,17		; name, called directly
	CALL	BDOS
	INC	A		; found: the new name is taken
	JR	NZ,RENEXIST

	LD	HL,RENFCB	; the new drive and name into CMDFCB's
	LD	DE,CMDFCB+16	; second half, where BDOS 23 reads them
	LD	BC,12
	LDIR
	CALL	DOSSEQ		; rename: A FFh when OLD is not there
	DB	23*2+0		; BDOS 23, source FCB
	INC	A
	JP	Z,FILENO	; not there: NO FILE
	JP	MAINLOOP	; renamed: the prompt

; The FILE EXISTS error: the new name is taken, and nothing is renamed.
RENEXIST:
	LD	DE,FILEEX
	JP	ERRGO		; the message at DE as a failure

; Parse the next name at HL into the FCB at DE, unambiguous (CPNAME); parse
; it (CPPARSE), keeping DE, with the current drive from 0004h in a 0 drive
; byte; check the FCB just parsed is unambiguous (CPCHK). A bad command
; otherwise. PARSEFCB clears the rest of the FCB. Each leaves HL at the
; name's delimiter and destroys AF and BC; CPPARSE returns the drive in A.
CPNAME:
	CALL	CPPARSE		; parse, then check as CPCHK
CPCHK:
	CALL	UNAMBIG		; carry: an empty or ambiguous name
	JR	C,CPBAD
	RET
CPPARSE:
	CALL	SKIPSP		; past the spaces before the name
	PUSH	DE
	CALL	PARSEFCB	; carry: a name that does not parse
	POP	DE
	JR	C,CPBAD
	LD	A,(DE)
	OR	A		; a drive given is kept
	RET	NZ
	LD	A,(CURDSK)	; the drive in use
	AND	$0F		; its low nibble, 0 for A:,
	INC	A		; as an FCB's drive, 1 for A:
	LD	(DE),A
	RET

; TEC-OS: COPY SOURCE DEST copies a file a record at a time through the
; default DMA record, as COPY.COM does: open the source, erase and make the
; destination, read and write to the end, close, and print COPIED nnnn
; (records, hex) or the same error text. On a write error the destination
; is closed with the records written, where COPY.COM leaves it open.
; Nothing in the TPA is touched.
; DEST may be a drive alone, or a blank name with a type: the source's whole
; name is used. Both names carry their drive, the current one if none was
; given, and a destination that names the source is a bad command, with
; nothing opened, as is any text after DEST. Takes the operands at ARGSTRT.
; Uses CMDFCB for SOURCE, RENFCB for DEST and DIRNUM for the count
; of records; returns to the prompt.
CMDCOPY:
	LD	HL,(ARGSTRT)	; the operands
	LD	DE,CMDFCB	; the source into CMDFCB, unambiguous
	CALL	CPNAME
	LD	DE,RENFCB	; the destination into RENFCB
	CALL	CPPARSE		; DE kept
	CALL	ENDCHK		; nothing after it; DE kept
	INC	DE
	LD	A,(DE)		; its name's first byte, a space when
	CP	SPACE		; only a drive or a type was given
	JR	NZ,CPD1
	LD	HL,CMDFCB+1	; no name: the source's name and type
	LD	BC,11
	LDIR
CPD1:
	CALL	CPCHK		; the destination unambiguous
	LD	HL,CMDFCB	; the source itself?
	LD	DE,RENFCB	; drive, name and type compared,
	LD	B,12		; 12 bytes
CPSAME:
	LD	A,(DE)
	CP	(HL)
	JR	NZ,CPGO		; a byte differs: another file
	INC	HL
	INC	DE
	DJNZ	CPSAME
CPBAD:
	JP	BADCMD		; the same file, or a bad name
CPGO:
	LD	DE,DEFDMA	; BDOS 26: records pass through
	LD	C,26		; the default DMA record at 0080h
	CALL	BDOS
	CALL	DOSSEQ		; open the source
	DB	15*2+0		; BDOS 15, source FCB
	INC	A		; FFh: not found
	LD	DE,CPNOSRC
	JR	Z,CPFAIL	; NO SOURCE
	CALL	DOSSEQ		; erase any old destination,
	DB	19*2+1		; BDOS 19, destination FCB
	CALL	DOSSEQ		; then make it anew
	DB	22*2+1		; BDOS 22, destination FCB
	INC	A		; FFh: no directory entry free
	LD	DE,CPNODST
	JR	Z,CPFAIL	; CANNOT MAKE DEST
	LD	HL,0
	LD	(DIRNUM),HL	; DIRNUM counts the records copied
CPLOOP:
	CALL	DOSSEQ		; the source's next record
	DB	20*2+0		; BDOS 20, source FCB
	OR	A		; nonzero: the source's end
	JR	NZ,CPDONE
	CALL	DOSSEQ		; written to the destination
	DB	21*2+1		; BDOS 21, destination FCB
	OR	A		; nonzero: the disk or directory is full
	JR	NZ,CPWERR	; WRITE ERROR, the destination closed
	LD	HL,(DIRNUM)	; one more record copied
	INC	HL
	LD	(DIRNUM),HL
	JR	CPLOOP
CPDONE:
	CALL	DOSSEQ		; close the destination
	DB	16*2+1		; BDOS 16, destination FCB
	INC	A		; FFh: the close failed
	LD	DE,CPCLOSE
	JR	Z,CPFAIL	; CLOSE ERROR
	LD	DE,CPCOPIED	; COPIED and the count in hex,
	CALL	PUTSTR
	LD	A,(DIRNUM+1)	; the high byte first
	CALL	CPHEX
	LD	A,(DIRNUM)
	CALL	CPHEX
	LD	DE,CRLFMSG
	JP	PRTGO		; then CR LF and the prompt
CPWERR:
	CALL	DOSSEQ		; close the destination, so that the
	DB	16*2+1		; records written are in its entry
	LD	DE,CPWRITE	; then WRITE ERROR, whatever the close
CPFAIL:
	JP	ERRGO		; the message at DE as a failure

; One inline byte after CALL: BDOS function*2 + destination bit (0=CMDFCB,
; 1=RENFCB). Advance the return PC past it, preserving HL, B and A. Keeps A,
; B and HL; the BDOS has C, DE and the result. No frame is added here; the
; READSRC terminal CALL/byte/RET holds one extra return word.
DOSSEQ:
	EX	(SP),HL		; HL at the descriptor byte
	LD	C,(HL)
	INC	HL		; the return address past it,
	EX	(SP),HL		; and the caller's HL back
	SRL	C		; C the function, carry the FCB bit
	LD	DE,CMDFCB	; 0: the source FCB
	JR	NC,DOSGO
	LD	DE,RENFCB	; 1: the destination FCB
DOSGO:	JP	BDOS		; which returns to the caller

; Print A as two hex digits by BDOS function 2, through console.asm's HEXHL.
; Destroys AF, BC, DE, HL.
CPHEX:	LD	HL,CPHEXC	; each digit through PUTCHAR
	JP	HEXHL
CPHEXC:	LD	E,A		; function 2 takes the character in E
	JP	PUTCHAR
