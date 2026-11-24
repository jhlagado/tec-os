; Emit ABI 5.2 at abi.inc's
; C003h..C00Ah: TNA, major, minor and JP
; SVCDSP. The ROM includes the shared
; declarations first. Minor 2 adds
; TNGLYPH. The build checks table
; bytes/addresses and the following data
; block.

  DB "TNA"
  DB 5
  DB 3           ; C007h ABIMIN, the
                 ; minor version: 2 adds
                 ; TNGLYPH, 3 COMVEC
  jp SVCDSP
