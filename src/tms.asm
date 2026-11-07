; PICO9918 presence probe. BEh is VRAM
; data, BFh control. Console and
; graphics entries are in pico.asm.


; Probe VRAM 3FFFh with 5Ah then A5h.
; First mismatch returns NZ. Z means
; both matched at that one address, not
; full-device conformance. Cold caller
; has executed DI. Overwrites the byte.
; Changes AF/B.

TMSINIT:
  ld a,$5A       ; Complementary
                 ; patterns.
  call TMSTRY
  ret nz
  ld a,$A5

; Write pattern A to VRAM 3FFFh and read
; it back. Return A=readback, B=pattern,
; flags from CP B. Keeps C, DE, HL and
; I. Raw pairs have no local interrupt
; guard. VRAM and address/prefetch state
; are not restored.

TMSTRY:
  ld b,a
  ld a,$FF
  out (VDPCTL),a
  ld a,$3F+$40
  out (VDPCTL),a
  ld a,b
  out (VDPDAT),a
  ld a,$FF
  out (VDPCTL),a
  ld a,$3F
  out (VDPCTL),a
  in a,(VDPDAT)
  cp b
  ret
