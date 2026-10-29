; HD44780 20 x 4 LCD status display. Cold boot shows the banner on row 0 and
; the mounted drives on rows 1-2. Every wait on the busy flag is bounded, so
; a missing display costs only the time-out.

LCDCMD  EQU     $04
LCDDAT  EQU     $84

; Initialise: 8-bit, two-line addressing, display on, cursor off, clear.
LCDINIT:LD      HL,LCDSEQ
        LD      B,4
LCDI:   LD      A,(HL)
        CALL    LCDC
        INC     HL
        DJNZ    LCDI
        RET

; Wait while the display is busy, at most 256 polls. Preserves BC, DE, HL.
LCDWAIT:PUSH    BC
        LD      B,0
LCDW:   IN      A,(LCDCMD)
        RLCA
        JR      NC,LCDWX
        DJNZ    LCDW
LCDWX:  POP     BC
        RET

; Send command A.
LCDC:   PUSH    AF
        CALL    LCDWAIT
        POP     AF
        OUT     (LCDCMD),A
        RET

; Write the zero-terminated string at HL from row B (0-3), column 0.
LCDROW: LD      A,B
        PUSH    HL
        LD      HL,LCDROWS
        ADD     A,L
        LD      L,A
        JR      NC,LCDR1
        INC     H
LCDR1:  LD      A,(HL)
        POP     HL
        CALL    LCDC
LCDS:   LD      A,(HL)
        OR      A
        RET     Z
        PUSH    AF
        CALL    LCDWAIT
        POP     AF
        OUT     (LCDDAT),A
        INC     HL
        JR      LCDS

; Show the drive letters and labels of drives A and B on rows 1 and 2.
LCDVOLS:LD      C,0
LCDV:   PUSH    BC
        CALL    DRVDESC
        POP     BC
        JR      NZ,LCDVN
        LD      A,C
        PUSH    BC
        LD      HL,LINEBUF
        ADD     A,'A'
        LD      (HL),A
        INC     HL
        LD      (HL),':'
        INC     HL
        LD      (HL),' '
        INC     HL
        PUSH    IX
        POP     DE
        EX      DE,HL
        LD      BC,DLABEL
        ADD     HL,BC
        LD      BC,11
        LDIR
        XOR     A
        LD      (DE),A
        POP     BC
        PUSH    BC
        LD      A,C
        INC     A
        LD      B,A
        LD      HL,LINEBUF
        CALL    LCDROW
        POP     BC
LCDVN:  INC     C
        LD      A,C
        CP      2               ; only A and B fit
        JR      C,LCDV
        RET
