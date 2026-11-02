; DEMO.COM: the TEC-1G's hardware. A beep, then until a key is pressed: a
; title on the 20 x 4 LCD with the time on its last row when a DS1302 clock
; answers, a hex counter on the 7-segment digits, a moving rainbow on the
; 8 x 8 LEDs and, on a PICO9918, colour bars with a bouncing ball in
; Graphics I that takes a random colour at each bounce. The screen goes back
; to the console when it stops. The segment patterns, the LED scan and the
; random numbers are its own: the ROM drives neither of those displays.
%INCLUDE "../../src/abi.inc"

BDOS    EQU     $0005
HWSVC   EQU     ABIHW           ; hardware services
VDPDAT  EQU     $BE
VDPCTL  EQU     $BF
LEDSEL	EQU	$05		; 8 x 8 matrix: row select, then the colours
LEDR	EQU	$06		; red, green and blue columns
LEDG	EQU	$F8
LEDB	EQU	$F9

        ORG     $0100
        LD      HL,ABITAB       ; TEC-OS's table
        LD      DE,ABITAG
        LD      B,3
CHKTAG: LD      A,(DE)
        CP      (HL)
        JP      NZ,NOHW
        INC     HL
        INC     DE
        DJNZ    CHKTAG
	LD	A,(ABIMAJ)	; another major has other numbers
	CP	4		; exactly: a later major may renumber
	JP	NZ,NOHW

	LD	C,HWINFO	; which devices answered
        CALL    HWSVC
        LD      A,B
        LD      (DEVS),A
        LD      DE,TITLE
        CALL    PRINT
        LD      DE,PICOMSG
        LD      A,(DEVS)
        AND     2
        CALL    YESNO
        LD      DE,GLCDMSG
        LD      A,(DEVS)
        AND     4
        CALL    YESNO
        LD      DE,CLKMSG
        LD      A,(DEVS)
        AND     8
        CALL    YESNO
        LD      DE,KEYMSG
        CALL    PRINT
        LD      B,120           ; TONE: about 1 kHz for 0.2 s
        LD      DE,400
	LD	C,HWTONE	; the beep
        CALL    HWSVC

        LD      HL,LCDTXT       ; the LCD's four rows
        LD      B,0
LCDLP:  PUSH    BC
        PUSH    HL
	LD	C,HWLCD		; row B, 20 characters from HL
        CALL    HWSVC
        POP     HL
        LD      DE,20
        ADD     HL,DE
        POP     BC
        INC     B
        LD      A,B
        CP      4
        JR      NZ,LCDLP

        LD      A,(DEVS)        ; claim the PICO9918 if there is one
        AND     2
        JR      Z,LOOP
        LD      B,1
	LD	C,HWVIDEO	; B = 1: the claim, then the ports are ours
        CALL    HWSVC
        LD      A,1
        LD      (CLAIMED),A
        CALL    VDPSET

LOOP:   LD      HL,FR
        INC     (HL)
        LD      A,(HL)
        AND     31
        CALL    Z,CLOCK
        CALL    COUNT
        CALL    MKDIG
        LD      HL,DIGBUF       ; DIGITS: one scan
	LD	C,HWDIGIT	; six patterns from HL
        CALL    HWSVC
        CALL    MKLED
	LD	HL,LEDBUF	; one scan of the LEDs
	CALL	LEDSCAN		; no hardware service does them
        LD      A,(CLAIMED)
        OR      A
        CALL    NZ,BALL
        LD      E,$FF           ; stop on any key
        LD      C,6
        CALL    BDOS
        OR      A
        JR      Z,LOOP

        LD      HL,ZEROS        ; digits and LEDs off
	LD	C,HWDIGIT	; a dark pass
        CALL    HWSVC
        LD      HL,ZEROS
	CALL	LEDSCAN		; a dark pass
        LD      A,(CLAIMED)     ; give the screen back to the console
        OR      A
        JR      Z,DONE
        LD      B,0
	LD	C,HWVIDEO	; B = 0: release, and text comes back
        CALL    HWSVC
DONE:   LD      DE,BYE
        JP      PRINT

NOHW:   LD      DE,NOHWMSG
PRINT:  LD      C,9
        JP      BDOS

; Print the label at DE, then yes when A is nonzero, else no.
YESNO:  PUSH    AF
        CALL    PRINT
        POP     AF
        LD      DE,YESMSG
        OR      A
        JR      NZ,PRINT
        LD      DE,NOMSG
        JR      PRINT

; ---- Clock ---------------------------------------------------------------------

; LCD row 3 = the DS1302's time, when there is one.
CLOCK:  LD      A,(DEVS)
        AND     8
        RET     Z
        LD      HL,TIME         ; RTC: seconds, minutes, hours, ...
        LD      B,0
	LD	C,HWRTC		; B = 0: read
        CALL    HWSVC
        RET     NZ
        LD      HL,CLKROW+9
        LD      A,(TIME+2)
        CALL    BCD2
        INC     HL
        LD      A,(TIME+1)
        CALL    BCD2
        INC     HL
        LD      A,(TIME)
        CALL    BCD2
        LD      HL,CLKROW       ; LCDROW 3
        LD      B,3
	LD	C,HWLCD		; the last row
        JP      HWSVC
; (HL), (HL+1) = the two BCD digits of A; HL moves past them.
BCD2:   PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    BCD1
        POP     AF
BCD1:   AND     $0F
        ADD     A,'0'
        LD      (HL),A
        INC     HL
        RET

; ---- 7-segment counter ------------------------------------------------------

COUNT:  LD      HL,CNT
        INC     (HL)
        RET     NZ
        INC     HL
        INC     (HL)
        RET     NZ
        INC     HL
        INC     (HL)
        RET

; DIGBUF = the six hex digits of the 24-bit counter, leftmost first.
MKDIG:  LD      HL,CNT+2
        LD      DE,DIGBUF
        LD      B,3
MKDL:   PUSH    BC
        PUSH    HL
        LD      A,(HL)
        PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    SEG
        POP     AF
        CALL    SEG
        POP     HL
        DEC     HL
        POP     BC
        DJNZ    MKDL
        RET
; The low four bits of A as a segment pattern at DE, which moves on. Destroys
; AF, BC and HL.
SEG:	AND	$0F		; one hex digit
	LD	C,A
	LD	B,0		; BC = the digit
	LD	HL,SEGTAB
	ADD	HL,BC		; the digit's own pattern
	LD	A,(HL)
	LD	(DE),A		; into the caller's buffer
	INC	DE
	RET

; ---- 8 x 8 rainbow ----------------------------------------------------------

; Each LED gets colour (row + column + phase) mod 8, with 0 shown as white:
; bit 0 red, bit 1 green, bit 2 blue. The phase moves every 8 frames.
MKLED:  LD      A,(FR)
        RRCA
        RRCA
        RRCA
        AND     7
        LD      (PH),A
        LD      HL,LEDBUF
        LD      (LPTR),HL
        LD      D,0             ; row
MKLR:   LD      BC,0            ; B red, C green, H blue
        LD      H,0
        LD      E,7             ; column, from the right
MKLC:   LD      A,(PH)
        ADD     A,D
        ADD     A,E
        AND     7
        JR      NZ,MKL0
        LD      A,7
MKL0:   LD      L,A
        SLA     B
        SLA     C
        SLA     H
        SRL     L
        JR      NC,MKL1
        SET     0,B
MKL1:   SRL     L
        JR      NC,MKL2
        SET     0,C
MKL2:   SRL     L
        JR      NC,MKL3
        SET     0,H
MKL3:   DEC     E
        JP      P,MKLC
        LD      A,H
        LD      HL,(LPTR)
        LD      (HL),B
        INC     HL
        LD      (HL),C
        INC     HL
        LD      (HL),A
        INC     HL
        LD      (LPTR),HL
        INC     D
        LD      A,D
        CP      8
        JR      NZ,MKLR
        RET

; One pass over the eight rows of red, green and blue bytes at HL, each row lit
; for about 0.4 ms, then all off. Each row's colours go out with the rows dark
; from the pass before. Destroys AF, BC and HL.
LEDSCAN:
	LD	C,1		; the row's select bit
LEDSL:	LD	A,(HL)		; red
	OUT	(LEDR),A
	INC	HL
	LD	A,(HL)		; green
	OUT	(LEDG),A
	INC	HL
	LD	A,(HL)		; blue
	OUT	(LEDB),A
	INC	HL
	LD	A,C		; the row lights
	OUT	(LEDSEL),A
	LD	B,128		; about 0.4 ms at 4 MHz
LEDSD:	DJNZ	LEDSD
	XOR	A		; dark before the next row's colours
	OUT	(LEDSEL),A
	SLA	C
	JR	NC,LEDSL	; the bit has left after the eighth row
	RET

; ---- PICO9918 Graphics I ----------------------------------------------------

; Graphics I: names 1800h, colours 2000h, patterns 0000h, sprite attributes
; 1B00h, sprite patterns 3800h, 16 x 16 sprites, black border.
VDPSET: LD      HL,VDPREGS
        LD      C,$80
VDPR:   LD      A,(HL)
        OUT     (VDPCTL),A
        LD      A,C
        OUT     (VDPCTL),A
        INC     HL
        INC     C
        LD      A,C
        CP      $88
        JR      NZ,VDPR
        LD      HL,$0000        ; patterns: every eighth one solid, the rest blank
        CALL    VWA
        LD      D,0
VPAT:   LD      A,D
        AND     7
        LD      A,0
        JR      NZ,VPAT1
        DEC     A
VPAT1:  LD      B,8
VPAT2:  OUT     (VDPDAT),A
        DJNZ    VPAT2
        INC     D
        JR      NZ,VPAT
        LD      HL,$2000        ; colours: eight bars, then black
        CALL    VWA
        LD      HL,BARS
        LD      B,32
VCOL:   LD      A,(HL)
        OUT     (VDPDAT),A
        INC     HL
        DJNZ    VCOL
        LD      HL,$1800        ; names: bars four columns wide
        CALL    VWA
        LD      D,24
VNR:    LD      E,0
VNC:    LD      A,E
        AND     $1C             ; (column / 4) * 8: a solid pattern in group column / 4
        ADD     A,A
        OUT     (VDPDAT),A
        INC     E
        LD      A,E
        CP      32
        JR      NZ,VNC
        DEC     D
        JR      NZ,VNR
        LD      HL,$3800        ; the ball
        CALL    VWA
        LD      HL,BALLPAT
        LD      B,32
VBP:    LD      A,(HL)
        OUT     (VDPDAT),A
        INC     HL
        DJNZ    VBP
        LD      HL,$1B00        ; one sprite, white, then the end marker
        CALL    VWA
        LD      A,(BY)
        OUT     (VDPDAT),A
        LD      A,(BX)
        OUT     (VDPDAT),A
        XOR     A
        OUT     (VDPDAT),A
        LD      A,$0F
        OUT     (VDPDAT),A
        LD      A,$D0
        OUT     (VDPDAT),A
        RET

; Move the ball two pixels and bounce it off the edges.
BALL:   LD      HL,BX
        LD      DE,DX
        LD      C,240
        CALL    STEP
        LD      HL,BY
        LD      DE,DY
        LD      C,176
        CALL    STEP
        LD      HL,$1B00
        CALL    VWA
        LD      A,(BY)
        OUT     (VDPDAT),A
        LD      A,(BX)
        OUT     (VDPDAT),A
        LD      A,(BOUNCE)
        OR      A
        RET     Z
        XOR     A
        LD      (BOUNCE),A
	CALL	RANDOM		; a new colour, 8-15
        AND     7
        OR      8
        PUSH    AF
        LD      HL,$1B03
        CALL    VWA
        POP     AF
        OUT     (VDPDAT),A
        RET
; The next of the xorshift16 (7, 9, 8) numbers, period 65,535 from any nonzero
; seed. Returns it in HL, with its low byte in A too. Destroys F.
RANDOM:	LD	HL,(SEED)	; the last number
	LD	A,H		; x ^= x << 7, as two rotates through carry
	RRA
	LD	A,L
	RRA
	XOR	H
	LD	H,A		; the first step's high byte
	LD	A,L		; x ^= x >> 9
	RRA
	LD	A,H
	RRA
	XOR	L
	LD	L,A		; the second step's low byte
	XOR	H		; x ^= x << 8
	LD	H,A
	LD	(SEED),HL	; for the next call
	LD	A,L		; the byte callers use
	RET

; (HL) += (DE), reversing (DE) at 0 and at C.
STEP:   LD      A,(DE)
        ADD     A,(HL)
        LD      (HL),A
        CP      C
        JR      NC,STEPR
        OR      A
        RET     NZ
STEPR:  LD      A,(DE)
        NEG
        LD      (DE),A
        LD      (BOUNCE),A
        RET

; Set the VRAM write address to HL.
VWA:    LD      A,L
        OUT     (VDPCTL),A
        LD      A,H
        OR      $40
        OUT     (VDPCTL),A
        RET

; ---- Data -------------------------------------------------------------------

ABITAG: DB      "TNA"
TITLE:  DB      13,10,"TEC-OS hardware services demo",13,10,"$"
PICOMSG:DB      "PICO9918: $"
GLCDMSG:DB      "   GLCD: $"
CLKMSG: DB      "   clock: $"
YESMSG: DB      "yes$"
NOMSG:  DB      "no$"
KEYMSG: DB      13,10,"Watch the LCD, the digits, the LEDs and the screen.",13,10
        DB      "Press any key to stop.",13,10,"$"
BYE:    DB      13,10,"Demo stopped.",13,10,"$"
NOHWMSG:
	DB	13,10,"DEMO needs TEC-OS with ABI 4.",13,10,"$"
LCDTXT: DB      "TEC-OS hardware demo"
        DB      "7-seg: hex counter  "
        DB      "8x8: moving rainbow "
        DB      "PICO9918: Graphics I"
VDPREGS:DB      $00,$C2,$06,$80,$00,$36,$07,$01
BARS:   DB      $81,$91,$A1,$B1,$31,$21,$71,$51
        DB      $11,$11,$11,$11,$11,$11,$11,$11
        DB      $11,$11,$11,$11,$11,$11,$11,$11
        DB      $11,$11,$11,$11,$11,$11,$11,$11
BALLPAT:DB      $07,$1F,$3F,$7F,$7F,$FF,$FF,$FF
        DB      $FF,$FF,$FF,$7F,$7F,$3F,$1F,$07
        DB      $E0,$F8,$FC,$FE,$FE,$FF,$FF,$FF
        DB      $FF,$FF,$FF,$FE,$FE,$FC,$F8,$E0
BX:     DB      40
BY:     DB      60
DX:     DB      2
DY:     DB      2
; The digits 0-9 and A-F as segment patterns.
SEGTAB:	DB	$EB,$28,$CD,$AD,$2E,$A7,$E7,$29
	DB	$EF,$AF,$6F,$E6,$C3,$EC,$C7,$47
SEED:	DW	$ACE1
ZEROS:  DB      0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
DEVS:   DB      0
CLAIMED:DB      0
BOUNCE: DB      0
CLKROW: DB      "Time     00:00:00   "
TIME:   DS      7
FR:     DB      0
PH:     DB      0
CNT:    DB      0,0,0
LPTR:   DW      0
DIGBUF: DS      6
LEDBUF: DS      24
