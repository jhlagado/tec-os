; The RTC, 7-segment display, speaker, 8 x 8 LED matrix, status LED bar and
; CAPS lamp, and the NMI count.

; ---- DS1302 ---------------------------------------------------------------------

; Read DS1302 register D (a read command, odd). Returns A. Destroys BC, DE.
; Always 1,196 T-states, whatever the data.
RTCRD:  LD      C,RTCPORT       ; 7
        LD      A,$10           ; 7   CE high, clock low
        OUT     (C),A           ; 12
        LD      B,8             ; 7
RTCW:   SRL     D               ; 8   command, least significant bit first
        LD      A,$20           ; 7
        RRA                     ; 4   bit 7 = the bit, bit 4 = CE
        OUT     (C),A           ; 12  data set up with the clock low
        OR      $40             ; 7
        OUT     (C),A           ; 12  rising edge: the chip takes the bit
        DJNZ    RTCW            ; 13/8
        LD      B,8             ; 7
RTCR:   LD      A,$70           ; 7   clock high, I/O released
        OUT     (C),A           ; 12
        LD      A,$30           ; 7   falling edge: the chip drives a bit
        OUT     (C),A           ; 12
        IN      E,(C)           ; 12
        SRL     E               ; 8   bit 0 to carry
        RR      D               ; 8
        DJNZ    RTCR            ; 13/8
        XOR     A               ; 4
        OUT     (C),A           ; 12  CE low
        LD      A,D             ; 4
        RET                     ; 10

; Valid BCD 00-59 in A (bit 7 ignored)? NC if so.
BCD59:  AND     $7F
        CP      $60
        CCF
        RET     C
        AND     $0F
        CP      10
        CCF
        RET

; T21: read only. The detection reads as MON-3's does, but nothing is
; written, so the clock and its trickle charger keep their settings.
TRTC:   CALL    TBEGIN
        DB      21,"RTC    ","DS1302 on FCh (optional): time, ticking, clock check",0
        XOR     A
        LD      (RTCOK),A
        LD      HL,SAVE
        LD      D,$81
        LD      B,7
TRTC1:  PUSH    BC
        PUSH    DE
        PUSH    HL
        CALL    RTCRD
        POP     HL
        POP     DE
        POP     BC
        LD      (HL),A
        INC     HL
        INC     D
        INC     D
        DJNZ    TRTC1
        LD      A,(SAVE)
        CALL    BCD59
        JR      C,TRTCN
        LD      A,(SAVE+5)      ; day of week 1-7
        DEC     A
        CP      7
        JR      C,TRTC2
TRTCN:  LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "no DS1302 (read ",0
        LD      A,(SAVE)
        CALL    PRHEX
        LD      A,')'
        CALL    OUTC
        JP      REND
TRTC2:  LD      A,1
        LD      (RTCOK),A
        LD      A,(SAVE)
        RLCA
        JR      NC,TRTC3
        LD      A,RINFO         ; CH set: the clock is stopped
        CALL    RESULT
        CALL    PRTIME
        CALL    PRI
        DB      " clock halted (CH set)",0
        JP      REND
TRTC3:  CALL    RTCCAL
        JR      NC,TRTC4
        LD      A,RFAIL
        CALL    RESULT
        CALL    PRTIME
        CALL    PRI
        DB      " seconds do not advance",0
        JP      REND
TRTC4:  PUSH    HL
        LD      A,RINFO
        CALL    RESULT
        CALL    PRTIME
        CALL    PRI
        DB      "; 1 s = ",0
        POP     HL
        PUSH    HL
        CALL    PRDEC
        CALL    PRI
        DB      " x 1282 T = ",0
        POP     HL
        CALL    RTCHZ
        CALL    PRD32
        CALL    PRI
        DB      " Hz",0
        JP      REND

; DEHL = HL x 1282.
RTCHZ:  LD      DE,0
        PUSH    HL
        LD      A,5             ; x 5 x 256 = x 1280
        CALL    MUL8
        LD      D,E
        LD      E,H
        LD      H,L
        LD      L,0
        POP     BC              ; + 2 x
        ADD     HL,BC
        JR      NC,RTCZ1
        INC     DE
RTCZ1:  ADD     HL,BC
        RET     NC
        INC     DE
        RET

; Print the time read into SAVE as 20yy-mm-dd hh:mm:ss.
PRTIME: CALL    PRI
        DB      "20",0
        LD      A,(SAVE+6)
        CALL    PRHEX
        LD      A,'-'
        CALL    OUTC
        LD      A,(SAVE+4)
        CALL    PRHEX
        LD      A,'-'
        CALL    OUTC
        LD      A,(SAVE+3)
        CALL    PRHEX
        CALL    SPACE
        LD      A,(SAVE+2)
        AND     $3F
        CALL    PRHEX
        LD      A,':'
        CALL    OUTC
        LD      A,(SAVE+1)
        CALL    PRHEX
        LD      A,':'
        CALL    OUTC
        LD      A,(SAVE)
        AND     $7F
        JP      PRHEX

; Count polls of the seconds register across one second. Returns NC and
; HL = polls, each 1,282 T-states, or C when the seconds do not change.
RTCCAL: LD      IY,OLDSEC
        LD      D,$81
        CALL    RTCRD
        LD      (OLDSEC),A
        LD      HL,0
RTCC1:  INC     HL              ; the next edge, within about 3 s
        LD      A,H
        CP      $28
        SCF
        RET     Z
        LD      D,$81
        CALL    RTCRD
        CP      (IY+0)
        JR      Z,RTCC1
        LD      (OLDSEC),A
        LD      HL,0
RTCC2:  INC     HL              ; 6
        LD      D,$81           ; 7
        CALL    RTCRD           ; 17+1196
        CP      (IY+0)          ; 19
        JR      NZ,RTCC3        ; 7
        LD      A,H             ; 4
        CP      $40             ; 7
        JR      Z,RTCC4         ; 7
        JR      RTCC2           ; 12 (1282 in all)
RTCC3:  OR      A
        RET
RTCC4:  SCF
        RET

; Seconds since the hour from the RTC: HL = minutes x 60 + seconds.
RTCSECS:LD      D,$83
        CALL    RTCRD
        CALL    BCDBIN
        LD      L,A
        LD      H,0
        ADD     HL,HL           ; x 64 - x 4
        ADD     HL,HL
        LD      D,H
        LD      E,L
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        OR      A
        SBC     HL,DE
        PUSH    HL
        LD      D,$81
        CALL    RTCRD
        AND     $7F
        CALL    BCDBIN
        POP     HL
        LD      E,A
        LD      D,0
        ADD     HL,DE
        RET
BCDBIN: LD      C,A
        AND     $F0
        RRCA
        LD      B,A             ; tens x 8
        RRCA
        RRCA                    ; tens x 2
        ADD     A,B
        LD      B,A
        LD      A,C
        AND     $0F
        ADD     A,B
        RET

; ---- 7-segment display and speaker ----------------------------------------------

; Multiplex segments E on the digits in mask H (bit 5 left, bit 0 right) for
; C frames of about 6 ms. Port 01h bit 6 stays high: the serial line idles.
MUXD:   LD      B,$20
MUXD1:  LD      A,B
        AND     H
        JR      Z,MUXD2
        LD      A,E
MUXD2:  OUT     (SEGPORT),A
        LD      A,B
        OR      $40
        OUT     (DIGPORT),A
        LD      D,0
MUXD3:  DEC     D
        JR      NZ,MUXD3
        LD      A,$40
        OUT     (DIGPORT),A
        SRL     B
        JR      NZ,MUXD1
        DEC     C
        JR      NZ,MUXD
        XOR     A
        OUT     (SEGPORT),A
        RET

TSEG7:  CALL    TBEGIN
        DB      22,"SEG7   ","7-segment: each segment on all digits, then each digit",0
        CALL    PRI
        DB      "Watch the display: segments a b c d e f g and the point in turn,",13,10
        DB      "then 8. on each digit from left to right, then all.",13,10,0
        LD      HL,SEGORD
        LD      B,8
TSG1:   PUSH    BC
        PUSH    HL
        LD      E,(HL)
        LD      H,$3F
        LD      C,64
        CALL    MUXD
        POP     HL
        POP     BC
        INC     HL
        DJNZ    TSG1
        LD      H,$20
TSG2:   PUSH    HL
        LD      E,$FF
        LD      C,64
        CALL    MUXD
        POP     HL
        SRL     H
        JR      NZ,TSG2
        LD      E,$FF
        LD      H,$3F
        LD      C,160
        CALL    MUXD
        CALL    VISUAL
        DB      "Did every segment and digit light in that order?",0
        CALL    RESULT
        CALL    PRI
        DB      "segment bits a01 b08 c20 d80 e40 f02 g04 dp10 on port 02h",0
        JP      REND
SEGORD: DB      $01,$08,$20,$80,$40,$02,$04,$10

; Sound DE half cycles of 51+13*H T-states on the speaker (port 01h bit 7),
; keeping the serial line high. Destroys AF, BC, DE.
TONE:   LD      A,$40
TONE1:  OUT     (DIGPORT),A     ; 11
        LD      B,H             ; 4
TONE2:  DJNZ    TONE2           ; 13n-5
        XOR     $80             ; 7
        DEC     DE              ; 6
        LD      C,A             ; 4
        LD      A,D             ; 4
        OR      E               ; 4
        LD      A,C             ; 4
        JR      NZ,TONE1        ; 12
        LD      A,$40
        OUT     (DIGPORT),A
        RET

