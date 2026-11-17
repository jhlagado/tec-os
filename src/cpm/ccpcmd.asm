; CCP built-ins UNLOAD/CON,
; file-reference parsing, page-zero
; preparation, output wrappers, service
; listing and startup record handling.

; UNLOAD: call SVCUNL without validating
; arguments. Carry clear enters STARTED.
; Carry enters BADCMD. Loader prechecks
; may refuse before REMOVE. The loader
; handles hook calls and page/registry
; release.

CMDUNL:
  call SVCUNL
  jp nc,STARTED  ; NC: unload completed

TOBADCMD:
  jp BADCMD

; Retry the next console name. Input DE
; is the differing table byte, C
; includes the unconsumed suffix, B is
; the name index and the argument
; pointer is on the stack. Pop that
; pointer to HL, skip C table bytes and
; retry. Index 6 enters BADCMD.

CONNO:
  pop hl

CONSKIP:
  inc de         ; skip unmatched suffix
  dec c
  jr nz,CONSKIP
  inc b
  ld a,b
  cp 7           ; seven name records
  jr nz,CONNXT

CONBAD:
  jr TOBADCMD    ; CON's refusals

; CON reports the effective console or
; selects TTY/CRT/BAT/UC1. GLCD maps to
; UC1 and PICO to CRT. A colon is
; optional. An optional two-digit width
; after CRT/PICO uses the versioned
; PICOWID entry (KD-174).
; Match six four-byte CONNAMS records.
; Three-letter names stop at the table
; colon. Aliases consume four letters.
; Save the argument pointer per trial
; for CONNO.

CMDCON:
  call ARGSKIP
  jp z,CONRPT    ; report alone: no change
  push hl
  call CONSAVE
  pop hl
  ld de,CONNAMS  ; four-byte name table
  ld b,0         ; TTY index 0

CONNXT:
  push hl        ; save trial argument
  ld c,4         ; four bytes remaining

CONCMP:
  ld a,(de)      ; table letter/colon
  cp ':'
  jr z,CONMAT    ; three-letter end
  cp (hl)
  jr nz,CONNO    ; retry at mismatch
  inc hl
  inc de
  dec c
  jr nz,CONCMP   ; four-letter alias

; Map matched CON index to B mode: 0..3
; unchanged, GLCD 5->UC1 3 and PICO
; 6->CRT 1 (13-2B). LCD stays 4 until
; CONLCD. Discard the saved argument
; word and consume an optional colon.
; HL then points at following text.

CONMAT:
  pop af         ; discard saved pointer
  ld a,b
  cp CMUC1
  jr nz,CONMA1
  inc b          ; UC1 names the LCD

CONMA1:
  cp 6
  jr nz,CONHIT   ; GLCD stays distinct
  ld b,CMCRT     ; PICO alias

CONHIT:
  ld a,(hl)
  cp ':'
  jr nz,CONEND
  inc hl

; Width requires spaces after the
; console name and CRT mode. Parse
; exactly two decimal digits and require
; no non-space suffix. Preserve the
; width for the table lookup below.

CONEND:
  ld a,(hl)      ; width needs a space
  cp SPACE
  jr nz,CONNW
  call CMDSKIP   ; record width operand
  jr z,CONNW     ; spaces only: no width
  ld a,b
  cp CMCRT       ; CRT/PICO width, or
  jr z,CONWN
  cp 4           ; the LCD's
  jr nz,CONBAD

CONWN:
  ld a,(hl)      ; first decimal digit
  sub '0'
  cp 10          ; reject nondigit
  jr nc,CONBAD
  ld c,a
  add a,a        ; tens multiplication
  add a,a
  add a,c
  add a,a
  ld c,a
  inc hl         ; second digit
  ld a,(hl)
  sub '0'
  cp 10          ; reject nondigit
  jr nc,CONBAD
  add a,c        ; binary width
  inc hl
  push af        ; width across calls
  call ENDCHK    ; reject suffix
  bit 2,b
  jr z,CONPW     ; PICO's width
  pop bc         ; B = the LCD's
  ld c,b
  jr CONLCD

CONPW:

; FIND PICO at minimum PICOWVER through
; TNFIND. Keep the width across
; ENDCHK/FIND and recover it in B. If no
; table is found, typed input enters
; BADCMD. A startup line enters STARTED
; without changing CON. Width validation
; has not run yet (KD-173).

  ld de,CONNAMS+24
  ld bc,PICOWVER*256+TNFIND
  call ABICALL   ; FIND result table
  pop bc         ; B=saved width
  jr nc,CONWD    ; NC: table found
  ld a,(STFLAG)  ; startup origin flag
  or a           ; typed: bad command
  jr z,CONBAD
  jp STARTED

; FIND returned the PICO table in HL.
; Load its little-endian PICOWID entry
; and invoke through VHLJP with A=width.
; Carry enters BADCMD. Success joins
; CONFL with B=CMCRT. The ROM accepts
; 80/40/32 and refuses nonzero VCLAIM
; before changing width.

CONWD:
  ld de,PICOWID  ; table width offset
  add hl,de
  ld a,(hl)
  inc hl
  ld h,(hl)
  ld l,a
  ld a,b
  call VHLJP     ; width call: A=B
  jr c,CONLB     ; carry: refused
  ld b,CMCRT     ; width set: CRT mode
  jr CONFL

CONNW:
  call ENDCHK    ; name-only suffix
  ld a,b
  cp 5           ; explicit GLCD
  jr z,CONGLCD
  bit 2,b
  jr z,CONFL
  ld c,0         ; the LCD, no width

; CON LCD and CON UC1 select the ROM
; LCD without changing GLVEC. C is the
; width asked for, or 0 for none. A
; different width fails before effects.

CONLCD:
  ld a,(CONDEV)
  rrca
  jr nc,CONSHOW  ; no matrix: keep serial
  ld a,c
  or a
  jr z,CONLOK    ; retain the profile
  cp 20
  jr z,CONLPRO
  cp 40
  jr nz,CONLB

CONLPRO:
  call LCDWID
  jr nc,CONLOK
  ld hl,LCD40MSG
  call PUTS
  jp MAINLOOP

CONLB:
  jp BADCMD      ; the later refusals

CONLOK:
  xor a
  call CONASEL   ; keep GLVEC registered
  ld b,CMUC1
  call CONFLD
  jr CONSHOW

; Plain modes set the CON field. Only
; the explicit GLCD name loads or
; selects its driver. Set UC1 first so
; its INIT sees the requested mode.
; A failed load restores that field.

CONFL:
  ld a,b
  cp CMCRT
  jr nz,CONFL1
  ld a,(PIVEC+1)
  or a
  jr z,CONLB
  ld a,(VCLAIM)
  or a
  jr nz,CONLB

CONFL1:
  call CONFLD
  jr CONSHOW

CONGLCD:
  ld b,CMUC1
  call CONFLD
  ld c,0
  call GLCLD
  jr nc,CONGOK
  call CONROLL
  jr CONSHOW

CONGOK:
  ld a,1
  call CONASEL

CONSHOW:
  call CONREP    ; apply and report target
  call CONASK
  call CONTEND
  jp MAINLOOP

CONRPT:
  call CONREP
  jp MAINLOOP

; Snapshot the effective console, not
; just its two IOBYTE mode bits. The
; registered driver remains in GLVEC.
; Its saved address is an identity to
; compare, never a pointer to install.
; Changes AF, BC, DE and HL.

CONSAVE:
  call CONSEL
  ld a,(CONOLD)
  and $40        ; cold bypass latch
  ld b,a
  ld a,(CONMOD)
  or b
  or $80
  ld (CONOLD),a
  ld a,(CONAUX)
  ld (CAXOLD),a
  ld a,(PIWID)
  ld (CPIOLD),a
  ld a,(LCDPRF)
  ld (CLDOLD),a
  ld hl,(GLVEC)
  ld (CGLDOLD),hl
  ret

; Z when physical device and geometry
; match the snapshot. An auxiliary
; driver must be the same live table.
; Changes AF, B, DE and HL.

CONDIFF:
  ld a,(CONOLD)
  and 3
  ld b,a
  ld a,(CONMOD)
  xor b
  ret nz
  ld a,b
  cp CMCRT
  jr z,CONDPIC
  cp CMUC1
  jr nz,CONDYES
  ld a,(CAXOLD)
  ld hl,CONAUX
  xor (hl)
  ret nz
  ld a,(CONAUX)
  or a
  jr nz,CONDGLC
  ld a,(CLDOLD)
  ld hl,LCDPRF
  cp (hl)
  ret

CONDPIC:
  ld a,(CPIOLD)
  ld hl,PIWID
  cp (hl)
  ret

CONDGLC:
  ld hl,(CGLDOLD)
  ld de,(GLVEC)
  or a
  sbc hl,de
  ret

CONDYES:
  xor a
  ret

; Confirm only a changed device or
; width. This uses ROM console calls
; so cold startup can share it before
; the card and BDOS are available.
; KEYWT takes a fresh target key.

CONASK:
  call CONDIFF
  ret z
  ld hl,PRESSK
  call PUTS
  ld hl,KWPOLL
  call KEYWT
  push af
  call PUTCRLF
  pop af
  ret nz
  call CONROLL
  jp CONREP

; Restore the former profile and route.
; A driver drop clears CGLDOLD, so even
; a new installation at the same page
; cannot pass the identity comparison.
; GLVEC is never written here. Missing
; devices fall back to the ROM LCD,
; then serial when no matrix is fitted.
; Changes AF, BC, DE and HL.

CONROLL:
  ld a,(CLDOLD)
  or a
  jr nz,CONR40
  ld a,20
  call LCDWID
  jr CONRPIC

CONR40:
  call LCDWSET

CONRPIC:
  ld a,(CPIOLD)
  ld hl,PIWID
  cp (hl)
  jr z,CONRAUX
  or a
  jr z,CONRAUX   ; no former PICO
  call TMSWID
  jr nc,CONRAUX
  xor a
  call CONASEL
  ld a,CMUC1
  jp CONSW       ; unavailable width

CONRAUX:
  ld a,(CONOLD)
  and 3
  ld b,a
  ld a,(CAXOLD)
  or a
  jr z,CONRSET
  ld hl,(CGLDOLD)
  ld a,h
  or l
  jr z,CONRSET   ; old identity gone
  ld de,(GLVEC)
  or a
  sbc hl,de
  ld a,0
  jr nz,CONRSET
  inc a          ; the same live driver

CONRSET:
  call CONASEL
  ld a,b
  jp CONSW

; End a transaction after success or
; rollback. Error and warm-boot paths
; clear the same flag independently.

CONTEND:
  ld hl,CONOLD
  res 7,(hl)
  ret

; Report through ROM output, available
; before BDOS initialisation as well.

CONREP:
  ld hl,CONHDR
  call PUTS
  ld a,(CONMOD)
  add a,a
  add a,a
  ld l,a
  ld h,0
  ld de,CONNAMS
  add hl,de
  ld b,4

CONSH1:
  push bc
  push hl
  ld a,(hl)
  call PUTA
  pop hl
  pop bc
  inc hl
  djnz CONSH1
  jp PUTCRLF

; Wait a finite processor-work budget
; for a fresh key on the selected
; keyboard. Discard prior bytes and
; arrow tails. Matrix input first needs
; all keys released. Serial first needs
; at least twelve idle bit periods.
; No housekeeping or route change runs
; inside this timed wait. Normal BIOS
; input keeps its existing behaviour.
; HL is the calibrated slot budget.
; NZ: consumed key in A; Z: timeout.
; Changes AF, BC, DE and HL.

KEYWT:
  xor a
  ld (RXFULL),a
  ld (KBTN),a
  ld a,(CONMOD)
  rrca
  jr nc,KEYWS
  push hl
  call CURSHOW
  pop hl
  ld de,0        ; E: release observed

KEYWM:
  push hl
  push de
  call KEYUP
  pop de
  jr nz,KEYWM1
  ld e,1

KEYWM1:
  push de
  call KBPOLL
  pop de
  pop hl
  jr z,KEYWM3
  ld a,e
  or a
  jr z,KEYWM2
  ld a,(RXCHAR)
  jr KEYWTAKE

