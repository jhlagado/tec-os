; The matrix keyboard, the console's keys on a board with a PICO9918 or a GLCD.
; console.asm's input routines poll it.

; The keyboard is scanned a row at a time. Key k is row k/8, bit k%8 of port
; FEh, with the row selected by a low bit in the high address byte. Keys 0, 1
; and 2 are Shift, Ctrl and Fn; key 7 toggles Caps Lock. A key is delivered
; once when it goes down; holding it does not repeat.

; Scan the whole keyboard: eight rows, one KBSTEP each, starting wherever the
; last scan left off. Takes CONDEV's CDMTX bit, the keyboard's switch. Returns
; NZ with a new character in RXCHAR and RXFULL set, or Z with A = 0 when the
; keyboard is off. Destroys AF, BC, DE, HL.
KBPOLL:	LD	A,(CONDEV)
	AND	CDMTX
	RET	Z		; no matrix keyboard on this board
	LD	L,8		; one full scan is eight rows
KBPL:	PUSH	HL
	CALL	KBSTEP
	POP	HL
	RET	NZ		; a character is ready: stop early
	DEC	L
	JR	NZ,KBPL
	RET			; Z from the count: nothing new

; Scan the next row, KBMASK's, noting each key down in it in KBE and KBD. After
; the last row, decide on the keys seen. Returns NZ with a new character in
; RXCHAR and RXFULL set, or Z. Destroys AF, BC, DE, HL.
KBSTEP:	LD	HL,KBMASK
	LD	B,(HL)		; row select, one bit low
	LD	C,$FE		; the row's keys read on port FEh,
	IN	A,(C)		; low for a key down
	CPL
	JR	Z,KBSNEXT	; no key down in this row
	LD	D,A		; record each key in this row
	INC	HL
	LD	A,(HL)		; KBBASE: key number of bit 0
KBSBIT:	SRL	D		; next bit, lowest key first
	JR	NC,KBSN
	LD	E,A		; key A is down: the last key moves
	LD	A,(KBE)		; to KBD and this one takes KBE, so
	LD	(KBD),A		; a scan keeps its last two keys
	LD	A,E
	LD	(KBE),A
KBSN:	INC	A		; the next bit's key number
	INC	D		; until no key is left in the row
	DEC	D
	JR	NZ,KBSBIT
	LD	HL,KBMASK
KBSNEXT:
	RLC	(HL)		; next row
	INC	HL
	LD	A,(HL)		; KBBASE moves on a row of eight
	ADD	A,8
	LD	(HL),A
	CP	64		; past row 7 the scan is complete
	JR	Z,KBEVAL
	XOR	A		; Z: nothing yet
	RET
KBEVAL:	XOR	A		; a full scan is complete
	LD	(HL),A		; the next starts at key 0
	LD	HL,(KBE)	; L = last key, H = the one before
	LD	DE,$FFFF	; clear both for the next scan
	LD	(KBE),DE
	EX	DE,HL		; E = last key, D = the one before
	LD	A,E
	LD	HL,KBLAST	; the key held at the last scan
	CP	(HL)
	JR	Z,KBNONE	; still held
	LD	(HL),A		; a change, a release included
	INC	A
	JR	Z,KBNONE	; nothing pressed
	LD	A,D		; a second key must be a modifier
	CP	3		; (keys go in rising order, so a
	JR	C,KBMOD		; modifier, 0 to 2, is always in D)
	INC	A		; or FFh, no second key at all
	JR	NZ,KBNONE	; two ordinary keys: ignore both
KBMOD:	LD	A,E
	CP	3
	JR	C,KBNONE	; a modifier alone
	CP	7		; key 7 is caps lock
	JR	Z,KBCAPS
	JR	NC,KBNOARR	; the same CP: keys 3-6 are the arrows,
				; sent as ESC [ A-D
	SUB	3		; look up the arrow's letter
	LD	HL,KBARROW
	ADD	A,L
	LD	L,A
	JR	NC,KBARR1	; carry into H across a page
	INC	H
KBARR1:	LD	A,(HL)
	LD	(KBT2),A	; queue '[' and the letter to follow
	LD	A,'['		; the ESC that goes now; CINTAKE
	LD	(KBT1),A	; hands them out one at a time
	LD	A,2
	LD	(KBTN),A
	LD	A,$1B		; ESC
	JR	KBDELIV
KBNOARR:
	CALL	KBASCII
	OR	A
	JR	Z,KBNONE	; a key with no character
KBDELIV:
	LD	(RXCHAR),A	; deliver A as the received byte
	LD	A,$FF
	LD	(RXFULL),A
	OR	A		; NZ: a character is ready
	RET
KBNONE:	XOR	A		; Z: no character
	RET
KBCAPS:	LD	A,(LATCHV)	; Caps Lock: flip the latch's bit 7,
	XOR	$80		; which lights the Caps LED and
	LD	(LATCHV),A	; which KBASCII reads for letters
	OUT	(SYSLAT),A
	XOR	A		; Z: no character
	RET

; Translate key E with modifier D (FFh none, 0 Shift, 1 Ctrl, 2 Fn) to ASCII,
; through KBSPEC and KBSHIFT; letters follow Caps Lock, LATCHV's bit 7. Returns
; the character in A. Destroys F, B, C, HL.
KBASCII:
	LD	A,E
	LD	HL,KBSPEC	; Return, Esc, space, quote and backslash
	LD	B,5		; five entries of key, plain, shifted
KBSP:	CP	(HL)
	INC	HL		; INC HL leaves Z from the compare
	JR	Z,KBSPHIT
	INC	HL		; past this entry's two values
	INC	HL
	DJNZ	KBSP
	CP	$0F		; not special: by key range
	RET	C		; keys 03h-0Eh are control codes as they stand
	CP	$21
	JR	NC,KBALPHA
	ADD	A,$1D		; digits and punctuation: 2Ch-3Dh
	LD	C,A
	LD	A,D
	OR	A		; Shift is modifier 0
	LD	A,C
	RET	NZ		; unshifted: the character as it is
	SUB	$2C		; shifted: KBSHIFT's entry for it
	LD	HL,KBSHIFT
	JR	KBIDX
KBSPHIT:
	LD	C,(HL)		; plain value, then the shifted value
	INC	HL
	LD	A,D
	OR	A		; Shift is modifier 0
	LD	A,C
	RET	NZ		; anything but Shift: the plain value
	LD	A,(HL)
	RET
KBALPHA:
	CP	$24
	RET	C		; keys 21h-23h as they stand
	ADD	A,$3D		; letters: keys 24h-3Dh are a to z
	LD	C,A
	LD	A,D
	CP	1
	JR	NZ,KBNOCTL
	LD	A,C		; Ctrl: control codes 01h-1Ah
	SUB	$60
	RET
KBNOCTL:
	OR	A		; Shift
	JR	Z,KBUPPER
	LD	A,(LATCHV)	; Caps Lock
	RLCA			; bit 7 into carry
	LD	A,C
	RET	NC		; Caps off: lower case
KBUPPER:
	LD	A,C		; upper case
	SUB	$20
	RET
KBIDX:	ADD	A,L		; A = (HL+A), carrying into H
	LD	L,A
	JR	NC,KBIDX1
	INC	H
KBIDX1:	LD	A,(HL)		; the table's entry
	RET
