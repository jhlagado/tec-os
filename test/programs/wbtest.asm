; WBTEST: write/read B:SEQ.DAT's 64 records and RND.DAT's 0/40/100 before CLOSE.
; SEQ uses r*3+1, RND r XOR 5Ah; reads compare all 128 bytes. The successful
; write-behind fixture keeps these reads cached; host tests check the card
; after warm boot. Setup/delete/make/close statuses are ignored.
; WB OK means the explicit write/read/pattern predicates reached success;
; WB BAD S/R selects the failing file.

BDOS    EQU     $0005

        ORG     $0100
        LD      SP,STACK
        LD      DE,SEQ          
        CALL    FRESH
        XOR     A
        LD      (REC),A
SQW:    LD      A,(REC)
        CALL    FILLS
        LD      C,21
        CALL    FCALL
        JP      NZ,BADS
        LD      A,(REC)
        INC     A
        LD      (REC),A
        CP      64
        JR      C,SQW
        XOR     A
        LD      (REC),A
SQR:    LD      A,(REC)
        CALL    SETR
        LD      C,33
        CALL    FCALL
        JP      NZ,BADS
        LD      A,(REC)
        CALL    PATS
        CALL    CHECK
        JP      NZ,BADS
        LD      A,(REC)
        INC     A
        LD      (REC),A
        CP      64
        JR      C,SQR
        LD      C,16
        CALL    FCALL
        LD      DE,RND          
        CALL    FRESH
        LD      HL,RECS
RNW:    LD      A,(HL)
        CP      $FF
        JR      Z,RNR0
        PUSH    HL
        CALL    SETR
        POP     HL
        PUSH    HL
        LD      A,(HL)
        CALL    FILLR
        LD      C,34
        CALL    FCALL
        POP     HL
        JR      NZ,BADR
        INC     HL
        JR      RNW
RNR0:   LD      HL,RECS
RNR:    LD      A,(HL)
        CP      $FF
        JR      Z,RDONE
        PUSH    HL
        CALL    SETR
        LD      C,33
        CALL    FCALL
        POP     HL
        JR      NZ,BADR
        LD      A,(HL)
        PUSH    HL
        CALL    PATR
        CALL    CHECK
        POP     HL
        JR      NZ,BADR
        INC     HL
        JR      RNR
RDONE:  LD      C,16
        CALL    FCALL
        LD      DE,OK
        JR      SAY
BADS:   LD      DE,BADSM
        JR      SAY
BADR:   LD      DE,BADRM
SAY:    LD      C,9
        CALL    BDOS
        JP      0

; Copy the 12-byte name at DE, clear the other 24 FCB bytes and set DMA BUF,
; then attempt DELETE/MAKE. Main ignores their returned status.
FRESH:  LD      HL,FCB
        EX      DE,HL
        LD      BC,12
        LDIR
        XOR     A
        LD      B,24
FR1:    LD      (DE),A
        INC     DE
        DJNZ    FR1
        LD      DE,BUF
        LD      C,26
        CALL    BDOS
        LD      C,19
        CALL    FCALL
        LD      C,22
; BDOS function C on FCB: NZ unless it returned 0.
FCALL:  LD      DE,FCB
        CALL    BDOS
        OR      A
        RET

; The random record field := A.
SETR:   LD      (FCB+33),A
        XOR     A
        LD      (FCB+34),A
        LD      (FCB+35),A
        RET

; BUF filled with record A's byte: A * 3 + 1 (FILLS), A XOR 5Ah (FILLR);
; PATS and PATR set the byte in PAT only.
PATS:   LD      B,A
        ADD     A,A
        ADD     A,B
        INC     A
        LD      (PAT),A
        RET
PATR:   XOR     $5A
        LD      (PAT),A
        RET
FILLS:  CALL    PATS
        JR      FILL
FILLR:  CALL    PATR
FILL:   LD      HL,BUF
        LD      B,128
FL1:    LD      (HL),A
        INC     HL
        DJNZ    FL1
        RET

; Z if every byte of BUF is PAT.
CHECK:  LD      A,(PAT)
        LD      HL,BUF
        LD      B,128
CK1:    CP      (HL)
        RET     NZ
        INC     HL
        DJNZ    CK1
        RET

SEQ:    DB      2,"SEQ     DAT"
RND:    DB      2,"RND     DAT"
RECS:   DB      0,40,100,$FF
OK:     DB      "WB OK",13,10,"$"
BADSM:  DB      "WB BAD S",13,10,"$"
BADRM:  DB      "WB BAD R",13,10,"$"
REC:    DB      0
PAT:    DB      0
FCB:    DS      36
BUF:    DS      128
        DS      64
STACK:
