; Accept one existing-file update, print SAY, and leave the file open.
; The host controls real SD refusal; no cache metadata is manufactured.

BDOS EQU $0005
        ORG $0100
        LD DE,FCB
        LD C,15
        CALL BDOS
        CP $FF
        JR Z,FAILED
        LD DE,DATA
        LD C,26
        CALL BDOS
        LD DE,$00FF
        LD C,45
        CALL BDOS
        LD DE,FCB
        LD C,21
        CALL BDOS
WROTE: OR A
        JR NZ,FAILED
        LD DE,MSG
        LD C,9
        CALL BDOS
        RET
FAILED: LD DE,ERR
        LD C,9
        CALL BDOS
        RET
MSG: DB "SAY$"
ERR: DB "NO ACK$"
FCB: DB 0,"HOLD    DAT"
        DS 24,0
DATA: DS 128,$5A
