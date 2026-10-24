; NATGUARD.TNX: overwrites the bottom of its own stack area, then returns.
; The ROM must report the damaged guard and still warm boot cleanly.

        ORG     $0800-128
        DB      "TNX1"
        DW      $0800
        DW      IMGEND
        DW      MAIN
        DW      $0100
        DS      $0800-$,0
MAIN:   XOR     A
        LD      ($0300),A
        RET
IMGEND:
