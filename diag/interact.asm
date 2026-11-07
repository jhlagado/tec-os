; Interactive tests can be skipped at
; RUNIT. T30 follows T29 without it.
; Serial waveform phases may wait
; indefinitely for missing edges.

; A counts 25000-poll quanta.
; NC: A=nonzero 8-bit byte, C: timeout.
; Ignore NUL. RXBITS changes C, so NUL
; retries alter the initial budget.
; A=0: 256 quanta. Uses AF/BC/DE/HL.
; Idle-high, nonzero A:
; A*(59*25000+21)+13 nominal T.
; A=60: ~22.125 s at 4 MHz (KE400).

SERGET: LD      C,A
SERG1:  LD      HL,SERINR
SERG2:  IN      A,(KEYPORT)
        IN      A,(STSPORT)
        RLCA
        JR      NC,SERG3
        DEC     HL
        LD      A,H
        OR      L
        JR      NZ,SERG2
        DEC     C
        JR      NZ,SERG1
        SCF
        RET
SERG3:  CALL    RXBITS
        OR      A
        JR      Z,SERG2
        RET
SERINR  EQU     25000

; A counts 25000-poll quanta, 0 -> 256.
; NC on RX low, C on budget exhaustion.
; Uses AF/C/HL. Keeps B/DE.
; Idle-high, nonzero A:
; A*(57*25000+21)+13 nominal T.
; A=60: ~21.375 s at 4 MHz (KE400).
; Bounds start only, not later edges.

SERSTB: LD      C,A
SERS1:  LD      HL,SERINR
SERS2:  IN      A,(KEYPORT)
        IN      A,(STSPORT)
        RLCA
        RET     NC
        DEC     HL
        LD      A,H
        OR      L
        JR      NZ,SERS2
        DEC     C
        JR      NZ,SERS1
        SCF
        RET

; T27: RUNIT, then serial SERGET.
; Nonzero non-Esc 8-bit bytes count in
; SAVE (16 bits). Hex+space each, quoted
; character only for 20h-7Eh, then CRLF.
; OUTC also records if REC and room.
; No per-byte LCD. TBEGIN/RESULT update
; the display at test/result boundaries.
; Final ASK uses GETKEY: serial, keypad,
; enabled matrix. Serial keys are 7-bit
; and uppercase. Y PASS, N FAIL, Esc or
; timeout SKIP, others retry (KE406).
; The 30s prompt keeps KE400's mismatch.

TSERRX: CALL    TBEGIN
        DB      27,"SERRX  ","Serial RX: typed characters come back",0
        CALL    RUNIT
        RET     NZ
        CALL    PRI
        DB      "Type on the terminal. Esc ends, as do 30 s with nothing typed.",13,10,0
        LD      HL,0
        LD      (SAVE),HL
TSRX1:  LD      A,60
        CALL    SERGET
        JR      C,TSRX3
        CP      KESC
        JR      Z,TSRX3
        LD      HL,(SAVE)
        INC     HL
        LD      (SAVE),HL
        PUSH    AF
        CALL    PRHEX
        CALL    SPACE
        POP     AF
        CP      ' '
        JR      C,TSRX2
        CP      $7F
        JR      NC,TSRX2
        PUSH    AF
        LD      A,$27
        CALL    OUTC
        POP     AF
        CALL    OUTC
        LD      A,$27
        CALL    OUTC
TSRX2:  CALL    CRLF
        JR      TSRX1
TSRX3:  CALL    ASK
        DB      "Did every character come back as typed?",0
        CALL    RESULT
        LD      HL,(SAVE)
        CALL    PRDEC
        CALL    PRI
        DB      " bytes received",0
        JP      REND

; After a proper U (55h) start, count
; four rises and following falls, ending
; at bit 7: eight bit times. Ordinary
; polls cost 33 T, HL wraps at 65536.
; Uses AF/B. Continued edges required,
; with no timeout on a stuck level.

SBMEAS: LD      HL,0
        LD      B,4
SBM1:   INC     HL              ; 6  wait for the line to rise
        IN      A,(STSPORT)     ; 11
        RLCA                    ; 4
        JR      NC,SBM1         ; 12
SBM2:   INC     HL              ; and to fall
        IN      A,(STSPORT)
        RLCA
        JR      C,SBM2
        DJNZ    SBM1
        RET

