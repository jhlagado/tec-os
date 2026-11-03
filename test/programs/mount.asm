; MOUNT: mounts a volume on a drive through ABI 5's volume services.
;   MOUNT           lists the card's volumes
;   MOUNT B: NAME   the volume labelled NAME, found through describe
;   MOUNT B: 5      the volume at container index 5, as the list numbers them
;   MOUNT B:        unmounts B: (A: is never left empty)
; Prints the drive and the volume's label (also when it is there already),
; or the reason it would not.
%INCLUDE "../../src/abi.inc"

BDOS    EQU     $0005
TAIL    EQU     $0081

        ORG     $0100
; This program speaks ABI 5's table: on anything else it says so and stops.
	LD	HL,ABITAB	; what is at the table's address
	LD	DE,ABITAG	; against what should be
	LD	B,3
CHKTAG:	LD	A,(DE)		; each byte of the tag
	CP	(HL)
	JR	NZ,NOABI	; not TEC-OS's table
	INC	HL		; on to the next of each
	INC	DE
	DJNZ	CHKTAG
	LD	A,(HL)		; HL = ABIMAJ now
	CP	5		; exactly: entries may move at each major
	JR	Z,ABIOK
NOABI:	LD	DE,NOABIM	; the word, and back to the CCP
	LD	C,9		; BDOS: print to $
	JP	BDOS
ABITAG:	DB	"TNA"
NOABIM:	DB	"MOUNT needs TEC-OS with ABI 5.",13,10,"$"
ABIOK:
        LD      HL,TAIL
        CALL    SKIP
	OR	A		; no argument at all
	JP	Z,LIST		; lists the volumes
        SUB     'A'             ; the drive letter, A-D, then a colon
        CP      4
        JP      NC,USAGE
        LD      (DRIVE),A
        INC     HL
        LD      A,(HL)
        CP      ':'
        JP      NZ,USAGE
        INC     HL
        CALL    SKIP
        OR      A
        JR      NZ,WHICH
        LD      A,(DRIVE)       ; no volume: unmount
	LD	B,A
	LD	C,TNUNMNT
	CALL	ABICALL
        OR      A
        LD      DE,NOUNM
        JP      NZ,SAY
        LD      DE,UNMNT
        JP      SAY

WHICH:  CP      '0'             ; a number is an index
        JR      C,BYNAME
        CP      '9'+1
        JR      NC,BYNAME
        LD      B,0
NUM:    LD      A,(HL)
        SUB     '0'
        JR      C,GOTNUM
        CP      10
        JR      NC,GOTNUM
        LD      C,A
        LD      A,B
        ADD     A,A
        ADD     A,A
        ADD     A,B
        ADD     A,A
        ADD     A,C
        LD      B,A
        INC     HL
        JR      NUM
GOTNUM: LD      A,B
        JR      MOUNTA

BYNAME: LD      DE,NAME         ; the name, padded to 11 with spaces
        LD      B,11
NM1:    LD      A,(HL)
        OR      A
        JR      Z,NMPAD
        CP      ' '
        JR      Z,NMPAD
        LD      (DE),A
        INC     HL
        INC     DE
        DJNZ    NM1
        JR      FIND
NMPAD:  LD      A,' '
NM2:    LD      (DE),A
        INC     DE
        DJNZ    NM2
FIND:   XOR     A               ; each index's label, until one matches
        LD      (IDX),A
FIND1:  LD      A,(IDX)
        LD      E,A
	LD	C,TNDESC
        LD      HL,DESC
	CALL	ABICALL
        OR      A
        LD      DE,NOVOL
        JP      NZ,SAY
        LD      HL,DESC+16
        LD      DE,NAME
        LD      B,11
CMP:    LD      A,(DE)
        CP      (HL)
        JR      NZ,FIND2
        INC     HL
        INC     DE
        DJNZ    CMP
        LD      A,(IDX)
        JR      MOUNTA
FIND2:  LD      HL,IDX
        INC     (HL)
        JR      FIND1

MOUNTA: LD      E,A             ; mount index A on the drive
        LD      (IDX),A
	LD	C,TNDESC	; already there? then say so, not an error
        LD      HL,DESC
	CALL	ABICALL
        OR      A
        LD      DE,NOVOL
        JP      NZ,SAY
        LD      A,(DRIVE)
        LD      HL,DESC+14
        CP      (HL)
        JR      Z,SHOW
        LD      A,(IDX)
        LD      E,A
        LD      A,(DRIVE)
	LD	B,A
	LD	C,TNMOUNT
	CALL	ABICALL
        OR      A
        LD      DE,NOMNT
        JP      NZ,SAY
        LD      A,(IDX)         ; say what is there now
        LD      E,A
	LD	C,TNDESC
        LD      HL,DESC
	CALL	ABICALL
SHOW:   LD      A,(DRIVE)
        ADD     A,'A'
        LD      (MNTD),A
        LD      HL,DESC+16
        LD      DE,MNTL
        LD      BC,11
        LDIR
        LD      DE,MNTD
        JP      SAY

; LIST: each volume on the card, through describe, on a line of its own: its
; index, label, geometry, R/O when read-only, and the drive it is on now.
; Takes IDX at 0, as loaded. Returns to the CCP past the last one.
LIST:	LD	A,(IDX)		; the next index
	LD	E,A
	LD	C,TNDESC	; describe
	LD	HL,DESC
	CALL	ABICALL
	OR	A
	RET	NZ		; past the table: done
	LD	A,(IDX)		; the index, two digits
	CALL	DEC2
	CALL	SPACE
	LD	HL,DESC+16	; the label, 11 bytes
	LD	B,11
LIST1:	LD	E,(HL)
	PUSH	BC		; PUT changes them
	PUSH	HL
	CALL	PUT
	POP	HL
	POP	BC
	INC	HL
	DJNZ	LIST1
	CALL	SPACE
	LD	DE,G8M		; the geometry: 1 is G8M
	LD	A,(DESC+12)
	DEC	A
	JR	Z,LIST2
	LD	DE,G1M		; else G1M
LIST2:	LD	C,9		; print to $
	CALL	BDOS
	LD	A,(DESC+13)	; bit 0: read-only
	RRCA
	LD	DE,RO
	LD	C,9
	CALL	C,BDOS
	LD	A,(DESC+14)	; the drive it is on, FFh for none
	CP	$FF
	JR	Z,LIST3
	ADD	A,'A'
	LD	(ONDRV+1),A
	LD	DE,ONDRV
	LD	C,9
	CALL	BDOS
LIST3:	LD	DE,CRLF		; the line's end
	LD	C,9
	CALL	BDOS
	LD	HL,IDX		; on to the next index
	INC	(HL)
	JR	LIST

; DEC2: A (0 to 127) as two decimal digits, or three from 100. Changes A, BC,
; DE.
DEC2:	LD	C,100
	CP	C
	JR	C,DEC10		; under 100: two digits
	LD	B,'0'-1
DEC1:	INC	B		; the hundreds
	SUB	C
	JR	NC,DEC1
	ADD	A,C
	PUSH	AF
	LD	E,B
	CALL	PUT
	POP	AF
DEC10:	LD	B,'0'-1
DECT:	INC	B		; the tens
	SUB	10
	JR	NC,DECT
	ADD	A,10+'0'	; the units, as a digit
	PUSH	AF
	LD	E,B
	CALL	PUT
	POP	AF
	LD	E,A
	JR	PUT

; SPACE and PUT: a blank, or the character in E, to the console. Changes A, C.
SPACE:	LD	E,' '
PUT:	LD	C,2		; console output
	JP	BDOS

USAGE:  LD      DE,USE
SAY:    LD      C,9
        JP      BDOS

SKIP:   LD      A,(HL)
        CP      ' '
        RET     NZ
        INC     HL
        JR      SKIP

DRIVE:  DB      0
IDX:    DB      0
NAME:   DS      11
DESC:   DS      32
MNTD:   DB      "A: "
MNTL:   DS      11
        DB      13,10,"$"
UNMNT:  DB      "Unmounted",13,10,"$"
NOUNM:  DB      "Cannot unmount",13,10,"$"
NOVOL:  DB      "No such volume",13,10,"$"
NOMNT:  DB      "Cannot mount: in use or too large",13,10,"$"
USE:    DB      "MOUNT [D: [NAME or INDEX]]",13,10,"$"
G8M:	DB	"G8M$"
G1M:	DB	"G1M$"
RO:	DB	" R/O$"
ONDRV:	DB	" A:$"
CRLF:	DB	13,10,"$"
