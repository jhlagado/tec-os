; The CCP's file commands: DIR with its paging and its footer, TYPE, ERA,
; REN and COPY, with the decimal and hex printers they share. Included after
; ccp.asm, in this order, by rom.asm.

; DIR uses only search-first/search-next and the public DMA directory record.
CMDDIR:
	CALL	ARGSKIP
	CALL	CMDPARSE
	CALL	ENDCHK
	LD	A,(CMDFCB+1)	; no name, with or without a drive: every file
	CP	SPACE
	JR	NZ,DIRREADY
	LD	HL,CMDFCB+1
	LD	B,11
	LD	A,'?'

DIRWILD:
	LD	(HL),A
	INC	HL
	DJNZ	DIRWILD

DIRREADY:
	LD	DE,LOADBUF
	LD	C,26
	CALL	BDOS
	XOR	A
	LD	(DIRCOL),A
	LD	H,A
	LD	L,A
	LD	(DIRNUM),HL
	LD	A,(VWID)	; TEC-OS: columns of 13 that fit the console
	OR	A
	JR	NZ,DIRWID
	LD	A,80		; serial only: assume 80
DIRWID:
	LD	B,0
DIRWDIV:
	SUB	13
	JR	C,DIRWSET
	INC	B
	JR	DIRWDIV
DIRWSET:
	LD	A,B
	OR	A
	JR	NZ,DIRWOK
	INC	A
DIRWOK:
	LD	(DIRNCOL),A
	CALL	PGINIT
	CALL	DOSSEQ
	DB	17*2+0		; BDOS 17, source FCB

DIRLOOP:
	INC	A
	JP	Z,DIRDONE
	DEC	A
	LD	L,A
	LD	H,0
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	ADD	HL,HL
	LD	DE,LOADBUF
	ADD	HL,DE
	PUSH	HL
	LD	DE,10
	ADD	HL,DE
	BIT	7,(HL)
	POP	HL
	JR	NZ,DIRNEXT
	PUSH	HL		; live until DIRNAME; abort resets SP
	LD	A,(DIRCOL)
	OR	A
	JR	Z,DIRHEAD
	LD	E,SPACE
	CALL	PUTCHAR
	JR	DIRNAME

DIRHEAD:
	LD	A,(DIRNCOL)	; columns remaining in this row
	LD	(DIRCOL),A
	LD	HL,(DIRNUM)
	LD	A,H
	OR	L
	JR	Z,DIRNAME
	CALL	PGCRLF
	JP	C,STARTED	; stopped at a page pause

; One entry as NAME.EXT, padded to 12 unless it ends the line.
DIRNAME:
	LD	HL,(DIRNUM)
	INC	HL
	LD	(DIRNUM),HL
	POP	HL
	INC	HL
	LD	B,8
	LD	C,0		; characters printed
	CALL	PUTTRIM
	LD	A,(HL)
	AND	$7F
	CP	SPACE
	JR	Z,DIRPAD
	LD	E,'.'
	CALL	PUTCHAR
	INC	C
	LD	B,3
	CALL	PUTTRIM
DIRPAD:
	LD	HL,DIRCOL
	DEC	(HL)
	JR	Z,DIRNEXT
DIRPADC:
	LD	A,C
	CP	12
	JR	NC,DIRNEXT
	LD	E,SPACE
	CALL	PUTCHAR
	INC	C
	JR	DIRPADC

DIRNEXT:
	CALL	DOSSEQ
	DB	18*2+0		; BDOS 18, source FCB
	JP	DIRLOOP

DIRDONE:
	LD	HL,(DIRNUM)
	LD	A,H
	OR	L
	JP	Z,FILENO

; Footer: "n files, nK free" for the drive listed.
	CALL	PGCRLF
	JP	C,STARTED
	LD	HL,(DIRNUM)
	CALL	PUTDEC
	LD	DE,FILESMSG
	LD	HL,(DIRNUM)
	DEC	HL
	LD	A,H
	OR	L
	JR	NZ,DIRSUM2
	LD	DE,FILEMSG
DIRSUM2:
	CALL	PUTSTR
	LD	A,(CMDFCB)	; the listed drive's free records, from
	DEC	A		; function 46, into LOADBUF, the DMA
	JP	P,DIRFREE	; address: a drive named, or the current
	LD	A,(CURDSK)
	AND	$0F
DIRFREE:
	LD	E,A
	LD	C,46
	CALL	BDOS
	LD	HL,(LOADBUF)	; kilobytes = records / 8
	LD	A,(LOADBUF+2)
	LD	B,3
DIRFK:	SRL	A
	RR	H
	RR	L
	DJNZ	DIRFK
	CALL	PUTDEC
	LD	DE,FREEMSG
	CALL	PUTSTR
	JP	STARTED

; ---- Page pauses (TEC-OS) --------------------------------------------------
; TYPE and DIR count the lines they print, including lines that wrap at the
; console width. One line short of a full screen they show [more] and wait for
; a key: ^C, Esc or Q stops the listing, anything else shows the next screen.
; The size comes from the console geometry; a serial-only console is 80 x 24.

PGINIT:
	XOR	A
	LD	(PGLINE),A
	LD	(PGCOL),A
	LD	A,(VHGT)
	OR	A
	JR	NZ,PGIH
	LD	A,24
PGIH:
	DEC	A		; the last row holds the pause prompt
	LD	(PGROWS),A
	LD	A,(VWID)
	OR	A
	JR	NZ,PGIW
	LD	A,80
PGIW:
	LD	(PGWID),A
	RET

; Print CR LF through the pager. Carry set when the user stops the listing.
PGCRLF:
	LD	E,CR
	CALL	PGPUT
	RET	C
	LD	E,LF

; Print E, counting lines and pausing when the screen is full. Carry set
; when the user stops the listing.
PGPUT:
	LD	A,E
	CP	LF
	JR	Z,PGLF
	CP	CR
	JR	Z,PGCR
	CP	8
	JR	Z,PGBS
	CP	9
	JR	Z,PGTAB
	CP	SPACE
	JR	C,PGOUT		; other control bytes take no room
	LD	A,(PGCOL)
	LD	HL,PGWID
	CP	(HL)
	JR	C,PGINC
	PUSH	DE		; this character starts a wrapped line
	CALL	PGNEWL
	POP	DE
	RET	C
	XOR	A
PGINC:
	INC	A
PGSETC:
	LD	(PGCOL),A
PGOUT:
	CALL	PUTCHAR
	OR	A		; carry clear
	RET
PGCR:
	XOR	A
	JR	PGSETC
PGBS:
	LD	A,(PGCOL)
	OR	A
	JR	Z,PGOUT
	DEC	A
	JR	PGSETC
PGTAB:
	LD	A,(PGCOL)
	OR	7
	INC	A
	JR	PGSETC
PGLF:
	CALL	PUTCHAR
; A new line begins. Pause first if the screen is full.
PGNEWL:
	LD	A,(PGLINE)
	INC	A
	LD	HL,PGROWS
	CP	(HL)
	JR	C,PGNL1
	LD	DE,MOREMSG
	CALL	PUTSTR
PGWAIT:
	LD	E,$FF		; direct console input, no echo
	LD	C,6
	CALL	BDOS
	OR	A
	JR	Z,PGWAIT
	PUSH	AF
	LD	DE,UNMORE
	CALL	PUTSTR
	POP	AF
	AND	$DF		; upper case; ^C and Esc are unaffected
	CP	3
	JR	Z,PGDROP
	CP	$1B
	JR	Z,PGSTOP
	CP	'Q'
	JR	Z,PGSTOP
	XOR	A
PGNL1:
	LD	(PGLINE),A
	XOR	A
	LD	(PGCOL),A
	RET
; ^C drops the rest of a chained line, as it does at a program's line input;
; Esc and Q stop only the listing.
PGDROP:
	XOR	A
	LD	(CHPOS),A
PGSTOP:
	SCF
	RET

; Print up to B characters from HL, passing over spaces; count those printed in C.
; Leaves HL after the field.
PUTTRIM:
	LD	A,(HL)
	AND	$7F
	CP	SPACE
	JR	Z,PUTTSK
	LD	E,A
	CALL	PUTCHAR
	INC	C
PUTTSK:
	INC	HL
	DJNZ	PUTTRIM
	RET

; Print HL in decimal without leading zeros: the remainders of division by
; 10 go on the stack above a 10, which no digit equals, and print in reverse.
PUTDEC:	LD	DE,10
	PUSH	DE
PUTDL:	CALL	DIV16
	PUSH	HL
	EX	DE,HL
	OR	L		; A = H: DIV16 leaves A = D
	LD	DE,10
	JR	NZ,PUTDL
PUTDP:	POP	HL
	LD	A,L
	CP	10
	RET	Z
	ADD	A,'0'
	LD	E,A
	CALL	PUTCHAR
	JR	PUTDP

; TYPE streams public 128-byte records and stops at CP/M text EOF.
CMDTYPE:
	CALL	ARGSKIP
	JR	Z,FILENO
	CALL	ONENAME
	CALL	DOSSEQ
	DB	15*2+0		; BDOS 15, source FCB
	INC	A
	JR	Z,FILENO
	LD	DE,LOADBUF
	LD	C,26
	CALL	BDOS
	CALL	PGINIT

TYPEREAD:
	CALL	DOSSEQ
	DB	20*2+0		; BDOS 20, source FCB
	OR	A
	JR	NZ,TYPEEND
	LD	HL,LOADBUF
	LD	B,128

TYPEBYTE:
	LD	A,(HL)
	CP	$1A
	JR	Z,TYPEEND
	LD	E,A
	PUSH	BC
	PUSH	HL
	CALL	PGPUT
	POP	HL
	POP	BC
	JR	C,TYPEEND	; stopped at a page pause
	INC	HL
	DJNZ	TYPEBYTE
	JR	TYPEREAD

TYPEEND:
	CALL	DOSSEQ
	DB	16*2+0		; BDOS 16, source FCB
	JP	STARTED

FILENO:
	LD	DE,NOFILE
	JP	ERRGO

; ERA deletes through BDOS only after the complete operand has parsed.
CMDERA:
	CALL	ARGSKIP
	JP	Z,BADCMD
	CALL	CMDPARSE
	CALL	ENDCHK
	XOR	A
	LD	(ERAALL),A
	LD	HL,CMDFCB+1
	LD	B,11

ERACHK:
	LD	A,(HL)
	CP	'?'
	JR	NZ,ERADEL
	INC	HL
	DJNZ	ERACHK
	LD	DE,ALLQUERY
	CALL	PUTSTR
	LD	C,1
	CALL	BDOS
	CP	CR		; Return alone is no, and is
	JP	Z,STARTED	; compared before the case is folded
	AND	$DF
	LD	(ERAANS),A

ERADRAIN:
	LD	C,1
	CALL	BDOS
	CP	CR
	JR	NZ,ERADRAIN

ERAGOT:
	LD	A,(ERAANS)
	CP	'Y'
	JP	NZ,STARTED
	LD	A,1
	LD	(ERAALL),A

ERADEL:
	CALL	DOSSEQ
	DB	19*2+0		; BDOS 19, source FCB
	INC	A
	JR	Z,FILENO
	LD	A,(ERAALL)
	OR	A
	JP	NZ,STARTED
	JP	MAINLOOP

; REN's public syntax is NEW=OLD. A separate destination FCB permits an
; existence check before the function-23 mutation FCB is assembled.
CMDREN:
	CALL	ARGSKIP
	JP	Z,BADCMD
	CP	'='
	JP	Z,BADCMD
	LD	DE,RENFCB
	CALL	FCBPARSE
	CALL	CPCHK
	LD	A,(HL)
	CP	'='
	JP	NZ,BADCMD
	INC	HL
	LD	A,(HL)
	OR	A
	JP	Z,BADCMD
	CP	SPACE
	JP	Z,BADCMD
	CP	'='
	JP	Z,BADCMD
	CALL	ONENAME

	LD	HL,CMDFCB	; one drive for both names: the new name's,
	LD	A,(RENFCB)	; or the old's, and two are a bad command
	OR	A
	JR	Z,RENOLD
	CP	(HL)
	JR	Z,RENTEST
	LD	B,A
	LD	A,(HL)
	OR	A
	JP	NZ,BADCMD
	LD	(HL),B
RENOLD:
	LD	A,(HL)
	LD	(RENFCB),A
RENTEST:
	LD	DE,LOADBUF
	LD	C,26
	CALL	BDOS
	LD	DE,RENFCB
	LD	C,17
	CALL	BDOS
	INC	A
	JR	NZ,RENEXIST

	LD	HL,RENFCB
	LD	DE,CMDFCB+16
	LD	BC,12
	LDIR
	CALL	DOSSEQ
	DB	23*2+0		; BDOS 23, source FCB
	INC	A
	JP	Z,FILENO
	JP	MAINLOOP

RENEXIST:
	LD	DE,FILEEX
	JP	ERRGO

; TEC-OS: COPY SOURCE DEST copies a file a record at a time through the
; default DMA record, as COPY.COM does: open the source, erase and make the
; destination, read and write to the end, close, and print COPIED nnnn
; (records, hex) or the same error text. Nothing in the TPA is touched.
; DEST may be a drive alone, or a blank name with a type: the source's whole
; name is used. Both names carry their drive, the current one if none was
; given, and a destination that names the source is a bad command, with
; nothing opened.
; Parse the next name at HL into the FCB at DE, unambiguous (CPNAME); parse
; it (CPPARSE), keeping DE, with the current drive from 0004h in a 0 drive
; byte; check the FCB just parsed is unambiguous (CPCHK). A bad command
; otherwise. PARSEFCB clears the rest of the FCB.
CPNAME:
	CALL	CPPARSE
CPCHK:
	CALL	UNAMBIG
	JR	C,CPBAD
	RET
CPPARSE:
	CALL	SKIPSP
	PUSH	DE
	CALL	PARSEFCB
	POP	DE
	JR	C,CPBAD
	LD	A,(DE)
	OR	A
	RET	NZ
	LD	A,(CURDSK)	; the drive in use
	AND	$0F
	INC	A
	LD	(DE),A
	RET

CMDCOPY:
	LD	HL,(ARGSTRT)
	LD	DE,CMDFCB
	CALL	CPNAME
	LD	DE,RENFCB
	CALL	CPPARSE		; DE kept
	INC	DE
	LD	A,(DE)
	CP	SPACE
	JR	NZ,CPD1
	LD	HL,CMDFCB+1	; a drive alone: the source's name
	LD	BC,11
	LDIR
CPD1:
	CALL	CPCHK
	LD	HL,CMDFCB	; the source itself?
	LD	DE,RENFCB
	LD	B,12
CPSAME:
	LD	A,(DE)
	CP	(HL)
	JR	NZ,CPGO
	INC	HL
	INC	DE
	DJNZ	CPSAME
CPBAD:
	JP	BADCMD
CPGO:
	LD	DE,DEFDMA
	LD	C,26
	CALL	BDOS
	CALL	DOSSEQ
	DB	15*2+0		; BDOS 15, source FCB
	INC	A
	LD	DE,CPNOSRC
	JR	Z,CPFAIL
	CALL	DOSSEQ
	DB	19*2+1		; BDOS 19, destination FCB
	CALL	DOSSEQ
	DB	22*2+1		; BDOS 22, destination FCB
	INC	A
	LD	DE,CPNODST
	JR	Z,CPFAIL
	LD	HL,0
	LD	(DIRNUM),HL
CPLOOP:
	CALL	DOSSEQ
	DB	20*2+0		; BDOS 20, source FCB
	OR	A
	JR	NZ,CPDONE
	CALL	DOSSEQ
	DB	21*2+1		; BDOS 21, destination FCB
	OR	A
	LD	DE,CPWRITE
	JR	NZ,CPFAIL
	LD	HL,(DIRNUM)
	INC	HL
	LD	(DIRNUM),HL
	JR	CPLOOP
CPDONE:
	CALL	DOSSEQ
	DB	16*2+1		; BDOS 16, destination FCB
	INC	A
	LD	DE,CPCLOSE
	JR	Z,CPFAIL
	LD	DE,CPCOPIED
	CALL	PUTSTR
	LD	A,(DIRNUM+1)
	CALL	CPHEX
	LD	A,(DIRNUM)
	CALL	CPHEX
	LD	DE,CRLFMSG
	JP	PRTGO
CPFAIL:
	JP	ERRGO

; One inline byte after CALL: BDOS function*2 + destination bit (0=CMDFCB,
; 1=RENFCB). Advance the return PC past it, preserving HL, B and A. BDOS owns
; DE/C and its normal result registers/flags. SRL changes incoming flags;
; BENTRY overwrites them with CP before any handler dispatch. No frame is
; added here; the READSRC terminal CALL/byte/RET holds one extra return word.
DOSSEQ:
	EX	(SP),HL
	LD	C,(HL)
	INC	HL
	EX	(SP),HL
	SRL	C
	LD	DE,CMDFCB
	JR	NC,DOSGO
	LD	DE,RENFCB
DOSGO:	JP	BDOS

; Print A as two hex digits by BDOS function 2, through console.asm's HEXHL.
; Destroys AF, BC, DE, HL.
CPHEX:	LD	HL,CPHEXC	; each digit through PUTCHAR
	JP	HEXHL
CPHEXC:	LD	E,A		; function 2 takes the character in E
	JP	PUTCHAR