; Up to eight U samples after RUNIT.
; Idle-high qualification and waveform
; edges are unbounded. SERSTB bounds
; only start. SAVE is a 16-bit sum,
; SAVE+2 samples. Zero samples -> SKIP.
; Q=(33*sum+64*samples)/(8*samples),
; using integer division. Bit T is
; Q's low 16 bits. PASS iff
; abs(bit-TXBITC)<=BITTOL, rounded
; TXBITC/50. Counters must fit.

TSERBIT:CALL    TBEGIN
        DB      28,"SERBIT ","The terminal's bit time from typed U",0
        CALL    RUNIT
        RET     NZ
        CALL    PRI
        DB      "Type a capital U eight times, slowly. 30 s with nothing typed ends.",13,10,0
        LD      HL,0
        LD      (SAVE),HL       ; sum of the polls
        XOR     A
        LD      (SAVE+2),A      ; samples
TSB1:   LD      HL,0            ; wait for the line to have been idle a while
TSB2:   IN      A,(STSPORT)
        RLCA
        JR      NC,TSB1
        INC     HL
        LD      A,H
        CP      4
        JR      NZ,TSB2
        LD      A,60
        CALL    SERSTB
        JR      C,TSB3
        CALL    SBMEAS
        PUSH    HL
        CALL    PRI
        DB      "polls ",0
        CALL    PRDEC
        CALL    CRLF
        POP     DE
        LD      HL,(SAVE)
        ADD     HL,DE
        LD      (SAVE),HL
        LD      HL,SAVE+2
        INC     (HL)
        LD      A,(HL)
        CP      8
        JR      NZ,TSB1
TSB3:   LD      A,(SAVE+2)
        OR      A
        JR      NZ,TSB4
        LD      A,RSKIP
        CALL    RESULT
        CALL    PRI
        DB      "nothing typed",0
        JP      REND
TSB4:   LD      HL,(SAVE)       ; bit = (sum x 33 + 64 x samples) / (8 x samples)
        LD      DE,0
        LD      A,33
        CALL    MUL8
        PUSH    HL
        LD      A,(SAVE+2)      ; 64 T-states a sample: the time from the edge
        LD      L,A             ; to the first poll, less the time from the
        LD      H,0             ; last edge to its poll
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        LD      B,H
        LD      C,L
        POP     HL
        ADD     HL,BC
        JR      NC,TSB4A
        INC     DE
TSB4A:  CALL    STDVD
        LD      A,(SAVE+2)
        ADD     A,A
        ADD     A,A
        ADD     A,A
        LD      C,A
        LD      B,0
        CALL    DIV16
        LD      HL,(DVD)
        LD      (SAVE+4),HL
        LD      DE,TXBITC       ; nominal reference
        OR      A
        SBC     HL,DE
        JR      NC,TSB5
        EX      DE,HL           ; HL = |difference|
        LD      HL,0
        OR      A
        SBC     HL,DE
TSB5:   LD      DE,BITTOL+1
        OR      A
        SBC     HL,DE
        LD      A,RPASS
        JR      C,TSB6
        LD      A,RFAIL
TSB6:   CALL    RESULT
        CALL    PRI
        DB      "terminal bit ",0
        LD      HL,(SAVE+4)
        CALL    PRDEC
        CALL    PRI
        DB      " T over ",0
        LD      A,(SAVE+2)
        LD      L,A
        LD      H,0
        CALL    PRDEC
        CALL    PRI
        DB      " U; expect the ROM's ",0
        LD      HL,TXBITC
        CALL    PRDEC
        CALL    PRI
        DB      " T +-2%",0
        JP      REND

; RUNIT for T29 only, T30 follows.
; Clear counts before the prompt. NMIs
; can count then, PRESS/PSEEN need later
; KDA. PADUP is bounded, so a held key
; can repeat. PRESS is 8-bit. PSEEN
; records 0..19. Shift is printed, not
; required for the 20-code PASS.
; AD=13h twice or idle budget ends.
; Idle: 40*28000 ordinary 52 T polls,
; ~14.560 s at nominal 4 MHz (KE400).
; T30 INFO compares 16-bit NMICNT to
; 8-bit PRESS. Nonatomic, both may wrap.

TKEYPAD:CALL    TBEGIN
        DB      29,"KEYPAD ","Hex keypad on 00h: every key and Shift",0
        CALL    RUNIT
        RET     NZ
        XOR     A
        LD      (PRESS),A
        LD      HL,0
        LD      (PSEEN),HL
        LD      (PSEEN+1),HL
        LD      (NMICNT),HL
        CALL    PRI
        DB      "Press each of the 20 keypad keys once; hold Shift for one of them.",13,10
        DB      "AD twice in a row ends, as do 15 s with no key.",13,10,0
        LD      A,$FF
        LD      (SAVE),A        ; the last key
TKP1:   LD      C,40
TKP2:   LD      HL,KEYINR*2
TKP3:   IN      A,(STSPORT)
        BIT     6,A
        JR      Z,TKP4
        DEC     HL
        LD      A,H
        OR      L
        JR      NZ,TKP3
        DEC     C
        JR      NZ,TKP2
        JP      TKP9
TKP4:   IN      A,(KEYPORT)
        LD      (SAVE+1),A
        CALL    PADUP
        LD      HL,PRESS
        INC     (HL)
        LD      A,(SAVE+1)
        AND     $1F
        LD      (SAVE+2),A
        CP      20
        JR      NC,TKP5
        LD      HL,PSEEN
        LD      B,A
        SRL     B
        SRL     B
        SRL     B
        LD      E,B
        LD      D,0
        ADD     HL,DE
        AND     7
        LD      B,A
        INC     B
        XOR     A
        SCF
TKPB:   RLA
        DJNZ    TKPB
        OR      (HL)
        LD      (HL),A
TKP5:   CALL    PRI
        DB      "key ",0
        LD      A,(SAVE+2)
        CALL    PRHEX
        LD      A,(SAVE+1)
        BIT     5,A
        JR      NZ,TKP6
        CALL    PRI
        DB      " with Shift",0
TKP6:   CALL    PRI
        DB      "  NMIs so far ",0
        LD      HL,(NMICNT)
        CALL    PRDEC
        CALL    CRLF
        LD      B,2
        CALL    LCDROW
        LD      A,'k'
        CALL    LCDCH
        LD      A,(SAVE+2)
        CALL    LCDHEX
        CALL    LCDEOL
        LD      A,(SAVE+2)
        CP      $13             ; AD
        JR      NZ,TKP8
        LD      HL,SAVE
        CP      (HL)
        JR      Z,TKP9
TKP8:   LD      (SAVE),A
        JP      TKP1
TKP9:   LD      HL,PSEEN
        LD      C,0
        LD      D,3
TKPC1:  LD      A,(HL)
        LD      B,8
TKPC2:  RRCA
        JR      NC,TKPC3
        INC     C
TKPC3:  DJNZ    TKPC2
        INC     HL
        DEC     D
        JR      NZ,TKPC1
        LD      A,C
        LD      (SAVE+3),A
        CP      20
        LD      A,RPASS
        JR      Z,TKPR
        LD      A,RINFO
TKPR:   CALL    RESULT
        LD      A,(SAVE+3)
        LD      L,A
        LD      H,0
        CALL    PRDEC
        CALL    PRI
        DB      "/20 keys seen, ",0
        LD      A,(PRESS)
        LD      L,A
        LD      H,0
        CALL    PRDEC
        CALL    PRI
        DB      " presses",0
        CALL    REND

        CALL    TBEGIN
        DB      30,"KEYNMI ","NMIs taken for those keypad presses",0
        LD      A,RINFO
        CALL    RESULT
        LD      HL,(NMICNT)
        CALL    PRDEC
        CALL    PRI
        DB      " NMIs for ",0
        LD      A,(PRESS)
        LD      L,A
        LD      H,0
        CALL    PRDEC
        CALL    PRI
        DB      " presses: ",0
        LD      HL,(NMICNT)
        LD      A,H
        OR      L
        JR      NZ,TKN1
        CALL    PRI
        DB      "no NMI from the keypad",0
        JP      REND
TKN1:   LD      A,(PRESS)
        CP      L
        JR      NZ,TKN2
        LD      A,H
        OR      A
        JR      NZ,TKN2
        CALL    PRI
        DB      "one per press",0
        JP      REND
TKN2:   CALL    PRI
        DB      "not one per press",0
        JP      REND

; Set KSEEN=0, previous raw SAVE=FFh.
; 15000 idle scans with B=0 delay
; between. Serial ends, new down bits
; restart. Print row*8+bit, INFO map.
; Roughly 1 ms/scan at 4 MHz plus work.
; Runs even with the Matrix switch off.

TMATRIX:CALL    TBEGIN
        DB      31,"MATRIX ","Matrix keyboard on FEh: row and bit of each key",0
        CALL    RUNIT
        RET     NZ
        CALL    PRI
        DB      "Press keys one at a time. 15 s with no new key, or a serial key, ends.",13,10,0
        LD      A,(MTXON)
        OR      A
        JR      NZ,TMX0
        CALL    PRI
        DB      "(The Matrix switch, port 03h bit 0, is off.)",13,10,0
TMX0:   LD      HL,KSEEN
        LD      B,8
TMXZ:   LD      (HL),0
        INC     HL
        DJNZ    TMXZ
        LD      HL,SAVE
        LD      B,8
TMXF:   LD      (HL),$FF
        INC     HL
        DJNZ    TMXF
TMX1:   LD      HL,15000        ; scans before the time-out
TMX2:   PUSH    HL
        CALL    TMXSCAN
        POP     HL
        JR      C,TMX4          ; a serial key
        JR      NZ,TMX1         ; a new key: start the time-out again
        LD      B,0
TMX3:   DJNZ    TMX3
        DEC     HL
        LD      A,H
        OR      L
        JR      NZ,TMX2
TMX4:   LD      HL,KSEEN
        LD      C,0
        LD      D,8
TMXC1:  LD      A,(HL)
        LD      B,8
TMXC2:  RRCA
        JR      NC,TMXC3
        INC     C
TMXC3:  DJNZ    TMXC2
        INC     HL
        DEC     D
        JR      NZ,TMXC1
        LD      A,C
        PUSH    AF
        LD      A,RINFO
        CALL    RESULT
        POP     AF
        LD      L,A
        LD      H,0
        CALL    PRDEC
        CALL    PRI
        DB      " keys seen; rows 0-7 ",0
        LD      HL,KSEEN
        LD      B,8
        CALL    PRBYTES
        JP      REND

; Serial start -> RXBITS, C. Else new
; down=(~newRaw)&oldRaw. Store raw SAVE,
; OR KSEEN, print row*8+bit. Final NC,
; NZ iff new downs. Uses AF/BC/DE/HL.
; Shared state, sequential calls only.

TMXSCAN:IN      A,(STSPORT)
        RLCA
        JP      NC,TMXS9
        LD      HL,SAVE
        LD      DE,KSEEN
        LD      B,$FE
        LD      C,0             ; key number of bit 0
        XOR     A
        LD      (SAVE+8),A      ; new keys this scan
TMXS1:  PUSH    BC
        LD      C,MTXPORT
        IN      A,(C)
        POP     BC
        PUSH    AF
        CPL
        AND     (HL)            ; up last time, down now
        LD      (SAVE+9),A
        POP     AF
        LD      (HL),A
        LD      A,(SAVE+9)
        OR      A
        JR      Z,TMXS4
        PUSH    HL
        PUSH    BC
        PUSH    DE
        EX      DE,HL
        OR      (HL)
        LD      (HL),A
        LD      A,(SAVE+9)
        LD      E,C
TMXS2:  SRL     A
        JR      NC,TMXS3
        PUSH    AF
        PUSH    DE
        CALL    PRI
        DB      "key ",0
        LD      A,E
        CALL    PRHEX
        CALL    PRI
        DB      " (row ",0
        LD      A,E
        RRCA
        RRCA
        RRCA
        AND     7
        CALL    PRNIB
        CALL    PRI
        DB      " bit ",0
        LD      A,E
        AND     7
        CALL    PRNIB
        CALL    PRI
        DB      ")",13,10,0
        LD      HL,SAVE+8
        INC     (HL)
        POP     DE
        POP     AF
TMXS3:  INC     E
        OR      A
        JR      NZ,TMXS2
        POP     DE
        POP     BC
        POP     HL
TMXS4:  INC     HL
        INC     DE
        LD      A,C
        ADD     A,8
        LD      C,A
        RLC     B
        JR      C,TMXS1
        LD      A,(SAVE+8)
        OR      A               ; NC; NZ if a key went down
        RET
TMXS9:  CALL    RXBITS
        SCF
        RET

