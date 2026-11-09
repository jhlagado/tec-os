; TEC-1G hardware diagnostics for
; TEC-OS: a RAM program that MON3 loads
; and runs at 4000h
; (docs/diagnostics.md). Include order
; is assembly order: variables from
; 1000h, then code and tables from
; 4000h. TEC-OS's SD driver and VDP
; probe are included from src/, not
; copied.

%INCLUDE "gen/config.asm"
%INCLUDE "defs.asm"
%INCLUDE "vars.asm"
%INCLUDE "main.asm"
%INCLUDE "report.asm"
%INCLUDE "math.asm"
%INCLUDE "sdcard.asm"
%INCLUDE "sdtests.asm"
%INCLUDE "sdwrite.asm"
%INCLUDE "sdvol.asm"
%INCLUDE "memory.asm"
%INCLUDE "devices.asm"
%INCLUDE "../src/sd.asm"
%INCLUDE "../src/tms.asm"
%INCLUDE "gen/fmt.asm"

; The first byte after the program: free
; RAM for the RAM and PROTECT checks.

PROGEND:
