; TEC-OS's table, ABI 3.1: the address of each entry, for programs. The
; table is at C003h; its layout is fixed and entries are only ever added, at
; the end, with the minor version raised. A program checks for "TNA" at
; ABITAB and its major version at ABIMAJ before it uses the rest. The TEC-OS
; build checks every address here against the ROM.

ABITAB  EQU     $C003           ; signature "TNA"
ABIMAJ  EQU     $C006           ; major version, 3
ABIMIN  EQU     $C007           ; minor version
ABIVID  EQU     $C008           ; a word: the address of the console's columns, then rows; 0 = serial only
ABIHW   EQU     $C00A           ; CALL: hardware services, C = service
ABIMAIN EQU     $C00D           ; a word: the address of the count of MAIN regions, 1 or 2
ABIXMOV EQU     $C00F           ; CALL: B = destination bank, C = source bank, for the next MOVE
ABIMOVE EQU     $C012           ; CALL: HL = destination, DE = source, BC = count
ABIXMRK EQU     $C015           ; a word: the address of EXPAND 1's low mark, a page
ABIXCCP EQU     $C017           ; CALL: a nested CCP, HL = 0100h
ABIXCMD EQU     $C01A           ; CALL: one command line at DE, HL = 0100h
ABIVOL  EQU     $C01D           ; CALL: mount, unmount and describe volumes
ABIFONT EQU     $C020           ; a word: the address of the console font, 8 bytes a character from 20h
ABIGLCD EQU     $C022           ; CALL: a video driver's table, A = 1 CRT or 3 UC1, HL = eight words, or 0
ABIDRV  EQU     $C025           ; CALL: the service registry, C = 0 find, 1 enumerate
ABIEND  EQU     $C028           ; the end of ABI 3.1's entries
