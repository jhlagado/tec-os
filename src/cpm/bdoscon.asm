; The BDOS's errors and console output:
; the error messages and their mode
; (function 45), the block check, and
; the console's characters, tabs, echo
; and
; ^P. Included after bdoslog.asm by
; rom.asm.

; The zero-ended text at HL to the
; console, through OUTCHAR, so a tab is
; expanded and ^S and ^P are taken.
; Returns HL at the 0. Changes A, C and
; what OUTCHAR changes.
ERRTEXT:
  ld a,(hl)      ; the next character
  or a
  ret z          ; the 0: the text's end
  inc hl
  push hl        ; the place, kept over
                 ; the output
  ld c,a
  call OUTCHAR
  pop hl
  jr ERRTEXT

; BDOS error 1, ": Bad Sector", for a
; disk read or write that failed or a
; block reference past the drive's end;
; it falls into BDERR.
BADSECT:
  ld hl,ERRBAD   ; its message
  ld b,1         ; disk I/O

; A BDOS error, the message at HL and
; its code in B, as function 45's mode
; says: returned to the program (FFh),
; said and returned (FEh), or said, a
; key
; waited for and the program ended with
; the rest of a chained line (default).
; A returned error leaves a chained line
; alone (KD-181). It never returns to
; its caller: RETWORD gives the program
; A = L = FFh and B = H = the code.
BDERR:
; function 45's mode
  ld a,(ERRMODE)
  cp $FE         ; FEh or FFh: the error
                 ; returned
  jr c,BDDEF     ; the default
  push bc        ; the code, kept over
                 ; the message
; FEh: the message first
  call z,DISKMSG
  pop bc
  ld h,b         ; H = the code, A = L =
                 ; FFh
  ld l,$FF
  jp RETWORD

BDDEF:
  call DISKMSG
  call GETCHAR   ; a key, then the
                 ; program ends
  jp CHDROP      ; with the rest of a
                 ; chained line

; Reject corrupt allocation references
; before vector indexing or the 16-bit
; block-to-record shift. DE is the
; block; preserve it and HL/BC. IX
; identifies
; the current DPB on return. Invalid
; references take BADSECT's error 1.
CHKBLK:
  call BLKPAST   ; carry if past the
                 ; end; IX = the DPB
  jr c,BADSECT   ; past the drive's end:
                 ; error 1
  ret

; Carry if block DE is past the end of
; the current drive. Sets IX to its DPB.
; Changes A; keeps BC, DE and HL.
BLKPAST:
  ld ix,(DPBPTR)
  ld a,(ix+5)    ; DSM, the drive's last
                 ; block,
  cp e           ; less DE: carry if DE
                 ; is past it
  ld a,(ix+6)    ; its high byte
  sbc a,d
  ret

; The message at HL after "Bdos Err On
; X", on a new line, X the current
; drive (CURDRV). Changes A, C, HL and
; what OUTCHAR changes.
DISKMSG:
  push hl        ; the message, kept
  ld hl,ERRHEAD  ; CR, LF and "Bdos Err
                 ; On "
  call ERRTEXT
  ld a,(CURDRV)  ; the drive's letter
  add a,'A'      ; drive 0 is A
  ld c,a
  call OUTCHAR
  pop hl
  jr ERRTEXT     ; then the message

; The next key, in A, not echoed: one a
; status check read and kept
; (PENDING), or else the BIOS's console
; input, which waits for one. Changes
; A and what the BIOS's input changes.
GETCHAR:
; a key kept by a status check?
  ld a,(PENDING)
  or a
  jp z,BIOCIN    ; none kept: wait for
                 ; one
  xor a          ; the kept key, taken
  ld (PENDING),a
  ld a,(PENDCHR)
  ret

; A not 0 if a key is ready: one kept (A
; = 1), or one the BIOS's console
; status sees through the RAM jump table
; (FFh). Changes A and what the
; BIOS's status changes.
CONSTAT:
; 1 with a key kept
  ld a,(PENDING)
  or a
  ret nz
  jp BIOCST      ; else the BIOS's FFh
                 ; or 0

; As CONSTAT, but through the ROM's
; BCONST, not the RAM jump table, so
; that
; no cursor is drawn: the check made
; during output.
CONSTQ:
; 1 with a key kept
  ld a,(PENDING)
  or a
  ret nz
  jp BCONST      ; else FFh or 0, no
                 ; cursor drawn

; The character in C to the console as
; functions 2 and 9 send it: a tab as
; spaces to the next column that is a
; multiple of 8, and before each
; character a key waiting is taken
; (OUTONE). Changes A, C and what the
; BIOS's calls change.
OUTCHAR:
  ld a,c
  cp TAB
  jr nz,OUTONE   ; not a tab: as it is

TABLOOP:
  ld c,SPACE     ; a tab: spaces to a
                 ; multiple of 8
  call OUTONE
  ld a,(COLUMN)  ; as ECHORAW has moved
                 ; it on
  and 7
  jr nz,TABLOOP  ; not yet at a tab stop
  ret

; One character, C, to the console with
; no tab expanded: a key waiting is
; taken first (CHKKEY: ^S pauses, ^P
; turns the printer echo on or off, any
; other is kept), then ECHORAW sends it.
OUTONE:
  push bc        ; the character, kept
                 ; over the key check
  call CHKKEY    ; ^S, ^P or a key kept
  pop bc
  jr ECHORAW

; One character, C, echoed with no tab
; expanded and no key taken: the
; console's status is asked first
; (CONSTAT), its answer unused. It falls
; into ECHORAW.
ECHOONE:
  push bc        ; the character, kept
                 ; over the status
  call CONSTAT   ; the status, its
                 ; answer unused
  pop bc

; The character in C to the printer
; while ^P's echo is on, then to the
; console as it is. COLUMN is moved for
; it first (ECHOCOL), so nothing needs
; C after a BIOS call: a CONOUT or LIST
; put in the RAM jump table need not
; keep it, as CP/M 2.2's need not.
; Changes A, C and what the BIOS's calls
; change.
ECHORAW:
  call ECHOCOL   ; COLUMN moved for C
  ld a,(LISTEN)  ; 1 while ^P's echo is
                 ; on
  or a
  jr z,ECHOCON   ; off: the console
                 ; alone
  push bc        ; the character, kept
                 ; over the printer
  call BIOLST
  pop bc

ECHOCON:
  jp BIOCOT      ; the console, through
                 ; the RAM jump table

; COLUMN moved for the character in C: 0
; after CR, back one after BS, on one
; after a character from a space up,
; unchanged after another control.
; Changes A; keeps C.
ECHOCOL:
  ld a,c         ; the column it leaves
  cp CR
  jr z,COLZERO   ; CR: column 0
  cp BACKSP
  jr z,COLBACK   ; BS: back one
  cp SPACE
  ret c          ; another control: no
                 ; column
  ld a,(COLUMN)  ; a character shown: on
                 ; one
  inc a
  ld (COLUMN),a
  ret

; The character in C echoed, as line
; input and function 1 echo it: a tab as
; spaces to the next multiple of 8, any
; other through ECHOONE. No key is
; taken. Changes A, C and what the
; BIOS's calls change.
ECHOCHAR:
  ld a,c
  cp TAB
  jr nz,ECHOONE  ; not a tab: as it is

ECHOTAB:
  ld c,SPACE     ; a tab: spaces to a
                 ; multiple of 8
  call ECHOONE
  ld a,(COLUMN)  ; as ECHORAW has moved
                 ; it on
  and 7
  jr nz,ECHOTAB  ; not yet at a tab stop
  ret

; COLUMN to 0, after a CR. Changes A.
COLZERO:
  xor a          ; the screen line's
                 ; start
  ld (COLUMN),a
  ret

; COLUMN back one, after a BS or an
; erased character, never below 0.
; Changes A.
COLBACK:
  ld a,(COLUMN)
  or a
  ret z          ; already at the start
  dec a
  ld (COLUMN),a
  ret

; During output, a key waiting is taken
; (CONSTQ: no cursor drawn). ^S pauses
; until the next key, which is taken: ^C
; ends the program by warm boot, as
; CP/M 2.2's conbrk does, and any other
; is dropped. ^P turns the printer echo
; on or off; any other key is kept for
; the next console read. Changes A and
; what the BIOS's status and input
; change.
CHKKEY:
  call CONSTQ    ; TEC-OS: the check
                 ; draws no cursor
  or a
  ret z          ; no key: the output
                 ; goes on
  call GETCHAR   ; a key ready: taken
  cp CTRLS       ; ^S: a pause
  jr nz,CHKPRN
  call GETCHAR   ; the next key resumes
  cp CTRLC       ; ^C: the program ends,
                 ; with the rest
  jp z,CHDROP    ; of a chained line
  ret            ; any other: dropped

; The key in A, not ^S, during output:
; ^P turns the printer echo on or off;
; any other is kept for the next console
; read. Changes A.
CHKPRN:
  cp CTRLP
  jr z,TOGLIST   ; ^P: the printer echo
; TEC-OS: any other key is kept for the
  ld (PENDCHR),a
; next console read, as CP/M 2.2 does,
; so typing during output is not lost.
  ld a,1         ; and marked as kept
  ld (PENDING),a
  ret

; ^P: the printer echo (LISTEN) turned
; on or off. Changes A.
TOGLIST:
  ld a,(LISTEN)
  xor 1          ; 0 off, 1 on
  ld (LISTEN),a
  ret

; The character before the cursor erased
; from the screen, straight through
; the BIOS (not echoed to the printer),
; and COLUMN back one. Changes A, C
; and what the BIOS's output changes.
ERASE1:
  ld c,BACKSP    ; back over it,
  call BIOCOT    ; through the RAM jump
                 ; table
  ld c,SPACE     ; a space over it,
  call BIOCOT
  ld c,BACKSP    ; and back again
  call BIOCOT
  jr COLBACK     ; the column back one
