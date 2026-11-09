; Ports, latch bits, MON3 calls and the
; memory the diagnostics use. Ports
; follow TEC-OS's own sources and the
; TEC-1G port list; docs/diagnostics.md
; records what each check assumes.

DIGP      EQU   $01
SEGP      EQU   $02
LCDC      EQU   $04
GLCC      EQU   $07
VDPD      EQU   $BE
VDPC      EQU   $BF
RTCP      EQU   $FC
SDIO      EQU   $FD
MTXP      EQU   $FE
SYSLAT    EQU   $FF

; The names TEC-OS's src/tms.asm uses.

VDPDAT    EQU   VDPD
VDPCTL    EQU   VDPC

; Port 01h: bit 6 is serial transmit,
; idle high; bits 0-5 select the digits.
; DIGSEL lights the rightmost digit.

TXIDLE    EQU   $40
DIGSEL    EQU   $01

; System latch bits, as TEC-OS names
; them. Bit 0 is /SHADOW: 1 removes the
; boot overlay at 0000h-07FFh.

LATSHAD   EQU   $01
LATPROT   EQU   $02
LATEXP    EQU   $04
LATCAPS   EQU   $80

; Descriptor flags other than read-only.

DFBAD     EQU   $FF-DFREAD

; MON3 API call numbers for RST 10h, C =
; call. GO and AD are scanKeys codes.

MBEEP     EQU   3
MSCANS    EQU   10
MLCDCMD   EQU   15
MLCDCHR   EQU   14
MSCANK    EQU   16
MDELAY    EQU   33
MGETCAP   EQU   37
MGETSHD   EQU   38
MGETPRT   EQU   39
MGETEXP   EQU   40
MSETCAP   EQU   41
MSETSHD   EQU   42
MSETPRT   EQU   43
MSETEXP   EQU   44
KGO       EQU   $12
KAD       EQU   $13

; MON3's user interrupt and NMI vectors,
; and the ROM the boot overlay shows.

UINTV     EQU   $0892
UNMIV     EQU   $0894
ROMLO     EQU   $C000
OVLEND    EQU   $08

; Result codes: an index into the totals
; and the status words.

RPASS     EQU   0
RWARN     EQU   1
RFAIL     EQU   2
RSKIP     EQU   3

; Field kinds for FIELDS.

FD8       EQU   1
FD16      EQU   2
FD32      EQU   3
FHEX      EQU   4
FHEX4     EQU   5
FFIX      EQU   6

; LCD row addresses of the 20 x 4
; module.

LROW1     EQU   $80
LROW2     EQU   $C0
LROW3     EQU   $94
LROW4     EQU   $D4

; Poll costs in T-states, for the clock
; and frame figures. SECCNT and FRMCNT
; give the loops they describe.

KSEC      EQU   1274
KFRM      EQU   48
