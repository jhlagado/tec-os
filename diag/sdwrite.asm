; Checks SD8 and SD9: the write test on
; free blocks, and card removal. The
; writes use TEC-OS's SDWRITE, but for
; SD8's pattern writes, which go through
; the counted MWRITE (sdcard.asm).

; SD8: the write test, on blocks SD7
; showed free only: from the container's
; end to the block before the card's
; last. Asks first: GO writes, AD skips.

SD8:
  ld hl,RSD8
  call BEGIN     ; SD8's record
  call NEEDSD
  ret nz         ; no card: skipped
  ld a,(SD7OK)   ; no container: no
  or a           ; free blocks known
  jr nz,S8A      ; SD7 passed
  call SKIPR
  DB "sd7",0
  ret            ; SD8 done

S8A:
  ld a,(CSDOK)   ; no size: no end
  or a
  jr nz,S8B      ; the size is known
  call SKIPR
  DB "sd4",0
  ret            ; SD8 done

S8B:
  ld hl,CTEND    ; the first free block
  ld de,FREE0
  call CPY32     ; FREE0 = CTEND
  ld hl,LASTBLK  ; the last free one:
  ld de,FREEL    ; before the last
  call CPY32     ; FREEL = LASTBLK
  ld hl,FREEL
  call DEC32     ; - 1
  ld a,(SDBYTE)  ; SDSC: below 800000h,
  or a           ; TEC-OS's range
  jr z,S8C       ; SDHC: no limit
  ld hl,FREEL+3
  ld a,(hl)      ; the top byte
  dec hl
  or a           ; top byte set?
  jr nz,S8L      ; past it
  ld a,(hl)      ; or byte 2 >= 80h
  cp $80
  jr c,S8C       ; under 80h: within

S8L:
  ld hl,SDSCTOP  ; 7FFFFFh at most
  ld de,FREEL
  call CPY32     ; FREEL = 7FFFFFh

S8C:
  ld hl,FREEL    ; FREEL < FREE0:
  ld de,FREE0    ; no free block
  call CMP32
  jr nc,S8D      ; FREE0 <= FREEL
  call SKIPR
  DB "nofree",0
  ret            ; SD8 done

S8D:
  call NOTE
  DB "SD8 free blocks ",0
  call PRFREE    ; FREE0-FREEL
  call ENDL      ; the note's end
  ld de,HWRITE   ; ask: GO or AD
  call ASK
  DB "SD8 GO writes and restores free"
  DB " blocks, AD skips",0
  jr z,S8E       ; GO
  call SKIPR
  DB "user",0
  ret            ; SD8 done

S8E:
  ld hl,0        ; no blocks yet
  ld (WRFAIL),hl
  ld (WRN),hl    ; WRN = 0
  xor a          ; no alias seen
  ld (ALIASM),a  ; none yet
  call SAVE07    ; blocks 0-7 kept
  jr z,S8F       ; kept
  call SKIPR     ; not read: no writes
  DB "save07",0
  ret            ; SD8 done

S8F:
  ld a,1         ; spot blocks: check
                 ; 0-7
  ld (SPOT),a    ; on
  ld hl,FREE0    ; the first free block
  ld de,BLK
  call CPY32     ; BLK = FREE0
  call WRONE     ; test it
  jp c,S8V       ; not put back: stop
  ld hl,FREEL    ; the middle one:
  ld de,BLK      ; FREE0 + (FREEL -
  call CPY32     ; FREE0) / 2
  ld hl,BLK
  ld de,FREE0
  call SUB32     ; FREEL - FREE0
  ld hl,BLK
  call SHR32     ; / 2
  ld hl,BLK
  ld de,FREE0
  call ADD32     ; + FREE0
  call WRONE     ; test it
  jr c,S8V
  ld hl,FREEL    ; the last free one
  ld de,BLK
  call CPY32     ; BLK = FREEL
  call WRONE     ; test it
  jr c,S8V

; Each power-of-two block in the free
; area: on a card that ignores its high
; address bits, as fake cards do, one of
; these lands on block 0.

  ld hl,0        ; BLK = 1
  ld (BLK+2),hl
  inc hl
  ld (BLK),hl    ; BLK = 1

S8P:
  ld hl,FREEL    ; past the last: done
  ld de,BLK
  call CMP32     ; FREEL < BLK?
  jr c,S8Q
  ld hl,BLK      ; below the first free:
  ld de,FREE0    ; not free
  call CMP32
  jr c,S8P1      ; BLK < FREE0?
  call WRONE     ; test it
  jp c,S8V       ; stop

S8P1:
  ld hl,BLK      ; the next power of two
  call SHL32     ; x 2
  jr nc,S8P      ; until it overflows

S8Q:

; A run of 32 blocks from the first free
; one, stopping at the last.

  xor a          ; no 0-7 check in the
                 ; run
  ld (SPOT),a    ; off for the run
  ld hl,FREE0
  ld de,BLK
  call CPY32     ; BLK = FREE0
  ld a,32
  ld (COUNT),a   ; COUNT = 32

S8R:
  ld hl,FREEL    ; past the last: done
  ld de,BLK
  call CMP32     ; FREEL < BLK?
  jr c,S8V
  call WRONE     ; test it
  jr c,S8V       ; not put back: stop
  ld hl,BLK      ; the next block
  call INC32     ; the next block
  ld hl,COUNT
  dec (hl)
  jr nz,S8R      ; up to 32

; The verdict: FAIL for any failure;
; WARN when the busy wait or the
; response used more than a quarter of
; TEC-OS's bound.

S8V:
  ld a,(ALIASM)  ; blocks 0-7 changed:
  or a           ; the card wraps
  jp nz,S8X      ; an alias: FAIL
  ld hl,(WRFAIL)
  ld a,h         ; any failure
  or l
  ld a,RFAIL
  jr nz,S8W      ; a failure: FAIL
  ld a,(WRSMAX)  ; more than 4 of 16
  cp 5
  ld a,RWARN
  jr nc,S8W      ; over: WARN
  ld hl,QTOK     ; 16,384 < BSYMAX?
  ld de,BSYMAX
  call CMP32     ; over a quarter?
  ld a,RWARN
  jr c,S8W       ; over: WARN
  ld a,RPASS     ; all well

S8W:
  call RESULT    ; the status
  call FIELDS
  DB " blocks=",0,FD16
  DW WRN
  DB " fail=",0,FD16
  DW WRFAIL
  DB " free=",0,0
  call PRFREE    ; the free range
  call FIELDS
  DB " busymax=",0,FD32
  DW BSYMAX
  DB "/65536 wrsmax=",0,FD8
  DW WRSMAX
  DB "/16",0,0
  jp ENDL        ; the line's end

; FAIL alias: the free block whose
; pattern write changed blocks 0-7, the
; low blocks changed, and those still
; not put back.

S8X:
  ld a,RFAIL
  call RESULT    ; the status
  call FIELDS
  DB " alias at=",0,FD32
  DW ALIASB
  DB " low=",0,0
  ld a,(ALIASM)
  call PRMASK    ; the low blocks hit
  call PRI
  DB " unrestored=",0
  ld a,(LEFT07)
  call PRMASK    ; those still wrong
  call FIELDS
  DB " blocks=",0,FD16
  DW WRN
  DB 0,0
  jp ENDL        ; the line's end

; Print the bits of A as block numbers
; 0-7 joined by commas, or "none".

PRMASK:
  or a           ; no bits
  jr nz,PM0      ; some set
  call PRI
  DB "none",0
  ret            ; none

PM0:
  ld c,a         ; the bits
  ld b,0         ; the bit's number
  ld e,0         ; numbers printed

PM1:
  srl c          ; the next bit
  jr nc,PM2      ; not set
  ld a,e         ; a comma between
  or a
  ld a,','
  call nz,PUTC   ; before all but the
                 ; first
  ld a,b         ; the number
  add a,'0'
  call PUTC      ; the number
  inc e          ; one more printed

PM2:
  inc b          ; the next bit's number
  ld a,c         ; more bits?
  or a
  jr nz,PM1      ; until no bits remain
  ret

; Read blocks 0-7 into BLK07. NZ if one
; can't be read.

SAVE07:
  xor a          ; from block 0
  ld (K07),a     ; K07 = 0

SV1:
  call AT07      ; DE: its copy's place
  ex de,hl
  push hl        ; the place
  ld a,(K07)     ; SDLBA = K07
  ld l,a
  ld h,0
  call LBA16     ; SDLBA = K07
  pop hl
  call SDREAD    ; TEC-OS's read
  ret nz         ; not read
  ld hl,K07      ; the next block
  inc (hl)
  ld a,(hl)      ; the next block
  cp 8
  jr c,SV1       ; up to 7
  xor a          ; Z: all kept
  ret            ; Z

; DE = block K07's copy in BLK07: BLK07
; + K07 x 512. Changes AF/DE/HL.

AT07:
  ld a,(K07)     ; x 512: x 2 in the
  add a,a        ; high byte
  ld d,a
  ld e,0         ; E = 0
  ld hl,BLK07
  add hl,de      ; + BLK07
  ex de,hl
  ret            ; in DE

; Read blocks 0-7 and compare them with
; BLK07. A and MASK07: the bits of the
; blocks that differ or don't read; Z if
; none.

CHK07:
  xor a          ; none differ yet
  ld (MASK07),a
  ld (K07),a     ; K07 = 0

CK7A:
  ld a,(K07)     ; read block K07
  ld l,a
  ld h,0
  call LBA16     ; SDLBA = K07
  ld hl,BUFB
  call SDREAD    ; TEC-OS's read
  jr nz,CK7B     ; unread counts as a
  call AT07      ; difference
  ld hl,BUFB     ; compared with the
                 ; copy
  call CMP512    ; as saved?
  jr z,CK7C      ; the same

CK7B:
  call BIT07     ; its bit in MASK07
  ld hl,MASK07
  or (hl)        ; added to the mask
  ld (hl),a

CK7C:
  ld hl,K07      ; the next block
  inc (hl)       ; the next block
  ld a,(hl)
  cp 8
  jr c,CK7A      ; up to 7
  ld a,(MASK07)
  or a           ; Z if none
  ret

; A = the bit of block K07. Changes
; AF/B.

BIT07:
  ld a,(K07)     ; bit K07 set
  inc a
  ld b,a         ; K07 + 1 turns
  ld a,$80

BT1:
  rlca           ; the bit moves up
  djnz BT1
  ret            ; in A

; Write back each block 0-7 still
; different from its copy, with SDWRITE,
; then compare them all again. A and
; LEFT07: those still different.

FIX07:
  call CHK07     ; which still differ
  ld (LEFT07),a  ; kept
  ret z          ; none
  xor a          ; from block 0
  ld (K07),a     ; K07 = 0

FX1:
  call BIT07     ; this one differs?
  ld hl,LEFT07
  and (hl)       ; differs?
  jr z,FX2       ; no: skip it
  ld a,(K07)     ; write its copy back
  ld l,a
  ld h,0
  call LBA16     ; SDLBA = K07
  call AT07
  ex de,hl       ; HL: its copy
  call SDWRITE   ; TEC-OS's write

FX2:
  ld hl,K07      ; the next block
  inc (hl)       ; the next block
  ld a,(hl)
  cp 8
  jr c,FX1       ; up to 7
  call CHK07     ; all back now?
  ld (LEFT07),a  ; kept for SD8's line
  ret            ; Z if all back

; Print the free range as FREE0-FREEL.

PRFREE:
  ld hl,FREE0
  call PRDEC     ; the first
  ld a,'-'
  call PUTC      ; the dash
  ld hl,FREEL
  jp PRDEC       ; the last

; Test block BLK. Save it, write a
; pattern that depends on the block
; (with the counted MWRITE), read it
; back and compare. Then always put the
; saved data back with SDWRITE, read it
; and compare, up to three times. Prints
; a "# SD8 block" line. Carry: the block
; could not be put back, so stop.

WRONE:
  ld hl,(WRN)    ; one more block
  inc hl
  ld (WRN),hl    ; kept
  xor a          ; no failure yet
  ld (WRSTEP),a
  ld (RSTEP),a
  ld (ERRCODE),a
  ld (THIS07),a  ; all clear
  call LBABLK    ; SDLBA = BLK
  ld hl,BUFS     ; save the block
  call SDREAD    ; into BUFS
  jr z,WO1       ; saved
  ld (ERRCODE),a
  ld a,1         ; step 1, and nothing
  ld (WRSTEP),a  ; is written
  call WOLINE    ; and say so
  or a           ; no carry: carry on
  ret            ; no carry

WO1:
  call PATTERN   ; BUFA from BLK
  call LBABLK    ; SDLBA = BLK
  ld hl,BUFA     ; write it, counted
  call MWRITE    ; the pattern, counted
  ld b,2         ; step 2: the write
  jr nz,WO2      ; failed
  call LBABLK    ; SDLBA = BLK
  ld hl,BUFB     ; read it back
  call SDREAD    ; into BUFB
  ld b,3         ; step 3: the read
  jr nz,WO2      ; failed
  ld hl,BUFB     ; as written?
  ld de,BUFA
  call CMP512    ; the same?
  jr z,WO3       ; yes
  ld de,BUFB     ; the offset at which
  or a           ; it differs
  sbc hl,de      ; the offset
  ld (WRAT),hl   ; kept
  ld a,$FF       ; step 4: a difference
  ld b,4         ; a difference

WO2:
  ld (ERRCODE),a
  ld a,b         ; the pattern's failure
  ld (WRSTEP),a  ; the first failure

; Put the saved block back, whatever the
; pattern's outcome.

WO3:
  xor a          ; no alias for this
                 ; block
  ld (THIS07),a  ; THIS07 = 0
  ld a,(SPOT)    ; a spot block: did
  or a           ; the write reach 0-7?
  jr z,WO3A      ; not a spot block
  call CHK07     ; blocks 0-7 changed?
  jr z,WO3A      ; no
  ld (THIS07),a  ; it did
  ld hl,ALIASM
  or (hl)
  ld (hl),a      ; added to ALIASM
  ld hl,BLK      ; the block that did it
  ld de,ALIASB
  call CPY32     ; ALIASB = BLK

WO3A:
  xor a          ; no tries yet
  ld (WRTRY),a   ; WRTRY = 0

WO4:
  ld hl,WRTRY    ; this try's number
  inc (hl)       ; try 1, 2 or 3
  call LBABLK    ; SDLBA = BLK
  ld hl,BUFS     ; TEC-OS's own write
  call SDWRITE
  ld b,5         ; step 5: the write
  jr nz,WO5      ; failed
  call LBABLK
  ld hl,BUFB     ; read it back
  call SDREAD    ; into BUFB
  ld b,6         ; step 6: the read
  jr nz,WO5      ; failed
  ld hl,BUFB     ; as saved?
  ld de,BUFS
  call CMP512    ; as saved?
  jr z,WO6       ; restored
  ld de,BUFB     ; where it differs
  or a
  sbc hl,de      ; the offset
  ld (WRAT),hl   ; kept
  ld a,$FF       ; step 7: a difference
  ld b,7         ; a difference

WO5:
  ld (RCODE),a   ; the restore's failure
  ld a,b
  ld (RSTEP),a   ; the restore's failure
  ld a,(WRTRY)   ; up to three tries
  cp 3
  jr c,WO4       ; try again
  call WO7       ; blocks 0-7 too
  call WOLINE    ; and say so
  scf            ; not restored: stop
  ret            ; carry: stop

WO6:
  xor a          ; restored
  ld (RSTEP),a
  call WO7       ; blocks 0-7 too
  call WOLINE    ; and say so
  ld a,(THIS07)  ; an alias: stop
  or a           ; no alias: go on
  ret z          ; no carry: carry on
  scf            ; an alias: stop
  ret

; After an alias, put back blocks 0-7
; that still differ.

WO7:
  ld a,(THIS07)
  or a           ; any alias?
  ret z          ; no alias
  jp FIX07       ; put 0-7 back

; Print the "# SD8 block" line for BLK,
; and count a failure in WRFAIL.

WOLINE:
  call NOTE
  DB "SD8 block ",0
  ld hl,BLK
  call PRDEC     ; its number
  ld a,(WRSTEP)  ; a failure at either
  ld hl,(RSTEP)  ; stage counts once
  or l
  ld hl,THIS07   ; or an alias
  or (hl)
  jr z,WL1       ; no failure
  ld hl,(WRFAIL)
  inc hl         ; one more failed
  ld (WRFAIL),hl

WL1:
  call PRI
  DB " pattern=",0
  ld a,(WRSTEP)  ; the pattern's outcome
  ld hl,(ERRCODE)
  call PRSTEP    ; its outcome
  ld a,(WRSTEP)  ; not saved: nothing
  cp 1           ; was written
  jp z,ENDL      ; nothing written
  call PRI
  DB " restore=",0
  ld a,(RSTEP)   ; the restore's outcome
  ld hl,(RCODE)
  call PRSTEP    ; its outcome
  call FIELDS
  DB " tries=",0,FD8
  DW WRTRY
  DB " busy=",0,FD16
  DW BSYN
  DB 0,0
  ld a,(THIS07)  ; blocks 0-7 changed
  or a
  jp z,ENDL      ; no alias: done
  call PRI
  DB " alias=",0
  ld a,(THIS07)
  call PRMASK    ; which low blocks
  jp ENDL        ; the line's end

; Print step A's outcome with code L:
; "ok", or the step's name and the code,
; with the offset for a difference.

PRSTEP:
  ld h,a         ; the step
  or a           ; 0: no failure
  jr nz,PS1      ; a failure
  call PRI
  DB "ok",0
  ret            ; done

PS1:
  push hl        ; the code
  ld a,h
  ld hl,STEPS    ; the step's name

PS2:
  dec a          ; step A's?
  jr z,PS4       ; found it

PS3:
  bit 7,(hl)     ; past one name
  inc hl
  jr z,PS3       ; until bit 7
  jr PS2         ; and on

PS4:
  ld a,(hl)      ; print its letters,
  push af        ; the last with bit 7
  and $7F
  call PUTC      ; one letter
  inc hl
  pop af
  rlca
  jr nc,PS4      ; until the last
  ld a,':'
  call PUTC      ; the colon
  pop hl
  ld a,l         ; the SDE* code, or FFh
  call PRHEX     ; as hex
  inc l          ; FFh: a difference
  ret nz         ; not FFh: done
  call PRI       ; and where
  DB "@",0
  ld hl,(WRAT)
  jp PRD16       ; the offset

; Fill BUFA with block BLK's pattern:
; byte i is i + seed, the second half
; complemented, with the seed the
; block's four bytes xor A5h.

PATTERN:
  ld hl,BLK      ; the seed
  ld a,$A5
  xor (hl)       ; ^ byte 0
  inc hl
  xor (hl)       ; ^ byte 1
  inc hl
  xor (hl)       ; ^ byte 2
  inc hl
  xor (hl)       ; ^ byte 3
  ld c,a
  ld hl,BUFA     ; the buffer
  ld b,0         ; i, 0-255

PA1:
  ld a,b         ; i + seed
  add a,c        ; + the seed
  ld (hl),a      ; the first half
  inc hl
  inc b          ; the next i
  jr nz,PA1      ; 256 bytes

