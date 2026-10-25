; Diagnostics variables at 7E00h; the stack is 7F00h-7FFFh. Nothing here is
; initialised by the image: the boot code clears this page after proving it.

        ORG     VARS
LATCHV: DS      1               ; shadow copy of the system latch
INTER:  DS      1               ; 1 when the interactive tests were chosen
REC:    DS      1               ; 1 while output is also copied to the report
MTXON:  DS      1               ; 1 when the Matrix switch is on
RPTP:   DS      2               ; next free report byte
NCOUNT: DS      NRESULT         ; results by code
NMICNT: DS      2               ; NMIs taken through 0066h
TID:    DS      1               ; current test number
TNAME:  DS      2               ; and its 7-character name
LCDCOL: DS      1               ; LCD column being written

; RAM test outcomes: status (0 pass, 1 fail, 2 not run), address, value
; written, value read.
RRLO:   DS      5
RRWIN:  DS      5
RRHOME: DS      5
RRBANK: DS      5
BANKMAP:DS      16              ; tag found for each bank field value
BANKBAD:DS      1               ; field value of the first failing bank

DVD:    DS      4               ; 32-bit work: dividend and quotient
MULTD:  DS      4               ; multiplicand
OLDSEC: DS      1               ; RTC seconds being watched
SAVE:   DS      12              ; scratch for one test at a time

; SD card state.
SDBYTE: DS      1               ; 1 when the card takes byte addresses
SDARG:  DS      4               ; command argument, big-endian
SDLBA:  DS      4               ; block address, little-endian
SDN0:   DS      1               ; CMD0 attempts
SDN41:  DS      2               ; ACMD41 attempts
SDR8:   DS      1               ; CMD8 R1
SDR7:   DS      4               ; CMD8 R7 payload
SDOCR:  DS      4               ; CMD58 OCR
SDTOK:  DS      2               ; token polls of the last read
SDTMIN: DS      2
SDTMAX: DS      2
SDBAD:  DS      2               ; blocks that failed
SDTOT:  DS      4               ; token polls in a timed run

VDPOK:  DS      1
SDOK:   DS      1               ; 1 when the card initialised
GLCOK:  DS      1
RTCOK:  DS      1
VERR:   DS      2               ; VRAM bytes wrong

KSEEN:  DS      8               ; matrix keys seen, one bit each
PSEEN:  DS      3               ; keypad keys seen, one bit each
PRESS:  DS      1               ; keypad presses
NUMBUF: DS      6               ; typed number
VARSEND:
