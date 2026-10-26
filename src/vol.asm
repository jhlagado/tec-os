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

        ; Check each descriptor against the ones before it.
        LD      IX,BLKBUF+HDESC
        LD      IY,MNTEND
        LD      C,0             ; descriptor index
MNDESC: LD      A,(IX+DVOLID)   ; volume id must be nonzero
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
        PUSH    IY              ; end <= container blocks
        POP     DE
        LD      HL,BLKBUF+HBLOCKS
        CALL    CMP32
        LD      A,MERANGE
        JP      C,MNTERR
        LD      A,(IX+DMOUNT)   ; drive letter: none, or A-D
        CP      DUNMNT
        JR      Z,MNLTOK
        CP      MAXDRV
        LD      A,MEMOUNT
        JP      NC,MNTERR
MNLTOK: CALL    MNPRIOR
        JP      NZ,MNTERR
        LD      DE,DSCSZ
        ADD     IX,DE
        LD      DE,4
        ADD     IY,DE
        INC     C
        LD      A,(MNTCNT)
        CP      C
        JP      NZ,MNDESC

        ; Every descriptor is valid: install the mounted ones.
        LD      IX,BLKBUF+HDESC
        LD      A,(MNTCNT)
        LD      B,A
MNINST: LD      A,(IX+DMOUNT)
        CP      DUNMNT
        CALL    NZ,MNONE
        LD      DE,DSCSZ
        ADD     IX,DE
        DJNZ    MNINST
        LD      A,(DRVTAB+6)    ; drive A must have a volume
        OR      A
        LD      A,MENOA
        JR      Z,MNTERR
        XOR     A
        LD      (BUFOK),A       ; BLKBUF holds the header, not volume data
        RET
MNTERR: PUSH    AF
        CALL    UNMOUNT
        POP     AF
        OR      A
        RET

; Compare descriptor C (IX, end at IY) with each earlier descriptor. Returns
; NZ with an error code in A on a duplicate id or letter, or an overlap.
MNPRIOR:LD      A,C
        OR      A
        RET     Z
        LD      B,C
        LD      HL,BLKBUF+HDESC
        LD      DE,MNTEND
MNPR:   PUSH    BC
        PUSH    HL
        PUSH    DE
        PUSH    HL              ; duplicate volume id?
        PUSH    IX
        POP     DE
        CALL    CMP32
        POP     HL
        LD      A,MEOVLAP
        JR      Z,MNPRX
        LD      A,(IX+DMOUNT)   ; duplicate drive letter?
        CP      DUNMNT
        JR      Z,MNPRO
        LD      DE,DMOUNT
        PUSH    HL
        ADD     HL,DE
        CP      (HL)
        POP     HL
        LD      A,MEMOUNT
        JR      Z,MNPRX
MNPRO:  LD      DE,DSTART       ; overlap: start_i < end_j and start_j < end_i
        ADD     HL,DE           ; HL -> start_j
        PUSH    HL
        PUSH    IY
        POP     DE              ; DE -> end_i
        CALL    CMP32           ; C if start_j < end_i
        POP     HL
        JR      NC,MNPRN
        POP     DE              ; DE -> end_j
        PUSH    DE
        PUSH    IX
        POP     HL
        LD      BC,DSTART
        ADD     HL,BC           ; HL -> start_i
        CALL    CMP32           ; C if start_i < end_j
        LD      A,MEOVLAP
        JR      C,MNPRX
MNPRN:  POP     DE
        POP     HL
        POP     BC
        PUSH    BC
        LD      BC,DSCSZ
        ADD     HL,BC
        INC     DE
        INC     DE
        INC     DE
        INC     DE
        POP     BC
        DJNZ    MNPR
        XOR     A
        RET
MNPRX:  POP     DE
        POP     HL
        POP     BC
        OR      A
        RET

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
        LD      A,(IX+DFLAGS)
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

; Pack the allocation vectors of the mounted drives down from WSBASE, in
; drive order, each DSM / 8 + 1 bytes, and put each one's address in its
; DPH. The BDOS entry jump goes at the highest xx06h address below them.
ALVINIT:LD      HL,WSBASE
        LD      (STUBAD),HL     ; the lowest vector so far
        LD      C,0
ALVNX:  LD      A,C
        CALL    DRVENT
        LD      A,(HL)
        OR      A
        JR      Z,ALVSKP        ; not mounted
        LD      A,C             ; HL = the DPH's DPB word, at +10
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

; Forget every mounted volume.
UNMOUNT:LD      HL,DRVTAB
        LD      B,MAXDRV*DRVESZ
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
SHOWVOL:LD      C,0
        LD      IX,BLKBUF+HDESC ; the header is still in BLKBUF after MOUNT
        LD      A,(MNTCNT)
        LD      B,A
SHV:    PUSH    BC
        LD      A,(IX+DMOUNT)
        CP      DUNMNT
        JR      Z,SHVN
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
SHVN:   LD      DE,DSCSZ
        ADD     IX,DE
        POP     BC
        DJNZ    SHV
        RET

ROTXT:  DB      " (read-only)",0
