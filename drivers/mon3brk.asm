; Breakpoint state for a running
; MON-3 program. The restart stub
; saved HL and preserved AF.

R30:
  ld (BPREGS+2),bc
  ld (BPREGS+4),de
  pop hl         ; original HL
  ld (BPREGS+6),hl
  pop hl         ; PC after RST
  ld (BPPC),hl
  ld (BPSP),sp
  ld sp,MSTK     ; switch stacks
  push af        ; save AF on our stack
  pop hl         ; restore the pointer
  ld (BPREGS),hl
  ld a,i         ; P/V holds IFF2
  di
  ld (BPI),a
  push af        ; save AF on our stack
  pop hl         ; restore the pointer
  ld a,l
  and 4          ; keep P/V alone
  ld (BPIFF),a
  ld (BPREGS+8),ix
  ld (BPREGS+10),iy
  exx            ; swap BC, DE and HL
  ld (BPREGS+12),bc
  ld (BPREGS+14),de
  ld (BPREGS+16),hl
  exx            ; swap BC, DE and HL
  ex af,af'      ; switch AF sets
  push af        ; save AF on our stack
  pop hl         ; restore the pointer
  ld (BPREGS+18),hl
  ex af,af'      ; switch AF sets
  ld a,(LATCH)   ; latch before cleanup
  ld (BPLAT),a
  ld hl,(BPPC)   ; address after the RST
  ld de,HEXT
  call HLSTR     ; its digits
  ld a,'$'
  ld (de),a      ; for BDOS 9
  ld (BRKF),a    ; say BRK once
  ld (BPSTOP),a  ; keep saved state
  jp BRKRET

; Clear the stop when a new program
; is loaded or run, or a run ends.

BPCLEAR:
  xor a
  ld (BPSTOP),a
  ret

; REG prints the saved primary and
; alternate CPU registers in pairs.

CREG:
  jp nz,BAD      ; REG takes no args
  ld a,(BPSTOP)  ; a program stopped?
  or a
  jp z,BAD       ; no saved state
  ld hl,BPREGS   ; first register pair
  ld de,BPNAMES
  ld b,6         ; six pairs

BPROW:
  push bc        ; save row count
  push hl
  ex de,hl       ; column labels
  ld de,BPLINE   ; row buffer
  ld bc,3        ; copy one label
  ldir
  ex (sp),hl     ; label for column 2
  call BPWORD
  ld a,' '       ; space between pairs
  ld (de),a
  inc de
  ex (sp),hl     ; registers after word
  ld bc,3        ; copy one label
  ldir
  ex (sp),hl     ; next register word
  call BPWORD
  pop de         ; labels for next row
  push de
  push hl
  ld de,BPLINE   ; row buffer
  call PRINT     ; console output
  ld de,MCRLF
  call PRINT     ; console output
  pop hl         ; restore the pointer
  pop de
  pop bc         ; row count
  djnz BPROW     ; print the next pair
  jp PROMPT      ; back to the monitor

; Format the word at HL and step on.

BPWORD:
  ld c,(hl)      ; low byte of the word
  inc hl
  ld b,(hl)      ; high byte of the word
  inc hl
  push hl
  ld h,b
  ld l,c
  call HLSTR     ; four digits at DE
  ld a,'$'
  ld (de),a
  pop hl         ; restore the pointer
  ret

BPNAMES:
  DB "AF=BC=DE=HL=IX=IY="
  DB "BC'DE'HL'AF'PC=SP="

; CONT restores the saved CPU state
; and returns to the instruction
; after the program's RST 30h.

CCONT:
  jp nz,BAD      ; CONT takes no args
  ld a,(DMG)     ; check integrity flag
  or a
  jp nz,BAD      ; tables damaged
  ld a,(BPSTOP)  ; a program stopped?
  or a
  jp z,BAD       ; no saved state
  call BPCLEAR
  ld a,(BPI)     ; restore I
  ld i,a
  ld ix,(BPREGS+8)
  ld iy,(BPREGS+10)
  exx            ; swap BC, DE and HL
  ld bc,(BPREGS+12)
  ld de,(BPREGS+14)
  ld hl,(BPREGS+16)
  exx            ; swap BC, DE and HL
  ld hl,(BPREGS+18)
  push hl
  pop af         ; restore flags and A
  ex af,af'      ; switch AF sets
  ld a,(BPLAT)   ; restore the latch
  ld (LATCH),a
  out (SYSLAT),a
  ld sp,(BPSP)   ; user stack
  ld hl,(BPPC)   ; address after the RST
  push hl        ; the resume address
  ld hl,(BPREGS)
  push hl        ; AF restored last
  ld bc,(BPREGS+2)
  ld de,(BPREGS+4)
  ld hl,(BPREGS+6)
  ld a,(BPIFF)   ; saved interrupt state
  or a
  jr z,BPCONT    ; leave interrupts off
  pop af         ; restore flags and A
  ei             ; enable after RET
  ret

BPCONT:
  pop af         ; restore flags and A
  ret
