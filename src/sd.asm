; SD card block driver: SPI mode, bit-banged on port FDh.
;
; Port bits out: 0 MOSI, 1 CLK, 2 /CS. In: bit 7 MISO. Data changes while CLK
; is low and the card samples on the rising edge. Every wait is bounded.
; Routines return Z on success; on failure NZ and A holds an SDE* code, also
; kept in SDERR.

SDIDLE  EQU     $05             ; /CS high, MOSI high, CLK low

SDENOCD EQU     1               ; no response to CMD0
SDEINIT EQU     2               ; ACMD41 never reported ready
SDEOCR  EQU     3               ; CMD58 failed
SDEBLEN EQU     4               ; CMD16 failed
SDECMD  EQU     5               ; read or write command rejected
SDETOK  EQU     6               ; no data token
SDEWRSP EQU     7               ; write not accepted
SDEBUSY EQU     8               ; card stayed busy

; Send C, most significant bit first, with /CS low. Destroys AF, B.
SPIW:   LD      B,8
SPIWB:  XOR     A
        RLC     C
        RLA
        OUT     (SDIO),A
        OR      2
        OUT     (SDIO),A
        DJNZ    SPIWB
        RET

; Receive a byte into A, sending FFh, with /CS low. Destroys B, E.
SPIR:   LD      B,8
SPIRB:  LD      A,1
        OUT     (SDIO),A
        LD      A,3
        OUT     (SDIO),A
        IN      A,(SDIO)
        RLA
        RL      E
        DJNZ    SPIRB
        LD      A,1
        OUT     (SDIO),A
        LD      A,E
        RET

; Deselect, then give the card eight clocks with /CS high. Preserves F.
SPIEND: PUSH    AF
        PUSH    BC
        LD      B,8
SPIEB:  LD      A,SDIDLE+2
        OUT     (SDIO),A
        LD      A,SDIDLE
        OUT     (SDIO),A
        DJNZ    SPIEB
        POP     BC
        POP     AF
        RET

; Send command A with the argument in SDARG; return R1 in A (FFh when the card
; never answers). Leaves /CS low. Destroys BCDE, HL.
SDCMD:  LD      D,A
        LD      C,$FF
        CALL    SPIW
        LD      A,D
        OR      $40
        LD      C,A
        CALL    SPIW
        LD      HL,SDARG
        LD      C,(HL)
        CALL    SPIW
        INC     HL
        LD      C,(HL)
        CALL    SPIW
        INC     HL
        LD      C,(HL)
        CALL    SPIW
        INC     HL
        LD      C,(HL)
        CALL    SPIW
        LD      C,$95           ; valid CRC for CMD0
        LD      A,D
        OR      A
        JR      Z,SDCRC
        LD      C,$87           ; valid CRC for CMD8 with argument 1AAh
        CP      8
        JR      Z,SDCRC
        LD      C,$01
SDCRC:  CALL    SPIW
        LD      D,16
SDR1:   CALL    SPIR
        BIT     7,A
        RET     Z
        DEC     D
        JR      NZ,SDR1
        RET

; Set SDARG to the 32-bit big-endian value DEHL.
SETARG: LD      A,D
        LD      (SDARG),A
        LD      A,E
        LD      (SDARG+1),A
        LD      A,H
        LD      (SDARG+2),A
        LD      A,L
        LD      (SDARG+3),A
        RET

; Run command A with argument DEHL and deselect. Returns R1 in A.
SDCMDX: PUSH    AF
        CALL    SETARG
        POP     AF
        CALL    SDCMD
        JP      SPIEND

; Initialise the card. Returns Z when it is ready for block I/O.
SDINIT: XOR     A
        LD      (SDBYTE),A
        LD      A,SDIDLE
        OUT     (SDIO),A
        LD      D,10            ; CMD0 attempts
SDI0:   PUSH    DE
        LD      B,80            ; at least 74 clocks with /CS high
