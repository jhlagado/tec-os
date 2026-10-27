; The PRL loader. The CCP has read the whole file to 0100h: a 256-byte header
; page (the code length n at 0101h, the extra data memory m at 0104h), then
; n bytes of code for origin 0000h at 0200h, then the bitmap, one bit a code
; byte, most significant first, marking the high bytes of addresses. The
; code is relocated in place for its destination page and moved there.
;
; A module header at the start of the code ("TNM", a version, the kind)
; makes it a resident (kind 1) or a driver (kind 2); any other PRL is a
; program. A resident goes in whole pages below (0006h)'s page: the JP at
; its offset 6 is pointed at the old (0006h), and PZTOP and (0006h) become
; its base + 6, so warm boot keeps it. Its INIT, whose address is at offset
; 9, is then called. A driver goes into EXPAND 1 at an XALLOC base.

PRLHDR  EQU     $0100
PRLCODE EQU     $0200

; Returns carry set if the PRL does not fit; otherwise Z for a program ready
; at 0100h, NZ for a module installed.
PRLGO:  LD      HL,(PRLCODE)    ; "TNM"?
        LD      DE,'N'*256+'T'
        OR      A
        SBC     HL,DE
        LD      HL,(PRLHDR+1)
        LD      (PRLN),HL
        JR      NZ,PRLPROG
        LD      A,(PRLCODE+2)
        CP      'M'
        JR      NZ,PRLPROG
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
        DEC     A
        JP      Z,PRLDRV
        SCF                     ; an unknown kind
        RET

; A program: relocated for page 1 and moved down to 0100h. Its extra data
; memory is its own to check against (0006h), as a .COM's is.
PRLPROG:LD      A,1
        CALL    PRLREL
        LD      HL,PRLCODE
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
        CALL    PRLREL
        LD      A,(PRLPG)
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

; A driver: B pages from XALLOC, copied into EXPAND 1 by the copy core.
PRLDRV: LD      A,B
        LD      (DRVNP),A
        CALL    XALLOC
        RET     C
        LD      A,H
        LD      (PRLPG),A
        CALL    PRLREL
        LD      HL,$0001        ; XMDST bank 1, XMSRC bank 0
        LD      (XMDST),HL
        LD      A,(PRLPG)
        LD      H,A
        LD      L,0
        LD      DE,PRLCODE
        LD      BC,(PRLN)
        CALL    MVCOPY          ; past MOVE's range check: the pages are ours
        LD      A,(PRLPG)
        LD      (DRVPG),A
        LD      HL,PRLCODE+21   ; its hooks: a count, then entry and address
        LD      B,(HL)
        INC     HL
PRLHK:  LD      A,B             ; each address into the call table's slot
        OR      A
        JR      Z,PRLDONE
        LD      A,(HL)
        INC     HL
        PUSH    BC
        PUSH    HL
        EX      DE,HL
        ADD     A,A
        ADD     A,XTABLE-$BF00
        LD      L,A
        LD      H,XTABLE>>8
        LD      BC,2
        CALL    LVTO1
        POP     HL
        INC     HL
        INC     HL
        POP     BC
        DEC     B
        JR      PRLHK

; Relocate the n bytes at 0200h for page A, by the bitmap after them.
PRLREL: LD      (PRLPG),A
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
        LD      A,(PRLPG)
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
