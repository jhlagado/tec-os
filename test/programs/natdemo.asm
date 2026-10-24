; NATDEMO.TNX: native ABI 1 acceptance program.
;
; Prints "Nnn ok" or "Nnn FAIL" per check, then "NATIVE DONE", and exits by
; RET. Bank code is position independent and installed with BANKCOPY at
; 9000h (CALLB1, nested call) and 9100h (RECURSE, depth test).

SVC     EQU     $FF06
NLOAD   EQU     $0800
RESMAX  EQU     $07F0           ; deepest nesting reached, written by bank code
RESERR  EQU     $07F1           ; status of the refused call

        ORG     NLOAD-128
        DB      "TNX1"
        DW      NLOAD
        DW      IMGEND
        DW      MAIN
        DW      $0100
        DS      NLOAD-$,0

; ---- bank code (position independent) -----------------------------------------

; In bank 1 at 9000h: E = bank 2. Read this bank's 8000h into D, call bank 2's
; RDBYTE at 9000h, return its A.
CALLB1: LD      A,($8000)
        PUSH    AF
        LD      B,E
        LD      HL,$9000
        LD      C,4
        CALL    SVC
        POP     DE              ; D = this bank's byte
        RET
CALLB1E:

; In bank 2 at 9000h: return this bank's 8000h in A.
RDBYTE: LD      A,($8000)
        RET
RDBYTEE:

; In bank 1 at 9100h: D = bank 1, E = depth so far. Record the depth and
; call itself until the ABI refuses; record that status.
RECURSE:INC     E
        LD      A,E
        LD      (RESMAX),A
        LD      B,D
        LD      HL,$9100
        LD      C,4
        CALL    SVC
        RET     NC
        LD      (RESERR),A
        OR      A
        RET
RECURSEE:

MAIN:   LD      (ENTRYSP),SP

; N01 the ABI table: signature and major version
N01:    LD      HL,$FF00
        LD      A,(HL)
        CP      'T'
        JR      NZ,.F
        INC     HL
        LD      A,(HL)
        CP      'N'
        JR      NZ,.F
        INC     HL
        LD      A,(HL)
        CP      'A'
        JR      NZ,.F
        LD      A,($FF03)
        CP      1
.F:     CALL    RESULT

; N02 QUERY: ABI 1.0 and at least two banks
N02:    LD      C,0
        CALL    SVC
        JR      NZ,.F
        LD      DE,$0100
        OR      A
        SBC     HL,DE
        JR      NZ,.F
        LD      A,B
        CP      2
        JR      C,.F
        XOR     A
.F:     CALL    RESULT

; N03 reserve two banks
N03:    LD      C,1
        CALL    SVC
        JR      NZ,.F
        LD      A,B
        LD      (BANK1),A
        LD      C,1
        CALL    SVC
        JR      NZ,.F
        LD      A,B
        LD      (BANK2),A
        LD      HL,BANK1
        CP      (HL)
        JR      Z,.F            ; must differ
        XOR     A
        JR      .R
.F:     OR      1
.R:     CALL    RESULT

; N04 distinct contents: 11h into bank 1, 22h into bank 2, then read back
N04:    LD      A,$11
        CALL    FILLBUF
        LD      A,(BANK1)
        CALL    TOBANK
        JR      NZ,.F
        LD      A,$22
        CALL    FILLBUF
        LD      A,(BANK2)
        CALL    TOBANK
        JR      NZ,.F
        LD      A,(BANK1)
        CALL    FROMBNK
        JR      NZ,.F
        LD      A,$11
        CALL    CHKBUF
        JR      NZ,.F
        LD      A,(BANK2)
        CALL    FROMBNK
        JR      NZ,.F
        LD      A,$22
        CALL    CHKBUF
        JR      .R
.F:     OR      1
.R:     CALL    RESULT

; N05 install the bank routines: CALLB1 at 9000h in bank 1, RDBYTE at 9000h
; in bank 2, RECURSE at 9100h in bank 1
N05:    LD      HL,CALLB1
        LD      DE,$9000
        LD      BC,CALLB1E-CALLB1
        LD      A,(BANK1)
        CALL    INSTALL
        JR      NZ,.F
        LD      HL,RDBYTE
        LD      DE,$9000
        LD      BC,RDBYTEE-RDBYTE
        LD      A,(BANK2)
        CALL    INSTALL
        JR      NZ,.F
        LD      HL,RECURSE
        LD      DE,$9100
        LD      BC,RECURSEE-RECURSE
        LD      A,(BANK1)
        CALL    INSTALL
.F:     CALL    RESULT

; N06 nested call: app -> bank 1 -> bank 2. Returns A = 22h from bank 2 and
; D = 11h from bank 1; SP, the window and the interrupt state are as before.
N06:    EI
        LD      (SAVESP),SP
        LD      A,(BANK2)
        LD      E,A
        LD      A,(BANK1)
        LD      B,A
        LD      HL,$9000
        LD      C,4
        CALL    SVC
        JR      C,.F
        CP      $22
        JR      NZ,.F
        LD      A,D
        CP      $11
        JR      NZ,.F
        CALL    SAMESP
        JR      NZ,.F
        LD      A,I             ; interrupts still enabled
        JP      PO,.F
        CALL    WINDOW0
.F:     DI
        CALL    RESULT

; N07 refused calls leave everything unchanged: bank 0, unreserved bank,
; target outside the window
N07:    LD      (SAVESP),SP
        LD      B,0
        LD      HL,$9000
        LD      C,4
        CALL    SVC
        JR      NC,.F
        CP      2
        JR      NZ,.F
        LD      B,9
        LD      HL,$9000
        LD      C,4
        CALL    SVC
        JR      NC,.F
        CP      3
        JR      NZ,.F
        LD      A,(BANK1)
        LD      B,A
        LD      HL,$C000
        LD      C,4
        CALL    SVC
        JR      NC,.F
        CP      5
        JR      NZ,.F
        CALL    SAMESP
        JR      NZ,.F
        CALL    WINDOW0
        JR      .R
.F:     OR      1
.R:     CALL    RESULT

; N08 bank calls nest eight deep; the ninth is refused with status 6 and
; every level returns to its caller
N08:    LD      (SAVESP),SP
        XOR     A
        LD      (RESMAX),A
        LD      (RESERR),A
        LD      A,(BANK1)
        LD      D,A
        LD      E,0
        LD      B,A
        LD      HL,$9100
        LD      C,4
        CALL    SVC
        JR      C,.F
        LD      A,(RESMAX)
        CP      8
        JR      NZ,.F
        LD      A,(RESERR)
        CP      6
        JR      NZ,.F
        CALL    SAMESP
        JR      NZ,.F
        CALL    WINDOW0
        JR      .R
.F:     OR      1
.R:     CALL    RESULT

; N09 copy boundaries: zero length succeeds; crossing C000h, starting in
; ROM, an unreserved bank and bank 10 are refused
N09:    LD      HL,0
        LD      (DLEN),HL
        LD      A,(BANK1)
        LD      (DDB),A
        LD      HL,$8000
        LD      (DDA),HL
        CALL    COPYD
        JR      NZ,.F
        LD      HL,32
        LD      (DLEN),HL
        LD      HL,$BFF0
        LD      (DDA),HL
        CALL    COPYD
        CP      5
        JR      NZ,.F
        LD      HL,$BFE0        ; the last valid 32 bytes
        LD      (DDA),HL
        CALL    COPYD
        JR      NZ,.F
        XOR     A
        LD      (DDB),A
        LD      HL,$C000
        LD      (DDA),HL
        CALL    COPYD
        CP      5
        JR      NZ,.F
        LD      A,9
        LD      (DDB),A
        LD      HL,$8000
        LD      (DDA),HL
        CALL    COPYD
        CP      3
        JR      NZ,.F
        LD      A,10
        LD      (DDB),A
        CALL    COPYD
        CP      2
        JR      NZ,.F
        CALL    WINDOW0
        JR      .R
.F:     OR      1
.R:     CALL    RESULT

; N10 bank-to-bank copy and an overlapping copy within one bank
N10:    LD      HL,BUF          ; BUF = 0, 1, 2 ... 255
        XOR     A
.I:     LD      (HL),A
        INC     HL
        INC     A
        JR      NZ,.I
        LD      A,(BANK1)
        CALL    TOBANK          ; bank 1 8000h-80FFh = 0..255
        JR      NZ,.F
        LD      A,(BANK1)       ; bank 1 8000h -> bank 2 8000h
        LD      (DSB),A
        LD      HL,$8000
        LD      (DSA),HL
        LD      A,(BANK2)
        LD      (DDB),A
        LD      (DDA),HL
        LD      HL,256
        LD      (DLEN),HL
        CALL    COPYD
        JR      NZ,.F
        LD      A,(BANK1)       ; overlap: bank 1 8000h-80FFh -> 8010h
        LD      (DSB),A
        LD      (DDB),A
        LD      HL,$8010
        LD      (DDA),HL
        CALL    COPYD
        JR      NZ,.F
        LD      HL,$8010        ; read 8010h-810Fh back: must be 0..255
        LD      (DSA),HL
        LD      A,(BANK1)
        LD      (DSB),A
        XOR     A
        LD      (DDB),A
        LD      HL,BUF
        LD      (DDA),HL
        CALL    COPYD
        JR      NZ,.F
        LD      HL,BUF
        XOR     A
.C:     CP      (HL)
        JR      NZ,.F
        INC     HL
        INC     A
        JR      NZ,.C
        LD      A,(BANK2)       ; and bank 2 holds 0..255 at 8000h
        CALL    FROMBNK
        JR      NZ,.F
        LD      HL,BUF
        XOR     A
.D:     CP      (HL)
        JR      NZ,.F
        INC     HL
        INC     A
        JR      NZ,.D
        CALL    WINDOW0
        JR      .R
.F:     OR      1
.R:     CALL    RESULT

; N11 files through the FILE service: make NATIVE.DAT on A, write one
; record, close. A window pointer is refused.
N11:    LD      HL,NATFCB
        LD      DE,FCB
        LD      BC,36
        LDIR
        LD      B,19
        LD      DE,FCB
        LD      C,9
        CALL    SVC
        LD      B,22
        LD      DE,FCB
        LD      C,9
        CALL    SVC
        JR      NZ,.F
        LD      A,B
        INC     A
        JR      Z,.F
        LD      A,'N'
        CALL    FILLBUF
        LD      B,21
        LD      DE,FCB
        LD      HL,BUF
        LD      C,9
        CALL    SVC
        JR      NZ,.F
        LD      A,B
        OR      A
        JR      NZ,.F
        LD      B,16
        LD      DE,FCB
        LD      C,9
        CALL    SVC
        JR      NZ,.F
        LD      A,B
        INC     A
        JR      Z,.F
        LD      B,15
        LD      DE,$8000
        LD      C,9
        CALL    SVC
        CP      8
        JR      NZ,.F
        CALL    WINDOW0
        JR      .R
.F:     OR      1
.R:     CALL    RESULT

; N12 a freed bank can no longer be used
N12:    LD      A,(BANK2)
        LD      B,A
        LD      C,2
        CALL    SVC
        JR      NZ,.F
        LD      A,(BANK2)
        CALL    TOBANK
        CP      3
.F:     CALL    RESULT

; N13 the program's own SP is back where it started
N13:    LD      HL,(ENTRYSP)
        OR      A
        SBC     HL,SP
        CALL    RESULT

        LD      HL,MDONE
        CALL    PRINT
        RET                     ; exits through the ROM

; ---- helpers ------------------------------------------------------------------

FILLBUF:LD      HL,BUF
        LD      B,0
.L:     LD      (HL),A
        INC     HL
        DJNZ    .L
        RET

; Z when all 256 bytes of BUF equal A.
CHKBUF: LD      HL,BUF
        LD      B,0
.L:     CP      (HL)
        RET     NZ
        INC     HL
        DJNZ    .L
        RET

; Copy BUF (256 bytes) to bank A at 8000h, or back. A = status, Z on success.
TOBANK: LD      (DDB),A
        XOR     A
        LD      (DSB),A
        LD      HL,BUF
        LD      (DSA),HL
        LD      HL,$8000
        LD      (DDA),HL
        JR      COPY256
FROMBNK:LD      (DSB),A
        XOR     A
        LD      (DDB),A
        LD      HL,$8000
        LD      (DSA),HL
        LD      HL,BUF
        LD      (DDA),HL
COPY256:LD      HL,256
        LD      (DLEN),HL
COPYD:  LD      DE,DESC
        LD      C,3
        JP      SVC

; Copy BC bytes of code from HL to bank A at DE.
INSTALL:LD      (DDB),A
        LD      (DDA),DE
        LD      (DSA),HL
        LD      (DLEN),BC
        XOR     A
        LD      (DSB),A
        JR      COPYD

; Z when SP equals SAVESP (allowing for this call's return address).
SAMESP: LD      HL,2
        ADD     HL,SP
        LD      DE,(SAVESP)
        OR      A
        SBC     HL,DE
        RET

; Z when the window shows the classic bank (GETBANK reports 0).
WINDOW0:LD      C,5
        CALL    SVC
        RET     NZ
        LD      A,B
        OR      A
        RET

; Print "Nnn ok" for Z, "Nnn FAIL" for NZ.
RESULT: PUSH    AF
        LD      A,(TESTNO)
        ADD     A,1
        DAA
        LD      (TESTNO),A
        LD      E,'N'
        CALL    PUTC
        LD      A,(TESTNO)
        RRCA
        RRCA
        RRCA
        RRCA
        AND     $0F
        ADD     A,'0'
        LD      E,A
        CALL    PUTC
        LD      A,(TESTNO)
        AND     $0F
        ADD     A,'0'
        LD      E,A
        CALL    PUTC
        POP     AF
        LD      HL,MOK
        JR      Z,PRINT
        LD      HL,MFAIL
PRINT:  LD      A,(HL)
        OR      A
        RET     Z
        LD      E,A
        PUSH    HL
        CALL    PUTC
        POP     HL
        INC     HL
        JR      PRINT
PUTC:   LD      C,6
        JP      SVC

; ---- data -----------------------------------------------------------------------

TESTNO: DB      0
BANK1:  DB      0
BANK2:  DB      0
ENTRYSP:DW      0
SAVESP: DW      0
DESC:
DSB:    DB      0
DSA:    DW      0
DDB:    DB      0
DDA:    DW      0
DLEN:   DW      0
NATFCB: DB      0,"NATIVE  DAT"
        DS      24,0
FCB:    DS      36,0
MOK:    DB      " ok",13,10,0
MFAIL:  DB      " FAIL",13,10,0
MDONE:  DB      "NATIVE DONE",13,10,0
        ALIGN   256
BUF:    DS      256,0
IMGEND:
