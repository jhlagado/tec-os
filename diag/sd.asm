; Diagnostic SPI on FDh, derived from src/sd.asm but with fewer checks.
; Attempt/response fields record selected branches, not complete card state.
; CMD8 echo, CMD55 reply, data-error tokens and byte-address range rejection
; are not checked here. No production SDERR or hardware-readiness guarantee.

SDENOCD EQU     1               ; CMD0 never returned idle 01h
SDEINIT EQU     2               ; ACMD41 never reported ready
SDEOCR  EQU     3               ; CMD58 failed
SDEBLEN EQU     4               ; CMD16 failed
SDECMD  EQU     5               ; read/write command rejected
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

; Receive eight MISO bits into A with MOSI high and /CS low; CLK ends low.
; AF/B/E work; C/D/HL survive. Eight shifts replace the previous E contents.
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

; Send command A and big-endian SDARG, then poll at most 16 bytes for bit 7
; clear. Return that candidate R1 in A, or the last bit-7-set byte on timeout
; (not necessarily FFh). /CS stays low; AF/BC/DE/HL work. Callers inspect A.
; CRCs are fixed for CMD0=0/CMD8=1AAh, otherwise 01h, not computed generally.
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
        LD      C,$95           ; fixed CRC for CMD0 with argument 0
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

; Send command A with argument DEHL, then deselect. A/flags retain SDCMD's
; raw outcome; an exhausted bit-7-set response is not a valid R1.
SDCMDX: PUSH    AF
        CALL    SETARG
        POP     AF
        CALL    SDCMD
        JP      SPIEND

; Read B bytes into writable HL with /CS low; B = 0 means 256 writes.
; HL ends after them, B at zero. AF/B/DE work; C survives. No CRC check.
SDRDN:  PUSH    BC
        CALL    SPIR
        POP     BC
        LD      (HL),A
        INC     HL
        DJNZ    SDRDN
        RET

; Initialise and record CMD0/CMD8/ACMD41/OCR trace fields. At most 10 CMD0
; attempts seek idle 01h; at most 256 ACMD41 attempts seek zero. CMD8 R1=1
; stores four R7 bytes without checking echo/voltage; other replies skip R7.
; CMD55's reply is ignored. OCR bit 6 chooses block addressing; otherwise
; set SDBYTE and require CMD16=0. A0/Z means this init path passed; NZ returns
; the selected SDE* code and may leave partial state. No elapsed-time bound
; or full production-driver parity follows from the counted retries.
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
        JR      NZ,SDI8X        ; any other reply skips the R7 read
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
SDFAIL: OR      A
        RET
SDIOK:  XOR     A
        RET

; Convert little-endian SDLBA to big-endian SDARG. SDBYTE=0 keeps blocks;
; any nonzero value shifts left 9 modulo 2^32, with no overflow rejection.
LBAARG: LD      HL,(SDLBA)
        LD      DE,(SDLBA+2)
        LD      A,(SDBYTE)
        OR      A
        JP      Z,SETARG
        LD      D,E             ; DEHL = low 32 bits of LBA << 9
        LD      E,H
        LD      H,L
        LD      L,0
        ADD     HL,HL
        EX      DE,HL
        ADC     HL,HL
        EX      DE,HL
        JP      SETARG

; Read block SDLBA into 512 writable bytes at HL. A0/Z advances HL by 512;
; NZ returns code 5 for command rejection or 6 for token exhaustion.
; SDTOK is unchanged on rejection, cleared after command acceptance, then
; stores unsuccessful polls preceding FEh (0..65535). Exhaustion leaves 0.
; Poll at most 65536 bytes, ignoring other tokens; discard both CRC bytes.
; AF/BC/DE/HL work. The continuing failed-token path is 688 nominal Z80
; T-states; ordinary data iterations are 677, with boundary/final paths
; different. Command overhead, waits and interrupts are additional.
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

; Read command A's register (9 CSD, 10 CID) into at least 18 writable HL bytes:
; 16 payload plus two unchecked CRC bytes. Poll at most 1024 bytes for FEh.
; A0/Z advances HL by 18; NZ returns 5 for rejection or 6 for token timeout.
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

; T19 sets SDOK after init, before CSD/CID/block0 reads. Register failures
; suppress their payload output; the final result uses block0 read status.
; SDOK therefore does not mean every later I/O passed.
TSD:    CALL    TBEGIN
        DB      19,"SD     ","SD card on FDh: initialise, CSD, CID, block 0",0
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
        CALL    PRI
        DB      " (5 rejected, 6 no token)",0
        JP      REND

; Compare two complete block0 reads, then survey blocks 0-63 for protocol
; errors/token waits. PASS needs repeat equality and no survey errors; the
; other blocks are not compared with known contents. Missing init or either
; preliminary read failure skips. Token counts are not elapsed time; the
; report's x678 text differs from SDREAD's continuing failed-token path.
TSDBLK: CALL    TBEGIN
        DB      20,"SDBLKS ","Blocks 0-63: errors and token waits",0
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

; Read low blocks 0..B-1 into SDBUF (B = 0 means 256); SDRUN64 supplies 64.
; Failures increment SDBAD. Only successes update token min/max/32-bit total,
; excluding each terminal FEh sample. If all reads fail, FFFFh/0/0 sentinels remain.
; SDLBA advances after each attempt; SAVE timing fields are not touched.
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

; Send 512 bytes from HL to block SDLBA. CMD24 rejection returns 5/NZ;
; data-response/busy failures return NZ without a distinct general error code.
; After payload/dummy CRC, accept the first non-FFh response only if its low
; five bits are 05h (at most 16 samples), then seek a nonzero card byte in
; at most 65536 busy samples. Only success refreshes SDBSY, including that
; last nonzero sample (65536 wraps to 0), then returns A0/Z after deselecting.
; Failures can leave an older SDBSY and device effects; no rollback/persistence
; proof follows. HL advances 512 after payload send.
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

; T37 automatically tests block7 after T20. Admission is only SDOK plus
; block0's eight magic bytes: no version/count/layout/checksum check.
; WARNING: docs/container-format.md places live descriptors in block7 for
; valid 1.1 cards with 112-127 volumes. Payload alignment does not free it.
; The normal path saves 512 bytes in VBUFA, writes/checks a pattern, then
; writes the backup and compares a final read. This is not universal restore:
; pattern-write or protocol-read failure exits without attempting it; a
; pattern mismatch attempts backup write without checking/verifying restore.
; Code 3 includes protocol-read failure, which can print stale SAVE mismatch
; details. SDBSY is only the latest successful write's count, not every attempt.
; Ordinary I/O failure as well as power loss can leave this block changed.
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
        JP      NZ,TSW8
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
TSW3:   LD      (SAVE),HL       ; the byte read and the byte expected
        LD      A,(HL)
        LD      (SAVE+3),A
        LD      A,(DE)
        LD      (SAVE+2),A
        LD      C,5
TSW9:   LD      A,C
        LD      (SAVE+4),A
        OR      A
        CALL    RESZ
        LD      A,(SAVE+4)
        LD      HL,SWTXT
        CALL    PRSN
        LD      A,(SAVE+4)
        CP      3
        JR      Z,TSWD
        CP      5
        JR      NZ,TSWE
TSWD:   CALL    PRI
        DB      " at +",0
        LD      HL,(SAVE)
        LD      DE,-SDBUF
        ADD     HL,DE
        CALL    PRHL
        CALL    PRI
        DB      " read ",0
        LD      A,(SAVE+3)
        CALL    PRHEX
        CALL    PRI
        DB      " expect ",0
        LD      A,(SAVE+2)
        CALL    PRHEX
TSWE:   CALL    PRI
        DB      "; busy polls ",0
        LD      HL,(SDBSY)
        CALL    PRDEC
        JP      REND
TSW8:   LD      HL,VBUFA        ; pattern mismatch: attempt the backup write
        CALL    SDWR            ; status ignored; no restore verification here
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

; SWPAT fills SDBUF with low(HL) xor high(HL) xor 5Ah, using absolute address
; (first byte at 0C00h is 56h). SWCHK returns Z after all 512 agree, or NZ at
; the first mismatch and refreshes SAVE address/expected/read. The high-byte
; end test relies on the aligned 0C00h-0DFFh region; backup 0E00h-0FFFh is
; disjoint and spans both VDP scratch pages, below the report at 1000h.
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
        JR      NZ,SWCBAD
        INC     HL
        LD      A,H
        CP      HIGH(SDBUF+512)
        JR      NZ,SWC1
        RET
SWCBAD: LD      (SAVE),HL       ; the byte read and the byte expected
        LD      (SAVE+2),A
        LD      A,(HL)
        LD      (SAVE+3),A
        RET                     ; NZ
SWVAL:  LD      A,L
        XOR     H
        XOR     $5A
        RET
SDMAGIC:DB      "TECOSVOL"
