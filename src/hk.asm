; Dirty lines keep their first-dirty order. A frozen round contains cache
; line numbers; deleting a line invalidates its old round entry before the
; line can be reused. New arrivals join the next round.

HKADD:
  push af
  push de
  ld e,a
  ld hl,HKQ
  ld a,(HKCNT)
  ld b,a
  or a
  jr z,HKAPP
HKA1:
  ld a,(hl)
  cp e
  jr z,HKAEND
  inc hl
  djnz HKA1
HKAPP:
  ld (hl),e
  ld hl,HKCNT
  inc (hl)
HKAEND:
  pop de
  pop af
  ret

HKDEL:
  push af
  push de
  ld e,a
  ld a,(HKCNT)
  or a
  jr z,HKDEND
  ld b,a
  ld hl,HKQ
HKD1:
  ld a,(hl)
  cp e
  jr z,HKFOUND
  inc hl
  djnz HKD1
  jr HKDEND
HKFOUND:
  dec b
  jr z,HKDEC
HKSHIFT:
  inc hl
  ld a,(hl)
  dec hl
  ld (hl),a
  inc hl
  djnz HKSHIFT
HKDEC:
  ld hl,HKCNT
  dec (hl)
  jr nz,HKINVAL
  xor a
  ld (CANY),a
  ld (CPEND),a
HKINVAL:
  ld a,(HKRLEN)
  or a
  jr z,HKDEND
  ld b,a
  ld hl,HKROUND
HKDI:
  ld a,(hl)
  cp e
  jr nz,HKDIN
  ld (hl),$FF
HKDIN:
  inc hl
  djnz HKDI
HKDEND:
  pop de
  pop af
  ret

; Try one eligible line. A failed line stays queued; the frozen round is
; nevertheless advanced, so it cannot starve other work or be postponed
; indefinitely by new arrivals. Caller provides maskable/bank exclusion.

HKONE:
  ld a,(HKCNT)
  or a
  ret z
HKPICK:
  ld a,(HKRPOS)
  ld hl,HKRLEN
  cp (hl)
  jr c,HKREADY
  call HKRESET
HKREADY:
  ld e,a
  ld d,0
  ld hl,HKROUND
  add hl,de
  ld a,(hl)
  ld hl,HKRPOS
  inc (hl)
  cp $FF
  jr z,HKPICK
  jp CWRITE

; Snapshot current first-dirty order for a bounded complete pass. The
; caller excludes a directory line when its data prerequisites are pending.
HKRESET:
  xor a
  ld (HKRPOS),a
  ld a,(HKCNT)
  ld (HKRLEN),a
  or a
  ret z
  ld c,a
  ld b,0
  ld hl,HKQ
  ld de,HKROUND
  ldir
  xor a
  ret

; Mark public nesting before service. Explicit private safe points share
; the worker without pretending that the BDOS is generally reentrant.
HKENTER:
  push af
  ld a,(HKDEP)
  inc a
  ld (HKDEP),a
  dec a
  jr z,HKCHECK
HKNOACT:
  pop af
  ret

HKPOINT:
  push af
HKCHECK:
  ld a,(HKBUSY)
  or a
  jr nz,HKNOACT
  ld a,(HKCNT)
  or a
  jr nz,HKDO
  ld a,(HKERR)
  or a
  jr z,HKNOACT
HKDO:
  ld a,1
  jr HKWORK

HKLEAVE:
  push af
  ld a,(HKDEP)
  or a
  jr z,HKNOACT
  dec a
  ld (HKDEP),a
  jr HKNOACT

HKREPORT:
  push af
  ld a,(HKERR)
  or a
  jr z,HKNOACT
  ld a,(HKBUSY)
  or a
  jr nz,HKNOACT
  xor a
  jr HKWORK

HKSERV:
  push af
  ld a,1
HKWORK:
  ld (HKSP),sp
  ld sp,HKSTKT
  push bc
  push de
  push hl
  push ix
  push iy
  push af
  ld a,1
  ld (HKBUSY),a
  call CDI
  pop af
  or a
  call nz,HKONE
  call CEI
  call HKNOTICE
  xor a
  ld (HKBUSY),a
  pop iy
  pop ix
  pop hl
  pop de
  pop bc
  ld sp,(HKSP)
  pop af
  ret

; Report one pending warning per failure episode, then acknowledge a
; recovered retry. These messages describe cache writes, not file closure
; or browser persistence. Silent returned-error mode defers the notice.
; Console callbacks return normally and retain the logical caller's BDOS
; reentry restriction even though this worker owns the physical stack.
; No public API return registers are borrowed.
HKNOTICE:
  ld a,(ERRMODE)
  inc a
  ret z
  ld a,(HKERR)
  or a
  ret z
  ld a,(HKCNT)
  or a
  jr z,HKNOK
  ld a,(HKERR)
  dec a
  ret nz
  ld a,2
  ld (HKERR),a
  ld hl,CWMSG
  jp PUTS
HKNOK:
  ld a,(HKERR)
  dec a
  ld hl,HKERRMSG
  jr z,HKNCLR
  ld hl,HKOKMSG
HKNCLR:
  xor a
  ld (HKERR),a
  jp PUTS

; The outer hardware/BIOS handler used the original return slot. Restore
; its PC without borrowing result registers or adding a handler stack word.
HKAPIRET:
  call HKLEAVE
  push hl
  ld hl,(APIRTPC)
  ex (sp),hl
  ret

; Nested BIOS entries tail-enter their original handler under the existing
; logical operation. An outer entry replaces its caller return with HKAPIRET.
; HKSP is scratch only after entry service has returned and before handler
; dispatch; this short setup makes no callback or internal service point.
HKBENTER:
  push af
  ld a,(HKDEP)
  or a
  jr nz,HKBINEST
  ld a,(HKBUSY)
  or a
  jr nz,HKBINEST
  pop af
  call HKENTER
  ex (sp),hl
  ld (HKSP),hl
  pop hl
  ex (sp),hl
  ld (APIRTPC),hl
  ld hl,HKAPIRET
  ex (sp),hl
  push hl
  ld hl,(HKSP)
  ex (sp),hl
  ret
HKBINEST:
  pop af
  ret

; The RAM BIOS table still targets these wrappers, preserving installed
; hooks and the original handler labels for a hook's normal call-through.

HKBI2:
  call HKBENTER
  jp BCONSTC

HKBI3:
  call HKBENTER
  jp BCONIN

HKBI4:
  call HKBENTER
  jp BCONOUT

HKBI5:
  call HKBENTER
  jp BLIST

HKBI6:
  call HKBENTER
  jp BPUNCH

HKBI7:
  call HKBENTER
  jp BREADER

HKBI8:
  call HKBENTER
  jp BHOME

HKBI9:
  call HKBENTER
  jp BSELDSK

HKBI10:
  call HKBENTER
  jp BSETTRK

HKBI11:
  call HKBENTER
  jp BSETSEC

HKBI12:
  call HKBENTER
  jp BSETDMA

HKBI13:
  call HKBENTER
  jp BREAD

HKBI14:
  call HKBENTER
  jp BWRITE

HKBI15:
  call HKBENTER
  jp BLISTST

HKBI16:
  call HKBENTER
  jp BSECTRN
