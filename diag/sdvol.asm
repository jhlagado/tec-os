; SD7: a read-only check of the TEC-OS
; container: MOUNT's checks in
; src/vol.asm, in the same order and
; with its ME* codes
; (container-format.md). Two more
; follow: each volume must end within
; the card (2Bh) and its first directory
; block must read (2Ch). Sets CTEND, the
; first block past all the container
; uses, for SD8.

SD7:
  ld hl,RSD7     ; the record
  call BEGIN
  call NEEDSD
  ret nz         ; no card: skipped
  xor a          ; nothing found yet
  ld (SD7OK),a
  ld (CTSEEN),a  ; no drives seen
  ld (CTDRV),a
  dec a          ; FFh: no descriptor
                 ; yet,
  ld (CTIDX),a   ; and BUFA holds
  ld (CTBUF),a   ; no table block
  call CTWALK    ; the checks
  ld (CTCODE),a  ; kept for the line
  jp z,S7OK      ; all passed

; FAIL with the code, its name and the
; descriptor's index when there is one.

  ld a,RFAIL
  call RESULT    ; FAIL
  call FIELDS
  DB " code=",0,FHEX
  DW CTCODE
  DB "h reason=",0,0
  ld a,(CTCODE)  ; the code's name:
  sub $20        ; codes from 20h
  ld hl,CTWHY    ; the names

S7A:
  or a           ; this name?
  jr z,S7B       ; found it
  push af

S7C:
  ld a,(hl)      ; past one name
  inc hl
  or a
  jr nz,S7C      ; until its zero
  pop af
  dec a
  jr S7A         ; and look again

S7B:
  call PRS       ; the name
  ld a,(CTIDX)   ; a descriptor's?
  cp $FF
  jp z,ENDL      ; not one: done
  call FIELDS
  DB " idx=",0,FD8
  DW CTIDX
  DB 0,0
  jp ENDL

; PASS. CTEND is the larger of the
; header's length and the last volume's
; end, and at least 8.

S7OK:
  ld hl,CTHB     ; the header's length
  ld de,CTEND    ; CTEND: the header's
  call CPY32
  ld hl,CTEND    ; below the last end?
  ld de,CTPRV
  call CMP32
  jr nc,S7D
  ld hl,CTPRV    ; then that end
  ld de,CTEND
  call CPY32     ; CTEND: the last end

S7D:
  ld hl,CTEND    ; below block 8?
  ld de,EIGHT
  call CMP32
  jr nc,S7E
  ld hl,EIGHT    ; then 8
  ld de,CTEND
  call CPY32     ; CTEND: 8

S7E:
  ld a,1         ; SD8 may write after
                 ; it
  ld (SD7OK),a
  ld hl,CTPRV    ; the last block used
  call DEC32     ; the last block used
  ld a,RPASS
  call RESULT    ; PASS
  call FIELDS
  DB " ver=1.",0,FD8
  DW CTMIN
  DB " vols=",0,FD8
  DW CTCNT
  DB " drives=",0,FD8
  DW CTDRV
  DB " hdrblocks=",0,FD32
  DW CTHB
  DB " lastvol=",0,FD32
  DW CTPRV
  DB " free_from=",0,FD32
  DW CTEND
  DB 0,0
  jp ENDL        ; the line's end

; Walk the header and descriptors.
; Return A=0/Z, or an ME* code with NZ.

CTWALK:
  ld hl,0        ; block 0: the header
  call LBA16     ; SDLBA = 0
  ld hl,BUFS
  call SDREAD    ; TEC-OS's read
  ld a,$20       ; MEIO: unreadable
  ret nz
  ld hl,BUFS     ; "TECOSVOL"
  ld de,MAGIC    ; the magic
  ld b,8
  call CMPN      ; matches?
  ld a,$21       ; MEMAGIC
  ret nz
  ld a,(BUFS+HMAJOR)
  cp FMTMAJ      ; the format's major
  ld a,$22       ; MEVER
  ret nz         ; major 1
  ld hl,(BUFS+HHDRSZ)
  ld de,HDRSZ    ; header bytes
  or a           ; 512
  sbc hl,de
  ld a,$23       ; MESIZE
  ret nz
  ld hl,(BUFS+HDSCSZ)
  ld de,DSCSZ    ; descriptor bytes
  or a           ; 32
  sbc hl,de
  ret nz         ; MESIZE still in A

; The count: 1-8 in 1.0, 1-127 in any
; later minor.

  ld hl,(BUFS+HCOUNT)
  ld a,h         ; the high byte is 0
  or a           ; the volume count
  ld a,$24       ; MECOUNT
  ret nz
  ld a,l         ; and the low not 0
  or a
  jr z,CW1       ; zero: MECOUNT
  ld (CTCNT),a   ; kept
  ld a,(BUFS+HMINOR)
  ld (CTMIN),a   ; the limit
  or a           ; 1.0: 8
  ld a,MAXVOL0+1
  jr z,CW2       ; minor 0
  ld a,MAXVOL+1  ; 1.1: 127

CW2:
  ld b,a         ; the limit + 1
  ld a,(CTCNT)   ; within it?
  cp b
  jr c,CW3       ; within it

CW1:
  ld a,$24       ; MECOUNT
  or a
  ret

; The checksum: every header byte but
; its own two, summed to 16 bits.

CW3:
  call HSUM      ; HL: the sum
  ld de,(BUFS+HCKSUM)
  or a           ; the stored sum
  sbc hl,de
  ld a,$25       ; MESUM
  ret nz         ; they differ
  ld hl,BUFS+HBLOCKS
  ld de,CTHB     ; the header declares
  call CPY32     ; CTHB
  ld a,(CTMIN)   ; 1.0: no drives
  or a           ; field or table sum
  jr z,CW5

; 1.1: drives 0-4, and the sum of the
; whole table blocks after block 0.

  ld a,(BUFS+HDRIVES)
  ld (CTDRV),a   ; the drives field
  cp MAXDRV+1    ; at most 4
  ld a,$23       ; MESIZE
  jp nc,CWX      ; past 4: MESIZE
  ld a,(CTCNT)   ; count / 16 blocks
  rrca           ; / 16
  rrca
  rrca
  rrca
  and $0F
  jr z,CW5       ; none past block 0
  ld b,a         ; B blocks to sum
  ld c,1         ; from block 1
  ld hl,0        ; the running sum
  ld (NUM),hl    ; NUM = 0

CW4:
  push bc        ; read table block C
  ld l,c
  ld h,0         ; the block number
  call LBA16
  ld hl,BUFA
  call SDREAD    ; TEC-OS's read
  pop bc
  ld a,$20       ; MEIO
  jr nz,CWX      ; unreadable
  push bc        ; and add it in
  call SUMA      ; NUM += its bytes
  pop bc
  inc c          ; the next block
  djnz CW4       ; each block
  ld hl,(NUM)    ; as declared?
  ld de,(BUFS+HTSUM)
  or a           ; the stored sum
  sbc hl,de
  ld a,$25       ; MESUM
  jr nz,CWX      ; they differ

; Each descriptor, mounted or not, in
; table order.

CW5:
  ld hl,0        ; no previous end
  ld (CTPRV),hl  ; CTPRV = 0
  ld (CTPRV+2),hl
  xor a          ; from descriptor 0
  ld (CTIDX),a   ; CTIDX = 0

CW6:
  call DPTR      ; HL: its address
  ld a,$20       ; MEIO
  jr nz,CWX      ; unreadable
  ld (DESC),hl   ; kept for DCHECK
  push hl        ; IX for its fields
  pop ix
  call DCHECK    ; its checks
  jr nz,CWX      ; one failed
  ld hl,CTIDX    ; the next one
  inc (hl)
  ld a,(CTCNT)   ; all CTCNT done?
  cp (hl)
  jr nz,CW6      ; not yet

; Drive A must be mounted.

  ld a,$FF       ; not a descriptor's
  ld (CTIDX),a   ; failure
  ld a,(CTSEEN)  ; drive A's bit
  rrca           ; bit 0 to carry
  ld a,$2A       ; MENOA
  jr nc,CWX      ; no drive A
  xor a          ; all passed
  ret            ; Z

CWX:
  or a           ; the code, NZ
  ret            ; NZ

; Check descriptor IX (index CTIDX)
; against MOUNT's rules, then the card's
; size and its directory block. Return
; Z, or the code with NZ.

DCHECK:
  ld a,(ix+DVOLID)
  or (ix+DVOLID+1)
  or (ix+DVOLID+2)
  or (ix+DVOLID+3)
  jr z,DC1       ; a zero id
  ld a,(ix+DFLAGS)
  and DFBAD      ; read-only only
  jr nz,DC1      ; other flags set
  ld a,(ix+DGEOM)
  call GEOLEN    ; HL: its length
  jr nz,DC1      ; unknown geometry
  ld a,(ix+DLEN)
  cp l           ; exactly it
  jr nz,DC1      ; the length differs
  ld a,(ix+DLEN+1)
  cp h
  jr nz,DC1      ; the length differs
  ld a,(ix+DLEN+2)
  or (ix+DLEN+3)
  jr nz,DC1      ; the length's top
  ld a,(ix+DSTART)
  and ALIGNB-1   ; aligned to 8
  jr nz,DC1      ; not a multiple of 8
  ld a,(ix+DSTART)
  or (ix+DSTART+1)
  or (ix+DSTART+2)
  or (ix+DSTART+3)
  jr nz,DC2      ; nonzero: on

DC1:
  ld a,$26       ; MEDESC
  or a           ; NZ
  ret            ; the code

; The start must not be below the
; previous end. The end must not wrap or
; pass the header's length or, on SDSC,
; 800000h.

DC2:
  ld hl,(DESC)   ; the start
  ld de,DSTART   ; + DSTART
  add hl,de
  ld de,CTPRV    ; below the last end?
  call CMP32     ; start < CTPRV?
  ld a,$28       ; MEOVLAP
  jp c,DCX       ; overlapping
  ld hl,(DESC)   ; end = start
  ld de,DSTART
  add hl,de      ; + DSTART
  ld de,CTPRV
  call CPY32     ; CTPRV = start
  ld hl,(DESC)   ; + length
  ld de,DLEN
  add hl,de      ; + DLEN
  ex de,hl
  ld hl,CTPRV
  call ADD32     ; CTPRV = start +
                 ; length
  ld a,$27       ; MERANGE: it wrapped
  jp c,DCX       ; wrapped
  ld hl,CTHB     ; header < end?
  ld de,CTPRV
  call CMP32     ; CTHB < end?
  ld a,$27
  jp c,DCX       ; past the header's
                 ; length
  ld a,(SDBYTE)  ; SDSC only:
  or a
  jr z,DC3       ; SDHC: no limit
  ld a,(CTPRV+3)
  or a           ; end <= 800000h
  ld a,$27       ; past 800000h
  jr nz,DCX
  ld a,(CTPRV+2)
  cp $80         ; byte 2: 80h?
  jr c,DC3       ; below 80h
  ld a,$27
  jr nz,DCX      ; above 80h
  ld a,(CTPRV+1)
  ld hl,CTPRV    ; 800000h is allowed
  or (hl)        ; and byte 0
  ld a,$27       ; 80h: exactly
  jr nz,DCX      ; past 800000h

; The drive: FFh, or below MAXDRV and
; below the 1.1 drives field when that
; is set, and not assigned twice.

DC3:
  ld a,(ix+DMOUNT)
  cp DUNMNT      ; FFh: not mounted
  jr z,DC5       ; not mounted
  cp MAXDRV      ; A-D only
  ld a,$29       ; MEMOUNT
  jr nc,DCX      ; past D: MEMOUNT
  ld a,(CTDRV)   ; drives 0: FFh, any
  dec a          ; drives - 1
  cp (ix+DMOUNT)
  ld a,$29       ; past the Nth?
  jr c,DCX       ; past the Nth drive
  ld b,(ix+DMOUNT)
  inc b          ; the drive's bit
  ld a,$80       ; bit 0 after one turn

DC4:
  rlca
  djnz DC4       ; the drive's bit
  ld hl,CTSEEN   ; seen before?
  ld b,a
  and (hl)       ; seen already?
  ld a,$29
  jr nz,DCX      ; assigned twice
  ld a,b         ; seen now
  or (hl)
  ld (hl),a      ; seen now

; Beyond MOUNT: the end within the card,
; and the directory block readable.

DC5:
  ld a,(CSDOK)   ; no size known
  or a
  jr z,DC6       ; no card size
  ld hl,CARDBLK  ; card < end?
  ld de,CTPRV
  call CMP32     ; CARDBLK < end?
  ld a,$2B       ; past the card
  jr c,DCX       ; past the card

DC6:
  ld hl,(DESC)   ; the first block,
  ld de,DSTART   ; where the directory
  add hl,de      ; starts
  ld de,SDLBA
  call CPY32     ; SDLBA = the start
  ld hl,BUFB
  call SDREAD    ; TEC-OS's read
  ld a,$2C       ; unreadable
  jr nz,DCX      ; unreadable
  xor a          ; Z: all passed
  ret            ; Z

DCX:
  or a           ; the code, NZ
  ret            ; NZ

; HL = the payload length of geometry A
; from GEOTAB. NZ for an unknown one.

GEOLEN:
  ld hl,GEOTAB   ; the table
  ld b,a         ; the id sought

GL1:
  ld a,(hl)      ; an id
  or a           ; zero: the end
  jr z,GL2       ; 0: the table's end
  inc hl
  cp b           ; flags kept from here
  ld e,(hl)      ; its length
  inc hl         ; the length's low byte
  ld d,(hl)
  inc hl         ; past the entry
  jr nz,GL1      ; not this one
  ex de,hl       ; HL: the length
  xor a
  ret            ; Z

GL2:
  inc a          ; NZ: unknown
  ret            ; NZ

; HL = descriptor CTIDX's address: block
; 0's slots 1-15, then 16 a block in
; blocks 1-7, read into BUFA (CTBUF
; names the block there). NZ when that
; block can't be read.

DPTR:
  ld a,(CTIDX)   ; the index
  cp DSCBLK0     ; in block 0?
  jr nc,DP1      ; 15 or more: blocks
                 ; 1-7
  inc a          ; slot A+1
  ld de,BUFS     ; block 0's copy
  jr DP3

DP1:
  sub DSCBLK0    ; in block 1-7: the
  ld c,a         ; index past block 0
  rrca           ; / 16, + 1
  rrca           ; / 16
  rrca
  rrca
  and $0F
  inc a          ; block 1-7
  ld hl,CTBUF    ; already in BUFA?
  cp (hl)
  jr z,DP2       ; already there
  ld (hl),a      ; read it there
  ld l,a
  ld h,0         ; SDLBA = it
  push bc
  call LBA16
  ld hl,BUFA
  call SDREAD    ; TEC-OS's read
  pop bc
  jr z,DP2       ; read
  ld a,$FF       ; not read: none there
  ld (CTBUF),a   ; nothing in BUFA
  or a
  ret            ; NZ

DP2:
  ld a,c         ; its slot, mod 16
  and $0F
  ld de,BUFA     ; that block's copy

DP3:
  ld l,a         ; slot x 32 bytes
  ld h,0
  add hl,hl      ; x 32
  add hl,hl
  add hl,hl
  add hl,hl
  add hl,hl      ; x 32
  add hl,de      ; in its block
  xor a
  ret            ; Z

; HL = the 16-bit sum of BUFS's 512
; bytes but the checksum's own two.

HSUM:
  ld hl,0        ; the sum
  ld de,BUFS     ; block 0's copy
  ld bc,0        ; the offset

HS1:
  ld a,b         ; the checksum is in
  or a           ; the first 256
  jr nz,HS2      ; past offset 255
  ld a,c
  cp HCKSUM      ; its two bytes
  jr z,HS3       ; skip the checksum
  cp HCKSUM+1
  jr z,HS3       ; skip the checksum

HS2:
  ld a,(de)      ; add the byte
  add a,l
  ld l,a         ; added to L
  jr nc,HS3
  inc h          ; the carry to H

HS3:
  inc de
  inc bc         ; the next offset
  ld a,b         ; 512 bytes
  cp 2
  jr nz,HS1      ; until 512
  ret            ; HL: the sum

; NUM's low word += the sum of BUFA's
; 512 bytes, modulo 65536.

SUMA:
  ld hl,(NUM)    ; the sum so far
  ld de,BUFA
  ld bc,512      ; one block

SA1:
  ld a,(de)      ; add the byte
  add a,l
  ld l,a         ; added to L
  jr nc,SA2
  inc h          ; the carry to H

SA2:
  inc de
  dec bc         ; the next byte
  ld a,b         ; 512 bytes
  or c
  jr nz,SA1      ; until 512
  ld (NUM),hl
  ret            ; NUM: the sum so far

; The reasons for codes 20h-2Ch, in
; order, and block 8.

CTWHY:    DB    "read",0,"magic",0
  DB "version",0,"size",0,"count",0
  DB "checksum",0,"descriptor",0,"range"
  DB 0,"overlap",0,"drive",0,"noA",0
  DB "card",0,"directory",0
EIGHT:    DB    8,0,0,0
