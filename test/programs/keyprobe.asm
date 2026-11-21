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
        DB "KEYBREAK",1
        DW HOOK

HOOK:   LD (OLDSP),SP
        LD SP,STKTOP
        LD HL,COUNT
        INC (HL)
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
        DS 48
STKTOP:
