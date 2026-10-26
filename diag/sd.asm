; SD card on port FDh: the TEC-OS driver (src/sd.asm), recording what the
; card answers at each step, and the tests that use it.

SDENOCD EQU     1               ; no response to CMD0
SDEINIT EQU     2               ; ACMD41 never reported ready
SDEOCR  EQU     3               ; CMD58 failed
SDEBLEN EQU     4               ; CMD16 failed
SDECMD  EQU     5               ; read command rejected
SDETOK  EQU     6               ; no data token

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

; Read B bytes into HL with /CS low. Destroys AF, B, DE.
SDRDN:  PUSH    BC
        CALL    SPIR
        POP     BC
        LD      (HL),A
        INC     HL
        DJNZ    SDRDN
        RET

; Initialise the card as TEC-OS does, recording CMD0 attempts, the CMD8
; answer, ACMD41 attempts and the OCR. Returns Z when it is ready, or NZ
; and A = an SDE* code.
SDINIT: XOR     A
        LD      (SDBYTE),A
        LD      (SDR8),A
        LD      HL,0
        LD      (SDN41),HL
        LD      (SDR7),HL
        LD      (SDR7+2),HL
        LD      (SDOCR),HL
        LD      (SDOCR+2),HL
        LD      A,SDIDLE
        OUT     (SDIO),A
        LD      D,10            ; CMD0 attempts
SDI0:   LD      A,11
        SUB     D
        LD      (SDN0),A
        PUSH    DE
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
        LD      (SDR8),A
        CP      1
        JR      NZ,SDI8X        ; version 1 card: no R7 payload
        LD      HL,SDR7
        LD      B,4
        CALL    SDRDN
SDI8X:  CALL    SPIEND
SDI41:  LD      HL,(SDN41)
        INC     HL
        LD      (SDN41),HL
        LD      DE,0
        LD      HL,0
        LD      A,55
        CALL    SDCMDX
        LD      DE,$4000        ; HCS: host supports high capacity
        LD      HL,0
        LD      A,41
        CALL    SDCMDX
        OR      A
        JR      Z,SDI58
        LD      B,0             ; short pause between attempts
SDI41W: DJNZ    SDI41W
        LD      A,(SDN41)
        OR      A
        JR      NZ,SDI41        ; 256 attempts
        LD      A,SDEINIT
        JR      SDFAIL
SDI58:  LD      DE,0
        LD      HL,0
        CALL    SETARG
        LD      A,58
        CALL    SDCMD
        OR      A
        JR      NZ,SDI58F
        LD      HL,SDOCR
        LD      B,4
        CALL    SDRDN
        CALL    SPIEND
        LD      A,(SDOCR)
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
        JR      SDFAIL
SDI58F: CALL    SPIEND
        LD      A,SDEOCR
SDFAIL: OR      A               ; NZ
        RET
SDIOK:  XOR     A
        RET

; Load SDARG from SDLBA, as a byte address for standard-capacity cards.
LBAARG: LD      HL,(SDLBA)
        LD      DE,(SDLBA+2)
        LD      A,(SDBYTE)
        OR      A
        JP      Z,SETARG
        LD      D,E             ; DEHL = LBA << 9
        LD      E,H
        LD      H,L
        LD      L,0
        ADD     HL,HL
        EX      DE,HL
        ADC     HL,HL
        EX      DE,HL
        JP      SETARG

; Read block SDLBA into the 512 bytes at HL, counting the polls for the data
; token in SDTOK. Each poll is 678 T-states and each data byte 677.
SDREAD: PUSH    HL
        CALL    LBAARG
        LD      A,17
        CALL    SDCMD
        POP     HL
        OR      A
        JR      NZ,SDRCMD
        LD      BC,0
        LD      (SDTOK),BC
SDRTOK: PUSH    BC
        CALL    SPIR
        POP     BC
        CP      $FE
        JR      Z,SDRDAT
        INC     BC
        LD      A,B
        OR      C
        JR      NZ,SDRTOK
        CALL    SPIEND
        LD      A,SDETOK
        OR      A
        RET
SDRDAT: LD      (SDTOK),BC
        LD      D,2
SDRO:   LD      C,0
SDRI:   PUSH    DE
        CALL    SPIR
        POP     DE
        LD      (HL),A
        INC     HL
        DEC     C
        JR      NZ,SDRI
        DEC     D
        JR      NZ,SDRO
        CALL    SPIR            ; CRC, not checked
        CALL    SPIR
        CALL    SPIEND
        XOR     A
        RET
SDRCMD: CALL    SPIEND
        LD      A,SDECMD
        OR      A
        RET

; Read the 16-byte register of command A (9 CSD, 10 CID) into HL.
SDREG:  PUSH    HL
        LD      HL,0
        LD      D,H
        LD      E,L
        PUSH    AF
        CALL    SETARG
        POP     AF
        CALL    SDCMD
        POP     HL
        OR      A
        JR      NZ,SDRCMD
        LD      BC,0
SDRG1:  PUSH    BC
        CALL    SPIR
        POP     BC
        CP      $FE
        JR      Z,SDRG2
        INC     BC
        LD      A,B
        CP      4
        JR      NZ,SDRG1
        CALL    SPIEND
        LD      A,SDETOK
        OR      A
        RET
SDRG2:  LD      B,18            ; 16 bytes and the CRC
        CALL    SDRDN
        CALL    SPIEND
        XOR     A
        RET

; ---- T19 SD -------------------------------------------------------------------

TSD:    CALL    TBEGIN
        DB      19,"SD     ","SD card on FDh: CMD0, CMD8, ACMD41, CMD58, CSD, CID, block 0",0
        XOR     A
        LD      (SDOK),A
        CALL    SDINIT
        JP      Z,TSD1
        CP      SDENOCD
        JR      NZ,TSDF
        LD      A,RNONE
        CALL    RESULT
        CALL    PRI
        DB      "no answer to CMD0 (no card?)",0
        JP      REND
TSDF:   PUSH    AF
        LD      A,RFAIL
        CALL    RESULT
        CALL    PRI
        DB      "error ",0
        POP     AF
        CALL    PRHEX
        CALL    PRI
        DB      " (2 ACMD41, 3 CMD58, 4 CMD16); CMD8 R1 ",0
        LD      A,(SDR8)
        CALL    PRHEX
        CALL    PRI
        DB      ", ACMD41 x",0
        LD      HL,(SDN41)
        CALL    PRDEC
        JP      REND
TSD1:   LD      A,1
        LD      (SDOK),A
        CALL    PRI
        DB      "CSD ",0
        LD      HL,SDBUF
        LD      A,9
        CALL    SDREG
        LD      HL,SDBUF
        LD      B,16
        CALL    Z,PRBYTES
        CALL    PRI
        DB      13,10,"CID ",0
        LD      HL,SDBUF+32
        LD      A,10
        CALL    SDREG
        JR      NZ,TSD2
        LD      HL,SDBUF+32
        LD      B,16
        CALL    PRBYTES
        CALL    PRI
        DB      "  product '",0
        LD      HL,SDBUF+32+3   ; product name, 5 characters
        LD      B,5
TSDN:   LD      A,(HL)
        CALL    OUTC
        INC     HL
        DJNZ    TSDN
        LD      A,$27
        CALL    OUTC
TSD2:   CALL    CRLF
        LD      HL,0
        LD      (SDLBA),HL
        LD      (SDLBA+2),HL
        LD      HL,SDBUF
        CALL    SDREAD
        LD      (SAVE),A
        JR      NZ,TSD3
        CALL    PRI
        DB      "block 0: ",0
        LD      HL,SDBUF
        LD      B,16
        CALL    PRBYTES
        CALL    PRI
        DB      " ...",13,10,0
TSD3:   LD      A,(SAVE)
        OR      A
        CALL    RESZ
        LD      A,(SDR8)
        CP      1
        LD      A,'2'
        JR      Z,TSD4
        LD      A,'1'
TSD4:   PUSH    AF
        CALL    PRI
        DB      "v",0
        POP     AF
        CALL    OUTC
        LD      A,(SDBYTE)
        OR      A
        JR      NZ,TSD5
        CALL    PRI
        DB      " SDHC/XC",0
        JR      TSD6
TSD5:   CALL    PRI
        DB      " SDSC",0
TSD6:   CALL    PRI
        DB      ", CMD0 x",0
        LD      A,(SDN0)
        LD      L,A
        LD      H,0
        CALL    PRDEC
        CALL    PRI
        DB      ", R7 ",0
        LD      HL,SDR7
        LD      B,4
        CALL    PRBYTES
        CALL    PRI
        DB      ", ACMD41 x",0
        LD      HL,(SDN41)
        CALL    PRDEC
        CALL    PRI
        DB      ", OCR ",0
        LD      HL,SDOCR
        LD      B,4
        CALL    PRBYTES
        LD      A,(SAVE)
        OR      A
        JR      NZ,TSD7
        CALL    PRI
        DB      ", block 0 ends ",0
        LD      A,(SDBUF+510)
        CALL    PRHEX
        LD      A,(SDBUF+511)
        CALL    PRHEX
        CALL    PRI
        DB      ", token polls ",0
        LD      HL,(SDTOK)
        CALL    PRDEC
        JP      REND
TSD7:   CALL    PRI
        DB      ", block 0 read error ",0
        LD      A,(SAVE)
        CALL    PRHEX
        JP      REND

; ---- T20 SDBLKS (open item O4) --------------------------------------------------

; Read block 0 twice and compare, then blocks 0-63, tracking the token
; wait. A block costs 354,216 + 678 x polls T-states (measured on the
; Debug80 model with no polls).
TSDBLK: CALL    TBEGIN
        DB      20,"SDBLKS ","O4: blocks 0-63 at bit-bang speed, token wait per block",0
        LD      A,(SDOK)
        OR      A
        JP      Z,TSDBN
        LD      HL,0
        LD      (SDLBA),HL
        LD      (SDLBA+2),HL
        LD      HL,SDBUF
        CALL    SDREAD
        JP      NZ,TSDBN
        LD      HL,VBUFA
        CALL    SDREAD
        JP      NZ,TSDBN
        LD      HL,SDBUF
        LD      DE,VBUFA
        LD      BC,512
TSDB1:  LD      A,(DE)
        CP      (HL)
        JR      NZ,TSDB2
        INC     HL
        INC     DE
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,TSDB1
TSDB2:  LD      A,B             ; BC = bytes left at the first difference
        OR      C
        LD      (SAVE),A
        CALL    SDRUN64
        LD      A,(SAVE)
        LD      HL,(SDBAD)
        OR      H
        OR      L
        CALL    RESZ
        CALL    PRI
        DB      "block 0 twice ",0
        LD      A,(SAVE)
        OR      A
        JR      NZ,TSDB3
        CALL    PRI
        DB      "same",0
        JR      TSDB4
TSDB3:  CALL    PRI
        DB      "DIFFERS",0
TSDB4:  CALL    PRI
        DB      "; 64 blocks, errors ",0
        LD      HL,(SDBAD)
        CALL    PRDEC
        CALL    PRI
        DB      ", token polls min ",0
        LD      HL,(SDTMIN)
        CALL    PRDEC
        CALL    PRI
        DB      " max ",0
        LD      HL,(SDTMAX)
        CALL    PRDEC
        CALL    PRI
        DB      " (x678 T)",0
        JP      REND
TSDBN:  LD      A,RSKIP
        CALL    RESULT
        CALL    PRI
        DB      "no card, or block 0 unreadable",0
        JP      REND

; Read blocks 0 to B-1 (B = 0 for 256) into SDBUF, recording errors and the
; token polls in SDBAD, SDTMIN, SDTMAX and SDTOT.
SDRUN64:LD      B,64
SDRUN:  LD      HL,0
        LD      (SDLBA),HL
        LD      (SDLBA+2),HL
        LD      (SDBAD),HL
        LD      (SDTMAX),HL
        LD      (SDTOT),HL
        LD      (SDTOT+2),HL
        DEC     HL
        LD      (SDTMIN),HL
SDRN1:  PUSH    BC
        LD      HL,SDBUF
        CALL    SDREAD
        JR      Z,SDRN2
        LD      HL,(SDBAD)
        INC     HL
        LD      (SDBAD),HL
        JR      SDRN5
SDRN2:  LD      DE,(SDTOK)
        LD      HL,(SDTOT)
        ADD     HL,DE
        LD      (SDTOT),HL
        JR      NC,SDRN3
        LD      HL,(SDTOT+2)
        INC     HL
        LD      (SDTOT+2),HL
SDRN3:  LD      HL,(SDTMIN)
        OR      A
        SBC     HL,DE
        JR      C,SDRN4
        LD      (SDTMIN),DE
SDRN4:  LD      HL,(SDTMAX)
        OR      A
        SBC     HL,DE
        JR      NC,SDRN5
        LD      (SDTMAX),DE
SDRN5:  LD      HL,(SDLBA)
        INC     HL
        LD      (SDLBA),HL
        POP     BC
        DJNZ    SDRN1
        RET

; Write the 512 bytes at HL to block SDLBA, as TEC-OS's SDWRITE does, waiting
; until the card has finished; the busy polls go in SDBSY. Z on success.
SDWR:   PUSH    HL
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
        LD      D,2
SDWO:   LD      E,0
SDWI:   LD      C,(HL)
        CALL    SPIW
        INC     HL
        DEC     E
        JR      NZ,SDWI
        DEC     D
        JR      NZ,SDWO
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
        JR      NZ,SDWNO
        LD      BC,0            ; busy while the card returns 00h
SDWB:   PUSH    BC
        CALL    SPIR
        POP     BC
        INC     BC
        OR      A
        JR      NZ,SDWDON
        LD      A,B
        OR      C
        JR      NZ,SDWB
SDWNO:  CALL    SPIEND
        OR      1
        RET
SDWDON: LD      (SDBSY),BC
        CALL    SPIEND
        XOR     A
        RET

; T37: TEC-OS writes blocks, so the write path is tested on a block no
; container uses. Block 0 is the header and every volume starts at a nonzero
; multiple of 8 (docs/container-format.md), so blocks 1-7 belong to nothing.
; Only a card whose block 0 has the TEC-OS magic is written. Block 7 is read,
; written with a pattern, read back, written with what it held and read back
; again.
TSDWR:  CALL    TBEGIN
        DB      37,"SDWRITE","SD write on block 7, outside every volume, then restored",0
        LD      A,(SDOK)
        OR      A
        JR      Z,TSW0
        LD      HL,0
        CALL    SDBLK
        JR      NZ,TSW0
        LD      HL,SDBUF        ; the container magic
        LD      DE,SDMAGIC
        LD      B,8
        CALL    RTCCMP
        JR      Z,TSW1
        LD      A,RSKIP
        CALL    RESULT
        CALL    PRI
        DB      "not a TEC-OS card: nothing written",0
        JP      REND
TSW0:   LD      A,RSKIP
        CALL    RESULT
        CALL    PRI
        DB      "no card",0
        JP      REND
TSW1:   LD      HL,7            ; keep block 7 in VBUFA
        LD      (SDLBA),HL
        LD      HL,VBUFA
        CALL    SDREAD
        LD      C,1
        JR      NZ,TSW9
        CALL    SWPAT           ; the pattern into SDBUF, written
        LD      HL,SDBUF
        CALL    SDWR
        LD      C,2
        JR      NZ,TSW9
        LD      HL,SDBUF        ; read back and checked
        CALL    SDREAD
        LD      C,3
        JR      NZ,TSW9
        CALL    SWCHK
        LD      C,3
        JR      NZ,TSW8
        LD      HL,VBUFA        ; what it held, written back
        CALL    SDWR
        LD      C,4
        JR      NZ,TSW9
        LD      HL,SDBUF
        CALL    SDREAD
        LD      C,4
        JR      NZ,TSW9
        LD      HL,SDBUF
        LD      DE,VBUFA
        LD      BC,512
TSW2:   LD      A,(DE)
        CP      (HL)
        JR      NZ,TSW3
        INC     HL
        INC     DE
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,TSW2
        JR      TSW9            ; C = 0
TSW3:   LD      C,5
TSW9:   LD      A,C
        OR      A
        PUSH    AF
        CALL    RESZ
        POP     AF
        LD      HL,SWTXT
        CALL    PRSN
        CALL    PRI
        DB      "; busy polls ",0
        LD      HL,(SDBSY)
        CALL    PRDEC
        JP      REND
TSW8:   LD      HL,VBUFA        ; the pattern did not read back: put the
        CALL    SDWR            ; block back all the same
        LD      C,3
        JR      TSW9
SWTXT:  DB      "pattern read back, block restored",0
        DB      "first read failed",0
        DB      "pattern write failed",0
        DB      "pattern read back wrong",0
        DB      "restore failed",0
        DB      "restore read back wrong",0

; Read block HL into SDBUF.
SDBLK:  LD      (SDLBA),HL
        LD      HL,0
        LD      (SDLBA+2),HL
        LD      HL,SDBUF
        JP      SDREAD

; The pattern for byte i: low byte of i xor high byte xor 5Ah. SWPAT fills
; SDBUF with it; SWCHK checks SDBUF against it, NZ on a difference.
SWPAT:  LD      HL,SDBUF
SWP1:   CALL    SWVAL
        LD      (HL),A
        INC     HL
        LD      A,H
        CP      HIGH(SDBUF+512)
        JR      NZ,SWP1
        RET
SWCHK:  LD      HL,SDBUF
SWC1:   CALL    SWVAL
        CP      (HL)
        RET     NZ
        INC     HL
        LD      A,H
        CP      HIGH(SDBUF+512)
        JR      NZ,SWC1
        RET
SWVAL:  LD      A,L
        XOR     H
        XOR     $5A
        RET
SDMAGIC:DB      "TECOSVOL"
