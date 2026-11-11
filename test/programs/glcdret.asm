; Two programs at 4000h for the console after GO. Each draws
; through RST 18h and returns, leaving the ST7920 as a real program
; can: TXT in text mode with text in DDRAM, as glcd-text ends; GRT
; in graphics mode with text left in DDRAM, as glcd-3d returns from
; its menu.

  ORG $4000

TXT:
  ld a,0          ; initLCD
  rst $18
  ld a,3          ; clearTxtLCD, text mode
  rst $18
  ld c,1          ; row 1
  ld a,13         ; printString
  rst $18
  DB "TEXT LEFT",0
  ret

GRT:
  ld a,0          ; initLCD
  rst $18
  ld a,5          ; setTxtMode
  rst $18
  ld c,0
  ld a,13         ; printString
  rst $18
  DB "MENU TEXT",0
  ld a,4          ; setGrMode
  rst $18
  ld bc,$0000
  ld de,$7F0F
  ld a,10         ; fillBox
  rst $18
  ld a,12         ; plotToLCD
  rst $18
  ret
