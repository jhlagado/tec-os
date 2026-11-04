; The BDOS's drives and files: reset,
; selection, and the file functions that
; work on whole entries: open, close,
; search, delete, make, rename and the
; attributes. Included after bdos.asm,
; in this order, by rom.asm.

; Function 13, reset disk system. Reset
; to drive A, restore the standard DMA
; address, and discover all disk
; geometry and work areas through the
; public
; BIOS DPH/DPB boundary. The user number
; stays as it is, as in CP/M 2.2.
; Takes WRFLAG, which the CCP sets for
; its reset at entry, and clears it.
; Returns 0 in A through RETZERO;
; changes every register.
FNRESET:
  ld hl,WRFLAG   ; the CCP's reset at
                 ; its entry: WRESET
  ld a,(hl)      ; the flag read and
                 ; cleared, so it holds
  ld (hl),0      ; for this one reset
                 ; only
  or a
  jr nz,WRESET
  ld h,a         ; a full reset: no
                 ; drive logged in,
  ld l,a         ; none to rebuild to
                 ; its mark
  ld (LOGINV),hl
  ld (WARMV),hl

RSTAIL:
  xor a          ; both resets: drive A
                 ; current and
  ld (CURDRV),a  ; no drive read-only
  ld h,a
  ld l,a
  ld (ROVEC),hl
  ld hl,$0080    ; the standard DMA
                 ; buffer, in the BDOS
; and in the BIOS
  ld (CURDMA),hl
  ld b,h
  ld c,l
  call BIODMA
  call LOGIN     ; drive A bound,
                 ; scanned if not logged
  jr SETDEF      ; and made the default

; TEC-OS: the CCP's reset keeps each
; logged drive whose allocation vector
; nothing has changed since its last
; scan and that still sums as it did
; then. A drive the BDOS or a BIOS
; directory write has changed (its DPH's
; dirty flag) is rebuilt, at its next
; selection, from the entries up to its
; mark (WARMV); any other is scanned in
; full. ROVEC is cleared, as CP/M 2.2's
; warm boot clears it. Entered from
; FNRESET with WRFLAG, nonzero, still in
; A;
; starts from drive A and ends in the
; tail both resets share, RSTAIL.
; Changes every register, CURDRV, LOGINV
; and WARMV.
WRESET:
  xor a          ; each drive in turn, A
                 ; to P

WRLOOP:
  ld (CURDRV),a
  call LOGTEST   ; Z: not logged in,
                 ; nothing to keep
  jr z,WRNEXT
  call LOGIN     ; logged: its pointers
                 ; bound, nothing read
; DPH+4: the dirty flag
  ld hl,(DPHPTR)
  ld bc,4        ; DPH state offset
  add hl,bc
  ld a,(hl)
  or a
  jr nz,WRDIRTY  ; changed by a write:
                 ; rebuild to the mark
  call ALVSUM    ; DE: the vector's sum
                 ; now, against the
; sum at DPH+2, taken at its last scan
  ld hl,(DPHPTR)
  inc hl
  inc hl
  ld a,(hl)
  cp e           ; compare sum low byte
  jr nz,WRFULL   ; the low bytes differ:
                 ; changed
  inc hl
  ld a,(hl)
  cp d
  jr z,WRNEXT    ; the same: the drive
                 ; stays logged in

WRFULL:
  ld hl,LOGINV   ; logged out, for a
                 ; full scan at its
  call VCLR      ; next selection
  jr WRNEXT

WRDIRTY:
  ld hl,LOGINV   ; logged out, and
                 ; marked in WARMV for
  call VCLR      ; a rebuild from the
                 ; entries up to its
  ld hl,WARMV    ; mark at its next
                 ; selection
  call VSET

WRNEXT:
  ld a,(CURDRV)  ; on to the next of the
                 ; 16 drives
  inc a
  cp 16
  jr nz,WRLOOP
  jr RSTAIL      ; then the tail both
                 ; resets share

; Function 14, select disk: the drive in
; E, 0 for A to 15 for P, becomes the
; current drive and the default. Returns
; 0 in A through RETZERO; changes
; every register. A drive that cannot be
; selected takes the fatal path.
FNSEL:
  ld a,(PARAM)   ; E at entry: the drive
  call SELDRV    ; bound, or the fatal
                 ; selection path

