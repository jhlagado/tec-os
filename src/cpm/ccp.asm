; Portable CP/M Console Command
; Processor, CP/M 2.2 interface profile.
;
; This is an independent implementation
; against the public CP/M interfaces and
; reviewed black-box CCP fixtures.
;
; TEC-OS ROM-resident adaptation (see
; PROVENANCE.md). The code and text are
; in ROM; the command buffers, scratch
; FCBs and stack are in src/ram.asm. The
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

; RCFAIL=FF00h: this CCP's chosen
; failure code in function 108's shared
; slot.

RCFAIL EQU 255*256

; Enter on cold/warm boot with C holding
; page-zero user/drive nibbles. Use
; stack CSTKTOP. Validate the drive
; through MAXDRV/DRVIDX and fall back to
; A when unavailable. Fallback A is not
; checked here.
; Save BOOTDRV and the four-bit user.
; Set one-shot WRFLAG for BDOS 13's
; dirty/checksum reset, restore the user
; with function 32, call STBOOT and
; select non-A BOOTDRV with function 14.
; Join STARTED. This entry does not
; return.

CCPENT:
  ld sp,CSTKTOP
  ld a,c
  and $0F        ; saved drive nibble
  cp MAXDRV
  jr nc,CCPDA    ; invalid drive -> A
  ld e,a
  ld d,0
  ld hl,DRVIDX   ; drive-to-volume index
  add hl,de
  ld a,(hl)      ; 0: no mounted volume
  or a
  ld a,e         ; LD keeps flags
  jr nz,CCPDR

CCPDA:
  xor a

CCPDR:

  ld (BOOTDRV),a
  ld a,c
  rrca           ; user high -> low
  rrca
  rrca
  rrca
  and $0F
  push af        ; user across reset
  ld hl,WRFLAG   ; dirty/checksum reset
  ld (hl),$FF    ; one-shot WRFLAG
  ld c,13        ; 13: reset disks
  call BDOS
  pop af
  ld e,a
  ld c,32        ; 32: restore user
  call BDOS
  call STBOOT    ; once after cold boot
  ld a,(BOOTDRV)
  or a
  jr z,STARTED   ; A already selected
  ld e,a
  ld c,14        ; 14: restore drive
  call BDOS

; Print CRLFMSG before joining MAINLOOP.
; Some completion paths enter MAINLOOP
; directly.

STARTED:
  ld de,CRLFMSG
  call PUTSTR

; Take the next line. MAINLOOP resets
; SP=CSTKTOP; SAVEDU supplies the drive
; and packed user. A shell holding the
; hook supplies the line and its origin
; through SHLINE. Otherwise print a
; nonzero user, the drive and >, clear
; CHPOS, and take a function 47 line
; (CHPOS bit 0), then the one startup
; line, then a typed line through BDOS
; 10 on CMDBUF. STFLAG is FFh for the
; startup line, else 0.

MAINLOOP:
  ld sp,CSTKTOP  ; discard leftover
                 ; stack

MLREAD:
  call SAVEDU    ; A=drive, B=user bits
  push af        ; save drive for prompt
  ld a,(SHOWN+1)
  or a
  jr z,MLBARE    ; no shell: prompt here
  pop af
  call SHLINE    ; the shell's line
  ld (STFLAG),a  ; its origin
  ld hl,CMDTXT
  jr MLSKIP

MLBARE:
  ld a,b
  rrca
  rrca
  rrca
  rrca
  or a
  jr z,MLDRV     ; user 0: no number
  ld l,a
  ld h,0
  call PUTDEC    ; decimal user prefix

MLDRV:
  pop af
  add a,'A'      ; drive letter
  ld e,a
  call PUTCHAR
  ld e,'>'
  call PUTCHAR   ; prompt terminator
  ld hl,CHPOS    ; a function 47 line
  ld a,(hl)      ; runs whole, as one
  ld (hl),0      ; command; the flags
  rrca           ; clear at this prompt
  jr c,MLCHN
  call STLINE    ; startup before typed
  ccf            ; startup C=0 -> C=1
  sbc a,a        ; FFh startup, 0 typed
  ld (STFLAG),a  ; save line origin
  jr nz,MLGOT    ; startup already
                 ; copied
  ld de,CMDBUF
  ld c,10        ; 10: counted input
  call BDOS
  jr MLGOT

; Echo the function 47 line at CMDTXT
; to its zero, then run it as typed.

MLCHN:
  xor a
  ld (STFLAG),a  ; typed origin
  ld hl,CMDTXT

MLCH1:
  ld a,(hl)
  or a
  jr z,MLCH2
  ld e,a
  call PUTCHAR   ; keeps HL
  inc hl
  jr MLCH1

MLCH2:
  ld hl,CMDTXT
  jr MLSKIP

; End the counted line with a zero.

MLGOT:
  ld hl,CMDLEN
  ld e,(hl)      ; counted line length
  ld d,0
  inc hl
  add hl,de      ; CMDTXT+(CMDLEN)
  ld (hl),d      ; append own zero
  ld hl,CMDTXT

MLSKIP:
  call SKIPSP
  or a
  jr z,TOSTART   ; an empty line

; Fold a..z to upper case, clear
; PRGCODE and take a lone A:..P: as a
; drive change. Other lines enter
; NOTDRIVE.

MLTAKE:
  ld (ARGSTRT),hl

MLTK1:
  ld a,(hl)
  or a
  jr z,MLTK3     ; zero ends the line
  cp 'a'
  jr c,MLTKN     ; below ASCII a
  cp 'z'+1
  jr nc,MLTKN    ; above ASCII z
  and $DF        ; ASCII uppercase
  ld (hl),a

MLTKN:
  inc hl
  jr MLTK1

MLTK3:
  ld hl,0        ; new command success
  ld (PRGCODE),hl
  ld hl,(ARGSTRT)
  ld a,(hl)
  sub 'A'
  cp 16          ; A..P?
  jr nc,NOTDRIVE
  ld b,a         ; possible drive 0..15
  inc hl
  ld a,(hl)
  cp ':'

  jr nz,NOTDRIVE
  inc hl
  call SKIPSP    ; drive-only suffix
  or a           ; A: the next byte

  jr nz,NOTDRIVE
  call VFLUSH    ; write-behind moves
  ld a,b
  ld (BOOTDRV),a
  ld e,a
  ld c,14        ; 14: select drive
  call BDOS
  call SAVEDU    ; save selected drive

TOSTART:
  jp STARTED

; Call the shell's LINE entry: A holds
; CHPOS's flags, then cleared (bit 0 a
; function 47 line at DE, bit 1 the rest
; dropped), DE is CMDTXT, and HFLAG lets
; one BDOS 10 use the history. It
; writes a zero-ended line at DE and
; returns A, its origin. B and C are
; the lowest owner's page and the
; stub's, for a listing of services.

SHLINE:
  ld hl,HFLAG
  ld (hl),$FF    ; history for one line
  ld a,(STUBAD+1)
  ld c,a         ; C = the stub's page
  ld a,(SVCHEAD)
  ld b,a         ; B = the lowest owner
  ld hl,CHPOS
  ld e,(hl)      ; the flags
  ld (hl),0
  xor a
  call SHENT     ; HL = LINE
  ld a,e
  ld de,CMDTXT
  call VHLJP
  ld hl,CMDTXT+127
  ld (hl),0      ; the line is bounded
  ld hl,HFLAG
  ld (hl),0      ; not for a program
  ret

; HL = word A of the shell's table at
; SHOWN. The table does not cross a
; page. Changes AF.

SHENT:
  ld hl,(SHOWN)
  add a,l
  ld l,a
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a
  ret

; Save prompt state at 0004h: query BDOS
; user 32, shift its low nibble into B
; bits 4..7 and preserve B over
; default-drive query 25. Pack both into
; CURDSK and return drive in A/C.
; The saved user is four bits, even
; though BDOS accepts five. Normal USER
; input is 0..15. DE/HL/F may change
; through BDOS.

