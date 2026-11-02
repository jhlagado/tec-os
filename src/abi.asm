; The TEC-OS table, ABI 4.0, at C003h after the reset jump. It and the RET at
; C01Dh (data.asm) are the ROM's fixed addresses. src/abi.inc gives each entry's address to programs, and
; the build checks it against these labels. A new major version may move what
; follows ABIMAIN. The table ends at C018h, with ABISVC at C015h, and ABI 4
; isn't frozen until a release, so a later stage may add to its end.

ABITAB:	DB	"TNA"		; C003h signature
ABIMAJ:	DB	4		; C006h ABI major version
ABIMIN:	DB	0		; C007h ABI minor version
ABIVID:	DW	VWID		; C008h console columns, then rows; 0 = serial
ABIHW:	JP	HWSVC		; C00Ah hardware services, numbered in C
ABIMAIN:
	DW	MAINS		; C00Dh MAIN regions fitted, 1 or 2
ABIVOL:	JP	VOLSVC		; C00Fh mount, unmount and describe
ABIGLCD:
	JP	GLHOOK		; C012h a video driver's table: A = CMCRT
				; or CMUC1, HL = eight words (carry if
				; one is kept), or 0
ABISVC:	JP	SVCREG		; C015h the registry: C = 0 find,
				; 1 enumerate
ABIEND:
