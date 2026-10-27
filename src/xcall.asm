; Port drivers in EXPAND 1, called through XCALL. A driver's code, data and
; stack are all in EXPAND 1, so nothing of it takes room from programs; it
; takes its arguments in registers and never touches EXPAND 0. Its routines
; are reached through the call table in EXPAND 1's reserved page, eight
; slots, and a thunk in ROM for each slot. A driver for the console's
; display hooks the six video entries, slot n for entry n; the terminal's
; vector then points at DRVVEC instead of a display's own routines.
;
; EXPAND 1's reserved page, BF00h-BFFFh:
;   03h  warm boot's JP WBOOTR, kept clear      10h  the call table, 8 slots
;   20h  XSP, the caller's SP                   30h  the row transfer buffer
;   80h-FFh  the driver stack, down from C000h

XTABLE  EQU     $BF10
XSP     EQU     $BF20
XFER    EQU     $BF30
XSTACK  EQU     $C000

; The thunks: L = the slot's offset in the call table. HL is free at every
; entry they stand for, so A, BC and DE all reach the driver.
THK0:   LD      L,XTABLE+0-$BF00
        JR      XCALL
THK1:   LD      L,XTABLE+2-$BF00
        JR      XCALL
THK2:   LD      L,XTABLE+4-$BF00
        JR      XCALL
THK3:   LD      L,XTABLE+6-$BF00
        JR      XCALL
THK4:   LD      L,XTABLE+8-$BF00
        JR      XCALL
THK5:   LD      L,XTABLE+10-$BF00
        JR      XCALL

; The video vector for a display driver: VPUT, VGET, VCLREOL and VREST
; through their thunks; VRDROW and VWRROW through the row wrappers.
DRVVEC: DW      THK0,THK1,THK2,THK3,VXRDR,VXWRR

; Call the routine in slot L with A, BC and DE as given. Returns the
; driver's A, BC, DE and HL, with SP, the latch and the interrupt state as
; they were. Destroys AF'.
XCALL:  EX      AF,AF'          ; the caller's A
        LD      A,I             ; P/V = the interrupt state
        DI
        PUSH    AF              ; on the caller's stack
        LD      A,(LATCHV)
        OR      LATEXP
        OUT     (SYSLAT),A      ; EXPAND 1 in view: no stack until XSTACK
        LD      (XSP),SP
        LD      SP,XSTACK
        LD      H,XTABLE>>8
        LD      A,(HL)          ; the routine's address from the table
        INC     L
        LD      H,(HL)
        LD      L,A
        EX      AF,AF'          ; the caller's A for the driver
        CALL    PRLJP
        EX      AF,AF'          ; the driver's A, kept in A'
        LD      SP,(XSP)        ; still in EXPAND 1's view
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        POP     AF
        JP      PO,XC1
        EI
XC1:    EX      AF,AF'
        RET

; VRDROW for a driver: the driver puts row B in the transfer buffer, then
; it comes to LINEBUF. VWRROW: LINEBUF to the transfer buffer, then the
; driver takes row B from it.
VXRDR:  CALL    THK4
        LD      HL,LINEBUF
        LD      DE,XFER
        LD      BC,$0100        ; XMDST bank 0, XMSRC bank 1
        JR      VXCOPY
VXWRR:  PUSH    BC
        LD      HL,XFER
        LD      DE,LINEBUF
        LD      BC,$0001        ; XMDST bank 1, XMSRC bank 0
        CALL    VXCOPY
        POP     BC
        JR      THK5
VXCOPY: LD      (XMDST),BC
        LD      BC,80
        JP      MVCOPY

; The CCP's first entry after a cold boot that found a GLCD, with the matrix
; keyboard and no PICO9918: load A:GLCD.PRL and make it the console. Until
; then the console is serial, with the 20 x 4 LCD; without the file it stays
; so, and the LCD shows GLCD?. GLCWANT: 0 no GLCD, 1 one to load, 2 tried.
GLCBOOT:LD      HL,GLCWANT
        LD      A,(HL)
        DEC     A
        RET     NZ
        INC     (HL)
        LD      A,(CONDEV)
        AND     CDTMS+CDMTX
        CP      CDMTX
        RET     NZ

; Load A:GLCD.PRL if there is a GLCD and its driver is not in, and make it
; the console: carry set if there is none or it will not load (the LCD says
; so).
GLCLD:  LD      A,(CONDEV)
        AND     CDGLC
        RET     NZ              ; in already
        LD      A,(GLCWANT)
        OR      A
        SCF
        RET     Z
        LD      HL,GLCFCB
        LD      DE,CMDFCB
        LD      BC,12
        LDIR
        CALL    LOADCOM
        JR      C,GLCNO
        CALL    PRLGO
        JR      C,GLCNO
        JR      Z,GLCNO         ; a program, not a driver
        LD      HL,CONDEV
        SET     2,(HL)          ; CDGLC: the driver is in
        LD      B,CMUC1
        JR      CONSET
SERCON: LD      B,CMTTY         ; the console mode B, at once
CONSET: LD      A,(IOBYTE)
        AND     $FC
        OR      B
        LD      (IOBYTE),A
        LD      A,$FF
        LD      (CONACT),A
        JP      CONSEL
GLCNO:  LD      HL,GLCMSG
        LD      B,3
        CALL    LCDROW
        SCF
        RET

GLCFCB: DB      1,"GLCD    PRL"
GLCMSG: DB      "GLCD?",0

