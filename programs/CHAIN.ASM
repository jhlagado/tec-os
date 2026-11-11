; CHAIN: prints LINE 1 to LINE 5, then returns to the CCP.

BDOS      EQU   5               ; CP/M's entry point
CONOUT    EQU   2               ; BDOS: print the character in E
PRINT     EQU   9               ; BDOS: print DE's text, up to a $

  ORG $100                      ; where a .COM program starts

START:
  ld b,5 \ ld c,'1'             ; count five lines, numbered from 1

LINE:
  push bc \ ld de,TEXT          ; keep the count, point at "LINE "
  ld c,PRINT \ call BDOS        ; print it
  pop bc \ push bc \ ld e,c     ; take the line's digit
  ld c,CONOUT \ call BDOS       ; print it
  ld de,CRLF \ ld c,PRINT       ; point at CR LF
  call BDOS \ pop bc            ; end the line, get the count back
  inc c \ djnz LINE \ ret       ; the next line, or back to the CCP

TEXT:     DB    "LINE $"        ; each line's text
CRLF:     DB    13,10,"$"       ; a new line
