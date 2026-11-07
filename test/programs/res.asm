; RES.SVC: count CONOUT characters, then chain the saved RAM BIOS target.
; INIT hooks without a registry record; REMOVE restores the target.
; Warm boot keeps the chain; cold boot restores the table. Remove owners LIFO.

        ORG     $0100
HDR:	DB	'D',4,0,1	; removable, format 4 (abi.inc's SVCFMT)
        DW      0,0,0,0         ; REMOVE, size, extra, relocation: the writer's
        DB      2,0,0           ; declared BDOS/BIOS/CCP stack charge
        DW      0               ; INIT: the writer's
        DB      "RES     "

; (0001h) points to WBOOT's JP entry; CONOUT is three entries on, target +10.
; Save that target in OLDCO, an executable JP operand. INIT returns HL=0,
; carry clear. The two-byte target patch is not atomic.
INIT:   LD      HL,($0001)
        LD      DE,9+1
        ADD     HL,DE
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

; The wrapper keeps HL and flags while COUNT wraps at 16 bits, then chains.
; PUSH uses the actual caller's stack; the saved target has its own clobbers.
MYCO:   PUSH    HL
        LD      HL,(COUNT)
        INC     HL
        LD      (COUNT),HL
        POP     HL
        DB      $C3
OLDCO:  DW      0
COUNT:  DW      0
IMGEND:
