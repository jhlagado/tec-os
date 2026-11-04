; The BDOS's errors and console output: the error messages and their mode
; (function 45), the block check, and the console's characters, tabs, echo and
; ^P. Included after bdoslog.asm by rom.asm.

ERRTEXT:
	LD	A,(HL)
	OR	A
	RET	Z
	INC	HL
	PUSH	HL
	LD	C,A
	CALL	OUTCHAR
	POP	HL
	JR	ERRTEXT

BADSECT:
	LD	HL,ERRBAD
	LD	B,1		; disk I/O

; A BDOS error, the message at HL and its code in B, as function 45's mode
; says: returned to the program (FFh), said and returned (FEh), or said, a key
; waited for and the program ended with the rest of a chained line (default).
; A returned error leaves a chained line alone (KD-181).
BDERR:	LD	A,(ERRMODE)
	CP	$FE
	JR	C,BDDEF		; the default
	PUSH	BC
	CALL	Z,DISKMSG	; FEh: the message first
	POP	BC
	LD	H,B		; H = the code, A = L = FFh
	LD	L,$FF
	JP	RETWORD
BDDEF:	CALL	DISKMSG
	CALL	GETCHAR		; a key, then the program ends
	JP	CHDROP

; Reject corrupt allocation references before vector indexing or the 16-bit
; block-to-record shift. DE is the block; preserve it and HL/BC. IX identifies
; the current DPB on return. Invalid references follow the fatal I/O path.
CHKBLK:
	CALL	BLKPAST
	JR	C,BADSECT
	RET

; Carry if block DE is past the end of the current drive. Sets IX to its DPB.
BLKPAST:
	LD	IX,(DPBPTR)
	LD	A,(IX+5)
	CP	E
	LD	A,(IX+6)
	SBC	A,D
	RET

; The message at HL after "Bdos Err On X".
DISKMSG:
	PUSH	HL
	LD	HL,ERRHEAD
	CALL	ERRTEXT
	LD	A,(CURDRV)
	ADD	A,'A'
	LD	C,A
	CALL	OUTCHAR
	POP	HL
	JR	ERRTEXT

GETCHAR:
	LD	A,(PENDING)
	OR	A
	JP	Z,BIOCIN
	XOR	A
	LD	(PENDING),A
	LD	A,(PENDCHR)
	RET

CONSTAT:
	LD	A,(PENDING)
	OR	A
	RET	NZ
	JP	BIOCST

CONSTQ:
	LD	A,(PENDING)
	OR	A
	RET	NZ
	JP	BCONST

OUTCHAR:
	LD	A,C
	CP	TAB
	JR	NZ,OUTONE

TABLOOP:
	LD	C,SPACE
	CALL	OUTONE
	LD	A,(COLUMN)
	AND	7
	JR	NZ,TABLOOP
	RET

OUTONE:
	PUSH	BC
	CALL	CHKKEY
	POP	BC
	JR	ECHORAW

ECHOONE:
	PUSH	BC
	CALL	CONSTAT
	POP	BC

ECHORAW:
	CALL	BIOCOT
	LD	A,(LISTEN)
	OR	A
	CALL	NZ,BIOLST
	LD	A,C
	CP	CR
	JR	Z,COLZERO
	CP	BACKSP
	JR	Z,COLBACK
	CP	SPACE
	RET	C
	LD	A,(COLUMN)
	INC	A
	LD	(COLUMN),A
	RET

ECHOCHAR:
	LD	A,C
	CP	TAB
	JR	NZ,ECHOONE

ECHOTAB:
	LD	C,SPACE
	CALL	ECHOONE
	LD	A,(COLUMN)
	AND	7
	JR	NZ,ECHOTAB
	RET

COLZERO:
	XOR	A
	LD	(COLUMN),A
	RET

COLBACK:
	LD	A,(COLUMN)
	OR	A
	RET	Z
	DEC	A
	LD	(COLUMN),A
	RET

CHKKEY:
	CALL	CONSTQ		; TEC-OS: the check draws no cursor
	OR	A
	RET	Z
	CALL	GETCHAR
	CP	CTRLS
	JR	NZ,CHKPRN
	JP	GETCHAR

CHKPRN:
	CP	CTRLP
	JR	Z,TOGLIST
				; TEC-OS: any other key is kept for the next console read, as CP/M 2.2
				; does, so typing during output is not lost.
	LD	(PENDCHR),A
	LD	A,1
	LD	(PENDING),A
	RET

TOGLIST:
	LD	A,(LISTEN)
	XOR	1
	LD	(LISTEN),A
	RET

ERASE1:
	LD	C,BACKSP
	CALL	BIOCOT
	LD	C,SPACE
	CALL	BIOCOT
	LD	C,BACKSP
	CALL	BIOCOT
	JR	COLBACK
