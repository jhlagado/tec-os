; The data block's text, after tables.asm and gen/geom.asm; the code follows
; it.

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
CONNAMS:                        ; four bytes each, a colon after three
        DB      "TTY:CRT:"      ; letters; the last, PICO's record name too
        DB      "BAT:UC1:"
        DB      "GLCDPICO    "
CONWID: DB      "80",80,"40",40,"32",32 ; CON PICO's widths: typed, columns
CONHDR:
        DB      "CON: ",'$'
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
