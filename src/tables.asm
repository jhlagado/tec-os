; The ROM's read-only data: one block after the table, gathered from the
; code's source files in their assembly order. The block runs on through
; gen/geom.asm, which as an include stands between two files, and text.asm.
; Nothing in it is executed: cold boot copies the BIOS jump table to RAMBIOS,
; and only that copy runs.

ROMDATA:

; ---- bios.asm ----------------------------------------------------------------
BIOSBAS:JP      COLD            ; 00 cold boot
        JP      WBOOTR          ; 03 warm boot
        JP      BCONSTC         ; 06
        JP      BCONIN          ; 09
        JP      BCONOUT         ; 0C
        JP      BLIST           ; 0F
        JP      BPUNCH          ; 12
        JP      BREADER         ; 15
        JP      BHOME           ; 18
        JP      BSELDSK         ; 1B
        JP      BSETTRK         ; 1E
        JP      BSETSEC         ; 21
        JP      BSETDMA         ; 24
        JP      BREAD           ; 27
        JP      BWRITE          ; 2A
        JP      BLISTST         ; 2D
        JP      BSECTRN         ; 30

; ---- keyboard.asm ------------------------------------------------------------
KBARROW:DB      "ABDC"          ; up, down, left, right
KBSPEC: DB      $0A,$0D,$0D, $0C,$1B,$1B, $0D,$20,$20, $0E,$27,$22, $3F,$5C,$7C
KBSHIFT:DB      "<_>?)!@#$%^&*( : +"

; ---- lcd.asm -----------------------------------------------------------------
LCDSEQ: DB      $38,$0C,$06,$01

LCDROWS:DB      $80,$C0,$94,$D4
