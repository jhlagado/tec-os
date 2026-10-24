; Console: input from the serial port and, when enabled, the matrix
; keyboard; output to the serial port and, when present, a video terminal.
;
; Serial is bit-banged at 4800 baud, 8 data bits, no parity, 2 stop bits. TX
; is port 01h bit 6 (idle high), RX is port 03h bit 7. Reception has no
; hardware buffer, so a byte is caught only while one of these routines is
; polling. Reading port 00h first lets Debug80 start a queued input byte; on
; the board it reads the keypad encoder and has no effect. The delay counts
; (TXDLY, TXSTOP, RXHALF, RXDLY, RXPOLL) come from the generated configuration.

; A keyboard row scan delays start-bit detection by up to KBLATE T-states.
; RXHALF is reduced by half of that, so every sample lands between about a
; third and two thirds of its bit whichever poll sees the start bit.
KBEVERY EQU     8

CONINIT:LD      A,$40
        OUT     (DIGPORT),A
        XOR     A
        LD      (RXFULL),A
        LD      (CONDEV),A
        LD      (VATTR),A
        LD      (VCURV),A
        LD      (ESCST),A
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
        CALL    VIDINIT
        RET     NZ
        LD      A,(CONDEV)
        OR      CDVID
        LD      (CONDEV),A
        RET

; BIOS CONST: A = FFh if a character is ready, else 00h.
BCONST: LD      A,(RXFULL)
        OR      A
        JR      NZ,CSTYES
        CALL    KBPOLL
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
BCONIN: LD      A,(RXFULL)
        OR      A
        JR      Z,CINLP
CINTAKE:XOR     A
        LD      (RXFULL),A
        LD      A,(RXCHAR)
        RET
CINLP:  LD      E,KBEVERY
CINWT:  IN      A,(KEYPORT)
        IN      A,(STSPORT)
        RLCA
        JR      NC,CINSER
        DEC     E
        JR      NZ,CINWT
        LD      A,(CONDEV)
        AND     CDMTX
        JR      Z,CINLP
        CALL    KBSTEP          ; one keyboard row every KBEVERY serial polls
        JR      Z,CINLP
CINWE:  JR      CINTAKE
CINSER: CALL    RXBITS
CINRX:  AND     $7F
        JR      Z,CINLP
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

; BIOS CONOUT: send C to the serial port and the video terminal.
BCONOUT:LD      A,(CONDEV)
        AND     CDVID
        JR      Z,BCOSER
        PUSH    BC
        CALL    VTOUT
        POP     BC
BCOSER: LD      A,C
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

; Print A as two hex digits. Destroys AF, BCDE, HL.
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
        JR      PUTA

; List, punch and reader devices are not fitted. Output is discarded and the
; reader returns end of file, so programs do not hang.
BLIST:
BPUNCH: RET
BLISTST:LD      A,$FF
        RET
BREADER:LD      A,$1A
        RET

; ---- Matrix keyboard ------------------------------------------------------------

; The keyboard is scanned a row at a time so that a serial start bit is never
; kept waiting for a whole scan. Key k is row k/8, bit k%8 of port FEh, with
; the row selected by a low bit in the high address byte. Keys 0, 1 and 2 are
; Shift, Ctrl and Fn; key 7 toggles Caps Lock. A key is delivered once when it
; goes down; holding it does not repeat.

; Scan the whole keyboard. Returns NZ with a new character in RXCHAR and
; RXFULL set, or Z. Destroys AF, BCDE, HL.
KBPOLL: LD      A,(CONDEV)
        AND     CDMTX
        RET     Z
        LD      L,8
KBPL:   PUSH    HL
        CALL    KBSTEP
        POP     HL
        RET     NZ
        DEC     L
        JR      NZ,KBPL
        RET

; Scan the next row. After the last row, decide on the keys seen. Returns as
; KBPOLL does.
KBSTEP: LD      HL,KBMASK
        LD      B,(HL)          ; row select, one bit low
        LD      C,$FE
        IN      A,(C)
        CPL
        JR      Z,KBSNEXT
        LD      D,A             ; record each key in this row
        INC     HL
        LD      A,(HL)          ; KBBASE: key number of bit 0
KBSBIT: SRL     D
        JR      NC,KBSN
        LD      E,A
        LD      A,(KBE)
        LD      (KBD),A
        LD      A,E
        LD      (KBE),A
KBSN:   INC     A
        INC     D
        DEC     D
        JR      NZ,KBSBIT
        LD      HL,KBMASK
KBSNEXT:RLC     (HL)            ; next row
        INC     HL
        LD      A,(HL)
        ADD     A,8
        LD      (HL),A
        CP      64
        JR      Z,KBEVAL
        XOR     A
        RET
KBEVAL: XOR     A               ; a full scan is complete
        LD      (HL),A
        LD      HL,(KBE)        ; L = last key, H = the one before
        LD      DE,$FFFF
        LD      (KBE),DE
        EX      DE,HL
        LD      A,E
        LD      HL,KBLAST
        CP      (HL)
        JR      Z,KBNONE        ; still held
        LD      (HL),A
        INC     A
        JR      Z,KBNONE        ; nothing pressed
        LD      A,D             ; a second key must be a modifier
        CP      3
        JR      C,KBMOD
        INC     A
        JR      NZ,KBNONE
KBMOD:  LD      A,E
        CP      3
        JR      C,KBNONE        ; a modifier alone
        CP      7
        JR      Z,KBCAPS
        CALL    KBASCII
        OR      A
        JR      Z,KBNONE
        LD      (RXCHAR),A
        LD      A,$FF
        LD      (RXFULL),A
        OR      A
        RET
KBNONE: XOR     A
        RET
KBCAPS: LD      A,(LATCHV)
        XOR     $80
        LD      (LATCHV),A
        OUT     (SYSLAT),A
        XOR     A
        RET

; Translate key E with modifier D (FFh none, 0 Shift, 1 Ctrl, 2 Fn) to ASCII.
KBASCII:LD      A,E
        LD      HL,KBSPEC       ; Return, Esc, space, quote and backslash
        LD      B,5
KBSP:   CP      (HL)
        INC     HL
        JR      Z,KBSPHIT
        INC     HL
        INC     HL
        DJNZ    KBSP
        CP      $0F
        RET     C               ; keys 03h-0Eh are control codes as they stand
        CP      $21
        JR      NC,KBALPHA
        ADD     A,$1D           ; digits and punctuation: 2Ch-3Dh
        LD      C,A
        LD      A,D
        OR      A
        LD      A,C
        RET     NZ
        SUB     $2C
        LD      HL,KBSHIFT
        JR      KBIDX
KBSPHIT:LD      C,(HL)          ; plain value, then the shifted value
        INC     HL
        LD      A,D
        OR      A
        LD      A,C
        RET     NZ
        LD      A,(HL)
        RET
KBALPHA:CP      $24
        RET     C               ; keys 21h-23h as they stand
        ADD     A,$3D           ; letters
        LD      C,A
        LD      A,D
        CP      1
        JR      NZ,KBNOCTL
        LD      A,C
        SUB     $60
        RET
KBNOCTL:OR      A               ; Shift
        JR      Z,KBUPPER
        LD      A,(LATCHV)      ; Caps Lock
        RLCA
        LD      A,C
        RET     NC
KBUPPER:LD      A,C
        SUB     $20
        RET
KBIDX:  ADD     A,L
        LD      L,A
        JR      NC,KBIDX1
        INC     H
KBIDX1: LD      A,(HL)
        RET

KBSPEC: DB      $0A,$0D,$0D, $0C,$1B,$1B, $0D,$20,$20, $0E,$27,$22, $3F,$5C,$7C
KBSHIFT:DB      "<_>?)!@#$%^&*( : +"
