; Exercise keyboard ownership while BDOS 10 is waiting.

%INCLUDE "../../src/abi.inc"

        ORG $0100
HDR:    DB 'D',SVCFMT,0,1
        DW 0,0,0,0
        DB 0,0,0
        DW 0
        DB "KEYPROBE"

INIT:   LD HL,REC
        XOR A
        RET

REMOVE: XOR A
        RET

REC:    DW 0
%IF PARK
        DB "KEYPARK ",1
%ENDIF
%IF !PARK
        DB "KEYBREAK",1
%ENDIF
        DW HOOK

HOOK:   LD (OLDSP),SP
        LD SP,STKTOP
        LD HL,COUNT
        INC (HL)
%IF PARK
        EX DE,HL
        LD DE,192
        OR A
        SBC HL,DE
        JR NC,WAITR
        LD HL,WAITR
        PUSH HL
        PUSH BC
        LD HL,WRITE
        LD DE,BACKUP
        RET
%ENDIF
WAITR:  CALL SCAN
        JR Z,WAITR
WAITUP: CALL SCAN
        JR NZ,WAITUP
        LD SP,(OLDSP)
        SCF
        RET

SCAN:   LD HL,KEYS
        LD C,TNKEYS
        CALL ABICALL
        LD A,(KEYS+6)
        AND $20
        RET

COUNT:  DB 0
OLDSP:  DW 0
KEYS:   DS 8
%IF PARK
        DS 192
%ENDIF
%IF !PARK
        DS 48
%ENDIF
STKTOP:
%IF PARK
WRITE:  LD DE,FCB
        LD C,22
        CALL 5
        INC A
        RET Z
        LD DE,RECORD
        LD C,26
        CALL 5
        LD DE,FCB
        LD C,21
        CALL 5
        LD DE,FCB
        LD C,16
        CALL 5
        LD C,48
        CALL 5
        RET
FCB:    DB 0,"PARKTESTBIN"
        DS 24,0
RECORD: DB $5A
        DS 127,0
BACKUP: DS 192
%ENDIF
