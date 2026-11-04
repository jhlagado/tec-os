; Portable CP/M Console Command Processor, CP/M 2.2 interface profile.
;
; This is an independent implementation against the public CP/M interfaces
; and reviewed black-box CCP fixtures. ATOM is its assembler.
;
; TEC-OS ROM-resident adaptation (see PROVENANCE.md). The code and text are in
; ROM; the command buffers, scratch FCBs and stack are in src/ram.asm. The
; transient ceiling is the page of the BDOS entry jump (the byte at 0007h),
; rather than the CCP origin.

CCPBAS:

BDOS	EQU	$0005
WBOOT	EQU	$0000
CURDSK	EQU	$0004
FCBONE	EQU	$005C
FCBTWO	EQU	$006C
CMDTAIL	EQU	$0080
TPA	EQU	$0100
RCFAIL	EQU	255*256		; FF00h, function 108's code for a failure


; Cold and warm boot both enter here with C holding the CP/M 2.2 page-zero
; byte: user number in bits 4-7, drive in bits 0-3. The BIOS has just reset
; the BDOS state, so rebuild the disk state and restore both before prompting.
; TEC-OS: a drive with no volume, unmounted or past D:, cannot be selected,
; and its Select error would warm boot back here to fail again; the CCP takes
; A: instead, and the prompt's 0004h then says so. It never returns.
CCPENT:
	LD	SP,CSTKTOP	; the CCP's own stack, in RAM
	LD	A,C
	AND	$0F		; the drive, 0 for A:
	CP	MAXDRV
	JR	NC,CCPDA	; beyond D:, A: instead
	LD	E,A
	LD	D,0
	LD	HL,DRVIDX	; the drive's entry in the volume table
	ADD	HL,DE
	LD	A,(HL)		; its volume's index + 1, 0 for none
	OR	A
	LD	A,E		; the drive again, the flags kept
	JR	NZ,CCPDR	; it has a volume: it stays
CCPDA:	XOR	A		; no volume: A:
CCPDR:	LD	(BOOTDRV),A	; the drive to select after the reset
	LD	A,C
	RRCA			; the user, bits 4-7 to bits 0-3
	RRCA
	RRCA
	RRCA
	AND	$0F
	PUSH	AF		; kept across the reset
	LD	HL,WRFLAG	; the reset that keeps unchanged drives logged
	LD	(HL),$FF
	LD	C,13		; BDOS 13: reset the disks, A: selected
	CALL	BDOS
	POP	AF
	LD	E,A
	LD	C,32		; BDOS 32: the user set again
	CALL	BDOS
	CALL	STBOOT		; once after cold boot
	LD	A,(BOOTDRV)
	OR	A
	JR	Z,STARTED	; A:, selected by the reset already
	LD	E,A
	LD	C,14		; BDOS 14: select the drive
	CALL	BDOS

; A new line and then the prompt: every command, error and empty line ends
; here.
STARTED:
	LD	DE,CRLFMSG	; the prompt on a line of its own
	CALL	PUTSTR

; The command loop: the stack reset, the prompt (MLREAD), then the next
; line: a chained line's next piece first, then startup's next line, and
; only then one typed at the console.
MAINLOOP:
	LD	SP,CSTKTOP	; a command's leftover stack dropped
MLREAD:	CALL	SAVEDU		; A the drive, B the user in bits 4-7
	PUSH	AF		; the user first, as CP/M 3 does, unless 0:
	LD	A,B		; 3A>
	RRCA			; the user to bits 0-3
	RRCA
	RRCA
	RRCA
	OR	A
	JR	Z,MLDRV		; user 0: the drive alone
	LD	L,A
	LD	H,0
	CALL	PUTDEC		; the user in decimal
MLDRV:	POP	AF
	ADD	A,'A'		; the drive's letter
	LD	E,A
	CALL	PUTCHAR
	LD	E,'>'
	CALL	PUTCHAR		; and the prompt's >
	CALL	CHSKIP		; a chained line's next piece, before all else
	JR	NZ,MLECHO	; there is one: echo it
	LD	(CHPOS),A	; none: A = 0
	CALL	STLINE		; startup's next line
	CCF			; STFLAG: FFh a line from the file, 0 a
	SBC	A,A		; typed one; a chained piece keeps it
	LD	(STFLAG),A
	JR	NZ,MLGOT	; startup's line, in CMDBUF already
	LD	DE,CMDBUF
	LD	HL,HFLAG	; history for this line
	LD	(HL),$FF
	LD	C,10		; BDOS 10: a line typed into CMDBUF
	CALL	BDOS

; A line, typed or startup's, CMDLEN long in CMDTXT: a 0 after it, and its
; first piece taken as a chained line's would be.
MLGOT:	LD	HL,CMDLEN
	LD	E,(HL)		; the line's length
	LD	D,0
	INC	HL
	ADD	HL,DE		; just past its last character
	LD	(HL),D		; the 0 that ends it
	LD	HL,CMDTXT	; CHPOS was cleared before acquiring this line
	CALL	CHSK1
	JR	Z,STARTED	; nothing but spaces and !
	JR	MLTAKE		; HL at the first piece

; A chained piece, echoed as STLINE echoes a line, up to its ! or the end.
MLECHO:	PUSH	HL		; the piece's start, kept
MLEC1:	LD	A,(HL)
	OR	A
	JR	Z,MLEC2		; the line's end
	CP	'!'
	JR	Z,MLEC2		; or the piece's
	LD	E,A
	CALL	PUTCHAR		; each character echoed
	INC	HL
	JR	MLEC1
MLEC2:	POP	HL		; HL back at the piece's start

; Take the piece at HL. One that starts with : runs only if the last
; command succeeded: its code, function 108's, is not FF00h to FFFEh; after a
; failure the rest of the line goes. Then upper case up to its ! or the
; line's end, the ! made its end and CHPOS the next piece's, or 0 at the end,
; and the code cleared, before the command is looked for. ARGSTRT holds it.
; A piece that is only a drive, B:, selects it; any other is a command.
MLTAKE:	LD	A,(HL)
	CP	':'
	JR	NZ,MLTK0	; no :, so it runs
	LD	DE,(PRGCODE)	; the last command's code
	LD	A,D
	INC	A
	JR	NZ,MLTKC	; below FF00h
	LD	A,E
	INC	A
	JR	Z,MLTKC		; FFFFh
	XOR	A		; failed: the rest of the line dropped
	LD	(CHPOS),A
	JP	STARTED
MLTKC:	INC	HL		; past the :
MLTK0:	LD	(ARGSTRT),HL
MLTK1:	LD	A,(HL)
	OR	A
	JR	Z,MLTK3		; the line's end: CHPOS 0
	CP	'!'
	JR	Z,MLTK2		; the piece's end
	CP	'a'
	JR	C,MLTKN		; below a: kept as it is
	CP	'z'+1
	JR	NC,MLTKN	; past z: kept as it is
	AND	$DF		; a to z made upper case
	LD	(HL),A
MLTKN:	INC	HL
	JR	MLTK1
MLTK2:	LD	(HL),0		; the ! made the piece's end
	INC	HL
	LD	A,L		; the next piece's offset in CMDTXT
	SUB	LOW(CMDTXT-1)	; plus 1, from the low bytes alone
MLTK3:	LD	(CHPOS),A
	LD	HL,0		; the code cleared: 0, a success
	LD	(PRGCODE),HL
	LD	HL,(ARGSTRT)
	CALL	SKIPSP		; A the piece's first character
	OR	A
	JP	Z,STARTED	; a : and nothing after it
	CP	'A'
	JR	C,NOTDRIVE	; not a drive's letter: a command
	CP	'P'+1
	JR	NC,NOTDRIVE
	LD	B,A		; a letter A to P, kept
	INC	HL
	LD	A,(HL)
	CP	':'
	JR	NZ,NOTDRIVE	; with no : after it
	INC	HL
	CALL	SKIPSP
	LD	A,(HL)
	OR	A
	JR	NZ,NOTDRIVE	; more after it, as in B:NAME
	LD	A,B
	SUB	'A'		; the drive, 0 for A:
	LD	(BOOTDRV),A
	LD	E,A
	LD	C,14		; BDOS 14: select it
	CALL	BDOS
	CALL	SAVEDU		; and note it in page zero
	JP	STARTED

; HL = a chained line's next piece, past spaces and !, from CHPOS; A its
; first character, with Z when none is left (A = 0). CHSK1 does the same
; from HL. Destroys DE.
CHSKIP:	LD	A,(CHPOS)
	OR	A
	RET	Z		; no piece left: Z, A = 0
	LD	E,A
	LD	D,0
	LD	HL,CMDTXT-1	; CHPOS counts from 1
	ADD	HL,DE
CHSK1:	LD	A,(HL)
	CP	SPACE
	JR	Z,CHSK2		; spaces passed over,
	CP	'!'
	JR	NZ,CHSK3	; and empty pieces' !
CHSK2:	INC	HL
	JR	CHSK1
CHSK3:	OR	A		; Z for the line's end
	RET

; Record the current user and drive in the page-zero byte at 0004h so a warm
; boot restores both. Returns the drive in A and C, and the user in bits 4-7
; of B. Destroys DE and HL, through the BDOS.
SAVEDU:
	LD	E,$FF
	LD	C,32		; BDOS 32 with FFh: get the user
	CALL	BDOS
	ADD	A,A		; the user to bits 4-7
	ADD	A,A
	ADD	A,A
	ADD	A,A
	LD	B,A
	PUSH	BC		; kept across the next call
	LD	C,25		; BDOS 25: get the current drive
	CALL	BDOS
	POP	BC
	LD	C,A		; the drive kept
	OR	B
	LD	(CURDSK),A	; user and drive, in page zero's form
	LD	A,C
	RET

; A command: the piece from ARGSTRT, upper case and ending in a 0. A built-in
; command's word runs its handler, NAME.SVC installs a service, and any other
; name loads as NAME.COM and runs at 0100h: from the drive named, or from the
; current drive and then A:, each in the current user and then user 0.
NOTDRIVE:
	LD	DE,CRLFMSG	; the command's output on a new line
	CALL	PUTSTR
	LD	HL,(ARGSTRT)	; the piece
	CALL	CMDSKIP		; past spaces, noted for an error
	CALL	CMDPARSE	; its first word into CMDFCB
	LD	(ARGSTRT),HL	; the arguments start after it
	LD	DE,KEYTAB	; the built-in commands' words
KEYNXT:	CALL	ISCMD		; DE at the mismatch or the word's 0
	EX	DE,HL		; skip only the unmatched suffix
	JR	NZ,KEYSK	; not this word
	INC	HL		; a match: past the word's 0
	LD	A,(HL)		; the handler's address, low byte first
	INC	HL
	LD	H,(HL)
	LD	L,A
	JP	(HL)		; it takes the line from ARGSTRT itself
KEYSK:	LD	A,(HL)		; past the word and its 0,
	INC	HL
	OR	A
	JR	NZ,KEYSK
	INC	HL		; and its handler
	INC	HL
	EX	DE,HL		; DE at the next word
	LD	A,(DE)
	OR	A
	JR	NZ,KEYNXT	; another word; a 0 ends the table
	LD	DE,CMDFCB
	CALL	UNAMBIG		; no word matched: a file's name
	JP	C,BADCMD	; empty, or with a wildcard
	LD	HL,(CMDFCB+9)	; NAME.SVC installs
	LD	DE,'V'*256+'S'	; the type's S and V, low byte first
	SBC	HL,DE		; carry clear from UNAMBIG
	JR	NZ,CMDCOM	; type not SV?: a program
	LD	A,(CMDFCB+11)
	CP	'C'
	JR	NZ,CMDCOM
	CALL	SVCGO		; read and install the service
	JR	NC,SVCOK
	LD	HL,(SVCRC)	; L = SVCRC, H = SVCRA: an INIT that
	LD	A,(STFLAG)	; found its device absent, in a line from
	AND	H		; STARTUP.CMD, is quiet, and PRGCODE stays
	XOR	TNENODV		; 0, so a : line after it runs (KD-173);
	DEC	L		; typed, or for any other cause, it says
	OR	L		; NAME? as before
	JR	NZ,BADCMD
SVCOK:	JP	STARTED		; installed, or quietly absent
CMDCOM:	LD	A,'C'		; a program: the type given, if any,
	LD	(CMDFCB+9),A
	LD	A,'O'
	LD	(CMDFCB+10),A
	LD	A,'M'
	LD	(CMDFCB+11),A	; made COM
	CALL	LOADA		; the named or current drive: user, user 0
	JR	NC,CMDRUN	; loaded
	JR	NZ,BADCMD	; there, but it would not load
	LD	HL,CMDFCB	; not here: A:'s, if no drive was named
	LD	A,(HL)
	OR	A
	JR	NZ,BADCMD	; B:NAME looks on B: only
	LD	A,(PZDU)	; and the current drive isn't A:
	AND	$0F
	JR	Z,BADCMD
	INC	(HL)		; the FCB's drive 1, A:
	CALL	LOADA		; its current user, then user 0
	JR	C,BADCMD	; not on A: either, or unloadable
CMDRUN:	CALL	PREPPAGE	; its FCBs, tail and DMA in page zero
	LD	A,(CMDFCB)	; the drive the program came from, as
	LD	(PZLDRV),A	; CP/M 3 keeps it: 0 the current, 1 A:
				; Keep the return word outside default DMA
				; ($0080..$00FF). The resident stack has
				; 30 bytes free beneath this two-byte word.
	LD	SP,CSTKTOP
	LD	HL,WBOOT	; the program's last RET warm boots
	PUSH	HL
	JP	TPA		; and the program runs

; An argument: from ARGSTRT, or from HL at CMDSKIP, past its spaces, noted
; for an error. HL is at it and A holds its first character, with Z at the
; end of the line.
ARGSKIP:
	LD	HL,(ARGSTRT)
CMDSKIP:
	CALL	SKIPSP
	LD	(CMDSTRT),HL	; where an error's echo starts
	OR	A		; Z for the line's end
	RET

; One unambiguous name at HL into CMDFCB, and nothing after it.
ONENAME:
	CALL	CMDPARSE
	CALL	CPCHK		; a bad command if empty or ambiguous
; A bad command unless only spaces are left. B is kept.
ENDCHK:
	CALL	SKIPSP
	OR	A
	RET	Z		; nothing more: the command is good
	JR	BADCMD

; The name at HL into CMDFCB, or at FCBPARSE into the FCB at DE, HL left at
; its delimiter, or a bad command. BADCMD: the word from CMDSTRT echoed with
; a ?, the code a failure, and the prompt again.
CMDPARSE:
	LD	DE,CMDFCB
FCBPARSE:
	CALL	PARSEFCB
	RET	NC		; a good name
BADCMD:
	LD	HL,(CMDSTRT)	; the word that failed
BADLOOP:
	LD	A,(HL)
	OR	A
	JR	Z,BADEND	; echoed up to the line's end
	CP	SPACE
	JR	Z,BADEND	; or a space
	LD	E,A
	CALL	PUTCHAR		; each character
	INC	HL
	JR	BADLOOP
BADEND:
	LD	E,'?'		; then a ?, as CP/M's NAME?
	CALL	PUTCHAR
	LD	DE,CRLFMSG	; and the new line as the message
; A command's error message at DE: the code FF00h, a failure for a piece
; that starts with :, then the message and the prompt. PRTGO: the message
; and the prompt, the code as it is.
ERRGO:	LD	HL,RCFAIL
	LD	(PRGCODE),HL	; a : piece after this one does not run
PRTGO:
	CALL	PUTSTR		; the message, ending in $
	JP	STARTED

; LOADA: LOADCOM on CMDFCB's drive, in the current user and then, if it
; isn't there and the user isn't 0, in user 0 (A7): no SYS attribute needed.
; The user is put back before it returns. Carry as LOADCOM's: Z for not found.
; Destroys BC, DE and HL.
LOADA:	CALL	LOADCOM
	RET	NC		; loaded in the current user
	RET	NZ		; there, but it would not load
	LD	A,(PZDU)	; the user, in the high nibble
	AND	$F0
	SCF
	RET	Z		; user 0 already: not found
	PUSH	AF
	LD	E,0		; BDOS function 32: user 0
	LD	C,32
	CALL	BDOS
	CALL	LOADCOM		; the same file again, in user 0
	POP	BC		; B = the user in the high nibble
	PUSH	AF		; LOADCOM's result, across the restore
	LD	A,B
	RRCA			; the user back to bits 0-3
	RRCA
	RRCA
	RRCA
	LD	E,A		; and back into the BDOS
	LD	C,32
	CALL	BDOS
	POP	AF
	RET

; Load an ordinary COM image through the public BDOS FCB/DMA interface: the
; file in CMDFCB, a record at a time from 0100h up to the BDOS entry's page.
; Carry reports missing, unreadable, or oversized input, with Z for missing
; only. Once loaded, LOADTOP holds the end of the last record read. Destroys
; BC, DE and HL.
LOADCOM:
	CALL	DOSSEQ		; the BDOS, by the byte after the call
	DB	15*2+0		; BDOS 15: open the file in CMDFCB
	INC	A		; FFh: no such file
	SCF
	RET	Z		; missing: carry and Z
	LD	HL,TPA		; the first record's address
LOADLOOP:
	LD	A,(PZBDOS+2)	; up to the BDOS entry's page
	CP	H
	JR	Z,LOADLIM	; full: one read more tells
	PUSH	HL
	EX	DE,HL		; DE the record's address
	CALL	READSRC
	POP	HL
	OR	A
	JR	NZ,LOADEND	; 1 the file's end, else an error
	LD	DE,128
	ADD	HL,DE		; the next record's address
	JR	LOADLOOP

; One scratch read distinguishes an exact-TPA image from an oversized image
; without allowing a further record to overwrite the RAM above the TPA.
; Carry set unless that read finds the file's end.
LOADLIM:
	PUSH	HL
	LD	DE,LOADBUF	; into scratch, past the ceiling
	CALL	READSRC
	POP	HL
	CP	1
	JR	Z,LOADOK	; the file's end: it fitted exactly
	SCF			; a record more, or an error: too big
	RET

; The read stopped short of the ceiling: code 1, the file's end, is a load
; and any other a read error.
LOADEND:
	CP	1
	JR	NZ,LOADBAD	; a read error

; Loaded: HL, the end of the last record read, kept in LOADTOP, and the file
; closed. Carry clear.
LOADOK:
	LD	(LOADTOP),HL	; retain record-rounded extent before CLOSE
	CALL	DOSSEQ		; the BDOS, by the byte after the call
	DB	16*2+0		; BDOS 16: close CMDFCB's file
	OR	A		; carry clear, the close's code unread
	RET

; A read error: carry set, with NZ from LOADEND's compare.
LOADBAD:
	SCF
	RET

; DE is the next record's DMA address. Set DMA, then read the source FCB.
; Each BDOS call holds this helper's return word plus its own return word.
; A returns 0 for a record read, 1 at the file's end, otherwise an error.
READSRC:
	LD	C,26		; BDOS 26: the DMA address at DE
	CALL	BDOS
	CALL	DOSSEQ		; the BDOS, by the byte after the call
	DB	20*2+0		; BDOS 20: read CMDFCB's next record
	RET
