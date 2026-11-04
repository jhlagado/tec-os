; TEC-OS's table, ABI 5.0, for programs: its 8 bytes at C003h, and the
; numbered services behind its one jump. A program checks for "TNA" at ABITAB
; and for major version 5 at ABIMAJ before it calls ABICALL. The ROM assembles
; from this file, and the build checks the table's bytes it makes.
;
; The table: "TNA", the major, the minor, then JP to the services. A new major
; may renumber the services; a new minor only adds numbers at the end.

ABITAB	EQU	$C003		; signature "TNA"
ABIMAJ	EQU	$C006		; major version, 5
ABIMIN	EQU	$C007		; minor version, 1
ABICALL	EQU	$C008		; CALL: the service numbered in C
ABIEND	EQU	$C00B		; the table's end: 8 bytes

; Calling. C = the service's number, its arguments in B, DE and HL; A is never
; an argument. Each returns A = 0 with Z set and carry clear on success, or
; A = a status below with carry set and nothing changed, but FIND and LIST,
; whose rows say what they return. Each returns with the interrupt state as it
; found it, runs on the caller's stack and keeps IX, IY and the alternate
; registers, but MOUNT, UNMOUNT and DESCRIBE, which may change IX and the
; alternates. None calls the BDOS, but MOUNT and UNMOUNT, which reset the drive
; through function 37 on the BDOS's own stack, so a program calls them from
; outside its own BDOS calls. Registers not named as results are destroyed.
; Stack is a bound on what each takes below its return address, the
; dispatcher's included: none takes more, and some take less.
; Any number from TNCOUNT up returns TNEBAD with B, DE and HL as they came.

TNINFO	EQU	0		; -> B = devices (HWB* below),
				; DE = ROM version, L = console
				; columns, H = rows (0 for serial).
				; Stack 6
TNDIGIT	EQU	1		; HL -> 6 segment bytes, leftmost
				; first: one scan of the digits.
				; Stack 4
TNLCD	EQU	2		; B = row 0-3, HL -> 20 characters:
				; the LCD row written. Stack 10
TNVIDEO	EQU	3		; B = 1 claim the PICO9918, 0 give it
				; back. TNEBAD for any other B,
				; TNENODV without one. Stack 12
TNTONE	EQU	4		; B = half period in 16 T-states,
				; DE = half cycles: a square wave on
				; the speaker. Stack 4
TNJOY	EQU	5		; -> B = joystick bits, 1 for each one
				; pressed. Stack 4
TNKEYS	EQU	6		; HL -> 8 bytes: the matrix rows, 1
				; for each key down. Stack 4
TNPUTAT	EQU	7		; D = row, E = column, B = count,
				; HL -> characters: written on the
				; video console, cursor unmoved,
				; clipped. TNENODV on serial or while
				; the PICO9918 is claimed and is the
				; console. Stack 22
TNRTC	EQU	8		; B = 0 read, 1 set (TNEBAD for any
				; other B) the 7 BCD bytes at
				; HL: seconds, minutes, hours, date,
				; month, weekday, year. TNENODV
				; without a clock. Stack 8
TNMOUNT	EQU	9		; B = drive 0-3, E = container index:
				; the volume mounted there, the drive
				; reset in the BDOS. TNEBAD for an
				; index past the table, a drive past
				; D:, a volume on another drive, a
				; slot too small. Stack 24
TNUNMNT	EQU	10		; B = drive 1-3: unmounted, the drive
				; reset. TNEBAD for A: or past D:.
				; Stack 24
TNDESC	EQU	11		; E = container index, HL -> 32 bytes:
				; its descriptor, the mount byte the
				; drive it is on now or FFh. TNEBAD
				; past the table. Stack 24
TNDRVR	EQU	12		; B = 1 CRT: or 3 UC1:, HL = a video
				; driver's table of eight words:
				; -> HL = LINEBUF. TNEBAD if that mode
				; has a table, with no matrix
				; keyboard, or for any other B.
				; HL = 0 drops the mode's table:
				; A = 0, carry clear, HL destroyed.
				; Stack 4
TNFIND	EQU	13		; DE -> a record's name, 8 bytes
				; padded with spaces, B = the least
				; version: -> carry clear, HL = its
				; entry table, A = the generation;
				; carry set for none. Stack 8
TNLIST	EQU	14		; B = an index from 0: -> carry clear,
				; HL = that record, A = the
				; generation; carry set past the
				; last. Stack 8
TNFONT	EQU	15		; -> HL = the console font in the
				; ROM: 96 characters of 8 bytes, one a
				; row from the top, from 20h; minor 1.
				; Stack 4
TNCOUNT	EQU	16		; how many services there are

; Status in A, with carry set.
TNEBAD	EQU	1		; no such number, an argument out of
				; range, or refused with nothing changed
TNENODV	EQU	2		; the device is not fitted, or not the
				; console

; A service's format, the header's second byte after 'D'. The loader refuses
; any other: each major moves the table's entries.
SVCFMT	EQU	4

; TNINFO's bits in B.
HWBMTX	EQU	$01		; a matrix keyboard
HWBPICO	EQU	$02		; a PICO9918 answered at cold boot
HWBGLCD	EQU	$04		; GLCD.SVC is in
HWBRTC	EQU	$08		; a DS1302 clock answered at cold boot
HWBCLM	EQU	$10		; the PICO9918 is claimed
HWBWRD	EQU	$80		; a word of the ROM's is on LCD row 3

; Version 2 of the "PICO" record's table: PICO.SVC's graphics entries, as
; offsets. Each assumes that the caller holds the claim, and destroys AF, BC,
; DE and HL.
PICOREG	EQU	16		; register B = A
PICOFIL	EQU	18		; DE bytes of A from VRAM address HL
PICOWR	EQU	20		; BC bytes from DE to VRAM address HL
PICORD	EQU	22		; BC bytes from VRAM address HL to DE

; Version 3 adds the width, which CON PICO 80, 40 or 32 calls. It takes no
; claim, and is refused while one is held.
PICOVER	EQU	3		; the version with PICOWID
PICOWID	EQU	24		; A = 80, 40 or 32 columns: the console
				; at that width, cleared; carry if
				; refused

; The driver's own state, after its table, which a debugger reads: offsets
; from the table, version 3's.
PICOVRB	EQU	36		; the record's version byte
PICOTPD	EQU	41		; the page drawn: 0, or TPGV's offset
PICOTPS	EQU	42		; the page shown, the same
