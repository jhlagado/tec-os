; NPR: test BIOS WRITE's no-pre-read key after allocation-block reuse.
; B: has OLD.DAT (16 records) after BIG.DAT (24 KiB, larger than the cache).
; Read BIG, cache OLD record 5, then reuse OLD's block for G. Write G's
; record 0 to clear block N and record 5 into N+1's cached line. H's directory
; write flushes; reading BIG evicts N+1. A later write to G record 6 must keep
; record 5: a stale key for N would clear N+1. Keeping another block's bytes
; must invalidate that key.
; Prints NPR OK when record 5's first byte is 55h, NPR BAD otherwise. Setup,
; random-I/O and close statuses are ignored; BIGRD accepts any nonzero end.
; Tests separately check full records and unwritten zeros, behind and through.

BDOS    EQU     $0005

        ORG     $0100
        LD      SP,STACK
        CALL    BIGRD
        LD      HL,ONAME
        CALL    SETF
        LD      C,15
        CALL    FCALL
        LD      A,5
        CALL    SETR
        LD      C,33
        CALL    FCALL
        LD      C,19
        CALL    FCALL
        LD      HL,GNAME
        CALL    SETF
        LD      C,22
        CALL    FCALL
        LD      A,0
        LD      E,$11
        CALL    WREC
        LD      A,5
        LD      E,$55
        CALL    WREC
        LD      HL,HNAME
        CALL    SETF2
        LD      DE,FCB2
        LD      C,22
        CALL    BDOS
        LD      DE,FCB2
        LD      C,16
        CALL    BDOS
        CALL    BIGRD
        LD      A,6
        LD      E,$66
        CALL    WREC
        LD      A,5
        CALL    SETR
        LD      C,33
        CALL    FCALL
        LD      A,(BUF)
        CP      $55
        LD      DE,BAD
        JR      NZ,SAY
        LD      C,16
        CALL    FCALL
        LD      DE,OK
SAY:    LD      C,9
        CALL    BDOS
        JP      0

; Read BIG through FCB2/BUF2 until any nonzero status, then restore DMA BUF.
; OPEN status is ignored; there is no EOF/error distinction or explicit close.
BIGRD:  LD      HL,BNAME
        CALL    SETF2
        LD      DE,BUF2
        LD      C,26
        CALL    BDOS
        LD      DE,FCB2
        LD      C,15
        CALL    BDOS
BR:     LD      DE,FCB2
        LD      C,20
        CALL    BDOS
        OR      A
        JR      Z,BR
        LD      DE,BUF
        LD      C,26
        JP      BDOS

; Fill BUF with E and attempt record A's random write; callers ignore status.
WREC:   PUSH    DE
        CALL    SETR
        POP     DE
        LD      HL,BUF
        LD      B,128
WR1:    LD      (HL),E
        INC     HL
        DJNZ    WR1
        LD      C,34
; BDOS function C on FCB.
FCALL:  LD      DE,FCB
        JP      BDOS
SETR:   LD      (FCB+33),A
        XOR     A
        LD      (FCB+34),A
        LD      (FCB+35),A
        RET
; Copy the name at HL into FCB (SETF)
; or FCB2 (SETF2), clearing the rest.
SETF:   LD      DE,FCB
        JR      SETX
SETF2:  LD      DE,FCB2
SETX:   LD      BC,12
        LDIR
        XOR     A
        LD      B,24
SETX1:  LD      (DE),A
        INC     DE
        DJNZ    SETX1
        RET

ONAME:  DB      2,"OLD     DAT"
GNAME:  DB      2,"G       DAT"
HNAME:  DB      2,"H       DAT"
BNAME:  DB      2,"BIG     DAT"
OK:     DB      "NPR OK",13,10,"$"
BAD:    DB      "NPR BAD",13,10,"$"
FCB:    DS      36
FCB2:   DS      36
BUF:    DS      128
BUF2:   DS      128
        DS      64
STACK:
