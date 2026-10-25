; Output, input and the report.
;
; Text goes to the serial port at 4800 baud, 8N2, bit-banged as TEC-OS does
; it (src/console.asm). While REC is set each character is also kept in the
; report buffer, so the summary at the end repeats every result line. The
; LCD shows the test in progress, the last result and the running totals.

; ---- Serial -------------------------------------------------------------------

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

; Receive the byte whose start bit has just been seen. Returns it in A;
; destroys BCD.
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

; ---- Text -------------------------------------------------------------------------

; Print A, and keep it in the report while REC is set. Preserves BC, DE, HL.
OUTC:   PUSH    HL
        PUSH    DE
        PUSH    BC
        LD      C,A
        LD      A,(REC)
        OR      A
        JR      Z,OUTCTX
        LD      HL,(RPTP)
        LD      A,H
        CP      HIGH(RPTEND)
        JR      NC,OUTCTX       ; full: the serial copy still goes out
        LD      (HL),C
        INC     HL
        LD      (RPTP),HL
OUTCTX: LD      A,C
        CALL    TXBYTE
        POP     BC
        POP     DE
        POP     HL
        RET

; Print the zero-terminated string at HL; HL ends after the zero.
PRS:    LD      A,(HL)
        INC     HL
        OR      A
        RET     Z
        CALL    OUTC
        JR      PRS

; Print the string that follows the CALL, then return past it.
; Preserves BC, DE, HL.
PRI:    EX      (SP),HL
        CALL    PRS
        EX      (SP),HL
        RET

CRLF:   LD      A,13
        CALL    OUTC
        LD      A,10
        JP      OUTC

SPACE:  LD      A,' '
        JP      OUTC

; Print A as two hex digits. Preserves BC, DE, HL.
PRHEX:  PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    PRNIB
        POP     AF
PRNIB:  AND     $0F
        ADD     A,$90
        DAA
        ADC     A,$40
        DAA
        JP      OUTC

; Print HL as four hex digits.
PRHL:   LD      A,H
        CALL    PRHEX
        LD      A,L
        JP      PRHEX

; Print B bytes from HL as hex, separated by spaces.
PRBYTES:LD      A,(HL)
        CALL    PRHEX
        INC     HL
        DEC     B
        RET     Z
        CALL    SPACE
        JR      PRBYTES

; Print HL in decimal.
PRDEC:  LD      DE,0
        ; fall through

; Print DEHL in decimal. Destroys AF, BC, DE, HL.
PRD32:  LD      A,$FF
        PUSH    AF              ; end marker
PRD32D: LD      C,10
        CALL    DIV8
        PUSH    AF
        LD      A,D
        OR      E
        OR      H
        OR      L
        JR      NZ,PRD32D
PRD32P: POP     AF
        CP      $FF
        RET     Z
        ADD     A,'0'
        CALL    OUTC
        JR      PRD32P

; ---- 32-bit arithmetic ---------------------------------------------------------

; DEHL = DEHL / C, A = remainder. C is 1-127. Destroys B.
DIV8:   XOR     A
        LD      B,32
DIV8L:  ADD     HL,HL
        RL      E
        RL      D
        RLA
        CP      C
        JR      C,DIV8N
        SUB     C
        INC     L
DIV8N:  DJNZ    DIV8L
        RET

; DEHL = DEHL * A, low 32 bits. Destroys AF, BC.
MUL8:   LD      (MULTD),HL
        LD      (MULTD+2),DE
        LD      C,A
        LD      HL,0
        LD      D,H
        LD      E,L
        LD      B,8
MUL8L:  ADD     HL,HL           ; product times two
        RL      E
        RL      D
        RLC     C               ; next multiplier bit, most significant first
        JR      NC,MUL8N
        PUSH    BC
        LD      BC,(MULTD)
        ADD     HL,BC
        EX      DE,HL
        LD      BC,(MULTD+2)
        ADC     HL,BC
        EX      DE,HL
        POP     BC
MUL8N:  DJNZ    MUL8L
        RET

; DVD = DVD / BC, HL = remainder. BC is 1-7FFFh. Destroys AF, IX.
DIV16:  LD      HL,0
        LD      A,32
DIV16L: LD      IX,DVD
        SLA     (IX+0)
        RL      (IX+1)
        RL      (IX+2)
        RL      (IX+3)
        ADC     HL,HL
        OR      A
        SBC     HL,BC
        JR      NC,DIV16S
        ADD     HL,BC
        JR      DIV16N
DIV16S: INC     (IX+0)
DIV16N: DEC     A
        JR      NZ,DIV16L
        RET

; DVD <-> DEHL.
LDDVD:  LD      HL,(DVD)
        LD      DE,(DVD+2)
        RET
STDVD:  LD      (DVD),HL
        LD      (DVD+2),DE
        RET

; ---- Delays ---------------------------------------------------------------------

; Wait about A tenths of a second at 4 MHz. Destroys AF, BC.
WAITDS: LD      C,A
WAITD1: LD      B,31            ; 31 x 13,077 T-states
WAITD2: PUSH    BC
        LD      B,0
WAITD3: EX      (SP),HL         ; 51 x 256 T-states
        EX      (SP),HL
        DJNZ    WAITD3
        POP     BC
        DJNZ    WAITD2
        DEC     C
        JR      NZ,WAITD1
        RET

; ---- Input ------------------------------------------------------------------------

; Wait for a key from the serial port, the hex keypad or, with the Matrix
; switch on, the matrix keyboard. A = time-out in half seconds, 0 for none.
; Returns NC and A = the key in upper case, or C on time-out. Keypad keys
; read as 0-9, A-F, + as Y, - as N, GO as Return and AD as Esc.
; Destroys AF, BC, DE, HL.
GETKEY: LD      C,A
GETKO:  LD      HL,KEYINR
GETKP:  IN      A,(KEYPORT)     ; Debug80 starts a queued serial byte here
        IN      A,(STSPORT)
        RLCA
        JR      NC,GETKSER      ; start bit
        RLCA
        JR      NC,GETKPAD      ; KDA low: a keypad key
        LD      A,(MTXON)
        OR      A
        JR      Z,GETKT
        PUSH    BC
        LD      BC,MTXPORT      ; every row at once
        IN      A,(C)
        POP     BC
        INC     A
        JR      NZ,GETKMTX
GETKT:  DEC     HL
        LD      A,H
        OR      L
        JR      NZ,GETKP
        LD      A,C
        OR      A
        JR      Z,GETKO         ; no time-out
        DEC     C
        JR      NZ,GETKO
        SCF
        RET
GETKSER:PUSH    BC
        CALL    RXBITS
        POP     BC
        AND     $7F
        JR      Z,GETKP         ; NUL: Debug80 sends one ahead of input
UPPER:  CP      'a'
        JR      C,UPPER1
        CP      'z'+1
        JR      NC,UPPER1
        SUB     $20
UPPER1: OR      A               ; NC
        RET
GETKPAD:IN      A,(KEYPORT)
        AND     $1F
        PUSH    AF
        CALL    PADUP
        POP     AF
        LD      HL,PADASC
        CP      20
        JR      C,GETKP1
        LD      A,'?'
        OR      A
        RET
GETKP1: ADD     A,L
        LD      L,A
        JR      NC,GETKP2
        INC     H
GETKP2: LD      A,(HL)
        OR      A
        RET
GETKMTX:CALL    MTXKEY          ; E = key number, FFh none
        CALL    MTXUP
        LD      HL,MTXASC
        LD      B,4
GETKM1: LD      A,(HL)
        INC     HL
        CP      E
        LD      A,(HL)
        INC     HL
        JR      Z,GETKM2
        DJNZ    GETKM1
        LD      A,E
        SUB     $0F
        CP      $40-$0F
        LD      A,'?'
        JR      NC,GETKM2
        LD      A,E
        ADD     A,$1D           ; digits and capitals, as TEC-OS maps them
GETKM2: OR      A               ; NC
        RET
MTXASC: DB      $0A,KCR,$0C,KESC,$0D,' ',$FF,'?'
KEYINR  EQU     14000           ; polls in about half a second
PADASC: DB      "0123456789ABCDEF","YN",KCR,KESC

; Wait until no keypad key has been down for a while, at most about 1 s.
; Destroys AF, B, HL.
PADUP:  LD      HL,0
PADUP1: DEC     HL
        LD      A,H
        OR      L
        RET     Z
        LD      B,0
PADUP2: IN      A,(STSPORT)
        BIT     6,A
        JR      Z,PADUP1        ; still down: start the count again
        DJNZ    PADUP2
        RET

; Scan the matrix keyboard. E = the highest key number down that is not a
; modifier (Shift, Ctrl, Fn are keys 0-2), FFh for none. Destroys AF, BCD.
MTXKEY: LD      E,$FF
        LD      D,0             ; key number of bit 0 of this row
        LD      B,$FE
MTXK1:  LD      C,MTXPORT
        IN      A,(C)
        CPL
        PUSH    BC
        LD      C,D
MTXK2:  OR      A
        JR      Z,MTXK4
        SRL     A
        JR      NC,MTXK3
        PUSH    AF
        LD      A,C
        CP      3
        JR      C,MTXK3P
        LD      E,C
MTXK3P: POP     AF
MTXK3:  INC     C
        JR      MTXK2
MTXK4:  POP     BC
        LD      A,D
        ADD     A,8
        LD      D,A
        RLC     B
        JR      C,MTXK1
        RET

; Wait until the matrix keyboard has no key down, at most about 1 s.
MTXUP:  LD      HL,0
MTXUP1: DEC     HL
        LD      A,H
        OR      L
        RET     Z
        PUSH    BC
        LD      BC,MTXPORT
        IN      A,(C)
        POP     BC
        INC     A
        JR      NZ,MTXUP1
        LD      B,0
MTXUP2: DJNZ    MTXUP2
        PUSH    BC
        LD      BC,MTXPORT
        IN      A,(C)
        POP     BC
        INC     A
        JR      NZ,MTXUP1
        RET

; Ask the question that follows the CALL. Returns A = RPASS for Y, RFAIL for
; N, RSKIP for Esc or no answer within a minute. Preserves nothing.
ASK:    EX      (SP),HL
        CALL    PRS
        EX      (SP),HL
        CALL    PRI
        DB      " (Y/N) ",0
ASK1:   LD      A,120
        CALL    GETKEY
        LD      B,RSKIP
        JR      C,ASKX
        CP      KESC
        JR      Z,ASKX
        LD      B,RPASS
        CP      'Y'
        JR      Z,ASKX
        LD      B,RFAIL
        CP      'N'
        JR      NZ,ASK1
ASKX:   PUSH    BC
        LD      HL,ASKTXT
        LD      A,B
        ADD     A,A
        ADD     A,A
        ADD     A,L
        LD      L,A
        JR      NC,ASKX1
        INC     H
ASKX1:  CALL    PRS
        CALL    CRLF
        POP     AF
        RET
ASKTXT: DB      "Yes",0,"No",0,0,0,0,0,0,"Esc",0

; Interactive tests start here: Y runs one, N or Esc skips it. Returns Z to
; run it; otherwise records SKIP.
RUNIT:  CALL    ASK
        DB      "Run this test?",0
        OR      A
        RET     Z
        LD      A,RSKIP
        CALL    RESULT
        CALL    PRI
        DB      "skipped",0
        CALL    REND
        OR      1
        RET

; Read a decimal number typed on the serial port or keypad, ended by
; Return or GO. Returns NC and HL = the number, or C for Esc, no digits
; or no answer within two minutes.
GETNUM: LD      HL,0
        LD      B,0             ; digits so far
GETN1:  PUSH    HL
        PUSH    BC
        LD      A,240
        CALL    GETKEY
        POP     BC
        POP     HL
        RET     C
        CP      KESC
        SCF
        RET     Z
        CP      KCR
        JR      Z,GETNE
        CP      '0'
        JR      C,GETN1
        CP      '9'+1
        JR      NC,GETN1
        PUSH    AF
        CALL    OUTC
        POP     AF
        SUB     '0'
        LD      D,H             ; HL = HL * 10 + digit
        LD      E,L
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,DE
        ADD     HL,HL
        LD      E,A
        LD      D,0
        ADD     HL,DE
        INC     B
        JR      GETN1
GETNE:  CALL    CRLF
        LD      A,B
        OR      A
        RET     NZ              ; NC
        SCF
        RET

; ---- LCD status display --------------------------------------------------------

; Wait while the LCD is busy, at most 256 polls. Returns NC when ready, C
; after the time-out. Preserves BC, DE, HL.
LCDWAIT:PUSH    BC
        LD      B,0
LCDW1:  IN      A,(LCDCMD)
        RLCA
        JR      NC,LCDW2
        DJNZ    LCDW1
        SCF
LCDW2:  POP     BC
        RET

; Send command A, or character A. Preserve BC, DE, HL.
LCDC:   PUSH    AF
        CALL    LCDWAIT
        POP     AF
        OUT     (LCDCMD),A
        RET
LCDCH:  PUSH    AF
        PUSH    HL
        LD      HL,LCDCOL
        LD      A,(HL)
        INC     (HL)
        POP     HL
        CP      20
        JR      NC,LCDCHX       ; past the end of the row
        CALL    LCDWAIT
        POP     AF
        OUT     (LCDDAT),A
        RET
LCDCHX: POP     AF
        RET

LCDINIT:LD      HL,LCDSEQ
        LD      B,4
LCDI1:  LD      A,(HL)
        CALL    LCDC
        INC     HL
        DJNZ    LCDI1
        RET
LCDSEQ: DB      $38,$0C,$06,$01

; Start row B (0-3) at column 0.
LCDROW: LD      A,B
        LD      HL,LCDROWS
        ADD     A,L
        LD      L,A
        JR      NC,LCDR1
        INC     H
LCDR1:  LD      A,(HL)
        CALL    LCDC
        XOR     A
        LD      (LCDCOL),A
        RET
LCDROWS:DB      $80,$C0,$94,$D4

; Write the string at HL to the LCD.
LCDSTR: LD      A,(HL)
        INC     HL
        OR      A
        RET     Z
        CALL    LCDCH
        JR      LCDSTR

; Pad the row with spaces.
LCDEOL: LD      A,(LCDCOL)
        CP      20
        RET     NC
        LD      A,' '
        CALL    LCDCH
        JR      LCDEOL

; Write A in hex, or 0-99 in decimal.
LCDHEX: PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    LCDNIB
        POP     AF
LCDNIB: AND     $0F
        ADD     A,$90
        DAA
        ADC     A,$40
        DAA
        JP      LCDCH
LCDDEC: LD      B,'0'-1
LCDD1:  INC     B
        SUB     10
        JR      NC,LCDD1
        ADD     A,10+'0'
        PUSH    AF
        LD      A,B
        CALL    LCDCH
        POP     AF
        JP      LCDCH

; Row 0: the title. Row 3: running totals.
LCDHEAD:LD      B,0
        CALL    LCDROW
        LD      HL,LCDTTL
        CALL    LCDSTR
        JP      LCDEOL
LCDTTL: DB      "TEC-1G DIAG ",VERHI+'0','.',VERLO+'0',0

LCDSUM: LD      B,3
        CALL    LCDROW
        LD      HL,NCOUNT
        LD      DE,LCDSUMT
        LD      B,4
LCDS1:  LD      A,(DE)
        CALL    LCDCH
        INC     DE
        LD      A,':'
        CALL    LCDCH
        LD      A,(HL)
        INC     HL
        PUSH    HL
        PUSH    DE
        PUSH    BC
        CALL    LCDDEC
        POP     BC
        POP     DE
        POP     HL
        LD      A,' '
        CALL    LCDCH
        DJNZ    LCDS1
        JP      LCDEOL
LCDSUMT:DB      "PFIS"          ; pass, fail, info, skip

; Show the current test number and name on row B.
LCDTEST:CALL    LCDROW
        LD      A,'T'
        CALL    LCDCH
        LD      A,(TID)
        CALL    LCDDEC
        LD      A,' '
        CALL    LCDCH
        LD      HL,(TNAME)
        LD      B,7
LCDT1:  LD      A,(HL)
        CALL    LCDCH
        INC     HL
        DJNZ    LCDT1
        RET

; ---- Tests and results ----------------------------------------------------------

; Start a test. The CALL is followed by the test number, a 7-character name
; and a zero-terminated description.
TBEGIN: POP     HL
        LD      A,(HL)
        LD      (TID),A
        INC     HL
        LD      (TNAME),HL
        LD      DE,7
        ADD     HL,DE
        PUSH    HL
        CALL    CRLF
        CALL    PRI
        DB      "-- T",0
        LD      A,(TID)
        CALL    PRDEC2
        CALL    SPACE
        POP     HL
        CALL    PRS
        PUSH    HL
        CALL    CRLF
        LD      B,1
        CALL    LCDTEST
        CALL    LCDEOL
        RET

; Record result A for the current test: count it, start its report line
; ("Tnn NAME    PASS  ") and leave REC set for the details. REND ends the
; line. Preserves nothing.
RESULT: PUSH    AF
        LD      HL,NCOUNT
        ADD     A,L
        LD      L,A
        JR      NC,RES1
        INC     H
RES1:   INC     (HL)
        LD      A,1
        LD      (REC),A
        LD      A,'T'
        CALL    OUTC
        LD      A,(TID)
        CALL    PRDEC2
        CALL    SPACE
        LD      HL,(TNAME)
        LD      B,7
RES2:   LD      A,(HL)
        CALL    OUTC
        INC     HL
        DJNZ    RES2
        CALL    SPACE
        POP     AF
        PUSH    AF
        ADD     A,A
        ADD     A,A
        ADD     A,A
        LD      HL,RESTXT
        ADD     A,L
        LD      L,A
        JR      NC,RES3
        INC     H
RES3:   PUSH    HL
        CALL    PRS
        LD      B,2
        CALL    LCDTEST
        LD      A,' '
        CALL    LCDCH
        POP     HL
        CALL    LCDSTR
        CALL    LCDEOL
        CALL    LCDSUM
        POP     AF
        RET
RESTXT: DB      "PASS  ",0,0
        DB      "FAIL  ",0,0
        DB      "INFO  ",0,0
        DB      "SKIP  ",0,0
        DB      "LOOK  ",0,0
        DB      "NONE  ",0,0

REND:   CALL    CRLF
        XOR     A
        LD      (REC),A
        RET

; A as two decimal digits.
PRDEC2: LD      B,'0'-1
PRD21:  INC     B
        SUB     10
        JR      NC,PRD21
        ADD     A,10+'0'
        PUSH    AF
        LD      A,B
        CALL    OUTC
        POP     AF
        JP      OUTC

; Record PASS or FAIL from Z or NZ.
RESZ:   LD      A,RPASS
        JP      Z,RESULT
        LD      A,RFAIL
        JP      RESULT

; Print the whole report.
PRREP:  CALL    CRLF
        CALL    PRI
        DB      13,10,"==== TEC-1G DIAGNOSTICS REPORT ====",13,10
        DB      "ROM diag ",VERHI+'0','.',VERLO+'0'
        DB      ", serial 4800 8N2, all times in T-states (4 MHz nominal)",13,10,0
        LD      HL,RPTBUF
PRREP1: LD      DE,(RPTP)
        OR      A
        PUSH    HL
        SBC     HL,DE
        POP     HL
        JR      NC,PRREP2
        LD      A,(HL)
        CALL    OUTC
        INC     HL
        JR      PRREP1
PRREP2: CALL    PRI
        DB      "TOTAL",0
        LD      HL,NCOUNT
        LD      DE,RESTXT
        LD      B,NRESULT
PRREP3: PUSH    BC
        CALL    SPACE
        PUSH    HL
        EX      DE,HL
        LD      B,4
PRREP4: LD      A,(HL)
        CALL    OUTC
        INC     HL
        DJNZ    PRREP4
        LD      DE,4
        ADD     HL,DE
        EX      DE,HL
        POP     HL
        LD      A,' '
        CALL    OUTC
        LD      A,(HL)
        INC     HL
        PUSH    HL
        PUSH    DE
        LD      L,A
        LD      H,0
        CALL    PRDEC
        POP     DE
        POP     HL
        POP     BC
        DJNZ    PRREP3
        CALL    CRLF
        CALL    PRI
        DB      "==== END ====",13,10,0
        RET
