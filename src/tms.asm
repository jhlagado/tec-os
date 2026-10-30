; The PICO9918 on the TEC-Deck video card: what the ROM keeps of it. Port BEh is
; VRAM data and BFh is control. The console on it is a driver, PICO.DRV; the ROM
; keeps the probe and the addressing the raw hardware services use.

VDPDAT  EQU     $BE
VDPCTL  EQU     $BF

; Whether VRAM answers with what was written: Z when present.
TMSINIT:LD      HL,$3FFF
        LD      A,$5A
        CALL    TMSPOKE
        CALL    TMSPEEK
        CP      $5A
        RET     NZ
        LD      A,$A5
        CALL    TMSPOKE
        CALL    TMSPEEK
        CP      $A5
        RET

; Write A to VRAM address HL.
TMSPOKE:PUSH    AF
        CALL    TMSWA
        POP     AF
        OUT     (VDPDAT),A
        RET
; Read VRAM address HL into A.
TMSPEEK:CALL    TMSRA
        IN      A,(VDPDAT)
        RET

; Set the VRAM write address to HL.
TMSWA:  LD      A,L
        OUT     (VDPCTL),A
        LD      A,H
        AND     $3F
        OR      $40
        OUT     (VDPCTL),A
        RET
; Set the VRAM read address to HL.
TMSRA:  LD      A,L
        OUT     (VDPCTL),A
        LD      A,H
        AND     $3F
        OUT     (VDPCTL),A
        RET
