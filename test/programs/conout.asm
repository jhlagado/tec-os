; CONOUT.COM: exercise console wrapping, scrolling and insertion/deletion
; through BIOS CONOUT on the CCP stack. RET uses the CCP's WBOOT word.
; GLCD stack checks use production font; the historical pixel oracle is separate.
; (0001h) holds WBOOT's table-entry address; CONOUT is three entries on.

        ORG     $0100
        LD      HL,($0001)      
        LD      DE,9
        ADD     HL,DE
        LD      (CO+1),HL
        LD      HL,TEXT
NEXT:   LD      A,(HL)
        OR      A
        RET     Z               
        PUSH    HL
        LD      C,A
        CALL    CO
        POP     HL
        INC     HL
        JR      NEXT
CO:     JP      0

TEXT:   DB      27,"[2J",27,"[H"
        DB      "The quick brown fox jumps over the lazy dog, 0123456789.",13,10
        DB      "The quick brown fox jumps over the lazy dog, 0123456789.",13,10
        DB      "The quick brown fox jumps over the lazy dog, 0123456789.",13,10
        DB      "The quick brown fox jumps over the lazy dog, 0123456789.",13,10
        DB      "The quick brown fox jumps over the lazy dog, 0123456789.",13,10
        DB      "The quick brown fox jumps over the lazy dog, 0123456789.",13,10
        DB      27,"[2;3H",27,"[2@xy",27,"[2;8H",27,"[3P"
        DB      27,"[3;1H",27,"[L",27,"[2;1H",27,"[M"
        DB      27,"[1;1H",27,"[K",27,"[7mrev",27,"[0m",13,10,0
