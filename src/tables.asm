; Read-only tables after ABIEND.
; Generated geometry/font and text
; follow. tools/build.mjs uses
; format/font5x7.txt for the current
; font.

ROMDATA:

; Cold boot copies all 17 JP entries to
; RAMBIOS. Warm boot leaves that copy
; and its hooks. Offsets are
; hexadecimal.

BIOSBAS:
  jp COLD        ; 00 cold boot
  jp WBOOTR      ; 03 warm boot
  jp HKBI2     ; 06
  jp HKBI3      ; 09
  jp HKBI4     ; 0C
  jp HKBI5       ; 0F
  jp HKBI6      ; 12
  jp HKBI7     ; 15
  jp HKBI8       ; 18
  jp HKBI9     ; 1B
  jp HKBI10     ; 1E
  jp HKBI11     ; 21
  jp HKBI12     ; 24
  jp HKBI13       ; 27
  jp HKBI14      ; 2A
  jp HKBI15     ; 2D
  jp HKBI16     ; 30

; Keyboard lookups. Arrow keys 3-6 use
; KBARROW after ESC[. KBSPEC has five
; key/plain/shifted triples. KBSHIFT
; indexes 18 characters from 2Ch.

KBARROW:
  DB "ABDC"      ; up, down, left, right
KBSPEC: DB $0A,$0D,$0D, $0C,$1B,$1B, $0D,$20,$20, $0E,$27,$22, $3F,$5C,$7C
KBSHIFT:
  DB "<_>?)!@#$%^&*( : +"

; LCD initialisation commands: 8-bit and
; two lines, display on with no cursor,
; addresses rising, home, clear. The
; console's restore sends all but the
; clear. Then the row-address commands
; for caller-valid rows 0-3.

LCDSEQ: DB $38,$0C,$06,$02,$01

LCDROWS:
  DB LCDCMD,$80,LCDCMD,$C0,LCDCMD,$94,LCDCMD,$D4
  DB LCDCMD,$80,LCDCMD,$C0,LCD2CMD,$80,LCD2CMD,$C0

; The LCD console's table, as CONSWV
; copies one: six terminal words, no
; page function, columns and rows.
; Its get is HWSPX, which returns 0:
; the terminal reads a cell only to
; flip the cursor, and LCVPUT takes the
; 80h that follows as that flip.

LCVTAB: DW LCVPUT,HWSPX,LCVCLR,LCVRST,LCVRD,LCVWR
  DW 0
  DB 20,4

; Built-in command records: keyword
; bytes, NUL, then LE handler word. A
; zero at the next keyword ends the
; table. Order is search order. ISCMD
; accepts NUL or SPACE after the
; keyword.

KEYTAB: DB "CD",0
  DW RCMDCD
  DB "DIR",0
  DW CMDDIR
  DB "TYPE",0
  DW CMDTYPE
  DB "ERA",0
  DW CMDERA
  DB "REN",0
  DW CMDREN
  DB "CON",0
  DW CMDCON
  DB "UNLOAD",0
  DW CMDUNL
  DB 0

; FNTAB: functions 0-40. FCBMAP selects
; FCBSEL before dispatch. Function n
; uses byte floor(n/8) and bit(n mod 8),
; low bit first.

FNTAB:
  DW FNZERO,FNCIN,FNCOUT,FNREAD,FNPUNCH,FNLIST
  DW FNDIRECT,FNGETIO,FNSETIO,FNPRINT,FNLINE,FNSTAT
  DW FNVERS,FNRESET,FNSEL,FNOPEN,FNCLSE,FNSRCHF
  DW FNSRCHN,FNDELETE,FNREADSQ,FNWRITE,FNMAKE,FNRENAME
  DW FNLOGIN,FNCURDSK,FNSETDMA,FNGETALV,FNWRPROT,FNGETRO
  DW FNATTR,FNGETDPB,FNUSER,FNRREAD,FNRWRITE,FNSIZE
  DW FNSETRR,FNRESETD,RETZERO,RETZERO,FNWRZERO
FCBMAP: DB %00000000,%10000000,%11111011,%01000000,%00001110,%00000001

; Services in abi.inc order: TNINFO to
; TNGLYPH. TNLIST is 14. TNFONT, 15, is
; refused: the font is packed.

; 0 and 1

SVTAB: DW HWSINFO,HWSDIG

; 2 and 3

  DW HWSLCD,HWSVID

; 4 and 5

  DW HWSTONE,HWSJOY

; 6 and 7

  DW HWSKEYS,HWSPUT

; 8 and 9

  DW HWSRTC,VSMNT

; 10 and 11

  DW VSUNM,VSDSC

; 12 and 13

  DW SVDRV,SVFND

; 14 and 15

  DW SVLST,HWSNO

; 16 and 17

  DW SVSHL,FNTGLY

; Twelve-byte FCB prefixes for CMDFCB:
; explicit drive A, eight-byte name and
; three-byte type.

GLCFCB: DB 1,"GLCD    SVC"
STFCB: DB 1,"STARTUP CMD"

; Initial stack room for services, in
; BDOS/BIOS/CCP order. The loader
; subtracts each declaration before INIT
; and stores the remaining room.

SVCLIM: DB 8,12,6

; CSI final bytes for VTPFIN's scan:
; each byte is followed by its handler.

VTFTAB: DB 'A'
  DW VTUP
  DB 'B'
  DW VTDOWN
  DB 'C'
  DW VTRIGHT
  DB 'D'
  DW VTLEFT
  DB 'H'
  DW VTPOS
  DB 'f'
  DW VTPOS
  DB 'J'
  DW VTED
  DB 'K'
  DW VTEL
  DB 'm'
  DW VTSGR
  DB '@'
  DW VTICH
  DB 'P'
  DW VTDCH
  DB 'L'
  DW VTIL
  DB 'M'
  DW VTDL
  DB 'r'
  DW VTREG
VTFCNT EQU ($-VTFTAB)/3
