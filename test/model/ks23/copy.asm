; TEC-OS: COPY SOURCE DEST copies a file a record at a time through the
; default DMA record, as COPY.COM does: open the source, erase and make the
; destination, read and write to the end, close, and print COPIED nnnn
; (records, hex) or the same error text. Nothing in the TPA is touched.
; DEST may be a drive alone, or a blank name with a type: the source's whole
; name is used. Both names carry their drive, the current one if none was
; given, and a destination that names the source is a bad command, with
; nothing opened.
; Parse the next name at HL into the FCB at DE, unambiguous (CPNAME); parse
; it (CPPARSE), keeping DE, with the current drive in a 0 drive byte; check
; the FCB just parsed is unambiguous (CPCHK). A bad command otherwise.
; PARSEFCB clears the rest of the FCB.
CPNAME:
        CALL    CPPARSE
CPCHK:
        CALL    UNAMBIG
        JR      C,CPBAD
        RET
CPPARSE:
        CALL    SKIPSP
        PUSH    DE
        CALL    PARSEFCB
        POP     DE
        JR      C,CPBAD
        LD      A,(DE)
        OR      A
        RET     NZ
        LD      A,(BOOTDRV)
        INC     A
        LD      (DE),A
        RET

CMDCOPY:
        LD      HL,(ARGSTRT)
        LD      DE,CMDFCB
        CALL    CPNAME
        LD      DE,RENFCB
        CALL    CPPARSE         ; DE kept
        INC     DE
        LD      A,(DE)
        CP      SPACE
        JR      NZ,CPD1
        LD      HL,CMDFCB+1     ; a drive alone: the source's name
        LD      BC,11
        LDIR
CPD1:
        CALL    CPCHK
        LD      HL,CMDFCB       ; the source itself?
        LD      DE,RENFCB
        LD      B,12
CPSAME:
        LD      A,(DE)
        CP      (HL)
        JR      NZ,CPGO
        INC     HL
        INC     DE
        DJNZ    CPSAME
CPBAD:
        JP      BADCMD
CPGO:
        LD      DE,DEFDMA
        LD      C,26
        CALL    BDOS
        LD      C,15
        CALL    CPSRC
        INC     A
        LD      DE,CPNOSRC
        JR      Z,CPFAIL
        LD      C,19
        CALL    CPDST
        LD      C,22
        CALL    CPDST
        INC     A
        LD      DE,CPNODST
        JR      Z,CPFAIL
        LD      HL,0
        LD      (DIRNUM),HL
CPLOOP:
        LD      C,20
        CALL    CPSRC
        OR      A
        JR      NZ,CPDONE
        LD      C,21
        CALL    CPDST
        OR      A
        LD      DE,CPWRITE
        JR      NZ,CPFAIL
        LD      HL,(DIRNUM)
        INC     HL
        LD      (DIRNUM),HL
        JR      CPLOOP
CPDONE:
        LD      C,16
        CALL    CPDST
        INC     A
        LD      DE,CPCLOSE
        JR      Z,CPFAIL
        LD      DE,CPCOPIED
        CALL    PUTSTR
        LD      A,(DIRNUM+1)
        CALL    CPHEX
        LD      A,(DIRNUM)
        CALL    CPHEX
        LD      DE,CRLFMSG
CPFAIL:
        CALL    PUTSTR
        JP      STARTED

; BDOS function C on the source or the destination.
CPSRC:
        LD      DE,CMDFCB
        JP      BDOS
CPDST:
        LD      DE,RENFCB
        JP      BDOS

CPHEX:
        PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    CPNIB
        POP     AF
CPNIB:
        AND     $0F
        ADD     A,$90
        DAA
        ADC     A,$40
        DAA
        LD      E,A
        JP      PUTCHAR

