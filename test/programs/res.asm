; RES.DRV: a driver with no service. Its INIT replaces CONOUT in the RAM BIOS
; table with a routine that counts the characters passing through it and
; chains to the entry it replaced; its REMOVE puts that entry back.

        ORG     $0100
HDR:	DB	'D',3,0,1	; removable
        DW      0,0,0,0         ; REMOVE, size, extra, relocation: the writer's
        DB      0,0,0
        DW      0               ; INIT: the writer's
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
        LD      HL,0
        OR      A
        RET

REMOVE: LD      HL,($0001)
        LD      DE,9+1
        ADD     HL,DE
        LD      DE,(OLDCO)
        LD      (HL),E
        INC     HL
        LD      (HL),D
        OR      A
        RET

MYCO:   PUSH    HL
        LD      HL,(COUNT)
        INC     HL
        LD      (COUNT),HL
        POP     HL
        DB      $C3             ; JP to the entry replaced
OLDCO:  DW      0
COUNT:  DW      0
IMGEND:
