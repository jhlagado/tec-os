; SD card block driver: SPI mode, bit-banged on port FDh.
;
; Port bits out: 0 MOSI, 1 CLK, 2 /CS. In: bit 7 MISO. Data changes while CLK
; is low and the card samples on the rising edge. Every wait is bounded.
; Routines return Z on success; on failure NZ and A holds an SDE* code, also
; kept in SDERR.

SDIDLE	EQU	$05		; /CS high, MOSI high, CLK low

SDENOCD	EQU	1		; no response to CMD0
SDEINIT	EQU	2		; ACMD41 never reported ready
SDEOCR	EQU	3		; CMD58 failed
SDEBLEN	EQU	4		; CMD16 failed
SDECMD	EQU	5		; read or write command rejected
SDETOK	EQU	6		; no data token
SDEWRSP	EQU	7		; write not accepted
SDEBUSY	EQU	8		; card stayed busy
SDERNG	EQU	9		; a standard card's block past its 4 GiB

; Send the byte in C to the card, most significant bit first. Selects the
; card: every write to SDIO here has /CS (bit 2) low. Takes C; returns C
; unchanged, as eight RLCs bring it round, and CLK left high. Destroys AF, B.
SPIW:	LD	B,8		; eight bits
SPIWB:	XOR	A		; /CS low, CLK low, MOSI 0 so far
	RLC	C		; next bit, top first, to carry
	RLA			; and into bit 0, MOSI
	OUT	(SDIO),A	; data out while CLK is low
	OR	2		; bit 1, CLK, high:
	OUT	(SDIO),A	; the card samples MOSI on this edge
	DJNZ	SPIWB
	RET

; Receive a byte from the card, sending FFh (MOSI held high), with /CS low.
; Returns the byte in A, CLK left low. Destroys F, B, E.
SPIR:	LD	B,8		; eight bits
SPIRB:	LD	A,1		; MOSI high, CLK low, /CS low
	OUT	(SDIO),A	; the card shifts its next bit out
	LD	A,3		; the same with CLK high:
	OUT	(SDIO),A	; the bit is valid after the rise
	IN	A,(SDIO)	; MISO is bit 7
	RLA			; to carry,
	RL	E		; and into E, top bit first
	DJNZ	SPIRB
	LD	A,1		; finish with CLK low
	OUT	(SDIO),A
	LD	A,E		; the byte received
	RET

; Deselect the card, then give it eight clocks with /CS high so that it
; lets go of MISO. Keeps every register, so a command's R1 in A and its
; flags pass through.
SPIEND:	PUSH	AF
	PUSH	BC
	LD	B,8		; eight clocks, one byte's worth
SPIEB:	LD	A,SDIDLE+2	; /CS high, MOSI high, CLK high
	OUT	(SDIO),A
	LD	A,SDIDLE	; and CLK low again
	OUT	(SDIO),A
	DJNZ	SPIEB
	POP	BC		; the caller's registers back,
	POP	AF		; R1 and flags included
	RET

; Send command A (its index, 0-63) with the 32-bit argument in SDARG and
; return its R1 response in A: 00h ready, bit 0 in the idle state, bit 2
; an illegal command; bit 7 is always clear. A with bit 7 set (FFh from an
; absent card) means no R1 came within 16 bytes. Leaves /CS low so that
; the caller can read the rest of a longer response. Destroys F, BC, DE,
; HL.
SDCMD:	LD	D,A		; D keeps the index
	LD	C,$FF		; one idle byte first, card selected
	CALL	SPIW
	LD	A,D		; first byte: 01 then the index,
	OR	$40		; start bit 0, transmission bit 1
	LD	C,A
	CALL	SPIW
	LD	HL,SDARG	; the argument, most significant byte first
	LD	C,(HL)		; bits 31-24
	CALL	SPIW
	INC	HL
	LD	C,(HL)		; bits 23-16
	CALL	SPIW
	INC	HL
	LD	C,(HL)		; bits 15-8
	CALL	SPIW
	INC	HL
	LD	C,(HL)		; bits 7-0
	CALL	SPIW
				; Last byte: CRC7 and the end bit. The card
				; checks it only for CMD0 and CMD8 in SPI mode.
	LD	C,$95		; valid CRC for CMD0
	LD	A,D
	OR	A		; CMD0?
	JR	Z,SDCRC
	LD	C,$87		; valid CRC for CMD8 with argument 1AAh
	CP	8		; CMD8?
	JR	Z,SDCRC
	LD	C,$01		; any other: no CRC, just the end bit
SDCRC:	CALL	SPIW
	LD	D,16		; poll up to 16 bytes for R1
SDR1:	CALL	SPIR
	BIT	7,A		; R1 has bit 7 clear; FFh is idle line
	RET	Z		; the response
	DEC	D
	JR	NZ,SDR1		; not yet: read again
	RET			; none: A has bit 7 set

; Set SDARG to the 32-bit value DEHL, stored big-endian as the card takes
; it: D first. Destroys A; the flags are kept.
SETARG:	LD	A,D		; bits 31-24
	LD	(SDARG),A
	LD	A,E		; bits 23-16
	LD	(SDARG+1),A
	LD	A,H		; bits 15-8
	LD	(SDARG+2),A
	LD	A,L		; bits 7-0
	LD	(SDARG+3),A
	RET

; Run command A with argument DEHL and deselect the card, for commands whose
; response is R1 alone. Returns R1 in A, as SDCMD. Destroys F, BC, DE, HL.
SDCMDX:	PUSH	AF		; SETARG uses A
	CALL	SETARG
	POP	AF
	CALL	SDCMD		; R1 in A,
	JR	SPIEND		; which SPIEND keeps

; Start the card in SPI mode and make it ready for 512-byte block I/O:
; CMD0 to reset it, CMD8 for a version 2 card, ACMD41 until it is ready,
; then CMD58 to find whether it takes block or byte addresses, and CMD16 to
; fix a byte-addressed card's block at 512. Sets SDBYTE, SDERR and SDARG.
; Returns Z and A = 0 when ready; NZ and A = an SDE* code if not. Destroys
; F, BC, DE, HL.
SDINIT:	XOR	A		; block addresses until CMD58 says
	LD	(SDBYTE),A	; otherwise
	LD	A,SDIDLE	; deselect: /CS high, CLK low
	OUT	(SDIO),A
	LD	D,10		; CMD0 attempts
SDI0:	PUSH	DE
	LD	B,80		; at least 74 clocks with /CS high
SDICK:	LD	A,SDIDLE+2	; the power-up clocks the card needs
	OUT	(SDIO),A	; before its first command
	LD	A,SDIDLE
	OUT	(SDIO),A
	DJNZ	SDICK
	LD	DE,0		; CMD0, GO_IDLE_STATE, argument 0:
	LD	HL,0		; with /CS low it puts the card into
	XOR	A		; SPI mode
	CALL	SDCMDX
	POP	DE
	CP	1		; R1 01h: idle, as a reset card is
	JR	Z,SDI8
	DEC	D
	JR	NZ,SDI0		; try again, clocks first
	LD	A,SDENOCD	; no card, or one that never answered
	JP	SDFAIL
SDI8:	LD	DE,0		; CMD8: 2.7-3.6 V, check pattern AAh
	LD	HL,$01AA	; (SEND_IF_COND, version 2 cards only)
	CALL	SETARG
	LD	A,8
	CALL	SDCMD
	CP	1		; idle, no error: a version 2 card
	JR	NZ,SDI8X	; version 1 card: no R7 payload
	LD	D,4		; R7: four bytes, read and discarded;
SDI8R:	PUSH	DE		; the echoed pattern is not checked
	CALL	SPIR
	POP	DE
	DEC	D
	JR	NZ,SDI8R
SDI8X:	CALL	SPIEND		; deselect after CMD8 either way
	LD	C,0		; ACMD41 attempts, 256
SDI41:	PUSH	BC
	LD	DE,0		; CMD55, APP_CMD: the next command is
	LD	HL,0		; an application command; its R1 is not
	LD	A,55		; checked
	CALL	SDCMDX
	LD	DE,$4000	; HCS: host supports high capacity
	LD	HL,0		; (argument bit 30)
	LD	A,41		; ACMD41, SD_SEND_OP_COND: start the
	CALL	SDCMDX		; card's initialisation
	POP	BC
	OR	A		; R1 00h: initialised, out of idle
	JR	Z,SDI58
	LD	B,0		; short pause between attempts
SDI41W:	DJNZ	SDI41W		; (256 turns of the loop)
	DEC	C
	JR	NZ,SDI41	; still idle: ask again
	LD	A,SDEINIT	; never left the idle state
	JR	SDFAIL
SDI58:	LD	DE,0		; CMD58, READ_OCR, argument 0
	LD	HL,0
	CALL	SETARG
	LD	A,58
	CALL	SDCMD		; R3: R1, then the 32-bit OCR
	OR	A		; R1 must be 00h
	JR	NZ,SDI58F
	CALL	SPIR		; OCR byte 0: bit 6 is CCS
	PUSH	AF
	CALL	SPIR		; OCR bits 23-0: the voltage window,
	CALL	SPIR		; not needed
	CALL	SPIR
	CALL	SPIEND
	POP	AF		; OCR bits 31-24 again
	BIT	6,A		; CCS: card capacity status
	JR	NZ,SDIOK	; high capacity: block addresses
	LD	A,1		; standard capacity: the card takes
	LD	(SDBYTE),A	; byte addresses (LBAARG converts)
	LD	DE,0		; CMD16, SET_BLOCKLEN, 512 bytes
	LD	HL,512
	LD	A,16
	CALL	SDCMDX
	OR	A		; R1 00h: block length set
	JR	Z,SDIOK
	LD	A,SDEBLEN
	JR	SDFAIL
SDI58F:	CALL	SPIEND		; CMD58 refused: deselect
	LD	A,SDEOCR	; and fail through SDFAIL

; Fail with the SDE* code in A, which is never 0: keep it in SDERR and
; return NZ with it in A. The common exit of every routine here.
SDFAIL:	LD	(SDERR),A
	OR	A		; NZ
	RET

; Succeed: clear SDERR and return Z with A = 0.
SDIOK:	XOR	A		; A = 0, Z, carry clear
	LD	(SDERR),A
	RET

; Load SDARG from SDLBA, converting to a byte address for standard-capacity
; cards. Carry, and SDARG unchanged, for a standard card's block at 800000h
; or above, whose byte address would lose its top bits and name a lower block
; (KE-151). Destroys AF, DE, HL.
LBAARG:	LD	HL,(SDLBA)	; SDLBA is little-endian: bits 15-0
	LD	DE,(SDLBA+2)	; and bits 31-16
	LD	A,(SDBYTE)
	OR	A		; 0: the card takes block numbers
	JP	Z,SETARG	; block addressing: carry clear
	LD	A,D		; bits 24-31 of the block
	OR	A
	SCF
	RET	NZ		; past 4 GiB: refused
	BIT	7,E		; bit 23
	SCF
	RET	NZ		; and so is this
	LD	D,E		; DEHL = LBA << 8
	LD	E,H
	LD	H,L
	LD	L,0
	ADD	HL,HL		; << 1 more, carrying into DE
	EX	DE,HL		; (bit 23 was clear, so nothing
	ADC	HL,HL		; carries out: carry clear)
	EX	DE,HL
	JP	SETARG		; DEHL = LBA * 512

; Read block SDLBA into the 512 bytes at HL (CMD17), a cache line in
; EXPAND 1 when SDXB is LATEXP. Returns Z and A = 0, or NZ and A = SDERNG,
; SDECMD or SDETOK, also in SDERR. Destroys F, BC, DE, HL, I.
SDREAD:	PUSH	HL		; the buffer, across the command
	CALL	LBAARG
	JR	C,SDRNG		; no command for a block it can't name
	LD	A,17		; CMD17, READ_SINGLE_BLOCK
	CALL	SDCMD
	POP	HL
	OR	A		; R1 00h: accepted
	JR	NZ,SDRCMD
	LD	C,0		; token wait: 65536 polls
	LD	D,0		; (C inner, D outer)
SDRTOK:	PUSH	DE		; SPIR destroys E
	CALL	SPIR
	POP	DE
	CP	$FE		; the start block token; FFh while
	JR	Z,SDRDAT	; the card reads
	DEC	C
	JR	NZ,SDRTOK
	DEC	D
	JR	NZ,SDRTOK
	CALL	SPIEND		; no token in time
	LD	A,SDETOK
	JR	SDFAIL
SDRDAT:	CALL	SDRBLK		; the 512 data bytes
	CALL	SPIR		; CRC, not checked
	CALL	SPIR
	CALL	SPIEND
	JR	SDIOK

; Fail with SDECMD after the card rejected CMD17 or CMD24: deselect it
; first. Jumped to from SDREAD and SDWRITE, with the buffer popped.
SDRCMD:	CALL	SPIEND		; /CS high: the card is left idle
	LD	A,SDECMD
	JR	SDFAIL

; Fail with SDERNG, from SDREAD or SDWRITE when LBAARG refuses the block:
; the buffer's address is still on the stack, and the card is untouched.
SDRNG:	POP	HL		; the buffer's address
	LD	A,SDERNG	; refused before any command
	JR	SDFAIL

; Receive 512 bytes into the buffer at HL, sending FFh, after the start
; token; HL ends 512 bytes on. /CS low and CLK low on entry and on return.
; Two bytes a pass, each bit unrolled; I counts the 256 passes. Destroys AF,
; BC, DE, I.
SDRBLK:	LD	A,(SDXB)	; LATEXP: the buffer is a cache line, and
	LD	B,A		; EXPAND 1 is in view for the loop, which
	LD	A,(LATCHV)	; uses no stack
	OR	B		; (SDXB 0: the latch as it was)
	OUT	(SYSLAT),A
	LD	C,SDIO		; for OUT (C) and IN (C)
	LD	DE,$0103	; D: CLK low, E: CLK high; MOSI high, /CS low
	XOR	A		; I = 0: 256 passes
	LD	I,A		; (I, as the stack may be out of view)
SDRB2:
	OUT	(C),D		; bit 7: CLK low, the card shifts it out
	OUT	(C),E		; and high again
	IN	A,(C)		; MISO, in bit 7, to carry
	RLA
	RL	B		; and into B, top bit first
	OUT	(C),D		; bit 6
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 5
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 4
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 3
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 2
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 1
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 0
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B		; B is the pass's first byte
	LD	(HL),B
	INC	HL
	OUT	(C),D		; second byte: bit 7
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 6
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 5
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 4
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 3
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 2
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 1
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B
	OUT	(C),D		; bit 0
	OUT	(C),E
	IN	A,(C)
	RLA
	RL	B		; B is the second byte
	LD	(HL),B
	INC	HL
	LD	A,I		; count the pass in I
	DEC	A
	LD	I,A
	JP	NZ,SDRB2	; Z from DEC A: 256 passes done
	OUT	(C),D		; leave CLK low
	LD	A,(LATCHV)	; the latch as it was: EXPAND 1 out
	OUT	(SYSLAT),A	; of view again if it was brought in
	RET

; Send the 512 bytes at HL after the start token; HL ends 512 bytes on.
; /CS low on entry (CLK may be high, as SPIW leaves it); CLK low on return.
; Each bit unrolled; MOSI changes with CLK low. Destroys AF, BC, DE.
SDWBLK:	LD	A,(SDXB)	; as SDRBLK
	LD	B,A
	LD	A,(LATCHV)
	OR	B		; EXPAND 1 in view for a cache line
	OUT	(SYSLAT),A
	LD	C,SDIO		; for OUT (C)
	LD	DE,$0200	; 2 passes of 256 bytes
SDWB2:	LD	B,(HL)		; the next byte
	XOR	A		; bit 7: /CS low, CLK low
	RL	B		; the bit to carry
	RLA			; and on to MOSI
	OUT	(C),A
	OR	2		; CLK high: the card takes it
	OUT	(C),A
	XOR	A		; bit 6
	RL	B
	RLA
	OUT	(C),A
	OR	2		; CLK high
	OUT	(C),A
	XOR	A		; bit 5
	RL	B
	RLA
	OUT	(C),A
	OR	2		; CLK high
	OUT	(C),A
	XOR	A		; bit 4
	RL	B
	RLA
	OUT	(C),A
	OR	2		; CLK high
	OUT	(C),A
	XOR	A		; bit 3
	RL	B
	RLA
	OUT	(C),A
	OR	2		; CLK high
	OUT	(C),A
	XOR	A		; bit 2
	RL	B
	RLA
	OUT	(C),A
	OR	2		; CLK high
	OUT	(C),A
	XOR	A		; bit 1
	RL	B
	RLA
	OUT	(C),A
	OR	2		; CLK high
	OUT	(C),A
	XOR	A		; bit 0
	RL	B
	RLA
	OUT	(C),A
	OR	2		; CLK high
	OUT	(C),A
	INC	HL
	DEC	E		; 256 bytes a pass
	JP	NZ,SDWB2
	DEC	D		; then the second pass
	JP	NZ,SDWB2
	AND	$FD		; CLK low
	OUT	(C),A
	LD	A,(LATCHV)	; the latch as it was
	OUT	(SYSLAT),A
	RET

; Write the 512 bytes at HL to block SDLBA (CMD24), waiting until the card
; has finished programming; the buffer is a cache line in EXPAND 1 when SDXB
; is LATEXP. Returns Z and A = 0, or NZ and A = SDERNG, SDECMD, SDEWRSP or
; SDEBUSY, also in SDERR. Destroys F, BC, DE, HL.
SDWRITE:
	PUSH	HL		; the buffer, across the command
	CALL	LBAARG
	JP	C,SDRNG		; nothing written for a block it can't name
	LD	A,24		; CMD24, WRITE_BLOCK
	CALL	SDCMD
	POP	HL
	OR	A		; R1 00h: accepted
	JP	NZ,SDRCMD
	LD	C,$FF		; one idle byte, then the start token
	CALL	SPIW
	LD	C,$FE		; FEh: a single block's data follows
	CALL	SPIW
	CALL	SDWBLK
	LD	C,$FF		; CRC, ignored in SPI mode
	CALL	SPIW		; (C comes back FFh for the
	CALL	SPIW		; second byte)
	LD	D,16		; data response token
SDWRS:	PUSH	DE		; SPIR destroys E
	CALL	SPIR
	POP	DE
	CP	$FF		; FFh until the token comes
	JR	NZ,SDWRG
	DEC	D
	JR	NZ,SDWRS
SDWRG:	AND	$1F		; token xxx0sss1: sss 010 accepted,
	CP	$05		; 101 CRC error, 110 write error
	JR	Z,SDWBSY
	CALL	SPIEND		; rejected, or no token at all
	LD	A,SDEWRSP
	JP	SDFAIL
SDWBSY:	LD	C,0		; busy while the card returns 00h
	LD	D,0		; (holding MISO low): 65536 polls
SDWB:	PUSH	DE
	CALL	SPIR
	POP	DE
	OR	A		; anything but 00h: programmed
	JR	NZ,SDWDON
	DEC	C
	JR	NZ,SDWB
	DEC	D		; C wrapped: the next 256
	JR	NZ,SDWB
	CALL	SPIEND		; still busy after every poll
	LD	A,SDEBUSY
	JP	SDFAIL
SDWDON:	CALL	SPIEND		; deselect: written
	JP	SDIOK
