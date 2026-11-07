; FILL.COM: fill retired GLCD pages with HALT, then print FILLED via BDOS.
; The UNLOAD test exposes a console vector still pointing into those pages.
; Starting at END, stops once the incremented H is at least the high byte
; of (0006h). Ignores the low byte; writes at least once. Interrupts or NMI
; can resume a HALT.

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
