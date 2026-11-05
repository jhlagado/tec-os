; The PICO9918 on the TEC-Deck video
; card: what the ROM keeps of it, the
; probe. Port BEh is VRAM data and BFh
; is control. The console and the
; graphics entries are the ROM's, in
; pico.asm.


; Whether VRAM answers with what was
; written, at its last address, with two
; patterns that between them test every
; bit. Returns Z when present. Destroys
; AF and B.

TMSINIT:
  ld a,$5A       ; alternating bits,
                 ; then their inverse
  call TMSTRY
  ret nz         ; one failure is enough
  ld a,$A5

; Write A to VRAM address 3FFFh and read
; it back: Z if it came back.

TMSTRY:
  ld b,a         ; the pattern, across
                 ; the addressing
  ld a,$FF       ; the address's low
                 ; byte, for both
                 ; directions
  out (VDPCTL),a
  ld a,$3F+$40   ; its high bits, and
                 ; the write flag
  out (VDPCTL),a
  ld a,b         ; the pattern goes to
                 ; VRAM
  out (VDPDAT),a
  ld a,$FF       ; the same address, to
                 ; read
  out (VDPCTL),a
  ld a,$3F       ; its high bits, with
                 ; no write flag
  out (VDPCTL),a
  in a,(VDPDAT)  ; what VRAM holds now
  cp b           ; Z: the VDP has it
  ret
