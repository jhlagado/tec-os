; Hardware and memory contract for the diagnostics ROM.
;
; Port numbers come from the TEC-1G documentation, MON-3 and the Debug80
; model; docs/diagnostics.md lists where they disagree. The ROM image is
; C000h-FFFFh and its first 2 KiB also appear at 0000h while the boot
; overlay is on, exactly as for TEC-OS.

; ---- Ports ------------------------------------------------------------------
KEYPORT EQU     $00             ; keypad encoder: bits 0-4 key, bit 5 Shift (0 = down)
DIGPORT EQU     $01             ; bits 0-5 digit select, 6 serial TX, 7 speaker
SEGPORT EQU     $02             ; 7-segment segment latch
STSPORT EQU     $03             ; system input; bit 6 KDA (0 = key), bit 7 serial RX
LCDCMD  EQU     $04             ; HD44780 20 x 4: instruction and status
LCDDAT  EQU     $84             ; and data
LEDROW  EQU     $05             ; 8 x 8 matrix: row latch (classic: X axis)
LEDRED  EQU     $06             ; red columns (classic: Y axis)
GLCCMD  EQU     $07             ; ST7920 128 x 64: instruction and status
GLCDAT  EQU     $87             ; and data
VDPDAT  EQU     $BE             ; PICO9918 VRAM data
VDPCTL  EQU     $BF             ; and control/status
LEDGRN  EQU     $F8             ; 8 x 8 matrix green columns
LEDBLU  EQU     $F9             ; and blue
RTCPORT EQU     $FC             ; DS1302: bit 4 CE, 6 CLK, 7 data out, 5 read; in bit 0
SDIO    EQU     $FD             ; SD SPI: bit 0 MOSI, 1 CLK, 2 /CS; in bit 7 MISO
MTXPORT EQU     $FE             ; matrix keyboard; row select on A8-A15
SYSLAT  EQU     $FF             ; system latch, write-only on the board

; ---- System latch -------------------------------------------------------------
LATSHAD EQU     $01             ; /SHADOW high: boot overlay removed
LATPROT EQU     $02             ; PROTECT: 4000h-7FFFh read-only
LATEXP  EQU     $04             ; EXPAND
LATCAPS EQU     $80             ; CAPS lamp

; ---- Memory -------------------------------------------------------------------
NMIVEC  EQU     $0066
RST7    EQU     $0038
OVLPRB  EQU     $07FF           ; last byte under the boot overlay
SDBUF   EQU     $0C00           ; one SD block
VBUFA   EQU     $0E00           ; VRAM test page, written
VBUFB   EQU     $0F00           ; and read back
RPTBUF  EQU     $1000           ; report text
RPTEND  EQU     $3000
VARS    EQU     $7E00           ; variables, 7E00h-7EFFh
BOOTSTK EQU     $8000           ; stack 7F00h-7FFFh
WINDOW  EQU     $8000           ; bank window 8000h-BFFFh
ROMCKS  EQU     $FFFE           ; 16-bit sum of C000h-FFFDh, set by the build

; ---- Result codes -----------------------------------------------------------
RPASS   EQU     0
RFAIL   EQU     1
RINFO   EQU     2               ; a measured value, no verdict
RSKIP   EQU     3               ; not run
RLOOK   EQU     4               ; visual or audible: check it by eye or ear
RNONE   EQU     5               ; device not fitted or not answering
NRESULT EQU     6

; ---- Keys -----------------------------------------------------------------------
KESC    EQU     $1B
KCR     EQU     $0D

SDIDLE  EQU     $05             ; /CS high, MOSI high, CLK low
