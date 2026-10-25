; Serial TX, the LCD, the GLCD and the PICO9918.

; ---- T14 serial TX --------------------------------------------------------------

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

; Visual or audible check: with the interactive tests chosen, ask the
; question that follows the CALL and return its answer in A; otherwise return
; RLOOK.
VISUAL: EX      (SP),HL
        LD      A,(INTER)
        OR      A
        JR      NZ,VISQ
VISSK:  LD      A,(HL)          ; skip the question
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

; ---- T15 LCD --------------------------------------------------------------------

TLCD:   CALL    TBEGIN
        DB      15,"LCD    ","HD44780 at 04h/84h: busy flag, DDRAM read-back",0
        CALL    LCDWAIT
        JR      NC,TLCD1
        LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "busy flag never clears",0
        JP      REND
TLCD1:  LD      A,$01           ; clear: busy for about 1.5 ms
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

; Count polls of status port C bit 7 until it is clear, at most 4096; the
; port is LCDCMD unless BUSYGL is used. Returns HL; one poll is 50
; T-states. Destroys AF, C.
BUSYCNT:LD      C,LCDCMD
BUSYC:  LD      HL,0
BUSYC1: IN      A,(C)           ; 12
        RLCA                    ; 4
        RET     NC              ; 5
        INC     HL              ; 6
        LD      A,H             ; 4
        CP      $10             ; 7
        JR      NZ,BUSYC1       ; 12 (50 in all)
        RET
BUSYGL: LD      C,GLCCMD
        JR      BUSYC

; Print the poll count in SAVE as "n polls x 50 T" or "never seen".
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

; ---- T16 GLCD -------------------------------------------------------------------

; Wait until the GLCD is ready, at most 256 polls. NC when ready, C after the
; time-out. Preserves BC, DE, HL.
GLWAIT: PUSH    BC
        LD      B,0
GLW1:   IN      A,(GLCCMD)
        RLCA
        JR      NC,GLW2
        DJNZ    GLW1
        SCF
GLW2:   POP     BC
        RET
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

; Graphics address of pixel row D, word 0. Preserves BC, DE, HL.
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

; Test value for row D, byte E: the row in the high nibble, the byte xor a
; quarter of the row in the low one, so rows 16 apart differ.
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

; Test pattern for row D, byte E: 8 x 8 checkerboard inside a frame.
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

; Fill graphics RAM from the function at HL (GLVAL or GLPAT).
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
        LD      A,$01           ; clear: busy for about 1.6 ms
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

; ---- T17-T18 PICO9918 -----------------------------------------------------------

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

; Registers 0-7 for the TEC-OS console: 80-column text, names at 1000h,
; patterns at 0000h, white on dark blue, interrupts off.
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

TVDP:   CALL    TBEGIN
        DB      17,"VDP    ","PICO9918 at BEh/BFh: VRAM size, full-speed access, 80 columns",0
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
        ; pass: the tags, the full-speed and the slow test all clean
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

; Fill VBUFA with i xor D.
VBUF:   LD      HL,VBUFA
VBUF1:  LD      A,L
        XOR     D
        LD      (HL),A
        INC     L
        JR      NZ,VBUF1
        RET
; Count the bytes of VBUFB that differ from i xor D into VERR.
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

; O5: write all 16 KiB with OUTI, 16 T-states a byte, then read it with INI.
; No delays: the display stays on in 80-column mode as TEC-OS runs it.
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

; The same at 104 T-states a byte.
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
        DJNZ    VSW2            ; 13
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

; Load the font as TEC-OS does (codes 80h-FFh reversed), draw the test
; screen and read the name table back, adding errors to VERR.
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

; The test screen's character at row B, column C. Destroys DE, HL.
VNCH:   LD      A,B
        OR      A
        JR      Z,VNTTL
        CP      12
        JR      Z,VNREV
        CP      1
        JR      Z,VNRUL
        CP      23
        JR      Z,VNRUL
        ADD     A,A             ; rows 2-22: the printable set, shifted by row
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

; T18: count 16 frames of the status flag. Each poll is 33 T-states, so the
; frame is (33 x polls + 123) / 16 T-states, and the CPU clock follows if
; the PICO9918's refresh rate (50 or 60 Hz) is known.
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
TVC1:   DEC     HL              ; wait for the next frame, at most 2.7M T
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

; ---- T35 page select ------------------------------------------------------------

; Write A to VDP register C (0-63; above 7 only once the F18A registers are
; unlocked). Preserves BC, DE, HL.
VREG:   OUT     (VDPCTL),A
        LD      A,C
        OR      $80
        OUT     (VDPCTL),A
        RET

; Read status register A through VR15, then select status register 0 again.
; Only an unlocked F18A-compatible VDP takes VR15; a plain TMS9918 takes the
; write as register 7, so the caller rewrites registers 0-7 afterwards.
VSTAT:  LD      C,15
        CALL    VREG
        IN      A,(VDPCTL)
        PUSH    AF
        XOR     A
        CALL    VREG
        POP     AF
        RET

; Wait about a second. Destroys AF, BC.
WAIT1S: LD      A,10
        JP      WAITDS

; TEC-OS page-flips in 80 columns (D24): the console's names are at 1000h
; (R2 = 07h) and row moves are built at 2000h (R2 = 0Bh). The page is
; (R2 & 0Ch) << 10 as TEC-OS and the emulator decode it. Page 2 is filled
; with 2s under its own title, then R2 alternates three times and is left
; at 07h.
TVPAGE: CALL    TBEGIN
        DB      35,"VDPPAGE","PICO9918 80-column pages: R2 07h shows 1000h, 0Bh shows 2000h",0
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

; ---- T36 F18A identity and vertical scroll ------------------------------------

; Unlock as the F18A does (1Ch to register 57, twice), read status registers
; 1 (identity) and 14 (version) through VR15, set VR28 to 8 to scroll the
; 80-column text up one row, then clear VR28 and write VR50 bit 7, which
; resets every register and locks them again. Registers 0-7 are then set
; back to TEC-OS's 80-column values. Unlocked, the PICO9918 decodes R2 with
; mask 0Fh instead of 0Ch, so the names are selected with R2 = 04h, which
; means 1000h under either mask.
TF18A:  CALL    TBEGIN
        DB      36,"F18A   ","F18A registers: identity (SR1), version (SR14), VR28 vertical scroll",0
        LD      A,(VDPOK)
        OR      A
        JR      NZ,TF181
        LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "no PICO9918",0
        JP      REND
TF181:  LD      A,1             ; locked: SR1 must not be readable
        CALL    VSTAT
        LD      (SAVE),A
        CALL    VUNLOCK
        LD      A,1
        CALL    VSTAT
        LD      (SAVE+1),A
        LD      A,14
        CALL    VSTAT
        LD      (SAVE+2),A
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
        LD      A,$80           ; VR50 bit 7: reset the registers, locked
        LD      C,50
        CALL    VREG
        LD      A,1
        CALL    VSTAT
        LD      (SAVE+4),A
        CALL    VREGS
        LD      A,(SAVE+1)      ; still unlocked if SR1 reads back
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

; The F18A unlock: value 1Ch to register 57, twice in a row.
VUNLOCK:LD      C,57
        LD      A,$1C
        CALL    VREG
        LD      A,$1C
        JP      VREG
