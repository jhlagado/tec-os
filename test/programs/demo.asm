; DEMO.COM: beep, show a hex counter and an LED rainbow, and move a ball
; over PICO9918 colour bars until a nonzero console key arrives. LCD row 3
; shows the time while RTC reads succeed. Requires TNA and ABI major 5.
; Segment patterns, LED multiplexing and random state are local; ROM scans
; the six digits. Video ownership is cooperative; VDP address pairs are not
; interrupt-atomic.
; ABI calls use this stack and may destroy registers not named as results.
%INCLUDE "../../src/abi.inc"

BDOS    EQU     $0005
HWSVC   EQU     ABICALL         


LEDSEL	EQU	$05		
LEDR	EQU	$06		
LEDG	EQU	$F8
LEDB	EQU	$F9

        ORG     $0100
        LD      HL,ABITAB       
        LD      DE,ABITAG
        LD      B,3
CHKTAG: LD      A,(DE)
        CP      (HL)
        JP      NZ,NOHW
        INC     HL
        INC     DE
        DJNZ    CHKTAG
	LD	A,(ABIMAJ)	; exact major: service numbers can move
	CP	5		
	JP	NZ,NOHW

; INFO reads flags, not devices: PICO/RTC presence comes from cold boot;
; GLCD presence and video claim are current. Save this mixed snapshot.
	LD	C,TNINFO	
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
; About 1 kHz for 0.2 s at 4 MHz; service overhead and interrupts affect it.
        LD      B,120           
        LD      DE,400
	LD	C,TNTONE	
        CALL    HWSVC

; Four 20-character LCD rows; save loop state across each service call.
        LD      HL,LCDTXT       
        LD      B,0
LCDLP:  PUSH    BC
        PUSH    HL
	LD	C,TNLCD		
        CALL    HWSVC
        POP     HL
        LD      DE,20
        ADD     HL,DE
        POP     BC
        INC     B
        LD      A,B
        CP      4
        JR      NZ,LCDLP

; Claim only when the saved PICO bit is set. The client does not check the
; result; it relies on the ROM accepting a valid present-device claim.
        LD      A,(DEVS)        
        AND     2
        JR      Z,LOOP
        LD      B,1
	LD	C,TNVIDEO	
        CALL    HWSVC
        LD      A,1
        LD      (CLAIMED),A
        CALL    VDPSET

; FR counts loops, not video frames. Read the clock every 32 iterations;
; scan digits and LEDs once per pass, then poll for nonzero BDOS 6 input.
LOOP:   LD      HL,FR
        INC     (HL)
        LD      A,(HL)
        AND     31
        CALL    Z,CLOCK
        CALL    COUNT
        CALL    MKDIG
        LD      HL,DIGBUF       
	LD	C,TNDIGIT	
        CALL    HWSVC
        CALL    MKLED
	LD	HL,LEDBUF	
	CALL	LEDSCAN		
        LD      A,(CLAIMED)
        OR      A
        CALL    NZ,BALL
        LD      E,$FF           
        LD      C,6
        CALL    BDOS
        OR      A
        JR      Z,LOOP

; Zero scans darken digits and LEDs. Release a claimed PICO; text restoration
; depends on the ROM's active console and driver, not a full state rollback.
        LD      HL,ZEROS        
	LD	C,TNDIGIT	
        CALL    HWSVC
        LD      HL,ZEROS
	CALL	LEDSCAN		
        LD      A,(CLAIMED)     
        OR      A
        JR      Z,DONE
        LD      B,0
	LD	C,TNVIDEO	
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

; Try RTC only if INFO saw it at cold boot. Each read probes again; failure
; leaves row 3 alone. A successful read supplies its HH:MM:SS display.
CLOCK:  LD      A,(DEVS)
        AND     8
        RET     Z
        LD      HL,TIME         
        LD      B,0
	LD	C,TNRTC		
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
        LD      HL,CLKROW       
        LD      B,3
	LD	C,TNLCD		
        JP      HWSVC
