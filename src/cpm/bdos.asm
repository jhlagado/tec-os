; Portable CP/M BDOS with the CP/M 2.2
; interface, adapted for TEC-OS ROM
; residency. Provenance: PROVENANCE.md.
; Code and constant text stay in ROM.
; The BDOS workspace and stack are in
; src/ram.asm. CPMINIT clears that RAM
; at cold/warm boot and sets
; CURDMA=0080h.

BDOSBAS:

; These aliases name RAM BIOS entries.
; Calls through them reach installed
; hooks for BDOS input, output and warm
; boot.
; CONSTQ is the exception: output-time
; polling calls ROM BCONST without
; drawing the cursor.

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

; Function 47: replace the chained
; remainder with text at the DMA address
; in CURDMA. E is ignored. The text must
; contain zero within 128 bytes and no
; CR/LF before it. ! and : are allowed.
; Validate before changing CMDTXT/CHPOS,
; then copy all 128 DMA bytes, set
; CHPOS=1 and jump through BIOWBT. The
; CCP runs the chain before startup.
; Invalid input returns A=FFh through
; RETA with the command unchanged.
; FNCHNO is also the FFh tail for 44/99.

FNCHAIN:

  ld hl,(CURDMA)
  ld b,128       ; terminator bound

FNCH1:
  ld a,(hl)      ; next DMA byte
  or a
  jr z,FNCH2     ; zero ends validation
  cp CR          ; no CR/LF before zero
  jr z,FNCHNO
  cp LF
  jr z,FNCHNO
  inc hl
  djnz FNCH1     ; 128 bytes, no zero

FNCHNO:
  ld a,$FF       ; invalid/unsupported
  jr RETA

FNCH2:

  ld hl,(CURDMA)
  ld de,CMDTXT   ; replace command text
  ld bc,128      ; copy full DMA record
  ldir
  ld a,1         ; start chained pieces
  ld (CHPOS),a
  jp BIOWBT      ; RAM warm-boot hook

; Discard the chained remainder by
; clearing CHPOS, then jump through
; BIOWBT. The normal warm-boot hook ends
; the transient without returning here.

CHDROP:
  xor a
  ld (CHPOS),a   ; drop chained pieces
  jp BIOWBT

; BDOS entry: CALL 0005h with C=function
; and DE=parameter. Save SP in OLDSP and
; DE in PARAM. Use stack STKTOP.
; Handle 44-48, 99 and 108 directly.
; Other values above 40 return zero.
; For 0-40 look up the handler in FNTAB.
; A set FCBMAP bit requires FCBSEL drive
; binding. FCBSEL receives the original
; C but binding may change C. Save the
; handler over that call, reload DE from
; PARAM and jump to it.
; RETZERO/RETA/RETWORD return to the
; program on OLDSP. Any register may
; change.

BENTRY:
  ld (OLDSP),sp  ; save caller stack
  ld sp,STKTOP   ; internal BDOS stack
  ld (PARAM),de  ; save original
                 ; parameter
  ld a,c
  cp 108         ; direct dispatch cases
  jr z,FNRETC    ; 108: return-code slot
  cp 47
  jp z,FNCHAIN   ; 47: chain
  cp 44
  jr z,FNMULT    ; 44: count 1 only
  cp 45
  jr z,FNERRM    ; 45: the error mode
  cp 46
  jp z,FNFREE    ; 46: free space
  cp 48
  jr z,FNFLSH    ; 48: flush
  cp 99
  jr z,FNCHNO    ; 99: unsupported
  cp 41          ; 41 FNTAB entries
  jr nc,RETZERO  ; other functions: zero
  add a,a        ; word index for C
  ld e,a
  ld d,0
  ld hl,FNTAB
  add hl,de      ; handler pointer cell
  ld e,(hl)      ; low byte of handler
  inc hl
  ld d,(hl)      ; DE = the routine

; FCBMAP: byte C/8, bit C mod 8.

  ld hl,FCBMAP-1
  ld a,c

FCBBYTE:
  inc hl         ; next bitmap byte
  sub 8          ; advance by eight
  jr nc,FCBBYTE
  ld b,a         ; (C mod 8) - 8
  ld a,(hl)      ; function bitmap byte

FCBBIT:
  rlca           ; rotate selected bit
  inc b
  jr nz,FCBBIT
  ex de,hl       ; HL = the routine

  jr nc,DISPATCH
  push hl        ; save handler address
  call FCBSEL    ; bind caller FCB drive
  pop hl

DISPATCH:
  ld de,(PARAM)  ; restore caller DE
  jp (hl)        ; enter saved handler

; Function 44 accepts only E=1. Other
; counts return FFh through FNCHNO.
; Function 99 always returns FFh without
; truncating a file.

FNMULT:
  dec e          ; E=1 succeeds
  jr nz,FNCHNO

; Return zero through RETA.

RETZERO:
  xor a

; Return A in L with H=0 through
; RETWORD.

RETA:
  ld l,a
  ld h,0

; Return HL to the program with A=L and
; B=H. Restore OLDSP before RET,
; discarding internal BDOS call frames.
; Other registers remain as the function
; left them.

RETWORD:
  ld a,l         ; A=L result alias
  ld b,h
  ld sp,(OLDSP)  ; restore program stack
  ret

; Function 0: jump through RAM BIOWBT.
; The normal hook ends the transient.
; This entry does not clear CHPOS.

FNZERO:
  jp BIOWBT      ; RAM warm-boot hook

; Function 45: set ERRMODE from E and
; return A=0. Warm boot resets it to 0.
; Later errors use FFh for silent
; return, FEh for message then return
; and other values for message, key and
; CHDROP.
; Returned errors have A=L=FFh and
; B=H=code.

FNERRM:
  ld a,e         ; mode until warm boot
  ld (ERRMODE),a
  jr RETZERO

; Function 48: flush every dirty cache
; line through VFLUSH/CFLALL. Return 0
; if all writes succeed or FFh if any
; fail. Failed lines are dropped.
; E is ignored so E=FFh uses the same
; flush without a separate purge.

FNFLSH:
  call VFLUSH    ; flush dirty lines
  jr nz,RETA     ; NZ: FFh failure
  jr RETZERO

; Function 108: DE=FFFFh queries shared
; PRGCODE through RETWORD. Any other DE
; stores the code and returns zero.
; PRGCODE is outside CPMINIT's cleared
; span. The CCP tests it for conditional
; pieces and clears it before dispatch.

FNRETC:
  ld hl,(PARAM)  ; query marker or code
  ld a,h
  and l
  inc a          ; Z: query FFFFh
  jr z,FNRETG

  ld (PRGCODE),hl
  jr RETZERO

FNRETG:

; Query the shared result word.

  ld hl,(PRGCODE)
  jr RETWORD

; Function 1: get a pending character or
; wait through GETCHAR, then echo it.
; TAB echoes as spaces but the original
; byte returns in A/L. Any register may
; change.

FNCIN:
  call GETCHAR   ; pending byte first
  ld c,a         ; echo input C
  push af        ; save original byte
  call ECHOCHAR
  pop af
  jr RETA

; Function 2: send E through OUTCHAR
; with tab expansion and ready-key
; handling for ^S, ^P and ordinary
; input. Return zero.

FNCOUT:
  ld a,(PARAM)   ; E: output byte
  ld c,a         ; OUTCHAR input
  call OUTCHAR
  jr RETZERO

; Function 3: read a byte through RAM
; BIORDR and return it through RETA.

FNREAD:
  call BIORDR    ; RAM reader hook
  jr RETA

; Function 4: send E as C through RAM
; BIOPUN. Return zero.

FNPUNCH:
  ld a,(PARAM)   ; E: output byte
  ld c,a         ; BIOS argument C
  call BIOPUN
  jr RETZERO

; Function 5: send E as C through RAM
; BIOLST. Return zero.

FNLIST:
  ld a,(PARAM)   ; E: output byte
  ld c,a         ; BIOS argument C
  call BIOLST
  jp RETZERO

; Function 6: E=FFh checks CONSTAT.
; Return zero if none is ready,
; otherwise get a pending/BIOS byte
; without echo. This is nonblocking
; under the normal status/input
; contract. Other E values enter DIROUT.

FNDIRECT:
  ld a,(PARAM)   ; E selects mode
  cp $FF         ; FFh: direct input
  jr nz,DIROUT   ; not FFh: output
  call CONSTAT   ; pending or BIOS ready
  or a
  jp z,RETZERO   ; no character: zero
  call GETCHAR   ; unechoed input
  jp RETA

; Function 6 output: A is parameter E.
; Send it as C directly through BIOCOT.
; No tab expansion, CHKKEY, printer echo
; or COLUMN update. Return zero.

DIROUT:
  ld c,a         ; BIOS output C
  call BIOCOT    ; RAM console hook
  jp RETZERO

; Function 7: return IOBYTE at 0003h
; through RETA.

FNGETIO:
  ld a,(IOBYTE)
  jp RETA

; Function 8: store E in IOBYTE and
; return zero. Console entry points
; apply a changed CON: field on their
; next call.

FNSETIO:
  ld a,(PARAM)
  ld (IOBYTE),a
  jp RETZERO

; Function 9: print text at DE/PARAM
; through OUTCHAR before the first
; dollar byte. Return zero.
; Save the scan pointer across output
; and BIOS-hook clobbers.

FNPRINT:
  ld hl,(PARAM)  ; caller text pointer

PRLOOP:
  ld a,(hl)
  cp '$'         ; excluded terminator
  jp z,RETZERO
  inc hl
  push hl        ; save scan position
  ld c,a
  call OUTCHAR
  pop hl
  jr PRLOOP

; Function 10: edit a line in the buffer
; addressed by DE/PARAM. Byte 0 is the
; maximum, byte 1 receives the count and
; data starts at byte 2. CR/LF complete
; it without storing a terminator.
; Handle editing keys before the
; ordinary-character capacity check. A
; stored byte that fills the buffer
; completes with C=CR. If already full
; echo the triggering key without
; storing it even at maximum 0.
; BS/DEL, ^C/^E/^R/^U/^X/^P and
; prompt-only ^W/^N use the handlers
; below. Return zero. Any register may
; change.

FNLINE:
  ld a,(HHEAD)   ; initial history entry
  ld (HPOS),a    ; HREC starting point
  ld hl,(PARAM)  ; caller buffer address
  ld a,(hl)
  ld (LINMAX),a  ; buffer capacity
  inc hl
  xor a          ; initial count zero
  ld (hl),a      ; buffer count byte
  ld (LINCNT),a
  inc hl

  ld (LINPTR),hl

LINLOOP:
  call GETCHAR   ; next unechoed key
  ld c,a         ; C: key/echo argument
  cp CR          ; CR/LF completes
  jp z,LINDONE
  cp LF
  jp z,LINDONE
  cp CTRLP       ; ^P: printer toggle
  jr z,LINTGL
  cp BACKSP      ; BS: logical removal
  jr z,LINBACK
  cp DELETE      ; DEL: rubout echo
  jr z,LINDEL
  cp CTRLC       ; ^C: start-only abort
  jp z,LINABRT
  cp CTRLE       ; ^E: display newline
  jp z,LINEOL
  cp CTRLR       ; ^R: retype line
  jp z,LINRETY
  cp CTRLU       ; ^U: discard line
  jp z,LINCTU
  cp CTRLX       ; ^X: clear logical
                 ; line
  jp z,LINCLEAR
  cp CTRLW       ; ^W: older history
  jr z,LINHIST
  cp CTRLN       ; ^N: newer history
  jr z,LINHIST

LINCHR:
  ld a,(LINCNT)  ; current logical count
  ld b,a
  ld a,(LINMAX)
  cp b
  jp z,LINDONE   ; full: echo key only
  ld a,c         ; key to store

  ld hl,(LINPTR)
  ld (hl),a
  inc hl
  ld (LINPTR),hl
  ld a,b         ; increment stored
                 ; count
  inc a
  ld (LINCNT),a
  call ECHOCHAR  ; echo stored byte
  ld a,(LINCNT)  ; post-store capacity
  ld b,a
  ld a,(LINMAX)
  cp b
  jr nz,LINLOOP  ; room for another byte
  ld c,CR        ; capacity end: echo CR
  jp LINDONE

; ^P toggles LISTEN through TOGLIST and
; resumes input without storing the key.

LINTGL:
  call TOGLIST   ; printer echo toggle
  jr LINLOOP

; C = ^W or ^N. With HFLAG nonzero call
; HREC for the older/newer history line.
; Otherwise store the control byte
; through LINCHR.
; The CCP sets HFLAG=FFh only for typed
; prompt input.

LINHIST:
  ld a,(HFLAG)   ; prompt history gate
  or a
  jr z,LINCHR    ; program: ordinary
                 ; byte
  call HREC      ; ^W older, ^N newer
  jr LINLOOP

; BS: if nonempty, decrement LINCNT and
; LINPTR and call ERASE1 once. It sends
; BS, SPACE, BS without overwriting the
; removed buffer byte. Empty input is
; unchanged.

LINBACK:
  ld a,(LINCNT)  ; logical count
  or a
  jr z,LINLOOP   ; empty: unchanged
  dec a          ; remove one byte
  ld (LINCNT),a

  ld hl,(LINPTR)
  dec hl
  ld (LINPTR),hl
  call ERASE1    ; BS-SPACE-BS once
  jp LINLOOP

; DEL: if nonempty, decrement LINCNT and
; LINPTR and echo the removed byte
; through ECHOCHAR. Old buffer storage
; remains. Empty input is unchanged.

LINDEL:
  ld a,(LINCNT)  ; logical count
  or a
  jp z,LINLOOP   ; empty: unchanged
  dec a          ; remove one byte
  ld (LINCNT),a

  ld hl,(LINPTR)
  dec hl
  ld (LINPTR),hl
  ld c,(hl)      ; removed byte to echo
  call ECHOCHAR
  jp LINLOOP

; ^C: ignore it on a nonempty line. At
; the start, store CTRLC through LINPTR,
; echo literal ^C and enter CHDROP to
; discard the chain before warm boot.

LINABRT:
  ld a,(LINCNT)  ; start-only abort
  or a
  jp nz,LINLOOP  ; nonempty: ignore ^C

; Store the abort byte at the input
; pointer.

  ld hl,(LINPTR)
  ld (hl),CTRLC
  ld c,'^'       ; literal ^C display
  call ECHOCHAR
  ld c,'C'
  call ECHOCHAR
  jp CHDROP      ; drop chain, warm boot

; ^E: send CR/LF through ECHOONE and
; continue the same logical line. Store
; no byte and leave its count unchanged.

LINEOL:
  ld c,CR
  call ECHOONE   ; display newline
  ld c,LF
  call ECHOONE
  jp LINLOOP

; ^R: print #, CR, LF and re-echo LINCNT
; bytes from the buffer at (PARAM)+2.
; Keep LINCNT/LINPTR unchanged and
; resume input.

LINRETY:
  ld c,'#'       ; mark retyped line
  call ECHOONE
  ld c,CR        ; new display line
  call ECHOONE
  ld c,LF
  call ECHOONE
  ld hl,(PARAM)  ; caller buffer pointer
  inc hl         ; skip max/count bytes
  inc hl
  ld a,(LINCNT)  ; retype byte count
  ld b,a

RETYLP:
  ld a,b
  or a
  jp z,LINLOOP   ; no more bytes
  ld c,(hl)      ; next stored byte
  push bc        ; save loop count
  push hl        ; save scan pointer
  call ECHOCHAR  ; echo byte, expand TAB
  pop hl
  pop bc
  inc hl
  djnz RETYLP    ; restored byte count
  jp LINLOOP

; ^U: print #, CR, LF, set LINCNT=0 and
; LINPTR=(PARAM)+2, then resume input.
; Old character bytes remain.

LINCTU:
  ld c,'#'       ; mark discarded line
  call ECHOONE
  ld c,CR        ; new display line
  call ECHOONE
  ld c,LF
  call ECHOONE
  xor a          ; reset logical count
  ld (LINCNT),a
  ld hl,(PARAM)  ; caller buffer pointer
  inc hl         ; skip max/count bytes
  inc hl
  ld (LINPTR),hl
  jp LINLOOP

; ^X: call LINERASE to clear logical
; input and emit one ERASE1 sequence per
; counted byte, then resume input.
; Buffer bytes are not wiped.

LINCLEAR:
  call LINERASE
  jp LINLOOP

; For each byte counted by LINCNT call
; ERASE1 and decrement LINCNT/LINPTR.
; Return with count 0 and the pointer
; rewound by the original count. At
; count 0 leave LINPTR unchanged.
; Also used by history HRSHOW. Clobbers
; A, C, HL and BIOS-output clobbers. Old
; buffer bytes remain.

LINERASE:
  ld a,(LINCNT)  ; remaining byte count
  or a
  ret z          ; zero: pointer
                 ; unchanged
  call ERASE1    ; BS-SPACE-BS once
  ld a,(LINCNT)  ; decrement logical
                 ; count
  dec a
  ld (LINCNT),a

  ld hl,(LINPTR)
  dec hl         ; rewind input pointer

  ld (LINPTR),hl
  jr LINERASE

; Echo completion key C and write LINCNT
; to buffer byte 1. Data begins at byte
; 2 and has no appended CR/NUL
; terminator.
; Clear HFLAG before calling HSTORE.
; Warm boot also clears HFLAG. A
; nonempty CCP prompt line can be stored
; unless HSTORE rejects NUL data or a
; newest duplicate.
; Return zero. Capacity completion uses
; C=CR. The already-full path echoes its
; triggering key instead.

LINDONE:
  call ECHOCHAR  ; echo completion key
  ld hl,(PARAM)  ; caller buffer pointer
  inc hl
  ld a,(LINCNT)  ; returned byte count
  ld (hl),a
  inc hl         ; DE: data, B: count
  ex de,hl
  ld b,a
  ld hl,HFLAG    ; one-shot history gate
  ld a,(hl)      ; FFh prompt, 0 program
  ld (hl),0
  and b          ; prompt with data

  call nz,HSTORE
  jp RETZERO

; Function 11: return 1 for pending or
; BIOS-ready input, otherwise 0. An
; existing pending byte is not consumed.
; A newly ready BIOS byte is read into
; PENDCHR and marked PENDING=1 for
; GETCHAR.

FNSTAT:

  ld a,(PENDING)
  or a
  jr nz,STATYES  ; pending: ready
  call BIOCST    ; RAM BIOS readiness
  or a
  jp z,RETZERO   ; not ready: zero
  call BIOCIN    ; capture BIOS byte
  ld (PENDCHR),a
  ld a,1         ; mark pending input
  ld (PENDING),a

STATYES:
  ld a,1         ; ready result 1
  jp RETA

; Function 12: CP/M 2.2 version. Return
; HL=0022h, A=22h and B=H=0, identifying
; CP/M rather than MP/M.

FNVERS:
  ld a,$22       ; CP/M 2.2 version
  jp RETA
