; AREA3.SVC: a service whose INIT and
; REMOVE each leave the BDOS in user
; area 3 and return to the prompt with
; no warm boot, for the tests that the
; prompt is in area 0 after them. It
; returns no record and hooks nothing.

%INCLUDE "../../src/abi.inc"

BDOS      EQU   $0005

  ORG $0100

; Removable format-4 header, no deps.
; The writer fills REMOVE, the size,
; the relocation and INIT. Declared
; stack use: BDOS 0, BIOS 0, CCP 2.

HDR: DB 'D',SVCFMT,0,1
  DW 0,0,0,0
  DB 0,0,2
  DW 0
  DB "AREA3   "

; INIT: area 3, then HL=0 for no record
; and carry clear.

INIT:
  call AREA3     ; area 3 from here on
  ld hl,0        ; no record
  or a           ; carry clear: done
  ret

; REMOVE: area 3 again, carry clear.

REMOVE:
  call AREA3     ; area 3 once more
  or a           ; carry clear: removed
  ret

; Set user area 3 through function 32.

AREA3:
  ld e,3         ; area 3
  ld c,32        ; 32: set the area
  jp BDOS

IMGEND:
