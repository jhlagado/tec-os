; ROM text after tables and generated
; geometry/font data. tools/build.mjs
; generates font data from
; format/font5x7.txt. Code follows at
; ROMCODE.

; Boot/status text, zero-terminated.

; ---- boot.asm

RAMMSG: DB 13,10,"TEC-OS needs 64K RAM",13,10,0
BANNER: DB 13,10,"TEC-OS ",VERHI+'0','.',VERLO+'0'," for TEC-1G",13,10,0
ROTXT: DB " (read-only)",0
DGERR: DB "No volume mounted, error ",0
DGPROM: DB "R retry> ",0
DGCARD: DB "CARD?",0

; CCP '$'-terminated text.
; UNMORE erases [more].

; ---- cpm/ccp.asm

CRLFMSG:
  DB CR,LF,'$'
NOFILE:
  DB "NO FILE",'$'
FILESMSG:
  DB " files, ",'$'
FILEMSG:
  DB " file, ",'$'
FREEMSG:
  DB "K free",'$'

; Six four-byte names: first four have
; a colon after three letters, then GLCD
; and PICO. GLCD=UC1, PICO=CRT.
; PICO plus four spaces at offset 20 is
; the eight-byte registry key.

CONNAMS:

  DB "TTY:CRT:"
  DB "BAT:UC1:"
  DB "GLCDPICO    "

; CCP '$'-terminated output. BADCHARS
; is 13 raw bytes without a terminator.
; VALIDCHR scans them by count.

CONHDR:
  DB "CON: ",'$'
FILEEX:
  DB "FILE EXISTS",'$'
NOSPACE:
  DB "NO SPACE",'$'
ALLQUERY:
  DB "ALL (Y/N)?",'$'
BADCHARS:
  DB "<>,;:[]%|()/",92

; LCD row-zero banner, zero-terminated.

; ---- lcd.asm

LCDBAN: DB "TEC-OS ",VERHI+'0','.',VERLO+'0',"  TEC-1G",0

; BDOS zero-terminated disk-error text.

; ---- cpm/bdos.asm

ERRHEAD:
  DB CR,LF,"Bdos Err On ",0
ERRSEL: DB ": Select",0
ERRBAD: DB ": Bad Sector",0
ERRRO: DB ": R/O",0
ERRFILE:
  DB ": File R/O",0

; Zero-terminated LCD recovery text.
; PICCLR has five blanks, no row clear.
; WRDCLR uses CDWRD to protect program
; text from ROM recovery-word cleanup.

GLCMSG: DB "GLCD?",0

PICCLR: DB "     ",0

; Warm-boot error for failed/dropped
; dirty lines, zero-terminated.
; ROMCODE marks code.

; ---- cache.asm

CWMSG: DB 13,10,"Write pending",13,10,0
HKOKMSG: DB 13,10,"Cache clear",13,10,0
HKERRMSG: DB 13,10,"Write error",13,10,0

; Disk bootstrap retry, '$'-terminated.
RSTERR: DB CR,LF,"Disk reset failed",CR,LF,"Enter retries",CR,LF,"$"

ROMCODE:
