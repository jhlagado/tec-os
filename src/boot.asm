; Cold boot, warm boot and the
; diagnostic console. The reset jump is
; in reset.asm.

; ---- Cold boot
; --------------------------------------
; Entered from RSTENT at reset, or BIOS
; function 0. One entry, and three paths
; through the ROM: an ordinary exit is
; warm boot, below, and never comes
; here; a recognised reset keeps the
; selected volumes, by RSLCAP and RESEL;
; an unrecognised reset takes the card's
; defaults. the workspace, less the byte
; LDIR starts from

WSSPAN EQU WSEND-WSBASE-1

; ---- Reset entry
; --------------------------------------
; RESET's jump comes here, from 0000h at
; reset or from C000h when a program
; ends with EXPAND 1 in view: its JP 0
; finds BF03h empty there and runs on
; through zeros into the ROM (B1). At
; reset the overlay is on and 0002h
; holds the jump's high byte; otherwise
; it holds the RAM BIOS's, and warm
; boot, which puts EXPAND 0 back, writes
; the cache's dirty lines as any exit
; does. No stack is set on entry. COLD,
; BIOS function 0, starts on the boot
; stack in fixed RAM and moves to
; STKTOP, the BDOS's, once the workspace
; is cleared; it runs on into warm boot
; and never returns.

RSTENT:
  ld a,($0002)   ; the overlay's copy of
                 ; RESET's target, or
                 ; RAM's

; equal only at reset

  cp HIGH(RSTENT)
  jp nz,WBOOTR   ; a program's exit:
                 ; keep its writes

COLD:
  di             ; BIOS function 0
                 ; enters here
  ld sp,BOOTSTK  ; the boot stack, in
                 ; fixed RAM below 8000h
  ld a,LATCLAS   ; overlay off, classic
                 ; bank, code at C0xxh
  out (SYSLAT),a
  im 1           ; a maskable interrupt
                 ; is RST 38h
  call RSLCAP    ; before anything it
                 ; reads is cleared

COLDZ:
  ld a,LATCLAS   ; RSLCAP used A
  ld hl,0        ; clear page zero
  ld de,1
  ld bc,$FF
  ld (hl),l
  ldir           ; 0000h-00FFh: RSLBUF,
                 ; at 0100h, is kept
  ld (LATCHV),a  ; A is still LATCLAS
  call RAMCHK    ; no return without RAM
                 ; at 8000h-BFFFh
  ld hl,WSBASE   ; clear the resident
                 ; workspace
  ld de,WSBASE+1
  ld bc,WSSPAN
  ld (hl),0
  ldir           ; to WSEND, above the
                 ; RAM BIOS table
  ld sp,STKTOP   ; the workspace is
                 ; there to hold it now:
                 ; the

; BDOS's stack, unused before the CCP,
; so that the console's start and the
; banner keep off the BIOS's (KE-173)

  call CONINIT   ; the serial line,
                 ; keyboard and PICO9918
  call RTCHAS    ; the clock, once: INFO
                 ; reads its bit
  jr nz,COLDNC   ; no DS1302
  ld hl,CONDEV
  set 3,(hl)     ; CDRTC

COLDNC:
  ld hl,BANNER   ; on the console just
                 ; started
  call PUTS
  call MEMINIT   ; the cache's lines
                 ; empty, before any
                 ; mount

; The card's part of cold boot, and
; DIAG's retry, which comes back here.
; It runs on STKTOP, the BDOS's stack,
; unused before the CCP runs: the mount,
; the listing and DIAG all run there,
; and the BIOS's stack keeps only warm
; boot's use (KE-173). LCDINIT clears
; the display, so CARD? goes with it,
; and a retry that fails shows it again.
; Mounted, it builds the vectors, the
; stub and the RAM BIOS table, lists the
; drives, and runs on into warm boot,
; whose PZINIT builds page zero, with
; drive A and user 0.

COLDRT:
  ld sp,STKTOP   ; the BDOS's stack,
                 ; afresh for a retry
  call LCDINIT   ; a blank display,
                 ; CARD? gone
  ld hl,LCDBAN   ; LCDINIT's count left
                 ; B = 0, the top row
  call LCDROW
  call SDINIT    ; the card, in SPI mode
  jp nz,DIAG     ; no card, or one that
                 ; won't start
  call MOUNT
  jp nz,DIAG     ; a card with no volume
                 ; to mount
  call ALVINIT   ; the vectors, and the
                 ; stub below them
  call RESEL     ; a retained selection,
                 ; if the card still has
                 ; it

; no residents yet: the TPA's top is the
; stub

  ld hl,(STUBAD)
  ld (PZTOP),hl
  ld hl,BIOSBAS  ; the RAM BIOS table,
                 ; at cold boot only:
                 ; warm
  ld de,RAMBIOS  ; boot leaves it, and
                 ; any entry a program
                 ; has
  ld bc,BIOSLEN  ; replaced, alone, as
                 ; CP/M 2.2 does
  ldir
  call SHOWVOL   ; the drives on the
                 ; console
  call LCDVOLS   ; and A: and B: on the
                 ; LCD
  xor a          ; drive A, user 0
  ld (PZDU),a    ; then on into warm
                 ; boot, which builds

; page zero once (KE-199)

; ---- Warm boot
; --------------------------------------
; BIOS function 1, the JP at 0000h, and
; RSTENT for a program's exit into
; C000h. Select the classic bank before
; the stack, because the BIOS's stack,
; BSTK, is in that bank; warm boot runs
; on it. Gives the PICO9918 back,
; rebuilds page zero and the CCP's and
; BDOS's state, puts the display mode
; and scroll region back, writes the
; cache's dirty lines, and enters the
; CCP with page zero's drive and user in
; C. Never returns.

WBOOTR:
  di             ; no interrupt while
                 ; page zero is rebuilt
  ld a,LATCLAS   ; EXPAND 0 in view
  ld (LATCHV),a  ; the shadow, then the
                 ; latch
  out (SYSLAT),a
  ld sp,BSTK     ; the BIOS's stack, now
                 ; in view
  call HWVREL    ; a program that
                 ; claimed the PICO9918
                 ; gives

; it back first: its interrupt, an NMI,
; off before page zero is rebuilt

  call PZINIT    ; the jumps, the stub
                 ; and the RST vectors
  ld hl,SVCBSY   ; no INIT or REMOVE
                 ; outlives a warm boot
  res 7,(hl)
  call CPMINIT   ; the CCP and BDOS as a
                 ; fresh load has them
  ld a,(CONMOD)  ; a program may have
                 ; changed the display
                 ; mode
  rrca           ; carry: an odd mode, a
                 ; video display
  call c,VREST   ; its driver puts the
                 ; mode back
  call VTREGR    ; and left a scroll
                 ; region set
  call CWBOOT    ; the cache's dirty
                 ; lines written
  ld a,(PZDU)    ; the drive and user,
                 ; for the CCP in C
  ld c,a
  jp CCPENT      ; the prompt; no return

; Recognise a TEC-OS of this layout from
; what it left in RAM, reading only, at
; fixed addresses, and running nothing
; old. RAM is recognised when page zero
; holds the warm boot jump to RAMBIOS+3
; and a jump at 0005h, STUBAD's word S
; holds JP BENTRY, and the word W at
; 0006h is from 8000h up, and S or a
; page's start at most S's page. W is
; not compared with PZTOP: SVCLOAD
; lowers it before INIT, so the reset
; that recovers from a hung INIT is
; recognised too. BENTRY and STUBAD's
; own address are the layout's test, and
; ram.asm states the limit. Recognised,
; DRVTAB goes to RSLBUF, which nothing
; writes before MEMINIT, so DIAG's retry
; finds it. Otherwise RSLBUF's A:
; geometry is 0, which means no
; selection. Runs on the boot stack,
; clear of all it reads. Destroys AF,
; BC, DE and HL.

RSLCAP:
  ld a,($0000)   ; the warm boot jump
  cp $C3         ; JP
  jr nz,RSLNO
  ld hl,($0001)  ; to the RAM BIOS
                 ; table's warm boot
                 ; entry

; which never moves

  ld de,RAMBIOS+3
  sbc hl,de      ; carry is clear: the
                 ; CP was equal
  jr nz,RSLNO    ; a jump elsewhere
  ld a,(PZBDOS)  ; the jump at 0005h
  cp $C3         ; JP
  jr nz,RSLNO

; S, the stub

  ld hl,(STUBAD)
  ld a,(hl)      ; S holds JP BENTRY,
                 ; the layout's test
  cp $C3
  jr nz,RSLNO    ; no jump at S
  inc hl
  ld a,(hl)      ; the target, low byte
  cp LOW(BENTRY)
  jr nz,RSLNO
  inc hl
  ld a,(hl)      ; and high
  cp HIGH(BENTRY)
  jr nz,RSLNO    ; another layout, or no
                 ; BDOS behind it

; W, which any resident has lowered

  ld hl,(PZBDOS+1)
  ld a,h         ; no service or stub
                 ; goes below 8000h
  cp $80
  jr c,RSLNO
  ld de,(STUBAD)
  sbc hl,de      ; W = S: no resident.
                 ; Carry is clear
  jr z,RSLYES
  add hl,de      ; W again
  ld a,l         ; each resident's entry
                 ; is at offset 0
  or a
  jr nz,RSLNO    ; W is not a page's
                 ; start
  ld a,d         ; S's page, W's at most
  cp h
  jr c,RSLNO     ; W above S's page

RSLYES:
  ld hl,DRVTAB   ; recognised: the
                 ; selection, for RESEL
  ld de,RSLBUF
  ld bc,32       ; MAXDRV*DRVESZ: all of
                 ; DRVTAB
  ldir
  ret

RSLNO:
  xor a          ; no selection: the
                 ; card's defaults

; A:'s geometry, 0

  ld (RSLBUF+6),a
  ret

; Cold boot: clear EXPAND 1, which
; RAMCHK found, and empty the cache's
; lines. EXPAND 1 hides the workspace
; and the stack in it, so nothing here
; touches the stack until EXPAND 0 is
; back. Destroys AF, BC, DE and HL.

MEMINIT:
  ld a,(LATCHV)  ; EXPAND 1 in view, no
                 ; stack: clear it all
  or LATEXP
  out (SYSLAT),a
  ld hl,$8000    ; 8000h-BFFFh: the
                 ; lines, their table
                 ; and
  ld de,$8001    ; dirty bytes, and the
                 ; history
  ld bc,$3FFF
  ld (hl),0
  ldir
  ld hl,CTAB     ; the cache's lines all
                 ; empty
  ld de,CTAB+1

; 4 bytes a line, FFFFFFFFh for no block

  ld bc,NLINES*4-1
  ld (hl),$FF
  ldir
  ld a,(LATCHV)  ; EXPAND 0 back, and
                 ; the stack with it
  out (SYSLAT),a
  ret

; Whether latch bit A shows other RAM at
; HL: the complement of the byte seen
; without it is written with it set; if
; the byte without it is unchanged,
; there are two regions. Both bytes are
; put back, and no stack is used with
; the bit set. Takes LATCHV. Returns A =
; 1 or 2, and the latch as LATCHV.
; Destroys F, BC and DE.

DETECT:
  ld e,a         ; E: the latch with the
                 ; bit
  ld a,(LATCHV)
  ld d,a         ; D: the latch as it is
  or e
  ld e,a
  ld b,(hl)      ; the byte without the
                 ; bit

; the bit set

  out (SYSLAT),a
  ld c,(hl)      ; the byte with it, or
                 ; the same one again
  ld a,b
  cpl
  ld (hl),a      ; B's complement,
                 ; written with the bit
                 ; set
  ld a,d

; and clear again

  out (SYSLAT),a
  ld a,(hl)      ; the byte without the
                 ; bit, after the write
  ld (hl),b      ; B back, should the
                 ; write have landed
                 ; here
  cp b           ; unchanged: the write
                 ; went elsewhere
  ld a,1
  ret nz         ; one region saw the
                 ; write
  ld a,e         ; two: C back in the
                 ; other one
  out (SYSLAT),a
  ld (hl),c
  ld a,d         ; and the latch as it
                 ; was
  out (SYSLAT),a
  ld a,2
  ret

; Rebuild the classic page-zero vectors
; and the BDOS entry jump, and put the
; restart vectors back as a clean boot
; leaves them. IOBYTE and the drive/user
; byte are left alone. Takes PZTOP, the
; TPA's top, and STUBAD, the stub's
; address. Runs on into PZSWP and
; returns as it does.

PZINIT:
  ld a,$C3       ; JP, for each of the
                 ; three jumps
  ld ($0000),a

; warm boot, by the RAM BIOS table

  ld hl,RAMBIOS+3
  ld ($0001),hl
  ld (PZBDOS),a
  ld hl,(PZTOP)  ; the lowest resident's
                 ; entry, or the stub
  ld (PZBDOS+1),hl

; the stub: JP BENTRY

  ld hl,(STUBAD)
  ld (hl),a
  inc hl         ; its target, low byte
                 ; first
  ld (hl),LOW(BENTRY)
  inc hl
  ld (hl),HIGH(BENTRY)

; The restart vectors 0008h-003Fh, here
; and after a service goes: each one
; that is not a jump above the top
; becomes seven zeros and a RET, so an
; RST through it returns at once, with
; the interrupt state unchanged, and
; never runs into the next vector, and
; 0038h takes EI; RETI. Such a jump,
; into a service, the workspace or ROM,
; keeps its three bytes and the rest of
; its vector is cleared. A program's
; vector into the TPA does not outlive
; it, one into a service's pages does
; not outlive the service, and a cold
; boot leaves the same bytes. Takes
; PZTOP. Returns carry clear. Destroys
; AF, BC and HL.

PZSWP:
  ld hl,$0008    ; RST 08h's vector
                 ; first

RSTCLR:

; seven zeros, then RET

  ld bc,7*256+$C9
  ld a,(hl)
  cp $C3         ; a jump: its target
                 ; decides
  jr nz,RSTZERO  ; anything else goes
  inc hl         ; carry if the target
                 ; is above the top
  ld a,(PZTOP)
  sub (hl)
  inc hl

; then the high bytes, with the borrow

  ld a,(PZTOP+1)
  sbc a,(hl)
  dec hl         ; back to the vector's
                 ; start
  dec hl
  jr nc,RSTZERO  ; into the TPA: it goes
  inc hl         ; keep JP nn, then five
                 ; zeros
  inc hl
  inc hl
  ld bc,4*256+0  ; four zeros by B, the
                 ; fifth from C

RSTZERO:
  ld (hl),0      ; B zeros
  inc hl
  djnz RSTZERO
  ld (hl),c      ; then C: RET, or 0
                 ; after a kept jump
  inc hl
  ld a,l         ; the next vector, up
                 ; to 0040h
  cp $40
  jr nz,RSTCLR
  ld a,(RST7)
  cp $C3
  ret z          ; a kept jump at 0038h
  xor a
  ld (RST7+7),a  ; zeros after EI; RETI,
                 ; as a clean boot has
  ld hl,$4DED    ; RETI after EI
  ld (RST7+1),hl
  ld a,$FB       ; EI
  ld (RST7),a
  ret

; The stack guard's bytes.

STKGN EQU STKGUEND-STKGUARD

; Reset the CCP and BDOS writable state
; as a fresh disk load would: zeros from
; CCPCLR to BDOSRME, the BDOS's stack at
; STKTOP among them; the DMA at 0080h;
; the command buffer's size; and the
; stack guard's pattern. The command
; line, below CCPCLR, is kept for a
; chained line's next piece. BUFOK goes
; to 0, so BWRITE's key from before the
; warm boot (GETKEY) no longer lets a
; block be cleared rather than read.
; Runs on the BIOS's stack, outside the
; span it clears. Destroys AF, BC, DE
; and HL.

CPMINIT:
  ld hl,CCPCLR   ; zeros from CCPCLR to
                 ; BDOSRME
  ld de,CCPCLR+1
  ld bc,BDOSRME-CCPCLR-1
  ld (hl),0
  ldir
  ld hl,DEFDMA   ; the DMA at 0080h, as
                 ; CP/M starts
  ld (CURDMA),hl
  ld a,127       ; the longest line the
                 ; CCP's buffer takes
  ld (CMDBUF),a

; between the CCP's scratch and its
; stack

  ld hl,STKGUARD
  ld b,STKGN     ; each guard byte gets
                 ; the pattern a check
                 ; reads

CPMIG:
  ld (hl),$A5
  inc hl
  djnz CPMIG
  xor a          ; BUFOK 0: BWRITE's key
                 ; gone
  ld (BUFOK),a
  ret

; ---- RAM check
; --------------------------------------
; TEC-OS needs 64K: RAM at 8000h-BFFFh,
; where the resident workspace and the
; CP/M stacks live, and EXPAND 1 behind
; it, the cache's and the history's. One
; check, before the banner. Write both
; ends of the window before reading
; either, so a floating bus cannot hand
; back the byte just written; then look
; for EXPAND 1 at 8000h. Without either,
; report on the serial port and stop:
; TXBYTE reads nothing above 8000h, and
; the workspace, CONDEV with it, is not
; cleared yet. The boot stack is in
; fixed RAM. Returns only with 64K.
; Destroys AF, BC, DE and HL.

RAMCHK:
  ld de,$55AA    ; one pattern, then its
                 ; complement
  call RAMPAT
  ld de,$AA55
  call RAMPAT
  ld a,LATEXP    ; and EXPAND 1 behind
                 ; the window
  ld hl,DETEXP
  call DETECT
  cp 2           ; two regions at 8000h
  ret z          ; 64K
  jr RAMBAD      ; the window alone, no
                 ; EXPAND 1

; Write D at 8000h and E at BFFFh, then
; read both back. Returns if both held;
; otherwise goes to RAMBAD, which never
; returns. Destroys AF and HL.

RAMPAT:
  ld hl,$8000
  ld (hl),d      ; both ends written
  ld a,e
  ld ($BFFF),a
  ld a,(hl)      ; before either is read
                 ; back
  cp d
  jr nz,RAMBAD   ; 8000h did not hold it
  ld a,($BFFF)
  cp e
  ret z          ; both held

; RAMMSG straight to the serial port,
; which needs nothing above 8000h, and
; stop for good.

RAMBAD:
  ld hl,RAMMSG
  ld a,$40       ; serial idle, for the
                 ; first start bit
  out (DIGPORT),a

RAMOUT:
  ld a,(hl)      ; each byte, up to the
                 ; zero
  or a
  jr z,RAMSTOP   ; the message sent
  call TXBYTE
  inc hl
  jr RAMOUT

RAMSTOP:
  jr RAMSTOP     ; nothing more runs

; Print the mounted drives: letter and
; label, and (read-only) for a volume so
; flagged, a line each. Runs at cold
; boot, before the CCP. Destroys AF, BC,
; DE, HL and IX.

SHOWVOL:
  ld c,0         ; each mounted drive,
                 ; in drive order

SHV:
  push bc        ; the drive, across the
                 ; printing
  call DRVDESC   ; IX at its volume's
                 ; descriptor
  jr nz,SHVN     ; none on this drive
  ld hl,CMDTXT   ; letter and label, in
                 ; the CCP's line,
  call DRVLAB    ; free before the CCP
                 ; has run; not in
  ld hl,CMDTXT   ; LINEBUF, where the
                 ; terminal's scroll
  call PUTS      ; puts a row while PUTS
                 ; prints it

; the volume's flags

  ld a,(ix+DFLAGS)
  and DFREAD
  jr z,SHVRW     ; writable: no note
  ld hl,ROTXT
  call PUTS

SHVRW:
  call PUTCRLF

SHVN:
  pop bc
  inc c          ; the next drive, up to
                 ; MAXDRV
  ld a,c
  cp MAXDRV
  jr c,SHV
  ret

; Pack the allocation vectors down from
; WSBASE, in drive order, and put each
; one's address in its DPH. A format 1.1
; card that asks for N drives gets a
; G8M-sized slot (256 bytes) for each of
; drives 0 to N-1, mounted or not, so
; any drive may later take any volume;
; any other card gets a slot for each
; mounted drive, DSM / 8 + 1 bytes, as
; before. DRVSLOT records what each slot
; holds. The BDOS entry jump goes
; directly below them. Takes MOUNT's
; drive table and MNTDRV. Returns STUBAD
; at the jump's place. Destroys AF, BC,
; DE and HL.

ALVINIT:
  ld hl,WSBASE   ; the vectors end at
                 ; WSBASE

; the lowest vector so far

  ld (STUBAD),hl
  ld c,0         ; drive A first

ALVNX:
  ld a,c         ; HL = the DPH's DPB
                 ; word, at +10
  call DPHADR    ; the drive's DPH; C
                 ; kept
  ld de,10
  add hl,de
  push hl        ; for the ALV word,
                 ; four bytes on
  ld a,(MNTDRV)  ; format 1.1: the
                 ; drives wanted
  or a
  jr z,ALV10     ; a 1.0 card: only
                 ; drives mounted
  ld b,a
  ld a,c
  cp b
  jr nc,ALVNO    ; past the drives asked
                 ; for
  ld de,256      ; a G8M slot, mounted
                 ; or not
  jr ALVPUT

ALV10:
  ld a,c
  call DRVENT    ; the drive's geometry
                 ; byte
  ld a,(hl)
  or a
  jr z,ALVNO     ; not mounted
  pop hl         ; the DPB's address,
                 ; from the DPH
  push hl
  ld e,(hl)
  inc hl
  ld d,(hl)
  ld hl,5        ; DSM
  add hl,de
  ld e,(hl)
  inc hl
  ld d,(hl)      ; DE = DSM
  ld b,3         ; a bit a block: DSM /
                 ; 8 + 1 bytes

ALVSH:
  srl d
  rr e
  djnz ALVSH
  inc de

ALVPUT:
  ld hl,DRVSLOT  ; 1 for 64 bytes, 2 for
                 ; 256
  ld b,0         ; the drive's entry,
                 ; DRVSLOT + C
  add hl,bc
  ld a,d         ; D: 1 for 256 bytes,
                 ; else 0
  inc a
  ld (hl),a

; the slot goes below the last

  ld hl,(STUBAD)
  or a
  sbc hl,de
  ld (STUBAD),hl
  ex de,hl       ; DE: the vector's
                 ; address
  pop hl
  inc hl         ; the ALV word, at +14
  inc hl
  inc hl
  inc hl
  ld (hl),e      ; the DPH points at its
                 ; vector
  inc hl
  ld (hl),d
  jr ALVSKP

ALVNO:
  pop hl         ; no slot: the DPH's
                 ; word dropped

ALVSKP:
  inc c          ; the next drive, up to
                 ; MAXDRV
  ld a,c
  cp MAXDRV
  jr c,ALVNX
  ld hl,(STUBAD)
  dec hl         ; the JP, below the
                 ; lowest vector
  dec hl
  dec hl
  ld (STUBAD),hl
  ret

; Diagnostic console, entered by a jump
; from COLDRT when the card or container
; cannot be mounted. A = error code:
; SDE* (01h-0Fh) from the SD driver or
; ME* (20h-2Fh) from the mount checks.
; Shows CARD? on the LCD and the code on
; the console, then asks until R, which
; retries from COLDRT. The console stays
; usable without a card. Runs on STKTOP,
; the BDOS's stack, which COLDRT set and
; both its jumps here leave at its top,
; so the BIOS's keeps only warm boot's
; use (KE-173); a retry sets it afresh.
; Never returns.

DIAG:
  push af        ; the code, kept across
                 ; the messages
  ld hl,DGCARD   ; the LCD, for a board
                 ; with no terminal
  call LCD3      ; CARD? on row 3
  ld hl,DGERR    ; and the message on
                 ; the console
  call PUTS
  pop af
  call PUTHEX    ; the code on the
                 ; console
  call PUTCRLF

DGLOOP:
  ld hl,DGPROM   ; ask until the key is
                 ; one of ours
  call PUTS
  call BCONIN    ; wait for a key
  push af
  call PUTA      ; echo it as typed, on
                 ; a line of its own
  call PUTCRLF
  pop af
  and $DF        ; upper case, for the
                 ; test alone (KE-195)
  cp 'R'
  jp z,COLDRT    ; retry: LCD, card and
                 ; mount from the start
  jr DGLOOP      ; any other key: the
                 ; prompt again
