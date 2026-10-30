; Hardware services, ABI 1.1 (docs/rom-services.md). CALL ABIHW with the
; service in C and arguments in A, B, DE and HL. Returns A = status with Z
; and carry clear on success; results as each service says. IX, IY and the
; alternate registers are preserved. Any program may call them: they run on
; the caller's stack (at most 16 bytes) and keep their
; state in the resident workspace.
;
; These are the services that would otherwise fight the OS for a port: the
; digit and speaker port (01h) also carries the serial transmit line, which
; must stay idle, and the PICO9918 is the console. Devices the OS does not
; use, such as the 8 x 8 LEDs, are here for convenience.

HWINFO  EQU     0               ; B = devices (CONDEV bits), DE = ROM version,
                                ; L = console columns, H = rows (0 for serial)
HWDIGIT EQU     1               ; HL -> 6 segment bytes, leftmost first: one scan
HWHEX   EQU     2               ; A = 0-15: B = its segment pattern
HWLEDS  EQU     3               ; HL -> 8 rows of red, green, blue bytes: one scan
HWLCD   EQU     4               ; B = row 0-3, HL -> 20 characters
HWVIDEO EQU     5               ; B = 1 claim the PICO9918, 0 give it back
HWTONE  EQU     6               ; B = half period (16 T-states a unit), DE = half cycles
HWJOY   EQU     7               ; B = joystick bits, 1 for each one pressed
HWKEYS  EQU     8               ; HL -> 8 bytes: the matrix rows, 1 for each key down
HWSER   EQU     9               ; B = 0: send A; B = 1: B = byte, waiting up to DE ms
HWBLOCK EQU     10              ; HL -> block number (4 bytes), DE -> 512-byte buffer
HWDELAY EQU     11              ; DE = milliseconds
HWVREG  EQU     12              ; claimed PICO9918: register B = A
HWVFILL EQU     13              ; claimed PICO9918: DE bytes of A from VRAM address HL
HWVWR   EQU     14              ; claimed PICO9918: HL -> VRAM address, RAM address, count
HWVRD   EQU     15              ; claimed PICO9918: the same, VRAM to RAM
HWPUTAT EQU     16              ; D = row, E = column, B = count, HL -> characters
HWRAND  EQU     17              ; HL = next pseudo-random number
HWRTC   EQU     18              ; B = 0 read, 1 set the 7 BCD bytes at HL
HWCOUNT EQU     19

HWEBAD  EQU     1               ; no such service, or an argument out of range
HWENODV EQU     2               ; the device is not fitted
HWETIME EQU     3               ; nothing arrived in time
HWECARD EQU     4               ; the card did not read
HWENCLM EQU     5               ; the PICO9918 is not claimed

RTCPORT EQU     $FC             ; DS1302: bit 4 enable, 6 clock, 7 data out,
                                ; 5 data in, read on bit 0

SEGPORT EQU     $02             ; 7-segment segment latch
LEDROW  EQU     $05             ; 8 x 8 matrix: row select, then red, green, blue
LEDRED  EQU     $06
LEDGRN  EQU     $F8
LEDBLU  EQU     $F9
TXIDLE  EQU     $40             ; port 01h bit 6: serial line idle, speaker off

HWSVC:  LD      (HWARGA),A
        LD      A,C
        CP      HWCOUNT
        LD      A,HWEBAD
        JP      NC,HWERR
        PUSH    HL
        PUSH    DE
        LD      A,C
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,HWTAB
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        EX      DE,HL           ; HL = the service
        POP     DE
        EX      (SP),HL         ; the service is the return address
        LD      A,(HWARGA)
        RET
HWERR:  OR      A
        SCF
        RET
HWOK:   XOR     A
        RET

; Bit 3 of B reports a DS1302 clock: it answers with seconds below 60h.
HWSINFO:CALL    RTCHAS
        LD      A,(CONDEV)
        JR      NZ,HWSIN1
        OR      $08
HWSIN1: LD      B,A
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

HWSHEX: AND     $0F
        LD      E,A
        LD      D,0
        LD      HL,HWSEGT
        ADD     HL,DE
        LD      B,(HL)
        JP      HWOK

; One pass over the eight rows, each lit for about 0.4 ms; then all off.
HWSLED: LD      C,1
HWSLL:  LD      A,(HL)
        OUT     (LEDRED),A
        INC     HL
        LD      A,(HL)
        OUT     (LEDGRN),A
        INC     HL
        LD      A,(HL)
        OUT     (LEDBLU),A
        INC     HL
        LD      A,C
        OUT     (LEDROW),A
        LD      B,128
HWSLD:  DJNZ    HWSLD
        XOR     A
        OUT     (LEDROW),A
        SLA     C
        JR      NC,HWSLL
        JP      HWOK

HWSLCD: LD      A,B
        CP      4
        LD      A,HWEBAD
        JP      NC,HWERR
        PUSH    HL
        LD      HL,LCDROWS
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
; Release, or warm boot: with PICO.DRV in, text mode, font and page come back
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
        LD      A,1
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
; (plus 59 a half cycle), the serial line held idle throughout.
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

; ---- Serial -----------------------------------------------------------------------
; Whatever the console uses, 4800 baud, eight bits, two stop bits.
HWSSER: LD      C,A
        LD      A,B
        OR      A
        LD      A,C
        JR      NZ,HWSRX
        CALL    TXBYTE
        JP      HWOK
HWSRX:  LD      B,105           ; about 1 ms of 38 T-state polls
HWSRP:  IN      A,(KEYPORT)
        IN      A,(STSPORT)
        RLCA
        JR      NC,HWSRG
        DJNZ    HWSRP
        LD      A,D
        OR      E
        LD      A,HWETIME
        JP      Z,HWERR
        DEC     DE
        JR      HWSRX
HWSRG:  CALL    RXBITS
        LD      B,A
        JP      HWOK

; ---- Card -----------------------------------------------------------------------------
; Reads leave the BIOS's own buffer alone; no raw writes are offered.
HWSBLK: PUSH    DE
        LD      DE,SDLBA
        LD      BC,4
        LDIR
        CALL    CDI
        POP     HL
        PUSH    HL
        CALL    CBLOCK          ; a cached block from its line
        POP     HL
        CALL    NZ,SDREAD
        CALL    CEI
        LD      A,HWECARD
        JP      NZ,HWERR
        JP      HWOK

; ---- Delay ----------------------------------------------------------------------------
HWSDLY: LD      A,D
        OR      E
        JP      Z,HWOK
        LD      B,0             ; 3,323 + 658 + 40 T-states: 1 ms at 4 MHz
HWSDA:  DJNZ    HWSDA
        LD      B,51
HWSDB:  DJNZ    HWSDB
        DEC     DE
        JR      HWSDLY

; ---- Claimed PICO9918 -------------------------------------------------------------
HWCLMD: LD      C,A             ; returns only when the PICO9918 is claimed; keeps A
        LD      A,(VCLAIM)
        OR      A
        LD      A,C
        RET     NZ
        POP     HL              ; not claimed: fail the service
        LD      A,HWENCLM
        JP      HWERR

HWSVREG:CALL    HWCLMD
        OUT     (VDPCTL),A
        LD      A,B
        OR      $80
        OUT     (VDPCTL),A
        JP      HWOK

HWSVFIL:CALL    HWCLMD
        LD      C,A
        CALL    TMSWA
        LD      A,D
        OR      E
        JP      Z,HWOK
HWSVFL: LD      A,C
        OUT     (VDPDAT),A
        DEC     DE
        LD      A,D
        OR      E
        JR      NZ,HWSVFL
        JP      HWOK

; HL -> VRAM address, RAM address, count (three words).
HWSVWR: CALL    HWCLMD
        CALL    HWVBLK
        CALL    TMSWA
        EX      DE,HL
HWSVWL: LD      A,B
        OR      C
        JP      Z,HWOK
        LD      A,(HL)
        OUT     (VDPDAT),A
        INC     HL
        DEC     BC
        JR      HWSVWL
HWSVRD: CALL    HWCLMD
        CALL    HWVBLK
        CALL    TMSRA
        EX      DE,HL
HWSVRL: LD      A,B
        OR      C
        JP      Z,HWOK
        IN      A,(VDPDAT)
        LD      (HL),A
        INC     HL
        DEC     BC
        JR      HWSVRL
; HL = VRAM address, DE = RAM address, BC = count from the block at HL.
HWVBLK: LD      E,(HL)
        INC     HL
        LD      D,(HL)
        INC     HL
        PUSH    DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        INC     HL
        LD      C,(HL)
        INC     HL
        LD      B,(HL)
        POP     HL
        RET

; ---- Text at a position -----------------------------------------------------------
; On a video console, B characters from HL at row D, column E, clipped to the
; screen, without moving the cursor. Status 2 on the serial terminal or while
; the PICO9918 is claimed.
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

; ---- Random ---------------------------------------------------------------------------
; xorshift16 (7, 9, 8): period 65,535 from any nonzero seed.
HWSRND: LD      HL,(RNDST)
        LD      A,H
        OR      L
        JR      NZ,HWSRN1
        LD      HL,$ACE1
HWSRN1: LD      A,H             ; x ^= x << 7
        RRA
        LD      A,L
        RRA
        XOR     H
        LD      H,A
        LD      A,L
        RRA
        LD      A,H
        RRA
        XOR     L
        LD      L,A
        XOR     H               ; x ^= x >> 9, x ^= x << 8
        LD      H,A
        LD      (RNDST),HL
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
