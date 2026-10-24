; Bit-banged serial console: 4800 baud, 8 data bits, no parity, 2 stop bits.
;
; TX is port 01h bit 6 (idle high). RX is port 03h bit 7. Reception has no
; hardware buffer, so a byte is caught only while one of these routines is
; polling. Reading port 00h first lets Debug80 start a queued input byte; on
; the board it reads the keypad encoder and has no effect. The delay counts
; (TXDLY, TXSTOP, RXHALF, RXDLY, RXPOLL) come from the generated configuration.

CONINIT:LD      A,$40
        OUT     (DIGPORT),A
        XOR     A
        LD      (RXFULL),A
        RET

; BIOS CONST: A = FFh if a character is ready, else 00h.
BCONST: LD      A,(RXFULL)
        OR      A
        JR      NZ,CSTYES
        IN      A,(KEYPORT)
        LD      E,RXPOLL
CSTPOLL:IN      A,(STSPORT)
        RLCA
        JR      NC,CSTGOT
        DEC     E
        JR      NZ,CSTPOLL
        XOR     A
        RET
CSTGOT: CALL    RXBITS
        AND     $7F
        LD      E,RXPOLL        ; NUL: keep listening for a byte behind it
        JR      Z,CSTPOLL
        LD      (RXCHAR),A
        LD      A,$FF
        LD      (RXFULL),A
CSTYES: LD      A,$FF
        RET

; BIOS CONIN: wait for a character and return it in A with bit 7 clear.
; NUL is not delivered (Debug80 sends one ahead of its first input byte).
BCONIN: LD      A,(RXFULL)
        OR      A
        JR      Z,CINWT
        XOR     A
        LD      (RXFULL),A
        LD      A,(RXCHAR)
        RET
CINWT:  IN      A,(KEYPORT)
        IN      A,(STSPORT)
        RLCA
        JR      C,CINWT
        CALL    RXBITS
        AND     $7F
        JR      Z,CINWT
        RET

; Receive the byte whose start bit has just been seen. Samples the middle of
; each data bit, least significant first. Returns it in A; destroys BCD.
RXBITS: LD      D,RXHALF
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
        LD      A,C
        RET

; BIOS CONOUT: send C.
BCONOUT:LD      A,C
; Send A. Each bit takes 49+16*TXDLY T-states. Destroys AF, BDE.
TXBYTE: LD      E,A
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
        RET

; Print the zero-terminated string at HL. Destroys AF, BCDE, HL.
PUTS:   LD      A,(HL)
        OR      A
        RET     Z
        PUSH    HL
        CALL    TXBYTE
        POP     HL
        INC     HL
        JR      PUTS

PUTCRLF:LD      A,13
        CALL    TXBYTE
        LD      A,10
        JP      TXBYTE

; Print A as two hex digits. Destroys AF, BDE.
PUTHEX: PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    PUTNIB
        POP     AF
PUTNIB: AND     $0F
        ADD     A,$90
        DAA
        ADC     A,$40
        DAA
        JP      TXBYTE

; List, punch and reader devices are not fitted. Output is discarded and the
; reader returns end of file, so programs do not hang.
BLIST:
BPUNCH: RET
BLISTST:LD      A,$FF
        RET
BREADER:LD      A,$1A
        RET
