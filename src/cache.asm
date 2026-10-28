; The block cache: 30 lines of 512 bytes in EXPAND 1 at 8000h-BBFFh, keyed
; by card block, with its table in the page at BC00h: each line's block,
; 4 bytes from BC00h (FFFFFFFFh for an empty line), and its dirty byte from
; BC80h. Every volume's reads go through it. A volume whose descriptor has
; byte 15 bit 0 set is written behind: its writes stay in their lines until
; a directory write of the volume, no clean line left, warm boot or a
; remount writes them, data before directory. Every other volume is written
; through as before, and its line refreshed.
;
; Blocks go straight between the card and a line: SDREAD and SDWRITE put
; EXPAND 1 in view around their block loops when SDXB is LATEXP. Nothing
; here uses the stack while EXPAND 1 is in view, and the BIOS entries run
; with interrupts off (CDI, CEI), so none can arrive while it is.

; CTAB, CDIRTY and NLINES are in layout.asm.

; Interrupts off for a BIOS entry, their state kept in CIFF (CDI); back as
; they were, keeping A and the flags (CEI). CDI destroys HL.
CDI:    LD      A,I             ; P/V = the interrupt state
        DI
        PUSH    AF
        POP     HL
        LD      (CIFF),HL       ; L: the flags, P/V in bit 2
        RET
BRET:   LD      A,0             ; BIOS READ and WRITE: A from Z or NZ, and
        JR      Z,CEI           ; interrupts as they were
        INC     A
CEI:    PUSH    AF
        LD      A,(CIFF)
        AND     4
        JR      Z,CEI1
        EI
CEI1:   POP     AF
        RET

; HL = line A's block in the table (CTADR), or entry A of the page (CTENT),
; and A = the latch value with EXPAND 1 in view (CXON), for the caller's OUT.
CTADR:  ADD     A,A
        ADD     A,A
CTENT:  LD      L,A
        LD      H,CTAB>>8
CXON:   LD      A,(LATCHV)
        OR      LATEXP
        RET

; Look up SDLBA's block: Z with A = its line; NZ if no line has it.
; Destroys BC, DE, HL.
CLOOK:  LD      DE,(SDLBA)
        LD      BC,(SDLBA+2)
        XOR     A
        CALL    CTENT
        OUT     (SYSLAT),A
CLK1:   LD      A,(HL)
        CP      E
        JR      NZ,CLK2
        INC     L
        LD      A,(HL)
        CP      D
        JR      NZ,CLK2
        INC     L
        LD      A,(HL)
        CP      C
        JR      NZ,CLK2
        INC     L
        LD      A,(HL)
        CP      B
        JR      Z,CLK3
CLK2:   LD      A,L             ; the next line's block
        OR      3
        INC     A
        LD      L,A
        CP      NLINES*4
        JR      C,CLK1
        LD      A,(LATCHV)      ; not found
        OUT     (SYSLAT),A
        OR      1               ; NZ
        RET
CLK3:   LD      A,(LATCHV)
        OUT     (SYSLAT),A
        LD      A,L             ; found: A = the line, Z
        RRCA
        RRCA
        AND     $3F
        CP      A
        RET

; Line A's entry: block SDLBA and clean (CSET), or empty (CDROP). Keeps A.
CSET:   LD      DE,(SDLBA)
        LD      BC,(SDLBA+2)
        JR      CENT
CDROP:  LD      DE,$FFFF
        LD      B,D
        LD      C,E
CENT:   PUSH    AF
        CALL    CTADR
        OUT     (SYSLAT),A
        LD      (HL),E
        INC     L
        LD      (HL),D
        INC     L
        LD      (HL),C
        INC     L
        LD      (HL),B
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        POP     AF
CDCLR:  LD      C,0             ; clean
        JR      CDPUT

; Line A's dirty byte: Z if it is clean (CDGET); set it (CDSET), clear it
; (CDCLR) or make it C (CDPUT). Each keeps A.
CDGET:  LD      C,$FF
        JR      CDPUT
CDSET:  LD      C,1
CDPUT:  PUSH    AF
        ADD     A,CDIRTY-CTAB
        CALL    CTENT
        OUT     (SYSLAT),A
        LD      A,C
        INC     A
        JR      Z,CDP1          ; FFh: only read it
        LD      (HL),C
CDP1:   LD      B,(HL)
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        POP     AF
        INC     B
        DEC     B
        RET

; HL = line A's address.
CLADR:  ADD     A,A
        ADD     A,$80
        LD      H,A
        LD      L,0
        RET

; Read SDLBA's block straight into line A (CFILL), or write line A straight
; to its block (CWRITE). Z on success. CFILL enters the line on success and
; leaves it empty otherwise. CWRITE takes the block from the table, keeps
; SDLBA, marks the line clean on success, and on a failure sets CFAIL and
; leaves it dirty. Both keep A.
CFILL:  PUSH    AF
        CALL    CLADR
        LD      A,LATEXP
        LD      (SDXB),A
        CALL    SDREAD
        PUSH    AF
        XOR     A
        LD      (SDXB),A
        POP     AF
        JR      NZ,CFL9
        POP     AF
        JP      CSET            ; Z
CFL9:   POP     AF
        CALL    CDROP
        OR      1
        RET
CWRITE: PUSH    AF
        CALL    CTADR
        OUT     (SYSLAT),A
        LD      E,(HL)
        INC     L
        LD      D,(HL)
        INC     L
        LD      C,(HL)
        INC     L
        LD      B,(HL)
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        LD      (SDLBA),DE
        LD      (SDLBA+2),BC
        POP     AF
        PUSH    AF
        CALL    CLADR
        LD      A,LATEXP
        LD      (SDXB),A
        CALL    SDWRITE
        PUSH    AF
        XOR     A
        LD      (SDXB),A
        CALL    MAPREC          ; SDLBA back as the caller mapped it
        POP     BC
        POP     AF
        BIT     6,C             ; SDWRITE's Z
        JR      Z,CWR9
        CALL    CDCLR           ; written: clean
        CP      A
        RET
CWR9:   LD      C,1
        LD      HL,CFAIL
        LD      (HL),C
        DEC     C
        DEC     C               ; NZ
        RET

; Write every dirty line (CFLALL), or every one but line A (CFLUSH). NZ at
; the first that fails; the rest stay dirty.
CFLALL: LD      A,$FF
CFLUSH: LD      (CSKIP),A
        XOR     A
CFS1:   LD      HL,CSKIP
        CP      (HL)
        JR      Z,CFS2
        CALL    CDGET
        CALL    NZ,CWRITE
        RET     NZ
CFS2:   INC     A
        CP      NLINES
        JR      C,CFS1
        CP      A
        RET

; A line for SDLBA's block: the next clean one in turn, or, with every line
; dirty, the next in turn written first. Z with A = the line; NZ if that
; write failed.
CTAKE:  LD      B,NLINES
        LD      A,(CNEXT)
        ADD     A,CDIRTY-CTAB
        CALL    CTENT
        OUT     (SYSLAT),A
CTK1:   LD      A,(HL)
        OR      A
        JR      Z,CTK3          ; clean
        INC     L
        LD      A,L
        CP      CDIRTY-CTAB+NLINES
        JR      C,CTK2
        LD      L,CDIRTY-CTAB
CTK2:   DJNZ    CTK1
CTK3:   LD      A,(LATCHV)
        OUT     (SYSLAT),A
        LD      A,L
        SUB     CDIRTY-CTAB
        INC     B
        DEC     B
        JR      NZ,CTK5         ; a clean line
        CALL    CWRITE          ; every line dirty: this one written first
        RET     NZ
CTK5:   LD      E,A
        INC     A
        CP      NLINES
        JR      C,CTK4
        XOR     A
CTK4:   LD      (CNEXT),A
        LD      A,E
        CP      A
        RET

; Copy the mapped record between line A and DSKDMA: to DSKDMA (CRDREC) or
; from it (CWRREC).
CRECAD: CALL    CLADR
        LD      A,(BLKSLOT)     ; slot * 128: its half page in L, its page
        SRL     A               ; added to H
        RR      L
        ADD     A,H
        LD      H,A
        RET
CRDREC: CALL    CRECAD
        EX      DE,HL
        LD      HL,(DSKDMA)
        LD      BC,$0100        ; XMDST bank 0, XMSRC bank 1
        JR      CREC
CWRREC: CALL    CRECAD
        LD      DE,(DSKDMA)
        LD      BC,$0001        ; XMDST bank 1, XMSRC bank 0
CREC:   LD      (XMDST),BC
        LD      BC,128
        JP      MVCOPY

; BIOS READ, every volume: a hit is copied from its line; a miss is read
; straight into the next line, then copied from it.
CREAD:  CALL    CLOOK
        JR      Z,CRD1
        CALL    CTAKE
        RET     NZ
        CALL    CFILL
        RET     NZ
CRD1:   CALL    CRDREC
        XOR     A
        RET

; BIOS WRITE on a write-behind volume, from BWRITE with its checks done and
; C = 1 when the block needs no pre-read. The record goes into the block's
; line, which is dirty; a directory write then writes every dirty line and
; its own last, and never leaves its line dirty. Z on success.
CWRBH:  PUSH    BC
        CALL    CLOOK
        POP     BC
        JR      Z,CWB1          ; the line has it
        PUSH    BC
        CALL    CTAKE
        POP     BC
        RET     NZ
        INC     C
        DEC     C
        JR      Z,CWBF          ; the card's block first
CWB1:   DEC     C
        JR      NZ,CWBK         ; a line's bytes kept
        PUSH    AF              ; nothing to keep, a hit's old bytes too:
        CALL    CLADR           ; cleared, as written through
        CALL    CXON
        OUT     (SYSLAT),A
        LD      D,H
        LD      E,L
        INC     DE
        LD      BC,511
        LD      (HL),0
        LDIR
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        LD      C,2             ; BWRITE's key: this block cleared
        CALL    GETKEY
        POP     AF
        CALL    CSET
        JR      CWB2
CWBF:   CALL    CFILL           ; the card's block first
        RET     NZ
CWBK:   LD      C,A             ; BWRITE's key: had it named the block before
        LD      A,(BLKOFF)      ; this one as cleared, the rule would clear
        DEC     A               ; this one, records and all, once its line
        LD      HL,BUFBLK       ; had gone; so that key goes (the low bytes
        CP      (HL)            ; are enough: a false match costs a read)
        JR      NZ,CWBK1
        XOR     A
        LD      (BUFOK),A
CWBK1:  LD      A,C
CWB2:   PUSH    AF
        CALL    CWRREC
        POP     AF
        CALL    CDSET
        LD      C,A
        LD      A,(CWTYPE)
        DEC     A
        JR      Z,CWB3
        XOR     A               ; data: done
        RET
CWB3:   LD      A,C             ; a directory block: the volume's data first,
        CALL    CFLUSH          ; then the directory line; if either fails,
        LD      A,(CSKIP)       ; the line goes, so the card's directory
        CALL    Z,CWRITE        ; stays the truth and is read again
        RET     Z
        CALL    CDROP
        OR      1               ; NZ
        RET

; Warm boot: every dirty line written, and a failed write said.
CWBOOT: CALL    CFLALL
        LD      HL,CFAIL
        LD      A,(HL)
        OR      A
        RET     Z
        LD      (HL),0
        LD      HL,CWMSG
        JP      PUTS
CWMSG:  DB      13,10,"Write lost",0

; The BLOCK service: SDLBA's block from its line into the 512 bytes at HL,
; Z, if a line has it (CBLOCK). BLKBUF into the line that has SDLBA's
; block, if one does (CREFR).
CBLOCK: LD      BC,$0100        ; XMDST bank 0, XMSRC bank 1
        JR      CXL
CREFR:  LD      HL,BLKBUF
        LD      BC,$0001        ; XMDST bank 1, XMSRC bank 0
CXL:    PUSH    HL
        PUSH    BC
        CALL    CLOOK
        POP     BC
        POP     DE              ; DE = the other end
        RET     NZ
        LD      (XMDST),BC
        CALL    CLADR           ; HL = the line
        DEC     C
        JR      Z,CXL1          ; into the line: DE is the source
        EX      DE,HL
CXL1:   LD      BC,512
        CALL    MVCOPY
        XOR     A
        RET
CEND:
