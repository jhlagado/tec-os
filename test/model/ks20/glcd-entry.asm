; The ROM's new code in KS20 (the model, not the product): the GLCD entry
; at the end of the FF00h table, CONSW's LD HL,DRVVEC made LD HL,(GLVEC),
; and CCPIN's refusal of an image. Assembled alone, for its size; the model
; puts the ROM's symbols in place of the EQUs line below.

; ROM EQUS
CCPNO   EQU     $0000

        ORG     $C000
; HL = a video table, the six routines in VPUT's order: CONSW uses it for
; UC1: from now on, and HL = LINEBUF on return. HL = 0: the console back to
; serial and the vector to the TMS9918's, as UNLOAD's driver branch does now.
GLHOOK: LD      A,H
        OR      L
        JR      Z,GLHOFF
        LD      (GLVEC),HL
        LD      HL,LINEBUF
        RET
GLHOFF: LD      HL,CONDEV
        RES     2,(HL)
        LD      HL,TMSVEC
        CALL    VIDSET
        JP      SERCON
GLHEND:

; CCPIN, after its level check, in place of the image's pages: HL = 0100h
; or carry set and nothing changed.
CCPIMG: LD      A,H
        DEC     A
        OR      L
        JP      NZ,CCPNO
CCPIME:

; The table's next free address is FF25h (FF23h is a word); the brief
; names FF26h. The cost is the same 3 bytes either way, 4 with a pad byte.
        ORG     $FF25
        JP      GLHOOK
TABEND:
