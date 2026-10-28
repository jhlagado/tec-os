; Container validation and volume mounting.
;
; Block 0 of the card holds the container header (container-format.md). The
; header and every descriptor are checked before any drive is mounted, and a
; volume is never written outside the range its descriptor gives. All block
; arithmetic is 32-bit and a carry out of the top byte is an error.

MEIO    EQU     $20             ; header block unreadable
MEMAGIC EQU     $21
MEVER   EQU     $22             ; unsupported major version
MESIZE  EQU     $23             ; header or descriptor size
MECOUNT EQU     $24             ; volume count
MESUM   EQU     $25             ; header checksum
MEDESC  EQU     $26             ; descriptor id, flags, geometry, length or alignment
MERANGE EQU     $27             ; payload beyond the container or wrapping
MEOVLAP EQU     $28             ; overlapping payloads or duplicate ids
MEMOUNT EQU     $29             ; invalid or duplicate drive letter
MENOA   EQU     $2A             ; no volume mounted as drive A

; Returns Z when drive A and any other assigned drives are mounted; else NZ
; with an ME* code in A and no drive mounted.
MOUNT:  CALL    UNMOUNT
        LD      HL,0
        LD      (SDLBA),HL
        LD      (SDLBA+2),HL
        LD      HL,BLKBUF
        CALL    SDREAD
        LD      A,MEIO
        JP      NZ,MNTERR
        LD      HL,BLKBUF       ; magic
        LD      DE,FMTMAG
        LD      B,8
MNMAG:  LD      A,(DE)
        CP      (HL)
        LD      A,MEMAGIC
        JP      NZ,MNTERR
        INC     HL
        INC     DE
        DJNZ    MNMAG
        LD      A,(BLKBUF+HMAJOR)
        CP      FMTMAJ
        LD      A,MEVER
        JP      NZ,MNTERR
        LD      HL,(BLKBUF+HHDRSZ)
        LD      DE,HDRSZ
        OR      A
        SBC     HL,DE
        LD      A,MESIZE
        JP      NZ,MNTERR
        LD      HL,(BLKBUF+HDSCSZ)
        LD      DE,DSCSZ
        OR      A
        SBC     HL,DE
        JP      NZ,MNTERR
        LD      HL,(BLKBUF+HCOUNT)
        LD      A,H
        OR      A
        LD      A,MECOUNT
        JP      NZ,MNTERR
        LD      A,L
        OR      A
        LD      A,MECOUNT
        JP      Z,MNTERR
        LD      A,L
        CP      MAXVOL+1
        LD      A,MECOUNT
        JP      NC,MNTERR
        LD      A,L
        LD      (MNTCNT),A
        CALL    HDRSUM          ; HL = sum of all bytes except the checksum
        LD      DE,(BLKBUF+HCKSUM)
        OR      A
        SBC     HL,DE
        LD      A,MESUM
        JP      NZ,MNTERR
        LD      HL,BLKBUF+HBLOCKS
        LD      DE,MNTBLK
        LD      BC,4
        LDIR
        XOR     A
        LD      (MNTCB),A       ; block 0 is in the buffer
        LD      (MNTDRV),A
        LD      A,(BLKBUF+HMINOR) ; a 1.0 card has no drives field or table sum;
        OR      A               ; its blocks 1-7 are free, as no volume starts
        JR      Z,MNV2          ; below block 8
   LD      A,(BLKBUF+HDRIVES)
        LD      (MNTDRV),A
        CP      MAXDRV+1
        LD      A,MESIZE
        JP      NC,MNTERR
        LD      HL,(BLKBUF+HTSUM)
        LD      (MNTSUM),HL
        ; Format 1.1: the table's blocks after block 0, count / 16 of them,
        ; sum to the header's tableSum.
        LD      A,(MNTCNT)
        RRCA
        RRCA
        RRCA
        RRCA
        AND     $0F
        JR      Z,MNV2
        LD      B,A
        LD      HL,0
        LD      (MNTPRV),HL     ; the sum so far
        LD      C,1
MNSUMB: PUSH    BC
        LD      A,C
        CALL    MNBLK
        POP     BC
        LD      A,MEIO
        JP      NZ,MNTERR
        PUSH    BC
        LD      HL,(MNTPRV)
        LD      DE,BLKBUF
        LD      BC,512
MNSUM:  LD      A,(DE)
        ADD     A,L
        LD      L,A
        JR      NC,MNSUM1
        INC     H
MNSUM1: INC     DE
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,MNSUM
        LD      (MNTPRV),HL
        POP     BC
        INC     C
        DJNZ    MNSUMB
        LD      DE,(MNTSUM)
        OR      A
        SBC     HL,DE
        LD      A,MESUM
        JP      NZ,MNTERR

        ; One pass in table order: each descriptor valid, starting at or after
        ; the previous one's end, and mounted as it is checked.
MNV2:   LD      HL,0
        LD      (MNTPRV),HL
        LD      (MNTPRV+2),HL
        XOR     A
        LD      (MNTI),A
MNDESC: LD      A,(MNTI)
        CALL    DESCIX
        LD      A,MEIO
        JP      NZ,MNTERR
        LD      A,(IX+DVOLID)   ; volume id must be nonzero
        OR      (IX+DVOLID+1)
        OR      (IX+DVOLID+2)
        OR      (IX+DVOLID+3)
        LD      A,MEDESC
        JP      Z,MNTERR
        LD      A,(IX+DFLAGS)
        AND     $FF-DFREAD
        LD      A,MEDESC
        JP      NZ,MNTERR
        LD      A,(IX+DGEOM)
        CALL    GEOFIND         ; HL -> geometry entry, Z if known
        LD      A,MEDESC
        JP      NZ,MNTERR
        INC     HL              ; length must equal the geometry's payload
        INC     HL
        LD      A,(HL)
        CP      (IX+DLEN)
        LD      A,MEDESC
        JP      NZ,MNTERR
        INC     HL
        LD      A,(HL)
        CP      (IX+DLEN+1)
        LD      A,MEDESC
        JP      NZ,MNTERR
        LD      A,(IX+DLEN+2)
        OR      (IX+DLEN+3)
        LD      A,MEDESC
        JP      NZ,MNTERR
        LD      A,(IX+DSTART)   ; start: nonzero and aligned
        AND     ALIGNB-1
        LD      A,MEDESC
        JP      NZ,MNTERR
        LD      A,(IX+DSTART)
        OR      (IX+DSTART+1)
        OR      (IX+DSTART+2)
        OR      (IX+DSTART+3)
        LD      A,MEDESC
        JP      Z,MNTERR
        PUSH    IX              ; start >= the previous end
        POP     HL
        LD      DE,DSTART
        ADD     HL,DE
        LD      DE,MNTPRV
        CALL    CMP32
        LD      A,MEOVLAP
        JP      C,MNTERR
        LD      IY,MNTPRV
        LD      L,(IX+DSTART)   ; end = start + length, no wrap
        LD      H,(IX+DSTART+1)
        LD      E,(IX+DLEN)
        LD      D,(IX+DLEN+1)
        ADD     HL,DE
        LD      (IY+0),L
        LD      (IY+1),H
        LD      L,(IX+DSTART+2)
        LD      H,(IX+DSTART+3)
        LD      E,(IX+DLEN+2)
        LD      D,(IX+DLEN+3)
        ADC     HL,DE
        LD      (IY+2),L
        LD      (IY+3),H
        LD      A,MERANGE
        JP      C,MNTERR
        LD      DE,MNTPRV       ; end <= container blocks
        LD      HL,MNTBLK
        CALL    CMP32
        LD      A,MERANGE
        JP      C,MNTERR
        LD      A,(IX+DMOUNT)   ; drive letter: none, or A-D, once
        CP      DUNMNT
        JR      Z,MNNEXT
        CP      MAXDRV
        LD      A,MEMOUNT
        JP      NC,MNTERR
        LD      E,(IX+DMOUNT)
        LD      D,0
        LD      HL,DRVIDX
        ADD     HL,DE
        LD      A,(HL)
        OR      A
        LD      A,MEMOUNT
        JP      NZ,MNTERR
        LD      A,(MNTI)
        INC     A
        LD      (HL),A
        CALL    MNONE
MNNEXT: LD      HL,MNTI
        INC     (HL)
        LD      A,(MNTCNT)
        CP      (HL)
        JP      NZ,MNDESC
        LD      A,(DRVTAB+6)    ; drive A must have a volume
        OR      A
        LD      A,MENOA
        JR      Z,MNTERR
        XOR     A
        LD      (BUFOK),A       ; BLKBUF holds the table, not volume data
        RET
MNTERR: PUSH    AF
        CALL    UNMOUNT
        POP     AF
        OR      A
        RET

; Read card block A (0-7, the container's table) into BLKBUF. NZ if it fails.
MNBLK:  LD      (MNTCB),A
        LD      L,A
        LD      H,0
        LD      (SDLBA),HL
        LD      L,H
        LD      (SDLBA+2),HL
        LD      HL,BLKBUF
        JP      SDREAD

; IX = descriptor A of the table, its block read into BLKBUF if it is not
; already there (MNTCB). Block 0 holds 15 after the header, each later block
; 16. NZ if the read fails.
DESCIX: LD      C,0
        SUB     DSCBLK0
        JR      C,DX0
        LD      B,A
        RRCA
        RRCA
        RRCA
        RRCA
        AND     $0F
        INC     A
        LD      C,A
        LD      A,B
        AND     $0F
        JR      DX1
DX0:    ADD     A,DSCBLK0+1     ; block 0: after the header's slot
DX1:    LD      L,A
        LD      H,0
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        LD      DE,BLKBUF
        ADD     HL,DE
        PUSH    HL
        POP     IX
        LD      A,(MNTCB)
        CP      C
        RET     Z
        LD      A,C
        JR      MNBLK

; Install the descriptor at IX as drive (IX+DMOUNT). Preserves B and IX.
MNONE:  PUSH    BC
        LD      A,(IX+DMOUNT)
        PUSH    AF
        CALL    DRVENT          ; HL -> geometry byte; entry starts 6 earlier
        LD      DE,-6
        ADD     HL,DE
        LD      A,(IX+DSTART)
        LD      (HL),A
        INC     HL
        LD      A,(IX+DSTART+1)
        LD      (HL),A
        INC     HL
        LD      A,(IX+DSTART+2)
        LD      (HL),A
        INC     HL
        LD      A,(IX+DSTART+3)
        LD      (HL),A
        INC     HL
        LD      A,(IX+DLEN)
        LD      (HL),A
        INC     HL
        LD      A,(IX+DLEN+1)
        LD      (HL),A
        INC     HL
        LD      A,(IX+DGEOM)
        LD      (HL),A
        INC     HL
        LD      A,(IX+DCACHE)   ; written behind (DCWB, bit 0): the drive's
        AND     DCWB            ; flag bit 1
        ADD     A,A
        OR      (IX+DFLAGS)
        LD      (HL),A
        POP     AF              ; build the DPH
        PUSH    AF
        LD      L,A
        LD      H,0
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        LD      DE,DPHTAB
        ADD     HL,DE
        LD      B,8             ; XLT and BDOS scratch words are zero
MNZ:    LD      (HL),0
        INC     HL
        DJNZ    MNZ
        LD      DE,DIRBUF
        LD      (HL),E
        INC     HL
        LD      (HL),D
        INC     HL
        PUSH    HL
        LD      A,(IX+DGEOM)
        CALL    GEOFIND
        LD      DE,4
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)          ; DE = DPB
        POP     HL
        LD      (HL),E
        INC     HL
        LD      (HL),D
        INC     HL
        LD      DE,CSVDUM
        LD      (HL),E
        INC     HL
        LD      (HL),D
        INC     HL
        POP     AF              ; ALVINIT sets the allocation vector
        POP     BC
        RET

; Pack the allocation vectors down from WSBASE, in drive order, and put
; each one's address in its DPH. A format 1.1 card that asks for N drives
; gets a G8M-sized slot (256 bytes) for each of drives 0 to N-1, mounted or
; not, so any drive may later take any volume; any other card gets a slot
; for each mounted drive, DSM / 8 + 1 bytes, as before. DRVSLOT records what
; each slot holds. The BDOS entry jump goes at the highest xx06h address
; below them.
ALVINIT:LD      HL,WSBASE
        LD      (STUBAD),HL     ; the lowest vector so far
        LD      C,0
ALVNX:  LD      A,C             ; HL = the DPH's DPB word, at +10
        ADD     A,A
        ADD     A,A
        ADD     A,A
        ADD     A,A
        ADD     A,10
        LD      L,A
        LD      H,0
        LD      DE,DPHTAB
        ADD     HL,DE
        PUSH    HL
        LD      A,(MNTDRV)
        OR      A
        JR      Z,ALV10
        LD      B,A
        LD      A,C
        CP      B
        JR      NC,ALVNO
        LD      DE,256
        JR      ALVPUT
ALV10:  LD      A,C
        CALL    DRVENT
        LD      A,(HL)
        OR      A
        JR      Z,ALVNO         ; not mounted
        POP     HL
        PUSH    HL
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      HL,5            ; DSM
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      B,3
ALVSH:  SRL     D
        RR      E
        DJNZ    ALVSH
        INC     DE
ALVPUT: LD      HL,DRVSLOT      ; 1 for 64 bytes, 2 for 256
        LD      B,0
        ADD     HL,BC
        LD      A,D
        INC     A
        LD      (HL),A
        LD      HL,(STUBAD)
        OR      A
        SBC     HL,DE
        LD      (STUBAD),HL
        EX      DE,HL
        POP     HL
        INC     HL              ; the ALV word, at +14
        INC     HL
        INC     HL
        INC     HL
        LD      (HL),E
        INC     HL
        LD      (HL),D
        JR      ALVSKP
ALVNO:  POP     HL
ALVSKP: INC     C
        LD      A,C
        CP      MAXDRV
        JR      C,ALVNX
        LD      HL,(STUBAD)
        LD      DE,-9           ; the JP and six free bytes below the vectors
        ADD     HL,DE
        LD      L,6
        LD      (STUBAD),HL
        RET

; The mount service, FF20h. A = 0: mount drive C with the volume at
; container index E; 1: unmount drive C; 2: describe index E into the 32
; bytes at HL, its mount byte the drive it is on now (FFh none). Returns A =
; 0, or A = FFh with nothing changed: an index past the table, a drive past
; D, a volume already on another drive, a slot too small, or drive A to be
; left empty. A mount or unmount resets the drive in the BDOS, as function 37
; does, so its next access logs it in from its directory.
VOLSVC: LD      B,A
        LD      A,$FF
        LD      (MNTCB),A       ; BLKBUF may hold anything
        LD      A,B
        OR      A
        JR      Z,VMNT
        DEC     A
        JR      Z,VUNM
        DEC     A
        JP      NZ,VBAD
        PUSH    HL              ; describe
        LD      A,E
        CALL    VDESC
        POP     DE
        JP      NZ,VBAD
        PUSH    IX
        POP     HL
        LD      BC,DSCSZ
        LDIR
        EX      DE,HL           ; the mount byte: where it is now
        LD      DE,DMOUNT-DSCSZ
        ADD     HL,DE
        LD      (HL),A
        XOR     A
        RET

VMNT:   LD      A,C
        CP      MAXDRV
        JP      NC,VBAD
        LD      A,E
        CALL    VDESC           ; IX -> its descriptor, A = its drive or FFh
        JP      NZ,VBAD
        INC     A
        JP      NZ,VBAD         ; on a drive already
        LD      A,(IX+DLEN+1)   ; the slot must hold its vector: a payload of
        CP      $10             ; 4096 blocks or more needs a G8M slot (2)
        LD      A,2
        SBC     A,0
        LD      HL,DRVSLOT
        LD      B,0
        ADD     HL,BC
        CP      (HL)
        JR      Z,VM1
        JP      NC,VBAD
VM1:    LD      (IX+DMOUNT),C
        PUSH    BC
        PUSH    DE
        CALL    VFLUSH
        LD      A,C
        CALL    VCLEAR
        CALL    MNONE
        POP     DE
        POP     BC
        LD      HL,DRVIDX
        LD      B,0
        ADD     HL,BC
        INC     E
        LD      (HL),E
        JR      VRESET

VUNM:   LD      A,C
        OR      A
        JP      Z,VBAD          ; A is never left empty
        CP      MAXDRV
        JP      NC,VBAD
        PUSH    BC
        CALL    VFLUSH
        POP     BC
        LD      A,C
        CALL    VCLEAR
VRESET: XOR     A
        LD      (BUFOK),A
        LD      HL,1            ; BDOS function 37 for drive C
        INC     C
VRS1:   DEC     C
        JR      Z,VRS2
        ADD     HL,HL
        JR      VRS1
VRS2:   EX      DE,HL
        LD      C,37
        CALL    BDOS
VOK:    XOR     A
        RET
VBAD:   LD      A,$FF
        RET

; Before a drive's volume changes: the cache's dirty lines written.
VFLUSH: CALL    CDI
        CALL    CFLALL
        JP      CEI

; Forget drive A's volume: its drive-table entry and DRVIDX. Keeps C.
VCLEAR: PUSH    BC
        CALL    DRVENT
        LD      DE,-6
        ADD     HL,DE
        LD      B,DRVESZ
VCL1:   LD      (HL),0
        INC     HL
        DJNZ    VCL1
        POP     BC
        LD      HL,DRVIDX
        LD      B,0
        ADD     HL,BC
        LD      (HL),0
        RET

; IX -> the descriptor at index A, A = the drive it is on (FFh none). NZ if A
; is past the table or its block does not read.
VDESC:  LD      HL,MNTCNT
        CP      (HL)
        JR      NC,VDNO
        PUSH    BC
        PUSH    DE
        PUSH    AF
        CALL    DESCIX
        POP     DE              ; D = the index
        JR      NZ,VDX
        INC     D
        LD      HL,DRVIDX
        LD      B,MAXDRV
        LD      E,0
VDS1:   LD      A,(HL)
        CP      D
        LD      A,E
        JR      Z,VDX
        INC     HL
        INC     E
        DJNZ    VDS1
        LD      A,$FF
        CP      A               ; Z
VDX:    POP     DE
        POP     BC
        RET
VDNO:   OR      $FF             ; NZ
        RET

; Forget every mounted volume.
UNMOUNT:LD      HL,DRVTAB         ; and DRVIDX, which follows it
        LD      B,MAXDRV*DRVESZ+MAXDRV
UNM:    LD      (HL),0
        INC     HL
        DJNZ    UNM
        XOR     A
        LD      (BUFOK),A
        RET

; A = geometry id. Returns Z and HL -> its GEOTAB entry, or NZ.
GEOFIND:LD      HL,GEOTAB
        LD      B,GEOCNT
GEOF:   CP      (HL)
        RET     Z
        LD      DE,GEOESZ
        ADD     HL,DE
        DJNZ    GEOF
        OR      1
        RET

; Compare the 32-bit little-endian values at HL and DE. C when (HL) < (DE),
; Z when equal. Destroys A, B; HL and DE end at the low bytes.
CMP32:  INC     HL
        INC     HL
        INC     HL
        INC     DE
        INC     DE
        INC     DE
        LD      B,4
CMPL:   LD      A,(DE)
        CP      (HL)
        JR      NZ,CMPNE
        DEC     HL
        DEC     DE
        DJNZ    CMPL
        RET
CMPNE:  CCF                     ; flags now describe (HL) - (DE)
        RET     C
        OR      1               ; (HL) > (DE): clear Z, carry already clear
        RET

; Return HL = 16-bit sum of the header bytes, excluding the checksum field.
HDRSUM: LD      HL,0
        LD      DE,BLKBUF
        LD      BC,HDRSZ
HSL:    LD      A,(DE)
        ADD     A,L
        LD      L,A
        JR      NC,HSN
        INC     H
HSN:    INC     DE
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,HSL
        LD      DE,(BLKBUF+HCKSUM)
        LD      A,E             ; take the two checksum bytes back out
        CALL    HSSUB
        LD      A,D
HSSUB:  LD      C,A
        LD      B,0
        OR      A
        SBC     HL,BC
        RET

; Print the mounted drives: letter, label and size.
SHOWVOL:LD      C,0             ; each mounted drive, in drive order
SHV:    PUSH    BC
        CALL    DRVDESC
        JR      NZ,SHVN
        LD      A,(IX+DMOUNT)
        ADD     A,'A'
        CALL    PUTA
        LD      A,':'
        CALL    PUTA
        LD      A,' '
        CALL    PUTA
        PUSH    IX
        POP     HL
        LD      DE,DLABEL
        ADD     HL,DE
        LD      B,11
SHVL:   LD      A,(HL)
        PUSH    BC
        PUSH    HL
        CALL    PUTA
        POP     HL
        POP     BC
        INC     HL
        DJNZ    SHVL
        LD      A,(IX+DFLAGS)
        AND     DFREAD
        JR      Z,SHVRW
        LD      HL,ROTXT
        CALL    PUTS
SHVRW:  CALL    PUTCRLF
SHVN:   POP     BC
        INC     C
        LD      A,C
        CP      MAXDRV
        JR      C,SHV
        RET

; IX -> the descriptor of the volume on drive C, read from its block of the
; table. NZ if the drive has none or the block does not read. Keeps C.
DRVDESC:LD      HL,DRVIDX
        LD      B,0
        ADD     HL,BC
        LD      A,(HL)
        SUB     1
        RET     C               ; NZ as well: none here
        PUSH    BC
        CALL    DESCIX
        POP     BC
        RET

ROTXT:  DB      " (read-only)",0
