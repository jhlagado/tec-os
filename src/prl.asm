; The PRL loader. The CCP has read the whole file to 0100h: a 256-byte header
; page (the code length n at 0101h, the extra data memory m at 0104h), then
; n bytes of code for origin 0100h at 0200h, then the bitmap, one bit a code
; byte, most significant first, marking the high bytes of addresses. This is
; Digital Research's PRL. A program runs where its code was made for; a
; resident's marked bytes gain its page less 1, in place, and it is moved
; there.
;
; A module header at the start of the code ("TNM", a version, the kind)
; makes it a resident (kind 1); any other kind is refused, and any other PRL
; is a program. A resident goes in whole pages below (0006h)'s page: the JP
; at its offset 6 is pointed at the old (0006h), and PZTOP and (0006h)
; become its base + 6, so warm boot keeps it. Its INIT, whose address is at
; offset 9, is then called.

PRLHDR  EQU     $0100
PRLCODE EQU     $0200

; Returns carry set if the PRL does not fit; otherwise Z for a program ready
; at 0100h, NZ for a module installed.
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
        LD      HL,(PRLCODE)    ; "TNM"?
        LD      DE,'N'*256+'T'
        OR      A
        SBC     HL,DE
        LD      HL,(PRLHDR+1)
        LD      (PRLN),HL
        JR      NZ,PRLPROG
        LD      A,(PRLCODE+2)
        CP      'M'
        JR      NZ,PRLPROG
        LD      HL,(PRLN)
        LD      DE,13          ; through the REMOVE address
        OR      A
        SBC     HL,DE
        RET     C
        LD      A,(PRLCODE+3)
        DEC     A
        JR      NZ,PRLFAIL     ; only module version 1
        LD      HL,(PRLN)
        LD      DE,(PRLHDR+4)   ; pages for n + m
        ADD     HL,DE
        RET     C
        LD      DE,255
        ADD     HL,DE
        RET     C
        LD      B,H             ; B = pages
        LD      A,(PRLCODE+4)
        DEC     A
        JR      Z,PRLRES
        SCF                     ; an unknown kind
        RET

PRLFAIL:SCF
        RET

; A program: moved down to 0100h, its origin, so nothing is relocated. Its
; extra data memory is its own to check against (0006h), as a .COM's is.
PRLPROG:LD      HL,PRLCODE
        LD      DE,PRLHDR
        LD      BC,(PRLN)
        LD      A,B
        OR      C
        JR      Z,PRLP2
        LDIR
PRLP2:  XOR     A               ; Z: run it
        RET

; A resident, B pages below (0006h)'s page. Its base must be at least B
; pages above 0200h, so the copy down from 0200h cannot overlap itself.
PRLRES: LD      A,(PZBDOS+2)
        SUB     B
        RET     C
        LD      C,A
        SUB     B
        RET     C
        CP      2
        RET     C
        LD      A,C
        DEC     A               ; made for page 1
        CALL    PRLREL
        LD      A,(PRLDL)
        INC     A               ; the page again
        LD      D,A
        LD      E,0
        LD      HL,PRLCODE
        LD      BC,(PRLN)
        LDIR
        LD      H,A             ; HL = base
        LD      L,7
        LD      DE,(PZBDOS+1)   ; its JP to the old top
        LD      (HL),E
        INC     HL
        LD      (HL),D
        LD      L,6
        LD      (PZBDOS+1),HL
        LD      (PZTOP),HL
        LD      L,9
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        EX      DE,HL
        CALL    PRLJP           ; its INIT
PRLDONE:OR      $FF             ; NZ, carry clear: installed
        RET
PRLJP:  JP      (HL)

; Add A to the n bytes at 0200h that the bitmap after them marks.
PRLREL: LD      (PRLDL),A
        LD      DE,PRLCODE
        LD      HL,(PRLN)
        LD      B,H
        LD      C,L
        ADD     HL,DE
        EX      DE,HL           ; HL = the code, DE = the bitmap
PRLRB:  LD      A,B
        OR      C
        RET     Z
        LD      A,(DE)
        INC     DE
        PUSH    DE
        LD      D,A
        LD      E,8
PRLRBT: SLA     D
        JR      NC,PRLRS
        LD      A,(PRLDL)
        ADD     A,(HL)
        LD      (HL),A
PRLRS:  INC     HL
        DEC     BC
        LD      A,B
        OR      C
        JR      Z,PRLRE
        DEC     E
        JR      NZ,PRLRBT
        POP     DE
        JR      PRLRB
PRLRE:  POP     DE
        RET

; Remove the resident at base HL if it is the lowest: its REMOVE is called
; and PZTOP and (0006h) go back to the top before it. Carry set and nothing
; changed otherwise.
PRLREM: LD      DE,(PZTOP)
        LD      A,L
        ADD     A,6
        CP      E
        JR      NZ,PRLRF
        LD      A,H
        CP      D
        JR      NZ,PRLRF
        LD      A,(STUBAD+1)    ; the cold-boot stub is not a resident
        CP      H
        JR      Z,PRLRF
        PUSH    HL
        LD      L,11
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        EX      DE,HL
        CALL    PRLJP           ; its REMOVE
        POP     HL
        LD      L,7
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      (PZTOP),DE
        LD      (PZBDOS+1),DE
        OR      A
        RET
PRLRF:  SCF
        RET
