; HOOK.COM: replaces WBOOT, CONST, CONIN and CONOUT in the RAM BIOS table
; with routines that record what passes through them and chain to the
; entries they replaced, then drives the BDOS:
;   HOOK    functions 2, 6 and 9 write A, B and CD; function 1 reads a key,
;           function 6 polls for one, function 10 reads a line, and a second
;           function 10 waits for ^C.
;   HOOK E  makes a file on the read-only C:, for the BDOS's error.
; The record is at 4000h, where the test reads it after the warm boot:
;   4000h   warm boots through the replaced WBOOT
;   4002h   calls of the replaced CONST (word)
;   4004h   next free byte of the CONOUT record (word), from 4100h
;   4006h   next free byte of the CONIN record (word), from 4200h

BDOS    EQU     $0005
WBCNT   EQU     $4000
CSCNT   EQU     $4002
COPTR   EQU     $4004
CIPTR   EQU     $4006
COREC   EQU     $4100
CIREC   EQU     $4200

        ORG     $0100
        LD      HL,WBCNT        ; clear the record
        LD      DE,WBCNT+1
        LD      BC,$02FF
        LD      (HL),0
        LDIR
        LD      HL,COREC
        LD      (COPTR),HL
        LD      HL,CIREC
        LD      (CIPTR),HL
        LD      HL,($0001)      ; HL = the table's WBOOT entry
        LD      DE,OLDWB
        LD      BC,MYWB
        CALL    PATCH
        LD      DE,OLDCS
        LD      BC,MYCS
        CALL    PATCH
        LD      DE,OLDCI
        LD      BC,MYCI
        CALL    PATCH
        LD      DE,OLDCO
        LD      BC,MYCO
        CALL    PATCH
        LD      A,($0080)       ; any command tail: the disk error
        OR      A
        JR      NZ,DISK
        LD      E,'A'
        LD      C,2
        CALL    BDOS
        LD      E,'B'
        LD      C,6
        CALL    BDOS
        LD      DE,CD
        LD      C,9
        CALL    BDOS
        LD      C,1
        CALL    BDOS
POLL:   LD      E,$FF
        LD      C,6
        CALL    BDOS
        OR      A
        JR      Z,POLL
        LD      DE,LINE
        LD      C,10
        CALL    BDOS
        LD      DE,LINE         ; ^C here warm boots
        LD      C,10
        CALL    BDOS
        RET

DISK:   LD      DE,FCB
        LD      C,22
        CALL    BDOS
        RET

; Save the target of the JP at HL+1 to (DE) and point it at BC; HL moves to
; the next entry.
PATCH:  INC     HL
        LD      A,(HL)
        LD      (DE),A
        LD      (HL),C
        INC     HL
        INC     DE
        LD      A,(HL)
        LD      (DE),A
        LD      (HL),B
        INC     HL
        RET

MYWB:   LD      HL,WBCNT
        INC     (HL)
        DB      $C3             ; JP to the old entry
OLDWB:  DW      0

MYCS:   PUSH    HL
        LD      HL,(CSCNT)
        INC     HL
        LD      (CSCNT),HL
        POP     HL
        DB      $C3
OLDCS:  DW      0

MYCI:   CALL    CHAINCI
        PUSH    HL
        LD      HL,(CIPTR)
        LD      (HL),A
        INC     HL
        LD      (CIPTR),HL
        POP     HL
        RET
CHAINCI:DB      $C3
OLDCI:  DW      0

MYCO:   PUSH    HL
        LD      HL,(COPTR)
        LD      (HL),C
        INC     HL
        LD      (COPTR),HL
        POP     HL
        DB      $C3
OLDCO:  DW      0

CD:     DB      "CD$"
LINE:   DB      16,0
        DS      16
FCB:    DB      3,"HOOKTESTDAT"
        DS      24
