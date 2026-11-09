; Checks SD8 and SD9: the write test on
; free blocks, and card removal. The
; writes use TEC-OS's SDWRITE, but for
; SD8's pattern writes, which go through
; the counted MWRITE (sdcard.asm).

; SD8: the write test. It writes only
; blocks SD7 showed free, from the
; container's end to the block before
; the card's last, and never blocks 0-7.
; It runs only when SD2, SD3, SD4, SD5
; and SD7 passed, block 0 reads twice as
; SD7 found it, and a read-only probe
; finds no power-of-two block that reads
; as block 0. It asks for 8 then GO; AD
; between blocks stops it.

SD8:
  ld hl,RSD8     ; SD8's record
  call BEGIN
  call NEEDSD    ; SD2 failed: skipped
  ret nz
  ld a,(S3ST)    ; SD3 PASS or WARN
  cp RFAIL
  jr c,S8A       ; PASS 0 or WARN 1
  call SKIPR
  DB "sd3",0
  ret            ; skipped

S8A:
  ld a,(S5ST)    ; SD5 PASS
  or a
  jr z,S8B       ; PASS
  call SKIPR
  DB "sd5",0
  ret            ; skipped

S8B:
  ld a,(SD7OK)   ; SD7 PASS: the free
  or a           ; blocks are known
  jr nz,S8C      ; passed
  call SKIPR
  DB "sd7",0
  ret            ; skipped

S8C:
  ld a,(CSDOK)   ; SD4: a size, and
  or a           ; addressing that
                 ; agrees
  jr z,S8C1      ; with the CSD
  ld a,(CCSBAD)  ; CCS against the CSD
  or a
  jr z,S8D       ; they agree

S8C1:
  call SKIPR
  DB "sd4",0
  ret            ; skipped

; The free range: FREE0, the container's
; end, to FREEL, the block before the
; card's last, and on SDSC at most
; 7FFFFFh.

S8D:
  ld hl,CTEND    ; FREE0 = CTEND
  ld de,FREE0
  call CPY32     ; FREE0
  ld hl,LASTBLK  ; FREEL = LASTBLK - 1
  ld de,FREEL
  call CPY32     ; FREEL = LASTBLK
  ld hl,FREEL
  call DEC32     ; - 1
  ld a,(SDBYTE)  ; SDHC: no limit
  or a
  jr z,S8F       ; SDHC
  ld hl,FREEL+3  ; the top byte set,
  ld a,(hl)      ; or byte 2 at least
  dec hl         ; 80h: past SDSC's
  or a           ; range
  jr nz,S8E
  ld a,(hl)      ; byte 2
  cp $80
  jr c,S8F       ; below 80h: within

S8E:
  ld hl,SDSCTOP  ; FREEL = 7FFFFFh
  ld de,FREEL
  call CPY32     ; FREEL = 7FFFFFh

S8F:
  ld hl,FREEL    ; FREEL < FREE0:
  ld de,FREE0    ; no free block
  call CMP32
  jr nc,S8G      ; FREE0 <= FREEL
  call SKIPR
  DB "nofree",0
  ret            ; skipped

; Read-only checks before any write:
; block 0 twice, as SD7 found it, then
; the power-of-two probe.

S8G:
  call CHKREF    ; Z: block 0 is steady
  jr z,S8H       ; steady
  ld a,RFAIL
  call RESULT    ; FAIL
  call PRI
  DB " blk0=unstable blocks=0 fail=0",0
  jp ENDL        ; nothing written

S8H:
  call PROBE     ; A: 0 none, 1 alias,
  or a           ; 2 a read failed
  jp z,S8K
  cp 2
  jp z,S8J       ; a read failed
  ld a,RFAIL     ; a block reads as 0:
  call RESULT    ; the card wraps
  call FIELDS
  DB " alias at=",0,FD32
  DW BLK
  DB " probe=read-only"
  DB " blocks=0 fail=0",0,0
  call ENDL

; A copy of block 0 where it should not
; be: the card wraps, or the free area
; holds an old copy. Nothing was
; written.

NOTE0:
  call NOTE
  DB "SD8 a free block holds a copy of"
  DB " block 0: either the card wraps,"
  DB " or the free area holds an old"
  DB " copy. Nothing was written",0
  jp ENDL

S8J:
  ld a,RFAIL     ; a probe read failed
  call RESULT    ; FAIL
  call FIELDS
  DB " probe-read at=",0,FD32
  DW BLK
  DB " code=",0,FHEX
  DW ERRCODE
  DB " blocks=0 fail=0",0,0
  jp ENDL        ; nothing written

; Ask with a key pair no other prompt
; uses: 8, then GO.

S8K:
  call NOTE      ; the range
  DB "SD8 free blocks ",0
  call PRFREE
  call ENDL      ; the note's end
  call ASK8
  jr z,S8L       ; 8 then GO
  call SKIPR     ; AD, or any other key
  DB "user",0
  ret            ; skipped

S8L:
  ld hl,0        ; no blocks yet
  ld (WRFAIL),hl
  ld (WRN),hl    ; WRN = 0
  xor a
  ld (S8STOP),a  ; no stop yet
  ld a,1         ; read 0-7 after each
  ld (SPOT),a    ; spot block's write
  ld hl,FREE0    ; the first free block
  ld de,BLK
  call CPY32     ; BLK = FREE0
  call WRONE     ; no AD poll first
  jp c,S8V       ; stopped

; Each power-of-two block in the free
; range, ascending.

  ld hl,0
  ld (BLK+2),hl
  inc hl         ; BLK = 1
  ld (BLK),hl

S8P:
  ld hl,FREEL    ; past FREEL: done
  ld de,BLK
  call CMP32
  jr c,S8Q
  ld hl,BLK      ; below FREE0: not free
  ld de,FREE0
  call CMP32
  jr c,S8P1      ; below FREE0: skip
  call WRNEXT    ; test it
  jp c,S8V       ; stopped

S8P1:
  ld hl,BLK      ; the next power of two
  call SHL32     ; x 2
  jr nc,S8P      ; until it overflows

; The middle of the free range: FREE0 +
; (FREEL - FREE0) / 2.

S8Q:
  ld hl,FREEL
  ld de,BLK
  call CPY32     ; BLK = FREEL
  ld hl,BLK
  ld de,FREE0
  call SUB32     ; - FREE0
  ld hl,BLK
  call SHR32     ; / 2
  ld hl,BLK
  ld de,FREE0
  call ADD32     ; + FREE0
  call WRNEXT    ; test it
  jp c,S8V       ; stopped

; A run of 32 from the first free block,
; without the 0-7 reads, then the last
; free block.

  xor a
  ld (SPOT),a    ; no 0-7 reads
  ld hl,FREE0
  ld de,BLK
  call CPY32     ; BLK = FREE0
  ld a,32
  ld (COUNT),a   ; COUNT = 32

S8R:
  ld hl,FREEL    ; past FREEL: done
  ld de,BLK
  call CMP32
  jr c,S8S
  call WRNEXT    ; test it
  jp c,S8V       ; stopped
  ld hl,BLK
  call INC32     ; the next block
  ld hl,COUNT    ; 32 blocks
  dec (hl)
  jr nz,S8R      ; 32 blocks

S8S:
  ld a,1
  ld (SPOT),a    ; 0-7 reads again
  ld hl,FREEL
  ld de,BLK
  call CPY32     ; BLK = FREEL
  call WRNEXT    ; the last block

; The verdict. A stop (S8STOP) is FAIL
; with its reason, but AD with no
; failure, a SKIP. Otherwise FAIL for a
; failure, and WARN when the busy wait
; or the response used more than a
; quarter of TEC-OS's bound.

S8V:
  ld a,(S8STOP)
  or a
  jp nz,S8X      ; a stop
  ld hl,(WRFAIL)
  ld a,h         ; a failure: FAIL
  or l           ; any failure?
  ld a,RFAIL
  jr nz,S8W      ; FAIL
  ld a,(WRSMAX)  ; over 4 of 16
  cp 5
  ld a,RWARN
  jr nc,S8W      ; over: WARN
  ld hl,QTOK     ; over 16,384
  ld de,BSYMAX
  call CMP32     ; over a quarter?
  ld a,RWARN
  jr c,S8W       ; over: WARN
  ld a,RPASS     ; all well

S8W:
  call RESULT    ; the status
  call S8TAIL    ; the common fields
  jp ENDL

; A stop: the reason's word and the
; block, then the common fields. An
; alias or a block left changed also
; gets the note to restore the card from
; its backup.

S8X:
  cp 4           ; AD with no failure
  jr nz,S8Y      ; a stop with no
                 ; failure?
  ld hl,(WRFAIL)
  ld a,h
  or l
  jr nz,S8Y      ; a failure: FAIL
  ld a,RSKIP
  call RESULT    ; SKIP
  call PRI
  DB " reason=user-abort",0
  call S8TAIL    ; the common fields
  jp ENDL

S8Y:
  ld a,RFAIL
  call RESULT    ; FAIL
  ld a,(S8STOP)  ; the reason's word
  ld hl,STOPS
  call PRNTH     ; the reason
  call FIELDS    ; and the block
  DB " at=",0,FD32
  DW BLK
  DB 0,0
  ld a,(S8STOP)  ; 2: the low blocks
  cp 2           ; that hold the pattern
  jr nz,S8Z      ; not 2
  call PRI
  DB " low=",0
  ld a,(THIS07)
  call PRMASK    ; the low blocks

S8Z:
  ld a,(S8STOP)  ; 6: those unread
  cp 6
  jr nz,S8Z1     ; not 6
  call PRI
  DB " low=",0
  ld a,(RDF07)
  call PRMASK    ; the low blocks

S8Z1:
  call S8TAIL    ; the common fields
  call ENDL
  ld a,(S8STOP)  ; 1: a copy of block 0
  cp 1
  jp z,NOTE0
  cp 4           ; 4, 5: nothing changed
  ret z          ; 4: AD
  cp 5
  ret z          ; 5: nothing written

; Tell the owner to restore the card
; from the backup.

NOTEBK:
  call NOTE      ; the advice
  DB "SD8 the card may be changed:"
  DB " restore it from your backup"
  DB " before using it",0
  jp ENDL        ; its end

; The fields every SD8 result line ends
; with.

S8TAIL:
  call FIELDS    ; the counts
  DB " blocks=",0,FD16
  DW WRN
  DB " fail=",0,FD16
  DW WRFAIL
  DB " free=",0,0
  call PRFREE    ; the range
  call FIELDS    ; the margins
  DB " busymax=",0,FD32
  DW BSYMAX
  DB "/65536 wrsmax=",0,FD8
  DW WRSMAX
  DB "/16",0,0
  ret            ; done

; Print the A'th zero-ended text at HL,
; from 1.

PRNTH:
  dec a          ; this one?
  jp z,PRS       ; found: print it

PN1:
  ld b,a         ; the count kept
  ld a,(hl)      ; past one text
  inc hl
  or a           ; zero: its end
  ld a,b
  jr nz,PN1      ; until the zero
  jr PRNTH       ; and count down

; Z if block 0 reads the same twice and
; as SD7 found it (REF0).

CHKREF:
  ld hl,0
  call LBA16
  ld hl,BUFA     ; the first read
  call SDREAD
  ret nz         ; unread
  ld hl,0
  call LBA16
  ld hl,BUFB     ; the second
  call SDREAD
  ret nz         ; unread
  ld hl,BUFA     ; the first read
  ld de,REF0
  call CMP512    ; the first as SD7's?
  ret nz
  ld hl,BUFB     ; and the second
  ld de,REF0
  jp CMP512      ; the second as SD7's?

; Read each power-of-two block from 8 to
; the card's end, and compare it with
; block 0. Reading inside the container
; is harmless, and no volume block of a
; real card holds the header. A card
; that ignores its high address bits
; reads one of them as block 0. A=0/Z:
; none did. A=1: BLK did. A=2: BLK did
; not read, its code in ERRCODE.

PROBE:
  ld hl,0        ; from block 8, inside
  ld (BLK+2),hl  ; the container too, so
  ld l,8         ; a wrap below its end
  ld (BLK),hl    ; shows

PB1:
  ld hl,BLK      ; the card's end: done
  ld de,CARDBLK
  call CMP32     ; BLK < CARDBLK?
  jr nc,PB3
  call LBABLK
  ld hl,BUFB
  call SDREAD    ; read only
  jr nz,PB4      ; unread
  ld hl,BUFB     ; as block 0?
  ld de,REF0
  call CMP512    ; as block 0?
  jr z,PB5       ; yes: an alias