SAVEDU:
  ld e,$FF
  ld c,32        ; 32: query user
  call BDOS
  add a,a        ; low user nibble -> B
  add a,a
  add a,a
  add a,a
  ld b,a
  push bc        ; user across drive
                 ; call
  ld c,25        ; 25: logical default
  call BDOS
  pop bc
  ld c,a
  or b
  ld (CURDSK),a  ; packed page-zero byte
  ld a,c
  ret

; Dispatch the uppercased zero-ended
; piece at (ARGSTRT). Print a newline,
; set CMDSTRT through CMDSKIP, parse the
; first word into CMDFCB and retain the
; argument delimiter in ARGSTRT.
; Walk KEYTAB word/zero/address entries
; with ISCMD. Tail-jump a matching
; handler, which reads ARGSTRT. On
; mismatch skip only the remaining
; keyword suffix, zero and handler word.
; Table end requires an unambiguous file
; name before SVC/COM dispatch.

NOTDRIVE:
  ld de,CRLFMSG  ; command output
                 ; newline
  call PUTSTR

  ld hl,(ARGSTRT)
  call CMDSKIP   ; diagnostic word start
  call CMDPARSE  ; first word -> CMDFCB

  ld (ARGSTRT),hl
  ld de,KEYTAB   ; word/zero/handler

KEYNXT:
  call ISCMD     ; DE=keyword mismatch
  ex de,hl       ; HL=remaining suffix
  jr nz,KEYSK    ; skip unmatched suffix
  inc hl
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a
  jp (hl)        ; handler reads ARGSTRT

KEYSK:
  ld a,(hl)      ; skip through keyword
                 ; 0
  inc hl
  or a
  jr nz,KEYSK
  inc hl         ; skip handler word
  inc hl
  ex de,hl       ; DE=next keyword
  ld a,(de)
  or a
  jr nz,KEYNXT   ; zero ends KEYTAB
  ld de,CMDFCB
  call UNAMBIG   ; reject empty/wildcard
  jp c,BADCMD

; Exact type SVC enters the loader's
; SVCRUN, without LOADA's user/drive
; fallback: it enters a service that is
; in, or installs the file. Other types
; load as COM, CMD among them, so a
; typed NAME.CMD with no shell runs
; NAME.COM.

  ld hl,(CMDFCB+9)
  ld de,'V'*256+'S'
  sbc hl,de      ; UNAMBIG cleared carry
  jr nz,CMDCOM   ; not SV?: COM path
  ld a,(CMDFCB+11)
  cp 'C'
  jr nz,CMDCOM   ; SV?: COM path
  jp SVCRUN

; A failed install is quiet only for a
; startup line (STFLAG nonzero) with
; SVCRC=1 and SVCRA=TNENODV: INIT found
; no device. PRGCODE stays 0, so a
; following & piece runs. Typed input
; and other failures enter BADCMD.

SVCFAIL:
  ld hl,(SVCRC)  ; L=status, H=INIT A
  ld a,(STFLAG)  ; startup-line flag
  and h          ; startup gates INIT A
  xor TNENODV    ; compare absent-device
  dec l          ; require SVCRC=1
  or l           ; both conditions zero
  jr nz,BADCMD

SVCOK:
  jp STARTED     ; normal newline entry

; Load a COM image: force type COM and
; call LOADA on the named/default drive.
; Carry clear enters CMDRUN. Carry/NZ
; rejects unloadable input. Carry/Z may
; retry A only for an unqualified name
; when PZDU's drive is not A. LOADA
; controls each drive's user-0 retry.

CMDCOM:
  ld hl,'O'*256+'C'
  ld (CMDFCB+9),hl
  ld a,'M'       ; type COM

  ld (CMDFCB+11),a
  call LOADA     ; first drive/user try
  jr nc,CMDRUN   ; carry clear: loaded
  jr nz,BADCMD   ; carry/NZ: reject
  ld hl,CMDFCB   ; carry/Z: retry check
  ld a,(hl)
  or a
  jr nz,BADCMD   ; explicit drive: stop
  ld a,(PZDU)    ; saved prompt drive
  and $0F
  jr z,BADCMD    ; already A: stop
  inc (hl)       ; FCB drive 1=A
  call LOADA     ; A, user then user 0
  jr c,BADCMD    ; retry failed

; After a successful load, PREPPAGE
; publishes argument FCBs, tail and
; default DMA. Copy CMDFCB's drive byte
; to PZLDRV (0=current, 1=A, etc). Set
; SP=CSTKTOP, push WBOOT and jump to
; TPA=0100h with A=STFLAG, FFh for a
; startup line and 0 otherwise. The
; normal final RET warm boots through
; 0000h. CMDRN1 takes another entry in
; HL: SVCENT enters a service's
; execution entry by it.

CMDRUN:
  ld hl,TPA      ; transient entry

CMDRN1:
  push hl        ; the entry
  call PREPPAGE  ; arguments/FCBs/DMA
  ld a,(CMDFCB)  ; source FCB drive byte
  ld (PZLDRV),a  ; publish loaded drive
  pop de         ; the entry

; The transient's two-byte return word
; is outside default DMA (0080h..00FFh).
; CCPSTN=32 leaves 30 bytes below it
; before the stack base.

  ld sp,CSTKTOP
  ld hl,WBOOT    ; 0000h warm-boot hook
  push hl
  ex de,hl       ; HL = the entry
  ld a,(STFLAG)  ; FFh: a startup line
  jp (hl)        ; transient or service

; Locate an argument for
; parsing/diagnostics. ARGSKIP loads
; HL=(ARGSTRT). CMDSKIP starts at input
; HL. Skip literal SPACE, save the
; pointer in CMDSTRT and return A=first
; byte, HL at it, Z at zero.

ARGSKIP:
  ld hl,(ARGSTRT)

CMDSKIP:
  call SKIPSP

  ld (CMDSTRT),hl
  or a           ; Z at end
  ret

; Require one unambiguous name at HL:
; parse into CMDFCB, validate through
; CPCHK and fall into ENDCHK for no
; non-space remainder. Rejection enters
; BADCMD nonlocally.

ONENAME:
  call CMDPARSE
  call CPCHK     ; reject empty/wildcard

; Require only literal spaces after
; input HL. Return at zero. Otherwise
; enter BADCMD. Preserve B: SKIPSP uses
; A/HL only.

ENDCHK:
  call SKIPSP
  or a
  ret z          ; zero: no extra word
  jr BADCMD

; Parse a reference from HL. CMDPARSE
; sets DE=CMDFCB. FCBPARSE takes DE
; explicitly and calls PARSEFCB. If
; PARSEFCB returns carry, FCBPARSE
; enters BADCMD. Otherwise return with
; HL at the delimiter. Empty/ambiguous
; names need separate CPCHK/UNAMBIG
; validation.

CMDPARSE:
  ld de,CMDFCB

FCBPARSE:
  call PARSEFCB
  ret nc         ; valid parse

; Report the offending word from
; (CMDSTRT) up to SPACE or zero, append
; ? and fall into ERRGO with CRLFMSG.
; PUTCHAR preserves traversal HL. ERRGO
; records failure in PRGCODE.

BADCMD:

  ld hl,(CMDSTRT)

BADLOOP:
  ld a,(hl)
  or a
  jr z,BADEND    ; zero ends diagnostic
  cp SPACE
  jr z,BADEND    ; space ends diagnostic
  ld e,a
  call PUTCHAR   ; PUTCHAR keeps HL
  inc hl
  jr BADLOOP

BADEND:
  ld e,'?'       ; append question mark
  call PUTCHAR
  ld de,CRLFMSG  ; newline message

; ERRGO sets PRGCODE=RCFAIL (FF00h), so
; the shell skips a following & piece.
; PRTGO prints the
; dollar-ended message at DE and joins
; STARTED without itself changing
; PRGCODE.

ERRGO:
  ld hl,RCFAIL

  ld (PRGCODE),hl

PRTGO:
  call PUTSTR    ; dollar-ended message
  jp STARTED

; Retry LOADCOM's carry/Z (FFh-open)
; classification under user 0 when
; PZDU's saved user is nonzero. On
; success or carry/NZ return
; immediately.
; No SYS attribute is required (A7).
; Preserve the retried A/flags over
; restoring the saved user through BDOS
; 32 on a returning path. Nonlocal
; aborts do not reach that restore.
; Changes BC/DE/HL.

LOADA:
  call LOADCOM
  ret nc         ; loaded: no fallback
  ret nz         ; unloadable: stop
  ld a,(PZDU)    ; saved prompt user
  and $F0
  scf
  ret z          ; user 0: no retry
  push af
  ld e,0
  ld c,32
  call BDOS
  call LOADCOM   ; same drive/file
  pop bc         ; saved user in B
  push af        ; retry result across
                 ; set
  ld a,b
  rrca           ; saved nibble -> E
  rrca
  rrca
  rrca
  ld e,a
  ld c,32
  call BDOS
  pop af
  ret

; Load CMDFCB through public BDOS
; FCB/DMA calls. Open with function 15:
; Classify FFh open as carry/Z without
; inspecting H. Other results start at
; 0100h.
; Read 128-byte records through READSRC,
; saving the destination pointer. Stop
; at the page-aligned BDOS ceiling from
; 0007h. LOADLIM probes in scratch.
; Nonzero read status enters LOADEND.
; Success publishes LOADTOP through
; LOADOK. Changes BC/DE/HL. A/flags
; follow the result path.

LOADCOM:
  call DOSSEQ    ; inline open
                 ; descriptor
  DB 15*2+0      ; 15: CMDFCB
  inc a          ; FFh open -> Z
  scf
  ret z          ; carry/Z
                 ; classification
  ld hl,TPA      ; TPA first record

LOADLOOP:

  ld a,(PZBDOS+2)
  cp h
  jr z,LOADLIM   ; at ceiling: probe
  push hl        ; keep destination
  ex de,hl       ; DMA destination
  call READSRC   ; set DMA, then read
  pop hl
  or a
  jr nz,LOADEND  ; nonzero read result
  ld de,128
  add hl,de
  jr LOADLOOP

; At the exclusive load ceiling, read
; once into LOADBUF while preserving HL,
; then fall into LOADEND's test. Code 1
; is EOF: LOADOK. Otherwise LOADBAD
; returns carry/NZ: 0 is an extra record
; and other values are read errors. No
; probe data reaches the resident
; ceiling.

LOADLIM:
  push hl        ; keep exclusive
                 ; ceiling
  ld de,LOADBUF  ; probe in LOADBUF
  call READSRC
  pop hl

; Classify a nonzero read result before
; the ceiling: code 1 enters LOADOK,
; otherwise enter LOADBAD. HL is the
; next-record address, preserved around
; READSRC.

LOADEND:
  cp 1
  jr nz,LOADBAD  ; non-EOF read error

; Publish HL as LOADTOP, the
; record-rounded exclusive end (0100h
; for empty input), before requesting
; BDOS 16 close. Its ordinary result is
; unchecked. Return A=close's code with
; carry clear and Z from A. Nonlocal
; aborts do not take that return.

LOADOK:

  ld (LOADTOP),hl
  call DOSSEQ    ; inline close
                 ; descriptor
  DB 16*2+0      ; 16: CMDFCB
  or a           ; ignore close result
  ret

; Return a non-EOF read failure: input
; NZ comes from LOADEND's CP 1. SCF sets
; carry and keeps NZ, suppressing
; LOADA's missing-file fallback.

LOADBAD:
  scf
  ret

; Read the source record into DMA
; address DE. BDOS 26 sets DMA. DOSSEQ
; descriptor 40 selects BDOS 20 on
; CMDFCB. Its decode preserves A/B/HL
; only until BDOS dispatch.
; Ordinary return A: 0 read, 1 EOF or
; another result. BDOS result
; registers/clobbers apply. Each call
; holds its return word above READSRC's
; caller word.

READSRC:
  ld c,26        ; 26: DMA from DE
  call BDOS
  call DOSSEQ    ; inline read
                 ; descriptor
  DB 20*2+0      ; 20: CMDFCB
  ret