; Shared matrix row 3, input inverted.
; SAVE=last active-high, SAVE+1=seen.
; Change restarts 15000 polls, serial
; also ends. INFO, not a wiring verdict.

; MON-3 reads the joystick at port FEh with only A11 low (BC = F7FEh).

TJOY:   CALL    TBEGIN
        DB      32,"JOY    ","Joystick on FEh with A11 low",0
        CALL    RUNIT
        RET     NZ
        CALL    PRI
        DB      "Move the stick and press each button. 15 s with no change, or a",13,10
        DB      "serial key, ends.",13,10,0
        XOR     A
        LD      (SAVE),A        ; last state, active high
        LD      (SAVE+1),A      ; bits seen
TJ1:    LD      HL,15000
TJ2:    IN      A,(STSPORT)
        RLCA
        JR      NC,TJ5
        LD      BC,$F7FE
        IN      A,(C)
        CPL
        LD      B,A
        LD      A,(SAVE)
        CP      B
        JR      Z,TJ3
        LD      A,B
        LD      (SAVE),A
        LD      HL,SAVE+1
        OR      (HL)
        LD      (HL),A
        CALL    PRI
        DB      "joystick ",0
        LD      A,B
        CALL    PRHEX
        CALL    CRLF
        JR      TJ1
TJ3:    LD      B,0
TJ4:    DJNZ    TJ4
        DEC     HL
        LD      A,H
        OR      L
        JR      NZ,TJ2
        JR      TJ6
TJ5:    CALL    RXBITS
TJ6:    LD      A,RINFO
        CALL    RESULT
        CALL    PRI
        DB      "bits seen ",0
        LD      A,(SAVE+1)
        CALL    PRHEX
        CALL    PRI
        DB      " (01 up 02 down 04 left 08 right 10 fire2 20 pin9 40 fire1 80 fire3)",0
        JP      REND

; Print 3,2,1 with BEEP and WAITDS A=9.
; GO text precedes the timed interval:
; next caller BEEP's first speaker edge.
; Nominal spacing plus output overhead.

CDOWN:  CALL    PRI
        DB      "Ready:",0
        LD      B,'3'
CDN1:   PUSH    BC
        CALL    SPACE
        LD      A,B
        CALL    OUTC
        CALL    BEEP
        LD      A,9
        CALL    WAITDS
        POP     BC
        DEC     B
        LD      A,B
        CP      '0'
        JR      NZ,CDN1
        CALL    PRI
        DB      " GO",13,10,0
        RET

; Return NC, HL=1..7FFFh tenths. C for
; GETNUM failure, zero or high bit set.
; DIV16 needs positive divisor <8000h.
; Input accumulates 16 bits, may wrap.

ASKSW:  CALL    PRI
        DB      "STOP",13,10,"Type the stopwatch reading in tenths of a second (601 for",13,10
        DB      "60.1 s), then Return or GO: ",0
        CALL    GETNUM
        RET     C
        LD      A,H
        OR      L
        SCF
        RET     Z
        BIT     7,H             ; DIV16 takes at most 7FFFh
        SCF
        RET     NZ
        OR      A
        RET

; HL tenths -> decimal "n.n s".
; Uses AF/BC/DE/HL.

PRTENTH:LD      DE,0
        LD      C,10
        CALL    DIV8
        PUSH    AF
        CALL    PRD32
        LD      A,'.'
        CALL    OUTC
        POP     AF
        ADD     A,'0'
        CALL    OUTC
        CALL    PRI
        DB      " s",0
        RET

; With caller CALL and taken DJNZ:
; 26*38460+45=1,000,005 nominal T.
; Final DJNZ costs 5 T less. Uses AF/DE,
; keeps B for the caller loop.

DELAYU: LD      DE,DELAYN       ; 10
DELU1:  DEC     DE              ; 6
        LD      A,D             ; 4
        OR      E               ; 4
        JR      NZ,DELU1        ; 12/7
        RET                     ; 10
DELAYN  EQU     38460           ; with the CALL and DJNZ: 26 x 38460 + 45

; T33: 240 DELAYU calls between caller
; BEEP first speaker edges. SWTOT is a
; historical Debug80 timing reference,
; 240400396 T. Valid ASKSW -> INFO Hz
; from SWTOT*10/tenths, else SKIP.

TCLOCK: CALL    TBEGIN
        DB      33,"CLOCK  ","CPU clock by stopwatch, about 60 s",0
        CALL    RUNIT
        RET     NZ
        CALL    PRI
        DB      "Start a stopwatch on the GO beep and stop it on the STOP beep.",13,10,0
        CALL    CDOWN
        CALL    BEEP            ; the interval starts at its first edge
        LD      B,240
TCK1:   CALL    DELAYU
        DJNZ    TCK1
        CALL    BEEP            ; and ends at this one's first edge
        CALL    ASKSW
        JR      NC,TCK2
        LD      A,RSKIP
        CALL    RESULT
        CALL    PRI
        DB      "no reading",0
        JP      REND
TCK2:   PUSH    HL
        LD      HL,SWT10L
        LD      (DVD),HL
        LD      HL,SWT10H
        LD      (DVD+2),HL
        POP     BC
        PUSH    BC
        CALL    DIV16
        LD      A,RINFO
        CALL    RESULT
        POP     HL
        CALL    PRTENTH
        CALL    PRI
        DB      " for ",0
        LD      HL,SWTOTL
        LD      DE,SWTOTH
        CALL    PRD32
        CALL    PRI
        DB      " T: CPU ",0
        CALL    LDDVD
        CALL    PRD32
        CALL    PRI
        DB      " Hz",0
        JP      REND

; T34: SDOK else SKIP. RUNIT can skip.
; 256 reads of 512 bytes between BEEPs,
; no writes. Errors all, token-poll sum
; successful reads only. Optional RTC
; samples bracket both BEEPs. Sequential
; minutes/seconds reads aren't atomic,
; difference handles one hour wrap.
; Valid ASKSW -> INFO bytes/s from
; 1310720/tenths, no performance PASS.
; Without a stopwatch reading, no rate.

TSDTIME:CALL    TBEGIN
        DB      34,"SDTIME ","SD read rate by stopwatch: 256 blocks, 128 KiB",0
        LD      A,(SDOK)
        OR      A
        JR      NZ,TSDT1
        LD      A,RSKIP
        CALL    RESULT
        CALL    PRI
        DB      "no card",0
        JP      REND
TSDT1:  CALL    RUNIT
        RET     NZ
        CALL    PRI
        DB      "Start a stopwatch on the GO beep and stop it on the STOP beep.",13,10,0
        CALL    CDOWN
        LD      HL,0
        LD      A,(RTCOK)
        OR      A
        CALL    NZ,RTCSECS
        LD      (SAVE+4),HL
        CALL    BEEP
        LD      B,0
        CALL    SDRUN
        CALL    BEEP
        LD      HL,0
        LD      A,(RTCOK)
        OR      A
        CALL    NZ,RTCSECS
        LD      DE,(SAVE+4)     ; RTC seconds, modulo the hour
        OR      A
        SBC     HL,DE
        JR      NC,TSDT2
        LD      DE,3600
        ADD     HL,DE
TSDT2:  LD      (SAVE+4),HL
        CALL    ASKSW
        LD      (SAVE+6),HL
        JR      NC,TSDT3
        LD      HL,0
        LD      (SAVE+6),HL
TSDT3:  LD      A,RINFO
        CALL    RESULT
        CALL    PRI
        DB      "errors ",0
        LD      HL,(SDBAD)
        CALL    PRDEC
        CALL    PRI
        DB      ", token polls ",0
        LD      HL,(SDTOT)
        LD      DE,(SDTOT+2)
        CALL    PRD32
        LD      A,(RTCOK)
        OR      A
        JR      Z,TSDT4
        CALL    PRI
        DB      ", RTC ",0
        LD      HL,(SAVE+4)
        CALL    PRDEC
        CALL    PRI
        DB      " s",0
TSDT4:  LD      HL,(SAVE+6)
        LD      A,H
        OR      L
        JP      Z,REND
        CALL    PRI
        DB      ", stopwatch ",0
        LD      HL,(SAVE+6)
        CALL    PRTENTH
        LD      HL,0                ; 131,072 bytes x 10 = 140000h
        LD      (DVD),HL
        LD      HL,$14
        LD      (DVD+2),HL
        LD      BC,(SAVE+6)
        CALL    DIV16
        CALL    PRI
        DB      ": ",0
        CALL    LDDVD
        CALL    PRD32
        CALL    PRI
        DB      " bytes/s",0
        JP      REND
