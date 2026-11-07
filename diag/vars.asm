; Diagnostics variables at 7E00h; the stack is 7F00h-7FFFh. Nothing here is
; initialised by the image: the boot code clears this page after proving it.

        ORG     VARS
LATCHV: DS      1               ; shadow copy of the system latch
INTER:  DS      1               ; 1 when the interactive tests were chosen
REC:    DS      1               ; enables report copying while room remains
MTXON:  DS      1               ; startup sample of the Matrix switch
RPTP:   DS      2               ; next report byte; saturates at RPTEND
NCOUNT: DS      NRESULT         ; six result-code byte counts, modulo 256
NMICNT: DS      2               ; little-endian wrapping NMI count; not atomic
TID:    DS      1               ; current test number
TNAME:  DS      2               ; pointer to exactly seven test-name bytes
LCDCOL: DS      1               ; wrapping attempted column, even when clipped

; RAM test outcomes: status (0 pass, 1 fail, 2 not run), address, value
; written, value read.
RRLO:   DS      5
RRWIN:  DS      5
RRHOME: DS      5
RRBANK: DS      5
BANKMAP:DS      16              ; tag found for each bank field value
BANKBAD:DS      1               ; failing bank field only on the failure exit

DVD:    DS      4               ; 32-bit work: dividend and quotient
MULTD:  DS      4               ; multiplicand
OLDSEC: DS      1               ; RTC seconds being watched
SAVE:   DS      12              ; shared test scratch; sequential use required

; SD card state.
SDBYTE: DS      1               ; 1 when the card takes byte addresses
SDARG:  DS      4               ; command argument, big-endian
SDLBA:  DS      4               ; block address, little-endian
SDN0:   DS      1               ; CMD0 attempts
SDN41:  DS      2               ; ACMD41 attempts
SDR8:   DS      1               ; CMD8 R1
SDR7:   DS      4               ; CMD8 R7 payload
SDOCR:  DS      4               ; CMD58 OCR
SDTOK:  DS      2               ; last read token polls; stale on early failure
SDTMIN: DS      2
SDTMAX: DS      2
SDBAD:  DS      2               ; blocks that failed
SDTOT:  DS      4               ; SDRUN successful-read token-poll aggregate

VDPOK:  DS      1
SDOK:   DS      1               ; 1 when the card initialised
GLCOK:  DS      1
RTCOK:  DS      1
RTCORG: DS      8               ; seven pre-set registers + WP; seconds adjusted
RTCBUF: DS      7               ; registers read back after the set
RTCRB:  DS      7               ; and after the restore
SDBSY:  DS      2               ; success: polls through final nonzero card byte
VERR:   DS      2               ; VRAM bytes wrong

KSEEN:  DS      8               ; matrix keys seen, one bit each
PSEEN:  DS      3               ; keypad keys seen, one bit each
PRESS:  DS      1               ; keypad/NMI observation byte count, modulo 256
NUMBUF: DS      6               ; reserved; GETNUM accumulates in HL/B, not here
VARSEND:
