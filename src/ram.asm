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
DRVIDX: DS      MAXDRV          ; each drive's volume: container index + 1, 0 for none
DRVSLOT:DS      MAXDRV          ; each drive's vector slot: 0 none, 1 G1M's, 2 G8M's
DPHTAB: DS      MAXDRV*DPHSZ
LOGINV: DS      2               ; the BDOS's logged drives, kept across a warm boot
DIRBUF: DS      128
CSVDUM: DS      2               ; check vector placeholder; CKS is zero
STUBAD: DS      2               ; BDOS entry jump, the word at 0006h

; ---- Mount scratch ----------------------------------------------------------
MNTCNT: DS      1
MNTBLK: DS      4               ; the container's length in blocks
MNTPRV: DS      4               ; the previous descriptor's end, or the table's sum
MNTSUM: DS      2               ; format 1.1: blocks 1-7's sum, from the header
MNTDRV: DS      1               ; format 1.1: drives wanted; 0 for a 1.0 card
MNTI:   DS      1               ; the descriptor being checked
MNTCB:  DS      1               ; the table block in BLKBUF, FFh none

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
SDXB:   DS      1               ; LATEXP while the block is a cache line

; ---- The block cache (cache.asm) ----------------------------------------------
CNEXT:  DS      1               ; the next line in turn
CFAIL:  DS      1               ; 1: a line's write failed since warm boot
CSKIP:  DS      1               ; CFLUSH's line to leave
CWTYPE: DS      1               ; BIOS WRITE's type, C
CIFF:   DS      2               ; the flags a BIOS entry found: P/V, its interrupt state

; ---- Matrix keyboard scan state ----------------------------------------------
KBMASK: DS      1               ; row select for the next row, one bit low
KBBASE: DS      1               ; key number of that row's bit 0
KBE:    DS      1               ; last key seen in this scan, FFh none
KBD:    DS      1               ; the key seen before it
KBTN:   DS      1               ; arrow-sequence bytes still to deliver
KBT1:   DS      1               ; and the bytes themselves
KBT2:   DS      1

; ---- The GLCD console ------------------------------------------------------
GLCWANT:DS      1               ; 1: a GLCD answered; the CCP's first entry loads GLCD.PRL
GLVEC:  DS      2               ; GLCD.PRL's video table, from GLHOOK; 0 for none

; ---- Command-line history ------------------------------------------------------
HHEAD:  DS      1               ; the offset the next line goes in at

; ---- XMOVE's banks for the next MOVE ------------------------------------------
XMDST:  DS      1
XMSRC:  DS      1
MVREST: DS      2               ; MOVE: the bytes left for the byte loop
XMARK:  DS      1               ; EXPAND 1's low mark (FF18h points here)
PZTOP:  DS      2               ; the current top, which warm boot puts at 0006h
PRGCODE:DS      2               ; BDOS function 108's program return code
PRLN:   DS      2               ; the PRL loader: code length
PRLPG:  DS      1               ; and destination page
CCPLVL: DS      1               ; the CCP's level, 0 at the outermost
CCPFLG: DS      1               ; 1 a one-command level to run, 2 run: exit
HIRME:
