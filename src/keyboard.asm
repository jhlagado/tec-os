; The matrix keyboard, the console's keys on a board with a PICO9918 or a GLCD.
; console.asm's input routines poll it.

; The keyboard is scanned a row at a time. Key k is row k/8, bit k%8 of port
; FEh, with the row selected by a low bit in the high address byte. Keys 0, 1 and 2 are
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
        CP      7               ; keys 3-6 are the arrows: send ESC [ A-D
        JR      NC,KBNOARR
        SUB     3
        LD      HL,KBARROW
        ADD     A,L
        LD      L,A
        JR      NC,KBARR1
        INC     H
KBARR1: LD      A,(HL)
        LD      (KBT2),A
        LD      A,'['
        LD      (KBT1),A
        LD      A,2
        LD      (KBTN),A
        LD      A,$1B
        JR      KBDELIV
KBNOARR:CALL    KBASCII
        OR      A
        JR      Z,KBNONE
KBDELIV:LD      (RXCHAR),A
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
