; The ROM's read-only data: one block after the table, gathered from the
; code's source files in their assembly order. The block runs on through
; data2.asm, gen/geom.asm and data3.asm. Nothing in it is
; executed but the BIOS jump table, which cold boot copies to RAMBIOS.

ROMDATA:

; ABI 3 had its mount service at C01Dh, and a card from then can still hold a
; MOUNT.COM or VOLS.COM with no test of the table. A RET there sends each back
; with nothing done. The five bytes before it are the CCP's TYPE keyword, the
; one data item of that length that needn't stay with its neighbours.
TYPEKEY:
	DB	"TYPE",0
OLDVOL:	DB	$C9		; C01Dh: RET, checked by the build

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

