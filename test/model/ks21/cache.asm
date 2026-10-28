; KS21's model, not the product: the block cache's ROM code as the brief
; designs it, written out to be assembled for its size, with the ROM's
; symbols in place of the EQUs line below. CLOOK alone is also run, to
; time a lookup.
;
; EXPAND 1: lines at 8000h-BBFFh, 512 bytes each; the table at BC00h, each
; line's card block, 4 bytes, FFFFFFFFh for an empty line. In EXPAND 0's
; workspace: the dirty lines as a 32-bit map, the next line in turn, the
; write-behind drive and a failed-write flag. Interrupts are off in the
; BIOS, as now.

; ROM EQUS

CTAB    EQU     $BC00
NLINES  EQU     30

        ORG     $C000
; ---- The table ------------------------------------------------------------------

; Look up SDLBA's block. Z with A = the line if it has one; NZ if not.
; Uses no stack while EXPAND 1 is in view. Destroys BC, DE, HL.
CLOOK:  LD      DE,(SDLBA)
        LD      BC,(SDLBA+2)
        LD      HL,CTAB
        LD      A,(LATCHV)
        OR      LATEXP
        OUT     (SYSLAT),A
CLK1:   LD      A,(HL)          ; 52 T-states a line whose first byte differs
        CP      E
        JR      Z,CLK3
CLK2:   LD      A,L
        ADD     A,4
        LD      L,A
        CP      NLINES*4
        JR      C,CLK1
        LD      A,(LATCHV)      ; not found: NZ
        OUT     (SYSLAT),A
        OR      1
        RET
CLK3:   INC     L
        LD      A,(HL)
        DEC     L
        CP      D
        JR      NZ,CLK2
        INC     L
        INC     L
        LD      A,(HL)
        DEC     L
        DEC     L
        CP      C
        JR      NZ,CLK2
        INC     L
        INC     L
        INC     L
        LD      A,(HL)
        DEC     L
        DEC     L
        DEC     L
        CP      B
        JR      NZ,CLK2
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        LD      A,L             ; found: Z, A = the line
        RRCA
        RRCA
        CP      A
        RET
CLKEND:

; Line A's table entry := SDLBA (CSET), or FFFFFFFFh (CDROP).
CSET:   LD      DE,SDLBA
        JR      CENT
CDROP:  LD      DE,CFF
CENT:   ADD     A,A
        ADD     A,A
        LD      L,A
        LD      H,CTAB>>8
        LD      BC,$0001        ; XMDST bank 1, XMSRC bank 0
        LD      (XMDST),BC
        LD      BC,4
        JP      MVCOPY
CFF:    DB      $FF,$FF,$FF,$FF

; Cold boot, after EXPAND 1's clear: every line empty.
CINIT:  LD      A,NLINES-1
CIN1:   PUSH    AF
        CALL    CDROP
        POP     AF
        SUB     1
        JR      NC,CIN1
        RET

; HL = line A's address in EXPAND 1.
CLADR:  ADD     A,A
        ADD     A,$80
        LD      H,A
        LD      L,0
        RET

; The dirty map: Z if line A is clean (CDTST); set it (CDSET) or clear it
; (CDCLR). Keeps A.
CDBIT:  PUSH    AF
        LD      C,A
        AND     7
        LD      B,A
        LD      A,1
        INC     B
CDB1:   DEC     B
        JR      Z,CDB2
        ADD     A,A
        JR      CDB1
CDB2:   LD      B,A             ; the bit
        LD      A,C
        RRCA
        RRCA
        RRCA
        AND     3
        LD      HL,CDIRTY
        ADD     A,L
        LD      L,A
        JR      NC,CDB3
        INC     H
CDB3:   POP     AF
        RET
CDTST:  CALL    CDBIT
        PUSH    AF
        LD      A,(HL)
        AND     B
        POP     BC
        LD      A,B
        RET
CDSET:  CALL    CDBIT
        PUSH    AF
        LD      A,(HL)
        OR      B
        LD      (HL),A
        POP     AF
        RET
CDCLR:  CALL    CDBIT
        PUSH    AF
        LD      A,B
        CPL
        AND     (HL)
        LD      (HL),A
        POP     AF
        RET

; ---- Lines and the card ---------------------------------------------------------

; Copy BLKBUF to line A (CFILL), or line A to BLKBUF (CEMPTY). Keeps A.
CFILL:  PUSH    AF
        CALL    CLADR
        LD      DE,BLKBUF
        LD      BC,$0001
        JR      CCOPY
CEMPTY: PUSH    AF
        CALL    CLADR
        EX      DE,HL
        LD      HL,BLKBUF
        LD      BC,$0100
CCOPY:  LD      (XMDST),BC
        LD      BC,512
        CALL    MVCOPY
        POP     AF
        RET

; Write line A to its card block and mark it clean; on a failed write it
; stays dirty and CFAIL is set. BLKBUF is used, and left invalid.
CWRITE: PUSH    AF
        CALL    CEMPTY
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,CTAB>>8
        LD      HL,SDLBA
        LD      BC,$0100        ; XMDST bank 0, XMSRC bank 1
        LD      (XMDST),BC
        LD      BC,4
        CALL    MVCOPY
        XOR     A
        LD      (BUFOK),A
        LD      HL,BLKBUF
        CALL    SDWRITE
        POP     BC
        LD      A,B
        JR      NZ,CWBAD
        JP      CDCLR
CWBAD:  LD      A,1
        LD      (CFAIL),A
        LD      A,B
        RET

; Write every dirty line (CFLUSH); A = the line to skip, FFh for none.
CFLUSH: LD      (CSKIP),A
        LD      A,NLINES-1
CFL1:   LD      HL,CSKIP
        CP      (HL)
        JR      Z,CFL2
        CALL    CDTST
        CALL    NZ,CWRITE
CFL2:   SUB     1
        JR      NC,CFL1
        RET

; A line for SDLBA's block: the next clean one in turn, or the next one
; written first when all are dirty. A = the line, entered in the table.
CTAKE:  LD      A,(CNEXT)
        LD      E,NLINES
CTK1:   CALL    CDTST
        JR      Z,CTK3
        INC     A
        CP      NLINES
        JR      C,CTK2
        XOR     A
CTK2:   DEC     E
        JR      NZ,CTK1
        LD      A,(CNEXT)       ; every line dirty
        CALL    CWRITE
CTK3:   LD      B,A
        INC     A
        CP      NLINES
        JR      C,CTK4
        XOR     A
CTK4:   LD      (CNEXT),A
        LD      A,B
        PUSH    AF
        CALL    CSET
        POP     AF
        RET

; ---- BIOS READ and WRITE ---------------------------------------------------------

; Copy the mapped record between line A and DSKDMA: to DSKDMA (CRDREC) or
; from it (CWRREC).
CRECAD: CALL    CLADR
        LD      A,(BLKSLOT)
        RRCA
        LD      E,A
        AND     $80
        LD      L,A
        LD      A,E
        AND     1
        ADD     A,H
        LD      H,A
        RET
CRDREC: CALL    CRECAD
        EX      DE,HL
        LD      HL,(DSKDMA)
        LD      BC,$0100
        JR      CREC
CWRREC: CALL    CRECAD
        LD      DE,(DSKDMA)
        LD      BC,$0001
CREC:   LD      (XMDST),BC
        LD      BC,128
        JP      MVCOPY

; BREAD after MAPREC: a hit is copied from its line; a miss is read into
; BLKBUF, which is no key, then given a line, then served as now.
CBREAD: CALL    CLOOK
        JR      NZ,CBR1
        CALL    CRDREC
        XOR     A
        RET
CBR1:   XOR     A
        LD      (BUFOK),A
        CALL    GETBLK
        JP      NZ,DSKERR
        CALL    CTAKE
        CALL    CFILL
        JP      BRSERV          ; today's record copy from BLKBUF

; BWRITE after its checks, C = the write type and the pre-read decided.
; Write-through: today's path, then the line refreshed, or dropped if the
; write failed. Write-behind: merged in the line; a directory write then
; writes every dirty line and its own.
CBWRT:  LD      A,(DSKCUR)
        LD      HL,CWBD
        CP      (HL)
        JR      Z,CBWB
        PUSH    BC
        CALL    BWTODAY         ; GETBLKW, the merge, SDWRITE
        POP     BC
        PUSH    AF
        CALL    CLOOK
        JR      NZ,CBW2
        POP     BC
        PUSH    BC
        PUSH    AF
        LD      A,B
        OR      A
        POP     BC
        LD      A,B
        JR      NZ,CBW1
        CALL    CFILL
        JR      CBW2
CBW1:   CALL    CDROP
CBW2:   POP     AF
        RET
CBWB:   PUSH    BC
        CALL    CLOOK
        JR      Z,CBW3
        POP     BC
        PUSH    BC
        CALL    GETBLKW
        JR      NZ,CBWE
        CALL    CTAKE
        CALL    CFILL
CBW3:   PUSH    AF
        CALL    CWRREC
        POP     AF
        CALL    CDSET
        POP     BC
        DEC     C               ; C = 1: a directory block
        JR      NZ,CBWOK
        PUSH    AF
        CALL    CFLUSH
        POP     AF
        CALL    CWRITE
        LD      A,(CFAIL)
        OR      A
        JP      NZ,DSKERR
CBWOK:  XOR     A
        RET
CBWE:   POP     BC
        JP      DSKERR

; ---- Warm boot, MOUNT and BLOCK -------------------------------------------------

; Warm boot: every dirty line written; a failure said once.
CWBOOT: LD      A,$FF
        CALL    CFLUSH
        LD      HL,CFAIL
        LD      A,(HL)
        OR      A
        RET     Z
        LD      (HL),0
        LD      HL,CWMSG
        JP      PUTS
CWMSG:  DB      13,10,"Cache write failed",13,10,0

; MOUNT, for each volume mounted: the descriptor's byte 15, bit 0, makes
; its drive the write-behind one. Unmounting it writes its lines first.
CMOUNT: BIT     0,(IX+15)
        RET     Z
        LD      A,C
        LD      (CWBD),A
        RET
CUNMNT: LD      HL,CWBD
        CP      (HL)
        RET     NZ
        LD      A,$FF
        CALL    CFLUSH
        LD      A,$FF
        LD      (CWBD),A
        RET

; The BLOCK service: a cached block comes from its line.
CBLOCK: CALL    CLOOK
        RET     NZ
        CALL    CLADR
        EX      DE,HL
        LD      HL,(HWBUF)
        LD      BC,$0100
        LD      (XMDST),BC
        LD      BC,512
        CALL    MVCOPY
        XOR     A
        RET
CEND:
