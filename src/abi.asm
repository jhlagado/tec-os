; The TEC-OS table at a fixed ROM address. Its layout is fixed; entries are
; only ever added, with the minor version raised. ABI 2.0 dropped the native
; program services: FF06h stays and refuses every call.

        ORG     $FF00
ABITAB: DB      "TNA"           ; FF00h signature
        DB      2               ; FF03h ABI major version
        DB      1               ; FF04h ABI minor version: 1 adds FF0Eh
        DB      0               ; FF05h native banks: none since 2.0
        JP      NONATSV         ; FF06h no services: status 1, carry set
        DW      VWID            ; FF09h console columns, then rows; 0 = serial only
        JP      HWSVC           ; FF0Bh hardware services: C = service
        DW      MAINS           ; FF0Eh MAIN regions fitted, 1 or 2 (ABI 2.1)
ABIEND:
