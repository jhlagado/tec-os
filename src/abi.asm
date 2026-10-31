; The TEC-OS table, ABI 4.0, at C003h after the reset jump: the one fixed
; address in the ROM. src/abi.inc gives each entry's address to programs, and
; the build checks it against these labels. A new major version may move what
; follows ABIMAIN. ABIXCCP and ABIXCMD stay last, so that they can be cut off
; the end.

ABITAB:	DB	"TNA"		; C003h signature
ABIMAJ:	DB	4		; C006h ABI major version
ABIMIN:	DB	0		; C007h ABI minor version
ABIVID:	DW	VWID		; C008h console columns, then rows; 0 = serial
ABIHW:	JP	HWSVC		; C00Ah hardware services: C = service
ABIMAIN:	DW	MAINS	; C00Dh MAIN regions fitted, 1 or 2
ABIVOL:	JP	VOLSVC		; C00Fh mount, unmount and describe
ABIGLCD:	JP	GLHOOK	; C012h a video driver's table: A = CMCRT
				; or CMUC1, HL = eight words (carry if
				; one is kept), or 0
ABIDRV:	JP	DRVSVC		; C015h the service registry: C = 0 find,
				; 1 enumerate
ABIXCCP:	JP	XCCP	; C018h a nested CCP: HL = 0100h
ABIXCMD:	JP	XCMD	; C01Bh one command line at DE, the same
ABIEND:
