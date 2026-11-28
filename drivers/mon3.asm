; MON3.SVC: a MON-3 session on Tecos.
; MON3.SVC installs it and gives a
; MON3> line: LOAD name.BIN [addr],
; GO [addr] and EXIT. A loaded program
; finds MON-3's restarts, variables and
; stack where MON-3 keeps them. The
; monitor, its buffers and its stack
; stay in these pages, above anything a
; MON-3 program may use. The session's
; page zero and exits: docs/mon3.md.

%INCLUDE "../src/abi.inc"

TPA_TOP EQU $07  ; the TPA's top page
IOBYTE EQU $0003
LATCH EQU LATCHV
KEYPAD EQU $00   ; keypad encoder
DIGITS EQU $01   ; digits, speaker
SEGMENTS EQU $02    ; segments
SYS_IN EQU $03   ; key-down bit 6
LCD_CMD EQU LCDCMD
LCD_DATA EQU LCDDAT
TX_IDLE EQU $40  ; serial idle bit
MATRIX EQU $FE   ; the matrix, joystick
LED_ROW EQU $05  ; the 8x8 row select
LED_RED EQU $06  ; and its red, green
LED_GRN EQU $F8  ; and blue columns
LED_BLUE EQU $F9

; MON-3's own addresses.

MON3_SP EQU $0880   ; its stack top
DISP_BUF EQU $0880  ; the digits' buffer
DEFS_AT EQU $0886   ; defaults go here
KEY_BUFF EQU $0889
KEYPRESS EQU $088A
KEY_REPT EQU $088B  ; the key's repeat
KEY_BEEP EQU $088D
KEY_2ND EQU $088E   ; the second key
GLCD_TRM EQU $088F  ; the GLCD terminal
USER_INT EQU $0892  ; IM 1 handler
USER_NMI EQU $0894  ; NMI handler
CAPSLOCK EQU $089C  ; Caps Lock
SYS_MODE EQU $089D  ; latch copy
PROTMODE EQU $089E
EXP_MODE EQU $089F  ; EXPAND's setting
RND_SEED EQU $08B0  ; the random seed
BAUD EQU $08B1   ; the serial bit time
DUMP_END EQU $08C2  ; a dump's end
DUMP_ROW EQU $0900  ; a dump's line

; The latch bits GO takes from SYS_MODE:
; PROTECT and CAPS. EXPAND and the bank
; would hide these pages and Tecos's
; cache, and the overlay page zero.

GO_KEEP EQU $82
OVL_OFF EQU $01  ; overlay off

; Page zero bytes a session uses.

STUB EQU $0041   ; latch stub
GO_RET EQU $0049    ; GO's return
NMI_RETN EQU $004E  ; a RETN
NMI_VEC EQU $0066

  ORG $0100

; Removable, no dependencies, no claims,
; and no use of the ROM's stacks. The
; entry runs from CSTKTOP as a
; transient does, then on its own.
; The loader writes a JP to the BDOS at
; the header's start, so the service
; calls the BDOS there: a program that
; damages 0005h cannot misdirect it.

Bdos:
Header: DB 'D',SVCFMT,0,1
  DW 0,0,0,0
  DB 0,0,0
  DW 0
  DB "MON3    "

; The execution record, version 1. Its
; entry is an offset from Header, here
; 41: the JP below. Bit 1: enter on
; install. init fills the name and
; sets bit 0, ready.

ExecRec: DB "EX",1
ExState: DB 2
  DW 41
ExecName: DS 8,' '
  DB 0,1

entryJp:
  jp entry

; BC points at the eight-byte name the
; loader read the file by. Keep it in
; the record and set ready last.
; Returns no records: HL=0, A=0, NC.
; Clobbers BC and DE.

init:
  ld h,b
  ld l,c         ; HL = the name
  ld de,ExecName
  ld bc,8        ; into the record
  ldir
  ld hl,ExState
  set 0,(hl)     ; ready, bit 1 kept
  ld hl,0        ; no records
  xor a          ; A=0 and NC
  ret

; Not ready, and the warm-boot hook out
; if an exit left it. Returns A=0, NC,
; by UNHOOK. Clobbers DE and HL.

remove:
  ld hl,ExState
  res 0,(hl)     ; not ready first
  jp unhook

; The execution entry, from the CCP as
; a transient, or called by a program.
; A second entry, or a restart slot
; that holds a JP, is refused on the
; caller's stack with nothing changed.
; Otherwise save page zero's bytes,
; take them and give the MON3> line.

entry:
  call active    ; Z: in a session
  ld de,MsgBusy  ; MON3 active
  jr z,.refuse   ; so refuse it
  call unhook    ; a stale hook out
  ld hl,$0008    ; RST 08h's slot
  ld b,6         ; 08h to 30h

.slots:
  ld a,(hl)
  cp $C3         ; a kept JP holds it
  jr z,.held     ; so refuse
  ld a,l
  add a,8        ; the next slot
  ld l,a
  djnz .slots    ; six slots
  ld sp,StackTop    ; our own stack
  or a           ; NC: save
  call zeroCopy  ; page zero saved
  call forms     ; page zero taken
  call workInit  ; MON-3's variables
  call hookIn    ; warm boot hooked
  ld a,(Int38)
  or a           ; 0038h ours?
  ld de,MsgNoInt
  call z,print   ; held: say so
  ld a,(Damage)
  or a           ; damaged before?
  call nz,warnSum   ; then say so again
  jp prompt

; Name the held slot. Its digits go
; out by BDOS 2, so a refusal leaves
; these pages as they were.

.held:
  ld a,l
  push af        ; the slot
  ld de,MsgRst
  call print     ; "RST "
  pop af
  push af        ; for the low digit
  rrca
  rrca
  rrca
  rrca           ; the high digit
  call putDigit
  pop af
  call putDigit  ; the low digit
  ld de,MsgHeld

.refuse:
  call print     ; the reason
  ld de,0-256    ; FF00h: failed
  ld c,108       ; the return code
  call Bdos
  ret            ; to the caller

; Print the $-ended string at DE.

print:
  ld c,9         ; print string
  jp Bdos

; Print A's low four bits as a hex
; digit.

putDigit:
  call hexChar
  ld e,a         ; its character
  ld c,2         ; console out
  jp Bdos

; Z when slot 0010h holds this session's
; form: PUSH HL, then LD HL,rst10. Every
; warm boot sweeps the form away, so
; this is the session's one flag.
; Clobbers A and HL.

active:
  ld a,($0010)
  cp $E5         ; PUSH HL
  ret nz         ; NZ: no form
  ld hl,($0012)  ; the form's target
  ld a,l
  cp LOW(rst10)
  ret nz         ; another's form
  ld a,h
  cp HIGH(rst10)    ; Z: ours
  ret

; Write the session's page zero. 0038h
; is taken only from its default EI or
; our own form. Clobbers AF, BC, DE
; and HL.

forms:
  ld hl,RstTable    ; the handlers
  ld de,$0008    ; from RST 08h
  ld b,6         ; 08h to 30h

.slot:
  call form
  djnz .slot     ; each slot's form
  ld a,($0038)
  cp $FB         ; the default EI
  jr z,.take38
  cp $E5         ; or a form
  ld a,0         ; INT38: not ours
  jr nz,.own38   ; held: leave it

.take38:
  call form      ; HL at rst38's word
  ld a,1         ; INT38: ours

.own38:
  ld (Int38),a
  ld hl,stubCode    ; 0041h-004Fh
  ld de,STUB
  ld bc,STUB_LEN
  ldir
  ld hl,nmiCode  ; B is 0
  ld de,NMI_VEC  ; MON-3's NMI code
  ld c,6
  ldir
  ret

; One form at DE: PUSH HL; LD HL,nn;
; JP 0041h; a zero. HL is at the word
; nn and steps past it. DE steps to the
; next slot. Keeps B and C.

form:
  ld a,$E5       ; PUSH HL
  ld (de),a
  inc de
  ld a,$21       ; LD HL,nn
  ld (de),a
  inc de
  ldi            ; the handler
  ldi            ; its high byte
  inc bc
  inc bc         ; LDI's count back
  ld a,$C3       ; JP 0041h
  ld (de),a
  inc de
  ld a,LOW(STUB)
  ld (de),a      ; its low byte
  inc de
  xor a
  ld (de),a      ; its high byte
  inc de
  ld (de),a      ; the eighth byte
  inc de
  ret

RstTable: DW rst08,rst10,rst18,rst20
  DW rst28,rst30,rst38

; 0041h: put the latch back from its
; shadow, so EXPAND 0 is in view before
; these pages run, then on to HL.
; 0049h: GO's return address.
; 004Eh: the default NMI handler.

stubCode:
  push af
  ld a,(LATCH)   ; the shadow
  out (SYSLAT),a
  pop af
  jp (hl)        ; to the handler
  DB $21         ; LD HL,progRet
  DW progRet
  DB $18,$F3     ; JR 0041h
  DB $ED,$45     ; RETN
STUB_LEN EQU $-stubCode

; MON-3's NMI entry, copied to 0066h.

nmiCode:
  push hl
  ld hl,(USER_NMI)  ; the user's handler
  ex (sp),hl     ; on the stack
  ret            ; and run

; MON-3's variables, where MON-3 keeps
; them, and its graphics workspace.
; Nothing is runnable. Clobbers AF, BC,
; DE and HL.

workInit:
  ld hl,RomSig   ; MON3.1G, 2025.16
  ld de,$0800    ; at ROMSIG
  ld bc,16
  ldir
  ld hl,Defaults    ; the defaults
  ld de,DEFS_AT  ; from 0886h
  ld bc,DEFS_LEN
  ldir
  ld hl,justReti
  ld (USER_INT),hl  ; a RETI, here
  ld hl,NMI_RETN
  ld (USER_NMI),hl  ; the RETN at 004Eh
  ld a,(LATCH)
  ld (SYS_MODE),a   ; the latch's copy
  xor a
  ld (PROTMODE),a   ; no PROTECT
  ld (PROTMODE+1),a
  ld (Runnable),a   ; nothing to run
  call gWork     ; and a clear GBUF
  ld hl,$001B    ; 4800 baud, as MON-3
  ld (BAUD),hl   ; sets it with no RTC
  ld a,r
  ld (RND_SEED),a   ; seeded from R
  ret

; ROMSIG as MON-3 writes it: its name
; and its release.

RomSig: DB "MON3.1G",0
Release: DB "2025.16",0

; MON-3's defaults, 0886h-089Ch.

Defaults:
  DW $4000
  DB $08,0,$20,0,0,0,0,0
  DW $4000,0,0
  DB 0,0,0
  DW 0
  DB $FF,0
DEFS_LEN EQU $-Defaults

justReti:
  reti

; The command line. Print MON3>, take a
; line by BDOS 10, make it upper case,
; and run LOAD, GO or EXIT with HL at
; the operand and Z if there is none.
; Anything else prints a question mark.
; Runs on this service's own stack.

prompt:
  ld sp,StackTop    ; our own stack
  ld de,MsgMon3
  call print     ; MON3>
  ld de,LineBuf  ; 40 characters
  ld c,10        ; read a line
  call Bdos
  ld hl,LineBuf+1
  ld b,(hl)      ; its length
  inc b          ; and one for the end

.upper:
  inc hl
  dec b
  jr z,.ended    ; the line's end
  ld a,(hl)
  cp 'a'
  jr c,.upper    ; below a
  cp 'z'+1
  jr nc,.upper   ; not a letter
  sub $20        ; a to A
  ld (hl),a      ; upper case
  jr .upper

.ended:
  ld (hl),0      ; end the line
  ld de,MsgCrLf
  call print     ; a new line
  ld hl,LineBuf+2
  call skip      ; the first word
  jr z,prompt    ; an empty line
  ld de,Commands    ; the keywords

.keyword:
  ld a,(de)
  or a
  jr z,bad       ; the table's end
  push hl        ; the line's start
  call word
  jr z,.found    ; this keyword
  pop hl
  inc de
  inc de         ; past its handler
  jr .keyword

.found:
  pop af         ; drop the start
  ex de,hl       ; HL at the word
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a         ; the handler
  ex de,hl
  call skip      ; Z: no operand
  push de        ; its address
  ret            ; to the handler

bad:
  ld de,MsgWhat
  call print     ; a question mark
  jr prompt

; Match the keyword at DE, zero-ended,
; with the word at HL. Z: DE is at the
; handler's word and HL past the word.
; NZ: DE is past the keyword's zero.
; Clobbers A.

word:
  ld a,(de)
  inc de
  or a
  jr z,.ends     ; the keyword's end
  cp (hl)        ; the line's letter
  inc hl
  jr z,word      ; equal so far

.rest:
  ld a,(de)      ; skip the rest
  inc de
  or a
  jr nz,.rest

.nomatch:
  or $FF         ; NZ: no match
  ret

.ends:
  ld a,(hl)
  cp ' '+1       ; the word ends too?
  jr nc,.nomatch
  xor a          ; Z: a match
  ret

Commands:
  DB "LOAD",0
  DW cmdLoad
  DB "GO",0
  DW cmdGo
  DB "EXIT",0
  DW cmdExit
  DB 0

; Skip spaces at HL. Returns A = the
; next byte, Z at the line's end, NC.

skip:
  ld a,(hl)
  cp ' '
  jr nz,.done    ; not a space
  inc hl
  jr skip

.done:
  or a           ; Z at the end
  ret

; LOAD name.BIN [addr]: whole records,
; at addr or 4000h. The size is read
; first, and a file that would not fit
; is refused with nothing written.
; Nothing is runnable until it ends
; well. A read error ends the session.
; A .HEX file goes to the HEX loader.

cmdLoad:
  xor a
  ld (Runnable),a   ; nothing runnable
  ld a,(Damage)
  or a           ; the tables damaged?
  jr z,.name
  call warnSum   ; then no load
  jp bad

.name:
  call fcbParse  ; the name
  jp c,bad       ; no name
  push hl        ; the text
  ld hl,Fcb+9
  ld de,HexType
  ld b,3
  call strCmp    ; Z: the type is HEX
  pop hl
  jp z,loadHex
  ld de,$4000    ; the default
  call skip
  call nz,hexWord   ; an address
  jp c,bad       ; a bad one
  ld (LoadAt),de
  call open
  jr z,loadFail  ; not found
  ld de,Fcb
  ld c,35        ; size in records
  call Bdos
  ld hl,(Fcb+33)
  ld a,(Fcb+35)  ; the size's top
  or a
  jr nz,loadFail    ; over 64K records
  ld a,h
  or l
  jr z,loadFail  ; an empty file
  ld a,h
  cp $02
  jr nc,loadFail    ; 64K or more
  ld b,7         ; 128 bytes each

.bytes:
  add hl,hl      ; records to bytes
  djnz .bytes
  ld de,(LoadAt)    ; the start
  call range
  jr c,loadFail  ; it would not fit
  ld hl,(LoadAt)

.read:
  push hl        ; the target
  ex de,hl
  ld c,26        ; DMA = the target
  call Bdos
  ld de,Fcb
  ld c,20        ; read a record
  call Bdos
  pop hl
  or a           ; 0: a record read
  jr nz,.end     ; the end, or bad
  ld de,128
  add hl,de      ; the next record
  jr .read

.end:
  dec a          ; 1 is the end
  jr nz,loadFail
  ld hl,(LoadAt)

; A good load at HL: runnable now.

loadGood:
  ld (RunAt),hl  ; for GO
  ld a,1
  ld (Runnable),a   ; runnable now
  call dmaReset
  jp prompt

loadFail:
  call dmaReset
  jp bad         ; ? and nothing run

; Open FCB. Z if there is no such file.

open:
  ld de,Fcb
  ld c,15        ; open
  call Bdos
  inc a          ; FFh: none
  ret

; Carry unless DE to DE+HL-1 lies from
; 0100h to below the TPA's top page,
; clear of 0800h-08FFh, MON-3's stack
; and variables. HL ends at DE+HL.

range:
  ld a,d
  cp 1
  ret c          ; page zero
  add hl,de      ; HL = the end
  ret c          ; past FFFFh
  ld a,(TPA_TOP)    ; the TPA's top
  cp h
  ret c          ; above it
  jr nz,.stack
  ld a,l
  cp 1
  ccf
  ret c          ; into that page

.stack:
  ld a,d
  cp $08
  jr z,.outside  ; starts in 08xxh
  ret nc         ; starts above it
  ld a,h
  cp $08
  ccf
  ret nc         ; ends below it
  jr nz,.outside    ; runs through it
  ld a,l
  cp 1
  ccf            ; ends inside it
  ret

.outside:
  scf
  ret

HexType: DB "HEX"

; Put the DMA back at 0080h.

dmaReset:
  ld de,$0080
  ld c,26
  jp Bdos

; GO [addr]: the last good load, or the
; address given, run as MON-3's GO runs
; it (docs/mon3.md). The cache is
; flushed first: if a write fails, GO
; is refused and the data stays queued.

cmdGo:
  jr z,.last     ; no address
  call hexWord
  jp c,bad
  ex de,hl       ; HL = the address
  jr .run

.last:
  ld a,(Runnable)
  or a
  jp z,bad       ; no good load
  ld hl,(RunAt)

.run:
  push hl
  ld c,48        ; flush
  call Bdos
  or a           ; a write failed?
  jp nz,bad      ; then no program
  call checksum  ; the tables' sum
  ld (SumAtGo),de   ; for the return
  ld b,$01       ; clear the LCD
  call cmdToLcd
  ld b,$D6       ; row 4, column 3
  call cmdToLcd
  ld hl,MsgRun
  call strToLcd  ; "Running at: "
  pop hl
  push hl        ; the address again
  ld de,HexText
  call hlToStr   ; the address
  xor a
  ld (de),a      ; end the digits
  ld hl,HexText
  call strToLcd  ; on the LCD
  ld a,(KEY_BEEP)
  or a
  call z,beep    ; unless it is off
  ld a,(SYS_MODE)
  ld b,a         ; B: SYS_MODE
  ld a,(PROTMODE)
  or b           ; PROTECT if asked
  and GO_KEEP    ; no EXPAND or bank
  or OVL_OFF     ; and the overlay off
  ld (LATCH),a
  out (SYSLAT),a
  ld a,$FF
  ld (KEY_BUFF),a   ; no key held
  ld c,0
  pop hl         ; the program
  ld sp,MON3_SP  ; MON-3's stack
  ld de,GO_RET
  push de        ; RET comes back
  jp (hl)

; Call 2, preInit: MON-3's restart is a
; new workspace here, then the return.

preInit:
  di
  ld sp,StackTop    ; our own stack
  call sumCheck  ; before Runnable goes
  call workInit  ; the workspace anew
  jr returned

; A program's RET lands here, through
; the latch stub. Every drive's vector
; is rebuilt at its next use, the GLCD
; console's panel is set again, and a
; form feed gives the console back. A
; warning or a breakpoint's address
; follows it, so that a video console
; still shows it at MON3>. Before the
; form feed, the keys must be up.

progRet:
  di             ; interrupts off
  ld sp,StackTop    ; our own stack
  call sumCheck  ; before any write

returned:
  ld a,(LATCH)
  and $FD        ; PROTECT off
  ld (LATCH),a
  out (SYSLAT),a
  ld a,TX_IDLE
  out (DIGITS),a    ; TX idle, no digit
  call forms     ; page zero again
  call resetDrv  ; and the vectors
  call gRestore  ; the GLCD's modes

; Only CON: on CRT: or UC1: reads a
; matrix key into a line; a poll may
; move CON: to TTY:, so ask each pass.
; KBLAST keeps a held key off the line
; and lets the Viewer let go. MON3>
; waits until every key is up.

keyUp:
  ld a,(IOBYTE)
  rrca           ; CRT: or UC1:?
  jr nc,.up      ; no: no wait
  call scanKeys  ; keypad or matrix
  call matScan   ; KBLAST, fresh
  ld a,(KBLAST)
  inc a          ; FFh: no matrix key
  jr nz,.poll
  ld a,(KEYPRESS)
  or a           ; NZ: no keypad key
  jr nz,.up

.poll:
  ld e,$FF       ; poll, and drop it
  ld c,6
  call Bdos
  jr keyUp

.up:
  ld de,MsgFeed
  call print     ; a form feed
  ld hl,Damage
  ld a,(hl)
  cp 2           ; damaged just now?
  jr nz,.brk
  dec (hl)       ; 1: said, for good
  call warnSum

.brk:
  ld hl,BrkFlag
  ld a,(hl)
  or a           ; from RST 30h?
  jp z,prompt    ; no
  ld (hl),0      ; said once
  ld de,MsgBrk
  call print     ; "BRK "
  ld de,HexText
  call print     ; the address
  ld de,MsgCrLf
  call print
  jp prompt

; DE = the sum, modulo 65,536, of the
; service from its header to SUMEND,
; and of the RAM BIOS table's 51 bytes
; with the hook linked. Each is fixed
; while a program runs. Clobbers A, BC
; and HL.

checksum:
  ld hl,($0001)  ; the warm boot's JP
  dec hl
  dec hl
  dec hl         ; the table's start
  ld bc,51
  ld de,0
  call .byte     ; the table
  ld hl,Header
  ld bc,SUM_LEN  ; to SUMEND

.byte:
  ld a,(hl)
  add a,e        ; a byte in
  ld e,a
  jr nc,.next
  inc d          ; and its carry

.next:
  cpi            ; HL on, BC down
  jp pe,.byte    ; until BC is 0
  ret

; At a program's return: the sum taken
; again. A difference sets Damage to 2,
; and the return prints the warning
; after its form feed. Clobbers AF, BC,
; DE and HL.

sumCheck:
  call checksum
  ld hl,(SumAtGo)
  or a
  sbc hl,de      ; Z: as at GO
  ret z
  ld a,2
  ld (Damage),a  ; damaged, for good
  ret

; Print the warning.

warnSum:
  ld de,MsgTable
  jp print       ; the warning

; BDOS 37 for every drive.

resetDrv:
  ld de,0-1
  ld c,37
  jp Bdos

; EXIT: as the lowest resident, set
; EXRMV so the warm boot removes the
; service; otherwise say it stays. A
; damaged table keeps it in, quietly,
; so LOAD stays refused until reset.
; Then interrupts off, IM 1, the
; drives reset, page zero as it was,
; the hook out and the devices idle,
; and the real warm boot.

cmdExit:
  ld a,(Damage)  ; tables damaged?
  or a           ; then stay, so LOAD
  jr nz,.keep    ; is refused till reset
  ld a,($0007)   ; the lowest's page
  cp HIGH(Header)   ; this service's?
  jr z,.leave    ; yes: it can go
  ld de,MsgStay
  call print     ; no: say it stays
  jr .keep       ; and leave EXRMV clear

.leave:
  ld hl,ExState  ; EXRMV in its state:
  set EXRMV,(hl)

.keep:
  di
  im 1
  call resetDrv  ; the drives reset
  call restore   ; page zero back
  call unhook    ; the hook out
  xor a
  out (SEGMENTS),a  ; segments off
  out ($05),a
  out ($06),a    ; the LED matrix
  ld a,TX_IDLE
  out (DIGITS),a    ; TX idle
  jp 0           ; the real warm boot

; Put ZeroTab's ranges back from SaveIo.
; Clobbers AF, BC, DE and HL.

restore:
  scf            ; CY: put back

zeroCopy:
  ld hl,ZeroTab
  ld de,SaveIo   ; NC: out, CY: back

.range:
  ld c,(hl)      ; the length
  inc c
  dec c
  ret z          ; the end
  inc hl
  ld a,(hl)
  inc hl
  push hl        ; at its top
  ld h,(hl)
  ld l,a         ; the range
  ld b,0
  jr nc,.copy
  ex de,hl       ; CY: into page zero

.copy:
  ldir
  jr nc,.next
  ex de,hl

.next:
  pop hl         ; the table
  inc hl
  jr .range

ZeroTab:
  DB 2
  DW IOBYTE
  DB $38
  DW $0008
  DB 15
  DW STUB
  DB 6
  DW NMI_VEC
  DB 0

; The warm-boot hook, on the RAM BIOS
; table's warm-boot entry. In a
; session, which slot 0010h tells
; before the sweep runs, it resets the
; drives and gives back what the sweep
; does not. Either way it takes itself
; out and goes on to the entry it
; replaced, so one left by an exit
; that passed it does nothing.

hook:
  di             ; interrupts off
  ld a,($0010)
  cp $E5         ; a form?
  jr nz,.onward  ; no session
  ld hl,($0012)
  ld a,l
  cp LOW(rst10)  ; to our RST 10h?
  jr nz,.onward
  ld a,h
  cp HIGH(rst10)    ; and ours?
  jr nz,.onward
  im 1           ; Tecos's mode
  ld a,TX_IDLE
  out (DIGITS),a    ; TX idle
  ld sp,StackTop    ; our own stack
  call resetDrv  ; vectors rebuilt
  ld hl,SaveIo
  ld de,IOBYTE   ; and the drive
  ld bc,2
  ldir
  ld hl,SaveRst+$30
  ld de,$0038    ; RST 38h's slot
  ld c,8         ; B is 0
  ldir
  ld de,STUB     ; HL is at SaveStub
  ld c,15
  ldir
  ld de,NMI_VEC  ; HL at SaveNmi
  ld c,6
  ldir

.onward:
  ld hl,(HookAt)
  ld a,(OldBoot)    ; its low byte
  ld (hl),a      ; the old target
  inc hl
  ld a,(OldBoot+1)
  ld (hl),a      ; back in the table
  ld hl,(OldBoot)
  jp (hl)        ; and on to it

; Link the hook at the word after the
; JP that 0001h points to, keeping the
; old target. Clobbers DE and HL.

hookIn:
  ld hl,($0001)  ; the JP to the BIOS
  inc hl         ; its target word
  ld (HookAt),hl
  ld e,(hl)
  inc hl
  ld d,(hl)      ; the old target
  ld (OldBoot),de
  ld de,hook
  ld (hl),d      ; ours in its place
  dec hl
  ld (hl),e
  ret

; Take the hook out if the table still
; points at it. Returns A=0, NC.
; Clobbers DE and HL.

unhook:
  ld hl,($0001)  ; the JP to the BIOS
  inc hl
  ld e,(hl)
  inc hl
  ld d,(hl)      ; the target now
  ld a,e
  cp LOW(hook)   ; our hook?
  jr nz,.done
  ld a,d
  cp HIGH(hook)
  jr nz,.done    ; not ours
  ld de,(OldBoot)
  ld (hl),d
  dec hl
  ld (hl),e      ; the old one back

.done:
  xor a          ; A=0 and NC
  ret

; Parse d:name.typ at HL into FCB,
; cleared first. Carry if no name, a
; drive outside A to P, a wildcard, or
; a name over 8 or a type over 3
; characters, so that BDOS 15 never
; sees one. HL ends at the delimiter.
; Clobbers A, BC and DE.

fcbParse:
  ld de,Fcb
  push hl        ; the text
  ld h,d
  ld l,e
  ld (hl),0      ; the drive: default
  inc de
  ld bc,35
  ldir           ; zeros throughout
  ld hl,Fcb+1
  ld b,11

.blank:
  ld (hl),' '    ; a blank name
  inc hl
  djnz .blank
  pop hl         ; the text
  ld a,(hl)
  or a
  scf
  ret z          ; nothing there
  inc hl
  ld a,(hl)      ; the next one
  dec hl
  cp ':'
  jr nz,.name    ; no drive
  ld a,(hl)
  sub 'A'
  cp 16          ; carry: A to P
  ccf
  ret c          ; no such drive
  inc a
  ld (Fcb),a     ; 1 is A:
  inc hl
  inc hl         ; past the colon

.name:
  ld de,Fcb+1
  ld b,8         ; eight characters
  call fcbField  ; the name
  ret c          ; a wildcard
  bit 7,b        ; B below 0: too long
  scf
  ret nz
  ld a,(hl)
  cp '.'
  jr nz,.check   ; no type
  inc hl
  ld de,Fcb+9
  ld b,3         ; three for the type
  call fcbField  ; the type
  ret c          ; a wildcard
  bit 7,b        ; too long
  scf
  ret nz

.check:
  ld a,(Fcb+1)
  cp ' '+1       ; carry: blank
  ret

; Copy a field at HL to DE, B bytes at
; most, to a dot or a space or the end.
; Carry at a ? or *. A longer field is
; read to its end, B going below zero.

fcbField:
  ld a,(hl)
  cp '.'
  ret z          ; the name's end, NC
  cp ' '+1
  ccf
  ret nc         ; the field's end
  cp '?'
  scf
  ret z          ; a wildcard
  cp '*'
  scf
  ret z          ; and the other
  inc hl
  dec b          ; room for it?
  jp m,fcbField  ; no: read past it
  ld (de),a      ; one more in
  inc de
  jr fcbField

%INCLUDE "mon3api.asm"
%INCLUDE "mon3io.asm"
%INCLUDE "mon3hex.asm"
%INCLUDE "mon3gfx.asm"

MsgMon3: DB 13,10,"MON3>$"
MsgCrLf: DB 13,10,'$'
MsgWhat: DB "?",13,10,'$'
MsgFeed: DB 12,'$'
MsgBusy: DB "MON3 active",13,10,'$'
MsgRst: DB "RST $"
MsgHeld: DB " held: UNLOAD or reset"
  DB 13,10,'$'
MsgNoInt: DB "RST 38 held: no"
  DB " interrupts",13,10,'$'
MsgBrk: DB "BRK $"
MsgTable: DB "Tables damaged: EXIT"
  DB " and reset",13,10,'$'
MsgRun: DB "Running at: ",0
MsgStay: DB "MON3 stays installed"
  DB 13,10,'$'

; State. Runnable is nonzero after a
; good load at RunAt. Int38 is nonzero
; when 0038h holds our form. HookAt and
; OldBoot are the hook's word and the
; target it replaced.

Runnable: DB 0
Int38: DB 0
RunAt: DW $4000
LoadAt: DW 0
HookAt: DW 0
OldBoot: DW 0

; Page zero as the session found it:
; IOBYTE and the drive, 0008h-003Fh,
; 0041h-004Fh and 0066h-006Bh.

SaveIo: DS 2
SaveRst: DS $38
SaveStub: DS 15
SaveNmi: DS 6
SumEnd:
SUM_LEN EQU SumEnd-Header

; Not summed: the sum at GO, the flag a
; difference sets, kept until a reset,
; and what the monitor rewrites. BrkFlag
; is nonzero when RST 30h's address
; waits in HexText to be printed.

SumAtGo: DW 0
Damage: DB 0
BrkFlag: DB 0
HexText: DS 5    ; four digits, an end
LineBuf: DB 40   ; BDOS 10's buffer
  DS 42
Fcb: DS 36

; The monitor's stack.

  DS 80
StackTop:

ImageEnd:
