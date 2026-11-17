; Console transactions and cold choice.
; The CCP parses command operands.
; All waits are cooperative and bounded.

; Snapshot the effective console, not
; just its two IOBYTE mode bits. The
; registered driver remains in GLVEC.
; Its saved address is an identity to
; compare, never a pointer to install.
; Changes AF, BC, DE and HL.

CONSAVE:
  call CONSEL    ; apply direct IOBYTE
  ld a,(CONOLD)
  and $40        ; cold bypass latch
  ld b,a         ; retain bypass flag
  ld a,(CONMOD)  ; effective old route
  or b
  or $80         ; block nested hotkeys
  ld (CONOLD),a
  ld a,(CONAUX)  ; old physical UC1
  ld (CAXOLD),a
  ld a,(PIWID)   ; include PICO geometry
  ld (CPIOLD),a
  ld a,(LCDPRF)  ; include LCD geometry
  ld (CLDOLD),a
  ld hl,(GLVEC)  ; identity, not a
                 ; vector
  ld (CGLDOLD),hl
  ret

; Z when physical device and geometry
; match the snapshot. An auxiliary
; driver must be the same live table.
; Changes AF, B, DE and HL.

CONDIFF:
  ld a,(CONOLD)
  and 3          ; exclude control flags
  ld b,a
  ld a,(CONMOD)
  xor b          ; different IOBYTE mode
  ret nz         ; same UC1 is not
                 ; enough
  ld a,b
  cp CMCRT       ; PICO width may change
  jr z,CONDPIC
  cp CMUC1
  jr nz,CONDYES  ; TTY/BAT have no width
  ld a,(CAXOLD)
  ld hl,CONAUX
  xor (hl)       ; LCD versus live
                 ; driver
  ret nz         ; same UC1 is not
                 ; enough
  ld a,(CONAUX)
  or a
  jr nz,CONDGLC  ; compare live
                 ; ownership
  ld a,(CLDOLD)
  ld hl,LCDPRF
  cp (hl)        ; LCD profile may
                 ; change
  ret

CONDPIC:
  ld a,(CPIOLD)
  ld hl,PIWID    ; current PICO geometry
  cp (hl)        ; same device, new
                 ; width
  ret

CONDGLC:
  ld hl,(CGLDOLD)
  ld de,(GLVEC)  ; current installation
  or a           ; comparison has no
                 ; borrow
  sbc hl,de      ; owner must still
                 ; match
  ret

CONDYES:
  xor a          ; identical route: Z
  ret

; Confirm only a changed device or
; width. This uses ROM console calls
; so cold startup can share it before
; the card and BDOS are available.
; KEYWT takes a fresh target key.

CONASK:
  call CONDIFF
  ret z          ; no needless question
  ld hl,PRESSK
  call CONTXT    ; visible on target
  ld hl,KWPOLL   ; whole question budget
  call KEYWT
  push af        ; retain timeout result
  call CONCRLF
  pop af
  ret nz         ; fresh key commits
  call CONROLL   ; timeout restores all
  jp CONREP

; Restore the former profile and route.
; A driver drop clears CGLDOLD, so even
; a new installation at the same page
; cannot pass the identity comparison.
; GLVEC is never written here. Missing
; devices fall back to the ROM LCD,
; then serial when no matrix is fitted.
; Changes AF, BC, DE and HL.

CONROLL:
  ld a,(CLDOLD)
  or a
  jr nz,CONR40   ; old dual controller
  ld a,20        ; hide second cursor
                 ; too
  call LCDWID
  jr CONRPIC     ; restore both profiles

CONR40:
  call LCDWSET   ; already proved
                 ; profile

CONRPIC:
  ld a,(CPIOLD)
  ld hl,PIWID
  cp (hl)        ; avoid a display reset
  jr z,CONRAUX   ; geometry unchanged
  or a
  jr z,CONRAUX   ; no former PICO
  call TMSWID    ; restore retained
                 ; width
  jr nc,CONRAUX  ; old PICO still usable
  xor a          ; safe ROM LCD fallback
  call CONASEL
  ld a,CMUC1     ; CONSW checks keyboard
  jp CONSW       ; unavailable width

CONRAUX:
  ld a,(CONOLD)
  and 3          ; remove snapshot flags
  ld b,a         ; mode across CONASEL
  ld a,(CAXOLD)
  or a           ; clear comparison
                 ; borrow
  jr z,CONRSET   ; former ROM LCD route

; invalidated on drop

  ld hl,(CGLDOLD)
  ld a,h
  or l
  jr z,CONRSET   ; old identity gone
  ld de,(GLVEC)  ; resolve live
                 ; ownership
  or a           ; clear comparison
                 ; borrow
  sbc hl,de
  ld a,0         ; mismatch falls to LCD
  jr nz,CONRSET  ; never republish
                 ; pointer
  inc a          ; the same live driver

CONRSET:
  call CONASEL   ; only route preference
  ld a,b
  jp CONSW       ; copy live vectors now

; End a transaction after success or
; rollback. Error and warm-boot paths
; clear the same flag independently.

CONTEND:
  ld hl,CONOLD
  res 7,(hl)     ; enable recovery
                 ; hotkey
  ret

; Report through ROM output, available
; before BDOS initialisation as well.

CONREP:
  call CONSEL    ; apply requested route
  ld hl,CONHDR
  call CONTXT    ; works before BDOS
  ld a,(CONMOD)
  add a,a        ; four-byte mode record
  add a,a        ; four-byte mode record
  ld l,a
  ld h,0         ; unsigned record
                 ; offset
  ld de,CONNAMS
  add hl,de      ; mode name plus colon
  ld b,4         ; fixed record length

CONSH1:
  push bc        ; output may use B
  push hl        ; retain name pointer
  ld a,(hl)
  call CONPUT
  pop hl
  pop bc         ; retain record count
  inc hl
  djnz CONSH1    ; exactly four chars
  jp CONCRLF     ; finish visible
                 ; feedback

; Transaction feedback is visible on
; serial even when BAT discards normal
; output. Keep IOBYTE and BAT routing.
; Changes AF, BC, DE and HL.

CONTXT:
  ld a,(hl)
  or a
  ret z          ; zero ends ROM text
  push hl        ; driver may change HL
  call CONPUT
  pop hl
  inc hl         ; next feedback byte
  jr CONTXT      ; stop at string end

CONCRLF:
  ld a,13        ; same route for CR/LF
  call CONPUT
  ld a,10        ; fall into feedback

CONPUT:
  push af        ; retain feedback byte
  ld a,(CONMOD)
  cp CMBAT       ; BAT still needs a
                 ; query
  jr nz,CONPUT1  ; other physical route
  pop af
  jp TXBYTE      ; IOBYTE stays BAT

CONPUT1:
  pop af
  jp PUTA        ; normal ROM dispatch

; Wait a finite processor-work budget
; for a fresh key on the selected
; keyboard. Discard prior bytes and
; arrow tails. A complete KBPOLL scan
; must report all keys released first.
; Serial first needs twelve idle bit
; periods before a fresh start.
; No housekeeping or route change runs
; inside this timed wait. Normal BIOS
; input keeps its existing behaviour.
; HL is the remaining poll-slot budget.
; NZ: consumed key in A; Z: timeout.
; Changes AF, BC, DE and HL.

KEYWT:
  xor a          ; discard earlier input
  ld (RXFULL),a
  ld (KBTN),a    ; drop matrix arrow
                 ; tail
  ld a,(CONMOD)
  rrca           ; odd modes use matrix
  jr nc,KEYWS    ; TTY/BAT use serial
  push hl        ; cursor may use HL
  call CURSHOW
  pop hl
  ld de,0        ; E: release observed

KEYWM:
  push hl        ; retain whole budget
  push de        ; retain release latch
  call KBPOLL    ; one complete raw scan
  pop de
  pop hl
  jr z,KEYWMREL  ; may have seen release
  ld a,e
  or a           ; fresh key needs
                 ; release
  jr z,KEYWM2    ; reject held/pending
                 ; key
  ld a,(RXCHAR)
  jr KEYWTAKE    ; consume its arrow
                 ; tail

KEYWM2:
  xor a          ; held/pending input
  ld (RXFULL),a
  ld (KBTN),a    ; reject any queued
                 ; tail

KEYWMREL:
  ld a,(KBLAST)
  inc a          ; FFh means all
                 ; released
  jr nz,KEYWM3   ; a key remains held
  ld e,1         ; full scan found no
                 ; key

KEYWM3:
  ld b,KWPAD     ; finite per-scan work

KEYWM4:
  djnz KEYWM4
  dec hl         ; charge one matrix
                 ; scan
  ld a,h
  or l           ; whole budget
                 ; remaining
  jr nz,KEYWM
  jr KEYWZERO    ; expired without a key

KEYWS:
  ld de,0        ; D: idle slots, E
                 ; armed

KEYWS1:
  push hl        ; receiver keeps budget
  call KWSPOLL
  pop hl
  jp nz,KWACT    ; consume the whole
                 ; action
  ld b,1
  jr nc,KEYWS2   ; no frame: one slot
  ld b,3         ; a received frame

KEYWS2:
  dec hl         ; charge bounded RX
                 ; work
  ld a,h
  or l
  jr z,KEYWZERO  ; no underflow allowed
  djnz KEYWS2    ; frames cost three
                 ; slots
  jr KEYWS1

KEYWTAKE:
  push af        ; retain the fresh key
  xor a
  ld (RXFULL),a
  ld (KBTN),a    ; matrix arrow consumed
  pop af

KEYWRET:
  push af
  call CURHIDE   ; undo cursor ownership
  pop af
  or a           ; NZ means confirmation
  ret

KEYWZERO:
  call CURHIDE
  xor a          ; Z means rollback
  ret

; One bounded serial poll. Unarmed:
; accumulate complete idle windows, so
; a prior partial frame cannot confirm.
; Armed: detect a start with the normal
; tight poll, receive one byte and check
; both stop bits. No padding gap follows
; the armed poll: a late start must be
; sampled within half a bit. Rejected
; frames return to idle qualification.
; A=0/Z for none, key/NZ for a fresh
; non-NUL frame. Carry charges a frame
; as three slots instead of one.
; Keeps HL. Changes AF, BC and DE.

KWSPOLL:

; prime emulated input

  in a,(KEYPORT)
  ld a,e
  or a
  jr nz,KWSARM   ; already idle-
                 ; qualified
  ld c,$FF       ; AND all raw samples
  ld b,97        ; finite idle window

KWSIDLE:
  in a,(STSPORT)
  and c          ; any low breaks idle
  ld c,a
  djnz KWSIDLE   ; sample the whole
                 ; window
  rlc c
  jr nc,KWSLOW   ; partial frame ignored
  inc d          ; consecutive idle
                 ; window
  ld a,d
  cp 4           ; over twelve bit times
  jr c,KWSNONE   ; not a fresh line yet
  ld e,1         ; accept the next start

KWSNONE:
  xor a          ; Z/CF clear: one slot
  ret

KWSLOW:
  ld d,0         ; restart idle proof
  jr KWSNONE

KWSARM:
  ld b,90        ; match idle-slot work

KWSLOOK:
  in a,(STSPORT)
  rlca

; sample low start soon

  jr nc,KWSSTART
  djnz KWSLOOK   ; finite tight window
  xor a          ; no frame this slot
  ret

KWSSTART:
  call RXBITS    ; bounded eight-bit
                 ; read
  push af        ; retain received byte
  in a,(STSPORT)
  ld c,a         ; first stop sample
  ld d,RXDLY     ; one more stop
                 ; interval

KWSSTOP:
  dec d
  jr nz,KWSSTOP  ; fixed stop-bit delay
  in a,(STSPORT)
  and c          ; both stops high
  and $80        ; test only serial
                 ; level
  ld e,a
  pop af
  bit 7,e        ; require both stops
  jr z,KWSBAD    ; NUL never confirms
  and $7F        ; seven-bit console key
  jr z,KWSBAD    ; NUL never confirms

KWSRX:
  or a           ; NZ for a usable key
  scf            ; charge received frame
  ret

KWSBAD:
  ld de,0        ; require fresh idle
                 ; again
  xor a
  scf            ; rejection still costs
  ret

; Consume the rest of a recognised
; serial action before leaving the
; question. CSI/SS3 end at a final byte,
; and CR may consume LF. A different
; An incomplete CSI/SS3 rolls back. A
; byte after CR or bare ESC is kept for
; normal input. Every tail poll spends
; the original budget plus a short
; inter-byte limit. Changes AF/BC/DE/HL.

KWACT:
  cp 27          ; ESC may begin an
                 ; arrow
  jr z,KWESC
  cp 13          ; CR may have trailing
                 ; LF
  jp nz,KEYWTAKE
  push af        ; retain confirming key
  call KWNEXT
  jr z,KWACTEND  ; bare CR is sufficient
  cp 10          ; consume only its LF
  jr z,KWACTEND  ; bare CR is sufficient
  jr KWSTASH     ; keep a different key

KWESC:
  push af
  call KWNEXT    ; short bare-ESC wait
  jr z,KWACTEND
  cp '['         ; recognised CSI prefix
  jr z,KWCSI
  cp 'O'         ; recognised SS3 prefix
  jr nz,KWSTASH

KWCSI:
  call KWNEXT
  jr z,KWABORT   ; incomplete action
                 ; fails
  cp $40         ; parameters precede
                 ; final
  jr c,KWCSI     ; consume parameter
                 ; bytes
  jr KWACTEND    ; a final ends the
                 ; action

KWSTASH:
  ld (RXCHAR),a
  ld a,$FF       ; publish unrelated
                 ; byte
  ld (RXFULL),a

KWACTEND:
  ld a,h
  or l           ; must retain whole
                 ; budget
  jr z,KWABORT   ; exhaustion is not a
                 ; key
  xor a
  ld (KBTN),a    ; no synthetic arrow
                 ; tail
  pop af
  jp KEYWRET     ; keep any stashed byte

KWABORT:
  pop af         ; discard confirmation
  jp KEYWZERO

; Receive a possible action tail, at
; most sixteen poll slots apart. The
; outer HL budget still bounds damaged
; frames and arbitrarily long CSI text.
; NZ returns a byte. Z means no tail.
; Changes AF/BC/DE/HL.

KWNEXT:
  ld c,16        ; short inter-byte
                 ; limit

KWNEXT1:
  push bc        ; retain short limit
  push hl        ; retain whole budget
  call KWSPOLL
  pop hl
  pop bc
  push af        ; retain receiver flags
  ld b,1
  jr nc,KWNEXT2  ; one poll or three
                 ; slots
  ld b,3         ; received frame cost

KWNEXT2:
  dec hl         ; charge every tail
                 ; poll
  ld a,h
  or l
  jr z,KWNEXT0   ; whole budget
                 ; exhausted
  djnz KWNEXT2
  pop af
  ret nz         ; a complete tail byte
  dec c          ; spend inter-byte
                 ; limit
  jr nz,KWNEXT1
  xor a          ; tail wait expired
  ret

KWNEXT0:
  pop af
  xor a          ; expiry returns Z
  ret

KWSEND:

; Cold choice runs once before card
; access. Fn/keypad bypass is latched
; outside CPMINIT's clear, so releasing
; the key during mounting still skips
; STARTUP.CMD. Serial boards keep TTY.
; Other targets share CON's confirmation
; and complete rollback.

STCHOOSE:
  call STBYP     ; physical reset bypass
  jr nz,STCH1
  ld hl,CONOLD
  set 6,(hl)     ; survive early release
  ret

STCH1:
  call LCDCON
  ret nz         ; serial board stays
                 ; TTY
  ld hl,LCDBAN   ; before first card
                 ; access
  call PUTS
  call PUTCRLF
  ld hl,STCMSG   ; offer base consoles
  call PUTS
  call CONSAVE   ; same rollback
                 ; contract
  ld hl,KWPOLL*3/10
  call KEYWT     ; fresh matrix choice
  push af        ; retain choice over LF
  call PUTCRLF
  pop af
  jr z,STCHEND   ; unavailable keeps LCD
  and $DF        ; accept lowercase too
  ld b,CMTTY
  cp 'S'         ; explicit serial
                 ; choice
  jr z,STCHSEL
  cp 'C'
  jr nz,STCHEND  ; L/other keeps base
                 ; LCD
  ld a,(PIVEC+1)
  or a           ; PICO table available
  jr z,STCHEND   ; unavailable keeps LCD
  ld b,CMCRT

STCHSEL:
  call CONFLD    ; change CON bits only
  call CONREP
  call CONASK    ; fresh target keyboard

STCHEND:
  jp CONTEND     ; release hotkey lock

; Z for a reset-bypass key held now.
; Matrix Fn is row 0, bit 2. Changes
; AF and BC. No queued input is read.

STBYP:
  in a,(STSPORT)
  and $40        ; physical keypad held
  ret z          ; latched before card
                 ; I/O
  ld bc,$FEFE    ; matrix modifier row
  in a,(c)
  and $04        ; Fn held is bypass
  ret
