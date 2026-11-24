; COMHOOK: a resident service that arms the COM launch vector, COMVEC.
; Installing it enters it (state bit 1), and its ARM command enters it
; again: each entry sets COMVEC to HOOK. HOOK keeps the registers it is
; given at 0120h (HL), 0122h (DE), 0126h (BC) and 0128h (A), the tail's
; first letter at 0124h, clears COMVEC (one shot) and returns, so the CCP
; launches the COM as usual. REMOVE clears COMVEC if it is still HOOK.

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

ENTRY:  LD HL,HOOK
        LD (COMVEC),HL
        RET

INIT:   LD HL,0
        XOR A
        RET

REMOVE: LD HL,(COMVEC)
        LD DE,HOOK
        OR A
        SBC HL,DE
        JR NZ,REMOK
        LD (COMVEC),HL  ; HL=0
REMOK:  XOR A
        RET

HOOK:   LD ($0120),HL
        LD ($0122),DE
        LD ($0126),BC
        LD ($0128),A
        LD A,($0082)
        LD ($0124),A
        LD HL,0
        LD (COMVEC),HL
        RET
