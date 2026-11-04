; CP/M 2.2 BIOS. Cold boot copies the ROM table below to RAMBIOS. That
; page-aligned copy is the one that runs: the BDOS calls it, and programs
; reach it by the vector at 0001h.
;
; Disk records map to volumes linearly: record = track * 64 + sector. Every
; version 1 geometry has 64 records per track and no reserved tracks; the
; build checks this against format.json. Four records share one 512-byte SD
; block. Reads go through the block cache (cache.asm). Writes go through to
; the card before success is reported, except on the one volume written
; behind, whose writes stay in the cache until it writes them.

BHOME:  LD      BC,0
BSETTRK:LD      (DSKTRK),BC
        RET
BSETSEC:LD      (DSKSEC),BC
        RET
BSETDMA:LD      (DSKDMA),BC
        RET
BSECTRN:LD      H,B             ; no skew
        LD      L,C
        RET

; C = drive. Returns HL = DPH, or 0 when the drive has no mounted volume.
BSELDSK:LD      A,C
        CP      MAXDRV
        JR      NC,SELBAD
        CALL    DRVENT
        LD      A,(HL)          ; HL points at the geometry byte
        OR      A
        JR      Z,SELBAD
        LD      A,C
        LD      (DSKCUR),A
DPHADR: LD      L,A             ; HL = DPHTAB + 16 * drive A, for BSELDSK,
                                ; MNDPH and ALVINIT; keeps BC, destroys DE
        LD      H,0
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        LD      DE,DPHTAB
        ADD     HL,DE
        RET
SELBAD: LD      HL,0
        RET

; A = drive. Returns HL = address of its drive-table geometry byte (offset 6),
; and preserves BC.
DRVENT: ADD     A,A
        ADD     A,A
        ADD     A,A
        ADD     A,6
        LD      E,A
        LD      D,0
        LD      HL,DRVTAB
        ADD     HL,DE
        RET

; Translate DSKTRK/DSKSEC on DSKCUR into BLKOFF, BLKSLOT and SDLBA. Returns Z
; when the record lies inside the volume.
MAPREC: LD      HL,(DSKSEC)
        LD      A,H
        OR      A
        JR      NZ,MAPBAD
        LD      A,L
        CP      64
        JR      NC,MAPBAD
        LD      HL,(DSKTRK)
        LD      A,H             ; tracks above 1023 overflow 16-bit records
        CP      4
        JR      NC,MAPBAD
        ADD     HL,HL           ; record = track * 64 + sector
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        LD      A,(DSKSEC)
        OR      L
        LD      L,A
        AND     3
        LD      (BLKSLOT),A
        SRL     H               ; block = record / 4
        RR      L
        SRL     H
        RR      L
        LD      (BLKOFF),HL
        LD      A,(DSKCUR)      ; compare with the volume length
        CALL    DRVENT
        DEC     HL
        LD      D,(HL)
        DEC     HL
        LD      E,(HL)          ; DE = length in blocks
        PUSH    HL
        LD      HL,(BLKOFF)
        OR      A
        SBC     HL,DE
        POP     HL
        JR      NC,MAPBAD
        DEC     HL              ; HL -> start block byte 3
        LD      DE,SDLBA+3
        LD      BC,(BLKOFF)
        LD      A,(HL)          ; SDLBA = start + block, little-endian
        DEC     HL
        LD      (DE),A
        DEC     DE
        LD      A,(HL)
        DEC     HL
        LD      (DE),A
        DEC     DE
        LD      A,(HL)
        DEC     HL
        LD      (DE),A
        DEC     DE
        LD      A,(HL)
        LD      (DE),A          ; SDLBA now holds the start block
        LD      HL,(SDLBA)
        ADD     HL,BC
        LD      (SDLBA),HL
        LD      HL,(SDLBA+2)
        LD      BC,0
        ADC     HL,BC
        LD      (SDLBA+2),HL
        XOR     A
        RET
MAPBAD: OR      1
        RET

; The no-pre-read rule's key: the block BLKOFF on drive DSKCUR, held as C
; says (BUFOK: 2 cleared, not read), so that the next block of its allocation
; block can be cleared rather than read. Returns Z. Destroys A and HL.
GETKEY: LD      A,(DSKCUR)
        LD      (BUFDRV),A
        LD      HL,(BLKOFF)
        LD      (BUFBLK),HL
        LD      A,C
        LD      (BUFOK),A
        XOR     A
        RET

; BIOS READ: copy the record to DSKDMA, through the cache. A = 0 on
; success, 1 on error. Interrupts are off within, and back as they were.
BREAD:  CALL    CDI
        CALL    MAPREC
        CALL    Z,CREAD
        JP      BRET
DSKERR: LD      A,1
        RET

; BIOS WRITE: the record goes into its block's line in the cache (CWRBH),
; the one write path. The block is read into the line first, unless nothing
; in it is the card's to keep: the write is of type 2 (C), the first to a newly
; allocated block, or the block before, cleared rather than read, is on this
; drive and in the same allocation block (GETKEY's key). On a volume written
; through the line goes to the card before the call returns; on the one written
; behind it stays dirty until a directory write, warm boot or remount. A = 0 on
; success, 1 on error; interrupts are off within, and back as they were.
BWRITE: CALL    CDI
        LD      A,C
        LD      (CWTYPE),A
        CALL    BWR0
        JP      BRET
BWR0:   PUSH    BC
        CALL    MAPREC
        POP     BC
        JR      NZ,DSKERR
        LD      A,(DSKCUR)      ; read-only volumes refuse before any change
        CALL    DRVENT
        INC     HL
        BIT     0,(HL)
        JR      NZ,DSKERR
        DEC     HL
        PUSH    HL              ; a directory block: its drive dirty, its mark
        PUSH    BC              ; raised over the block
        LD      B,(HL)
        LD      A,64
BWDN:   SRL     A               ; the directory's SD blocks: 32 G8M, 16 G1M
        DJNZ    BWDN
        LD      BC,(BLKOFF)
        INC     B
        DEC     B
        JR      NZ,BWND
        CP      C
        JR      C,BWND
        JR      Z,BWND
        LD      A,(DSKCUR)
        CALL    DPHADR
        LD      DE,4
        ADD     HL,DE
        LD      (HL),1
        INC     HL
        INC     HL
        LD      A,C             ; DE = (SD block + 1) * 16: the block's
        INC     A               ; entries, all of them under the mark
        LD      E,A
        LD      D,0
        EX      DE,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        EX      DE,HL
        LD      A,E             ; the mark at HL: raised to DE if lower
        SUB     (HL)
        INC     HL
        LD      A,D
        SBC     A,(HL)
        JR      C,BWND
        LD      (HL),D
        DEC     HL
        LD      (HL),E
BWND:   POP     BC
        POP     HL
        LD      A,C
        CP      2
        JR      Z,BWNEW
        LD      C,0
        LD      A,(BUFOK)
        CP      2
        JR      NZ,BWGET
        LD      A,(BUFDRV)
        LD      E,A
        LD      A,(DSKCUR)
        CP      E
        JR      NZ,BWGET
        LD      B,(HL)          ; the geometry: 1 G8M, 2 G1M
        LD      A,16
BWMASK: SRL     A               ; SD blocks in an allocation block
        DJNZ    BWMASK
        DEC     A
        LD      HL,(BLKOFF)
        AND     L
        JR      Z,BWGET         ; the first of its allocation block
        DEC     HL
        LD      DE,(BUFBLK)
        OR      A
        SBC     HL,DE
        JR      NZ,BWGET
BWNEW:  LD      C,1
BWGET:  LD      A,(DSKCUR)
        CALL    DRVENT
        INC     HL
        BIT     1,(HL)          ; written behind
	JP	NZ,CWRBH
	LD	HL,CWTYPE	; written through: bit 7 tells CWRBH to
	SET	7,(HL)		; write the line before it returns
	JP	CWRBH

; P/V = the interrupt state. The second read is for an NMOS Z80, which can
; clear P/V if an interrupt is accepted during the first. Destroys A.
IFFGET: LD      A,I
        RET     PE
        LD      A,I
        RET

; Interrupts off for a BIOS entry, their state kept in CIFF (CDI); back as
; they were, keeping A and the flags (CEI). CDI destroys HL.
CDI:    CALL    IFFGET
        DI
        PUSH    AF
        POP     HL
        LD      (CIFF),HL       ; L: the flags, P/V in bit 2
        RET
BRET:   LD      A,0             ; BIOS READ and WRITE: A from Z or NZ, and
        JR      Z,CEI           ; interrupts as they were
        INC     A
CEI:    PUSH    AF
        LD      A,(CIFF)
        AND     4
        JR      Z,CEI1
        EI
CEI1:   POP     AF
        RET
