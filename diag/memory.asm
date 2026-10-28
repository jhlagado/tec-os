; RAM, ROM, boot overlay, PROTECT, the latch read-back, the status port and
; the bank field.

; ---- Pattern test -------------------------------------------------------------

; Test BC bytes from HL with E passes and record the outcome at IX: status
; (0 pass, 1 fail), failing address, value written, value read. Pass 0
; writes L xor H, pass 1 its complement, pass 2 L+H and pass 3 its
; complement, so every bit is written both ways and two addresses that alias
; read back each other's values. Returns Z on a pass.
MEMTST: LD      D,0
MEMTP:  PUSH    DE
        LD      E,0             ; E = the complement mask for this pass
        BIT     0,D
        JR      Z,MEMTK
        DEC     E
MEMTK:  PUSH    BC
        PUSH    HL
        BIT     1,D
        JR      NZ,MEMTA
        CALL    MFILLX
        JR      MEMTV
MEMTA:  CALL    MFILLA
MEMTV:  POP     HL
        POP     BC
        PUSH    BC
        PUSH    HL
        BIT     1,D
        JR      NZ,MEMTB
        CALL    MVERX
        JR      MEMTC
MEMTB:  CALL    MVERA
MEMTC:  POP     HL
        POP     BC
        POP     DE
        RET     NZ
        INC     D
        LD      A,D
        CP      E
        JR      NZ,MEMTP
        XOR     A
        LD      (IX+0),A
        RET

MFILLX: LD      A,L
        XOR     H
        XOR     E
        LD      (HL),A
        INC     HL
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,MFILLX
        RET
MFILLA: LD      A,L
        ADD     A,H
        XOR     E
        LD      (HL),A
        INC     HL
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,MFILLA
        RET
MVERX:  LD      A,L
        XOR     H
        XOR     E
        CP      (HL)
        JR      NZ,MVBAD
        INC     HL
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,MVERX
        RET
MVERA:  LD      A,L
        ADD     A,H
        XOR     E
        CP      (HL)
        JR      NZ,MVBAD
        INC     HL
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,MVERA
        RET
MVBAD:  LD      (IX+3),A
        LD      A,(HL)
        LD      (IX+4),A
        LD      (IX+1),L
        LD      (IX+2),H
        LD      A,1
        LD      (IX+0),A
        OR      A               ; NZ
        RET

; ---- RAM ----------------------------------------------------------------------

; Run the three RAM tests before anything is recorded: the report buffer
; is in the RAM under test. The outcomes are kept in RRLO, RRWIN, RRHOME.
RAMTST: LD      HL,0            ; fixed RAM below the variables
        LD      BC,VARS
        LD      E,4
        LD      IX,RRLO
        CALL    MEMTST
        LD      HL,$45ED        ; RETN at 0066h again at once
        LD      (NMIVEC),HL
        LD      A,LATSHAD       ; the window as the base mapping
        CALL    SETLAT
        LD      HL,WINDOW
        LD      BC,$4000
        LD      E,4
        LD      IX,RRWIN
        CALL    MEMTST
        LD      A,2             ; the variables page: not run yet
        LD      (RRHOME),A
        LD      A,(RRWIN)
        OR      A
        RET     NZ              ; it is tested from a copy in the window
        ; Copy 7E00h-7FFFh to 8000h, move the stack into the copy, test the
        ; original, then copy everything back. The outcome is written into
        ; the copy so it survives the copy back.
        LD      HL,VARS
        LD      DE,WINDOW
        LD      BC,$0200
        LDIR
        LD      HL,WINDOW-VARS
        ADD     HL,SP
        LD      SP,HL
        LD      HL,VARS
        LD      BC,$0200
        LD      E,4
        LD      IX,RRHOME+WINDOW-VARS
        CALL    MEMTST
        LD      HL,WINDOW
        LD      DE,VARS
        LD      BC,$0200
        LDIR
        LD      HL,VARS-WINDOW
        ADD     HL,SP
        LD      SP,HL
        RET

; Record T02-T04.
RAMREP: CALL    TBEGIN
        DB      2,"RAMLO  ","Fixed RAM 0000h-7DFFh, 4 pattern passes",0
        LD      IX,RRLO
        CALL    RAMRES
        CALL    TBEGIN
        DB      3,"RAMWIN ","Window RAM 8000h-BFFFh, EXPAND off, 4 passes",0
        LD      IX,RRWIN
        CALL    RAMRES
        CALL    TBEGIN
        DB      4,"RAMHOME","RAM 7E00h-7FFFh again, 4 passes, stack in the window",0
        LD      IX,RRHOME
        ; fall through

; Report the outcome at IX.
RAMRES: LD      A,(IX+0)
        CP      2
        JR      Z,RAMRS
        OR      A
        JR      NZ,RAMRF
        CALL    RESULT
        CALL    PRI
        DB      "all bits both ways, no aliasing",0
        JP      REND
RAMRS:  LD      A,RSKIP
        CALL    RESULT
        CALL    PRI
        DB      "window RAM failed",0
        JP      REND
RAMRF:  LD      A,RFAIL
        CALL    RESULT
        ; fall through

; Print " at hhhh wrote xx read yy bits zz" from the outcome at IX.
RAMBAD: CALL    PRI
        DB      "at ",0
        LD      L,(IX+1)
        LD      H,(IX+2)
        CALL    PRHL
        CALL    PRI
        DB      " wrote ",0
        LD      A,(IX+3)
        CALL    PRHEX
        CALL    PRI
        DB      " read ",0
        LD      A,(IX+4)
        CALL    PRHEX
        CALL    PRI
        DB      " bad bits ",0
        LD      A,(IX+3)
        XOR     (IX+4)
        CALL    PRHEX
        JP      REND

; ---- ROM ----------------------------------------------------------------------

TROMSUM:CALL    TBEGIN
        DB      5,"ROMSUM ","ROM C000h-FFFDh sums to the word at FFFEh",0
        LD      HL,$C000
        LD      DE,0
        LD      BC,ROMCKS-$C000
TROMS1: LD      A,(HL)
        ADD     A,E
        LD      E,A
        JR      NC,TROMS2
        INC     D
TROMS2: INC     HL
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,TROMS1
        LD      HL,(ROMCKS)
        PUSH    DE
        PUSH    HL
        OR      A
        SBC     HL,DE
        CALL    RESZ
        CALL    PRI
        DB      "sum ",0
        POP     HL
        POP     DE
        PUSH    HL
        EX      DE,HL
        CALL    PRHL
        CALL    PRI
        DB      " stored ",0
        POP     HL
        CALL    PRHL
        JP      REND

TROMWR: CALL    TBEGIN
        DB      6,"ROMWR  ","Writes to ROM are ignored",0
        LD      HL,ROMWT
        LD      A,(HL)
        CPL
ROMWTW: LD      (HL),A          ; the deliberate ROM write
        LD      A,(HL)
        CP      $A5
        CALL    RESZ
        CALL    PRI
        DB      "wrote 5A at ",0
        LD      HL,ROMWT
        CALL    PRHL
        CALL    PRI
        DB      ", expect A5, read ",0
        LD      A,(ROMWT)
        CALL    PRHEX
        JP      REND
ROMWT:  DB      $A5

; ---- Boot overlay -------------------------------------------------------------

; T07: with /SHADOW low, 07FFh reads the ROM byte at C7FFh and 0800h still
; reads RAM. T08: where a write to 07FFh goes while the
; overlay is on.
TOVL:   CALL    TBEGIN
        DB      7,"OVERLAY","Latch bit 0: ROM C000h-C7FFh appears at 0000h-07FFh",0
        LD      A,($C000+OVLPRB)
        LD      B,A             ; B = ROM byte, C = RAM value before
        CPL
        LD      C,A
        LD      (OVLPRB),A
        LD      A,(ROMSIG)
        CPL
        LD      (OVLPRB+1),A    ; 0800h: not overlaid
        LD      A,(LATCHV)
        AND     $FE
        OUT     (SYSLAT),A      ; overlay on; NMI meets the RETN at C066h
        LD      A,(OVLPRB)
        LD      D,A             ; D = 07FFh read with the overlay on
        LD      A,(OVLPRB+1)
        LD      E,A             ; E = 0800h
        LD      A,B
        XOR     $0F
OVLWT:  LD      (OVLPRB),A      ; the deliberate write under the overlay
        LD      A,(OVLPRB)
        LD      H,A             ; H = 07FFh read back with the overlay on
        LD      A,(LATCHV)
        OUT     (SYSLAT),A      ; overlay off
        LD      A,(OVLPRB)
        LD      L,A             ; L = the RAM at 07FFh now
        LD      (SAVE),BC
        LD      (SAVE+2),DE
        LD      (SAVE+4),HL
        LD      A,D             ; pass: 07FFh read the ROM, 0800h read RAM
        CP      B
        JR      NZ,TOVL1
        LD      A,(ROMSIG)
        CPL
        CP      E
TOVL1:  CALL    RESZ
        CALL    PRI
        DB      "07FF read ",0
        LD      A,(SAVE+3)
        CALL    PRHEX
        CALL    PRI
        DB      " (ROM C7FF ",0
        LD      A,(SAVE+1)
        CALL    PRHEX
        CALL    PRI
        DB      "), 0800 read ",0
        LD      A,(SAVE+2)
        CALL    PRHEX
        CALL    PRI
        DB      " (RAM, expect ",0
        LD      A,(ROMSIG)
        CPL
        CALL    PRHEX
        LD      A,')'
        CALL    OUTC
        CALL    REND

        CALL    TBEGIN
        DB      8,"OVLWR  ","A write to 07FFh with the overlay on",0
        LD      A,RINFO
        CALL    RESULT
        LD      A,(SAVE+1)      ; the value written was ROM xor 0Fh
        XOR     $0F
        LD      B,A
        LD      A,(SAVE+4)      ; L: RAM afterwards
        CP      B
        JR      Z,TOVLR
        LD      HL,SAVE
        CP      (HL)            ; C: RAM before
        JR      Z,TOVLD
        CALL    PRI
        DB      "RAM changed to ",0
        LD      A,(SAVE+4)
        CALL    PRHEX
        JR      TOVLX
TOVLR:  CALL    PRI
        DB      "reaches the RAM underneath",0
        JR      TOVLX
TOVLD:  CALL    PRI
        DB      "is dropped",0
TOVLX:  CALL    PRI
        DB      "; read under overlay ",0
        LD      A,(SAVE+5)      ; H
        CALL    PRHEX
        JP      REND

; ---- PROTECT ------------------------------------------------------------------

; Latch bit 1 should make 4000h-7FFFh read-only and leave 3FFFh writable.
; The stack is in the protected range, so nothing between the two latch
; writes uses it.
TPROT:  CALL    TBEGIN
        DB      9,"PROTECT","Latch bit 1: 4000h-7FFFh read-only, 3FFFh writable",0
        LD      HL,$4000
        LD      A,$5A
        LD      (HL),A
        LD      ($7DFF),A
        LD      ($3FFF),A
        LD      A,(LATCHV)
        OR      LATPROT
        OUT     (SYSLAT),A
        LD      A,$A5
PROTWT: LD      (HL),A
        LD      ($7DFF),A
        LD      ($3FFF),A
        IN      A,(STSPORT)
        LD      E,A             ; status port with PROTECT on, for T11
        LD      B,(HL)
        LD      A,($7DFF)
        LD      C,A
        LD      A,($3FFF)
        LD      D,A
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        LD      (SAVE),BC
        LD      A,D
        LD      (SAVE+3),A
        LD      A,E
        LD      (SAVE+5),A
        LD      A,B
        CP      $5A
        JR      NZ,TPROT1
        LD      A,C
        CP      $5A
        JR      NZ,TPROT1
        LD      A,D
        CP      $A5
TPROT1: CALL    RESZ
        CALL    PRI
        DB      "wrote A5 over 5A, expect 5A 5A A5: 4000 ",0
        LD      A,(SAVE+1)
        CALL    PRHEX
        CALL    PRI
        DB      " 7DFF ",0
        LD      A,(SAVE)
        CALL    PRHEX
        CALL    PRI
        DB      " 3FFF ",0
        LD      A,(SAVE+3)
        CALL    PRHEX
        JP      REND

; ---- Latch read-back and the status port ------------------------------------

; The board documents the latch as write-only; Debug80 lets it be read.
TLATRD: CALL    TBEGIN
        DB      10,"LATCHRD","Reading port FFh after writing it",0
        LD      HL,LATVALS
        LD      DE,SAVE
        LD      B,4
TLAT1:  LD      A,(HL)
        OUT     (SYSLAT),A
        IN      A,(SYSLAT)
        LD      (DE),A
        INC     HL
        INC     DE
        DJNZ    TLAT1
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        LD      A,RINFO
        CALL    RESULT
        LD      HL,LATVALS
        LD      DE,SAVE
        LD      B,4
        LD      C,0             ; values that read back as written
TLAT2:  LD      A,(HL)
        CALL    PRHEX
        LD      A,'>'
        CALL    OUTC
        LD      A,(DE)
        CALL    PRHEX
        CALL    SPACE
        LD      A,(DE)
        CP      (HL)
        JR      NZ,TLAT3
        INC     C
TLAT3:  INC     HL
        INC     DE
        DJNZ    TLAT2
        LD      A,C
        CP      4
        JR      Z,TLAT4
        CALL    PRI
        DB      "write-only",0
        JP      REND
TLAT4:  CALL    PRI
        DB      "reads back",0
        JP      REND
LATVALS:DB      $01,$05,$0D,$81

; Port 03h with the latch at 01h, 03h (PROTECT, read during T09), 05h
; (EXPAND) and 81h (CAPS). The board's documentation puts the Matrix,
; Protect and Expand switches in bits 0-2 and the EXPAND latch bit in bit 3;
; Debug80 shows PROTECT and EXPAND in bits 1-2.
TSTATUS:CALL    TBEGIN
        DB      11,"STATUS ","Port 03h for latch values 01h, 03h, 05h, 81h",0
        IN      A,(STSPORT)
        LD      (SAVE+4),A
        LD      A,LATSHAD+LATEXP
        OUT     (SYSLAT),A
        IN      A,(STSPORT)
        LD      (SAVE+6),A
        LD      A,LATSHAD+LATCAPS
        OUT     (SYSLAT),A
        IN      A,(STSPORT)
        LD      (SAVE+7),A
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        LD      A,RINFO
        CALL    RESULT
        LD      HL,SAVE+4
        LD      DE,LATST
        LD      B,4
TSTS1:  LD      A,(DE)
        INC     DE
        CALL    PRHEX
        LD      A,'>'
        CALL    OUTC
        LD      A,(HL)
        INC     HL
        CALL    PRHEX
        CALL    SPACE
        DJNZ    TSTS1
        CALL    PRI
        DB      "(bit 7 RX, 6 KDA)",0
        JP      REND
LATST:  DB      $01,$03,$05,$81

; ---- Bank field ---------------------------------------------------------------

; Select bank field value A (0-15) with EXPAND on.
BSEL:   RLCA
        RLCA
        RLCA
        OR      LATSHAD+LATEXP
        JP      SETLAT

; Write a tag to each field value from 15 down to 0, then the base mapping
; (EXPAND off), and read every tag back. Values that share RAM read the tag
; of the last one written, so each value maps to the lowest value that shares
; its RAM; the base mapping reads EEh. A tag is checked at 8000h, 8001h and
; BFFFh, so a part-decoded chip shows as no RAM (FFh).
TBANKS: CALL    TBEGIN
        DB      12,"BANKS  ","What each bank field value (latch bits 3-6) selects",0
        LD      B,16
TBNK1:  LD      A,B
        DEC     A
        PUSH    AF
        CALL    BSEL
        POP     AF
        CALL    BTAG
        DJNZ    TBNK1
        LD      A,LATSHAD
        CALL    SETLAT
        LD      A,$EE
        CALL    BTAG
        LD      HL,BANKMAP
        LD      B,0
TBNK2:  LD      A,B
        CALL    BSEL
        CALL    BREAD
        LD      (HL),A
        INC     HL
        INC     B
        LD      A,B
        CP      16
        JR      NZ,TBNK2
        LD      A,LATSHAD
        CALL    SETLAT
        CALL    BREAD
        LD      (SAVE),A        ; the base mapping's own tag
        LD      A,RINFO
        CALL    RESULT
        CALL    PRI
        DB      "field 0-F: ",0
        LD      HL,BANKMAP
        LD      B,16
TBNK3:  LD      A,(HL)
        INC     HL
        CP      $EE
        JR      Z,TBNKB
        CP      16
        JR      NC,TBNKN
        CALL    PRNIB
        JR      TBNK4
TBNKB:  LD      A,'B'
        CALL    OUTC
        JR      TBNK4
TBNKN:  LD      A,'-'
        CALL    OUTC
TBNK4:  DJNZ    TBNK3
        CALL    PRI
        DB      " (B base, - none); ",0
        CALL    NBANKS
        LD      L,A
        LD      H,0
        CALL    PRDEC
        CALL    PRI
        DB      " banks + base",0
        LD      A,(SAVE)
        CP      $EE
        JR      Z,TBNK5
        CALL    PRI
        DB      ", base RAM bad",0
TBNK5:  JP      REND

; Count the field values that own their RAM. Returns A. Destroys DE, HL.
NBANKS: LD      HL,BANKMAP
        LD      DE,0            ; D = value, E = count
NBNK1:  LD      A,(HL)
        INC     HL
        CP      D
        JR      NZ,NBNK2
        INC     E
NBNK2:  INC     D
        LD      A,D
        CP      16
        JR      NZ,NBNK1
        LD      A,E
        RET

; Write tag A at 8000h and BFFFh, and its check byte at 8001h.
BTAG:   LD      (WINDOW),A
        LD      ($BFFF),A
        XOR     $A5
        LD      (WINDOW+1),A
        RET
; Read the tag: A = tag, or FFh if the three bytes disagree.
BREAD:  LD      A,(WINDOW)
        LD      C,A
        LD      A,($BFFF)
        CP      C
        JR      NZ,BREADN
        LD      A,(WINDOW+1)
        XOR     $A5
        CP      C
        RET     Z
BREADN: LD      A,$FF
        RET

; T13: pattern-test each bank found, two passes each.
TBNKRAM:CALL    TBEGIN
        DB      13,"BANKRAM","Each distinct bank, 8000h-BFFFh, 2 passes",0
        XOR     A
        LD      (RRBANK),A
        CALL    NBANKS
        OR      A
        JR      NZ,TBR0
        LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "no expansion banks",0
        JP      REND
TBR0:   LD      B,0
TBR1:   LD      HL,BANKMAP
        LD      A,L
        ADD     A,B
        LD      L,A
        JR      NC,TBR2
        INC     H
TBR2:   LD      A,(HL)
        CP      B
        JR      NZ,TBR3         ; not a bank of its own
        LD      A,B
        LD      (BANKBAD),A
        PUSH    BC
        CALL    BSEL
        LD      HL,WINDOW
        LD      BC,$4000
        LD      E,2
        LD      IX,RRBANK
        CALL    MEMTST
        POP     BC
        JR      NZ,TBR4
TBR3:   INC     B
        LD      A,B
        CP      16
        JR      NZ,TBR1
TBR4:   LD      A,LATSHAD
        CALL    SETLAT
        LD      A,(RRBANK)
        OR      A
        JR      NZ,TBR5
        CALL    RESULT
        CALL    NBANKS
        LD      L,A
        LD      H,0
        CALL    PRDEC
        CALL    PRI
        DB      " banks pass",0
        JP      REND
TBR5:   LD      A,RFAIL
        CALL    RESULT
        CALL    PRI
        DB      "field ",0
        LD      A,(BANKBAD)
        CALL    PRNIB
        CALL    SPACE
        LD      IX,RRBANK
        JP      RAMBAD
