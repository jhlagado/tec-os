; Portable CP/M BDOS, CP/M 2.2 interface
; profile.
;
; TEC-OS ROM-resident adaptation of
; Portable CP/M (see PROVENANCE.md).
; Code and constant text stay in ROM.
; Every variable and the BDOS stack live
; in the BDOS RAM block in src/ram.asm,
; which the BIOS clears at cold and warm
; boot before setting CURDMA to $0080.

BDOSBAS:

; The BDOS reaches the BIOS through the
; RAM copy of its jump table, as CP/M
; 2.2 does with its BIOS in RAM, so a
; program that replaces an entry there
; sees the BDOS's own calls: its console
; output and input, ^C and the warm boot
; after a disk error.

BIOWBT EQU RAMBIOS+$03
BIOCST EQU RAMBIOS+$06
BIOCIN EQU RAMBIOS+$09
BIOCOT EQU RAMBIOS+$0C
BIOLST EQU RAMBIOS+$0F
BIOPUN EQU RAMBIOS+$12
BIORDR EQU RAMBIOS+$15
BIOHOM EQU RAMBIOS+$18
BIOSEL EQU RAMBIOS+$1B
BIOTRK EQU RAMBIOS+$1E
BIOSEC EQU RAMBIOS+$21
BIODMA EQU RAMBIOS+$24
BIORDS EQU RAMBIOS+$27
BIOWRS EQU RAMBIOS+$2A
BIOTRN EQU RAMBIOS+$30

CTRLC EQU 3
CTRLE EQU 5
BACKSP EQU 8
TAB EQU 9
LF EQU 10
CR EQU 13
CTRLP EQU 16
CTRLR EQU 18
CTRLS EQU 19
CTRLU EQU 21
CTRLX EQU 24
CTRLW EQU 23
CTRLN EQU 14
SPACE EQU 32
DELETE EQU $7F

; Function 47, chain (TEC-OS's, from
; CP/M 3's): the command at the DMA
; address, ended by a 0 within 128 bytes
; and holding no CR or LF, replaces what
; is left of the CCP's line, and the
; program ends by warm boot; the CCP
; runs it next, before any startup line.
; It may hold ! and :, and E is ignored.
; Otherwise A = FFh and the program goes
; on, the line unchanged. FNCHNO is also
; the FFh return for functions 44 and
; 99.

FNCHAIN:

; the command at the DMA address

  ld hl,(CURDMA)
  ld b,128       ; its 0 must come
                 ; within 128 bytes

FNCH1:
  ld a,(hl)      ; the command's next
                 ; byte
  or a
  jr z,FNCH2     ; its 0: the command
                 ; fits
  cp CR          ; a CR or LF would end
                 ; the CCP's line
  jr z,FNCHNO
  cp LF
  jr z,FNCHNO
  inc hl         ; none of those: on
  djnz FNCH1     ; no 0 in 128 bytes:
                 ; refused

FNCHNO:
  ld a,$FF       ; refused, or not
                 ; supported: A = FFh
  jr RETA

FNCH2:

; the command, its 0 and what follows

  ld hl,(CURDMA)
  ld de,CMDTXT   ; over the CCP's
                 ; command line
  ld bc,128      ; the 128 bytes the
                 ; check allowed
  ldir
  ld a,1         ; its first piece next
  ld (CHPOS),a
  jp BIOWBT      ; the program ends; the
                 ; CCP runs it

; ^C at a line's start and a BDOS
; error's exit end the program by warm
; boot, and the rest of a chained line
; goes with it. Never returns.

CHDROP:
  xor a          ; no chained piece left
  ld (CHPOS),a   ; the CCP reads it
                 ; after warm boot
  jp BIOWBT

; The BDOS's entry, reached by CALL
; 0005h with C the function and DE its
; parameter. It keeps the caller's SP in
; OLDSP and DE in PARAM, and runs on the
; BDOS's own stack. Functions 44 to 48,
; 99 and 108 go to their routines here,
; and any other past 40 returns A = 0.
; The rest go through FNTAB, those with
; their bit set in FCBMAP after their
; FCB's drive is bound (FCBSEL). Each
; routine is entered by a jump, with C
; the function and DE the parameter, and
; ends at RETZERO, RETA or RETWORD,
; which return to the program. Any
; register may change.

BENTRY:
  ld (OLDSP),sp  ; the caller's stack,
                 ; for the return
  ld sp,STKTOP   ; the BDOS's own stack
  ld (PARAM),de  ; the parameter, for
                 ; the function
  ld a,c
  cp 108         ; the functions FNTAB
                 ; does not hold
  jr z,FNRETC    ; 108: the program's
                 ; return code
  cp 47
  jp z,FNCHAIN   ; 47: chain
  cp 44
  jr z,FNMULT    ; 44: the multi-sector
                 ; count
  cp 45
  jr z,FNERRM    ; 45: the error mode
  cp 46
  jp z,FNFREE    ; 46: free space
  cp 48
  jr z,FNFLSH    ; 48: flush
  cp 99
  jr z,FNCHNO    ; truncate: FFh,
                 ; nothing changed
  cp 41          ; FNTAB's 41: functions
                 ; 0 to 40
  jr nc,RETZERO  ; any other past 40: A
                 ; = 0
  add a,a        ; FNTAB's word for
                 ; function C
  ld e,a
  ld d,0
  ld hl,FNTAB
  add hl,de      ; HL -> the routine's
                 ; address
  ld e,(hl)      ; its address, low byte
                 ; first
  inc hl
  ld d,(hl)      ; DE = the routine

; its FCB bit: byte C/8, bit C mod 8

  ld hl,FCBMAP-1
  ld a,c

FCBBYTE:
  inc hl         ; a byte on for each 8
                 ; in C
  sub 8          ; until C/8 bytes are
                 ; passed
  jr nc,FCBBYTE
  ld b,a         ; (C mod 8) - 8
  ld a,(hl)      ; the function's byte
                 ; of FCBMAP

FCBBIT:
  rlca           ; 8 - (C mod 8) turns:
                 ; the bit in carry
  inc b
  jr nz,FCBBIT
  ex de,hl       ; HL = the routine

; no FCB: straight to it

  jr nc,DISPATCH
  push hl        ; the routine, kept
                 ; over FCBSEL
  call FCBSEL    ; the FCB's drive bound
                 ; first
  pop hl

DISPATCH:
  ld de,(PARAM)  ; DE as the program
                 ; gave it
  jp (hl)        ; the function; C still
                 ; holds its number

; Function 44, CP/M 3's multi-sector
; count: E = 1, the only count,
; succeeds; any other returns FFh at
; FNCHNO, as function 99, truncate, does
; with nothing changed.

FNMULT:
  dec e          ; Z: a count of 1
  jr nz,FNCHNO

; A function's return with A = 0, as
; RETA below.

RETZERO:
  xor a          ; success, or nothing
                 ; to return

; A function's return with A, also in L,
; and H = 0, as RETWORD below.

RETA:
  ld l,a         ; the value in HL too
  ld h,0

; A function's return with HL, also in A
; (L) and B (H), as CP/M 2.2 gives a
; function's value, to the program on
; its own stack (OLDSP). Any other
; register is as the function left it.

RETWORD:
  ld a,l         ; CP/M 2.2's
                 ; convention: A = L, B
                 ; = H
  ld b,h
  ld sp,(OLDSP)  ; the caller's stack
                 ; back
  ret            ; to the program

; Function 0, system reset: the program
; ends by warm boot. Never returns.

FNZERO:
  jp BIOWBT      ; through the RAM jump
                 ; table

; Function 45, CP/M 3's error mode: E =
; FFh, a BDOS error returns to the
; program with A = FFh and H its code,
; and no message; FEh, the message and
; then the same return; any other, the
; default: the message, a key, and the
; program ends with the rest of a
; chained line. Warm boot puts it back
; to 0. Returns A = 0.

FNERRM:
  ld a,e         ; the mode, kept until
                 ; warm boot
  ld (ERRMODE),a
  jr RETZERO

; Function 48, CP/M 3's flush: every
; changed line of the cache written. A =
; 0, or FFh if any write failed, its
; line then dropped; E = FFh's purge is
; the same flush, since dropping clean
; lines changes nothing a program can
; see.

FNFLSH:
  call VFLUSH    ; A = FFh, the line
                 ; CFLALL leaves
  jr nz,RETA     ; a write failed: FFh
  jr RETZERO

; Function 108, CP/M 3's program return
; code: DE = FFFFh gets it into HL; any
; other DE sets it, returning A = 0. One
; code for every program.

FNRETC:
  ld hl,(PARAM)  ; DE: FFFFh or the code
  ld a,h
  and l
  inc a          ; Z: DE = FFFFh, a
                 ; query
  jr z,FNRETG

; any other: the new code

  ld (PRGCODE),hl
  jr RETZERO

FNRETG:

; the code, returned in HL

  ld hl,(PRGCODE)
  jr RETWORD

; Function 1, console input: the next
; key, waited for and echoed, a tab as
; spaces. Returns it in A. Any register
; may change.

FNCIN:
  call GETCHAR   ; a key kept by a
                 ; status check first
  ld c,a         ; ECHOCHAR takes it in
                 ; C
  push af        ; the key, kept over
                 ; the echo
  call ECHOCHAR
  pop af
  jr RETA

; Function 2, console output: E to the
; console, a tab as spaces, ^S and ^P
; taken from the keyboard first. Returns
; A = 0.

FNCOUT:
  ld a,(PARAM)   ; E, the character
  ld c,a         ; OUTCHAR takes it in C
  call OUTCHAR
  jr RETZERO

; Function 3, reader input: a byte from
; the BIOS's reader, returned in A.

FNREAD:
  call BIORDR    ; through the RAM jump
                 ; table
  jr RETA

; Function 4, punch output: E to the
; BIOS's punch. Returns A = 0.

FNPUNCH:
  ld a,(PARAM)   ; E, the byte
  ld c,a         ; the BIOS takes it in
                 ; C
  call BIOPUN
  jr RETZERO

; Function 5, list output: E to the
; BIOS's printer. Returns A = 0.

FNLIST:
  ld a,(PARAM)   ; E, the byte
  ld c,a         ; the BIOS takes it in
                 ; C
  call BIOLST
  jp RETZERO

; Function 6, direct console I/O: E =
; FFh returns a key in A, or 0 with none
; ready, neither waiting nor echoing.
; Any other E goes to DIROUT.

FNDIRECT:
  ld a,(PARAM)   ; E
  cp $FF         ; FFh: input
  jr nz,DIROUT   ; not FFh: output
  call CONSTAT   ; a key ready, or one
                 ; kept?
  or a
  jp z,RETZERO   ; none: A = 0
  call GETCHAR   ; the key, not echoed
  jp RETA

; Function 6's output: A, its E, to the
; console as it is, with no tab
; expanded, no ^S or ^P taken and no
; column counted. Returns A = 0.

DIROUT:
  ld c,a         ; the BIOS takes it in
                 ; C
  call BIOCOT    ; straight to the
                 ; BIOS's console output
  jp RETZERO

; Function 7, get IOBYTE: the I/O
; assignments, returned in A.

FNGETIO:
  ld a,(IOBYTE)  ; at 0003h
  jp RETA

; Function 8, set IOBYTE: E becomes the
; I/O assignments. Returns A = 0.

FNSETIO:
  ld a,(PARAM)   ; E
  ld (IOBYTE),a
  jp RETZERO

; Function 9, print string: the text at
; DE, up to a '$', to the console as
; function 2 sends each character.
; Returns A = 0.

FNPRINT:
  ld hl,(PARAM)  ; DE, the text

PRLOOP:
  ld a,(hl)
  cp '$'         ; its end, not sent
  jp z,RETZERO
  inc hl         ; the next character's
                 ; place
  push hl        ; the place, kept over
                 ; the output
  ld c,a
  call OUTCHAR
  pop hl
  jr PRLOOP

; Function 10, read console buffer: a
; line typed into the buffer at DE,
; whose first byte is its maximum; the
; count goes in the second and the
; characters follow. CR or LF ends it,
; as does reaching the maximum. The
; editing keys: BS and DEL take the last
; character back (BS erases it, DEL
; echoes it), ^C at the line's start
; ends the program, ^E starts a new
; screen line, ^R retypes the line, ^U
; discards it, ^X erases it and ^P turns
; the printer echo on or off. At the
; CCP's prompt (HFLAG) ^W and ^N recall
; the history's lines, and the line is
; stored there. Returns A = 0. Any
; register may change. The labels from
; LINTGL to LINDONE are its parts.

FNLINE:
  ld a,(HHEAD)   ; no line shown from
                 ; the history yet
  ld (HPOS),a    ; HREC's starting point
  ld hl,(PARAM)  ; the buffer
  ld a,(hl)
  ld (LINMAX),a  ; its maximum
  inc hl
  xor a          ; nothing typed yet
  ld (hl),a      ; its count 0, and
                 ; LINCNT's
  ld (LINCNT),a
  inc hl

; the next character goes at its start

  ld (LINPTR),hl

LINLOOP:
  call GETCHAR   ; the next key, not yet
                 ; echoed
  ld c,a         ; the key, in C for the
                 ; echo
  cp CR          ; CR or LF: the line
                 ; ends
  jp z,LINDONE
  cp LF
  jp z,LINDONE
  cp CTRLP       ; ^P: the printer echo
  jr z,LINTGL
  cp BACKSP      ; BS: back one, erased
  jr z,LINBACK
  cp DELETE      ; DEL: back one, echoed
  jr z,LINDEL
  cp CTRLC       ; ^C: the program ends
  jp z,LINABRT
  cp CTRLE       ; ^E: a new screen line
  jp z,LINEOL
  cp CTRLR       ; ^R: the line retyped
  jp z,LINRETY
  cp CTRLU       ; ^U: the line
                 ; discarded
  jp z,LINCTU
  cp CTRLX       ; ^X: the line erased
  jp z,LINCLEAR
  cp CTRLW       ; ^W or ^N: the history
  jr z,LINHIST
  cp CTRLN       ; ^N: the line after
  jr z,LINHIST

LINCHR:
  ld a,(LINCNT)  ; any other: a
                 ; character, if it fits
  ld b,a
  ld a,(LINMAX)
  cp b
  jp z,LINDONE   ; full: the key echoed
                 ; and the line ends
  ld a,c         ; the character stored

; at the buffer's next place

  ld hl,(LINPTR)
  ld (hl),a
  inc hl
  ld (LINPTR),hl
  ld a,b         ; and counted
  inc a
  ld (LINCNT),a
  call ECHOCHAR  ; the character shown
  ld a,(LINCNT)  ; full now?
  ld b,a
  ld a,(LINMAX)
  cp b
  jr nz,LINLOOP  ; room for more
  ld c,CR        ; full: the line ends
                 ; as if by CR
  jp LINDONE

; ^P in a line: the printer echo turned
; on or off; nothing stored.

LINTGL:
  call TOGLIST   ; LISTEN 0 or 1
  jr LINLOOP

; ^W or ^N in a line, in C: at the CCP's
; prompt, the history's line before or
; after the one shown replaces the line;
; in a program's line, a character.

LINHIST:
  ld a,(HFLAG)   ; FFh at the CCP's
                 ; prompt
  or a
  jr z,LINCHR    ; a program's call: a
                 ; character
  call HREC      ; the line before (^W)
                 ; or after (^N)
  jr LINLOOP

; BS in a line: the last character taken
; back and erased from the screen;
; nothing at the line's start.

LINBACK:
  ld a,(LINCNT)  ; any character to take
                 ; back?
  or a
  jr z,LINLOOP   ; an empty line:
                 ; nothing to take back
  dec a          ; one fewer counted
  ld (LINCNT),a

; the buffer's place back one

  ld hl,(LINPTR)
  dec hl
  ld (LINPTR),hl
  call ERASE1    ; backspace, space,
                 ; backspace
  jp LINLOOP

; DEL in a line: the last character
; taken back and echoed, as CP/M 2.2's
; rubout shows it; nothing at the line's
; start.

LINDEL:
  ld a,(LINCNT)  ; any character to take
                 ; back?
  or a
  jp z,LINLOOP   ; an empty line:
                 ; nothing to take back
  dec a          ; one fewer counted
  ld (LINCNT),a

; the buffer's place back one

  ld hl,(LINPTR)
  dec hl
  ld (LINPTR),hl
  ld c,(hl)      ; the character taken
                 ; back, echoed
  call ECHOCHAR
  jp LINLOOP

; ^C in a line: at its start, ^C is
; echoed and the program ends by warm
; boot with the rest of a chained line
; (CHDROP); anywhere else it is ignored.

LINABRT:
  ld a,(LINCNT)  ; the line's start?
  or a
  jp nz,LINLOOP  ; within a line:
                 ; ignored

; a ^C left at the buffer's start

  ld hl,(LINPTR)
  ld (hl),CTRLC
  ld c,'^'       ; echoed as ^C
  call ECHOCHAR
  ld c,'C'
  call ECHOCHAR
  jp CHDROP      ; the program ends by
                 ; warm boot

; ^E in a line: CR and LF to the
; console, the line going on; nothing
; stored.

LINEOL:
  ld c,CR
  call ECHOONE   ; a new screen line,
                 ; the column 0
  ld c,LF
  call ECHOONE
  jp LINLOOP

; ^R in a line: # and a new screen line,
; then the line so far retyped.

LINRETY:
  ld c,'#'       ; the old screen line
                 ; marked as left
  call ECHOONE
  ld c,CR        ; then a new screen
                 ; line
  call ECHOONE
  ld c,LF
  call ECHOONE
  ld hl,(PARAM)  ; the buffer's
                 ; characters
  inc hl         ; past the maximum and
                 ; the count
  inc hl
  ld a,(LINCNT)  ; B = how many
  ld b,a

RETYLP:
  ld a,b
  or a
  jp z,LINLOOP   ; an empty line:
                 ; nothing to retype
  ld c,(hl)      ; the next character
  push bc        ; the count and place,
                 ; kept over the echo
  push hl
  call ECHOCHAR  ; the character, a tab
                 ; as spaces
  pop hl
  pop bc
  inc hl
  djnz RETYLP    ; the next
  jp LINLOOP

; ^U in a line: # and a new screen line,
; and the line discarded, its count 0.

LINCTU:
  ld c,'#'       ; the old screen line
                 ; marked as left
  call ECHOONE
  ld c,CR        ; then a new screen
                 ; line
  call ECHOONE
  ld c,LF
  call ECHOONE
  xor a          ; the line discarded:
                 ; its count 0
  ld (LINCNT),a
  ld hl,(PARAM)  ; and the next
                 ; character at its
                 ; start
  inc hl         ; past the maximum and
                 ; the count
  inc hl
  ld (LINPTR),hl
  jp LINLOOP

; ^X in a line: every character erased
; from the screen and the buffer.

LINCLEAR:
  call LINERASE
  jp LINLOOP

; The line so far erased from the
; screen, a character at a time, and
; from the buffer: LINCNT to 0 and
; LINPTR back to the buffer's start.
; Also called by the history (HRSHOW).
; Changes A, C, HL and what the BIOS's
; output does.

LINERASE:
  ld a,(LINCNT)  ; any character left?
  or a
  ret z          ; nothing left
  call ERASE1    ; the last character
                 ; erased
  ld a,(LINCNT)  ; one fewer counted
  dec a
  ld (LINCNT),a

; the buffer's place back one

  ld hl,(LINPTR)
  dec hl

; and taken from the buffer

  ld (LINPTR),hl
  jr LINERASE

; The line ended by the key in C, which
; is echoed: CR or LF, or the key that
; found the buffer full. The count goes
; in the buffer's second byte, and at
; the CCP's prompt a line of a byte or
; more goes into the history. HFLAG is
; cleared, so a program's later line is
; not stored. Returns A = 0.

LINDONE:
  call ECHOCHAR  ; the key that ended
                 ; the line
  ld hl,(PARAM)  ; the count into the
                 ; buffer
  inc hl
  ld a,(LINCNT)  ; the count, in the
                 ; second byte
  ld (hl),a
  inc hl         ; DE = its characters,
                 ; B = the count
  ex de,hl
  ld b,a
  ld hl,HFLAG    ; the CCP's line, once:
                 ; warm boot clears it
                 ; too
  ld a,(hl)      ; FFh at the CCP's
                 ; prompt, else 0
  ld (hl),0
  and b          ; NZ: the CCP's prompt
                 ; and a count

; a CCP line of at least one byte

  call nz,HSTORE
  jp RETZERO

; Function 11, console status: A = 1 if
; a key is ready, else 0. A key found
; ready is read at once and kept
; (PENDING, PENDCHR) for the next read.

FNSTAT:

; a key already kept?

  ld a,(PENDING)
  or a
  jr nz,STATYES  ; one kept: ready
  call BIOCST    ; the BIOS's status,
                 ; FFh or 0
  or a
  jp z,RETZERO   ; none: A = 0
  call BIOCIN    ; read and kept for the
                 ; next read
  ld (PENDCHR),a
  ld a,1         ; marked as kept
  ld (PENDING),a

STATYES:
  ld a,1         ; ready: A = 1, as CP/M
                 ; 2.2 returns
  jp RETA

; Function 12, version: HL = 0022h, CP/M
; 2.2 (A = 22h, B = H = 0).

FNVERS:
  ld a,$22       ; 2.2; H = 0: CP/M, not
                 ; MP/M
  jp RETA
