; Portable CP/M Console Command
; Processor, CP/M 2.2 interface profile.
;
; This is an independent implementation
; against the public CP/M interfaces
; and reviewed black-box CCP fixtures.
; ATOM is its assembler.
;
; TEC-OS ROM-resident adaptation (see
; PROVENANCE.md). The code and text are
; in
; ROM; the command buffers, scratch FCBs
; and stack are in src/ram.asm. The
; transient ceiling is the page of the
; BDOS entry jump (the byte at 0007h),
; rather than the CCP origin.

CCPBAS:

BDOS EQU $0005
WBOOT EQU $0000
CURDSK EQU $0004
FCBONE EQU $005C
FCBTWO EQU $006C
CMDTAIL EQU $0080
TPA EQU $0100
; FF00h, function 108's code for a
; failure
RCFAIL EQU 255*256


; Cold and warm boot both enter here
; with C holding the CP/M 2.2 page-zero
; byte: user number in bits 4-7, drive
; in bits 0-3. The BIOS has just reset
; the BDOS state, so rebuild the disk
; state and restore both before
; prompting.
; TEC-OS: a drive with no volume,
; unmounted or past D:, cannot be
; selected,
; and its Select error would warm boot
; back here to fail again; the CCP takes
; A: instead, and the prompt's 0004h
; then says so. It never returns.
CCPENT:
  ld sp,CSTKTOP  ; the CCP's own stack,
                 ; in RAM
  ld a,c
  and $0F        ; the drive, 0 for A:
  cp MAXDRV
  jr nc,CCPDA    ; beyond D:, A: instead
  ld e,a
  ld d,0
  ld hl,DRVIDX   ; the drive's entry in
                 ; the volume table
  add hl,de
  ld a,(hl)      ; its volume's index +
                 ; 1, 0 for none
  or a
  ld a,e         ; the drive again, the
                 ; flags kept
  jr nz,CCPDR    ; it has a volume: it
                 ; stays

CCPDA:
  xor a          ; no volume: A:

CCPDR:
; the drive to select after the reset
  ld (BOOTDRV),a
  ld a,c
  rrca           ; the user, bits 4-7 to
                 ; bits 0-3
  rrca
  rrca
  rrca
  and $0F
  push af        ; kept across the reset
  ld hl,WRFLAG   ; the reset that keeps
                 ; unchanged drives
                 ; logged
  ld (hl),$FF
  ld c,13        ; BDOS 13: reset the
                 ; disks, A: selected
  call BDOS
  pop af
  ld e,a
  ld c,32        ; BDOS 32: the user set
                 ; again
  call BDOS
  call STBOOT    ; once after cold boot
  ld a,(BOOTDRV)
  or a
  jr z,STARTED   ; A:, selected by the
                 ; reset already
  ld e,a
  ld c,14        ; BDOS 14: select the
                 ; drive
  call BDOS

; A new line and then the prompt: every
; command, error and empty line ends
; here.
STARTED:
  ld de,CRLFMSG  ; the prompt on a line
                 ; of its own
  call PUTSTR

; The command loop: the stack reset, the
; prompt (MLREAD), then the next
; line: a chained line's next piece
; first, then startup's next line, and
; only then one typed at the console.
MAINLOOP:
  ld sp,CSTKTOP  ; a command's leftover
                 ; stack dropped

MLREAD:
  call SAVEDU    ; A the drive, B the
                 ; user in bits 4-7
  push af        ; the user first, as
                 ; CP/M 3 does, unless
                 ; 0:
  ld a,b         ; 3A>
  rrca           ; the user to bits 0-3
  rrca
  rrca
  rrca
  or a
  jr z,MLDRV     ; user 0: the drive
                 ; alone
  ld l,a
  ld h,0
  call PUTDEC    ; the user in decimal

MLDRV:
  pop af
  add a,'A'      ; the drive's letter
  ld e,a
  call PUTCHAR
  ld e,'>'
  call PUTCHAR   ; and the prompt's >
  call CHSKIP    ; a chained line's next
                 ; piece, before all
                 ; else
  jr nz,MLECHO   ; there is one: echo it
  ld (CHPOS),a   ; none: A = 0
  call STLINE    ; startup's next line
  ccf            ; STFLAG: FFh a line
                 ; from the file, 0 a
  sbc a,a        ; typed one; a chained
                 ; piece keeps it
  ld (STFLAG),a
  jr nz,MLGOT    ; startup's line, in
                 ; CMDBUF already
  ld de,CMDBUF
  ld hl,HFLAG    ; history for this line
  ld (hl),$FF
  ld c,10        ; BDOS 10: a line typed
                 ; into CMDBUF
  call BDOS

; A line, typed or startup's, CMDLEN
; long in CMDTXT: a 0 after it, and its
; first piece taken as a chained line's
; would be.
MLGOT:
  ld hl,CMDLEN
  ld e,(hl)      ; the line's length
  ld d,0
  inc hl
  add hl,de      ; just past its last
                 ; character
  ld (hl),d      ; the 0 that ends it
  ld hl,CMDTXT   ; CHPOS was cleared
                 ; before acquiring this
                 ; line
  call CHSK1
  jr z,STARTED   ; nothing but spaces
                 ; and !
  jr MLTAKE      ; HL at the first piece

; A chained piece, echoed as STLINE
; echoes a line, up to its ! or the end.
MLECHO:
  push hl        ; the piece's start,
                 ; kept

MLEC1:
  ld a,(hl)
  or a
  jr z,MLEC2     ; the line's end
  cp '!'
  jr z,MLEC2     ; or the piece's
  ld e,a
  call PUTCHAR   ; each character echoed
  inc hl
  jr MLEC1

MLEC2:
  pop hl         ; HL back at the
                 ; piece's start

; Take the piece at HL. One that starts
; with : runs only if the last
; command succeeded: its code, function
; 108's, is not FF00h to FFFEh; after a
; failure the rest of the line goes.
; Then upper case up to its ! or the
; line's end, the ! made its end and
; CHPOS the next piece's, or 0 at the
; end,
; and the code cleared, before the
; command is looked for. ARGSTRT holds
; it.
; A piece that is only a drive, B:,
; selects it; any other is a command.
MLTAKE:
  ld a,(hl)
  cp ':'
  jr nz,MLTK0    ; no :, so it runs
; the last command's code
  ld de,(PRGCODE)
  ld a,d
  inc a
  jr nz,MLTKC    ; below FF00h
  ld a,e
  inc a
  jr z,MLTKC     ; FFFFh
  xor a          ; failed: the rest of
                 ; the line dropped
  ld (CHPOS),a
  jp STARTED

MLTKC:
  inc hl         ; past the :

MLTK0:
  ld (ARGSTRT),hl

MLTK1:
  ld a,(hl)
  or a
  jr z,MLTK3     ; the line's end: CHPOS
                 ; 0
  cp '!'
  jr z,MLTK2     ; the piece's end
  cp 'a'
  jr c,MLTKN     ; below a: kept as it
                 ; is
  cp 'z'+1
  jr nc,MLTKN    ; past z: kept as it is
  and $DF        ; a to z made upper
                 ; case
  ld (hl),a

MLTKN:
  inc hl
  jr MLTK1

MLTK2:
  ld (hl),0      ; the ! made the
                 ; piece's end
  inc hl
  ld a,l         ; the next piece's
                 ; offset in CMDTXT
; plus 1, from the low bytes alone
  sub LOW(CMDTXT-1)

MLTK3:
  ld (CHPOS),a
  ld hl,0        ; the code cleared: 0,
                 ; a success
  ld (PRGCODE),hl
  ld hl,(ARGSTRT)
  call SKIPSP    ; A the piece's first
                 ; character
  or a
  jp z,STARTED   ; a : and nothing after
                 ; it
  cp 'A'
  jr c,NOTDRIVE  ; not a drive's letter:
                 ; a command
  cp 'P'+1
  jr nc,NOTDRIVE
  ld b,a         ; a letter A to P, kept
  inc hl
  ld a,(hl)
  cp ':'
; with no : after it
  jr nz,NOTDRIVE
  inc hl
  call SKIPSP    ; skip after drive
  ld a,(hl)
  or a
; more after it, as in B:NAME
  jr nz,NOTDRIVE
  ld a,b
  sub 'A'        ; the drive, 0 for A:
  ld (BOOTDRV),a
  ld e,a
  ld c,14        ; BDOS 14: select it
  call BDOS
  call SAVEDU    ; and note it in page
                 ; zero
  jp STARTED

; HL = a chained line's next piece, past
; spaces and !, from CHPOS; A its
; first character, with Z when none is
; left (A = 0). CHSK1 does the same
; from HL. Destroys DE.
CHSKIP:
  ld a,(CHPOS)
  or a
  ret z          ; no piece left: Z, A =
                 ; 0
  ld e,a
  ld d,0
; CHPOS counts from 1
  ld hl,CMDTXT-1
  add hl,de

CHSK1:
  ld a,(hl)
  cp SPACE
  jr z,CHSK2     ; spaces passed over,
  cp '!'
  jr nz,CHSK3    ; and empty pieces' !

CHSK2:
  inc hl
  jr CHSK1

CHSK3:
  or a           ; Z for the line's end
  ret

; Record the current user and drive in
; the page-zero byte at 0004h so a warm
; boot restores both. Returns the drive
; in A and C, and the user in bits 4-7
; of B. Destroys DE and HL, through the
; BDOS.
SAVEDU:
  ld e,$FF
  ld c,32        ; BDOS 32 with FFh: get
                 ; the user
  call BDOS
  add a,a        ; the user to bits 4-7
  add a,a
  add a,a
  add a,a
  ld b,a
  push bc        ; kept across the next
                 ; call
  ld c,25        ; BDOS 25: get the
                 ; current drive
  call BDOS
  pop bc
  ld c,a         ; the drive kept
  or b
  ld (CURDSK),a  ; user and drive, in
                 ; page zero's form
  ld a,c
  ret

; A command: the piece from ARGSTRT,
; upper case and ending in a 0. A
; built-in
; command's word runs its handler,
; NAME.SVC installs a service, and any
; other
; name loads as NAME.COM and runs at
; 0100h: from the drive named, or from
; the
; current drive and then A:, each in the
; current user and then user 0.
NOTDRIVE:
  ld de,CRLFMSG  ; the command's output
                 ; on a new line
  call PUTSTR
; the piece
  ld hl,(ARGSTRT)
  call CMDSKIP   ; past spaces, noted
                 ; for an error
  call CMDPARSE  ; its first word into
                 ; CMDFCB
; the arguments start after it
  ld (ARGSTRT),hl
  ld de,KEYTAB   ; the built-in
                 ; commands' words

KEYNXT:
  call ISCMD     ; DE at the mismatch or
                 ; the word's 0
  ex de,hl       ; skip only the
                 ; unmatched suffix
  jr nz,KEYSK    ; not this word
  inc hl         ; a match: past the
                 ; word's 0
  ld a,(hl)      ; the handler's
                 ; address, low byte
                 ; first
  inc hl
  ld h,(hl)
  ld l,a
  jp (hl)        ; it takes the line
                 ; from ARGSTRT itself

KEYSK:
  ld a,(hl)      ; past the word and its
                 ; 0,
  inc hl
  or a
  jr nz,KEYSK
  inc hl         ; and its handler
  inc hl
  ex de,hl       ; DE at the next word
  ld a,(de)
  or a
  jr nz,KEYNXT   ; another word; a 0
                 ; ends the table
  ld de,CMDFCB
  call UNAMBIG   ; no word matched: a
                 ; file's name
  jp c,BADCMD    ; empty, or with a
                 ; wildcard
; NAME.SVC installs
  ld hl,(CMDFCB+9)
; the type's S and V, low byte first
  ld de,'V'*256+'S'
  sbc hl,de      ; carry clear from
                 ; UNAMBIG
  jr nz,CMDCOM   ; type not SV?: a
                 ; program
  ld a,(CMDFCB+11)
  cp 'C'
  jr nz,CMDCOM
  call SVCGO     ; read and install the
                 ; service
  jr nc,SVCOK
  ld hl,(SVCRC)  ; L = SVCRC, H = SVCRA:
                 ; an INIT that
  ld a,(STFLAG)  ; found its device
                 ; absent, in a line
                 ; from
  and h          ; STARTUP.CMD, is
                 ; quiet, and PRGCODE
                 ; stays
  xor TNENODV    ; 0, so a : line after
                 ; it runs (KD-173);
  dec l          ; typed, or for any
                 ; other cause, it says
  or l           ; NAME? as before
  jr nz,BADCMD

SVCOK:
  jp STARTED     ; installed, or quietly
                 ; absent

CMDCOM:
  ld a,'C'       ; a program: the type
                 ; given, if any,
  ld (CMDFCB+9),a
  ld a,'O'
  ld (CMDFCB+10),a
  ld a,'M'
; made COM
  ld (CMDFCB+11),a
  call LOADA     ; the named or current
                 ; drive: user, user 0
  jr nc,CMDRUN   ; loaded
  jr nz,BADCMD   ; there, but it would
                 ; not load
  ld hl,CMDFCB   ; not here: A:'s, if no
                 ; drive was named
  ld a,(hl)
  or a
  jr nz,BADCMD   ; B:NAME looks on B:
                 ; only
  ld a,(PZDU)    ; and the current drive
                 ; isn't A:
  and $0F
  jr z,BADCMD
  inc (hl)       ; the FCB's drive 1, A:
  call LOADA     ; its current user,
                 ; then user 0
  jr c,BADCMD    ; not on A: either, or
                 ; unloadable

CMDRUN:
  call PREPPAGE  ; its FCBs, tail and
                 ; DMA in page zero
  ld a,(CMDFCB)  ; the drive the program
                 ; came from, as
  ld (PZLDRV),a  ; CP/M 3 keeps it: 0
                 ; the current, 1 A:
; Keep the return word outside default
; DMA
; ($0080..$00FF). The resident stack has
; 30 bytes free beneath this two-byte
; word.
  ld sp,CSTKTOP
  ld hl,WBOOT    ; the program's last
                 ; RET warm boots
  push hl
  jp TPA         ; and the program runs

; An argument: from ARGSTRT, or from HL
; at CMDSKIP, past its spaces, noted
; for an error. HL is at it and A holds
; its first character, with Z at the
; end of the line.
ARGSKIP:
  ld hl,(ARGSTRT)

CMDSKIP:
  call SKIPSP
; where an error's echo starts
  ld (CMDSTRT),hl
  or a           ; Z for the line's end
  ret

; One unambiguous name at HL into
; CMDFCB, and nothing after it.
ONENAME:
  call CMDPARSE
  call CPCHK     ; a bad command if
                 ; empty or ambiguous
; A bad command unless only spaces are
; left. B is kept.
ENDCHK:
  call SKIPSP
  or a
  ret z          ; nothing more: the
                 ; command is good
  jr BADCMD

; The name at HL into CMDFCB, or at
; FCBPARSE into the FCB at DE, HL left
; at
; its delimiter, or a bad command.
; BADCMD: the word from CMDSTRT echoed
; with
; a ?, the code a failure, and the
; prompt again.
CMDPARSE:
  ld de,CMDFCB

FCBPARSE:
  call PARSEFCB
  ret nc         ; a good name

BADCMD:
; the word that failed
  ld hl,(CMDSTRT)

BADLOOP:
  ld a,(hl)
  or a
  jr z,BADEND    ; echoed up to the
                 ; line's end
  cp SPACE
  jr z,BADEND    ; or a space
  ld e,a
  call PUTCHAR   ; each character
  inc hl
  jr BADLOOP

BADEND:
  ld e,'?'       ; then a ?, as CP/M's
                 ; NAME?
  call PUTCHAR
  ld de,CRLFMSG  ; and the new line as
                 ; the message
; A command's error message at DE: the
; code FF00h, a failure for a piece
; that starts with :, then the message
; and the prompt. PRTGO: the message
; and the prompt, the code as it is.
ERRGO:
  ld hl,RCFAIL
; a : piece after this one does not run
  ld (PRGCODE),hl

PRTGO:
  call PUTSTR    ; the message, ending
                 ; in $
  jp STARTED

; LOADA: LOADCOM on CMDFCB's drive, in
; the current user and then, if it
; isn't there and the user isn't 0, in
; user 0 (A7): no SYS attribute needed.
; The user is put back before it
; returns. Carry as LOADCOM's: Z for not
; found.
; Destroys BC, DE and HL.
LOADA:
  call LOADCOM
  ret nc         ; loaded in the current
                 ; user
  ret nz         ; there, but it would
                 ; not load
  ld a,(PZDU)    ; the user, in the high
                 ; nibble
  and $F0
  scf
  ret z          ; user 0 already: not
                 ; found
  push af
  ld e,0         ; BDOS function 32:
                 ; user 0
  ld c,32
  call BDOS
  call LOADCOM   ; the same file again,
                 ; in user 0
  pop bc         ; B = the user in the
                 ; high nibble
  push af        ; LOADCOM's result,
                 ; across the restore
  ld a,b
  rrca           ; the user back to bits
                 ; 0-3
  rrca
  rrca
  rrca
  ld e,a         ; and back into the
                 ; BDOS
  ld c,32
  call BDOS
  pop af
  ret

; Load an ordinary COM image through the
; public BDOS FCB/DMA interface: the
; file in CMDFCB, a record at a time
; from 0100h up to the BDOS entry's
; page.
; Carry reports missing, unreadable, or
; oversized input, with Z for missing
; only. Once loaded, LOADTOP holds the
; end of the last record read. Destroys
; BC, DE and HL.
LOADCOM:
  call DOSSEQ    ; the BDOS, by the byte
                 ; after the call
  DB 15*2+0      ; BDOS 15: open the
                 ; file in CMDFCB
  inc a          ; FFh: no such file
  scf
  ret z          ; missing: carry and Z
  ld hl,TPA      ; the first record's
                 ; address

LOADLOOP:
; up to the BDOS entry's page
  ld a,(PZBDOS+2)
  cp h
  jr z,LOADLIM   ; full: one read more
                 ; tells
  push hl
  ex de,hl       ; DE the record's
                 ; address
  call READSRC
  pop hl
  or a
  jr nz,LOADEND  ; 1 the file's end,
                 ; else an error
  ld de,128
  add hl,de      ; the next record's
                 ; address
  jr LOADLOOP

; One scratch read distinguishes an
; exact-TPA image from an oversized
; image
; without allowing a further record to
; overwrite the RAM above the TPA.
; Carry set unless that read finds the
; file's end.
LOADLIM:
  push hl
  ld de,LOADBUF  ; into scratch, past
                 ; the ceiling
  call READSRC
  pop hl
  cp 1
  jr z,LOADOK    ; the file's end: it
                 ; fitted exactly
  scf            ; a record more, or an
                 ; error: too big
  ret

; The read stopped short of the ceiling:
; code 1, the file's end, is a load
; and any other a read error.
LOADEND:
  cp 1
  jr nz,LOADBAD  ; a read error

; Loaded: HL, the end of the last record
; read, kept in LOADTOP, and the file
; closed. Carry clear.
LOADOK:
; retain record-rounded extent before
; CLOSE
  ld (LOADTOP),hl
  call DOSSEQ    ; the BDOS, by the byte
                 ; after the call
  DB 16*2+0      ; BDOS 16: close
                 ; CMDFCB's file
  or a           ; carry clear, the
                 ; close's code unread
  ret

; A read error: carry set, with NZ from
; LOADEND's compare.
LOADBAD:
  scf
  ret

; DE is the next record's DMA address.
; Set DMA, then read the source FCB.
; Each BDOS call holds this helper's
; return word plus its own return word.
; A returns 0 for a record read, 1 at
; the file's end, otherwise an error.
READSRC:
  ld c,26        ; BDOS 26: the DMA
                 ; address at DE
  call BDOS
  call DOSSEQ    ; the BDOS, by the byte
                 ; after the call
  DB 20*2+0      ; BDOS 20: read
                 ; CMDFCB's next record
  ret
