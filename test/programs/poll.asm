; POLL.COM: waits for a key by polling BDOS function 6, as full-screen
; programs do, then returns.

BDOS    EQU     $0005

        ORG     $0100
WAIT:   LD      E,$FF
        LD      C,6
        CALL    BDOS
        OR      A
        JR      Z,WAIT
        RET