; Publish a logical default only after
; BIOS selection succeeds. Retained
; pointers let functions 27/31 query
; that default without replacing an
; active
; explicit-drive search's directory
; buffer or cursor. Takes CURDRV, DPBPTR
; and ALVPTR as LOGIN left them. Returns
; 0 in A through RETZERO.
SETDEF:
  ld a,(CURDRV)  ; the selected drive is
                 ; the default
  ld (DEFDRV),a
; with its DPB and allocation vector,
  ld hl,(DPBPTR)
; for functions 31 and 27
  ld (DEFDPB),hl
  ld hl,(ALVPTR)
  ld (DEFALV),hl
  jp RETZERO     ; the function's end

; A = the drive, 0 to 15. Binds its
; tables through LOGIN unless it is the
; current drive and still logged in. A
; drive past P or without a volume takes
; SELFAIL and never returns here.
; Returns with CURDRV the drive and its
; tables
; bound. Destroys AF, BC, DE, HL, IX.
SELDRV:
  cp 16          ; drives A to P only
  jp nc,SELFAIL
  ld b,a
  ld a,(CURDRV)  ; NZ: another drive, so
                 ; its tables
  cp b           ; are bound by LOGIN
  ld a,b
  ld (CURDRV),a  ; the loads keep the
                 ; flags
  jp nz,LOGIN
  call LOGTEST   ; the same drive, still
                 ; logged in: its
  ret nz         ; tables are bound
                 ; already
  jp LOGIN       ; reset since: logged
                 ; in again

; PARAM names the caller FCB; its drive
; byte is never rewritten. C still
; identifies the dispatched function.
; Zero means logical default; 1..16
; means
; A..P. Only Search First admits '?' as
; a raw-directory request. Binds the
; drive as SELDRV does and changes what
; it changes; a '?' in another function,
; or a drive past P, takes the fatal
; selection path.
FCBSEL:
  ld hl,(PARAM)  ; the FCB's drive byte
  ld a,(hl)
  cp '?'
  jr nz,FCBORD
  ld a,c         ; '?' only in function
                 ; 17, search first,
  cp 17          ; where it means the
                 ; default drive's
  jp nz,SELFAIL  ; whole directory
  xor a

FCBORD:
  or a           ; 0: the logical
                 ; default drive
  jr nz,FCBEXPL
  ld a,(DEFDRV)
  jr SELDRV

FCBEXPL:
  dec a          ; 1 to 16 become drives
                 ; 0 to 15;
  jr SELDRV      ; SELDRV refuses any
                 ; past P

; Open uses the same public-directory
; iterator as search, then imports only
; the directory-owned FCB fields. Bit 7
; of S2 marks the FCB unmodified, which
; lets close avoid a disk write until a
; later mutation function changes it.
; Function 15. Returns the entry's place
; 0 to 3 in A, or FFh when no entry
; holds the extent, through RETA.
FNOPEN:
  ld a,1         ; search mode 1: open
  jr SETSRCH

; Function 16, close file: the FCB's
; extent written back to its directory
; entry. Returns 0 to 3 in A, or FFh
; when no entry holds the extent.
FNCLSE:
  call CLOSEFCB
  jp RETA        ; CLOSEFCB's result to
                 ; the caller

; Close the FCB at PARAM on the current
; drive: its extent's record count and
; allocation map written to the
; directory entry, unless S2's bit 7
; says the
; FCB is unmodified since open or make.
; Returns in A the entry's place 0 to
; 3, 0 when nothing needed writing, or
; FFh when no entry holds the extent.
; Changes every register.
CLOSEFCB:
  ld de,14       ; S2's bit 7 set:
                 ; unmodified, nothing
  call FCBOFF    ; to write
  bit 7,(hl)
  jr z,CLOSEDIR
  xor a          ; success, with no
                 ; entry read
  ret

; An FCB on an earlier extent than its
; entry's writes back only the
; allocation map: the entry's extent and
; record count describe its last
; extent. On a read-only drive it writes
; nothing and returns success, as CP/M
; 2.2's close does (A8, restating
; KE-148). Takes and returns as
; CLOSEFCB.
CLOSEDIR:
  call RONZ      ; NZ: the drive is
                 ; read-only
  ld a,0
  ret nz         ; nothing written, and
                 ; success
  call FINDEXCT  ; the entry holding
                 ; this extent
  cp $FF
  ret z          ; none: FFh
  ld hl,(PARAM)  ; HL: the FCB's EX
  ld bc,12
  add hl,bc
; DE: the entry's, at the same offset
  ld de,(MATCHPTR)
  ex de,hl
  add hl,bc
  ex de,hl
  ld a,(de)      ; the extents compared
                 ; without S2:
  and $1F        ; carry if the FCB's is
                 ; the earlier
  ld c,a
  ld a,(hl)
  and $1F
  cp c
  ld bc,20       ; EX to the map's end,
                 ; 20 bytes, unless
  jr nc,CLOSECP  ; the FCB's extent is
                 ; before the entry's
  ld c,4         ; skip EX, S1, S2 and
                 ; RC
  add hl,bc
  ex de,hl
  add hl,bc
  ex de,hl
  ld c,16        ; the 16-byte
                 ; allocation map alone

CLOSECP:
  ldir           ; the FCB's fields into
                 ; the entry
  call WRITEDIR  ; and its record to the
                 ; disk
; the entry's place, 0 to 3
  ld a,(RETCODE)
  ret

; Search the current drive for the
; directory entry that holds the FCB's
; extent, as close needs it: the FCB at
; PARAM the pattern, search mode 4,
; the entries up to the drive's mark.
; Returns the entry's place 0 to 3 in A
; with MATCHPTR at it, or FFh. Changes
; every register and the search state.
FINDEXCT:
  ld hl,(PARAM)  ; the caller's FCB is
                 ; the pattern
  ld (SRCHFCB),hl
  ld a,4         ; mode 4: user, name,
                 ; extent and S2
; match, and nothing is copied
  ld (OPENMOD),a
  call NEWSRCH   ; from the directory's
                 ; first entry
  jp FINDENT

; Function 17, search for first: the FCB
; at PARAM matched against the
; current drive's directory. A '?' drive
; byte asks for every entry, mode 5;
; any other search clears the FCB's S2
; and matches the user, name and
; extent, mode 0. Returns 0 to 3 in A
; with the record at the DMA, or FFh.
FNSRCHF:
  ld hl,(PARAM)
  ld a,(hl)
  cp '?'         ; '?': every entry, in
                 ; mode 5
  ld a,5
  jr z,SETSRCH
  ld de,14       ; any other: S2
                 ; cleared, so only
                 ; module
  add hl,de      ; 0 matches
  ld (hl),0
  xor a          ; mode 0: a search

; Start a search of the current drive in
; mode A, the FCB at PARAM its
; pattern, and return the first match
; through RETA: its place 0 to 3 in A,
; or FFh. Mode 0 copies the entry's
; record to the DMA, mode 1 (open) the
; entry's fields to the FCB, and mode 5
; matches every entry.
SETSRCH:
  ld hl,(PARAM)  ; the pattern, kept for
                 ; search next
  ld (SRCHFCB),hl
; and the mode with it
  ld (OPENMOD),a
  call NEWSRCH   ; from the directory's
                 ; first entry
  call FINDENT
  jp RETA        ; 0 to 3, or FFh

; Function 18, search for next: the
; search function 17 started goes on
; from
; the entry after its last match, in its
; mode. DE is not an FCB argument
; here. Returns 0 to 3 in A, or FFh,
; through RETA.
FNSRCHN:
  call FINDENT   ; on from SRCHIDX, the
                 ; saved place
  jp RETA

; File R/O, as CP/M 2.2's check_rofile
; and check_rodir: a write's FCB, or the
; directory entry at HL of a rename or
; an erase, with t1's bit 7 set goes no
; further. ROFCB checks the drive first.
; Returns when writable, changing AF,
; B, DE and HL; otherwise ends the
; function through BDERR, error 2 or 3.
ROFCB:
  call CHKRO     ; error 2 on a
                 ; read-only drive
  ld hl,(PARAM)

ROTEST:
  ld de,9        ; t1, the type's first
                 ; byte: its bit 7
  add hl,de      ; is the read-only
                 ; attribute
  bit 7,(hl)
  ret z          ; clear: the file may
                 ; be written
  ld hl,ERRFILE
  ld b,3         ; read-only file
  jp BDERR

; Function 19, delete file: every entry
; of the current user's files that the
; FCB at PARAM names, wildcards allowed,
; marked E5h on the disk and then
; freed in the allocation vector. A
; read-only drive, a read-only file met
; on
; the way or a failed directory write
; ends the function in error, the
; entries before it deleted and freed.
; Returns 0 in A, or FFh when no entry
; matched.
FNDELETE:
  call CHKRO     ; error 2 on a
                 ; read-only drive
  ld hl,(PARAM)  ; the FCB the pattern,
                 ; mode 2: user
; and name, any extent, the entries
  ld (SRCHFCB),hl
  ld a,2         ; up to the drive's
                 ; mark
  ld (OPENMOD),a
  call NEWSRCH
  xor a          ; WRTYPE 0: nothing
                 ; deleted yet
  ld (WRTYPE),a
; Each matching entry in turn.
DELLOOP:
  call FINDENT
  cp $FF
  jr z,DELDONE   ; no more entries
; error 3 at a read-only file's entry;
  ld hl,(MATCHPTR)
  call ROTEST    ; entries before it
                 ; stay deleted
  ld hl,(MATCHPTR)
  ld (hl),$E5    ; the entry marked
                 ; empty
  call WRDIRNOW  ; the BIOS still on its
                 ; record
  call FREEENT   ; written: only now its
                 ; blocks freed, so
; a failed write function 45 returns
; leaves the vector as the card has it
  ld a,1         ; WRTYPE 1: an entry
                 ; deleted
  ld (WRTYPE),a
  jr DELLOOP

; The end of delete, rename and set
; attributes: WRTYPE non-zero when an
; entry was changed. Returns 0 in A, or
; FFh when none was, through RETA.
DELDONE:
  ld a,(WRTYPE)
  or a           ; Z: no entry matched
  ld a,$FF
  jp z,RETA      ; FFh: no such file
  xor a
  jp RETA        ; 0: at least one entry
                 ; changed

; Create an empty extent in the first
; unused directory slot. The caller FCB
; is initialized independently of the
; directory-buffer representation.
; Function 22. As CP/M 2.2's make, which
; clears the module (clrmodnum)
; first: S2 is cleared, full directory
; or not, and EX kept, so the entry
; made is extent EX of module 0. Returns
; 0 to 3 in A, or FFh when the
; directory is full.
FNMAKE:
  call CHKRO     ; error 2 on a
                 ; read-only drive
  call FCBEX     ; S2, two bytes past
                 ; EX, cleared
  inc hl
  inc hl
  ld (hl),0
  call MAKEFCB
  jp RETA        ; 0 to 3, or FFh: the
                 ; directory full

; Make a directory entry for the FCB at
; PARAM in the current drive's first
; empty slot, for the extent its EX and
; S2 name: function 22's, its S2
; cleared by FNMAKE, or the extent a
; write moves to (ADVEXT, RANDMISS), its
; module kept. As CP/M 2.2's make, S1,
; RC and the allocation map are cleared
; and EX kept; S2 keeps its module, its
; flag bits cleared. The entry is
; written from the FCB, the user its
; first byte, and then the FCB's S2 bit
; 7
; set. Returns the slot's place 0 to 3
; in A, or FFh with the FCB untouched
; when the directory is full. Changes
; every register.
MAKEFCB:
  ld hl,(PARAM)  ; mode 3: an empty
                 ; slot, searched for
; in the whole directory, not only
  ld (SRCHFCB),hl
  ld a,3         ; to the mark
  ld (OPENMOD),a
  call NEWSRCH   ; from the directory's
                 ; first entry
  call FINDENT
  cp $FF
  ret z          ; the directory full:
                 ; FFh

  call FCBEX     ; EX kept; S1 cleared
  inc hl
  ld (hl),0
  inc hl         ; S2: its module kept,
                 ; its flags clear
  ld a,(hl)
  and $3F
  ld (hl),a
  inc hl         ; RC and the 16-byte
                 ; map cleared;
  ld b,17        ; CR and r0-r2 are left
                 ; alone
  xor a

MAKEZERO:
  ld (hl),a
  inc hl
  djnz MAKEZERO
; The entry: the current user, then the
; FCB's bytes 1 to 31.
MAKECOPY:
; the empty slot's user byte
  ld hl,(MATCHPTR)
  ld a,(USERNO)
  ld (hl),a
  inc hl
  ex de,hl       ; then name to map,
                 ; from the FCB
  ld hl,(PARAM)
  inc hl
  ld bc,31
  ldir

  ld de,14       ; S2's bit 7 set: the
                 ; FCB unmodified
  call FCBOFF    ; since its entry was
                 ; made
  ld a,(hl)
  or $80
  ld (hl),a
; one past the slot: it raises the
  ld hl,(SRCHIDX)
; drive's mark when it passes it
  ld de,(DIRUSED)
  or a
  sbc hl,de
  jr c,MAKEUSED  ; below the mark: the
                 ; mark stands
  ld hl,(SRCHIDX)
  ld (DIRUSED),hl
  call DUSAVE    ; and the DPH keeps the
                 ; new mark
; The record with the new entry to disk.
MAKEUSED:
  call WRITEDIR
; the slot's place, 0 to 3
  ld a,(RETCODE)
  ret

; Function 21, write sequential: the
; FCB's next record written from the
; DMA,
; with no zero fill of a new block. A
; read-only drive or file ends the
; function in error. Returns WRITESEQ's
; code in A through RETA: 0 when the
; record is written.
FNWRITE:
  call ROFCB     ; error 2 or 3: a
                 ; read-only drive or
                 ; file
  xor a          ; ZEROFIL 0: a new
                 ; block is not
; cleared first
  ld (ZEROFIL),a
  call WRITESEQ
  jp RETA

; Function 30, set file attributes: the
; FCB's name, with its attribute bits,
; written into every entry of the file.
; Returns 0 in A, or FFh when no entry
; matches, through RETA.
FNATTR:
  call CHKRO     ; error 2 on a
                 ; read-only drive
  ld hl,(PARAM)  ; the source: the FCB's
                 ; own name and
  inc hl         ; type, at byte 1
  jr MUTALL

; Function 23, rename file: the new
; name, at byte 17 of the FCB, written
; into
; every entry of the file its first half
; names; a read-only file is refused.
; Returns 0 in A, or FFh when no entry
; matches, through RETA.
FNRENAME:
  call CHKRO     ; error 2 on a
                 ; read-only drive
  ld de,17       ; the source: the
                 ; second half's name,
  call FCBOFF    ; past its drive byte

; Rename and set-attributes apply to
; every extent belonging to the file.
; Keep
; the replacement field outside the
; directory buffer because FINDENT
; replaces
; that buffer whenever the scan crosses
; a physical directory record. Takes HL,
; the 11-byte name and type to write.
; Returns through DELDONE; changes every
; register.
MUTALL:
; the source, outside the buffer
  ld (COPYPTR),hl
  ld hl,(PARAM)  ; mode 2: every extent
                 ; of the user's
; files the FCB names, to the mark
  ld (SRCHFCB),hl
  ld a,2
  ld (OPENMOD),a
  xor a          ; WRTYPE 0: no entry
                 ; changed yet
  ld (WRTYPE),a
  call NEWSRCH
; Each matching entry in turn.
MUTLOOP:
  call FINDENT
  cp $FF
  jp z,DELDONE   ; no more entries: the
                 ; result
; a rename's name is 17 bytes in,
; function
  ld a,(COPYPTR)
  ld hl,PARAM    ; 30's 1: a rename of a
                 ; read-only file is
  sub (hl)       ; refused, as CP/M 2.2
                 ; refuses it, and its
  and $10        ; attributes can still
                 ; be changed
  jr z,MUTCOPY
; a rename: error 3 at a read-only
  ld hl,(MATCHPTR)
  call ROTEST    ; file's entry

MUTCOPY:
; the name and type, 11 bytes, over the
  ld hl,(COPYPTR)
; entry's, past its user byte
  ld de,(MATCHPTR)
  inc de
  ld bc,11
  ldir
  call WRITEDIR  ; its record to the
                 ; disk at once
  ld a,1         ; WRTYPE 1: an entry
                 ; changed
  ld (WRTYPE),a
  jr MUTLOOP
