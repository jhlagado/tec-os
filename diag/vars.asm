; Variables and buffers, from 1000h. The
; program's code and tables at
; 4000h-7FFFh may be write-protected, so
; everything written lives here. Nothing
; is set by the load: START clears this
; area.

  ORG $1000

VARS:

; TEC-OS's SD driver (src/sd.asm) keeps
; its state in these six names.

LATCHV:   DS    1
SDXB:     DS    1
SDBYTE:   DS    1
SDARG:    DS    4
SDLBA:    DS    4
SDERR:    DS    1

; MON3's latch state at the start, from
; its get calls, and the I register.

SVCAPS:   DS    1
SVSHD:    DS    1
SVPRT:    DS    1
SVEXP:    DS    1
SAVEI:    DS    1

; Report state: the current check's
; record, the totals and the digits.

CURCHK:   DS    2
NRES:     DS    4
DIGIT:    DS    1
SEGBUF:   DS    6
LCDBUF:   DS    21

; 32-bit work for the arithmetic.

M32A:     DS    4
M32B:     DS    4
M32R:     DS    4
M32T:     DS    4
NUM:      DS    4

; SD answers and margins. Counts are the
; polls used against TEC-OS's bounds.

SDOK:     DS    1
CIERR:    DS    1
INERR:    DS    1
CMD0N:    DS    1
R18:      DS    1
R7:       DS    4
R55:      DS    1
A41N:     DS    2
OCR:      DS    4
R1MAX:    DS    1
TOKMAX:   DS    4
WRSMAX:   DS    1
BSYMAX:   DS    4
CSDOK:    DS    1
CSD:      DS    16
CID:      DS    16
CARDBLK:  DS    4
LASTBLK:  DS    4
ERRS:     DS    2
ERRBLK:   DS    4
ERRCODE:  DS    1
RNGN:     DS    1
COUNT:    DS    4
SECS:     DS    1
SECN:     DS    1
NBLK:     DS    2
BSYN:     DS    2

; The container check (SD7) and the
; free area the write test may use.

SD7OK:    DS    1
CTCODE:   DS    1
CTIDX:    DS    1
CTCNT:    DS    1
CTMIN:    DS    1
CTDRV:    DS    1
CTSEEN:   DS    1
CTHB:     DS    4
CTPRV:    DS    4
CTEND:    DS    4
CTBUF:    DS    1
DESC:     DS    2
FREE0:    DS    4
FREEL:    DS    4
BLK:      DS    4
WRFAIL:   DS    2
WRN:      DS    2
WRB:      DS    2
WRTRY:    DS    1
WRSTEP:   DS    1
WRAT:     DS    2
RSTEP:    DS    1
RCODE:    DS    1
S9OR:     DS    1
S9OI:     DS    1
S9IN:     DS    1
S9RD:     DS    1
S9SM:     DS    1
K07:      DS    1
SPOT:     DS    1
THIS07:   DS    1
RDF07:    DS    1
S8STOP:   DS    1
S3ST:     DS    1
S5ST:     DS    1
CCSBAD:   DS    1
ENTSP:    DS    2
MIBV:     DS    4
CLSNM:    DS    2
S4ST:     DS    1

; Memory, clock and device checks.

MTBEG:    DS    2
MTLEN:    DS    2
FAILAD:   DS    2
FAILW:    DS    1
FAILR:    DS    1
PSAVE:    DS    1
PRON:     DS    1
PROFF:    DS    1
SH0:      DS    2
SH1:      DS    2
SHM:      DS    2
RTCOK:    DS    1
OLDSEC:   DS    1
CLKOK:    DS    1
CLKHZ:    DS    4
CLKN:     DS    2
FRMT:     DS    4
RTCBUF:   DS    8
VDPOK:    DS    1
INTCNT:   DS    1
NMICNT:   DS    1
SAVINT:   DS    2
SAVNMI:   DS    2
KMAP:     DS    8
NPAD:     DS    1
NMTX:     DS    1

; Three block buffers: BUFS keeps a
; block's saved contents in SD8.

BUFA:     DS    512
BUFB:     DS    512
BUFS:     DS    512

; Block 0 as SD7 validated it, for SD8's
; alias checks.

REF0:     DS    512

; The program's own stack, 256 bytes,
; which the RAM check does not touch: it
; tests from VARSEND.

STACK:    DS    256

STKTOP:

VARSEND:
