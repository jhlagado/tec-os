; Diagnostic console, entered when the card or container cannot be mounted.
; A = error code: SDE* (01h-0Fh) from the SD driver or ME* (20h-2Fh) from
; the mount checks. The console stays usable without a card.

DIAG:	LD	SP,BSTK		; the stack the failed mount may have left deep
	PUSH	AF		; the code, kept across the messages
	LD	HL,DGLCD	; the LCD, for a board with no terminal
	CALL	LCD3
	LD	HL,DGERR
	CALL	PUTS
	POP	AF
	CALL	PUTHEX		; the code on the console
	CALL	PUTCRLF
DGLOOP:	LD	HL,DGPROM	; ask until the key is one of ours
	CALL	PUTS
	CALL	BCONIN
	AND	$DF		; upper case
	PUSH	AF
	CALL	PUTA		; echo it, on a line of its own
	CALL	PUTCRLF
	POP	AF
	CP	'R'
	JP	Z,COLDRT	; retry: LCD, card and mount from the start
	CP	'H'
	JR	NZ,DGLOOP
	LD	HL,BLKBUF	; first 64 bytes of the last block read
	LD	C,4		; rows of 16 bytes
DGROW:	LD	B,16
DGCOL:	LD	A,(HL)
	PUSH	BC		; the hex output uses both counts
	PUSH	HL
	CALL	PUTHEX
	LD	A,' '
	CALL	PUTA
	POP	HL
	POP	BC
	INC	HL		; the next byte of the row
	DJNZ	DGCOL
	PUSH	BC		; the end of the row, counts kept again
	PUSH	HL
	CALL	PUTCRLF
	POP	HL
	POP	BC
	DEC	C
	JR	NZ,DGROW
	JR	DGLOOP		; the prompt again
