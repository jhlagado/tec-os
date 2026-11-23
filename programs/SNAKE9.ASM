;=====================================
;SNAKE9.Z80  Tutankhamen's Snake
;STAGE 9: extending the game
;TEC-1G, MON3 v1.6, RGB 8x8 add-on
;ASM80. Load HEX, then GO 4000.
;UNTESTED ON HARDWARE
;=====================================
;New: four hidden pressure plates,
;purple like the floor motifs, in
;the Sacred Temple, the Eye of Ra
;(the pupil), the Throne Room and
;the Golden Shrine. Step on one and
;it clicks and goes dark. The fourth
;unlocks a secret door in the Golden
;Shrine's south wall, down to room
;16, the Fountain of Youth: 12 red
;beetles in fixed places and a
;golden scarab worth a life (up to
;6). AD in play pauses (the picture
;stays lit); a direction key goes
;on, a second AD goes to the title.
;Every life starts paused.
;From Stage 8: before each game the
;LCD shows a title, a story that scrolls up a
;line at a time, the keys, the 7-seg
;and one settings screen. GO (or
;Fire 1) goes on, AD goes back (AD on
;the title quits). On the settings
;screen up and down change the
;highlighted setting, shown in
;inverse with custom characters, and
;left and right move the highlight.
;SPEED: Elderly, Midlife or Youthful
;(frames per step). LENGTH: Adder
;16, Python 24 or Anaconda 30 (the
;length that opens the exit). Faster
;speeds pay more: every award is x1,
;x1.25 or x1.5 (rounded down). A
;death costs no points, and a beetle
;pays only past PEAKLEN. After
;the ending or a game over, and a
;key, the title comes back with the
;same settings.
;From Stage 7: the 4x4 tomb, the
;exit in King Tut's Tomb, the door
;scene and the ending. Scarab
;beetles (red) make you grow. Two
;per room; a room can respawn once,
;after BTLWAIT others, and never on
;the edge of a room. A death
;restarts in room 0 with every
;beetle put back. Purple floor
;motifs are decoration only; yellow
;walls kill just like blue ones.
;Beetles never sit on a plate.
;=====================================
;Keys: 6 up, 1 left, 2 down, 3 right
;Matrix: arrows. Joystick ok.
;Head white, body green, beetle red,
;walls blue (some yellow), closed
;exit yellow,
;floor motifs purple (red+blue).
;In play the LCD shows the room name,
;the speed and length, and how many
;beetles are still needed to open
;the exit. At the end it shows "YOU
;ESCAPED!" or "GAME OVER", the score
;and the most this speed can score.
;Menu: GO (Enter, Fire 1) next or
;play, AD (Esc) back. Settings: 6 / 2
;or + / -, or up / down (arrows or
;stick) change; 1 / 3 or left / right
;(arrows or stick) move the
;highlight. In play AD = pause, and
;AD again = to the title. A
;direction key ends a pause.
;Reverse keys are ignored.
;
;The loop, every frame:
;REFRESH, SHOWSEG, READKEYS, count.
;Every STEPS frames: UPDATE, DRAW.
;See lesson9.md for the plates, the
;secret room and the pause.
;=====================================
;
;---- Settings you can change ----
;Speed and length are now chosen in
;the menu; see SPDTAB and LENTAB.
;1 frame is ~3.5 ms (RGB + 7-seg),
;so $80 frames is ~0.45 s/step.
STARTX   EQU  1    ;Tail column 0-7
STARTY   EQU  3    ;Start row 0-7
STARTLEN EQU  3    ;Segments at start
STARTLV  EQU  5    ;Lives at a new game
MAXLV    EQU  6    ;Most lives (golden)
BTLSCR   EQU  3    ;Beetle: this x new LEN
;First beetle, LEN 4: 3*4 = 12 points.
ROOMSCR  EQU  50   ;First entry to a room
;Every award (beetle, room, exit) is
;multiplied by the speed: see AWARD.
EXITSCR  EQU  1000 ;Exit bonus
LIFESCR  EQU  200  ;Per life on exit
BTLWAIT  EQU  4    ;Eats before a respawn
STROOM   EQU  0    ;Starting room
EXITTST  EQU  0    ;1 = test build
;When EXITTST is 1, after the menu
;a new game starts in the Golden
;Shrine with the other 3 plates
;already pressed. The length-3 snake
;is on row 1, heading right, just
;left of the fourth plate at (4,1).
;Press 3 (right): it steps on the
;plate and the secret door unlocks.
;Go round to (4,6), then down
;through the door into the Fountain
;of Youth. A death restarts in the
;Entrance Stairway as usual, with
;the plates and the door kept.
;Assemble with this set to 1 for
;snake9x.hex.
TSTRM    EQU  15   ;Test: Golden Shrine
TSTPOS   EQU  $09  ;Test tail: (1,1)
TSTDIR   EQU  1    ;RIGHT, to the plate
;ADDSCORE caps at 9999. The exit pays
;EXITSCR + LIFESCR per life left.
;The exit opens at the LENGTH from
;the menu, kept in OPENAT.
;The door scene: first the game
;freezes for DOORWT frames (about
;0.7 s) so you see it has stopped.
;Then 9 pictures, the door 0 to 8
;rows up, each held for DOORSTP
;frames. Each frame adds a short
;noise burst, so a frame is about
;6 ms and the lift about 2 s.
DOORWT   EQU  200  ;Frozen frames first
DOORSTP  EQU  36   ;Frames per door row
SCRHALF  EQU  6    ;Scrape halves/frame
;Set SCRHALF to 0 to silence it.
;The story scrolls up one line every
;STORYDL menu frames, after a longer
;first hold of STORY1. A menu frame
;is about 3.5 ms, so 570 is about
;2 s and 430 about 1.5 s.
STORY1   EQU  570  ;First hold, ~2 s
STORYDL  EQU  430  ;Each line, ~1.5 s
;1 frame of the ending is REFRESH +
;SHOWSEG + a key scan, about 3.5 ms.
;ENDDLY is the hold for each step of
;the snake. At 64 it is about 0.22 s
;per step, and the whole ending is
;about 9.5 s. Tune this first if the
;pace feels off.
ENDDLY   EQU  64   ;Frames per ending step
SNLEN    EQU  14   ;Ending snake, 16 max
;The ending world, by row from the
;top: 0-1 sky, 2-3 sand, 4 the black
;edge of the tomb, 5 on down the
;striped corridor. The camera (SCRY
;= world row at the top of the 8x8)
;starts at ENDTOP and pans up with
;the head, PANROWS rows before the
;black edge comes into view.
PANROWS  EQU  5    ;Corridor pan rows
ENDTOP   EQU  4+PANROWS
;The head starts 2 rows below the
;screen, so the empty corridor is
;seen first.
ENDSTW   EQU  ENDTOP+10
ENDHOLD  EQU  128  ;Empty scene hold
FADSTEP  EQU  48   ;Frames per fade level
FADEMAX  EQU  8    ;PWM steps, 8/8 to 0/8
;9 * 48 * 3.5 ms is about 1.5 s.
SKYCOL   EQU  6    ;Sky: green+blue
SANDCOL  EQU  3    ;Sand: yellow
BODYCOL  EQU  2    ;Body: 2 = green
HEADCOL  EQU  7    ;Head: 7 = white
BTLCOL   EQU  1    ;Beetle: 1 = red
WALLCOL  EQU  4    ;Walls: 4 = blue
YWALCOL  EQU  3    ;Yellow walls
FLOORCOL EQU  5    ;Floor motif: purple
FLASHES  EQU  3    ;Red flashes on death
FLTIME   EQU  $28  ;Frames per half-flash
;1 frame ~3.5 ms, so $28 ~140 ms
;3 flashes ~0.8 s (on + off, 3 times)
DEADCOL  EQU  1    ;Death colour: red
;The late-key window is the last
;quarter of a step (LATEN = STEPS/4,
;so $20 at Elderly). A key in it is
;used on the step after this one.
TICK     EQU  4    ;Step tick halves
;Set TICK to 0 to silence the tick.
TICKDLY  EQU  $10  ;Tick delay (pitch)
EATLEN   EQU  $20  ;Eat sound halves
EATDLY   EQU  $28  ;Eat delay (pitch)
CLKLEN   EQU  24   ;Plate click halves
CLKDLY   EQU  $C0  ;Click delay (pitch)
DORLEN   EQU  200  ;Door opening halves
DORDLY   EQU  $F0  ;Door delay (pitch)
STARTPOS EQU  $19  ;Start tail: (1,3)
RIGHT    EQU  1
STARTDIR EQU  RIGHT;Start heading
;Every life starts in room 0 on the
;length-3 strip from STARTPOS along
;STARTDIR: (1,3) (2,3) (3,3) in the
;Entrance Stairway. Keep that strip
;clear of walls when you edit the
;map at ROOMS.
;
;---- MON3 API: LD C,n then RST $10 ----
SCANKEYS EQU  16   ;No wait. CY = new key
KEYPLUS  EQU  $10  ;+ key (right arrow)
KEYMIN   EQU  $11  ;- key (left arrow)
KEYGO    EQU  $12  ;GO key (or Enter)
KEYAD    EQU  $13  ;AD key (or Esc)
RANDOM   EQU  49   ;A = random 0-255
;RANDOM also destroys B (and IX).
A2SEG    EQU  6    ;ASCII in A -> seg in A
SCANSEG  EQU  10   ;scanSegments, DE=buf
STR2LCD  EQU  13   ;stringToLCD, HL=text
CHR2LCD  EQU  14   ;charToLCD, A=char
CMD2LCD  EQU  15   ;commandToLCD, B=cmd
LCDROW1  EQU  $80  ;LCD row 1, column 1
LCDROW2  EQU  $C0  ;LCD row 2, column 1
LCDROW3  EQU  $94  ;LCD row 3, column 1
LCDROW4  EQU  $D4  ;LCD row 4, column 1
LCDCLS   EQU  $01  ;Clear, cursor home
CGRAM    EQU  $40  ;+8*n: custom char n
;
;---- Ports ----
DIGITP   EQU  $01  ;7-seg digits + speaker
SEGP     EQU  $02  ;7-seg segments
SPKBIT   EQU  $80  ;Speaker on DIGITP
RGBROW   EQU  $05  ;Row select, bit 0 top
RGBRED   EQU  $06  ;Red, bit 7 = left
RGBGRN   EQU  $F8  ;Green
RGBBLU   EQU  $F9  ;Blue
ONTIME   EQU  $40  ;Row lit time
ARROWS   EQU  $FEFE;B=$FE (A8) C=port
JOYROW   EQU  $F7  ;A11 = joystick line
;
;---- Directions (clockwise) ----
UP       EQU  0
DOWN     EQU  2
LEFT     EQU  3
;
;---- RAM ($1000-$3FFF is free) ----
FB       EQU  $2000;24 byte framebuffer
DIR      EQU  $2018;Direction now
NDIR     EQU  $2019;Direction next step
FRAMES   EQU  $201A;Frames to next step
QUIT     EQU  $201B;Non zero = quit
HEADI    EQU  $201C;BUF index of head
LEN      EQU  $201D;Snake length
BUF      EQU  $2100;Ring buffer, 64 pos
RBUF     EQU  $2200;Ring, 64 room nums
BUFMASK  EQU  $3F  ;Index AND $3F = 0-63
BUFSIZE  EQU  64   ;Longest snake
BEETLE   EQU  $201E;Beetle pos, $FF=none
NOBTL    EQU  $FF  ;No beetle on board
TRIES    EQU  32   ;Random goes first
FLASHN   EQU  $201F;Flashes left (death)
SEGBUF   EQU  $2020;6 bytes, left first
LIVES    EQU  $2026;Lives left
DDIR     EQU  $2027;Deferred dir, $FF=none
NODIR    EQU  $FF  ;No deferred direction
SCORE    EQU  $2028;2 bytes packed BCD
;SCORE+0 = thousands,hundreds
;SCORE+1 = tens,ones. Cap 9999.
CURROM   EQU  $202A;Current room 0-16
OLDROM   EQU  $202B;Room at step start
CURMAP   EQU  $202C;Ptr to 8-byte map
BTLEATN  EQU  $202E;Beetles eaten, 0-44
WON      EQU  $202F;Non zero = exited
MAPRAM   EQU  $2030;8 bytes, room walls
DECRAM   EQU  $2038;8 bytes, room decos
BTLPOS   EQU  $2040;16 bytes, beetle pos
BTLDONE  EQU  $2050;16 bytes, eaten 0-2
BTLNEXT  EQU  $2060;16 bytes, respawn at
SCRY     EQU  $2070;Camera row / door
FADE     EQU  $2071;PWM duty, 0-8
ANCNT    EQU  $2072;PWM frame count
NOISE    EQU  $2073;Scrape noise seed
CURDEC   EQU  $2075;Ptr to 8-byte deco
SCRTXT   EQU  $2080;21 byte score line
ENDX     EQU  $20A0;16 bytes, ending x
ENDW     EQU  $20B0;16 bytes, world row
SPDSEL   EQU  $20C0;Speed 0-2, Elderly=0
LENSEL   EQU  $20C1;Length 0-2, Adder=0
STEPS    EQU  $20C2;Frames per step
LATEN    EQU  $20C3;Late window frames
OPENAT   EQU  $20C4;Length that opens
MENUN    EQU  $20C5;Menu screen 0-4
STACK    EQU  $20C6;2 bytes, SP from MON3
JOYOLD   EQU  $20C8;Menu stick bits seen
JOYWT    EQU  $20C9;Menu stick settling
JOYDLY   EQU  10   ;Frames to settle
FOCUS    EQU  $20CA;0 Speed, 1 Length lit
STORYN   EQU  $20CB;Story top line 0-5
STORYT   EQU  $20CC;2 bytes, frames left
PEAKLEN  EQU  $20CE;Longest this game
VISIT    EQU  $20D0;17 bytes, 1=visited
PLATEN   EQU  $20E1;Plates pressed, 0-4
PLATEUP  EQU  $20E2;4 bytes, 1=pressed
FIXI     EQU  $20E6;Room 16 item eaten
FIXEAT   EQU  $20E7;13 bytes, 1=eaten
NROOMS   EQU  17   ;Rooms, with room 16
NPLATES  EQU  4    ;Pressure plates
DOORRM   EQU  15   ;Golden Shrine
DOORPOS  EQU  $3C  ;Its door: (4,7)
SECRM    EQU  16   ;Fountain of Youth
NFIX     EQU  13   ;12 red + golden
NRED     EQU  12   ;Red, back on a death
GOLDI    EQU  12   ;Golden: the last
GOLDCOL  EQU  3    ;Golden: yellow
STORYSC  EQU  1    ;Menu: story screen
SETSCR   EQU  4    ;Menu: settings
NSCR     EQU  5    ;Menu screens
STLAST   EQU  5    ;Story: 9 lines - 4
EXITRM   EQU  3    ;King Tut's Tomb
EXITCOL  EQU  3    ;Yellow: red+green
EXITX    EQU  7    ;East outer wall
EXITY    EQU  2    ;Top of 3 yellow
;SETMAP copies the room's walls and
;decorations into MAPRAM and DECRAM,
;so a pressed plate (its purple bit
;cleared) and the unlocked secret
;door (its wall bit cleared, its
;purple bit set) can change.
;The old VISIT bytes at $2030 now
;hold those copies; VISIT moved to
;$20D0 to make room for room 16.
;A position is one byte: y*8 + x.
;BUF and RBUF start on a $100
;boundary, so the same index in L
;can switch page with H.
;
  ORG  $4000
;
;=====================================
;MAIN LOOP
;=====================================
START:
  LD   (STACK),SP  ;To get back to MON3
  XOR  A
  LD   (SPDSEL),A  ;Elderly
  LD   (LENSEL),A  ;Adder
  LD   HL,SEGBUF
  LD   B,6
  CALL FILLB       ;7-seg blank
NEWGAME:
  LD   SP,(STACK)  ;Forget old calls
  CALL MENU        ;Title, story, setup
  LD   A,(QUIT)
  OR   A
  JR   NZ,QUITGAME ;AD on the title
  CALL INITALL     ;5 lives and a snake
MAINLOOP:
  CALL REFRESH     ;Show picture once
  CALL SHOWSEG     ;Keep the 7-seg lit
  CALL READKEYS    ;Look, never wait
  LD   A,(QUIT)
  OR   A
  JR   NZ,MLPAUSE  ;AD: pause
  LD   HL,FRAMES
  DEC  (HL)        ;Count down frames
  JR   NZ,MAINLOOP ;Not yet
  LD   A,(STEPS)
  LD   (HL),A      ;Reload counter
  CALL UPDATE      ;Move one step
  LD   A,(QUIT)
  OR   A
  JR   NZ,NEWGAME  ;AD: flash, door, end
  CALL DRAW        ;Rebuild picture
  JR   MAINLOOP
MLPAUSE:
  CALL PAUSE       ;Until a direction
  LD   A,(QUIT)
  OR   A
  JR   NZ,NEWGAME  ;AD again: title
  JR   MAINLOOP
;QUITGAME: only AD on the title
;comes here; AD in a game goes back
;to the title through NEWGAME.
QUITGAME:
  LD   SP,(STACK)
  CALL RGBOFF      ;Matrix dark
  XOR  A
  OUT  (DIGITP),A  ;7-seg and speaker off
  OUT  (SEGP),A
  RET              ;Back to MON3
;
;=====================================
;INITALL: a fresh game, 5 lives,
;score 0, no plates pressed, the
;golden scarab back. A lost life uses
;INITGAME and keeps all of these.
;=====================================
INITALL:
  LD   A,STARTLV
  LD   (LIVES),A
  XOR  A
  LD   (SCORE),A   ;Score starts at 0
  LD   (SCORE+1),A
  LD   (WON),A     ;Not yet exited
  LD   (PLATEN),A  ;No plates pressed
  LD   HL,PLATEUP
  LD   B,NPLATES
  CALL FILLB
  LD   (FIXEAT+GOLDI),A
  LD   A,STARTLEN
  LD   (PEAKLEN),A ;Not on a death
  LD   A,EXITTST
  OR   A
  JR   NZ,IATEST   ;Test: by plate 4
  LD   A,STROOM
  JR   IAROM
IATEST:
  LD   A,1
  LD   (PLATEUP),A ;Plates 1 to 3 done
  LD   (PLATEUP+1),A
  LD   (PLATEUP+2),A
  LD   A,NPLATES-1
  LD   (PLATEN),A
  LD   A,TSTRM
IAROM:
  LD   (CURROM),A
  CALL SETMAP
  CALL SHOWSET     ;LCD: the settings
  LD   HL,VISIT
  LD   B,NROOMS
  XOR  A
  CALL FILLB
  CALL RESETBTL    ;Every beetle back
  LD   HL,VISIT
  LD   A,(CURROM)  ;Start room: no 100
  ADD  A,L
  LD   L,A
  LD   A,1
  LD   (HL),A
  CALL INITGAME
  RET
;
;RESETBTL: put every room's beetles
;back: none eaten, none placed, no
;respawn waiting, and the 12 red
;beetles in the Fountain of Youth
;back too (not the golden scarab).
;Used by a new game and by a death.
;Destroys A,B,HL
RESETBTL:
  XOR  A
  LD   (BTLEATN),A
  LD   HL,BTLDONE
  LD   B,16
  CALL FILLB
  LD   HL,FIXEAT
  LD   B,NRED
  CALL FILLB
  LD   A,NOBTL
  LD   HL,BTLPOS
  LD   B,16
  CALL FILLB
  LD   HL,BTLNEXT
  LD   B,16
  CALL FILLB
  RET
;
;FILLB: fill B bytes at HL with A.
;Destroys B,HL
FILLB:
  LD   (HL),A
  INC  HL
  DJNZ FILLB
  RET
;
;=====================================
;INITGAME: starting snake in
;CURROM. A death sets CURROM to 0
;first. Keeps lives, score, visited
;rooms and the plates (DIE resets
;beetles). Every life starts paused:
;the snake waits for a direction.
;=====================================
INITGAME:
  LD   A,NODIR
  LD   (DDIR),A    ;No deferred turn
  LD   A,EXITTST
  OR   A
  JR   Z,IGSTART   ;Normal start strip
  LD   A,(CURROM)
  CP   TSTRM       ;Only in the test room
  JR   NZ,IGSTART
  LD   C,A
  LD   A,TSTDIR
  LD   (DIR),A     ;Beside plate 4
  LD   (NDIR),A
  LD   A,TSTPOS
  LD   E,A         ;E = test tail
  JR   IGFILL
IGSTART:
  LD   A,(CURROM)
  LD   C,A         ;C = this room
  LD   E,STARTPOS  ;E = tail pos
  LD   A,STARTDIR
  LD   (DIR),A     ;Start heading
  LD   (NDIR),A
IGFILL:
  LD   A,E
  LD   B,STARTLEN
  LD   HL,BUF      ;Fill pos and room
INIT1:
  LD   (HL),A      ;Position
  LD   H,RBUF/256
  LD   (HL),C      ;Same room as head
  LD   H,BUF/256
  INC  L
  PUSH BC
  PUSH HL
  CALL NEXTPOS     ;Next cell in DIR
  POP  HL
  POP  BC
  DJNZ INIT1
  LD   A,STARTLEN-1
  LD   (HEADI),A   ;Head = last one
  LD   A,STARTLEN
  LD   (LEN),A
  LD   A,(STEPS)
  LD   (FRAMES),A
  XOR  A
  LD   (QUIT),A
  CALL SETBTL      ;This room's beetle
  CALL SHOWREQ     ;LCD beetles needed
  CALL SHOWNAME    ;LCD room name
  CALL DRAW
  CALL PAUSE       ;Wait for a direction
  RET
;
;=====================================
;PAUSE: hold the game, picture lit,
;until a direction key that is not
;straight back. LCD line 2 says so.
;AD again sets QUIT and returns (to
;the title). Used by AD in play and
;at the start of every life.
;Destroys A,BC,DE,HL,IX
;=====================================
PAUSE:
  XOR  A
  LD   (QUIT),A
  LD   HL,PAUSELN
  LD   C,LCDROW2
  CALL LINE        ;" PAUSED: move to go"
  LD   A,NODIR
  LD   (NDIR),A    ;Wait for a new one
  LD   (DDIR),A    ;No late turn
PS1:
  LD   A,(STEPS)
;Never a late key: SETDIR then checks
;the key against DIR, the way the
;snake last moved.
  LD   (FRAMES),A
  CALL REFRESH     ;Picture stays on
  CALL SHOWSEG
  CALL READKEYS
  LD   A,(QUIT)
  OR   A
  RET  NZ          ;AD again: title
  LD   A,(NDIR)
  CP   NODIR
  JR   Z,PS1       ;Still waiting
PSGO:
  LD   A,1
  LD   (FRAMES),A  ;Step straight away
  LD   HL,BLANKLN
  LD   C,LCDROW2
  CALL LINE        ;Line 2 blank again
  RET
;
;=====================================
;READKEYS: look once, never wait.
;Wanted direction is latched in NDIR,
;or in DDIR if this is a late key.
;Destroys A,BC,DE,IX
;=====================================
READKEYS:
;-- 1) Keypad via MON3 scanKeys --
  LD   C,SCANKEYS
  RST  $10
  JR   NC,RKARROW  ;No new key
  CP   KEYAD
  JR   NZ,RKHEX
  LD   A,1         ;AD = leave the game
  LD   (QUIT),A
  RET
RKHEX:
  LD   E,UP
  CP   $06         ;6 = up
  JR   Z,SETDIR
  LD   E,LEFT
  CP   $01         ;1 = left
  JR   Z,SETDIR
  LD   E,DOWN
  CP   $02         ;2 = down
  JR   Z,SETDIR
  LD   E,RIGHT
  CP   $03         ;3 = right
  JR   Z,SETDIR
;-- 2) Matrix arrows: row A8 --
RKARROW:
  LD   BC,ARROWS
  IN   A,(C)       ;0 = pressed
  CPL              ;Now 1 = pressed
  LD   E,UP
  BIT  3,A
  JR   NZ,SETDIR
  LD   E,DOWN
  BIT  4,A
  JR   NZ,SETDIR
  LD   E,LEFT
  BIT  5,A
  JR   NZ,SETDIR
  LD   E,RIGHT
  BIT  6,A
  JR   NZ,SETDIR
;-- 3) Joystick: row A11 --
  LD   B,JOYROW
  IN   A,(C)
  CPL
  LD   E,UP
  BIT  0,A
  JR   NZ,SETDIR
  LD   E,DOWN
  BIT  1,A
  JR   NZ,SETDIR
  LD   E,LEFT
  BIT  2,A
  JR   NZ,SETDIR
  LD   E,RIGHT
  BIT  3,A
  JR   NZ,SETDIR
  RET              ;Nothing pressed
;
;SETDIR: E = wanted direction.
;Opposites differ by 2. A late key
;(FRAMES < LATEN) is stored in DDIR
;and checked against NDIR, the dir
;that will be in force when it is
;used. An early key goes in NDIR and
;is checked against DIR, as before.
;LATEN 0: never carry, so every
;key would be early.
SETDIR:
  LD   A,(LATEN)
  LD   B,A
  LD   A,(FRAMES)
  CP   B           ;Late window?
  JR   C,SETLATE
  LD   A,(DIR)
  XOR  E
  CP   2
  RET  Z           ;Reverse: ignore
  LD   A,E
  LD   (NDIR),A    ;Latch for next step
  RET
SETLATE:
  LD   A,(NDIR)    ;Will be in force
  XOR  E
  CP   2
  RET  Z           ;Reverse: ignore
  LD   A,E
  LD   (DDIR),A    ;Hold for the step after
  RET
;
;=====================================
;UPDATE: apply NDIR, then promote a
;deferred DDIR for the step after.
;NEXTPOS may change room. A wall or
;a bite kills before the head is
;stored. If the square is free, store
;the new head. On the beetle, grow,
;score it if past PEAKLEN, and play
;the eat sound; otherwise a short
;step tick.
;Destroys A,BC,DE,HL,IX
;=====================================
UPDATE:
  LD   A,(NDIR)
  LD   (DIR),A     ;Apply latched dir
  LD   A,(DDIR)
  CP   NODIR       ;A deferred turn?
  JR   Z,UPD0
  LD   (NDIR),A    ;Use it next step
  LD   A,NODIR
  LD   (DDIR),A
UPD0:
  LD   A,(CURROM)
  LD   (OLDROM),A
  LD   H,BUF/256
  LD   A,(HEADI)
  LD   L,A         ;HL = head entry
  LD   A,(HL)      ;A = head pos
  CALL NEXTPOS     ;A = new head pos
  LD   E,A
  LD   A,(WON)
  OR   A
  JP   NZ,WINGAME  ;Left through the exit
  LD   A,(OLDROM)
  LD   HL,CURROM
  CP   (HL)        ;Changed room?
  JR   Z,UPD1
  PUSH DE
  CALL ENTER
  POP  DE
UPD1:
  CALL FIXBTL      ;Room 16 beetles
  CALL ONWALL      ;A blue wall?
  JP   Z,DIE       ;Yes: flash + restart
  CALL HITSELF     ;About to bite?
  JP   Z,DIE       ;Yes: flash + restart
  LD   A,(HEADI)
  INC  A           ;Next slot...
  AND  BUFMASK     ;...63 wraps to 0
  LD   (HEADI),A
  LD   L,A
  LD   H,BUF/256
  LD   (HL),E      ;Store new head
  LD   H,RBUF/256
  LD   A,(CURROM)
  LD   (HL),A      ;And its room
  CALL PRESS       ;A pressure plate?
  LD   A,(BEETLE)
  CP   E           ;Head on the beetle?
  JR   Z,UPDEAT
  CALL DOTICK      ;Quiet step tick
  RET
UPDEAT:
  LD   A,(CURROM)
  CP   SECRM
  JR   NZ,UPDGROW
  LD   A,(FIXI)
  CP   GOLDI       ;The golden scarab?
  JP   Z,GOLDEN    ;A life, no growth
UPDGROW:
  LD   A,(LEN)
  CP   BUFSIZE     ;Already full size?
  JR   NC,UPD9
  INC  A
  LD   (LEN),A     ;Grow by one
;A beetle pays only if the snake is
;now longer than it has ever been in
;this game (PEAKLEN). After a death
;it regrows for nothing until it
;passes its old best, so dying and
;eating the beetles again cannot
;farm points.
UPD9:
  LD   HL,PEAKLEN
  LD   A,(LEN)     ;New length
  CP   (HL)
  JR   C,UPDBTL    ;Shorter: no points
  JR   Z,UPDBTL    ;Same: no points
  LD   (HL),A      ;A new best
  LD   HL,0        ;HL = BTLSCR * LEN
  LD   E,A
  LD   D,0
  LD   B,BTLSCR
UPDSC:
  ADD  HL,DE
  DJNZ UPDSC
  EX   DE,HL
  CALL AWARD       ;x the speed
UPDBTL:
  CALL EATBTL      ;This room's beetle
  CALL SETBTL      ;No instant respawn
  CALL DOEAT       ;Longer eat sound
  CALL SHOWREQ     ;LCD beetles needed
  LD   HL,OPENAT
  LD   A,(LEN)
  CP   (HL)        ;Just long enough?
  RET  NZ
  CALL DOORANI     ;Door scene
  RET
;
;=====================================
;HITSELF: E = proposed head. Z if the
;snake would die, NZ if the square is
;safe. If this step is a grow (E is
;the beetle, and LEN is not already
;64), the tail stays put, so every
;segment is checked. Otherwise the
;tail is leaving and is skipped.
;Keeps DE. Destroys A,B,C,HL
;=====================================
HITSELF:
  LD   A,(LEN)
  PUSH AF          ;Save the real LEN
  LD   C,A
  LD   A,(BEETLE)
  CP   E           ;Moving onto beetle?
  JR   NZ,HS1
  LD   A,C
  CP   BUFSIZE
  JR   NC,HS1      ;Can't grow: skip tail
  JR   HSGO        ;Grow: check all C
HS1:
  DEC  C           ;Tail is leaving
  JR   Z,HSNO      ;Nothing to check
  LD   A,C
HSGO:
  LD   (LEN),A     ;ONSNAKE uses LEN
  CALL ONSNAKE
  POP  BC          ;B = real LEN
  LD   A,B
  LD   (LEN),A     ;Flags from ONSNAKE
  RET
HSNO:
  POP  AF          ;Drop saved LEN
  OR   $01         ;NZ = safe
  RET
;
;=====================================
;ONWALL: E = pos. Z if that square is
;a wall, else NZ. E with bit 7 set
;means off the map (from LEAVE). The
;row byte is at CURMAP+y. Bit 7 is
;column 0, so a mask of $80 is
;shifted right x times.
;Keeps DE. Destroys A,BC,HL
;=====================================
ONWALL:
  LD   A,E
  BIT  7,A         ;Off the 4x4?
  JR   NZ,OWHIT    ;Yes: treat as wall
  CALL POSXY       ;B = x, C = y
  CALL MIDOPEN     ;Open middle dot?
  JR   Z,OWFREE    ;Yes: treat as free
  PUSH BC
  LD   B,0
  LD   HL,(CURMAP)
  ADD  HL,BC       ;HL = map + y
  POP  BC          ;B = x again
  LD   A,(HL)      ;A = row bits
  LD   C,A
  LD   A,$80       ;x = 0 is bit 7
  INC  B
OW1:
  DEC  B
  JR   Z,OW2
  RRCA             ;Mask one column right
  JR   OW1
OW2:
  AND  C           ;That bit set?
  JR   NZ,OWHIT    ;Yes: a wall
OWFREE:
  OR   $01         ;No: NZ = free
  RET
OWHIT:
  XOR  A           ;Z = wall
  RET
;
;ISFREE: E = pos. NZ if a beetle may
;go there: not on the edge of the
;room (row 0 or 7, column 0 or 7,
;where the doorways are), not a wall,
;not a pressure plate, not a dead-end
;pocket, not on the snake. Z if it is
;taken. Keeps DE.
;Destroys A,BC,HL
ISFREE:
  LD   A,E
  CP   8
  JR   C,ISEDGE    ;Row 0
  CP   56
  JR   NC,ISEDGE   ;Row 7
  AND  $07         ;A = column
  JR   Z,ISEDGE    ;Column 0
  CP   7
  JR   Z,ISEDGE    ;Column 7
  CALL ONWALL
  RET  Z           ;Wall: taken
  CALL ONPLATE
  RET  Z           ;A plate
  CALL ISTRAP
  RET  Z           ;Dead-end pocket
  CALL ONSNAKE
  RET              ;Z if on the snake
ISEDGE:
  XOR  A           ;Z = taken
  RET
;
;=====================================
;DIE: lose a life, flash the snake
;red FLASHES times, then restart if
;any lives remain, else GAMEOVER.
;Destroys A,BC,DE,HL,IX
;=====================================
DIE:
  LD   HL,LIVES
  DEC  (HL)        ;One life less
  LD   A,FLASHES
  LD   (FLASHN),A
DIE1:
  CALL DRAWRED     ;Walls + red snake
  CALL WAITFL
  LD   A,(QUIT)
  OR   A
  RET  NZ          ;AD: leave now
  CALL FBCLEAR     ;Snake off; room stays
  CALL DRAWMAP
  CALL DRAWDEC
  CALL DRAWEXIT
  CALL WAITFL
  LD   A,(QUIT)
  OR   A
  RET  NZ
  LD   HL,FLASHN
  DEC  (HL)
  JR   NZ,DIE1
  LD   A,(LIVES)
  OR   A
  JR   Z,GAMEOVER  ;None left
  CALL RESETBTL    ;Every beetle back
  XOR  A
  LD   (CURROM),A  ;Back to room 0
  CALL SETMAP
  CALL INITGAME    ;Fresh length-3 snake
  RET
;
;GAMEOVER: flash the whole room red,
;show GAME OVER and the scores, wait
;for a key, then back to the title.
;Destroys A,BC,DE,HL,IX
GAMEOVER:
  LD   A,FLASHES
  LD   (FLASHN),A
GO1:
  CALL FILLRED     ;Whole room red
  CALL WAITFL
  LD   A,(QUIT)
  OR   A
  RET  NZ
  CALL FBCLEAR
  CALL WAITFL
  LD   A,(QUIT)
  OR   A
  RET  NZ
  LD   HL,FLASHN
  DEC  (HL)
  JR   NZ,GO1
  CALL FBCLEAR
  CALL RGBOFF
  LD   HL,OVERMSG
  CALL SHOWEND     ;LCD: GAME OVER
  CALL WAITKEY
  JP   NEWGAME     ;Same settings
;
;FILLRED: every square in DEADCOL.
;Destroys A,BC,DE,HL
FILLRED:
  LD   C,0         ;C = y
FR1:
  LD   B,0         ;B = x
FR2:
  PUSH BC
  LD   A,DEADCOL
  CALL PLOT
  POP  BC
  INC  B
  LD   A,B
  CP   8
  JR   NZ,FR2
  INC  C
  LD   A,C
  CP   8
  JR   NZ,FR1
  RET
;
;DRAWRED: walls in blue, then every
;segment in DEADCOL. No beetle and no
;white head. Destroys A,BC,DE,HL
DRAWRED:
  CALL FBCLEAR
  CALL DRAWMAP
  CALL DRAWDEC     ;Motifs stay too
  CALL DRAWEXIT    ;Yellow exit stays
  LD   A,(HEADI)
  LD   L,A
  LD   A,(LEN)
  LD   B,A
DRR1:
  PUSH BC
  PUSH HL
  LD   H,RBUF/256
  LD   A,(HL)      ;This segment's room
  LD   C,A
  LD   A,(CURROM)
  CP   C
  JR   NZ,DRR2     ;Other room: skip
  LD   H,BUF/256
  LD   A,(HL)      ;A = segment pos
  CALL POSXY       ;B = x, C = y
  CALL CLRPIX      ;Over a motif
  LD   A,DEADCOL
  CALL PLOT
DRR2:
  POP  HL
  POP  BC
  LD   A,L
  DEC  A           ;Step back one slot...
  AND  BUFMASK     ;...0 wraps to 63
  LD   L,A
  DJNZ DRR1
  CALL SETSEG      ;Lives already down
  RET
;
;WAITFL: hold the current picture for
;FLTIME frames. READKEYS so AD works.
;SHOWSEG keeps the 7-seg lit.
;Destroys A,BC,DE,HL,IX
WAITFL:
  LD   A,FLTIME
  LD   (FRAMES),A
WF1:
  CALL REFRESH
  CALL SHOWSEG
  CALL READKEYS
  LD   A,(QUIT)
  OR   A
  RET  NZ
  LD   HL,FRAMES
  DEC  (HL)
  JR   NZ,WF1
  RET
;
;=====================================
;NEWBTL: put the beetle on a random
;empty cell (not a wall, not on a
;segment in this room). Try RANDOM
;up to TRIES
;times; if every try is taken, walk
;forward cell by cell from the last
;try. No free cell: no beetle.
;Destroys A,BC,DE,HL,IX
;=====================================
NEWBTL:
  LD   A,(LEN)
  CP   BUFSIZE     ;Snake fills board?
  JR   NC,NBTNONE
  LD   D,TRIES     ;D = tries left
NBT1:
  LD   C,RANDOM
  RST  $10         ;A = random
  AND  BUFMASK     ;0-63 = a cell
  LD   E,A         ;E = cell to test
  CALL ISFREE
  JR   NZ,NBTGOT   ;Empty: use it
  DEC  D
  JR   NZ,NBT1     ;Try again
  LD   D,BUFSIZE   ;Safety net: walk
NBT2:
  LD   A,E
  INC  A           ;Next cell...
  AND  BUFMASK     ;...63 wraps to 0
  LD   E,A
  CALL ISFREE
  JR   NZ,NBTGOT
  DEC  D
  JR   NZ,NBT2
NBTNONE:
  LD   A,NOBTL     ;Nowhere to put it
  LD   (BEETLE),A
  RET
NBTGOT:
  LD   A,E
  LD   (BEETLE),A
  RET
;
;ONSNAKE: E = pos. Z set if any of the
;LEN segments is on E in CURROM, else
;NZ. A body square in another room
;does not count. Keeps DE.
;Destroys A,B,C,HL
ONSNAKE:
  LD   A,(HEADI)
  LD   L,A         ;Start at the head
  LD   A,(LEN)
  LD   B,A
ONS1:
  LD   H,BUF/256
  LD   A,(HL)
  CP   E           ;This position?
  JR   NZ,ONS2
  LD   H,RBUF/256
  LD   A,(HL)      ;And this room?
  LD   C,A
  LD   A,(CURROM)
  CP   C
  RET  Z           ;Same pos and room
ONS2:
  LD   A,L
  DEC  A           ;Back one slot
  AND  BUFMASK
  LD   L,A
  DJNZ ONS1
  OR   $01         ;Not found: NZ
  RET
;
;NEXTPOS: A = pos -> A = next pos in
;direction DIR. If the move would
;leave the 8x8 through a doorway,
;change room and appear on the
;opposite edge. Off the tomb: A=$80
;so ONWALL treats it as a wall.
;Destroys BC,HL
NEXTPOS:
  CALL POSXY       ;B = x, C = y
  LD   A,(DIR)
  CP   UP
  JR   NZ,NXP1
  LD   A,C
  OR   A
  JR   Z,LEAVE     ;Top edge
  DEC  C           ;Up: y-1
  JR   XYPOS
NXP1:
  CP   RIGHT
  JR   NZ,NXP2
  LD   A,B
  CP   7
  JR   Z,LEAVE     ;Right edge
  INC  B           ;Right: x+1
  JR   XYPOS
NXP2:
  CP   DOWN
  JR   NZ,NXP3
  LD   A,C
  CP   7
  JR   Z,LEAVE     ;Bottom edge
  INC  C           ;Down: y+1
  JR   XYPOS
NXP3:
  LD   A,B
  OR   A
  JR   Z,LEAVE     ;Left edge
  DEC  B           ;Left: x-1
  JR   XYPOS
;
;LEAVE: if there is a neighbour,
;move there and put B,C on the
;opposite edge. Off the 4x4: return
;A = $80 (a wall). The new head is
;stored with CURROM in RBUF; earlier
;segments keep their own rooms, so
;the body trails back through the
;doorway.
LEAVE:
  PUSH BC          ;Edge x,y
  CALL NXTROM
  JR   C,LVOFF     ;No room that way
  LD   (CURROM),A
  CALL SETMAP
  POP  BC
  LD   A,(DIR)
  CP   UP
  JR   NZ,LV1
  LD   C,7         ;Appear at the bottom
  JR   XYPOS
LV1:
  CP   RIGHT
  JR   NZ,LV2
  LD   B,0         ;Appear on the left
  JR   XYPOS
LV2:
  CP   DOWN
  JR   NZ,LV3
  LD   C,0         ;Appear at the top
  JR   XYPOS
LV3:
  LD   B,7         ;Appear on the right
  JR   XYPOS
LVOFF:
  POP  BC
  LD   A,(DIR)
  CP   RIGHT       ;Exit is on the east
  JR   NZ,LVWALL
  CALL MIDOPEN     ;Leaving the opening?
  JR   NZ,LVWALL
  LD   A,1
  LD   (WON),A     ;Start the ending
  XOR  A
  RET
LVWALL:
  LD   A,$80       ;Off the tomb
  RET
;
;XYPOS: B = x, C = y -> A = y*8 + x
;AND 7 is only a safety net; in-room
;moves already stay in 0-7.
XYPOS:
  LD   A,C
  AND  $07
  RLCA             ;*2
  RLCA             ;*4
  RLCA             ;*8
  LD   C,A
  LD   A,B
  AND  $07
  OR   C           ;A = y*8 + x
  RET
;
;POSXY: A = pos -> B = x, C = y
;Destroys A
POSXY:
  LD   C,A
  AND  $07
  LD   B,A         ;x = low 3 bits
  LD   A,C
  RRCA             ;/2
  RRCA             ;/4
  RRCA             ;/8
  AND  $07
  LD   C,A         ;y = next 3 bits
  RET
;
;=====================================
;DRAW: clear the FB, plot the walls,
;any purple floor motifs, the yellow
;exit if this is its room, the
;Fountain of Youth's beetles, the
;beetle,
;then every segment whose
;room is CURROM (green, head white
;on top). Segments in other rooms are
;not drawn. Then refresh the 7-seg
;buffer (score and lives).
;Destroys A,BC,DE,HL
;=====================================
DRAW:
  CALL FBCLEAR
  CALL DRAWMAP     ;Blue walls first
  CALL DRAWDEC     ;Purple floor motifs
  CALL DRAWEXIT    ;Yellow exit, if any
  CALL DRAWFIX     ;Room 16 beetles
  LD   A,(BEETLE)
  CP   NOBTL       ;Any beetle?
  JR   Z,DRW0
  CALL POSXY
  CALL CLRPIX      ;Over a motif
  LD   A,BTLCOL
  CALL PLOT        ;Red beetle
DRW0:
  LD   A,(HEADI)
  LD   L,A         ;L = head index
  LD   A,(LEN)
  LD   B,A         ;B = segments to draw
DRW1:
  PUSH BC
  PUSH HL
  LD   H,RBUF/256
  LD   A,(HL)      ;This segment's room
  LD   C,A
  LD   A,(CURROM)
  CP   C
  JR   NZ,DRW2     ;Other room: skip
  LD   H,BUF/256
  LD   A,(HL)      ;A = segment pos
  CALL POSXY       ;B = x, C = y
  CALL CLRPIX      ;Over a motif
  LD   A,BODYCOL
  CALL PLOT
DRW2:
  POP  HL
  POP  BC
  LD   A,L
  DEC  A           ;Step back one slot...
  AND  BUFMASK     ;...0 wraps to 63
  LD   L,A
  DJNZ DRW1
  LD   H,RBUF/256
  LD   A,(HEADI)
  LD   L,A
  LD   A,(HL)
  LD   C,A
  LD   A,(CURROM)
  CP   C           ;Head in this room?
  JR   NZ,DRW3
  LD   H,BUF/256
  LD   A,(HL)      ;A = head pos
  CALL POSXY
  CALL CLRPIX      ;Over a motif
  LD   A,HEADCOL   ;Green OR white
  CALL PLOT        ;= white
DRW3:
  CALL SETSEG      ;Score and lives
  RET
;
;DRAWMAP: plot every CURMAP bit that
;is 1 as a WALLCOL pixel, bit 7 = left.
;Destroys A,BC,DE,HL
DRAWMAP:
  LD   HL,(CURMAP)
  LD   C,0         ;C = y
DMAP1:
  LD   E,(HL)      ;E = row bits
  LD   B,0         ;B = x
DMAP2:
  RL   E           ;Next bit -> CY
  JR   NC,DMAP3    ;0 = empty
  CALL ONEXIT      ;Closed exit dots
  JR   Z,DMAP3     ;Yellow, not blue
  PUSH BC
  PUSH HL
  PUSH DE
  LD   A,WALLCOL
  CALL PLOT        ;B = x, C = y
  POP  DE
  POP  HL
  POP  BC
DMAP3:
  INC  B
  LD   A,B
  CP   8
  JR   NZ,DMAP2    ;Next column
  INC  HL
  INC  C
  LD   A,C
  CP   8
  JR   NZ,DMAP1    ;Next row
  RET
;
;DRAWDEC: plot FLOORCOL (purple)
;on every DECOS bit that is not
;also a wall. A DECOS bit on a wall
;repaints that wall YWALCOL. Snake
;and beetle are drawn later and
;replace the pixel.
;Destroys A,BC,DE,HL
;=====================================
DRAWDEC:
  LD   HL,(CURDEC)
  LD   C,0         ;C = y
DDEC1:
  PUSH HL
  LD   HL,(CURMAP)
  LD   B,0
  LD   A,C         ;Row offset
  ADD  A,L
  LD   L,A
  JR   NC,DDEC1A
  INC  H
DDEC1A:
  LD   D,(HL)      ;D = wall bits
  POP  HL
  LD   E,(HL)      ;E = deco bits
  LD   B,0         ;B = x
DDEC2:
  RL   D           ;Wall bit -> CY
  JR   C,DDECSK    ;Wall: skip
  RL   E           ;Deco bit -> CY
  JR   NC,DDEC3    ;No motif
  PUSH BC
  PUSH HL
  PUSH DE
  LD   A,FLOORCOL
  CALL PLOT        ;Purple floor
  POP  DE
  POP  HL
  POP  BC
  JR   DDEC3
DDECSK:
  RL   E           ;Deco bit -> CY
  JR   NC,DDEC3    ;Plain blue wall
  PUSH BC
  PUSH HL
  PUSH DE
  CALL CLRPIX      ;Blue off
  LD   A,YWALCOL
  CALL PLOT        ;Yellow wall
  POP  DE
  POP  HL
  POP  BC
DDEC3:
  INC  B
  LD   A,B
  CP   8
  JR   NZ,DDEC2
  INC  HL
  INC  C
  LD   A,C
  CP   8
  JR   NZ,DDEC1
  RET
;
;ONEXIT: B = x, C = y. Z if this
;square is one of the three closed
;exit dots in CURROM, else NZ.
;Keeps BC,DE,HL. Destroys A
;=====================================
ONEXIT:
  LD   A,(CURROM)
  CP   EXITRM
  RET  NZ          ;Not the exit room
  LD   A,B
  CP   EXITX
  RET  NZ          ;Wrong column
  LD   A,C
  CP   EXITY
  RET  C           ;Above the 3
  CP   EXITY+3
  JR   C,OEHIT     ;y = 2, 3 or 4
  OR   $01         ;Below the 3
  RET
OEHIT:
  XOR  A           ;Z = an exit dot
  RET
;
;DRAWEXIT: the 3 closed yellow dots
;in the exit room, on the east
;outer wall. Other rooms: nothing.
;Destroys A,BC,DE,HL
;=====================================
DRAWEXIT:
  LD   A,(CURROM)
  CP   EXITRM
  RET  NZ
  LD   C,EXITY
  LD   B,EXITX
DX1:
  LD   HL,OPENAT
  LD   A,(LEN)
  CP   (HL)
  JR   C,DXDRAW    ;Still closed
  LD   A,C
  CP   EXITY+1     ;Middle dot?
  JR   Z,DXSKIP    ;Open: leave it dark
DXDRAW:
  PUSH BC
  LD   A,EXITCOL
  CALL PLOT
  POP  BC
DXSKIP:
  INC  C
  LD   A,C
  CP   EXITY+3
  JR   NZ,DX1
  RET
;
;FBCLEAR: all 24 bytes = 0 (all off)
;Destroys A,B,HL
FBCLEAR:
  LD   HL,FB
  LD   B,24
  XOR  A
FBC1:
  LD   (HL),A
  INC  HL
  DJNZ FBC1
  RET
;
;PLOT: B = x, C = y, A = colour
;Colour bit 0 red, 1 green, 2 blue.
;Lights the pixel (never clears it).
;Keeps BC. Destroys A,DE,HL
PLOT:
  PUSH BC
  LD   E,A         ;E = colour bits
  LD   A,$80       ;x = 0 is bit 7
  INC  B
PLT1:
  DEC  B
  JR   Z,PLT2
  RRCA             ;Mask one column right
  JR   PLT1
PLT2:
  LD   D,A         ;D = column mask
  LD   A,C
  AND  $07
  LD   L,A
  LD   H,FB/256    ;HL = red byte, row y
  LD   B,3         ;Red, green, blue
PLT3:
  RR   E           ;Next colour bit
  JR   NC,PLT4
  LD   A,(HL)
  OR   D           ;Light it in this plane
  LD   (HL),A
PLT4:
  LD   A,L
  ADD  A,8         ;Next plane
  LD   L,A
  DJNZ PLT3
  POP  BC
  RET
;
;CLRPIX: B = x, C = y. Clears the
;pixel in all three planes so a
;later PLOT can set a clean colour.
;Keeps BC. Destroys A,DE,HL
;=====================================
CLRPIX:
  PUSH BC
  LD   A,$80
  INC  B
CL1:
  DEC  B
  JR   Z,CL2
  RRCA
  JR   CL1
CL2:
  CPL              ;Mask to clear
  LD   D,A
  LD   A,C
  AND  $07
  LD   L,A
  LD   H,FB/256
  LD   B,3
CL3:
  LD   A,(HL)
  AND  D
  LD   (HL),A
  LD   A,L
  ADD  A,8
  LD   L,A
  DJNZ CL3
  POP  BC
  RET
;
;=====================================
;ADDSCORE: DE = points to add. Adds 1
;that many times to the 2-byte packed
;BCD score, using DAA, and caps at
;9999. Later stages can CALL this
;with DE = ROOMSCR or EXITSCR+...
;Destroys A,DE,HL
;=====================================
ADDSCORE:
  LD   A,D
  OR   E
  RET  Z           ;Nothing to add
AS1:
  LD   HL,SCORE+1  ;Tens and ones
  LD   A,(HL)
  ADD  A,1
  DAA              ;Keep it packed BCD
  LD   (HL),A
  DEC  HL          ;Thousands, hundreds
  LD   A,(HL)
  ADC  A,0         ;Carry from the tens
  DAA
  LD   (HL),A
  JR   C,ASCAP     ;Past 9999
  DEC  DE
  LD   A,D
  OR   E
  JR   NZ,AS1
  RET
ASCAP:
  LD   A,$99
  LD   (SCORE),A   ;Hold at 9999
  LD   (SCORE+1),A
  RET
;
;=====================================
;SETSEG: 7-seg buffer. The TEC-1G has
;a group of four digits, a gap, then
;a pair (often green). Left four =
;SCORE in decimal, leading zeros
;blank, except a 0 if the score is 0.
;Right pair: blank and LIVES.
;Destroys A,BC,DE,HL,IX
;=====================================
SETSEG:
  LD   HL,SCORE
  LD   DE,SEGBUF
  LD   C,0         ;0 = still leading
  LD   B,2         ;Two BCD bytes
SS1:
  LD   A,(HL)
  RRCA             ;High nibble first
  RRCA
  RRCA
  RRCA
  CALL SSONE
  LD   A,(HL)
  CALL SSONE
  INC  HL
  DJNZ SS1
  LD   A,C
  OR   A
  JR   NZ,SSLIV    ;Any digit shown?
  LD   A,'0'       ;Score is 0
  LD   C,A2SEG
  RST  $10
  LD   (SEGBUF+3),A
SSLIV:
  XOR  A
                   ;Blank lives tens
  LD   (SEGBUF+4),A
  LD   A,(LIVES)
  ADD  A,'0'
  LD   C,A2SEG
  RST  $10
                   ;Lives, right pair
  LD   (SEGBUF+5),A
  RET
;
;SSONE: low nibble of A -> (DE) as a
;segment pattern. Leading zeros stay
;blank until a non-zero digit. Then
;C is set, so later zeros are shown.
;Advances DE. Destroys A.
SSONE:
  AND  $0F
  JR   NZ,SSDIG    ;Non-zero: show it
  LD   A,C
  OR   A
  JR   NZ,SSZ      ;Already started
  LD   (DE),A      ;A is 0: blank
  INC  DE
  RET
SSZ:
  XOR  A           ;Show a zero
SSDIG:
  ADD  A,'0'
  PUSH BC
  PUSH HL
  LD   C,A2SEG
  RST  $10
  POP  HL
  POP  BC
  LD   (DE),A
  INC  DE
  LD   C,1         ;A digit has appeared
  RET
;
;SHOWSEG: one multiplex of the 7-seg.
;API 10 scanSegments. Destroys A,B,DE
SHOWSEG:
  LD   DE,SEGBUF
  LD   C,SCANSEG
  RST  $10
  RET
;
;=====================================
;DOTICK: short faint step tick.
;Silent if TICK is 0.
;DOEAT: slightly longer eat sound.
;DOCLICK: a low click (a plate).
;DORSND: a long low rumble (the
;secret door).
;All toggle SPKBIT on port DIGITP
;with a short delay loop, then leave
;the speaker and digits off.
;Destroys A,BC,E
;=====================================
DOTICK:
  LD   A,TICK
  OR   A
  RET  Z           ;TICK 0 = no tick
  LD   C,A         ;C = half-cycles
  LD   E,TICKDLY
  JR   SOUND
DOCLICK:
  LD   C,CLKLEN
  LD   E,CLKDLY
  JR   SOUND
DORSND:
  LD   C,DORLEN
  LD   E,DORDLY
  JR   SOUND
DOEAT:
  LD   C,EATLEN
  LD   E,EATDLY
SOUND:
  XOR  A
SND1:
  XOR  SPKBIT
  OUT  (DIGITP),A  ;Toggle the speaker
  LD   B,E
  DJNZ $           ;Pitch delay
  DEC  C
  JR   NZ,SND1
  XOR  A
  OUT  (DIGITP),A  ;Speaker off
  RET
;
;=====================================
;REFRESH: show the FB once, ~2 ms
;Blank the row before changing columns
;so nothing ghosts. Destroys A
;=====================================
REFRESH:
  PUSH BC
  PUSH HL
  LD   HL,FB
  LD   C,$01       ;Row bit, top first
REF1:
  XOR  A
  OUT  (RGBROW),A  ;All rows off
  LD   A,(HL)
  OUT  (RGBRED),A
  PUSH HL
  LD   A,L
  ADD  A,8
  LD   L,A
  LD   A,(HL)
  OUT  (RGBGRN),A
  LD   A,L
  ADD  A,8
  LD   L,A
  LD   A,(HL)
  OUT  (RGBBLU),A
  POP  HL
  LD   A,C
  OUT  (RGBROW),A  ;Light the row
  LD   B,ONTIME
  DJNZ $           ;Keep it lit
  INC  HL
  RLC  C           ;CY after row 8
  JR   NC,REF1
  XOR  A
  OUT  (RGBROW),A  ;Last row off
  POP  HL
  POP  BC
  RET
;
;RGBOFF: blank every latch. Destroys A
RGBOFF:
  XOR  A
  OUT  (RGBROW),A
  OUT  (RGBRED),A
  OUT  (RGBGRN),A
  OUT  (RGBBLU),A
  RET
;

;=====================================
;SETMAP: copy this room's 8 bytes at
;ROOMS + CURROM*8 to MAPRAM and its 8
;at DECOS + CURROM*8 to DECRAM, and
;point CURMAP and CURDEC at the
;copies. Then SECRET changes the
;copies for the plates and the door.
;Call it again after a plate.
;Destroys A,BC,DE,HL
;=====================================
SETMAP:
  LD   A,(CURROM)
  ADD  A,A
  ADD  A,A
  ADD  A,A         ;*8
  LD   E,A
  LD   D,0
  PUSH DE
  LD   HL,ROOMS
  ADD  HL,DE
  LD   DE,MAPRAM
  LD   BC,8
  LDIR             ;Walls to RAM
  POP  DE
  LD   HL,DECOS
  ADD  HL,DE
  LD   DE,DECRAM
  LD   BC,8
  LDIR             ;Decorations to RAM
  LD   HL,MAPRAM
  LD   (CURMAP),HL
  LD   HL,DECRAM
  LD   (CURDEC),HL
  CALL SECRET      ;Plates and the door
  RET
;
;SECRET: in the RAM copies, clear the
;purple bit of every pressed plate in
;this room (it is drawn as plain
;floor from now on), and once all 4
;are pressed unlock the secret door
;in DOORRM: clear its wall bit and
;set its purple bit, so it is drawn
;as purple floor you can go over.
;Destroys A,BC,DE,HL
SECRET:
  LD   HL,PLATES
  LD   DE,PLATEUP
  LD   B,NPLATES
SEC1:
  LD   A,(DE)
  OR   A
  JR   Z,SEC2      ;Not pressed
  LD   A,(CURROM)
  CP   (HL)
  JR   NZ,SEC2     ;Another room
  INC  HL
  LD   A,(HL)      ;A = plate pos
  DEC  HL
  PUSH HL
  LD   HL,DECRAM
  CALL CLRBIT      ;Purple off
  POP  HL
SEC2:
  INC  HL
  INC  HL          ;Next room, pos
  INC  DE
  DJNZ SEC1
  LD   A,(PLATEN)
  CP   NPLATES
  RET  NZ          ;Door still shut
  LD   A,(CURROM)
  CP   DOORRM
  RET  NZ
  LD   A,DOORPOS
  LD   HL,MAPRAM
  CALL CLRBIT      ;Not a wall now
  LD   A,DOORPOS
  LD   HL,DECRAM
  CALL BITMSK
  OR   (HL)        ;Purple: unlocked
  LD   (HL),A
  RET
;
;CLRBIT: A = pos, HL = an 8-byte map.
;Clear that square's bit.
;Keeps BC,DE. Destroys A,HL
CLRBIT:
  CALL BITMSK
  CPL              ;All but that bit
  AND  (HL)
  LD   (HL),A
  RET
;
;BITMSK: A = pos, HL = an 8-byte map.
;HL = its row byte, A = the mask of
;that square's bit.
;Keeps BC,DE
BITMSK:
  PUSH BC
  CALL POSXY       ;B = x, C = y
  LD   A,C
  CALL TABIDX      ;HL = map + y
  LD   A,$80       ;x = 0 is bit 7
  INC  B
BM1:
  DEC  B
  JR   Z,BM2
  RRCA
  JR   BM1
BM2:
  POP  BC
  RET
;
;ONPLATE: E = pos. Z if a pressure
;plate (pressed or not) in CURROM is
;at E, with B = NPLATES - its number.
;Else NZ. Keeps DE. Destroys A,B,HL
ONPLATE:
  LD   HL,PLATES
  LD   B,NPLATES
OP1:
  LD   A,(CURROM)
  CP   (HL)
  INC  HL          ;Flags unchanged
  JR   NZ,OP2      ;Another room
  LD   A,(HL)
  CP   E
  RET  Z           ;Z = a plate
OP2:
  INC  HL
  DJNZ OP1
  OR   $01         ;NZ = no plate
  RET
;
;PRESS: E = the new head. On a plate
;not yet pressed: press it for good
;and play the plate scene. The fourth
;plate also plays the door scene and
;unlocks the secret door. Then SETMAP
;again (the plate is drawn as floor,
;the door purple), redraw the room,
;wait paused for a direction, and say
;what happened on LCD line 2. AD in a
;scene or the pause sets QUIT. Keeps
;DE. Destroys A,BC,HL,IX
PRESS:
  CALL ONPLATE
  RET  NZ          ;Not a plate
  LD   A,NPLATES
  SUB  B           ;A = plate 0-3
  LD   HL,PLATEUP
  CALL TABIDX
  LD   A,(HL)
  OR   A
  RET  NZ          ;Pressed already
  INC  (HL)        ;Pressed for good
  PUSH DE
  LD   HL,PLATEN
  INC  (HL)
  LD   HL,PLATANI
  CALL SCENE       ;Plate sinks, click
  LD   A,(QUIT)
  OR   A
  JR   NZ,PREND    ;AD: to the title
  LD   HL,CLICKLN
  LD   A,(PLATEN)
  CP   NPLATES
  JR   NZ,PRSHOW   ;Not the fourth yet
  LD   HL,DOORSCN
  CALL SCENE       ;Door turns purple
  LD   A,(QUIT)
  OR   A
  JR   NZ,PREND
  LD   HL,DOORLN
PRSHOW:
  PUSH HL
  CALL SETMAP      ;Plate off, door on
  CALL DRAW        ;The room again
  CALL PAUSE       ;Wait for a direction
  POP  HL
  LD   C,LCDROW2
  CALL LINE        ;What happened
PREND:
  POP  DE
  RET
;
;SCENE: play the pictures at HL. Each
;is: hold (frames, 0 = the end), a
;sound (0 none, 1 click, 2 rumble),
;then 24 FB bytes: 8 red rows, 8
;green, 8 blue.
;Stops early if AD sets QUIT.
;Destroys A,BC,DE,HL,IX
SCENE:
  LD   A,(HL)
  OR   A
  RET  Z           ;End of the scene
  LD   B,A         ;B = hold
  INC  HL
  LD   C,(HL)      ;C = sound
  INC  HL
  PUSH BC
  LD   DE,FB
  LD   BC,24
  LDIR             ;Picture to the FB
  POP  BC
  PUSH HL          ;HL = next picture
  LD   A,C
  PUSH BC
  CALL SCNSND      ;Click or rumble
  POP  BC
SCN1:
  PUSH BC
  CALL ANFRM       ;Show it, keys, 7-seg
  POP  BC
  LD   A,(QUIT)
  OR   A
  JR   NZ,SCN2     ;AD: leave now
  DJNZ SCN1
  POP  HL
  JR   SCENE
SCN2:
  POP  HL
  RET
;
;SCNSND: A = 1 click, 2 rumble, else
;nothing. Destroys A,BC,E
SCNSND:
  DEC  A
  JP   Z,DOCLICK
  DEC  A
  JP   Z,DORSND
  RET
;
;NXTROM: A = neighbouring room in
;DIR. CY set if that step would
;leave the 4x4 (no wrap). The secret
;door joins DOORRM (down) and SECRM
;(up); SECRM has no other way out.
;You can only stand on the door
;square once it is unlocked.
;Destroys A,BC,L
NXTROM:
  LD   A,(DIR)
NXTDIR:
  LD   L,A         ;L = direction
  LD   A,(CURROM)
  CP   SECRM
  JR   Z,NRSEC     ;Fountain of Youth
  CP   DOORRM
  JR   NZ,NR0
  LD   A,L
  CP   DOWN
  JR   NZ,NR0
  LD   A,SECRM     ;Down the secret door
  OR   A           ;NC = a room
  RET
NRSEC:
  LD   A,L
  CP   UP
  JR   NZ,NROFF    ;Only back up
  LD   A,DOORRM
  OR   A
  RET
NR0:
  LD   A,L
  CP   UP
  JR   NZ,NR1
  LD   A,(CURROM)
  CP   4
  RET  C           ;Top row: off
  SUB  4
  OR   A           ;NC = a room
  RET
NR1:
  CP   RIGHT
  JR   NZ,NR2
  LD   A,(CURROM)
  LD   B,A
  AND  $03
  CP   3
  SCF
  RET  Z           ;Right col: off
  LD   A,B
  INC  A
  OR   A           ;NC
  RET
NR2:
  CP   DOWN
  JR   NZ,NR3
  LD   A,(CURROM)
  CP   12
  JR   NC,NROFF    ;Bottom row: off
  ADD  A,4
  OR   A
  RET
NR3:
  LD   A,(CURROM)
  LD   B,A
  AND  $03
  JR   Z,NROFF     ;Left col: off
  LD   A,B
  DEC  A
  OR   A
  RET
NROFF:
  SCF
  RET
;
;TABIDX: HL = table, A = index.
;HL += A. Destroys A
TABIDX:
  ADD  A,L
  LD   L,A
  RET  NC
  INC  H
  RET
;
;ENTER: just changed room. Save the
;old room's beetle (not in room 16,
;where they are fixed), set this
;room's beetle, blank LCD line 2,
;and if it is a first visit add
;ROOMSCR. Destroys A,BC,DE,HL,IX
ENTER:
  LD   A,(OLDROM)
  CP   SECRM
  JR   Z,ENT1      ;Nothing to save
  LD   A,(BEETLE)
  LD   C,A
  LD   A,(OLDROM)
  LD   HL,BTLPOS
  CALL TABIDX
  LD   (HL),C
ENT1:
  CALL SETBTL
  CALL SHOWNAME    ;LCD, every entry
  LD   HL,BLANKLN
  LD   C,LCDROW2
  CALL LINE        ;No old message
  LD   A,(CURROM)
  LD   HL,VISIT
  CALL TABIDX
  LD   A,(HL)
  OR   A
  RET  NZ          ;Been here already
  LD   (HL),1
  LD   DE,ROOMSCR
  CALL AWARD       ;x the speed
  RET
;
;EATBTL: eat the current room's beetle.
;Count it, clear the beetle, and if a
;respawn remains, set BTLNEXT to
;BTLEATN+BTLWAIT. In room 16 mark
;beetle FIXI eaten instead.
;Destroys A,C,HL
EATBTL:
  LD   HL,BTLEATN
  INC  (HL)
  LD   A,(CURROM)
  CP   SECRM
  JR   Z,EAT16
  LD   A,(CURROM)
  LD   HL,BTLPOS
  CALL TABIDX
  LD   A,NOBTL
  LD   (HL),A
  LD   (BEETLE),A
  LD   A,(CURROM)
  LD   HL,BTLDONE
  CALL TABIDX
  INC  (HL)
  LD   A,(HL)
  CP   2
  JR   NC,EA2      ;Both eaten
  LD   A,(BTLEATN)
  ADD  A,BTLWAIT
  LD   C,A
  LD   A,(CURROM)
  LD   HL,BTLNEXT
  CALL TABIDX
  LD   (HL),C
  RET
EA2:
  LD   A,(CURROM)
  LD   HL,BTLNEXT
  CALL TABIDX
  LD   A,NOBTL
  LD   (HL),A
  RET
EAT16:
  LD   A,(FIXI)
  LD   HL,FIXEAT
  CALL TABIDX
  LD   (HL),1      ;Eaten
  LD   A,NOBTL
  LD   (BEETLE),A
  RET
;
;SETBTL: beetle for the current room.
;Restore a saved one (or relocate it
;if the restart snake sits on it),
;or spawn the first / the one respawn
;once BTLEATN has reached BTLNEXT.
;Room 16 has none: its beetles are
;fixed (FIXBTL, DRAWFIX).
;Destroys A,BC,DE,HL,IX
SETBTL:
  LD   A,(CURROM)
  CP   SECRM
  JR   Z,BTLNONE   ;Fixed ones only
  LD   HL,BTLPOS
  CALL TABIDX
  LD   A,(HL)
  CP   NOBTL
  JR   Z,BTLTRY
  LD   E,A
  CALL ISFREE
  JR   NZ,BTLUSE   ;Still empty
  CALL NEWBTL      ;On the snake: move it
  JR   BTLSAVE
BTLUSE:
  LD   A,E
  LD   (BEETLE),A
  RET
BTLTRY:
  LD   A,(CURROM)
  LD   HL,BTLDONE
  CALL TABIDX
  LD   A,(HL)
  CP   2
  JR   NC,BTLNONE  ;No more in this room
  OR   A
  JR   Z,BTLSPWN   ;First beetle
  LD   A,(CURROM)
  LD   HL,BTLNEXT
  CALL TABIDX
  LD   A,(BTLEATN)
  CP   (HL)
  JR   C,BTLNONE   ;Not yet
BTLSPWN:
  CALL NEWBTL
BTLSAVE:
  LD   A,(CURROM)
  LD   HL,BTLPOS
  CALL TABIDX
  LD   A,(BEETLE)
  LD   (HL),A
  RET
BTLNONE:
  LD   A,NOBTL
  LD   (BEETLE),A
  RET
;
;=====================================
;FIXBTL: E = the new head. In the
;Fountain of Youth, if E is one of
;its beetles or the golden scarab,
;not yet eaten, make it BEETLE (so
;UPDATE eats it) and keep its number
;in FIXI. Other rooms: nothing.
;Keeps DE. Destroys A,C,HL
;=====================================
FIXBTL:
  LD   A,(CURROM)
  CP   SECRM
  RET  NZ
  LD   A,NOBTL
  LD   (BEETLE),A
  LD   C,0         ;C = number
FX1:
  LD   A,C
  LD   HL,FIXEAT
  CALL TABIDX
  LD   A,(HL)
  OR   A
  JR   NZ,FX2      ;Eaten already
  LD   A,C
  ADD  A,A         ;2 bytes each
  LD   HL,FIXTAB
  CALL TABIDX
  LD   A,(HL)      ;A = its pos
  CP   E
  JR   NZ,FX2
  LD   (BEETLE),A  ;Eat this one
  LD   A,C
  LD   (FIXI),A
  RET
FX2:
  INC  C
  LD   A,C
  CP   NFIX
  JR   NZ,FX1
  RET
;
;DRAWFIX: in the Fountain of Youth,
;plot each beetle not yet eaten in
;its colour from FIXTAB (red, and
;the golden scarab yellow). Other
;rooms: nothing.
;Destroys A,BC,DE,HL
DRAWFIX:
  LD   A,(CURROM)
  CP   SECRM
  RET  NZ
  LD   C,0         ;C = number
DF1:
  PUSH BC
  LD   A,C
  LD   HL,FIXEAT
  CALL TABIDX
  LD   A,(HL)
  OR   A
  JR   NZ,DF2      ;Eaten
  LD   A,C
  ADD  A,A
  LD   HL,FIXTAB
  CALL TABIDX
  LD   A,(HL)      ;A = pos
  INC  HL
  LD   D,(HL)      ;D = colour
  CALL POSXY       ;B = x, C = y
  LD   A,D
  CALL PLOT
DF2:
  POP  BC
  INC  C
  LD   A,C
  CP   NFIX
  JR   NZ,DF1
  RET
;
;GOLDEN: the head is on the golden
;scarab. One more life (never more
;than MAXLV), no growth and no
;points. It stays eaten for the rest
;of the game, even after a death.
;Destroys A,BC,DE,HL,IX
GOLDEN:
  LD   A,1
  LD   (FIXEAT+GOLDI),A
  LD   A,NOBTL
  LD   (BEETLE),A
  LD   HL,LIVES
  LD   A,(HL)
  CP   MAXLV
  JR   NC,GOLD1    ;Already the most
  INC  (HL)        ;One more life
GOLD1:
  CALL DORSND      ;A long rumble
  LD   HL,LIFELN
  LD   C,LCDROW2
  CALL LINE        ;" An extra life!"
  RET
;
;=====================================
;SHOWNAME: write the current room's
;name on LCD line 1, padded to 20
;characters. One short write on
;each room change, not every frame.
;API 15 then 13. Destroys A,BC,DE,HL
;=====================================
SHOWNAME:
  LD   B,LCDROW1
  LD   C,CMD2LCD
  RST  $10         ;Cursor to row 1
  LD   A,(CURROM)
  LD   HL,NAMES
  CALL TXTIDX      ;HL = name A
  LD   C,STR2LCD
  RST  $10
  RET
;
;ISTRAP: E = pos. Z if this free
;square is a 1-wide dead end (3 or
;more wall or map-edge neighbours),
;else NZ. A doorway that leads into
;the next room counts as open, not
;as an edge. Keeps DE.
;Destroys A,BC,HL
;=====================================
ISTRAP:
  PUSH DE
  LD   C,0         ;C = wall count
  XOR  A           ;A = dir 0
IT1:
  PUSH DE
  PUSH BC
  PUSH AF
  CALL NBRWALL     ;Z = wall or edge
  JR   NZ,IT2
  POP  AF
  POP  BC
  INC  C
  JR   IT3
IT2:
  POP  AF
  POP  BC
IT3:
  POP  DE
  INC  A
  CP   4
  JR   NZ,IT1
  POP  DE
  LD   A,C
  CP   3
  JR   NC,ITHIT    ;3 or 4 sides shut
  OR   $01         ;NZ = not a trap
  RET
ITHIT:
  XOR  A           ;Z = a trap
  RET
;
;NBRWALL: A = dir, E = pos. Z if
;that neighbour is a wall or the
;edge of the tomb, NZ if it is open
;(including a doorway into the next
;room). Destroys A,B,C,HL
;=====================================
NBRWALL:
  PUSH DE
  LD   D,A         ;D = dir
  LD   A,E
  CALL POSXY       ;B = x, C = y
  LD   A,D
  CP   UP
  JR   NZ,NB1
  LD   A,C
  OR   A
  JR   Z,NBEDGE    ;Leave north
  DEC  C
  JR   NBIN
NB1:
  CP   RIGHT
  JR   NZ,NB2
  LD   A,B
  CP   7
  JR   Z,NBEDGE    ;Leave east
  INC  B
  JR   NBIN
NB2:
  CP   DOWN
  JR   NZ,NB3
  LD   A,C
  CP   7
  JR   Z,NBEDGE    ;Leave south
  INC  C
  JR   NBIN
NB3:
  LD   A,B
  OR   A
  JR   Z,NBEDGE    ;Leave west
  DEC  B
NBIN:
  CALL XYPOS       ;A = neighbour pos
  LD   E,A
  CALL ONWALL
  POP  DE
  RET              ;Z/NZ from ONWALL
NBEDGE:
  LD   A,D
  CALL NXTDIR
  JR   C,NBOFF     ;Off the 4x4
  LD   E,A         ;E = neighbour room
  LD   A,D
  CP   UP
  JR   NZ,NBE1
  LD   C,7         ;Opposite edge
  JR   NBELOK
NBE1:
  CP   RIGHT
  JR   NZ,NBE2
  LD   B,0
  JR   NBELOK
NBE2:
  CP   DOWN
  JR   NZ,NBE3
  LD   C,0
  JR   NBELOK
NBE3:
  LD   B,7
NBELOK:
  LD   A,E
  ADD  A,A
  ADD  A,A
  ADD  A,A         ;Room*8
  LD   L,A
  LD   H,0
  LD   DE,ROOMS
  ADD  HL,DE
  LD   A,C
  ADD  A,L
  LD   L,A         ;+ y
  JR   NC,NBEBIT
  INC  H
NBEBIT:
  LD   A,(HL)      ;Row bits
  LD   C,A
  LD   A,$80
  INC  B
NBEB1:
  DEC  B
  JR   Z,NBEB2
  RRCA
  JR   NBEB1
NBEB2:
  AND  C
  POP  DE
  JR   NZ,NBEW     ;A wall
  OR   $01         ;Open doorway
  RET
NBEW:
  XOR  A
  RET
NBOFF:
  POP  DE
  XOR  A           ;Z = tomb edge
  RET
;
;MIDOPEN: B = x, C = y. Z if this
;is the open middle exit cell
;(length at least OPENAT, and this
;is the middle dot in the exit
;room). Keeps BC,DE,HL. Destroys A
;=====================================
MIDOPEN:
  LD   A,(CURROM)
  CP   EXITRM
  JR   NZ,MNO
  LD   A,B
  CP   EXITX
  JR   NZ,MNO
  LD   A,C
  CP   EXITY+1
  JR   NZ,MNO
  PUSH HL
  LD   HL,OPENAT
  LD   A,(LEN)
  CP   (HL)
  POP  HL
  JR   C,MNO       ;Still too short
  XOR  A           ;Z = open
  RET
MNO:
  OR   $01         ;NZ = not that cell
  RET
;
;=====================================
;WINGAME: left through the opening.
;Add the exit bonus, write the LCD
;and the 7-seg, play the ending,
;then wait for a key. Any new key,
;or AD during the ending, goes back
;to the title.
;=====================================
WINGAME:
  LD   DE,EXITSCR
  CALL AWARD       ;x the speed
  LD   A,(LIVES)
  OR   A
  JR   Z,WIN1
  LD   B,A
WINLP:
  PUSH BC
  LD   DE,LIFESCR
  CALL AWARD
  POP  BC
  DJNZ WINLP
WIN1:
  CALL SETSEG
  LD   HL,WINMSG
  CALL SHOWEND
  CALL ENDRUN      ;Snake leaves
  LD   A,(QUIT)
  OR   A
  JP   NZ,NEWGAME  ;AD: to the title
  CALL ENDFAD
  LD   A,(QUIT)
  OR   A
  JP   NZ,NEWGAME
  CALL FBCLEAR
  CALL RGBOFF      ;Matrix ends dark
  CALL WAITKEY
  JP   NEWGAME     ;Same settings
;
;SHOWEND: HL = the 2-line message
;(WINMSG or OVERMSG) for LCD lines 1
;and 2. Line 3 is the score, line 4
;the most this speed could score.
;Destroys A,BC,DE,HL,IX
;=====================================
SHOWEND:
  PUSH HL
  LD   B,LCDCLS
  LD   C,CMD2LCD
  RST  $10
  POP  HL
  LD   C,LCDROW1
  CALL LINE
  LD   C,LCDROW2
  CALL LINE
  LD   HL,SCRLN
  LD   DE,SCORE
  CALL FILSCR      ;" Your SCORE: 1234"
  LD   HL,SCRTXT
  LD   C,LCDROW3
  CALL LINE
  LD   A,(SPDSEL)
  ADD  A,A         ;2 bytes each
  LD   HL,MAXTAB
  CALL TABIDX
  EX   DE,HL       ;DE = this speed's max
  LD   HL,MAXLN
  CALL FILSCR
  LD   HL,SCRTXT
  LD   C,LCDROW4
  CALL LINE
  RET
;
WINMSG:
  DB   "    YOU ESCAPED!    ",0
  DB   " Have your revenge! ",0
OVERMSG:
  DB   "     GAME OVER      ",0
  DB   "     Try Again?     ",0
;The number goes in columns 14-17.
SCRLN:
  DB   " Your SCORE:        ",0
MAXLN:
  DB   "  MAX SCORE:        ",0
;MAXTAB: the best score possible at
;each speed, packed BCD like SCORE:
;every beetle (44: 32 in the tomb
;and 12 in the Fountain of Youth, at
;lengths 4 to 47), every first room
;entry (16, with room 16: the
;Stairway pays nothing), then the
;exit with 6 lives (the golden
;scarab, and no deaths), each award
;rounded down by AWARD. Elderly
;6366, Midlife 7933, Youthful 9538,
;all below 9999. The length setting
;does not change them. Dying cannot
;beat them either: a beetle pays
;only past PEAKLEN (UPDATE).
MAXTAB:
  DB   $63,$66     ;Elderly
  DB   $79,$33     ;Midlife
  DB   $95,$38     ;Youthful
;
;FILSCR: HL = a 20-char line with
;room for a number in columns 14-17,
;DE = a 2-byte packed BCD number
;(SCORE or a MAXTAB entry). Builds
;the line at SCRTXT. Leading zeros
;are blank, but 0 shows as 0.
;Destroys A,BC,DE,HL
;=====================================
FILSCR:
  PUSH DE
  LD   DE,SCRTXT
  LD   BC,21
  LDIR             ;Copy the line
  POP  HL          ;HL = the number
  LD   DE,SCRTXT+13
  LD   C,0         ;0 = still leading
  LD   B,2
FS2:
  LD   A,(HL)
  RRCA
  RRCA
  RRCA
  RRCA
  CALL FSONE
  LD   A,(HL)
  CALL FSONE
  INC  HL
  DJNZ FS2
  LD   A,C
  OR   A
  RET  NZ          ;Any digit?
  LD   A,'0'
  LD   (SCRTXT+16),A
  RET
;
FSONE:
  AND  $0F
  JR   NZ,FSDIG
  LD   A,C
  OR   A
  JR   NZ,FSZ
  LD   A,' '       ;Leading blank
  LD   (DE),A
  INC  DE
  RET
FSZ:
  XOR  A
FSDIG:
  ADD  A,'0'
  LD   (DE),A
  INC  DE
  LD   C,1
  RET
;
;WAITKEY: 7-seg stays lit, matrix
;is already dark. Any new key, AD
;too, returns (to the title).
;Destroys A,BC,DE
;=====================================
WAITKEY:
  CALL SHOWSEG
  LD   C,SCANKEYS
  RST  $10
  JR   NC,WAITKEY  ;No new key
  RET              ;Back to the title
;
;ANFRM: one ending frame.
;Destroys A,BC,DE,HL
;=====================================
ANFRM:
  CALL REFRESH
  CALL SHOWSEG
  CALL READKEYS
  RET
;
;ANWAIT: B = number of ANFRM.
;Stops early if QUIT is set.
;Destroys A,BC,DE,HL
;=====================================
ANWAIT:
  PUSH BC
  CALL ANFRM
  POP  BC
  LD   A,(QUIT)
  OR   A
  RET  NZ
  DJNZ ANWAIT
  RET
;
;FADFRM: one PWM frame. If the
;low 3 bits of the counter are
;less than FADE, light the matrix;
;otherwise leave it dark for about
;the same time. Destroys A,BC,DE,HL
;=====================================
FADFRM:
  LD   HL,ANCNT
  INC  (HL)
  LD   A,(HL)
  AND  7
  LD   C,A
  LD   A,(FADE)
  CP   C           ;Duty > count?
  JR   Z,FDOFF
  JR   C,FDOFF
  CALL ANFRM
  RET
FDOFF:
  CALL RGBOFF
  LD   D,8         ;Match one REFRESH
FD1:
  LD   B,ONTIME
  DJNZ $
  DEC  D
  JR   NZ,FD1
  CALL SHOWSEG
  CALL READKEYS
  RET
;
;ENDRUN: the ending. A long snake
;of SNLEN segments zig-zags up the
;2-wide corridor. The bars stay
;still until the head is on row 2,
;then the camera pans up with it:
;the bars, then the black edge, the
;sand and the sky scroll down. On
;the sand the snake turns right,
;still zig-zagging, and goes on
;until its tail is off the screen.
;Destroys A,BC,DE,HL
;=====================================
ENDRUN:
  LD   A,ENDTOP
  LD   (SCRY),A    ;Corridor only
  LD   HL,ENDX
  LD   B,SNLEN
  LD   A,3
  CALL FILLB       ;All x = 3
  LD   HL,ENDW
  LD   B,SNLEN
  LD   A,ENDSTW
  CALL FILLB       ;All below the screen
ENR1:
  CALL ENSTEP      ;Move one step
  CALL DRAWEND
  LD   B,ENDDLY
  CALL ANWAIT
  LD   A,(QUIT)
  OR   A
  RET  NZ
  LD   A,(ENDX+SNLEN-1)
  CP   8           ;Tail off the right?
  JR   C,ENR1
  LD   B,ENDHOLD
  CALL ANWAIT      ;Hold the empty scene
  RET
;
;ENSTEP: every segment moves up to
;the place of the one in front (the
;tables ENDX and ENDW, head first),
;then the head moves on. In the
;corridor (row 4 or more) it goes up
;one row, to column 3 on an even
;row and 4 on an odd row. On the
;sand (rows 2-3) it goes one column
;right and swaps rows. The camera
;keeps the head on screen row 2 and
;only ever goes up.
;Destroys A,BC,DE,HL
;=====================================
ENSTEP:
  LD   HL,ENDX+SNLEN-2
  LD   DE,ENDX+SNLEN-1
  LD   BC,SNLEN-1
  LDDR             ;Body x follows
  LD   HL,ENDW+SNLEN-2
  LD   DE,ENDW+SNLEN-1
  LD   BC,SNLEN-1
  LDDR             ;Body rows follow
  LD   A,(ENDW)    ;Head row
  CP   4
  JR   C,ENS1      ;On the sand
  DEC  A           ;Up one row
  LD   (ENDW),A
  AND  1
  ADD  A,3         ;Even 3, odd 4
  LD   (ENDX),A
  JR   ENS2
ENS1:
  XOR  1           ;Row 2 <-> row 3
  LD   (ENDW),A
  LD   HL,ENDX
  INC  (HL)        ;One column right
ENS2:
  LD   A,(ENDW)
  SUB  2           ;Head on screen row 2
  LD   HL,SCRY
  CP   (HL)
  RET  NC          ;Camera only goes up
  LD   (HL),A
  RET
;
;DRAWEND: the 8 rows of the world
;from row SCRY down, then the snake,
;tail first so the head is on top.
;A segment off the screen (below
;it, or right of column 7) is not
;drawn. Destroys A,BC,DE,HL
;=====================================
DRAWEND:
  CALL FBCLEAR
  LD   C,0         ;C = screen row
DRE1:
  LD   A,(SCRY)
  ADD  A,C         ;A = world row
  CP   2
  JR   C,DRESKY    ;Rows 0-1
  CP   4
  JR   C,DRESND    ;Rows 2-3
  JR   Z,DRENXT    ;Row 4: black edge
  AND  1
  LD   A,EXITCOL   ;Even: yellow
  JR   Z,DRECOR
  LD   A,WALLCOL   ;Odd: blue
DRECOR:
  LD   E,$E7       ;Walls, gap at 3-4
  JR   DREFIL
DRESKY:
  LD   A,SKYCOL
  LD   E,$FF       ;Whole row
  JR   DREFIL
DRESND:
  LD   A,SANDCOL
  LD   E,$FF
DREFIL:
  CALL FILROW
DRENXT:
  INC  C
  LD   A,C
  CP   8
  JR   NZ,DRE1
  LD   HL,ENDX+SNLEN-1
  LD   B,SNLEN     ;Tail first
DRS1:
  PUSH BC
  PUSH HL
  LD   A,(HL)      ;A = x
  CP   8
  JR   NC,DRS3     ;Off the right
  LD   D,A
  LD   A,L
  ADD  A,ENDW-ENDX
  LD   L,A         ;Same slot in ENDW
  LD   A,(SCRY)
  LD   E,A
  LD   A,(HL)      ;A = world row
  SUB  E           ;A = screen row
  CP   8
  JR   NC,DRS3     ;Below the screen
  LD   C,A
  LD   A,B         ;B = 1: the head
  LD   B,D         ;B = x, C = y
  CP   1
  LD   A,BODYCOL
  JR   NZ,DRS2
  LD   A,HEADCOL
DRS2:
  PUSH AF
  CALL CLRPIX      ;Over sand or bars
  POP  AF
  CALL PLOT
DRS3:
  POP  HL
  POP  BC
  DEC  HL
  DJNZ DRS1
  RET
;
;FILROW: C = row, A = colour,
;E = column mask (bit 7 = left).
;Lights those pixels in that colour.
;Keeps BC,DE. Destroys A,HL
;=====================================
FILROW:
  PUSH BC
  LD   B,A         ;B = colour bits
  LD   A,C
  AND  $07
  LD   L,A
  LD   H,FB/256    ;HL = red byte, row y
  LD   C,3         ;Red, green, blue
FRW1:
  RR   B           ;Next colour bit
  JR   NC,FRW2
  LD   A,(HL)
  OR   E           ;Light the mask
  LD   (HL),A
FRW2:
  LD   A,L
  ADD  A,8         ;Next plane
  LD   L,A
  DEC  C
  JR   NZ,FRW1
  POP  BC
  RET
;
;ENDFAD: dim the last outside
;picture to black, lighting it on
;fewer frames each step (PWM).
;Destroys A,BC,DE,HL
;=====================================
ENDFAD:
  LD   A,FADEMAX
  LD   (FADE),A
  XOR  A
  LD   (ANCNT),A
EFD1:
  LD   B,FADSTEP
EFD2:
  PUSH BC
  CALL FADFRM
  POP  BC
  LD   A,(QUIT)
  OR   A
  RET  NZ
  DJNZ EFD2
  LD   HL,FADE
  LD   A,(HL)
  OR   A
  RET  Z
  DEC  (HL)
  JR   EFD1
;
;=====================================
;DOORANI: the exit has just opened.
;The game stops: the snake is drawn
;and held still for DOORWT frames.
;Then the 8x8 shows a
;yellow and blue striped door; its
;middle 4 columns rise one row at a
;time, leaving black from the bottom
;up, with a scraping sound. Then
;UPDATE returns and the main loop
;draws the room again. FRAMES is
;not used here, so the next step
;still waits a full STEPS.
;Destroys A,BC,DE,HL,IX
;=====================================
DOORANI:
  CALL DRAW        ;Snake on the beetle
  LD   B,DOORWT
  CALL ANWAIT      ;Frozen for a moment
  LD   A,(QUIT)
  OR   A
  RET  NZ          ;AD: leave now
  LD   A,$5A
  LD   (NOISE),A   ;Any non-zero seed
  XOR  A
  LD   (SCRY),A    ;Door raised 0 rows
DOR1:
  CALL DRAWDR
  LD   B,DOORSTP
DOR2:
  PUSH BC
  CALL ANFRM       ;Show it, keys, 7-seg
  CALL SCRAPE      ;Noise burst
  POP  BC
  LD   A,(QUIT)
  OR   A
  RET  NZ          ;AD: leave now
  DJNZ DOR2
  LD   HL,SCRY
  INC  (HL)        ;Raise one more row
  LD   A,(HL)
  CP   9           ;0 to 8 rows up
  JR   C,DOR1
  RET
;
;DRAWDR: the door frame, columns
;0-1 and 6-7, is still yellow and
;blue stripes. The door, columns
;2-5, shows its row SCRY+y, or black
;if that is past its bottom row.
;Destroys A,BC,DE,HL
;=====================================
DRAWDR:
  CALL FBCLEAR
  LD   C,0         ;C = screen row
DRD1:
  LD   A,C
  AND  1
  LD   A,EXITCOL   ;Even: yellow
  JR   Z,DRD2
  LD   A,WALLCOL   ;Odd: blue
DRD2:
  LD   E,$C3       ;The frame
  CALL FILROW
  LD   A,(SCRY)
  ADD  A,C         ;Door row seen here
  CP   8
  JR   NC,DRD4     ;Door gone: black
  AND  1
  LD   A,EXITCOL
  JR   Z,DRD3
  LD   A,WALLCOL
DRD3:
  LD   E,$3C       ;The door
  CALL FILROW
DRD4:
  INC  C
  LD   A,C
  CP   8
  JR   NZ,DRD1
  RET
;
;SCRAPE: SCRHALF speaker toggles,
;each half a random length from an
;8-bit shift register in NOISE, so
;it sounds rough, not like a note.
;Silent if SCRHALF is 0.
;Destroys A,BC,D
;=====================================
SCRAPE:
  LD   A,SCRHALF
  OR   A
  RET  Z           ;0 = no sound
  LD   C,A         ;C = half-cycles
  XOR  A
SCR1:
  XOR  SPKBIT
  OUT  (DIGITP),A  ;Toggle the speaker
  LD   D,A         ;Keep the port value
  LD   A,(NOISE)
  ADD  A,A         ;Shift left
  JR   NC,SCR2
  XOR  $1D         ;Feed back
SCR2:
  LD   (NOISE),A
  AND  $3F
  OR   $40         ;Delay 64 to 127
  LD   B,A
  DJNZ $
  LD   A,D
  DEC  C
  JR   NZ,SCR1
  XOR  A
  OUT  (DIGITP),A  ;Speaker off
  RET
;
;=====================================
;AWARD: DE = points earned. Adds the
;speed bonus, then ADDSCORE. SPDSEL
;is 0, 1 or 2, so the bonus is
;DE * SPDSEL / 4, rounded down:
;x1 Elderly, x1.25 Midlife, x1.5
;Youthful. Every award goes through
;here. The score width (4 digits,
;9999) is only in SCORE, ADDSCORE,
;SETSEG and FILSCR.
;Destroys A,BC,DE,HL
;=====================================
AWARD:
  LD   HL,0
  LD   A,(SPDSEL)
  OR   A
  JR   Z,AW2       ;Elderly: no bonus
  LD   B,A
AW1:
  ADD  HL,DE       ;HL = DE * SPDSEL
  DJNZ AW1
  SRL  H
  RR   L           ;/2
  SRL  H
  RR   L           ;/4, rounded down
AW2:
  ADD  HL,DE       ;Points + bonus
  EX   DE,HL
  CALL ADDSCORE
  RET
;
;=====================================
;MENU: five LCD screens (MENUN 0-4):
;the title, the story, the keys, the
;7-seg and the settings. GO or Fire 1
;= next screen, AD = back one (on the
;title AD sets QUIT and returns). The
;story scrolls up a line at a time
;(STTICK). On the settings screen up
;and down change the highlighted
;setting and left and right move the
;highlight. GO there sets STEPS, LATEN
;and OPENAT (APPLYSET) and returns.
;The 8x8 shows the closed door.
;Destroys A,BC,DE,HL,IX
;=====================================
MENU:
  XOR  A
  LD   (MENUN),A
  LD   (QUIT),A
  LD   (FOCUS),A   ;Speed highlighted
  LD   (SCRY),A    ;Door fully closed
  LD   (JOYWT),A
  LD   A,$1F
  LD   (JOYOLD),A  ;Wait for a release
  CALL DRAWDR
MNSHOW:
  CALL SHOWSCR     ;This screen's text
MNLOOP:
  CALL REFRESH
  CALL SHOWSEG     ;Last score, if any
  LD   A,(MENUN)
  CP   STORYSC
  CALL Z,STTICK    ;Story: time to move?
  CALL MNJOY       ;Stick or arrows
  JR   NZ,MNPUSH
  LD   C,SCANKEYS
  RST  $10
  JR   NC,MNLOOP   ;No new key
  CP   KEYGO
  JR   Z,MNNEXT
  CP   KEYAD
  JR   Z,MNBACK
  LD   E,1         ;+1: next value
  CP   $06         ;6 = up
  JR   Z,MNCHG
  CP   KEYPLUS
  JR   Z,MNPM
  LD   E,$FF       ;-1: previous value
  CP   $02         ;2 = down
  JR   Z,MNCHG
  CP   KEYMIN
  JR   Z,MNPM
  CP   $01         ;1 = left
  JR   Z,MNFOC
  CP   $03         ;3 = right
  JR   Z,MNFOC
  JR   MNLOOP      ;Other keys: ignore
;MNPM: + or -. On the matrix keyboard
;MON3 gives + and - for the right and
;left arrows, which MNJOY has already
;used to move the highlight. So if an
;arrow is held, ignore the key.
MNPM:
  LD   BC,ARROWS
  IN   A,(C)
  CPL              ;Now 1 = pressed
  AND  $60         ;Left or right arrow?
  JR   NZ,MNLOOP   ;Yes: done by MNJOY
  JR   MNCHG       ;No: the hex + or -
;MNPUSH: A = new pushes from MNJOY.
MNPUSH:
  BIT  4,A
  JR   NZ,MNNEXT   ;Fire 1 = GO
  LD   E,1
  BIT  0,A
  JR   NZ,MNCHG    ;Up = next value
  LD   E,$FF
  BIT  1,A
  JR   NZ,MNCHG    ;Down = previous
  JR   MNFOC       ;Left or right
MNNEXT:
  LD   HL,MENUN
  INC  (HL)
  LD   A,(HL)
  CP   NSCR
  JR   C,MNSHOW    ;Next screen
  CALL APPLYSET    ;Past the last: play
  RET
MNBACK:
  LD   HL,MENUN
  LD   A,(HL)
  OR   A
  JR   Z,MNQUIT    ;On the title
  DEC  (HL)
  JR   MNSHOW
MNQUIT:
  LD   A,1
  LD   (QUIT),A
  RET
;MNFOC: left or right moves the
;highlight between Speed (FOCUS 0)
;and Length (FOCUS 1).
MNFOC:
  LD   A,(MENUN)
  CP   SETSCR
  JR   NZ,MNLOOP   ;Not the settings
  LD   A,(FOCUS)
  XOR  1           ;0 <-> 1
  LD   (FOCUS),A
  JP   MNSHOW
;MNCHG: E = +1 or -1, for the
;highlighted setting. SPDSEL and
;LENSEL sit side by side, so FOCUS
;picks one. 0-2 wraps round: 2+1 = 0,
;0-1 = 2.
MNCHG:
  LD   A,(MENUN)
  CP   SETSCR
  JP   NZ,MNLOOP   ;Not the settings
  LD   HL,SPDSEL
  LD   A,(FOCUS)
  CALL TABIDX      ;SPDSEL or LENSEL
  LD   A,(HL)
  ADD  A,E
  CP   3
  JR   C,MNOK      ;Still 0-2
  CP   $FF
  LD   A,2         ;Below 0: to 2
  JR   Z,MNOK
  XOR  A           ;Above 2: to 0
MNOK:
  LD   (HL),A
  JP   MNSHOW
;
;MNJOY: the joystick and the matrix
;arrows in the menu. It reads the
;same rows as READKEYS: A8 (arrows,
;and the stick on a 4-layer board,
;Fire 1 on bit 2) and A11 (the stick
;on a 2-layer board, Fire 1 on bit
;4). Returns A = new pushes, bit 0
;up, bit 1 down, bit 2 left, bit 3
;right, bit 4 Fire 1, with NZ; or
;A = 0 and Z. After any change the
;input is not read for JOYDLY
;frames, so the bounce of a switch
;counts as one push, and a long hold
;is still one push.
;Destroys A,BC,DE,HL
MNJOY:
  LD   HL,JOYWT
  LD   A,(HL)
  OR   A
  JR   Z,MJREAD
  DEC  (HL)        ;Still settling
  XOR  A
  RET
MJREAD:
  LD   BC,ARROWS
  IN   A,(C)       ;Row A8
  CPL              ;Now 1 = pressed
  LD   D,A
  LD   B,JOYROW
  IN   A,(C)       ;Row A11
  CPL
  LD   E,A
  LD   A,D
  RRCA
  RRCA
  RRCA             ;Arrows to bits 0-3
  OR   E           ;Stick the same way
  AND  $0F         ;Up,down,left,right
  LD   C,A
  LD   A,E
  AND  $10         ;A11 Fire 1 (bit 4)
  OR   C
  LD   C,A
  BIT  2,D         ;A8 Fire 1
  JR   Z,MJ1
  SET  4,C
MJ1:
  LD   HL,JOYOLD
  LD   A,(HL)      ;Bits seen last time
  CP   C
  JR   Z,MJNONE    ;No change
  LD   (HL),C
  CPL
  AND  C           ;Just pushed: Z if 0
  LD   HL,JOYWT
  LD   (HL),JOYDLY ;Let it settle
  RET
MJNONE:
  XOR  A
  RET
;
;APPLYSET: from SPDSEL and LENSEL
;set STEPS, LATEN (STEPS/4) and
;OPENAT. Destroys A,HL
APPLYSET:
  LD   A,(SPDSEL)
  LD   HL,SPDTAB
  CALL TABIDX
  LD   A,(HL)
  LD   (STEPS),A
  SRL  A
  SRL  A           ;A quarter of a step
  LD   (LATEN),A
  LD   A,(LENSEL)
  LD   HL,LENTAB
  CALL TABIDX
  LD   A,(HL)
  LD   (OPENAT),A
  RET
;
;=====================================
;SHOWSCR: the LCD for screen MENUN.
;The title, keys and 7-seg screens
;are 4 lines each in SCREENS (title
;first, then keys, then 7-seg). The
;story and the settings have their
;own routines.
;Destroys A,BC,DE,HL
;=====================================
SHOWSCR:
  LD   A,(MENUN)
  CP   STORYSC
  JR   Z,STSHOW
  CP   SETSCR
  JR   Z,SETSHOW
  OR   A
  JR   Z,SSTXT     ;Title: text 0
  DEC  A           ;Keys 1, 7-seg 2
SSTXT:
  ADD  A,A
  ADD  A,A         ;4 lines a screen
  LD   HL,SCREENS
  CALL TXTIDX      ;HL = first line
  JR   SHOW4
;
;STSHOW: the story from line 1, and
;the first, longer hold (STORY1).
;STDRAW: 4 story lines from STORYN.
;Destroys A,BC,DE,HL
STSHOW:
  XOR  A
  LD   (STORYN),A  ;Lines 1-4 first
  LD   HL,STORY1
  LD   (STORYT),HL
STDRAW:
  LD   A,(STORYN)
  LD   HL,STORY
  CALL TXTIDX      ;HL = top line
SHOW4:
  LD   C,LCDROW1
  CALL LINE
  LD   C,LCDROW2
  CALL LINE
  LD   C,LCDROW3
  CALL LINE
  LD   C,LCDROW4
  CALL LINE
  RET
;
;STTICK: called once a frame on the
;story screen. Counts STORYT down;
;at 0 the story moves up one line
;and the count starts again from
;STORYDL. Once the last line is on
;row 4 it stops and waits for GO.
;Destroys A,BC,DE,HL
STTICK:
  LD   A,(STORYN)
  CP   STLAST
  RET  Z           ;All shown: wait
  LD   HL,(STORYT)
  DEC  HL
  LD   (STORYT),HL
  LD   A,H
  OR   L
  RET  NZ          ;Not yet
  LD   HL,STORYDL
  LD   (STORYT),HL
  LD   HL,STORYN
  INC  (HL)        ;Up one line
  JR   STDRAW
;
;=====================================
;SETSHOW: the settings screen. Line 1
;is the speed, line 3 the length. The
;highlighted name (FOCUS) is shown in
;inverse. The LCD has no inverse
;text, so LOADINV first makes 8
;custom characters, the name's letters
;with every dot swapped, and PUTNAME
;writes those codes instead.
;Destroys A,BC,DE,HL
;=====================================
SETSHOW:
  LD   B,LCDCLS
  LD   C,CMD2LCD
  RST  $10
  CALL FOCNAME     ;HL = highlighted
  CALL LOADINV     ;Its inverse letters
  LD   HL,SPDTXT
  LD   C,LCDROW1
  CALL LINE        ;"Speed: "
  LD   A,(SPDSEL)
  LD   HL,SPDNAM
  CALL NAMIDX
  LD   A,(FOCUS)
  XOR  1           ;1 if Speed is lit
  CALL PUTNAME
  LD   HL,SPDHINT
  LD   C,LCDROW2
  CALL LINE
  LD   HL,LENTXT
  LD   C,LCDROW3
  CALL LINE        ;"Length: "
  LD   A,(LENSEL)
  LD   HL,LENNAM
  CALL NAMIDX
  LD   A,(FOCUS)   ;1 if Length is lit
  CALL PUTNAME
  LD   HL,LENHINT
  LD   C,LCDROW4
  CALL LINE
  RET
;
;FOCNAME: HL = the name that FOCUS
;points at. Destroys A,DE
FOCNAME:
  LD   A,(FOCUS)
  OR   A
  JR   NZ,FN1
  LD   A,(SPDSEL)
  LD   HL,SPDNAM
  JR   NAMIDX
FN1:
  LD   A,(LENSEL)
  LD   HL,LENNAM
;NAMIDX: HL = table of 9-byte names
;(8 letters + 0), A = index.
;HL = name A. Destroys A,E
NAMIDX:
  LD   E,A
  ADD  A,A
  ADD  A,A
  ADD  A,A
  ADD  A,E         ;A * 9
  CALL TABIDX
  RET
;
;LOADINV: HL = an 8-letter name.
;CGRAM character n (command $40 +
;8*n, then 8 data bytes, one per
;row) gets letter n of the name with
;each row XOR $1F: every dot that was
;off is on and every dot that was on
;is off. All 8 rows are swapped, so
;the bottom row is lit too.
;Destroys A,BC,DE,HL
LOADINV:
  PUSH HL
  LD   B,CGRAM     ;Character 0, row 0
  LD   C,CMD2LCD
  RST  $10
  POP  HL
  LD   B,8         ;8 letters, 8 codes
LI1:
  PUSH BC
  PUSH HL
  LD   A,(HL)
  CALL GLYPH       ;HL = its 8 rows
  LD   B,8
LI2:
  LD   A,(HL)
  XOR  $1F         ;Swap the 5 dots
  LD   C,CHR2LCD
  RST  $10         ;Next CGRAM byte
  INC  HL
  DJNZ LI2
  POP  HL
  POP  BC
  INC  HL          ;Next letter
  DJNZ LI1
  RET
;
;GLYPH: A = a capital letter. HL =
;its 8 rows in FONT. A letter not in
;FONT gets the blank at the end.
;Destroys B,DE
GLYPH:
  LD   HL,FONT
  LD   DE,9
GL1:
  CP   (HL)
  JR   Z,GL2       ;Found it
  LD   B,A
  LD   A,(HL)
  CP   ' '
  LD   A,B
  JR   Z,GL2       ;The last: blank
  ADD  HL,DE
  JR   GL1
GL2:
  INC  HL          ;Skip the letter
  RET
;
;PUTNAME: HL = an 8-letter name at
;the cursor. A = 0: normal text.
;A = 1: inverse, letter n is CGRAM
;code n (from LOADINV); a space is
;left as a normal space.
;Destroys A,BC,HL
PUTNAME:
  OR   A
  JR   NZ,PN1
  LD   C,STR2LCD
  RST  $10         ;Normal text
  RET
PN1:
  LD   B,0         ;B = code 0-7
PN2:
  LD   A,(HL)
  OR   A
  RET  Z           ;End of the name
  CP   ' '
  JR   Z,PN3       ;Space: as it is
  LD   A,B         ;Custom code
PN3:
  LD   C,CHR2LCD
  RST  $10
  INC  HL
  INC  B
  JR   PN2
;
;SHOWSET: at the start of a game
;line 3 is the speed and the length,
;e.g. "YOUTHFUL ANACONDA". Line 2 is
;blank, line 1 is the room name and
;line 4 the beetles still needed
;(SHOWNAME and SHOWREQ).
;Destroys A,BC,DE,HL
SHOWSET:
  LD   B,LCDCLS
  LD   C,CMD2LCD
  RST  $10
  LD   B,LCDROW3
  LD   C,CMD2LCD
  RST  $10
  LD   A,(SPDSEL)
  LD   HL,SPDNAM
  CALL NAMIDX
  CALL WORD
  LD   A,' '
  LD   C,CHR2LCD
  RST  $10
  LD   A,(LENSEL)
  LD   HL,LENNAM
  CALL NAMIDX
  CALL WORD
  RET
;
;WORD: HL = a name. Writes it at the
;cursor up to the first space or the
;0. Destroys A,C,HL
WORD:
  LD   A,(HL)
  CP   '!'
  RET  C           ;Space or 0: done
  LD   C,CHR2LCD
  RST  $10
  INC  HL
  JR   WORD
;
;SHOWREQ: LCD line 4 during play. The
;beetles still needed to open the
;exit (OPENAT - LEN, in decimal), or
;"The exit is open!". Called at the
;start of each life and after every
;beetle, never every frame.
;Destroys A,BC,DE,HL
SHOWREQ:
  LD   A,(LEN)
  LD   B,A
  LD   A,(OPENAT)
  SUB  B           ;A = beetles needed
  JR   Z,SRQOPEN
  JR   C,SRQOPEN   ;Longer still: open
  PUSH AF
  LD   HL,REQLN
  LD   DE,SCRTXT
  LD   BC,21
  LDIR             ;Copy the line
  POP  AF
  LD   B,'0'       ;B = tens digit
SRQ1:
  CP   10
  JR   C,SRQ2
  SUB  10
  INC  B
  JR   SRQ1
SRQ2:
  ADD  A,'0'
  LD   (SCRTXT+16),A
  LD   A,B
  CP   '0'
  JR   NZ,SRQ3
  LD   A,' '       ;No leading 0
SRQ3:
  LD   (SCRTXT+15),A
  LD   HL,SCRTXT
  JR   SRQSHOW
SRQOPEN:
  LD   HL,EXITLN
SRQSHOW:
  LD   C,LCDROW4
  CALL LINE
  RET
;
;LINE: C = LCD address, HL = text
;(ending in a 0). Writes it there,
;then HL = the next text (21 bytes
;on, so use it for 20-char lines).
;Destroys A,BC,DE
LINE:
  PUSH HL
  LD   B,C
  LD   C,CMD2LCD
  RST  $10         ;Cursor to C
  POP  HL
  PUSH HL
  LD   C,STR2LCD
  RST  $10
  POP  HL
  LD   DE,21
  ADD  HL,DE       ;Next text
  RET
;
;TXTIDX: HL = table of 21-byte
;texts, A = index. HL = text A.
;Destroys A,DE
TXTIDX:
  OR   A
  RET  Z
  LD   DE,21
TXI1:
  ADD  HL,DE
  DEC  A
  JR   NZ,TXI1
  RET
;
;=====================================
;MENU DATA. Most texts are 20
;characters plus a 0, one LCD line.
;SCREENS: the title, keys and 7-seg
;screens, 4 lines each. STORY: 9
;lines, shown 4 at a time.
;=====================================
SPDTAB:
  DB   $80,$60,$40 ;Frames per step
LENTAB:
  DB   16,24,30    ;Length that opens
;Names: 8 characters (spaces after)
;plus a 0.
SPDNAM:
  DB   "ELDERLY ",0
  DB   "MIDLIFE ",0
  DB   "YOUTHFUL",0
LENNAM:
  DB   "ADDER   ",0
  DB   "PYTHON  ",0
  DB   "ANACONDA",0
;The settings screen. "Speed: " and
;"Length: " are short: the name is
;written straight after them.
SPDTXT:
  DB   "Speed: ",0
SPDHINT:
  DB   "Faster scores more. ",0
LENTXT:
  DB   "Length: ",0
LENHINT:
  DB   "Longer is harder.   ",0
;Play, line 4. The number goes in
;columns 16-17.
REQLN:
  DB   " Beetles Reqd:      ",0
EXITLN:
  DB   " The exit is open!  ",0
;Play, line 2: blank, or a message.
BLANKLN:
  DB   "                    ",0
PAUSELN:
  DB   " PAUSED: move to go ",0
CLICKLN:
  DB   "Something clicked...",0
DOORLN:
  DB   "Hidden door unlocked",0
LIFELN:
  DB   "  An extra life!    ",0
SCREENS:
;0 the title
  DB   "Tutankhamen's Snake ",0
  DB   "  for the TEC-1G    ",0
  DB   " with the RGB 8x8   ",0
  DB   "back:[AD]  [GO]:next",0
;1 the keys
  DB   "Keypad:     [6]     ",0
  DB   "        [1] [2] [3] ",0
  DB   "Matrix:   Arrows    ",0
  DB   "Joystick: Fire=[GO] ",0
;2 the 7-seg display
  DB   "7segs: SCORE : LIVES",0
  DB   "  [AD] pauses play  ",0
  DB   " To set difficulty, ",0
  DB   " use movement keys. ",0
;The story, one long screen.
STORY:
  DB   "A small snake fled  ",0
  DB   "its enemies and fell",0
  DB   "into King Tut's tomb",0
  DB   "Eat sacred scarabs  ",0
  DB   "to grow long enough ",0
  DB   "to open the exit.   ",0
  DB   "Every wall is poison",0
  DB   "and the Eye of Ra is",0
  DB   "watching. Good luck!",0
;
;=====================================
;CUT-SCENES for SCENE (made from the
;pictures in the comments).
;=====================================
;PLATANI: the plate scene, side on.
;Blue floor with a purple plate
;level in it, a hollow below. The
;snake slides in from the left, a
;column a picture, and the plate
;sinks into the hollow with a
;click. The snake moves on, the
;plate pops back up with a click
;and the snake goes on again.
;About 2.6 s. Pictures use
;. black, B blue, M purple, G green,
;W white, Y yellow.
PLATANI:
;1 the snake comes
;........
;........
;........
;.W......
;G.......
;........
;BBBMMMBB
;BBB...BB
  DB   70,0        ;Hold, no sound
  DB   $00,$00,$00,$40,$00,$00,$1C,$00
  DB   $00,$00,$00,$40,$80,$00,$00,$00
  DB   $00,$00,$00,$40,$00,$00,$FF,$E3
;2 sliding in
;........
;........
;........
;..W.....
;.G......
;G.......
;BBBMMMBB
;BBB...BB
  DB   70,0        ;Hold, no sound
  DB   $00,$00,$00,$20,$00,$00,$1C,$00
  DB   $00,$00,$00,$20,$40,$80,$00,$00
  DB   $00,$00,$00,$20,$00,$00,$FF,$E3
;3 nearly there
;........
;........
;........
;...W....
;G.G.....
;.G......
;BBBMMMBB
;BBB...BB
  DB   70,0        ;Hold, no sound
  DB   $00,$00,$00,$10,$00,$00,$1C,$00
  DB   $00,$00,$00,$10,$A0,$40,$00,$00
  DB   $00,$00,$00,$10,$00,$00,$FF,$E3
;4 reaching it
;........
;........
;........
;....W...
;.G.G....
;G.G.....
;BBBMMMBB
;BBB...BB
  DB   70,0        ;Hold, no sound
  DB   $00,$00,$00,$08,$00,$00,$1C,$00
  DB   $00,$00,$00,$08,$50,$A0,$00,$00
  DB   $00,$00,$00,$08,$00,$00,$FF,$E3
;5 on the plate
;........
;........
;........
;.....W..
;G.G.G...
;.G.G....
;BBBMMMBB
;BBB...BB
  DB   60,0        ;Hold, no sound
  DB   $00,$00,$00,$04,$00,$00,$1C,$00
  DB   $00,$00,$00,$04,$A8,$50,$00,$00
  DB   $00,$00,$00,$04,$00,$00,$FF,$E3
;6 it sinks: click!
;........
;........
;........
;.....W..
;G.G.G...
;.G.G....
;BBB...BB
;BBBMMMBB
  DB   70,1        ;Hold, click
  DB   $00,$00,$00,$04,$00,$00,$00,$1C
  DB   $00,$00,$00,$04,$A8,$50,$00,$00
  DB   $00,$00,$00,$04,$00,$00,$E3,$FF
;7 moving on
;........
;........
;........
;......W.
;.G.G.G..
;..G.G...
;BBB...BB
;BBBMMMBB
  DB   70,0        ;Hold, no sound
  DB   $00,$00,$00,$02,$00,$00,$00,$1C
  DB   $00,$00,$00,$02,$54,$28,$00,$00
  DB   $00,$00,$00,$02,$00,$00,$E3,$FF
;8 it pops up: click
;........
;........
;........
;......W.
;.G.G.G..
;..G.G...
;BBBMMMBB
;BBB...BB
  DB   70,1        ;Hold, click
  DB   $00,$00,$00,$02,$00,$00,$1C,$00
  DB   $00,$00,$00,$02,$54,$28,$00,$00
  DB   $00,$00,$00,$02,$00,$00,$FF,$E3
;9 and away
;........
;........
;........
;.......W
;..G.G.G.
;...G.G..
;BBBMMMBB
;BBB...BB
  DB   200,0       ;Hold, no sound
  DB   $00,$00,$00,$01,$00,$00,$1C,$00
  DB   $00,$00,$00,$01,$2A,$14,$00,$00
  DB   $00,$00,$00,$01,$00,$00,$FF,$E3
  DB   0           ;End
;
;DOORSCN: the door scene, after the
;fourth plate. The secret door in
;its yellow frame: 4 blue squares
;turn purple, with the rumble. The
;door is unlocked. The last picture
;is held twice (250 is the most one
;hold can be). About 2.2 s.
DOORSCN:
;1 locked
;BBBBBBMB
;BBBBBMBM
;BBBBBBMB
;YYYYYYYY
;YYBBBBYY
;YYBBBBYY
;YYBBBBYY
;........
  DB   250,0       ;Hold, no sound
  DB   $02,$05,$02,$FF,$C3,$C3,$C3,$00
  DB   $00,$00,$00,$FF,$C3,$C3,$C3,$00
  DB   $FF,$FF,$FF,$00,$3C,$3C,$3C,$00
;2 unlocked: rumble
;BBBBBBMB
;BBBBBMBM
;BBBBBBMB
;YYYYYYYY
;YYBBBBYY
;YYBMMBYY
;YYBMMBYY
;........
  DB   250,2       ;Hold, rumble
  DB   $02,$05,$02,$FF,$C3,$DB,$DB,$00
  DB   $00,$00,$00,$FF,$C3,$C3,$C3,$00
  DB   $FF,$FF,$FF,$00,$3C,$3C,$3C,$00
;3 held a little longer
;BBBBBBMB
;BBBBBMBM
;BBBBBBMB
;YYYYYYYY
;YYBBBBYY
;YYBMMBYY
;YYBMMBYY
;........
  DB   140,0       ;Hold, no sound
  DB   $02,$05,$02,$FF,$C3,$DB,$DB,$00
  DB   $00,$00,$00,$FF,$C3,$C3,$C3,$00
  DB   $FF,$FF,$FF,$00,$3C,$3C,$3C,$00
  DB   0           ;End
;
;FONT: the 5x8 dots of each capital
;letter in the setting names, copied
;from the LCD's own character ROM.
;One letter, then 8 rows, top first;
;bit 4 is the left dot. The last
;entry, a space, is blank.
FONT:
  DB   "A",$0E,$11,$11,$11,$1F,$11,$11,$00
  DB   "C",$0E,$11,$10,$10,$10,$11,$0E,$00
  DB   "D",$1C,$12,$11,$11,$11,$12,$1C,$00
  DB   "E",$1F,$10,$10,$1E,$10,$10,$1F,$00
  DB   "F",$1F,$10,$10,$1E,$10,$10,$10,$00
  DB   "H",$11,$11,$11,$1F,$11,$11,$11,$00
  DB   "I",$0E,$04,$04,$04,$04,$04,$0E,$00
  DB   "L",$10,$10,$10,$10,$10,$10,$1F,$00
  DB   "M",$11,$1B,$15,$15,$11,$11,$11,$00
  DB   "N",$11,$11,$19,$15,$13,$11,$11,$00
  DB   "O",$0E,$11,$11,$11,$11,$11,$0E,$00
  DB   "P",$1E,$11,$11,$1E,$10,$10,$10,$00
  DB   "R",$1E,$11,$11,$1E,$14,$12,$11,$00
  DB   "T",$1F,$04,$04,$04,$04,$04,$04,$00
  DB   "U",$11,$11,$11,$11,$11,$11,$0E,$00
  DB   "Y",$11,$11,$11,$0A,$04,$04,$04,$00
  DB   " ",$00,$00,$00,$00,$00,$00,$00,$00
;
;=====================================
;MAP DATA. Edit this block when you
;change the tomb. The maps were drawn
;in Mark's 8x8_RGB_Pixel_Data_Maker
;spreadsheet. Pictures use # for a
;blue wall, Y for a yellow wall, E
;for an exit dot, . for a floor and
;P for a purple floor motif
;(decoration only: walkable, not
;deadly, beetles may sit on it,
;except on the 4 pressure plates).
;Keep doorways lined up, the outer
;edge solid, and the Stairway start
;strip clear of walls. The exit is in
;EXITRM, three dots at (EXITX,
;EXITY) to (EXITX, EXITY+2); the
;middle one is the opening. EXITRM,
;EXITX and EXITY are set with the
;other EQUs at the top of the file.
;=====================================
;
;NAMES: 17 names, 20 characters
;each plus a 0, for the LCD.
;=====================================
NAMES:
  DB   "Entrance Stairway   ",0
  DB   "Pillared Hall       ",0
  DB   "Sacred Temple       ",0
  DB   "King Tut's Tomb     ",0
  DB   "Descending Corridor ",0
  DB   "Eye of Ra           ",0
  DB   "Annexe              ",0
  DB   "Offering Chamber    ",0
  DB   "Water Well          ",0
  DB   "Trapped Corridor    ",0
  DB   "Burial Chamber      ",0
  DB   "Treasury            ",0
  DB   "Painted Gallery     ",0
  DB   "Throne Room         ",0
  DB   "Hall of Judgement   ",0
  DB   "Golden Shrine       ",0
  DB   "Fountain of Youth   ",0
;
;PLATES: the 4 pressure plates, the
;room then the pos (y*8 + x). Each is
;a purple motif in DECOS too. The
;4th pressed, in any order, unlocks
;the door at DOORPOS in DOORRM.
PLATES:
  DB   2,$34       ;Sacred Temple (4,6)
  DB   5,$1C       ;Eye of Ra (4,3)
  DB   13,$0C      ;Throne Room (4,1)
  DB   15,$0C      ;Golden Shrine (4,1)
;
;FIXTAB: the Fountain of Youth's 13
;items, pos then colour: 12 red
;beetles in Mark's places, then the
;golden scarab (number GOLDI).
FIXTAB:
  DB   $11,BTLCOL  ;(1,2)
  DB   $16,BTLCOL  ;(6,2)
  DB   $19,BTLCOL  ;(1,3)
  DB   $1E,BTLCOL  ;(6,3)
  DB   $21,BTLCOL  ;(1,4)
  DB   $26,BTLCOL  ;(6,4)
  DB   $29,BTLCOL  ;(1,5)
  DB   $2E,BTLCOL  ;(6,5)
  DB   $32,BTLCOL  ;(2,6)
  DB   $33,BTLCOL  ;(3,6)
  DB   $34,BTLCOL  ;(4,6)
  DB   $35,BTLCOL  ;(5,6)
  DB   $23,GOLDCOL ;(3,4) golden
;
;=====================================
;ROOMS: 17 maps, 8 bytes each, room 0
;first, laid out as a fixed 4x4 tomb,
;then room 16 below room 15, reached
;only by the secret door.
;A 1 bit is a wall, bit 7 = left.
;The outer edge is solid. The three
;exit dots on the east wall of room
;3 are walls too. Doorways line up
;with the matching edge of the next
;room. The Entrance Stairway has
;only one way out, east to room 1.
;=====================================
ROOMS:
;--- Room 0 Entrance Stairway
;one way out, to the east
  DB   $FF         ;########
  DB   $C3         ;##....##
  DB   $81         ;#..PP..#
  DB   $80         ;#.P..P..
  DB   $80         ;#.P.P...
  DB   $80         ;#.P.....
  DB   $C3         ;##.PPP##
  DB   $FF         ;########

;--- Room 1 Pillared Hall
;pillars, three doors
  DB   $FF         ;########
  DB   $81         ;#......#
  DB   $98         ;#..##...
  DB   $18         ;...##...
  DB   $00         ;........
  DB   $18         ;...##...
  DB   $99         ;#..##..#
  DB   $81         ;#......#

;--- Room 2 Sacred Temple
;an ankh, two doors
  DB   $FF         ;########
  DB   $C3         ;##..P.##
  DB   $01         ;...P.P.#
  DB   $01         ;...P.P.#
  DB   $01         ;....P..#
  DB   $01         ;...PPP.#
  DB   $81         ;#...P..#
  DB   $9F         ;#..#####

;--- Room 3 King Tut's Tomb
;the exit, a sarcophagus
  DB   $FF         ;########
  DB   $81         ;#.PPP..#
  DB   $91         ;#.PYP..E
  DB   $91         ;#.PYP..E
  DB   $91         ;#.PYP..E
  DB   $81         ;#.PPP..#
  DB   $81         ;#......#
  DB   $BD         ;#.####.#

;--- Room 4 Descending Corridor
;a long hall, two doors
  DB   $FF         ;########
  DB   $81         ;#......#
  DB   $81         ;#......#
  DB   $81         ;#......#
  DB   $81         ;#......#
  DB   $97         ;#..#.###
  DB   $90         ;#..#....
  DB   $9F         ;#..#####

;--- Room 5 Eye of Ra
;the Eye of Ra, three doors
  DB   $81         ;#......#
  DB   $81         ;#..PPP.#
  DB   $80         ;#.P...P.
  DB   $80         ;#PP.P.PP
  DB   $80         ;#.P...P.
  DB   $81         ;#..PPP.#
  DB   $01         ;.......#
  DB   $FF         ;########

;--- Room 6 Annexe
;three doors, motifs
  DB   $9F         ;#..#####
  DB   $81         ;#......#
  DB   $01         ;.....PP#
  DB   $01         ;.......#
  DB   $01         ;.....PP#
  DB   $81         ;#......#
  DB   $81         ;#PP..PP#
  DB   $81         ;#......#

;--- Room 7 Offering Chamber
;north and south halls
  DB   $BD         ;#.####.#
  DB   $81         ;#P....P#
  DB   $81         ;#......#
  DB   $81         ;#......#
  DB   $81         ;#......#
  DB   $81         ;#......#
  DB   $81         ;#P....P#
  DB   $C3         ;##....##

;--- Room 8 Water Well
;a well, three doors, a trap pocket
  DB   $9F         ;#..#####
  DB   $80         ;#.......
  DB   $80         ;#.......
  DB   $81         ;#..PP..#
  DB   $81         ;#..PP..#
  DB   $83         ;#.....##
  DB   $82         ;#.....#.
  DB   $C3         ;##....##

;--- Room 9 Trapped Corridor
;a dead-end bay, two doors, a trap
  DB   $FF         ;########
  DB   $01         ;.......#
  DB   $01         ;.......#
  DB   $F9         ;#####..#
  DB   $89         ;#...#..#
  DB   $80         ;#.......
  DB   $00         ;........
  DB   $FF         ;########

;--- Room 10 Burial Chamber
;four doors, motifs
  DB   $81         ;#PP..PP#
  DB   $81         ;#......#
  DB   $81         ;#PP..PP#
  DB   $80         ;#.......
  DB   $81         ;#PP..PP#
  DB   $01         ;.......#
  DB   $01         ;.......#
  DB   $F9         ;#####..#

;--- Room 11 Treasury
;yellow walls, a chequer
  DB   $C3         ;YYP.P.YY
  DB   $81         ;YP.P.P.Y
  DB   $81         ;Y.P.P.PY
  DB   $01         ;.P.P.P.Y
  DB   $81         ;Y.P.P.PY
  DB   $81         ;YP.P.P.Y
  DB   $81         ;Y.P.P.PY
  DB   $FF         ;YYYYYYYY

;--- Room 12 Painted Gallery
;yellow and blue walls
  DB   $C3         ;Y#....#Y
  DB   $81         ;#......#
  DB   $A0         ;Y.#.....
  DB   $80         ;#.......
  DB   $A0         ;Y.#.....
  DB   $95         ;#..#.#.Y
  DB   $81         ;Y......#
  DB   $FF         ;#Y#Y#Y#Y

;--- Room 13 Throne Room
;a throne, two doors
  DB   $FF         ;########
  DB   $81         ;#..PPP.#
  DB   $01         ;...P.P.#
  DB   $01         ;.......#
  DB   $01         ;.......#
  DB   $80         ;#.......
  DB   $80         ;#.......
  DB   $FF         ;########

;--- Room 14 Hall of Judgement
;the scales, three doors
  DB   $F9         ;#####..#
  DB   $81         ;#......#
  DB   $BD         ;#.####.#
  DB   $80         ;#.......
  DB   $80         ;#.......
  DB   $3D         ;..####.#
  DB   $01         ;.......#
  DB   $FF         ;########

;--- Room 15 Golden Shrine
;a gold shrine, two doors
  DB   $FF         ;########
  DB   $81         ;#...P..#
  DB   $81         ;#..P.P.#
  DB   $01         ;....P..#
  DB   $3D         ;..YYYY.#
  DB   $A5         ;#.Y..Y.#
  DB   $81         ;#......#
  DB   $FF         ;########
;The door square (4,7) is a wall
;until all 4 plates are pressed,
;then purple floor (SECRET).
;--- Room 16 Fountain of Youth
;the secret room, one door (up)
  DB   $F7         ;####.###
  DB   $C3         ;##....##
  DB   $81         ;#......#
  DB   $81         ;#......#
  DB   $81         ;#......#
  DB   $81         ;#......#
  DB   $C3         ;##....##
  DB   $FF         ;########


;=====================================
;DECOS: 17 decoration maps, 8 bytes
;each, same order as ROOMS. A 1 bit
;on a floor square is a purple
;motif. A 1 bit on a wall square
;paints that wall yellow (King
;Tut's Tomb, the Treasury, the
;Painted Gallery and the gold walls
;of the Golden Shrine). Rooms with
;neither are all 0.
;=====================================
DECOS:
;--- Room 0 Entrance Stairway
;########
;##....##
;#..PP..#
;#.P..P..
;#.P.P...
;#.P.....
;##.PPP##
;########
  DB   $00,$00,$18,$24,$28,$20,$1C,$00
;--- Room 1 Pillared Hall
  DB   $00,$00,$00,$00,$00,$00,$00,$00
;--- Room 2 Sacred Temple
;########
;##..P.##
;...P.P.#
;...P.P.#
;....P..#
;...PPP.#
;#...P..#
;#..#####
  DB   $00,$08,$14,$14,$08,$1C,$08,$00
;--- Room 3 King Tut's Tomb
;########
;#.PPP..#
;#.PYP..E
;#.PYP..E
;#.PYP..E
;#.PPP..#
;#......#
;#.####.#
  DB   $00,$38,$38,$38,$38,$38,$00,$00
;--- Room 4 Descending Corridor
  DB   $00,$00,$00,$00,$00,$00,$00,$00
;--- Room 5 Eye of Ra
;#......#
;#..PPP.#
;#.P...P.
;#PP.P.PP
;#.P...P.
;#..PPP.#
;.......#
;########
  DB   $00,$1C,$22,$6B,$22,$1C,$00,$00
;--- Room 6 Annexe
;#..#####
;#......#
;.....PP#
;.......#
;.....PP#
;#......#
;#PP..PP#
;#......#
  DB   $00,$00,$06,$00,$06,$00,$66,$00
;--- Room 7 Offering Chamber
;#.####.#
;#P....P#
;#......#
;#......#
;#......#
;#......#
;#P....P#
;##....##
  DB   $00,$42,$00,$00,$00,$00,$42,$00
;--- Room 8 Water Well
;#..#####
;#.......
;#.......
;#..PP..#
;#..PP..#
;#.....##
;#.....#.
;##....##
  DB   $00,$00,$00,$18,$18,$00,$00,$00
;--- Room 9 Trapped Corridor
  DB   $00,$00,$00,$00,$00,$00,$00,$00
;--- Room 10 Burial Chamber
;#PP..PP#
;#......#
;#PP..PP#
;#.......
;#PP..PP#
;.......#
;.......#
;#####..#
  DB   $66,$00,$66,$00,$66,$00,$00,$00
;--- Room 11 Treasury
;YYP.P.YY
;YP.P.P.Y
;Y.P.P.PY
;.P.P.P.Y
;Y.P.P.PY
;YP.P.P.Y
;Y.P.P.PY
;YYYYYYYY
  DB   $EB,$D5,$AB,$55,$AB,$D5,$AB,$FF
;--- Room 12 Painted Gallery
;Y#....#Y
;#......#
;Y.#.....
;#.......
;Y.#.....
;#..#.#.Y
;Y......#
;#Y#Y#Y#Y
  DB   $81,$00,$80,$00,$80,$01,$80,$55
;--- Room 13 Throne Room
;########
;#..PPP.#
;...P.P.#
;.......#
;.......#
;#.......
;#.......
;########
  DB   $00,$1C,$14,$00,$00,$00,$00,$00
;--- Room 14 Hall of Judgement
  DB   $00,$00,$00,$00,$00,$00,$00,$00
;--- Room 15 Golden Shrine
;########
;#...P..#
;#..P.P.#
;....P..#
;..YYYY.#
;#.Y..Y.#
;#......#
;########
  DB   $00,$08,$14,$08,$3C,$24,$00,$00
;--- Room 16 Fountain of Youth
  DB   $00,$00,$00,$00,$00,$00,$00,$00

