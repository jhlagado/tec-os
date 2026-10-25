; NATCALL.COM: call the native service entry from a CP/M program. Fill
; 0200h-05FFh, where the native profile keeps its OS stack and buffers, call
; QUERY through FF06h, then print the status in hex, C if carry was set, and
; OK if the filled block is untouched or BAD if not.

BDOS    EQU     $0005
FILL    EQU     $0200
FILLN   EQU     $0400

        ORG     $0100
        LD      HL,FILL
        LD      DE,FILL+1
        LD      BC,FILLN-1
        LD      (HL),$5A
        LDIR
        XOR     A
        LD      C,0
        CALL    $FF06
        PUSH    AF
        CALL    HEX
        POP     AF
        JR      NC,CHECK
        LD      E,'C'
        LD      C,2
        CALL    BDOS
CHECK:  LD      HL,FILL
        LD      BC,FILLN
SCAN:   LD      A,(HL)
        CP      $5A
        JR      NZ,BAD
        INC     HL
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,SCAN
        LD      DE,OKMSG
        JR      SHOW
BAD:    LD      DE,BADMSG
SHOW:   LD      C,9
        JP      BDOS

HEX:    PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    NIB
        POP     AF
NIB:    AND     $0F
        ADD     A,$90
        DAA
        ADC     A,$40
        DAA
        LD      E,A
        LD      C,2
        JP      BDOS

OKMSG:  DB      " OK$"
BADMSG: DB      " BAD$"
