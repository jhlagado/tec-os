; At reset the latch is 00h, so the first 2 KiB of this image also appear
; at 0000h. The CPU runs this jump there and leaves for COLD, in the ROM
; proper, which turns the overlay off. Interrupts are off until then.

        ORG     $C000
RESET:  JP      COLD
