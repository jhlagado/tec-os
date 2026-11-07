; HOOK.COM: log WBOOT, CONST, CONIN and CONOUT, then chain their old RAM
; BIOS entries. Warm boot keeps the hooks; cold boot restores the table.
; Hooks and logs occupy the TPA: new programs can overwrite them, and logs
; have no bounds checks. The test supplies bounded input and output.
;
; No tail: BDOS 2/6/9 write ABCD, 1 reads a key, 6 polls, 10 reads twice.
; A leading ^C on the second line warm boots. Tail J jumps to 0000h; B uses
; BDOS 0; any other first byte (such as E) attempts MAKE on read-only C:.
;
; 4000h: warm-boot byte count. 4002h: CONST word count.
; 4004h/4006h: next-free CONOUT/CONIN word pointers, initially 4100h/4200h.

BDOS    EQU     $0005
WBCNT   EQU     $4000
CSCNT   EQU     $4002
COPTR   EQU     $4004
CIPTR   EQU     $4006
COREC   EQU     $4100
CIREC   EQU     $4200

        ORG     $0100
        LD      HL,WBCNT        
        LD      DE,WBCNT+1
        LD      BC,$02FF
        LD      (HL),0
        LDIR
        LD      HL,COREC
        LD      (COPTR),HL
        LD      HL,CIREC
        LD      (CIPTR),HL
        LD      HL,($0001)      
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
        LD      A,($0080)       
        OR      A
        JR      Z,CONS
        LD      A,($0082)
        CP      'J'
        JP      Z,0
        CP      'B'
        JR      NZ,DISK
        LD      C,0
        JP      BDOS
CONS:
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
        LD      DE,LINE         
        LD      C,10
        CALL    BDOS
        RET

DISK:   LD      DE,FCB
        LD      C,22
        CALL    BDOS
        RET

; HL -> JP entry, DE -> saved target operand. Save the two target bytes,
; replace them with BC, and advance HL to the next three-byte entry.
; DE advances one byte. Installation is not atomic.
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
        DB      $C3             
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
