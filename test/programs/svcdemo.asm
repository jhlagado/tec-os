; SVCDEMO: service-loader fixtures. Defaults publish DEMO version 2 with one
; entry returning its incremented byte count in A. Writer definitions combine
; valid and failing paths; some deliberately leave side effects after failure.
%INCLUDE "../../src/abi.inc"

        ORG     $0100
HDR:	DB	'D',SVCFMT,0,FLAGS
        DW      0,0,XTRA,0      ; REMOVE, size, extra, relocation: the writer's
        DB      STKB,STKI,STKC
        DW      0               ; INIT: the writer's
        DB      HDRNAME
INIT:
%IF V_HANG
        JR      INIT            
%ENDIF
%IF V_FAIL
        SCF
        RET
%ENDIF
%IF V_PROBE
        LD      DE,REC+2        ; INIT's record must not be visible yet
	LD	BC,$0100+TNFIND	
	CALL	ABICALL
        LD      A,0
        ADC     A,A
        LD      (RESULT),A
%ENDIF
; Private reentry addresses come from the test; the busy window must refuse.
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
	LD	B,3		; a vector the scan can't see, then failure
        LD      HL,VTAB
	LD	C,TNDRVR
	CALL	ABICALL
        SCF
        RET
%ENDIF
; HOOKAT defaults to 10: CONOUT's target at WBOOT+10; tests select other entries.
; Hooks can outlive INIT failure or warm boot: this exposes retained/dangling use.
%IF V_HOOK
        LD      A,1
        LD      (RESULT),A      ; INIT marker for rollback tests
        LD      HL,($0001)      
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
; Vector variants test inside/outside targets, claimed slots and failure.
; These are distinct from the GLVEC pointer the BIOS-entry scan cannot see.
%IF V_VEC
        LD      A,$C3           ; a restart vector into this service
        LD      (VECAT),A
        LD      HL,VHAND
        LD      (VECAT+1),HL
%ENDIF
%IF V_VECX
	LD	HL,ABICALL	
        LD      (VECAT+1),HL
%ENDIF
%IF V_VECFL
        SCF
        RET
%ENDIF
; Accepted BDOS 47 and JP 0 end INIT by warm boot, without an ordinary return.
%IF V_CHI
        CALL    CHAIN47         
%ENDIF
%IF V_WB
        JP      0               
%ENDIF
%IF V_STK
	LD	B,3
        LD      HL,VTAB
	LD	C,TNDRVR
	CALL	ABICALL
        RET     C
%IF DEPTH
        PUSH    AF              ; three pushes: six bytes with DEPTH enabled
        PUSH    BC
        PUSH    HL
        POP     HL
        POP     BC
        POP     AF
%ENDIF
%ENDIF
%IF V_DEP
        LD      DE,DEPNAME      ; bound once, at INIT
	LD	BC,$0100+TNFIND	
	CALL	ABICALL
        RET     C
        LD      (DEPTAB),HL
%ENDIF
%IF V_WILD
        LD      HL,$0200        ; a record outside the image
        LD      A,TNENODV       ; and A as an absent device's, with
        OR      A               ; carry clear: success (KE-192)
        RET
%ENDIF
%IF V_LINK
        LD      HL,ABITAB       
        LD      (REC),HL
%ENDIF
%IF V_CYCLE
        LD      HL,REC          
        LD      (REC),HL
%ENDIF
%IF V_TABLE
        LD      HL,$0300        
        LD      (REC+11),HL
%ENDIF
%IF V_END
        LD      HL,HDR+253      ; crosses the one-page fixture's end
        OR      A
        RET
%ENDIF
; Extra memory must cover 13 bytes per record. The loop sets links/tables,
; leaving name/version bytes as found there; B=0 means 256 iterations.
%IF V_CHAIN
        LD      HL,IMGEND       ; caller-sized extra memory
        LD      B,CHAINB
CHAIN1: LD      DE,13
        PUSH    HL
        ADD     HL,DE
        EX      DE,HL           
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
        LD      (HL),0          
        INC     HL
        LD      (HL),0
        LD      HL,IMGEND
        OR      A
        RET
%ENDIF
%IF V_NONE
        LD      HL,0            
        OR      A
        RET
%ENDIF
        LD      HL,REC          
        OR      A
        RET

; REMOVE can undo hooks/drop the driver before refusing, or end through
; chaining/warm boot. The loader's outcome is tested separately.
REMOVE:
%IF V_HOOK
        LD      A,2
        LD      (RESULT),A      ; REMOVE ran, even if it refuses
        LD      HL,($0001)
        LD      DE,HOOKAT
        ADD     HL,DE
        LD      DE,(OLDCO)
        LD      (HL),E
        INC     HL
        LD      (HL),D
%ENDIF
%IF V_STK
	LD	B,3
        LD      HL,0
	LD	C,TNDRVR
	CALL	ABICALL
%ENDIF
%IF V_REFUSE
        SCF
        RET
%ENDIF
%IF V_CHR
	CALL	CHAIN47		
%ENDIF
%IF V_REMWB
	JP	0		
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
; LOOK caches DEMO's table and generation byte; USE calls it unchecked.
; SAFE requires a fresh FIND and matching generation, then uses that cache.
; It does not rebind the pointer; 256 generation changes can alias this byte.
LOOK:   LD      DE,DEPNAME
	LD	BC,$0100+TNFIND	
	CALL	ABICALL
        RET     C
        LD      (DEPTAB),HL
        LD      (GEN),A
        RET
USE:    LD      HL,(DEPTAB)
        JP      (HL)
SAFE:   LD      DE,DEPNAME
	LD	BC,$0100+TNFIND	
	CALL	ABICALL
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
VHAND:  LD      A,$5A           
        LD      (RESULT),A
        RET
%ENDIF
%IF V_CHN
CHAIN47:LD      DE,CMD47        
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
; The byte hook preserves HL, changes flags, then chains through OLDCO.
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
; Fixture table: six VRT entries, optional function 0, columns 21/rows 8.
; DEPTH enables three balanced pushes per stub: six explicit bytes, separate
; from caller and dispatcher frames. The ROM calls this table.
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
