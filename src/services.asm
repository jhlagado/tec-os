; The numbered services, ABI 5.1 (docs/rom-services.md). CALL ABICALL with the
; number in C and arguments in B, DE and HL; abi.inc names each number, its
; arguments, results, carry and stack. Returns A = 0 with Z and carry clear on
; success, or A = a status with carry. The hardware services, 0 to 8, and the
; driver hook's are here; the volumes' are vol.asm's and the registry's
; loader.asm's. Any program may call them: they run on the caller's stack and
; keep their state in the resident workspace.
;
; The hardware services are the calls that would otherwise fight the OS for a
; port: the digit and speaker port (01h) also carries the serial transmit line,
; which must stay idle, and the PICO9918 may be the console.

RTCPORT	EQU	$FC		; DS1302: bit 4 enable, 6 clock, 7 data out,
				; 5 data in, read on bit 0

SEGPORT	EQU	$02		; 7-segment segment latch
TXIDLE	EQU	$40		; port 01h bit 6: serial line idle, speaker off
; The dispatcher, ABICALL's target. C = the number, B, DE and HL its
; arguments, which reach the service whole: the service is entered by a RET
; to its address, so the caller's return address is next on the stack. Any
; number from TNCOUNT up returns TNEBAD with the other registers as they were.
; Destroys AF and what the service does.
SVCDSP:	LD	A,C
	CP	TNCOUNT
	LD	A,TNEBAD
	JR	NC,HWERR	; past the table
	PUSH	HL		; the arguments, across the lookup
	PUSH	DE
	LD	A,C		; two bytes an entry
	ADD	A,A
	LD	E,A
	LD	D,0		; DE = the entry's offset
	LD	HL,SVTAB
	ADD	HL,DE
	LD	E,(HL)		; DE = its routine
	INC	HL
	LD	D,(HL)
	EX	DE,HL		; HL = its routine
	POP	DE		; the caller's DE back
	EX	(SP),HL		; the routine is the return address,
	RET			; and the caller's HL comes back

; A service's failure: A = the status, set by the caller, returned with
; carry set and NZ (no status is 0). Other registers are kept.
HWERR:	OR	A		; NZ, carry clear
	SCF			; then carry: the failure
	RET

; A service's success: A = 0 with Z and carry clear. Other registers kept.
HWOK:	XOR	A		; A = 0, Z, carry clear
	RET

; INFO. Returns B = CONDEV's bits, the clock's from cold boot, with HWBCLM,
; VCLAIM's value, while the PICO9918 is claimed; DE = the ROM's version; HL =
; columns and rows. It reads no device. Destroys AF.
HWSINFO:
	LD	A,(CONDEV)
	LD	HL,VCLAIM	; holds HWBCLM's value while claimed
	OR	(HL)
	LD	B,A		; the devices, the claim among them
	LD	DE,ROMVER
	LD	HL,(VWID)	; L = VWID, H = VHGT, the next byte
	JP	HWOK

; DIGIT. HL -> six segment bytes, leftmost first: one pass over the six
; digits, each lit for about 0.8 ms; then all off. Returns HL past the six.
; Destroys AF and BC.
HWSDIG:	LD	C,$20		; bit 5 is the leftmost digit
HWSDL:	LD	A,(HL)		; this digit's segments, latched
	OUT	(SEGPORT),A	; while every digit is off
	LD	A,C
	OR	TXIDLE		; the serial line kept idle
	OUT	(DIGPORT),A	; light this digit alone
	LD	B,0
HWSDD:	DJNZ	HWSDD		; 256 turns of 13 T-states, the lit time
	LD	A,TXIDLE	; every digit off, the line idle
	OUT	(DIGPORT),A
	INC	HL		; the next byte, for the digit to the right
	SRL	C
	JR	NZ,HWSDL	; until the select bit leaves bit 0
	JP	HWOK

; LCD. B = the row, 0 to 3, HL -> 20 characters: the row written, every byte
; sent as it is. A row past 3 returns TNEBAD with nothing written. Writing
; row 3 clears CDWRD: the program's text replaces any word of the ROM's.
; Returns HL past the 20. Destroys AF, B and DE.
HWSLCD:	LD	A,B
	CP	4
	LD	A,TNEBAD	; refused: no such row
	JR	NC,HWERR
	PUSH	HL		; the text, across the row's address
	LD	A,B		; a program takes row 3: no word of the ROM's
	CP	3		; is left there for a take to clear
	JR	NZ,HWSL1
	LD	HL,CONDEV
	RES	7,(HL)		; CDWRD
HWSL1:	LD	HL,LCDROWS	; the row's DDRAM address command,
	LD	E,B		; from the table
	LD	D,0
	ADD	HL,DE
	LD	A,(HL)
	CALL	LCDC		; the cursor to the row's start
	POP	HL
	LD	B,20		; the row's width
HWSLC:	CALL	LCDWAIT		; each character once the LCD is ready
	LD	A,(HL)
	OUT	(LCDDAT),A
	INC	HL
	DJNZ	HWSLC		; all 20, zeros and all
	JP	HWOK

; VIDEO. B = 1 claims the PICO9918, B = 0 releases it; any other B returns
; TNEBAD, and TNENODV with no PICO9918 found at cold boot. Claim: the console
; stops drawing on the PICO9918 (output to it is dropped, no cursor, no page
; flips) and the program owns its registers and VRAM. Release, or warm boot
; through HWVREL: with the ROM's console started, text mode, font and page
; come back, and the screen is cleared while it is the console; with none,
; the VDP is left as the program left it. Destroys AF, DE, HL and what
; CURHIDE, the driver's restore and VTCLS do.
HWSVID:	LD	A,B		; 0 or 1, and nothing else
	CP	2
	LD	A,TNEBAD
	JP	NC,HWERR	; refused, nothing changed (A1)
	LD	A,(CONDEV)
	AND	CDTMS		; a PICO9918 answered at cold boot
	LD	A,TNENODV
	JP	Z,HWERR		; none: no device to claim
	LD	A,B
	OR	A
	JR	Z,HWVREL	; B = 0: give it back
	LD	A,(CONMOD)
	CP	CMCRT		; the console's screen: its cursor removed
	CALL	Z,CURHIDE	; before the claim stops the terminal
	LD	A,CDCLM		; HWBCLM, as INFO reports it
	LD	(VCLAIM),A
	JP	HWOK

; The release, also warm boot's. Nothing is done unless the PICO9918 is
; claimed. Returns A = 0, Z and carry clear. Destroys F, DE, HL and what the
; driver's restore and VTCLS do.
HWVREL:	LD	A,(VCLAIM)
	OR	A
	JP	Z,HWOK		; not claimed: nothing to give back
	XOR	A
	LD	(VCLAIM),A	; the terminal may draw again
	LD	HL,(PIVEC)	; registers, font, page shown, by its driver
	LD	A,H
	OR	L
	JP	Z,HWOK		; none: nothing is restored
	LD	DE,6		; the table's fourth word, VREST, the
	ADD	HL,DE		; PICO9918's own even while UC1: is the
	LD	A,(HL)		; console
	INC	HL
	LD	H,(HL)
	LD	L,A		; HL = the restore routine
	CALL	VHLJP
	LD	A,(CONMOD)
	CP	CMCRT
	JP	NZ,HWOK		; not the console: the screen left alone
	CALL	VTCLS		; a clear screen, the cursor at the top left
	XOR	A
	LD	(VROW),A
	LD	(VCOL),A
	JP	HWOK

; ---- Speaker ----------------------------------------------------------------
; TONE. Square wave on port 01h bit 7: DE half cycles of B units of 16
; T-states (plus 51 a half cycle; B = 0 is 256 units), the serial line held
; idle throughout. DE = 0 sounds nothing. Destroys AF, C and DE.
HWSTONE:LD	A,D
	OR	E
	JP	Z,HWOK		; no half cycles
	LD	A,TXIDLE	; the port's byte: line idle, speaker low
HWSTL:	XOR	$80		; the speaker bit flipped, a half cycle
	OUT	(DIGPORT),A
	LD	C,B
HWSTD:	DEC	C		; B turns of 16 T-states
	JR	NZ,HWSTD
	DEC	DE
	LD	C,A		; the port's byte kept across the test
	LD	A,D
	OR	E
	LD	A,C
	JR	NZ,HWSTL	; until DE half cycles are sent
	LD	A,TXIDLE	; the speaker left low, the line idle
	OUT	(DIGPORT),A
	JP	HWOK

; ---- Joystick and keys -----------------------------------------------------
; JOY. Returns B = the joystick's bits, 1 for each one pressed. Destroys AF
; and C.
HWSJOY:	LD	BC,$F7FE	; port FEh with address line 11 low
	IN	A,(C)
	CPL			; the port reads 0 for pressed
	LD	B,A
	JP	HWOK

; KEYS. HL -> 8 bytes: the matrix's rows, one byte each, 1 for each key down.
; Returns HL past the eight. Destroys AF and BC.
HWSKEYS:LD	BC,$FEFE	; row select in the high byte, one bit low
HWSKL:	IN	A,(C)		; the row whose select bit is low
	CPL			; the port reads 0 for down
	LD	(HL),A
	INC	HL
	RLC	B		; the low bit to the next row; carry clear
	JR	C,HWSKL		; once it has left bit 7, after eight
	JP	HWOK

; ---- Text at a position ----------------------------------------------------
; PUTAT. On a video console, B characters from HL at row D, column E, clipped
; to the screen, without moving the cursor. Status 2 on the serial terminal,
; or while the PICO9918 is claimed and is the console. A row past the screen
; writes nothing; a row is cut at its last column. Destroys AF, BC, DE, HL
; and what CURHIDE and VPUT do.
HWSPUT:	CALL	VTOWN
	LD	A,TNENODV
	JP	NZ,HWERR	; claimed and the console: not ours
	LD	A,(CONMOD)
	RRCA			; bit 0: CMCRT and CMUC1, the video modes
	LD	A,TNENODV
	JP	NC,HWERR	; serial or batch: no screen
	LD	A,B
	OR	A
	JP	Z,HWOK		; no source read or cursor change for zero count
	PUSH	BC
	PUSH	DE
	PUSH	HL
	CALL	CURHIDE		; the cursor's cell put right first, so a
	POP	HL		; character written there is not later
	POP	DE		; turned to its reverse image
	POP	BC
	LD	A,(VHGT)
	DEC	A
	CP	D
	JP	C,HWOK		; row D past the last: nothing written
HWSPL:	LD	A,(VWID)
	CP	E
	JP	Z,HWOK		; column E at or past the width:
	JP	C,HWOK		; the rest is clipped
	LD	A,(HL)
	PUSH	BC		; count, row and column, and the source,
	PUSH	DE		; across the driver
	PUSH	HL
	LD	B,D		; VPUT takes row B, column C
	LD	C,E
	CALL	VPUT		; character A drawn in the cell
	POP	HL
	POP	DE
	POP	BC
	INC	HL		; the next character, one column on
	INC	E
	DJNZ	HWSPL
	JP	HWOK

; ---- Clock ------------------------------------------------------------------
; RTC. B = 0 reads, B = 1 sets, the seven BCD bytes at HL: seconds, minutes,
; hours, date, month, weekday, year. TNEBAD for any other B, TNENODV with no
; DS1302. Setting turns the clock's write protect off for the burst, whose
; control byte puts it on again. Returns HL past the seven. Destroys AF, BC,
; D, and E when setting.
HWSRTC:	LD	A,B		; 0 read or 1 set, and nothing else
	CP	2
	LD	A,TNEBAD
	JP	NC,HWERR	; refused, the clock untouched (A1)
	PUSH	BC		; B, the direction, across the probe
	CALL	RTCHAS
	POP	BC
	LD	A,TNENODV
	JP	NZ,HWERR	; no clock answered
	LD	A,B
	OR	A
	JR	NZ,HWSRW	; B = 1: set
	LD	D,$BF		; clock burst read
	CALL	RTCCMD
	LD	B,7		; the seven time bytes, not the control
HWSRR:	CALL	RTCRD
	LD	(HL),D
	INC	HL
	DJNZ	HWSRR
	JR	RTCEND		; the burst ended by the enable going low
HWSRW:	LD	DE,$8E00	; write protect off
	CALL	RTCPUT
	LD	D,$BE		; burst write: 7 bytes and the control
	CALL	RTCCMD
	LD	B,7
HWSRV:	LD	D,(HL)		; each time byte in turn
	CALL	RTCWR
	INC	HL
	DJNZ	HWSRV
	LD	D,$80		; the control byte: write protect on again
	CALL	RTCWR
RTCEND:	XOR	A		; enable low: the transfer ends
	OUT	(RTCPORT),A
	JP	HWOK

; Z when a DS1302 answers: its seconds register reads below 60h. Returns A =
; 0 with Z, or A = 1 with NZ. Keeps BC. Destroys F and D.
RTCHAS:	LD	D,$81		; read the seconds register
	CALL	RTCCMD
	CALL	RTCRD
	XOR	A		; enable low: the transfer ends
	OUT	(RTCPORT),A
	LD	A,D
	CP	$60		; 60h or above is no BCD second
	JR	NC,RTCNO
	XOR	A		; A = 0, Z
	RET
RTCNO:	OR	1		; A = 1, NZ
	RET
; Write register D = E: D is the register's write command. Ends with the
; chip disabled. Keeps BC and E. Destroys AF and D.
RTCPUT:	CALL	RTCCMD
	LD	D,E		; the value follows the command
	CALL	RTCWR
	XOR	A		; enable low: the write is done
	OUT	(RTCPORT),A
	RET
; Enable the chip and send the command byte in D. Keeps BC. Destroys AF and
; D.
RTCCMD:	LD	A,$10		; enable high, clock low
	OUT	(RTCPORT),A
; Send D, least significant bit first, the chip left enabled with the clock
; high. Keeps BC. Destroys AF; D ends 0.
RTCWR:	PUSH	BC
	LD	B,8
RTCW1:	SRL	D		; the next bit, from bit 0, to carry
	LD	A,$20
	RRA			; data bit to bit 7, enable to bit 4
	OUT	(RTCPORT),A	; the bit set up with the clock low
	OR	$40		; clock high
	OUT	(RTCPORT),A	; the chip takes the bit on this edge
	DJNZ	RTCW1
	POP	BC
	RET
; D = the next byte from the clock, least significant bit first, the chip
; left enabled. Keeps BC. Destroys AF.
RTCRD:	PUSH	BC
	LD	BC,8*256+RTCPORT
	LD	D,0		; B = 8 bits, C = the port, D the byte
RTCR1:	LD	A,$70		; clock high, read, enabled
	OUT	(C),A
	AND	$BF		; clock low: the chip puts out the next bit
	OUT	(C),A
	IN	A,(C)		; the bit on bit 0,
	RRA			; to carry
	RR	D		; and into D from the top
	DJNZ	RTCR1
	POP	BC
	RET

; TNFONT: HL = the console font in the ROM, the one both display drivers draw
; from (KD-159). Destroys AF.
HWSFONT:LD	HL,FONT
	JP	HWOK

; TNDRVR: B = the mode, then VIDHOOK's: HL = the driver's table, or 0 to drop
; it. Returns A = 0, carry clear, and HL = LINEBUF for a table taken. A
; refusal returns A = TNEBAD with carry, or TNENODV for a table offered by a
; line from STARTUP.CMD while CON: is CRT:: that driver would only give way
; to the ROM's console, so it stays out, quietly, and leaves the services'
; stack room to others (KE-200). Destroys DE, and HL for a drop.
SVDRV:	LD	A,B
	CP	CMUC1		; UC1: alone: CRT:'s table is the ROM's
	JR	Z,SVDRV1	; (KS39), and no other B has a word
	LD	A,TNEBAD	; refused, nothing changed
	SCF
	RET
SVDRV1:	LD	A,H		; a drop is never refused
	OR	L
	JR	Z,SVDRV2
	LD	A,(STFLAG)	; FFh in a startup line: D = 0 there
	CPL
	LD	D,A
	LD	A,(IOBYTE)	; the CON: field, 1 for CRT:
	AND	3
	DEC	A		; 0 for CRT:
	OR	D		; 0 for CRT: in a startup line
	LD	A,TNENODV	; then refused, as an absent device
	SCF			; is, nothing changed
	RET	Z
SVDRV2:	LD	A,B		; UC1:, the mode, for VIDHOOK
	CALL	VIDHOOK
	LD	A,TNEBAD	; kept already, or no matrix keyboard
	RET	C
	XOR	A		; taken or dropped: A = 0, carry clear
	RET
