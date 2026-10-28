; The CCP's levels. A nested CCP runs on the same code and work area as its
; parent; what the parent must get back is kept in a context record in
; EXPAND 1, one 38-byte record a level, six levels in the page at LVBASE.
; A record, staged in LOADBUF:
;   +0  the RAM BIOS table's warm-boot target     +2  the one-command flag
;   +3  drive and user (0004h)                    +4  the mounts (DRVIDX)
;   +8  the parent's SP                           +10 the CCP stack, 27 bytes
;   +37 the new level's flag, while the record is built
; Nothing of the TPA is kept: the caller is code that the child level
; leaves alone, the CCP itself or a resident.

LVBASE  EQU     $BE00
LVREC   EQU     38
LEVELS  EQU     6

; From the CCP or a resident: an interactive nested CCP (FF1Ah), or one
; command line at DE (a length byte, then the text) run by a nested CCP
; that then exits by itself (FF1Dh). HL = 0100h, the end of an image that
; is no longer saved; any other HL is refused. Each returns at EXIT with
; HL = BDOS function 108's code, or with carry set if refused.
XCCP:   XOR     A
        JR      CCPIN
XCMD:   LD      A,1
CCPIN:  LD      (LOADBUF+8),SP  ; the caller's, its return address on top
        LD      (PRLN),DE       ; XCMD's line, until the child level reads it
        LD      (LOADBUF+37),A
        LD      A,(CCPLVL)
        CP      LEVELS
        JR      NC,CCPNO
        LD      A,H             ; an image (any HL but 0100h) is refused
        DEC     A
        OR      L
        JR      NZ,CCPNO
        LD      HL,(RAMBIOS+4)
        LD      (LOADBUF),HL
        LD      A,(CCPFLG)
        LD      (LOADBUF+2),A
        LD      A,(CURDSK)
        LD      (LOADBUF+3),A
        LD      HL,DRVIDX
        LD      DE,LOADBUF+4
        LD      BC,MAXDRV
        LDIR
        LD      HL,CSTKBAS      ; the caller's stack above its SP is intact
        LD      DE,LOADBUF+10
        LD      BC,CCPSTN
        LDIR
        LD      A,(CCPLVL)
        INC     A
        LD      (CCPLVL),A
        CALL    LVSLOT
        LD      DE,LOADBUF
        LD      BC,LVREC
        CALL    LVTO1
        LD      A,(LOADBUF+37)
        LD      (CCPFLG),A
        LD      HL,WBOOTR       ; a child's exit comes back to this level
        LD      (RAMBIOS+4),HL
        JP      WBOOTR
CCPNO:  SCF
        RET

; EXIT, and the end of a one-command level: back to the parent with its
; stack, warm-boot entry, mounts, drive and user. Refused at level 0.
XEXIT:  LD      A,(CCPLVL)
        OR      A
        JP      Z,BADCMD
        CALL    LVSLOT
        EX      DE,HL
        LD      HL,LOADBUF
        LD      BC,LVREC
        CALL    LVFROM1
        LD      A,2             ; the parent's mounts: each drive that differs
XEP:    PUSH    AF              ; is unmounted, then given the parent's
        LD      C,0             ; volume; twice, so that a volume the child
XE2:    CALL    XECMP           ; moved to a later drive is free by then
        JR      Z,XE3
        PUSH    BC
        PUSH    DE
        LD      A,1
        CALL    VOLSVC
        POP     DE
        POP     BC
        DEC     E
        JP      M,XE3           ; the parent had none here
        XOR     A
        PUSH    BC
        CALL    VOLSVC
        POP     BC
XE3:    INC     C
        LD      A,C
        CP      MAXDRV
        JR      C,XE2
        POP     AF
        DEC     A
        JR      NZ,XEP
        LD      HL,(LOADBUF)
        LD      (RAMBIOS+4),HL
        LD      A,(LOADBUF+3)
        LD      (CURDSK),A
        RRCA
        RRCA
        RRCA
        RRCA
        AND     $0F
        LD      E,A
        LD      C,32
        CALL    BDOS
        LD      A,(LOADBUF+3)
        AND     $0F
        LD      E,A
        LD      C,14
        CALL    BDOS
        LD      A,(LOADBUF+2)
        LD      (CCPFLG),A
        LD      HL,CCPLVL
        DEC     (HL)
        LD      HL,LOADBUF+10   ; the parent's stack last: this one goes
        LD      DE,CSTKBAS
        LD      BC,CCPSTN
        LDIR
        LD      SP,(LOADBUF+8)
        LD      HL,(PRGCODE)
        OR      A
        RET

; Drive C: E = the record's index + 1, Z if the drive has it now.
XECMP:  LD      HL,LOADBUF+4
        LD      B,0
        ADD     HL,BC
        LD      E,(HL)
        LD      HL,DRVIDX
        ADD     HL,BC
        LD      A,(HL)
        CP      E
        RET

; A = level 1-6: HL = its record in EXPAND 1.
LVSLOT: LD      HL,LVBASE-LVREC
        LD      DE,LVREC
LVSL1:  ADD     HL,DE
        DEC     A
        JR      NZ,LVSL1
        RET

; Copy BC bytes from DE to HL, into EXPAND 1 (LVTO1) or out of it (LVFROM1).
LVTO1:  PUSH    HL
        LD      HL,$0001        ; XMDST bank 1, XMSRC bank 0
        JR      LVCOPY
LVFROM1:PUSH    HL
        LD      HL,$0100        ; XMDST bank 0, XMSRC bank 1
LVCOPY: LD      (XMDST),HL
        POP     HL
        JP      MVCOPY

; The built-ins CCP and UNLOAD.
CMDCCP: XOR     A
        LD      HL,TPA          ; nothing of the CCP's own to save
        CALL    CCPIN
        JP      C,BADCMD
        JP      STARTED
CMDUNL: LD      HL,(PZTOP)
        LD      L,0
        CALL    PRLREM
        JP      NC,STARTED
        JP      BADCMD
