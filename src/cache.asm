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
; SDLBA, marks the line clean on success, and on a failure leaves it dirty
; and returns NZ. Both keep A.
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
        JR      CSET            ; Z
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
CWR9:	LD	C,A		; the line, kept
	XOR	A
	INC	A		; NZ: the write failed
	LD	A,C
	RET

; Write every dirty line (CFLALL), or every one but line A (CFLUSH). Each
; is tried; one whose write fails is dropped, so the card's copy stands, and
; the flush returns NZ if any did, Z if none. Returns A = the line left (FFh
; for CFLALL). Destroys BC, DE and HL.
CFLALL:	LD	A,$FF
CFLUSH:	LD	C,A		; the line to leave
	LD	B,0		; lines that failed
	XOR	A
CFS1:	CP	C
	JR	Z,CFS2		; the one left
	PUSH	BC
	CALL	CDGET		; Z: clean, nothing to write
	CALL	NZ,CWRITE	; keeps A, NZ if the card refused it
	POP	BC
	JR	Z,CFS2
	PUSH	BC
	CALL	CDROP		; failed: dropped, the card's copy stands
	POP	BC
	INC	B		; and counted
CFS2:	INC	A		; every line, failures or not
	CP	NLINES
	JR	C,CFS1
	LD	A,C		; the line left, for CWB3
	INC	B
	DEC	B		; NZ if any failed
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
	CALL	Z,CWRITE	; the line goes, so the card's directory
        RET     Z               ; stays the truth and is read again
        CALL    CDROP
        OR      1               ; NZ
        RET

; Warm boot: every dirty line tried, and, if any failed and was dropped,
; Write lost said once. The rest of a chained line goes, as it does on a BDOS
; error's exit.
CWBOOT:	CALL	CFLALL
	RET	Z		; every line written
	XOR	A
	LD	(CHPOS),A	; the chained line goes
	LD	HL,CWMSG
	JP	PUTS

; After a write through BLKBUF: the line that holds SDLBA's block, if one does,
; takes the new contents, so that it can't hand back the old ones. Destroys AF,
; BC, DE and HL.
CREFR:	CALL	CLOOK		; A = the line, Z if there is one
	RET	NZ		; not cached: nothing to keep true
	LD	BC,$0001	; XMDST bank 1, XMSRC bank 0
	LD	(XMDST),BC
	CALL	CLADR		; HL = the line
	LD	DE,BLKBUF	; from the block just written
	LD	BC,512
	CALL	MVCOPY		; a CALL: the host's guard on EXPAND 1 reads
	RET			; the return address to name its writer
CEND:

; MVCOPY: the cache's copy between EXPAND 0 and EXPAND 1. BC bytes from DE to
; HL, forward as LDIR does, XMDST and XMSRC the destination's and source's
; banks: 0 the program's view, 1 EXPAND 1. Returns A = 0 with HL and DE advanced
; by BC. Destroys BC and F; the alternate registers are kept, and the latch and
; the interrupt state are as it found them.
;
; With interrupts off, EXPAND 1 is switched in only around code that uses no
; stack, as the caller's stack may be in EXPAND 0. Within one bank: LDIR in
; that bank's view. Across banks, the bank-0 end's part below 8000h, in the
; fixed RAM, copies by LDIR with EXPAND 1 in view; its part in EXPAND 0 copies a byte
; at a time, the latch switched between each read and write, with the two
; latch values in D' and E'.
MVCOPY: LD      A,B
        OR      C
        JP      Z,MVOK
        CALL    IFFGET
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
        RET
