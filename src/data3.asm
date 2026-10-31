; The data block, continued (data.asm); the code follows it.

; ---- diag.asm ----------------------------------------------------------------
DGERR:  DB      "No volume mounted, error ",0
DGPROM: DB      "R retry, H header> ",0

; ---- cpm/ccp.asm -------------------------------------------------------------
CRLFMSG:
        DB      CR,LF,'$'
NOFILE:
        DB      "NO FILE",'$'
FILESMSG:
        DB      " files, ",'$'
FILEMSG:
        DB      " file, ",'$'
FREEMSG:
        DB      "K free",'$'
MOREMSG:
        DB      "[more]",'$'
UNMORE:
        DB      CR,"      ",CR,'$'
DIRKEY:
        DB      "DIR",0
TYPEKEY:
        DB      "TYPE",0
ERAKEY:
        DB      "ERA",0
RENKEY:
        DB      "REN",0
SAVEKEY:
        DB      "SAVE",0
USERKEY:
        DB      "USER",0
CONKEY:
        DB      "CON",0
COPYKEY:
        DB      "COPY",0
CCPKEY:
        DB      "CCP",0
EXITKEY:
        DB      "EXIT",0
UNLKEY:
        DB      "UNLOAD",0
DRVKEY:
        DB      "DRIVERS",0
CPNOSRC:
        DB      "NO SOURCE",CR,LF,'$'
CPNODST:
        DB      "CANNOT MAKE DEST",CR,LF,'$'
CPWRITE:
        DB      "WRITE ERROR",CR,LF,'$'
CPCLOSE:
        DB      "CLOSE ERROR",CR,LF,'$'
CPCOPIED:
        DB      "COPIED ",'$'
CONNAMS:
        DB      "TTYCRTBATUC1"
CONHDR:
        DB      "CON: ",'$'
CONTTY:
        DB      "TTY: serial terminal",'$'
CONCRT:
        DB      "CRT: PICO9918",'$'
CONBAT:
        DB      "BAT: reader and list",'$'
CONUC1:
        DB      "UC1: GLCD",'$'
CONMSGS:
        DW      CONTTY,CONCRT,CONBAT,CONUC1
FILEEX:
        DB      "FILE EXISTS",'$'
NOSPACE:
        DB      "NO SPACE",'$'
ALLQUERY:
        DB      "ALL (Y/N)?",'$'
BADCHARS:
        DB      "<>,;:[]%|()/",92

; ---- cpm/bdos.asm ------------------------------------------------------------
; Each function's routine. FCBMAP has a bit for each function, bit n of
; byte n/8, set where the FCB's drive is bound first.
FNTAB:
        DW      FNZERO,FNCIN,FNCOUT,FNREAD,FNPUNCH,FNLIST
        DW      FNDIRECT,FNGETIO,FNSETIO,FNPRINT,FNLINE,FNSTAT
        DW      FNVERS,FNRESET,FNSEL,FNOPEN,FNCLSE,FNSRCHF
        DW      FNSRCHN,FNDELETE,FNREADSQ,FNWRITE,FNMAKE,FNRENAME
        DW      FNLOGIN,FNCURDSK,FNSETDMA,FNGETALV,FNWRPROT,FNGETRO
        DW      FNATTR,FNGETDPB,FNUSER,FNRREAD,FNRWRITE,FNSIZE
        DW      FNSETRR,FNRESETD,RETZERO,RETZERO,FNWRZERO
FCBMAP: DB      %00000000,%10000000,%11111011,%01000000,%00001110,%00000001

ERRHEAD: DB     CR,LF,"Bdos Err On ",0
ERRSEL: DB      ": Select",0
ERRBAD: DB      ": Bad Sector",0
ERRRO:  DB      ": R/O",0
ERRFILE: DB     ": File R/O",0

; ---- hwsvc.asm ---------------------------------------------------------------
HWTAB:  DW      HWSINFO,HWSDIG,HWSHEX,HWSLED,HWSLCD,HWSVID,HWSTONE,HWSJOY
        DW      HWSKEYS,HWSSER,HWSBLK,HWSDLY,HWSVREG,HWSVFIL,HWSVWR,HWSVRD
        DW      HWSPUT,HWSRND,HWSRTC

HWSEGT: DB      $EB,$28,$CD,$AD,$2E,$A7,$E7,$29 ; 0-7
        DB      $EF,$AF,$6F,$E6,$C3,$EC,$C7,$47 ; 8-9, A-F

; ---- glcd.asm ----------------------------------------------------------------
GLCFCB: DB      1,"GLCD    DRV"
GLCMSG: DB      "GLCD?",0
DGLCD:  DB      "CARD?",0
PICMSG:	DB	"PICO?"
PICCLR:	DB	"     ",0	; PICO?'s blanks wipe any of these words
STFCB:  DB      1,"STARTUP CMD"

; ---- cache.asm ---------------------------------------------------------------
CWMSG:  DB      13,10,"Write lost",0

; ---- drv.asm -----------------------------------------------------------------
DRVLIM: DB      8,12,6          ; BDOS, BIOS and CCP: each stack's sum of drivers

ROMCODE:
