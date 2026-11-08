  ORG $C000

; At reset, latch 00h maps the first
; 2 KiB of ROM at 0000h. This jump
; leaves for RSTENT in the ROM.
; Its 0002h test selects COLD at reset,
; WBOOTR for normal entry into C000h.
; Both execute DI, then select the
; classic bank with the overlay off.
; DI does not mask NMI.

RESET:
  jp RSTENT
