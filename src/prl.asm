; The PRL loader. The CCP has read the whole file to 0100h: a 256-byte header
; page (the code length n at 0101h, the extra data memory m at 0104h), then
; n bytes of code for origin 0100h at 0200h, then the bitmap, one bit a code
; byte, most significant first, marking the high bytes of addresses. This is
; Digital Research's PRL. A program runs where its code was made for, so the
; bitmap is only checked for: the file is moved down and run. Residents are
; drivers (drv.asm).

PRLHDR  EQU     $0100
PRLCODE EQU     $0200

; Returns carry set if the PRL does not fit, carry clear for a program ready
; at 0100h.
PRLGO:  LD      HL,(LOADTOP)   ; exclusive end of whole disk records
        LD      DE,PRLCODE
        OR      A
        SBC     HL,DE
        JR      C,PRLFAIL       ; incomplete header page
        LD      HL,(PRLHDR+1)
        LD      A,H
        OR      L
        JR      Z,PRLFAIL       ; LDIR must never receive zero
        LD      (PRLN),HL
        LD      B,H
        LD      C,L
        ADD     HL,DE          ; exclusive code end
        RET     C
        EX      DE,HL
        LD      H,B
        LD      L,C
        DEC     HL
        LD      B,3
PRLBITS:SRL     H
        RR      L
        DJNZ    PRLBITS
        INC     HL             ; ceil(n / 8), without n + 7 overflow
        ADD     HL,DE          ; exclusive bitmap end
        RET     C
        LD      DE,(LOADTOP)
        EX      DE,HL
        OR      A
        SBC     HL,DE
        RET     C              ; code and bitmap must be in loaded records
        LD      HL,(PRLN)
        LD      DE,PRLHDR
        ADD     HL,DE
        RET     C
        LD      DE,(PZBDOS+1)
        LD      E,0            ; destination ceiling is the top's page
        EX      DE,HL
        OR      A
        SBC     HL,DE
        RET     C
PRLPROG:LD      HL,PRLCODE      ; moved down to 0100h, its origin
        LD      DE,PRLHDR
        LD      BC,(PRLN)
        LDIR
PRLP2:  RET
PRLFAIL:SCF
        RET
; The top before the resident at base HL goes back. Carry clear.
PRLTOP: LD      L,7
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      (PZTOP),DE
        LD      (PZBDOS+1),DE
        OR      A
        RET
PRLRF:  SCF
        RET
