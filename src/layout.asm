; Fixed RAM: 0000h-7FFFh. Bank window:
; 8000h-BFFFh. ROM: C000h-FFFFh.
; With no resident service the TPA runs
; from 0100h to the BDOS stub below the
; workspace and allocation vectors in
; EXPAND 0. Services lower the current
; top through PZTOP.

KEYPORT EQU $00  ; keypad encoder. Read
                 ; can start Debug80's
                 ; queued serial RX
DIGPORT EQU $01  ; TX bit 6, digits 0-5.
                 ; Speaker bit 7
STSPORT EQU $03  ; RX input bit 7
SDIO EQU $FD     ; out bits 0/1/2:
                 ; MOSI, CLK, /CS
                 ; in bit 7: MISO

; LATKEEP preserves /SHADOW, PROTECT and
; CAPS during bank changes.

LATSHAD EQU $01  ; /SHADOW high:
                 ; overlay off
LATKEEP EQU $83

; Classic latch: overlay off, base bank.

LATCLAS EQU LATSHAD

; EXPAND window base/test address.

DETEXP EQU $8000

; EXPAND 1 cache: 30 lines of 512 bytes
; at 8000h-BBFFh. CTAB has 30 four-byte
; LBA keys, FFFFFFFFh for empty. CDIRTY
; has one separate dirty byte per line.

CTAB EQU $BC00   ; four-byte LBA keys

CDIRTY EQU $BC80
NLINES EQU 30    ; cache lines

; CP/M 2.2 base-page fields. PZDU packs
; user in bits 4-7 and drive in bits
; 0-3.

IOBYTE EQU $0003
PZDU EQU $0004

; Page-zero JP. Target at 0006h is
; PZTOP: lowest service entry or stub.

PZBDOS EQU $0005

; Loaded-drive byte, CP/M 3's extension:
; 0 current, 1 A, 2 B and so on.

PZLDRV EQU $0050

RST7 EQU $0038
DEFDMA EQU $0080

; BIOS scratch 0040h-004Fh now holds
; only LATCHV, visible with EXPAND 1 in
; view. The former page-zero console
; bytes moved above RAMBIOS (KS36c).
; PICO state, LINEBUF, VCLAIM and CONMOD
; remain below it.
CDMTX EQU $01    ; matrix enabled
CDTMS EQU $02    ; PICO cold probe
CDGLC EQU $04    ; GLCD.SVC installed
CDRTC EQU $08    ; RTC cold probe
CDCLM EQU $10    ; VCLAIM when claimed
CDWRD EQU $80    ; ROM word on LCD row 3

; Effective console modes in CONMOD.
; IOBYTE's requested CON: field takes
; effect through CONSEL. Odd modes use a
; display and matrix keyboard.

CMTTY EQU 0      ; serial terminal
CMCRT EQU 1      ; PICO + matrix keys
CMBAT EQU 2      ; serial reader. List
                 ; output discarded
CMUC1 EQU 3      ; GLCD + matrix keys

; BOOTSTK is the fixed-RAM stack top.
; WSBASE is generated so the lower
; classic-bank workspace ends at
; RAMBIOS. ALVINIT packs vectors below
; WSBASE then the BDOS stub below them.

BOOTSTK EQU $8000

; RAM copy of the 17-entry BIOS table.

RAMBIOS EQU $BF00
BIOSLEN EQU 17*3

; Resident stack reservations and
; service room from SVCLIM, with a
; quarter free (KE-173). Historical bare
; use: BIOS 18 bytes for warm flush, CCP
; 18 bytes. A transient's eight call
; levels plus return word require 18
; bytes of CCP stack.
; No NMI frame is counted. The test
; takes NMI only with RETN at 0066h,
; which TEC-OS does not install. CCP
; guard plus stack stays 43 bytes.

BDOSSTN EQU 54
CCPSTN EQU 32    ; guard + stack stay 43
BIOSSTN EQU 40

MAXDRV EQU 4     ; drives A-D
DPHSZ EQU 16
DRVESZ EQU 8     ; drive entry bytes

; RSLCAP captures DRVTAB here before
; workspace clearing. After capture the
; cold path leaves it until MEMINIT.
; RESEL rebuilds the four
; current-container indices+1, with 0
; for none, and uses eight-byte
; descriptor scratch. RSLBUF+6=0 means
; no retained selection. The 36-byte
; selection is committed only after all
; retained drives and slots match.

RSLBUF EQU $0100
RSLIDX EQU RSLBUF+MAXDRV*DRVESZ
RSLTMP EQU RSLIDX+MAXDRV
