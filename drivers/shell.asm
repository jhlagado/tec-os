; SHELL.SVC: the resident shell. It
; takes the prompt through the ROM's
; shell hook and holds what the minimal
; ROM CCP leaves out: lines of pieces
; joined by ! and &, .CMD scripts, the
; rest of STARTUP.CMD, COPY, DEL,
; SERVICES, the pager and the history
; ring. Every other piece goes back to
; the ROM to run. The hook's contract,
; the .CMD rules and the separators are
; set out in docs/shell.md.

%INCLUDE "../src/abi.inc"

BDOS EQU $0005
CURDSK EQU $0004
FCBONE EQU $005C
DEFDMA EQU $0080
CR EQU 13
LF EQU 10
TAB EQU 9
SPACE EQU 32
CTRLN EQU 14
QUERY EQU 65535  ; BDOS 108: the code
FAILCODE EQU 255*256

  ORG $0100

; Removable format-4 header, no deps.
; The writer fills INIT, REMOVE, size
; and relocation. XTRA bytes of extra
; RAM follow the image. Declared stack
; use: BDOS 6 (HREC and HSTORE), BIOS
; 0, CCP 0: LINE and PAGE move at once
; to the shell's own stack.

HDR: DB 'D',SVCFMT,0,1
  DW 0,0,XTRA,0
  DB 6,0,0
  DW 0
  DB "SHELL   "

; The execution record, version 1. Its
; entry is an offset from HDR, here 41:
; the JP below. State bit 1 asks the
; CCP to enter the shell when it
; installs; INIT sets bit 0, ready.

EXREC: DB "EX",1
EXRDY: DB 2
  DW 41
EXNAM: DS 8,' '
  DB 0,1

ENTRY0:
  jp ENTRY

; The hook's table: LINE, PAGE, HREC
; and HSTORE. It must not cross a page,
; and lies in the first.

TABLE: DW LINE,PAGE,HREC,HSTO

; BC points at the eight-byte name the
; loader read the file by. Keep it in
; the record, clear the extra RAM and
; set ready last. Returns no records:
; HL=0, A=0, NC. Clobbers BC and DE.

INIT:
  ld h,b
  ld l,c         ; HL = the name
  ld de,EXNAM    ; the record's name
  ld bc,8        ; into the record
  ldir
  ld hl,VARS     ; state, buffers, ring
  ld de,VARS+1   ; a byte at a time
  ld bc,CLRLEN
  ld (hl),0      ; all zero
  ldir
  ld hl,EXRDY
  set 0,(hl)     ; ready, bit 1 kept
  ld hl,0        ; no records
  xor a          ; A=0 and NC
  ret            ; to the loader

; Not ready, then give the hook back,
; but only if this shell holds it:
; TNSHELL returns the holder, and when
; that is another shell its table is
; put back. The table kept from the
; first claim goes to the hook only in
; place of this shell's own. Returns
; A=0, NC. Clobbers BC, DE and HL.

REMOVE:
  ld hl,EXRDY
  res 0,(hl)     ; not ready first
  ld hl,(PREV)   ; the table it replaced
  ld c,TNSHELL   ; HL = the old table
  call ABICALL   ; HL = the holder
  jr c,RM1       ; refused: leave it
  ld de,TABLE
  or a           ; compare the holder
  sbc hl,de
  jr z,RM1       ; it was this shell
  add hl,de      ; another's table
  ld c,TNSHELL
  call ABICALL   ; put it back

RM1:
  xor a          ; done, NC
  ret

; The execution entry, from the CCP as
; a transient: A=FFh from the startup
; line, else 0. Claim the hook; RET
; warm boots, and the next prompt is
; this shell's. Only the first entry
; keeps the table it replaced, and only
; the first from the startup line reads
; the rest of STARTUP.CMD. A later
; entry takes the hook back from any
; later shell and changes nothing else.

ENTRY:
  ld b,a         ; the line's origin
  ld hl,TABLE    ; this shell's table
  ld c,TNSHELL
  call ABICALL   ; HL = the old table
  ret c
  ld a,(CLAIMD)  ; the first claim?
  or a
  ret nz         ; not the first entry
  inc a          ; A = 1
  ld (CLAIMD),a  ; claimed once
  ld (PREV),hl   ; kept for REMOVE
  ld a,b         ; FFh: startup
  inc a
  ret nz         ; typed: no startup
  dec a
  ld (STSKIP),a  ; read the rest next
  ret

; LINE, called by the ROM at each
; prompt on the CCP's stack. A = the
; ROM's flags: bit 0 a function 47 line
; at DE, bit 1 the rest of the line
; dropped. DE = the ROM's 128-byte line
; buffer; B = the lowest owner's page
; and C the stub's. Take the shell's
; own stack, then write the next piece
; at DE, zero-ended, and return A = its
; origin, FFh for a line of STARTUP.CMD
; so that its quiet paths hold. The
; shell's own built-ins run here and
; take the next piece.

LINE:
  ld (SAVSP),sp  ; the CCP's stack
  ld sp,STKTOP   ; the shell's stack
  ld (OUTP),de
  ld (OWNPG),bc  ; C stub, B lowest
  push af        ; the flags
  call PGRST     ; each command's pager
  ld a,(HHEAD)
  ld (HPOS),a    ; recall from newest
  pop af
  bit 1,a        ; dropped?
  jr z,LN1       ; nothing dropped
  ld hl,0
  ld (LPOS),hl   ; the rest is dropped

; A function 47 line replaces the line
; in hand. Its pieces run as a typed
; line's, its first unconditionally.

LN1:
  rrca           ; bit 0 to carry
  jr nc,LN2      ; no function 47 line
  ld hl,(OUTP)
  ld de,LTXT
  ld bc,127      ; the line, bounded
  ldir
  xor a
  ld (de),a      ; zero-ended
  ld (LORG),a    ; typed origin
  ld hl,LTXT     ; its start
  call LEAD      ; its first piece
  jr z,NEXT      ; nothing in it
  ld (LPOS),hl
  xor a          ; A = 0
  ld (LCOND),a   ; runs whatever

; The next piece of the line in hand. A
; piece after a run of & alone runs
; only if the last code is not a
; failure, FF00h to FFFEh; a skipped
; piece leaves the code as it is, so
; the next & tests the same code.

LN2:
  ld hl,(LPOS)
  ld a,h         ; 0 high: none
  or a
  jr z,NEXT      ; no line in hand
  ld a,(LCOND)
  or a
  jr z,LNRUN     ; after !: it runs
  push hl
  ld de,QUERY
  ld c,108       ; get the code
  call BDOS      ; HL = the last code
  ld a,h         ; FFh in the high
  inc a
  jr nz,LN3      ; high byte below FFh
  ld a,l         ; and FFh in the low
  inc a
  jr z,LN3       ; FFFFh: not a failure
  pop hl
  call SPLIT     ; skipped
  jr LN2         ; the next piece

LN3:
  pop hl         ; the piece's start

LNRUN:
  call SPLIT     ; the piece at PIECE
  call PROMPT    ; its prompt
  ld hl,(PIECE)
  call PUTZ      ; and its echo
  jp BUILTIN     ; run it

; The next line: the rest of the
; startup file, then a script, then the
; keyboard. A script's line is echoed
; whole after the prompt, and blank
; lines and lines of only blanks and !
; are passed over without an echo.

NEXT:
  ld hl,0
  ld (LPOS),hl   ; no line in hand
  ld a,(STSKIP)  ; startup's rest due?
  or a
  call nz,STOPEN
  ld a,(SOPEN)   ; a script open?
  or a
  jr z,TYPED     ; no script open
  call SLINE     ; the script's next
  jr c,SEND      ; its end
  ld hl,LTXT
  call SKIPSB    ; anything there?
  jr z,NEXT      ; blanks and ! only
  call PROMPT
  ld hl,LTXT
  call PUTZ      ; echoed whole
  ld e,CR        ; CR after the echo
  call PUTC      ; as BDOS 10 ends one
  ld a,(SORG)
  ld (LORG),a    ; the script's origin
  ld hl,LTXT     ; its first piece
  jr FIRST

SEND:
  xor a
  ld (SOPEN),a   ; the script is done
  jr NEXT

; A typed line through BDOS 10, the
; first since LINE, so the ROM offers
; the history ring's ^W and ^N.

TYPED:
  call PROMPT
  ld a,127       ; LBUF's capacity
  ld (LBUF),a    ; the capacity
  ld de,LBUF
  ld c,10
  call BDOS      ; with the history
  ld hl,LBUF+1
  ld e,(hl)      ; the count
  ld d,0         ; DE = the count
  inc hl
  add hl,de
  ld (hl),d      ; zero-ended
  xor a
  ld (LORG),a    ; typed origin
  ld hl,LTXT

; A line's first piece runs whatever
; the last line returned.

FIRST:
  call LEAD
  jp z,HAND0     ; an empty line
  call SPLIT
  jp BUILTIN

; A line's start: past blanks and !.
; Z at its end, else HL at its first
; piece. An & there would test the last
; line's code, so the line is refused,
; &WORD? with FF00h, and nothing of it
; runs.

LEAD:
  call SKIPSB    ; past blanks and !
  ret z          ; an empty line
  cp '&'
  ret nz         ; HL: the first piece
  ld (PIECE),hl
  call FOLD      ; as the ROM's words
  ld hl,0
  ld (LPOS),hl   ; none of it runs
  call CRLF      ; after the line
  jp BADW

; Take the piece at HL, as typed, and
; end it at ! or at an & after a
; blank, a space or a tab. The run of
; blanks, ! and & that follows is one
; separator: & alone makes the next
; piece conditional (LCOND nonzero),
; any ! makes it run. LPOS is the next
; piece, or 0 at the line's end. An &
; inside a word is text. Changes AF, BC
; and HL.

SPLIT:
  ld (PIECE),hl  ; this piece
  ld c,SPACE     ; as after a blank

SP1:
  ld a,(hl)
  or a
  jr z,SPEND     ; the line's end
  cp '!'         ; !: always
  jr z,SPSEP     ; ! always splits
  cp '&'         ; &: if after a
  jr nz,SP3
  ld b,a         ; keep the &
  ld a,c         ; blank
  cp SPACE       ; after a space?
  jr z,SPAMP
  cp TAB         ; or a tab?
  ld a,b         ; the & again
  jr nz,SP3      ; no: it is text

SPAMP:
  ld a,b
  jr SPSEP       ; then it splits

SP3:
  ld c,a         ; the byte before next
  inc hl         ; the next byte
  jr SP1

SPSEP:
  ld (hl),0      ; the piece ends
  inc hl
  sub '!'        ; ! or & here
  ld b,a         ; 0 for !, else &

; The separator run: blanks, & and !.
; Any ! in it makes it unconditional.

SPRUN:
  ld a,(hl)      ; the run's next
  or a
  jr z,SPEND     ; separators at the end
  cp SPACE
  jr z,SPR1      ; a space
  cp TAB
  jr z,SPR1      ; a tab
  cp '&'         ; & is absorbed
  jr z,SPR1
  cp '!'         ; so is !
  jr nz,SPRE     ; the next piece
  ld b,0         ; ! makes it run

SPR1:
  inc hl
  jr SPRUN

SPRE:
  ld (LPOS),hl   ; the next piece
  ld a,b
  ld (LCOND),a   ; how it runs
  ret            ; LCOND 0: runs

SPEND:
  ld hl,0        ; no next piece
  ld (LPOS),hl   ; nothing follows
  ret

; COPY, DEL and SERVICES are the
; shell's; a first word of type CMD is a
; script. The piece, echoed as typed, is
; folded first, as the ROM folds a line.
; The table holds each keyword,
; zero-ended, and its handler, entered
; with HL after the word.

BUILTIN:
  ld hl,(PIECE)
  call FOLD      ; a..z to upper case
  ld de,SHTAB

BI1:
  ld hl,(PIECE)  ; this piece's word

BI2:
  ld a,(de)      ; the keyword's byte
  or a
  jr z,BI4       ; the keyword's end
  cp (hl)
  jr nz,BI3      ; another word
  inc de         ; both match
  inc hl
  jr BI2

BI3:
  ld a,(de)      ; past the keyword
  inc de         ; the next byte
  or a
  jr nz,BI3
  inc de         ; past its handler
  inc de         ; the next keyword
  ld a,(de)
  or a
  jr nz,BI1      ; the next keyword
  jr SCRCHK      ; the table's end

BI4:
  ld a,(hl)
  or a           ; zero: the word ends
  jr z,BI5       ; the word ends here
  cp SPACE+1
  jr nc,BI3      ; a longer word

BI5:
  inc de
  ld a,(de)      ; the handler, low
  ld c,a
  inc de
  ld a,(de)      ; and high
  ld b,a         ; BC = the handler
  push bc        ; entered by RET, with
  ret            ; HL after the word

; A first word of type CMD is a script:
; the name is parsed into CFCB, not
; SFCB, since a script may be open.
; Anything else goes to the ROM.

SCRCHK:
  ld hl,(PIECE)
  ld de,CFCB
  call PARSEFCB  ; the name in CFCB
  jr c,HAND      ; the ROM refuses it
  ld hl,(CFCB+9)
  ld de,'M'*256+'C'
  or a
  sbc hl,de
  jr nz,HAND     ; not .CM?
  ld a,(CFCB+11)
  cp 'D'
  jr nz,HAND     ; not .CMD
  call CRLF      ; after the line
  jp CMDSCR

; Fold a..z to upper case from HL to
; the zero. Changes AF and HL.

FOLD:
  ld a,(hl)
  or a
  ret z          ; the piece's end
  cp 'a'
  jr c,FD1       ; below a
  cp 'z'+1
  jr nc,FD1      ; above z
  and $DF        ; fold to upper case
  ld (hl),a

FD1:
  inc hl
  jr FOLD

HAND0:
  ld (PIECE),hl

; Give the piece to the ROM to run:
; copy it to its buffer, restore the
; CCP's stack and return its origin.

HAND:
  ld hl,(PIECE)
  ld de,(OUTP)   ; DE = the ROM's

HC1:
  ld a,(hl)
  ld (de),a      ; up to and with its
  inc hl         ; zero
  inc de         ; the next
  or a
  jr nz,HC1
  ld a,(LORG)    ; the line's origin
  ld sp,(SAVSP)  ; the CCP's stack
  ret            ; to the ROM

; DEL is ERA by another name: the ROM
; runs it.

CMDDEL:
  ld hl,(PIECE)
  ld (hl),'E'    ; rewrite the word
  inc hl
  ld (hl),'R'
  inc hl         ; the next
  ld (hl),'A'    ; DEL becomes ERA
  jr HAND

SHTAB:
  DB "COPY",0
  DW CMDCOPY
  DB "DEL",0
  DW CMDDEL
  DB "SERVICES",0
  DW CMDSVC
  DB 0

; A built-in's refusal: the word at
; PIECE up to a blank, then ?, as the
; ROM refuses a command.

BADW:
  ld hl,(PIECE)  ; the refused word

BW1:
  ld a,(hl)
  or a
  jr z,BW2       ; the word's end
  cp SPACE+1
  jr c,BW2       ; a blank ends it
  ld e,a         ; print it
  call PUTC
  inc hl
  jr BW1         ; the next

BW2:
  ld e,'?'       ; then ?
  call PUTC
  call CRLF      ; and a new line

; A built-in's end: the code in DE,
; FF00h for a failure and 0 for
; success, then an empty line to the
; ROM. It prints the blank line before
; its prompt, as after its own
; built-ins, and calls LINE again, so
; the next piece runs from there and a
; typed line has the history.

FAILED:
  ld de,FAILCODE

CODED:
  ld c,108       ; 108: set the code
  call BDOS      ; set the code
  ld hl,(OUTP)
  ld (hl),0      ; an empty line
  ld a,(LORG)
  ld sp,(SAVSP)  ; the CCP's stack
  ret

BDONE:
  ld de,0
  jr CODED

; A message for a built-in's failure.

ERRMSG:
  call PUTS      ; the message
  call CRLF
  jr FAILED

; NAME.CMD, parsed into CFCB: a script.
; From a script, or with pieces after
; it, it is refused for now, and so is
; a name with no file.

CMDSCR:
  ld a,(SOPEN)   ; from a script?
  or a
  jr nz,BADW     ; a script is running
  ld hl,(LPOS)   ; pieces after it?
  ld a,h
  or a
  jr nz,BADW     ; pieces after it
  ld hl,CFCB     ; the parsed name
  ld de,SFCB
  ld bc,36
  ldir           ; the script's FCB
  call SOPENF    ; open it
  jr c,BADW      ; no file
  xor a
  ld (SORG),a    ; its lines are typed
  jr BDONE       ; its first line next

%INCLUDE "shellcmd.asm"
%INCLUDE "shellio.asm"

IMGEND:

; Extra RAM, after the image, cleared
; by INIT. PREV is the table the first
; claim replaced. STSKIP: the rest of
; STARTUP.CMD is due. The script:
; SOPEN open, SEOF its end read, SOFF
; the next byte's offset in 0080h,
; SLOAD its record there, SORG its
; lines' origin. The line: LORG its
; origin, LPOS its next piece (0 for
; none), PIECE this piece, LCOND
; nonzero when the next follows & only.
; OUTP is the ROM's buffer, STUBPG and
; LOWPG LINE's C and B. SAVSP and PGSP
; hold the SP that LINE and PAGE were
; called with.

VARS EQU IMGEND
PREV EQU VARS
STSKIP EQU PREV+2
SOPEN EQU STSKIP+1
SEOF EQU SOPEN+1
SOFF EQU SEOF+1
SLOAD EQU SOFF+1
SORG EQU SLOAD+1
LORG EQU SORG+1
LPOS EQU LORG+1
PIECE EQU LPOS+2
OUTP EQU PIECE+2
OWNPG EQU OUTP+2
STUBPG EQU OWNPG
LOWPG EQU OWNPG+1
SAVSP EQU OWNPG+2
PGSP EQU SAVSP+2
LCOND EQU PGSP+2

; CLAIMD: the first claim is made.
; FCBBASE: the FCB the parser fills.
; CCOUNT: COPY's records. The ring's
; HHEAD is its next store and HPOS the
; end of the line recalled. The pager's
; PGLINE and PGCOL count, PGROWS and
; PGWID are its page. PDNZ: a decimal
; digit printed. CFCB is COPY's
; destination and a script's name, SFCB
; the open script, LBUF typed input: its
; capacity, count and LTXT, the text,
; which also holds a script's line and
; a recalled one. The shell's 32-byte
; stack is under STKTOP.

CLAIMD EQU LCOND+1
FCBBASE EQU CLAIMD+1
CCOUNT EQU FCBBASE+2
HHEAD EQU CCOUNT+2
HPOS EQU HHEAD+1
PGLINE EQU HPOS+1
PGCOL EQU PGLINE+1
PGROWS EQU PGCOL+1
PGWID EQU PGROWS+1
PDNZ EQU PGWID+1
CFCB EQU PDNZ+1
SFCB EQU CFCB+36
LBUF EQU SFCB+36
LTXT EQU LBUF+2
STKBOT EQU LBUF+130
STKTOP EQU STKBOT+32

; The ring is the last page, aligned so
; that a byte offset in L wraps within
; it.

RING EQU ((STKTOP+255)/256)*256
XEND EQU RING+256
XTRA EQU XEND-IMGEND
CLRLEN EQU XEND-VARS-1
