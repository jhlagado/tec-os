; The TEC-OS table, ABI 5.0, at C003h after the reset jump: "TNA", the major,
; the minor, then the one jump to the numbered services. Its addresses and the
; services' numbers are abi.inc's, which rom.asm includes first, so a program
; and the ROM read them from one file. The build checks the bytes here and
; that the data block follows them.

	DB	"TNA"		; C003h ABITAB, the signature
	DB	5		; C006h ABIMAJ, the major version
	DB	0		; C007h ABIMIN, the minor version
	JP	SVCDSP		; C008h ABICALL: the service numbered in C