PA2:
  ld a,b         ; i + seed,
                 ; complemented
  add a,c
  cpl            ; complemented
  ld (hl),a      ; the second half
  inc hl
  inc b          ; the next i
  jr nz,PA2
  ret            ; BUFA filled

; SD9: card removal. The board has no
; card-detect line, so a missing card
; shows only as commands with no answer:
; with the card out a read must fail as
; TEC-OS would see it (R1 never comes,
; SDECMD), and SDINIT's CMD0 must go
; unanswered (SDENOCD). With the card
; back, SDINIT and a block 0 read must
; work and match the copy from before.

SD9:
  ld hl,RSD9
  call BEGIN     ; SD9's record
  call NEEDSD
  ret nz         ; no card: skipped
  ld hl,0        ; block 0 before
  call LBA16     ; SDLBA = 0
  ld hl,BUFS
  call SDREAD    ; block 0 now
  ld de,HPULL    ; ask: card out
  call ASK
  DB "SD9 pull the card out, then GO."
  DB " AD skips",0
  jr z,S9A       ; GO
  call SKIPR
  DB "user",0
  ret            ; SD9 done

S9A:
  xor a          ; no card now
  ld (SDOK),a    ; SDOK = 0
  ld hl,0        ; read block 0 out
  call LBA16     ; SDLBA = 0
  ld hl,BUFA
  call SDREAD    ; TEC-OS's read
  ld (S9OR),a    ; TEC-OS's error
  call SDINIT    ; and init's
  ld (S9OI),a    ; kept for the line
  ld de,HBACK    ; ask: card back
  call ASK
  DB "SD9 put the card back, then GO",0
  call SDINIT    ; it must start again
  ld (S9IN),a    ; kept for the line
  ld a,$FF       ; not read yet
  ld (S9RD),a
  xor a          ; nor the same
  ld (S9SM),a    ; and not the same
  ld a,(S9IN)
  or a           ; the card started?
  jr nz,S9V      ; it did not start
  inc a          ; the card is back
  ld (SDOK),a    ; SDOK = 1
  ld hl,0        ; read block 0
  call LBA16     ; SDLBA = 0
  ld hl,BUFB
  call SDREAD    ; TEC-OS's read
  ld (S9RD),a
  jr nz,S9V      ; failed
  ld hl,BUFB     ; as before?
  ld de,BUFS
  call CMP512    ; the same?
  jr nz,S9V      ; another card?
  ld a,1
  ld (S9SM),a    ; the same

; PASS: the read failed with the card
; out and all worked with it back. WARN:
; the read worked out, or block 0
; changed. FAIL: it did not come back.

S9V:
  ld a,(S9IN)    ; init or read failed
  ld hl,S9RD
  or (hl)        ; either failed?
  ld a,RFAIL
  jr nz,S9W      ; then FAIL
  ld a,(S9OR)    ; read with the card
  or a           ; out
  ld a,RWARN
  jr z,S9W       ; so WARN
  ld a,(S9SM)    ; block 0 changed
  or a
  ld a,RWARN
  jr z,S9W       ; so WARN
  ld a,RPASS     ; all well

S9W:
  call RESULT    ; the status
  call FIELDS
  DB " out_read=",0,FD8
  DW S9OR
  DB " out_init=",0,FD8
  DW S9OI
  DB " init=",0,FD8
  DW S9IN
  DB " read=",0,FD8
  DW S9RD
  DB " same=",0,FD8
  DW S9SM
  DB 0,0
  jp ENDL        ; the line's end

; The SD8 steps' names, each ending with
; bit 7 set on its last letter, and the
; prompts.

STEPS:    DB    "sav",'e'+$80,"writ"
  DB 'e'+$80,"rea",'d'+$80,"dif",'f'+$80
  DB "writ",'e'+$80,"rea",'d'+$80,"dif"
  DB 'f'+$80
SDSCTOP:  DB    $FF,$FF,$7F,0
HWRITE:   DB    "GO=write AD=skip",0
HPULL:    DB    "Card out, then GO",0
HBACK:    DB    "Card back, then GO",0
