; Portable CP/M Console Command Processor, CP/M 2.2 interface profile.
;
; This is an independent implementation against the public CP/M interfaces
; and reviewed black-box CCP fixtures. ATOM is its assembler.
;
; TEC-OS ROM-resident adaptation (see PROVENANCE.md). The code and text are in
; ROM; the command buffers, scratch FCBs and stack are in src/ram.asm. The transient ceiling is the page of the BDOS entry jump
; (the byte at 0007h), rather than the CCP origin.

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
; A: instead, and the prompt's 0004h then says so.
CCPENT:
	LD	SP,CSTKTOP
	LD	A,C
	AND	$0F
	CP	MAXDRV
	JR	NC,CCPDA
	LD	E,A
	LD	D,0
	LD	HL,DRVIDX
	ADD	HL,DE
	LD	A,(HL)		; its volume's index + 1, 0 for none
	OR	A
	LD	A,E
	JR	NZ,CCPDR
CCPDA:	XOR	A
CCPDR:	LD	(BOOTDRV),A
	LD	A,C
	RRCA
	RRCA
	RRCA
	RRCA
	AND	$0F
	PUSH	AF
	LD	HL,WRFLAG	; the reset that keeps unchanged drives logged
	LD	(HL),$FF
	LD	C,13
	CALL	BDOS
	POP	AF
	LD	E,A
	LD	C,32
	CALL	BDOS
	CALL	STBOOT		; once after cold boot
	LD	A,(BOOTDRV)
	OR	A
	JR	Z,STARTED
	LD	E,A
	LD	C,14
	CALL	BDOS

STARTED:
	LD	DE,CRLFMSG
	CALL	PUTSTR

MAINLOOP:
	LD	SP,CSTKTOP
MLREAD:	CALL	SAVEDU
	PUSH	AF		; the user first, as CP/M 3 does, unless 0:
	LD	A,B		; 3A>
	RRCA
	RRCA
	RRCA
	RRCA
	OR	A
	JR	Z,MLDRV
	LD	L,A
	LD	H,0
	CALL	PUTDEC
MLDRV:	POP	AF
	ADD	A,'A'
	LD	E,A
	CALL	PUTCHAR
	LD	E,'>'
	CALL	PUTCHAR
	CALL	CHSKIP		; a chained line's next piece, before all else
	JR	NZ,MLECHO
	LD	(CHPOS),A	; none: A = 0
	CALL	STLINE		; startup's next line
	CCF			; STFLAG: FFh a line from the file, 0 a
	SBC	A,A		; typed one; a chained piece keeps it
	LD	(STFLAG),A
	JR	NZ,MLGOT
	LD	DE,CMDBUF
	LD	HL,HFLAG	; history for this line
	LD	(HL),$FF
	LD	C,10
	CALL	BDOS

; A line, typed or startup's, CMDLEN long in CMDTXT: a 0 after it, and its
; first piece taken as a chained line's would be.
MLGOT:	LD	HL,CMDLEN
	LD	E,(HL)
	LD	D,0
	INC	HL
	ADD	HL,DE
	LD	(HL),D
	LD	HL,CMDTXT	; CHPOS was cleared before acquiring this line
	CALL	CHSK1
	JR	Z,STARTED	; nothing but spaces and !
	JR	MLTAKE

; A chained piece, echoed as STLINE echoes a line, up to its ! or the end.
MLECHO:	PUSH	HL
MLEC1:	LD	A,(HL)
	OR	A
	JR	Z,MLEC2
	CP	'!'
	JR	Z,MLEC2
	LD	E,A
	CALL	PUTCHAR
	INC	HL
	JR	MLEC1
MLEC2:	POP	HL

; Take the piece at HL. One that starts with : runs only if the last
; command succeeded: its code, function 108's, is not FF00h to FFFEh; after a
; failure the rest of the line goes. Then upper case up to its ! or the
; line's end, the ! made its end and CHPOS the next piece's, or 0 at the end,
; and the code cleared, before the command is looked for. ARGSTRT holds it.
MLTAKE:	LD	A,(HL)
	CP	':'
	JR	NZ,MLTK0
	LD	DE,(PRGCODE)
	LD	A,D
	INC	A
	JR	NZ,MLTKC	; below FF00h
	LD	A,E
	INC	A
	JR	Z,MLTKC		; FFFFh
	XOR	A		; failed: the rest of the line dropped
	LD	(CHPOS),A
	JP	STARTED
MLTKC:	INC	HL
MLTK0:	LD	(ARGSTRT),HL
MLTK1:	LD	A,(HL)
	OR	A
	JR	Z,MLTK3		; the line's end: CHPOS 0
	CP	'!'
	JR	Z,MLTK2
	CP	'a'
	JR	C,MLTKN
	CP	'z'+1
	JR	NC,MLTKN
	AND	$DF
	LD	(HL),A
MLTKN:	INC	HL
	JR	MLTK1
MLTK2:	LD	(HL),0
	INC	HL
	LD	A,L
	SUB	LOW(CMDTXT-1)
MLTK3:	LD	(CHPOS),A
	LD	HL,0
	LD	(PRGCODE),HL
	LD	HL,(ARGSTRT)
	CALL	SKIPSP
	OR	A
	JP	Z,STARTED	; a : and nothing after it
	CP	'A'
	JR	C,NOTDRIVE
	CP	'P'+1
	JR	NC,NOTDRIVE
	LD	B,A
	INC	HL
	LD	A,(HL)
	CP	':'
	JR	NZ,NOTDRIVE
	INC	HL
	CALL	SKIPSP
	LD	A,(HL)
	OR	A
	JR	NZ,NOTDRIVE
	LD	A,B
	SUB	'A'
	LD	(BOOTDRV),A
	LD	E,A
	LD	C,14
	CALL	BDOS
	CALL	SAVEDU
	JP	STARTED

; HL = a chained line's next piece, past spaces and !, from CHPOS; A its
; first character, with Z when none is left (A = 0). Destroys DE.
CHSKIP:	LD	A,(CHPOS)
	OR	A
	RET	Z
	LD	E,A
	LD	D,0
	LD	HL,CMDTXT-1
	ADD	HL,DE
CHSK1:	LD	A,(HL)
	CP	SPACE
	JR	Z,CHSK2
	CP	'!'
	JR	NZ,CHSK3
CHSK2:	INC	HL
	JR	CHSK1
CHSK3:	OR	A
	RET

; Record the current user and drive in the page-zero byte at $0004 so a warm
; boot restores both. Returns the drive in A.
SAVEDU:
	LD	E,$FF
	LD	C,32
	CALL	BDOS
	ADD	A,A
	ADD	A,A
	ADD	A,A
	ADD	A,A
	LD	B,A
	PUSH	BC
	LD	C,25
	CALL	BDOS
	POP	BC
	LD	C,A
	OR	B
	LD	(CURDSK),A
	LD	A,C
	RET

NOTDRIVE:
	LD	DE,CRLFMSG
	CALL	PUTSTR
	LD	HL,(ARGSTRT)	; the piece
	CALL	CMDSKIP
	CALL	CMDPARSE
	LD	(ARGSTRT),HL
	LD	DE,KEYTAB	; the built-in commands' words
KEYNXT:	CALL	ISCMD		; DE at the mismatch or the word's 0
	EX	DE,HL		; skip only the unmatched suffix
	JR	NZ,KEYSK
	INC	HL
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
	EX	DE,HL
	LD	A,(DE)
	OR	A
	JR	NZ,KEYNXT	; another word; a 0 ends the table
	LD	DE,CMDFCB
	CALL	UNAMBIG
	JP	C,BADCMD
	LD	HL,(CMDFCB+9)	; NAME.SVC installs
	LD	DE,'V'*256+'S'
	SBC	HL,DE
	JR	NZ,CMDCOM
	LD	A,(CMDFCB+11)
	CP	'C'
	JR	NZ,CMDCOM
	CALL	SVCGO
	JR	NC,SVCOK
	LD	HL,(SVCRC)	; L = SVCRC, H = SVCRA: an INIT that
	LD	A,(STFLAG)	; found its device absent, in a line from
	AND	H		; STARTUP.CMD, is quiet, and PRGCODE stays
	XOR	TNENODV		; 0, so a : line after it runs (KD-173);
	DEC	L		; typed, or for any other cause, it says
	OR	L		; NAME? as before
	JR	NZ,BADCMD
SVCOK:	JP	STARTED
CMDCOM:	LD	A,'C'
	LD	(CMDFCB+9),A
	LD	A,'O'
	LD	(CMDFCB+10),A
	LD	A,'M'
	LD	(CMDFCB+11),A
	CALL	LOADA		; the named or current drive: user, user 0
	JR	NC,CMDRUN
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
	JR	C,BADCMD
CMDRUN:	CALL	PREPPAGE
	LD	A,(CMDFCB)	; the drive the program came from, as
	LD	(PZLDRV),A	; CP/M 3 keeps it: 0 the current, 1 A:
				; Keep the return word outside default DMA ($0080..$00FF). The
				; resident stack supplies 28 free bytes beneath this two-byte word.
	LD	SP,CSTKTOP
	LD	HL,WBOOT
	PUSH	HL
	JP	TPA

; An argument: from ARGSTRT, or from HL at CMDSKIP, past its spaces, noted
; for an error. A holds its first character, with Z at the end of the line.
ARGSKIP:
	LD	HL,(ARGSTRT)
CMDSKIP:
	CALL	SKIPSP
	LD	(CMDSTRT),HL
	OR	A
	RET

; One unambiguous name at HL into CMDFCB, and nothing after it.
ONENAME:
	CALL	CMDPARSE
	CALL	CPCHK
; A bad command unless only spaces are left. B is kept.
ENDCHK:
	CALL	SKIPSP
	OR	A
	RET	Z
	JR	BADCMD

; The name at HL into CMDFCB, or into the FCB at DE, or a bad command.
CMDPARSE:
	LD	DE,CMDFCB
FCBPARSE:
	CALL	PARSEFCB
	RET	NC
BADCMD:
	LD	HL,(CMDSTRT)

BADLOOP:
	LD	A,(HL)
	OR	A
	JR	Z,BADEND
	CP	SPACE
	JR	Z,BADEND
	LD	E,A
	CALL	PUTCHAR
	INC	HL
	JR	BADLOOP

BADEND:
	LD	E,'?'
	CALL	PUTCHAR
	LD	DE,CRLFMSG
; A command's error message at DE: the code FF00h, a failure for a piece
; that starts with :, then the message and the prompt.
ERRGO:	LD	HL,RCFAIL
	LD	(PRGCODE),HL
PRTGO:
	CALL	PUTSTR
	JP	STARTED

; LOADA: LOADCOM on CMDFCB's drive, in the current user and then, if it
; isn't there and the user isn't 0, in user 0 (A7): no SYS attribute needed.
; The user is put back before it returns. Carry as LOADCOM's: Z for not found.
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
	CALL	LOADCOM
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

; Load an ordinary COM image through the public BDOS FCB/DMA interface.
; Carry reports missing, unreadable, or oversized input.
LOADCOM:
	CALL	DOSSEQ
	DB	15*2+0		; BDOS 15, source FCB
	INC	A
	SCF
	RET	Z
	LD	HL,TPA

LOADLOOP:
	LD	A,(PZBDOS+2)	; up to the BDOS entry's page
	CP	H
	JR	Z,LOADLIM
	PUSH	HL
	EX	DE,HL
	CALL	READSRC
	POP	HL
	OR	A
	JR	NZ,LOADEND
	LD	DE,128
	ADD	HL,DE
	JR	LOADLOOP

; One scratch read distinguishes an exact-TPA image from an oversized image
; without allowing a further record to overwrite the resident CCP.
LOADLIM:
	PUSH	HL
	LD	DE,LOADBUF
	CALL	READSRC
	POP	HL
	CP	1
	JR	Z,LOADOK
	SCF
	RET

LOADEND:
	CP	1
	JR	NZ,LOADBAD

LOADOK:
	LD	(LOADTOP),HL	; retain record-rounded extent before CLOSE
	CALL	DOSSEQ
	DB	16*2+0		; BDOS 16, source FCB
	OR	A
	RET

LOADBAD:
	SCF
	RET

; DE is the next record's DMA address. Set DMA, then read the source FCB.
; Each BDOS call holds this helper's return word plus its own return word.
READSRC:
	LD	C,26
	CALL	BDOS
	CALL	DOSSEQ
	DB	20*2+0		; BDOS 20, source FCB
	RET
