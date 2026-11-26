; Emit ABI 5.5 at abi.inc's
; C003h..C00Ah: TNA, major, minor and JP
; SVCDSP. The ROM includes the shared
; declarations first. Minor 2 adds
; TNGLYPH. The build checks table
; bytes/addresses and the following data
; block.

  DB "TNA"
  DB 5
  DB 6           ; C007h ABIMIN, the
                 ; minor version: 2 adds
                 ; TNGLYPH, 3 COMVEC,
                 ; 4 TNPARSE, 5 EXRMV
  jp SVCDSP
