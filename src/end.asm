; Lengths the boot code needs before these regions are defined, and the
; markers the build uses for its ROM and RAM census.

WSEND   EQU     HIRME           ; end of the classic resident workspace
WSCLRN: DW      WSEND-TPATOP-1
CPMCLRN:DW      BDOSRME-CCPRAM-1
GUARDN: DB      STKGUEND-STKGUARD
CODEEND:
