; The CCP's other commands and its
; parsing: UNLOAD, CON, USER and SAVE, a
; transient's tail and page, a file name
; into an FCB, the keyword table's
; lookup, the console's output, services
; by name and the startup file. Included
; after ccpfile.asm by rom.asm.

; UNLOAD: the lowest resident goes, or
; the command comes back with a question
; mark. Takes nothing from the line;
; ends at STARTED or BADCMD.

CMDUNL:
  call SVCUNL    ; its REMOVE run, and
                 ; its pages freed
  jp nc,STARTED  ; carry: SVCUNL refused
  jp BADCMD

; CON's name loop: not this name, so the
; next, or a bad command after six.
; Takes DE in CONNAMS at the byte that
; differed, C the name's bytes left
; there, B the name's number and the
; argument's address on the stack; goes
; back to CONNXT with HL at the argument
; again.

CONNO:
  pop hl         ; the argument's first
                 ; letter again

CONSKIP:
  inc de         ; to the next name
  dec c
  jr nz,CONSKIP
  inc b          ; the next name's
                 ; number: six names,
  ld a,b         ; TTY, CRT, BAT, UC1,
                 ; GLCD and PICO
  cp 6
  jr nz,CONNXT
  jp BADCMD      ; none of them matched

; TEC-OS: CON shows the console in use;
; CON TTY, CRT, BAT or UC1 (a colon may
; follow), or PICO for CRT: and GLCD for
; UC1:, sets the IOBYTE CON: field.
; After CRT or PICO a width, 80, 40 or
; 32, goes to the ROM's PICO9918 console
; through its table's PICOWID entry
; (KD-174); with that console not
; started, or any other width, the
; command is refused, but a line from
; STARTUP.CMD on a board with no such
; console is quiet, as for an absent
; device. The BIOS switches at the next
; console call, so the report appears on
; the new console, and names the serial
; terminal when the chosen display or
; keyboard is missing. UC1: loads
; GLCD.SVC first if it is not in. Takes
; the argument at ARGSTRT; ends at
; MAINLOOP, STARTED or BADCMD.

CMDCON:
  call ARGSKIP   ; an error names the
                 ; argument
  jp z,CONSHOW   ; no argument: show the
                 ; console
  ld de,CONNAMS  ; the names, four bytes
                 ; each,
  ld b,0         ; counted in B from
                 ; TTY's 0

CONNXT:
  push hl        ; the argument, for the
                 ; next name
  ld c,4         ; a name's bytes

CONCMP:
  ld a,(de)      ; a letter of the name,
                 ; or its colon
  cp ':'
  jr z,CONMAT    ; a three-letter name's
                 ; end
  cp (hl)        ; the argument's letter
                 ; differs:
  jr nz,CONNO    ; the next name
  inc hl
  inc de
  dec c
  jr nz,CONCMP   ; all four letters
                 ; alike: a match

CONMAT:
  pop af         ; matched: drop the
                 ; saved text pointer
  ld a,b         ; GLCD (4) is UC1:,
                 ; PICO (5) CRT:, 11 -
                 ; 2B
  cp 4
  jr c,CONHIT    ; TTY to UC1: the
                 ; number is the mode
  add a,a
  cpl            ; -2B - 1, and 12 more
                 ; makes 11 - 2B:
  add a,12       ; 3 for GLCD, 1 for
                 ; PICO
  ld b,a         ; B = the console mode,
                 ; CMTTY to CMUC1

CONHIT:
  ld a,(hl)
  cp ':'
  jr nz,CONEND
  inc hl         ; past a colon after
                 ; the name

CONEND:
  ld a,(hl)      ; a width only after a
                 ; space: CRT80 is
  cp SPACE       ; a bad name, and its
                 ; end ENDCHK's
  jr nz,CONNW
  call CMDSKIP   ; the width, named by
                 ; an error
  jr z,CONNW     ; spaces alone: no
                 ; width
  ld a,b
  cp CMCRT
  jp nz,BADCMD   ; a width after CRT:
                 ; alone
  ld a,(hl)      ; two decimal digits:
                 ; the columns, which
  sub '0'        ; TMSWID judges (80, 40
                 ; or 32)
  cp 10
  jp nc,BADCMD   ; the first is no digit
  ld c,a
  add a,a        ; the tens digit times
                 ; 10:
  add a,a        ; four times, plus
                 ; itself, doubled
  add a,c
  add a,a        ; the tens
  ld c,a
  inc hl         ; the units digit
  ld a,(hl)
  sub '0'
  cp 10
  jp nc,BADCMD   ; the second is no
                 ; digit
  add a,c        ; A = the columns
  inc hl         ; past the width
  push af        ; kept across ENDCHK
                 ; and the ABI's call
  call ENDCHK    ; nothing after the
                 ; width

; "PICO " at version 3

  ld de,CONNAMS+20
  ld bc,PICOVER*256+TNFIND
  call ABICALL   ; FIND: HL = the
                 ; console's table,
                 ; PIBLK
  pop bc         ; B = the columns
  jr nc,CONWD    ; found: the width goes
                 ; to it
  ld a,(STFLAG)  ; none, as on a serial
                 ; board: typed,
  or a           ; refused; from
                 ; STARTUP.CMD, quiet,
  jp z,BADCMD    ; the code left 0, as
                 ; for an absent
  jp STARTED     ; device's service
                 ; (KD-173)

CONWD:
  ld de,PICOWID  ; the table's width
                 ; entry, its
  add hl,de
  ld a,(hl)      ; address into HL
  inc hl
  ld h,(hl)
  ld l,a
  ld a,b
  call VHLJP     ; A = the columns:
                 ; carry if refused
  jp c,BADCMD
  ld b,CMCRT     ; the width set: CRT:
                 ; the console
  jr CONFL

CONNW:
  call ENDCHK    ; nothing after the
                 ; name

CONFL:
  call CONFLD    ; B into the IOBYTE's
                 ; CON: field
  ld a,b         ; UC1: the GLCD's
                 ; driver, if it is not
                 ; in
  cp CMUC1       ; (a failure puts the
                 ; field back)
  call z,GLCLD

CONSHOW:
  ld de,CONHDR   ; "CON: "
  call PUTSTR    ; the BIOS acts on the
                 ; field: CONMOD next
  ld a,(CONMOD)
  add a,a        ; the mode times four:
                 ; its name's
  add a,a        ; offset in CONNAMS
  ld l,a
  ld h,0
  ld de,CONNAMS  ; its name and colon,
                 ; four bytes
  add hl,de
  ld b,4

CONSH1:
  ld e,(hl)
  call PUTCHAR   ; keeps BC and HL
  inc hl
  djnz CONSH1
  ld de,CRLFMSG
  call PUTSTR
  jp MAINLOOP    ; the next prompt

; USER accepts one decimal user number
; in the CP/M 2.2 range 0..15 and sets
; it by BDOS function 32; anything else
; is a bad command. Takes the argument
; at ARGSTRT; ends at MAINLOOP or
; BADCMD.

CMDUSER:
  call ARGSKIP   ; A = its first
                 ; character
  cp '0'
  jp c,BADCMD
  cp '9'+1
  jp nc,BADCMD   ; not a digit, or no
                 ; argument
  sub '0'
  ld b,a         ; B = the first digit's
                 ; value
  inc hl
  ld a,(hl)
  cp '0'         ; a second digit?
  jr c,USERDONE
  cp '9'+1

; no: one digit, 0 to 9

  jr nc,USERDONE
  ld a,b
  cp 1
  jp nz,BADCMD   ; two digits must be 10
                 ; to 15
  ld a,(hl)
  cp '6'         ; the second at most 5
  jp nc,BADCMD
  sub '0'-10     ; B = 10 + the second
                 ; digit
  ld b,a
  inc hl         ; past it

USERDONE:
  call ENDCHK    ; nothing after the
                 ; number; B kept
  ld e,b
  ld c,32        ; BDOS 32: set the user
                 ; to E
  call BDOS
  jp MAINLOOP

; SAVE writes 256-byte pages from the
; TPA. A count reaching the page of the
; BDOS entry jump is rejected rather
; than saving it or the workspace. SAVE
; n NAME writes n pages from 0100h up as
; NAME. Takes the arguments at ARGSTRT;
; ends at MAINLOOP, BADCMD or NO SPACE.

CMDSAVE:
  call ARGSKIP   ; A = the count's first
                 ; character
  cp '0'
  jp c,BADCMD
  cp '9'+1
  jp nc,BADCMD   ; not a digit, or no
                 ; argument
  ld b,0         ; B = the count so far

SAVENUM:
  ld a,(hl)
  cp '0'
  jr c,SAVENEND
  cp '9'+1

; not a digit: the count's end

  jr nc,SAVENEND
  sub '0'
  ld e,a         ; E = the digit's value
  ld a,b         ; B times ten, a bad
                 ; command past
  add a,a        ; 255: twice B, kept in
                 ; D,
  jp c,BADCMD
  ld d,a
  add a,a        ; then four times B, a
                 ; carry bad,
  jp c,BADCMD
  add a,a        ; and eight times B, a
                 ; carry bad
  jp c,BADCMD
  add a,d        ; and twice B added, a
                 ; carry bad
  jp c,BADCMD
  add a,e        ; and the digit
  jp c,BADCMD
  ld b,a
  inc hl
  jr SAVENUM     ; the next digit

SAVENEND:
  cp SPACE       ; a space must follow
                 ; the count
  jp nz,BADCMD

; the BDOS entry's page

  ld a,(PZBDOS+2)
  ld c,a
  ld a,b
  cp c
  jp nc,BADCMD   ; the pages would reach
                 ; it

; the pages to write

  ld (SAVEPGS),a
  call SKIPSP
  ld a,(hl)
  or a
  jp z,BADCMD    ; no name
  call ONENAME   ; one unambiguous name
                 ; into CMDFCB

  call DOSSEQ    ; delete any file of
                 ; that name
  DB 19*2+0      ; BDOS 19, source FCB
  call DOSSEQ    ; and make it anew
  DB 22*2+0      ; BDOS 22, source FCB
  inc a
  jr z,SAVENOSP  ; FFh: the directory is
                 ; full
  ld hl,TPA

; the first record's bytes, 0100h

  ld (SAVEADR),hl

SAVELOOP:
  ld a,(SAVEPGS)
  or a
  jr z,SAVECLS   ; every page written:
                 ; close it
  call SAVE128   ; a page is two records
  jr c,SAVEWER
  call SAVE128
  jr c,SAVEWER   ; either unwritten: the
                 ; disk is full
  ld a,(SAVEPGS)
  dec a

; one page fewer to write

  ld (SAVEPGS),a
  jr SAVELOOP

; Write the 128 bytes at SAVEADR as
; CMDFCB's next record, and move SAVEADR
; past them. Returns carry if the write
; failed, the disk or directory full.
; Destroys AF, BC, DE, HL.

SAVE128:
  ld de,(SAVEADR)
  ld c,26        ; BDOS 26: the DMA
                 ; address, the record
  call BDOS
  call DOSSEQ    ; write it as the
                 ; file's next record
  DB 21*2+0      ; BDOS 21, source FCB
  or a
  scf
  ret nz         ; A nonzero: not
                 ; written, carry
  ld hl,(SAVEADR)
  ld de,128
  add hl,de

; the next record's bytes

  ld (SAVEADR),hl
  or a           ; carry clear: written
  ret

; SAVE's end: the file closed, so that
; its directory entry is written. A
; failed close is NO SPACE too. Ends at
; MAINLOOP or the error.

SAVECLS:
  call DOSSEQ    ; close CMDFCB's file
  DB 16*2+0      ; BDOS 16, source FCB
  inc a
  jr z,SAVENOSP  ; FFh: the close failed
  jp MAINLOOP

; SAVE's write error: the file closed
; with the records written, as COPY's
; destination is, where CP/M 2.2's SAVE
; leaves it open; then NO SPACE.

SAVEWER:
  call DOSSEQ    ; close CMDFCB's file,
                 ; whatever the close
  DB 16*2+0      ; returns: BDOS 16,
                 ; source FCB

; SAVE's failure: NO SPACE, through
; ERRGO, which marks the command failed.

SAVENOSP:
  ld de,NOSPACE  ; "NO SPACE", then the
                 ; prompt
  jp ERRGO

; Publish only documented page-zero
; transient state after loading
; succeeds: the first two names in the
; arguments at ARGSTRT go in the FCBs at
; 005Ch and 006Ch, the arguments as the
; tail at 0080h, its length before it
; and a 0 after it, and the DMA address
; is 0080h. Destroys AF, BC, DE, HL.

PREPPAGE:

; the text after the command's name

  ld hl,(ARGSTRT)
  push hl        ; kept for the tail
  call SKIPSP
  ld de,FCBONE
  call PARSEFCB  ; the first name, any
                 ; error ignored
  call SKIPSP
  ld de,FCBTWO
  call PARSEFCB  ; the second: its 36
                 ; bytes reach 008Fh,
  pop hl         ; so the tail is copied
                 ; after both
  ld de,CMDTAIL+1
  ld b,0         ; B counts the tail's
                 ; bytes

TAILLOOP:
  ld a,(hl)
  or a
  jr z,TAILDONE  ; the piece's 0 ends it
  ld (de),a      ; a byte of the tail,
  inc hl
  inc de
  inc b          ; counted
  jr TAILLOOP

TAILDONE:
  ld a,b

; the length before the tail,

  ld (CMDTAIL),a
  xor a
  ld (de),a      ; and a 0 after it
  ld de,CMDTAIL
  ld c,26        ; BDOS 26: the DMA
                 ; address 0080h
  jp BDOS

; Parse one CP/M file reference into a
; cleared 36-byte FCB. HL points at the
; first token byte and returns at its
; delimiter. A '*' expands to '?'
; through the remainder of its current
; field. Takes the FCB at DE, noted in
; FCBBASE. Returns carry for a bad
; drive, a forbidden character or a
; field too long; an empty reference
; leaves the FCB blank. Destroys AF, B,
; DE.

PARSEFCB:

; the FCB's start, for UNAMBIG

  ld (FCBBASE),de
  push de
  xor a
  ld (de),a      ; drive 0: the current
                 ; drive
  inc de
  ld b,11
  ld a,SPACE     ; the name and type: 11
                 ; spaces

FCBSPACE:
  ld (de),a
  inc de
  djnz FCBSPACE
  xor a

; A parsed FCB is reusable command
; state, so the whole tail is reset: EX,
; S1, S2, RC, the allocation map, CR and
; the random record. A CR left behind
; would make the command after TYPE load
; from record one rather than from the
; start of its COM file.

  ld b,24        ; the 24 bytes after
                 ; the type

FCBZERO:
  ld (de),a
  inc de
  djnz FCBZERO
  pop de         ; DE = the FCB's drive
                 ; byte
  ld a,(hl)
  or a
  ret z          ; nothing to parse: a
                 ; blank name
  inc hl
  ld a,(hl)      ; a colon second means
                 ; a drive
  dec hl
  cp ':'
  jr nz,FCBNAME  ; no colon: the current
                 ; drive
  ld a,(hl)      ; the drive's letter
  cp 'A'
  jr c,FCBDRBAD
  cp 'Q'

; A to P only

  jr nc,FCBDRBAD
  sub 'A'-1
  ld (de),a      ; the drive byte: 1 for
                 ; A to 16 for P
  inc hl
  inc hl         ; past the letter and
                 ; colon

FCBNAME:
  inc de         ; the name field
  ld b,8         ; eight characters
  call PARFLD
  ret c          ; a bad character or
                 ; too long
  ld a,(hl)
  cp '.'
  jr z,FCBDOT    ; a type follows
  or a           ; carry clear: parsed
  ret

FCBDOT:
  inc hl         ; past the dot
  ld a,e         ; B is the unfilled
                 ; part of the name
                 ; field
  add a,b
  ld e,a
  jr nc,FCBTYP
  inc d          ; DE at the type field

FCBTYP:
  ld b,3         ; three characters,
                 ; PARFLD returning
  jr PARFLD      ; for PARSEFCB

FCBDRBAD:
  scf            ; a drive letter past
                 ; P: carry
  ret

; One field of an FCB, the name's 8
; bytes or the type's 3: B characters
; from HL into DE, up to a delimiter as
; FCBEND finds one. Returns carry for a
; forbidden character or a field too
; long. Otherwise returns Z, carry
; clear, A and HL at the delimiter, DE
; past the field's filled bytes and B
; the bytes left unfilled. Destroys AF,
; B, DE.

PARFLD:
  call FCBEND
  ret z          ; the delimiter: the
                 ; field ends early
  cp '*'
  jr z,PARSTAR   ; '?' to the field's
                 ; end
  call VALIDCHR
  ret c          ; a forbidden character
  ld (de),a
  inc de
  inc hl
  djnz PARFLD    ; the next, while the
                 ; field has room

PARSKIP:
  call FCBEND
  ret z          ; full, and a delimiter
                 ; next

PARLONG:
  inc hl
  call FCBEND
  jr nz,PARLONG  ; too long: on to its
                 ; delimiter,

PLEND:
  scf            ; and carry
  ret

; Commands that name exactly one file
; reject an empty name or either
; wildcard. Preserve the parser's
; delimiter pointer in HL; FCBBASE
; identifies the FCB because PARSEFCB
; advances DE while filling it. Returns
; carry for an empty or ambiguous name.
; Keeps BC and HL; destroys AF.

UNAMBIG:
  push hl
  push bc
  ld hl,(FCBBASE)
  inc hl         ; the name's first byte
  ld a,(hl)
  cp SPACE
  jr z,CHRRET    ; a space: no name,
                 ; carry
  ld bc,11       ; the name and type,
                 ; for a '?'
  ld a,'?'
  cpir           ; equality means an
                 ; ambiguous name
  jr CHRRET

; CP/M 2.2 reserves these characters
; inside filename and filetype fields.
; Dot and equals are handled as grammar
; delimiters, while question mark and
; asterisk remain available to the
; ambiguous DIR and ERA forms. Takes the
; character in A and keeps it; returns
; carry if it is forbidden. Keeps BC and
; HL; destroys F.

VALIDCHR:
  push hl
  push bc
  ld hl,BADCHARS
  ld bc,13       ; the 13 forbidden
                 ; characters
  cpir           ; equality means a
                 ; forbidden byte

; Both scans preserve HL/BC and return
; carry for a match (invalid/ambiguous).
; Takes Z for a match, with BC and HL
; pushed in that order.

CHRRET:
  pop bc
  pop hl
  scf
  ret z          ; Z from the scan:
                 ; carry
  or a           ; none found: carry
                 ; clear
  ret

; A '*' in a field: '?' through the B
; bytes left of it at DE, and the rest
; of the field's text at HL passed over
; to its delimiter. Returns as PARFLD
; does when it succeeds.

PARSTAR:
  ld a,'?'       ; any character matches

STARLOOP:
  ld (de),a
  inc de
  djnz STARLOOP  ; the field's bytes
                 ; left; B = 0 after
  inc hl         ; past the '*'

PARIGN:
  call FCBEND
  ret z          ; the delimiter
  inc hl         ; characters after the
                 ; '*' are ignored
  jr PARIGN

; Z at the end of a name: a zero, a
; space, '=' or '.'. A holds the
; character. Takes HL at the character;
; destroys AF only.

FCBEND:
  ld a,(hl)
  or a
  ret z          ; the line's end
  cp SPACE
  ret z          ; the next argument
  cp '='
  ret z          ; a second name follows
  cp '.'
  ret            ; a type follows; NZ
                 ; for any other

; character

; Move HL past spaces. Returns A = the
; first other character, with NZ, and
; carry when it is below a space, as the
; line's 0 is. Destroys AF.

SKIPSP:
  ld a,(hl)
  cp SPACE
  ret nz         ; not a space: HL at it
  inc hl
  jr SKIPSP

; Compare the parsed command word with a
; zero-terminated keyword. Equality
; requires a command delimiter or end
; immediately after the keyword. Takes
; DE at the keyword and the word at
; CMDSTRT. Returns Z for a match, with
; DE at the keyword's 0; NZ with DE at
; the byte that differed, or at the 0
; when the word goes on. Destroys AF,
; HL.

ISCMD:

; the command word

  ld hl,(CMDSTRT)

KEYLOOP:
  ld a,(de)
  or a
  jr z,KEYEND    ; the keyword's 0: does
                 ; the word end?
  cp (hl)
  ret nz         ; a letter differs: NZ
  inc de
  inc hl
  jr KEYLOOP     ; alike: the next
                 ; letter

KEYEND:
  ld a,(hl)
  or a
  ret z          ; the line's end: Z, a
                 ; match
  cp SPACE
  ret            ; Z for a space after
                 ; it, else NZ

; Print the '$'-terminated string at DE
; by BDOS function 9. Destroys AF, BC,
; DE and HL, as the BDOS may.

PUTSTR:
  ld c,9         ; BDOS 9: print a
                 ; string
  jp BDOS

; Print E by BDOS function 2, through
; OUTCHAR's column count and ^P echo.
; Keeps BC and HL, which every caller
; wants kept. Destroys AF and DE.

PUTCHAR:
  push bc        ; kept for the caller,
                 ; as the BDOS
  push hl        ; may change them
  ld c,2         ; BDOS 2: the console,
                 ; E
  call BDOS
  pop hl
  pop bc
  ret

; SERVICES: each service's name and
; pages, from the owner list: one line
; each, from the lowest up, the name
; without its spaces and the pages in
; decimal. Ends at MAINLOOP.

CMDSVC:

; the lowest owner's page, 0 for none

  ld a,(SVCHEAD)

CMDDL:
  or a
  jp z,MAINLOOP  ; the list's end
  ld h,a         ; HL at the owner's
                 ; name
  ld l,DNAM
  ld b,8
  call PUTTRIM   ; up to 8 characters,
                 ; spaces passed over
  ld e,' '       ; a space before the
                 ; pages
  call PUTCHAR
  push hl        ; H = the owner's page
  ld l,DOWN
  ld a,(hl)      ; the next owner up, 0
                 ; for none,
  call SVCABV    ; gives the page above
                 ; this one,
  sub h          ; and less its own, its
                 ; pages
  ld l,a
  ld h,0
  call PUTDEC    ; in decimal
  ld de,CRLFMSG
  call PUTSTR
  pop hl
  ld l,DOWN
  ld a,(hl)      ; the next owner's
                 ; page, 0 at the last
  jr CMDDL

; Startup. Once after cold boot one
; record of A:STARTUP.CMD is read, the
; position marked finished first, so
; that a failure can't repeat. STPOS is
; 0 until then, the next byte + 1 in the
; file, and 80h up once it is finished.
; Destroys AF, BC, DE, HL.

STBOOT:
  ld hl,STPOS    ; startup's state
  ld a,(hl)
  or a
  ret nz         ; cold boot has passed
                 ; here already
  set 7,(hl)     ; finished, whatever
                 ; follows

; a keypad key held skips it: bit 6 low

  in a,(STSPORT)
  and $40
  ret z
  ld hl,STFCB    ; the file's name, for
                 ; the BDOS
  ld de,CMDFCB
  ld bc,12       ; its drive, name and
                 ; type
  ldir
  ld de,STREC    ; the record goes where
                 ; STLINE reads it
  ld c,26        ; BDOS 26: the DMA
                 ; address
  call BDOS
  call DOSSEQ    ; open A:STARTUP.CMD
  DB 15*2+0      ; BDOS 15, source FCB
  inc a
  jr z,STBDMA    ; FFh: no such file
  call DOSSEQ    ; read its first record
  DB 20*2+0      ; BDOS 20, source FCB
  or a
  jr nz,STBDMA   ; not read: finished,
                 ; nothing to run
  inc a          ; STPOS 1, the file's
                 ; first byte
  ld (STPOS),a

STBDMA:
  ld hl,DEFDMA   ; the DMA address
                 ; programs expect

; set in the BDOS's own variable

  ld (CURDMA),hl
  ret

; Startup's next line, from STREC at
; STPOS. With a line left: it goes in
; the command buffer, echoed as if
; typed, and carry clear. Lines end at
; CR or LF and blank ones are passed
; over; a line's characters after its
; 127th are passed over too, as a typed
; line has no more. ^Z, a zero or the
; record's last byte ends the file.
; Otherwise carry set, once the file has
; finished. Destroys AF, BC, DE, HL.

STLINE:
  ld hl,STPOS
  ld a,(hl)
  rlca           ; top bit to carry: the
                 ; file is finished
  ret c          ; the file finished: a
                 ; line is typed
  rrca           ; the position again

; HL at the next byte: the record

  add a,LOW(STREC)-1
  ld l,a         ; is in one page
  ld h,HIGH(STREC)
  ld de,CMDTXT
  ld b,127       ; the characters a line
                 ; may hold

STL1:
  ld a,l
  cp LOW(STREC+128)
  jr z,STLE      ; the record has run
                 ; out
  ld a,(hl)
  inc hl
  or a
  jr z,STLE      ; a zero ends the file
  cp 26
  jr z,STLE      ; and so does ^Z
  cp 13          ; CR or LF: the line's
                 ; end
  jr z,STL2
  cp 10
  jr z,STL2
  inc b          ; B 0, the line full? A
                 ; kept
  dec b
  jr z,STL1      ; past the 127th:
                 ; passed over
  ld (de),a      ; a character of the
                 ; line
  inc de
  dec b
  jr STL1

STLE:

; STPOS 80h, finished

  ld l,LOW(STLAST)

STL2:
  ld a,l

; the next byte + 1

  sub LOW(STREC)-1
  ld (STPOS),a
  ld a,e         ; the line's length
  sub LOW(CMDTXT)
  jr z,STLINE    ; a blank line: the
                 ; next one
  ld (CMDLEN),a  ; where function 10
                 ; leaves it
  ex de,hl
  ld (hl),13     ; a CR for the echo,
                 ; which MLGOT
  inc hl         ; makes the line's 0
  ld (hl),'$'    ; and the echo's end,
                 ; for PUTSTR

; (at 127 characters this '$' is in
; BOOTDRV, past CMDTXT, read only
; before)

  ld de,CMDTXT
  call PUTSTR    ; the echo, as if typed
  or a           ; carry clear: a line
  ret
