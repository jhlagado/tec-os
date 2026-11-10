; CCP built-ins UNLOAD/CON/USER/SAVE,
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
  cp 6           ; six name records
  jr nz,CONNXT

CONBAD:
  jr TOBADCMD

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
  call ARGSKIP   ; argument/error start
  jp z,CONSHOW   ; no operand: report
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
; unchanged, GLCD 4->UC1 3 and PICO
; 5->CRT 1 (11-2B). Discard the saved
; argument word and consume an optional
; colon. HL then points at following
; text.

CONMAT:
  pop af         ; discard saved pointer
  ld a,b
  cp 4
  jr c,CONHIT    ; 0..3 already modes
  add a,a
  cpl
  add a,12       ; 11-2B: aliases
  ld b,a         ; selected mode

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
  cp CMCRT
  jr nz,CONBAD
  ld a,(hl)      ; first decimal digit
  sub '0'
  cp 10
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
  cp 10
  jr nc,CONBAD
  add a,c        ; binary width
  inc hl
  push af        ; width across calls
  call ENDCHK    ; reject suffix

; FIND PICO at minimum PICOWVER through
; TNFIND. Keep the width across
; ENDCHK/FIND and recover it in B. If no
; table is found, typed input enters
; BADCMD. A startup line enters STARTED
; without changing CON. Width validation
; has not run yet (KD-173).

  ld de,CONNAMS+20
  ld bc,PICOWVER*256+TNFIND
  call ABICALL   ; FIND result table
  pop bc         ; B=saved width
  jr nc,CONWD    ; NC: table found
  ld a,(STFLAG)  ; startup origin flag
  or a
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
  jr c,CONBAD
  ld b,CMCRT     ; width set: CRT mode
  jr CONFL

CONNW:
  call ENDCHK    ; name-only suffix

; Select B through CONFLD. UC1 calls
; GLCLD to reuse/load GLCD. After a
; returned failure, GLCLD copies
; then-current CONMOD through B into CON
; bits, keeping other IOBYTE fields. It
; reads no pre-call snapshot. CONHDR
; output triggers routing. Report
; resulting CONMOD and enter MAINLOOP.
; Cold PISTART skips PIVEC setup when
; CDMTX is clear.

CONFL:
  call CONFLD    ; write requested mode
  ld a,b
  cp CMUC1       ; UC1 requires GLCD
  call z,GLCLD   ; load/reuse driver

CONSHOW:
  ld de,CONHDR   ; report after routing
  call PUTSTR    ; output triggers route
  ld a,(CONMOD)  ; effective mode
  add a,a        ; four bytes per name
  add a,a
  ld l,a
  ld h,0
  ld de,CONNAMS
  add hl,de
  ld b,4

CONSH1:
  ld e,(hl)
  call PUTCHAR   ; keeps BC/HL
  inc hl
  djnz CONSH1
  ld de,CRLFMSG
  call PUTSTR

CONMAIN:
  jp MAINLOOP

; USER: require one decimal number 0..15
; with no non-space suffix. Pass E=B to
; BDOS 32 and enter MAINLOOP.
; Invalid/missing input enters BADCMD.
; This command range is narrower than
; the five-bit BDOS setter.

CMDUSER:
  call ARGSKIP   ; decimal operand
  sub '0'
  cp 10          ; a digit must lead
  jr nc,USRBAD
  ld b,a         ; tens or units
  inc hl
  ld a,(hl)
  sub '0'        ; optional second digit
  cp 10
  jr nc,USERDONE
  cp 6           ; only 10..15
  jr nc,USRBAD
  dec b          ; after a leading 1
  jr nz,USRBAD
  add a,10       ; 10..15
  ld b,a
  inc hl

USERDONE:
  call ENDCHK    ; validate entire token
  ld e,b
  ld c,32        ; 32: set user
  call BDOS
  jr CONMAIN

USRBAD:
  jp BADCMD

; SAVE n NAME: write n 256-byte TPA
; pages from 0100h. Reject eight-bit
; overflow and require count <
; (PZBDOS+2), the BDOS entry page byte
; at 0007h. Require a space then one
; unambiguous complete name.
; Delete the existing target before
; making it anew. FFh make enters
; SAVENOSP. Save the count and start
; address, then write two records per
; page. If make succeeds with count
; zero, skip data writes and attempt
; close. Ends at MAINLOOP or error.

CMDSAVE:
  call ARGSKIP   ; decimal page count
  sub '0'
  cp 10          ; a digit must lead
  jr nc,USRBAD
  ld b,0         ; eight-bit count

SAVENUM:
  ld a,(hl)
  sub '0'
  cp 10          ; a digit?
  jr nc,SAVENEND
  ld e,a
  ld a,b
  cp 26          ; 26*10 overflows
  jr nc,USRBAD
  add a,a
  ld d,a
  add a,a
  add a,a        ; B*8
  add a,d        ; B*10, below 256
  add a,e        ; plus the digit
  jr c,USRBAD    ; past 255
  ld b,a
  inc hl
  jr SAVENUM

SAVENEND:
  cp $F0         ; SPACE less '0'
  jr nz,USRBAD   ; need one space

  ld a,(PZBDOS+2)
  ld c,a
  ld a,b
  cp c           ; below BDOS's page?
  jr nc,USRBAD

  ld (SAVEPGS),a
  call SKIPSP    ; A=first name byte
  or a
  jr z,USRBAD    ; no name
  call ONENAME   ; one complete name

  call DOSSEQ    ; destructive delete
  DB 19*2+0      ; 19: CMDFCB
  call DOSSEQ    ; create replacement
  DB 22*2+0      ; 22: CMDFCB
  inc a
  jr z,SAVENOSP  ; FFh make: NO SPACE
  ld hl,TPA

  ld (SAVEADR),hl

; Write each remaining page as two
; SAVE128 records. Either carry enters
; SAVEWER. Decrement SAVEPGS only after
; both succeed. On zero remaining pages
; enter SAVECLS.

SAVELOOP:
  ld a,(SAVEPGS)
  or a
  jr z,SAVECLS   ; no pages: close
  call SAVE128   ; first half-page
  jr c,SAVEWER
  call SAVE128   ; second half-page
  jr c,SAVEWER   ; returned write error
  ld hl,SAVEPGS
  dec (hl)
  jr SAVELOOP

; Write CMDFCB's next record from
; (SAVEADR). Set DMA through BDOS 26,
; then call function 21 through DOSSEQ.
; On nonzero returned A set carry
; without changing SAVEADR. On zero
; advance it by 128 and return carry
; clear.
; BDOS errors may exit nonlocally.
; Changes AF/BC/DE/HL.

SAVE128:
  ld de,(SAVEADR)
  call SETDMA
  call DOSSEQ    ; sequential write
  DB 21*2+0      ; 21: CMDFCB
  or a
  scf
  ret nz         ; NZ: keep SAVEADR
  ld hl,(SAVEADR)
  ld de,128
  add hl,de

  ld (SAVEADR),hl
  ret

; Attempt to close CMDFCB through DOSSEQ
; function 16. FFh enters SAVENOSP.
; Other returned codes enter MAINLOOP.
; BDOS errors may exit nonlocally.

SAVECLS:
  call DOSSEQ    ; close attempt
  DB 16*2+0      ; 16: CMDFCB
  inc a
  jr z,SAVENOSP  ; FFh close: NO SPACE
  jp MAINLOOP

; After a returned write failure,
; attempt to close CMDFCB, ignoring its
; ordinary result, then enter SAVENOSP.
; Earlier writes are not undone.

SAVEWER:
  call DOSSEQ    ; cleanup close attempt
  DB 16*2+0      ; ignore close result

; Report NOSPACE through ERRGO, setting
; PRGCODE=FF00h before the message and
; STARTED. A later conditional piece
; tests this failure code.

SAVENOSP:
  ld de,NOSPACE
  jp ERRGO

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
  jp SETDMA

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
  sub 'A'        ; drive lower bound
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
  scf            ; overlong carry
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

; SERVICES: follow SVCHEAD/DOWN from the
; lowest resident upward, ending at
; MAINLOOP on zero. Print the eight-byte
; name through PUTTRIM and the decimal
; page span: SVCABV(DOWN) minus this
; owner's page. Zero DOWN resolves to
; the stub.
; Save owner HL across decimal/string
; output, then reload DOWN.

CMDSVC:

  ld a,(SVCHEAD)

CMDDL:
  or a
  jp z,MAINLOOP  ; end of owner chain
  ld h,a         ; owner name address
  ld l,DNAM
  ld b,8         ; eight name bytes
  call PUTTRIM   ; masked nonspaces
  ld e,' '       ; page-count separator
  call PUTCHAR
  push hl        ; owner page across I/O
  ld l,DOWN      ; next-owner link
  ld a,(hl)      ; 0 means stub above
  call SVCABV    ; upper page boundary
  sub h          ; owned page count
  ld l,a
  ld h,0
  call PUTDEC    ; decimal span
  ld de,CRLFMSG
  call PUTSTR
  pop hl
  ld l,DOWN
  ld a,(hl)      ; reload next owner
  jr CMDDL

; Attempt startup only at STPOS=0. Set
; 80h before access, then bypass if raw
; STSPORT bit 6 is low. Otherwise open
; A:STARTUP.CMD and read one record into
; STREC. Failure leaves the finished
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
  ld hl,STFCB    ; A:STARTUP.CMD
  ld de,CMDFCB
  ld bc,12       ; 12-byte reference
  ldir
  ld de,STREC    ; one-record DMA
  call SETDMA
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

; Get a startup line from STREC. If
; STPOS bit 7 is set, return carry with
; no line. Otherwise require active
; STPOS=1..7Fh and the same-page record
; layout. Decode that one-based position
; and copy at most 127 characters to
; CMDTXT.
; Skip blank lines. For nonempty output
; set CMDLEN/buffer and return carry
; clear after dollar-string echo.
; Changes AF/BC/DE/HL.

STLINE:
  ld hl,STPOS    ; startup position
  ld a,(hl)
  rlca           ; finished bit -> carry
  ret c          ; finished: no line
  rrca           ; recover position

  add a,LOW(STREC)-1
  ld l,a         ; same-page layout
  ld h,HIGH(STREC)
  ld de,CMDTXT
  ld b,127       ; 127 output slots

; Scan within the single 128-byte STREC.
; Check its end before reading. Zero/1Ah
; ends the source; CR/LF ends a line.
; Store at most 127 characters, then
; consume the rest of that line without
; storing. A final record byte reached
; within a line can be data.

STL1:
  ld a,l
  cp LOW(STREC+128)
  jr z,STLE      ; end reached: finish
  ld a,(hl)
  inc hl
  or a
  jr z,STLE      ; zero ends source
  cp 26
  jr z,STLE      ; 1Ah ends source
  cp 13          ; CR ends line
  jr z,STL2
  cp 10          ; LF ends line
  jr z,STL2
  inc b          ; test full, keep A
  dec b
  jr z,STL1      ; full: consume only
  ld (de),a
  inc de
  dec b
  jr STL1

STLE:

; At EOF use STLAST=STREC+127 so the
; position conversion stores 80h.
; Otherwise save the next one-based
; position. Bit 7 marks the finished
; state. If output is empty retry
; STLINE.
; Store CMDLEN and append CR/dollar for
; PUTSTR echo. An embedded '$' stops
; echo early. CMDLEN/CMDTXT retain all
; stored characters. MLGOT replaces the
; length-boundary CR with zero.
; At 127 characters the dollar occupies
; adjacent BOOTDRV, already consumed by
; CCPENT before STLINE.

  ld l,LOW(STLAST)

STL2:
  ld a,l

  sub LOW(STREC)-1
  ld (STPOS),a   ; save position/state
  ld a,e
  sub LOW(CMDTXT)
  jr z,STLINE    ; skip blank output
  ld (CMDLEN),a  ; counted input layout
  ex de,hl
  ld (hl),13     ; CR for echo
  inc hl
  ld (hl),'$'    ; PUTSTR echo end

  ld de,CMDTXT
  call PUTSTR    ; stops at embedded $
  or a           ; carry-clear line
  ret
