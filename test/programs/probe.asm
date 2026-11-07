; PROBE.COM: sixteen BDOS file checks, reporting Tnn ok/FAIL then DONE.
; Uses the default FCB/DMA and a writable B:. Checks share user/drive/file
; state; a fatal BDOS error can warm boot before later reports.
; T14 attempts U3.DAT cleanup with unchecked erase status; T16 checks
; PROBE2.DAT deletion. An ok result does not promise all cleanup.

BDOS    EQU     $0005
FCB     EQU     $005C
DMA     EQU     $0080
NREC    EQU     300             ; crosses two extent boundaries

        ORG     $0100
        LD      SP,STACK

; T01 BDOS version 2.2
T01:
        LD      C,12
        CALL    BDOS
        LD      A,L
        CP      $22
        CALL    RESULT

; T02 make PROBE.DAT
T02:
        LD      HL,NPROBE
        CALL    SETFCB
        LD      C,19
        CALL    FCBCALL
        LD      C,22
        CALL    FCBCALL
        INC     A
        CALL    NZOK

; T03 write NREC records: bytes 0-1 hold the record number, the rest its low byte
T03:
        LD      HL,0
        LD      (RECNO),HL
.WR:    CALL    FILLREC
        LD      C,21
        CALL    FCBCALL
        OR      A
        JR      NZ,.WRF
        LD      HL,(RECNO)
        INC     HL
        LD      (RECNO),HL
        LD      DE,NREC
        OR      A
        SBC     HL,DE
        JR      NZ,.WR
        XOR     A
.WRF:   CALL    RESULT

; T04 close
T04:
        LD      C,16
        CALL    FCBCALL
        INC     A
        CALL    NZOK

; T05 reopen and read every record back, then end of file
T05:
        LD      HL,NPROBE
        CALL    SETFCB
        LD      C,15
        CALL    FCBCALL
        INC     A
        JR      Z,.RDF
        LD      HL,0
        LD      (RECNO),HL
.RD:    LD      C,20
        CALL    FCBCALL
        OR      A
        JR      NZ,.RDF
        CALL    CHKREC
        JR      NZ,.RDF
        LD      HL,(RECNO)
        INC     HL
        LD      (RECNO),HL
        LD      DE,NREC
        OR      A
        SBC     HL,DE
        JR      NZ,.RD
        LD      C,20
        CALL    FCBCALL
        CP      1
        JR      .RDR
.RDF:   OR      1
.RDR:   CALL    RESULT

; T06 random read of record 200
T06:
        LD      HL,200
        CALL    RNDREAD
        CALL    RESULT

; T07 random write of record 5, then records 4, 5 and 6 read back: the
; neighbours share its 512-byte SD block and must be unchanged
; Records 4/6 use the full pattern check; record 5 checks only byte 2.
T07:
        LD      HL,5
        LD      (RECNO),HL
        CALL    FILLREC
        LD      A,$A5
        LD      (DMA+2),A
        LD      HL,5
        LD      (FCB+33),HL
        XOR     A
        LD      (FCB+35),A
        LD      C,34
        CALL    FCBCALL
        OR      A
        JR      NZ,.RWF
        LD      HL,4
        CALL    RNDREAD
        JR      NZ,.RWF
        LD      HL,6
        CALL    RNDREAD
        JR      NZ,.RWF
        LD      HL,5
        LD      (FCB+33),HL
        LD      C,33
        CALL    FCBCALL
        OR      A
        JR      NZ,.RWF
        LD      A,(DMA+2)
        CP      $A5
.RWF:   CALL    RESULT

; T08 compare file size's low 16 bits with NREC; r2 and A are not checked.
T08:
        LD      C,35
        CALL    FCBCALL
        LD      HL,(FCB+33)
        LD      DE,NREC
        OR      A
        SBC     HL,DE
        CALL    RESULT

; T09 write sparse record 1000; T10 closes, reopens and checks its size.
T09:
        LD      HL,1000
        LD      (RECNO),HL
        CALL    FILLREC
        LD      HL,1000
        LD      (FCB+33),HL
        XOR     A
        LD      (FCB+35),A
        LD      C,34
        CALL    FCBCALL
        OR      A
        CALL    RESULT

; T10 close, reopen: the size is 1001 records. Function 35 reads the
; directory, which records the new extent's length only when it is closed,
; as in CP/M 2.2.
T10:
        LD      C,16
        CALL    FCBCALL
        INC     A
        JR      Z,.SZF
        LD      HL,NPROBE
        CALL    SETFCB
        LD      C,15
        CALL    FCBCALL
        INC     A
        JR      Z,.SZF
        LD      C,35
        CALL    FCBCALL
        LD      HL,(FCB+33)
        LD      (SIZEW),HL
        LD      DE,1001
        OR      A
        SBC     HL,DE
        JR      .SZR
.SZF:   OR      1
.SZR:   CALL    RESULT

; T11 the sparse record and record 0 read back, then close
T11:
        LD      HL,1000
        CALL    RNDREAD
        JR      NZ,.SPF
        LD      HL,0
        CALL    RNDREAD
        JR      NZ,.SPF
        LD      C,16
        CALL    FCBCALL
        INC     A
        JR      Z,.SPF
        XOR     A
        JR      .SPR
.SPF:   OR      1
.SPR:   CALL    RESULT

; T12 rename PROBE.DAT to PROBE2.DAT; the old name no longer opens
T12:
        LD      HL,NPROBE
        CALL    SETFCB
        LD      HL,NPROBE2
        LD      DE,FCB+16
        LD      BC,12
        LDIR
        LD      C,23
        CALL    FCBCALL
        INC     A
        JR      Z,.RNF
        LD      HL,NPROBE
        CALL    SETFCB
        LD      C,15
        CALL    FCBCALL
        INC     A
        JR      NZ,.RNF
        XOR     A
        JR      .RNR
.RNF:   OR      1
.RNR:   CALL    RESULT

; T13 search with wildcards finds PROBE2.DAT
T13:
        LD      HL,NWILD
        CALL    SETFCB
        LD      C,17
        CALL    FCBCALL
        INC     A
        JR      Z,.SRF
        DEC     A               ; directory code 0-3: entry in the DMA buffer
        ADD     A,A
        ADD     A,A
        ADD     A,A
        ADD     A,A
        ADD     A,A
        LD      L,A
        LD      H,0
        LD      DE,DMA+1
        ADD     HL,DE
        LD      DE,NPROBE2+1
        LD      B,11
.SRC:   LD      A,(DE)
        CP      (HL)
        JR      NZ,.SRF
        INC     HL
        INC     DE
        DJNZ    .SRC
        XOR     A
        JR      .SRR
.SRF:   OR      1
.SRR:   CALL    RESULT

; T14 check user 3 isolation. CLOSE is unchecked; after MAKE/isolation pass,
; attempt unchecked erase, restore user 0 and force ok. This does not check
; whether U3.DAT was erased; earlier failure may leave user 3 selected.
T14:
        LD      E,3
        LD      C,32
        CALL    BDOS
        LD      HL,NU3
        CALL    SETFCB
        LD      C,22
        CALL    FCBCALL
        INC     A
        JR      Z,.USF
        LD      C,16
        CALL    FCBCALL
        LD      E,0
        LD      C,32
        CALL    BDOS
        LD      HL,NU3
        CALL    SETFCB
        LD      C,15
        CALL    FCBCALL
        INC     A
        JR      NZ,.USF
        LD      E,3
        LD      C,32
        CALL    BDOS
        LD      HL,NU3
        CALL    SETFCB
        LD      C,19
        CALL    FCBCALL
        LD      E,0
        LD      C,32
        CALL    BDOS
        XOR     A
        JR      .USR
.USF:   OR      1
.USR:   CALL    RESULT

; T15 drive B: select it, make and close a file, return to A
; Failed predicates can leave B selected.
T15:
        LD      E,1
        LD      C,14
        CALL    BDOS
        LD      C,25
        CALL    BDOS
        CP      1
        JR      NZ,.DBF
        LD      HL,NBFILE
        CALL    SETFCB
        LD      C,19
        CALL    FCBCALL
        LD      C,22
        CALL    FCBCALL
        INC     A
        JR      Z,.DBF
        LD      C,16
        CALL    FCBCALL
        INC     A
        JR      Z,.DBF
        LD      E,0
        LD      C,14
        CALL    BDOS
        XOR     A
        JR      .DBR
.DBF:   OR      1
.DBR:   CALL    RESULT

; T16 delete PROBE2.DAT; it no longer opens
T16:
        LD      HL,NPROBE2
        CALL    SETFCB
        LD      C,19
        CALL    FCBCALL
        INC     A
        JR      Z,.DLF
        LD      HL,NPROBE2
        CALL    SETFCB
        LD      C,15
        CALL    FCBCALL
        INC     A
        JR      NZ,.DLF
        XOR     A
        JR      .DLR
.DLF:   OR      1
.DLR:   CALL    RESULT

        LD      DE,MDONE
        LD      C,9
        CALL    BDOS
        LD      C,0
        JP      BDOS

; Copy the 12-byte name at HL to the default FCB and clear the rest.
SETFCB: LD      DE,FCB
        LD      BC,12
        LDIR
        LD      B,24
        XOR     A
.Z:     LD      (DE),A
        INC     DE
        DJNZ    .Z
        RET

FCBCALL:LD      DE,FCB
        JP      BDOS

; Fill the DMA record for record RECNO.
FILLREC:LD      HL,(RECNO)
        LD      (DMA),HL
        LD      A,L
        LD      HL,DMA+2
        LD      B,126
.F:     LD      (HL),A
        INC     HL
        DJNZ    .F
        RET

; Z when the DMA record matches FILLREC's pattern for RECNO.
CHKREC: LD      HL,(DMA)
        LD      DE,(RECNO)
        OR      A
        SBC     HL,DE
        RET     NZ
        LD      A,E
        LD      HL,DMA+2
        LD      B,126
.C:     CP      (HL)
        RET     NZ
        INC     HL
        DJNZ    .C
        RET

; Random-read record HL and check its pattern. Z on success.
RNDREAD:LD      (RECNO),HL
        LD      (FCB+33),HL
        XOR     A
        LD      (FCB+35),A
        LD      C,33
        CALL    FCBCALL
        OR      A
        RET     NZ
        JR      CHKREC

NZOK:   JR      Z,RESULTF
        XOR     A
        JR      RESULT
RESULTF:OR      1
; Print "Tnn ok" for Z or "Tnn FAIL" for NZ.
RESULT: PUSH    AF
        LD      A,(TESTNO)
        ADD     A,1
        DAA
        LD      (TESTNO),A
        LD      E,'T'
        CALL    PUTC
        LD      A,(TESTNO)
        RRCA
        RRCA
        RRCA
        RRCA
        AND     $0F
        ADD     A,'0'
        LD      E,A
        CALL    PUTC
        LD      A,(TESTNO)
        AND     $0F
        ADD     A,'0'
        LD      E,A
        CALL    PUTC
        POP     AF
        LD      DE,MOK
        JR      Z,.P
        LD      DE,MFAIL
.P:     LD      C,9
        JP      BDOS

PUTC:   LD      C,2
        JP      BDOS

TESTNO: DB      0
RECNO:  DW      0
SIZEW:  DW      0
NPROBE: DB      0,"PROBE   DAT"
NPROBE2:DB      0,"PROBE2  DAT"
NWILD:  DB      0,"????????DAT"
NU3:    DB      0,"U3      DAT"
NBFILE: DB      0,"BFILE   DAT"
MOK:    DB      " ok",13,10,"$"
MFAIL:  DB      " FAIL",13,10,"$"
MDONE:  DB      "DONE",13,10,"$"
        DS      64
STACK:
