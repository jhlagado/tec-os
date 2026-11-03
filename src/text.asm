; The data block, continued from tables.asm and gen/geom.asm; the code
; follows it.

; ---- boot.asm ----------------------------------------------------------------
RAMMSG: DB      13,10,"TEC-OS needs 64K RAM",13,10,0
BANNER: DB      13,10,"TEC-OS ",VERHI+'0','.',VERLO+'0'," for TEC-1G",13,10,0
ROTXT:  DB      " (read-only)",0
DGERR:  DB      "No volume mounted, error ",0
DGPROM: DB      "R retry, H header> ",0
DGCARD: DB      "CARD?",0

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
TYPEKEY:
        DB      "TYPE",0
DIRKEY:
        DB      "DIR",0
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
UNLKEY:
        DB      "UNLOAD",0
SVCKEY:
        DB      "SERVICES",0
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

; ---- lcd.asm -----------------------------------------------------------------
LCDBAN: DB      "TEC-OS ",VERHI+'0','.',VERLO+'0',"  TEC-1G",0

; ---- cpm/bdos.asm ------------------------------------------------------------
ERRHEAD: DB     CR,LF,"Bdos Err On ",0
ERRSEL: DB      ": Select",0
ERRBAD: DB      ": Bad Sector",0
ERRRO:  DB      ": R/O",0
ERRFILE: DB     ": File R/O",0

; ---- loader.asm and cpm/ccp.asm: the LCD's words ----------------------------
GLCMSG: DB      "GLCD?",0
PICMSG:	DB	"PICO?"
PICCLR:	DB	"     ",0	; PICO?'s blanks wipe any of these words

; ---- cache.asm ---------------------------------------------------------------
CWMSG:  DB      13,10,"Write lost",0

ROMCODE:
