; TEC-OS memory and port contract.
;
; Fixed RAM is 0000h-7FFFh, the bank window is 8000h-BFFFh and ROM is
; C000h-FFFFh. TPATOP comes from the generated configuration: it is the
; page-aligned boundary between the classic transient program area and the
; resident workspace at the top of the classic bank.

; ---- Ports ----------------------------------------------------------------
KEYPORT EQU     $00             ; keypad encoder; read pumps Debug80 serial RX
DIGPORT EQU     $01             ; bit 6 serial TX, bits 0-5 digit select
STSPORT EQU     $03             ; status input; bit 7 serial RX
SDIO    EQU     $FD             ; SD SPI: bit 0 MOSI, 1 CLK, 2 /CS; in bit 7 MISO
SYSLAT  EQU     $FF             ; write-only system latch

; ---- System latch values ----------------------------------------------------
LATSHAD EQU     $01             ; /SHADOW high: boot overlay removed
LATKEEP EQU     $83             ; bits preserved by bank changes (/SHADOW, PROTECT, CAPS)
LATEXP  EQU     $04             ; EXPAND: window shows an expansion bank
LATCLAS EQU     LATSHAD         ; classic profile: overlay off, base window
LATLOW1 EQU     $08             ; LOWPAGE: low page 1 at 0000h-7FFFh
DETADR  EQU     $0100           ; where cold boot looks for a second low page

; ---- Page zero (CP/M 2.2 base page) -----------------------------------------
IOBYTE  EQU     $0003
PZDU    EQU     $0004           ; user number (bits 4-7) and drive (bits 0-3)
PZBDOS  EQU     $0005           ; JP to the BDOS stub
RST7    EQU     $0038
NMIVEC  EQU     $0066
DEFDMA  EQU     $0080

; CP/M reserves 0040h-004Fh for BIOS scratch. TEC-OS keeps the state that must
; stay visible whatever the bank window shows here.
LATCHV  EQU     $0040           ; shadow copy of the system latch
PAGES   EQU     $0041           ; low pages fitted, 1 or 2 (FF0Eh points here)
RXFULL  EQU     $0042           ; console byte waiting in RXCHAR
RXCHAR  EQU     $0043
                                ; 0044h free
CONDEV  EQU     $0045           ; console devices present (CD* bits)
VROW    EQU     $0046           ; video terminal cursor row
VCOL    EQU     $0047           ; and column
VWID    EQU     $0048           ; video columns
VHGT    EQU     $0049           ; video rows
ESCST   EQU     $004A           ; escape parser state
ESCP1   EQU     $004B           ; first and second numeric parameters
ESCP2   EQU     $004C
KBLAST  EQU     $004D           ; matrix key held at the last poll, FFh none
VATTR   EQU     $004E           ; 80h while reverse video is on
VCURV   EQU     $004F           ; 1 while the cursor cell is inverted

CDMTX   EQU     $01             ; matrix keyboard enabled
CDTMS   EQU     $02             ; PICO9918 answered at cold boot
CDGLC   EQU     $04             ; GLCD answered at cold boot

; Console modes: the IOBYTE CON: field in effect (CONMOD). Odd means a video
; display with the matrix keyboard.
CMTTY   EQU     0               ; serial terminal
CMCRT   EQU     1               ; PICO9918 and matrix keyboard
CMBAT   EQU     2               ; reader in, list out
CMUC1   EQU     3               ; GLCD and matrix keyboard

; ---- Classic resident region (top of the classic bank) ----------------------
BOOTSTK EQU     $8000           ; cold-boot stack top, fixed RAM
STUBPG  EQU     TPATOP          ; stub page: BDOS entry at +6
BDOSSTB EQU     TPATOP+6        ; value stored at 0006h
RAMBIOS EQU     TPATOP+$100     ; page-aligned RAM copy of the BIOS jump table
BIOSLEN EQU     17*3
WSBASE  EQU     RAMBIOS+BIOSLEN ; first resident workspace byte

; ---- Resident stack sizes (measured: see docs/acceptance.md) --------------
BDOSSTN EQU     64
CCPSTN  EQU     48

; ---- GLCD console geometry: 6 x 8 cells on 128 x 64 pixels ------------------
GLCOLS  EQU     21
GLROWS  EQU     8

; ---- Disk geometry limits ---------------------------------------------------
MAXDRV  EQU     4               ; drives A-D
ALVSZ   EQU     256             ; allocation vector bytes per drive (DSM <= 2047)
DPHSZ   EQU     16
DRVESZ  EQU     8               ; drive table entry size
