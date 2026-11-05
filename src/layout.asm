; TEC-OS memory and port contract.
;
; Fixed RAM is 0000h-7FFFh, the bank
; window is 8000h-BFFFh and ROM is
; C000h-FFFFh. The classic transient
; program area runs from 0100h to the
; BDOS entry jump, which cold boot
; places below the resident workspace at
; the top of EXPAND 0.

; ---- Ports
; --------------------------------------

KEYPORT EQU $00  ; keypad encoder; read
                 ; pumps Debug80 serial
                 ; RX
DIGPORT EQU $01  ; bit 6 serial TX, bits
                 ; 0-5 digit select
STSPORT EQU $03  ; status input; bit 7
                 ; serial RX
SDIO EQU $FD     ; SD SPI: out bit 0
                 ; MOSI, 1 CLK, 2 /CS;

; in bit 7 MISO

                 ; latch

; ---- System latch values
; --------------------------------------

LATSHAD EQU $01  ; /SHADOW high: boot
                 ; overlay removed
LATKEEP EQU $83  ; bits kept by bank
                 ; changes: /SHADOW,

; PROTECT and CAPS

                 ; 8000h-BFFFh

; classic profile: overlay off, base
; window

LATCLAS EQU LATSHAD

; and for EXPAND 1

DETEXP EQU $8000
CTAB EQU $BC00   ; the block cache's
                 ; table: the lines'
                 ; blocks,

; 4 bytes each, and their dirty bytes

CDIRTY EQU $BC80
NLINES EQU 30    ; lines of 512 bytes at
                 ; 8000h-BBFFh

; ---- Page zero (CP/M 2.2 base page)
; --------------------------------------

IOBYTE EQU $0003
PZDU EQU $0004   ; user number (bits
                 ; 4-7) and drive (bits
                 ; 0-3)

; JP to the BDOS stub

PZBDOS EQU $0005

; the drive a program was loaded from,

PZLDRV EQU $0050

; 0 the current, 1 A: (CP/M 3's)

RST7 EQU $0038
DEFDMA EQU $0080

; CP/M reserves 0040h-004Fh for BIOS
; scratch. TEC-OS keeps only the latch's
; shadow here, the one byte read while
; EXPAND 1 is in view; the console's
; state is above the RAM BIOS table
; (ram.asm), and 0041h-004Fh are unused
; (KS36c). shadow copy of the system
; latch


CDMTX EQU $01    ; matrix keyboard
                 ; enabled
CDTMS EQU $02    ; PICO9918 answered at
                 ; cold boot
CDGLC EQU $04    ; GLCD.SVC is in
CDRTC EQU $08    ; a DS1302 answered at
                 ; cold boot
CDCLM EQU $10    ; VCLAIM's value: the
                 ; PICO9918 is claimed
CDWRD EQU $80    ; a word of the ROM's
                 ; is on LCD row 3

; Console modes: the IOBYTE CON: field
; in effect (CONMOD). Odd means a video
; display with the matrix keyboard.

CMTTY EQU 0      ; serial terminal
CMCRT EQU 1      ; PICO9918 and matrix
                 ; keyboard
CMBAT EQU 2      ; keys from the serial
                 ; reader, output
                 ; discarded
CMUC1 EQU 3      ; GLCD and matrix
                 ; keyboard

; ---- Classic resident region (top of
; the classic bank)
; ----------------------
; cold-boot stack top, fixed RAM

BOOTSTK EQU $8000

; WSBASE, the first byte of the fixed
; workspace, comes from the generated
; configuration: the build places it so
; that the workspace ends at RAMBIOS.
; Below it, cold boot packs the
; allocation vectors and the BDOS entry
; jump (STUBAD) for the volumes mounted.
; RAM copy of the BIOS jump table, top
; page

RAMBIOS EQU $BF00
BIOSLEN EQU 17*3

; ---- Resident stack sizes (measured by
; test/stacks.test.mjs) -------------
; Each holds its base, the deepest use
; with no resident, and SVCLIM's limit
; for services with a quarter free
; (KE-173): the BIOS's base is 18, warm
; boot's flush, and the CCP's 18. No NMI
; frame is in the figures: the test
; takes an NMI only where 0066h holds
; RETN, which TEC-OS never writes. The
; CCP stack is also a transient's
; default stack: CP/M's eight levels and
; the
; return word need 18 bytes of it.

BDOSSTN EQU 54
CCPSTN EQU 32    ; within STKGUARD's 43,
                 ; so no RAM
BIOSSTN EQU 40

; ---- Disk geometry limits
; --------------------------------------

MAXDRV EQU 4     ; drives A-D
DPHSZ EQU 16
DRVESZ EQU 8     ; drive table entry
                 ; size

; A reset's retained selection, in the
; TPA, which nothing writes between COLD
; and MEMINIT: DRVTAB's copy, then each
; drive's index + 1, in DRVIDX's order
; after it, then RESEL's working copy of
; one descriptor. RSLBUF+6, A:'s
; geometry, is 0 for no selection.

RSLBUF EQU $0100
RSLIDX EQU RSLBUF+MAXDRV*DRVESZ
RSLTMP EQU RSLIDX+MAXDRV
