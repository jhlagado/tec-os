; EVWIPE.COM: a program that puts EXPAND 1 in view and overwrites EVICT's
; record there, the 64 bytes at BE00h, then puts EXPAND 0 back and returns.
; The first letter of its tail is the byte it writes; Z writes zeros and
; F writes FFh. It uses no stack while EXPAND 1 is in view, and it leaves
; the interrupt enable as it found it.

        ORG     $0100
        LD      A,($005D)
        CP      'Z'
        JR      NZ,NOTZ
        XOR     A
NOTZ:   CP      'F'
        JR      NZ,NOTF
        LD      A,$FF
NOTF:   LD      C,A
        LD      A,I
        DI
        PUSH    AF
        LD      A,($0040)
        OR      $04
        OUT     ($FF),A
        LD      HL,$BE00
        LD      B,64
WIPE:   LD      (HL),C
        INC     HL
        DJNZ    WIPE
        LD      A,($0040)
        OUT     ($FF),A
        POP     AF
        RET     PO
        EI
        RET
