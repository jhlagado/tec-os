; The ROM's read-only data: one block after the table, gathered from the
; code's source files in their assembly order. The block runs on through
; gen/font.asm, data2.asm, gen/geom.asm and data3.asm. Nothing in it is
; executed but the BIOS jump table, which cold boot copies to RAMBIOS.

; The TMS9918 tables' constants (tms.asm).
TNAME   EQU     TMSNAME         ; 0800h, or 1000h for 80 columns (4 KiB aligned)
TCOLOR  EQU     $2000
TSPRITE EQU     $1B00

ROMDATA:

; ---- boot.asm ----------------------------------------------------------------
RAMMSG: DB      13,10,"TEC-OS needs 64K RAM",13,10,0
BANNER: DB      13,10,"TEC-OS ",VERHI+'0','.',VERLO+'0'," for TEC-1G",13,10,0

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

; ---- console.asm -------------------------------------------------------------
KBARROW:DB      "ABDC"          ; up, down, left, right
KBSPEC: DB      $0A,$0D,$0D, $0C,$1B,$1B, $0D,$20,$20, $0E,$27,$22, $3F,$5C,$7C
KBSHIFT:DB      "<_>?)!@#$%^&*( : +"

; ---- video.asm ---------------------------------------------------------------
TMSVEC: DW      TMSPUT,TMSGET,TMSCLR,TMSSET,TMSRDR,TMSWRR

; ---- tms.asm -----------------------------------------------------------------
TMSROWT:DW      TNAME,TNAME+TMSCOLS,TNAME+2*TMSCOLS,TNAME+3*TMSCOLS
        DW      TNAME+4*TMSCOLS,TNAME+5*TMSCOLS,TNAME+6*TMSCOLS,TNAME+7*TMSCOLS
        DW      TNAME+8*TMSCOLS,TNAME+9*TMSCOLS,TNAME+10*TMSCOLS,TNAME+11*TMSCOLS
        DW      TNAME+12*TMSCOLS,TNAME+13*TMSCOLS,TNAME+14*TMSCOLS,TNAME+15*TMSCOLS
        DW      TNAME+16*TMSCOLS,TNAME+17*TMSCOLS,TNAME+18*TMSCOLS,TNAME+19*TMSCOLS
        DW      TNAME+20*TMSCOLS,TNAME+21*TMSCOLS,TNAME+22*TMSCOLS,TNAME+23*TMSCOLS

; Registers 0-7.
; - 80 columns (PICO9918 TEXT80, also the V9938 TEXT2 and F18A T80 mode):
;   R0 bit 2 with text mode, names at a 4 KiB boundary (R2 low bits set as
;   the V9938 requires), patterns at 0000h, white on dark blue. No unlock is
;   needed.
; - 40 columns: text mode, the same colours.
; - Graphics I: patterns 0000h, colours 2000h, sprites 1B00h/3800h.
%IF TMS32
TMSREGS:DB      $00,$C0,TNAME/$400,TCOLOR/$40,$00,TSPRITE/$80,$07,$F1
%ELSE
%IF TMS80
TMSREGS:DB      $04,$50,TNAME/$400+3,$00,$00,$00,$00,$F4
%ELSE
TMSREGS:DB      $00,$D0,TNAME/$400,$00,$00,$00,$00,$F4
%ENDIF
%ENDIF
