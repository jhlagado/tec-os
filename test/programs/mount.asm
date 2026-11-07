; MOUNT: mounts a volume on a drive through ABI 5's volume services.
;   MOUNT           lists the card's volumes
;   MOUNT B: NAME   the volume labelled NAME, found through describe
;   MOUNT B: 5      the volume at container index 5, as the list numbers them
;   MOUNT B:        unmounts B: (A: is never left empty)
; Prints the drive and label, even when already mounted, or a generic failure.
%INCLUDE "../../src/abi.inc"

BDOS    EQU     $0005
TAIL    EQU     $0081

        ORG     $0100
; This program speaks ABI 5's table: on anything else it says so and stops.
	LD	HL,ABITAB	
	LD	DE,ABITAG	
	LD	B,3
CHKTAG:	LD	A,(DE)		
	CP	(HL)
	JR	NZ,NOABI	
	INC	HL		
	INC	DE
	DJNZ	CHKTAG
	LD	A,(HL)		
	CP	5		; exactly: entries may move at each major
	JR	Z,ABIOK
NOABI:	LD	DE,NOABIM	
	LD	C,9		
	JP	BDOS
ABITAG:	DB	"TNA"
NOABIM:	DB	"MOUNT needs TEC-OS with ABI 5.",13,10,"$"
ABIOK:
        LD      HL,TAIL
        CALL    SKIP
	OR	A		
	JP	Z,LIST		
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
        LD      A,(DRIVE)       
	LD	B,A
	LD	C,TNUNMNT
	CALL	ABICALL
        OR      A
        LD      DE,NOUNM
        JP      NZ,SAY
        LD      DE,UNMNT
        JP      SAY

; A leading digit selects a decimal index. The byte accumulator wraps;
; stop at the first nondigit without checking the rest of the tail.
WHICH:  CP      '0'             
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

; Match the first 11 name bytes exactly, stopping at space/NUL and padding
; with spaces. This routine neither folds case nor rejects a longer name.
BYNAME: LD      DE,NAME         
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
FIND:   XOR     A               
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

MOUNTA: LD      E,A             
        LD      (IDX),A
	LD	C,TNDESC	; already on this drive: report success
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
; Redescription supplies the displayed label; its status is not checked.
        LD      A,(IDX)         
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

; List descriptors from IDX 0: index, label, geometry, R/O and current drive.
; Indices from 100 use three digits; mount FFh means no drive. Any nonzero
; describe result ends the list, without a separate error diagnosis.
LIST:	LD	A,(IDX)		
	LD	E,A
	LD	C,TNDESC	
	LD	HL,DESC
	CALL	ABICALL
	OR	A
	RET	NZ		
	LD	A,(IDX)		
	CALL	DEC2
	CALL	SPACE
	LD	HL,DESC+16	
	LD	B,11
LIST1:	LD	E,(HL)
	PUSH	BC		; protect count and descriptor pointer
	PUSH	HL
	CALL	PUT
	POP	HL
	POP	BC
	INC	HL
	DJNZ	LIST1
	CALL	SPACE
	LD	DE,G8M		
	LD	A,(DESC+12)
	DEC	A
	JR	Z,LIST2
	LD	DE,G1M		
LIST2:	LD	C,9		
	CALL	BDOS
	LD	A,(DESC+13)	
	RRCA
	LD	DE,RO
	LD	C,9
	CALL	C,BDOS
	LD	A,(DESC+14)	
	CP	$FF
	JR	Z,LIST3
	ADD	A,'A'
	LD	(ONDRV+1),A
	LD	DE,ONDRV
	LD	C,9
	CALL	BDOS
LIST3:	LD	DE,CRLF		
	LD	C,9
	CALL	BDOS
	LD	HL,IDX		
	INC	(HL)
	JR	LIST

; DEC2: print A (0-127), two decimal digits or three from 100.
; Uses BDOS output, with no general register or flag preservation.
DEC2:	LD	C,100
	CP	C
	JR	C,DEC10		
	LD	B,'0'-1
DEC1:	INC	B		
	SUB	C
	JR	NC,DEC1
	ADD	A,C
	PUSH	AF
	LD	E,B
	CALL	PUT
	POP	AF
DEC10:	LD	B,'0'-1
DECT:	INC	B		
	SUB	10
	JR	NC,DECT
	ADD	A,10+'0'	
	PUSH	AF
	LD	E,B
	CALL	PUT
	POP	AF
	LD	E,A
	JR	PUT

; SPACE/PUT send a blank or E through BDOS 2, which may change any register.
SPACE:	LD	E,' '
PUT:	LD	C,2		
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
