; Emit ABI 5.2 at abi.inc's
; C003h..C00Ah: TNA, major, minor and JP
; SVCDSP. The ROM includes the shared
; declarations first. Minor 1 adds
; TNFONT, minor 2 TNRING and TNPARSE.
; The build checks table bytes and
; addresses and the following data
; block.

  DB "TNA"
  DB 5
  DB 2           ; C007h ABIMIN, the
                 ; minor version: 2 adds
                 ; TNRING and TNPARSE
  jp SVCDSP
