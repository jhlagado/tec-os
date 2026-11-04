; Video displays. VIDINIT records in
; CONDEV whether the PICO9918 answers;
; the
; console mode then points the
; terminal's driver vectors at a
; driver's table:
; VPUT (A at row B, column C), VGET,
; VCLREOL, VREST, which puts back the
; display mode and character set after a
; program may have changed them,
; leaving the picture alone, and VRDROW
; and VWRROW, which copy row B to and
; from LINEBUF. Scrolling is a line
; delete in the terminal.

; From CONINIT at cold boot, with CONDEV
; holding CDMTX or nothing: when the
; PICO9918 answers, CDTMS set in CONDEV
; and PISTART run, which makes it the
; console if the matrix keyboard is
; there too. Destroys AF, BC, DE and HL.
VIDINIT:
  call TMSINIT   ; Z: VRAM keeps what is
                 ; written
  ret nz         ; no PICO9918
  ld hl,CONDEV
  set 1,(hl)     ; CDTMS
  jp PISTART     ; the console, with the
                 ; matrix keyboard

; The terminal's calls into the driver
; in effect, each through the vector
; CONSWV copied from the driver's table.
; Registers are as the driver takes and
; leaves them.

; VPUT: A at row B, column C.
VPUT:
  ld hl,(VPUTV)  ; the driver's entry
  jp (hl)
; VGET: A = the character at row B,
; column C.
VGET:
  ld hl,(VGETV)  ; the driver's entry
  jp (hl)
; VCLREOL: row B cleared from column C
; to its end.
VCLREOL:
  ld hl,(VCLRV)  ; the driver's entry
  jp (hl)
; VREST: the display's mode and
; character set back, the picture left
; alone.
VREST:
  ld hl,(VRSTV)  ; the driver's entry
; Jump to HL, so that a CALL VHLJP calls
; the routine at HL.
VHLJP:
  jp (hl)
; VRDROW: row B into LINEBUF.
VRDROW:
  ld hl,(VRDRV)  ; the driver's entry
  jp (hl)
; VWRROW: LINEBUF to row B.
VWRROW:
  ld hl,(VWRRV)  ; the driver's entry
  jp (hl)

; The word for what only the PICO9918
; does, when it is the console and no
; program has claimed it: A = 0 show a
; finished row move; 1 begin a move of
; rows
; C to VSBOT; 2 end one. Destroys AF, HL
; and what the driver's word does
; (the ROM's: D, for a move begun);
; VTMBEG also sets B and C for it.
VTMBEG:
  ld b,c         ; the driver's B to C:
                 ; rows C to VSBOT
  ld a,(VSBOT)
  ld c,a
  ld a,1         ; a move begins
  jr VTFN
; End a row move: VTFN's 2.
VTMEND:
  ld a,2         ; the move ends
  jr VTFN
; Show the page drawn: VTFN's 0.
VTFLIP:
  xor a          ; the page drawn shown

VTFN:
  ld l,a         ; the function, across
                 ; the tests
  ld a,(CONMOD)
  cp CMCRT
  ret nz         ; the PICO9918 is not
                 ; the console
  call VTOWN
  ret nz         ; a program owns it:
                 ; hands off
  ld a,l
  ld hl,(VFNV)   ; the driver's word, A
                 ; = the function
  jp (hl)

; ---- The video drivers' hook
; --------------------------------------
; GLCD.SVC hands the ROM a table through
; TNDRVR (abi.inc), and CONSW points
; the terminal's vector at it for UC1:;
; its REMOVE calls it with HL = 0.
; CRT:'s
; table, PIVEC, is the ROM's own, set by
; PISTART.

; A = CMCRT or CMUC1, HL = the driver's
; table: the terminal's six words (VPUT,
; VGET, VCLREOL, VREST, VRDROW, VWRROW),
; the word for VTFN's functions, then
; columns and rows. Kept for CONSW, and
; HL = LINEBUF on return with carry
; clear,
; where VRDROW and VWRROW move a row;
; carry set and nothing changed if a
; table
; is kept already, or there is no matrix
; keyboard. HL = 0: the table dropped,
; and, if mode A is in effect, the
; console chosen again at its next call;
; any
; other mode is left as it is, its
; screen kept. Carry clear. Destroys AF,
; DE.
VIDHOOK:
; DE = PIVEC or GLVEC, the mode's word
  add a,LOW(PIVEC)-1
  ld e,a
  ld d,HIGH(PIVEC)
  ld a,h         ; test table pointer
  or l
  jr z,VIDHOFF   ; HL = 0: the table
                 ; dropped
  ld a,(CONDEV)  ; CDMTX, bit 0
  rrca           ; into carry,
  ccf            ; then carry if there
                 ; is no keyboard
  ret c
  inc de
  ld a,(de)      ; a table in RAM is at
                 ; 0100h or above
  dec de
  or a           ; so a high byte of 0
                 ; is no table
  scf
  ret nz         ; one is kept already
  ex de,hl       ; HL = the word, DE =
                 ; the table
  ld (hl),e
  inc hl
  ld (hl),d
  ld hl,LINEBUF  ; where VRDROW and
                 ; VWRROW move a row
  or a           ; carry clear
  ret

VIDHOFF:
  ex de,hl       ; HL = the word, D = 0
  ld (hl),d      ; the word cleared
  inc hl
  ld (hl),d
  ld a,l
; GLVEC's: GLCD.SVC has gone
  cp LOW(GLVEC+1)
  jr nz,VIDHF1
  ld hl,CONDEV   ; CDGLC: no GLCD
                 ; console now
  res 2,(hl)

VIDHF1:
; A = the mode unhooked, 1 or 3
  sub LOW(PIVEC)
  ld hl,CONMOD
  xor (hl)       ; not the mode in
                 ; effect: left alone,
  ret nz         ; carry clear, the
                 ; screen kept (KE-190)
  ld (hl),a      ; serial in effect, so
                 ; a field naming the
  ret            ; display acts at the
                 ; next call; NC
