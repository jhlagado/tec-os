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

; ---- The CCP's state and stack (cpm/ccp.asm) ----------------------------------
CMDFCB:
        DS      36
RENFCB:
        DS      36
CMDBUF:
        DS      1
CMDLEN:
        DS      1
CMDTXT:
        DS      128
BOOTDRV:
        DS      1
CMDSTRT:
        DS      2
ARGSTRT:
        DS      2
FCBBASE:
        DS      2
DIRCOL:
        DS      1
DIRNCOL:
        DS      1
DIRNUM:
        DS      2
PGLINE:
        DS      1
PGCOL:
        DS      1
PGROWS:
        DS      1
PGWID:
        DS      1
DIRANY:
        DS      1
DIRENTP:
        DS      2
SAVEPGS:
        DS      1
SAVEADR:
        DS      2
ERAANS:
        DS      1
ERAALL:
        DS      1
; This is both the oversize discriminator and ordinary CCP scratch storage.
LOADBUF:
        DS      128
; A fixed sentinel separates reusable command scratch from the downward-growing
; resident stack. The host proof checks that every byte survives the deepest
; built-in and error-recovery paths.
STKGUARD:
        DS      43-CCPSTN
STKGUEND:
CSTKBAS:
        DS      CCPSTN
CSTKTOP:
CCPRME:

; ---- The BDOS's state and stack (cpm/bdos.asm) --------------------------------
BDOSRAM EQU     CCPRME
OLDSP:  DS      2
PARAM:  DS      2
COLUMN: DS      1
LISTEN: DS      1
PENDING: DS      1
PENDCHR: DS      1
LINPTR: DS      2
LINMAX: DS      1
LINCNT: DS      1
HFLAG:  DS      1               ; FFh: the CCP's prompt, with history
HPOS:   DS      1               ; the history line shown: its terminator
CURDRV: DS      1
DEFDRV: DS      1
DEFDPB: DS      2
DEFALV: DS      2
USERNO: DS      1
WRFLAG: DS      1               ; set by the CCP for its reset at entry
WARMV:  DS      2               ; drives to rebuild to their mark
ROVEC:  DS      2
CURDMA: DS      2
DPHPTR: DS      2
DPBPTR: DS      2
DIRPTR: DS      2
ALVPTR: DS      2
XLTPTR: DS      2
CURTRK: DS      2
CURSEC: DS      2
DIRLEFT: DS      2
ENTPTR: DS      2
ENTLEFT: DS      1
ALLEFT: DS      1
DIRCNT: DS      2
DIRUSED: DS      2
SRCHIDX: DS      2
SRCHFCB: DS      2
MATCHPTR: DS      2
COPYPTR: DS      2
OPENMOD: DS      1
RETCODE: DS      1
SEQREC: DS      1
IOTRK:  DS      2
IOSEC:  DS      2
FSIZE0: DS      1
FSIZE1: DS      1
FSIZE2: DS      1
CAND0:  DS      1
CAND1:  DS      1
CAND2:  DS      1
TARGEX: DS      1
TARGS2: DS      1
WRTYPE: DS      1
ZEROFIL: DS      1
ZEROBN: DS      2
DIRTRK: DS      2
DIRSEC: DS      2
STKBASE:
        DS      BDOSSTN
STKTOP:
BDOSRME:

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
GLVEC:  DS      2               ; GLCD.PRL's video table, from GLHOOK; 0 for none

; ---- Command-line history ------------------------------------------------------
HHEAD:  DS      1               ; the offset the next line goes in at

; ---- XMOVE's banks for the next MOVE ------------------------------------------
XMDST:  DS      1
XMSRC:  DS      1
MVREST: DS      2               ; MOVE: the bytes left for the byte loop
XMARK:  DS      1               ; EXPAND 1's low mark (ABIXMRK points here)
PZTOP:  DS      2               ; the current top, which warm boot puts at 0006h
PRGCODE:DS      2               ; BDOS function 108's program return code
LOADTOP:DS      2               ; successful LOADCOM exclusive record end
PRLN:   DS      2               ; the PRL loader: code length
PRLDL:  DS      1               ; and relocation delta
CCPLVL: DS      1               ; the CCP's level, 0 at the outermost; bit 7: an INIT or REMOVE runs
CCPFLG: DS      1               ; 1 a one-command level to run, 2 run: exit
REGHEAD:DS      2               ; the first service record
DRVHEAD:DS      1               ; the lowest driver's page, 0 for none
DRVGEN: DS      1               ; raised by each removal
DRVRC:  DS      1               ; the last load's failure
STPOS:  DS      1               ; 0 at cold boot, FFh done, else the next byte + 1
STREC:  DS      128             ; A:STARTUP.CMD's one record
HIRME:
WSEND   EQU     HIRME           ; end of the classic resident workspace
