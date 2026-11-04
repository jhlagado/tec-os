; The numbered services, ABI 5.0 (docs/rom-services.md). CALL ABICALL with the
; number in C and arguments in B, DE and HL; abi.inc names each number, its
; arguments, results, carry and stack. Returns A = 0 with Z and carry clear on
; success, or A = a status with carry. The hardware services, 0 to 8, and the
; driver hook's are here; the volumes' are vol.asm's and the registry's
; loader.asm's. Any program may call them: they run on the caller's stack and
; keep their state in the resident workspace.
;
; The hardware services are the calls that would otherwise fight the OS for a
; port: the digit and speaker port (01h) also carries the serial transmit line,
; which must stay idle, and the PICO9918 is the console.

RTCPORT EQU     $FC             ; DS1302: bit 4 enable, 6 clock, 7 data out,
                                ; 5 data in, read on bit 0

SEGPORT EQU     $02             ; 7-segment segment latch
TXIDLE  EQU     $40             ; port 01h bit 6: serial line idle, speaker off
; The dispatcher. C = the number, B, DE and HL its arguments, which reach the
; service whole. Any number from TNCOUNT up returns TNEBAD with the other
; registers as they were. Destroys AF and what the service does.
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
HWERR:  OR      A
        SCF
        RET
HWOK:   XOR     A
        RET

; INFO. Returns B = CONDEV's bits, the clock's from cold boot, with HWBCLM,
; VCLAIM's value, while the PICO9918 is claimed; DE = the ROM's version; HL =
; columns and rows. It reads no device.
HWSINFO:
	LD	A,(CONDEV)
	LD	HL,VCLAIM	; holds HWBCLM's value while claimed
	OR	(HL)
	LD	B,A
        LD      DE,ROMVER
        LD      HL,(VWID)
        JP      HWOK

; One pass over the six digits, each lit for about 0.8 ms; then all off.
HWSDIG: LD      C,$20           ; bit 5 is the leftmost digit
HWSDL:  LD      A,(HL)
        OUT     (SEGPORT),A
        LD      A,C
        OR      TXIDLE
        OUT     (DIGPORT),A
        LD      B,0
HWSDD:  DJNZ    HWSDD
        LD      A,TXIDLE
        OUT     (DIGPORT),A
        INC     HL
        SRL     C
        JR      NZ,HWSDL
        JP      HWOK

HWSLCD: LD      A,B
	CP	4
        LD      A,TNEBAD
	JR	NC,HWERR
        PUSH    HL
	LD	A,B		; a program takes row 3: no word of the ROM's
	CP	3		; is left there for a take to clear
	JR	NZ,HWSL1
	LD	HL,CONDEV
	RES	7,(HL)		; CDWRD
HWSL1:	LD	HL,LCDROWS
        LD      E,B
        LD      D,0
        ADD     HL,DE
        LD      A,(HL)
        CALL    LCDC
        POP     HL
        LD      B,20
HWSLC:  CALL    LCDWAIT
        LD      A,(HL)
        OUT     (LCDDAT),A
        INC     HL
        DJNZ    HWSLC
        JP      HWOK

; Claim: the console stops drawing on the PICO9918 (output to it is dropped,
; no cursor, no page flips) and the program owns its registers and VRAM.
; Release, or warm boot: with PICO.SVC in, text mode, font and page come back
; and the screen is cleared; with none, the VDP is left as the program left it.
HWSVID:	LD	A,B		; 0 or 1, and nothing else
	CP	2
	LD	A,TNEBAD
	JP	NC,HWERR	; refused, nothing changed (A1)
	LD	A,(CONDEV)
        AND     CDTMS
        LD      A,TNENODV
        JP      Z,HWERR
        LD      A,B
        OR      A
        JR      Z,HWVREL
        LD      A,(CONMOD)
        CP      CMCRT
        CALL    Z,CURHIDE
	LD	A,CDCLM		; HWBCLM, as INFO reports it
        LD      (VCLAIM),A
        JP      HWOK
HWVREL: LD      A,(VCLAIM)
        OR      A
        JP      Z,HWOK
        XOR     A
        LD      (VCLAIM),A
        LD      HL,(PIVEC)      ; registers, font, page shown, by its driver
        LD      A,H
        OR      L
        JP      Z,HWOK          ; none: nothing is restored
        LD      DE,6
        ADD     HL,DE
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        CALL    VHLJP
        LD      A,(CONMOD)
        CP      CMCRT
        JP      NZ,HWOK
        CALL    VTCLS
        XOR     A
        LD      (VROW),A
        LD      (VCOL),A
        JP      HWOK

; ---- Speaker ------------------------------------------------------------------
; Square wave on port 01h bit 7: DE half cycles of B units of 16 T-states
; (plus 51 a half cycle), the serial line held idle throughout.
HWSTONE:LD      A,D
        OR      E
        JP      Z,HWOK
        LD      A,TXIDLE
HWSTL:  XOR     $80
        OUT     (DIGPORT),A
        LD      C,B
HWSTD:  DEC     C
        JR      NZ,HWSTD
        DEC     DE
        LD      C,A
        LD      A,D
        OR      E
        LD      A,C
        JR      NZ,HWSTL
        LD      A,TXIDLE
        OUT     (DIGPORT),A
        JP      HWOK

; ---- Joystick and keys ----------------------------------------------------------
HWSJOY: LD      BC,$F7FE        ; port FEh with address line 11 low
        IN      A,(C)
        CPL
        LD      B,A
        JP      HWOK

HWSKEYS:LD      BC,$FEFE        ; row select in the high byte, one bit low
HWSKL:  IN      A,(C)
        CPL
        LD      (HL),A
        INC     HL
        RLC     B
        JR      C,HWSKL
        JP      HWOK

; ---- Text at a position -----------------------------------------------------------
; On a video console, B characters from HL at row D, column E, clipped to the
; screen, without moving the cursor. Status 2 on the serial terminal, or while
; the PICO9918 is claimed and is the console.
HWSPUT: CALL    VTOWN
        LD      A,TNENODV
        JP      NZ,HWERR
        LD      A,(CONMOD)
        RRCA
        LD      A,TNENODV
        JP      NC,HWERR
        LD      A,B
        OR      A
        JP      Z,HWOK          ; no source read or cursor change for zero count
        PUSH    BC
        PUSH    DE
        PUSH    HL
        CALL    CURHIDE
        POP     HL
        POP     DE
        POP     BC
        LD      A,(VHGT)
        DEC     A
        CP      D
        JP      C,HWOK
HWSPL:  LD      A,(VWID)
        CP      E
        JP      Z,HWOK
        JP      C,HWOK
        LD      A,(HL)
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      B,D
        LD      C,E
        CALL    VPUT
        POP     HL
        POP     DE
        POP     BC
        INC     HL
        INC     E
        DJNZ    HWSPL
        JP      HWOK

; ---- Clock ------------------------------------------------------------------------------
; Seven BCD bytes at HL: seconds, minutes, hours, date, month, weekday, year.
HWSRTC:	LD	A,B		; 0 read or 1 set, and nothing else
	CP	2
	LD	A,TNEBAD
	JP	NC,HWERR	; refused, the clock untouched (A1)
	PUSH	BC
        CALL    RTCHAS
        POP     BC
        LD      A,TNENODV
        JP      NZ,HWERR
        LD      A,B
        OR      A
        JR      NZ,HWSRW
        LD      D,$BF           ; clock burst read
        CALL    RTCCMD
        LD      B,7
HWSRR:  CALL    RTCRD
        LD      (HL),D
        INC     HL
        DJNZ    HWSRR
        JR      RTCEND
HWSRW:  LD      DE,$8E00        ; write protect off
        CALL    RTCPUT
        LD      D,$BE           ; clock burst write: 7 bytes and the control byte
        CALL    RTCCMD
        LD      B,7
HWSRV:  LD      D,(HL)
        CALL    RTCWR
        INC     HL
        DJNZ    HWSRV
        LD      D,0
        CALL    RTCWR
RTCEND: XOR     A
        OUT     (RTCPORT),A
        JP      HWOK

; Z when a DS1302 answers: its seconds register reads below 60h.
RTCHAS: LD      D,$81
        CALL    RTCCMD
        CALL    RTCRD
        XOR     A
        OUT     (RTCPORT),A
        LD      A,D
        CP      $60
        JR      NC,RTCNO
        XOR     A
        RET
RTCNO:  OR      1
        RET
; Write register D = E.
RTCPUT: CALL    RTCCMD
        LD      D,E
        CALL    RTCWR
        XOR     A
        OUT     (RTCPORT),A
        RET
; Enable the chip and send the command byte in D.
RTCCMD: LD      A,$10
        OUT     (RTCPORT),A
; Send D, least significant bit first.
RTCWR:  PUSH    BC
        LD      B,8
RTCW1:  SRL     D
        LD      A,$20
        RRA                     ; data bit to bit 7, enable to bit 4
        OUT     (RTCPORT),A
        OR      $40             ; clock high
        OUT     (RTCPORT),A
        DJNZ    RTCW1
        POP     BC
        RET
; D = the next byte from the clock.
RTCRD:  PUSH    BC
        LD      BC,8*256+RTCPORT
        LD      D,0
RTCR1:  LD      A,$70           ; clock high, read, enabled
        OUT     (C),A
        AND     $BF
        OUT     (C),A
        IN      A,(C)
        RRA
        RR      D
        DJNZ    RTCR1
        POP     BC
        RET

; TNFONT: HL = the console font in the ROM, the one both display drivers draw
; from (KD-159).
HWSFONT:LD	HL,FONT
	JP	HWOK

; TNDRVR: B = the mode, then VIDHOOK's. A refusal returns A = TNEBAD with carry.
SVDRV:	LD	A,B
	CP	CMCRT		; CRT: or UC1:, and nothing else:
	JR	Z,SVDRV1	; another B would index past PIVEC's
	CP	CMUC1		; pair of words (A1)
	JR	Z,SVDRV1
	LD	A,TNEBAD	; refused, nothing changed
	SCF
	RET
SVDRV1:	CALL	VIDHOOK
	LD	A,TNEBAD	; kept already, or no matrix keyboard
	RET	C
	XOR	A
	RET
