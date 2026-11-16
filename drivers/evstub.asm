; EVICT.SVC, a sizing prototype, never
; run: a resident that stays when the
; services installed after it are
; evicted. It must be installed first.
; EVICT.SVC command enters it: it notes
; the services below it, takes the
; shell hook and feeds the ROM an
; UNLOAD line for each, then the
; command, then a line that brings
; each back, oldest first. A warm-boot
; hook takes the shell hook again
; while lines are left, since a shell
; coming back claims it.

%INCLUDE "../src/abi.inc"

BDOS EQU $0005
DEFDMA EQU $0080
SPACE EQU 32
EVMAX EQU 4

  ORG $0100

HDR: DB 'D',SVCFMT,0,1
  DW 0,0,XTRA,0
  DB 0,0,0
  DW 0
  DB "EVICT   "

EXREC: DB "EX",1
EXRDY: DB 2
  DW 41
EXNAM: DS 8,' '
  DB 0,1

ENTRY0:
  jr ENTRY

TABLE: DW LINE,PAGE,HREC,HSTO

INIT:
  ld h,b
  ld l,c
  ld de,EXNAM
  ld bc,8
  ldir
  xor a
  ld (LEFT),a
  ld (BACK),a
  ld hl,EXRDY
  set 0,(hl)
  ld hl,0
  xor a
  ret

; Refuse while lines are left.

REMOVE:
  ld hl,(LEFT)   ; LEFT and BACK
  ld a,h
  or l
  scf
  ret nz
  ld hl,EXRDY
  res 0,(hl)
  xor a
  ret

; The command's tail is kept, the
; services below are counted and named,
; the lowest last, and the hooks go in.

ENTRY:
  ld hl,DEFDMA
  ld c,(hl)
  ld b,0
  inc hl
  ld de,CMD
  ldir
  xor a
  ld (de),a
  ld a,($0007)   ; the lowest owner
  ld b,0
  ld de,NAMES

EN1:
  cp HIGH(HDR)
  jr z,EN3       ; this resident
  ld h,a
  ld l,3
  bit 0,(hl)
  ret z          ; one will not go
  ld a,b
  cp EVMAX
  ret z          ; too many
  push bc
  ld l,17
  ld bc,8
  ldir           ; its name
  pop bc
  inc b
  ld l,8
  ld a,(hl)      ; the next owner
  jr EN1

EN3:
  ld a,b
  ld (LEFT),a
  ld (BACK),a
  ld hl,($0001)  ; the warm boot JP
  inc hl
  ld e,(hl)
  inc hl
  ld d,(hl)
  ld (OLDWB),de
  ld de,WBHOOK
  ld (hl),d
  dec hl
  ld (hl),e

; Take the shell hook, keeping the
; table it replaces unless it is ours.

CLAIM:
  ld hl,TABLE
  ld c,TNSHELL
  call ABICALL
  ret c
  ld de,TABLE
  or a
  sbc hl,de
  ret z
  add hl,de
  ld (PREV),hl
  ret

WBHOOK:
  ld hl,(LEFT)
  ld a,h
  or l
  call nz,CLAIM
  ld hl,(OLDWB)
  jp (hl)

; The next line at DE: UNLOAD while
; services are left to go, then the
; command, then A:NAME.SVC for each,
; the last named first, with origin 1.
; With none left the hooks come out.

LINE:
  ld hl,LEFT
  ld a,(hl)
  or a
  jr z,LN2
  dec (hl)
  jr nz,LN1
  inc hl
  set 7,(hl)     ; the command next

LN1:
  ld hl,UNL
  jr COPY

LN2:
  inc hl         ; BACK
  bit 7,(hl)
  jr z,LN3
  res 7,(hl)
  ld hl,CMD
  jr COPY

LN3:
  ld a,(hl)
  or a
  jr z,LN5       ; all back
  dec (hl)
  dec a
  add a,a
  add a,a
  add a,a
  ld c,a
  ld b,0
  ld hl,NAMES
  add hl,bc
  ex de,hl
  ld (hl),'A'
  inc hl
  ld (hl),':'
  inc hl
  ex de,hl
  ld b,8

LN4:
  ld a,(hl)
  cp SPACE
  jr z,LN4E
  ld (de),a
  inc de
  inc hl
  djnz LN4

LN4E:
  ld hl,TYP
  call COPY
  ld a,1
  ret

LN5:
  ld (de),a      ; an empty line
  ld hl,(OLDWB)
  ex de,hl
  ld hl,($0001)
  inc hl
  ld (hl),e
  inc hl
  ld (hl),d
  ld hl,(PREV)
  ld c,TNSHELL
  call ABICALL
  xor a
  ret

; The zero-ended text at HL to DE.
; Returns A = 0.

COPY:
  ld a,(hl)
  ld (de),a
  inc hl
  inc de
  or a
  jr nz,COPY
  ret

; The pager prints the byte, and there
; is no history.

PAGE:
  push bc
  push hl
  ld c,2
  call BDOS
  pop hl
  pop bc
  or a
  ret

HREC:
  scf

HSTO:
  ret

UNL: DB "UNLOAD",0
TYP: DB ".SVC",0

IMGEND:

LEFT EQU IMGEND
BACK EQU LEFT+1
OLDWB EQU BACK+1
PREV EQU OLDWB+2
NAMES EQU PREV+2
CMD EQU NAMES+EVMAX*8
XEND EQU CMD+128
XTRA EQU XEND-IMGEND
