; DIR.COM: DIR with each file's size, a
; transient on A: that the shell runs
; for DIR. DIR [d:][name] as dirsize.asm
; sets out; its rows go through the
; shell's pager when a shell holds the
; hook, and print plainly with none, as
; the ROM's listings do. DIR /W stays
; the ROM's: the shell hands it there.

%INCLUDE "../src/abi.inc"

BDOS EQU $0005
WBOOT EQU $0000
CURDSK EQU $0004
FCBONE EQU $005C
DEFDMA EQU $0080
TAIL EQU $0081
CR EQU 13
LF EQU 10
SPACE EQU 32
FAILCODE EQU 255*256

  ORG $0100

; The CCP enters with the tail at 0081h,
; zero-ended. Its own parse of FCBONE
; passes over a bad name, so the tail is
; parsed again here. ABI 5 and TNPARSE
; are required: minor 2 is shared with
; another stage's service, so TNPARSE
; is tried on an empty name, which a
; ROM without it refuses as a number
; past its table.

START:
  ld sp,STKTOP   ; DIR.COM's own stack
  ld hl,ABITAB   ; the ROM's signature
  ld de,TNATAG   ; TNA and major 5
  ld b,4

ST1:
  ld a,(de)
  cp (hl)        ; byte by byte
  jr nz,NOABI    ; not TEC-OS ABI 5
  inc hl
  inc de
  djnz ST1       ; all four bytes
  ld hl,TNAEND   ; an empty name: a 0
  ld de,CFCB
  call PARSEFCB  ; TNPARSE there?
  jr c,NOABI     ; no: not this system
  call PGFIND    ; the shell's PAGE
  ld hl,TAIL     ; the tail
  call SKIPSP    ; to the operand
  jp DIRGO       ; the listing

NOABI:
  ld de,NOABIM
  call PUTS      ; not this system
  jp WBOOT

TNATAG: DB "TNA",5
TNAEND: DB 0

NOABIM:
  DB "DIR.COM needs TEC-OS"
  DB CR,LF,'$'

; PGADR = the PAGE entry of the shell
; that holds the hook, or 0 for none.
; TNSHELL with HL=0 returns its table,
; which goes straight back. Changes all.

PGFIND:
  ld hl,0        ; the bare prompt
  ld c,TNSHELL
  call ABICALL   ; HL = the shell's
  ld (PGADR),hl  ; 0: no shell
  ld a,h
  or l
  ret z          ; no shell holds it
  ld c,TNSHELL
  call ABICALL   ; the table back
  ld hl,(PGADR)  ; the table
  inc hl
  inc hl         ; its second word
  ld e,(hl)
  inc hl
  ld d,(hl)      ; DE = PAGE
  ld (PGADR),de
  ret

; A row break, CR then LF, through the
; shell's PAGE, or printed with no
; shell. Carry: the listing stopped,
; and after ^C the shell has dropped
; the rest of the line. Changes AF, DE
; and HL, and BC on a pause.

LSTNL:
  ld e,CR        ; CR first
  call LSTPUT
  ret c          ; stopped at [more]
  ld e,LF        ; then LF

LSTPUT:
  ld hl,(PGADR)  ; the shell's PAGE
  ld a,h
  or l
  jr z,LSTP0     ; no shell: plain
  jp (hl)        ; PAGE: E, carry stops

LSTP0:
  call PUTC
  or a           ; never stops
  ret

; Drive A as d:NAME, the label of the
; volume on that drive trimmed, found by
; TNDESC from index 0. A drive past D:,
; or with no volume found, has no
; label. Changes all.

DRVLBL:
  ld d,a         ; the drive
  call PUTDRV
  ld a,d
  cp 4
  ret nc         ; past D:
  ld e,0         ; from index 0

DL1:
  push de        ; drive and index
  ld hl,CFCB     ; its 32 bytes
  ld c,TNDESC    ; describe it
  call ABICALL
  pop de         ; D the drive again
  ret c          ; past the last
  ld a,(DSDRV)   ; its drive, or FFh
  cp d
  jr z,DL2       ; on this drive
  inc e          ; the next index
  jr DL1

DL2:
  ld hl,DSLBL    ; its label
  ld b,11

; B bytes at HL, each masked to seven
; bits, with the spaces left out.

PUTTRIM:
  ld a,(hl)      ; the next byte
  and $7F
  cp SPACE       ; a space?
  jr z,PTSK      ; left out
  ld e,a
  call PUTC      ; print it

PTSK:
  inc hl         ; on through the name
  djnz PUTTRIM
  ret

; Drive A as its letter and a colon.
; Keeps D.

PUTDRV:
  add a,'A'
  ld e,a
  call PUTC      ; the letter
  ld e,':'

; E through BDOS 2, keeping BC, DE and
; HL.

PUTC:
  push bc
  push hl        ; kept over BDOS
  push de        ; and DE
  ld c,2         ; 2: output E
  call BDOS
  pop de         ; DE, HL and BC back
  pop hl
  pop bc
  ret

; CR and LF. Keeps BC and HL.

CRLF:
  ld e,CR        ; a carriage return
  call PUTC
  ld e,LF        ; then a line feed
  jr PUTC

; The dollar-ended string at DE.

PUTS:
  ld c,9         ; 9: output to $
  jp BDOS

; Past spaces at HL. A is the byte.

SKIPSP:
  ld a,(hl)      ; the byte
  cp SPACE
  ret nz         ; not a space
  inc hl         ; past it
  jr SKIPSP

; Refuse text after the name.

ENDCHK:
  call SKIPSP    ; past spaces
  or a
  ret z          ; the tail's end

; The shell's refusal of a built-in, as
; DIR was one: DIR? with FF00h.

BADW:
  ld de,BADMSG   ; DIR?
  call PUTS

; FF00h, then warm boot: the next prompt
; is the shell's, after a blank line.

FAILED:
  ld de,FAILCODE
  ld c,108       ; 108: set the code
  call BDOS

; Code 0, which the CCP set when it took
; the line: warm boot.

BDONE:
  jp WBOOT

; A message for a failure, its line and
; FF00h.

ERRMSG:
  call PUTS      ; the message
  call CRLF
  jr FAILED

BADMSG: DB "DIR?",CR,LF,'$'

; BDOS by the byte after the CALL: the
; function times two, with bit 0 the
; FCB, 0 FCBONE and 1 CFCB.

DOSSEQ:
  ex (sp),hl     ; HL: after CALL
  ld c,(hl)      ; the byte after CALL
  inc hl         ; past the byte
  ex (sp),hl     ; return past it
  srl c          ; C = the function
  ld de,FCBONE   ; bit 0 clear
  jr nc,DOSGO    ; bit 0 clear
  ld de,CFCB     ; bit 0 set

DOSGO:
  jp BDOS

; The name at HL into the FCB at DE, by
; the ROM's parser: carry for a bad name
; or drive, and HL at the delimiter.
; Changes AF, BC and DE.

PARSEFCB:
  ld c,TNPARSE
  jp ABICALL     ; the CCP's parser

%INCLUDE "dirsize.asm"

IMGEND:

; RAM after the image, not in the file.
; CFCB is the pattern and then TNDESC's
; descriptor; PGADR the shell's PAGE.
; DIR: DDRV its drive, DSKIP the
; matches consumed, DNUM the files
; shown, DTOT their bytes, NUMV a
; 24-bit number, DIGB its digits, DPASS
; its pass, DRST set to begin the search
; again, DFAST the table mode, HMAP the
; marked names. The stack is 64 bytes
; under STKTOP, and the table starts at
; TBASE, the next page.

CFCB      EQU   IMGEND
CFEX      EQU   CFCB+12
DSDRV     EQU   CFCB+14
DSLBL     EQU   CFCB+16
PGADR     EQU   CFCB+36
DDRV      EQU   PGADR+2
DSKIP     EQU   DDRV+1
DNUM      EQU   DSKIP+2
DTOT      EQU   DNUM+2
NUMV      EQU   DTOT+3
DIGB      EQU   NUMV+3
DPASS     EQU   DIGB+9
DRST      EQU   DPASS+1
DFAST     EQU   DRST+1
HMAP      EQU   DFAST+1
STKBOT    EQU   HMAP+16
STKTOP    EQU   STKBOT+64
TBASE     EQU   ((STKTOP+255)/256)*256

; Private transient header, bucket heads
; and nodes, from TBASE, the page after
; DIR.COM's own. Each node has key[11],
; max[3], next[2]. DNEXT is derived from
; count at lookup, not retained between
; commands.

DCOUNT EQU TBASE
DNEXT  EQU TBASE+2
DKEY   EQU TBASE+4
DCAND  EQU DKEY+11
DHASH  EQU DCAND+3
DLINK  EQU DHASH+1
DWHIT  EQU DLINK+2
DHEAD  EQU TBASE+$40
DNODE  EQU TBASE+$140
DLIMIT EQU TBASE+$2140
