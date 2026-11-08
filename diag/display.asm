; Serial TX, LCD, GLCD and PICO9918.
; T14 sends a pangram and ASCII 20h-7Eh.
; VISUAL gives the answer or LOOK.
; Printed timings: generated nominal T.

TSERTX: CALL    TBEGIN
        DB      14,"SERTX  ","Serial TX at 4800 8N2: two known lines follow",0
        CALL    PRI
        DB      "The quick brown fox jumps over the lazy dog 0123456789",13,10,0
        LD      A,' '
TSTX1:  PUSH    AF
        CALL    OUTC
        POP     AF
        INC     A
        CP      $7F
        JR      NZ,TSTX1
        CALL    CRLF
        CALL    VISUAL
        DB      "Did both lines arrive intact?",0
        CALL    RESULT
        CALL    PRI
        DB      "TX bit ",0
        LD      HL,TXBITC
        CALL    PRDEC
        CALL    PRI
        DB      " T, stop bits ",0
        LD      HL,TXSTOPC
        CALL    PRDEC
        CALL    PRI
        DB      " T",0
        JP      REND

; CALL's return address points at a
; zero-terminated question. Advance it
; past the text in either branch.
; INTER=0: A=LOOK. Else print and use
; ASK1's PASS/FAIL/SKIP answer in A.

VISUAL: EX      (SP),HL
        LD      A,(INTER)
        OR      A
        JR      NZ,VISQ
VISSK:  LD      A,(HL)
        INC     HL
        OR      A
        JR      NZ,VISSK
        EX      (SP),HL
        LD      A,RLOOK
        RET
VISQ:   CALL    PRS
        EX      (SP),HL
        CALL    PRI
        DB      " (Y/N) ",0
        JP      ASK1

; T15: initial busy timeout gives NONE.
; Write/read 20 bytes at row 3, then
; restore diagnostic headings, not the
; prior picture. Zero mismatches pass.
; Later output is not acknowledged by
; the recorded clear-busy count.

TLCD:   CALL    TBEGIN
        DB      15,"LCD    ","HD44780 at 04h/84h: busy flag, DDRAM read-back",0
        CALL    LCDWAIT
        JR      NC,TLCD1
        LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "busy flag never clears",0
        JP      REND

; Clear: typical busy time 1.5 ms.

TLCD1:  LD      A,$01
        OUT     (LCDCMD),A
        CALL    BUSYCNT
        LD      (SAVE),HL
        LD      B,3
        CALL    LCDROW
        LD      HL,LCDPAT
        CALL    LCDSTR
        LD      A,$D4           ; back to row 3, column 0, and read it
        CALL    LCDC
        LD      HL,LCDPAT
        LD      BC,20*256
TLCD2:  CALL    LCDWAIT
        IN      A,(LCDDAT)
        CP      (HL)
        JR      Z,TLCD3
        INC     C
TLCD3:  INC     HL
        DJNZ    TLCD2
        LD      A,C
        LD      (SAVE+2),A
        CALL    LCDHEAD
        LD      B,1
        CALL    LCDTEST
        CALL    LCDEOL
        LD      A,(SAVE+2)
        OR      A
        CALL    RESZ
        CALL    PRI
        DB      "read-back errors ",0
        LD      A,(SAVE+2)
        LD      L,A
        LD      H,0
        CALL    PRDEC
        CALL    PRI
        DB      "/20, clear busy ",0
        CALL    PRPOLLS
        JP      REND
LCDPAT: DB      "LCD READ-BACK 012345",0

; BUSYCNT selects LCD, BUSYGL GLCD.
; HL counts busy reads, up to 4096.
; Ready read is not counted: zero means
; busy never seen. Cap is not readiness.
; Changes AF/C, returns HL.
; Nominal T: busy 50, ready 27, cap 55.
; RET NC: 5 busy/11 ready. Keeps B/DE.

BUSYCNT:LD      C,LCDCMD
BUSYC:  LD      HL,0
BUSYC1: IN      A,(C)           ; 12
        RLCA                    ; 4
        RET     NC              ; 5/11
        INC     HL              ; 6
        LD      A,H             ; 4
        CP      $10             ; 7
        JR      NZ,BUSYC1       ; 12/7
        RET
BUSYGL: LD      C,GLCCMD
        JR      BUSYC

; SAVE: 0=busy never seen, 4096=stuck,
; else count x nominal 50 T busy loops.

PRPOLLS:LD      HL,(SAVE)
        LD      A,H
        OR      L
        JR      NZ,PRPL1
        CALL    PRI
        DB      "never seen",0
        RET
PRPL1:  LD      A,H
        CP      $10
        JR      NZ,PRPL2
        CALL    PRI
        DB      "stuck",0
        RET
PRPL2:  CALL    PRDEC
        CALL    PRI
        DB      " polls x 50 T",0
        RET

; Poll GLCD busy at most 256 times.
; NC ready, C timeout. Changes AF.
; Keeps BC/DE/HL.

GLWAIT: PUSH    BC
        LD      B,0
GLW1:   IN      A,(GLCCMD)
        RLCA
        JR      NC,GLW2
        DJNZ    GLW1
        SCF
GLW2:   POP     BC
        RET

; GLC/GLD keep incoming AF and still
; OUT after timeout, unlike the driver.
; GLRD still reads and keeps wait carry.

GLC:    PUSH    AF
        CALL    GLWAIT
        POP     AF
        OUT     (GLCCMD),A
        RET
GLD:    PUSH    AF
        CALL    GLWAIT
        POP     AF
        OUT     (GLCDAT),A
        RET
GLRD:   CALL    GLWAIT
        IN      A,(GLCDAT)
        RET

; Valid D=0..63: address word 0. Low
; five row bits are vertical, bit 5
; selects the half. Keeps BC/DE/HL.
; Changes AF. GLC's timeout still sends.

GLADDR: LD      A,D
        CP      32
        JR      NC,GLADL
        OR      $80
        CALL    GLC
        LD      A,$80
        JP      GLC
GLADL:  ADD     A,$80-32
        CALL    GLC
        LD      A,$88
        JP      GLC

; D=0..63, E=0..15 -> A. High nibble is
; D&0Fh, low is (E XOR (D>>2))&0Fh.
; Rows 16 apart differ. C used, DE kept.

GLVAL:  LD      A,D
        RRCA
        RRCA
        XOR     E
        AND     $0F
        LD      C,A
        LD      A,D
        RLCA
        RLCA
        RLCA
        RLCA
        AND     $F0
        OR      C
        RET

; D=0..63, E=0..15 -> A, an 8x8
; checkerboard inside a one-pixel frame.
; Keeps DE. Changes AF/C.

GLPAT:  LD      A,D
        OR      A
        JR      Z,GLPF
        CP      63
        JR      Z,GLPF
        RRCA
        RRCA
        RRCA
        ADD     A,E
        AND     1
        JR      Z,GLP1
        LD      A,$FF
GLP1:   LD      C,A
        LD      A,E
        OR      A
        JR      NZ,GLP2
        SET     7,C
GLP2:   CP      15
        JR      NZ,GLP3
        SET     0,C
GLP3:   LD      A,C
        RET
GLPF:   LD      A,$FF
        RET

; Fill the GLCD through GLVAL or GLPAT
; at HL, saved in shared SAVE+6. Write
; 64 rows of 16 bytes. Each callback
; returns A=byte through GLF3 and keeps
; DE. GLD still sends after a timeout.
; Do not re-enter: SAVE+6 is shared.

GLFILL: LD      (SAVE+6),HL
        LD      D,0
GLF1:   CALL    GLADDR
        LD      E,0
GLF2:   LD      HL,GLF3
        PUSH    HL
        LD      HL,(SAVE+6)
        JP      (HL)
GLF3:   CALL    GLD
        INC     E
        LD      A,E
        CP      16
        JR      NZ,GLF2
        INC     D
        LD      A,D
        CP      64
        JR      NZ,GLF1
        RET

; GLCOK marks the initial answer only.
; GLVAL's destructive readback counts
; errors, then GLPAT supplies VISUAL.
; Errors force FAIL, else answer/LOOK.

TGLCD:  CALL    TBEGIN
        DB      16,"GLCD   ","ST7920 at 07h/87h: busy flag, graphics RAM read-back",0
        CALL    GLWAIT
        JR      NC,TGL1
        LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "busy flag never clears",0
        JP      REND
TGL1:   LD      A,1
        LD      (GLCOK),A
        LD      A,$30           ; basic instructions
        CALL    GLC
        LD      A,$0C           ; display on
        CALL    GLC

; Clear: typical busy time 1.6 ms.

        LD      A,$01
        CALL    GLC
        CALL    BUSYGL
        LD      (SAVE),HL
        LD      A,$34           ; extended instructions
        CALL    GLC
        LD      A,$36           ; graphics on
        CALL    GLC
        LD      HL,GLVAL
        CALL    GLFILL
        LD      HL,0
        LD      (VERR),HL
        LD      D,0
TGL2:   CALL    GLADDR
        CALL    GLRD            ; the first read after an address is a dummy
        LD      E,0
TGL3:   CALL    GLRD
        LD      B,A
        CALL    GLVAL
        CP      B
        JR      Z,TGL4
        LD      HL,(VERR)
        INC     HL
        LD      (VERR),HL
TGL4:   INC     E
        LD      A,E
        CP      16
        JR      NZ,TGL3
        INC     D
        LD      A,D
        CP      64
        JR      NZ,TGL2
        LD      HL,GLPAT
        CALL    GLFILL
        LD      HL,(VERR)
        LD      A,H
        OR      L
        JR      Z,TGL5
        LD      A,RFAIL
        JR      TGL6
TGL5:   CALL    VISUAL
        DB      "Does the GLCD show a framed 8 x 8 checkerboard?",0
TGL6:   CALL    RESULT
        CALL    PRI
        DB      "read-back errors ",0
        LD      HL,(VERR)
        CALL    PRDEC
        CALL    PRI
        DB      "/1024, clear busy ",0
        CALL    PRPOLLS
        CALL    PRI
        DB      ", pattern drawn",0
        JP      REND

; VRAM addresses use HL's low 14 bits.
; VWA/VRA keep BC/DE/HL, change AF.
; VPOKE keeps A across write addressing,
; VPEEK returns read A. Paired control
; writes have no interrupt lock.

VWA:    LD      A,L             ; VRAM write address HL
        OUT     (VDPCTL),A
        LD      A,H
        AND     $3F
        OR      $40
        OUT     (VDPCTL),A
        RET
VRA:    LD      A,L             ; VRAM read address HL
        OUT     (VDPCTL),A
        LD      A,H
        AND     $3F
        OUT     (VDPCTL),A
        RET
VPOKE:  PUSH    AF
        CALL    VWA
        POP     AF
        OUT     (VDPDAT),A
        RET
VPEEK:  CALL    VRA
        IN      A,(VDPDAT)
        RET

; Diagnostic 80 cols, names 1000h,
; patterns 0000h, white on dark blue.
; VDP IRQ off. R1/R7=50h/F4h versus
; production D0h/31h (KE398).

VREGS:  LD      HL,VREGT
        LD      BC,8*256+$80
VREG1:  LD      A,(HL)
        OUT     (VDPCTL),A
        LD      A,C
        OUT     (VDPCTL),A
        INC     HL
        INC     C
        DJNZ    VREG1
        RET
VREGT:  DB      $04,$50,$07,$00,$00,$00,$00,$F4
VNAME   EQU     $1000

; Probe success sets VDPOK, not PASS.
; Destructive tests end at TVCLK.

TVDP:   CALL    TBEGIN
        DB      17,"VDP    ","PICO9918 at BEh/BFh: VRAM size, speed, 80 columns",0
        XOR     A
        LD      (VDPOK),A
        LD      HL,$3FFF        ; as TEC-OS detects it
        LD      A,$5A
        CALL    VPOKE
        CALL    VPEEK
        CP      $5A
        JR      NZ,TVDPN
        LD      A,$A5
        CALL    VPOKE
        CALL    VPEEK
        CP      $A5
        JR      Z,TVDP1
TVDPN:  LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "no answer",0
        CALL    REND
        JP      TVCLK
TVDP1:  LD      A,1
        LD      (VDPOK),A
        CALL    VREGS
        LD      HL,0            ; VRAM size: a tag every 4 KiB
        LD      A,$11
        CALL    VPOKE
        LD      HL,$1000
        LD      A,$22
        CALL    VPOKE
        LD      HL,$2000
        LD      A,$33
        CALL    VPOKE
        LD      HL,$3000
        LD      A,$44
        CALL    VPOKE
        LD      DE,SAVE
        LD      HL,0
TVDP2:  CALL    VPEEK
        LD      (DE),A
        INC     DE
        LD      A,H
        ADD     A,$10
        LD      H,A
        CP      $40
        JR      NZ,TVDP2
        LD      HL,0
        LD      (VERR),HL
        CALL    VFAST
        LD      HL,(VERR)
        LD      (SAVE+4),HL
        LD      HL,0
        LD      (VERR),HL
        CALL    VSLOW
        CALL    VTEXT           ; adds name-table read-back errors to VERR

; Pass decision: all tags and both error
; totals must be clean. VTEXT's errors
; belong to the slow total above.

        LD      HL,SAVE
        LD      A,$11
        LD      B,4
TVDP3:  CP      (HL)
        JR      NZ,TVDP4
        INC     HL
        ADD     A,$11
        DJNZ    TVDP3
        LD      HL,(SAVE+4)
        LD      DE,(VERR)
        ADD     HL,DE
        LD      A,H
        OR      L
TVDP4:  JR      Z,TVDP5
        LD      A,RFAIL
        JR      TVDP6
TVDP5:  CALL    VISUAL
        DB      "Does the screen show 80 x 24 text, rulers on rows 2 and 24?",0
TVDP6:  CALL    RESULT
        CALL    PRI
        DB      "tags ",0
        LD      HL,SAVE
        LD      B,4
        CALL    PRBYTES
        CALL    PRI
        DB      " (11 22 33 44 = 16K); errors at 16 T/byte ",0
        LD      HL,(SAVE+4)
        CALL    PRDEC
        CALL    PRI
        DB      ", at 104 T/byte ",0
        LD      HL,(VERR)
        CALL    PRDEC
        CALL    PRI
        DB      " (of 16384, then 1920)",0
        CALL    REND
        JP      TVCLK

; Fill aligned 256-byte VBUFA with low
; index XOR D. INC L wraps to page base.

VBUF:   LD      HL,VBUFA
VBUF1:  LD      A,L
        XOR     D
        LD      (HL),A
        INC     L
        JR      NZ,VBUF1
        RET

; Aligned VBUFB vs index XOR D, add to
; VERR. Keeps BC/DE, HL ends page base.

VCMP:   LD      HL,VBUFB
VCMP1:  LD      A,L
        XOR     D
        CP      (HL)
        JR      Z,VCMP2
        PUSH    HL
        LD      HL,(VERR)
        INC     HL
        LD      (VERR),HL
        POP     HL
VCMP2:  INC     L
        JR      NZ,VCMP1
        RET

; Write/read 64x256 bytes, 80 cols on.
; OUTI/INI bursts: 16 T each, no pacing.
; Group/page work adds time. Initialise
; VERR before this accumulating pass.

VFAST:  LD      HL,0
        CALL    VWA
        LD      D,0
VFW1:   CALL    VBUF
        LD      HL,VBUFA
        LD      BC,VDPDAT       ; B = 0: 256 bytes
VFW2:   OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        OUTI
        JR      NZ,VFW2
        INC     D
        LD      A,D
        CP      $40
        JR      NZ,VFW1
        LD      HL,0
        CALL    VRA
        LD      D,0
VFR1:   LD      HL,VBUFB
        LD      BC,VDPDAT
VFR2:   INI
        INI
        INI
        INI
        INI
        INI
        INI
        INI
        INI
        INI
        INI
        INI
        INI
        INI
        INI
        INI
        JR      NZ,VFR2
        CALL    VCMP
        INC     D
        LD      A,D
        CP      $40
        JR      NZ,VFR1
        RET

; Same 64-page coverage, add to VERR.
; 104 nominal T per nonfinal byte, final
; 5 T less. Page/compare work is extra.

VSLOW:  LD      HL,0
        CALL    VWA
        LD      D,0
VSW1:   CALL    VBUF
        LD      HL,VBUFA
        LD      BC,VDPDAT
VSW2:   LD      A,(HL)          ; 7
        OUT     (C),A           ; 12
        INC     HL              ; 6
        LD      E,4             ; 7
VSW3:   DEC     E               ; 4
        JR      NZ,VSW3         ; 12/7
        DJNZ    VSW2            ; 13/8
        INC     D
        LD      A,D
        CP      $40
        JR      NZ,VSW1
        LD      HL,0
        CALL    VRA
        LD      D,0
VSR1:   LD      HL,VBUFB
        LD      BC,VDPDAT
VSR2:   IN      A,(C)
        LD      (HL),A
        INC     HL
        LD      E,4
VSR3:   DEC     E
        JR      NZ,VSR3
        DJNZ    VSR2
        CALL    VCMP
        INC     D
        LD      A,D
        CP      $40
        JR      NZ,VSR1
        RET

; Upload 256 eight-row patterns: glyphs
; 20h-7Fh, controls as space, high codes
; reversed. Draw/read 1920 names at
; 1000h, add VERR. Patterns not reread.

VTEXT:  LD      HL,0
        CALL    VWA
        LD      D,0
VTP1:   LD      A,D
        AND     $7F
        SUB     $20
        JR      C,VTPB
        LD      L,A
        LD      H,0
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        LD      BC,FONT
        ADD     HL,BC
        JR      VTPG
VTPB:   LD      HL,FONT
VTPG:   LD      B,8
VTP2:   LD      A,(HL)
        BIT     7,D
        JR      Z,VTP3
        CPL
VTP3:   OUT     (VDPDAT),A
        INC     HL
        DJNZ    VTP2
        INC     D
        JR      NZ,VTP1
        LD      HL,VNAME
        CALL    VWA
        LD      B,0
VTS1:   LD      C,0
VTS2:   CALL    VNCH
        OUT     (VDPDAT),A
        INC     C
        LD      A,C
        CP      80
        JR      NZ,VTS2
        INC     B
        LD      A,B
        CP      24
        JR      NZ,VTS1
        LD      HL,VNAME
        CALL    VRA
        LD      B,0
VTR1:   LD      C,0
VTR2:   CALL    VNCH
        LD      E,A
        IN      A,(VDPDAT)
        CP      E
        JR      Z,VTR3
        LD      HL,(VERR)
        INC     HL
        LD      (VERR),HL
VTR3:   INC     C
        LD      A,C
        CP      80
        JR      NZ,VTR2
        INC     B
        LD      A,B
        CP      24
        JR      NZ,VTR1
        RET

; B=0..23, C=0..79 -> A. Keeps BC.
; Rows 0/12 title/reverse, 1/23 rulers,
; else printable. Changes AF/DE/HL.

VNCH:   LD      A,B
        OR      A
        JR      Z,VNTTL
        CP      12
        JR      Z,VNREV
        CP      1
        JR      Z,VNRUL
        CP      23
        JR      Z,VNRUL

; Rows 2..22 except already-branched 12:
; printable characters shifted by 3*B.

        ADD     A,A
        ADD     A,B
        ADD     A,C
VNM:    SUB     95
        JR      NC,VNM
        ADD     A,95+' '
        RET
VNRUL:  LD      A,C             ; 1234567890 repeated
        INC     A
VNR1:   SUB     10
        JR      NC,VNR1
        ADD     A,10+'0'
        RET
VNTTL:  LD      HL,VTITLE
        LD      E,C
        LD      D,0
        ADD     HL,DE
        LD      A,(HL)
        RET
VNREV:  CALL    VNTTL
        OR      $80
        RET
VTITLE: DB      "TEC-1G DIAGNOSTICS: PICO9918 80 x 24 text. Rows 2, 24 rulers; row 13 reversed."
        DS      80-($-VTITLE),' '

; VDPOK: sync, then 16 frames without
; timeout. Frame=(33*polls+123)/16
; nominal T. Polls must fit HL. Known
; refresh gives CPU clock inference.

TVCLK:  CALL    TBEGIN
        DB      18,"VDPCLK ","PICO9918 frame flag as a clock: 16 frames",0
        LD      A,(VDPOK)
        OR      A
        JR      NZ,TVC0
        LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "no PICO9918",0
        JP      REND
TVC0:   IN      A,(VDPCTL)      ; clear the flag
        LD      HL,0

; First sync only: 65535*51+24 nominal T
; with no edge, excluding setup
; (3,342,309 T, KE399).

TVC1:   DEC     HL
        LD      A,H
        OR      L
        JP      Z,TVCN
        IN      A,(VDPCTL)
        RLCA
        JR      NC,TVC1
        LD      HL,0
        LD      B,16
TVC2:   INC     HL              ; 6
        IN      A,(VDPCTL)      ; 11
        RLCA                    ; 4
        JR      NC,TVC2         ; 12
        DJNZ    TVC2
        LD      DE,0
        LD      A,33
        CALL    MUL8
        LD      BC,123
        ADD     HL,BC
        JR      NC,TVC3
        INC     DE
TVC3:   LD      C,16
        CALL    DIV8
        CALL    STDVD
        LD      A,RINFO
        CALL    RESULT
        CALL    PRI
        DB      "frame ",0
        CALL    LDDVD
        CALL    PRD32
        CALL    PRI
        DB      " T; CPU at 50 Hz ",0
        CALL    LDDVD
        LD      A,50
        CALL    MUL8
        CALL    PRD32
        CALL    PRI
        DB      " Hz, at 60 Hz ",0
        CALL    LDDVD
        LD      A,60
        CALL    MUL8
        CALL    PRD32
        CALL    PRI
        DB      " Hz",0
        JP      REND
TVCN:   LD      A,RFAIL
        CALL    RESULT
        CALL    PRI
        DB      "frame flag never set",0
        JP      REND

; Write A to VDP register C=0..63.
; Above 7 needs unlocked F18A extension.
; Keeps BC/DE/HL, changes AF. No unlock,
; validation or interrupt masking here.

VREG:   OUT     (VDPCTL),A
        LD      A,C
        OR      $80
        OUT     (VDPCTL),A
        RET

; Read status register A -> A, VR15=0.
; Changes F/C, keeps B/DE/HL. Plain
; TMS9918 aliases VR15 to R7: caller
; rewrites 0..7, not full prior state.

VSTAT:  LD      C,15
        CALL    VREG
        IN      A,(VDPCTL)
        PUSH    AF
        XOR     A
        CALL    VREG
        POP     AF
        RET

; WAITDS A=10: ~1 s, nominal 4 MHz.
; Uses AF/BC, keeps DE/HL.

WAIT1S: LD      A,10
        JP      WAITDS

; VDPOK: 1920 names at 2000h, alternate
; R2=0Bh/07h three times, nominal waits.
; Mask 0Ch selects 2000h/1000h. Leave
; 07h, not saved state. Answer or LOOK.
; Paging at 80 cols, not cold default.

TVPAGE: CALL    TBEGIN
        DB      35,"VDPPAGE","PICO9918 page select: R2 07h and 0Bh",0
        LD      A,(VDPOK)
        OR      A
        JR      NZ,TVPG1
        LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "no PICO9918",0
        JP      REND
TVPG1:  LD      HL,VPAGE2
        CALL    VWA
        LD      DE,80*24
TVPG2:  LD      A,'2'
        OUT     (VDPDAT),A
        DEC     DE
        LD      A,D
        OR      E
        JR      NZ,TVPG2
        LD      HL,VPAGE2
        CALL    VWA
        LD      HL,VPG2T
TVPG3:  LD      A,(HL)
        OR      A
        JR      Z,TVPG4
        OUT     (VDPDAT),A
        INC     HL
        JR      TVPG3
TVPG4:  CALL    PRI
        DB      "Watch the screen: the test screen and a page of 2s in turn, three times.",13,10,0
        LD      B,3
TVPG5:  PUSH    BC
        LD      A,$0B
        LD      C,2
        CALL    VREG
        CALL    WAIT1S
        LD      A,$07
        LD      C,2
        CALL    VREG
        CALL    WAIT1S
        POP     BC
        DJNZ    TVPG5
        CALL    VISUAL
        DB      "Did the screen switch to the page of 2s and back, three times?",0
        CALL    RESULT
        CALL    PRI
        DB      "R2 0Bh for page 2000h, 07h for 1000h; left at 07h",0
        JP      REND
VPAGE2  EQU     $2000
VPG2T:  DB      "PAGE 2: NAMES AT 2000h, R2 = 0Bh ",0

; With VDPOK, read locked SR1, unlock
; then SR1/SR14. If SR1 passes, request
; VR28 scroll, then 0 and VR50 reset.
; R2=04h means 1000h under both page
; masks, 0Ch locked/0Fh unlocked.
; VREGS restores the diagnostic table.

TF18A:  CALL    TBEGIN
        DB      36,"F18A   ","F18A identity, version and vertical scroll",0
        LD      A,(VDPOK)
        OR      A
        JR      NZ,TF181
        LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "no PICO9918",0
        JP      REND
TF181:  LD      A,1             ; locked-path SR1
        CALL    VSTAT
        LD      (SAVE),A
        CALL    VUNLOCK
        LD      A,1
        CALL    VSTAT
        LD      (SAVE+1),A
        LD      A,14
        CALL    VSTAT
        LD      (SAVE+2),A

; E0h mask accepts E0h-FFh. The report's
; E0h-EFh differs (KE401). Intended
; compatible range remains unresolved.

        LD      A,(SAVE+1)
        AND     $E0
        CP      $E0
        JR      Z,TF182
        CALL    VREGS           ; a plain TMS9918 took those writes as R1 and R7
        LD      A,RINFO
        CALL    RESULT
        CALL    PRI
        DB      "not F18A-compatible: SR1 read ",0
        LD      A,(SAVE+1)
        CALL    PRHEX
        CALL    PRI
        DB      " (F18A E0h-EFh), locked ",0
        LD      A,(SAVE)
        CALL    PRHEX
        JP      REND
TF182:  LD      A,$04           ; names at 1000h under either mask
        LD      C,2
        CALL    VREG
        CALL    PRI
        DB      "Watch the screen: it moves up one text row for 2 s.",13,10,0
        LD      A,8
        LD      C,28
        CALL    VREG
        CALL    WAIT1S
        CALL    WAIT1S
        XOR     A
        LD      C,28
        CALL    VREG
        CALL    VISUAL
        DB      "Did the text move up one row, the top row wrapping to the bottom?",0
        LD      (SAVE+3),A
        LD      A,$80           ; request VR50 reset
        LD      C,50
        CALL    VREG
        LD      A,1
        CALL    VSTAT
        LD      (SAVE+4),A
        CALL    VREGS

; Saved unlocked SR1 equal -> FAIL.
; Else VISUAL's answer. Inequality alone
; is not proof of full reset or lock.

        LD      A,(SAVE+1)
        LD      HL,SAVE+4
        CP      (HL)
        LD      A,RFAIL
        JR      Z,TF183
        LD      A,(SAVE+3)
TF183:  CALL    RESULT
        CALL    PRI
        DB      "SR1 ",0
        LD      A,(SAVE+1)
        CALL    PRHEX
        CALL    PRI
        DB      " (E0h F18A, +08h PICO9918), SR14 version ",0
        LD      A,(SAVE+2)
        CALL    PRHEX
        CALL    PRI
        DB      ", locked SR1 read ",0
        LD      A,(SAVE)
        CALL    PRHEX
        CALL    PRI
        DB      ", after VR50 reset ",0
        LD      A,(SAVE+4)
        CALL    PRHEX
        LD      A,(SAVE+1)
        LD      HL,SAVE+4
        CP      (HL)
        JP      NZ,REND
        CALL    PRI
        DB      " STILL UNLOCKED",0
        JP      REND

; R57=1Ch twice, then tail-return.
; Uses AF/C, keeps B/DE/HL. Later reads
; test the response, not return alone.

VUNLOCK:LD      C,57
        LD      A,$1C
        CALL    VREG
        LD      A,$1C
        JP      VREG
