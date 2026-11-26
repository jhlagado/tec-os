; MON3.SVC: a MON-3 session on TEC-OS.
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

TPATOP EQU $07   ; the TPA's top page
IOBYTE EQU $0003
LATCH EQU LATCHV
SKEYB EQU $00    ; keypad encoder
SDIG EQU $01     ; digits, speaker
SSEG EQU $02     ; segments
SSYS EQU $03     ; key-down bit 6
LCDI EQU LCDCMD
LCDD EQU LCDDAT
TXI EQU $40      ; serial idle bit
SMATX EQU $FE    ; the matrix, joystick
SLED EQU $05     ; the 8x8 row select
SRED EQU $06     ; and its red, green
SGRN EQU $F8     ; and blue columns
SBLU EQU $F9

; MON-3's own addresses.

MSTK3 EQU $0880  ; its stack top
DISPB EQU $0880  ; the digits' buffer
CEL EQU $0886    ; defaults go here
KBUFF EQU $0889
KPRESS EQU $088A
KREPT EQU $088B  ; the key's repeat
KBEEP EQU $088D
KSEC EQU $088E   ; the second key
GTERM EQU $088F  ; the GLCD terminal
UINT EQU $0892   ; IM 1 handler
UNMI EQU $0894   ; NMI handler
CAPSL EQU $089C  ; Caps Lock
SYSMD EQU $089D  ; latch copy
PROTM EQU $089E
XPNDM EQU $089F  ; EXPAND's setting
RNGSD EQU $08B0  ; the random seed
BAUD EQU $08B1   ; the serial bit time
DATTO EQU $08C2  ; a dump's end
DROW EQU $0900   ; a dump's line

; The latch bits GO takes from SYS_MODE:
; PROTECT and CAPS. EXPAND and the bank
; would hide these pages and TEC-OS's
; cache, and the overlay page zero.

GOKEEP EQU $82
LATSHD EQU $01   ; overlay off

; Page zero bytes a session uses.

STUB EQU $0041   ; latch stub
GORET EQU $0049  ; GO's return
NRETN EQU $004E  ; a RETN
NMIV EQU $0066

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
Hdr: DB 'D',SVCFMT,0,1
  DW 0,0,0,0
  DB 0,0,0
  DW 0
  DB "MON3    "

; The execution record, version 1. Its
; entry is an offset from HDR, here 41:
; the JP below. Bit 1: enter on
; install. INIT fills the name and
; sets bit 0, ready.

ExRec: DB "EX",1
ExRdy: DB 2
  DW 41
ExNam: DS 8,' '
  DB 0,1

entry0:
  jp entry

; BC points at the eight-byte name the
; loader read the file by. Keep it in
; the record and set ready last.
; Returns no records: HL=0, A=0, NC.
; Clobbers BC and DE.

init:
  ld h,b
  ld l,c         ; HL = the name
  ld de,ExNam
  ld bc,8        ; into the record
  ldir
  ld hl,ExRdy
  set 0,(hl)     ; ready, bit 1 kept
  ld hl,0        ; no records
  xor a          ; A=0 and NC
  ret

; Not ready, and the warm-boot hook out
; if an exit left it. Returns A=0, NC,
; by UNHOOK. Clobbers DE and HL.

remove:
  ld hl,ExRdy
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
  ld de,MBusy    ; MON3 active
  jr z,refuse    ; so refuse it
  call unhook    ; a stale hook out
  ld hl,$0008    ; RST 08h's slot
  ld b,6         ; 08h to 30h

ent1:
  ld a,(hl)
  cp $C3         ; a kept JP holds it
  jr z,held      ; so refuse
  ld a,l
  add a,8        ; the next slot
  ld l,a
  djnz ent1      ; six slots
  ld sp,MStk     ; our own stack
  or a           ; NC: save
  call pzCopy    ; page zero saved
  call forms     ; page zero taken
  call wsInit    ; MON-3's variables
  call hookIn    ; warm boot hooked
  ld a,(Int38)
  or a           ; 0038h ours?
  ld de,MNoInt
  call z,print   ; held: say so
  ld a,(Dmg)
  or a           ; damaged before?
  call nz,dWarn  ; then say so again
  jp prompt

; Name the held slot. Its digits go
; out by BDOS 2, so a refusal leaves
; these pages as they were.

held:
  ld a,l
  push af        ; the slot
  ld de,MRst
  call print     ; "RST "
  pop af
  push af        ; for the low digit
  rrca
  rrca
  rrca
  rrca           ; the high digit
  call putN
  pop af
  call putN      ; the low digit
  ld de,MHeld

refuse:
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

putN:
  call hexC
  ld e,a         ; its character
  ld c,2         ; console out
  jp Bdos

; Z when slot 0010h holds this session's
; form: PUSH HL, then LD HL,R10. Every
; warm boot sweeps the form away, so
; this is the session's one flag.
; Clobbers A and HL.

active:
  ld a,($0010)
  cp $E5         ; PUSH HL
  ret nz         ; NZ: no form
  ld hl,($0012)  ; the form's target
  ld a,l
  cp LOW(r10)
  ret nz         ; another's form
  ld a,h
  cp HIGH(r10)   ; Z: ours
  ret

; Write the session's page zero. 0038h
; is taken only from its default EI or
; our own form. Clobbers AF, BC, DE
; and HL.

forms:
  ld hl,RTab     ; the handlers
  ld de,$0008    ; from RST 08h
  ld b,6         ; 08h to 30h

frm1:
  call form
  djnz frm1      ; each slot's form
  ld a,($0038)
  cp $FB         ; the default EI
  jr z,frm2
  cp $E5         ; or a form
  ld a,0         ; INT38: not ours
  jr nz,frm3     ; held: leave it

frm2:
  call form      ; HL at R38's word
  ld a,1         ; INT38: ours

frm3:
  ld (Int38),a
  ld hl,pzCode   ; 0041h-004Fh
  ld de,STUB
  ld bc,PZLEN
  ldir
  ld hl,nmiC     ; B is 0
  ld de,NMIV     ; MON-3's NMI code
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

RTab: DW r08,r10,r18,r20,r28,r30,r38

; 0041h: put the latch back from its
; shadow, so EXPAND 0 is in view before
; these pages run, then on to HL.
; 0049h: GO's return address.
; 004Eh: the default NMI handler.

pzCode:
  push af
  ld a,(LATCH)   ; the shadow
  out (SYSLAT),a
  pop af
  jp (hl)        ; to the handler
  DB $21         ; LD HL,MRET
  DW mRet
  DB $18,$F3     ; JR 0041h
  DB $ED,$45     ; RETN
PZLEN EQU $-pzCode

; MON-3's NMI entry, copied to 0066h.

nmiC:
  push hl
  ld hl,(UNMI)   ; the user's handler
  ex (sp),hl     ; on the stack
  ret            ; and run

; MON-3's variables, where MON-3 keeps
; them, and its graphics workspace.
; Nothing is runnable. Clobbers AF, BC,
; DE and HL.

wsInit:
  ld hl,Sig      ; MON3.1G, 2025.16
  ld de,$0800    ; at ROMSIG
  ld bc,16
  ldir
  ld hl,Defs     ; the defaults
  ld de,CEL      ; from 0886h
  ld bc,DEFLEN
  ldir
  ld hl,retIs
  ld (UINT),hl   ; a RETI, here
  ld hl,NRETN
  ld (UNMI),hl   ; the RETN at 004Eh
  ld a,(LATCH)
  ld (SYSMD),a   ; SYS_MODE: the latch
  xor a
  ld (PROTM),a   ; no PROTECT
  ld (PROTM+1),a
  ld (RunOk),a   ; nothing to run
  call gWs       ; and a clear GBUF
  ld hl,$001B    ; 4800 baud, as MON-3
  ld (BAUD),hl   ; sets it with no RTC
  ld a,r
  ld (RNGSD),a   ; seeded from R
  ret

; ROMSIG as MON-3 writes it: its name
; and its release.

Sig: DB "MON3.1G",0
Vers: DB "2025.16",0

; MON-3's defaults, 0886h-089Ch.

Defs:
  DW $4000
  DB $08,0,$20,0,0,0,0,0
  DW $4000,0,0
  DB 0,0,0
  DW 0
  DB $FF,0
DEFLEN EQU $-Defs

retIs:
  reti

; The command line. Print MON3>, take a
; line by BDOS 10, make it upper case,
; and run LOAD, GO or EXIT with HL at
; the operand and Z if there is none.
; Anything else prints a question mark.
; Runs on this service's own stack.

prompt:
  ld sp,MStk     ; our own stack
  ld de,MProm
  call print     ; MON3>
  ld de,LBuf     ; 40 characters
  ld c,10        ; read a line
  call Bdos
  ld hl,LBuf+1
  ld b,(hl)      ; its length
  inc b          ; and one for the end

upc:
  inc hl
  dec b
  jr z,upcE      ; the line's end
  ld a,(hl)
  cp 'a'
  jr c,upc       ; below a
  cp 'z'+1
  jr nc,upc      ; not a letter
  sub $20        ; a to A
  ld (hl),a      ; upper case
  jr upc

upcE:
  ld (hl),0      ; end the line
  ld de,MCrlf
  call print     ; a new line
  ld hl,LBuf+2
  call skip      ; the first word
  jr z,prompt    ; an empty line
  ld de,Cmds     ; the keywords

cmd1:
  ld a,(de)
  or a
  jr z,bad       ; the table's end
  push hl        ; the line's start
  call word
  jr z,cmd2      ; this keyword
  pop hl
  inc de
  inc de         ; past its handler
  jr cmd1

cmd2:
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
  ld de,Mq
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
  jr z,word2     ; the keyword's end
  cp (hl)        ; the line's letter
  inc hl
  jr z,word      ; equal so far

word1:
  ld a,(de)      ; skip the rest
  inc de
  or a
  jr nz,word1

wordN:
  or $FF         ; NZ: no match
  ret

word2:
  ld a,(hl)
  cp ' '+1       ; the word ends too?
  jr nc,wordN
  xor a          ; Z: a match
  ret

Cmds:
  DB "LOAD",0
  DW cLoad
  DB "GO",0
  DW cGo
  DB "EXIT",0
  DW cExit
  DB 0

; Skip spaces at HL. Returns A = the
; next byte, Z at the line's end, NC.

skip:
  ld a,(hl)
  cp ' '
  jr nz,skip1    ; not a space
  inc hl
  jr skip

skip1:
  or a           ; Z at the end
  ret

; LOAD name.BIN [addr]: whole records,
; at addr or 4000h. The size is read
; first, and a file that would not fit
; is refused with nothing written.
; Nothing is runnable until it ends
; well. A read error ends the session.
; A .HEX file goes to the HEX loader.

cLoad:
  xor a
  ld (RunOk),a   ; nothing runnable
  ld a,(Dmg)
  or a           ; the tables damaged?
  jr z,cLoad1
  call dWarn     ; then no load
  jp bad

cLoad1:
  call fcbP      ; the name
  jp c,bad       ; no name
  push hl        ; the text
  ld hl,Fcb+9
  ld de,THex
  ld b,3
  call sCmp      ; Z: the type is HEX
  pop hl
  jp z,cHex
  ld de,$4000    ; the default
  call skip
  call nz,hexW   ; an address
  jp c,bad       ; a bad one
  ld (LdAt),de
  call open
  jr z,lFail     ; not found
  ld de,Fcb
  ld c,35        ; size in records
  call Bdos
  ld hl,(Fcb+33)
  ld a,(Fcb+35)  ; the size's top
  or a
  jr nz,lFail    ; over 64K records
  ld a,h
  or l
  jr z,lFail     ; an empty file
  ld a,h
  cp $02
  jr nc,lFail    ; 64K or more
  ld b,7         ; 128 bytes each

lsh:
  add hl,hl      ; records to bytes
  djnz lsh
  ld de,(LdAt)   ; the start
  call range
  jr c,lFail     ; it would not fit
  ld hl,(LdAt)

lrd:
  push hl        ; the target
  ex de,hl
  ld c,26        ; DMA = the target
  call Bdos
  ld de,Fcb
  ld c,20        ; read a record
  call Bdos
  pop hl
  or a           ; 0: a record read
  jr nz,lEnd     ; the end, or bad
  ld de,128
  add hl,de      ; the next record
  jr lrd

lEnd:
  dec a          ; 1 is the end
  jr nz,lFail
  ld hl,(LdAt)

; A good load at HL: runnable now.

lGood:
  ld (RunAt),hl  ; for GO
  ld a,1
  ld (RunOk),a   ; runnable now
  call dma80
  jp prompt

lFail:
  call dma80
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
  ld a,(TPATOP)  ; the TPA's top
  cp h
  ret c          ; above it
  jr nz,rng1
  ld a,l
  cp 1
  ccf
  ret c          ; into that page

rng1:
  ld a,d
  cp $08
  jr z,rngX      ; starts in 08xxh
  ret nc         ; starts above it
  ld a,h
  cp $08
  ccf
  ret nc         ; ends below it
  jr nz,rngX     ; runs through it
  ld a,l
  cp 1
  ccf            ; ends inside it
  ret

rngX:
  scf
  ret

THex: DB "HEX"

; Put the DMA back at 0080h.

dma80:
  ld de,$0080
  ld c,26
  jp Bdos

; GO [addr]: the last good load, or the
; address given, run as MON-3's GO runs
; it (docs/mon3.md). The cache is
; flushed first: if a write fails, GO
; is refused and the data stays queued.

cGo:
  jr z,go1       ; no address
  call hexW
  jp c,bad
  ex de,hl       ; HL = the address
  jr go2

go1:
  ld a,(RunOk)
  or a
  jp z,bad       ; no good load
  ld hl,(RunAt)

go2:
  push hl
  ld c,48        ; flush
  call Bdos
  or a           ; a write failed?
  jp nz,bad      ; then no program
  call cSum      ; the tables' sum
  ld (SumV),de   ; for the return
  ld b,$01       ; clear the LCD
  call lcdCo
  ld b,$D6       ; row 4, column 3
  call lcdCo
  ld hl,MRun
  call lcdStr    ; "Running at: "
  pop hl
  push hl        ; the address again
  ld de,HexT
  call hlStr     ; the address
  xor a
  ld (de),a      ; end the digits
  ld hl,HexT
  call lcdStr    ; on the LCD
  ld a,(KBEEP)
  or a
  call z,beep    ; unless it is off
  ld a,(SYSMD)
  ld b,a         ; B: SYS_MODE
  ld a,(PROTM)
  or b           ; PROTECT if asked
  and GOKEEP     ; no EXPAND or bank
  or LATSHD      ; and the overlay off
  ld (LATCH),a
  out (SYSLAT),a
  ld a,$FF
  ld (KBUFF),a   ; no key held
  ld c,0
  pop hl         ; the program
  ld sp,MSTK3    ; MON-3's stack
  ld de,GORET
  push de        ; RET comes back
  jp (hl)

; Call 2, preInit: MON-3's restart is a
; new workspace here, then the return.

preIn:
  di
  ld sp,MStk     ; our own stack
  call check     ; before RUNOK goes
  call wsInit    ; the workspace anew
  jr mRet1

; A program's RET lands here, through
; the latch stub. Every drive's vector
; is rebuilt at its next use, the GLCD
; console's panel is set again, and a
; form feed gives the console back. A
; warning or a breakpoint's address
; follows it, so that a video console
; still shows it at MON3>. Before the
; form feed, the keys must be up.

mRet:
  di             ; interrupts off
  ld sp,MStk     ; our own stack
  call check     ; before any write

mRet1:
  ld a,(LATCH)
  and $FD        ; PROTECT off
  ld (LATCH),a
  out (SYSLAT),a
  ld a,TXI
  out (SDIG),a   ; TX idle, no digit
  call forms     ; page zero again
  call resetD    ; and the vectors
  call gRst      ; the GLCD's modes

; Only CON: on CRT: or UC1: reads a
; matrix key into a line; a poll may
; move CON: to TTY:, so ask each pass.
; KBLAST keeps a held key off the line
; and lets the Viewer let go. MON3>
; waits until every key is up.

keyUp:
  ld a,(IOBYTE)
  rrca           ; CRT: or UC1:?
  jr nc,keysUp   ; no: no wait
  call sKeys     ; keypad or matrix
  call mScan     ; KBLAST, fresh
  ld a,(KBLAST)
  inc a          ; FFh: no matrix key
  jr nz,keyPl
  ld a,(KPRESS)
  or a           ; NZ: no keypad key
  jr nz,keysUp

keyPl:
  ld e,$FF       ; poll, and drop it
  ld c,6
  call Bdos
  jr keyUp

keysUp:
  ld de,MFf
  call print     ; a form feed
  ld hl,Dmg
  ld a,(hl)
  cp 2           ; damaged just now?
  jr nz,mRet2
  dec (hl)       ; 1: said, for good
  call dWarn

mRet2:
  ld hl,BrkF
  ld a,(hl)
  or a           ; from RST 30h?
  jp z,prompt    ; no
  ld (hl),0      ; said once
  ld de,MBrk
  call print     ; "BRK "
  ld de,HexT
  call print     ; the address
  ld de,MCrlf
  call print
  jp prompt

; DE = the sum, modulo 65,536, of the
; service from its header to SUMEND,
; and of the RAM BIOS table's 51 bytes
; with the hook linked. Each is fixed
; while a program runs. Clobbers A, BC
; and HL.

cSum:
  ld hl,($0001)  ; the warm boot's JP
  dec hl
  dec hl
  dec hl         ; the table's start
  ld bc,51
  ld de,0
  call cSum1     ; the table
  ld hl,Hdr
  ld bc,SUMLEN   ; to SUMEND

cSum1:
  ld a,(hl)
  add a,e        ; a byte in
  ld e,a
  jr nc,cSum2
  inc d          ; and its carry

cSum2:
  cpi            ; HL on, BC down
  jp pe,cSum1    ; until BC is 0
  ret

; At a program's return: the sum taken
; again. A difference sets DMG to 2,
; and the return prints the warning
; after its form feed. Clobbers AF, BC,
; DE and HL.

check:
  call cSum
  ld hl,(SumV)
  or a
  sbc hl,de      ; Z: as at GO
  ret z
  ld a,2
  ld (Dmg),a     ; damaged, for good
  ret

; Print the warning.

dWarn:
  ld de,MDmg
  jp print       ; the warning

; BDOS 37 for every drive.

resetD:
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

cExit:
  ld a,(Dmg)     ; tables damaged?
  or a           ; then stay, so LOAD
  jr nz,exKeep   ; is refused till reset
  ld a,($0007)   ; the lowest's page
  cp HIGH(Hdr)   ; this service's?
  jr z,exLeave   ; yes: it can go
  ld de,MStay
  call print     ; no: say it stays
  jr exKeep      ; and leave EXRMV clear

exLeave:
  ld hl,ExRdy    ; EXRMV in its state:
  set EXRMV,(hl)

exKeep:
  di
  im 1
  call resetD    ; the drives reset
  call rest      ; page zero back
  call unhook    ; the hook out
  xor a
  out (SSEG),a   ; segments off
  out ($05),a
  out ($06),a    ; the LED matrix
  ld a,TXI
  out (SDIG),a   ; TX idle
  jp 0           ; the real warm boot

; Put PZTAB's ranges back from SAVE0.
; Clobbers AF, BC, DE and HL.

rest:
  scf            ; CY: put back

pzCopy:
  ld hl,PzTab
  ld de,Save0    ; NC: out, CY: back

pzc1:
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
  jr nc,pzc2
  ex de,hl       ; CY: into page zero

pzc2:
  ldir
  jr nc,pzc3
  ex de,hl

pzc3:
  pop hl         ; the table
  inc hl
  jr pzc1

PzTab:
  DB 2
  DW IOBYTE
  DB $38
  DW $0008
  DB 15
  DW STUB
  DB 6
  DW NMIV
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
  jr nz,hook1    ; no session
  ld hl,($0012)
  ld a,l
  cp LOW(r10)    ; to our RST 10h?
  jr nz,hook1
  ld a,h
  cp HIGH(r10)   ; and ours?
  jr nz,hook1
  im 1           ; TEC-OS's mode
  ld a,TXI
  out (SDIG),a   ; TX idle
  ld sp,MStk     ; our own stack
  call resetD    ; vectors rebuilt
  ld hl,Save0
  ld de,IOBYTE   ; and the drive
  ld bc,2
  ldir
  ld hl,SaveV+$30
  ld de,$0038    ; RST 38h's slot
  ld c,8         ; B is 0
  ldir
  ld de,STUB     ; HL is at SAVEZ
  ld c,15
  ldir
  ld de,NMIV     ; HL at SAVEN
  ld c,6
  ldir

hook1:
  ld hl,(HookAt)
  ld a,(OldWb)   ; its low byte
  ld (hl),a      ; the old target
  inc hl
  ld a,(OldWb+1)
  ld (hl),a      ; back in the table
  ld hl,(OldWb)
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
  ld (OldWb),de
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
  jr nz,unhk1
  ld a,d
  cp HIGH(hook)
  jr nz,unhk1    ; not ours
  ld de,(OldWb)
  ld (hl),d
  dec hl
  ld (hl),e      ; the old one back

unhk1:
  xor a          ; A=0 and NC
  ret

; Parse d:name.typ at HL into FCB,
; cleared first. Carry if no name, a
; drive outside A to P, a wildcard, or
; a name over 8 or a type over 3
; characters, so that BDOS 15 never
; sees one. HL ends at the delimiter.
; Clobbers A, BC and DE.

fcbP:
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

fcb0:
  ld (hl),' '    ; a blank name
  inc hl
  djnz fcb0
  pop hl         ; the text
  ld a,(hl)
  or a
  scf
  ret z          ; nothing there
  inc hl
  ld a,(hl)      ; the next one
  dec hl
  cp ':'
  jr nz,fcb1     ; no drive
  ld a,(hl)
  sub 'A'
  cp 16          ; carry: A to P
  ccf
  ret c          ; no such drive
  inc a
  ld (Fcb),a     ; 1 is A:
  inc hl
  inc hl         ; past the colon

fcb1:
  ld de,Fcb+1
  ld b,8         ; eight characters
  call fcbF      ; the name
  ret c          ; a wildcard
  bit 7,b        ; B below 0: too long
  scf
  ret nz
  ld a,(hl)
  cp '.'
  jr nz,fcb2     ; no type
  inc hl
  ld de,Fcb+9
  ld b,3         ; three for the type
  call fcbF      ; the type
  ret c          ; a wildcard
  bit 7,b        ; too long
  scf
  ret nz

fcb2:
  ld a,(Fcb+1)
  cp ' '+1       ; carry: blank
  ret

; Copy a field at HL to DE, B bytes at
; most, to a dot or a space or the end.
; Carry at a ? or *. A longer field is
; read to its end, B going below zero.

fcbF:
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
  jp m,fcbF      ; no: read past it
  ld (de),a      ; one more in
  inc de
  jr fcbF

%INCLUDE "mon3api.asm"
%INCLUDE "mon3io.asm"
%INCLUDE "mon3hex.asm"
%INCLUDE "mon3gfx.asm"

MProm: DB 13,10,"MON3>$"
MCrlf: DB 13,10,'$'
Mq: DB "?",13,10,'$'
MFf: DB 12,'$'
MBusy: DB "MON3 active",13,10,'$'
MRst: DB "RST $"
MHeld: DB " held: UNLOAD or reset"
  DB 13,10,'$'
MNoInt: DB "RST 38 held: no"
  DB " interrupts",13,10,'$'
MBrk: DB "BRK $"
MDmg: DB "Tables damaged: EXIT"
  DB " and reset",13,10,'$'
MRun: DB "Running at: ",0
MStay: DB "MON3 stays installed"
  DB 13,10,'$'

; State. RUNOK is nonzero after a good
; load at RUNAT. INT38 is nonzero when
; 0038h holds our form. HOOKAT and
; OLDWB are the hook's word and the
; target it replaced.

RunOk: DB 0
Int38: DB 0
RunAt: DW $4000
LdAt: DW 0
HookAt: DW 0
OldWb: DW 0

; Page zero as the session found it:
; IOBYTE and the drive, 0008h-003Fh,
; 0041h-004Fh and 0066h-006Bh.

Save0: DS 2
SaveV: DS $38
SaveZ: DS 15
SaveN: DS 6
SumEnd:
SUMLEN EQU SumEnd-Hdr

; Not summed: the sum at GO, the flag a
; difference sets, kept until a reset,
; and what the monitor rewrites. BRKF
; is nonzero when RST 30h's address
; waits in HEXT to be printed.

SumV: DW 0
Dmg: DB 0
BrkF: DB 0
HexT: DS 5       ; four digits, an end
LBuf: DB 40      ; BDOS 10's buffer
  DS 42
Fcb: DS 36

; The monitor's stack.

  DS 80
MStk:

ImgEnd:
