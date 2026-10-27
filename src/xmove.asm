; EXPAND 1's allocator. XMARK is the high byte of the lowest allocated
; address; cold boot sets it to XMTOP, so the reserved page BF00h-BFFFh is
; the first allocation, and warm boot leaves it. Blocks are whole pages,
; since a relocated module must start on a page boundary, and are freed last
; in, first out. Neither routine writes EXPAND 1.

; A = pages: HL = the new block's base with carry clear, or carry set and
; nothing changed when it would go below XMFLOOR. Destroys A, L.
XALLOC: LD      L,A
        LD      A,(XMARK)
        SUB     L
        JR      C,XAFAIL
        CP      XMFLOOR
        JR      C,XAFAIL
        LD      (XMARK),A
        LD      H,A
        LD      L,0
        RET
XAFAIL: SCF
        RET

; HL = a block's base, A = its pages: carry clear and the block freed if it
; is the lowest; carry set and nothing changed otherwise. Destroys A, E.
XFREE:  LD      E,A
        LD      A,L
        OR      A
        JR      NZ,XAFAIL
        LD      A,(XMARK)
        CP      H
        JR      NZ,XAFAIL
        ADD     A,E
        JR      C,XAFAIL
        CP      XMTOP+1
        JR      NC,XAFAIL
        LD      (XMARK),A
        OR      A
        RET

; XMOVE and MOVE, with CP/M 3's names and registers, at FF12h and
; FF15h and through BDOS function 50. Bank 0 is the program's view, MAIN 0
; and EXPAND 0 below the BDOS entry at (0006h); bank 1 is EXPAND 1 from
; 8000h up to its low mark. A copy never switches MAIN, and returns with the latch and the
; interrupt state as it found them.

; XMOVE: B = destination bank, C = source bank, for the next MOVE only.
XMOVE:  LD      A,B
        LD      (XMDST),A
        LD      A,C
        LD      (XMSRC),A
        RET

; MOVE: copy BC bytes from DE to HL, forward as LDIR does. Returns A = 0 with
; HL and DE advanced by BC, or A = FFh with nothing copied when a byte of
; either end lies outside its bank. Destroys BC and F; the alternate
; registers are kept.
;
; With interrupts off, EXPAND 1 is switched in only around code that uses no
; stack, as the program's stack may be in EXPAND 0. Within one bank: LDIR in
; that bank's view. Across banks, the bank-0 end's part below 8000h, in MAIN
; 0, copies by LDIR with EXPAND 1 in view; its part in EXPAND 0 copies a byte
; at a time, the latch switched between each read and write, with the two
; latch values in D' and E'.
MOVE:   LD      A,(XMDST)
        CALL    MVRANGE
        JP      C,MVBAD
        EX      DE,HL
        LD      A,(XMSRC)
        CALL    MVRANGE
        EX      DE,HL
        JP      C,MVBAD
; MVCOPY: the copy without the range check, for the ROM's own copies into
; pages it has allocated (XMDST and XMSRC set, HL, DE and BC as MOVE's).
MVCOPY: LD      A,B
        OR      C
        JP      Z,MVOK
        LD      A,I             ; P/V = the interrupt state
        DI
        PUSH    AF
        EXX
        PUSH    BC
        PUSH    DE
        LD      C,SYSLAT
        LD      A,(LATCHV)
        LD      D,A             ; the source's latch
        LD      E,A             ; the destination's
        LD      A,(XMSRC)
        OR      A
        JR      Z,MV1
        SET     2,D
MV1:    LD      A,(XMDST)
        OR      A
        JR      Z,MV2
        SET     2,E
MV2:    LD      A,D
        CP      E
        EXX
        JR      Z,MVLDIR        ; one bank
        PUSH    HL
        LD      A,(XMDST)
        OR      A
        JR      Z,MV3
        LD      H,D             ; HL = the bank-0 end
        LD      L,E
MV3:    PUSH    DE
        EX      DE,HL
        LD      HL,$8000
        OR      A
        SBC     HL,DE           ; bytes below 8000h
        POP     DE
        JR      C,MVNONE
        JR      Z,MVNONE
        SBC     HL,BC           ; carry is clear
        JR      C,MV4
        LD      HL,0            ; all of it is below 8000h
MV4:    ADD     HL,BC           ; HL = the part below 8000h
        PUSH    HL
        LD      H,B
        LD      L,C
        POP     BC
        OR      A
        SBC     HL,BC
        LD      (MVREST),HL     ; and the part in EXPAND 0
        POP     HL
        EXX
        LD      A,D
        OR      E               ; EXPAND 1 in view
        OUT     (C),A
        EXX
        EX      DE,HL           ; LDIR copies from HL to DE
        LDIR
        EX      DE,HL
        EXX
        LD      A,D
        AND     E               ; EXPAND 0 in view
        OUT     (C),A
        EXX
        LD      BC,(MVREST)
        JR      MVBYTE
MVNONE: POP     HL
MVBYTE: LD      A,B
        OR      C
        JR      Z,MVEND
MVBL:   EXX
        OUT     (C),D
        EXX
        LD      A,(DE)
        EXX
        OUT     (C),E
        EXX
        LD      (HL),A
        INC     HL
        INC     DE
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,MVBL
        JR      MVEND
MVLDIR: EXX
        OUT     (C),D
        EXX
        EX      DE,HL
        LDIR
        EX      DE,HL
MVEND:  LD      A,(LATCHV)      ; page zero is in MAIN 0, always in view
        OUT     (SYSLAT),A
        EXX
        POP     DE
        POP     BC
        EXX
        POP     AF
        JP      PO,MVOK
        EI
MVOK:   XOR     A
        JR      MVCLR
MVBAD:  LD      A,$FF
MVCLR:  PUSH    AF
        XOR     A
        LD      (XMDST),A
        LD      (XMSRC),A
        POP     AF
        RET

; Carry set unless bank A holds BC bytes from HL: bank 0 below (0006h), bank
; 1 from 8000h up to the low mark. Keeps BC, DE and HL.
MVRANGE:PUSH    DE
        PUSH    HL
        CP      2
        JR      NC,MVRBAD
        DEC     A
        LD      DE,(PZBDOS+1)
        JR      NZ,MVR0
        BIT     7,H
        JR      Z,MVRBAD
        LD      A,(XMARK)       ; bank 1 ends at the low mark
        LD      D,A
        LD      E,0
MVR0:   ADD     HL,BC           ; the end
        JR      C,MVRBAD
        EX      DE,HL
        SBC     HL,DE           ; carry is clear: carry if past the limit
        JR      MVRX
MVRBAD: SCF
MVRX:   POP     HL
        POP     DE
        RET
