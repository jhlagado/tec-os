; SVCEXEC: a service with an execution record, for NAME.SVC /E's tests.
; Writer definitions pick the record's version, a ready bit INIT never sets,
; an INIT that finds no device, and a REMOVE that refuses.
; The entry prints EXEC and the header's name, then acts on the first letter
; of its command tail: J jumps to 0000h, B calls BDOS 0, F sets return code
; FF00h, P pushes fifteen words and pops them. Each then returns.
%INCLUDE "../../src/abi.inc"

BDOS	EQU	$0005

        ORG     $0100
HDR:	DB	'D',SVCFMT,0,FLAGS
        DW      0,0,0,0         ; REMOVE, size, extra, relocation: the writer's
        DB      0,0,0
        DW      0               ; INIT: the writer's
        DB      HDRNAME
; The execution record: its entry is an offset from HDR, the JP at 41.
        DB      "EX",RECVER
RDY:    DB      0
        DW      41
NAME:   DS      8,' '
        DB      0,1
        JP      ENTRY
INIT:
%IF V_NODEV
        LD      A,TNENODV       ; no device: undone, nothing published
        SCF
        RET
%ENDIF
        LD      H,B             ; BC: the name the file was read by
        LD      L,C
        LD      DE,NAME
        LD      BC,8
        LDIR
%IF !V_NRDY
        LD      A,1
        LD      (RDY),A
%ENDIF
        LD      HL,0
        XOR     A
        RET
REMOVE:
%IF V_KEEP
        SCF                     ; refuses: stays installed
        RET
%ENDIF
        XOR     A
        LD      (RDY),A
        RET
ENTRY:  LD      DE,MSG
        LD      C,9
        CALL    BDOS
        LD      A,($0082)       ; the tail's first letter
        CP      'J'
        JP      Z,0
        CP      'B'
        JR      NZ,E1
        LD      C,0
        JP      BDOS
E1:     CP      'F'
        JR      NZ,E2
        LD      DE,0-256
        LD      C,108
        JP      BDOS            ; its RET is the entry's
E2:     CP      'P'
        RET     NZ
        LD      B,15
E3:     PUSH    HL
        DJNZ    E3
        LD      B,15
E4:     POP     HL
        DJNZ    E4
        RET
MSG:    DB      "EXEC ",HDRNAME,"$"