PB2:
  ld hl,BLK      ; the next power of two
  call SHL32     ; x 2
  jr nc,PB1      ; until it overflows

PB3:
  xor a          ; no alias found
  ret

PB4:
  ld (ERRCODE),a
  ld a,2         ; a read failed,
  or a           ; with NZ
  ret            ; kept

PB5:
  ld a,1         ; BLK reads as block 0,
  or a           ; with NZ
  ret

; Ask for 8 then GO, the only key pair
; that writes the card. Z for 8 then GO;
; NZ for anything else, AD included.

ASK8:
  call NOTE      ; on serial
  DB "SD8 press 8 then GO to write"
  DB " free blocks, AD skips",0
  call ENDL      ; the note's end
  ld hl,HWRITE
  ld a,LROW4
  call LCDROW    ; and on the LCD
  call GETKEY    ; 8 first
  cp 8
  jr nz,AK1      ; not 8: no
  call GETKEY    ; then GO
  cp KGO
  jr z,AK2       ; GO: yes

AK1:
  or 1           ; NZ: not written

AK2:
  push af        ; the answer
  call TOTALS
  call SHOWDIG   ; the digit back
  pop af
  ret            ; Z: 8 then GO

; Test BLK unless AD was pressed since
; the last block. Carry: stop, with
; S8STOP saying why.

WRNEXT:
  ld c,MSCANK    ; one scan of the keys
  rst $10        ; scanKeys
  jr nz,WRONE    ; none down
  jr nc,WRONE    ; held from before
  cp KAD
  jr nz,WRONE    ; not AD
  ld a,4         ; AD: stop here
  ld (S8STOP),a  ; kept
  scf
  ret            ; carry: stop

; Test block BLK. Read it twice: it must
; read the same, and not as block 0.
; Write the pattern for the block with
; the counted MWRITE, read it back and
; compare. For a spot block, read blocks
; 0-7 to see whether the pattern reached
; one. Then put the saved data back with
; SDWRITE, read and compare, up to three
; times. Prints a "# SD8 block" line.
; Carry: stop, with S8STOP saying why.

WRONE:
  ld hl,(WRN)    ; one more block
  inc hl
  ld (WRN),hl    ; kept
  xor a          ; no outcome yet
  ld (WRSTEP),a
  ld (RSTEP),a
  ld (ERRCODE),a
  ld (THIS07),a
  ld (RDF07),a   ; none yet
  call LBABLK
  ld hl,BUFS     ; the saved copy
  call SDREAD    ; the first read
  jr nz,WO0      ; unread
  call LBABLK
  ld hl,BUFB     ; and a second read
  call SDREAD    ; the second read
  jr z,WO1       ; read

WO0:
  ld (ERRCODE),a
  ld a,1         ; nothing written
  ld (WRSTEP),a  ; step 1
  call WOLINE    ; and say so
  or a           ; carry on
  ret            ; no carry: carry on

WO1:
  ld hl,BUFS     ; the two reads differ:
  ld de,BUFB     ; step 8, stop
  call CMP512
  ld a,8         ; step 8
  jr nz,WOX      ; they differ
  ld hl,BUFS     ; it reads as block 0:
  ld de,REF0     ; step 9, an alias
  call CMP512
  ld a,9         ; step 9
  jr nz,WO1A     ; not as block 0

WOX:
  ld (WRSTEP),a  ; nothing written
  sub 8          ; 8: stop 5, 9: stop 1
  ld a,5         ; unstable: stop 5
  jr z,WOX1
  ld a,1         ; as block 0: stop 1

WOX1:
  ld (S8STOP),a
  call WOLINE    ; and say so
  scf
  ret            ; carry: stop

WO1A:
  call PATTERN   ; BUFA from BLK
  call LBABLK
  ld hl,BUFA     ; written, counted
  call MWRITE    ; the pattern
  ld b,2         ; step 2: the write
  jr nz,WO2      ; failed
  call LBABLK
  ld hl,BUFB     ; read back
  call SDREAD    ; into BUFB
  ld b,3         ; step 3: the read
  jr nz,WO2      ; failed
  ld hl,BUFB     ; as written?
  ld de,BUFA
  call CMP512    ; as written?
  jr z,WO3       ; yes
  ld de,BUFB     ; the offset of the
  or a           ; first difference
  sbc hl,de      ; the offset
  ld (WRAT),hl   ; kept
  ld a,$FF       ; step 4: a difference
  ld b,4         ; a difference

WO2:
  ld (ERRCODE),a
  ld a,b         ; the pattern's failure
  ld (WRSTEP),a  ; the first failure

; For a spot block, read blocks 0-7
; (CHK07), only reading. Then put the
; saved block back, whatever the
; pattern's outcome.

WO3:
  ld a,(SPOT)    ; a spot block?
  or a
  call nz,CHK07  ; then read 0-7
  xor a          ; no tries yet
  ld (WRTRY),a   ; no tries yet

WO4:
  ld hl,WRTRY    ; try 1, 2 or 3
  inc (hl)       ; try 1, 2 or 3
  call LBABLK
  ld hl,BUFS     ; TEC-OS's own write
  call SDWRITE   ; TEC-OS's write
  ld b,5         ; step 5: the write
  jr nz,WO5      ; failed
  call LBABLK
  ld hl,BUFB     ; read back
  call SDREAD    ; into BUFB
  ld b,6         ; step 6: the read
  jr nz,WO5      ; failed
  ld hl,BUFB     ; as saved?
  ld de,BUFS
  call CMP512    ; as saved?
  jr z,WO6       ; yes
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
  ld a,3         ; not restored: stop 3
  ld (S8STOP),a  ; stop 3
  call WOLINE    ; and say so
  scf
  ret            ; carry: stop

; Restored. Stop after an alias (2) or a
; low block that did not read (6).

WO6:
  xor a
  ld (RSTEP),a
  call WOLINE    ; and say so
  ld a,(THIS07)  ; the pattern in 0-7
  or a
  ld b,2
  jr nz,WO7      ; an alias: stop 2
  ld a,(RDF07)   ; 0-7 unread
  or a
  ld b,6
  jr nz,WO7      ; unread: stop 6
  ret            ; no carry: carry on

WO7:
  ld a,b
  ld (S8STOP),a  ; kept
  scf
  ret            ; carry: stop

; Read blocks 0-7, without writing them.
; A block that reads as the pattern in
; BUFA, twice, is aliased: its bit goes
; in THIS07. A block that does not read
; goes in RDF07, and is not counted as
; an alias.

CHK07:
  xor a          ; from block 0
  ld (K07),a     ; K07 = 0

C7A:
  call K07LBA
  ld hl,BUFB
  call SDREAD    ; read only
  jr nz,C7F      ; a read failure
  ld hl,BUFB     ; the pattern there?
  ld de,BUFA
  call CMP512
  jr nz,C7N      ; not the pattern
  call K07LBA    ; then confirm it
  ld hl,BUFB
  call SDREAD    ; read again
  jr nz,C7F      ; unread
  ld hl,BUFB
  ld de,BUFA
  call CMP512    ; the pattern again?
  jr nz,C7N      ; no
  call BIT07     ; twice: aliased
  ld hl,THIS07
  jr C7M         ; and add it there

C7F:
  call BIT07     ; unread
  ld hl,RDF07    ; and add it there

C7M:
  or (hl)        ; its bit added
  ld (hl),a      ; added

C7N:
  ld hl,K07      ; the next block
  inc (hl)
  ld a,(hl)
  cp 8
  jr c,C7A       ; up to 7
  ret            ; THIS07 and RDF07 set

; SDLBA = K07.

K07LBA:
  ld a,(K07)
  ld l,a         ; K07 as a block
  ld h,0
  jp LBA16       ; SDLBA = it

; A = the bit of block K07. Changes
; AF/B.

BIT07:
  ld a,(K07)     ; K07 + 1 turns
  inc a
  ld b,a         ; K07 + 1 turns
  ld a,$80

BT1:
  rlca
  djnz BT1       ; the bit moves up
  ret            ; in A

; Print the bits of A as block numbers
; 0-7 joined by commas, or "none".

PRMASK:
  or a
  jr nz,PM0
  call PRI
  DB "none",0
  ret

PM0:
  ld c,a         ; the bits
  ld b,0         ; the bit's number
  ld e,0         ; numbers printed

PM1:
  srl c          ; the next bit
  jr nc,PM2
  ld a,e         ; a comma between
  or a
  ld a,','
  call nz,PUTC
  ld a,b         ; the number
  add a,'0'
  call PUTC
  inc e

PM2:
  inc b
  ld a,c         ; more bits?
  or a
  jr nz,PM1
  ret

; Print the free range as FREE0-FREEL.

PRFREE:
  ld hl,FREE0
  call PRDEC     ; the first
  ld a,'-'
  call PUTC      ; the dash
  ld hl,FREEL
  jp PRDEC       ; the last

; Print the "# SD8 block" line for BLK,
; and count a failure in WRFAIL.

WOLINE:
  call NOTE
  DB "SD8 block ",0
  ld hl,BLK
  call PRDEC
  ld a,(WRSTEP)  ; a failure at either
  ld hl,(RSTEP)  ; stage, or a pattern
  or l           ; in 0-7, or an unread
                 ; low
  ld hl,THIS07   ; block, counts once
  or (hl)
  ld hl,RDF07
  or (hl)
  jr z,WL1       ; no failure
  ld hl,(WRFAIL)
  inc hl         ; one more failed
  ld (WRFAIL),hl

WL1:
  call PRI
  DB " pattern=",0
  ld a,(WRSTEP)
  ld hl,(ERRCODE)
  call PRSTEP    ; its outcome
  ld a,(WRSTEP)  ; 1, 8 or 9: nothing
  cp 1           ; was written
  jp z,ENDL
  cp 8
  jp nc,ENDL     ; nothing written
  call PRI
  DB " restore=",0
  ld a,(RSTEP)
  ld hl,(RCODE)
  call PRSTEP    ; its outcome
  call FIELDS
  DB " tries=",0,FD8
  DW WRTRY
  DB " busy=",0,FD16
  DW BSYN
  DB 0,0
  ld a,(THIS07)  ; the pattern in 0-7
  or a
  jr z,WL2       ; no alias
  call PRI
  DB " alias=",0
  ld a,(THIS07)
  call PRMASK    ; the low blocks

WL2:
  ld a,(RDF07)   ; 0-7 unread
  or a
  jp z,ENDL      ; none unread
  call PRI
  DB " lowread=",0
  ld a,(RDF07)
  call PRMASK
  jp ENDL        ; the line's end

; Print step A's outcome with code L:
; "ok", or the step's name, and for
; steps 1-7 the code and, after a
; difference, its offset.

PRSTEP:
  ld h,a         ; the step
  or a
  jr nz,PS1      ; a failure
  call PRI
  DB "ok",0
  ret            ; done

PS1:
  push hl
  ld hl,STEPS    ; the names
  call PRNTH     ; the step's name
  pop hl
  ld a,h         ; 8 and 9: no code
  cp 8
  ret nc
  ld a,':'
  call PUTC
  ld a,l         ; the SDE* code, or FFh
  call PRHEX
  inc l          ; FFh: a difference
  ret nz
  call PRI
  DB "@",0
  ld hl,(WRAT)
  jp PRD16

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
  ret

S9A:
  xor a          ; no card now
  ld (SDOK),a    ; SDOK = 0
  ld hl,0        ; read block 0 out
  call LBA16     ; SDLBA = 0
  ld hl,BUFA
  call SDREAD
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
  call SDREAD
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
  call RESULT
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
  jp ENDL

; The names of SD8's steps and of its
; reasons to stop, each zero-ended, from
; 1, and the prompts.

STEPS:    DB    "save",0,"write",0
  DB "read",0,"diff",0,"write",0,"read"
  DB 0,"diff",0,"unstable",0,"block0",0
STOPS:    DB    " alias",0," alias",0
  DB " restore-failed",0," user-abort",0
  DB " unstable",0," lowread",0
SDSCTOP:  DB    $FF,$FF,$7F,0
HWRITE:   DB    "8 then GO=write",0
HPULL:    DB    "Card out, then GO",0
HBACK:    DB    "Card back, then GO",0
