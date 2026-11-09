; Counted SD routines and checks
; SD1-SD4. TEC-OS's driver (src/sd.asm)
; does the card work but keeps no poll
; counts, so these routines repeat its
; sequences with its own primitives
; (SDCMD, SPIR, SPIW, SPIEND, SDRBLK,
; SDWBLK) and count each wait against
; TEC-OS's bound.

; Send command A as SDCMD does, and
; raise R1MAX to the R1 polls it used.
; SDCMD leaves D at 17 less the polls,
; or 0 when all 16 found nothing.
; Returns SDCMD's A and flags. Changes
; BC/DE/HL.

XCMD:
  call SDCMD     ; TEC-OS's command
  push af        ; its answer
  ld a,17        ; the polls used:
  sub d          ; 17 - D
  cp 17          ; D=0: all 16 used,
  jr c,XC1       ; none answered
  ld a,16

XC1:
  ld hl,R1MAX
  cp (hl)        ; a new maximum?
  jr c,XC2
  ld (hl),a      ; the new maximum

XC2:
  pop af         ; SDCMD's answer back
  ret            ; with the flags

; SDCMDX with counting: command A with
; the argument DEHL, then deselect.

XCMDX:
  push af        ; the command
  call SETARG    ; DEHL to SDARG
  pop af
  call XCMD      ; the polls counted
  jp SPIEND      ; keeps A and flags

; Store IX polls, 0 meaning 65,536, in
; M32B and raise the 32-bit maximum at
; DE to them. Changes AF/BC/DE/HL.

IXMAX:
  push de        ; the maximum's place
  push ix        ; the polls to HL
  pop hl
  ld a,h         ; 0: the 16-bit count
  or l           ; wrapped at 65,536
  ld de,M32B     ; as 32 bits
  call LD16      ; keeps the flags
  jr nz,IM1
  ld a,1         ; 65,536 = 00010000h
  ld (M32B+2),a

IM1:
  ld hl,M32B     ; raise the maximum
  pop de
  jp MAX32       ; raised

; Count IX data-token polls into TOKMAX,
; keeping HL, the buffer pointer.

TOKCNT:
  push hl        ; the buffer pointer
  ld de,TOKMAX
  call IXMAX     ; raised
  pop hl
  ret

; Count IX busy polls into BSYMAX and
; keep them in BSYN for the block's
; line.

BSYCNT:
  ld (BSYN),ix   ; this write's polls
  ld de,BSYMAX
  jp IXMAX       ; raised

; Initialise the card along SDINIT's own
; path, recording each answer: CMD0
; tries, CMD8's R1 and R7, ACMD41 tries
; and the OCR. Returns A=0/Z, or the
; SDE* code SDINIT would give with NZ.
; The real SDINIT runs after this (SD2).

CINIT:
  ld a,SDIDLE    ; deselected, CLK low
  out (SDIO),a   ; idle
  ld d,10        ; TEC-OS's ten CMD0
                 ; tries

CI0:
  ld hl,CMD0N    ; one more try
  inc (hl)
  push de        ; the try count
  ld b,80        ; 80 clocks, deselected

CICK:
  ld a,SDIDLE+2  ; CLK high
  out (SDIO),a
  ld a,SDIDLE    ; CLK low
  out (SDIO),a
  djnz CICK      ; 80 in all
  ld de,0        ; CMD0, argument 0
  ld hl,0
  xor a
  call XCMDX     ; send it
  pop de
  cp 1           ; only R1 01h goes on
  jr z,CI8
  dec d          ; another try?
  jr nz,CI0      ; up to ten
  ld a,SDENOCD   ; no card answered
  or a
  ret

; CMD8 with 1AAh. R1 01h: read the four
; R7 bytes, whose third's low nibble
; must be 1 and fourth AAh. Any other R1
; goes on to ACMD41 without R7, as
; TEC-OS does.

CI8:
  ld de,0        ; the argument 1AAh
  ld hl,$01AA    ; 01AAh
  call SETARG
  ld a,8
  call XCMD      ; CS stays low
  ld (R18),a     ; kept for SD2
  cp 1
  jr nz,CI8X     ; not 01h: no R7
  ld hl,R7       ; the four R7 bytes
  ld c,4         ; four bytes

CI8R:
  call SPIR      ; keeps C and HL
  ld (hl),a
  inc hl
  dec c
  jr nz,CI8R     ; all four
  call SPIEND    ; deselect
  ld a,(R7+2)    ; the voltage nibble
  and $0F
  cp 1           ; 2.7-3.6 V
  jr nz,CI8F
  ld a,(R7+3)    ; the check pattern
  cp $AA         ; echoed as sent?
  jr z,CI41      ; both echoed

CI8F:
  ld a,SDEVOLT   ; a wrong echo
  or a
  ret

CI8X:
  call SPIEND    ; deselect

; Up to 256 tries of CMD55 then ACMD41
; with HCS, each failed try followed by
; TEC-OS's 256-turn pause.

CI41:
  ld c,0         ; 256 tries

CI41L:
  push bc        ; the try count
  ld hl,(A41N)   ; count this try
  inc hl
  ld (A41N),hl
  ld de,0        ; CMD55, argument 0
  ld hl,0
  ld a,55
  call XCMDX     ; CMD55
  ld (R55),a     ; kept for the record
  and $FE        ; 00h or 01h only
  jr nz,CI55F    ; refused
  ld de,$4000    ; ACMD41 with HCS
  ld hl,0
  ld a,41
  call XCMDX     ; ACMD41
  pop bc
  or a           ; 00h: ready
  jr z,CI58
  ld b,0         ; TEC-OS's pause

CI41W:
  djnz CI41W     ; 256 turns
  dec c          ; another try?
  jr nz,CI41L    ; up to 256 tries
  jr CI41F       ; never ready

CI55F:
  pop bc

CI41F:
  ld a,SDEINIT   ; never ready
  or a
  ret

; CMD58: R1 00h, then the four OCR
; bytes. CCS clear means a
; byte-addressed card, which also needs
; CMD16 for 512 bytes.

CI58:
  ld de,0        ; CMD58, argument 0
  ld hl,0
  call SETARG
  ld a,58        ; the OCR command
  call XCMD      ; CS stays low
  or a           ; R1 must be 00h
  jr nz,CI58F
  ld hl,OCR      ; its four bytes
  ld c,4         ; four bytes

CI58R:
  call SPIR      ; keeps C and HL
  ld (hl),a
  inc hl
  dec c
  jr nz,CI58R    ; all four
  call SPIEND
  ld a,(OCR)     ; CCS: block addresses
  bit 6,a        ; CCS set:
  jr nz,CIOK     ; block addresses
  ld de,0        ; CMD16: 512 bytes
  ld hl,512
  ld a,16
  call XCMDX     ; CMD16
  or a           ; R1 00h: done
  ret z
  ld a,SDEBLEN   ; refused
  or a
  ret

CI58F:
  call SPIEND    ; deselect
  ld a,SDEOCR    ; R1 not 00h
  or a
  ret

CIOK:
  xor a          ; A=0, Z
  ret

; Read block SDLBA into HL as SDREAD
; does, counting the R1 and data-token
; polls. Returns as SDREAD: A=0/Z or
; SDE*/NZ, also in SDERR. The token loop
; takes about as long as a TEC-OS poll.
; Changes F/BC/DE/HL/IX.

MREAD:
  push hl        ; the buffer
  call LBAARG    ; SDLBA to SDARG
  jr c,MRRNG     ; SDSC past 8388607
  ld a,17        ; CMD17
  call XCMD      ; R1 counted
  pop hl
  or a           ; R1 must be 00h
  jp nz,MRCMD
  ld ix,0        ; the token polls

MRT:
  call SPIR      ; one byte
  inc ix         ; one more poll
  cp $FE         ; the start token
  jr z,MRDAT     ; the start token
  inc a          ; not FFh: an error
                 ; token
  jr nz,MRBAD
  push ix        ; up to 65,536 polls:
  pop de         ; IX wraps to 0
  ld a,d         ; wrapped to zero?
  or e
  jr nz,MRT
  call SPIEND    ; none came
  call TOKCNT    ; count the polls
  ld a,SDETOK
  jp SDFAIL      ; SDERR and NZ

MRBAD:
  call SPIEND    ; an error token
  call TOKCNT    ; count the polls
  ld a,SDEDTOK
  jp SDFAIL

MRDAT:
  call TOKCNT    ; count the polls
  call SDRBLK    ; TEC-OS's 512 bytes
  call SPIR      ; two CRC bytes
  call SPIR      ; the second CRC byte
  call SPIEND
  jp SDIOK       ; SDERR=0 and Z

MRCMD:
  call SPIEND    ; R1 not 00h
  ld a,SDECMD    ; R1 not 00h
  jp SDFAIL

MRRNG:
  pop hl         ; the buffer
  ld a,SDERNG    ; out of SDSC's range
  jp SDFAIL      ; SDERR and NZ

; Write block SDLBA from HL as SDWRITE
; does, counting the R1, data-response
; and busy polls. Returns as SDWRITE.
; Changes F/BC/DE/HL/IX.

MWRITE:
  push hl        ; the data
  call LBAARG
  jr c,MRRNG
  ld a,24        ; CMD24
  call XCMD      ; R1 counted
  pop hl
  or a           ; R1 must be 00h
  jr nz,MRCMD
  ld c,$FF       ; a gap byte
  call SPIW      ; sent
  ld c,$FE       ; the start token
  call SPIW
  call SDWBLK    ; TEC-OS's 512 bytes
  ld c,$FF       ; two CRC bytes:
  call SPIW      ; SPIW keeps C
  call SPIW      ; the first CRC byte
  ld d,16        ; 16 response polls
  ld ix,0        ; counted in IX

MWR:
  push de        ; SPIR keeps D, but
  call SPIR      ; TEC-OS saves DE too
  pop de
  inc ix         ; one more poll
  cp $FF         ; not FFh: the response
  jr nz,MWG      ; an answer
  dec d
  jr nz,MWR      ; up to 16

MWG:
  push af        ; the response
  push ix        ; the polls, at most 16
  pop hl
  ld a,l         ; their count
  ld hl,WRSMAX
  cp (hl)        ; a new maximum?
  jr c,MWG1
  ld (hl),a      ; the new maximum

MWG1:
  pop af
  and $1F        ; 05h: data accepted
  cp $05         ; accepted?
  jr z,MWB
  call SPIEND    ; refused, or no answer
  ld a,SDEWRSP   ; not accepted
  jp SDFAIL

MWB:
  ld ix,0        ; the busy polls

MWB1:
  call SPIR      ; 00h while busy
  inc ix
  or a           ; zero: still busy
  jr nz,MWDON    ; not busy any more
  push ix        ; up to 65,536 polls
  pop de
  ld a,d         ; wrapped to zero?
  or e
  jr nz,MWB1
  call SPIEND    ; still busy
  call BSYCNT    ; count the polls
  ld a,SDEBUSY
  jp SDFAIL

MWDON:
  call SPIEND    ; done
  call BSYCNT    ; count the polls
  jp SDIOK

; Read the 16-byte CSD (A=9) or CID
; (A=10) into HL. TEC-OS has no routine
; for these, so this one uses its
; primitives and token bound. Returns
; A=0/Z or SDE*/NZ.

RDREG:
  push hl        ; the place
  push af        ; the command
  ld de,0        ; argument 0
  ld hl,0
  call SETARG    ; SDARG = 0
  pop af
  call XCMD      ; R1 counted
  pop hl
  or a           ; R1 must be 00h
  jp nz,MRCMD
  ld ix,0        ; the token polls

RR1:
  call SPIR
  inc ix
  cp $FE         ; the start token
  jr z,RR2
  inc a          ; not FFh: an error
                 ; token
  jp nz,MRBAD    ; not FFh or FEh
  push ix        ; up to 65,536
  pop de
  ld a,d
  or e           ; wrapped to zero?
  jr nz,RR1
  call SPIEND    ; none came
  call TOKCNT    ; count the polls
  ld a,SDETOK
  jp SDFAIL

RR2:
  call TOKCNT    ; count them
  ld c,16        ; the register's bytes

RR3:
  call SPIR      ; keeps C and HL
  ld (hl),a      ; stored
  inc hl
  dec c
  jr nz,RR3      ; all 16
  call SPIR      ; the CRC
  call SPIR      ; the second CRC byte
  call SPIEND
  jp SDIOK

; Z if SD2 initialised the card;
; otherwise print SKIP for the current
; check and return NZ.

NEEDSD:
  ld a,(SDOK)    ; set by SD2 and SD9
  or a           ; zero: no card
  jr z,NS1
  xor a          ; Z: carry on
  ret

NS1:
  call SKIPR     ; no card to test
  DB "sd2",0
  or 1           ; NZ: skipped
  ret            ; NZ

; SD1: with /CS high and no clocks, MISO
; (port FDh bit 7) should read 1. Many
; HW-125 style modules leave their MISO
; buffer on, so a deselected card's
; output can float: a low reading is a
; WARN, not a FAIL. Only SD2's SDINIT
; decides whether the card works.

SD1:
  ld hl,RSD1
  call BEGIN     ; SD1's record
  ld a,SDIDLE    ; deselected, CLK low
  out (SDIO),a
  ld b,16        ; 16 reads
  ld c,$80       ; the AND of their bit
                 ; 7

S1A:
  in a,(SDIO)    ; MISO in bit 7
  and c          ; stays 80h only while
  ld c,a         ; every read gives 1
  djnz S1A
  ld a,c         ; MISO as 0 or 1
  rlca
  ld (ERRCODE),a
  or a           ; kept for the line
  ld a,RPASS     ; it idled high
  jr nz,S1B
  ld a,RWARN     ; low: it may float

S1B:
  call RESULT    ; PASS or WARN
  call FIELDS
  DB " miso=",0,FD8
  DW ERRCODE
  DB " reads=16",0,0
  ld a,(ERRCODE)
  or a           ; can be harmless
  jp nz,ENDL     ; low: say why it
  call PRI
  DB " note=miso-not-idle-high",0
  jp ENDL        ; the line's end

; SD2: the counted initialisation, then
; TEC-OS's SDINIT, which must succeed.
; SDINIT's result decides the status; a
; counted run that differs from it is a
; WARN.

SD2:
  ld hl,RSD2
  call BEGIN     ; SD2's record
  call CINIT     ; counted
  ld (CIERR),a
  call SDINIT    ; TEC-OS's own
  ld (INERR),a   ; TEC-OS's result
  or a
  jr nz,S2F      ; it failed
  inc a          ; the card is ready
  ld (SDOK),a    ; SD3-SD9 may run
  ld a,(CIERR)
  or a           ; the counted result
  ld a,RPASS     ; both worked
  jr z,S2R
  ld a,RWARN     ; only SDINIT worked
  jr S2R

S2F:
  ld a,RFAIL     ; TEC-OS's failed

S2R:
  call RESULT    ; the status
  call FIELDS
  DB " err=",0,FD8
  DW INERR
  DB " cmd0=",0,FD8
  DW CMD0N
  DB "/10 cmd8=",0,FHEX
  DW R18
  DB 0,0
  ld a,(R18)     ; R7 only after 01h
  cp 1           ; R1 01h?
  jr nz,S2A
  call FIELDS
  DB " r7=",0,FHEX4
  DW R7
  DB 0,0

S2A:
  call FIELDS    ; the rest
  DB " acmd41=",0,FD16
  DW A41N
  DB "/256 ocr=",0,FHEX4
  DW OCR
  DB " type=",0,0
  ld a,(SDOK)    ; the type, if it
  or a           ; initialised
  ld hl,TNONE
  jr z,S2B       ; no card
  ld a,(SDBYTE)  ; 0: block addresses
  or a
  ld hl,TSDHC
  jr z,S2B
  ld hl,TSDSC    ; 1: byte addresses

S2B:
  call PRS       ; the type
  call FIELDS
  DB " counted=",0,FD8
  DW CIERR
  DB 0,0
  jp ENDL        ; the line's end

; SD3: 64 counted reads of blocks 0-63.
; Shows the most polls each wait took
; against TEC-OS's bound, and WARNs when
; one used more than a quarter of it.

SD3:
  ld hl,RSD3
  call BEGIN     ; SD3's record
  call NEEDSD
  ret nz
  ld hl,0        ; no errors yet
  ld (ERRS),hl   ; ERRS = 0
  xor a          ; from block 0
  ld (COUNT),a   ; COUNT = 0

S3A:
  ld a,(COUNT)   ; this read's block
  ld l,a
  ld h,0
  ld de,SDLBA
  call LD16      ; SDLBA = COUNT
  ld hl,BUFA
  call MREAD     ; counted
  jr z,S3B
  ld hl,(ERRS)   ; a failed read
  inc hl
  ld (ERRS),hl   ; counted

S3B:
  ld hl,COUNT    ; the next block
  inc (hl)       ; the next block
  ld a,(hl)
  cp 64          ; to 63
  jr c,S3A

; Collect the margins over a quarter in
; C: bit 0 R1, 1 token, 2 ACMD41, 3
; CMD0.

  ld c,0
  ld a,(R1MAX)
  cp 5           ; more than 4 of 16
  jr c,S3C
  set 0,c        ; R1 over

S3C:
  push bc        ; CMP32 changes C
  ld hl,QTOK
  ld de,TOKMAX
  call CMP32     ; 16,384 < TOKMAX?
  pop bc
  jr nc,S3D
  set 1,c        ; token over

S3D:
  ld hl,(A41N)   ; more than 64 of 256
  ld de,65
  or a
  sbc hl,de
  jr c,S3E
  set 2,c        ; ACMD41 over

S3E:
  ld a,(CMD0N)   ; more than 2 of 10
  cp 3
  jr c,S3F
  set 3,c        ; CMD0 over

S3F:
  ld a,c         ; the margins over
  ld (ERRCODE),a
  or a           ; none over?
  ld b,RPASS     ; none: PASS
  jr z,S3G
  ld b,RWARN     ; some: WARN

S3G:
  ld hl,(ERRS)   ; a failed read: FAIL
  ld a,h         ; any errors?
  or l
  ld a,b
  jr z,S3H
  ld a,RFAIL     ; errors: FAIL

S3H:
  call RESULT    ; the status
  call FIELDS
  DB " r1max=",0,FD8
  DW R1MAX
  DB "/16 tokmax=",0,FD32
  DW TOKMAX
  DB "/65536 acmd41=",0,FD16
  DW A41N
  DB "/256 cmd0=",0,FD8
  DW CMD0N
  DB "/10 reads=64 err=",0,FD16
  DW ERRS
  DB 0,0
  ld a,(ERRCODE)
  or a           ; a quarter: done
  jp z,ENDL      ; nothing over
  call PRI       ; and the names
  DB " over=",0
  ld hl,OVTXT    ; the margins' names
  ld a,(ERRCODE)
  ld c,a         ; their bits
  ld b,0         ; names printed so far

S3I:
  srl c          ; the next margin's bit
  jr nc,S3J
  ld a,b         ; a comma between names
  or a
  ld a,','
  call nz,PUTC   ; between names
  push hl
  call PRS       ; its name
  pop hl
  inc b          ; one more printed

S3J:
  ld a,(hl)      ; past this name
  inc hl
  or a
  jr nz,S3J      ; until its zero
  ld a,c         ; more bits to look at?
  or a
  jr nz,S3I      ; another bit left?
  jp ENDL

; SD4: the CSD and CID. The CSD gives
; the capacity in blocks; the CID the
; maker, OEM, product name, revision and
; serial number.

SD4:
  ld hl,RSD4
  call BEGIN     ; SD4's record
  call NEEDSD
  ret nz         ; no card: skipped
  ld a,9         ; CMD9: the CSD
  ld hl,CSD
  call RDREG
  jp nz,S4F      ; the read failed
  ld a,10        ; CMD10: the CID
  ld hl,CID
  call RDREG
  jp nz,S4F      ; the read failed
  call CSDCAP    ; the capacity
  ld a,$FF       ; an unknown CSD
  jp nz,S4F
  ld a,1         ; CARDBLK is known
  ld (CSDOK),a   ; for SD5 and SD8
  call CLASS     ; the size class
  ld (S4ST),a    ; PASS or WARN
  ld a,(CSD)     ; the CSD version:
  rlca           ; structure + 1
  rlca
  and 3
  inc a
  ld (ERRCODE),a
  ld a,(CID+8)   ; the revision's
  rrca           ; major digit
  rrca           ; kept for the line
  rrca
  rrca
  and $0F
  ld (PRON),a    ; the major digit
  ld a,(CID+8)   ; and minor
  and $0F
  ld (PROFF),a   ; the minor digit
  ld a,(S4ST)    ; WARN: under 90% of
  call RESULT    ; its size class
  call FIELDS
  DB " blocks=",0,FD32
  DW CARDBLK
  DB " mib=",0,FD32
  DW MIBV
  DB " class=",0,0
  ld hl,(CLSNM)  ; the class's name
  call PRS
  call FIELDS
  DB " csd=v",0,FD8
  DW ERRCODE
  DB " mid=",0,FHEX
  DW CID
  DB " oid=",0,0
  ld hl,CID+1    ; two OEM characters
  ld b,2
  call PRTXT     ; the OEM id
  call PRI
  DB " pnm=",0
  ld hl,CID+3    ; five name characters
  ld b,5
  call PRTXT     ; the product name
  call FIELDS
  DB " prv=",0,FD8
  DW PRON
  DB ".",0,FD8
  DW PROFF
  DB " psn=",0,FHEX4
  DW CID+9
  DB 0,0
  jp ENDL        ; the line's end

S4F:
  ld (ERRCODE),a
  ld a,RFAIL     ; the read's error
  call RESULT    ; the status
  call FIELDS
  DB " err=",0,FD8
  DW ERRCODE
  DB 0,0
  jp ENDL        ; the line's end

; Print B CID characters from HL, with
; anything but a letter or digit shown
; as "_" so the field stays one word.

PRTXT:
  ld a,(hl)      ; the next character
  inc hl
  cp '0'         ; below the digits
  jr c,PT2       ; a control or space
  cp 'z'+1       ; above the letters
  jr nc,PT2
  cp '9'+1       ; a digit
  jr c,PT3       ; a digit
  cp 'A'
  jr c,PT2
  cp 'Z'+1       ; upper case
  jr c,PT3
  cp 'a'         ; lower case
  jr nc,PT3      ; lower case

PT2:
  ld a,'_'       ; anything else

PT3:
  call PUTC      ; keeps B and HL
  djnz PRTXT     ; B characters
  ret

; CARDBLK and LASTBLK from the CSD. v2:
; (C_SIZE + 1) x 1024. v1: (C_SIZE + 1)
; shifted left by C_SIZE_MULT + 2 and by
; READ_BL_LEN - 9. Returns NZ for
; another structure or a zero size.

CSDCAP:
  ld a,(CSD)     ; the CSD structure
  and $C0
  jr z,CV1       ; 0: v1, SDSC
  cp $40         ; 1: v2, SDHC/SDXC
  ret nz         ; another: unknown
  ld a,(CSD+9)   ; C_SIZE, 22 bits,
  ld (M32A),a    ; in bytes 7-9
  ld a,(CSD+8)
  ld (M32A+1),a
  ld a,(CSD+7)
  and $3F        ; its top 6 bits
  ld (M32A+2),a
  xor a
  ld (M32A+3),a  ; below 4 Gi blocks
  ld b,10        ; then x 1024
  jr CV2

CV1:
  ld a,(CSD+6)   ; C_SIZE, 12 bits:
  and 3          ; 2 from byte 6,
  ld h,a         ; its top 2 bits
  ld a,(CSD+7)   ; 8 from byte 7
  ld l,a         ; the middle 8
  add hl,hl      ; shifted up 2
  add hl,hl
  ld a,(CSD+8)   ; and 2 from byte 8
  rlca
  rlca
  and 3
  or l           ; the low 2
  ld l,a
  ld de,M32A
  call LD16      ; C_SIZE in M32A
  ld a,(CSD+9)   ; C_SIZE_MULT: 2 bits
  and 3          ; of byte 9, 1 of 10
  add a,a
  ld b,a         ; kept
  ld a,(CSD+10)
  rlca
  and 1
  or b           ; C_SIZE_MULT
  add a,2        ; the shift: + 2
  ld b,a
  ld a,(CSD+5)   ; READ_BL_LEN
  and $0F
  sub 9          ; + its excess over 512
  jr c,CV2       ; under 9: none
  add a,b
  ld b,a

CV2:
  ld hl,M32A     ; C_SIZE + 1
  call INC32     ; + 1

CV3:
  ld hl,M32A     ; shifted left B times
  call SHL32     ; keeps B
  djnz CV3       ; B times
  ld hl,M32A     ; the blocks
  ld de,CARDBLK
  call CPY32     ; the card's blocks
  ld hl,CARDBLK  ; the last is one less
  ld de,LASTBLK
  call CPY32
  ld hl,LASTBLK
  call DEC32     ; the last block
  ld hl,CARDBLK  ; none: NZ
  call ISZ32
  jr z,CV4       ; no size
  xor a          ; Z: a size
  ret

CV4:
  or 1           ; NZ
  ret            ; NZ

; MIBV = CARDBLK / 2048, the capacity in
; MiB, and CLSNM the smallest class in
; CLSTAB the card fits. A = RWARN when
; the card has under 90% of that class's
; blocks, or RPASS. A card past every
; class shows "-" and passes.

CLASS:
  ld hl,CARDBLK  ; blocks / 2048
  ld de,MIBV
  call CPY32
  ld b,11        ; 2048 = 2^11

CA1:
  ld hl,MIBV
  call SHR32
  djnz CA1       ; eleven halvings
  ld hl,TNONE    ; no class yet
  ld (CLSNM),hl  ; no name yet
  ld ix,CLSTAB   ; the first class

CA2:
  push ix        ; this class's blocks
  pop hl
  call ISZ32     ; 0: the table's end
  ld a,RPASS     ; the end:
  ret z          ; past every class
  push ix        ; class < card?
  pop hl
  ld de,CARDBLK
  call CMP32     ; class < card?
  jr nc,CA3      ; it fits this class
  ld de,10       ; the next class
  add ix,de      ; 10 bytes an entry
  jr CA2

CA3:
  ld l,(ix+8)    ; its name
  ld h,(ix+9)
  ld (CLSNM),hl  ; the class's name
  push ix        ; its 90% figure
  pop de
  inc de         ; past the class's
  inc de
  inc de
  inc de         ; blocks: its 90%
  ld hl,CARDBLK  ; card < 90%?
  call CMP32     ; card < 90%?
  ld a,RWARN
  ret c          ; under 90%: WARN
  ld a,RPASS
  ret

TNONE:    DB    "-",0
TSDHC:    DB    "SDHC",0
TSDSC:    DB    "SDSC",0

; A quarter of 65,536, and the names of
; the margins over a quarter.

QTOK:     DB    0,$40,0,0
OVTXT:    DB    "r1",0,"tok",0,"acmd41"
  DB 0,"cmd0",0
