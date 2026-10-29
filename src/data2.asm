; The data block, continued (data.asm).

; ---- lcd.asm -----------------------------------------------------------------
LCDSEQ: DB      $38,$0C,$06,$01

LCDROWS:DB      $80,$C0,$94,$D4

LCDBAN: DB      "TEC-OS ",VERHI+'0','.',VERLO+'0',"  TEC-1G",0

; ---- vol.asm -----------------------------------------------------------------
ROTXT:  DB      " (read-only)",0
