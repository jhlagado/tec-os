; The BDOS's errors and console output: the error messages and their mode
; (function 45), the block check, and the console's characters, tabs, echo and
; ^P. Included after bdoslog.asm by rom.asm.

; The zero-ended text at HL to the console, through OUTCHAR, so a tab is
; expanded and ^S and ^P are taken. Returns HL at the 0. Changes A, C and
; what OUTCHAR changes.
ERRTEXT:
	LD	A,(HL)		; the next character
	OR	A
	RET	Z		; the 0: the text's end
	INC	HL
	PUSH	HL		; the place, kept over the output
	LD	C,A
	CALL	OUTCHAR
	POP	HL
	JR	ERRTEXT

; BDOS error 1, ": Bad Sector", for a disk read or write that failed or a
; block reference past the drive's end; it falls into BDERR.
BADSECT:
	LD	HL,ERRBAD	; its message
	LD	B,1		; disk I/O

; A BDOS error, the message at HL and its code in B, as function 45's mode
; says: returned to the program (FFh), said and returned (FEh), or said, a key
; waited for and the program ended with the rest of a chained line (default).
; A returned error leaves a chained line alone (KD-181). It never returns to
; its caller: RETWORD gives the program A = L = FFh and B = H = the code.
BDERR:	LD	A,(ERRMODE)	; function 45's mode
	CP	$FE		; FEh or FFh: the error returned
	JR	C,BDDEF		; the default
	PUSH	BC		; the code, kept over the message
	CALL	Z,DISKMSG	; FEh: the message first
	POP	BC
	LD	H,B		; H = the code, A = L = FFh
	LD	L,$FF
	JP	RETWORD
BDDEF:	CALL	DISKMSG
	CALL	GETCHAR		; a key, then the program ends
	JP	CHDROP		; with the rest of a chained line

; Reject corrupt allocation references before vector indexing or the 16-bit
; block-to-record shift. DE is the block; preserve it and HL/BC. IX identifies
; the current DPB on return. Invalid references take BADSECT's error 1.
CHKBLK:
	CALL	BLKPAST		; carry if past the end; IX = the DPB
	JR	C,BADSECT	; past the drive's end: error 1
	RET

; Carry if block DE is past the end of the current drive. Sets IX to its DPB.
; Changes A; keeps BC, DE and HL.
BLKPAST:
	LD	IX,(DPBPTR)
	LD	A,(IX+5)	; DSM, the drive's last block,
	CP	E		; less DE: carry if DE is past it
	LD	A,(IX+6)	; its high byte
	SBC	A,D
	RET

; The message at HL after "Bdos Err On X", on a new line, X the current
; drive (CURDRV). Changes A, C, HL and what OUTCHAR changes.
DISKMSG:
	PUSH	HL		; the message, kept
	LD	HL,ERRHEAD	; CR, LF and "Bdos Err On "
	CALL	ERRTEXT
	LD	A,(CURDRV)	; the drive's letter
	ADD	A,'A'		; drive 0 is A
	LD	C,A
	CALL	OUTCHAR
	POP	HL
	JR	ERRTEXT		; then the message

; The next key, in A, not echoed: one a status check read and kept
; (PENDING), or else the BIOS's console input, which waits for one. Changes
; A and what the BIOS's input changes.
GETCHAR:
	LD	A,(PENDING)	; a key kept by a status check?
	OR	A
	JP	Z,BIOCIN	; none kept: wait for one
	XOR	A		; the kept key, taken
	LD	(PENDING),A
	LD	A,(PENDCHR)
	RET

; A not 0 if a key is ready: one kept (A = 1), or one the BIOS's console
; status sees through the RAM jump table (FFh). Changes A and what the
; BIOS's status changes.
CONSTAT:
	LD	A,(PENDING)	; 1 with a key kept
	OR	A
	RET	NZ
	JP	BIOCST		; else the BIOS's FFh or 0

; As CONSTAT, but through the ROM's BCONST, not the RAM jump table, so that
; no cursor is drawn: the check made during output.
CONSTQ:
	LD	A,(PENDING)	; 1 with a key kept
	OR	A
	RET	NZ
	JP	BCONST		; else FFh or 0, no cursor drawn

; The character in C to the console as functions 2 and 9 send it: a tab as
; spaces to the next column that is a multiple of 8, and before each
; character a key waiting is taken (OUTONE). Changes A, C and what the
; BIOS's calls change.
OUTCHAR:
	LD	A,C
	CP	TAB
	JR	NZ,OUTONE	; not a tab: as it is
TABLOOP:
	LD	C,SPACE		; a tab: spaces to a multiple of 8
	CALL	OUTONE
	LD	A,(COLUMN)	; as ECHORAW has moved it on
	AND	7
	JR	NZ,TABLOOP	; not yet at a tab stop
	RET

; One character, C, to the console with no tab expanded: a key waiting is
; taken first (CHKKEY: ^S pauses, ^P turns the printer echo on or off, any
; other is kept), then ECHORAW sends it.
OUTONE:
	PUSH	BC		; the character, kept over the key check
	CALL	CHKKEY		; ^S, ^P or a key kept
	POP	BC
	JR	ECHORAW

; One character, C, echoed with no tab expanded and no key taken: the
; console's status is asked first (CONSTAT), its answer unused. It falls
; into ECHORAW.
ECHOONE:
	PUSH	BC		; the character, kept over the status
	CALL	CONSTAT		; the status, its answer unused
	POP	BC

; The character in C to the printer while ^P's echo is on, then to the
; console as it is. COLUMN is moved for it first (ECHOCOL), so nothing needs
; C after a BIOS call: a CONOUT or LIST put in the RAM jump table need not
; keep it, as CP/M 2.2's need not. Changes A, C and what the BIOS's calls
; change.
ECHORAW:
	CALL	ECHOCOL		; COLUMN moved for C
	LD	A,(LISTEN)	; 1 while ^P's echo is on
	OR	A
	JR	Z,ECHOCON	; off: the console alone
	PUSH	BC		; the character, kept over the printer
	CALL	BIOLST
	POP	BC
ECHOCON:
	JP	BIOCOT		; the console, through the RAM jump table

; COLUMN moved for the character in C: 0 after CR, back one after BS, on one
; after a character from a space up, unchanged after another control.
; Changes A; keeps C.
ECHOCOL:
	LD	A,C		; the column it leaves
	CP	CR
	JR	Z,COLZERO	; CR: column 0
	CP	BACKSP
	JR	Z,COLBACK	; BS: back one
	CP	SPACE
	RET	C		; another control: no column
	LD	A,(COLUMN)	; a character shown: on one
	INC	A
	LD	(COLUMN),A
	RET

; The character in C echoed, as line input and function 1 echo it: a tab as
; spaces to the next multiple of 8, any other through ECHOONE. No key is
; taken. Changes A, C and what the BIOS's calls change.
ECHOCHAR:
	LD	A,C
	CP	TAB
	JR	NZ,ECHOONE	; not a tab: as it is
ECHOTAB:
	LD	C,SPACE		; a tab: spaces to a multiple of 8
	CALL	ECHOONE
	LD	A,(COLUMN)	; as ECHORAW has moved it on
	AND	7
	JR	NZ,ECHOTAB	; not yet at a tab stop
	RET

; COLUMN to 0, after a CR. Changes A.
COLZERO:
	XOR	A		; the screen line's start
	LD	(COLUMN),A
	RET

; COLUMN back one, after a BS or an erased character, never below 0.
; Changes A.
COLBACK:
	LD	A,(COLUMN)
	OR	A
	RET	Z		; already at the start
	DEC	A
	LD	(COLUMN),A
	RET

; During output, a key waiting is taken (CONSTQ: no cursor drawn). ^S pauses
; until the next key, which is taken: ^C ends the program by warm boot, as
; CP/M 2.2's conbrk does, and any other is dropped. ^P turns the printer echo
; on or off; any other key is kept for the next console read. Changes A and
; what the BIOS's status and input change.
CHKKEY:
	CALL	CONSTQ		; TEC-OS: the check draws no cursor
	OR	A
	RET	Z		; no key: the output goes on
	CALL	GETCHAR		; a key ready: taken
	CP	CTRLS		; ^S: a pause
	JR	NZ,CHKPRN
	CALL	GETCHAR		; the next key resumes
	CP	CTRLC		; ^C: the program ends, with the rest
	JP	Z,CHDROP	; of a chained line
	RET			; any other: dropped

; The key in A, not ^S, during output: ^P turns the printer echo on or off;
; any other is kept for the next console read. Changes A.
CHKPRN:
	CP	CTRLP
	JR	Z,TOGLIST	; ^P: the printer echo
	LD	(PENDCHR),A	; TEC-OS: any other key is kept for the
				; next console read, as CP/M 2.2 does,
				; so typing during output is not lost.
	LD	A,1		; and marked as kept
	LD	(PENDING),A
	RET

; ^P: the printer echo (LISTEN) turned on or off. Changes A.
TOGLIST:
	LD	A,(LISTEN)
	XOR	1		; 0 off, 1 on
	LD	(LISTEN),A
	RET

; The character before the cursor erased from the screen, straight through
; the BIOS (not echoed to the printer), and COLUMN back one. Changes A, C
; and what the BIOS's output changes.
ERASE1:
	LD	C,BACKSP	; back over it,
	CALL	BIOCOT		; through the RAM jump table
	LD	C,SPACE		; a space over it,
	CALL	BIOCOT
	LD	C,BACKSP	; and back again
	CALL	BIOCOT
	JR	COLBACK		; the column back one
