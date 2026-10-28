; NPR: the case BIOS WRITE's no-pre-read rule must get right on a volume
; written behind. B: holds BIG.DAT, larger than the cache, and OLD.DAT,
; 16 records in the allocation block after it.
;
; BIG.DAT is read through, so no line holds OLD.DAT; OLD.DAT's record 5 is
; read, so its SD block N+1 has a line; OLD.DAT is erased, and G.DAT made,
; which takes OLD.DAT's allocation block. G.DAT's record 0 is its first
; write there, so block N is cleared, not read, and the rule's key names N.
; Record 5 is written into N+1's line. H.DAT is made and closed: a directory
; write, which writes every dirty line. BIG.DAT is read through again, so
; N+1's line goes. Then record 6, in N+1, is written: with the key still
; naming N, the rule would clear N+1 and lose record 5.
; Prints "NPR OK" if record 5 reads back as written, "NPR BAD" otherwise.

BDOS    EQU     $0005

        ORG     $0100
        LD      SP,STACK
        CALL    BIGRD
        LD      HL,ONAME        ; OLD.DAT's record 5
        CALL    SETF
        LD      C,15
        CALL    FCALL
        LD      A,5
        CALL    SETR
        LD      C,33
        CALL    FCALL
        LD      C,19            ; and OLD.DAT erased
        CALL    FCALL
        LD      HL,GNAME
        CALL    SETF
        LD      C,22
        CALL    FCALL
        LD      A,0             ; record 0: the block's first write
        LD      E,$11
        CALL    WREC
        LD      A,5             ; record 5, into N+1's line
        LD      E,$55
        CALL    WREC
        LD      HL,HNAME        ; a directory write
        CALL    SETF2
        LD      DE,FCB2
        LD      C,22
        CALL    BDOS
        LD      DE,FCB2
        LD      C,16
        CALL    BDOS
        CALL    BIGRD           ; N+1's line taken
        LD      A,6             ; record 6, in N+1 again
        LD      E,$66
        CALL    WREC
        LD      A,5             ; record 5 still as written?
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

; BIG.DAT read through with FCB2, then the DMA back at BUF.
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

; Record A written by random write with every byte E.
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
; The name at HL into FCB (SETF) or FCB2 (SETF2), the rest cleared.
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
