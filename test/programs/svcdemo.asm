; SVCDEMO: a library publishing one record, "DEMO" version 2, a table of one
; entry: A = its count of calls, raised. Assembled with one V_ name set to
; make each of the failure cases.
%INCLUDE "../../src/abi.inc"

        ORG     $0100
HDR:	DB	'D',3,0,FLAGS
        DW      0,0,XTRA,0      ; REMOVE, size, extra, relocation: the writer's
        DB      STKB,STKI,STKC
        DW      0               ; INIT: the writer's
        DB      HDRNAME
; ---- the image ----------------------------------------------------------------
INIT:
%IF V_HANG
        JR      INIT            ; a broken service
%ENDIF
%IF V_FAIL
        SCF
        RET
%ENDIF
%IF V_PROBE
        LD      DE,REC+2        ; can a client see this record yet?
        LD      BC,$0100
        CALL    ABISVC
        LD      A,0
        ADC     A,A
        LD      (RESULT),A
%ENDIF
%IF V_LOAD
        CALL    RAWLOAD
        LD      A,0
        ADC     A,A
        LD      (RESULT),A
%ENDIF
%IF V_UNL
        CALL    RAWUNL
        LD      A,0
        ADC     A,A
        LD      (RESULT),A
%ENDIF
%IF V_GLVEC
        LD      A,3             ; a vector the scan can't see, then failure
        LD      HL,VTAB
        CALL    ABIGLCD
        SCF
        RET
%ENDIF
%IF V_HOOK
        LD      HL,($0001)      ; CONOUT, in the table
        LD      DE,HOOKAT
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      (OLDCO),DE
        LD      DE,MYCO
        LD      (HL),D
        DEC     HL
        LD      (HL),E
%ENDIF
%IF V_HOOKFL
        SCF
        RET
%ENDIF
%IF V_VEC
        LD      A,$C3           ; a restart vector into this service
        LD      (VECAT),A
        LD      HL,VHAND
        LD      (VECAT+1),HL
%ENDIF
%IF V_VECFL
        SCF
        RET
%ENDIF
%IF V_CHI
        CALL    CHAIN47         ; function 47 from INIT
%ENDIF
%IF V_WB
        JP      0               ; a warm boot from inside INIT
%ENDIF
%IF V_STK
        LD      A,3
        LD      HL,VTAB
        CALL    ABIGLCD
        RET     C
%IF DEPTH
        PUSH    AF              ; six bytes of the CCP's stack
        PUSH    BC
        PUSH    HL
        POP     HL
        POP     BC
        POP     AF
%ENDIF
%ENDIF
%IF V_DEP
        LD      DE,DEPNAME      ; bound once, at INIT
        LD      BC,$0100
        CALL    ABISVC
        RET     C
        LD      (DEPTAB),HL
%ENDIF
%IF V_WILD
        LD      HL,$0200        ; a record outside the image
        OR      A
        RET
%ENDIF
%IF V_LINK
        LD      HL,ABITAB       ; a link outside the image
        LD      (REC),HL
%ENDIF
%IF V_CYCLE
        LD      HL,REC          ; a record linked to itself
        LD      (REC),HL
%ENDIF
%IF V_TABLE
        LD      HL,$0300        ; an entry table outside the image
        LD      (REC+11),HL
%ENDIF
%IF V_END
        LD      HL,HDR+253      ; a record running off the service's last page
        OR      A
        RET
%ENDIF
%IF V_CHAIN
        LD      HL,IMGEND       ; CHAINB records, in the extra memory; 0 for 256
        LD      B,CHAINB
CHAIN1: LD      DE,13
        PUSH    HL
        ADD     HL,DE
        EX      DE,HL           ; DE = the next
        POP     HL
        LD      (HL),E
        INC     HL
        LD      (HL),D
        PUSH    DE
        LD      DE,10
        ADD     HL,DE
        LD      DE,TABLE
        LD      (HL),E
        INC     HL
        LD      (HL),D
        POP     HL
        DJNZ    CHAIN1
        LD      DE,-13
        ADD     HL,DE
        LD      (HL),0          ; the last link
        INC     HL
        LD      (HL),0
        LD      HL,IMGEND
        OR      A
        RET
%ENDIF
%IF V_NONE
        LD      HL,0            ; no records
        OR      A
        RET
%ENDIF
        LD      HL,REC          ; the record, published by the loader
        OR      A
        RET

REMOVE:
%IF V_HOOK
        LD      HL,($0001)
        LD      DE,HOOKAT
        ADD     HL,DE
        LD      DE,(OLDCO)
        LD      (HL),E
        INC     HL
        LD      (HL),D
%ENDIF
%IF V_STK
        LD      A,3
        LD      HL,0
        CALL    ABIGLCD
%ENDIF
%IF V_REFUSE
        SCF
        RET
%ENDIF
%IF V_CHR
	CALL	CHAIN47		; function 47 from REMOVE
%ENDIF
%IF V_REMWB
	JP	0		; a warm boot from inside REMOVE
%ENDIF
%IF V_REMWIN
	CALL	RAWUNL		; refused while REMOVE runs
        LD      A,0
        ADC     A,A
        LD      (RESULT),A
%ENDIF
        OR      A
        RET

SERVICE:LD      HL,COUNT
        INC     (HL)
        LD      A,(HL)
        RET

%IF V_LATE
; A resident that looks up later and keeps the pointer: the violation. LOOK
; finds DEMO and keeps its table; USE calls it, unchecked; SAFE checks.
LOOK:   LD      DE,DEPNAME
        LD      BC,$0100
        CALL    ABISVC
        RET     C
        LD      (DEPTAB),HL
        LD      (GEN),A
        RET
USE:    LD      HL,(DEPTAB)
        JP      (HL)
SAFE:   LD      DE,DEPNAME
        LD      BC,$0100
        CALL    ABISVC
        RET     C
        LD      HL,GEN
        CP      (HL)
        SCF
        RET     NZ
        JR      USE
GEN:    DB      0
%ENDIF

%IF V_LONG
        DS      600,$55         ; a gap the relocation data must step over
%ENDIF
%IF V_TWO
REC:    DW      REC2
%ENDIF
%IF V_TWO == 0
REC:    DW      0
%ENDIF
        DB      RECNAME
        DB      RECVER
        DW      TABLE
%IF V_LATE
TABLE:  JP      LOOK
        JP      USE
        JP      SAFE
%ENDIF
%IF V_LATE == 0
TABLE:  JP      SERVICE
%ENDIF
%IF V_TWO
REC2:   DW      0
        DB      "SECOND  ",1
        DW      TABLE
%ENDIF
COUNT:  DB      0
RESULT: DB      $FF
%IF V_VEC
VHAND:  LD      A,$5A           ; a restart vector's handler
        LD      (RESULT),A
        RET
%ENDIF
%IF V_CHN
CHAIN47:LD      DE,CMD47        ; the command at the DMA address, then 47
        LD      C,26
        CALL    5
        LD      C,47
        JP      5
CMD47:  DB      "USER 3",0
%ENDIF
%IF V_DEP + V_LATE
DEPNAME:DB      "DEMO    "
DEPTAB: DW      0
%ENDIF
%IF V_HOOK
MYCO:   PUSH    HL
        LD      HL,HITS
        INC     (HL)
        POP     HL
        DB      $C3
OLDCO:  DW      0
HITS:   DB      0
%ENDIF
%IF V_GLVEC+V_STK
; The ROM's six video routines, each using six bytes of its caller's stack.
VTAB:   DW      VRT,VRT,VRT,VRT,VRT,VRT,0
        DB      21,8
VRT:
%IF DEPTH
        PUSH    AF
        PUSH    BC
        PUSH    HL
        POP     HL
        POP     BC
        POP     AF
%ENDIF
        RET
%ENDIF
IMGEND:
