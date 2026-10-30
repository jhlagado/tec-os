; The driver loader and the service registry. A .DRV file is read to 0100h:
; the header and image, made for page 0, then the dependencies, then the
; relocation data. The image runs where its header lands: header and image
; move together to a page boundary, the loader writing its fields over those
; the load has finished with, so the file carries no padding.
;
; A record, as INIT returns it: the link, the name, 8 bytes, the interface
; version and the entry table's address. The registry is the list through
; those records, its head in REGHEAD.

DMAGIC  EQU     $0144           ; 'D', format version 1
DF      EQU     $0100           ; the file
DDEP    EQU     2               ; dependencies; resident, the previous owner
DFLG    EQU     3               ; bit 0 removable
DREM    EQU     4               ; REMOVE, from the header's start
DSIZ    EQU     6               ; header and image; resident, the JP
DXTR    EQU     8               ; extra memory after the image
DREL    EQU     10              ; relocation bytes
DSTK    EQU     12              ; BDOS, BIOS and CCP stack; resident, the room left
DINI    EQU     15              ; INIT, from the header's start
DNAM    EQU     17              ; 8 bytes
DHLEN   EQU     25
DRECSZ  EQU     13              ; link, name, version, table

; UNLOAD: the lowest resident, at level 0 with the window shut. Only a head of
; the owner list is a driver.
DRVUNL: LD      A,(CCPLVL)
        OR      A
        JR      NZ,PRLRF
        LD      HL,(PZTOP)
        LD      L,A
        LD      A,(DRVHEAD)
        CP      H
        JR      NZ,PRLRF
        LD      L,DFLG
        BIT     0,(HL)
        JR      Z,PRLRF
        PUSH    HL
        LD      L,DREM
        CALL    DRVCALL
        CALL    DRVSHUT
        POP     HL
        RET     C
        LD      L,A             ; the registry's head and the owner's, then
        LD      DE,REGHEAD      ; the generation and the top
        LD      BC,3
        LDIR
        EX      DE,HL
        INC     (HL)
        EX      DE,HL
        JP      PRLTOP

; Install the file at 0100h, up to LOADTOP. Carry clear: installed. Carry set:
; DRVRC is 0 refused, nothing changed; 1 INIT failed, nothing left; 2 failed,
; its pages reserved with no services.
DRVLOAD:XOR     A
        LD      (DRVRC),A
        LD      A,(CCPLVL)      ; level 0, and no INIT or REMOVE running
        OR      A
        JR      NZ,PRLRF
        LD      HL,(DF)
        LD      DE,DMAGIC
        SBC     HL,DE
        JR      NZ,PRLRF
        LD      BC,(DF+DSIZ)    ; the image in the records
        INC     H               ; HL = 0: now the file
        CALL    DRVEXT
        RET     C
        LD      HL,(DF+DINI)
        CALL    DRVIN
        RET     C
        LD      HL,(DF+DREM)
        CALL    DRVIN
        RET     C
        LD      HL,(DF+DXTR)    ; the pages; the base at 8000h or above
        ADD     HL,BC
        RET     C
        DEC     HL
        LD      A,(PZTOP+1)
        DEC     A
        SUB     H
        RET     C
        CP      $80
        RET     C
        LD      (PRLDL),A
        LD      H,B             ; the dependencies, after the image
        LD      L,C
        INC     H
        LD      A,(DF+DDEP)
DRVDL:  OR      A
        JR      Z,DRVDE
        PUSH    AF
        PUSH    HL
        LD      BC,9
        CALL    DRVEXT
        EX      (SP),HL         ; the next on the stack
        JR      C,DRVDX
        EX      DE,HL
        LD      A,(DE)          ; the least version, then the name
        LD      C,A
        INC     DE
        CALL    REGFIND
DRVDX:  POP     HL
        POP     BC
        RET     C
        LD      A,B
        DEC     A
        JR      DRVDL
DRVDE:  PUSH    HL              ; the relocation data
        LD      BC,(DF+DREL)
        CALL    DRVEXT
        JR      C,DRVSX
        LD      HL,DRVLIM       ; each stack's room left, carried in the header
        LD      A,(DRVHEAD)
        OR      A
        JR      Z,DRVS0
        LD      H,A
        LD      L,DSTK
DRVS0:  LD      DE,DF+DSTK
        LD      B,3
DRVSL:  LD      A,(HL)
        EX      DE,HL
        SUB     (HL)
        JR      C,DRVSX
        LD      (HL),A
        EX      DE,HL
        INC     HL
        INC     DE
        DJNZ    DRVSL
DRVSX:  POP     DE
        RET     C
; Add the page to the image's marked bytes. The list at DE holds the gap from
; each fixup to the next; 255 is a gap and no fixup. Carry past the image.
        LD      BC,(DF+DREL)
        LD      HL,DF+DHLEN-1
DRVR1:  LD      A,B
        OR      C
        JR      Z,DRVMOV
        DEC     BC
        LD      A,(DE)
        INC     DE
        PUSH    DE
        LD      E,A
        LD      D,0
        ADD     HL,DE
        INC     A
        PUSH    HL
        DEC     H
        LD      DE,(DF+DSIZ)
        SBC     HL,DE
        POP     HL
        POP     DE
        CCF
        RET     C
        OR      A
        JR      Z,DRVR1
        LD      A,(PRLDL)
        ADD     A,(HL)
        LD      (HL),A
        JR      DRVR1
DRVMOV:
        LD      HL,REGHEAD      ; the resident's fields, in the header
        LD      DE,DF
        LD      BC,3
        LDIR
        LD      BC,(DF+DSIZ)
        LD      HL,(PZTOP)
        LD      (DF+DSIZ+1),HL
        LD      A,$C3
        LD      (DF+DSIZ),A
        LD      HL,DF           ; the move; only (0006h) is lowered
        LD      A,(PRLDL)
        LD      D,A
        LD      E,L
        LDIR
        LD      H,A
        LD      L,6
        LD      (PZBDOS+1),HL
        LD      L,DINI
        CALL    DRVCALL
        CALL    DRVBND
        JR      C,DRVSCAN
        PUSH    HL              ; the first record
        LD      B,0             ; 255 records at most
DRVWK:  LD      A,H
        OR      L
        JR      Z,DRVLK
        LD      (PRLN),HL       ; the last so far
        CALL    DRVCK
        JR      C,DRVRF
        PUSH    BC
        LD      C,(HL)
        INC     HL
        LD      B,(HL)
        PUSH    BC              ; the link
        LD      BC,DRECSZ-2
        ADD     HL,BC           ; the record's last byte
        CALL    DRVCK
        JR      C,DRVWX
        LD      A,(HL)          ; the table
        CALL    DRVCKA
DRVWX:  POP     HL
        POP     BC
        JR      C,DRVRF
        DJNZ    DRVWK
DRVRF:  POP     HL              ; a record refused: REMOVE undoes INIT
        LD      H,D
        LD      L,DREM
        CALL    DRVCALL
        CALL    DRVBND
        JR      C,DRVKEEP
; INIT failed. A hook left in the table keeps the pages.
DRVSCAN:LD      HL,RAMBIOS+2
        LD      B,BIOSLEN/3
DRVSC1: LD      A,(HL)
        CALL    DRVCKA
        JR      NC,DRVHIT
        INC     HL
        INC     HL
        INC     HL
        DJNZ    DRVSC1
        LD      HL,(PZTOP)
        LD      (PZBDOS+1),HL
        LD      A,1
        JR      DRVRET
DRVHIT: LD      E,DFLG
        XOR     A
        LD      (DE),A          ; not removable
DRVKEEP:LD      A,2
        LD      (DRVRC),A
        JR      DRVCOM
DRVLK:  POP     HL              ; link the records, then commit
        LD      A,H
        OR      L
        JR      Z,DRVCOM
        LD      BC,(REGHEAD)
        LD      (REGHEAD),HL
        LD      HL,(PRLN)
        LD      (HL),C
        INC     HL
        LD      (HL),B
DRVCOM: LD      A,D
        LD      (DRVHEAD),A
        LD      H,A
        LD      L,6
        LD      (PZTOP),HL      ; the commit
        LD      A,(DRVRC)
DRVRET: LD      (DRVRC),A
        CP      1
        CCF
DRVSHUT:LD      A,0
        LD      (CCPLVL),A
        RET

; HL at the header field, the page in H: the window opens and that routine runs.
DRVCALL:LD      A,$80
        LD      (CCPLVL),A
        LD      E,(HL)
        INC     L
        LD      A,(HL)
        ADD     A,H
        LD      H,A
        LD      L,E
        JP      (HL)

; D = the driver's page, E = the page above its last. Flags and HL kept.
DRVBND: LD      A,(PRLDL)
        LD      D,A
        LD      E,8
        LD      A,(DE)
        LD      E,A
        RET

; Carry unless HL, or at DRVCKA the page A, is in the driver's pages.
DRVCK:  LD      A,H
DRVCKA: CP      D
        RET     C
        CP      E
        CCF
        RET

; HL + BC, carry if that is past the file. HL = the sum, DE destroyed.
DRVEXT: ADD     HL,BC
        RET     C
        EX      DE,HL
        LD      HL,(LOADTOP)
        SBC     HL,DE
        EX      DE,HL
        RET

; Carry unless HL is an offset into the image, of BC bytes with the header.
DRVIN:  LD      DE,DHLEN
        SBC     HL,DE
        RET     C
        ADD     HL,DE
        SBC     HL,BC
        CCF
        RET

; DRIVERS: each driver's name and pages, from the owner list.
CMDDRV: LD      A,(DRVHEAD)
CMDDL:  OR      A
        JP      Z,MAINLOOP
        LD      H,A
        LD      L,DNAM
        LD      B,8
        CALL    PUTTRIM
        PUSH    HL
        LD      E,' '
        CALL    PUTCHAR
        POP     HL
        PUSH    HL
        LD      L,8
        LD      A,(HL)
        SUB     H
        LD      L,A
        LD      H,0
        CALL    PUTDEC
        LD      DE,CRLFMSG
        CALL    PUTSTR
        POP     HL
        LD      L,DDEP
        LD      A,(HL)
        JR      CMDDL

; Startup. Once after cold boot one record of A:STARTUP.CMD is read, the
; position marked done first, so that a failure can't repeat.
STBOOT: LD      HL,STPOS
        LD      A,(HL)
        OR      A
        RET     NZ
        DEC     (HL)
        IN      A,(STSPORT)     ; a keypad key held skips it: bit 6 low
        AND     $40
        RET     Z
        LD      HL,STFCB
        LD      DE,CMDFCB
        LD      BC,12
        LDIR
        LD      DE,STREC
        LD      C,26
        CALL    BDOS
        LD      DE,CMDFCB
        LD      C,15
        CALL    BDOS
        INC     A
        JR      Z,STBDMA
        LD      DE,CMDFCB
        LD      C,20
        CALL    BDOS
        OR      A
        JR      NZ,STBDMA
        INC     A
        LD      (STPOS),A
STBDMA: LD      HL,DEFDMA
        LD      (CURDMA),HL
        RET

; At level 0 with a line left: it goes in the command buffer, echoed as if
; typed, and carry clear. Lines end at CR or LF and blank ones are passed
; over; ^Z, a zero or the record's last byte ends the file.
STLINE: LD      A,(CCPLVL)
        OR      A
        SCF
        RET     NZ
        LD      A,(STPOS)
        OR      A
        SCF
        RET     M
        ADD     A,LOW(STREC)-1
        LD      L,A
        LD      H,HIGH(STREC)
        LD      DE,CMDTXT
STL1:   LD      A,L
        CP      LOW(STREC+127)
        JR      Z,STLE
        LD      A,(HL)
        INC     HL
        OR      A
        JR      Z,STLE
        CP      26
        JR      Z,STLE
        CP      13
        JR      Z,STL2
        CP      10
        JR      Z,STL2
        LD      (DE),A
        INC     DE
        JR      STL1
STLE:   LD      L,LOW(STREC)-2
STL2:   LD      A,L
        SUB     LOW(STREC)-1
        LD      (STPOS),A
        LD      A,E
        SUB     LOW(CMDTXT)
        JR      Z,STLINE
        LD      (CMDLEN),A
        EX      DE,HL
        LD      (HL),13
        INC     HL
        LD      (HL),'$'
        LD      DE,CMDTXT
        CALL    PUTSTR
        OR      A
        RET

; ABIDRV. C = 0, find: DE = the name, B = the least version; HL = the entry
; table. C = 1, enumerate: B = an index; HL = that record. A = the generation.
; Carry if there is none. BC, DE destroyed.
DRVSVC: LD      A,C
        LD      C,B
        LD      B,0
        OR      A
        JR      Z,REGFIND
        DEC     A
        SCF
        RET     NZ
        LD      HL,(REGHEAD)
        INC     C
DRVS1:  LD      A,H
        OR      L
        SCF
        RET     Z
        DEC     C
        JR      Z,REGGEN
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        JR      DRVS1

; DE = the name, C = the least version, B = 0.
REGFIND:LD      HL,(REGHEAD)
REGF1:  LD      A,H
        OR      L
        SCF
        RET     Z
        PUSH    HL
        PUSH    DE
        PUSH    BC
        INC     HL
        INC     HL
        LD      B,8
REGF2:  LD      A,(DE)
        CP      (HL)
        JR      NZ,REGF3
        INC     DE
        INC     HL
        DJNZ    REGF2
        LD      A,(HL)          ; the version
        CP      C
        JR      C,REGF3
        INC     HL
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        POP     BC
        POP     DE
        POP     BC
REGGEN: LD      A,(DRVGEN)
        OR      A
        RET
REGF3:  POP     BC
        POP     DE
        POP     HL
        LD      A,(HL)
        INC     HL
        LD      H,(HL)
        LD      L,A
        DJNZ    REGF1
        SCF
        RET
