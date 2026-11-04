; The BDOS's drives and files: reset, selection, and the file functions that
; work on whole entries: open, close, search, delete, make, rename and the
; attributes. Included after bdos.asm, in this order, by rom.asm.

; Function 13, reset disk system. Reset to drive A, restore the standard DMA
; address, and discover all disk geometry and work areas through the public
; BIOS DPH/DPB boundary. The user number stays as it is, as in CP/M 2.2.
; Takes WRFLAG, which the CCP sets for its reset at entry, and clears it.
; Returns 0 in A through RETZERO; changes every register.
FNRESET:
	LD	HL,WRFLAG	; the CCP's reset at its entry: WRESET
	LD	A,(HL)		; the flag read and cleared, so it holds
	LD	(HL),0		; for this one reset only
	OR	A
	JR	NZ,WRESET
	LD	H,A		; a full reset: no drive logged in,
	LD	L,A		; none to rebuild to its mark
	LD	(LOGINV),HL
	LD	(WARMV),HL
RSTAIL:	XOR	A		; both resets: drive A current and
	LD	(CURDRV),A	; no drive read-only
	LD	H,A
	LD	L,A
	LD	(ROVEC),HL
	LD	HL,$0080	; the standard DMA buffer, in the BDOS
	LD	(CURDMA),HL	; and in the BIOS
	LD	B,H
	LD	C,L
	CALL	BIODMA
	CALL	LOGIN		; drive A bound, scanned if not logged
	JR	SETDEF		; and made the default

; TEC-OS: the CCP's reset keeps each logged drive whose allocation vector
; nothing has changed since its last scan and that still sums as it did
; then. A drive the BDOS or a BIOS directory write has changed (its DPH's
; dirty flag) is rebuilt, at its next selection, from the entries up to its
; mark (WARMV); any other is scanned in full. ROVEC is cleared, as CP/M 2.2's
; warm boot clears it. Entered from FNRESET with WRFLAG, nonzero, still in A;
; starts from drive A and ends in the tail both resets share, RSTAIL.
; Changes every register, CURDRV, LOGINV and WARMV.
WRESET:	XOR	A		; each drive in turn, A to P
WRLOOP:	LD	(CURDRV),A
	CALL	LOGTEST		; Z: not logged in, nothing to keep
	JR	Z,WRNEXT
	CALL	LOGIN		; logged: its pointers bound, nothing read
	LD	HL,(DPHPTR)	; DPH+4: the dirty flag
	LD	BC,4
	ADD	HL,BC
	LD	A,(HL)
	OR	A
	JR	NZ,WRDIRTY	; changed by a write: rebuild to the mark
	CALL	ALVSUM		; DE: the vector's sum now, against the
	LD	HL,(DPHPTR)	; sum at DPH+2, taken at its last scan
	INC	HL
	INC	HL
	LD	A,(HL)
	CP	E
	JR	NZ,WRFULL	; the low bytes differ: changed
	INC	HL
	LD	A,(HL)
	CP	D
	JR	Z,WRNEXT	; the same: the drive stays logged in
WRFULL:	LD	HL,LOGINV	; logged out, for a full scan at its
	CALL	VCLR		; next selection
	JR	WRNEXT
WRDIRTY:
	LD	HL,LOGINV	; logged out, and marked in WARMV for
	CALL	VCLR		; a rebuild from the entries up to its
	LD	HL,WARMV	; mark at its next selection
	CALL	VSET
WRNEXT:	LD	A,(CURDRV)	; on to the next of the 16 drives
	INC	A
	CP	16
	JR	NZ,WRLOOP
	JR	RSTAIL		; then the tail both resets share

; Function 14, select disk: the drive in E, 0 for A to 15 for P, becomes the
; current drive and the default. Returns 0 in A through RETZERO; changes
; every register. A drive that cannot be selected takes the fatal path.
FNSEL:
	LD	A,(PARAM)	; E at entry: the drive
	CALL	SELDRV		; bound, or the fatal selection path

; Publish a logical default only after BIOS selection succeeds. Retained
; pointers let functions 27/31 query that default without replacing an active
; explicit-drive search's directory buffer or cursor. Takes CURDRV, DPBPTR
; and ALVPTR as LOGIN left them. Returns 0 in A through RETZERO.
SETDEF:
	LD	A,(CURDRV)	; the selected drive is the default
	LD	(DEFDRV),A
	LD	HL,(DPBPTR)	; with its DPB and allocation vector,
	LD	(DEFDPB),HL	; for functions 31 and 27
	LD	HL,(ALVPTR)
	LD	(DEFALV),HL
	JP	RETZERO		; the function's end

; A = the drive, 0 to 15. Binds its tables through LOGIN unless it is the
; current drive and still logged in. A drive past P or without a volume takes
; SELFAIL and never returns here. Returns with CURDRV the drive and its tables
; bound. Destroys AF, BC, DE, HL, IX.
SELDRV:
	CP	16		; drives A to P only
	JP	NC,SELFAIL
	LD	B,A
	LD	A,(CURDRV)	; NZ: another drive, so its tables
	CP	B		; are bound by LOGIN
	LD	A,B
	LD	(CURDRV),A	; the loads keep the flags
	JP	NZ,LOGIN
	CALL	LOGTEST		; the same drive, still logged in: its
	RET	NZ		; tables are bound already
	JP	LOGIN		; reset since: logged in again

; PARAM names the caller FCB; its drive byte is never rewritten. C still
; identifies the dispatched function. Zero means logical default; 1..16 means
; A..P. Only Search First admits '?' as a raw-directory request. Binds the
; drive as SELDRV does and changes what it changes; a '?' in another function,
; or a drive past P, takes the fatal selection path.
FCBSEL:
	LD	HL,(PARAM)	; the FCB's drive byte
	LD	A,(HL)
	CP	'?'
	JR	NZ,FCBORD
	LD	A,C		; '?' only in function 17, search first,
	CP	17		; where it means the default drive's
	JP	NZ,SELFAIL	; whole directory
	XOR	A
FCBORD:
	OR	A		; 0: the logical default drive
	JR	NZ,FCBEXPL
	LD	A,(DEFDRV)
	JR	SELDRV
FCBEXPL:
	DEC	A		; 1 to 16 become drives 0 to 15;
	JR	SELDRV		; SELDRV refuses any past P

; Open uses the same public-directory iterator as search, then imports only
; the directory-owned FCB fields. Bit 7 of S2 marks the FCB unmodified, which
; lets close avoid a disk write until a later mutation function changes it.
; Function 15. Returns the entry's place 0 to 3 in A, or FFh when no entry
; holds the extent, through RETA.
FNOPEN:
	LD	A,1		; search mode 1: open
	JR	SETSRCH

; Function 16, close file: the FCB's extent written back to its directory
; entry. Returns 0 to 3 in A, or FFh when no entry holds the extent.
FNCLSE:
	CALL	CLOSEFCB
	JP	RETA		; CLOSEFCB's result to the caller

; Close the FCB at PARAM on the current drive: its extent's record count and
; allocation map written to the directory entry, unless S2's bit 7 says the
; FCB is unmodified since open or make. Returns in A the entry's place 0 to
; 3, 0 when nothing needed writing, or FFh when no entry holds the extent.
; Changes every register.
CLOSEFCB:
	LD	DE,14		; S2's bit 7 set: unmodified, nothing
	CALL	FCBOFF		; to write
	BIT	7,(HL)
	JR	Z,CLOSEDIR
	XOR	A		; success, with no entry read
	RET

; An FCB on an earlier extent than its entry's writes back only the
; allocation map: the entry's extent and record count describe its last
; extent. On a read-only drive it writes nothing and returns success, as CP/M
; 2.2's close does (A8, restating KE-148). Takes and returns as CLOSEFCB.
CLOSEDIR:
	CALL	RONZ		; NZ: the drive is read-only
	LD	A,0
	RET	NZ		; nothing written, and success
	CALL	FINDEXCT	; the entry holding this extent
	CP	$FF
	RET	Z		; none: FFh
	LD	HL,(PARAM)	; HL: the FCB's EX
	LD	BC,12
	ADD	HL,BC
	LD	DE,(MATCHPTR)	; DE: the entry's, at the same offset
	EX	DE,HL
	ADD	HL,BC
	EX	DE,HL
	LD	A,(DE)		; the extents compared without S2:
	AND	$1F		; carry if the FCB's is the earlier
	LD	C,A
	LD	A,(HL)
	AND	$1F
	CP	C
	LD	BC,20		; EX to the map's end, 20 bytes, unless
	JR	NC,CLOSECP	; the FCB's extent is before the entry's
	LD	C,4		; skip EX, S1, S2 and RC
	ADD	HL,BC
	EX	DE,HL
	ADD	HL,BC
	EX	DE,HL
	LD	C,16		; the 16-byte allocation map alone
CLOSECP:
	LDIR			; the FCB's fields into the entry
	CALL	WRITEDIR	; and its record to the disk
	LD	A,(RETCODE)	; the entry's place, 0 to 3
	RET

; Search the current drive for the directory entry that holds the FCB's
; extent, as close needs it: the FCB at PARAM the pattern, search mode 4,
; the entries up to the drive's mark. Returns the entry's place 0 to 3 in A
; with MATCHPTR at it, or FFh. Changes every register and the search state.
FINDEXCT:
	LD	HL,(PARAM)	; the caller's FCB is the pattern
	LD	(SRCHFCB),HL
	LD	A,4		; mode 4: user, name, extent and S2
	LD	(OPENMOD),A	; match, and nothing is copied
	CALL	NEWSRCH		; from the directory's first entry
	JP	FINDENT

; Function 17, search for first: the FCB at PARAM matched against the
; current drive's directory. A '?' drive byte asks for every entry, mode 5;
; any other search clears the FCB's S2 and matches the user, name and
; extent, mode 0. Returns 0 to 3 in A with the record at the DMA, or FFh.
FNSRCHF:
	LD	HL,(PARAM)
	LD	A,(HL)
	CP	'?'		; '?': every entry, in mode 5
	LD	A,5
	JR	Z,SETSRCH
	LD	DE,14		; any other: S2 cleared, so only module
	ADD	HL,DE		; 0 matches
	LD	(HL),0
	XOR	A		; mode 0: a search

; Start a search of the current drive in mode A, the FCB at PARAM its
; pattern, and return the first match through RETA: its place 0 to 3 in A,
; or FFh. Mode 0 copies the entry's record to the DMA, mode 1 (open) the
; entry's fields to the FCB, and mode 5 matches every entry.
SETSRCH:
	LD	HL,(PARAM)	; the pattern, kept for search next
	LD	(SRCHFCB),HL
	LD	(OPENMOD),A	; and the mode with it
	CALL	NEWSRCH		; from the directory's first entry
	CALL	FINDENT
	JP	RETA		; 0 to 3, or FFh

; Function 18, search for next: the search function 17 started goes on from
; the entry after its last match, in its mode. DE is not an FCB argument
; here. Returns 0 to 3 in A, or FFh, through RETA.
FNSRCHN:
	CALL	FINDENT		; on from SRCHIDX, the saved place
	JP	RETA

; File R/O, as CP/M 2.2's check_rofile and check_rodir: a write's FCB, or the
; directory entry at HL of a rename or an erase, with t1's bit 7 set goes no
; further. ROFCB checks the drive first. Returns when writable, changing AF,
; B, DE and HL; otherwise ends the function through BDERR, error 2 or 3.
ROFCB:	CALL	CHKRO		; error 2 on a read-only drive
	LD	HL,(PARAM)
ROTEST:	LD	DE,9		; t1, the type's first byte: its bit 7
	ADD	HL,DE		; is the read-only attribute
	BIT	7,(HL)
	RET	Z		; clear: the file may be written
	LD	HL,ERRFILE
	LD	B,3		; read-only file
	JP	BDERR

; Function 19, delete file: every entry of the current user's files that the
; FCB at PARAM names, wildcards allowed, freed in the allocation vector and
; marked E5h. A read-only drive, or a read-only file met on the way, ends the
; function in error. Returns 0 in A, or FFh when no entry matched.
FNDELETE:
	CALL	CHKRO		; error 2 on a read-only drive
	LD	HL,(PARAM)	; the FCB the pattern, mode 2: user
	LD	(SRCHFCB),HL	; and name, any extent, the entries
	LD	A,2		; up to the drive's mark
	LD	(OPENMOD),A
	CALL	NEWSRCH
	XOR	A		; WRTYPE 0: nothing deleted yet
	LD	(WRTYPE),A
				; Each matching entry in turn.
DELLOOP:
	CALL	FINDENT
	CP	$FF
	JR	Z,DELDONE	; no more entries
	LD	HL,(MATCHPTR)	; error 3 at a read-only file's entry;
	CALL	ROTEST		; entries before it stay deleted
	CALL	FREEENT		; its blocks freed in the vector
	LD	HL,(MATCHPTR)
	LD	(HL),$E5	; the entry marked empty
	CALL	WRDIRNOW	; the BIOS still on its record
	LD	A,1		; WRTYPE 1: an entry deleted
	LD	(WRTYPE),A
	JR	DELLOOP

; The end of delete, rename and set attributes: WRTYPE non-zero when an
; entry was changed. Returns 0 in A, or FFh when none was, through RETA.
DELDONE:
	LD	A,(WRTYPE)
	OR	A		; Z: no entry matched
	LD	A,$FF
	JP	Z,RETA		; FFh: no such file
	XOR	A
	JP	RETA		; 0: at least one entry changed

; Create an empty extent in the first unused directory slot. The caller FCB
; is initialized independently of the directory-buffer representation.
; Function 22. Returns 0 to 3 in A, or FFh when the directory is full.
FNMAKE:
	CALL	CHKRO		; error 2 on a read-only drive
	XOR	A		; WRTYPE 0: a file's first extent,
	LD	(WRTYPE),A	; EX and S2 zero
	CALL	MAKEFCB
	JP	RETA		; 0 to 3, or FFh: the directory full

; Make a directory entry for the FCB at PARAM in the current drive's first
; empty slot. WRTYPE 0 makes a file's first extent, EX and S2 zero; any other
; keeps the FCB's EX and S2, the extent a write moves to. The FCB's fields
; from EX to the allocation map are cleared, S2's bit 7 set, and the entry
; written from them, the user its first byte. Returns the slot's place 0 to 3
; in A, or FFh with the FCB untouched when the directory is full. Changes
; every register, TARGEX and TARGS2.
MAKEFCB:
	CALL	FCBEX		; HL: the FCB's EX
	LD	A,(WRTYPE)
	OR	A
	JR	Z,MAKESRCH	; a first extent: nothing to keep
	LD	A,(HL)		; a write's extent: EX and S2's module
	LD	(TARGEX),A	; bits kept for the entry
	INC	HL
	INC	HL
	LD	A,(HL)
	AND	$3F		; S2 without its unmodified flag
	LD	(TARGS2),A
				; The first empty slot in the directory.
MAKESRCH:
	LD	HL,(PARAM)	; mode 3: an empty slot, searched for
	LD	(SRCHFCB),HL	; in the whole directory, not only
	LD	A,3		; to the mark
	LD	(OPENMOD),A
	CALL	NEWSRCH		; from the directory's first entry
	CALL	FINDENT
	CP	$FF
	RET	Z		; the directory full: FFh

				; Clear EX through the allocation map;
				; CR and r0-r2 are left alone.
	CALL	FCBEX
	LD	B,20		; EX, S1, S2, RC and the 16-byte map
	XOR	A
MAKEZERO:
	LD	(HL),A
	INC	HL
	DJNZ	MAKEZERO

	LD	A,(WRTYPE)	; a write's extent: its EX and S2 put
	OR	A		; back in the cleared FCB
	JR	Z,MAKECOPY	; a first extent keeps them zero
	CALL	FCBEX
	LD	A,(TARGEX)
	LD	(HL),A
	INC	HL
	INC	HL		; past S1 to S2
	LD	A,(TARGS2)
	LD	(HL),A
				; The entry: the current user, then the
				; FCB's bytes 1 to 31.
MAKECOPY:
	LD	HL,(MATCHPTR)	; the empty slot's user byte
	LD	A,(USERNO)
	LD	(HL),A
	INC	HL
	EX	DE,HL		; then name to map, from the FCB
	LD	HL,(PARAM)
	INC	HL
	LD	BC,31
	LDIR

	LD	DE,14		; S2's bit 7 set: the FCB unmodified
	CALL	FCBOFF		; since its entry was made
	LD	A,(HL)
	OR	$80
	LD	(HL),A
	LD	HL,(SRCHIDX)	; one past the slot: it raises the
	LD	DE,(DIRUSED)	; drive's mark when it passes it
	OR	A
	SBC	HL,DE
	JR	C,MAKEUSED	; below the mark: the mark stands
	LD	HL,(SRCHIDX)
	LD	(DIRUSED),HL
	CALL	DUSAVE		; and the DPH keeps the new mark
				; The record with the new entry to disk.
MAKEUSED:
	CALL	WRITEDIR
	LD	A,(RETCODE)	; the slot's place, 0 to 3
	RET

; Function 21, write sequential: the FCB's next record written from the DMA,
; with no zero fill of a new block. A read-only drive or file ends the
; function in error. Returns WRITESEQ's code in A through RETA: 0 when the
; record is written.
FNWRITE:
	CALL	ROFCB		; error 2 or 3: a read-only drive or file
	XOR	A		; ZEROFIL 0: a new block is not
	LD	(ZEROFIL),A	; cleared first
	CALL	WRITESEQ
	JP	RETA

; Function 30, set file attributes: the FCB's name, with its attribute bits,
; written into every entry of the file. Returns 0 in A, or FFh when no entry
; matches, through RETA.
FNATTR:
	CALL	CHKRO		; error 2 on a read-only drive
	LD	HL,(PARAM)	; the source: the FCB's own name and
	INC	HL		; type, at byte 1
	JR	MUTALL

; Function 23, rename file: the new name, at byte 17 of the FCB, written into
; every entry of the file its first half names; a read-only file is refused.
; Returns 0 in A, or FFh when no entry matches, through RETA.
FNRENAME:
	CALL	CHKRO		; error 2 on a read-only drive
	LD	DE,17		; the source: the second half's name,
	CALL	FCBOFF		; past its drive byte

; Rename and set-attributes apply to every extent belonging to the file. Keep
; the replacement field outside the directory buffer because FINDENT replaces
; that buffer whenever the scan crosses a physical directory record. Takes HL,
; the 11-byte name and type to write. Returns through DELDONE; changes every
; register.
MUTALL:
	LD	(COPYPTR),HL	; the source, outside the buffer
	LD	HL,(PARAM)	; mode 2: every extent of the user's
	LD	(SRCHFCB),HL	; files the FCB names, to the mark
	LD	A,2
	LD	(OPENMOD),A
	XOR	A		; WRTYPE 0: no entry changed yet
	LD	(WRTYPE),A
	CALL	NEWSRCH
				; Each matching entry in turn.
MUTLOOP:
	CALL	FINDENT
	CP	$FF
	JP	Z,DELDONE	; no more entries: the result
	LD	A,(COPYPTR)	; a rename's name is 17 bytes in, function
	LD	HL,PARAM	; 30's 1: a rename of a read-only file is
	SUB	(HL)		; refused, as CP/M 2.2 refuses it, and its
	AND	$10		; attributes can still be changed
	JR	Z,MUTCOPY
	LD	HL,(MATCHPTR)	; a rename: error 3 at a read-only
	CALL	ROTEST		; file's entry
MUTCOPY:
	LD	HL,(COPYPTR)	; the name and type, 11 bytes, over the
	LD	DE,(MATCHPTR)	; entry's, past its user byte
	INC	DE
	LD	BC,11
	LDIR
	CALL	WRITEDIR	; its record to the disk at once
	LD	A,1		; WRTYPE 1: an entry changed
	LD	(WRTYPE),A
	JR	MUTLOOP
