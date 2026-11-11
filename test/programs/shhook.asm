; HOOK.SVC: a probe shell for the ROM's shell hook (test/shell.test.mjs).
; It is the skeleton a shell needs and records what the ROM hands it: an
; execution record that asks to be entered, an entry that claims the hook,
; a LINE entry that prompts with S> and reads a line through BDOS 10, a
; PAGE entry that prints and counts, and HREC and HSTORE entries that count
; their calls. REMOVE gives back the table its first claim replaced. It
; declares no stack, so it fits beside SHELL.SVC and GLCD.SVC.
;
; A test steers it by writing its state: INJ nonzero makes the next LINE
; return INJTXT's 128 bytes as they are, with A = INJORG, in place of a
; typed line; STOP nonzero makes PAGE return carry; RECTXT, when its first
; byte is nonzero, is what HREC shows. Each entry's registers are kept.

%INCLUDE "../../src/abi.inc"
BDOS    EQU     $0005

        ORG     $0100

HDR:    DB      'D',SVCFMT,0,1
        DW      0,0,0,0
        DB      0,0,0           ; stack: BDOS, BIOS, CCP
        DW      0
        DB      "HOOK    "

; The execution record, version 1; state bit 1 asks to be entered on
; install.

EXREC:  DB      "EX",1
EXRDY:  DB      2
        DW      41
EXNAM:  DS      8,' '
        DB      0,1

ENTRY0: JP      ENTRY

; The hook's table, which must not cross a page.

TABLE:  DW      LINE,PAGE,HREC,HSTO

INIT:   LD      H,B
        LD      L,C
        LD      DE,EXNAM
        LD      BC,8
        LDIR                    ; the name the loader read
        LD      HL,EXRDY
        SET     0,(HL)          ; ready, after the name
        LD      HL,0
        XOR     A
        RET

REMOVE: LD      HL,EXRDY
        RES     0,(HL)
        LD      HL,(PREV)       ; the table its first claim replaced
        LD      C,TNSHELL
        CALL    ABICALL
        XOR     A
        RET

; Claim the hook; the first claim keeps the table it replaced.

ENTRY:  LD      (ORIGIN),A
        LD      HL,(CALLS)
        INC     HL
        LD      (CALLS),HL
        LD      HL,TABLE
        LD      C,TNSHELL
        CALL    ABICALL         ; HL = the old table
        LD      A,(CLAIMD)
        OR      A
        RET     NZ
        INC     A
        LD      (CLAIMD),A
        LD      (PREV),HL
        RET

; LINE: A the flags, B and C the lowest owner's page and the stub's, DE
; the buffer. Each is kept, with the SP the ROM called with.

LINE:   LD      (FLAGS),A
        LD      (OWNS),BC
        LD      (BUFP),DE
        LD      (SEENSP),SP
        LD      (SAVSP),SP
        LD      SP,STKTOP
        LD      HL,(LINES)
        INC     HL
        LD      (LINES),HL
        LD      A,(INJ)
        OR      A
        JR      Z,LTYPED
        XOR     A
        LD      (INJ),A         ; once
        LD      HL,INJTXT
        LD      BC,128
        LDIR                    ; all 128 bytes, whatever they hold
        LD      A,(INJORG)
        JR      LDONE

LTYPED: LD      DE,PROMPT
        LD      C,9
        CALL    BDOS
        LD      DE,LBUF
        LD      C,10
        CALL    BDOS
        LD      HL,LBUF+1
        LD      C,(HL)
        LD      B,0
        INC     HL
        LD      DE,(BUFP)
        LD      A,C
        OR      A
        JR      Z,LINE1
        LDIR
LINE1:  XOR     A
        LD      (DE),A          ; zero-ended
LDONE:  LD      SP,(SAVSP)
        RET                     ; A: the origin

; PAGE: print E and count it; carry when STOP is set.

PAGE:   LD      HL,(PAGES)
        INC     HL
        LD      (PAGES),HL
        LD      C,2
        CALL    BDOS
        LD      A,(STOP)
        RRCA                    ; bit 0 to carry
        RET

; HREC: C is ^W or ^N. Carry: nothing to show, unless RECTXT holds a line.

HREC:   LD      (RECKEY),BC
        LD      HL,(RECS)
        INC     HL
        LD      (RECS),HL
        LD      HL,RECTXT
        LD      A,(HL)
        OR      A
        RET     NZ              ; HL: the line to show
        SCF
        RET

; HSTORE: DE the line, B its length.

HSTO:   LD      HL,(STOS)
        INC     HL
        LD      (STOS),HL
        LD      A,B
        LD      (STOLEN),A
        RET

PROMPT: DB      13,10,"S>$"

PREV:   DW      0
ORIGIN: DB      0
CLAIMD: DB      0
FLAGS:  DB      0
OWNS:   DW      0
BUFP:   DW      0
SEENSP: DW      0
SAVSP:  DW      0
CALLS:  DW      0
LINES:  DW      0
PAGES:  DW      0
RECS:   DW      0
RECKEY: DW      0
STOS:   DW      0
STOLEN: DB      0
INJ:    DB      0
INJORG: DB      0
STOP:   DB      0
INJTXT: DS      128
RECTXT: DS      16
LBUF:   DB      127
        DS      129
        DS      32
STKTOP:
