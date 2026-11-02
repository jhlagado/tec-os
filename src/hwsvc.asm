; Hardware services, ABI 4.0 (docs/rom-services.md). CALL ABIHW with the
; number in C, from HWBASE, and arguments in B, DE and HL. Returns A = status
; with Z and carry clear on success; results as each one says. IX, IY and
; the alternate registers are preserved. Any program may call them: they run on
; the caller's stack (at most 22 bytes, PUTAT on a GLCD console being the
; deepest) and keep their state in the resident workspace. Numbers and status
; codes are in abi.inc too, and the build checks that the two agree.
;
; These are the calls that would otherwise fight the OS for a port: the
; digit and speaker port (01h) also carries the serial transmit line, which
; must stay idle, and the PICO9918 is the console.

HWINFO	EQU	19		; B = devices (CONDEV's bits, HWBRTC, HWBCLM),
				; DE = ROM version,
				; L = console columns, H = rows (0 for serial)
HWDIGIT	EQU	20		; HL -> 6 segment bytes, leftmost first
HWLCD	EQU	21		; B = row 0-3, HL -> 20 characters
HWVIDEO	EQU	22		; B = 1 claim the PICO9918, 0 give it back
HWTONE	EQU	23		; B = half period (16 T-states a unit),
				; DE = half cycles
HWJOY	EQU	24		; B = joystick bits, 1 for each one pressed
HWKEYS	EQU	25		; HL -> 8 bytes: the matrix rows
HWPUTAT	EQU	26		; D = row, E = column, B = count,
				; HL -> characters
HWRTC	EQU	27		; B = 0 read, 1 set the 7 BCD bytes at HL
HWCOUNT	EQU	9		; how many follow HWBASE
HWBASE	EQU	19		; the first number no ABI 3 program used

HWEBAD	EQU	1		; no such number, or an argument out of range
HWENODV	EQU	2		; the device is not fitted

; INFO's bits in B. The build checks them against CONDEV's CD* bits, which
; they name for programs.
HWBMTX	EQU	$01		; a matrix keyboard
HWBPICO	EQU	$02		; a PICO9918 answered at cold boot
HWBGLCD	EQU	$04		; GLCD.SVC is in
HWBRTC	EQU	$08		; a DS1302 clock answers
HWBCLM	EQU	$10		; the PICO9918 is claimed
HWBWRD	EQU	$80		; a word of the ROM's is on LCD row 3

RTCPORT EQU     $FC             ; DS1302: bit 4 enable, 6 clock, 7 data out,
                                ; 5 data in, read on bit 0

SEGPORT EQU     $02             ; 7-segment segment latch
TXIDLE  EQU     $40             ; port 01h bit 6: serial line idle, speaker off
HWTAB0	EQU	HWTAB-2*HWBASE	; the table as C indexes it

; The dispatcher. C = the number, B, DE and HL its arguments, which reach it
; whole. Any number outside HWBASE to HWBASE+8 returns HWEBAD with the other
; registers as they were, so an ABI 3 program's old numbers do nothing. Destroys
; AF and what the hardware service does.
HWSVC:	LD	A,C		; below HWBASE wraps to a large number
	SUB	HWBASE
	CP	HWCOUNT
	LD	A,HWEBAD
	JR	NC,HWERR	; past the table
	PUSH	HL		; the arguments, across the lookup
	PUSH	DE
	LD	A,C		; two bytes an entry
	ADD	A,A
	LD	E,A
	LD	D,0		; DE = the entry's offset
	LD	HL,HWTAB0	; C counts from HWBASE
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

; The INFO hardware service. Returns B = CONDEV's bits, with HWBRTC if a DS1302 answers
; (seconds below 60h) and HWBCLM, which is VCLAIM's value, while the PICO9918
; is claimed; DE = the ROM's version; HL = columns and rows.
HWSINFO:
	CALL	RTCHAS
	LD	A,(CONDEV)	; the flags are still RTCHAS's
	JR	NZ,HWSIN1
	OR	HWBRTC		; the clock answered
HWSIN1:	LD	HL,VCLAIM	; holds HWBCLM's value while claimed
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
        LD      A,HWEBAD
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
HWSVID: LD      A,(CONDEV)
        AND     CDTMS
        LD      A,HWENODV
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
        LD      A,HWENODV
        JP      NZ,HWERR
        LD      A,(CONMOD)
        RRCA
        LD      A,HWENODV
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
HWSRTC: PUSH    BC
        CALL    RTCHAS
        POP     BC
        LD      A,HWENODV
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
