; The program's start at 4000h, where
; MON3's GO runs it. START clears the
; variables, keeps MON3's latch state,
; asks for the card to test and runs the
; checks in CHECKS order. EXIT restores
; the latch through MON3 and returns
; with RST 00h. Interrupts stay off
; except in the INT check.

  ORG $4000

START:
  di             ; TEC-OS's own
                 ; discipline
  ld hl,0        ; the entry SP
  add hl,sp
  ld sp,STKTOP   ; our own stack, which
  push hl        ; the RAM check spares
  ld a,i         ; MON3's I, for EXIT
  push af
  ld hl,VARS     ; the variables zero,
  ld de,VARS+1   ; up to the stack
  ld bc,STACK-VARS-1
  ld (hl),0
  ldir           ; cleared
  pop af
  ld (SAVEI),a   ; kept for EXIT
  pop hl         ; for the header
  ld (ENTSP),hl
  ld a,RSKIP     ; SD3-SD5 not run yet
  ld (S3ST),a
  ld (S4ST),a
  ld (S5ST),a
  call LATGET    ; MON3's latch state
  ld hl,TITLE    ; the title on row 1
  ld a,LROW1
  call LCDROW
  ld hl,HCAPT    ; nothing is sent until
  ld a,LROW4     ; GO, so the log can
  call LCDROW    ; start first
  call GOAD
  jp nz,EXIT     ; AD: leave at once
  call HEADER    ; the first lines
  call RTCPRB    ; the RTC, for SD6
  ld de,HSTART   ; ask for the card
  call ASK
  DB "Fit the card to test, then GO."
  DB " AD exits",0
  jp nz,EXIT     ; AD: leave at once
  ld hl,CHECKS   ; the checks in turn

RUN:
  ld e,(hl)      ; the next check
  inc hl
  ld d,(hl)
  inc hl
  ld a,d         ; 0: the table's end
  or e
  jr z,DONE
  push hl        ; the table's place
  ex de,hl
  call JPHL      ; run the check
  pop hl
  jr RUN

JPHL:
  jp (hl)        ; CALL JPHL calls (HL)

; The summary line, then wait for a key
; so the LCD's totals can be read.

DONE:
  ld hl,RSUM     ; "Done" on row 2
  call BEGIN
  call FIELDS    ; the totals
  DB "SUMMARY pass=",0,FD8
  DW NRES+RPASS
  DB " warn=",0,FD8
  DW NRES+RWARN
  DB " fail=",0,FD8
  DW NRES+RFAIL
  DB " skip=",0,FD8
  DW NRES+RSKIP
  DB 0,0
  call ENDL
  ld de,HDONE    ; any answer leaves
  call ASK
  DB "Done. GO or AD returns to MON3",0

; Put MON3's latch state and I back,
; blank the digits and return to the
; monitor.

EXIT:
  ld a,(SVCAPS)  ; each bit through
  ld c,MSETCAP   ; MON3's set call
  rst $10
  ld a,(SVPRT)   ; PROTECT
  ld c,MSETPRT
  rst $10
  ld a,(SVEXP)   ; EXPAND
  ld c,MSETEXP
  rst $10
  ld a,(SVSHD)   ; SHADOW, as MON3 gave
                 ; it
  ld c,MSETSHD
  rst $10
  ld a,(SAVEI)   ; MON3's I
  ld i,a
  ld a,TXIDLE    ; digits off, TX idle
  out (DIGP),a
  rst $00        ; MON3's reset

; Keep MON3's latch state from its get
; calls, and make LATCHV the latch value
; TEC-OS's SD routines write back. Bit 0
; is measured, 0 if the ROM shows at
; 0000h now, since MON3 may name it
; either way.

LATGET:
  ld c,MGETCAP   ; CAPS
  rst $10
  ld (SVCAPS),a
  ld c,MGETSHD   ; SHADOW, MON3's word
  rst $10
  ld (SVSHD),a
  ld c,MGETPRT   ; PROTECT
  rst $10
  ld (SVPRT),a
  ld c,MGETEXP   ; EXPAND
  rst $10
  ld (SVEXP),a
  call OVCMP     ; 0: the ROM shows,
  ld a,h         ; so bit 0 is 0
  or l
  jr z,LG1
  ld a,LATSHAD   ; else 1

LG1:
  ld b,a         ; then the other bits
  ld a,(SVCAPS)  ; as MON3 gave them
  and LATCAPS
  or b
  ld b,a
  ld a,(SVPRT)   ; PROTECT's bit
  and LATPROT
  or b
  ld b,a
  ld a,(SVEXP)   ; EXPAND's bit
  and LATEXP
  or b
  ld (LATCHV),a  ; the latch as it is
                 ; now
  ret

; The header line, with the version,
; image ID and size, and a note of
; MON3's latch state.

HEADER:
  call FIELDS
  DB "TEC1G-DIAG ",0,FD8
  DW VERNUM
  DB ".",0,FD8
  DW VERNUM+1
  DB " image=",0,0
  ld hl,IMGID    ; the build's image ID
  ld b,8
  call PRHEXN
  ld hl,PROGEND  ; the program's size
  ld de,START
  or a           ; PROGEND - START
  sbc hl,de
  ld (NBLK),hl
  call FIELDS    ; then print it
  DB " bytes=",0,FD16
  DW NBLK
  DB " sp=",0,0
  ld hl,(ENTSP)  ; MON3's SP at GO
  call PRHL
  call ENDL      ; the header's end
  call NOTE      ; MON3's latch state
  DB "mon3",0
  call FIELDS
  DB " caps=",0,FHEX
  DW SVCAPS
  DB " shadow=",0,FHEX
  DW SVSHD
  DB " protect=",0,FHEX
  DW SVPRT
  DB " expand=",0,FHEX
  DW SVEXP
  DB " latch=",0,FHEX
  DW LATCHV
  DB 0,0
  jp ENDL

; The checks in order.

CHECKS:   DW    SHDCHK,SD1,SD2,SD3,SD4
  DW SD5,SD6,SD7,SD8,SD9,RAMCHK,PRTCHK
  DW CLKCHK,VDPCHK,LCDCHK,GLCCHK,RTCCHK
  DW INTCHK,KEYCHK,0

; Each check's record: the hex digit it
; shows, its ID and its LCD title.

RSD1:     DB    1,"SD1",0
  DB "SD1 MISO idle",0
RSD2:     DB    2,"SD2",0,"SD2 init",0
RSD3:     DB    3,"SD3",0,"SD3 margins"
  DB 0
RSD4:     DB    4,"SD4",0
  DB "SD4 CSD and CID",0
RSD5:     DB    5,"SD5",0,"SD5 reads",0
RSD6:     DB    6,"SD6",0
  DB "SD6 read speed",0
RSD7:     DB    7,"SD7",0
  DB "SD7 container",0
RSD8:     DB    8,"SD8",0
  DB "SD8 write test",0
RSD9:     DB    9,"SD9",0
  DB "SD9 card removal",0
RRAM:     DB    10,"RAM",0,"RAM",0
RPRT:     DB    11,"PROT",0,"PROTECT",0
RSHD:     DB    12,"SHAD",0
  DB "Latch bit 0",0
RCLK:     DB    13,"CLK",0,"CPU clock",0
RVDP:     DB    14,"VDP",0,"PICO9918",0
RLCD:     DB    14,"LCD",0,"LCD",0
RGLC:     DB    14,"GLCD",0,"GLCD",0
RRTC:     DB    14,"RTC",0,"DS1302",0
RINT:     DB    15,"INT",0,"Interrupts"
  DB 0
RKEY:     DB    0,"KEYS",0,"Keys",0
RSUM:     DB    0,"SUM",0,"Done",0

; The LCD's title and prompts, and the
; version for the header.

TITLE:    DB    "TEC-1G DIAG ",VERHI+48
  DB ".",VERLO+48,0
HSTART:   DB    "GO=start AD=exit",0
HCAPT:    DB    "Log on? GO=send",0
HDONE:    DB    "GO=exit",0
VERNUM:   DB    VERHI,VERLO

; The image ID, which tools/diag.mjs
; sets after assembly, and QUICK, which
; the emulator test sets for short
; timings.

IMGID:    DB    0,0,0,0,0,0,0,0
QUICK:    DB    0
