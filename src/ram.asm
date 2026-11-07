; Resident workspace in the classic
; bank. The lower region ends at
; RAMBIOS. High state follows its
; 51-byte BIOS table. DS bytes are not
; initialised by the ROM image.
; Cold boot clears WSBASE..WSEND. Warm
; CPMINIT clears CCPCLR..BDOSRME, sets
; CMDBUF's size and invalidates BUFOK.
; Other warm work can update kept state.

  ORG WSBASE

; BIOS disk selection and mapped record.

DSKCUR: DS 1     ; selected drive
DSKTRK: DS 2
DSKSEC: DS 2
DSKDMA: DS 2
BLKOFF: DS 2     ; volume-relative block

BLKSLOT:
  DS 1           ; 128-byte slot, 0-3

; BWRITE's no-pre-read key. BUFOK=2 tags
; the last block cleared on BUFDRV. The
; immediately following physical block
; on that drive may also be cleared
; unless it starts an allocation block.
; Writes preserving bytes of another
; block invalidate the key. CPMINIT and
; UNMOUNT invalidate it too.

BUFOK: DS 1
BUFDRV: DS 1
BUFBLK: DS 2

; Four 8-byte drive entries: start LBA
; (4 LE), block length (2 LE), geometry
; (1) and flags (1).
; RSLCAP checks fixed vectors and
; addresses, not a complete ROM layout.
; RESEL matches each retained entry to
; validated card volumes and slot
; capacity before committing selection.

DRVTAB: DS MAXDRV*DRVESZ

; DRVIDX: descriptor index+1, 0 for
; none. DRVSLOT: 0 none, 1 a 64-byte
; ALV, 2 a 256-byte ALV. These capacity
; codes differ from geometry IDs 1 G8M
; and 2 G1M. Format 1.1 may reserve
; slots for unmounted requested drives.

DRVIDX: DS MAXDRV

DRVSLOT:
  DS MAXDRV

; Four DPHs, logged-drive bits and
; directory/check scratch. Explicit disk
; reset can change LOGINV outside
; CPMINIT's bulk clear.
; STUBAD holds the BDOS stub's address.
; PZINIT writes JP BENTRY there and
; PZTOP, which may differ, to 0006h.

DPHTAB: DS MAXDRV*DPHSZ
LOGINV: DS 2     ; logged-drive bits

DIRBUF: DS 128
CSVDUM: DS 2     ; CKS=0 placeholder
STUBAD: DS 2

; ROM console block in PICO.SVC's
; version 3 order. Its first 39 bytes
; are PITPL. Offsets: width 14, PICOWID
; 24, record 26, version 36, drawn 41,
; shown 42. Page bytes hold 0 or PITPG.
; CPMINIT does not clear it. PISTART
; copies PITPL then TMSW sets width,
; page state and 24 row addresses. That
; copy excludes PITIE at offset 39:
; cold clear initializes it; real boot
; clears it through PIICLR. Width stays.

PIBLK: DS 14     ; seven vector words
PIWID: DS 12     ; columns, rows, five
                 ; entries
PIREC: DS 13     ; 13-byte registry tail
PITIE: DS 1      ; tracked supported IE
  DS 1           ; remaining LBUF pad:
                 ; keeps shown at 42
PITPD: DS 1      ; drawn: 0 or PITPG
PITPS: DS 1      ; shown: 0 or PITPG
PIMV: DS 1       ; 1 builds hidden page
PITPG: DS 1      ; page offset high byte
PIREGP: DS 2     ; width's ROM registers
PIROWT: DS 48    ; 24 LE row addresses

; These 33 mount scratch bytes precede
; RAMBIOS. 14 more follow the BIOS
; table. MNBUF overlays header,
; descriptor and temporary block data by
; phase.

MNTCNT: DS 1     ; descriptor count
MNBUF: DS 32     ; shared 32-byte buffer

; Shared terminal row buffer and
; vectors. CONSWV copies seven words in
; declaration order. Scroll endpoints
; are inclusive. LINEBUF is also text
; scratch for terminal/LCD/volume work.

LINEBUF:
  DS 80          ; 80-byte row buffer
VPUTV: DS 2      ; copied driver vectors
VGETV: DS 2
VCLRV: DS 2
VRSTV: DS 2
VRDRV: DS 2      ; row B to LINEBUF
VWRRV: DS 2      ; LINEBUF to row B
VFNV: DS 2       ; A=0 flip, A=1 begin
                 ; A=2 end row move
VSTOP: DS 1      ; inclusive scroll rows
VSBOT: DS 1
VCLAIM: DS 1     ; CDCLM while claimed
CONMOD: DS 1     ; effective mode

; Warm boot's BIOS stack, outside
; CCPCLR..BDOSRME. Cold boot and DIAG
; use STKTOP (KE-173).

BSTKB: DS BIOSSTN
BSTK:

BIOSRME:
CCPRAM EQU BIOSRME

; FCBs and pending command text precede
; CCPCLR. CPMINIT clears from there to
; BDOSRME but sets CMDBUF capacity to
; 127. Other pre-clear bytes support
; pending chained text and are parsed
; again as needed. Cold boot clears all.

CMDFCB:
  DS 36
RENFCB:
  DS 36
CMDBUF:
  DS 1
CMDLEN:
  DS 1
CMDTXT:
  DS 128
CCPCLR:
BOOTDRV:
  DS 1
CMDSTRT:
  DS 2
ARGSTRT:
  DS 2
FCBBASE:
  DS 2
DIRCOL:
  DS 1
DIRNCOL:
  DS 1
DIRNUM:
  DS 2
PGLINE:
  DS 1
PGCOL:
  DS 1
PGROWS:
  DS 1
PGWID:
  DS 1
SAVEPGS:
  DS 1
SAVEADR:
  DS 2
ERAANS:
  DS 1
ERAALL:
  DS 1

; 128-byte CCP scratch. LOADCOM also
; reads an extra record here at the TPA
; ceiling to distinguish exact fit from
; overflow.

LOADBUF:
  DS 128

; A5h guard between CCP scratch and the
; downward-growing stack. Guard plus
; stack occupies 43 bytes. The host
; stack test checks every guard byte on
; its built-in/error-recovery workloads.

STKGUARD:
  DS 43-CCPSTN
STKGUEND:
CSTKBAS:
  DS CCPSTN
CSTKTOP:
CCPRME:

; BDOS state and stack. CPMINIT clears
; this span then sets CURDMA to 0080h.
; OLDSP is the active caller's SP and
; PARAM the DE parameter word.

BDOSRAM EQU CCPRME
OLDSP: DS 2

; Function 45: FFh return, FEh display
; then return, others terminate. Warm
; boot defaults ERRMODE to 0.

ERRMODE:
  DS 1

PARAM: DS 2
COLUMN: DS 1
LISTEN: DS 1
PENDING:
  DS 1
PENDCHR:
  DS 1
LINPTR: DS 2
LINMAX: DS 1
LINCNT: DS 1
HFLAG: DS 1      ; FFh CCP
                 ; prompt/history
HPOS: DS 1       ; history terminator
                 ; offset
CURDRV: DS 1
DEFDRV: DS 1
DEFDPB: DS 2
DEFALV: DS 2
USERNO: DS 1
WRFLAG: DS 1     ; CCP one-shot reset
WARMV: DS 2      ; drive rebuild bitmap
ROVEC: DS 2
CURDMA: DS 2
DPHPTR: DS 2
DPBPTR: DS 2
DIRPTR: DS 2
ALVPTR: DS 2
XLTPTR: DS 2
CURTRK: DS 2
CURSEC: DS 2
DIRLEFT:
  DS 2
ENTPTR: DS 2
ENTLEFT:
  DS 1
ALLEFT: DS 1
DIRCNT: DS 2
DIRUSED:
  DS 2
SRCHIDX:
  DS 2
SRCHFCB:
  DS 2
MATCHPTR:
  DS 2
COPYPTR:
  DS 2
OPENMOD:
  DS 1
RETCODE:
  DS 1
SEQREC: DS 1
IOTRK: DS 2
IOSEC: DS 2
FSIZE0: DS 1
FSIZE1: DS 1
FSIZE2: DS 1
CAND0: DS 1
CAND1: DS 1
CAND2: DS 1
TARGEX: DS 1
TARGS2: DS 1
WRTYPE: DS 1
ZEROFIL:
  DS 1
ZEROBN: DS 2
DIRTRK: DS 2
DIRSEC: DS 2
STKBASE:
  DS BDOSSTN
STKTOP:
BDOSRME:

; SD state after the 51-byte BIOS table.
; Argument and LBA use different byte
; orders. SDXB=0 keeps the saved latch
; view.

  ORG RAMBIOS+BIOSLEN

SDBYTE: DS 1     ; 0 block, 1 byte
                 ; address
SDARG: DS 4      ; command argument, BE
SDLBA: DS 4      ; card LBA, LE
SDERR: DS 1      ; last status, 0=OK
SDXB: DS 1       ; LATEXP for cache line

; CNEXT is a replacement cursor, not
; access-order LRU. CWTYPE is BIOS type
; with bit 7 for write-through and bit 6
; for a taken line.
; CIFF saves AF from IFFGET, including
; sampled A and flags/PV. CEI restores
; maskable IFF from PV. It does not save
; I or exclude NMI.

CNEXT: DS 1
CWTYPE: DS 1
CIFF: DS 2

; Matrix scan state and pending arrow
; bytes. Arrow input returns ESC first
; then queues [ and direction.

KBMASK: DS 1     ; next row, one bit low
KBBASE: DS 1     ; row's first key
                 ; number
KBE: DS 1        ; last scan key, FFh
                 ; none
KBD: DS 1        ; prior key, FFh none
KBTN: DS 1       ; pending arrow bytes
KBT1: DS 1       ; queued [ + direction
KBT2: DS 1

; Console table pointers. PIVEC points
; to the ROM console's PIBLK in RAM, 0
; if absent. GLVEC holds a resident UC1
; table or 0. CONSW indexes this word
; pair with modes 1 and 3. Both words
; must share a page. Installed tables
; must remain valid.

PIVEC: DS 2
GLVEC: DS 2

; The 256-byte command history ring is
; at BD00h in EXPAND 1. Cold boot clears
; it. HHEAD is outside CPMINIT's clear
; span.

HHEAD: DS 1      ; next-store offset

; MVCOPY selectors: 0 is the saved
; program view, 1 EXPAND 1. Any nonzero
; sets the EXPAND bit.
; Destination/source bytes are adjacent
; for a word store. MVREST is the
; byte-loop remainder on cross-bank
; paths only.

XMDST: DS 1
XMSRC: DS 1
MVREST: DS 2

; Accepted TPA top and service-loader
; state. INIT may lower 0006h before
; PZTOP changes. Warm boot restores
; 0006h from PZTOP. SVCGEN wraps.

PZTOP: DS 2      ; accepted TPA top

PRGCODE:
  DS 2           ; BDOS 108 return code

LOADTOP:
  DS 2           ; successful LOADCOM
                 ; exclusive record end
SLN: DS 2        ; last registry record
SLDL: DS 1       ; relocation page delta
SVCBSY: DS 1     ; 80h for INIT/REMOVE

REGHEAD:
  DS 2           ; first record pointer
SVCHEAD:
  DS 1           ; lowest owner page, 0
                 ; none
SVCGEN: DS 1     ; removal generation

; On SVCLOAD failure (carry set):
; SVCRC: 0 refused, 1 failed with pages
; removed, 2 failed with pages retained.
; For 1, SVCRA gives INIT's A or 0 after
; registry validation failure.

SVCRC: DS 1
SVCRA: DS 1

; Startup and chaining state. Chained
; pieces inherit STFLAG. STBOOT marks
; startup finished before file I/O and
; reads at most one record from
; A:STARTUP.CMD.

STFLAG: DS 1     ; FFh startup, 0 typed

STPOS: DS 1      ; 0 untried, bit7 done
                 ; else 1-based offset
STREC: DS 128    ; one 128-byte record
CHPOS: DS 1      ; CMDTXT offset+1, 0
                 ; none

; Relocated page-zero console state.
; Access requires the classic bank. INFO
; combines CONDEV with VCLAIM.

RXFULL: DS 1     ; pending RXCHAR flag
RXCHAR: DS 1     ; pending console byte
CONDEV: DS 1     ; device/status bits
VROW: DS 1       ; logical cursor row
VCOL: DS 1       ; and column
VWID: DS 1       ; columns
VHGT: DS 1       ; rows
ESCST: DS 1      ; escape parser state
ESCP1: DS 1      ; numeric parameter 1
ESCP2: DS 1      ; numeric parameter 2
KBLAST: DS 1     ; held key, FFh none
VATTR: DS 1      ; 80h reverse video
VCURV: DS 1      ; 1 logical inversion

; Fourteen upper mount scratch bytes
; complete MNTCNT/MNBUF (KS36c's
; packing) and end at C000h. CPMINIT
; excludes this region from its bulk
; clear.

MNTBLK: DS 4     ; container block count

; MNTPRV overlays previous exclusive end
; (4 bytes), sum low word and copy
; offset at +2 by phase.

MNTPRV: DS 4

; MOUNT compares HTSUM only for
; count>15.

MNTSUM: DS 2     ; 1.1 header table sum
                 ; for blocks 1-7
MNTDRV: DS 1     ; 1.1 requested drives.
                 ; 0 for 1.0
MNTI: DS 1       ; descriptor index
MNTCB: DS 1      ; table block 0-7, FFh
                 ; none
MNTLN: DS 1      ; cached table line

HIRME:
WSEND EQU HIRME  ; exclusive workspace
                 ; end
