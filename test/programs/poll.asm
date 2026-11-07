; POLL.COM: wait by polling BDOS 6, then return on a nonzero result.
; Returned NUL keeps polling. The console test watches the waiting cursor.

BDOS    EQU     $0005

        ORG     $0100
WAIT:   LD      E,$FF
        LD      C,6
        CALL    BDOS
        OR      A
        JR      Z,WAIT
        RET
