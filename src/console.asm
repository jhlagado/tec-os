; Console: one device at a time, chosen by the IOBYTE CON: field.
;
;   TTY: (0)  serial terminal: keys and output on the serial port
;   CRT: (1)  PICO9918 screen and the matrix keyboard
;   BAT: (2)  CP/M batch: keys from the reader, the serial port; output to the
;             list device, which discards it
;   UC1: (3)  GLCD screen and the matrix keyboard
;
; Cold boot starts on TTY:, and a display driver's load takes the console. A
; program or the CCP's CON command may change the IOBYTE at any time; the next
; console call acts on it, clearing and homing the new screen. CRT: or UC1:
; without its display or keyboard falls back to the serial terminal. VWID and
; VHGT give the size of the console in use, 0 for the serial terminal.
;
; Serial is bit-banged at 4800 baud, 8 data bits, no parity, 2 stop bits. TX
; is port 01h bit 6 (idle high), RX is port 03h bit 7. Reception has no
; hardware buffer, so a byte is caught only while one of these routines is
; polling. Reading port 00h first lets Debug80 start a queued input byte; on
; the board it reads the keypad encoder and has no effect. The delay counts
; (TXDLY, TXSTOP, RXHALF, RXDLY, RXPOLL) come from the generated configuration.
;
; The serial polling loops see a start bit up to 38 T-states late. RXHALF
; allows for half of that, so the samples land near the middle of each bit.

; Cold boot's console setup: the serial line idle, no byte waiting, the serial
; terminal in effect, the terminal's state cleared and the keyboard scan
; restarted at row 0 with no key held. CONDEV records the matrix keyboard if
; the board's switch enables it, and VIDINIT adds the PICO9918 if it answers.
; Destroys AF, B and HL.
CONINIT:
	LD	A,$40		; TX high: the line idles at mark
	OUT	(DIGPORT),A
	XOR	A		; nothing received, TTY:, normal video,
	LD	(RXFULL),A	; no cursor drawn, no escape sequence
	LD	(CONDEV),A
	LD	(VATTR),A
	LD	(VCURV),A
	LD	(ESCST),A
	LD	(CONMOD),A	; CMTTY is 0
	LD	(KBBASE),A	; the scan starts at key 0
	DEC	A		; FFh: no key held or seen
	LD	(KBLAST),A	; for the debounce and for a scan's
	LD	(KBE),A		; last two keys
	LD	(KBD),A
	LD	A,$FE		; select row 0, its bit low
	LD	(KBMASK),A
	IN	A,(STSPORT)	; the Matrix switch enables the keyboard
	AND	CDMTX
	LD	(CONDEV),A	; CDMTX or nothing
	JP	VIDINIT		; then look for the PICO9918

; Act on a changed IOBYTE CON: field: one that isn't the mode in effect, since
; CONSW writes the mode it takes back into the field, the serial terminal for a
; display or keyboard that isn't there. Preserves BC and DE; destroys AF, HL.
CONSEL:	LD	A,(IOBYTE)
	AND	3		; the CON: field
	LD	HL,CONMOD
	CP	(HL)		; unchanged: nothing to do
	RET	Z
	PUSH	BC		; kept for the BIOS caller
	PUSH	DE
	CALL	CONSW		; the new mode, A
	POP	DE
	POP	BC
	RET

; Take console mode A (CMTTY to CMUC1). CRT: and UC1: need their driver's
; table in PIVEC or GLVEC: its vectors are copied to the terminal's, the
; geometry to VWID and VHGT, the scroll region reset, and, unless a program
; has claimed the display, the screen put back in its mode, cleared and the
; cursor homed. Without a table the serial terminal is taken. TTY: and BAT:
; set no geometry. The mode taken goes into CONMOD and the CON: field.
; Destroys AF, BC, DE, HL.
CONSW:	LD	B,A
	RRCA			; bit 0 set: a video mode
	LD	A,B
	JR	NC,CONSW2
	ADD	A,LOW(PIVEC)-1	; CRT: or UC1:, its driver's table
	LD	L,A		; 1 gives PIVEC, 3 GLVEC
	LD	H,HIGH(PIVEC)
	LD	A,(HL)		; HL = the table, 0 if none
	INC	HL
	LD	H,(HL)
	LD	L,A
	OR	H		; zero: no driver has loaded
	JR	NZ,CONSWV	; a driver is there
	JR	CONSWT
CONSW2:	CP	CMBAT		; BAT: stays BAT:, TTY: is TTY:
	JR	Z,CONSWN
CONSWT:	LD	A,CMTTY		; the serial terminal, also the fallback
CONSWN:	CALL	CONMD
	LD	HL,0		; no screen geometry
	LD	(VWID),HL	; VWID and VHGT both 0
	RET
CONSWV:	PUSH	BC		; B = the video mode
	LD	DE,VPUTV	; seven words: six vectors and VFNV
	LD	BC,14
	LDIR			; HL left on the geometry
	LD	E,(HL)		; the table goes on with columns, then rows
	INC	HL
	LD	D,(HL)
	LD	(VWID),DE	; VWID, then VHGT
	CALL	VTREGR		; the scroll region: the new screen
	POP	BC
	LD	A,B		; the mode, now in effect
	CALL	CONMD
	CALL	VTOWN		; NZ: a program owns the PICO9918
	RET	NZ		; selection must leave a claimed display alone
	CALL	VREST		; the display in its mode before the clear
	XOR	A		; cursor home, normal video,
	LD	(VROW),A	; no escape sequence, no cursor drawn
	LD	(VCOL),A
	LD	(VATTR),A
	LD	(ESCST),A
	LD	(VCURV),A
	JP	VTCLS		; a clear screen

; BIOS CONST: A = FFh if a character is ready, else 00h. With nothing ready
; on a video console the cursor is drawn, since a program that polls is
; waiting for a key; the next output removes it. The BDOS's own check for ^S
; during output uses BCONST, which draws nothing. Destroys F, BC, DE, HL.
BCONSTC:
	CALL	BCONST
	OR	A		; a character: no cursor needed
	RET	NZ
	LD	A,(CONMOD)
	RRCA			; bit 0 set: a video console
	CALL	C,CURSHOW
	XOR	A		; not ready
	RET

; Console status without the cursor: A = FFh, NZ if a character is ready,
; else A = 0, Z. A byte found is held in RXCHAR with RXFULL set. On the
; serial port it listens for RXPOLL loops for a start bit. Acts first on a
; changed CON: field. Destroys BC, DE, HL.
BCONST:	CALL	CONSEL
	CALL	VTFLIP		; show the program the screen it has drawn
	LD	A,(RXFULL)	; a byte already waiting
	OR	A
	JR	NZ,CSTYES
	LD	A,(CONMOD)
	RRCA			; bit 0 clear: TTY: or BAT:, serial
	JR	NC,CSTSER
CSTMX:	CALL	KBPOLL		; a whole scan of the matrix
CSTMXE:	JR	NZ,CSTYES	; NZ: a key, held in RXCHAR
	XOR	A
	RET
CSTSER:	IN	A,(KEYPORT)	; lets Debug80 start a queued byte
	LD	E,RXPOLL	; how long to listen
CSTPOLL:
	IN	A,(STSPORT)
	RLCA			; carry clear: RX low, a start bit
	JR	NC,CSTGOT
	DEC	E
	JR	NZ,CSTPOLL	; listen again
	XOR	A		; nothing came: not ready
	RET
CSTGOT:	CALL	RXBITS
CSTRX:	AND	$7F		; seven bits for the console
	LD	E,RXPOLL	; NUL: keep listening for a byte behind it
	JR	Z,CSTPOLL
	LD	(RXCHAR),A	; held for CONIN
	LD	A,$FF
	LD	(RXFULL),A	; FFh: a byte waits
CSTYES:	LD	A,$FF
	RET

; BIOS CONIN: wait for a character and return it in A with bit 7 clear.
; NUL is not delivered (Debug80 sends one ahead of its first input byte).
; Acts first on a changed CON: field. Destroys F, BC, DE, HL.
BCONIN:	CALL	CONSEL
	CALL	VTFLIP		; show the program the screen it has drawn
	LD	A,(RXFULL)	; CONST may have caught a byte
	OR	A
	JR	NZ,CINTAKE
	LD	A,(CONMOD)
	RRCA			; bit 0 clear: serial
	JR	NC,CINLP
	CALL	CURSHOW		; video: the cursor shows while waiting
CINMX:	CALL	KBSTEP		; scan the matrix a row at a time
CINME:	JR	Z,CINMX		; Z: no new key yet
	CALL	CINTAKE		; the key KBSTEP held
	PUSH	AF
	CALL	CURHIDE		; the cursor off before returning
	POP	AF
	RET

; Return in A the byte held in RXCHAR. The rest of a keyboard arrow
; sequence (KBTN bytes in KBT1 and KBT2) moves up behind it and RXFULL stays
; set; with none left RXFULL is cleared. Destroys F.
CINTAKE:
	LD	A,(KBTN)	; bytes of an arrow sequence still to come
	OR	A
	JR	NZ,CINTAIL
	LD	(RXFULL),A	; the last byte: nothing waits now
	LD	A,(RXCHAR)	; the byte itself
	RET
CINTAIL:
	DEC	A		; deliver this byte, move the next one up
	LD	(KBTN),A
	LD	A,(RXCHAR)
	PUSH	AF		; the byte delivered now
	LD	A,(KBT1)	; KBT1 next, KBT2 behind it
	LD	(RXCHAR),A
	LD	A,(KBT2)
	LD	(KBT1),A
	POP	AF		; RXFULL stays set for the rest
	RET

; Wait for a byte from the serial port (TTY: and BAT:), with no timeout, and
; return it in A with bit 7 clear; NUL is skipped. Destroys F, BC, D.
CINLP:	IN	A,(KEYPORT)	; lets Debug80 start a queued byte
	IN	A,(STSPORT)
	RLCA			; carry set: RX high, the line idle
	JR	C,CINLP
CINWE:	CALL	RXBITS
CINRX:	AND	$7F		; seven bits; NUL is waited past
	JR	Z,CINLP
	RET

; Receive the byte whose start bit has just been seen. Samples the middle of
; each data bit, least significant first, with interrupts off and then back
; as they were. Returns it in A; destroys F, BC, D.
RXBITS:	CALL	IFFGET		; interrupts off for the byte: 65 or 52
	PUSH	AF		; T-states of RXHALF's allowance
	DI
	LD	D,RXHALF	; on to the middle of the start bit
RXH:	DEC	D
	JR	NZ,RXH
	LD	B,8		; eight data bits
RXB:	IN	A,(STSPORT)
	RLCA			; RX, bit 7, into carry
	RR	C		; and into C from the top, so the first
	LD	D,RXDLY		; bit received ends in bit 0
RXD:	DEC	D		; a bit's time to the next middle
	JR	NZ,RXD
	DJNZ	RXB
	POP	AF		; P/V: the interrupt state before
	LD	A,C		; the byte
	RET	PO		; the flags kept: interrupts as they were
	EI
	RET

; BIOS CONOUT: send C to the serial port or the video terminal, by the
; console; BAT: discards it, as the list device does. Acts first on a changed
; CON: field. Destroys AF, BC, DE, HL.
BCONOUT:
	CALL	CONSEL
	CALL	VTOWN		; a program owns the PICO9918: drop the output
	RET	NZ
	LD	A,(CONMOD)
	RRCA			; bit 0: CRT: or UC1:
	JP	C,VTOUT		; CRT: or UC1:
	RRCA			; bit 1 alone: BAT:
	RET	C		; BAT: output goes to the list device
BCOSER:	LD	A,C		; TTY:, the serial port

; Send A on the serial port: a start bit, 8 data bits least significant
; first, two stop bits, with interrupts off and then back as they were. Each
; bit takes 49+16*TXDLY T-states. Destroys AF, B, DE.
TXBYTE:	LD	E,A		; the byte, shifted out from E
	CALL	IFFGET		; interrupts off for the byte
	PUSH	AF		; P/V: the state to put back
	DI
	LD	B,9		; start bit, then 8 data bits
	OR	A		; carry clear: the start bit is low
TXB:	SBC	A,A		; carry to 00h or FFh, then
	AND	$40		; bit 6, the TX line
	OUT	(DIGPORT),A
	NOP			; pads the bit to 49+16*TXDLY
	LD	D,TXDLY
TXD:	DEC	D		; hold the bit
	JR	NZ,TXD
	RR	E		; the next data bit into carry
	DJNZ	TXB
	LD	A,$40		; two stop bits
	OUT	(DIGPORT),A
	LD	D,TXSTOP	; held for both stop bits' time
TXS:	DEC	D
	JR	NZ,TXS
	POP	AF
	RET	PO		; interrupts were off: leave them so
	EI
	RET

; Print the zero-terminated string at HL on the console. Returns HL at the
; terminating zero. Destroys AF, BC, DE.
PUTS:	LD	A,(HL)
	OR	A		; the zero ends it
	RET	Z
	PUSH	HL		; CONOUT destroys HL
	LD	C,A
	CALL	BCONOUT
	POP	HL
	INC	HL		; on to the next character
	JR	PUTS

; Print CR and LF on the console (PUTCRLF), or the character in A (PUTA).
; Destroys AF, BC, DE, HL.
PUTCRLF:
	LD	A,13		; CR, then LF by falling into PUTA
	CALL	PUTA
	LD	A,10		; LF
PUTA:	LD	C,A		; CONOUT takes it in C
	JP	BCONOUT

; Print A as two hex digits on the console (PUTHEX), or through the routine at
; HL, which takes each digit in A and may destroy any register (HEXHL); the
; CCP's CPHEX prints through BDOS function 2 so. Destroys AF, BCDE, HL.
PUTHEX:	LD	HL,PUTA		; the console, by the BIOS
HEXHL:	PUSH	AF
	RRCA			; the high digit first
	RRCA
	RRCA
	RRCA
	PUSH	HL		; the output, which may destroy it
	CALL	HEXNIB
	POP	HL
	POP	AF		; then the low
HEXNIB:	AND	$0F
	ADD	A,$90		; 0-9 to 90h-99h, A-F to 00h-05h
	DAA
	ADC	A,$40		; then '0'-'9' or 'A'-'F'
	DAA
	JP	(HL)		; the output takes it and returns

; The list device is not fitted: its output is discarded and it reports ready.
; Punch and reader are the serial port, and BREADER waits for a byte with no
; timeout. BLIST changes nothing; BLISTST returns A = FFh.
BLIST:	RET
BLISTST:
	LD	A,$FF		; always ready
	RET

; BIOS PUNCH and READER are the serial port, eight bits, whatever the console
; routing. A byte the console has already taken stays with the console.
; PUNCH sends C and destroys AF, B, DE; READER returns the byte in A and
; destroys F, BC, D.
BPUNCH:	LD	A,C		; TXBYTE sends A
	JP	TXBYTE
BREADER:
BRDWT:	IN	A,(KEYPORT)	; lets Debug80 start a queued byte
	IN	A,(STSPORT)
	RLCA			; carry set: RX high, no start bit
	JR	C,BRDWT
	CALL	RXBITS		; all eight bits kept
BRDRX:	RET

; A, the mode taken, in effect: CONMOD, and the IOBYTE's CON: field, so that a
; driver or program reads the console in use there. Returns B = A. Destroys AF.
CONMD:	LD	(CONMOD),A
	LD	B,A		; then into the IOBYTE
; Put B, a console mode, in the IOBYTE's CON: field. Keeps B. Destroys AF.
CONFLD:	LD	A,(IOBYTE)
	AND	$FC		; the other devices' fields kept
	OR	B		; the mode in CON:, bits 0-1
	LD	(IOBYTE),A
	RET
