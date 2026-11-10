; Cold boot, warm boot and card-error
; diagnostics. The reset jump is in
; reset.asm. Recognised resets attempt
; retained selection. Other resets use
; card defaults. Program exits enter
; warm boot.

; Workspace LDIR count after writing its
; first zero. Clear WSBASE..WSEND-1.

WSSPAN EQU WSEND-WSBASE-1

; RESET reaches RSTENT without an
; assumed stack. Byte 0002h
; distinguishes overlay HIGH(RSTENT)
; from RAM BIOS. A program exit with
; EXPAND1 can reach C000h through the
; empty BF03h region (B1), then take
; WBOOTR. Reset falls into COLD. Neither
; path returns.

RSTENT:
  ld a,($0002)

  cp HIGH(RSTENT)
  jp nz,WBOOTR

; BIOS function 0 enters COLD directly.
; Disable interrupts and use fixed
; BOOTSTK below 8000h. Select
; LATCLAS/IM1, then capture old
; selection before clearing anything
; RSLCAP reads.

COLD:
  di
  ld sp,BOOTSTK
  ld a,LATCLAS
  out (SYSLAT),a
  im 1
  call RSLCAP

; Clear page zero but keep RSLBUF at
; 0100h. Set LATCHV and require RAMCHK
; before workspace clear. Move to STKTOP
; only after WSBASE..WSEND-1 is cleared,
; keeping startup off the BIOS stack
; (KE-173). Initialise console/RTC,
; print banner and clear EXPAND1/cache
; before mounting.

COLDZ:
  ld a,LATCLAS
  ld hl,0
  ld de,1
  ld bc,$FF
  ld (hl),l
  ldir
  ld (LATCHV),a
  call RAMCHK
  ld hl,WSBASE
  ld de,WSBASE+1
  ld bc,WSSPAN
  ld (hl),0
  ldir
  ld sp,STKTOP

  call CONINIT
  call RTCHAS
  jr nz,COLDNC
  ld hl,CONDEV
  set 3,(hl)

COLDNC:
  ld hl,BANNER
  call PUTS
  call MEMINIT

; Cold card setup and DIAG retry reset
; SP to STKTOP, the BDOS stack (KE-173).
; LCDINIT clears CARD? and leaves B=0
; for the row-0 banner. SDINIT/MOUNT NZ
; jumps to DIAG with A=error. Allocate
; slots, attempt RESEL, set PZTOP to the
; stub before any resident loads and
; copy BIOSBAS to RAMBIOS. This
; cold/retry path alone copies the
; table. List drives and fall into warm
; boot with PZDU=0. Page zero is built
; once (KE-199).

COLDRT:
  ld sp,STKTOP
  call LCDINIT
  ld hl,LCDBAN
  call LCDROW
  call SDINIT

DIAGJ1:
  jp nz,DIAG
  call MOUNT
  jr nz,DIAGJ1
  call ALVINIT
  call RESEL

  ld hl,(STUBAD)
  ld (PZTOP),hl
  ld hl,BIOSBAS
  ld de,RAMBIOS
  ld bc,BIOSLEN
  ldir
  call SHOWVOL
  call LCDVOLS
  xor a
  ld (PZDU),a

; Warm boot: disable maskable IRQs.
; Select LATCLAS, update LATCHV, then
; load BSTK in that bank. Release
; PICO before rebuilding page zero.
; This gives no hardware NMI guarantee.
; Clear busy bit 7 and reset
; CCP/BDOS writable state. Restore
; active video and full scroll region.
; Attempt CWBOOT flush, then enter CCP
; with PZDU in C. Failure reports loss
; and clears CHPOS but still enters CCP.
; Never returns.

WBOOTR:
  di
  ld a,LATCLAS
  ld (LATCHV),a
  out (SYSLAT),a
  ld sp,BSTK
  call PIICLR    ; end IE before the
                 ; handler sweep
  call HWVREL

  call PZINIT
  ld hl,SVCBSY
  res 7,(hl)
  call CPMINIT
  ld a,(CONMOD)
  rrca
  call c,VREST
  call VTREGR
  call CWBOOT
  ld a,(PZDU)
  ld c,a
  jp CCPENT

; Recognise old layout by reading RAM,
; never executing it. Require JP
; RAMBIOS+3 at 0000h, JP at 0005h and JP
; BENTRY at S=(STUBAD). Run on the fixed
; boot stack, outside inspected memory.
; W=(0006h) is checked below.
; On match copy 32 DRVTAB bytes to
; RSLBUF. Otherwise clear only RSLBUF+6,
; the no-selection sentinel. Recognition
; does not validate retained
; descriptors/slots. RESEL does that
; later. Change AF/BC/DE/HL.

RSLCAP:
  ld a,($0000)
  cp $C3
  jr nz,RSLNO
  ld hl,($0001)

  ld de,RAMBIOS+3
  sbc hl,de
  jr nz,RSLNO
  ld a,(PZBDOS)
  cp $C3
  jr nz,RSLNO

  ld hl,(STUBAD)
  ld a,(hl)
  cp $C3
  jr nz,RSLNO
  inc hl
  ld a,(hl)
  cp LOW(BENTRY)
  jr nz,RSLNO
  inc hl
  ld a,(hl)
  cp HIGH(BENTRY)
  jr nz,RSLNO

; Require W>=8000h and either W=S or
; page-aligned W with page <= S's page.
; Do not compare W with PZTOP: SVCLOAD
; lowers the BDOS entry before INIT, so
; a reset can recover a hung INIT.

  ld hl,(PZBDOS+1)
  ld a,h
  cp $80
  jr c,RSLNO
  ld de,(STUBAD)
  sbc hl,de
  jr z,RSLYES
  add hl,de
  ld a,l
  or a
  jr nz,RSLNO
  ld a,d
  cp h
  jr c,RSLNO

RSLYES:
  ld hl,DRVTAB
  ld de,RSLBUF
  ld bc,32
  ldir
  ret

RSLNO:
  xor a

  ld (RSLBUF+6),a
  ret

; After RAMCHK, map EXPAND1 with LATCHV
; OR LATEXP without changing the shadow.
; Clear 8000h..BFFFh, including
; dirty/history state, then set NLINES*4
; CTAB tag bytes to FFh for empty lines.
; No stack access until LATCHV restores
; EXPAND0. Change AF/BC/DE/HL.

MEMINIT:
  ld a,(LATCHV)
  or LATEXP
  out (SYSLAT),a
  ld hl,$8000
  ld de,$8001
  ld bc,$3FFF
  ld (hl),0
  ldir
  ld hl,CTAB
  ld de,CTAB+1

  ld bc,NLINES*4-1
  ld (hl),$FF
  ldir
  ld a,(LATCHV)
  out (SYSLAT),a
  ret

; Probe latch-mask A at address HL with
; those bits clear in LATCHV. Write the
; base byte's complement through the
; selected view and compare the base.
; A=1 means aliasing, 2 means
; independent bytes at this address.
; Restore both affected bytes and the
; latch to LATCHV. No stack use while
; mapped. Preserve HL, change F/BC/DE.

DETECT:
  ld e,a
  ld a,(LATCHV)
  ld d,a
  or e
  ld e,a
  ld b,(hl)

  out (SYSLAT),a
  ld c,(hl)
  ld a,b
  cpl
  ld (hl),a
  ld a,d

  out (SYSLAT),a
  ld a,(hl)
  ld (hl),b
  cp b
  ld a,1
  ret nz
  ld a,e
  out (SYSLAT),a
  ld (hl),c
  ld a,d
  out (SYSLAT),a
  ld a,2
  ret

; In the classic bank, write JP
; RAMBIOS+3 at 0000h, JP(PZTOP) at 0005h
; and JP BENTRY at (STUBAD). Require
; valid PZTOP/STUBAD. Preserve IOBYTE
; and PZDU. Fall into PZSWP and return
; its flags/clobbers.

PZINIT:
  ld a,$C3
  ld ($0000),a

  ld hl,RAMBIOS+3
  ld ($0001),hl
  ld (PZBDOS),a
  ld hl,(PZTOP)
  ld (PZBDOS+1),hl

  ld hl,(STUBAD)
  ld (hl),a
  inc hl
  ld (hl),LOW(BENTRY)
  inc hl
  ld (hl),HIGH(BENTRY)

; Sweep 0008h..003Fh after warm boot or
; service-page release. Keep only JP
; targets strictly greater than PZTOP,
; clearing their five trailing bytes.
; Equal targets are cleared too. Other
; slots become seven zeros and RET.
; If 0038h has no retained JP, install
; EI/RETI and clear its remaining bytes.
; PZSWP itself preserves interrupt
; state. Return carry clear. Change
; AF/BC/HL.

PZSWP:
  ld hl,$0008

RSTCLR:

  ld bc,7*256+$C9
  ld a,(hl)
  cp $C3
  jr nz,RSTZERO
  inc hl
  ld a,(PZTOP)
  sub (hl)
  inc hl

  ld a,(PZTOP+1)
  sbc a,(hl)
  dec hl
  dec hl
  jr nc,RSTZERO
  inc hl
  inc hl
  inc hl
  ld bc,4*256+0

RSTZERO:
  ld (hl),0
  inc hl
  djnz RSTZERO
  ld (hl),c
  inc hl
  ld a,l
  cp $40
  jr nz,RSTCLR
  ld a,(RST7)
  cp $C3
  ret z
  xor a
  ld (RST7+7),a
  ld hl,$4DED
  ld (RST7+1),hl
  ld a,$FB
  ld (RST7),a
  ret

; The stack guard's bytes.

STKGN EQU STKGUEND-STKGUARD

; Clear CCPCLR..BDOSRME-1 on the BIOS
; stack outside that span. Keep
; command-line/FCB storage below CCPCLR
; for chained commands and resident
; state outside the span. Set
; CURDMA=0080h, CMDBUF=127 and guard
; bytes=A5h. Clear BUFOK so a prior
; no-pre-read key cannot survive warm
; boot. Change AF/BC/DE/HL.

CPMINIT:
  ld hl,CCPCLR
  ld de,CCPCLR+1
  ld bc,BDOSRME-CCPCLR-1
  ld (hl),0
  ldir
  ld hl,DEFDMA
  ld (CURDMA),hl
  ld a,127
  ld (CMDBUF),a

  ld hl,STKGUARD
  ld b,STKGN

CPMIG:
  ld (hl),$A5
  inc hl
  djnz CPMIG
  xor a
  ld (BUFOK),a
  ret

; Before workspace clear, test
; 8000h/BFFFh with 55AAh then AA55h.
; Write both endpoints before reading
; either to avoid a just-written bus
; value satisfying the next read.
; Require DETECT=2 for LATEXP at 8000h.
; Failure reports serially and stops.
; Fixed BOOTSTK remains usable. Success
; returns A=2/Z. Change AF/BC/DE/HL.
; These are endpoint/bank checks.

RAMCHK:
  ld de,$55AA
  call RAMPAT
  ld de,$AA55
  call RAMPAT
  ld a,LATEXP
  ld hl,DETEXP
  call DETECT
  cp 2
  ret z
  jr RAMBAD

; Write D at 8000h and E at BFFFh before
; either comparison. Both matches return
; Z. Failure enters RAMBAD without
; return. Test bytes are not restored
; before workspace initialisation.
; Preserve BC/DE. Change AF/HL.

RAMPAT:
  ld hl,$8000
  ld (hl),d
  ld a,e
  ld ($BFFF),a
  ld a,(hl)
  cp d
  jr nz,RAMBAD
  ld a,($BFFF)
  cp e
  ret z

; Set TX idle and print zero-ended
; RAMMSG through TXBYTE, then loop
; forever. Bypass uninitialised
; workspace/console state. TXBYTE needs
; fixed BOOTSTK and generated delays, no
; RAM above 8000h. Change AF/B/DE and
; advance HL.

RAMBAD:
  ld hl,RAMMSG
  ld a,$40
  out (DIGPORT),a

RAMOUT:
  ld a,(hl)
  or a
  jr z,RAMSTOP
  call TXBYTE
  inc hl
  jr RAMOUT

RAMSTOP:
  jr RAMSTOP

; List drives in order before CCP. Skip
; any DRVDESC NZ result, including read
; failure. Build letter/label in free
; CMDTXT. LINEBUF is unsafe because
; terminal scrolling uses it during
; PUTS. Print a read-only note and
; CR/LF. Preserve loop BC across
; descriptor/output calls. Change
; AF/BC/DE/HL/IX.

SHOWVOL:
  ld c,0

SHV:
  push bc
  call DRVDESC
  jr nz,SHVN
  ld hl,CMDTXT
  call DRVLAB
  ld hl,CMDTXT
  call PUTS

  ld a,(ix+DFLAGS)
  and DFREAD
  jr z,SHVRW
  ld hl,ROTXT
  call PUTS

SHVRW:
  call PUTCRLF

SHVN:
  pop bc
  inc c
  ld a,c
  cp MAXDRV
  jr c,SHV
  ret

; Pack allocation-vector slots down from
; WSBASE using MOUNT's valid DPBs and
; MNTDRV. Store each base at DPH+14.
; Skipped allocation words retain
; cold-zero state. Fix slot sizes before
; RESEL so compatible remounts do not
; resize the TPA. Reserve three bytes
; below the vectors for STUBAD. PZINIT
; emits the jump later. Change
; AF/BC/DE/HL.

ALVINIT:
  ld hl,WSBASE

  ld (STUBAD),hl
  ld c,0

; With nonzero MNTDRV, allocate 256
; bytes for every drive below that
; count, mounted or not. With zero
; MNTDRV, enter ALV10 for mounted-only
; sizing. Save each DPH pointer for its
; allocation word.

ALVNX:
  ld a,c
  call DPHADR
  ld de,10
  add hl,de
  push hl
  ld a,(MNTDRV)
  or a
  jr z,ALV10
  ld b,a
  ld a,c
  cp b
  jr nc,ALVNO
  ld de,256
  jr ALVPUT

; For zero MNTDRV, allocate only mounted
; drives. Size each vector from its DPB
; as DSM/8+1 bytes.

ALV10:
  ld a,c
  call DRVENT
  ld a,(hl)
  or a
  jr z,ALVNO
  pop hl
  push hl
  ld e,(hl)
  inc hl
  ld d,(hl)
  ld hl,5
  add hl,de
  ld e,(hl)
  inc hl
  ld d,(hl)
  ld b,3

ALVSH:
  srl d
  rr e
  djnz ALVSH
  inc de

; Record DRVSLOT: 0 none, 1 small (64
; bytes), 2 large (256 bytes). Slots are
; fixed before retained selection is
; restored.

ALVPUT:
  ld hl,DRVSLOT
  ld b,0
  add hl,bc
  ld a,d
  inc a
  ld (hl),a

  ld hl,(STUBAD)
  or a
  sbc hl,de
  ld (STUBAD),hl
  ex de,hl
  pop hl
  inc hl
  inc hl
  inc hl
  inc hl
  ld (hl),e
  inc hl
  ld (hl),d
  jr ALVSKP

ALVNO:
  pop hl

ALVSKP:
  inc c
  ld a,c
  cp MAXDRV
  jr c,ALVNX
  ld hl,(STUBAD)
  dec hl
  dec hl
  dec hl
  ld (STUBAD),hl
  ret

; Jump here with SDINIT/MOUNT error A:
; SDE*=01h..0Fh, ME*=20h..2Fh. Run on
; STKTOP, leaving the BIOS stack for
; warm boot (KE-173). Save the code
; across LCD3/PUTS, then print it and
; CR/LF. Read and echo keys as typed.
; Only R/r retries COLDRT, which resets
; SP and LCD before card/mount setup.
; Other keys reprompt. Never returns.

DIAG:
  push af
  ld hl,DGCARD
  call LCD3
  ld hl,DGERR
  call PUTS
  pop af
  call PUTHEX
  call PUTCRLF

DGLOOP:
  ld hl,DGPROM
  call PUTS
  call BCONIN
  push af
  call PUTA
  call PUTCRLF
  pop af
  and $DF        ; test only (KE-195)
  cp 'R'
  jp z,COLDRT
  jr DGLOOP