KEYWM2:
  xor a          ; held/pending input
  ld (RXFULL),a
  ld (KBTN),a

KEYWM3:
  ld b,KWPAD

KEYWM4:
  djnz KEYWM4
  dec hl
  ld a,h
  or l
  jr nz,KEYWM
  jr KEYWZERO

KEYWS:
  ld de,0        ; D: idle slots, E armed

KEYWS1:
  push hl
  call KWSPOLL
  pop hl
  jr nz,KEYWTAKE
  ld b,1
  jr nc,KEYWS2
  ld b,3         ; a received frame

KEYWS2:
  dec hl
  ld a,h
  or l
  jr z,KEYWZERO
  djnz KEYWS2
  jr KEYWS1

KEYWTAKE:
  push af
  xor a
  ld (RXFULL),a
  ld (KBTN),a
  call CURHIDE
  pop af
  or a
  ret

KEYWZERO:
  call CURHIDE
  xor a
  ret

; Scan every matrix row at fixed cost.
; Z means all keys are up. No key is
; translated or published here.
; Changes AF, BC and D.

KEYUP:
  ld bc,$FEFE
  ld d,$FF

KEYUP1:
  in a,(c)
  and d
  ld d,a
  rlc b
  jr c,KEYUP1
  inc d
  ret

; One bounded serial poll. Unarmed:
; accumulate complete idle windows, so
; a prior partial frame cannot confirm.
; Armed: detect a start with the normal
; tight poll, receive one byte and check
; both stop bits. Any rejected frame
; returns to idle qualification.
; A=0/Z for none, key/NZ for a fresh
; non-NUL frame. Carry charges a frame
; as three slots instead of one.
; Keeps HL. Changes AF, BC and DE.

KWSPOLL:
  in a,(KEYPORT)
  ld a,e
  or a
  jr nz,KWSARM
  ld c,$FF
  ld b,97

KWSIDLE:
  in a,(STSPORT)
  and c
  ld c,a
  djnz KWSIDLE
  rlc c
  jr nc,KWSLOW
  inc d
  ld a,d
  cp 4           ; over twelve bit times
  jr c,KWSNONE
  ld e,1

KWSNONE:
  xor a
  ret

KWSLOW:
  ld d,0
  jr KWSNONE

KWSARM:
  ld b,RXPOLL

KWSLOOK:
  in a,(STSPORT)
  rlca
  jr nc,KWSSTART
  djnz KWSLOOK
  ld b,38

KWSPAD:
  djnz KWSPAD
  xor a
  ret

KWSSTART:
  call RXBITS
  push af
  in a,(STSPORT)
  ld c,a         ; first stop sample
  ld d,RXDLY

KWSSTOP:
  dec d
  jr nz,KWSSTOP
  in a,(STSPORT)
  and c          ; both stops high
  and $80
  ld e,a
  pop af
  bit 7,e
  jr z,KWSBAD
  and $7F
  jr z,KWSBAD

KWSRX:
  or a
  scf
  ret

KWSBAD:
  ld de,0
  xor a
  scf
  ret

KWSEND:

; Prepare transient page zero after a
; successful load. Input (ARGSTRT) is
; the bounded zero-ended argument tail.
; Save its original start, parse into
; FCBONE/FCBTWO, then copy the full tail
; with length at 0080h and zero after
; it. Set DMA=0080h through BDOS 26.
; FCBBASE/scratch and AF/BC/DE/HL may
; change.

PREPPAGE:

; Both parses ignore carry. An early
; error can leave the next parse at the
; same byte and partial FCB contents.
; The 36-byte areas at 005Ch/006Ch
; overlap. The second reaches 008Fh.
; Copy the original tail only after both
; parses.

  ld hl,(ARGSTRT)
  push hl        ; tail before trimming
  call SKIPSP
  ld de,FCBONE   ; first default FCB
  call PARSEFCB  ; ignore parser carry
  call SKIPSP
  ld de,FCBTWO   ; overlapping FCB
  call PARSEFCB  ; ignore parser carry
  pop hl
  ld de,CMDTAIL+1
  ld b,0

TAILLOOP:
  ld a,(hl)
  or a
  jr z,TAILDONE  ; zero-ended piece
  ld (de),a
  inc hl
  inc de
  inc b
  jr TAILLOOP

TAILDONE:
  ld a,b

  ld (CMDTAIL),a
  xor a
  ld (de),a      ; zero after tail
  ld de,CMDTAIL
  jp SETDMA      ; 26: default DMA

; Parse from HL into 36 writable FCB
; bytes at DE, saved in FCBBASE.
; Initialise drive=0, eleven name/type
; spaces and 24 trailing zero bytes.
; Empty input succeeds with a blank FCB.
; Uppercase A..P before a colon encodes
; drive 1..16.
; On success HL reaches the delimiter.
; Invalid drive leaves it at the token
; start. Field errors follow PARFLD.
; AF/B/DE change, C is preserved and HL
; is the position result. Errors can
; leave partial copied fields.

PARSEFCB:

  ld (FCBBASE),de
  push de        ; keep destination base
  xor a
  ld (de),a      ; logical default drive
  inc de
  ld b,11
  ld a,SPACE     ; blank name/type

FCBSPACE:
  ld (de),a
  inc de
  djnz FCBSPACE
  xor a

; Clear EX/S1/S2/RC, allocation map, CR
; and random fields before reuse. A
; stale CR could make a later COM load
; start at record one instead of zero.

  ld b,24        ; clear trailing state

FCBZERO:
  ld (de),a
  inc de
  djnz FCBZERO
  pop de         ; recover FCB base
  ld a,(hl)
  or a
  ret z          ; empty token: success
  inc hl
  ld a,(hl)      ; drive colon position
  dec hl
  cp ':'
  jr nz,FCBNAME  ; no prefix: default
  ld a,(hl)
  sub 'A'        ; A..P to 0..15
  cp 16
  jr nc,PLEND    ; not A..P: carry
  inc a
  ld (de),a      ; FCB drive 1..16
  inc hl
  inc hl         ; past drive prefix

; Parse eight name slots through PARFLD.
; Propagate carry errors. After a dot,
; advance DE by unfilled B slots to the
; type field, including address carry,
; then parse three slots. Otherwise
; return carry clear. FCBDRBAD rejects
; all drive letters outside A..P,
; including below A.

FCBNAME:
  inc de         ; name field
  ld b,8         ; positive name bound
  call PARFLD
  ret c          ; propagate field error
  ld a,(hl)
  cp '.'
  jr z,FCBDOT    ; type follows dot
  or a           ; successful parse
  ret

FCBDOT:
  inc hl
  ld a,e
  add a,b        ; skip unfilled slots
  ld e,a
  jr nc,FCBTYP
  inc d          ; type address carry

FCBTYP:
  ld b,3         ; positive type bound

; Parse a field with positive B=8 or 3,
; source HL and destination DE. FCBEND
; defines delimiters. A star enters
; PARSTAR. Validate other bytes before
; copying.
; Forbidden bytes return carry at that
; byte. A full field succeeds only
; before a delimiter. Otherwise scan to
; one and return carry. Success: Z/carry
; clear, A/HL at delimiter, DE after
; output and B slots left. C is
; preserved.

PARFLD:
  call FCBEND    ; test exact delimiter
  ret z          ; short field succeeds
  cp '*'
  jr z,PARSTAR   ; expand field suffix
  call VALIDCHR  ; validate copied byte
  ret c          ; early invalid byte
  ld (de),a
  inc de
  inc hl
  djnz PARFLD    ; bounded field copy

PARSKIP:
  call FCBEND
  ret z          ; exactly full succeeds

PARLONG:
  inc hl
  call FCBEND
  jr nz,PARLONG  ; overlong: scan to end

PLEND:
  scf            ; overlong, bad drive
  ret

; Require an unambiguous parsed name at
; (FCBBASE). Reject first name byte
; SPACE or '?' in any of the 11
; name/type bytes. Parsed stars have
; expanded to question marks. Raw stars
; are not scanned here.
; Preserve BC/HL/DE. Return carry for
; rejection through CHRRET. A is not
; preserved.

UNAMBIG:
  push hl
  push bc
  ld hl,(FCBBASE)
  inc hl
  ld a,(hl)
  cp SPACE
  jr z,CHRRET    ; blank name rejected
  ld bc,11       ; name/type scan length
  ld a,'?'
  cpir           ; find parsed wildcard
  jr CHRRET

; Test input A against BADCHARS' 13-byte
; blacklist. Dot/equals are separate
; delimiters. Question/star are grammar.
; No other control/high-bit filtering is
; added here.
; Preserve A/BC/HL. Change F. CHRRET
; sets carry for membership.

VALIDCHR:
  push hl
  push bc
  ld hl,BADCHARS
  ld bc,13       ; 13 forbidden bytes
  cpir           ; membership -> Z

; Shared scan return: callers pushed HL
; then BC, so BC is above HL. Pop BC
; then HL. Incoming Z returns carry set.
; Incoming NZ uses OR A to clear carry.
; VALIDCHR preserves input A. UNAMBIG
; does not.

CHRRET:
  pop bc
  pop hl
  scf            ; carry for match
  ret z          ; incoming Z
  or a           ; nonmatch: carry clear
  ret

; Expand a star into positive B
; remaining slots at DE, filling '?' and
; leaving B=0. Advance HL past the star
; and skip its suffix to an FCBEND
; delimiter without further validation.
; Return PARFLD's successful
; delimiter/flags result.

PARSTAR:
  ld a,'?'

STARLOOP:
  ld (de),a
  inc de
  djnz STARLOOP  ; positive B slots
  inc hl

PARIGN:
  call FCBEND    ; delimiter test only
  ret z
  inc hl
  jr PARIGN

; Read (HL) without advancing. Zero,
; SPACE, '=' and '.' return Z/carry
; clear with that byte in A. Other bytes
; return NZ with flags from CP '.'.
; Changes AF only.

FCBEND:
  ld a,(hl)
  or a
  ret z          ; zero delimiter
  cp SPACE
  ret z          ; SPACE delimiter
  cp '='         ; equals delimiter
  ret z
  cp '.'         ; dot delimiter
  ret            ; other byte: NZ

; Skip literal SPACE bytes from HL.
; Return A=(HL), NZ and carry if the
; first other byte is below SPACE,
; including zero. Callers needing
; end-of-line Z must OR A. Changes AF
; and HL.

SKIPSP:
  ld a,(hl)
  cp SPACE       ; flags from CP SPACE
  ret nz         ; NZ even at zero
  inc hl         ; literal spaces only
  jr SKIPSP

; Compare keyword at DE with text at
; (CMDSTRT). Match requires the
; keyword's zero and command zero/SPACE
; together. Return Z with DE at keyword
; zero. On mismatch return NZ with DE at
; the differing byte or keyword zero for
; a longer command.
; Changes AF/HL. DE advances during
; matching. KEYNXT skips only the
; unmatched suffix.

ISCMD:

  ld hl,(CMDSTRT)

KEYLOOP:
  ld a,(de)
  or a
  jr z,KEYEND    ; keyword ended
  cp (hl)
  ret nz         ; differing byte
  inc de
  inc hl
  jr KEYLOOP     ; matched prefix

KEYEND:
  ld a,(hl)
  or a
  ret z          ; command zero: match
  cp SPACE
  ret            ; SPACE is also match

; BDOS 26, set DMA: to LOADBUF (SETLB)
; or to the caller's DE (SETDMA).
; Changes AF/BC/DE/HL according to BDOS.

SETLB:
  ld de,LOADBUF

SETDMA:
  ld c,26        ; 26: set DMA

TOBDOS:
  jp BDOS

; Print the dollar-ended string at DE
; through BDOS 9. Tail-enter BDOS
; without a private save frame. Changes
; AF/BC/DE/HL according to BDOS.

PUTSTR:
  ld c,9         ; 9: dollar string
  jr TOBDOS

; Print E through BDOS 2 with OUTCHAR
; bookkeeping and printer echo.
; Save/restore BC/HL around the call.
; AF/DE may change. Callers rely on that
; traversal/count preservation.

PUTCHAR:
  push bc
  push hl
  ld c,2         ; 2: character E
  call BDOS
  pop hl
  pop bc
  ret

; Attempt startup only at STPOS=0. Set
; 80h before access, then bypass if raw
; STSPORT bit 6 is low (a keypad key
; held through reset) or the matrix
; keyboard's Fn is held, so a board with
; only the matrix keyboard can skip a
; bad STARTUP.CMD too. With no matrix
; keyboard the row reads high.
; Otherwise open A:STARTUP.CMD and read
; its first record into LOADBUF, which
; nothing else uses before STLINE takes
; the line. Failure leaves the finished
; state. A zero read result sets
; STPOS=1.
; On the returning I/O path set
; CURDMA=DEFDMA directly. No close is
; attempted. Changes AF/BC/DE/HL.

STBOOT:
  ld hl,STPOS    ; one-shot state
  ld a,(hl)
  or a
  ret nz         ; attempt already done
  set 7,(hl)     ; mark before access

  in a,(STSPORT)
  and $40        ; bit 6 bypass test
  ret z          ; low: bypass startup
  ld bc,$FEFE    ; matrix row 0
  in a,(c)
  and $04        ; Fn, low while held
  ret z          ; held: bypass too
  ld hl,STFCB    ; A:STARTUP.CMD
  ld de,CMDFCB
  ld bc,12       ; 12-byte reference
  ldir
  call SETLB     ; 26: LOADBUF DMA
  call DOSSEQ    ; open descriptor
  DB 15*2+0      ; 15: CMDFCB
  inc a
  jr z,STBDMA    ; FFh: leave finished
  call DOSSEQ    ; read one record
  DB 20*2+0      ; 20: CMDFCB
  or a
  jr nz,STBDMA   ; NZ: leave finished
  inc a          ; one-based first byte
  ld (STPOS),a

STBDMA:
  ld hl,DEFDMA   ; default DMA value

  ld (CURDMA),hl
  ret

; Get the one startup line, once: the
; first line of the record in LOADBUF
; that is neither empty nor starting
; with ;. Zero, 1Ah or the record's end
; ends the text, and CR or LF a line.
; At most 127 characters are kept; the
; rest of the line is read past. A
; shell loaded by this line reads the
; rest of the file itself. Carry: no
; line. Otherwise set CMDLEN, echo the
; line through PUTSTR and return carry
; clear. Changes AF/BC/DE/HL.

STLINE:
  ld hl,STPOS    ; 1: a record waits
  ld a,(hl)
  dec a
  scf
  ret nz         ; none, or done
  ld (hl),$80    ; done after this one
  ld hl,LOADBUF
  ld de,CMDTXT
  ld bc,127*256+128

; B counts the slots left, C the record
; bytes left.

STL1:
  ld a,(hl)
  inc hl
  or a
  jr z,STLE      ; zero ends source
  cp 26
  jr z,STLE      ; 1Ah ends source
  cp 13
  jr z,STLCR     ; CR ends a line
  cp 10
  jr z,STLCR     ; LF ends a line
  inc b          ; test full, keep A
  dec b
  jr z,STLN      ; full: keep no more
  ld (de),a
  inc de
  dec b

STLN:
  dec c
  jr nz,STL1     ; record bytes left
  jr STLE

STLCR:
  ld a,e
  cp LOW(CMDTXT)
  jr z,STLN      ; blank so far: skip
  ld a,(CMDTXT)
  cp ';'
  jr nz,STLE     ; a line ends
  ld de,CMDTXT   ; a comment: restart
  ld b,127
  jr STLN

STLE:
  ld a,(CMDTXT)
  cp ';'
  scf
  ret z          ; a last comment line
  ld a,e
  sub LOW(CMDTXT)
  scf
  ret z          ; no line
  ld (CMDLEN),a  ; counted input layout

; At 127 characters CR uses the last
; CMDTXT byte; the dollar uses APIRTPC
; low. CCP owns no outer hardware/BIOS
; return here. BDOS echo inherits its
; own context; a later root API call
; sets the complete return PC anew.

  ex de,hl
  ld (hl),13     ; CR for echo
  inc hl
  ld (hl),'$'    ; PUTSTR echo end
  ld de,CMDTXT
  call PUTSTR    ; stops at embedded $
  or a           ; carry-clear line
  ret
