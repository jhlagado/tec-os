; Prompt history occupies HRING in
; EXPAND1. Cold boot clears the ring.
; Warm reset retains its head and
; contents. HFLAG restricts ^W/^N and
; storage to prompt input. Program
; function 10 treats ^W/^N as
; characters.
; Zero-ended lines grow forward with L
; wrapping inside the page. HHEAD and
; HHEAD-1 are zero. Storage rejects
; embedded zeros and exact newest-line
; duplicates. After writing, clear the
; overwritten oldest fragment through
; its first old zero.

HRING EQU $BD00

; H=HRING high byte, L=ring offset. HPUT
; writes A and returns readback, HGET
; reads A. Preserve BC/DE/HL. F is not a
; test of returned A.
; Save BC and sampled maskable IFF
; before mapping LATCHV OR LATEXP into
; 8000h..BFFFh (EXPAND1). No stack
; access occurs while mapped. Restore
; the LATCHV shadow before pops and
; conditional EI. This is not a physical
; latch snapshot or an NMI exclusion.

HPUT:
  push bc
  ld b,a
  ld c,1
  jr HACC

HGET:
  push bc
  ld c,0

HACC:
  call IFFGET
  di
  push af
  ld a,(LATCHV)
  or LATEXP
  out (SYSLAT),a
  dec c
  jr nz,HACC1
  ld (hl),b

HACC1:
  ld b,(hl)
  ld a,(LATCHV)
  out (SYSLAT),a
  pop af
  jp po,HACC2
  ei

HACC2:
  ld a,b
  pop bc
  ret

; Find the first byte of the line ending
; at L. An empty line leaves L
; unchanged. Wrap within the ring page
; until the preceding zero sentinel.
; Changes AF/HL.

HSTART:
  dec l
  call HGET
  inc l
  or a
  ret z
  dec l
  jr HSTART

; Recall prompt history for C=^W/^N.
; HPOS is the shown line's terminator,
; or HHEAD when no entry is shown. For
; ^N, enter HRNEW. For ^W, move to the
; preceding line. Do nothing at the
; oldest empty boundary. Changes
; AF/BC/DE/HL and rendering state.

HREC:
  ld h,HRING>>8
  ld a,(HPOS)
  ld l,a
  ld a,c
  cp CTRLN
  jr z,HRNEW
  call HSTART
  dec l
  dec l
  call HGET
  inc l
  or a
  ret z
  jr HRSHOW

; ^N at HHEAD leaves typed input
; unchanged. Otherwise find the next
; terminator. Passing the newest line
; selects HHEAD and clears the logical
; line. It does not restore an abandoned
; draft.

HRNEW:
  ld a,(HHEAD)
  cp l
  ret z

HRNEW1:
  inc l
  call HGET
  or a
  jr nz,HRNEW1

; Save the selected terminator in HPOS
; and find its first byte. Preserve that
; ring pointer across LINERASE, which
; resets logical count/pointer and emits
; BS SPACE BS for each counted byte. It
; does not wipe the old buffer.

HRSHOW:
  ld a,l
  ld (HPOS),a
  call HSTART
  push hl
  call LINERASE
  pop hl

; Copy recalled bytes until HPOS or the
; logical line limit. Adjacent
; LINMAX/LINCNT load as C=limit,
; B=count. Save ring HL across buffer
; writes and ECHOCHAR, then advance L
; with page wrap. No terminator is
; copied. LINDONE publishes the count
; later.

HRCOPY:
  ld a,(HPOS)
  cp l
  ret z

  ld bc,(LINMAX)
  ld a,c
  cp b
  ret z
  call HGET
  ld c,a
  push hl
  ld hl,(LINPTR)
  ld (hl),c
  inc hl
  ld (LINPTR),hl
  ld hl,LINCNT
  inc (hl)
  call ECHOCHAR
  pop hl
  inc l
  jr HRCOPY

; Store prompt input from DE with
; positive B=1..127. Reject embedded
; zero or an exact newest-line
; duplicate. Preserve C. Changes AF/HL,
; and B/DE only when stored. HHEAD-1
; locates the newest terminator before
; comparison.

HSTORE:
  ld h,HRING>>8
  ld a,(HHEAD)
  dec a
  ld l,a
  call HSTART
  push de
  push bc
  ld c,0

; Check all B bytes for embedded zero
; even after a mismatch. Positive B<=127
; keeps mismatch count C from wrapping.
; Reject a duplicate only if every byte
; matches and L reaches the newest
; terminator. Restore saved DE/BC before
; storing at HHEAD.

HSCMP:
  ld a,(de)
  or a
  jr z,HSKEEP
  call HGET
  ex de,hl
  cp (hl)
  ex de,hl
  jr z,HSCMP1
  inc c

HSCMP1:
  inc de
  inc l
  djnz HSCMP
  ld a,(HHEAD)
  dec a
  sub l
  or c
  jr z,HSKEEP
  pop bc
  pop de
  ld a,(HHEAD)
  ld l,a

; Write exactly B bytes, advancing DE
; and ring L. Append zero and publish
; HHEAD only after the full line.
; Continue into HSCLR to clear the
; overwritten oldest fragment.

HSPUT:
  ld a,(de)
  call HPUT
  inc de
  inc l
  djnz HSPUT
  xor a
  call HPUT
  inc l
  ld a,l
  ld (HHEAD),a

; At the new head, save each old byte in
; B before replacing it with zero. HPUT
; preserves B. Stop after clearing the
; first old zero, leaving the head empty
; and no stale oldest fragment.

HSCLR:
  call HGET
  ld b,a
  xor a
  call HPUT
  inc l
  or b
  jr nz,HSCLR
  ret

; Reject storage by restoring saved
; BC/DE. Ring contents and HHEAD stay
; unchanged. AF/HL may change.

HSKEEP:
  pop bc
  pop de
  ret
