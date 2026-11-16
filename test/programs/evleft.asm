; EVLEFT.COM: leave behind what a careless program can, each pointing into
; its own image: a jump in restart slot 08h, a table offered to the shell
; hook and a UC1 console table offered to TNDRVR. It prints S when TNSHELL
; took the table and s when it refused, then D or d for TNDRVR, and
; returns. Nothing here is ever meant to be called.
%INCLUDE "../../src/abi.inc"

BDOS    EQU     $0005

        ORG     $0100
        LD      A,$C3           ; JP HERE at 0008h
        LD      ($0008),A
        LD      HL,HERE
        LD      ($0009),HL
        LD      HL,TABLE
        LD      C,TNSHELL
        CALL    ABICALL
        LD      E,'s'
        JR      C,L1
        LD      E,'S'
L1:     CALL    OUT
        LD      B,3             ; UC1
        LD      HL,TABLE
        LD      C,TNDRVR
        CALL    ABICALL
        LD      E,'d'
        JR      C,L2
        LD      E,'D'
L2:
OUT:    LD      C,2
        JP      BDOS

HERE:   RET
TABLE:  DW      HERE,HERE,HERE,HERE,HERE,HERE,HERE
        DB      21,8
