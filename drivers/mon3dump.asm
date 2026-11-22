; MEM [start [end]]. Explicit
; addresses mark a range in context.
; Bare MEM continues for 32 bytes.

CDUMP:
  ld a,0         ; keep operand Z
  ld (DUMPF),a
  ld de,(DUMPAT)
  jr z,DUDEFLT
  call ADDRW     ; parse the start
  jp c,BAD
  call SKIP      ; optional end
  push de
  call nz,ADDRW
  jp c,BAD
  call SKIP      ; no other operands
  jp nz,BAD
  pop hl         ; start, DE = end
  or a           ; clear carry
  sbc hl,de      ; reject reversal
  jr c,DUFOCUS
  jp nz,BAD      ; equal is valid

DUFOCUS:
  add hl,de      ; recover start

; Display and mark inclusive HL..DE.

DUSELR:
  ld (DUFIRST),hl
  ld (DUSELEND),de
  ld a,1         ; focus enabled
  ld (DUMPF),a
  ld a,e         ; align end upward
  or 3
  ld e,a
  ex de,hl
  ld bc,4
  add hl,bc      ; one following row
  jr nc,DUAFTER
  ld hl,0-1      ; top of memory

DUAFTER:
  ex de,hl       ; DE = display end
  ld a,l
  and $FC        ; align start down
  ld l,a
  or a           ; clear carry
  sbc hl,bc      ; one preceding row
  jr nc,DUSTART
  ld hl,0        ; bottom of memory
  jr DUSTART

DUDEFLT:
  ld h,d         ; copy start
  ld l,e         ; HL = start
  ld bc,31
  add hl,bc      ; inclusive end
  jr nc,DUEND
  ld hl,0-1      ; clamp at FFFFh

DUEND:
  ex de,hl       ; HL = start, DE = end

DUSTART:
  ld (DUMPEND),de

; Four bytes and their ASCII in at
; most 21 columns, even on the GLCD.

DUROW:
  push hl        ; start of the row
  ld de,DUMPLN
  call HLSTR     ; row address
  ld b,4         ; at most four bytes
  ld c,0         ; bytes in the row

DUHEX:
  ld a,' '       ; column separator
  ld (de),a
  inc de
  call DUMARK    ; '>' if selected
  cp '>'
  push af        ; selected?
  ld a,'7'       ; reverse
  call z,DUATTR
  ld a,(hl)      ; read the next byte
  call HEXA      ; byte as two digits
  pop af
  ld a,'0'       ; normal
  call z,DUATTR
  inc c          ; one byte rendered
  push de        ; save line pointer
  ld de,(DUMPEND)
  or a           ; clear carry
  sbc hl,de      ; compare addresses
  add hl,de      ; keeps Z from SBC
  inc hl         ; step to next byte
  pop de         ; row pointer
  jr z,DUASCII   ; last byte overall
  djnz DUHEX

DUASCII:
  ld (DUMPAT),hl
  pop hl         ; start of the row
  ld a,' '       ; column separator
  ld (de),a
  inc de
  ld b,c         ; render those bytes

DUCHR:
  ld a,(hl)      ; read the next byte
  cp ' '         ; control character?
  jr c,DUDOT
  cp $7F         ; DEL or high byte?
  jr c,DUCHAR

DUDOT:
  ld a,'.'       ; substitute for ASCII

DUCHAR:
  ld (de),a
  inc de
  inc hl         ; step to next byte
  djnz DUCHR
  ld a,13        ; finish the row
  ld (de),a
  inc de
  ld a,10        ; line feed
  ld (de),a
  inc de
  xor a          ; zero terminator
  ld (de),a
  ld hl,DUMPLN   ; send it to console

DUPRINT:
  ld a,(hl)      ; read the next byte
  or a           ; clear carry
  jr z,DUNEXT    ; end of line
  inc hl         ; step to next byte
  push hl        ; BDOS clobbers HL
  ld e,a
  ld c,2         ; '$' prints as data
  call BDOS
  pop hl         ; restore the pointer
  jr DUPRINT

DUNEXT:
  ld hl,(DUMPAT)
  ld a,h
  or l
  jp z,PROMPT    ; FFFFh was last
  ld de,(DUMPEND)
  or a           ; clear carry
  sbc hl,de      ; compare addresses
  jr z,DULAST
  jp nc,PROMPT   ; range finished

DULAST:
  add hl,de
  jr DUROW

; Write ESC [ n m, n in A, at DE.

DUATTR:
  push af        ; preserve parameter
  ld a,27        ; escape
  ld (de),a
  inc de
  ld a,'['       ; CSI
  ld (de),a
  inc de
  pop af         ; rendition number
  ld (de),a
  inc de
  ld a,'m'       ; set rendition
  ld (de),a
  inc de
  ret

; Select a space or a marker for the
; address at HL. Preserve the row.

DUMARK:
  ld a,(DUMPF)
  or a           ; focus enabled?
  ld a,' '
  ret z
  push de
  ld de,(DUFIRST)
  or a           ; clear carry
  sbc hl,de      ; before selection?
  jr c,DUMREST   ; before start
  add hl,de      ; recover address
  ld de,(DUSELEND)
  or a           ; clear carry
  sbc hl,de      ; at or below end?
  jr z,DUMSEL    ; inclusive end
  jr nc,DUMREST  ; after end

DUMSEL:
  ld a,'>'       ; mark this byte

DUMREST:
  add hl,de      ; recover address
  pop de
  ret

; Read a hex word or an @register.
; Same result and flags as HEXW.

ADDRW:
  ld a,(hl)
  cp '@'
  jp nz,HEXW     ; numeric operand
  ld a,(BPSTOP)
  or a           ; no saved registers?
  scf
  ret z
  inc hl         ; advance input
  ld a,(hl)
  or a           ; missing name
  scf
  ret z
  ld b,a         ; first letter
  inc hl         ; advance input
  ld a,(hl)
  or a           ; missing letter
  scf
  ret z
  ld c,a
  inc hl         ; advance input
  ld a,(hl)
  cp ' '+1       ; must end here
  ccf
  ret c          ; invalid suffix
  push hl
  ld hl,DUREGS

DUFIND:
  ld a,(hl)
  or a           ; end of names
  jr z,DUREJ
  inc hl         ; advance input
  cp b           ; first letter
  jr nz,DUSKIP
  ld a,(hl)
  cp c           ; second letter
  jr z,DUGET

DUSKIP:
  inc hl         ; advance input
  inc hl         ; advance input
  jr DUFIND

DUGET:
  inc hl         ; advance input
  ld e,(hl)      ; register offset
  ld d,0
  ld hl,BPREGS   ; saved words
  add hl,de
  ld e,(hl)
  inc hl         ; advance input
  ld d,(hl)      ; saved value
  pop hl         ; restore pointer
  or a           ; success
  ret

DUREJ:
  pop hl         ; restore pointer
  scf            ; unknown register
  ret

DUREGS:
  DB "BC",2,"DE",4,"HL",6
  DB "IX",8,"IY",10,"PC",20,"SP",22
  DB 0
