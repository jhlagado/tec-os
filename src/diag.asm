; Diagnostic console, entered when the card or container cannot be mounted.
; A = error code: SDE* (01h-0Fh) from the SD driver or ME* (20h-2Fh) from
; the mount checks. The console stays usable without a card.

DIAG:   LD      SP,BSTK
        PUSH    AF
        LD      HL,DGERR
        CALL    PUTS
        POP     AF
        CALL    PUTHEX
        CALL    PUTCRLF
DGLOOP: LD      HL,DGPROM
        CALL    PUTS
        CALL    BCONIN
        AND     $DF             ; upper case
        PUSH    AF
        CALL    PUTA
        CALL    PUTCRLF
        POP     AF
        CP      'R'
        JP      Z,COLDRT
        CP      'H'
        JR      NZ,DGLOOP
        LD      HL,BLKBUF       ; first 64 bytes of the last block read
        LD      C,4
DGROW:  LD      B,16
DGCOL:  LD      A,(HL)
        PUSH    BC
        PUSH    HL
        CALL    PUTHEX
        LD      A,' '
        CALL    PUTA
        POP     HL
        POP     BC
        INC     HL
        DJNZ    DGCOL
        PUSH    BC
        PUSH    HL
        CALL    PUTCRLF
        POP     HL
        POP     BC
        DEC     C
        JR      NZ,DGROW
        JR      DGLOOP

DGERR:  DB      "No volume mounted, error ",0
DGPROM: DB      "R retry, H header> ",0
