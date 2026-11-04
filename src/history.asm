; Command-line history: lines typed at the CCP prompt, kept in one page of
; EXPAND 1 from cold boot. ^W at the prompt recalls the line before, ^N the
; line after. Function 10 called by a program is CP/M 2.2's, with ^W and ^N
; as characters.
;
; The ring: each line followed by a 0, written forward from HHEAD with the
; offset wrapping at 256. After the terminator, bytes are zeroed forward up
; to and including the next one already 0, which removes what is left of the
; oldest line it overwrote. So ring[HHEAD-1] and ring[HHEAD] are both 0, and
; a walk back from the newest stops at an empty entry. A line holding a 0 is
; not stored; nor is one equal to the newest. The ring's page, HRING, is
; fixed, and cold boot clears it.

HRING	EQU	$BD00		; its page, in EXPAND 1

; A = the ring's byte at L (HGET), or that byte = A (HPUT), with H the ring's
; page, HRING>>8. EXPAND 1 is in view for the access alone, with interrupts
; off, and no stack is used while it is, since it may cover the stack.
; Interrupts are left as they were. Keeps BC, DE and HL; destroys F.
HPUT:	PUSH	BC
	LD	B,A		; B = the byte to write
	LD	C,1		; C = 1: write, then read back
	JR	HACC
HGET:	PUSH	BC
	LD	C,0		; C = 0: read only
HACC:	CALL	IFFGET		; P/V = interrupts on,
	DI			; kept on the stack while they are off
	PUSH	AF
	LD	A,(LATCHV)	; EXPAND 1 into view at 8000h-BFFFh
	OR	LATEXP
	OUT	(SYSLAT),A
	DEC	C		; Z for HPUT only
	JR	NZ,HACC1
	LD	(HL),B
HACC1:	LD	B,(HL)		; the byte, read (or read back)
	LD	A,(LATCHV)	; the usual memory back, as the latch had it
	OUT	(SYSLAT),A
	POP	AF
	JP	PO,HACC2	; interrupts were off: leave them so
	EI
HACC2:	LD	A,B		; the byte in A
	POP	BC
	RET

; L = an entry's terminator: L = its first byte, L itself when it is empty.
; H the ring's page. Destroys AF.
HSTART:	DEC	L		; the byte before L: a 0 there
	CALL	HGET		; makes L the entry's start
	INC	L
	OR	A
	RET	Z
	DEC	L		; else one back and look again
	JR	HSTART

; ^W or ^N, in C, at the CCP prompt: the line in the buffer replaced by the
; line before or after the one shown. HPOS is the shown line's terminator,
; HHEAD's empty entry when none is shown. The new line is copied into the
; buffer (LINPTR, LINCNT, cut at LINMAX) and echoed. Changes AF, BC, HL and
; what LINERASE and ECHOCHAR change.
HREC:	LD	H,HRING>>8
	LD	A,(HPOS)	; L = the shown line's terminator
	LD	L,A
	LD	A,C
	CP	CTRLN
	JR	Z,HRNEW		; ^N: the line after
	CALL	HSTART		; ^W: the shown line's first byte,
	DEC	L		; the line before's terminator
	DEC	L		; and its last byte: a 0 there
	CALL	HGET		; means that line is empty, the end
	INC	L
	OR	A
	RET	Z		; none before: stay
	JR	HRSHOW
HRNEW:	LD	A,(HHEAD)
	CP	L
	RET	Z		; none shown
HRNEW1:	INC	L		; forward to the next terminator,
	CALL	HGET		; the next line's; past the newest
	OR	A		; that is HHEAD's empty entry
	JR	NZ,HRNEW1
HRSHOW:	LD	A,L		; the line to show, by its terminator
	LD	(HPOS),A
	CALL	HSTART		; L = its first byte
	PUSH	HL
	CALL	LINERASE	; the typed line off the screen and out
	POP	HL		; of the buffer
HRCOPY:	LD	A,(HPOS)	; up to the shown line's terminator
	CP	L
	RET	Z
	LD	BC,(LINMAX)	; C the maximum, B the count
	LD	A,C
	CP	B
	RET	Z		; cut at the buffer's maximum
	CALL	HGET		; the next byte of the line,
	LD	C,A		; into the buffer
	PUSH	HL
	LD	HL,(LINPTR)
	LD	(HL),C		; at the buffer's next place
	INC	HL
	LD	(LINPTR),HL
	LD	HL,LINCNT	; counted
	INC	(HL)
	CALL	ECHOCHAR	; and echoed, as if typed
	POP	HL
	INC	L
	JR	HRCOPY

; The line function 10 returns, B bytes at DE (B not 0), into the ring,
; unless it holds a 0 or equals the newest line. HHEAD moves past it. Keeps
; C; destroys AF and HL, and B and DE when the line is stored.
HSTORE:	LD	H,HRING>>8
	LD	A,(HHEAD)	; HHEAD-1, the newest's terminator
	DEC	A
	LD	L,A
	CALL	HSTART		; L = the newest's first byte
	PUSH	DE
	PUSH	BC
	LD	C,0		; 0 while the line matches the newest
HSCMP:	LD	A,(DE)
	OR	A
	JR	Z,HSKEEP	; a 0 in it: not stored
	CALL	HGET		; the newest's byte against the line's
	EX	DE,HL
	CP	(HL)
	EX	DE,HL
	JR	Z,HSCMP1
	INC	C		; a difference
HSCMP1:	INC	DE
	INC	L
	DJNZ	HSCMP
	LD	A,(HHEAD)	; matched, and the newest ends here too
	DEC	A		; (L at its terminator, HHEAD-1)
	SUB	L
	OR	C
	JR	Z,HSKEEP	; the same as the newest: not stored
	POP	BC
	POP	DE
	LD	A,(HHEAD)	; written from HHEAD on
	LD	L,A
HSPUT:	LD	A,(DE)
	CALL	HPUT
	INC	DE
	INC	L		; wrapping at 256 within the page
	DJNZ	HSPUT
	XOR	A
	CALL	HPUT		; the terminator
	INC	L
	LD	A,L		; HHEAD past it
	LD	(HHEAD),A
HSCLR:	CALL	HGET		; zero forward through the next 0
	LD	B,A		; B = the byte as it was
	XOR	A
	CALL	HPUT
	INC	L
	OR	B		; stop once a 0 is cleared
	JR	NZ,HSCLR
	RET
HSKEEP:	POP	BC		; not stored: BC and DE as they came
	POP	DE
	RET
