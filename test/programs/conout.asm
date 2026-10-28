; CONOUT.COM: a program on the CCP stack that calls the BIOS's
; CONOUT directly, through the table at (0001h), with text that wraps and
; scrolls the screen, then inserts and deletes characters and lines, so the
; console takes its deepest paths on the caller's stack.

        ORG     $0100
        LD      HL,($0001)      ; WBOOT's entry; CONOUT is three entries on
        LD      DE,9
        ADD     HL,DE
        LD      (CO+1),HL
        LD      HL,TEXT
NEXT:   LD      A,(HL)
        OR      A
        RET     Z               ; to WBOOT, which the CCP pushed
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
