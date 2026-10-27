; RES.PRL: a resident module. Its INIT replaces CONOUT in the RAM BIOS table
; with a routine that counts the characters passing through it and chains to
; the entry it replaced; its REMOVE puts that entry back. Assembled at 0000h
; and 0100h, the two images give the PRL's relocation bitmap.
;
; The module header: "TNM", version 1, kind 1 (resident), a zero, the JP the
; loader points at the BDOS, the addresses of INIT and REMOVE (relocated
; with the code) and a name.

        ORG     $0100
HDR:    DB      "TNM",1,1,0
BDOSJ:  JP      0               ; the loader points this at the old (0006h)
        DW      INIT            ; relocated with the code, so the loaded address
        DW      REMOVE
        DB      "RES     "

; Replace CONOUT, the table's fourth entry after WBOOT: (0001h) + 9.
INIT:   LD      HL,($0001)
        LD      DE,9+1
        ADD     HL,DE           ; HL = the JP's target in the table
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      (OLDCO),DE
        LD      DE,MYCO
        LD      (HL),D
        DEC     HL
        LD      (HL),E
        RET

REMOVE: LD      HL,($0001)
        LD      DE,9+1
        ADD     HL,DE
        LD      DE,(OLDCO)
        LD      (HL),E
        INC     HL
        LD      (HL),D
        RET

MYCO:   PUSH    HL
        LD      HL,(COUNT)
        INC     HL
        LD      (COUNT),HL
        POP     HL
        DB      $C3             ; JP to the entry replaced
OLDCO:  DW      0
COUNT:  DW      0