SDICK:  LD      A,SDIDLE+2
        OUT     (SDIO),A
        LD      A,SDIDLE
        OUT     (SDIO),A
        DJNZ    SDICK
        LD      DE,0
        LD      HL,0
        XOR     A
        CALL    SDCMDX
        POP     DE
        CP      1
        JR      Z,SDI8
        DEC     D
        JR      NZ,SDI0
        LD      A,SDENOCD
        JP      SDFAIL
SDI8:   LD      DE,0            ; CMD8: 2.7-3.6 V, check pattern AAh
        LD      HL,$01AA
        CALL    SETARG
        LD      A,8
        CALL    SDCMD
        CP      1
        JR      NZ,SDI8X        ; version 1 card: no R7 payload
        LD      D,4
SDI8R:  PUSH    DE
        CALL    SPIR
        POP     DE
        DEC     D
        JR      NZ,SDI8R
SDI8X:  CALL    SPIEND
        LD      C,0             ; ACMD41 attempts, 256
SDI41:  PUSH    BC
        LD      DE,0
        LD      HL,0
        LD      A,55
        CALL    SDCMDX
        LD      DE,$4000        ; HCS: host supports high capacity
        LD      HL,0
        LD      A,41
        CALL    SDCMDX
        POP     BC
        OR      A
        JR      Z,SDI58
        LD      B,0             ; short pause between attempts
SDI41W: DJNZ    SDI41W
        DEC     C
        JR      NZ,SDI41
        LD      A,SDEINIT
        JP      SDFAIL
SDI58:  LD      DE,0
        LD      HL,0
        CALL    SETARG
        LD      A,58
        CALL    SDCMD
        OR      A
        JR      NZ,SDI58F
        CALL    SPIR            ; OCR byte 0: bit 6 is CCS
        PUSH    AF
        CALL    SPIR
        CALL    SPIR
        CALL    SPIR
        CALL    SPIEND
        POP     AF
        BIT     6,A
        JR      NZ,SDIOK        ; high capacity: block addresses
        LD      A,1
        LD      (SDBYTE),A
        LD      DE,0
        LD      HL,512
        LD      A,16
        CALL    SDCMDX
        OR      A
        JR      Z,SDIOK
        LD      A,SDEBLEN
        JP      SDFAIL
SDI58F: CALL    SPIEND
        LD      A,SDEOCR
SDFAIL: LD      (SDERR),A
        OR      A               ; NZ
        RET
SDIOK:  XOR     A
        LD      (SDERR),A
        RET

; Load SDARG from SDLBA, converting to a byte address for standard-capacity
; cards. Destroys AF, DE, HL.
LBAARG: LD      HL,(SDLBA)
        LD      DE,(SDLBA+2)
        LD      A,(SDBYTE)
        OR      A
        JP      Z,SETARG
        LD      D,E             ; DEHL = LBA << 8
        LD      E,H
        LD      H,L
        LD      L,0
        ADD     HL,HL           ; << 1 more, carrying into DE
        EX      DE,HL
        ADC     HL,HL
        EX      DE,HL
        JP      SETARG

; Read block SDLBA into the 512 bytes at HL.
SDREAD: PUSH    HL
        CALL    LBAARG
        LD      A,17
        CALL    SDCMD
        POP     HL
        OR      A
        JP      NZ,SDRCMD
        LD      C,0             ; token wait: 65536 polls
        LD      D,0
SDRTOK: PUSH    DE
        CALL    SPIR
        POP     DE
        CP      $FE
        JR      Z,SDRDAT
        DEC     C
        JR      NZ,SDRTOK
        DEC     D
        JR      NZ,SDRTOK
        CALL    SPIEND
        LD      A,SDETOK
        JP      SDFAIL
SDRDAT: CALL    SDRBLK
        CALL    SPIR            ; CRC, not checked
        CALL    SPIR
        CALL    SPIEND
        JP      SDIOK
SDRCMD: CALL    SPIEND
        LD      A,SDECMD
        JP      SDFAIL

; Receive 512 bytes into the buffer at HL, sending FFh, after the start
; token; HL ends 512 bytes on. /CS low and CLK low on entry and on return.
; Two bytes a pass, each bit unrolled; I counts the 256 passes. Destroys AF,
; BC, DE, I.
SDRBLK: LD      A,(SDXB)        ; LATEXP: the buffer is a cache line, and
        LD      B,A             ; EXPAND 1 is in view for the loop, which
        LD      A,(LATCHV)      ; uses no stack
        OR      B
        OUT     (SYSLAT),A
        LD      C,SDIO
        LD      DE,$0103        ; D: CLK low, E: CLK high; MOSI high, /CS low
        XOR     A
        LD      I,A
SDRB2:
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        LD      (HL),B
        INC     HL
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        OUT     (C),D
        OUT     (C),E
        IN      A,(C)
        RLA
        RL      B
        LD      (HL),B
        INC     HL
        LD      A,I
        DEC     A
        LD      I,A
        JP      NZ,SDRB2
        OUT     (C),D
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        RET

; Send the 512 bytes at HL after the start token; HL ends 512 bytes on. /CS
; low and CLK low on entry and on return. Each bit unrolled; MOSI changes
; with CLK low. Destroys AF, BC, DE.
SDWBLK: LD      A,(SDXB)        ; as SDRBLK
        LD      B,A
        LD      A,(LATCHV)
        OR      B
        OUT     (SYSLAT),A
        LD      C,SDIO
        LD      DE,$0200        ; 2 passes of 256 bytes
SDWB2:  LD      B,(HL)
        XOR     A
        RL      B
        RLA
        OUT     (C),A
        OR      2
        OUT     (C),A
        XOR     A
        RL      B
        RLA
        OUT     (C),A
        OR      2
        OUT     (C),A
        XOR     A
        RL      B
        RLA
        OUT     (C),A
        OR      2
        OUT     (C),A
        XOR     A
        RL      B
        RLA
        OUT     (C),A
        OR      2
        OUT     (C),A
        XOR     A
        RL      B
        RLA
        OUT     (C),A
        OR      2
        OUT     (C),A
        XOR     A
        RL      B
        RLA
        OUT     (C),A
        OR      2
        OUT     (C),A
        XOR     A
        RL      B
        RLA
        OUT     (C),A
        OR      2
        OUT     (C),A
        XOR     A
        RL      B
        RLA
        OUT     (C),A
        OR      2
        OUT     (C),A
        INC     HL
        DEC     E
        JP      NZ,SDWB2
        DEC     D
        JP      NZ,SDWB2
        AND     $FD             ; CLK low
        OUT     (C),A
        LD      A,(LATCHV)
        OUT     (SYSLAT),A
        RET

; Write the 512 bytes at HL to block SDLBA, waiting until the card has
; finished programming.
SDWRITE:PUSH    HL
        CALL    LBAARG
        LD      A,24
        CALL    SDCMD
        POP     HL
        OR      A
        JP      NZ,SDRCMD
        LD      C,$FF           ; one idle byte, then the start token
        CALL    SPIW
        LD      C,$FE
        CALL    SPIW
        CALL    SDWBLK
        LD      C,$FF           ; CRC, ignored in SPI mode
        CALL    SPIW
        CALL    SPIW
        LD      D,16            ; data response token
SDWRS:  PUSH    DE
        CALL    SPIR
        POP     DE
        CP      $FF
        JR      NZ,SDWRG
        DEC     D
        JR      NZ,SDWRS
SDWRG:  AND     $1F
        CP      $05
        JR      Z,SDWBSY
        CALL    SPIEND
        LD      A,SDEWRSP
        JP      SDFAIL
SDWBSY: LD      C,0             ; busy while the card returns 00h
        LD      D,0
SDWB:   PUSH    DE
        CALL    SPIR
        POP     DE
        OR      A
        JR      NZ,SDWDON
        DEC     C
        JR      NZ,SDWB
        DEC     D
        JR      NZ,SDWB
        CALL    SPIEND
        LD      A,SDEBUSY
        JP      SDFAIL
SDWDON: CALL    SPIEND
        JP      SDIOK
