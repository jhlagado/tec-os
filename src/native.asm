; Native bank-aware profile, ABI version 1 (docs/native-abi.md).
;
; A native program is a .TNX file: one 128-byte header record, then its image.
; It runs from fixed RAM with its stack at 0300h-04FFh. The window normally
; shows the classic bank, which holds the OS disk workspace; programs reach
; their own banks only through BANKCOPY and BANKCALL. Services are not
; re-entrant and must not be called from interrupt handlers.

NABIVER EQU     $0101           ; ABI 1.1

; Service numbers (register C at NATSVC).
NSQUERY EQU     0
NSALLOC EQU     1
NSFREE  EQU     2
NSCOPY  EQU     3
NSCALL  EQU     4
NSBANK  EQU     5
NSCOUT  EQU     6
NSCIN   EQU     7
NSCST   EQU     8
NSFILE  EQU     9
NSEXIT  EQU     10
NSCOUNT EQU     11

; Status codes returned in A (0 = success, with Z set).
NEBADSV EQU     1               ; unknown service
NEBANK  EQU     2               ; bank number out of range
NEOWNER EQU     3               ; bank not reserved by this program
NENOBNK EQU     4               ; no free bank
NERANGE EQU     5               ; address range invalid or crosses a boundary
NEDEPTH EQU     6               ; bank calls nested too deeply
NEFUNC  EQU     7               ; BDOS function not offered
NEPTR   EQU     8               ; buffer outside fixed RAM
NEHDR   EQU     9               ; bad .TNX header
NELOAD  EQU     10              ; .TNX image does not fit or cannot be read
NEMODE  EQU     11              ; called from a CP/M program, not a native one

NDEPTH  EQU     8               ; bank-call frames

; Kernel state in fixed RAM (NKSTATE, 256 bytes reserved).
NOWNED  EQU     NKSTATE         ; bit map of reserved banks 1-15, 2 bytes
NFRDEP  EQU     NKSTATE+2       ; bank-call depth
NFRAMES EQU     NKSTATE+3       ; NDEPTH saved banks
NCALSP  EQU     NKSTATE+16      ; caller SP while a service runs
NCOPYD  EQU     NKSTATE+18      ; working copy descriptor, 8 bytes
NHDR    EQU     NKSTATE+32      ; loaded header copy, 16 bytes
NARGA   EQU     NKSTATE+48      ; service arguments: A, B, DE, HL
NARGB   EQU     NKSTATE+49
NARGDE  EQU     NKSTATE+50
NARGHL  EQU     NKSTATE+52
NGUARD  EQU     NAPSTKB         ; 16 guard bytes at the bottom of the app stack
NGUARDN EQU     16

; .TNX header fields (offsets within record 0).
TXMAGIC EQU     0               ; "TNX1"
TXLOAD  EQU     4               ; load address, page aligned, >= NAPBASE
TXEND   EQU     6               ; image end address, exclusive
TXLEN   EQU     TXEND           ; replaced by the length once checked
TXENTRY EQU     8               ; entry address
TXABI   EQU     10              ; ABI version required (word)

; ---- Bank selection ---------------------------------------------------------

; Select logical bank A (0 = classic, 1..NBANKS) in the window. Preserves
; every register except AF and keeps the caller's interrupt state. The
; caller has checked A.
;
; Debug80 decodes latch bits 3-6 as a bank field whose low bit selects a
; legacy page only when the upper three bits are zero, so physical banks
; 0-8 need the field values 0, 1, 2, 4, 6, 8, 10, 12 and 14.
SETBANK:PUSH    BC
        PUSH    HL
        LD      (CURBANK),A
        LD      C,A
        LD      B,0
        LD      HL,BANKLAT
        ADD     HL,BC
        LD      A,(HL)
        POP     HL
SETB0:  LD      B,A
        LD      A,I             ; P/V = IFF2: remember the interrupt state
        PUSH    AF
        DI
        LD      A,(LATCHV)
        AND     LATKEEP
        OR      B
        LD      (LATCHV),A
        OUT     (SYSLAT),A
        POP     AF
        JP      PO,SETB1
        EI
SETB1:  POP     BC
        RET

; ---- Service entry ------------------------------------------------------------

; CALL NATSVC with C = service. Arguments in A, B, DE and HL. Returns A =
; status with Z set on success; results as each service documents. IX, IY and
; the alternate registers are preserved; BC, DE and HL are results or are
; destroyed.
NATSVC: PUSH    AF              ; a CP/M program owns 0100h-0500h, where the
        LD      A,(OSMODE)      ; arguments and the OS stack go: refuse before
        OR      A               ; touching them, with carry set as BANKCALL
        JR      NZ,NATSVN       ; reports its errors
        POP     AF
        LD      A,NEMODE
        OR      A
        SCF
        RET
NATSVN: POP     AF
        LD      (NARGA),A
        LD      A,B
        LD      (NARGB),A
        LD      (NARGDE),DE
        LD      (NARGHL),HL
        LD      A,C
        CP      NSCALL          ; bank calls stay on the caller's stack
        JP      Z,NBCALL
        CP      NSEXIT
        JP      Z,NEXIT
        CP      NSCOUNT
        LD      A,NEBADSV
        JR      NC,NSRET0
        LD      (NCALSP),SP     ; every other service runs on the OS stack
        LD      SP,NOSSTK
        LD      A,C
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,NSTAB
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        EX      DE,HL
        LD      DE,NSRET
        PUSH    DE
        LD      DE,(NARGDE)
        LD      A,(NARGB)
        LD      B,A
        LD      A,(NARGA)
        JP      (HL)
NSRET:  LD      SP,(NCALSP)
NSRET0: OR      A
        RET

NSTAB:  DW      NQUERY,NALLOC,NFREE,NCOPY,0,NGETBK,NCOUT,NCIN,NCST,NFILE

; QUERY: A=0, HL = ABI version, B = bank count, DE = ROM version.
NQUERY: LD      HL,NABIVER
        LD      B,NBANKS
        LD      DE,ROMVER
        XOR     A
        RET

; ALLOC: reserve a free bank. Returns B = bank.
NALLOC: LD      HL,(NOWNED)
        LD      B,1
NAL1:   LD      A,B
        CP      NBANKS+1
        LD      A,NENOBNK
        RET     NC
        CALL    BANKBIT         ; DE = mask for bank B
        LD      A,L
        AND     E
        JR      NZ,NAL2
        LD      A,H
        AND     D
        JR      Z,NAL3
NAL2:   INC     B
        JR      NAL1
NAL3:   LD      A,L
        OR      E
        LD      L,A
        LD      A,H
        OR      D
        LD      H,A
        LD      (NOWNED),HL
        XOR     A
        RET

; FREE: release bank B.
NFREE:  CALL    OWNCHK
        RET     NZ
        CALL    BANKBIT
        LD      HL,(NOWNED)
        LD      A,E
        CPL
        AND     L
        LD      L,A
        LD      A,D
        CPL
        AND     H
        LD      H,A
        LD      (NOWNED),HL
        XOR     A
        RET

; GETBANK: A=0, B = bank in the window (0 = classic).
NGETBK: LD      A,(CURBANK)
        LD      B,A
        XOR     A
        RET

; DE = bit mask for bank B (1-15). Preserves B, HL.
BANKBIT:LD      DE,1
        LD      A,B
BNKB1:  DEC     A
        RET     Z
        SLA     E
        RL      D
        JR      BNKB1

; Z when bank B is 1..NBANKS and reserved; else NZ with a status in A.
OWNCHK: LD      A,B
        OR      A
        JR      Z,OWNBAD
        CP      NBANKS+1
        JR      NC,OWNBAD
        CALL    BANKBIT
        LD      HL,(NOWNED)
        LD      A,L
        AND     E
        JR      NZ,OWNOK
        LD      A,H
        AND     D
        JR      NZ,OWNOK
        LD      A,NEOWNER
        OR      A
        RET
OWNOK:  XOR     A
        RET
OWNBAD: LD      A,NEBANK
        OR      A
        RET

; ---- BANKCOPY -------------------------------------------------------------------

; COPY: DE -> descriptor in fixed RAM: source bank (1), source address (2),
; destination bank (1), destination address (2), length (2). Bank 0 means
; fixed RAM (0100h-7FFFh); banks 1..NBANKS mean the window (8000h-BFFFh) and
; must be reserved. A range may not cross its region's end. Zero length
; succeeds and copies nothing. Overlapping ranges in one bank copy as if
; through an intermediate buffer. The window shows the bank it showed before.
NCOPY:  LD      A,D             ; the descriptor itself must be in fixed RAM
        CP      $80
        LD      A,NEPTR
        RET     NC
        EX      DE,HL
        LD      DE,NCOPYD
        LD      BC,8
        LDIR
        LD      HL,(NCOPYD+6)   ; zero length
        LD      A,H
        OR      L
        RET     Z
        LD      A,(NCOPYD)
        LD      HL,(NCOPYD+1)
        CALL    RANGECK
        RET     NZ
        LD      A,(NCOPYD+3)
        LD      HL,(NCOPYD+4)
        CALL    RANGECK
        RET     NZ
        LD      A,(CURBANK)
        PUSH    AF
        CALL    NCOPYGO
        POP     AF
        CALL    SETBANK
        XOR     A
        RET

; A = bank, HL = start, length in NCOPYD+6. Z when the range is valid.
RANGECK:LD      B,A
        OR      A
        JR      Z,RNGFIX
        PUSH    HL
        CALL    OWNCHK
        POP     HL
        RET     NZ
        LD      A,H             ; window: 8000h <= start, start+len <= C000h
        CP      $80
        JR      C,RNGBAD
        LD      DE,$C000
        JR      RNGEND
RNGFIX: LD      A,H             ; fixed RAM: 0100h <= start, start+len <= 8000h
        OR      A
        JR      Z,RNGBAD
        LD      DE,$8000
RNGEND: LD      BC,(NCOPYD+6)
        ADD     HL,BC
        JR      C,RNGBAD        ; wraps
        EX      DE,HL
        OR      A
        SBC     HL,DE           ; limit - end must not borrow
        JR      C,RNGBAD
        XOR     A
        RET
RNGBAD: LD      A,NERANGE
        OR      A
        RET

; Copy in chunks of up to NXBUFSZ through the bounce buffer. When source and
; destination are the same bank and the destination lies above the source,
; copy from the end backwards so overlap is safe.
NCOPYGO:LD      A,(NCOPYD)
        LD      B,A
        LD      A,(NCOPYD+3)
        CP      B
        JR      NZ,NCFWD
        LD      HL,(NCOPYD+4)   ; same bank: destination above source?
        LD      DE,(NCOPYD+1)
        OR      A
        SBC     HL,DE
        JR      Z,NCDONE        ; same address: nothing to do
        JR      NC,NCBACK
NCFWD:  LD      HL,(NCOPYD+6)
        LD      A,H
        OR      L
        JR      Z,NCDONE
        CALL    CHUNK           ; BC = min(len, buffer)
        LD      A,(NCOPYD)
        LD      HL,(NCOPYD+1)
        LD      DE,NXBUF
        CALL    BCOPYIN
        LD      A,(NCOPYD+3)
        LD      DE,(NCOPYD+4)
        LD      HL,NXBUF
        CALL    BCOPYIN
        LD      HL,(NCOPYD+1)   ; advance both addresses, shrink the length
        ADD     HL,BC
        LD      (NCOPYD+1),HL
        LD      HL,(NCOPYD+4)
        ADD     HL,BC
        LD      (NCOPYD+4),HL
        LD      HL,(NCOPYD+6)
        OR      A
        SBC     HL,BC
        LD      (NCOPYD+6),HL
        JR      NCFWD
NCBACK: LD      HL,(NCOPYD+6)
        LD      A,H
        OR      L
        JR      Z,NCDONE
        CALL    CHUNK
        LD      HL,(NCOPYD+6)   ; take the last BC bytes
        OR      A
        SBC     HL,BC
        LD      (NCOPYD+6),HL
        PUSH    HL
        LD      DE,(NCOPYD+1)
        ADD     HL,DE
        LD      A,(NCOPYD)
        LD      DE,NXBUF
        CALL    BCOPYIN
        POP     HL
        LD      DE,(NCOPYD+4)
        ADD     HL,DE
        EX      DE,HL
        LD      A,(NCOPYD+3)
        LD      HL,NXBUF
        CALL    BCOPYIN
        JR      NCBACK
NCDONE: RET

; BC = min(remaining length, NXBUFSZ).
CHUNK:  LD      HL,(NCOPYD+6)
        LD      BC,NXBUFSZ
        PUSH    HL
        OR      A
        SBC     HL,BC
        POP     HL
        RET     NC
        LD      B,H
        LD      C,L
        RET

; Select bank A, then LDIR BC bytes from HL to DE. Preserves BC.
BCOPYIN:CALL    SETBANK
        PUSH    BC
        LDIR
        POP     BC
        RET

; ---- BANKCALL -------------------------------------------------------------------

; CALL: B = reserved bank, HL = address in 8000h-BFFFh. The target runs with
; that bank in the window, on the caller's stack, with A and DE as passed. It
; returns with RET; its A, DE and HL come back with the window restored to
; the caller's bank and carry clear. Calls nest up to NDEPTH deep. On an
; error the target is not entered, nothing changes, carry is set and A holds
; the status. A target may not change SP permanently.
NBCALL: CALL    OWNCHK          ; uses NARGB through B
        JR      NZ,NBERR
        LD      HL,(NARGHL)
        LD      A,H
        CP      $80
        JR      C,NBRNG
        CP      $C0
        JR      NC,NBRNG
        LD      A,(NFRDEP)
        CP      NDEPTH
        JR      NC,NBDEEP
        LD      E,A             ; push the caller's bank on the frame stack
        INC     A
        LD      (NFRDEP),A
        LD      D,0
        LD      HL,NFRAMES
        ADD     HL,DE
        LD      A,(CURBANK)
        LD      (HL),A
        LD      A,B
        CALL    SETBANK
        LD      HL,NBRET        ; the target returns into ROM
        PUSH    HL
        LD      HL,(NARGHL)
        PUSH    HL
        LD      DE,(NARGDE)
        LD      A,(NARGA)
        RET                     ; enter the target
NBRET:  PUSH    AF              ; pop the frame and restore the caller's bank
        PUSH    HL
        LD      A,(NFRDEP)
        DEC     A
        LD      (NFRDEP),A
        LD      L,A
        LD      H,0
        PUSH    DE
        LD      DE,NFRAMES
        ADD     HL,DE
        POP     DE
        LD      A,(HL)
        CALL    SETBANK
        POP     HL
        POP     AF
        SCF
        CCF
        RET
NBRNG:  LD      A,NERANGE
        JR      NBERR
NBDEEP: LD      A,NEDEPTH
NBERR:  SCF
        RET

; ---- Console and files ------------------------------------------------------------
;
NCOUT:  LD      C,E             ; E = character
        LD      HL,BCONOUT
        JR      NCCLAS
NCIN:   LD      HL,BCONIN       ; returns B = character
        JR      NCCLAS
NCST:   LD      HL,BCONST       ; returns B = 0 or FFh
; Run the console routine at HL with the classic bank in the window, where
; the terminal keeps its line buffer. Returns its A in B.
NCCLAS: LD      A,(CURBANK)
        PUSH    AF
        XOR     A
        CALL    SETBANK
        CALL    JPHL
        LD      B,A
        POP     AF
        PUSH    BC
        CALL    SETBANK
        POP     BC
        XOR     A
        RET
JPHL:   JP      (HL)

; FILE: B = BDOS function, DE = argument, HL = record buffer for the
; functions that transfer a record. Pointers must lie in fixed RAM with room
; for an FCB (36 bytes) or a record (128). The window shows the classic bank
; while the BDOS runs. Returns B = the BDOS's A and HL = its HL.
NFILE:  LD      A,B
        CP      41
        JR      NC,NFBAD
        LD      C,A
        LD      B,0
        LD      HL,NFKIND
        ADD     HL,BC
        LD      A,(HL)          ; 0 refused, 1 no pointer, 2 FCB, 3 FCB and record
        LD      B,C
        OR      A
        JR      Z,NFBAD
        CP      2
        JR      C,NFGO
        PUSH    AF
        PUSH    BC
        EX      DE,HL
        LD      BC,36
        CALL    PTRCK
        EX      DE,HL
        POP     BC
        JR      NZ,NFPTR
        POP     AF
        CP      3
        JR      C,NFGO
        PUSH    AF
        PUSH    BC
        LD      HL,(NARGHL)
        LD      BC,128
        CALL    PTRCK
        POP     BC
        JR      NZ,NFPTR
        POP     AF
NFGO:   LD      C,A             ; C = kind
        LD      A,(CURBANK)
        PUSH    AF
        PUSH    BC
        PUSH    DE
        XOR     A
        CALL    SETBANK
        LD      A,C
        CP      3
        JR      C,NFNOD
        LD      DE,(NARGHL)
        LD      C,26
        CALL    BENTRY
NFNOD:  POP     DE
        POP     BC
        LD      C,B
        CALL    BENTRY
        LD      B,A
        POP     AF
        PUSH    HL
        PUSH    BC
        CALL    SETBANK
        POP     BC
        POP     HL
        XOR     A
        RET
NFPTR:  POP     AF
        LD      A,NEPTR
        OR      A
        RET
NFBAD:  LD      A,NEFUNC
        OR      A
        RET

; Function kinds for FILE, 0-40.
NFKIND: DB      0,0,0,0,0,0,0,0,0,0     ; 0-9 console: use CONOUT, CONIN, CONST
        DB      0,0,0,1,1,2,2,3,3,2     ; 10-19: reset, select, open, close, search, delete
        DB      3,3,2,2,0,1,0,0,0,0     ; 20-29: read, write, make, rename, current disk
        DB      2,0,1,3,3,2,2,0,0,0     ; 30-39: attributes, user, random I/O, size
        DB      3                       ; 40: write random with zero fill

; Z when HL..HL+BC-1 lies in 0100h-7FFFh. Preserves HL.
PTRCK:  PUSH    HL
        LD      A,H
        OR      A
        JR      Z,PTRBAD
        ADD     HL,BC
        JR      C,PTRBAD
        LD      A,H
        CP      $80
        JR      C,PTROK
        JR      NZ,PTRBAD
        LD      A,L
        OR      A
        JR      NZ,PTRBAD
PTROK:  POP     HL
        XOR     A
        RET
PTRBAD: POP     HL
        OR      1
        RET

; ---- Load, run and exit -------------------------------------------------------

; Called by the CCP with the .TNX file's FCB at DE (not yet opened). Returns
; with carry set if the file is missing or invalid; otherwise runs the
; program and never returns.
NATRUN: LD      (NCOPYD),DE     ; keep the FCB pointer
        LD      C,15
        CALL    BENTRY
        INC     A
        SCF
        RET     Z
        LD      DE,NXBUF        ; header record into the bounce buffer
        LD      C,26
        CALL    BENTRY
        LD      DE,(NCOPYD)
        LD      C,20
        CALL    BENTRY
        OR      A
        SCF
        RET     NZ
        LD      HL,NXBUF
        LD      DE,TNXSIG
        LD      B,4
NRSIG:  LD      A,(DE)
        CP      (HL)
        SCF
        RET     NZ
        INC     HL
        INC     DE
        DJNZ    NRSIG
        LD      HL,(NXBUF+TXABI) ; ABI 1.x only
        LD      A,H
        CP      HIGH(NABIVER)
        SCF
        RET     NZ
        LD      HL,(NXBUF+TXLOAD)
        LD      A,L             ; page aligned, at or above NAPBASE
        OR      A
        SCF
        RET     NZ
        LD      DE,NAPBASE
        PUSH    HL
        OR      A
        SBC     HL,DE
        POP     HL
        RET     C
        LD      DE,(NXBUF+TXEND) ; length = end - load, nonzero
        EX      DE,HL
        OR      A
        SBC     HL,DE
        EX      DE,HL
        RET     C
        LD      A,D
        OR      E
        SCF
        RET     Z
        LD      (NXBUF+TXLEN),DE
        LD      B,D             ; load + length rounded to records <= 8000h
        LD      C,E
        PUSH    HL
        ADD     HL,BC
        LD      BC,127
        ADD     HL,BC
        LD      A,L
        AND     $80
        LD      L,A
        LD      DE,NAPEND+1
        OR      A
        SBC     HL,DE
        POP     HL
        CCF
        RET     C               ; would load past 8000h
        LD      DE,NHDR         ; keep the header; the bounce buffer is reused
        PUSH    HL
        LD      HL,NXBUF
        LD      BC,16
        LDIR
        POP     HL
NRLOAD: PUSH    HL              ; read the image a record at a time
        EX      DE,HL
        LD      C,26
        CALL    BENTRY
        LD      DE,(NCOPYD)
        LD      C,20
        CALL    BENTRY
        POP     HL
        OR      A
        JR      NZ,NRDONE
        LD      DE,128
        ADD     HL,DE
        PUSH    HL              ; stop at the end of the declared image
        LD      DE,(NHDR+TXLOAD)
        OR      A
        SBC     HL,DE
        LD      DE,(NHDR+TXLEN)
        OR      A
        SBC     HL,DE
        POP     HL
        JR      C,NRLOAD
NRDONE: LD      DE,DEFDMA
        LD      C,26
        CALL    BENTRY
        ; Native profile: kernel state cleared, guards set, classic bank in the
        ; window as the OS bank, application stack in fixed low RAM.
        DI
        LD      HL,$45ED        ; the native profile owns page zero: reclaim
        LD      (NMIVEC),HL     ; the NMI vector from the CCP's default FCB
        LD      DE,(NHDR+TXENTRY) ; NHDR is inside the page cleared next
        LD      HL,NKSTATE
        LD      B,0
NRCLR:  LD      (HL),0
        INC     HL
        DJNZ    NRCLR
        LD      HL,NGUARD
        LD      B,NGUARDN
NRGRD:  LD      (HL),$A5
        INC     HL
        DJNZ    NRGRD
        LD      A,1
        LD      (OSMODE),A
        XOR     A
        CALL    SETBANK
        LD      SP,NAPSTK
        LD      HL,NEXITR       ; a plain RET from the program exits
        PUSH    HL
        PUSH    DE
        LD      HL,NABIVER
        LD      DE,DEFDMA       ; command tail, as for a COM program
        XOR     A
        RET

; EXIT, or RET from the program: release every bank, restore the classic
; bank and profile, report a damaged stack guard, then warm boot. Runs on the
; boot stack in fixed RAM so a damaged application stack cannot matter.
NEXITR:
NEXIT:  DI
        LD      SP,BOOTSTK
        XOR     A
        CALL    SETBANK
        LD      HL,0
        LD      (NOWNED),HL
        LD      (OSMODE),A
        LD      HL,NGUARD
        LD      B,NGUARDN
NXG:    LD      A,(HL)
        CP      $A5
        JR      NZ,NXBAD
        INC     HL
        DJNZ    NXG
        JP      WBOOTR
NXBAD:  LD      HL,NXGMSG
        CALL    PUTS
        JP      WBOOTR

BANKLAT:DB      $00,$04,$0C,$14,$24,$34,$44,$54,$64,$74
TNXSIG: DB      "TNX1"
NXGMSG: DB      13,10,"Native stack guard damaged",13,10,0
