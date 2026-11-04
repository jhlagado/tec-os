; Video terminal: interprets console output for a character display of
; VWID columns by VHGT rows. Serial output is passed through untouched; the
; remote terminal does its own interpretation.
;
; A character in the last column leaves the cursor past the edge; the line
; wraps only when another printable character follows, as on a VT100.
;
; Supported: printable ASCII, CR, LF, BS, HT (8-column stops), FF (clear and
; home), and these ANSI sequences: ESC [ n A/B/C/D (cursor moves), ESC [ r;c H
; and f (position, 1-based), ESC [ J and 2J (clear to end, clear screen),
; ESC [ K (clear to end of line), ESC [ 0 m and 7 m (normal, reverse),
; ESC [ n @ and n P (insert and delete characters at the cursor, shifting the
; rest of the line), ESC [ t ; b r (scroll region), ESC [ n L and n M (insert
; and delete lines at the cursor row within the scroll region; the cursor
; goes to column 1). Other sequences are consumed and ignored. Characters at
; 80h-FFh are the reverse images of 00h-7Fh, which also draws the cursor. The
; cursor is shown only while console input is awaited, so output does not pay
; for redrawing it.
;
; The display driver's table, copied into the vectors by CONSW, supplies VPUT
; (A at row B, column C), VGET, VCLREOL (from row B, column C), and VRDROW and
; VWRROW (row B to and from LINEBUF); video.asm calls through them.

; Output C to the video terminal: a printable character at the cursor, a
; control character's action, or the next byte of an escape sequence. The
; cursor, if drawn, is removed first. Destroys AF, BC, DE, HL.
VTOUT:	CALL	CURHIDE
	LD	A,(ESCST)	; inside a sequence: the parser
	OR	A
	JP	NZ,VTESC	; not 0: the parser takes the byte
	LD	A,C		; the character itself
	CP	$20		; below space: a control character
	JR	C,VTCTL
	CP	$7F		; DEL and 80h-FFh are not shown
	JR	NC,VTDONE
	LD	HL,VATTR	; 80h for reverse: the reverse image
	OR	(HL)
	LD	E,A
	LD	A,(VCOL)	; a pending wrap happens before the character
	LD	HL,VWID
	CP	(HL)		; column VWID: past the edge
	JR	C,VTNOWR
	XOR	A		; column 0 of the next line
	LD	(VCOL),A
	PUSH	DE		; the character, through a scroll
	CALL	VTLF
	POP	DE		; the character back
VTNOWR:	LD	A,E		; drawn as is or reversed
	LD	HL,(VROW)	; L = row, H = column
	LD	B,L
	LD	C,H
	CALL	VPUT		; drawn at row B, column C
	LD	A,(VCOL)	; may reach VWID: the wrap waits
	INC	A		; one column on
VTCOL:	LD	(VCOL),A
VTDONE:	RET

; The control characters VTOUT acts on, A = C = the character: CR, LF, BS,
; HT, FF, and ESC, which starts a sequence; the rest are ignored. Destroys
; AF, BC, DE, HL.
VTCTL:	CP	13		; CR
	JR	Z,VTCR
	CP	10		; LF
	JR	Z,VTLF0
	CP	8		; BS
	JR	Z,VTBS
	CP	9		; HT
	JR	Z,VTTAB
	CP	12		; FF
	JR	Z,VTFF
	CP	27		; ESC
	JR	NZ,VTDONE
	LD	A,1		; the next byte should be '['
	LD	(ESCST),A
	JR	VTDONE
VTCR:	XOR	A		; column 0, the row kept
	LD	(VCOL),A
	JR	VTDONE
VTLF0:	CALL	VTLF		; a scroll if at the region's bottom
	JR	VTDONE
VTBS:	LD	A,(VCOL)
	LD	HL,VWID		; from a pending wrap, back to the last column
	CP	(HL)
	JR	C,VTBS1		; before the edge: as it is
	LD	A,(HL)		; past it: from column VWID
VTBS1:	OR	A		; at column 0 it stays
	JR	Z,VTDONE
	DEC	A		; one column back
	LD	(VCOL),A
	JR	VTDONE
VTTAB:	LD	A,(VCOL)
	OR	7		; up to the next multiple of 8
	INC	A
	LD	HL,VWID
	CP	(HL)		; no stop left: the last column
	JR	C,VTCOL		; a stop before the edge: taken
	LD	A,(HL)		; else the last column
	DEC	A
	JR	VTCOL
VTFF:	CALL	VTCLS		; clear, then home
	XOR	A		; row 0, column 0
	LD	(VROW),A
	LD	(VCOL),A
	JR	VTDONE

; Move down a line. At the bottom of the scroll region the region scrolls up
; a line; below the region the cursor stops at the last row. Destroys AF,
; HL, and when it scrolls BC and DE too.
VTLF:	LD	A,(VROW)
	LD	HL,VSBOT
	CP	(HL)		; the region's last row: scroll
	JR	Z,VTLFS
	INC	A		; else down a row
	LD	HL,VHGT
	CP	(HL)		; the screen's last row: stay
	RET	NC		; no row below: the cursor stays
	LD	(VROW),A	; the row below
	RET
VTLFS:	LD	A,(VSTOP)	; delete the region's top line
	LD	C,A
	LD	B,1		; B = 1: one line
	JP	VTDLR

; The scroll region is the whole screen: rows 0 to VHGT-1. Destroys AF.
VTREGR:	XOR	A
	LD	(VSTOP),A	; the top row, 0
	LD	A,(VHGT)
	DEC	A		; the bottom row, VHGT-1
	LD	(VSBOT),A
	RET

; Clear the whole screen, row by row through VCLREOL; the cursor is not
; moved. Destroys AF, BC and what the driver's VCLREOL does.
VTCLS:	LD	B,0		; from row 0
VTCLL:	LD	C,0		; each row from column 0
	PUSH	BC
	CALL	VCLREOL		; from column C to the row's end
	POP	BC
	INC	B		; the next row
	LD	A,(VHGT)	; until the last row is done
	CP	B
	JR	NZ,VTCLL	; VHGT rows cleared
	RET

; Escape sequences. ESCST: 1 after ESC, 2 in the first parameter, 3 in the
; second. Entered from VTOUT with A = ESCST and C = the byte; ESCP1 and ESCP2
; collect the parameters, ESCP2 FFh while there is no second one. A final
; byte, 40h or above, ends the sequence and is dispatched to its action.
; Destroys AF, BC, DE, HL.
VTESC:	CP	1		; past ESC: a parameter or the end
	JR	NZ,VTPAR
	LD	A,C
	CP	'['		; any other byte after ESC ends it
	LD	A,0
	JR	NZ,VTESCX
	LD	(ESCP1),A	; the first parameter starts at 0
	DEC	A		; no second parameter yet
	LD	(ESCP2),A
	LD	A,2		; state 2: the first parameter next
VTESCX:	LD	(ESCST),A	; state 2, or 0 when dropped
	JP	VTDONE
VTPAR:	LD	A,C
	CP	'0'		; a digit adds to the parameter
	JR	C,VTPNOD
	CP	'9'+1		; above '9': not a digit
	JR	NC,VTPNOD
	SUB	'0'		; parameter = parameter * 10 + digit
	LD	B,A
	LD	HL,ESCP1
	LD	A,(ESCST)	; state 3: the second parameter
	CP	2		; state 2: the first parameter
	JR	Z,VTPD
	INC	HL		; HL = ESCP2
VTPD:	LD	A,(HL)		; times 2, kept in E
	ADD	A,A
	LD	E,A
	ADD	A,A		; times 8, plus times 2: times 10
	ADD	A,A
	ADD	A,E
	ADD	A,B		; modulo 256: a large value wraps
	LD	(HL),A
	JP	VTDONE
VTPNOD:	CP	';'		; the second parameter starts at 0
	JR	NZ,VTPFIN
	XOR	A		; the second parameter now collects
	LD	(ESCP2),A
	LD	A,3		; state 3
	LD	(ESCST),A
	JP	VTDONE
VTPFIN:	CP	'?'		; private marker: ignore
	JP	Z,VTDONE
	CP	$40
	JP	C,VTDONE	; other intermediates: keep collecting
	XOR	A		; a final byte: the sequence ends
	LD	(ESCST),A
	LD	A,C		; each final byte to its action
	CP	'A'
	JP	Z,VTUP		; cursor up
	CP	'B'
	JP	Z,VTDOWN	; cursor down
	CP	'C'
	JP	Z,VTRIGHT	; cursor right
	CP	'D'
	JP	Z,VTLEFT	; cursor left
	CP	'H'		; H and f both position
	JP	Z,VTPOS
	CP	'f'
	JP	Z,VTPOS		; the same as H
	CP	'J'		; erase in display
	JP	Z,VTED
	CP	'K'		; erase in line
	JP	Z,VTEL
	CP	'm'		; attributes
	JP	Z,VTSGR
	CP	'@'		; insert characters
	JP	Z,VTICH
	CP	'P'		; delete characters
	JP	Z,VTDCH
	CP	'L'		; insert lines
	JP	Z,VTIL
	CP	'M'		; delete lines
	JP	Z,VTDL
	CP	'r'		; the scroll region
	JR	Z,VTREG
	JP	VTDONE		; any other: ignored

; ESC [ t ; b r: scroll region rows t to b (1-based; absent or 0 means the
; screen's first or last row). The region must cover two rows or more; the
; cursor goes home, as on a VT100. A region that doesn't fit is ignored.
; Destroys AF, C, HL.
VTREG:	LD	A,(ESCP1)
	OR	A		; 0 is row 1, else 1-based to 0-based
	JR	Z,VTREG1
	DEC	A
VTREG1:	LD	C,A		; top
	LD	A,(ESCP2)
	INC	A		; FFh (absent) and 0 both mean the last row
	JR	Z,VTREGB	; FFh: no second parameter
	DEC	A
	JR	Z,VTREGB	; 0: the default too
	DEC	A		; b-1, the 0-based bottom
	JR	VTREGC
VTREGB:	LD	A,(VHGT)
	DEC	A		; the screen's last row
VTREGC:	LD	HL,VHGT		; A = the 0-based bottom
	CP	(HL)		; the bottom off the screen: ignored
	JP	NC,VTDONE
	CP	C		; bottom at or above top: ignored
	JP	C,VTDONE
	JP	Z,VTDONE
	LD	(VSBOT),A	; a region of two rows or more
	LD	A,C
	LD	(VSTOP),A	; the top
	XOR	A		; cursor home
	LD	(VROW),A
	LD	(VCOL),A	; column 0
	JP	VTDONE

; Count from ESCP1, at least 1, in B. Destroys AF.
VTN:	LD	A,(ESCP1)
	OR	A		; absent or 0 counts as 1
	JR	NZ,VTN1		; a count given: taken
	INC	A
VTN1:	LD	B,A		; B = the count
	RET

; The escape actions below run from VTPFIN with the sequence ended and the
; parameters in ESCP1 and ESCP2, and return through VTDONE. Each destroys AF,
; BC, DE, HL. Cursor moves stop at the screen's edges, not the region's.

; ESC [ n A: up n rows, stopping at row 0.
VTUP:	CALL	VTN
	LD	A,(VROW)	; row less the count
	SUB	B
	JR	NC,VTSETR	; no borrow: still on the screen
	XOR	A		; row 0
VTSETR:	LD	(VROW),A	; the new row
	JP	VTDONE
; ESC [ n B: down n rows, stopping at the last row.
VTDOWN:	CALL	VTN
	LD	A,(VROW)	; row plus the count
	ADD	A,B
	JR	NC,VTDN1
	LD	A,$FF		; saturate before clipping to the dimension
VTDN1:	LD	HL,VHGT
	CALL	VTCLIP		; to VHGT-1
	JR	VTSETR
; ESC [ n C: right n columns, stopping at the last column.
VTRIGHT:
	CALL	VTN
	LD	A,(VCOL)	; column plus the count
	ADD	A,B
	JR	NC,VTRT1	; past 255: saturate as above
	LD	A,$FF
VTRT1:	LD	HL,VWID
	CALL	VTCLIP		; to VWID-1
VTSETC:	LD	(VCOL),A	; the new column
	JP	VTDONE
; ESC [ n D: left n columns, stopping at column 0.
VTLEFT:	CALL	VTN
	LD	A,(VCOL)	; column less the count
	SUB	B
	JR	NC,VTSETC	; no borrow: still on the screen
	XOR	A
	JR	VTSETC
; ESC [ r ; c H and f: row r, column c, each clipped to the screen.
VTPOS:	LD	A,(ESCP1)	; 1-based, 0 means 1
	OR	A
	JR	Z,VTPR		; absent or 0: row 0
	DEC	A		; r-1, the 0-based row
VTPR:	LD	HL,VHGT
	CALL	VTCLIP		; to VHGT-1
	LD	(VROW),A
	LD	A,(ESCP2)	; the column the same way
	INC	A		; FFh (absent) and 0 both mean column 1
	JR	Z,VTPC		; FFh: no second parameter
	DEC	A
	JR	Z,VTPC		; 0: column 0 too
	DEC	A		; c-1, the 0-based column
VTPC:	LD	HL,VWID
	CALL	VTCLIP		; to VWID-1
	JR	VTSETC
; ESC [ 2 J clears the screen; ESC [ J, and any other parameter, clears
; from the cursor to the end of the screen. The cursor stays.
VTED:	LD	A,(ESCP1)
	CP	2		; 2: the whole screen
	JR	Z,VTED2
	LD	HL,(VROW)	; clear to the end of the screen
	LD	B,L
	LD	C,H
VTEDL:	PUSH	BC		; the rest of the cursor row, then
	CALL	VCLREOL		; each row below it whole
	POP	BC
	LD	C,0		; later rows from column 0
	INC	B
	LD	A,(VHGT)	; until the last row is done
	CP	B
	JR	NZ,VTEDL
	JP	VTDONE
VTED2:	CALL	VTCLS		; the cursor kept
	JP	VTDONE
; ESC [ K, whatever its parameter: clear from the cursor to the line's end.
VTEL:	LD	HL,(VROW)
	LD	B,L		; B = row, C = column
	LD	C,H		; C = column
	CALL	VCLREOL		; from the cursor to the edge
	JP	VTDONE
; ESC [ m: each of the two parameters, 0 normal and 7 reverse, in turn.
VTSGR:	LD	A,(ESCP1)
	CALL	VTSGR1		; the first parameter
	LD	A,(ESCP2)
	CALL	VTSGR1		; then the second
	JP	VTDONE
; Act on one attribute parameter in A: FFh (absent) and values other than
; 0 and 7 change nothing. Destroys AF, B.
VTSGR1:	CP	$FF		; absent
	RET	Z
	CP	7		; 7: reverse, VATTR 80h
	LD	B,$80
	JR	Z,VTSGRS
	OR	A		; 0: normal, VATTR 0
	RET	NZ
	LD	B,A		; B = 0, normal
VTSGRS:	LD	A,B
	LD	(VATTR),A	; 80h reverses each character drawn
	RET

; ---- Insert and delete -------------------------------------------------------
; The cursor row is edited in LINEBUF and written back as one row.

; B = count clipped to the cells from the cursor to the end of the line, C =
; those cells. Z when the cursor is past the edge, else NZ. Destroys AF, HL.
VTNC:	LD	A,(VWID)
	LD	HL,VCOL
	SUB	(HL)		; cells from the cursor to the edge
	JR	Z,VTNCZ		; none: the cursor at the edge
	JR	C,VTNCZ		; or past it, waiting to wrap
	LD	C,A		; C = the cells from the cursor
	CALL	VTN
	LD	A,B		; no more than the cells there are
	CP	C
	JR	C,VTNC1
	LD	B,C		; clipped to C
VTNC1:	OR	1		; NZ for the caller
	RET
VTNCZ:	XOR	A		; Z: nothing to edit
	RET

; HL = LINEBUF + A. Preserves BC, DE.
LBADR:	PUSH	DE
	LD	E,A		; DE = the offset A
	LD	D,0
	LD	HL,LINEBUF	; into LINEBUF
	ADD	HL,DE
	POP	DE
	RET

; Read the cursor row into LINEBUF. Destroys AF, B and what the driver's
; VRDROW does.
VTRDC:	LD	A,(VROW)
	LD	B,A		; B = the cursor row
	JP	VRDROW		; the driver reads it to LINEBUF

; ESC [ n @: insert n blanks at the cursor; the cells from it move right and
; those pushed past the edge are lost. Destroys AF, BC, DE, HL.
VTICH:	CALL	VTNC
	JP	Z,VTDONE	; past the edge: nothing to do
	PUSH	BC
	CALL	VTRDC		; the cursor row into LINEBUF
	POP	BC
	PUSH	BC		; B and C again for the blanks
	LD	A,C		; cells that move right
	SUB	B		; C less the count
	JR	Z,VTICF		; none: only blanks to write
	PUSH	AF		; the count to move, kept
	LD	A,(VWID)
	DEC	A
	CALL	LBADR		; HL = LINEBUF's last cell
	EX	DE,HL		; DE = last cell
	LD	A,(VWID)
	DEC	A
	SUB	B		; less the count
	CALL	LBADR		; HL = the cell that lands there
	POP	AF
	LD	C,A		; BC = the cells to move, from the
	LD	B,0		; right end so none is overwritten
	LDDR
VTICF:	POP	BC
	LD	A,(VCOL)	; the B cells opened at the cursor
VTBLNK:	CALL	LBADR		; B blanks from LINEBUF + A
VTBLL:	LD	(HL),' '	; a blank in each cell
	INC	HL
	DJNZ	VTBLL
	LD	A,(VROW)	; the row back on the screen
	LD	B,A
	CALL	VWRROW		; LINEBUF back to row B
	JP	VTDONE

; ESC [ n P: delete n cells at the cursor; the cells after them move left
; and blanks fill in at the right. Destroys AF, BC, DE, HL.
VTDCH:	CALL	VTNC
	JP	Z,VTDONE	; past the edge: nothing to do
	PUSH	BC
	CALL	VTRDC		; the cursor row into LINEBUF
	POP	BC
	PUSH	BC		; B and C again for the blanks
	LD	A,C		; cells that move left
	SUB	B		; C less the count
	JR	Z,VTDCF		; none: only blanks to write
	PUSH	AF		; the count to move, kept
	LD	A,(VCOL)
	CALL	LBADR		; HL = the cursor cell
	EX	DE,HL		; DE = the cursor cell
	LD	A,(VCOL)
	ADD	A,B
	CALL	LBADR		; HL = the first cell kept
	POP	AF
	LD	C,A		; BC = the cells to move, left
	LD	B,0		; to right
	LDIR
VTDCF:	POP	BC
	LD	A,(VWID)	; the last B cells blanked
	SUB	B
	JR	VTBLNK

; ESC [ n L and ESC [ n M work from the cursor row to the bottom of the
; scroll region, and do nothing when the cursor is outside it. B = the count
; clipped to those rows, C = the cursor row; Z when outside. Inside, the
; cursor goes to column 0. Destroys AF, E, HL.
VTNR:	LD	A,(VROW)
	LD	HL,VSTOP
	CP	(HL)		; above the region
	JR	C,VTNRNO
	LD	C,A		; C = the cursor row
	LD	A,(VSBOT)	; the region's bottom
	SUB	C		; below the region
	JR	C,VTNRNO
	INC	A		; E = the rows from the cursor down
	LD	E,A
	CALL	VTN
	LD	A,B		; no more than those rows
	CP	E
	JR	C,VTNR1
	LD	B,E		; clipped to E
VTNR1:	XOR	A
	LD	(VCOL),A	; column 0
	INC	A		; NZ
	RET
VTNRNO:	XOR	A		; Z: outside the region
	RET

; ESC [ n L and ESC [ n M: insert or delete n lines at the cursor row.
; Destroys AF, BC, DE, HL.
VTIL:	CALL	VTNR
	CALL	NZ,VTILR	; inside: lines inserted
	JP	VTDONE
VTDL:	CALL	VTNR
	CALL	NZ,VTDLR	; inside: lines deleted
	JP	VTDONE

; Insert B blank lines at row C: rows C to VSBOT move down, the last B lost.
; B is 1 or more and C+B at most VSBOT+1. Destroys AF, BC, DE, HL.
VTILR:	PUSH	BC
	CALL	VTMBEG		; the driver told rows C to VSBOT move
	POP	BC
	LD	A,(VSBOT)	; D = destination row, from the bottom up
	LD	D,A
VTILL:	LD	A,C
	ADD	A,B		; C+B is at most VSBOT+1
	LD	E,A		; E = C+B, the first row moved into
	LD	A,D
	CP	E
	JR	C,VTCLRN	; the B rows from C are blanked
	PUSH	BC
	PUSH	DE
	SUB	B		; row D-B is copied to row D
	LD	B,A
	CALL	VRDROW		; row D-B into LINEBUF
	POP	DE
	PUSH	DE		; D back for the write
	LD	B,D
	CALL	VWRROW		; LINEBUF to row D
	POP	DE		; the loop's rows and count back
	POP	BC
	DEC	D		; the next row up
	JR	VTILL

; Delete B lines at row C: rows below move up to VSBOT, blanks fill in.
; B is 1 or more and C+B at most VSBOT+1. Destroys AF, BC, DE, HL.
VTDLR:	PUSH	BC
	CALL	VTMBEG		; the driver told rows C to VSBOT move
	POP	BC
	LD	D,C		; D = destination row, from C down
VTDLL:	LD	A,(VSBOT)
	INC	A		; VSBOT+1 less the count
	SUB	B
	LD	E,A		; E = VSBOT+1-B, the first row blanked
	LD	A,D
	CP	E
	JR	NC,VTDLC	; D at E: only blanks remain
	PUSH	BC		; the loop's rows and count kept
	PUSH	DE
	ADD	A,B		; row D+B is copied to row D
	LD	B,A
	CALL	VRDROW		; row D+B into LINEBUF
	POP	DE
	PUSH	DE		; D back for the write
	LD	B,D
	CALL	VWRROW		; LINEBUF to row D
	POP	DE		; the loop's rows and count back
	POP	BC
	INC	D		; the next row down
	JR	VTDLL
VTDLC:	LD	C,D		; the B rows from E are blanked

; Clear B rows from row C, then end the move. B must be 1 or more.
; Destroys AF, BC, DE, HL.
VTCLRN:	PUSH	BC
	LD	B,C		; the whole of row C
	LD	C,0		; from column 0
	CALL	VCLREOL
	POP	BC
	INC	C		; the next row
	DJNZ	VTCLRN		; B rows in all
	JP	VTMEND		; the driver told the move is done

; Limit A to one less than (HL). Destroys F.
VTCLIP:	CP	(HL)
	RET	C		; below the limit: kept
	LD	A,(HL)		; else the limit less one
	DEC	A
	RET

; NZ while a program has claimed the PICO9918 and it is the console screen:
; the terminal then leaves it alone. Returns A = 1 then, else A = 0 and Z.
VTOWN:	LD	A,(VCLAIM)
	OR	A		; not claimed: Z
	RET	Z
	LD	A,(CONMOD)
	XOR	CMCRT		; claimed, but the console is elsewhere
	JR	Z,VTOWN1
	XOR	A		; A = 0, Z: the terminal draws
	RET
VTOWN1:	INC	A		; A = 1, NZ
	RET

; Draw or remove the cursor: the cell at the cursor shows its reverse image.
; VCURV records whether it is drawn, so each acts only once; neither touches
; a claimed display. Preserves BC; destroys AF, HL and what VGET and VPUT do.
CURSHOW:
	CALL	VTOWN
	RET	NZ
	LD	A,(VCURV)	; already drawn
	OR	A		; zero: not drawn yet
	RET	NZ
	INC	A		; VCURV 1: drawn
	LD	(VCURV),A
	JR	CURFLIP
CURHIDE:
	CALL	VTOWN
	RET	NZ
	LD	A,(VCURV)	; not drawn
	OR	A		; zero: nothing to remove
	RET	Z
	XOR	A		; VCURV 0: removed
	LD	(VCURV),A
CURFLIP:
	LD	A,(VCOL)	; no cursor cell while a wrap is pending
	LD	HL,VWID
	CP	(HL)		; VCOL is VWID: past the edge
	RET	NC
	PUSH	BC		; the caller's BC kept
	LD	HL,(VROW)	; L = row, H = column
	LD	B,L		; the cursor cell, row B, column C
	LD	C,H
	PUSH	BC
	CALL	VGET		; A = the character there
	POP	BC		; its row and column again
	XOR	$80		; its reverse image
	CALL	VPUT
	POP	BC
	RET
