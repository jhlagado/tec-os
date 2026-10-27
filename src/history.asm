; Command-line history: lines typed at the CCP prompt, kept in one page of
; EXPAND 1 from cold boot and shared by every CCP level. ^W at the prompt
; recalls the line before, ^N the line after. Function 10 called by a
; program is CP/M 2.2's, with ^W and ^N as characters.
;
; The ring: each line followed by a 0, written forward from HHEAD with the
; offset wrapping at 256. After the terminator, bytes are zeroed forward up
; to and including the next one already 0, which removes what is left of the
; oldest line it overwrote. So ring[HHEAD-1] and ring[HHEAD] are both 0, and
; a walk back from the newest stops at an empty entry. A line holding a 0 is
; not stored; nor is one equal to the newest. Cold boot takes the ring's
; page, HRING, with the CCP's level records and clears it.

HRING   EQU     $BD00           ; the page below LVBASE

; A = the ring's byte at L (HGET), or that byte = A (HPUT), with H the
; ring's page, HRING>>8. EXPAND 1 is in view for the access alone, and no stack is
; used while it is. Keeps BC, DE and HL.
HPUT:   PUSH    BC
        LD      B,A
        LD      C,1
        JR      HACC
HGET:   PUSH    BC
        LD      C,0
HACC:   LD      A,I             ; P/V = the interrupt state
        DI
        PUSH    AF
        LD      A,(LATCHV)
        OR      LATEXP
        OUT     (SYSLAT),A
        DEC     C
        JR      NZ,HACC1
        LD      (HL),B
HACC1:  LD      B,(HL)
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        POP     AF
        JP      PO,HACC2
        EI
HACC2:  LD      A,B
        POP     BC
        RET

; L = an entry's terminator: L = its first byte, L itself when it is empty.
HSTART: DEC     L
        CALL    HGET
        INC     L
        OR      A
        RET     Z
        DEC     L
        JR      HSTART

; ^W or ^N, in C, at the CCP prompt: the line in the buffer replaced by the
; line before or after the one shown. HPOS is the shown line's terminator,
; HHEAD's empty entry when none is shown.
HREC:   LD      H,HRING>>8
        LD      A,(HPOS)
        LD      L,A
        LD      A,C
        CP      CTRLN
        JR      Z,HRNEW
        CALL    HSTART
        DEC     L               ; the line before's terminator
        DEC     L
        CALL    HGET
        INC     L
        OR      A
        RET     Z               ; none before: stay
        JR      HRSHOW
HRNEW:  LD      A,(HHEAD)
        CP      L
        RET     Z               ; none shown
HRNEW1: INC     L
        CALL    HGET
        OR      A
        JR      NZ,HRNEW1
HRSHOW: LD      A,L
        LD      (HPOS),A
        CALL    HSTART
        PUSH    HL
        CALL    LINERASE
        POP     HL
HRCOPY: LD      A,(HPOS)
        CP      L
        RET     Z
        LD      BC,(LINMAX)     ; C the maximum, B the count
        LD      A,C
        CP      B
        RET     Z               ; cut at the buffer's maximum
        CALL    HGET
        LD      C,A
        PUSH    HL
        LD      HL,(LINPTR)
        LD      (HL),C
        INC     HL
        LD      (LINPTR),HL
        LD      HL,LINCNT
        INC     (HL)
        CALL    ECHOCHAR
        POP     HL
        INC     L
        JR      HRCOPY

; The line function 10 returns, B bytes at DE (B not 0), into the ring,
; unless it holds a 0 or equals the newest line.
HSTORE: LD      H,HRING>>8
        LD      A,(HHEAD)
        DEC     A
        LD      L,A
        CALL    HSTART          ; L = the newest's first byte
        PUSH    DE
        PUSH    BC
        LD      C,0             ; 0 while the line matches the newest
HSCMP:  LD      A,(DE)
        OR      A
        JR      Z,HSKEEP        ; a 0 in it: not stored
        CALL    HGET
        EX      DE,HL
        CP      (HL)
        EX      DE,HL
        JR      Z,HSCMP1
        INC     C
HSCMP1: INC     DE
        INC     L
        DJNZ    HSCMP
        LD      A,(HHEAD)       ; matched, and the newest ends here too
        DEC     A
        SUB     L
        OR      C
        JR      Z,HSKEEP
        POP     BC
        POP     DE
        LD      A,(HHEAD)
        LD      L,A
HSPUT:  LD      A,(DE)
        CALL    HPUT
        INC     DE
        INC     L
        DJNZ    HSPUT
        XOR     A
        CALL    HPUT            ; the terminator
        INC     L
        LD      A,L
        LD      (HHEAD),A
HSCLR:  CALL    HGET            ; zero forward through the next 0
        LD      B,A
        XOR     A
        CALL    HPUT
        INC     L
        OR      B
        JR      NZ,HSCLR
        RET
HSKEEP: POP     BC
        POP     DE
        RET
