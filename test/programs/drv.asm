; DRV.PRL: a module of kind 2, the driver kind that TEC-OS no longer has,
; which the loader refuses. Two pages of code and data whose addresses point
; into themselves.
;
; The module header: "TNM", version 1, kind 2 (driver), a zero, the JP the
; loader points at the BDOS, the addresses of INIT and REMOVE (relocated
; with the code) and a name.

        ORG     $0100
HDR:    DB      "TNM",1,2,0
        JP      0
        DW      INIT
        DW      INIT
        DB      "DRV     "
        DB      0               ; no hooks

INIT:   LD      HL,TABLE
        LD      DE,FAR
        RET

TABLE:  DW      INIT,TABLE,FAR,LAST
        DS      300,$E5
FAR:    DW      HDR,FAR
        JP      INIT
LAST:   DB      0
