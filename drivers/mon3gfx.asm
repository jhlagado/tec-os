; MON3.SVC: MON-3's graphics API for
; the 128x64 GLCD, RST 18h, included by
; mon3.asm.

; RST 18h: the graphics API, not built.

R18:
  pop hl         ; the caller's HL
  jp DERR        ; refused
