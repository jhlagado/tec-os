; ERA name: delete the files the name
; matches, which may be ambiguous. A
; name that is all ? (*.*, on any drive)
; first asks ALL (Y/N)? and deletes
; nothing unless the answer starts with
; Y. NO FILE when nothing matched; a
; bad command with no operand, or one
; that does not parse. Uses CMDFCB,
; ERAANS and ERAALL; returns to the
; prompt.
; ERA deletes through BDOS only after
; the complete operand has parsed.
CMDERA:
  call ARGSKIP
  jp z,BADCMD    ; no operand
  call CMDPARSE  ; the name into CMDFCB,
  call ENDCHK    ; with nothing after it
  xor a
  ld (ERAALL),a  ; not a whole-drive
                 ; erase unless
                 ; confirmed
; is every name and type byte ?
  ld hl,CMDFCB+1
  ld b,11

ERACHK:
  ld a,(hl)
  cp '?'
  jr nz,ERADEL   ; one is not: delete
                 ; without asking
  inc hl
  djnz ERACHK
; all are: ask ALL (Y/N)?
  ld de,ALLQUERY
  call PUTSTR
  ld c,1         ; BDOS 1, a key, echoed
  call BDOS
  cp CR          ; Return alone is no:
  jp z,STARTED   ; nothing is deleted
  and $DF        ; the answer in upper
                 ; case, kept
  ld (ERAANS),a  ; while the line is
                 ; read out

ERADRAIN:
  ld c,1         ; the rest of the
                 ; answer's line,
  call BDOS      ; read and dropped up
                 ; to its Return
  cp CR
  jr nz,ERADRAIN

ERAGOT:
  ld a,(ERAANS)
  cp 'Y'         ; an answer starting
                 ; with Y or y
  jp nz,STARTED  ; erases; any other
                 ; erases nothing
  ld a,1
  ld (ERAALL),a  ; confirmed

; Delete every file CMDFCB matches; NO
; FILE when none does. After the ALL
; question the prompt starts on a new
; line.
ERADEL:
  call DOSSEQ    ; delete: A FFh when
                 ; nothing matched
  DB 19*2+0      ; BDOS 19, source FCB
  inc a
  jr z,FILENO    ; nothing matched: NO
                 ; FILE
  ld a,(ERAALL)
  or a           ; after the question's
                 ; answer,
  jp nz,STARTED  ; a new line before the
                 ; prompt
  jp MAINLOOP    ; else the prompt at
                 ; once

; REN's public syntax is NEW=OLD. A
; separate destination FCB permits an
; existence check before the function-23
; mutation FCB is assembled.
; Both names are unambiguous and on one
; drive: either one's, the other
; naming none or the same. FILE EXISTS
; when NEW is there already, NO FILE
; when OLD is not, and a bad command
; otherwise. Uses CMDFCB for OLD, RENFCB
; for NEW, and LOADBUF as the DMA
; record; returns to the prompt.
CMDREN:
  call ARGSKIP
  jp z,BADCMD    ; no operand
  cp '='
  jp z,BADCMD    ; no new name before
                 ; the =
  ld de,RENFCB   ; the new name into
                 ; RENFCB,
  call FCBPARSE
  call CPCHK     ; unambiguous,
  ld a,(hl)
  cp '='         ; with the = straight
                 ; after it
  jp nz,BADCMD
  inc hl
  ld a,(hl)      ; the old name straight
                 ; after the =:
  or a           ; not the line's end,
  jp z,BADCMD
  cp SPACE       ; a space
  jp z,BADCMD
  cp '='         ; or a second =
  jp z,BADCMD
  call ONENAME   ; the old name into
                 ; CMDFCB, and no more

  ld hl,CMDFCB   ; one drive for both
                 ; names: the new one's
  ld a,(RENFCB)  ; or the old one's; two
                 ; different are bad
  or a
  jr z,RENOLD    ; the new names none:
                 ; the old one's
  cp (hl)
  jr z,RENTEST   ; both name the same
                 ; drive
  ld b,a
  ld a,(hl)
  or a           ; the old names
                 ; another: a bad
                 ; command
  jp nz,BADCMD
  ld (hl),b      ; the old names none:
                 ; the new one's

RENOLD:
  ld a,(hl)      ; CMDFCB's drive into
                 ; RENFCB
  ld (RENFCB),a

RENTEST:
  ld de,LOADBUF  ; BDOS 26: the search's
                 ; directory
  ld c,26        ; record goes to
                 ; LOADBUF
  call BDOS
  ld de,RENFCB   ; BDOS 17, search
                 ; first, for the new
  ld c,17        ; name, called directly
  call BDOS
  inc a          ; found: the new name
                 ; is taken
  jr nz,RENEXIST

  ld hl,RENFCB   ; the new drive and
                 ; name into CMDFCB's
; second half, where BDOS 23 reads them
  ld de,CMDFCB+16
  ld bc,12
  ldir
  call DOSSEQ    ; rename: A FFh when
                 ; OLD is not there
  DB 23*2+0      ; BDOS 23, source FCB
  inc a
  jp z,FILENO    ; not there: NO FILE
  jp MAINLOOP    ; renamed: the prompt

; The FILE EXISTS error: the new name is
; taken, and nothing is renamed.
RENEXIST:
  ld de,FILEEX
  jp ERRGO       ; the message at DE as
                 ; a failure

; Parse the next name at HL into the FCB
; at DE, unambiguous (CPNAME); parse
; it (CPPARSE), keeping DE, with the
; current drive from 0004h in a 0 drive
; byte; check the FCB just parsed is
; unambiguous (CPCHK). A bad command
; otherwise. PARSEFCB clears the rest of
; the FCB. Each leaves HL at the
; name's delimiter and destroys AF and
; BC; CPPARSE returns the drive in A.
CPNAME:
  call CPPARSE   ; parse, then check as
                 ; CPCHK

CPCHK:
  call UNAMBIG   ; carry: an empty or
                 ; ambiguous name
  jr c,CPBAD
  ret

CPPARSE:
  call SKIPSP    ; past the spaces
                 ; before the name
  push de
  call PARSEFCB  ; carry: a name that
                 ; does not parse
  pop de
  jr c,CPBAD
  ld a,(de)
  or a           ; a drive given is kept
  ret nz
  ld a,(CURDSK)  ; the drive in use
  and $0F        ; its low nibble, 0 for
                 ; A:,
  inc a          ; as an FCB's drive, 1
                 ; for A:
  ld (de),a
  ret

; TEC-OS: COPY SOURCE DEST copies a file
; a record at a time through the
; default DMA record, as COPY.COM does:
; open the source, erase and make the
; destination, read and write to the
; end, close, and print COPIED nnnn
; (records, hex) or the same error text.
; On a write error the destination
; is closed with the records written,
; where COPY.COM leaves it open.
; Nothing in the TPA is touched.
; DEST may be a drive alone, or a blank
; name with a type: the source's whole
; name is used. Both names carry their
; drive, the current one if none was
; given, and a destination that names
; the source is a bad command, with
; nothing opened, as is any text after
; DEST. Takes the operands at ARGSTRT.
; Uses CMDFCB for SOURCE, RENFCB for
; DEST and DIRNUM for the count
; of records; returns to the prompt.
CMDCOPY:
; the operands
  ld hl,(ARGSTRT)
  ld de,CMDFCB   ; the source into
                 ; CMDFCB, unambiguous
  call CPNAME
  ld de,RENFCB   ; the destination into
                 ; RENFCB
  call CPPARSE   ; DE kept
  call ENDCHK    ; nothing after it; DE
                 ; kept
  inc de
  ld a,(de)      ; its name's first
                 ; byte, a space when
  cp SPACE       ; only a drive or a
                 ; type was given
  jr nz,CPD1
; no name: the source's name and type
  ld hl,CMDFCB+1
  ld bc,11
  ldir

CPD1:
  call CPCHK     ; the destination
                 ; unambiguous
  ld hl,CMDFCB   ; the source itself?
  ld de,RENFCB   ; drive, name and type
                 ; compared,
  ld b,12        ; 12 bytes

CPSAME:
  ld a,(de)
  cp (hl)
  jr nz,CPGO     ; a byte differs:
                 ; another file
  inc hl
  inc de
  djnz CPSAME

CPBAD:
  jp BADCMD      ; the same file, or a
                 ; bad name

CPGO:
  ld de,DEFDMA   ; BDOS 26: records pass
                 ; through
  ld c,26        ; the default DMA
                 ; record at 0080h
  call BDOS
  call DOSSEQ    ; open the source
  DB 15*2+0      ; BDOS 15, source FCB
  inc a          ; FFh: not found
  ld de,CPNOSRC
  jr z,CPFAIL    ; NO SOURCE
  call DOSSEQ    ; erase any old
                 ; destination,
  DB 19*2+1      ; BDOS 19, destination
                 ; FCB
  call DOSSEQ    ; then make it anew
  DB 22*2+1      ; BDOS 22, destination
                 ; FCB
  inc a          ; FFh: no directory
                 ; entry free
  ld de,CPNODST
  jr z,CPFAIL    ; CANNOT MAKE DEST
  ld hl,0
; DIRNUM counts the records copied
  ld (DIRNUM),hl

CPLOOP:
  call DOSSEQ    ; the source's next
                 ; record
  DB 20*2+0      ; BDOS 20, source FCB
  or a           ; nonzero: the source's
                 ; end
  jr nz,CPDONE
  call DOSSEQ    ; written to the
                 ; destination
  DB 21*2+1      ; BDOS 21, destination
                 ; FCB
  or a           ; nonzero: the disk or
                 ; directory is full
  jr nz,CPWERR   ; WRITE ERROR, the
                 ; destination closed
; one more record copied
  ld hl,(DIRNUM)
  inc hl
  ld (DIRNUM),hl
  jr CPLOOP

CPDONE:
  call DOSSEQ    ; close the destination
  DB 16*2+1      ; BDOS 16, destination
                 ; FCB
  inc a          ; FFh: the close failed
  ld de,CPCLOSE
  jr z,CPFAIL    ; CLOSE ERROR
; COPIED and the count in hex,
  ld de,CPCOPIED
  call PUTSTR
; the high byte first
  ld a,(DIRNUM+1)
  call CPHEX     ; print high byte
  ld a,(DIRNUM)
  call CPHEX
  ld de,CRLFMSG
  jp PRTGO       ; then CR LF and the
                 ; prompt

CPWERR:
  call DOSSEQ    ; close the
                 ; destination, so that
                 ; the
  DB 16*2+1      ; records written are
                 ; in its entry
  ld de,CPWRITE  ; then WRITE ERROR,
                 ; whatever the close

CPFAIL:
  jp ERRGO       ; the message at DE as
                 ; a failure

; One inline byte after CALL: BDOS
; function*2 + destination bit
; (0=CMDFCB,
; 1=RENFCB). Advance the return PC past
; it, preserving HL, B and A. Keeps A,
; B and HL; the BDOS has C, DE and the
; result. No frame is added here; the
; READSRC terminal CALL/byte/RET holds
; one extra return word.
DOSSEQ:
  ex (sp),hl     ; HL at the descriptor
                 ; byte
  ld c,(hl)
  inc hl         ; the return address
                 ; past it,
  ex (sp),hl     ; and the caller's HL
                 ; back
  srl c          ; C the function, carry
                 ; the FCB bit
  ld de,CMDFCB   ; 0: the source FCB
  jr nc,DOSGO
  ld de,RENFCB   ; 1: the destination
                 ; FCB

DOSGO:
  jp BDOS        ; which returns to the
                 ; caller

; Print A as two hex digits by BDOS
; function 2, through console.asm's
; HEXHL.
; Destroys AF, BC, DE, HL.
CPHEX:
  ld hl,CPHEXC   ; each digit through
                 ; PUTCHAR
  jp HEXHL

CPHEXC:
  ld e,a         ; function 2 takes the
                 ; character in E
  jp PUTCHAR
