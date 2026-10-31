; The PICO9918 on the TEC-Deck video card: what the ROM keeps of it, the probe.
; Port BEh is VRAM data and BFh is control. The console and the graphics entries
; are a driver, PICO.DRV.

VDPDAT	EQU	$BE
VDPCTL	EQU	$BF

; Whether VRAM answers with what was written, at its last address, with two
; patterns that between them test every bit. Returns Z when present. Destroys
; AF and B.
TMSINIT:LD	A,$5A
	CALL	TMSTRY
	RET	NZ		; one failure is enough
	LD	A,$A5
; Write A to VRAM address 3FFFh and read it back: Z if it came back.
TMSTRY:	LD	B,A		; the pattern, across the addressing
	LD	A,$FF		; the address's low byte, for both directions
	OUT	(VDPCTL),A
	LD	A,$3F+$40	; its high bits, and the write flag
	OUT	(VDPCTL),A
	LD	A,B
	OUT	(VDPDAT),A
	LD	A,$FF		; the same address, to read
	OUT	(VDPCTL),A
	LD	A,$3F
	OUT	(VDPCTL),A
	IN	A,(VDPDAT)
	CP	B		; Z: the VDP has it
	RET
