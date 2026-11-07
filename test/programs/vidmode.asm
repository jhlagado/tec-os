; VIDMODE.COM: damage display state, then warm boot to exercise restoration.
; Both port sets are written without probing: PICO Graphics II/display off,
; first 2 KiB VRAM zero; GLCD basic set, graphics and display off.
; B=0 delays are 256 DJNZ iterations, subject to clock/interrupt/NMI variation.
; Multi-instruction port sequences are unguarded.
; Restoration depends on the active console driver.

VDPDAT  EQU     $BE
VDPCTL  EQU     $BF
GLCCMD  EQU     $07

        ORG     $0100
        LD      A,$02
        OUT     (VDPCTL),A
        LD      A,$80
        OUT     (VDPCTL),A
        LD      A,$80
        OUT     (VDPCTL),A
        LD      A,$81
        OUT     (VDPCTL),A
        XOR     A
        OUT     (VDPCTL),A
        LD      A,$40
        OUT     (VDPCTL),A
        LD      BC,$0800
ZERO:   XOR     A
        OUT     (VDPDAT),A
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,ZERO
        LD      A,$34
        OUT     (GLCCMD),A
        LD      B,0
WAIT:   DJNZ    WAIT
        LD      A,$30
        OUT     (GLCCMD),A
        LD      B,0
WAIT2:  DJNZ    WAIT2
        LD      A,$08
        OUT     (GLCCMD),A
        LD      B,0
WAIT3:  DJNZ    WAIT3
        JP      0
