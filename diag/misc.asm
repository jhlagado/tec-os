; The RTC, 7-segment display, speaker, 8 x 8 LED matrix, status LED bar and
; CAPS lamp, and the NMI count.

; Read DS1302 register D (a read command, odd). Returns A. Destroys BC, DE.
; The fixed path costs 1196 nominal Z80 T-states including RET, excluding
; the caller's CALL, waits and interrupts. CE ends low; HL is unchanged.
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

; T21 detects seconds BCD and weekday 1-7, then sets RTCOK for later users.
; A halted clock reports INFO; a failed calibration reports FAIL. Otherwise
; RTCSET writes the clock and write-protect registers. No trickle-charge
; command is sent. RTCOK is detection, not a certificate that later tests pass.
; SAVE holds the initial separate register reads, not an atomic snapshot.
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
        CALL    RTCSET
        LD      (SAVE+8),A      ; 0, or what went wrong
        OR      A
        LD      A,RINFO
        JR      Z,TRTC5
        LD      A,RFAIL
TRTC5:  CALL    RESULT
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
        DB      " Hz; set 2099-12-31 23:59:58: ",0
        LD      A,(SAVE+8)
        LD      HL,RTCSTXT
        CALL    PRSN
        LD      A,(SAVE+8)      ; a failure: the registers read and expected
        LD      HL,RTCBUF
        LD      DE,RTCTST
        DEC     A
        JP      M,REND
        JR      Z,TRTC6
        LD      DE,RTCNEW
        DEC     A
        JR      Z,TRTC6
        LD      HL,RTCRB
        LD      DE,RTCORG
TRTC6:  PUSH    DE
        CALL    PRI
        DB      ": read ",0
        LD      B,7
        CALL    PRBYTES
        CALL    PRI
        DB      ", expect ",0
        POP     HL
        LD      B,7
        CALL    PRBYTES
        JP      REND

; Print the A'th of the zero-terminated strings at HL.
PRSN:   OR      A
        JP      Z,PRS
        DEC     A
        PUSH    AF
PRSN1:  LD      A,(HL)
        INC     HL
        OR      A
        JR      NZ,PRSN1
        POP     AF
        JR      PRSN
RTCSTXT:DB      "read back, rolled over, restored",0
        DB      "read back wrong",0
        DB      "stopped after the set",0
        DB      "restore read back wrong",0

; Write E to DS1302 register D (a write command, even). Destroys AF, BC, D.
RTCWR:  LD      C,RTCPORT
        LD      A,$10
        OUT     (C),A
        CALL    RTCOUT
        LD      D,E
        CALL    RTCOUT
        XOR     A
        OUT     (C),A
        RET
RTCOUT: LD      B,8
RTCO1:  SRL     D
        LD      A,$20
        RRA
        OUT     (C),A
        OR      $40
        OUT     (C),A
        DJNZ    RTCO1
        RET

; Read the seven time registers into HL. Destroys AF, BC, DE.
RTCGET: LD      D,$81
RTCG1:  PUSH    DE
        PUSH    HL
        CALL    RTCRD
        POP     HL
        POP     DE
        LD      (HL),A
        INC     HL
        INC     D
        INC     D
        LD      A,D
        CP      $8F
        JR      NZ,RTCG1
        RET
; Write the seven time registers from HL, seconds last.
RTCPUT: LD      DE,6
        ADD     HL,DE
        LD      D,$8C
RTCP1:  LD      E,(HL)
        PUSH    DE
        PUSH    HL
        CALL    RTCWR
        POP     HL
        POP     DE
        DEC     HL
        DEC     D
        DEC     D
        BIT     7,D
        JR      NZ,RTCP1
        RET

; Save clock/WP after an unbounded wait for raw seconds below 50h, clear WP and
; test 2099-12-31 23:59:58. Initial readback checks seconds 58/59 and all six
; remaining bytes. Either mismatch returns code 1 WITHOUT restoring clock/WP.
; Later paths wait nominally 2.5 s and check only minutes/hour/date/month
; against RTCNEW, plus raw seconds below 10h: weekday/year are unchecked.
; They restore the saved registers with seconds adjusted by new seconds+2,
; or a guessed 3 on rollover failure, then write the old WP. This adjustment
; has no minute carry: admitted old 49 plus new 09+2 can become 60.
; Restore comparison covers minutes/hour/date/month/weekday, not seconds,
; year or WP. A = 0 if these predicates pass, 2 for failed rollover, or 3
; when the restore comparison fails (overriding 2). Trickle charge is untouched.
; RTCORG is modified by the adjustment; neither reads nor restore are atomic.
RTCSET: LD      D,$81
        CALL    RTCRD
        AND     $7F
        CP      $50
        JR      NC,RTCSET
        LD      HL,RTCORG
        CALL    RTCGET
        LD      D,$8F
        CALL    RTCRD
        LD      (RTCORG+7),A
        LD      DE,$8E00        ; write-protect off
        CALL    RTCWR
        LD      HL,RTCTST
        CALL    RTCPUT
        LD      HL,RTCBUF
        CALL    RTCGET
        LD      A,(RTCBUF)      ; 58 or 59 seconds, the rest exact
        AND     $FE
        CP      $58
        LD      C,1
        JR      NZ,RTCS9
        LD      HL,RTCBUF+1
        LD      DE,RTCTST+1
        LD      B,6
        CALL    RTCCMP
        LD      C,1
        JR      NZ,RTCS9
        LD      A,25
        CALL    WAITDS
        LD      HL,RTCBUF
        CALL    RTCGET
        LD      HL,RTCBUF+1     ; compare minute/hour/date/month only
        LD      DE,RTCNEW+1
        LD      B,4
        CALL    RTCCMP
        LD      C,2
        LD      A,3             ; the seconds the set took, at a guess
        JR      NZ,RTCS8
        LD      A,(RTCBUF)
        CP      $10
        JR      NC,RTCS8B
        ADD     A,2             ; 58 -> 00 is two seconds
        DAA
        LD      C,0
        JR      RTCS8
RTCS8B: LD      A,3
RTCS8:  LD      HL,RTCORG       ; add the estimate without minute carry
        ADD     A,(HL)
        DAA
        LD      (HL),A
        PUSH    BC
        CALL    RTCPUT
        LD      A,(RTCORG+7)
        LD      E,A
        LD      D,$8E
        CALL    RTCWR
        LD      HL,RTCRB
        CALL    RTCGET
        LD      HL,RTCRB+1
        LD      DE,RTCORG+1
        LD      B,5
        CALL    RTCCMP
        POP     BC
        JR      Z,RTCS9
        LD      C,3
RTCS9:  LD      A,C
        RET
; Compare B bytes at HL/DE (B = 0 means 256). Z advances past equal bytes;
; NZ leaves both pointers at the first mismatch. AF/B/HL/DE work; C survives.
RTCCMP: LD      A,(DE)
        CP      (HL)
        RET     NZ
        INC     HL
        INC     DE
        DJNZ    RTCCMP
        RET
RTCTST: DB      $58,$59,$23,$31,$12,$04,$99 ; a Thursday
RTCNEW: DB      $00,$00,$00,$01,$01,$05,$00 ; a Friday, seconds below 10

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

; Print SAVE's separate reads as 20yy-mm-dd hh:mm:ss. Mask hour with 3Fh
; and seconds with 7Fh; PRHEX does not validate the remaining BCD/calendar.
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

; Count polls between two changes of the raw seconds byte. NC returns HL;
; C means a count limit expired. IY names shared OLDSEC; AF/DE/HL/IY work.
; First-edge reads stop before count 2800h; second-edge reads include 4000h.
; A continuing second-edge iteration costs 1282 nominal Z80 T-states; final
; paths differ. Physical one-second ticks and no added waits are premises,
; not a measured clock guarantee or an elapsed-time deadline.
RTCCAL: LD      IY,OLDSEC
        LD      D,$81
        CALL    RTCRD
        LD      (OLDSEC),A
        LD      HL,0
RTCC1:  INC     HL              ; at most 10239 first-edge samples
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

; HL = separately read minutes x 60 + seconds; a rollover can split them.
; BCDBIN converts raw nibbles without BCD validation. AF/BC/DE/HL work.
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

; Scan segments E on digit mask H (bit 5 left, bit 0 right), C frames;
; C = 0 means 256. About 6 ms/frame assumes 4 MHz without extra waits/work.
; Digit writes keep serial bit 6 high. Exit blanks digits and segments;
; AF/B/C/D work while E/H/L survive.
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
        DB      22,"SEG7   ","7-segment: each segment, then each digit",0
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

; Toggle speaker bit 7 for DE half cycles, keeping serial bit 6 high.
; DE = 0 means 65536; H = 0 gives 256 DJNZ turns. The continuing OUT gap
; is 51+13*H nominal T-states, final forced-idle gap 53+13*H (use 256 for H0).
; These exclude waits/interrupts. Exit forces port 01h to 40h rather than
; restoring its old state. AF/BC/DE work; HL survives.
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

; Stopwatch beep: about 1203 Hz for 0.1 s at nominal 4 MHz. Callers use its
; first speaker edge as their interval convention, not a measured duration.
BEEP:   LD      H,124
        LD      DE,240
        JP      TONE

; Show H frames (0 means 256): C bits 0/1/2 select red/green/blue; L = 0
; fills rows, any nonzero L selects the diagonal. Row r is bit r of port 05h.
; Blank rows while changing columns. About 9 ms/frame is nominal at 4 MHz.
; AF/B/D/E/H work; C/L survive. LEDOFF also enters the all-ports-dark exit.
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
        DB      24,"RGB8X8 ","8 x 8 matrix on 05h/06h/F8h/F9h",0
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

; Show all ten BARSEQ latch values directly, then restore LATCHV. Each DE0
; delay runs 65536 turns, nominally about 0.426 s at 4 MHz. Intermediate
; writes leave the shadow unchanged. No explicit stack operation occurs
; while PROTECT covers the stack, but NMI entry still pushes there; this
; register-only sequence is not asynchronous-stack safety.
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

; Classify one NMICNT load as PASS for zero, INFO otherwise; a separate load
; supplies the printed count. NMI service between instructions can change
; those observations, without interrupting either individual LD HL,(NMICNT).
; The 16-bit count wraps and was reset after RAMTST. Overlay RETN periods
; do not run its handler, so this is not every NMI since boot or every event.
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
