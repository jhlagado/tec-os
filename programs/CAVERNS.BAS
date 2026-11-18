10 REM CAVERNS - John Hardy (c) 1982-83. Microbee edition copyright 1983.
20 REM Dreamcards. GNU GPL release 2019; see CAVERNS.TXT and repository LICENSE.
30 REM Original prose: github.com/jhlagado/caverns src/protected/caverns.basic.
40 REM Origins: ZX81; VIC-20 port with Ken Stone; Microbee MicroWorld BASIC.
50 REM Recovery: Microbee Software Preservation Project; Alan Laughton (ChickenMan).
60 REM Author-approved TEC-OS rewrite. The archival listing is unchanged.
70 REM Insert experimental lines between these ten-step line numbers.
80 REM State: rm room, ob objects, db drawbridge, ht hatch, sh shaft, td door.
90 REM State: cr crypt, cl candle, ft fatigue, tu turns, rp tied rope, gt gate.
100 REM hb and jf retain reserved CVB2 checkpoint fields. Integers use %.
110 DIM ob%(24),ex%(216),il%(48),ad$(24),no$(24),di$(3),ve$(26)
120 GOSUB 390
130 CLS
140 GOSUB 450
150 PRINT "DREAMCARDS presents..."
160 PRINT "CAVERNS by John Hardy (c) 1982-83":PRINT "GNU General Public License, 2019":ft%=0:tu%=0
170 PRINT "Bring treasure home for double points. Take the compass!":PRINT "LOOK describes, INVENTORY lists, SCORE totals, QUIT finishes."
180 REM Apply view-time candle events before rendering; rendering changes no world state.
190 GOSUB 540
200 GOSUB 620
210 GOSUB 1010
220 GOSUB 1100
230 IF vb%=21 THEN 190
240 IF vb%=23 THEN GOSUB 2240:PRINT "Your score is";sc%;" out of 126.":GOTO 210
250 IF vb%=22 THEN GOSUB 920:GOTO 190
260 IF vb%=24 THEN 340
270 REM rs is the result; tc is turn cost. Clarifications are free.
280 rs%=0:tc%=0:ac%=0:GOSUB 1210
290 IF rs%=0 THEN tc%=1:rs%=2:GOSUB 510:IF fo%=5 THEN GOSUB 1780 ELSE GOSUB 1430
300 GOSUB 490
310 IF rs%=3 THEN 340
320 IF rs%=1 THEN 210
330 GOTO 190
340 GOSUB 2240
350 PRINT:PRINT "Score:";sc%;" out of a possible 126 points in";tu%;" moves.":GOSUB 2280:PRINT "Another adventure?"
360 INPUT yn$:IF yn$="N" OR yn$="n" THEN END ELSE IF yn$="Y" OR yn$="y" THEN GOTO 130 ELSE GOTO 360
370 END
380 REM Immutable il: starts and values. Counted prose lines fit the 80-column display.
390 RESTORE:FOR ix%=1 TO 54:READ dc%:FOR iy%=1 TO dc%:READ ds$:NEXT iy%:NEXT ix%
400 FOR ix%=1 TO 216:READ ex%(ix%):NEXT ix%
410 FOR ix%=1 TO 24:READ ad$(ix%),no$(ix%):NEXT ix%
420 FOR ix%=1 TO 48:READ il%(ix%):NEXT ix%
430 FOR ix%=0 TO 3:READ di$(ix%):NEXT ix%
440 FOR ix%=1 TO 26:READ ve$(ix%):NEXT ix%:RETURN
450 hb%=11:db%=128:ht%=0:sh%=0:td%=0:cr%=0:jf%=0:rp%=0:gt%=0
460 FOR ix%=1 TO 24:ob%(ix%)=il%(ix%):NEXT ix%
470 RANDOMIZE
480 rm%=1:cl%=1:fo%=0:it%=0:ft%=0:RETURN
490 IF tc%=1 THEN IF tu%<32767 THEN tu%=tu%+1
500 RETURN
510 FOR fo%=1 TO 6:IF ob%(fo%)=rm% THEN RETURN
520 NEXT fo%:fo%=0:RETURN
530 REM The historical candle clock is checked only where the player could see.
540 vs%=1:ce%=0
550 IF rm%<18 THEN 590
560 IF cl%<>1 THEN vs%=0:RETURN
570 IF ob%(21)=rm% THEN 590
580 IF ob%(21)<>-1 THEN vs%=0:RETURN
590 IF cl%=1 THEN IF tu%=201 THEN ce%=1
600 IF cl%=0 OR tu%<230 THEN RETURN
610 cl%=0:ce%=2:RETURN
620 PRINT
630 IF vs%=0 THEN PRINT "It's very dark, too dark to see anything... I'm scared!":GOTO 810
640 RESTORE:FOR ix%=1 TO rm%:READ dc%:FOR iy%=1 TO dc%:READ ds$:IF ix%=rm% THEN PRINT ds$
650 NEXT iy%:NEXT ix%
660 IF rm%=20 THEN IF td%=0 THEN PRINT "A formidable oak door bound with iron is locked from the inside. Perhaps explosives would open it." ELSE PRINT "The blast has opened a passage east into the treasure room."
670 IF rm%=28 OR rm%=35 THEN IF rp%=1 THEN PRINT "The rope hangs securely from the rail to the temple floor."
680 IF rm%=35 THEN IF gt% THEN PRINT "To the north is an open gate." ELSE PRINT "To the north is a locked gate."
690 IF rm%=37 THEN IF cr% THEN PRINT "The stone seal in the eastern wall stands open." ELSE PRINT "Four stones bear the letters V, A, R and D. They seem to spell a name."
700 IF rm%=38 THEN IF sh% THEN PRINT "An open ventilation shaft leads east." ELSE PRINT "A rusty grille covers the ventilation shaft. It is too large to carry through."
710 IF rm%=48 THEN IF db%=128 THEN PRINT "A raised drawbridge keeps you from crossing to the castle." ELSE PRINT "A mighty golden drawbridge spans the waters to the east."
720 IF rm%=14 THEN IF ob%(4)=0 THEN PRINT "You can also see the bloody corpse of an enormous dragon."
730 IF ce%=1 THEN PRINT "Your candle is growing dim."
740 IF ce%=2 THEN PRINT "Your candle has gone out."
750 qt%=0
760 FOR li%=7 TO 24
770 IF ob%(li%)<>rm% THEN 800
780 IF qt%=0 THEN PRINT "You can also see..."
790 qt%=1:GOSUB 870
800 NEXT li%
810 qt%=0:FOR li%=1 TO 6:IF ob%(li%)=rm% THEN GOSUB 880:IF li%<>1 AND li%<>4 AND li%<>6 THEN qt%=qt%+1
820 NEXT li%:IF qt%=0 THEN 860
830 PRINT "Nearby there lurks..."
840 FOR li%=1 TO 6:IF ob%(li%)=rm% THEN IF li%<>1 AND li%<>4 AND li%<>6 THEN GOSUB 870
850 NEXT li%
860 PRINT:RETURN
870 PRINT "a";ad$(li%);LEFT$(no$(li%),LEN(no$(li%))-1);".":RETURN
880 IF li%=1 THEN PRINT "Before you in a swirling mist stands an evil wizard with his hand held outwards. 'Thou shalt not pass!' he cries.":RETURN
890 IF li%=4 THEN PRINT "An enormous green dragon guards the cave entrance. Its eyes flicker as it leaps up breathing jets of fire.":RETURN
900 IF li%=6 THEN PRINT "From around the corner trots an old and gnarled dwarf carrying a lantern. 'My job is to protect these stone steps!' he says and lunges at you with his dagger."
910 RETURN
920 PRINT "You are carrying ";:qt%=0
930 FOR li%=7 TO 24
940 IF ob%(li%)<>-1 THEN 970
950 IF qt%=0 THEN PRINT
960 qt%=1:GOSUB 870
970 NEXT li%
980 IF qt%=0 THEN PRINT "nothing."
990 RETURN
1000 REM Normalise once; whole words and alias precedence match the qualified game.
1010 INPUT cm$:IF cm$="" THEN 1010 ELSE cm$=" "+cm$+" "
1020 FOR ix%=1 TO LEN(cm$):cc%=ASC(MID$(cm$,ix%,1)):IF cc%>64 THEN IF cc%<91 THEN cm$=LEFT$(cm$,ix%-1)+CHR$(cc%+32)+MID$(cm$,ix%+1)
1030 NEXT ix%
1040 IF cm$=" n " THEN cm$=" north "
1050 IF cm$=" s " THEN cm$=" south "
1060 IF cm$=" w " THEN cm$=" west "
1070 IF cm$=" e " THEN cm$=" east "
1080 IF cm$=" i " THEN cm$=" list "
1090 RETURN
1100 FOR it%=7 TO 24:wd$=no$(it%):GOSUB 1170:IF mp%>0 THEN 1130
1110 NEXT it%:it%=0
1120 IF it%=0 THEN wd$=" grill ":GOSUB 1170:IF mp%>0 THEN it%=24
1130 FOR vb%=1 TO 26:wd$=ve$(vb%):GOSUB 1170:IF mp%>0 THEN 1150
1140 NEXT vb%:vb%=0:RETURN
1150 IF vb%=10 THEN vb%=9 ELSE IF vb%>24 THEN vb%=22
1160 RETURN
1170 mp%=0:FOR si%=1 TO LEN(cm$)-LEN(wd$)+1
1180 IF MID$(cm$,si%,LEN(wd$))=wd$ THEN mp%=si%:RETURN
1190 NEXT si%:RETURN
1200 REM Validate free clarifications; complete rope/hatch actions return a turn cost.
1210 IF vb%=9 THEN IF it%<>20 THEN PRINT "With what weapon?":rs%=1:RETURN
1220 IF vb%=17 THEN 1290 ELSE IF vb%=18 THEN 1340
1230 IF rm%=28 THEN IF vb%=14 THEN 1360
1240 IF rm%=35 THEN IF vb%=13 THEN 1380
1250 IF vb%=8 AND rm%=43 THEN wd$=" hatch ":GOSUB 1170:IF mp%>0 THEN 1400
1260 IF ob%(24)=-1 THEN IF rm%=38 OR rm%=39 THEN rs%=1:wd$=" east ":IF rm%=39 THEN wd$=" west "
1270 IF rs%=1 THEN GOSUB 1170:IF mp%>0 THEN PRINT "The grille is too large to fit through the shaft. You must leave it here.":RETURN ELSE rs%=0
1280 RETURN
1290 rs%=1:IF rm%<>28 THEN PRINT "There is no suitable rail here.":RETURN
1300 IF it%<>22 THEN PRINT "Tie what?":RETURN
1310 wd$=" rail ":GOSUB 1170:IF mp%=0 THEN PRINT "Tie it to what? Try the rail.":RETURN
1320 IF ob%(22)<>-1 THEN PRINT "You must be carrying the rope.":RETURN
1330 ob%(22)=28:rp%=1:PRINT "You tie the rope securely to the stone rail. It reaches the temple floor.":GOTO 1410
1340 rs%=1:IF rm%<>28 OR rp%=0 THEN PRINT "There is no secured rope here.":RETURN
1350 rp%=0:PRINT "You untie the rope from the stone rail.":GOTO 1410
1360 rs%=1:IF rp%=0 THEN PRINT "You must tie the rope to the rail before climbing down.":RETURN
1370 rm%=35:ft%=0:PRINT "You climb down to the temple floor.":GOTO 1410
1380 rs%=1:IF rp%=0 THEN PRINT "There is no secured rope above you.":RETURN
1390 rm%=28:ft%=0:PRINT "You climb up to the balcony.":GOTO 1410
1400 ht%=43:PRINT "You lift the latch and open the service hatch."
1410 tc%=1:rs%=2:RETURN
1420 REM Dispatch has no jumps into the input loop; every action returns one result.
1430 IF vb%>18 THEN 1530 ELSE IF vb%=0 THEN 1510
1440 IF vb%=9 THEN ac%=3:GOTO 1800
1450 IF vb%<5 THEN ac%=vb%:IF ac%>3 THEN ac%=3
1460 IF vb%<5 THEN 1800 ELSE IF fo%>0 THEN 1790
1470 IF vb%<7 THEN PRINT "Nothing happens!"
1480 IF vb%>6 THEN IF vb%<13 THEN PRINT "Please tell me how."
1490 IF vb%>12 THEN PRINT "I can't!"
1500 PRINT:rs%=1:RETURN
1510 FOR cn%=0 TO 3:wd$=di$(cn%):GOSUB 1170:IF mp%>0 THEN 1560
1520 NEXT cn%
1530 IF vb%=20 THEN 1740
1540 IF vb%=19 THEN 1760
1550 GOTO 1800
1560 IF fo%>0 THEN 1790
1570 IF ob%(8)=-1 THEN 1590 ELSE IF ob%(8)=rm% THEN 1590
1580 PRINT "Without the compass, I lose my bearings!":cn%=INT(RND(1)*4)
1590 ei%=rm%*4+cn%-3:nx%=ex%(ei%):GOSUB 1670
1600 IF rm%=35 THEN IF nx%=37 AND gt%=0 THEN PRINT "The gate is locked.":rs%=1:RETURN
1610 IF rm%=43 THEN IF nx%=38 AND ht%=0 THEN PRINT "The service hatch is latched shut.":rs%=1:RETURN
1620 IF rm%=49 THEN IF nx%=50 OR nx%=48 THEN db%=49
1630 IF nx%=0 THEN PRINT "You can't go that way."
1640 IF nx%=128 THEN PRINT "You stumble and fall into the chasm. You smash into the rocks below.":rs%=3:RETURN
1650 IF nx%>0 THEN rm%=nx%:ft%=0
1660 RETURN
1670 IF nx%=-1 THEN nx%=hb%:RETURN
1680 IF nx%=-2 THEN nx%=td%:RETURN
1690 IF nx%=-3 THEN nx%=cr%:RETURN
1700 IF nx%=-4 THEN nx%=ht%:RETURN
1710 IF nx%=-5 THEN nx%=sh%:RETURN
1720 IF nx%=-6 THEN IF db%=128 THEN nx%=0:RETURN ELSE nx%=db%:RETURN
1730 RETURN
1740 IF fo%>0 THEN 1790
1750 ft%=0:PRINT "Suddenly a magic wind carries you to another place...":rm%=16:RETURN
1760 IF rm%<>37 THEN PRINT "Nothing happens here.":RETURN
1770 PRINT "The eastern wall of the crypt slides open. The passage stays open behind you.":cr%=38:RETURN
1780 PRINT "The giant bat carries you to its colony.":rm%=33:ft%=0:ob%(5)=0:RETURN
1790 PRINT "The creature strikes before you can defend yourself. You have been killed!":rs%=3:RETURN
1800 IF ac%<>0 THEN 1830
1810 ac%=3:wd$=" get ":GOSUB 1170:IF mp%>0 THEN ac%=1:GOTO 1830
1820 wd$=" drop ":GOSUB 1170:IF mp%>0 THEN ac%=2
1830 IF it%<1 THEN IF fo%>0 THEN 1790 ELSE PRINT "eh?":RETURN
1840 IF ob%(it%)=-1 THEN 1860
1850 IF ob%(it%)=rm% THEN 1860 ELSE IF fo%>0 THEN 1790 ELSE PRINT "Not here.":RETURN
1860 IF fo%=0 THEN 1890
1870 IF ac%=3 THEN IF it%=20 THEN IF ob%(20)=-1 THEN 1960
1880 GOTO 1790
1890 IF ac%=1 THEN 1900 ELSE IF ac%=2 THEN 1950 ELSE GOTO 1960
1900 cn%=0:FOR ix%=7 TO 24:IF ob%(ix%)=-1 THEN cn%=cn%+1
1910 NEXT ix%:IF cn%>10 THEN PRINT "You cannot carry more.":RETURN
1920 ob%(it%)=-1:IF it%=24 THEN sh%=39
1930 IF it%=22 THEN rp%=0
1940 PRINT "You take ";:li%=it%:GOSUB 870:PRINT:RETURN
1950 ob%(it%)=rm%:PRINT "You drop ";:li%=it%:GOSUB 870:PRINT:RETURN
1960 IF it%=9 THEN wd$=" candle ":GOSUB 1170:IF mp%>0 THEN it%=21
1970 IF it%<19 THEN 2000 ELSE IF it%>22 THEN 2000
1980 IF ob%(it%)<>-1 THEN IF ob%(it%)<>rm% THEN PRINT "Where? I can't see it.":RETURN
1990 ON it%-18 GOTO 2010,2030,2170,2230
2000 PRINT "How am I supposed to use it?":RETURN
2010 IF rm%<>2 THEN IF rm%<>35 THEN PRINT "It won't open!":RETURN
2020 PRINT "You opened the door.":IF rm%=2 THEN rm%=1:GOSUB 2350:RETURN ELSE gt%=1:rm%=37:RETURN
2030 IF fo%=0 THEN PRINT "But there's nothing to kill...":RETURN
2040 IF ob%(20)<>-1 THEN PRINT "You aren't carrying that.":RETURN
2050 ft%=ft%+1:IF RND(1)*7+15>ft% THEN 2070
2060 PRINT "You swing with your sword but miss and the creature smashes your skull.":rs%=3:RETURN
2070 IF RND(1)<.38 THEN 2140
2080 li%=INT(RND(1)*4):IF fo%=5 THEN 1780
2090 IF li%=0 THEN PRINT "You attack but the creature moves aside."
2100 IF li%=1 THEN PRINT "The creature deflects your blow."
2110 IF li%=2 THEN PRINT "The foe is stunned but quickly regains its balance."
2120 IF li%=3 THEN PRINT "You miss and the creature strikes back."
2130 RETURN
2140 PRINT "The sword strikes home and your foe dies.":ob%(fo%)=0
2150 IF fo%<>4 THEN PRINT "Suddenly a black cloud descends and the corpse vaporises into nothing."
2160 fo%=0:ft%=0:RETURN
2170 IF ob%(9)=-1 THEN 2190 ELSE IF ob%(9)=rm% THEN 2190
2180 PRINT "Nothing to ignite here. Keep your candle safe.":RETURN
2190 IF cl%<>1 THEN PRINT "The candle is out; you need a flame.":RETURN
2200 IF rm%<>20 THEN PRINT "BOOM! You are thrown aside. When the smoke clears nothing has changed.":RETURN
2210 IF td%=19 THEN PRINT "The passage is already open. Save your bomb.":RETURN
2220 PRINT "The fuse burns away and... BOOM! The door is torn from its hinges. A passage opens to the east.":td%=19:ob%(9)=0:RETURN
2230 PRINT "Tie the rope to the stone rail before climbing down. Once it is secured you can climb back up to the balcony.":rs%=1:RETURN
2240 sc%=0:FOR ix%=7 TO 17
2250 qt%=il%(ix%+24):IF ob%(ix%)=-1 THEN IF rm%=1 THEN sc%=sc%+qt%*2 ELSE sc%=sc%+qt%
2260 IF ob%(ix%)=1 THEN sc%=sc%+qt%*2
2270 NEXT ix%:RETURN
2280 PRINT "This gives you an adventurer's ranking of:"
2290 IF sc%<20 THEN PRINT "Hopeless beginner":RETURN
2300 IF sc%<50 THEN PRINT "Experienced loser":RETURN
2310 IF sc%<100 THEN PRINT "Average Viking":RETURN
2320 IF sc%<126 THEN PRINT "Excellent... but you've left something behind!":RETURN
2330 IF sc%=126 THEN PRINT "Perfectionist and genius!!"
2340 RETURN
2350 PRINT "Welcome home! Your treasures are safe."
2360 FOR ix%=7 TO 17:IF ix%<>8 THEN IF ix%<>9 THEN IF ob%(ix%)=-1 THEN ob%(ix%)=1
2370 NEXT ix%:GOSUB 2240:PRINT "Your score is";sc%;" out of 126.":GOSUB 2280
2380 IF sc%=126 THEN PRINT "All treasure home. Your quest is complete!"
2390 PRINT "QUIT to finish, or leave to seek more treasure.":RETURN
2400 END
2410 DATA 2,"You are in a darkened room inside a small bark hut. A door leads north to a"
2420 DATA "forest clearing."
2430 DATA 2,"You stand before a small windowless bark hut. The door to the south locked when"
2440 DATA "you closed it. A forest lies west and a field of clovers opens east."
2450 DATA 2,"You are deep in a dark forest. A mighty river glints through the trees. A path"
2460 DATA "leads east to a hut clearing and west towards a river cliff."
2470 DATA 2,"You stand in a field of four-leafed clovers. A hut clearing lies west and the"
2480 DATA "slopes of Mount Ymir rise to the east."
2490 DATA 2,"The forest opens onto a cliff above a wide glacial river. A foot-beaten path"
2500 DATA "leads south to the riverbank. A forest path leads east."
2510 DATA 2,"You stand at the rocky edge of the mighty river Gioll. A path forks east and"
2520 DATA "west. Another climbs north to a cliff."
2530 DATA 2,"You stand on the slippery rim of an enormous crater. Clouds of water vapour"
2540 DATA "rise as the Gioll pours into it. West is a fatal drop. A safe path leads east."
2550 DATA 3,"You are on a rocky outcrop fifteen feet above the river. A tiny string bridge"
2560 DATA "spans the water to the south-east. To reach it you must go west and detour","through the forest."
2570 DATA 3,"You are on the lower slopes of Mount Ymir. Arctic winds blow fiercely. It is"
2580 DATA "very cold! A path leads west through clovers towards the forest and south","towards a bridge."
2590 DATA 2,"You stand on a rocky precipice high above the Gioll. Mount Ymir rises to the"
2600 DATA "north. A flimsy string bridge spans the river to the south."
2610 DATA 2,"You are halfway across a creaking bridge. It sways violently above the river!"
2620 DATA "Hold tight and follow it either north or south."
2630 DATA 3,"You stand on the southern bank of the mighty river. A string bridge leads"
2640 DATA "north. An oak forest lies west and a path follows the bank east to a cliff","face."
2650 DATA 2,"You stand on a rock in a mighty oak forest surrounded by thousands of poisonous"
2660 DATA "mushrooms. A path leads east to a bridge landing and south to a clearing."
2670 DATA 2,"You are in a forest clearing beneath an ancient basalt rock formation. A VERY"
2680 DATA "interesting cave opens to the south... A path leads north into the oak forest."
2690 DATA 2,"You are on a shelf against a cliff face above the southern riverbank. A path"
2700 DATA "leads west to a string bridge landing."
2710 DATA 3,"You are just inside a cave. Sunlight lights paths east and south. I don't mind"
2720 DATA "saying I'm a bit scared! North leads outside. You will need a light to venture","deeper."
2730 DATA 3,"This passage appears to be a dead end. An earlier explorer scratched a message"
2740 DATA "on the wall: 'Find the Sacred Key of Thialfi'. A passage leads west to the cave","entrance."
2750 DATA 2,"You are in a dark cavern. Daylight filters in from a cave entrance to the"
2760 DATA "north. A passage leads west towards an old torture chamber."
2770 DATA 3,"You are in the legendary treasure room of the black elves of Svartalfheim."
2780 DATA "Every red-blooded Viking dreams of entering this sacred room! A doorway leads","west."
2790 DATA 2,"You stand before an entrance to a treasure room. A passage leads south to a"
2800 DATA "cavern."
2810 DATA 2,"You are in a dark cavern. A passage leads north to an oak doorway. A draught"
2820 DATA "comes from a corridor east. A long tunnel stretches south into darkness."
2830 DATA 2,"You are in a corridor. A faint breeze stirs the stale air. West leads to a dark"
2840 DATA "cavern and a doorway south leads to a torture chamber."
2850 DATA 3,"This was once a torture chamber. Instruments of inhuman agony, coagulated blood"
2860 DATA "on the walls and mangled bones on the floor suggest many adventurers croaked it","here! A corridor leads north. A cavern near the cave entrance lies east."
2870 DATA 2,"You stand in a long tunnel bored through the rock. It runs north to a cavern"
2880 DATA "and south to a large round chamber."
2890 DATA 2,"You are in a small silent side cave. Its only passage leads west to a large"
2900 DATA "round chamber."
2910 DATA 5,"You are in a large round room with mystical dark purple walls. A big chalk star"
2920 DATA "marks the centre of the floor. This is a hidden chamber of the infamous monks","of Loki. Norse folk believe them to be gods. A long tunnel leads north and a"
2930 DATA "river ledge lies south. A passage west leads towards bat caves. A small side","cave opens east."
2940 DATA 2,"You stand on a narrow ledge high above a subterranean river. A balcony"
2950 DATA "overlooks a huge cavern to the east. A passage leads north to a round chamber."
2960 DATA 4,"You are on a balcony above a cavern converted into a temple to Loki. Odin"
2970 DATA "banished the god of fire to Svartalfheim. Here he waits for the 'End Of All","Things'. A sturdy stone rail borders the balcony above the temple floor. A"
2980 DATA "passage leads west to a river ledge."
2990 DATA 3,"You are in a dark cavern where passages meet. A draught stirs the air. A round"
3000 DATA "chamber lies east and a bat colony lies south. A forked stone pillar marks a","passage west."
3010 DATA 2,"You are beside a forked stone pillar in a dark cavern. A junction lies east and"
3020 DATA "a passage leads west to a pale limestone chamber."
3030 DATA 2,"Water drips from the roof of a low dark passage. It leads north to a pale"
3040 DATA "limestone chamber and east to another chamber."
3050 DATA 2,"Pale limestone walls catch the light in this dark cavern. A passage leads east"
3060 DATA "to a forked stone pillar and a low dripping passage leads south."
3070 DATA 3,"You are in the heart of a giant bat colony. Hundreds hang overhead above"
3080 DATA "centuries of bat droppings. Careful where you step! The smell is indescribable.","A junction lies north and a passage leads west to another chamber."
3090 DATA 2,"You are in a dark cavern. Passages lead east towards roosting bats and west"
3100 DATA "into a low dripping passage."
3110 DATA 2,"You are in the temple. A giant statue of Loki is carved out of the living rock"
3120 DATA "of the wall itself! A balcony stands high overhead."
3130 DATA 2,"You are in a dark cavern below a temple. A shaft opens north. A passage east"
3140 DATA "leads towards the sound of an underground river."
3150 DATA 3,"You stand in a musty crypt where hundreds of Loki's devotees lie in"
3160 DATA "putrefaction and decay. Four stones in the eastern wall name its keeper. A gate","leads south to a temple."
3170 DATA 3,"You are in a tiny cell. A passage leads west to a crypt. A ventilation shaft"
3180 DATA "pierces the eastern wall. A service hatch lies north but its latch is on the","drain side."
3190 DATA 2,"You are in a dark cavern beside a ventilation shaft. The shaft leads west to a"
3200 DATA "cell. A passage leads south into a lower cavern."
3210 DATA 3,"You stand on a ledge high above a subterranean river. Water pours through a"
3220 DATA "hole in the roof to the north. A path leads north to the waterfall and south to","a river bend. A cavern lies west. East is a sheer drop."
3230 DATA 2,"Somehow you have found the drains of this entire cavern network! This drain"
3240 DATA "leads west to a freezing conduit and east towards a junction."
3250 DATA 2,"You are in the drains of a cavern network. A straight passage leads west"
3260 DATA "towards a conduit and east to a junction."
3270 DATA 3,"You stand at a drain junction. A winding passage leads north towards a"
3280 DATA "pearl-white chamber. A branch runs east. A drain leads west towards a conduit.","The cell's service hatch lies south with its latch on this side."
3290 DATA 2,"You are in a blind branch of the cavern drains. There is no way onwards. A"
3300 DATA "drain leads west to a junction."
3310 DATA 2,"An enormous waterfall brings water down from the surface river Gioll. Stone"
3320 DATA "steps climb north beside it. A ledge lies south. There is no safe footing east."
3330 DATA 2,"Your light catches pearl-white walls in a dark cavern. Stone steps lie west. A"
3340 DATA "winding passage leads south to a drain junction below."
3350 DATA 2,"You stand atop a stone staircase. Steps descend south towards a roaring"
3360 DATA "waterfall. A pearl-white chamber lies east."
3370 DATA 3,"You stand on a crumbling river ledge. Across the water to the east is a magic"
3380 DATA "castle. Don't ask me why it is magic... I just know it is! A drawbridge crosses","east. A path leads north to another ledge. There is no path south."
3390 DATA 2,"You stand on a mighty golden drawbridge above the river. Beyond it is a magic"
3400 DATA "castle! A river ledge lies west and the courtyard lies east."
3410 DATA 4,"You are in the courtyard of a magic castle. WOW! This castle is really"
3420 DATA "something! The wall reads 'hzb tzozi'. A drawbridge lies west and a doorway","leads east to a powder magazine. A secret escape tunnel leads south to a"
3430 DATA "riverbank."
3440 DATA 2,"You are in the powder magazine of this really super castle. A doorway leads"
3450 DATA "west to a courtyard."
3460 DATA 2,"You are on the eastern bank of an underground river. A tunnel leads north"
3470 DATA "through the cliff face into a castle. A wooden bridge crosses the water west."
3480 DATA 2,"A small wooden bridge crosses an underground river to the east. A narrow"
3490 DATA "service path leads north towards a conduit."
3500 DATA 3,"You are in a conduit draining into a river. Freezing water reaches your knees."
3510 DATA "A narrow service path leads south to a wooden bridge. Drains continue east into","the cavern network."
3520 DATA 2,0,0,0,0,0,3,4,0,0,5,2,0,0,2,9,0,6,0,3,5,0,7,8,0,0,128
3530 DATA 6,0,0,6,0,0,10,4,0,9,11,0,0,10,12,0,0,11,0,13,15,0,14,0,12,13,16
3540 DATA 0,0,0,0,12,0,14,18,0,17,0,0,16,0,16,0,23,0,0,0,20,0,0,21,0,-2,20
3550 DATA 24,0,22,0,23,21,0,22,0,0,18,21,26,0,0,0,0,26,0,24,27,29,25,26,0,0,28
3560 DATA 0,0,27,0,0,33,30,26,0,0,32,29,32,0,0,34,0,31,0,30,29,0,34,0,0,0,31
3570 DATA 33,37,0,0,0,39,0,0,40,0,35,0,-3,-4,0,37,-5,0,36,38,0,45,48,36,0,0,0
3580 DATA 54,42,0,0,41,43,46,38,42,44,0,0,43,0,47,40,0,0,0,43,47,0,0,45,0,46,40
3590 DATA 0,0,-6,0,0,48,50,0,52,49,51,0,0,50,0,50,0,53,0,54,0,0,52,0,53,0,41
3600 DATA "n evil"," wizard "," fiery"," demon ","n axe-wielding"," troll "," fire-breathing"," dragon "," giant"," bat "
3610 DATA "n old and gnarled"," dwarf "," gold"," coin "," useful-looking"," compass "," home-made"," bomb "," blood-red"," ruby "
3620 DATA " sparkling"," diamond "," moon-like"," pearl ","n interesting"," stone "," diamond-studded"," ring "," magic"," pendant "
3630 DATA " most holy"," grail "," mirror-like"," shield "," nondescript black"," box ","n old and rusty"," key "," double-bladed"," sword "
3640 DATA " small lit"," candle "," thin and tatty"," rope "," red house"," brick "," rusty ventilation"," grille "
3650 DATA 36,19,10,14,17,47,8,1,51,45,22,46,54,19,19,19,19,0,34,7,16,15,24,38
3660 DATA 0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,0,0,0,0,0,0,0
3670 DATA " north "," south "," west "," east "
3680 DATA " take "," put "," using "," with "," cut "," break "," unlock "," open "," kill "," attack "
3690 DATA " light "," burn "," up "," down "," jump "," swim "," tie "," untie "," vard "," galar "
3700 DATA " look "," list "," score "," quit "," inventory "," invent "
