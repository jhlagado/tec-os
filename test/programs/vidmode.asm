; VIDMODE.COM: leave the display unusable for text, then return to CP/M. On
; the PICO9918, select Graphics II with the display off and zero the first
; 2 KiB of VRAM, where the console patterns live. On the GLCD, return the
; controller to its basic instruction set with graphics and display off.

VDPDAT  EQU     $BE
VDPCTL  EQU     $BF
GLCCMD  EQU     $07

        ORG     $0100
        LD      A,$02           ; R0: Graphics II
        OUT     (VDPCTL),A
        LD      A,$80
        OUT     (VDPCTL),A
        LD      A,$80           ; R1: 16K, display off
        OUT     (VDPCTL),A
        LD      A,$81
        OUT     (VDPCTL),A
        XOR     A               ; write from VRAM 0000h
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
        LD      A,$34           ; GLCD: extended set, graphics off
        OUT     (GLCCMD),A
        LD      B,0
WAIT:   DJNZ    WAIT
        LD      A,$30           ; basic set
        OUT     (GLCCMD),A
        LD      B,0
WAIT2:  DJNZ    WAIT2
        LD      A,$08           ; display off
        OUT     (GLCCMD),A
        LD      B,0
WAIT3:  DJNZ    WAIT3
        JP      0
