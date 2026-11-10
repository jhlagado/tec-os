; MON3.SVC: a MON-3 session on TEC-OS.
; MON3.SVC /E installs it and gives a
; MON3> line: LOAD name.BIN [addr],
; GO [addr] and EXIT. A loaded program
; finds MON-3's restarts, variables and
; stack where MON-3 keeps them. The
; monitor, its buffers and its stack
; stay in these pages, above anything a
; MON-3 program may use. The session's
; page zero and exits: docs/mon3.md.

%INCLUDE "../src/abi.inc"

BDOS EQU $0005
IOBYTE EQU $0003
LATCH EQU LATCHV
SKEYB EQU $00    ; keypad encoder
SDIG EQU $01     ; digits, speaker
SSEG EQU $02     ; segments
SSYS EQU $03     ; key-down bit 6
LCDI EQU LCDCMD
LCDD EQU LCDDAT
TXI EQU $40      ; serial idle bit

; MON-3's own addresses.

MSTK3 EQU $0880  ; its stack top
CEL EQU $0886    ; defaults go here
KBUFF EQU $0889
KPRESS EQU $088A
KBEEP EQU $088D
UINT EQU $0892   ; IM 1 handler
UNMI EQU $0894   ; NMI handler
SYSMD EQU $089D  ; latch copy
PROTM EQU $089E

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

HDR: DB 'D',SVCFMT,0,1
  DW 0,0,0,0
  DB 0,0,0
  DW 0
  DB "MON3    "

; The execution record, version 1. Its
; entry is an offset from HDR, here 41:
; the JP below. INIT fills the name and
; sets ready.

EXREC: DB "EX",1
EXRDY: DB 0
  DW 41
EXNAM: DS 8,' '
  DB 0,1

ENTRY0:
  jp ENTRY

; BC points at the eight-byte name the
; loader read the file by. Keep it in
; the record and set ready last.
; Returns no records: HL=0, A=0, NC.
; Clobbers BC and DE.

INIT:
  ld h,b
  ld l,c         ; HL = the name
  ld de,EXNAM
  ld bc,8        ; into the record
  ldir
  ld hl,EXRDY
  ld (hl),1      ; ready
  ld hl,0        ; no records
  xor a          ; A=0 and NC
  ret

; Not ready, and the warm-boot hook out
; if an exit left it. Returns A=0, NC,
; by UNHOOK. Clobbers DE and HL.

REMOVE:
  xor a
  ld (EXRDY),a   ; not ready first
  jp UNHOOK

; The execution entry, from the CCP as
; a transient, or called by a program.
; A second entry, or a restart slot
; that holds a JP, is refused on the
; caller's stack with nothing changed.
; Otherwise save page zero's bytes,
; take them and give the MON3> line.

ENTRY:
  call ACTIVE    ; Z: in a session
  ld de,MBUSY    ; MON3 active
  jr z,REFUSE    ; so refuse it
  call UNHOOK    ; a stale hook out
  ld hl,$0008    ; RST 08h's slot
  ld b,6         ; 08h to 30h

ENT1:
  ld a,(hl)
  cp $C3         ; a kept JP holds it
  jr z,HELD      ; so refuse
  ld a,l
  add a,8        ; the next slot
  ld l,a
  djnz ENT1      ; six slots
  ld sp,MSTK     ; our own stack
  ld hl,IOBYTE   ; and the drive
  ld de,SAVE0    ; saved first
  ld bc,2
  ldir
  ld hl,$0008    ; the seven slots
  ld bc,$38
  ldir           ; into SAVEV
  ld hl,STUB     ; 0041h-004Fh
  ld bc,15
  ldir           ; into SAVEZ
  ld hl,NMIV     ; the NMI entry
  ld bc,6
  ldir           ; into SAVEN
  call FORMS     ; page zero taken
  call WSINIT    ; MON-3's variables
  call HOOKIN    ; warm boot hooked
  ld a,(INT38)
  or a           ; 0038h ours?
  ld de,MNOINT
  call z,PRINT   ; held: say so
  jp PROMPT

; Name the held slot. Its digits go
; out by BDOS 2, so a refusal leaves
; these pages as they were.

HELD:
  ld a,l
  push af        ; the slot
  ld de,MRST
  call PRINT     ; "RST "
  pop af
  push af        ; for the low digit
  rrca
  rrca
  rrca
  rrca           ; the high digit
  call PUTN
  pop af
  call PUTN      ; the low digit
  ld de,MHELD

REFUSE:
  call PRINT     ; the reason
  ld de,0-256    ; FF00h: failed
  ld c,108       ; the return code
  call BDOS
  ret            ; to the caller

; Print the $-ended string at DE.

PRINT:
  ld c,9         ; print string
  jp BDOS

; Print A's low four bits as a hex
; digit.

PUTN:
  call HEXC
  ld e,a         ; its character
  ld c,2         ; console out
  jp BDOS

; Z when slot 0010h holds this session's
; form: PUSH HL, then LD HL,R10. Every
; warm boot sweeps the form away, so
; this is the session's one flag.
; Clobbers A and HL.

ACTIVE:
  ld a,($0010)
  cp $E5         ; PUSH HL
  ret nz         ; NZ: no form
  ld hl,($0012)  ; the form's target
  ld a,l
  cp LOW(R10)
  ret nz         ; another's form
  ld a,h
  cp HIGH(R10)   ; Z: ours
  ret

; Write the session's page zero. 0038h
; is taken only from its default EI or
; our own form. Clobbers AF, BC, DE
; and HL.

FORMS:
  ld hl,RTAB     ; the handlers
  ld de,$0008    ; from RST 08h
  ld b,6         ; 08h to 30h

FRM1:
  call FORM
  djnz FRM1      ; each slot's form
  ld a,($0038)
  cp $FB         ; the default EI
  jr z,FRM2
  cp $E5         ; or a form
  ld a,0         ; INT38: not ours
  jr nz,FRM3     ; held: leave it

FRM2:
  call FORM      ; HL at R38's word
  ld a,1         ; INT38: ours

FRM3:
  ld (INT38),a
  ld hl,PZCODE   ; 0041h-004Fh
  ld de,STUB
  ld bc,PZLEN
  ldir
  ld hl,NMIC     ; B is 0
  ld de,NMIV     ; MON-3's NMI code
  ld c,6
  ldir
  ret

; One form at DE: PUSH HL; LD HL,nn;
; JP 0041h; a zero. HL is at the word
; nn and steps past it. DE steps to the
; next slot. Keeps B and C.

FORM:
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

RTAB: DW R08,R10,R18,R20,R28,R30,R38

; 0041h: put the latch back from its
; shadow, so EXPAND 0 is in view before
; these pages run, then on to HL.
; 0049h: GO's return address.
; 004Eh: the default NMI handler.

PZCODE:
  push af
  ld a,(LATCH)   ; the shadow
  out (SYSLAT),a
  pop af
  jp (hl)        ; to the handler
  DB $21         ; LD HL,MRET
  DW MRET
  DB $18,$F3     ; JR 0041h
  DB $ED,$45     ; RETN
PZLEN EQU $-PZCODE

; MON-3's NMI entry, copied to 0066h.

NMIC:
  push hl
  ld hl,(UNMI)   ; the user's handler
  ex (sp),hl     ; on the stack
  ret            ; and run

; MON-3's variables, where MON-3 keeps
; them. Nothing is runnable.
; Clobbers AF, BC, DE and HL.

WSINIT:
  ld hl,SIG      ; MON3.1G
  ld de,$0800    ; at ROMSIG
  ld bc,8
  ldir
  ld hl,DEFS     ; the defaults
  ld de,CEL      ; from 0886h
  ld bc,DEFLEN
  ldir
  ld hl,RETIS
  ld (UINT),hl   ; a RETI, here
  ld hl,NRETN
  ld (UNMI),hl   ; the RETN at 004Eh
  ld a,(LATCH)
  ld (SYSMD),a   ; SYS_MODE: the latch
  xor a
  ld (PROTM),a   ; no PROTECT
  ld (PROTM+1),a
  ld (RUNOK),a   ; nothing to run
  ret

SIG: DB "MON3.1G",0

; MON-3's defaults, 0886h-089Ch.

DEFS:
  DW $4000
  DB $08,0,$20,0,0,0,0,0
  DW $4000,0,0
  DB 0,0,0
  DW 0
  DB $FF,0
DEFLEN EQU $-DEFS

RETIS:
  reti

; The command line. Print MON3>, take a
; line by BDOS 10, make it upper case,
; and run LOAD, GO or EXIT with HL at
; the operand and Z if there is none.
; Anything else prints a question mark.
; Runs on this service's own stack.

PROMPT:
  ld sp,MSTK     ; our own stack
  ld de,MPROM
  call PRINT     ; MON3>
  ld de,LBUF     ; 40 characters
  ld c,10        ; read a line
  call BDOS
  ld hl,LBUF+1
  ld b,(hl)      ; its length
  inc b          ; and one for the end

UPC:
  inc hl
  dec b
  jr z,UPCE      ; the line's end
  ld a,(hl)
  cp 'a'
  jr c,UPC       ; below a
  cp 'z'+1
  jr nc,UPC      ; not a letter
  sub $20        ; a to A
  ld (hl),a      ; upper case
  jr UPC

UPCE:
  ld (hl),0      ; end the line
  ld de,MCRLF
  call PRINT     ; a new line
  ld hl,LBUF+2
  call SKIP      ; the first word
  jr z,PROMPT    ; an empty line
  ld de,CMDS     ; the keywords

CMD1:
  ld a,(de)
  or a
  jr z,BAD       ; the table's end
  push hl        ; the line's start
  call WORD
  jr z,CMD2      ; this keyword
  pop hl
  inc de
  inc de         ; past its handler
  jr CMD1

CMD2:
  pop af         ; drop the start
  ex de,hl       ; HL at the word
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a         ; the handler
  ex de,hl
  call SKIP      ; Z: no operand
  push de        ; its address
  ret            ; to the handler

BAD:
  ld de,MQ
  call PRINT     ; a question mark
  jr PROMPT

; Match the keyword at DE, zero-ended,
; with the word at HL. Z: DE is at the
; handler's word and HL past the word.
; NZ: DE is past the keyword's zero.
; Clobbers A.

WORD:
  ld a,(de)
  inc de
  or a
  jr z,WORD2     ; the keyword's end
  cp (hl)        ; the line's letter
  inc hl
  jr z,WORD      ; equal so far

WORD1:
  ld a,(de)      ; skip the rest
  inc de
  or a
  jr nz,WORD1

WORDN:
  or $FF         ; NZ: no match
  ret

WORD2:
  ld a,(hl)
  cp ' '+1       ; the word ends too?
  jr nc,WORDN
  xor a          ; Z: a match
  ret

CMDS:
  DB "LOAD",0
  DW CLOAD
  DB "GO",0
  DW CGO
  DB "EXIT",0
  DW CEXIT
  DB 0

; Skip spaces at HL. Returns A = the
; next byte, Z at the line's end, NC.

SKIP:
  ld a,(hl)
  cp ' '
  jr nz,SKIP1    ; not a space
  inc hl
  jr SKIP

SKIP1:
  or a           ; Z at the end
  ret

; LOAD name.BIN [addr]: whole records,
; at addr or 4000h. The size is read
; first, and a file that would not fit
; is refused with nothing written.
; Nothing is runnable until it ends
; well. A read error ends the session.

CLOAD:
  xor a
  ld (RUNOK),a   ; nothing runnable
  call FCBP      ; the name
  jp c,BAD       ; no name
  ld de,$4000    ; the default
  call SKIP
  call nz,HEXW   ; an address
  jp c,BAD       ; a bad one
  ld (LDAT),de
  ld de,FCB
  ld c,15        ; open
  call BDOS
  inc a          ; FFh: none
  jp z,LFAIL     ; not found
  ld de,FCB
  ld c,35        ; size in records
  call BDOS
  ld hl,(FCB+33)
  ld a,(FCB+35)  ; the size's top
  or a
  jr nz,LFAIL    ; over 64K records
  ld a,h
  or l
  jr z,LFAIL     ; an empty file
  ld a,h
  cp $02
  jr nc,LFAIL    ; 64K or more
  ld b,7         ; 128 bytes each

LSH:
  add hl,hl      ; records to bytes
  djnz LSH
  ld de,(LDAT)   ; the start
  ld a,d
  or a
  jr z,LFAIL     ; page zero
  add hl,de      ; HL = the end
  jr c,LFAIL     ; past FFFFh
  ld a,(BDOS+2)  ; the BDOS's page
  cp h
  jr c,LFAIL     ; above it
  jr nz,LS1
  ld a,l
  or a
  jr nz,LFAIL    ; into that page

LS1:
  ld a,d
  cp $08
  jr z,LFAIL     ; starts in 08xxh
  jr nc,LS2      ; starts above it
  ld a,h
  cp $08
  jr c,LS2       ; ends below it
  jr nz,LFAIL    ; runs through it
  ld a,l
  or a
  jr nz,LFAIL    ; ends inside it

LS2:
  ld hl,(LDAT)

LRD:
  push hl        ; the target
  ex de,hl
  ld c,26        ; DMA = the target
  call BDOS
  ld de,FCB
  ld c,20        ; read a record
  call BDOS
  pop hl
  or a           ; 0: a record read
  jr nz,LEND     ; the end, or bad
  ld de,128
  add hl,de      ; the next record
  jr LRD

LEND:
  dec a          ; 1 is the end
  jr nz,LFAIL
  ld hl,(LDAT)
  ld (RUNAT),hl  ; for GO
  ld a,1
  ld (RUNOK),a   ; runnable now
  call DMA80
  jp PROMPT

LFAIL:
  call DMA80
  jp BAD         ; ? and nothing run

; Put the DMA back at 0080h.

DMA80:
  ld de,$0080
  ld c,26
  jp BDOS

; GO [addr]: the last good load, or the
; address given, run as MON-3's GO runs
; it (docs/mon3.md). The cache is
; flushed first, so a program that
; hangs loses nothing written.

CGO:
  jr z,GO1       ; no address
  call HEXW
  jp c,BAD
  ex de,hl       ; HL = the address
  jr GO2

GO1:
  ld a,(RUNOK)
  or a
  jp z,BAD       ; no good load
  ld hl,(RUNAT)

GO2:
  push hl
  ld c,48        ; flush
  call BDOS
  ld b,$01       ; clear the LCD
  call LCDCO
  ld b,$D6       ; row 4, column 3
  call LCDCO
  ld hl,MRUN
  call LCDSTR    ; "Running at: "
  pop hl
  push hl        ; the address again
  ld de,HEXT
  call HLSTR     ; the address
  xor a
  ld (de),a      ; end the digits
  ld hl,HEXT
  call LCDSTR    ; on the LCD
  ld a,(KBEEP)
  or a
  call z,BEEP    ; unless it is off
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

; A program's RET lands here, through
; the latch stub. Every drive's vector
; is rebuilt at its next use, and a
; form feed gives the console back.

MRET:
  di             ; interrupts off
  ld sp,MSTK     ; our own stack
  ld a,(LATCH)
  and $FD        ; PROTECT off
  ld (LATCH),a
  out (SYSLAT),a
  ld a,TXI
  out (SDIG),a   ; TX idle, no digit
  call FORMS     ; page zero again
  call RESETD    ; and the vectors
  ld de,MFF
  call PRINT     ; a form feed
  jp PROMPT

; BDOS 37 for every drive.

RESETD:
  ld de,0-1
  ld c,37
  jp BDOS

; EXIT: interrupts off, IM 1, the
; drives reset, page zero as it was,
; the hook out and the devices idle.
; Then the real warm boot.

CEXIT:
  di
  im 1
  call RESETD    ; the drives reset
  call REST      ; page zero back
  call UNHOOK    ; the hook out
  xor a
  out (SSEG),a   ; segments off
  out ($05),a
  out ($06),a    ; the LED matrix
  ld a,TXI
  out (SDIG),a   ; TX idle
  jp 0           ; the real warm boot

; Put back the saved IOBYTE and drive,
; 0008h-003Fh, 0041h-004Fh and the NMI
; entry. Clobbers BC, DE and HL.

REST:
  ld hl,SAVE0
  ld de,IOBYTE   ; and the drive
  ld bc,2
  ldir
  ld de,$0008    ; the slots
  ld bc,$38
  ldir
  ld de,STUB     ; HL at SAVEZ
  ld bc,15
  ldir
  ld de,NMIV     ; HL at SAVEN
  ld bc,6
  ldir
  ret

; The warm-boot hook, on the RAM BIOS
; table's warm-boot entry. In a
; session, which slot 0010h tells
; before the sweep runs, it resets the
; drives and gives back what the sweep
; does not. Either way it takes itself
; out and goes on to the entry it
; replaced, so one left by an exit
; that passed it does nothing.

HOOK:
  di             ; interrupts off
  ld a,($0010)
  cp $E5         ; a form?
  jr nz,HOOK1    ; no session
  ld hl,($0012)
  ld a,l
  cp LOW(R10)    ; to our RST 10h?
  jr nz,HOOK1
  ld a,h
  cp HIGH(R10)   ; and ours?
  jr nz,HOOK1
  im 1           ; TEC-OS's mode
  ld a,TXI
  out (SDIG),a   ; TX idle
  ld sp,MSTK     ; our own stack
  call RESETD    ; vectors rebuilt
  ld hl,SAVE0
  ld de,IOBYTE   ; and the drive
  ld bc,2
  ldir
  ld hl,SAVEV+$30
  ld de,$0038    ; RST 38h's slot
  ld c,8         ; B is 0
  ldir
  ld de,STUB     ; HL is at SAVEZ
  ld c,15
  ldir
  ld de,NMIV     ; HL at SAVEN
  ld c,6
  ldir

HOOK1:
  ld hl,(HOOKAT)
  ld a,(OLDWB)   ; its low byte
  ld (hl),a      ; the old target
  inc hl
  ld a,(OLDWB+1)
  ld (hl),a      ; back in the table
  ld hl,(OLDWB)
  jp (hl)        ; and on to it

; Link the hook at the word after the
; JP that 0001h points to, keeping the
; old target. Clobbers DE and HL.

HOOKIN:
  ld hl,($0001)  ; the JP to the BIOS
  inc hl         ; its target word
  ld (HOOKAT),hl
  ld e,(hl)
  inc hl
  ld d,(hl)      ; the old target
  ld (OLDWB),de
  ld de,HOOK
  ld (hl),d      ; ours in its place
  dec hl
  ld (hl),e
  ret

; Take the hook out if the table still
; points at it. Returns A=0, NC.
; Clobbers DE and HL.

UNHOOK:
  ld hl,($0001)  ; the JP to the BIOS
  inc hl
  ld e,(hl)
  inc hl
  ld d,(hl)      ; the target now
  ld a,e
  cp LOW(HOOK)   ; our hook?
  jr nz,UNHK1
  ld a,d
  cp HIGH(HOOK)
  jr nz,UNHK1    ; not ours
  ld de,(OLDWB)
  ld (hl),d
  dec hl
  ld (hl),e      ; the old one back

UNHK1:
  xor a          ; A=0 and NC
  ret

; Parse d:name.typ at HL into FCB,
; cleared first. Carry if no name, or a
; drive outside A to P. HL ends at the
; delimiter. Clobbers A, BC and DE.

FCBP:
  ld de,FCB
  push hl        ; the text
  ld h,d
  ld l,e
  ld (hl),0      ; the drive: default
  inc de
  ld bc,35
  ldir           ; zeros throughout
  ld hl,FCB+1
  ld b,11

FCB0:
  ld (hl),' '    ; a blank name
  inc hl
  djnz FCB0
  pop hl         ; the text
  ld a,(hl)
  or a
  scf
  ret z          ; nothing there
  inc hl
  ld a,(hl)      ; the next one
  dec hl
  cp ':'
  jr nz,FCB1     ; no drive
  ld a,(hl)
  sub 'A'
  cp 16          ; carry: A to P
  ccf
  ret c          ; no such drive
  inc a
  ld (FCB),a     ; 1 is A:
  inc hl
  inc hl         ; past the colon

FCB1:
  ld de,FCB+1
  ld b,8         ; eight characters
  call FCBF      ; the name
  ld a,(hl)
  cp '.'
  jr nz,FCB2     ; no type
  inc hl
  ld de,FCB+9
  ld b,3         ; three for the type
  call FCBF      ; the type

FCB2:
  ld a,(FCB+1)
  cp ' '+1       ; carry: blank
  ret

; Copy up to B bytes of a field.

FCBF:
  ld a,(hl)
  cp '.'
  ret z          ; the name's end
  cp ' '+1
  ret c          ; the field's end
  ld (de),a      ; one more in
  inc de
  inc hl
  djnz FCBF      ; until it is full
  ret

; Read a hex word of one to four digits
; at HL into DE. Carry if it has no
; digit, a fifth digit, or anything but
; a space or the end after it. HL ends
; past it. Clobbers A and B.

HEXW:
  ld de,0
  ld b,4         ; at most four digits
  ld a,(hl)
  call HEXD
  ret c          ; no digit

HEXW1:
  ex de,hl       ; HL = the word
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl      ; one digit up
  or l
  ld l,a         ; the new digit in
  ex de,hl
  inc hl
  ld a,(hl)
  call HEXD
  jr c,HEXW2     ; the number's end
  djnz HEXW1
  scf            ; a fifth digit
  ret

HEXW2:
  ld a,(hl)
  cp ' '+1       ; a space or the end
  ccf            ; carry: text joined
  ret

; A hex digit's value from A. Carry if
; it is none.

HEXD:
  sub '0'
  ret c          ; below 0
  cp 10
  ccf
  ret nc         ; 0 to 9
  sub 7          ; A to F as 10-15
  cp 10
  ret c          ; between 9 and A
  cp 16
  ccf            ; carry past F
  ret

; Write HL as four hex digits at DE,
; or A as two at HEXA. DE steps on.

HLSTR:
  ld a,h
  call HEXA      ; the high byte
  ld a,l

HEXA:
  push af        ; the low digit
  rrca
  rrca
  rrca
  rrca           ; the high digit
  call HEXN
  pop af

HEXN:
  call HEXC
  ld (de),a      ; the character
  inc de
  ret

; A's low four bits as a hex digit's
; character. Clobbers F.

HEXC:
  and $0F
  add a,$90      ; DAA's hex trick
  daa
  adc a,$40
  daa            ; 0-9, A-F
  ret

; MON-3's restarts. Each form pushed HL
; and came here through the latch stub,
; so each starts by taking HL back.

; RST 08h: wait for a key.

R08:
  pop hl
  jp KWAIT

; RST 10h: MON-3's API, C the call.
; AF, BC and HL reach the routine as
; the caller left them. IX is lost, as
; in MON-3. A call past the table goes
; to the error display.

R10:
  pop hl         ; the caller's HL
  push af
  ld a,c
  cp 63          ; MON-3's count
  jr nc,R10X     ; not MON-3's
  push bc
  push hl
  ld hl,API
  add a,a        ; two bytes a call
  ld c,a
  ld b,0
  add hl,bc      ; the call's word
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a         ; its routine
  push hl
  pop ix         ; IX = the routine
  pop hl
  pop bc
  pop af         ; as the caller had
  jp (ix)

R10X:
  pop af
  jp DERR

; RST 18h: the graphics API, not built.

R18:
  pop hl
  jp DERR

; RST 20h: scan the digits at DE, then
; the keys, then wait for the LCD, as
; MON-3's slot runs on into RST 28h.
; A and the flags are the key scan's.

R20:
  pop hl
  call SCANS     ; the digits
  call SKEYS     ; the keys
  jr R28A

; RST 28h: wait for the LCD.

R28:
  pop hl

R28A:
  push af
  call LCDB
  pop af         ; keep the flags
  ret

; RST 30h: a breakpoint. Say where and
; go back to the MON3> line.

R30:
  pop hl
  pop hl         ; the return address
  ld de,MBRK+4
  call HLSTR     ; into the message
  ld de,MBRK
  call PRINT
  jp MRET        ; as a return

; RST 38h: MON-3's interrupt dispatch.

R38:
  pop hl
  push hl
  ld hl,(UINT)   ; the user's handler
  ex (sp),hl     ; on the stack
  ret            ; and run

; MON-3's 63 calls. Those not built go
; to the error display, as MON-3 sends
; a call it does not have.

API:
  DW DERR,DERR,DERR,BEEP
  DW TOSEG,DERR,DERR,DERR
  DW DERR,DERR,SCANS,DERR
  DW LCDB,LCDSTR,LCDCHR,LCDCO
  DW SKEYS,KWAIT,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,TDLY,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR,DERR
  DW DERR,DERR,DERR

; Call 3, beep: MON-3's tone, with the
; serial line held idle. A=0. Keeps BC.

BEEP:
  push bc
  ld c,$40       ; half cycles
  ld a,TXI

BEEP1:
  out (SDIG),a
  ld b,$40
  djnz $         ; half a period
  xor $80        ; the speaker bit
  dec c
  jr nz,BEEP1
  pop bc
  ld a,TXI
  out (SDIG),a   ; speaker low
  xor a
  ret

; Call 4, convAToSeg: A as two segment
; bytes at DE, DE+2. Clobbers A and BC.

TOSEG:
  push af
  rlca
  rlca
  rlca
  rlca           ; the high digit
  call TOSEG1
  pop af

TOSEG1:
  and $0F        ; one digit
  ld bc,SEGT
  add a,c
  ld c,a
  jr nc,TOSEG2
  inc b          ; past a page

TOSEG2:
  ld a,(bc)
  ld (de),a
  inc de
  ret

; MON-3's segment codes for 0 to F.

SEGT:
  DB $EB,$28,$CD,$AD,$2E,$A7,$E7,$29
  DB $EF,$2F,$6F,$E6,$C3,$EC,$C7,$47

; Call 10, scanSegments: one scan of the
; six digits from DE, leftmost first.
; DE+6, A=0. Clobbers B.

SCANS:
  ld b,$20       ; the leftmost

SCN1:
  ld a,(de)      ; its segments
  out (SSEG),a
  ld a,b
  or TXI
  out (SDIG),a   ; this digit on
  ld b,$40
  djnz $
  inc de
  and $3F
  ld b,a         ; the digit's bit
  ld a,TXI
  out (SDIG),a   ; off again
  rrc b          ; the next digit
  jr nc,SCN1     ; six digits
  xor a
  out (SSEG),a
  ret

; Call 12, LCDBusy: wait for the LCD.
; Keeps every register.

LCDB:
  push af

LCDB1:
  in a,(LCDI)
  rlca           ; the busy flag
  jr c,LCDB1
  pop af
  ret

; Call 13, stringToLCD: the zero-ended
; string at HL. HL ends past its zero.

LCDSTR:
  ld a,(hl)
  inc hl
  or a
  ret z          ; the string's end
  call LCDB
  out (LCDD),a   ; the character
  jr LCDSTR

; Call 14, charToLCD: A.

LCDCHR:
  call LCDB
  out (LCDD),a
  ret

; Call 15, commandToLCD: B. Keeps AF.

LCDCO:
  push af
  call LCDB
  ld a,b
  out (LCDI),a   ; the command
  pop af
  ret

; Call 16, scanKeys, for the keypad.
; NZ: no key. Z: a key in A, with
; carry for a new press and none while
; it is held, as MON-3 answers.

SKEYS:
  in a,(SSYS)
  rrca
  and $20        ; the key-down bit
  jr z,SK1
  ld (KPRESS),a  ; none: NZ
  ret

SK1:
  ld a,(KPRESS)
  or a
  ld a,(KBUFF)   ; the key held
  ret z          ; held: no carry
  xor a
  ld (KPRESS),a  ; now held
  in a,(SKEYB)   ; the key's code
  and $3F
  xor $20        ; MON-3's Fn bit
  cp a           ; Z
  scf            ; a new press
  ld (KBUFF),a
  ret

; Call 17 and RST 08h, scanKeysWait:
; wait for the keys to be up, then for
; a press. A = the key, Z.

KWAIT:
  call SKEYS
  ld a,(KPRESS)
  or a
  jr z,KWAIT     ; still down

KW1:
  call SKEYS
  jr nz,KW1
  ret

; Call 33, timeDelay: HL loops. Keeps
; every register.

TDLY:
  push hl
  push de
  ld de,1

TD1:
  sbc hl,de
  jp nc,TD1      ; until it borrows
  pop de
  pop hl
  ret

; Call 11, displayError, and every call
; not built: MON-3's error on the
; digits until a key, then back to the
; caller. Clobbers AF, B and DE.

DERR:
  call SKEYS
  ld a,(KPRESS)
  or a
  jr z,DERR      ; wait for key up

DERR1:
  ld de,ERRT     ; Err on the digits
  call SCANS
  call SKEYS
  jr nz,DERR1    ; until a press
  ret

ERRT: DB $C7,$4B,$4B,$EB,$4B,$00

MPROM: DB 13,10,"MON3>$"
MCRLF: DB 13,10,'$'
MQ: DB "?",13,10,'$'
MFF: DB 12,'$'
MBUSY: DB "MON3 active",13,10,'$'
MRST: DB "RST $"
MHELD: DB " held: UNLOAD or reset"
  DB 13,10,'$'
MNOINT: DB "RST 38 held: no"
  DB " interrupts",13,10,'$'
MBRK: DB "BRK xxxx",13,10,'$'
MRUN: DB "Running at: ",0

; State. RUNOK is nonzero after a good
; load at RUNAT. INT38 is nonzero when
; 0038h holds our form. HOOKAT and
; OLDWB are the hook's word and the
; target it replaced.

RUNOK: DB 0
INT38: DB 0
RUNAT: DW $4000
LDAT: DW 0
HOOKAT: DW 0
OLDWB: DW 0

; Page zero as the session found it:
; IOBYTE and the drive, 0008h-003Fh,
; 0041h-004Fh and 0066h-006Bh.

SAVE0: DS 2
SAVEV: DS $38
SAVEZ: DS 15
SAVEN: DS 6

HEXT: DS 5       ; four digits, a zero
LBUF: DB 40      ; BDOS 10's buffer
  DS 42
FCB: DS 36

; The monitor's stack.

  DS 80
MSTK:

IMGEND:
