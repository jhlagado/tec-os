; FILL.COM: fill the TPA above this program up to (0006h)
; with HALT, then print through the BDOS. After UNLOAD of a resident GLCD,
; this overwrites the pages it had; a console vector still pointing there
; halts the machine instead of printing.

        ORG     $0100
        LD      HL,END
        LD      DE,($0006)
FL:     LD      (HL),$76
        INC     HL
        LD      A,H
        CP      D
        JR      C,FL
        LD      DE,DONE
        LD      C,9
        JP      $0005
DONE:   DB      "FILLED$"
END:
