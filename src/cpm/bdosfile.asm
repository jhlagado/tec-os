; BDOS drive reset/selection and
; whole-entry file operations: open,
; close, search, delete, make, rename
; and attributes.

; Function 13: reset to drive A and DMA
; 0080h in BDOS and BIOS. Retain USERNO.
; BIOS DPH/DPB structures supply
; geometry and workspace pointers.
; Consume WRFLAG once: zero clears
; LOGINV/WARMV. Nonzero enters WRESET.
; RSTAIL clears ROVEC, logs in A and
; publishes its default pointers. LOGIN
; can reapply mounted read-only state.
; Return A=0 through RETZERO. Any
; register may change. Errors follow
; BDERR policy.

FNRESET:
  ld hl,WRFLAG   ; one-shot CCP reset
  ld a,(hl)
  ld (hl),0      ; consume before reset
  or a
  jr nz,WRESET
  ld h,a         ; full reset vectors
  ld l,a
  ld (LOGINV),hl
  ld (WARMV),hl

RSTAIL:
  xor a          ; common reset tail
  ld (CURDRV),a  ; drive A
  ld h,a
  ld l,a
  ld (ROVEC),hl
  ld hl,$0080    ; standard DMA

  ld (CURDMA),hl
  ld b,h
  ld c,l
  call BIODMA    ; BIOS DMA too
  call LOGIN     ; bind A, scan if
                 ; needed
  jr SETDEF      ; publish default

; Retain or rebuild logged allocation
; vectors for the CCP reset. Enter from
; FNRESET with WRFLAG nonzero in A.
; Skip unlogged drives. LOGIN binds each
; logged drive without a directory
; rescan. With DPH+4 nonzero, clear its
; login bit and set WARMV for a rebuild
; to its mark. Otherwise retain login
; only if ALVSUM equals the saved DPH+2
; sum. A mismatch requires a full scan.
; Equal sums do not prove unchanged
; bytes.
; Finish at RSTAIL. Changes all
; registers, CURDRV, LOGINV and WARMV.

WRESET:
  xor a

WRLOOP:
  ld (CURDRV),a
  call LOGTEST   ; Z: unlogged
  jr z,WRNEXT
  call LOGIN     ; bind, no rescan

  ld hl,(DPHPTR)
  ld bc,4        ; DPH dirty byte +4
  add hl,bc
  ld a,(hl)
  or a
  jr nz,WRDIRTY  ; dirty: bounded
                 ; rebuild
  call ALVSUM    ; DE=16-bit ALV sum

  ld hl,(DPHPTR)
  inc hl
  inc hl
  ld a,(hl)
  cp e           ; saved sum low byte
  jr nz,WRFULL   ; sum differs: full
                 ; scan
  inc hl
  ld a,(hl)
  cp d
  jr z,WRNEXT    ; equal sum: keep login

WRFULL:
  ld hl,LOGINV   ; clear login for scan
  call VCLR
  jr WRNEXT

WRDIRTY:
  ld hl,LOGINV   ; clear login
  call VCLR
  ld hl,WARMV    ; rebuild to saved mark
  call VSET

WRNEXT:
  ld a,(CURDRV)  ; drive loop A..P
  inc a
  cp 16
  jr nz,WRLOOP
  jr RSTAIL

; Function 14: select drive E=0..15
; (A..P), then publish it as the logical
; default through SETDEF. Return A=0.
; Any register may change.
; Invalid/unavailable drives enter
; SELFAIL/BDERR nonlocally.

FNSEL:
  ld a,(PARAM)
  call SELDRV    ; bind before publish

; Publish CURDRV/DPBPTR/ALVPTR as
; DEFDRV/DEFDPB/DEFALV after successful
; selection. Return A=0 through RETZERO.
; Functions 25/27/31 can query these
; default values without rebinding an
; explicit-drive search or replacing its
; buffer/cursor.

SETDEF:
  ld a,(CURDRV)
  ld (DEFDRV),a

  ld hl,(DPBPTR)

  ld (DEFDPB),hl
  ld hl,(ALVPTR)
  ld (DEFALV),hl
  jp RETZERO

; Bind drive A=0..15 through LOGIN.
; Reuse the tables only when this drive
; is current and logged in. Return with
; CURDRV and its tables bound.
; Invalid/unavailable drives enter
; SELFAIL nonlocally. Changes
; AF/BC/DE/HL/IX.

SELDRV:
  cp 16          ; reject past P
  jp nc,SELFAIL
  ld b,a
  ld a,(CURDRV)
  cp b           ; compare bound drive
  ld a,b
  ld (CURDRV),a  ; LD keeps compare F
  jp nz,LOGIN
  call LOGTEST   ; same drive: login bit
  ret nz         ; NZ: tables still
                 ; bound
  jp LOGIN

; Resolve the FCB drive at (PARAM)
; without changing its byte. Input C is
; the function number. Drive byte:
; 0=DEFDRV, 1..16=A..P.
; Accept literal '?' for function 17
; default-drive raw search only. Reject
; '?' in other functions through
; SELFAIL. Bind ordinary drive bytes
; through SELDRV, which rejects drives
; past P. Inherit its clobbers. C need
; not survive.

FCBSEL:
  ld hl,(PARAM)
  ld a,(hl)
  cp '?'
  jr nz,FCBORD
  ld a,c         ; entry C, not
                 ; preserved
  cp 17
  jp nz,SELFAIL  ; raw search only
  xor a

FCBORD:
  or a           ; 0: logical default
  jr nz,FCBEXPL
  ld a,(DEFDRV)
  jr SELDRV

FCBEXPL:
  dec a          ; FCB 1..16 -> A..P
  jr SELDRV

; Function 15: open through SETSRCH mode
; 1. OPENHIT imports entry bytes 1..31
; but restores requested EX&1Fh and sets
; S2 bit 7 unmodified. Drive, CR and
; random bytes are outside the copy.
; Return slot 0..3 or FFh through RETA.
; MATCHUSR defines the EX='?' exception.

FNOPEN:
  ld a,1
  jr SETSRCH

; Function 16: close through CLOSEFCB.
; Return its slot 0..3, zero for
; no-write success or FFh if the entry
; is missing. BDERR errors exit
; nonlocally.

FNCLSE:
  call CLOSEFCB
  jp RETA

; Close the FCB at (PARAM) on the
; current drive. If S2 bit 7 is set,
; return A=0 without reading an entry.
; Otherwise enter CLOSEDIR.
; Return A=slot 0..3, zero for no-write
; success or FFh if no entry matches.
; Any register may change.

CLOSEFCB:
  ld de,14       ; S2 unmodified bit
  call FCBOFF
  bit 7,(hl)
  jr z,CLOSEDIR
  xor a          ; no entry read
  ret

; Write modified extent metadata. A
; read-only drive returns A=0 without
; writing.
; Find the entry through FINDEXCT. If
; FCB EX&1Fh is earlier than entry
; EX&1Fh, copy only the 16-byte map to
; avoid lowering its last-extent
; metadata. Otherwise copy 20 bytes from
; EX through the map. S2 is not compared
; here.
; Write the record and return RETCODE.
; Missing entry returns FFh. Other
; inputs/clobbers are as CLOSEFCB. Disk
; errors exit through BDERR.

CLOSEDIR:
  call RONZ      ; NZ: drive read-only
  ld a,0
  ret nz         ; no-write success
  call FINDEXCT
  cp $FF
  ret z          ; FFh: missing entry
  ld hl,(PARAM)
  ld bc,12
  add hl,bc

  ld de,(MATCHPTR)
  ex de,hl
  add hl,bc
  ex de,hl
  ld a,(de)
  and $1F
  ld c,a
  ld a,(hl)
  and $1F
  cp c           ; FCB EX vs entry EX
  ld bc,20       ; EX through map
  jr nc,CLOSECP  ; FCB not earlier
  ld c,4         ; skip EX/S1/S2/RC
  add hl,bc
  ex de,hl
  add hl,bc
  ex de,hl
  ld c,16        ; map only

CLOSECP:
  ldir           ; FCB -> entry
  call WRITEDIR  ; persist directory

  ld a,(RETCODE)
  ret

; Find the current-drive entry for the
; FCB at (PARAM): set SRCHFCB and mode
; 4, restart the search and enter
; FINDENT. Mode 4 stops at DIRUSED and
; copies no entry. MATCHUSR defines
; matching, including EX='?'.
; Return A=slot 0..3 with MATCHPTR or
; FFh. Replaces search state. Registers
; may change.

FINDEXCT:
  ld hl,(PARAM)
  ld (SRCHFCB),hl
  ld a,4         ; mode 4: close lookup

  ld (OPENMOD),a
  call NEWSRCH
  jp FINDENT

; Function 17: start search at the FCB
; in (PARAM). Drive '?' selects mode 5
; raw enumeration. Otherwise clear
; caller S2 and use mode 0
; current-user/name/extent matching.
; MATCHUSR defines the EX='?' bypass.
; Return slot 0..3 with its 128-byte
; record at CURDMA or FFh on exhaustion.

FNSRCHF:
  ld hl,(PARAM)
  ld a,(hl)
  cp '?'         ; drive ?: raw mode
  ld a,5
  jr z,SETSRCH
  ld de,14       ; S2 byte 14
  add hl,de      ; caller S2 address
  ld (hl),0
  xor a          ; normal search mode

; Start mode A with the pattern at
; (PARAM). Save OPENMOD/SRCHFCB, call
; NEWSRCH then FINDENT and return
; through RETA. Keep the pointed-to
; pattern usable for continuation.
; Modes 0/5 copy the record to CURDMA.
; Mode 1 imports open fields.

SETSRCH:
  ld hl,(PARAM)
  ld (SRCHFCB),hl

  ld (OPENMOD),a
  call NEWSRCH
  call FINDENT
  jp RETA        ; slot or FFh

; Function 18: continue the saved search
; from SRCHIDX with OPENMOD/SRCHFCB. DE
; is not a new FCB argument. Return slot
; 0..3 or FFh through RETA.

FNSRCHN:
  call FINDENT
  jp RETA

; Reject read-only drive/file access.
; ROFCB checks CHKRO (error 2), then the
; FCB at (PARAM). ROTEST takes an entry
; base in HL.
; Both test type byte 9 bit 7: clear
; returns. Set enters BDERR error 3
; nonlocally. Changes AF/B/DE/HL.

ROFCB:
  call CHKRO     ; drive gate first
  ld hl,(PARAM)

ROTEST:
  ld de,9        ; t1 attribute byte
  add hl,de
  bit 7,(hl)
  ret z          ; Z: file writable
  ld hl,ERRFILE
  ld b,3         ; error 3: file R/O
  jp BDERR

; Function 19: delete current-user/name
; matches across extents in mode 2 to
; DIRUSED. Check drive write permission
; first and each file before changing
; it.
; Mark the entry E5h and write it before
; freeing its blocks. Earlier completed
; entries stay deleted/freed if a later
; gate or write fails. Return A=0 if any
; changed or FFh otherwise through
; DELDONE.

FNDELETE:
  call CHKRO     ; drive gate
  ld hl,(PARAM)  ; caller match pattern

  ld (SRCHFCB),hl
  ld a,2         ; mode 2: all extents
  ld (OPENMOD),a
  call NEWSRCH
  xor a          ; no completed writes
  ld (WRTYPE),a

DELLOOP:
  call FINDENT
  cp $FF
  jr z,DELDONE   ; scan exhausted

  ld hl,(MATCHPTR)
  call ROTEST    ; file gate per entry
  ld hl,(MATCHPTR)
  ld (hl),$E5    ; mark buffer empty
  call WRDIRNOW  ; BIOS still on record
  call FREEENT   ; free only after write

; A failed write ends this function
; before FREEENT, including a return to
; the program under ERRMODE. The buffer
; is already marked E5h. No entry
; rollback is performed here.

  ld a,1         ; completed deletion
  ld (WRTYPE),a
  jr DELLOOP

; Return the delete/rename/attributes
; result through RETA: A=0 if WRTYPE
; records a completed entry write or FFh
; if none completed.

DELDONE:
  ld a,(WRTYPE)
  or a           ; Z: no completed entry
  ld a,$FF
  jp z,RETA      ; FFh: none changed
  xor a
  jp RETA

; Function 22: reject a read-only drive,
; clear caller S2, keep EX and call
; MAKEFCB. Even a directory-full return
; leaves S2 cleared.
; Return slot 0..3 or FFh when full
; through RETA. Other errors enter
; BDERR.

FNMAKE:
  call CHKRO     ; gate before FCB
                 ; change
  call FCBEX     ; HL=caller EX
  inc hl
  inc hl
  ld (hl),0      ; S2 clear even if full
  call MAKEFCB
  jp RETA

; Allocate an empty directory slot for
; the FCB at (PARAM) on the current
; drive. Mode 3 scans all DIRCNT
; entries. No slot returns FFh without
; changing the FCB here. FNMAKE may
; already have cleared S2.
; Keep EX, clear S1, retain S2&3Fh and
; clear RC plus the 16-byte map. Leave
; CR/random bytes unchanged.
; ADVEXT/RANDMISS retain their chosen
; module. Continue at MAKECOPY. Any
; register may change.

MAKEFCB:
  ld hl,(PARAM)

  ld (SRCHFCB),hl
  ld a,3         ; mode 3: free slot
  ld (OPENMOD),a
  call NEWSRCH
  call FINDENT
  cp $FF
  ret z          ; FFh, FCB unchanged

  call FCBEX     ; keep requested EX
  inc hl
  ld (hl),0
  inc hl
  ld a,(hl)
  and $3F        ; keep module bits
  ld (hl),a
  inc hl         ; RC then 16-byte map
  ld b,17        ; exclude CR/random
  xor a

MAKEZERO:
  ld (hl),a
  inc hl
  djnz MAKEZERO

; Publish USERNO and FCB bytes 1..31 to
; the empty MATCHPTR entry, then set S2
; bit 7 only in the caller FCB. Drive,
; CR and random bytes are not copied.
; Raise DIRUSED to one-past-slot SRCHIDX
; if needed and save it through DUSAVE
; before WRITEDIR. Return RETCODE after
; success. FCB/mark changes precede the
; write and are not rolled back here.

MAKECOPY:

  ld hl,(MATCHPTR)
  ld a,(USERNO)
  ld (hl),a
  inc hl
  ex de,hl       ; entry destination +1
  ld hl,(PARAM)
  inc hl
  ld bc,31       ; name through map
  ldir

  ld de,14       ; caller S2 offset
  call FCBOFF    ; caller FCB, not entry
  ld a,(hl)
  or $80         ; mark unmodified
  ld (hl),a

  ld hl,(SRCHIDX)

  ld de,(DIRUSED)
  or a
  sbc hl,de
  jr c,MAKEUSED  ; below mark: keep it
  ld hl,(SRCHIDX)
  ld (DIRUSED),hl
  call DUSAVE    ; save raised DPH mark

MAKEUSED:
  call WRITEDIR  ; state already changed

  ld a,(RETCODE)
  ret

; Function 21: reject read-only
; drive/file access, set ZEROFIL=0 and
; call WRITESEQ on DMA data without
; new-block zero fill.
; Return WRITESEQ's A through RETA: 0
; written, 1 directory full or 2 disk
; full. Disk I/O errors enter
; BADSECT/BDERR nonlocally.

FNWRITE:
  call ROFCB     ; drive/file R/O gate
  xor a          ; no new-block fill

  ld (ZEROFIL),a
  call WRITESEQ
  jp RETA

; Function 30: set attributes in every
; current-user/name match. Require a
; writable drive but allow read-only
; files. Supply HL=(PARAM)+1 to MUTALL,
; including attribute bits in the
; 11-byte name/type source.
; Return A=0 if any changed or FFh if
; none matched.

FNATTR:
  call CHKRO     ; drive R/O gate
  ld hl,(PARAM)
  inc hl         ; attributes: offset 1
  jr MUTALL

; Function 23: rename current-user/name
; matches. Require a writable drive and
; reject read-only files through error
; 3. The first FCB half is the pattern.
; HL=(PARAM)+17 supplies the second
; half's 11-byte name/type after its
; drive byte.
; Return A=0 if any changed or FFh if
; none matched.

FNRENAME:
  call CHKRO     ; drive R/O gate
  ld de,17       ; rename: offset 17
  call FCBOFF    ; HL=(PARAM)+17

; Update all matching extents to DIRUSED
; in mode 2. Input HL must be (PARAM)+1
; for attributes or (PARAM)+17 for
; rename. Keep pattern/replacement bytes
; usable and outside the directory
; buffer: FINDENT replaces directory
; records. COPYPTR retains the source
; address.
; The offset's bit 4 selects rename's
; ROTEST gate. Attributes bypass it.
; Copy 11 bytes to entry+1 and write
; each record before setting WRTYPE.
; Earlier completed writes remain if a
; later call fails. End through DELDONE.
; Changes every register.

MUTALL:

  ld (COPYPTR),hl
  ld hl,(PARAM)

  ld (SRCHFCB),hl
  ld a,2
  ld (OPENMOD),a
  xor a          ; no completed writes
  ld (WRTYPE),a
  call NEWSRCH

MUTLOOP:
  call FINDENT
  cp $FF
  jp z,DELDONE   ; scan exhausted

  ld a,(COPYPTR)
  ld hl,PARAM
  sub (hl)       ; offset modulo 256
  and $10        ; bit 4: rename only
  jr z,MUTCOPY

  ld hl,(MATCHPTR)
  call ROTEST    ; rename file R/O gate

MUTCOPY:

  ld hl,(COPYPTR)

  ld de,(MATCHPTR)
  inc de
  ld bc,11
  ldir
  call WRITEDIR  ; persist this entry
  ld a,1         ; completed update
  ld (WRTYPE),a
  jr MUTLOOP
