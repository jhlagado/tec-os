; VOLS: lists the card's volumes through the mount service at ABIVOL: for
; each, its index, label, geometry, R/O when read-only, and the drive it is
; on now.
%INCLUDE "../../src/abi.inc"

BDOS    EQU     $0005
VOLSVC  EQU     ABIVOL

        ORG     $0100
; This program speaks ABI 4's table: on anything else it says so and stops.
	LD	HL,ABITAB
	LD	DE,ABITAG
	LD	B,3
CHKTAG:	LD	A,(DE)
	CP	(HL)
	JR	NZ,NOABI	; not TEC-OS's table
	INC	HL
	INC	DE
	DJNZ	CHKTAG
	LD	A,(HL)		; HL = ABIMAJ now
	CP	4
	JR	Z,ABIOK
NOABI:	LD	DE,NOABIM
	LD	C,9
	JP	BDOS
ABITAG:	DB	"TNA"
NOABIM:	DB	"VOLS needs TEC-OS with ABI 4.",13,10,"$"
ABIOK:
        LD      A,(IDX)
NEXT:   LD      E,A
        LD      A,2             ; describe
        LD      HL,DESC
        CALL    VOLSVC
        OR      A
        RET     NZ              ; past the table
        LD      A,(IDX)         ; the index, two digits
        CALL    DEC2
        CALL    SPACE
        LD      HL,DESC+16      ; the label
        LD      B,11
LAB:    LD      E,(HL)
        PUSH    BC
        PUSH    HL
        CALL    PUT
        POP     HL
        POP     BC
        INC     HL
        DJNZ    LAB
        CALL    SPACE
        LD      DE,G8M          ; the geometry
        LD      A,(DESC+12)
        DEC     A
        JR      Z,GEO
        LD      DE,G1M
GEO:    LD      C,9
        CALL    BDOS
        LD      A,(DESC+13)     ; read-only
        RRCA
        LD      DE,RO
        LD      C,9
        CALL    C,BDOS
        LD      A,(DESC+14)     ; on a drive now
        CP      $FF
        JR      Z,EOL
        ADD     A,'A'
        LD      (DRV+1),A
        LD      DE,DRV
        LD      C,9
        CALL    BDOS
EOL:    LD      DE,CRLF
        LD      C,9
        CALL    BDOS
        LD      HL,IDX
        INC     (HL)
        LD      A,(HL)
        JR      NEXT

; A as two decimal digits (0-99), or three for 100-127.
DEC2:   LD      C,100
        CP      C
        JR      C,DEC10
        LD      B,'0'-1
DEC1:   INC     B
        SUB     C
        JR      NC,DEC1
        ADD     A,C
        PUSH    AF
        LD      E,B
        CALL    PUT
        POP     AF
DEC10:  LD      B,'0'-1
DECT:   INC     B
        SUB     10
        JR      NC,DECT
        ADD     A,10+'0'
        PUSH    AF
        LD      E,B
        CALL    PUT
        POP     AF
        LD      E,A
        JR      PUT
SPACE:  LD      E,' '
PUT:    LD      C,2
        JP      BDOS

IDX:    DB      0
G8M:    DB      "G8M$"
G1M:    DB      "G1M$"
RO:     DB      " R/O$"
DRV:    DB      " A:$"
CRLF:   DB      13,10,"$"
DESC:   DS      32