TSPKR:  CALL    TBEGIN
        DB      23,"SPEAKER","Speaker: 600, 1200 and 2400 Hz for 0.3 s each",0
        LD      H,252           ; 3,327 T: 601 Hz
        LD      DE,360
        CALL    TONE
        LD      H,124           ; 1,663 T: 1203 Hz
        LD      DE,720
        CALL    TONE
        LD      H,60            ; 831 T: 2407 Hz
        LD      DE,1440
        CALL    TONE
        CALL    VISUAL
        DB      "Did you hear three rising tones?",0
        CALL    RESULT
        CALL    PRI
        DB      "port 01h bit 7",0
        JP      REND

; Beep for the stopwatch tests: 1203 Hz for 0.1 s.
BEEP:   LD      H,124
        LD      DE,240
        JP      TONE

; ---- 8 x 8 RGB LED matrix ----------------------------------------------------

; Show H frames of about 9 ms: colours C (bit 0 red, 1 green, 2 blue), rows
; full when L = 0 or a diagonal when L = 1. Row r is bit r of port 05h.
LEDFRM: LD      B,1
LEDF1:  XOR     A
        OUT     (LEDROW),A      ; dark while the columns change
        LD      A,L
        OR      A
        LD      A,$FF
        JR      Z,LEDF2
        LD      A,B
LEDF2:  LD      D,A
        XOR     A
        BIT     0,C
        JR      Z,LEDF3
        LD      A,D
LEDF3:  OUT     (LEDRED),A
        XOR     A
        BIT     1,C
        JR      Z,LEDF4
        LD      A,D
LEDF4:  OUT     (LEDGRN),A
        XOR     A
        BIT     2,C
        JR      Z,LEDF5
        LD      A,D
LEDF5:  OUT     (LEDBLU),A
        LD      A,B
        OUT     (LEDROW),A
        LD      E,0
LEDF6:  DEC     E
        JR      NZ,LEDF6
        RLC     B
        JR      NC,LEDF1
        DEC     H
        JR      NZ,LEDFRM
LEDOFF: XOR     A
        OUT     (LEDROW),A
        OUT     (LEDRED),A
        OUT     (LEDGRN),A
        OUT     (LEDBLU),A
        RET

TRGB:   CALL    TBEGIN
        DB      24,"RGB8X8 ","8 x 8 matrix on 05h/06h/F8h/F9h: red, green, blue, white, diagonal",0
        LD      DE,RGBSEQ
TRGB1:  LD      A,(DE)
        OR      A
        JR      Z,TRGB2
        LD      C,A
        INC     DE
        LD      A,(DE)
        LD      L,A
        INC     DE
        LD      H,58
        PUSH    DE
        CALL    LEDFRM
        POP     DE
        JR      TRGB1
TRGB2:  CALL    VISUAL
        DB      "Did the matrix show red, green, blue, white, then a white diagonal?",0
        CALL    RESULT
        CALL    PRI
        DB      "rows on 05h, red 06h, green F8h, blue F9h",0
        JP      REND
RGBSEQ: DB      1,0,2,0,4,0,7,0,7,1,7,1,0

; ---- Status LED bar and CAPS lamp ---------------------------------------------

; Walk a one through latch bits 1-7 with bit 0 high, then show 00h, about
; 0.4 s each. PROTECT is on for one step and the stack is in its range, so
; this runs on registers alone.
TLEDBAR:CALL    TBEGIN
        DB      25,"LEDBAR ","Latch FFh on the STATUS LED bar and the CAPS lamp",0
        CALL    PRI
        DB      "Watch the STATUS LEDs: bits 1 to 7 light in turn (bit 0 stays as",13,10
        DB      "after boot), CAPS with bit 7; then bit 0 alone changes.",13,10,0
        LD      HL,BARSEQ
        LD      B,10            ; entries in BARSEQ
TBAR1:  LD      A,(HL)
        OUT     (SYSLAT),A
        LD      DE,0
TBAR2:  DEC     DE
        LD      A,D
        OR      E
        JR      NZ,TBAR2
        INC     HL
        DJNZ    TBAR1
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        CALL    VISUAL
        DB      "Did the LEDs and the CAPS lamp follow?",0
        CALL    RESULT
        CALL    PRI
        DB      "01 03 05 09 11 21 41 81 00 01",0
        JP      REND
BARSEQ: DB      $01,$03,$05,$09,$11,$21,$41,$81,$00,$01

; ---- NMI count --------------------------------------------------------------------

TNMI:   CALL    TBEGIN
        DB      26,"NMI    ","NMIs during the automatic tests (none expected)",0
        LD      HL,(NMICNT)
        LD      A,H
        OR      L
        JR      Z,TNMI1
        LD      A,RINFO
TNMI1:  CALL    RESULT
        LD      HL,(NMICNT)
        CALL    PRDEC
        CALL    PRI
        DB      " taken through 0066h",0
        JP      REND
