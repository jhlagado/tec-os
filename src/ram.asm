; Resident workspace in the classic bank, from WSBASE upwards. The CCP and
; BDOS blocks follow this one (CCPRAM, then BDOSRAM) and end at the RAM
; BIOS table at BF00h; the SD, keyboard and GLCD state sit above the table. Nothing
; here is initialised by the image: cold and warm boot clear and set it.

        ORG     WSBASE

; ---- BIOS disk state ----------------------------------------------------------
DSKCUR: DS      1               ; selected drive
DSKTRK: DS      2
DSKSEC: DS      2
DSKDMA: DS      2
BLKOFF: DS      2               ; block number within the volume
BLKSLOT:DS      1               ; 128-byte record within the block, 0-3

; One-block deblocking buffer, keyed by drive and block number.
BUFOK:  DS      1
BUFDRV: DS      1
BUFBLK: DS      2
BLKBUF: DS      512

; Drive table: start block (4), length in blocks (2), geometry (1), flags (1).
DRVTAB: DS      MAXDRV*DRVESZ
DPHTAB: DS      MAXDRV*DPHSZ
DIRBUF: DS      128
CSVDUM: DS      2               ; check vector placeholder; CKS is zero
STUBAD: DS      2               ; BDOS entry jump, the word at 0006h

; ---- Mount scratch ----------------------------------------------------------
MNTCNT: DS      1
MNTEND: DS      4*8             ; exclusive end block of each descriptor

; ---- Video terminal ---------------------------------------------------------
LINEBUF:DS      80              ; one display row, for scrolling
VPUTV:  DS      2               ; driver vectors set by VIDINIT
VGETV:  DS      2
VCLRV:  DS      2
VRSTV:  DS      2
VRDRV:  DS      2               ; read row B into LINEBUF
VWRRV:  DS      2               ; write LINEBUF to row B
VSTOP:  DS      1               ; scroll region, first and last row
VSBOT:  DS      1
TPDRAW: DS      1               ; PICO9918 page drawn and page shown: offset
TPSHOW: DS      1               ; high byte, 0 or TPGOFF
TMVCOPY:DS      1               ; 1 while a row move builds the hidden page
CONACT: DS      1               ; IOBYTE CON: field last acted on
VCLAIM: DS      1               ; 1 while a program owns the PICO9918
HWARGA: DS      1               ; hardware services: A on entry
RNDST:  DS      2               ; RANDOM's state
CONMOD: DS      1               ; console mode in effect (CMTTY..CMUC1)

; ---- BIOS stack used by warm boot and the diagnostic console ----------------
BSTKB:  DS      BIOSSTN
BSTK:

BIOSRME:
CCPRAM  EQU     BIOSRME

        ORG     RAMBIOS+BIOSLEN
; ---- SD card state ----------------------------------------------------------
SDBYTE: DS      1               ; 1 when the card takes byte addresses
SDARG:  DS      4               ; command argument, big-endian
SDLBA:  DS      4               ; block address, little-endian
SDERR:  DS      1               ; last error code

; ---- Matrix keyboard scan state ----------------------------------------------
KBMASK: DS      1               ; row select for the next row, one bit low
KBBASE: DS      1               ; key number of that row's bit 0
KBE:    DS      1               ; last key seen in this scan, FFh none
KBD:    DS      1               ; the key seen before it
KBTN:   DS      1               ; arrow-sequence bytes still to deliver
KBT1:   DS      1               ; and the bytes themselves
KBT2:   DS      1

; ---- GLCD text console --------------------------------------------------------
GLTEXT: DS      GLCOLS*GLROWS   ; characters on screen, row by row
GLY:    DS      1               ; pixel row being drawn, 0-63
GLW:    DS      1               ; 16-pixel word being drawn, 0-7
GLROWP: DS      2               ; GLTEXT address of the text row being drawn
GLOFF:  DS      1               ; pixel offset of a character within the word
HIRME:
