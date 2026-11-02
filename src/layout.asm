; TEC-OS memory and port contract.
;
; Fixed RAM is 0000h-7FFFh, the bank window is 8000h-BFFFh and ROM is
; C000h-FFFFh. The classic transient program area runs from 0100h to the
; BDOS entry jump, which cold boot places below the resident workspace at
; the top of EXPAND 0.

; ---- Ports ----------------------------------------------------------------
KEYPORT EQU     $00             ; keypad encoder; read pumps Debug80 serial RX
DIGPORT EQU     $01             ; bit 6 serial TX, bits 0-5 digit select
STSPORT EQU     $03             ; status input; bit 7 serial RX
SDIO    EQU     $FD             ; SD SPI: bit 0 MOSI, 1 CLK, 2 /CS; in bit 7 MISO
SYSLAT  EQU     $FF             ; write-only system latch

; ---- System latch values ----------------------------------------------------
LATSHAD EQU     $01             ; /SHADOW high: boot overlay removed
LATKEEP EQU     $83             ; bits preserved by bank changes (/SHADOW, PROTECT, CAPS)
LATEXP  EQU     $04             ; EXPAND: EXPAND 1 at 8000h-BFFFh
LATCLAS EQU     LATSHAD         ; classic profile: overlay off, base window
LATMAIN EQU     $08             ; MAIN: MAIN 1 at 0000h-7FFFh
DETADR  EQU     $0100           ; where cold boot looks for MAIN 1
DETEXP  EQU     $8000           ; and for EXPAND 1
XMLOW   EQU     $80             ; EXPAND 1's low mark: no range for programs
CTAB    EQU     $BC00           ; the block cache's table: the lines' blocks,
CDIRTY  EQU     $BC80           ; 4 bytes each, and their dirty bytes
NLINES  EQU     30              ; lines of 512 bytes at 8000h-BBFFh

; ---- Page zero (CP/M 2.2 base page) -----------------------------------------
IOBYTE  EQU     $0003
PZDU    EQU     $0004           ; user number (bits 4-7) and drive (bits 0-3)
PZBDOS  EQU     $0005           ; JP to the BDOS stub
RST7    EQU     $0038
DEFDMA  EQU     $0080

; CP/M reserves 0040h-004Fh for BIOS scratch. TEC-OS keeps the state that must
; stay visible whatever the bank window shows here.
LATCHV  EQU     $0040           ; shadow copy of the system latch
MAINS   EQU     $0041           ; MAIN regions fitted, 1 or 2 (ABIMAIN points here)
RXFULL  EQU     $0042           ; console byte waiting in RXCHAR
RXCHAR  EQU     $0043           ; and the byte itself
EXPANDS EQU     $0044           ; EXPAND regions fitted: always 2, MEMINIT stops on fewer
CONDEV  EQU     $0045           ; console devices present (CD* bits)
VROW    EQU     $0046           ; video terminal cursor row
VCOL    EQU     $0047           ; and column
VWID    EQU     $0048           ; video columns
VHGT    EQU     $0049           ; video rows
ESCST   EQU     $004A           ; escape parser state
ESCP1   EQU     $004B           ; first numeric parameter
ESCP2   EQU     $004C           ; second numeric parameter
KBLAST  EQU     $004D           ; matrix key held at the last poll, FFh none
VATTR   EQU     $004E           ; 80h while reverse video is on
VCURV   EQU     $004F           ; 1 while the cursor cell is inverted

CDMTX   EQU     $01             ; matrix keyboard enabled
CDTMS   EQU     $02             ; PICO9918 answered at cold boot
CDGLC	EQU	$04		; GLCD.SVC is in
CDCLM	EQU	$10		; VCLAIM's value: the PICO9918 is claimed
CDWRD	EQU	$80		; a word of the ROM's is on LCD row 3

; Console modes: the IOBYTE CON: field in effect (CONMOD). Odd means a video
; display with the matrix keyboard.
CMTTY   EQU     0               ; serial terminal
CMCRT   EQU     1               ; PICO9918 and matrix keyboard
CMBAT   EQU     2               ; reader in, list out
CMUC1   EQU     3               ; GLCD and matrix keyboard

; ---- Classic resident region (top of the classic bank) ----------------------
BOOTSTK EQU     $8000           ; cold-boot stack top, fixed RAM
; WSBASE, the first byte of the fixed workspace, comes from the generated
; configuration: the build places it so that the workspace ends at RAMBIOS.
; Below it, cold boot packs the allocation vectors and the BDOS entry jump
; (STUBAD) for the volumes mounted.
RAMBIOS EQU     $BF00           ; RAM copy of the BIOS jump table, top page
BIOSLEN EQU     17*3

; ---- Resident stack sizes (measured by test/stacks.test.mjs) -------------
; Each is its deepest use, as measured, and a quarter more. No NMI frame is
; in the figures: the test takes an NMI only where 0066h holds RETN, which
; TEC-OS never writes. The CCP stack is also a transient's default stack:
; CP/M's eight levels and the return word need 18 bytes of it.
BDOSSTN EQU     54
CCPSTN  EQU     30
BIOSSTN EQU     38

; ---- Disk geometry limits ---------------------------------------------------
MAXDRV  EQU     4               ; drives A-D
DPHSZ   EQU     16
DRVESZ  EQU     8               ; drive table entry size

; A reset's retained selection, in the TPA, which nothing writes between COLD
; and MEMINIT: DRVTAB's copy, then each drive's index + 1, in DRVIDX's order
; after it, then RESEL's working copy of one descriptor. RSLBUF+6, A:'s
; geometry, is 0 for no selection.
RSLBUF	EQU	$0100
RSLIDX	EQU	RSLBUF+MAXDRV*DRVESZ
RSLTMP	EQU	RSLIDX+MAXDRV
