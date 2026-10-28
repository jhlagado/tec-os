; Main sequence: the automatic tests, then the interactive ones if chosen,
; then the report. The report can be printed again at any time afterwards.

START:  LD      SP,BOOTSTK
        LD      HL,VARS         ; clear the variables
        LD      DE,VARS+1
        LD      BC,$FF
        LD      (HL),0
        LDIR
        LD      A,LATSHAD
        LD      (LATCHV),A
        CALL    NMIINS
        IN      A,(STSPORT)     ; the Matrix switch, as TEC-OS reads it
        AND     1
        LD      (MTXON),A
        CALL    LCDINIT
        CALL    LCDHEAD
        LD      B,1
        CALL    LCDROW
        LD      HL,LCDHELLO
        CALL    LCDSTR
        CALL    LCDEOL
        CALL    PRI
        DB      13,10,13,10,"TEC-1G diagnostics ",0
        CALL    PRID
        CALL    PRI
        DB      13,10,"RAM 7E00-7FFF (variables and stack) passed.",13,10
        DB      "Press I, Y or keypad + within 5 s to include the interactive tests.",13,10,0
        LD      A,10
        CALL    GETKEY
        JR      C,STAUTO
        CP      'I'
        JR      Z,STINT
        CP      'Y'
        JR      NZ,STAUTO
STINT:  LD      A,1
        LD      (INTER),A
        CALL    PRI
        DB      "Interactive: visual checks ask Y/N; the hands-on tests follow.",13,10,0
        JR      STRAM
STAUTO: CALL    PRI
        DB      "Automatic tests only.",13,10,0
STRAM:  CALL    PRI
        DB      "RAM tests take about 6 s. Keep off the keypad: its NMI would",13,10
        DB      "land in the RAM under test.",13,10,0
        LD      B,1
        CALL    LCDROW
        LD      HL,LCDRAM
        CALL    LCDSTR
        CALL    LCDEOL
        CALL    RAMTST
        CALL    NMIINS
        LD      HL,RPTBUF
        LD      (RPTP),HL

        CALL    TBEGIN
        DB      1,"HOME   ","RAM 7E00h-7FFFh, before any stack use",0
        LD      A,RPASS
        CALL    RESULT
        CALL    PRI
        DB      "4 passes, registers only",0
        CALL    REND

        CALL    RAMREP
        CALL    TROMSUM
        CALL    TROMWR
        CALL    TOVL
        CALL    TPROT
        CALL    TLATRD
        CALL    TSTATUS
        CALL    TBANKS
        CALL    TBNKRAM
        CALL    TSERTX
        CALL    TLCD
        CALL    TGLCD
        CALL    TVDP
        CALL    TVPAGE
        CALL    TF18A
        CALL    TSD
        CALL    TSDBLK
        CALL    TSDWR
        CALL    TRTC
        CALL    TSEG7
        CALL    TSPKR
        CALL    TRGB
        CALL    TLEDBAR
        CALL    TNMI
        LD      A,(INTER)
        OR      A
        CALL    NZ,INTERACT
DONE:   CALL    PRREP
        LD      B,1
        CALL    LCDROW
        LD      HL,LCDDONE
        CALL    LCDSTR
        CALL    LCDEOL
IDLE:   CALL    PRI
        DB      "R prints the report again; I runs the interactive tests.",13,10,0
IDLE1:  XOR     A
        CALL    GETKEY
        CP      'R'
        JR      Z,DONE
        CP      'I'
        JR      NZ,IDLE1
        CALL    INTERACT
        JR      DONE

INTERACT:
        LD      A,1
        LD      (INTER),A
        CALL    PRI
        DB      13,10,"Interactive tests. Each asks first: N or Esc skips it.",13,10,0
        CALL    TSERRX
        CALL    TSERBIT
        CALL    TKEYPAD
        CALL    TMATRIX
        CALL    TJOY
        CALL    TCLOCK
        JP      TSDTIME

LCDHELLO:DB     "I/+ for interactive",0
LCDRAM: DB      "RAM tests running",0
LCDDONE:DB      "Done: R = report",0

; The NMI counter copied to 0066h: every NMI adds one to NMICNT.
NMITPL: PUSH    AF
        PUSH    HL
        LD      HL,NMICNT
        INC     (HL)
        JR      NZ,NMITP1
        INC     HL
        INC     (HL)
NMITP1: POP     HL
        POP     AF
        RETN
NMITPE:

; Install the NMI counter at 0066h.
NMIINS: LD      HL,NMITPL
        LD      DE,NMIVEC
        LD      BC,NMITPE-NMITPL
        LDIR
        LD      HL,0
        LD      (NMICNT),HL
        RET

; Select latch value A and keep the shadow copy. Preserves everything else.
SETLAT: LD      (LATCHV),A
        OUT     (SYSLAT),A
        RET

