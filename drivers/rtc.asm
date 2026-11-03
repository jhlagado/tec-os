; RTC.SVC: the DS1302 clock, a service (KD-171). INIT refuses unless a clock
; answered at cold boot (INFO's HWBRTC). It publishes the record "RTC", version
; 1, whose table's word 0 is the clock: B = 0 read, any other set, the seven
; BCD bytes at HL: seconds, minutes, hours, date, month, weekday, year. Returns
; A = 0 with carry clear. It runs on the caller's stack, 8 bytes at most, keeps
; IX and IY, and uses the same bit sequence as MON3: the DS1302 puts each data
; bit out on a falling clock edge. REMOVE has nothing to undo.
%INCLUDE "../src/abi.inc"

RTCPORT EQU     $FC             ; bit 4 enable, 6 clock, 7 data out, 5 data in,
                                ; read on bit 0

        ORG     $0100
HDR:	DB	'D',SVCFMT,0,1	; removable
        DW      0,0,0,0         ; REMOVE, size, extra, relocation: the writer's
        DB      0,0,0           ; over the base: BDOS, BIOS, CCP
        DW      0               ; INIT: the writer's
        DB      "RTC     "

REC:    DW      0               ; the registry's link
	DB	"RTC     ",1	; the name, version 1
	DW	TAB		; the table
TAB:	DW	CLOCK		; word 0: the clock

; INIT: the record, if a clock answered at cold boot; carry otherwise.
INIT:	LD	C,TNINFO	; B = what answered at cold boot
	CALL	ABICALL
	BIT	3,B		; HWBRTC
	SCF
	RET	Z		; no clock: refused
	LD	HL,REC
	OR	A
	RET

; REMOVE: nothing to undo. Carry clear.
REMOVE:	OR	A
	RET

; The clock. B = 0 read the seven bytes into HL, else write them from HL.
; Returns A = 0, carry clear. Destroys BC, DE, HL.
CLOCK:	LD	A,B
	OR	A
	JR	NZ,CLKSET
	LD	D,$BF		; clock burst read
	CALL	RTCCMD
	LD	B,7
CLKRD:	CALL	RTCRD		; D = the next byte
	LD	(HL),D
	INC	HL
	DJNZ	CLKRD
	JR	CLKEND
CLKSET:	LD	DE,$8E00	; write protect off
	CALL	RTCPUT
	LD	D,$BE		; clock burst write: 7 bytes and the control byte
	CALL	RTCCMD
	LD	B,7
CLKWR:	LD	D,(HL)		; each byte, least significant bit first
	CALL	RTCWR
	INC	HL
	DJNZ	CLKWR
	LD	D,0		; the control byte: write protect stays off
	CALL	RTCWR
CLKEND:	XOR	A		; the chip disabled
	OUT	(RTCPORT),A
	RET

; Register D = E. Destroys A, D.
RTCPUT:	CALL	RTCCMD
	LD	D,E
	CALL	RTCWR
	XOR	A		; the chip disabled
	OUT	(RTCPORT),A
	RET

; Enable the chip and send the command byte in D, then on into RTCWR.
RTCCMD:	LD	A,$10		; enable
	OUT	(RTCPORT),A
; Send D, least significant bit first. Keeps BC.
RTCWR:	PUSH	BC
	LD	B,8
RTCW1:	SRL	D		; the next bit into carry
	LD	A,$20
	RRA			; data bit to bit 7, enable to bit 4
	OUT	(RTCPORT),A
	OR	$40		; clock high
	OUT	(RTCPORT),A
	DJNZ	RTCW1
	POP	BC
	RET

; D = the next byte from the clock, least significant bit first. Keeps BC.
RTCRD:	PUSH	BC
	LD	BC,8*256+RTCPORT
	LD	D,0
RTCR1:	LD	A,$70		; clock high, read, enabled
	OUT	(C),A
	AND	$BF		; clock low: the chip puts out its bit
	OUT	(C),A
	IN	A,(C)
	RRA			; bit 0 into carry
	RR	D		; and into D from the top
	DJNZ	RTCR1
	POP	BC
	RET
IMGEND:
