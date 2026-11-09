; Checks SD5 and SD6, reads across the
; card and read speed, with TEC-OS's
; SDREAD, and the helpers SD7-SD9 share.

; SDLBA = BLK. Changes BC/DE/HL.

LBABLK:
  ld hl,BLK      ; the block under test
  ld de,SDLBA
  jp CPY32       ; copied

; SDLBA = HL. Changes DE/HL.

LBA16:
  ld de,SDLBA    ; high word zero
  jp LD16        ; stored

; Compare 512 bytes at HL and DE. Z if
; equal; otherwise NZ with HL at the
; first difference. Changes AF/BC/DE.

CMP512:
  ld bc,512      ; one block

CM1:
  ld a,(de)
  cp (hl)        ; a difference?
  ret nz         ; they differ
  inc hl
  inc de
  dec bc         ; one fewer to go
  ld a,b         ; to the block's end
  or c
  jr nz,CM1      ; all 512
  ret            ; Z

; Read block SDLBA twice, into BUFA and
; BUFB, and compare. A failed read or a
; difference adds to ERRS and keeps the
; block and its code (FFh for a
; difference). A block an SDSC card
; can't address counts in RNGN instead:
; TEC-OS refuses it with SDERNG.

RD2:
  ld hl,BUFA     ; the first copy
  call SDREAD
  jr nz,R2E      ; failed
  ld hl,BUFB     ; the second
  call SDREAD
  jr nz,R2E      ; failed
  ld hl,BUFA     ; the same?
  ld de,BUFB
  call CMP512    ; the same?
  ret z          ; Z: no error
  ld a,$FF       ; FFh: they differ

R2E:
  cp SDERNG      ; SDSC's limit
  jr z,R2R       ; refused: counted
                 ; apart
  ld (ERRCODE),a
  ld hl,(ERRS)   ; and the count
  inc hl         ; the latest error
  ld (ERRS),hl   ; one more error
  ld hl,SDLBA    ; and its block
  ld de,ERRBLK
  jp CPY32       ; kept

R2R:
  ld hl,RNGN     ; refused by TEC-OS
  inc (hl)       ; one more refused
  ret

; SD5: block 0 read 16 times against the
; first copy, then blocks 1-7, the
; container's last block, the middle of
; the card and its last block, each read
; twice and compared.

SD5:
  ld hl,RSD5
  call BEGIN     ; SD5's record
  call NEEDSD
  ret nz         ; no card: skipped
  ld hl,0        ; no errors yet
  ld (ERRS),hl   ; ERRS = 0
  xor a
  ld (RNGN),a    ; RNGN = 0
  call LBA16     ; block 0
  ld hl,BUFS     ; the reference copy
  call SDREAD    ; TEC-OS's read
  call nz,R2E
  ld a,15        ; and 15 more reads
  ld (COUNT),a   ; COUNT = 15

S5A:
  ld hl,0        ; block 0 again
  call LBA16     ; SDLBA = 0
  ld hl,BUFA
  call SDREAD    ; TEC-OS's read
  jr nz,S5B      ; failed
  ld hl,BUFA     ; as the reference?
  ld de,BUFS
  call CMP512    ; the same?
  jr z,S5C       ; yes
  ld a,$FF       ; FFh: a difference

S5B:
  call R2E       ; count it

S5C:
  ld hl,COUNT    ; until 16 reads
  dec (hl)       ; one fewer to go
  jr nz,S5A
  ld a,1         ; then blocks 1-7

S5D:
  ld (COUNT),a   ; COUNT = this block
  ld l,a
  ld h,0
  call LBA16     ; SDLBA = it
  call RD2       ; each twice
  ld a,(COUNT)   ; the next block
  inc a
  cp 8
  jr c,S5D       ; up to 7

; The container's last block, when block
; 0 holds the magic and a nonzero
; length.

  ld hl,BUFS     ; the magic?
  ld de,MAGIC
  ld b,8
  call CMPN      ; matches?
  jr nz,S5E      ; no container
  ld hl,BUFS+HBLOCKS
  ld de,NUM      ; its length
  call CPY32     ; NUM = the length
  ld hl,NUM
  call ISZ32     ; zero?
  jr z,S5E       ; none given
  ld hl,NUM      ; its last block
  call DEC32     ; the last block
  ld hl,NUM
  ld de,SDLBA
  call CPY32     ; SDLBA = it
  call RD2       ; twice

S5E:
  ld a,(CSDOK)   ; no CSD: no size
  or a
  jr z,S5F       ; no size: skip
  ld hl,CARDBLK  ; the middle block
  ld de,SDLBA
  call CPY32     ; SDLBA = blocks
  ld hl,SDLBA
  call SHR32     ; / 2
  call RD2       ; twice
  ld hl,LASTBLK  ; the last block
  ld de,SDLBA
  call CPY32     ; SDLBA = the last
  call RD2       ; twice

S5F:
  ld hl,(ERRS)   ; any error: FAIL
  ld a,h
  or l           ; any errors?
  ld a,RPASS
  jr z,S5G
  ld a,RFAIL     ; errors: FAIL

S5G:
  call RESULT    ; the status
  call FIELDS
  DB " blk0=16 err=",0,FD16
  DW ERRS
  DB 0,0
  ld hl,(ERRS)   ; with errors, the
  ld a,h         ; latest's block and
                 ; code
  or l
  jr z,S5H       ; none: no detail
  call FIELDS
  DB " errblk=",0,FD32
  DW ERRBLK
  DB " code=",0,FHEX
  DW ERRCODE
  DB 0,0

S5H:
  ld a,(CSDOK)   ; the last block read
  or a
  jr z,S5I       ; no size known
  call FIELDS
  DB " last=",0,FD32
  DW LASTBLK
  DB 0,0

S5I:
  ld a,(SDBYTE)  ; SDHC: no range limit
  or a           ; SDHC?
  jp z,ENDL      ; no range note
  call FIELDS
  DB " sdsc_limit=8388608"
  DB " refused=",0,FD8
  DW RNGN
  DB 0,0
  jp ENDL        ; the line's end

; Z if the B bytes at HL and DE match.
; Changes AF/B/DE/HL.

CMPN:
  ld a,(de)
  cp (hl)        ; a difference: NZ
  ret nz         ; NZ: differ
  inc hl
  inc de
  djnz CMPN      ; B bytes
  ret            ; Z: all match

; SD6: read speed. With the RTC, count
; block reads over whole seconds: 5, or
; 1 when QUICK is set. Without it, read
; 256 blocks between two beeps, for a
; stopwatch.

SD6:
  ld hl,RSD6
  call BEGIN     ; SD6's record
  call NEEDSD
  ret nz         ; no card: skipped
  ld hl,0        ; no blocks read yet
  ld (COUNT),hl
  ld (COUNT+2),hl
  ld a,(RTCOK)   ; no RTC: the stopwatch
  or a           ; COUNT = 0
  jp z,S6W       ; no RTC
  ld a,(QUICK)   ; 5 seconds, or 1
  or a
  ld a,5
  jr z,S6A       ; not quick: 5
  ld a,1         ; quick: 1

S6A:
  ld (SECS),a    ; counted down
  ld (SECN),a    ; and kept for the rate
  call SECCNT    ; to a new second
  jp c,S6T       ; the clock stopped

S6L:
  ld a,(COUNT)   ; blocks 0-63 in turn
  and 63         ; 0-63 over and over
  ld l,a
  ld h,0
  call LBA16     ; SDLBA = it
  ld hl,BUFA     ; TEC-OS's read
  call SDREAD    ; TEC-OS's read
  jp nz,S6E      ; failed
  ld hl,COUNT    ; one more block
  call INC32     ; COUNT + 1
  ld d,$81       ; the RTC's seconds
  call RTCRD     ; the seconds now
  ld hl,OLDSEC   ; a new second?
  cp (hl)
  jr z,S6L       ; no change
  ld (hl),a      ; the new second
  ld hl,SECS     ; until the last
  dec (hl)       ; one second gone
  jr nz,S6L      ; more to go

; The rate: blocks x 512 / seconds.

  ld hl,COUNT    ; blocks x 512
  ld de,M32A
  call CPY32     ; M32A = COUNT
  ld b,9         ; x 2^9

S6B:
  ld hl,M32A
  call SHL32
  djnz S6B       ; nine doublings
  ld a,(SECN)    ; / seconds
  ld l,a
  ld h,0
  ld de,M32B
  call LD16      ; M32B = the seconds
  call DIV32     ; M32A: bytes a second
  ld a,RPASS
  call RESULT    ; the status
  call FIELDS
  DB " blocks=",0,FD32
  DW COUNT
  DB " secs=",0,FD8
  DW SECN
  DB " bps=",0,FD32
  DW M32A
  DB " timer=rtc",0,0
  jp ENDL        ; the line's end

S6T:
  call SKIPR     ; the clock is stopped
  DB "rtc-stopped",0
  ret            ; SD6 done

S6E:
  ld (ERRCODE),a
  ld a,RFAIL     ; a read failed
  call RESULT    ; the status
  call FIELDS
  DB " err=",0,FD8
  DW ERRCODE
  DB 0,0
  jp ENDL        ; the line's end

; Without the RTC: beep, read N blocks
; (256, or 8 with QUICK), beep. The
; reader times beep to beep.

S6W:
  ld a,(QUICK)
  or a
  ld hl,256      ; 256 blocks
  jr z,S6X
  ld hl,8        ; quick: 8

S6X:
  ld (NBLK),hl   ; N
  call NOTE      ; the stopwatch note
  DB "SD6 time from beep to beep",0
  call ENDL
  ld c,MBEEP     ; the first beep
  rst $10        ; the first beep

S6Y:
  ld a,(COUNT)   ; blocks 0-63 in turn
  and 63
  ld l,a         ; blocks 0-63
  ld h,0
  call LBA16     ; SDLBA = it
  ld hl,BUFA
  call SDREAD    ; TEC-OS's read
  jr nz,S6E      ; failed
  ld hl,COUNT    ; one more
  call INC32     ; COUNT + 1
  ld hl,(NBLK)   ; N read?
  ld de,(COUNT)
  or a
  sbc hl,de      ; N read?
  jr nz,S6Y      ; not yet
  ld c,MBEEP     ; the second beep
  rst $10        ; the second beep
  ld hl,COUNT    ; the bytes read
  ld de,M32A
  call CPY32     ; M32A = COUNT
  ld b,9

S6Z:
  ld hl,M32A     ; x 512
  call SHL32
  djnz S6Z       ; x 512
  ld a,RPASS
  call RESULT    ; the status
  call FIELDS
  DB " blocks=",0,FD32
  DW COUNT
  DB " bytes=",0,FD32
  DW M32A
  DB " timer=stopwatch",0,0
  jp ENDL        ; the line's end
