; Test a resident one-shot callback through the COMSTART registry record.

%INCLUDE "../../src/abi.inc"

        ORG $0100
HDR:    DB 'D',SVCFMT,0,1
        DW 0,0,0,0
        DB 0,0,0
        DW 0
        DB "ARM     "

        DB "EX",1
READY:  DB 3
        DW 41
        DB "ARM     ",0,1

ENTRY:  LD A,1
        LD (ARMED),A
        RET

INIT:   LD HL,REC
        XOR A
        RET

REMOVE: XOR A
        RET

REC:    DW 0
        DB "COMSTART",1
        DW HOOK

HOOK:   LD A,(ARMED)
        OR A
        RET Z
        XOR A
        LD (ARMED),A
        LD ($0120),HL
        LD ($0122),DE
        LD A,($0082)
        LD ($0124),A
        RET

ARMED:  DB 0
