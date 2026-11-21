; Capture returns and SP around a BDOS
; buffered line read for the TBG test.
  ORG $0100
  ld (BEFORE),sp
  ld de,LINEBUF
  ld c,10
  call 5
  ld (AFTER),sp
  ld hl,RETURNS
  inc (hl)
DONE:
  jp DONE

BEFORE: DW 0
AFTER: DW 0
RETURNS: DB 0
LOWGUARD: DB $A5
LINEBUF: DB 8,0
  DS 8
HIGHGRD: DB $5A
