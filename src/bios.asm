; CP/M 2.2 BIOS. The ROM table below is the one the BDOS calls; warm boot
; copies it to RAMBIOS so programs that follow the vector at 0001h find a
; page-aligned table in RAM.
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
DPHADR: LD      L,A             ; HL = DPHTAB + 16 * drive A; destroys DE
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

; Make BLKBUF hold the mapped block. Returns Z on success. With C not 0
; it does not read a block it lacks: it clears BLKBUF to zeros instead, and
; BUFOK is 2 while it holds that block.
GETBLKW:LD      A,(BUFOK)
        OR      A
        JR      Z,GETRD
        LD      A,(BUFDRV)
        LD      B,A
        LD      A,(DSKCUR)
        CP      B
        JR      NZ,GETRD
        LD      HL,(BUFBLK)
        LD      DE,(BLKOFF)
        OR      A
        SBC     HL,DE
        RET     Z
GETRD:  XOR     A
        LD      (BUFOK),A
        LD      HL,BLKBUF
        OR      C
        JR      NZ,GETZ
        CALL    SDREAD
        RET     NZ
        LD      C,1             ; BUFOK 1: read
GETKEY: LD      A,(DSKCUR)
        LD      (BUFDRV),A
        LD      HL,(BLKOFF)
        LD      (BUFBLK),HL
        LD      A,C
        LD      (BUFOK),A
        XOR     A
        RET
GETZ:   LD      DE,BLKBUF+1     ; BUFOK 2: cleared, not read
        LD      BC,511
        LD      (HL),0
        LDIR
        LD      C,2
        JR      GETKEY

; HL = address of the mapped 128-byte record inside BLKBUF.
SLOTADR:LD      A,(BLKSLOT)
        RRCA                    ; A * 128 as a 16-bit offset
        LD      H,A
        AND     $80
        LD      L,A
        LD      A,H
        AND     $01
        LD      H,A
        LD      DE,BLKBUF
        ADD     HL,DE
        RET

; BIOS READ: copy the record to DSKDMA, through the cache. A = 0 on
; success, 1 on error. Interrupts are off within, and back as they were.
BREAD:  CALL    CDI
        CALL    MAPREC
        CALL    Z,CREAD
        JP      BRET
DSKERR: LD      A,1
        RET

; BIOS WRITE: merge the record into its block and write the block through.
; A block not in BLKBUF is read first, unless nothing in it is the card's to
; keep: the write is of type 2 (C), the first to a newly allocated block, or
; BLKBUF holds the block before, cleared rather than read, on this drive and
; in the same allocation block. On the write-behind volume the record goes
; to its block's line in the cache instead (CWRBH). A = 0 on success, 1 on
; error; interrupts are off within, and back as they were.
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
        PUSH    BC              ; raised over the block (KS18)
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
        JP      NZ,CWRBH
        CALL    GETBLKW
        JP      NZ,DSKERR
        CALL    SLOTADR
        EX      DE,HL
        LD      HL,(DSKDMA)
        LD      BC,128
        LDIR
        LD      HL,BLKBUF
        CALL    SDWRITE
        JR      Z,BWOK
        XOR     A               ; the buffer no longer matches the card,
        LD      (BUFOK),A       ; nor does the block's line
        CALL    CLOOK
        CALL    Z,CDROP
        OR      1               ; NZ: the error
        RET
BWOK:   CALL    CREFR           ; the block's line, if it has one, refreshed
        XOR     A
        RET
