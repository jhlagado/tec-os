; TEC-OS's table, ABI 4.0: the address of each entry, and the hardware
; services' numbers and status codes, for programs. The table is at C003h. A
; program checks for "TNA" at ABITAB and for major version 4 at ABIMAJ before
; it uses the rest. The TEC-OS build checks every address and number here
; against the ROM.

ABITAB	EQU	$C003		; signature "TNA"
ABIMAJ	EQU	$C006		; major version, 4
ABIMIN	EQU	$C007		; minor version
ABIVID	EQU	$C008		; a word: where columns, then rows, are
ABIHW	EQU	$C00A		; CALL: hardware services, C = service
ABIMAIN	EQU	$C00D		; a word: where the MAIN count is, 1 or 2
ABIVOL	EQU	$C00F		; CALL: mount, unmount and describe volumes
ABIGLCD	EQU	$C012		; CALL: a video driver's table, A = 1 CRT
				; or 3 UC1, HL = eight words, or 0
ABIDRV	EQU	$C015		; CALL: the registry, C = 0 find, 1 list
ABIEND	EQU	$C018		; the end of ABI 4.0's entries

; ABIHW's services, in C, from HWBASE, the first number no ABI 3 program used.
; Any other number returns HWEBAD with the registers as they were.
HWBASE	EQU	19		; the first service
HWINFO	EQU	19		; B = devices, DE = ROM version,
				; L = columns, H = rows
HWDIGIT	EQU	20		; HL -> 6 segment bytes, leftmost first
HWLCD	EQU	21		; B = row 0-3, HL -> 20 characters
HWVIDEO	EQU	22		; B = 1 claim the PICO9918, 0 give it back
HWTONE	EQU	23		; B = half period, DE = half cycles
HWJOY	EQU	24		; B = joystick bits, 1 for each one pressed
HWKEYS	EQU	25		; HL -> 8 bytes: the matrix rows
HWPUTAT	EQU	26		; D = row, E = column, B = count,
				; HL -> characters
HWRTC	EQU	27		; B = 0 read, 1 set the 7 BCD bytes at HL
HWCOUNT	EQU	9		; how many follow HWBASE

; Status in A, with carry set.
HWEBAD	EQU	1		; no such service, or an argument out of range
HWENODV	EQU	2		; the device is not fitted

; HWINFO's bits in B.
HWBMTX	EQU	$01		; a matrix keyboard
HWBPICO	EQU	$02		; a PICO9918 answered at cold boot
HWBGLCD	EQU	$04		; GLCD.DRV is in
HWBRTC	EQU	$08		; a DS1302 clock answers
HWBCLM	EQU	$10		; the PICO9918 is claimed
HWBWRD	EQU	$80		; a word of the ROM's is on LCD row 3

; Version 2 of the "PICO" record's table: PICO.DRV's graphics entries, as
; offsets. Each assumes that the caller holds the claim, and destroys AF, BC,
; DE and HL.
PICOREG	EQU	16		; register B = A
PICOFIL	EQU	18		; DE bytes of A from VRAM address HL
PICOWR	EQU	20		; BC bytes from DE to VRAM address HL
PICORD	EQU	22		; BC bytes from VRAM address HL to DE
