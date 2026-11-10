; BDOS error handling, allocation-block
; bounds and shared console output/echo
; helpers. ERRMODE is set by function
; 45.

; Print zero-terminated text at HL
; through OUTCHAR with tab expansion and
; ^S/^P checking. Return HL at the zero.
; Clobbers A, C and OUTCHAR clobbers.
; Save the scan pointer across output.

ERRTEXT:
  ld a,(hl)
  or a
  ret z          ; zero terminator
  inc hl
  push hl        ; save scan position
  ld c,a
  call OUTCHAR
  pop hl
  jr ERRTEXT

; Bad-sector error 1: ERRBAD in HL, B=1,
; then fall through to BDERR. Disk I/O
; failures and allocation references
; beyond DSM use this entry.

BADSECT:
  ld hl,ERRBAD   ; error message suffix
  ld b,1         ; bad-sector code 1

; Handle a BDOS error: HL=message and
; B=code. ERRMODE=FFh returns silently.
; FEh prints through OUTCHAR before
; returning. Its normal key handling can
; abort output. Returned errors exit
; nonlocally through RETWORD with
; A=L=FFh and B=H=code, preserving CHPOS
; (KD-181).
; Other modes print, read a key and
; enter CHDROP to discard the chain. The
; normal warm-boot hook ends the
; transient. No path resumes the
; internal caller.

BDERR:

  ld a,(ERRMODE)
  cp $FE         ; FEh/FFh return modes
  jr c,BDDEF     ; other modes: abort
  push bc        ; save error code

; FEh prints before the error return.

  call z,DISKMSG
  pop bc
  ld h,b         ; H: code, L: FFh
  ld l,$FF
  jp RETWORD

BDDEF:
  call DISKMSG
  call GETCHAR   ; key before abort
  jp CHDROP      ; discard chained rest

; Validate allocation block DE against
; current DPB.DSM before block-to-record
; scaling. A value above DSM enters
; BADSECT error 1. Zero and DSM are
; valid here.
; Keeps DE, HL and BC on return. IX =
; current DPB. BITPTR uses BLKPAST
; directly for its tolerant vector path.

CHKBLK:
  call BLKPAST   ; C: DE past DSM
  jr c,BADSECT   ; invalid: error 1
  ret

; Compare unsigned DE with DPB.DSM at
; offsets 5/6. Carry set iff DE>DSM.
; Set IX=DPB. Keep BC, DE and HL.
; Clobber A and flags.

BLKPAST:
  ld ix,(DPBPTR)
  ld a,(ix+5)    ; DSM low byte
  cp e           ; low-byte borrow
  ld a,(ix+6)    ; DSM high byte
  sbc a,d
  ret

; Print ERRHEAD, drive letter 'A'+CURDRV
; and the suffix at HL through ERRTEXT.
; Save its pointer across prefix output.
; Clobbers A, C, HL and OUTCHAR
; clobbers.

DISKMSG:
  push hl        ; save suffix pointer
  ld hl,ERRHEAD  ; CR/LF and error
                 ; prefix
  call ERRTEXT
  ld a,(CURDRV)
  add a,'A'
  ld c,a
  call OUTCHAR
  pop hl
  jr ERRTEXT     ; print suffix

; Return an unechoed byte in A. Consume
; PENDCHR first when PENDING is nonzero,
; clearing PENDING. Otherwise tail-jump
; through RAM BIOCIN, which normally
; waits for input.
; Clobbers A, HL, flags and input-hook
; clobbers.

GETCHAR:

  ld hl,PENDING  ; PENDCHR follows
  ld a,(hl)
  or a
  jp z,BIOCIN    ; normal BIOS wait
  ld (hl),0
  inc hl
  ld a,(hl)
  ret

; Return nonzero A for a pending BDOS
; byte without consuming it. Otherwise
; tail-jump through RAM BIOCST for its
; normal FFh/0 status. BIOS status may
; fill RXCHAR/RXFULL.
; Clobbers A and status-hook clobbers.

CONSTAT:

  ld a,(PENDING)
  or a
  ret nz
  jp BIOCST      ; RAM status hook

; Output-time status: if PENDING is
; nonzero return its value. Otherwise
; jump directly to ROM BCONST. This
; bypasses RAM BIOCST and its cursor
; wrapper. BCONST can poll devices and
; buffer BIOS input without drawing a
; cursor.

CONSTQ:

  ld a,(PENDING)
  or a
  ret nz
  jp BCONST      ; ROM status, no cursor

; Output character C as functions 2/9
; do. Non-tabs enter OUTONE. TAB emits
; at least one space through OUTONE
; until COLUMN modulo 8 is 0. OUTONE
; checks input before each emitted byte.
; Clobbers A, C and BIOS-call clobbers.
; COLUMN is an 8-bit logical output
; count.

OUTCHAR:
  ld a,c
  cp TAB
  jr nz,OUTONE   ; non-tab output

TABLOOP:
  ld c,SPACE
  call OUTONE
  ld a,(COLUMN)  ; updated logical
                 ; column
  and 7
  jr nz,TABLOOP  ; until column mod8=0
  ret

; Output C without tab expansion. CHKKEY
; handles ready input: ^S pauses, ^P
; toggles printer echo and ordinary keys
; are staged. Save BC over that check,
; then enter ECHORAW.

OUTONE:
  push bc        ; save output byte
  call CHKKEY    ; handle ready key
  pop bc
  jr ECHORAW

; Echo C without tab expansion or CHKKEY
; consumption. Call CONSTAT with BC
; saved. Discard its result and fall
; through to ECHORAW. The status call
; may buffer BIOS input.

ECHOONE:
  push bc        ; save echo byte
  call CONSTAT   ; status result unused
  pop bc

; Output raw character C. Update logical
; COLUMN through ECHOCOL before BIOS
; hooks can clobber C.
; With LISTEN nonzero save BC across
; BIOLST to retain C for console output.
; Then tail-jump through BIOCOT.
; Clobbers A, C and BIOS-call clobbers.

ECHORAW:
  call ECHOCOL   ; account before hooks
  ld a,(LISTEN)  ; printer echo enabled
  or a
  jr z,ECHOCON   ; console only
  push bc        ; save byte for console
  call BIOLST
  pop bc

ECHOCON:
  jp BIOCOT      ; RAM console hook

; Update COLUMN for C: CR sets 0, BS
; decrements with a floor at 0, bytes
; >=SPACE increment it and other
; controls leave it unchanged. The byte
; can wrap at 256, including for DEL.
; Keep C. Clobber A, HL and flags.

ECHOCOL:
  ld a,c
  cp CR
  jr z,COLZERO   ; CR: reset column
  cp BACKSP
  jr z,COLBACK   ; BS: saturating back
  cp SPACE
  ret c          ; other control: no
                 ; move
  ld hl,COLUMN
  inc (hl)
  ret

; Echo C through ECHOONE. Expand TAB as
; at least one space until COLUMN modulo
; 8 is 0. No GETCHAR/CHKKEY consumption
; occurs, though ECHOONE calls CONSTAT.
; Clobbers A, C and BIOS-call clobbers.

ECHOCHAR:
  ld a,c
  cp TAB
  jr nz,ECHOONE  ; non-tab echo

ECHOTAB:
  ld c,SPACE
  call ECHOONE
  ld a,(COLUMN)  ; updated logical
                 ; column
  and 7
  jr nz,ECHOTAB  ; until column mod8=0
  ret

; Set COLUMN=0 after CR. Changes A.

COLZERO:
  xor a
  ld (COLUMN),a
  ret

; Decrement logical COLUMN if nonzero.
; Leave 0 unchanged. Used by BS
; accounting and ERASE1. Clobbers A, HL
; and flags.

COLBACK:
  ld hl,COLUMN
  ld a,(hl)
  or a
  ret z          ; zero stays zero
  dec (hl)
  ret

; Poll through CONSTQ without drawing a
; cursor. Return immediately if no key
; is ready. Otherwise GETCHAR consumes
; it.
; ^S waits for a second key to resume.
; Only ^C in that second position enters
; CHDROP to discard the chain and warm
; boot. Other resume keys are discarded.
; A first key other than ^S goes to
; CHKPRN. Clobbers A and
; status/input-hook clobbers.

CHKKEY:
  call CONSTQ    ; quiet ROM status
  or a
  ret z          ; not ready: continue
  call GETCHAR   ; consume ready key
  cp CTRLS       ; ^S: wait for resume
  jr nz,CHKPRN
  call GETCHAR   ; consume resume key
  cp CTRLC       ; resume ^C: abort
  jp z,CHDROP    ; drop chain, warm boot
  ret            ; discard resume key

; Handle output-time key A, already
; known not to be ^S. ^P enters TOGLIST.
; Any other byte goes to PENDCHR with
; PENDING=1 for later input.
; Clobbers A and flags.

CHKPRN:
  cp CTRLP
  jr z,TOGLIST   ; ^P: printer toggle


CHKPND:
  ld (PENDCHR),a

  ld a,1
  ld (PENDING),a
  ret

; Toggle LISTEN bit 0. Initialised state
; 0/1 represents printer echo off/on.
; Clobbers A and flags.

TOGLIST:
  ld a,(LISTEN)
  xor 1          ; 0 off, 1 on
  ld (LISTEN),a
  ret

; Send BS, SPACE, BS directly through
; RAM BIOCOT even at COLUMN=0 without
; printer echo. Reload C for each hook
; call then enter COLBACK to decrement
; logical COLUMN with a floor at 0.
; Clobbers A, C and BIOS-output
; clobbers. This does not wipe buffer
; bytes or establish a physical cursor
; state.

ERASE1:
  ld c,BACKSP
  call BIOCOT    ; RAM output hook
  ld c,SPACE
  call BIOCOT
  ld c,BACKSP
  call BIOCOT
  jr COLBACK     ; logical column back
