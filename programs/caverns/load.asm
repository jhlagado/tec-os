; Development-only scenario launcher overlay. Runs after normal BASIC setup.
; The build tool replaces only the opening banner, leaving game code/data intact.
; Default CP/M FCB supplies the named .SAV. Records are read/validated before
; applying any state. No code remains resident beyond the original COM image.
        ORG $0100
        %INCLUDE "load.inc"
ENTRY:  PUSH IX
        PUSH IY
        LD A,($5D)
        CP 32
        JP Z,FAIL
        LD HL,$4143
        LD ($65),HL
        LD A,86
        LD ($67),A
        LD HL,$68
        LD B,24
        XOR A
CLEAR:  LD (HL),A
        INC HL
        DJNZ CLEAR
        LD C,15
        CALL FILE
        CP $FF
        JP Z,FAIL
        LD C,20
        CALL FILE
        OR A
        JR NZ,READBAD
        LD C,20
        CALL FILE
        CP 1
READBAD:
        PUSH AF
        LD C,16
        CALL FILE
        CP $FF
        JP Z,FAIL
        POP AF
        JP NZ,FAIL
; Header bytes 6/7 hold the checksum; all other header bytes must match.
        LD HL,$80
        LD DE,HEADER
        LD B,6
        CALL MATCH
        JP NZ,FAIL
        INC HL
        INC HL
        INC DE
        INC DE
        LD B,8
        CALL MATCH
        JP NZ,FAIL
; Unsigned 16-bit sum of all bytes except checksum bytes 6/7.
        LD HL,0
        LD DE,$80
        LD B,128
SUM:    LD A,B
        CP 122
        JR Z,SKIP
        CP 121
        JR Z,SKIP
        LD A,(DE)
        ADD A,L
        LD L,A
        JR NC,SKIP
        INC H
SKIP:   INC DE
        DJNZ SUM
        LD DE,($86)
        OR A
        SBC HL,DE
        JP NZ,FAIL
; Player room must be 1..54. Objects must be absent, carried or room 1..255.
        LD HL,($C0)
        DEC HL
        LD A,H
        OR A
        JP NZ,FAIL
        LD A,L
        CP 54
        JP NC,FAIL
        LD HL,$90
        LD B,24
OBJ:    LD A,(HL)
        INC HL
        LD C,(HL)
        INC HL
        INC C
        JR Z,CARRIED
        DEC C
        JP NZ,FAIL
        JR NEXT
CARRIED:
        INC A
        JP NZ,FAIL
NEXT:   DJNZ OBJ
; The dynamically allocated P% array has a 4-byte header and a two-byte element zero.
        LD DE,(OBJECTS)
        INC DE
        INC DE
        INC DE
        INC DE
        INC DE
        INC DE
        LD HL,$90
        LD BC,48
        LDIR
        LD IX,WORDS
        LD B,11
WORDSIN:
        LD E,(IX+0)
        LD D,(IX+1)
        INC IX
        INC IX
        LD A,(HL)
        LD (DE),A
        INC HL
        INC DE
        LD A,(HL)
        LD (DE),A
        INC HL
        DJNZ WORDSIN
        LD DE,RNG
        LD BC,4
        LDIR
        POP IY
        POP IX
        JP RESUME
MATCH:  LD A,(DE)
        CP (HL)
        RET NZ
        INC DE
        INC HL
        DJNZ MATCH
        RET
FILE:   LD DE,$5C
        JP 5
FAIL:   LD DE,MESSAGE
        LD C,9
        CALL 5
        JP 0
MESSAGE:DB "Invalid/missing scenario. Use CAVLOAD name.CAV",13,10,"$"
HEADER: DB $43,$56,$42,$31,1,0,0,0
        DB HASH0,HASH1,HASH2,HASH3,HASH4,HASH5,HASH6,HASH7
WORDS:  DW ROOM,BRIDGE,DRAWBR,WALL,GRILLE,DOOR,CRYPT,HUT,LIGHT,FATIGUE,MOVES
