; The TEC-OS table, ABI 3.1, at C003h after the reset jump: the one fixed
; address in the ROM. Its layout is fixed; entries are only ever added, at
; the end, with the minor version raised. src/abi.inc gives each entry's
; address to programs, and the build checks it against these labels.

ABITAB: DB      "TNA"           ; C003h signature
ABIMAJ: DB      3               ; C006h ABI major version
ABIMIN: DB      1               ; C007h ABI minor version
ABIVID: DW      VWID            ; C008h console columns, then rows; 0 = serial only
ABIHW:  JP      HWSVC           ; C00Ah hardware services: C = service
ABIMAIN:DW      MAINS           ; C00Dh MAIN regions fitted, 1 or 2
ABIXMOV:JP      XMOVE           ; C00Fh B = destination bank, C = source bank
ABIMOVE:JP      MOVE            ; C012h HL = destination, DE = source, BC = count
ABIXMRK:DW      XMARK           ; C015h EXPAND 1's low mark, a page; 80h
ABIXCCP:JP      XCCP            ; C017h a nested CCP: HL = 0100h
ABIXCMD:JP      XCMD            ; C01Ah one command line at DE, the same
ABIVOL: JP      VOLSVC          ; C01Dh mount, unmount and describe
ABIFONT:DW      FONT            ; C020h the console font, 8 bytes a character from 20h
ABIGLCD:JP      GLHOOK          ; C022h the GLCD's video table: HL = six words (carry if one is kept), or 0
ABIDRV: JP      DRVSVC          ; C025h the service registry: C = 0 find, 1 enumerate
ABIEND:
