; SHELL.SVC's overlay loader and the
; ROM's name parser. DIR, COPY and
; SERVICES are not resident: their code
; is the overlay, at the back of the
; shell's own file, read into the TPA
; at OVBASE when one of them runs.
; Included by shell.asm.

; The ROM's name parser, TNPARSE: the
; name at HL into the 36-byte FCB at
; DE, whose drive, name, type and rest
; are cleared first. Carry for a bad
; name or drive. Returns HL at the
; delimiter. FCBBASE keeps the FCB for
; UNAMBIG. Changes AF, BC and DE.

PARSEFCB:
  ld (FCBBASE),de
  ld c,TNPARSE
  jp ABICALL     ; the ROM's parser

; Carry if the FCB at FCBBASE has no
; name, or a ? in its name or type.
; HL and BC are kept.

UNAMBIG:
  push hl
  push bc
  ld hl,(FCBBASE)
  inc hl
  ld a,(hl)      ; the name's first
  cp SPACE       ; blank: no name
  jr z,UNA1      ; no name: Z, carry
  ld bc,11       ; name and type
  ld a,'?'       ; wild?
  cpir           ; Z if a ? is found

UNA1:
  pop bc         ; restore
  pop hl
  scf            ; Z: carry, refused
  ret z          ; refused
  or a           ; NZ: clear carry
  ret

; The handlers in SHTAB: each loads the
; overlay and enters it with HL after
; its word, at its entry in the
; overlay's table.

; DIR /W is the ROM's wide listing, as
; with no shell: the switch blanked, the
; ROM runs the rest, with no overlay.

OVDIR:
  push hl        ; the operand
  call SKIPSP
  cp '/'         ; a switch?
  jr nz,OVD1     ; no switch
  inc hl
  ld a,(hl)      ; its letter
  dec hl
  and $DF        ; w or W
  cp 'W'         ; another is a bad
  jr nz,OVD1     ; name, refused there
  ld (hl),SPACE  ; /W blanked: the
  inc hl         ; ROM's DIR runs
  ld (hl),SPACE  ; the rest
  jp HAND        ; to the ROM

OVD1:
  pop hl
  xor a          ; DIR, entry 0
  jr OVLOAD

OVCOPY:
  ld a,3         ; COPY, entry 3
  jr OVLOAD

OVSVC:
  ld a,6         ; SERVICES, entry 6

; Read the file the shell was
; installed by, on the drive and in the
; user INIT kept, from OVREC into
; OVBASE, as many records as the first
; says. Its stamp must be this shell's.
; The user and the DMA are put back. A
; DIR whose overlay can't be read goes
; to the ROM's; COPY and SERVICES fail
; with FF00h.

OVLOAD:
  push hl        ; the operand
  push af        ; the entry
  ld e,$FF
  ld c,32        ; 32: the user now
  call BDOS
  push af
  ld a,(OVUSR)   ; the shell's own
  ld e,a
  ld c,32
  call BDOS
  ld hl,CFCB     ; the file's FCB
  ld de,CFCB+1
  ld bc,35
  ld (hl),b      ; all zero
  ldir
  ld a,(OVDRV)
  ld (CFCB),a    ; its drive
  ld hl,EXNAM    ; its name
  ld de,CFCB+1
  ld c,8
  ldir
  ld hl,OVTYPE   ; type SVC
  ld c,3
  ldir
  ld de,CFCB
  ld c,15        ; 15: open
  call BDOS
  inc a
  jr z,OVFAIL    ; no file
  ld hl,(OVREC)  ; the overlay's first
  ld (CFCB+33),hl
  ld de,OVBASE

OV1:
  push de
  ld c,26        ; 26: the DMA there
  call BDOS
  ld de,CFCB
  ld c,33        ; 33: read the record
  call BDOS
  pop de
  or a
  jr nz,OVFAIL   ; a short file
  ld hl,(CFCB+33)
  inc hl         ; the next record
  ld (CFCB+33),hl
  ld hl,128
  add hl,de
  ex de,hl       ; the next 128 bytes
  ld hl,OVBASE+2
  dec (hl)       ; the records left
  jr nz,OV1
  call OVBACK    ; user and DMA back
  ld hl,(OVBASE)
  ld de,(OVSTMP)
  or a           ; its stamp, ours
  sbc hl,de
  jr nz,OVNO     ; another shell's

; Add the shell's page to each byte the
; list after OVEND marks: a gap of 1 to
; 254 from the byte before OVBASE or
; from the last marked, 255 moving on
; 254 with nothing marked, 0 ending it.

  ld hl,OVBASE-1
  ld de,OVEND    ; the list

OVR1:
  ld a,(de)
  inc de
  or a
  jr z,OVGO      ; the list's end
  ld c,a
  ld b,0
  inc a          ; 255?
  jr nz,OVR2     ; a gap to a byte
  dec c          ; on 254, nothing
  add hl,bc      ; marked
  jr OVR1

OVR2:
  add hl,bc      ; the gap
  ld a,(hl)
  add a,HIGH(HDR)
  ld (hl),a      ; its page added
  jr OVR1

OVGO:
  pop af         ; the entry
  pop hl         ; the operand
  add a,LOW(OVBASE+3)
  ld e,a
  ld d,HIGH(OVBASE+3)
  push de
  ret            ; into the overlay

OVFAIL:
  call OVBACK    ; user and DMA back

OVNO:
  pop af         ; the entry
  or a
  jp z,HAND      ; DIR: the ROM's
  ld de,OVMSG
  jp ERRMSG      ; code FF00h

; The user saved below the return, and
; the DMA at 0080h.

OVBACK:
  pop hl         ; the return
  pop af         ; the user it was
  push hl
  ld e,a
  ld c,32        ; 32: set it again
  call BDOS
  jp SETDMA

OVTYPE:   DB    "SVC"
OVMSG:    DB    "NO OVERLAY$"

; Written by the build: the overlay's
; first record in the file and its
; stamp.

OVREC:    DW    0
OVSTMP:   DW    0
