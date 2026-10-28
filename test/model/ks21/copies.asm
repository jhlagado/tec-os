; KS21's model, not the product: two faster ways to copy a 512-byte block
; between EXPAND 1 and EXPAND 0, both at 8000h-BFFFh, for the cache's line
; copies, run from 6000h in the model with the variables below set by the
; host. Interrupts are off throughout.
;
; U8: MVBL's byte loop, unrolled eight times, with the latch values in D
; and E and the destination pointer in the alternate HL, so a byte costs
; two OUTs, two EXXs and no loop test.
;
; SP16: sixteen bytes at a time through the registers, POPped from the
; source with its bank in view and PUSHed to the destination with the
; other, SP walking each block. An NMI during the copy would push its
; return address into the block being read.

SYSLAT  EQU     $FF
LATCHV  EQU     $0040

        ORG     $6000
U8GO:   LD      HL,(DST)
        EXX
        LD      HL,(SRC)
        LD      C,SYSLAT
        LD      A,(SLAT)
        LD      D,A
        LD      A,(DLAT)
        LD      E,A
        LD      B,512/8
U8L:    OUT     (C),D           ; one byte: 58 T-states
        LD      A,(HL)
        INC     HL
        OUT     (C),E
        EXX
        LD      (HL),A
        INC     HL
        EXX
        OUT     (C),D
        LD      A,(HL)
        INC     HL
        OUT     (C),E
        EXX
        LD      (HL),A
        INC     HL
        EXX
        OUT     (C),D
        LD      A,(HL)
        INC     HL
        OUT     (C),E
        EXX
        LD      (HL),A
        INC     HL
        EXX
        OUT     (C),D
        LD      A,(HL)
        INC     HL
        OUT     (C),E
        EXX
        LD      (HL),A
        INC     HL
        EXX
        OUT     (C),D
        LD      A,(HL)
        INC     HL
        OUT     (C),E
        EXX
        LD      (HL),A
        INC     HL
        EXX
        OUT     (C),D
        LD      A,(HL)
        INC     HL
        OUT     (C),E
        EXX
        LD      (HL),A
        INC     HL
        EXX
        OUT     (C),D
        LD      A,(HL)
        INC     HL
        OUT     (C),E
        EXX
        LD      (HL),A
        INC     HL
        EXX
        OUT     (C),D
        LD      A,(HL)
        INC     HL
        OUT     (C),E
        EXX
        LD      (HL),A
        INC     HL
        EXX
        DJNZ    U8L
U8END:  LD      A,(LATCHV)
        OUT     (SYSLAT),A
        RET

SP16GO: EXX                     ; the alternates, IX and IY are the caller's
        PUSH    BC
        PUSH    DE
        PUSH    HL
        EXX
        PUSH    IX
        PUSH    IY
        LD      (OLDSP),SP
        LD      HL,(SRC)
        LD      (SRCP),HL
        LD      HL,(DST)
        LD      DE,16
        ADD     HL,DE
        LD      (DSTP),HL       ; the end of the first sixteen
        LD      A,512/16
        LD      (CNT),A
SPL:    LD      A,(SLAT)
        OUT     (SYSLAT),A
        LD      SP,(SRCP)
        POP     BC
        POP     DE
        POP     HL
        EXX
        POP     BC
        POP     DE
        POP     HL
        POP     IX
        POP     IY
        LD      (SRCP),SP
        LD      A,(DLAT)
        OUT     (SYSLAT),A
        LD      SP,(DSTP)
        PUSH    IY
        PUSH    IX
        PUSH    HL
        PUSH    DE
        PUSH    BC
        EXX
        PUSH    HL
        PUSH    DE
        PUSH    BC
        LD      HL,32           ; SP is at these sixteen: the next end
        ADD     HL,SP
        LD      (DSTP),HL
        LD      A,(CNT)
        DEC     A
        LD      (CNT),A
        JR      NZ,SPL
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        LD      SP,(OLDSP)
        POP     IY
        POP     IX
        EXX
        POP     HL
        POP     DE
        POP     BC
        EXX
        RET
SPEND:

        ORG     $6200
SRC:    DW      0
DST:    DW      0
SLAT:   DB      0
DLAT:   DB      0
SRCP:   DW      0
DSTP:   DW      0
CNT:    DB      0
OLDSP:  DW      0
