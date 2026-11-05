  ORG $C000

; At reset the latch is 00h, so the
; first 2 KiB of this image also appear
; at 0000h. The CPU runs this jump there
; and leaves for RSTENT, in the ROM
; proper, which tells a reset from a
; program run into C000h and goes on to
; COLD, which turns the overlay off.
; Interrupts are off until then.

RESET:
  jp RSTENT      ; from the overlay at
                 ; 0000h into the ROM
