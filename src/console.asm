; Console: one device at a time, chosen by the IOBYTE CON: field.
;
;   TTY: (0)  serial terminal: keys and output on the serial port
;   CRT: (1)  PICO9918 screen and the matrix keyboard
;   BAT: (2)  CP/M batch: keys from the reader, the serial port; output to the
;             list device, which discards it
;   UC1: (3)  GLCD screen and the matrix keyboard
;
; Cold boot starts on TTY:, and a display driver's load takes the console. A
; program or the CCP's CON command may change the
; IOBYTE at any time; the next console call acts on it, clearing and homing
; the new screen. CRT: or UC1: without its display or keyboard falls back to
; the serial terminal. VWID and VHGT give the size of the console in use, 0
; for the serial terminal.
;
; Serial is bit-banged at 4800 baud, 8 data bits, no parity, 2 stop bits. TX
; is port 01h bit 6 (idle high), RX is port 03h bit 7. Reception has no
; hardware buffer, so a byte is caught only while one of these routines is
; polling. Reading port 00h first lets Debug80 start a queued input byte; on
; the board it reads the keypad encoder and has no effect. The delay counts
; (TXDLY, TXSTOP, RXHALF, RXDLY, RXPOLL) come from the generated configuration.

; The serial polling loops see a start bit up to 38 T-states late. RXHALF
; allows for half of that, so the samples land near the middle of each bit.

CONINIT:LD      A,$40
        OUT     (DIGPORT),A
        XOR     A
        LD      (RXFULL),A
        LD      (CONDEV),A
        LD      (VATTR),A
        LD      (VCURV),A
        LD      (ESCST),A
        LD      (CONMOD),A
        LD      (KBBASE),A
        DEC     A
        LD      (KBLAST),A
        LD      (KBE),A
        LD      (KBD),A
        LD      A,$FE
        LD      (KBMASK),A
        IN      A,(STSPORT)     ; the board's Matrix switch enables the keyboard
        AND     CDMTX
        LD      (CONDEV),A
        JP      VIDINIT

; Act on a changed IOBYTE CON: field. Preserves BC and DE.
CONSEL: LD      A,(IOBYTE)
        AND     3
        LD      HL,CONACT
        CP      (HL)
        RET     Z
        LD      (HL),A
        PUSH    BC
        PUSH    DE
        CALL    CONSW
        POP     DE
        POP     BC
        RET

CONSW:  LD      B,A
        RRCA
        LD      A,B
        JR      NC,CONSW2
        ADD     A,LOW(PIVEC)-1  ; CRT: or UC1:, its driver's table
        LD      L,A
        LD      H,HIGH(PIVEC)
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        OR      H
        JR      NZ,CONSWV
        JR      CONSWT
CONSW2: CP      CMBAT
        JR      Z,CONSWN
CONSWT: LD      A,CMTTY         ; the serial terminal, also the fallback
CONSWN: LD      (CONMOD),A
        LD      HL,0            ; no screen geometry
        LD      (VWID),HL
        RET
CONSWV: PUSH    BC              ; B = the video mode
        LD      DE,VPUTV
        LD      BC,14
        LDIR
        LD      E,(HL)          ; the table goes on with columns, then rows
        INC     HL
        LD      D,(HL)
        LD      (VWID),DE
        CALL    VTREGR
        POP     BC
        LD      A,B
        LD      (CONMOD),A
        CALL    VTOWN
        RET     NZ              ; selection must leave a claimed display alone
        CALL    VREST           ; the display in its mode before the clear
        XOR     A
        LD      (VROW),A
        LD      (VCOL),A
        LD      (VATTR),A
        LD      (ESCST),A
        LD      (VCURV),A
        JP      VTCLS

; BIOS CONST: A = FFh if a character is ready, else 00h. With nothing ready
; on a video console the cursor is drawn, since a program that polls is
; waiting for a key; the next output removes it. The BDOS's own check for ^S
; during output uses BCONST, which draws nothing.
BCONSTC:CALL    BCONST
        OR      A
        RET     NZ
        LD      A,(CONMOD)
        RRCA
        CALL    C,CURSHOW
        XOR     A
        RET

BCONST: CALL    CONSEL
        CALL    VTFLIP          ; a program asking for a key sees the screen it has drawn
        LD      A,(RXFULL)
        OR      A
        JR      NZ,CSTYES
        LD      A,(CONMOD)
        RRCA
        JR      NC,CSTSER
CSTMX:  CALL    KBPOLL
CSTMXE: JR      NZ,CSTYES
        XOR     A
        RET
CSTSER: IN      A,(KEYPORT)
        LD      E,RXPOLL
CSTPOLL:IN      A,(STSPORT)
        RLCA
        JR      NC,CSTGOT
        DEC     E
        JR      NZ,CSTPOLL
        XOR     A
        RET
CSTGOT: CALL    RXBITS
CSTRX:  AND     $7F
        LD      E,RXPOLL        ; NUL: keep listening for a byte behind it
        JR      Z,CSTPOLL
        LD      (RXCHAR),A
        LD      A,$FF
        LD      (RXFULL),A
CSTYES: LD      A,$FF
        RET

; BIOS CONIN: wait for a character and return it in A with bit 7 clear.
; NUL is not delivered (Debug80 sends one ahead of its first input byte).
BCONIN: CALL    CONSEL
        CALL    VTFLIP
        LD      A,(RXFULL)
        OR      A
        JR      NZ,CINTAKE
        LD      A,(CONMOD)
        RRCA
        JR      NC,CINLP
        CALL    CURSHOW         ; video: the cursor shows while waiting
CINMX:  CALL    KBSTEP          ; scan the matrix a row at a time
CINME:  JR      Z,CINMX
        CALL    CINTAKE
        PUSH    AF
        CALL    CURHIDE
        POP     AF
        RET
CINTAKE:LD      A,(KBTN)        ; bytes of an arrow sequence still to come
        OR      A
        JR      NZ,CINTAIL
        LD      (RXFULL),A
        LD      A,(RXCHAR)
        RET
CINTAIL:DEC     A               ; deliver this byte, move the next one up
        LD      (KBTN),A
        LD      A,(RXCHAR)
        PUSH    AF
        LD      A,(KBT1)
        LD      (RXCHAR),A
        LD      A,(KBT2)
        LD      (KBT1),A
        POP     AF
        RET
; Wait for a byte from the serial port (TTY: and BAT:).
CINLP:  IN      A,(KEYPORT)
        IN      A,(STSPORT)
        RLCA
        JR      C,CINLP
CINWE:  CALL    RXBITS
CINRX:  AND     $7F
        JR      Z,CINLP
        RET

; Receive the byte whose start bit has just been seen. Samples the middle of
; each data bit, least significant first. Returns it in A; destroys BCD.
RXBITS: CALL    IFFGET          ; interrupts off for the byte: 65 or 52
        PUSH    AF              ; T-states of RXHALF's allowance
        DI
        LD      D,RXHALF
RXH:    DEC     D
        JR      NZ,RXH
        LD      B,8
RXB:    IN      A,(STSPORT)
        RLCA
        RR      C
        LD      D,RXDLY
RXD:    DEC     D
        JR      NZ,RXD
        DJNZ    RXB
        POP     AF
        LD      A,C
        RET     PO              ; the flags kept: interrupts as they were
        EI
        RET

; BIOS CONOUT: send C to the serial port or the video terminal, by the console.
BCONOUT:CALL    CONSEL
        CALL    VTOWN           ; a program owns the PICO9918: drop the output
        RET     NZ
        LD      A,(CONMOD)
        RRCA
        JP      C,VTOUT         ; CRT: or UC1:
        RRCA
        RET     C               ; BAT: output goes to the list device
BCOSER: LD      A,C
; Send A. Each bit takes 49+16*TXDLY T-states. Destroys AF, BDE.
TXBYTE: LD      E,A
        CALL    IFFGET          ; interrupts off for the byte
        PUSH    AF
        DI
        LD      B,9             ; start bit, then 8 data bits
        OR      A               ; carry clear: the start bit is low
TXB:    SBC     A,A
        AND     $40
        OUT     (DIGPORT),A
        NOP
        LD      D,TXDLY
TXD:    DEC     D
        JR      NZ,TXD
        RR      E
        DJNZ    TXB
        LD      A,$40           ; two stop bits
        OUT     (DIGPORT),A
        LD      D,TXSTOP
TXS:    DEC     D
        JR      NZ,TXS
        POP     AF
        RET     PO
        EI
        RET

; Print the zero-terminated string at HL on every console output.
; Destroys AF, BCDE, HL.
PUTS:   LD      A,(HL)
        OR      A
        RET     Z
        PUSH    HL
        LD      C,A
        CALL    BCONOUT
        POP     HL
        INC     HL
        JR      PUTS

PUTCRLF:LD      A,13
        CALL    PUTA
        LD      A,10
PUTA:   LD      C,A
        JP      BCONOUT

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
; timeout.
BLIST:  RET
BLISTST:LD      A,$FF
        RET

; BIOS PUNCH and READER are the serial port, eight bits, whatever the console
; routing. A byte the console has already taken stays with the console.
BPUNCH: LD      A,C
        JP      TXBYTE
BREADER:
BRDWT:  IN      A,(KEYPORT)
        IN      A,(STSPORT)
        RLCA
        JR      C,BRDWT
        CALL    RXBITS
BRDRX:  RET

; Put B, a console mode, in the IOBYTE's CON: field. Keeps B. Destroys AF.
CONFLD:	LD	A,(IOBYTE)
	AND	$FC
	OR	B
	LD	(IOBYTE),A
	RET