; BCD2 writes both nibbles of A as ASCII and advances HL by two;
; BCD1 writes one. Neither validates BCD.
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
SEG:	AND	$0F		
	LD	C,A
	LD	B,0		
	LD	HL,SEGTAB
	ADD	HL,BC		
	LD	A,(HL)
	LD	(DE),A		
	INC	DE
	RET

; Build eight RGB triples: colour = (row + column + phase) mod 8; zero is white.
; Bits 0/1/2 select red/green/blue. Phase advances every eight loop iterations,
; not at a measured display rate.
MKLED:  LD      A,(FR)
        RRCA
        RRCA
        RRCA
        AND     7
        LD      (PH),A
        LD      HL,LEDBUF
        LD      (LPTR),HL
        LD      D,0             
MKLR:   LD      BC,0            
        LD      H,0
        LD      E,7             
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

; Scan eight RGB triples at HL, darkening each row before the next.
; Entry assumes rows already dark; it does not blank before the first RGB.
; At 4 MHz each delay is about 0.4 ms, subject to interrupt/NMI jitter.
; Returns all rows dark; destroys AF, BC and HL.
LEDSCAN:
	LD	C,1		
LEDSL:	LD	A,(HL)		
	OUT	(LEDR),A
	INC	HL
	LD	A,(HL)		
	OUT	(LEDG),A
	INC	HL
	LD	A,(HL)		
	OUT	(LEDB),A
	INC	HL
	LD	A,C		
	OUT	(LEDSEL),A
	LD	B,128		
LEDSD:	DJNZ	LEDSD
	XOR	A		
	OUT	(LEDSEL),A
	SLA	C
	JR	NC,LEDSL	
	RET

; With video claimed, Graphics I: names 1800h, colours 2000h, patterns 0000h,
; sprite attributes 1B00h, sprite patterns 3800h, 16 x 16 sprites, black border.
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
        LD      HL,$0000        
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
        LD      HL,$2000        
        CALL    VWA
        LD      HL,BARS
        LD      B,32
VCOL:   LD      A,(HL)
        OUT     (VDPDAT),A
        INC     HL
        DJNZ    VCOL
        LD      HL,$1800        
        CALL    VWA
        LD      D,24
VNR:    LD      E,0
VNC:    LD      A,E
        AND     $1C             
        ADD     A,A
        OUT     (VDPDAT),A
        INC     E
        LD      A,E
        CP      32
        JR      NZ,VNC
        DEC     D
        JR      NZ,VNR
        LD      HL,$3800        
        CALL    VWA
        LD      HL,BALLPAT
        LD      B,32
VBP:    LD      A,(HL)
        OUT     (VDPDAT),A
        INC     HL
        DJNZ    VBP
        LD      HL,$1B00        
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

; Move each axis by its signed two-pixel step, with bounds 240/176.
; A bounce on either axis chooses one new colour, 8-15, for this loop.
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
	CALL	RANDOM		
        AND     7
        OR      8
        PUSH    AF
        LD      HL,$1B03
        CALL    VWA
        POP     AF
        OUT     (VDPDAT),A
        RET
; The xorshift16 (7, 9, 8) recurrence has period 65,535 for nonzero state.
; Save the next state; return HL and A = L. Destroys F.
RANDOM:	LD	HL,(SEED)	
	LD	A,H		
	RRA
	LD	A,L
	RRA
	XOR	H
	LD	H,A		
	LD	A,L		
	RRA
	LD	A,H
	RRA
	XOR	L
	LD	L,A		
	XOR	H		
	LD	H,A
	LD	(SEED),HL	
	LD	A,L		
	RET

; Add (DE) to (HL); reverse direction and set BOUNCE at result 0 or >= C.
; Actual positions are even, steps +/-2, bounds 240/176. Overshoot is not clamped.
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

; Set VRAM write address HL, low byte then high | 40h; the pair is not atomic.
VWA:    LD      A,L
        OUT     (VDPCTL),A
        LD      A,H
        OR      $40
        OUT     (VDPCTL),A
        RET

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
	DB	13,10,"DEMO needs TEC-OS with ABI 5.",13,10,"$"
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
; Distribution checks these final 6 + 24 zero-byte reserves.
DIGBUF: DS      6
LEDBUF: DS      24
