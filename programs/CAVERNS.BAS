10 REM CAVERNS - John Hardy (c) 1982-83. Microbee edition copyright 1983.
20 REM Dreamcards. GNU GPL release 2019; see CAVERNS.TXT and repository LICENSE.
30 REM Original prose: github.com/jhlagado/caverns src/protected/caverns.basic.
40 REM Origins: ZX81; VIC-20 port with Ken Stone; Microbee MicroWorld BASIC.
50 REM Recovery: Microbee Software Preservation Project; Alan Laughton (ChickenMan).
60 REM Author-approved TEC-OS rewrite. The archival listing is unchanged.
70 REM Insert experimental lines between these ten-step line numbers.
80 REM State: rm room, ob objects, db drawbridge, ht hatch, sh shaft, td door.
90 REM State: cr crypt, cl crystal glow, ft fatigue, tu turns, rp tied rope, gt gate.
100 REM hb and jf retain reserved CVB2 checkpoint fields. Integers use %.
110 DIM ob%(24),ex%(216),il%(48),ad$(24),no$(24),di$(3),ve$(26),sv%(36)
120 GOSUB 640
130 CLS
140 GOSUB 700
150 PRINT "DREAMCARDS presents..."
160 PRINT "CAVERNS by John Hardy (c) 1982-83":PRINT "GNU General Public License, 2019":ft%=0:tu%=0
170 PRINT "Bring treasure home for double points. Take the compass!":PRINT "Type HELP for commands. See CAVERNS.TXT for the story."
180 REM Apply view-time crystal events before rendering; rendering changes no world state.
190 GOSUB 790
200 GOSUB 870
210 GOSUB 1290
220 IF cm$=" help " THEN GOSUB 460:GOTO 210
230 IF cm$=" save " THEN GOSUB 520:GOTO 210
240 IF cm$=" restore " OR cm$=" load " THEN GOSUB 560:IF sv%(0)<>0 THEN 610 ELSE GOTO 210
250 GOSUB 1400
260 IF vb%=21 THEN 190
270 IF vb%=23 THEN GOSUB 2600:PRINT "Your score is";sc%;" out of 126.":GOTO 210
280 IF vb%=22 THEN GOSUB 1210:GOTO 190
290 IF vb%=24 THEN 370
300 REM rs is the result; tc is turn cost. Clarifications are free.
310 rs%=0:tc%=0:ac%=0:GOSUB 1510
320 IF rs%=0 THEN tc%=1:rs%=2:GOSUB 760:IF fo%=5 THEN GOSUB 2080 ELSE GOSUB 1730
330 GOSUB 740
340 IF rs%=3 THEN 370
350 IF rs%=1 THEN 210
360 GOTO 190
370 GOSUB 2600
380 PRINT:PRINT "You have a score of";sc%;" out of a possible 126 points in";tu%;" moves.":GOSUB 2640:PRINT "Another adventure?"
390 IF sv%(0)<>0 THEN PRINT "Type RESTORE to return to your saved game."
400 GOSUB 1370
410 IF cm$=" n " THEN END
420 IF cm$=" y " THEN 130
430 IF cm$=" help " THEN GOSUB 460:GOTO 400
440 IF cm$=" restore " OR cm$=" load " THEN GOSUB 560:IF sv%(0)<>0 THEN 610
450 GOTO 400
460 PRINT "N/S/E/W, UP/DOWN, LOOK, INVENTORY (I), SCORE, QUIT."
470 PRINT "TAKE or DROP an item. Try USE KEY or ATTACK TROLL WITH SWORD."
480 PRINT "SAVE keeps one game in memory. RESTORE (or LOAD) returns to it."
490 RETURN
500 REM Save room, mutable world state and the current view. RAM only.
510 REM The room number doubles as the valid-slot flag. New adventures keep it.
520 sv%(0)=rm%:sv%(1)=db%:sv%(2)=ht%:sv%(3)=sh%:sv%(4)=td%:sv%(5)=cr%
530 sv%(6)=rp%:sv%(7)=gt%:sv%(8)=cl%:sv%(9)=ft%:sv%(10)=tu%:sv%(11)=vs%:sv%(12)=ce%
540 FOR ix%=1 TO 24:sv%(ix%+12)=ob%(ix%):NEXT ix%
550 PRINT "Game saved in memory.":RETURN
560 IF sv%(0)=0 THEN PRINT "There is no saved game.":RETURN
570 rm%=sv%(0):db%=sv%(1):ht%=sv%(2):sh%=sv%(3):td%=sv%(4):cr%=sv%(5)
580 rp%=sv%(6):gt%=sv%(7):cl%=sv%(8):ft%=sv%(9):tu%=sv%(10):vs%=sv%(11):ce%=sv%(12)
590 FOR ix%=1 TO 24:ob%(ix%)=sv%(ix%+12):NEXT ix%
600 PRINT "Game restored.":RETURN
610 GOSUB 870
620 GOTO 210
630 REM Immutable il: starts and values. Counted prose lines fit the 80-column display.
640 RESTORE:FOR ix%=1 TO 54:READ dc%:FOR iy%=1 TO dc%:READ ds$:NEXT iy%:NEXT ix%
650 FOR ix%=1 TO 216:READ ex%(ix%):NEXT ix%
660 FOR ix%=1 TO 24:READ ad$(ix%),no$(ix%):NEXT ix%
670 FOR ix%=1 TO 48:READ il%(ix%):NEXT ix%
680 FOR ix%=0 TO 3:READ di$(ix%):NEXT ix%
690 FOR ix%=1 TO 26:READ ve$(ix%):NEXT ix%:RETURN
700 hb%=11:db%=128:ht%=0:sh%=0:td%=0:cr%=0:jf%=0:rp%=0:gt%=0
710 FOR ix%=1 TO 24:ob%(ix%)=il%(ix%):NEXT ix%
720 RANDOMIZE
730 rm%=1:cl%=1:fo%=0:it%=0:ft%=0:RETURN
740 IF tc%=1 THEN IF tu%<32767 THEN tu%=tu%+1
750 RETURN
760 FOR fo%=1 TO 6:IF ob%(fo%)=rm% THEN RETURN
770 NEXT fo%:fo%=0:RETURN
780 REM The crystal clock is checked only where the player could see.
790 vs%=1:ce%=0
800 IF rm%<18 THEN 840
810 IF cl%<>1 THEN vs%=0:RETURN
820 IF ob%(21)=rm% THEN 840
830 IF ob%(21)<>-1 THEN vs%=0:RETURN
840 IF cl%=1 THEN IF tu%=201 THEN ce%=1
850 IF cl%=0 OR tu%<230 THEN RETURN
860 cl%=0:ce%=2:RETURN
870 PRINT
880 IF vs%=0 THEN PRINT "It's very dark, too dark to see anything... I'm scared!":GOTO 1060
890 RESTORE:FOR ix%=1 TO rm%:READ dc%:FOR iy%=1 TO dc%:READ ds$:IF ix%=rm% THEN PRINT ds$
900 NEXT iy%:NEXT ix%
910 IF rm%=20 THEN GOSUB 1120
920 IF rm%=28 OR rm%=35 THEN IF rp%=1 THEN PRINT "The rope hangs from the stone rail to the temple floor."
930 IF rm%=35 THEN IF gt% THEN PRINT "The gate to the north stands open." ELSE PRINT "To the north is a locked gate."
940 IF rm%=37 THEN IF cr% THEN PRINT "The stone seal in the eastern wall stands open." ELSE PRINT "The stones are marked V, A, R and D."
950 IF rm%=38 THEN IF sh% THEN PRINT "An open ventilation shaft leads east." ELSE PRINT "A rusty grille covers the ventilation shaft."
960 IF rm%=48 THEN IF db%=128 THEN PRINT "A raised drawbridge keeps you from crossing to the castle." ELSE PRINT "A mighty golden drawbridge spans the waters."
970 IF rm%=14 THEN IF ob%(4)=0 THEN PRINT "You can also see the bloody corpse of an enormous dragon."
980 IF ce%=1 THEN PRINT "The crystal's glow is fading."
990 IF ce%=2 THEN PRINT "The crystal has gone dark."
1000 qt%=0
1010 FOR li%=7 TO 24
1020 IF ob%(li%)<>rm% THEN 1050
1030 IF qt%=0 THEN PRINT "You can also see..."
1040 qt%=1:GOSUB 1150
1050 NEXT li%
1060 qt%=0:FOR li%=1 TO 6:IF ob%(li%)=rm% THEN GOSUB 1170:IF li%<>1 AND li%<>4 AND li%<>6 THEN qt%=qt%+1
1070 NEXT li%:IF qt%=0 THEN 1110
1080 PRINT "Nearby there lurks..."
1090 FOR li%=1 TO 6:IF ob%(li%)=rm% THEN IF li%<>1 AND li%<>4 AND li%<>6 THEN GOSUB 1150
1100 NEXT li%
1110 PRINT:RETURN
1120 IF td% THEN PRINT "An open doorway leads east into the treasure room.":RETURN
1130 PRINT "A formidable oak door bound with iron is locked from the inside."
1140 PRINT "I wonder if even a blast would open it.":RETURN
1150 IF li%=21 AND cl%=0 THEN PRINT "a dark crystal.":RETURN
1160 PRINT "a";ad$(li%);LEFT$(no$(li%),LEN(no$(li%))-1);".":RETURN
1170 IF li%=1 THEN PRINT "Before you in a swirling mist stands an evil wizard with his hand held outwards. 'Thou shalt not pass!' he cries.":RETURN
1180 IF li%=4 THEN PRINT "An enormous green dragon guards the cave entrance. Its eyes flicker open and it leaps up, breathing jets of fire.":RETURN
1190 IF li%=6 THEN PRINT "From around the corner trots an old and gnarled dwarf carrying a lantern. 'My job is to protect these stone steps!' he says and lunges at you with his dagger."
1200 RETURN
1210 PRINT "You are carrying ";:qt%=0
1220 FOR li%=7 TO 24
1230 IF ob%(li%)<>-1 THEN 1260
1240 IF qt%=0 THEN PRINT
1250 qt%=1:GOSUB 1150
1260 NEXT li%
1270 IF qt%=0 THEN PRINT "nothing."
1280 RETURN
1290 GOSUB 1370
1300 IF cm$=" n " THEN cm$=" north "
1310 IF cm$=" s " THEN cm$=" south "
1320 IF cm$=" w " THEN cm$=" west "
1330 IF cm$=" e " THEN cm$=" east "
1340 IF cm$=" i " THEN cm$=" list "
1350 RETURN
1360 REM Normalise once; whole words and alias precedence match the qualified game.
1370 INPUT cm$:IF cm$="" THEN 1370 ELSE cm$=" "+cm$+" "
1380 FOR ix%=1 TO LEN(cm$):cc%=ASC(MID$(cm$,ix%,1)):IF cc%>64 THEN IF cc%<91 THEN cm$=LEFT$(cm$,ix%-1)+CHR$(cc%+32)+MID$(cm$,ix%+1)
1390 NEXT ix%:RETURN
1400 FOR it%=7 TO 24:wd$=no$(it%):GOSUB 1470:IF mp%>0 THEN 1430
1410 NEXT it%:it%=0
1420 IF it%=0 THEN wd$=" grill ":GOSUB 1470:IF mp%>0 THEN it%=24
1430 FOR vb%=1 TO 26:wd$=ve$(vb%):GOSUB 1470:IF mp%>0 THEN 1450
1440 NEXT vb%:vb%=0:RETURN
1450 IF vb%=10 THEN vb%=9 ELSE IF vb%>24 THEN vb%=22
1460 RETURN
1470 mp%=0:FOR si%=1 TO LEN(cm$)-LEN(wd$)+1
1480 IF MID$(cm$,si%,LEN(wd$))=wd$ THEN mp%=si%:RETURN
1490 NEXT si%:RETURN
1500 REM Validate free clarifications; complete rope/hatch actions return a turn cost.
1510 IF vb%=9 THEN IF it%<>20 THEN PRINT "With what weapon?":rs%=1:RETURN
1520 IF vb%=17 THEN 1590 ELSE IF vb%=18 THEN 1640
1530 IF rm%=28 THEN IF vb%=14 THEN 1660
1540 IF rm%=35 THEN IF vb%=13 THEN 1680
1550 IF vb%=8 AND rm%=43 THEN wd$=" hatch ":GOSUB 1470:IF mp%>0 THEN 1700
1560 IF ob%(24)=-1 THEN IF rm%=38 OR rm%=39 THEN rs%=1:wd$=" east ":IF rm%=39 THEN wd$=" west "
1570 IF rs%=1 THEN GOSUB 1470:IF mp%>0 THEN PRINT "The grille is too large to fit through the shaft. You must leave it here.":RETURN ELSE rs%=0
1580 RETURN
1590 rs%=1:IF rm%<>28 THEN PRINT "There is no suitable rail here.":RETURN
1600 IF it%<>22 THEN PRINT "Tie what?":RETURN
1610 wd$=" rail ":GOSUB 1470:IF mp%=0 THEN PRINT "Tie it to what?":RETURN
1620 IF ob%(22)<>-1 THEN PRINT "You must be carrying the rope.":RETURN
1630 ob%(22)=28:rp%=1:PRINT "You tie the rope securely to the stone rail. It reaches the temple floor.":GOTO 1710
1640 rs%=1:IF rm%<>28 OR rp%=0 THEN PRINT "There is no secured rope here.":RETURN
1650 rp%=0:PRINT "You untie the rope from the stone rail.":GOTO 1710
1660 rs%=1:IF rp%=0 THEN PRINT "You must tie the rope to the rail before climbing down.":RETURN
1670 rm%=35:ft%=0:PRINT "You climb down to the temple floor.":GOTO 1710
1680 rs%=1:IF rp%=0 THEN PRINT "There is no secured rope above you.":RETURN
1690 rm%=28:ft%=0:PRINT "You climb up to the balcony.":GOTO 1710
1700 ht%=43:PRINT "You lift the latch and open the service hatch."
1710 tc%=1:rs%=2:RETURN
1720 REM Dispatch has no jumps into the input loop; every action returns one result.
1730 IF vb%>18 THEN 1830 ELSE IF vb%=0 THEN 1810
1740 IF vb%=9 THEN ac%=3:GOTO 2100
1750 IF vb%<5 THEN ac%=vb%:IF ac%>3 THEN ac%=3
1760 IF vb%<5 THEN 2100 ELSE IF fo%>0 THEN 2090
1770 IF vb%<7 THEN PRINT "Nothing happens!"
1780 IF vb%>6 THEN IF vb%<13 THEN PRINT "Please tell me how."
1790 IF vb%>12 THEN PRINT "I can't!"
1800 PRINT:rs%=1:RETURN
1810 FOR cn%=0 TO 3:wd$=di$(cn%):GOSUB 1470:IF mp%>0 THEN 1860
1820 NEXT cn%
1830 IF vb%=20 THEN 2040
1840 IF vb%=19 THEN 2060
1850 GOTO 2100
1860 IF fo%>0 THEN 2090
1870 IF ob%(8)=-1 THEN 1890 ELSE IF ob%(8)=rm% THEN 1890
1880 PRINT "Without the compass, I lose my bearings!":cn%=INT(RND(1)*4)
1890 ei%=rm%*4+cn%-3:nx%=ex%(ei%):GOSUB 1970
1900 IF rm%=35 THEN IF nx%=37 AND gt%=0 THEN PRINT "The gate is locked.":rs%=1:RETURN
1910 IF rm%=43 THEN IF nx%=38 AND ht%=0 THEN PRINT "The service hatch is latched shut.":rs%=1:RETURN
1920 IF rm%=49 THEN IF nx%=50 OR nx%=48 THEN db%=49
1930 IF nx%=0 THEN PRINT "You can't go that way."
1940 IF nx%=128 THEN PRINT "You stumble and fall into the crater and smash yourself to a pulp on the rocks below.":rs%=3:RETURN
1950 IF nx%>0 THEN rm%=nx%:ft%=0
1960 RETURN
1970 IF nx%=-1 THEN nx%=hb%:RETURN
1980 IF nx%=-2 THEN nx%=td%:RETURN
1990 IF nx%=-3 THEN nx%=cr%:RETURN
2000 IF nx%=-4 THEN nx%=ht%:RETURN
2010 IF nx%=-5 THEN nx%=sh%:RETURN
2020 IF nx%=-6 THEN IF db%=128 THEN nx%=0:RETURN ELSE nx%=db%:RETURN
2030 RETURN
2040 IF fo%>0 THEN 2090
2050 ft%=0:PRINT "Suddenly a magic wind carries you to another place...":rm%=16:RETURN
2060 IF rm%<>37 THEN PRINT "Nothing happens here.":RETURN
2070 PRINT "The eastern wall of the crypt slides open.":cr%=38:RETURN
2080 PRINT "The giant bat picks you up and carries you to its colony.":rm%=33:ft%=0:ob%(5)=0:RETURN
2090 PRINT "You have been killed by ";:li%=fo%:GOSUB 1150:rs%=3:RETURN
2100 IF ac%<>0 THEN 2130
2110 ac%=3:wd$=" get ":GOSUB 1470:IF mp%>0 THEN ac%=1:GOTO 2130
2120 wd$=" drop ":GOSUB 1470:IF mp%>0 THEN ac%=2
2130 IF it%<1 THEN IF fo%>0 THEN 2090 ELSE PRINT "eh?":RETURN
2140 IF ob%(it%)=-1 THEN 2160
2150 IF ob%(it%)=rm% THEN 2160 ELSE IF fo%>0 THEN 2090 ELSE PRINT "Not here.":RETURN
2160 IF fo%=0 THEN 2190
2170 IF ac%=3 THEN IF it%=20 THEN IF ob%(20)=-1 THEN 2280
2180 GOTO 2090
2190 IF ac%=1 THEN 2200 ELSE IF ac%=2 THEN 2270 ELSE GOTO 2280
2200 cn%=0:FOR ix%=7 TO 24:IF ob%(ix%)=-1 THEN cn%=cn%+1
2210 NEXT ix%:IF cn%>10 THEN PRINT "You are carrying too many objects.":RETURN
2220 ob%(it%)=-1:IF it%=24 THEN sh%=39
2230 IF it%=22 THEN rp%=0
2240 PRINT "You take ";:li%=it%:GOSUB 1150:PRINT
2250 IF it%=9 THEN 2560
2260 RETURN
2270 ob%(it%)=rm%:PRINT "You drop ";:li%=it%:GOSUB 1150:PRINT:RETURN
2280 IF it%=9 THEN 2490
2290 IF it%<19 THEN 2320 ELSE IF it%>22 THEN 2320
2300 IF ob%(it%)<>-1 THEN IF ob%(it%)<>rm% THEN PRINT "Where? I can't see it.":RETURN
2310 ON it%-18 GOTO 2330,2350,2320,2580
2320 PRINT "How am I supposed to use it?":RETURN
2330 IF rm%<>2 THEN IF rm%<>35 THEN PRINT "It won't open!":RETURN
2340 PRINT "You opened the door.":IF rm%=2 THEN rm%=1:GOSUB 2710:RETURN ELSE gt%=1:rm%=37:RETURN
2350 IF fo%=0 THEN PRINT "But there's nothing to kill...":RETURN
2360 IF ob%(20)<>-1 THEN PRINT "You aren't carrying that.":RETURN
2370 ft%=ft%+1:IF RND(1)*7+15>ft% THEN 2390
2380 PRINT "You swing with your sword but miss and the creature smashes your skull.":rs%=3:RETURN
2390 IF RND(1)<.38 THEN 2460
2400 li%=INT(RND(1)*4):IF fo%=5 THEN 2080
2410 IF li%=0 THEN PRINT "You attack but the creature moves aside."
2420 IF li%=1 THEN PRINT "The creature deflects your blow."
2430 IF li%=2 THEN PRINT "The foe is stunned but quickly regains its balance."
2440 IF li%=3 THEN IF fo%=4 THEN PRINT "You miss and the dragon breathes fire at you." ELSE PRINT "You miss and the creature strikes back."
2450 RETURN
2460 PRINT "The sword strikes home and your foe dies.":ob%(fo%)=0
2470 IF fo%<>4 THEN PRINT "Suddenly a black cloud descends and the corpse vaporises into nothing."
2480 fo%=0:ft%=0:RETURN
2490 wd$=no$(21):GOSUB 1470:IF mp%=0 THEN 2560
2500 IF ob%(21)<>-1 THEN PRINT "You need to carry the crystal.":RETURN
2510 IF rm%<>20 THEN PRINT "The seal glints briefly. Nothing else happens.":RETURN
2520 PRINT "A thread of blue light leaps from the crystal. The flask cracks."
2530 PRINT "Pale fire races along the iron bands. The oak groans and bursts inwards."
2540 PRINT "Beyond the smoke a passage leads east."
2550 td%=19:ob%(9)=0:RETURN
2560 PRINT "The flask holds enchanted powder."
2570 PRINT "Its seal reads: 'Use with the crystal. Stand well back.'":RETURN
2580 rs%=1:IF rm%=28 THEN PRINT "The stone rail looks strong enough to hold the rope." ELSE PRINT "There is nowhere to fasten the rope here."
2590 RETURN
2600 sc%=0:FOR ix%=7 TO 17
2610 qt%=il%(ix%+24):IF ob%(ix%)=-1 THEN IF rm%=1 THEN sc%=sc%+qt%*2 ELSE sc%=sc%+qt%
2620 IF ob%(ix%)=1 THEN sc%=sc%+qt%*2
2630 NEXT ix%:RETURN
2640 PRINT "This gives you an adventurer's ranking of:"
2650 IF sc%<20 THEN PRINT "Hopeless beginner":RETURN
2660 IF sc%<50 THEN PRINT "Experienced loser":RETURN
2670 IF sc%<100 THEN PRINT "Average Viking":RETURN
2680 IF sc%<126 THEN PRINT "Excellent... but you've left something behind!":RETURN
2690 IF sc%=126 THEN PRINT "Perfectionist and genius!!"
2700 RETURN
2710 PRINT "Welcome home!"
2720 FOR ix%=7 TO 17:IF ix%<>8 THEN IF ix%<>9 THEN IF ob%(ix%)=-1 THEN ob%(ix%)=1
2730 NEXT ix%:GOSUB 2600:PRINT "Your score is";sc%;" out of 126.":GOSUB 2640
2740 IF sc%=126 THEN PRINT "For a moment the little bark hut feels like a king's hall."
2750 IF sc%=126 THEN PRINT "The lost treasures of Svartalfheim gleam before you. Your quest is complete!"
2760 PRINT "QUIT to finish, or leave to seek more treasure.":RETURN
2770 END
2780 DATA 2,"You are in a darkened room inside a small bark hut. A door leads north to a"
2790 DATA "forest clearing."
2800 DATA 2,"You are in a forest clearing before a small windowless bark hut. The door to"
2810 DATA "the south is locked. A forest lies west and a field of clovers opens east."
2820 DATA 3,"You are deep in a dark forest. In the distance a mighty river glints through"
2830 DATA "the trees. A path leads east to the clearing by the hut and west towards a","river cliff."
2840 DATA 2,"You stand in a field of four-leafed clovers. The clearing by the hut lies west"
2850 DATA "and the slopes of Mount Ymir rise to the east."
2860 DATA 2,"The forest opens onto a cliff above a wide glacial river. A foot-beaten path"
2870 DATA "leads south to the riverbank. A forest path leads east."
2880 DATA 2,"You stand at the rocky edge of the mighty river Gioll. A path forks east and"
2890 DATA "west while another climbs north to a cliff."
2900 DATA 3,"You stand on the slippery rim of an enormous crater. Clouds of water vapour"
2910 DATA "rise high into the air as the Gioll pours into it. West is a fatal drop. A safe","path leads east."
2920 DATA 2,"The path ends here. You are on a rocky outcrop fifteen feet above the river. A"
2930 DATA "tiny string bridge spans the water to the south-east."
2940 DATA 3,"You are on the lower slopes of Mount Ymir. The forest stretches far away to the"
2950 DATA "west. Arctic winds blow fiercely. It is very cold! A path leads west to a field","of clovers and another descends south towards the bridge."
2960 DATA 2,"You stand on a rocky precipice high above the Gioll. Mount Ymir rises to the"
2970 DATA "north. A flimsy string bridge spans the river to the south."
2980 DATA 2,"You are halfway across a creaking bridge. It sways violently above the river!"
2990 DATA "Hold tight and follow it either north or south."
3000 DATA 3,"You stand on the southern bank of the mighty river. A string bridge leads"
3010 DATA "north. An oak forest lies west and a path follows the bank east to a cliff","face."
3020 DATA 2,"You stand on a rock in a mighty oak forest. Thousands of poisonous mushrooms"
3030 DATA "surround you. A path leads east to a bridge landing and south to a clearing."
3040 DATA 3,"You are in a forest clearing. An ancient basalt rock formation towers above"
3050 DATA "you. A VERY interesting cave opens to the south... A path leads north into the","oak forest."
3060 DATA 2,"You are on a shelf against a cliff face overlooking the river. A path leads"
3070 DATA "west to a string bridge landing."
3080 DATA 3,"You are just inside a cave. Sunlight pours in, lighting paths east and south. I"
3090 DATA "don't mind saying I'm a bit scared! North leads outside. You will need a light","to venture deeper."
3100 DATA 2,"This passage appears to be a dead end. An earlier explorer scratched a message"
3110 DATA "on the wall: 'Find the Sacred Key of Thialfi'. The cave entrance lies west."
3120 DATA 2,"You are in a dark cavern. Daylight filters in from a cave entrance to the"
3130 DATA "north. A passage leads west into what appears to be an old torture chamber."
3140 DATA 3,"You are in the legendary treasure room of the black elves of Svartalfheim."
3150 DATA "Every red-blooded Viking dreams of entering this sacred room! A doorway leads","west."
3160 DATA 1,"You stand before a doorway. A passage leads south to a cavern."
3170 DATA 3,"You are deep in a dark cavern. A passage leads north to an oak doorway. A"
3180 DATA "draught comes from a corridor to the east. A long tunnel stretches south into","darkness."
3190 DATA 2,"You are in a corridor. A faint breeze stirs the stale air. A passage leads west"
3200 DATA "to a dark cavern and a doorway to the south opens into a torture chamber."
3210 DATA 4,"This was once a torture chamber. Instruments of inhuman agony, coagulated blood"
3220 DATA "on the walls and mangled bones on the floor make me think some would-be","adventurers croaked it here! A corridor leads north. A cavern near the cave"
3230 DATA "entrance lies east."
3240 DATA 2,"You stand in a long tunnel bored through the rock. It runs north to a cavern"
3250 DATA "and south to a large round chamber."
3260 DATA 2,"You are in a small silent side cave. Its only passage leads west to a large"
3270 DATA "round chamber."
3280 DATA 5,"You are in a large round room. The walls are painted a mystical dark purple. A"
3290 DATA "big chalk star marks the centre of the floor. This is a hidden chamber of the","infamous monks of Loki. Norse folk believe them to be gods. A long tunnel leads"
3300 DATA "north. A passage leads south to a river ledge. A passage west leads towards bat","caves. A small side cave opens east."
3310 DATA 2,"You stand on a narrow ledge high above a subterranean river. To the east is a"
3320 DATA "balcony overlooking a huge cavern. A passage leads north to a round chamber."
3330 DATA 4,"You are on a balcony overlooking a huge cavern converted into a temple to Loki."
3340 DATA "Loki, the god of fire, came to Svartalfheim after Odin banished him. Here he","waits for the 'End Of All Things'. A sturdy stone rail borders the balcony"
3350 DATA "above the temple floor. A passage leads west to a river ledge."
3360 DATA 3,"You are in a dark cavern where passages meet. A draught stirs the air. A round"
3370 DATA "chamber lies east and a bat colony lies south. A forked stone pillar marks a","passage west."
3380 DATA 2,"You are beside a forked stone pillar in a dark cavern. A junction lies east and"
3390 DATA "a passage leads west to a pale limestone chamber."
3400 DATA 2,"Water drips from the roof of this low passage. It leads north to a pale"
3410 DATA "limestone chamber and east to another chamber."
3420 DATA 2,"The pale limestone walls of a dark cavern catch the light. A passage leads east"
3430 DATA "to a forked stone pillar and a low dripping passage turns south."
3440 DATA 4,"You are in the heart of a giant bat colony. Hundreds of bats hang from the"
3450 DATA "ceiling. Centuries of droppings cover the floor. Careful where you step!","Incidentally, the smell is indescribable. A junction lies north and a passage"
3460 DATA "leads west to another chamber."
3470 DATA 2,"You are deep in a dark cavern. Passages lead east towards roosting bats and"
3480 DATA "west into a low dripping passage."
3490 DATA 2,"You are in the temple. On the wall is a giant statue of Loki carved out of the"
3500 DATA "living rock itself! A balcony stands high overhead."
3510 DATA 2,"You are deep in a dark cavern below the temple. A narrow shaft opens to the"
3520 DATA "north. A passage leads east towards the sound of an underground river."
3530 DATA 3,"You stand in an old musty crypt where hundreds of Loki's devotees were laid to"
3540 DATA "rest. The air reeks of decay. Four stones in the eastern wall name its keeper.","A gate leads south to the temple."
3550 DATA 3,"You are in a tiny cell. A passage leads west to a crypt. A ventilation shaft"
3560 DATA "pierces the eastern wall. A service hatch lies to the north with its latch on","the drain side."
3570 DATA 2,"You are deep in a dark cavern beside a ventilation shaft. The shaft leads west"
3580 DATA "to a cell and a passage leads south into a lower cavern."
3590 DATA 3,"You stand on a ledge high above a subterranean river. Water pours through a"
3600 DATA "hole in the roof to the north. A path leads north to the waterfall and south to","a river bend. A cavern lies west. East is a sheer drop."
3610 DATA 2,"Somehow you have found your way into the drains of this entire cavern network!"
3620 DATA "A straight drain leads west to a freezing conduit and east towards a junction."
3630 DATA 2,"You are in a straight drain. It leads west towards a conduit and east to a"
3640 DATA "junction."
3650 DATA 3,"You stand at a drain junction. A winding passage leads north towards a"
3660 DATA "pearl-white chamber. A branch runs east. A drain leads west towards a conduit.","The cell's service hatch lies south with its latch on this side."
3670 DATA 2,"You are in a blind branch of the cavern drains. The only way out is west"
3680 DATA "towards a junction."
3690 DATA 3,"You stand beside an enormous waterfall fed by the river Gioll on the surface."
3700 DATA "Stone steps climb north beside the falling water. A ledge lies south. There is","no safe footing to the east."
3710 DATA 2,"Your light catches pearl-white walls in a dark cavern. Stone steps lie west. A"
3720 DATA "winding passage leads south to a drain junction below."
3730 DATA 2,"You stand at the top of a stone staircase. Steps descend south towards the roar"
3740 DATA "of the waterfall. A pearl-white chamber lies east."
3750 DATA 3,"You stand on a narrow crumbling ledge at a bend in the river. Across the water"
3760 DATA "to the east is a magic castle. Don't ask me why it is magic... I just know it","is! A path leads north to another ledge."
3770 DATA 2,"You stand on a mighty golden drawbridge above the river. Beyond it is a magic"
3780 DATA "castle! A river ledge lies west and the courtyard lies east."
3790 DATA 4,"You are in the courtyard of a magic castle. WOW! This castle is really"
3800 DATA "something! On the wall is inscribed 'hzb tzozi'. A drawbridge lies west and a","doorway leads east to a store-room. An escape tunnel leads south to a"
3810 DATA "riverbank."
3820 DATA 2,"You are in the store-room of this really super castle. A doorway leads west"
3830 DATA "into the courtyard."
3840 DATA 3,"You are on the eastern bank of an underground river. A small tunnel leads north"
3850 DATA "through the cliff face into a castle. A wooden bridge crosses the river to the","west."
3860 DATA 2,"A small wooden bridge crosses an underground river to the east. A narrow"
3870 DATA "service path leads north towards a conduit."
3880 DATA 3,"You are in a conduit draining into the river. The water comes up to your knees"
3890 DATA "and is freezing cold. A narrow service path leads south to a wooden bridge.","Drains continue east into the cavern network."
3900 DATA 2,0,0,0,0,0,3,4,0,0,5,2,0,0,2,9,0,6,0,3,5,0,7,8,0,0,128
3910 DATA 6,0,0,6,0,0,10,4,0,9,11,0,0,10,12,0,0,11,0,13,15,0,14,0,12,13,16
3920 DATA 0,0,0,0,12,0,14,18,0,17,0,0,16,0,16,0,23,0,0,0,20,0,0,21,0,-2,20
3930 DATA 24,0,22,0,23,21,0,22,0,0,18,21,26,0,0,0,0,26,0,24,27,29,25,26,0,0,28
3940 DATA 0,0,27,0,0,33,30,26,0,0,32,29,32,0,0,34,0,31,0,30,29,0,34,0,0,0,31
3950 DATA 33,37,0,0,0,39,0,0,40,0,35,0,-3,-4,0,37,-5,0,36,38,0,45,48,36,0,0,0
3960 DATA 54,42,0,0,41,43,46,38,42,44,0,0,43,0,47,40,0,0,0,43,47,0,0,45,0,46,40
3970 DATA 0,0,-6,0,0,48,50,0,52,49,51,0,0,50,0,50,0,53,0,54,0,0,52,0,53,0,41
3980 DATA "n evil"," wizard "," fiery"," demon ","n axe-wielding"," troll "," fire-breathing"," dragon "," giant"," bat "
3990 DATA "n old and gnarled"," dwarf "," gold"," coin "," useful-looking"," compass "," sealed"," flask "," blood-red"," ruby "
4000 DATA " sparkling"," diamond "," moon-like"," pearl ","n interesting"," stone "," diamond-studded"," ring "," magic"," pendant "
4010 DATA " most holy"," grail "," mirror-like"," shield "," nondescript black"," box ","n old and rusty"," key "," double-bladed"," sword "
4020 DATA " small glowing"," crystal "," thin and tatty"," rope "," red house"," brick "," rusty ventilation"," grille "
4030 DATA 36,19,10,14,17,47,8,1,51,45,22,46,54,19,19,19,19,0,34,7,16,15,24,38
4040 DATA 0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,0,0,0,0,0,0,0
4050 DATA " north "," south "," west "," east "
4060 DATA " take "," put "," using "," with "," cut "," break "," unlock "," open "," kill "," attack "
4070 DATA " light "," burn "," up "," down "," jump "," swim "," tie "," untie "," vard "," galar "
4080 DATA " look "," list "," score "," quit "," inventory "," invent "
