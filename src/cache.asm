; Thirty 512-byte cache lines occupy
; EXPAND 1 at 8000h..BBFFh. Four-byte
; absolute card-block tags start at
; BC00h. Dirty bytes start at BC80h.
; FFFFFFFFh means empty. Volume reads
; use the cache. The logged drive,
; BOOTDRV, is written behind. Other
; volumes coalesce. Write-behind lines
; are written for a directory write,
; all-dirty allocation, explicit flush,
; a console read, a drive change, warm
; boot or mount change. Outer API
; entry also attempts one eligible
; first-dirty line through HKENTER.
; Nested operations inherit context.
; Mapped intervals use no stack. Callers
; must provide safe bank/interrupt
; state. BIOS CDI/CEI disables and
; restores maskable interrupts. DI does
; not exclude NMI.

; CTAB, CDIRTY and NLINES are declared
; in layout.asm.

; CTADR takes line A<64 and returns HL
; at its four-byte CTAB tag. CTENT takes
; page offset A and returns HL there.
; CTAB is page-aligned. Both enter CXON,
; which returns A=LATCHV OR LATEXP for
; the caller to output. Change F. CXON
; alone keeps HL.

CTADR:
  add a,a
  add a,a

CTENT:
  ld l,a
  ld h,CTAB>>8

CXON:
  ld a,(LATCHV)
  or LATEXP
  ret

; Find 32-bit SDLBA in the tags. Return
; Z with A=line on a hit or NZ without a
; line on a miss. Restore latch from
; LATCHV. Change AF/BC/DE/HL. Lookup
; leaves CNEXT and recency unchanged.

CLOOK:
  ld de,(SDLBA)
  ld bc,(SDLBA+2)
  xor a
  call CTENT
  out (SYSLAT),a

CLK1:
  ld a,(hl)
  cp e
  jr nz,CLK2
  inc l
  ld a,(hl)
  cp d
  jr nz,CLK2
  inc l
  ld a,(hl)
  cp c
  jr nz,CLK2
  inc l
  ld a,(hl)
  cp b
  jr z,CLK3

CLK2:
  ld a,l
  or 3
  inc a
  ld l,a
  cp NLINES*4
  jr c,CLK1
  or a           ; miss: NZ

CLK3:
  ld a,(LATCHV)
  out (SYSLAT),a
  ret nz         ; miss: no line
  ld a,l
  rrca
  rrca
  and $3F
  cp a
  ret

; CSET tags valid line A with SDLBA.
; CDROP tags it FFFFFFFFh. Both clear
; its dirty byte, keep A and return Z.
; Change F/BC/DE/HL. Restore LATCHV
; before popping the saved line.

CSET:
  ld de,(SDLBA)
  ld bc,(SDLBA+2)
  jr CENT

CDROP:
  ld de,$FFFF
  ld b,d
  ld c,e

CENT:
  push af
  call CTADR
  out (SYSLAT),a
  ld (hl),e
  inc l
  ld (hl),d
  inc l
  ld (hl),c
  inc l
  ld (hl),b
  ld a,(LATCHV)
  out (SYSLAT),a
  pop af

CDCLR:
  ld c,0
  call CDPUT
  jp HKDEL

; Valid line A: CDGET reads its dirty
; byte, CDSET writes 1 and CDCLR writes
; 0. CDPUT writes C unless C=FFh, the
; read-only sentinel. Keep A/DE. Return
; Z for clean, NZ for dirty. Change
; F/BC/HL and restore LATCHV.

CDGET:
  ld c,$FF
  jr CDPUT

CDSET:
  ld c,1
  call CDPUT
  jp HKADD

CDPUT:
  push af

  add a,CDIRTY-CTAB
  call CTENT
  out (SYSLAT),a
  ld a,c
  inc a
  jr z,CDP1
  ld (hl),c

CDP1:
  ld b,(hl)
  ld a,(LATCHV)
  out (SYSLAT),a
  pop af
  inc b
  dec b
  ret

; Valid line A returns HL=8000h+512*A.
; Change AF. BC/DE stay intact. This
; calculation does not switch banks.

CLADR:
  add a,a
  add a,$80
  ld h,a
  ld l,0
  ret

; Fill valid line A from SDLBA via
; SDREAD with SDXB=LATEXP. Restore
; SDXB=0 afterwards for transfers in
; the program's memory view. Success
; tags it clean and returns Z with
; A=line. Failure drops it and returns
; NZ with A=line OR 1.
; Change BC/DE/HL/F. A full payload read
; also sets I=0.

CFILL:
  push af
  call CLADR
  ld a,LATEXP
  ld (SDXB),a
  call SDREAD
  push af
  xor a
  ld (SDXB),a
  pop af
  jr nz,CFL9
  pop af
  jr CSET

CFL9:
  pop af
  call CDROP
  or 1
  ret

; Write line A to the block in its tag
; using SDWRITE with SDXB=LATEXP. Then
; reset SDXB=0 so later transfers use
; the program's memory view. MAPREC
; rebuilds SDLBA/BLKOFF/BLKSLOT from
; the current BIOS request. Keep A and
; return the saved SDWRITE Z result.
; Success clears dirty state. Failure
; leaves it dirty. Changes BC/DE/HL/F.

CWRITE:
  push af
  call CTADR
  out (SYSLAT),a
  ld e,(hl)
  inc l
  ld d,(hl)
  inc l
  ld c,(hl)
  inc l
  ld b,(hl)
  ld a,(LATCHV)
  out (SYSLAT),a
  ld (SDLBA),de
  ld (SDLBA+2),bc
  pop af
  push af
  call CLADR
  ld a,LATEXP
  ld (SDXB),a
  call SDWRITE
  push af
  xor a
  ld (SDXB),a
  call MAPREC
  pop bc
  pop af
  bit 6,c
  jr z,CWR9
  call CDCLR
  cp a
  ret

CWR9:
  ld c,a
  ld a,(HKERR)
  or a
  jr nz,CWRERR
  inc a
  ld (HKERR),a
CWRERR:
  xor a
  inc a
  ld a,c
  ret

; A bounded first-dirty pass tries each queued line once. CFLUSH skips
; line A; NLINES means none. CFLALL is the same no-exclusion pass for warm
; boot. Failures stay dirty and queued. Return A=excluded and Z only when
; every attempted write succeeds. Changes BC/DE/HL/F. Directory callers
; exclude their unpublished metadata until all data prerequisites succeed.

CFLALL:
  ld a,NLINES

CFLUSH:
  push af
  call HKRESET
  pop af
  ld c,a
  ld b,0
CFS1:
  ld a,(HKRPOS)
  ld hl,HKRLEN
  cp (hl)
  jr nc,CFSEND
  ld e,a
  ld d,0
  ld hl,HKROUND
  add hl,de
  ld a,(hl)
  ld hl,HKRPOS
  inc (hl)
  cp $FF
  jr z,CFS1
  cp c
  jr z,CFS1
  push bc
  call CWRITE
  pop bc
  jr z,CFS1
  inc b
  jr CFS1
CFSEND:
  ld a,c
  inc b
  dec b
  ret

; Take the first clean line cyclically from CNEXT. When all are dirty,
; make one bounded first-dirty pass, then use any clean slot it freed.
; Retain every failed line; if none can be freed return NZ and advance
; CNEXT. Successful allocation returns Z with A=line. The caller fills/tags
; it. Changes AF/BC/DE/HL; writeback restores the current BIOS mapping.

CTAKE:
  call CTSCAN
  jr nz,CTK5
  call HKRESET

; Pressure needs no exclusion or
; aggregate result. Tail-writing each
; frozen entry keeps the public volume
; services within their caller stack.

CTPASS:
  ld a,(HKRPOS)
  ld hl,HKRLEN
  cp (hl)
  jr nc,CTDONE
  call HKONE
  jr CTPASS

CTDONE:
  call CTSCAN
  jr nz,CTK5
  call CTK5
  or 1
  ret

; Return A=line and NZ for a clean slot. If none exists, A is the
; replacement cursor and Z is set. No dirty line is discarded.
CTSCAN:
  ld b,NLINES
  ld a,(CNEXT)
  add a,CDIRTY-CTAB
  call CTENT
  out (SYSLAT),a
CTK1:
  ld a,(hl)
  or a
  jr z,CTK3
  inc l
  ld a,l
  cp CDIRTY-CTAB+NLINES
  jr c,CTK2
  ld l,CDIRTY-CTAB
CTK2:
  djnz CTK1
CTK3:
  ld a,(LATCHV)
  out (SYSLAT),a
  ld a,l
  sub CDIRTY-CTAB
  inc b
  dec b
  ret

CTK5:
  ld e,a
  inc a
  cp NLINES
  jr c,CTK4
  xor a

CTK4:
  ld (CNEXT),a
  ld a,e
  cp a
  ret

; Valid line A and BLKSLOT=0..3 locate
; its record. CRECAD returns that
; address in HL and changes AF. CRDREC
; copies 128 bytes to DSKDMA in bank 0.
; CWRREC copies from DSKDMA to the
; cache. Both set adjacent XMDST/XMSRC
; and tail-enter MVCOPY. DSKDMA is a
; valid bank-0 buffer used only during
; the call.

CRECAD:
  call CLADR

  ld a,(BLKSLOT)
  srl a
  rr l
  add a,h
  ld h,a
  ret

CRDREC:
  call CRECAD
  ex de,hl
  ld hl,(DSKDMA)
  ld bc,$0100
  jr CREC

CWRREC:
  call CRECAD
  ld de,(DSKDMA)
  ld bc,$0001

CREC:
  ld (XMDST),bc
  ld bc,128
  jp MVCOPY

; Read mapped SDLBA/BLKSLOT to valid
; DSKDMA. A hit copies its line. A miss
; takes and fills a line first,
; returning NZ on either failure. Only
; success copies the record and returns
; A=0/Z. Change BC/DE/HL/F. A full cache
; fill also sets I=0. BREAD/CDI supplies
; bank/interrupt discipline.

CREAD:
  call CLOOK
  jr z,CRD1
  call CTAKE
  ret nz
  call CFILL
  ret nz

CRD1:
  call CRDREC
  xor a
  ret

; BWRITE supplies the mapped request,
; valid DSKDMA and CWTYPE. Bits 0/1
; encode 0 data, 1 directory, 2 new
; allocation. C=0 retains old bytes,
; reading on a miss. C=1 permits
; zero-fill even on a hit. Return Z on
; success, NZ on error. Change
; AF/BC/DE/HL. A full cache pre-read
; sets I=0, even if a later write fails.

CWRBH:
  push bc
  call CLOOK
  pop bc
  jr z,CWB1
  push bc
  call CTAKE
  pop bc
  ret nz
  inc c
  dec c
  jr z,CWBF

; C=1 clears all 512 bytes, including a
; hit. No stack access while mapped.
; GETKEY records the cleared block.
; Retag a clean slot, but preserve a
; dirty hit's queue and round position.

CWB1:
  dec c
  jr nz,CWBK
  call CDGET
  push af
  call CLADR
  call CXON
  out (SYSLAT),a
  ld d,h
  ld e,l
  inc de
  ld bc,511
  ld (hl),0
  ldir
  ld a,(LATCHV)
  out (SYSLAT),a
  ld c,2
  call GETKEY
  pop af
  call z,CSET
  jr CWB2

CWBF:
  call CFILL
  ret nz

; Keep the no-pre-read key only for its
; own BLKOFF/BUFBLK and DSKCUR/BUFDRV.
; Another retained block invalidates it
; so a later continuation cannot clear
; already written records (KE-AR7).

CWBK:
  ld c,a

  ld hl,(BLKOFF)
  ld de,(BUFBLK)
  or a
  sbc hl,de
  jr nz,CWBK0
  ld a,(BUFDRV)
  ld hl,DSKCUR
  cp (hl)
  jr z,CWBK1

CWBK0:
  xor a
  ld (BUFOK),a

CWBK1:
  ld a,c

; Copy the record before publishing
; dirty state. CWTYPE bit 5 makes the
; line the pending one. Otherwise type 1
; selects directory-last flush. Other
; writes, held behind, set CANY and
; return A=0/Z with data still dirty.

CWB2:
  push af
  call CWRREC
  pop af
  call CDSET
  ld c,a
  ld a,(CWTYPE)
  bit 5,a
  jr nz,CWCO
  rrca
  jr c,CWB3
  ld a,1
  ld (CANY),a    ; a line held behind
  xor a
  ret

CWCO:
  ld a,c
  inc a
  ld (CPEND),a
  xor a
  ret

; A directory write, on any drive:
; flush all other dirty cache lines
; first, and write this directory line
; last only after success, so no entry
; names data the card lacks. Failed
; data remains dirty for
; retry. Either error drops the current
; line and returns NZ with A=line OR 1.
; Card bytes may already have changed.

CWB3:
  ld a,c
  call CFLUSH
  call z,CWRITE
  ret z

CWBX:
  call CDROP
  or 1
  ret

; CPMOVE keeps the pending line when
; SDLBA is its block, else enters
; CPFLSH. CPFLSH writes the pending line
; if it is dirty. Success clears CPEND
; and returns Z with A=0. Failure keeps
; the line dirty and pending and returns
; NZ. Change AF/BC/DE/HL. CWRITE can
; remap the BIOS request.

CPMOVE:
  ld a,(CPEND)
  or a
  ret z
  call CLOOK
  jr nz,CPFLSH
  inc a
  ld hl,CPEND
  cp (hl)
  ret z

CPFLSH:
  ld a,(CPEND)
  or a
  ret z
  dec a
  call CDGET
  call nz,CWRITE
  ret nz
  xor a
  ld (CPEND),a
  ret

; Console input drains all held-behind data before waiting. A failed
; line remains queued; report pending/recovered retry state without changing
; the flush's result. CANY permits the cheaper pending-line path when only
; CPEND can be dirty. Return A=0/Z or A=1/NZ; keep DE.

CKEY:
  ld a,(CANY)
  or a
  jp z,CPOUT     ; none held behind
  push de
  call CDI
  ld a,NLINES    ; no line excluded
  call CFLUSH
  jr nz,CKY1     ; a line kept
  xor a
  ld (CANY),a

CKY1:
  pop de
  jp BRET

; CPOUT is CPFLSH for BDOS callers, with
; CDI/CEI around it. Return A=0/Z, or
; A=1/NZ when the write failed. Keep DE.

CPOUT:
  ld a,(CPEND)
  or a
  ret z
  push de
  call CDI
  call CPFLSH
  pop de
  jp BRET

; Warm boot attempts every pending line and retains failures for retry.
; Failure drops the rest of a chained command, never the cached data. The
; private reporter keeps console callbacks from recursively servicing work.
; Flags do not encode the flush result on return.

CWBOOT:
  call CFLALL
  jr z,CWBNOTE
  ld a,2         ; the rest is dropped
  ld (CHPOS),a
CWBNOTE:
  jp HKREPORT

CEND:

; Copy BC bytes forward from DE to HL.
; XMSRC/XMDST: 0 is the program's view,
; 1 is EXPAND 1. Zero count returns A=0
; without setup. Otherwise keep sampled
; maskable IFF and alternate BC/DE.
; Restore latch from LATCHV. Return
; A=0/Z/carry clear with pointers
; advanced. BC/F and MVREST may change.
; Other alternates and IX/IY stay
; intact.

MVCOPY:
  ld a,b
  or c
  ret z          ; A=0, as MVOK
  call IFFGET
  di
  push af
  exx
  push bc
  push de
  ld c,SYSLAT
  ld a,(LATCHV)
  ld d,a
  ld e,a
  ld a,(XMSRC)
  or a
  jr z,MV1
  set 2,d

MV1:
  ld a,(XMDST)
  or a
  jr z,MV2
  set 2,e

MV2:
  ld a,d
  cp e
  exx
  jr z,MVLDIR
  push hl
  ld a,(XMDST)
  or a
  jr z,MV3
  ld h,d
  ld l,e

; Differing views: a bank-0 start below
; 8000h gives
; prefix=min(BC,8000h-start). Copy it by
; LDIR in EXPAND 1 view. MVREST holds
; the rest. A bank-0 start at or above
; 8000h uses the byte loop. Stack
; operations stay outside the
; hidden-bank interval.

MV3:
  push de
  ex de,hl
  ld hl,$8000
  or a
  sbc hl,de
  pop de
  jr c,MVNONE
  jr z,MVNONE
  sbc hl,bc
  jr c,MV4
  ld hl,0

MV4:
  add hl,bc
  push hl
  ld h,b
  ld l,c
  pop bc
  or a
  sbc hl,bc

  ld (MVREST),hl
  pop hl
  exx
  ld a,d
  or e
  out (c),a
  exx
  ex de,hl
  ldir
  ex de,hl
  exx
  ld a,d
  and e
  out (c),a
  exx

  ld bc,(MVREST)
  jr MVBYTE

MVNONE:
  pop hl

; A zero remainder bypasses the byte
; loop. Otherwise select source view,
; read, select destination view and
; write. Advance both pointers. The
; mapped loop uses no stack.

MVBYTE:
  ld a,b
  or c
  jr z,MVEND

MVBL:
  exx
  out (c),d
  exx
  ld a,(de)
  exx
  out (c),e
  exx
  ld (hl),a
  inc hl
  inc de
  dec bc
  ld a,b
  or c
  jr nz,MVBL
  jr MVEND

; Equal bank views use forward LDIR. The
; DE/HL exchanges preserve the public
; source/destination convention.

MVLDIR:
  exx
  out (c),d
  exx
  ex de,hl
  ldir
  ex de,hl

; Restore LATCHV before stack access.
; Pop alternate DE/BC and saved IFF
; flags, then enable maskable interrupts
; only if sampled on.

MVEND:
  ld a,(LATCHV)
  out (SYSLAT),a
  exx
  pop de
  pop bc
  exx
  pop af

  jp po,MVOK
  ei

MVOK:
  xor a
  ret
