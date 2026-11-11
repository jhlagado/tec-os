; MON3.SVC: MON-3's graphics API for
; the 128x64 GLCD, RST 18h, included by
; mon3.asm.

; MON-3's graphics workspace: the
; buffer the drawing calls use, then
; their variables.

GBUF EQU $0A00   ; 128x64, a bit a pixel
GVEND EQU $0E1A  ; the variables' end
VPORT EQU $0E13  ; the buffer in use

; RST 18h: the graphics API, not built.

R18:
  pop hl         ; the caller's HL
  jp DERR        ; refused

; The workspace as every MON-3 reset
; leaves it, through initLCD: GBUF and
; the variables zero, VPORT at GBUF.
; CLRBUF zero is the session's choice,
; as no reset writes it. A holds 0.
; Clobbers BC, DE and HL.

GWS:
  ld hl,GBUF
  ld de,GBUF+1
  ld bc,GVEND-GBUF-1
  ld (hl),a      ; the first zero
  ldir           ; and the rest
  ld hl,GBUF
  ld (VPORT),hl  ; drawing into GBUF
  ret
