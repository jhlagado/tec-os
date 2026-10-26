; Hardware services, ABI 1.1 (docs/rom-services.md). CALL FF0Bh with the
; service in C and arguments in A, B, DE and HL. Returns A = status with Z
; and carry clear on success; results as each service says. IX, IY and the
; alternate registers are preserved. Any program may call them, CP/M or
; native: they run on the caller's stack (at most 6 bytes) and keep their
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
HWCOUNT EQU     6

HWEBAD  EQU     1               ; no such service
HWENODV EQU     2               ; the device is not fitted

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

HWTAB:  DW      HWSINFO,HWSDIG,HWSHEX,HWSLED,HWSLCD,HWSVID

HWSINFO:LD      A,(CONDEV)
        LD      B,A
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
HWSEGT: DB      $EB,$28,$CD,$AD,$2E,$A7,$E7,$29 ; 0-7
        DB      $EF,$AF,$6F,$E6,$C3,$EC,$C7,$47 ; 8-9, A-F

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
; Release, or warm boot: text mode, font and page come back and the screen is
; cleared.
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
        CALL    TMSSET          ; registers, font, page shown
        LD      A,(CONMOD)
        CP      CMCRT
        JP      NZ,HWOK
        CALL    VTCLS
        XOR     A
        LD      (VROW),A
        LD      (VCOL),A
        JP      HWOK
