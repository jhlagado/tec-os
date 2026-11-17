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
160 PRINT "CAVERNS by John Hardy (c) 1982-83":PRINT "GNU Public License, 2019":ft%=0:tu%=0
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
630 IF vs%=0 THEN PRINT "It's very dark, too dark to see anything...I'm scared!":GOTO 810
640 RESTORE:FOR ix%=1 TO rm%:READ dc%:FOR iy%=1 TO dc%:READ ds$:IF ix%=rm% THEN PRINT ds$
650 NEXT iy%:NEXT ix%
660 IF rm%=20 THEN IF td%=0 THEN PRINT "East: iron-bound door, barred within. Try explosives." ELSE PRINT "East doorway blasted open."
670 IF rm%=28 OR rm%=35 THEN IF rp%=1 THEN PRINT "The secured rope reaches the floor. Use UP or DOWN."
680 IF rm%=35 THEN IF gt% THEN PRINT "North gate open." ELSE PRINT "North gate locked."
690 IF rm%=37 THEN IF cr% THEN PRINT "East seal open." ELSE PRINT "Stones read V, A, R, D. Speak the name."
700 IF rm%=38 THEN IF sh% THEN PRINT "East shaft open." ELSE PRINT "Remove the grille; leave it here. It cannot fit through."
710 IF rm%=48 THEN IF db%=128 THEN PRINT "East drawbridge raised; seek another entrance." ELSE PRINT "East drawbridge lowered."
720 IF rm%=14 THEN IF ob%(4)=0 THEN PRINT "You can also see the bloody corpse of an enormous dragon."
730 IF ce%=1 THEN PRINT "Your candle is growing dim."
740 IF ce%=2 THEN PRINT "Your candle has gone out."
750 qt%=0
760 FOR li%=7 TO 24
770 IF ob%(li%)<>rm% THEN 800
780 IF qt%=0 THEN PRINT "You can also see..."
790 qt%=1:GOSUB 870
800 NEXT li%
810 qt%=0:FOR li%=1 TO 6:IF ob%(li%)=rm% THEN qt%=qt%+1:GOSUB 880
820 NEXT li%:IF qt%=0 THEN 860
830 PRINT "Nearby there lurks..."
840 FOR li%=1 TO 6:IF ob%(li%)=rm% THEN GOSUB 870
850 NEXT li%
860 PRINT:RETURN
870 PRINT "a";ad$(li%);no$(li%);", ";:RETURN
880 IF li%=1 THEN PRINT "An evil wizard bars the way. He cries: Thou shalt not pass!":RETURN
890 IF li%=4 THEN PRINT "A sleeping dragon wakes and breathes jets of fire.":RETURN
900 IF li%=6 THEN PRINT "An old dwarf guards the steps, raising his dagger."
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
1270 IF rs%=1 THEN GOSUB 1170:IF mp%>0 THEN PRINT "The grille cannot fit. DROP GRILLE first.":RETURN ELSE rs%=0
1280 RETURN
1290 rs%=1:IF rm%<>28 THEN PRINT "There is no suitable rail here.":RETURN
1300 IF it%<>22 THEN PRINT "Tie what?":RETURN
1310 wd$=" rail ":GOSUB 1170:IF mp%=0 THEN PRINT "Tie it to what? Try the rail.":RETURN
1320 IF ob%(22)<>-1 THEN PRINT "You must be carrying the rope.":RETURN
1330 ob%(22)=28:rp%=1:PRINT "Rope secured to rail; it reaches the floor.":GOTO 1410
1340 rs%=1:IF rm%<>28 OR rp%=0 THEN PRINT "No secured rope here.":RETURN
1350 rp%=0:PRINT "Rope untied on balcony.":GOTO 1410
1360 rs%=1:IF rp%=0 THEN PRINT "TIE ROPE TO RAIL first.":RETURN
1370 rm%=35:ft%=0:PRINT "You climb down to the temple floor.":GOTO 1410
1380 rs%=1:IF rp%=0 THEN PRINT "There is no secured rope above you.":RETURN
1390 rm%=28:ft%=0:PRINT "You climb up to the balcony.":GOTO 1410
1400 ht%=43:PRINT "You lift the latch. The hatch opens both ways."
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
1600 IF rm%=35 THEN IF nx%=37 AND gt%=0 THEN PRINT "The gate is locked. Use the key.":rs%=1:RETURN
1610 IF rm%=43 THEN IF nx%=38 AND ht%=0 THEN PRINT "The hatch is latched. OPEN HATCH.":rs%=1:RETURN
1620 IF rm%=49 THEN IF nx%=50 OR nx%=48 THEN db%=49
1630 IF nx%=0 THEN PRINT "You can't go that way"
1640 IF nx%=128 THEN PRINT "You fall into the chasm and die.":rs%=3:RETURN
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
1750 ft%=0:PRINT "Suddenly a magic wind carried you to another place...":rm%=16:RETURN
1760 IF rm%<>37 THEN PRINT "Nothing happens here.":RETURN
1770 PRINT "The seal slides open both ways.":cr%=38:RETURN
1780 PRINT "The giant bat carries you to its colony.":rm%=33:ft%=0:ob%(5)=0:RETURN
1790 PRINT "The creature kills you.":rs%=3:RETURN
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
1940 PRINT "Taken: ";:li%=it%:GOSUB 870:PRINT:RETURN
1950 ob%(it%)=rm%:PRINT "Dropped: ";:li%=it%:GOSUB 870:PRINT:RETURN
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
2110 IF li%=2 THEN PRINT "The foe is stunned but quickly regains his balance."
2120 IF li%=3 THEN PRINT "You missed and he deals a blow to your head."
2130 RETURN
2140 PRINT "The sword strikes home and your foe dies.":ob%(fo%)=0
2150 IF fo%<>4 THEN PRINT "A black cloud descends and the corpse vaporises."
2160 fo%=0:ft%=0:RETURN
2170 IF ob%(9)=-1 THEN 2190 ELSE IF ob%(9)=rm% THEN 2190
2180 PRINT "Nothing to ignite here. Keep your candle safe.":RETURN
2190 IF cl%<>1 THEN PRINT "The candle is out; you need a flame.":RETURN
2200 IF rm%<>20 THEN PRINT "BOOM! Smoke clears: nothing has changed.":RETURN
2210 IF td%=19 THEN PRINT "The passage is already open. Save your bomb.":RETURN
2220 PRINT "BOOM! The door is torn from its hinges. The passage east is open.":td%=19:ob%(9)=0:RETURN
2230 PRINT "TIE ROPE TO RAIL at the balcony, then DOWN; UP returns.":rs%=1:RETURN
2240 sc%=0:FOR ix%=7 TO 17
2250 qt%=il%(ix%+24):IF ob%(ix%)=-1 THEN IF rm%=1 THEN sc%=sc%+qt%*2 ELSE sc%=sc%+qt%
2260 IF ob%(ix%)=1 THEN sc%=sc%+qt%*2
2270 NEXT ix%:RETURN
2280 PRINT "Ranking:"
2290 IF sc%<20 THEN PRINT "Hopeless beginner":RETURN
2300 IF sc%<50 THEN PRINT "Experienced loser":RETURN
2310 IF sc%<100 THEN PRINT "Average Viking":RETURN
2320 IF sc%<126 THEN PRINT "Excellent...but you've left something behind!":RETURN
2330 IF sc%=126 THEN PRINT "Perfectionist and genius!!"
2340 RETURN
2350 PRINT "Welcome home! Your treasures are safe."
2360 FOR ix%=7 TO 17:IF ix%<>8 THEN IF ix%<>9 THEN IF ob%(ix%)=-1 THEN ob%(ix%)=1
2370 NEXT ix%:GOSUB 2240:PRINT "Your score is";sc%;" out of 126.":GOSUB 2280
2380 IF sc%=126 THEN PRINT "All treasure home. Your quest is complete!"
2390 PRINT "QUIT to finish, or leave to seek more treasure.":RETURN
2400 END
2410 DATA 2,"You are standing in a darkened room inside a small bark hut. There is a door to"
2420 DATA "the north, leading out into a forest clearing."
2430 DATA 3,"You are in a forest clearing before a small bark hut. There are no windows, and"
2440 DATA "the door to the south is locked. The latch engaged when you closed the door.","The forest lies to the west, and a field of clovers opens to the east."
2450 DATA 3,"You are deep in a dark forest. In the distance you can see a mighty river, its"
2460 DATA "waters glinting through the trees. The path leads east to the hut clearing and","west towards a cliff above the river."
2470 DATA 2,"You are standing in a field of four-leafed clovers. The hut clearing is to the"
2480 DATA "west, and the lower slopes of Mount Ymir rise to the east."
2490 DATA 3,"The forest has opened up at this point. You are standing on a cliff overlooking"
2500 DATA "a wide glacial river. A small foot-beaten path leads south to the riverbank.","The forest path returns east."
2510 DATA 2,"You are standing at the rocky edge of the mighty river Gioll. The path forks"
2520 DATA "east and west, while a small path climbs north to the cliff."
2530 DATA 3,"You are on the edge of an enormous crater. The rim is extremely slippery."
2540 DATA "Clouds of water vapour rise high in the air as the Gioll pours into it. To the","west is a fatal drop; the safe path returns east."
2550 DATA 4,"The path stops here. You are on a rocky outcrop, projecting about fifteen feet"
2560 DATA "above the river. In the distance, a tiny string bridge spans the water to the","south-east. To reach it, you must return west and take the detour through the"
2570 DATA "forest."
2580 DATA 3,"You are on the lower slopes of Mount Ymir. The forest stretches far away to the"
2590 DATA "west. Arctic winds blow fiercely; it is very cold! A path leads west to the","clover field, and another descends south towards the bridge."
2600 DATA 3,"You stand on a rocky precipice high above the river Gioll. Mount Ymir stands to"
2610 DATA "the north. A flimsy string bridge spans the mighty river to the south; the path","north returns to the mountain slopes."
2620 DATA 3,"You have made your way halfway across the creaking bridge. It sways violently"
2630 DATA "from side to side above the river! Hold tight and follow it north or south;","there is no footing to the east or west."
2640 DATA 3,"You are on the southern edge of the mighty river, before the string bridge. The"
2650 DATA "bridge leads north, an oak forest lies to the west, and a path follows the bank","east to a cliff face."
2660 DATA 3,"You are standing on a rock in the middle of a mighty oak forest. Surrounding"
2670 DATA "you are thousands of poisonous mushrooms. A path leads east to the bridge","landing, and another continues south to a clearing."
2680 DATA 3,"You are in a clearing in the forest. An ancient basalt rock formation towers"
2690 DATA "above you. To your south is the entrance of a VERY interesting cave... The path","north returns to the oak forest."
2700 DATA 2,"You are on a shelf against a cliff face, overlooking the river from its"
2710 DATA "southern bank. The path west returns to the string bridge landing."
2720 DATA 3,"You are just inside the cave. Sunlight pours into the entrance, lighting a path"
2730 DATA "to the east and another to the south. I don't mind saying I'm a bit scared! The","way north leads outside. You will need a light before venturing deeper."
2740 DATA 3,"This passage appears to be a dead end. An earlier explorer has scratched a"
2750 DATA "message on the wall before you: 'Find the Sacred Key of Thialfi'. The passage","returns west to the cave entrance."
2760 DATA 2,"You are deep in a dark cavern. Daylight filters in from the cave entrance to"
2770 DATA "the north. A passage leads west into what appears to be an old torture chamber."
2780 DATA 3,"You are in the legendary treasure room of the black elves of Svartalfheim."
2790 DATA "Every red-blooded Viking has dreamed of entering this sacred room! The only way","out leads west through the doorway."
2800 DATA 3,"You stand before an oak doorway in the eastern wall, its heavy timber bound"
2810 DATA "with iron. The entrance looks formidable. The passage south returns to the","cavern."
2820 DATA 3,"You are deep in a dark cavern north of the long tunnel. A passage leads north"
2830 DATA "to an oak doorway, and a draught comes from the corridor to the east. The long","tunnel stretches south into the darkness."
2840 DATA 3,"You are standing in an east-west corridor. You can feel a faint breeze stirring"
2850 DATA "the stale air. The western passage returns to the cavern; a doorway to the","south leads into an old torture chamber."
2860 DATA 5,"You are standing in what appears to have once been a torture chamber. Apart"
2870 DATA "from the rather comprehensive range of instruments of absolutely inhuman agony,","coagulated blood stains on the walls and mangled bits of bone on the floor make"
2880 DATA "me think that a number of would-be adventurers croaked it here! A corridor","leads north, and the entrance cavern lies to the east."
2890 DATA 3,"You stand in a long tunnel which has been bored out of the rock. It runs from"
2900 DATA "north to south, between a cavern and a large round chamber. A faint glow comes","from a narrow, sealed crack in the eastern wall."
2910 DATA 2,"You are deep in a dark cavern. This small side cave is empty and very quiet."
2920 DATA "Its only passage leads west, back to the large round chamber."
2930 DATA 5,"You are in a large round room with a number of exits. The walls have been"
2940 DATA "painted a mystical dark purple, and a big chalk star is drawn in the centre of","the floor. This is one of the hidden chambers of the infamous pagan sect, the"
2950 DATA "monks of Loki. Norse folk believe them to be gods. The long tunnel is north, a","river ledge south, the bat caves west, and a small side cave east."
2960 DATA 3,"You are standing on a narrow ledge, high above a subterranean river. To the"
2970 DATA "east is a balcony overlooking a huge cavern. The passage north returns to the","round chamber."
2980 DATA 5,"You are on a balcony overlooking a huge cavern which has been converted into a"
2990 DATA "pagan temple. It is dedicated to Loki, the god of fire, who came to live in","Svartalfheim after Odin banished him to exile. Since then he has been waiting"
3000 DATA "for the 'End Of All Things'. A sturdy stone rail borders the balcony. The upper","river ledge lies to the west; the temple floor is below."
3010 DATA 3,"You are deep in a dark cavern where the passages meet. A draught stirs the air."
3020 DATA "The round chamber lies to the east, a bat colony to the south, and a forked","stone pillar marks the passage west."
3030 DATA 2,"You are deep in a dark cavern beside a forked stone pillar. The junction lies"
3040 DATA "to the east, and a passage continues west into a pale limestone chamber."
3050 DATA 2,"You are deep in a dark cavern. Water drips from the roof of this low passage."
3060 DATA "It leads north to a pale limestone chamber and east to another chamber beyond."
3070 DATA 3,"You are deep in a dark cavern whose pale limestone walls catch the light. The"
3080 DATA "passage east leads to a forked stone pillar, while a low, dripping passage","turns south."
3090 DATA 4,"You are in the central cave of a giant bat colony. Above you, hundreds of giant"
3100 DATA "bats hang from the ceiling, and the floor is covered in centuries of giant bat","droppings. Careful where you step! Incidentally, the smell is indescribable. A"
3110 DATA "junction lies north, and a passage leads west to another chamber."
3120 DATA 2,"You are deep in a dark cavern beyond the bat colony. Passages lead east towards"
3130 DATA "the roosting bats and west into a low, dripping passage."
3140 DATA 3,"You are in the temple. To the north is a great gate, and on the wall is a giant"
3150 DATA "statue of Loki, carved out of the living rock itself! High overhead is the","balcony from which you descended."
3160 DATA 2,"You are deep in a dark cavern below the temple. A narrow shaft opens to the"
3170 DATA "north, while a passage east leads towards the sound of an underground river."
3180 DATA 3,"You stand in an old and musty crypt, the final resting place of hundreds of"
3190 DATA "Loki's devotees. Putrefaction and decay fill the air here. Four stones on the","eastern wall name its keeper; the temple gate lies to the south."
3200 DATA 3,"You are in a tiny cell. The passage west returns to the crypt, while a"
3210 DATA "ventilation shaft pierces the eastern wall. There is a service hatch to the","north, but its latch is on the drain side."
3220 DATA 2,"You are deep in a dark cavern just beyond the ventilation shaft. The shaft"
3230 DATA "leads west into the cell, and a passage continues south into a lower cavern."
3240 DATA 4,"You are on another ledge high above a subterranean river. Water pours into the"
3250 DATA "cavern through a hole in the roof to the north. The path north leads to the","waterfall; south, it follows the ledge to a river bend. The cavern lies west."
3260 DATA "There is only a sheer drop to the east."
3270 DATA 3,"Somehow you have found your way into the complex drainage system of this entire"
3280 DATA "cavern network! This straight drain leads west to a freezing conduit and east","along the passage towards a junction."
3290 DATA 2,"You are in the complex drainage system of the cavern network. The straight"
3300 DATA "passage runs between the conduit to the west and a junction to the east."
3310 DATA 4,"You are at a junction in the complex drainage system of the cavern network. A"
3320 DATA "winding passage leads north towards a pearl-white chamber. A branch leads east,","and the drain west returns to the conduit. To the south is the cell's service"
3330 DATA "hatch; you can OPEN HATCH here."
3340 DATA 2,"You are in a blind branch of the cavern's complex drainage system. There is no"
3350 DATA "way onwards; the drain west returns to the junction."
3360 DATA 3,"You are standing near an enormous waterfall which brings water down from the"
3370 DATA "surface, from the river Gioll. Stone steps climb north beside the falling","water. The lower ledge lies south; there is no safe footing to the east."
3380 DATA 3,"You are deep in a dark cavern whose walls shine pearl-white in your light."
3390 DATA "Stone steps lie to the west. A winding passage leads south, changing height as","it makes its way to a junction in the drains."
3400 DATA 2,"You are standing at the top of a stone staircase. The steps lead south towards"
3410 DATA "the roar of the waterfall. To the east is a pearl-white chamber."
3420 DATA 4,"You are on a narrow and crumbling ledge at a bend in the river. Across the"
3430 DATA "water to the east you can see a magic castle. Don't ask me why it is magic... I","just know it is! The path north returns to the lower ledge; there is no path"
3440 DATA "south. The drawbridge crossing lies east."
3450 DATA 3,"You are on the mighty golden drawbridge, with the river below you and the magic"
3460 DATA "castle ahead. The river ledge lies west and the courtyard east. Crossing","secures the bridge in its lowered position."
3470 DATA 4,"You are in the courtyard of the magic castle. WOW! This castle is really"
3480 DATA "something! On the wall is inscribed 'hzb tzozi'. The drawbridge lies west, and","a doorway east leads to the powder magazine. A secret escape tunnel leads south"
3490 DATA "to the riverbank."
3500 DATA 2,"You are in the powder magazine of this really super castle. The doorway west"
3510 DATA "leads back into the courtyard."
3520 DATA 3,"You are on the eastern side of the underground river. A small tunnel leads"
3530 DATA "north through the cliff face into the castle. To the west, a wooden bridge","crosses the water."
3540 DATA 2,"You stand before a small wooden bridge which crosses the underground river to"
3550 DATA "the east. A narrow service path leads north towards the conduit."
3560 DATA 3,"You are in a conduit draining into the river. The water comes up to your knees"
3570 DATA "and is freezing cold. A narrow service path leads south to the wooden bridge,","while the drains continue east into the cavern network."
3580 DATA 2,0,0,0,0,0,3,4,0,0,5,2,0,0,2,9,0,6,0,3,5,0,7,8,0,0,128
3590 DATA 6,0,0,6,0,0,10,4,0,9,11,0,0,10,12,0,0,11,0,13,15,0,14,0,12,13,16
3600 DATA 0,0,0,0,12,0,14,18,0,17,0,0,16,0,16,0,23,0,0,0,20,0,0,21,0,-2,20
3610 DATA 24,0,22,0,23,21,0,22,0,0,18,21,26,0,0,0,0,26,0,24,27,29,25,26,0,0,28
3620 DATA 0,0,27,0,0,33,30,26,0,0,32,29,32,0,0,34,0,31,0,30,29,0,34,0,0,0,31
3630 DATA 33,37,0,0,0,39,0,0,40,0,35,0,-3,-4,0,37,-5,0,36,38,0,45,48,36,0,0,0
3640 DATA 54,42,0,0,41,43,46,38,42,44,0,0,43,0,47,40,0,0,0,43,47,0,0,45,0,46,40
3650 DATA 0,0,-6,0,0,48,50,0,52,49,51,0,0,50,0,50,0,53,0,54,0,0,52,0,53,0,41
3660 DATA "n evil"," wizard "," fiery"," demon ","n axe wielding"," troll "," fire breathing"," dragon "," giant"," bat "
3670 DATA "n old and gnarled"," dwarf "," gold"," coin "," useful looking"," compass "," home made"," bomb "," blood red"," ruby "
3680 DATA " sparkling"," diamond "," moon-like"," pearl ","n interesting"," stone "," diamond studded"," ring "," magic"," pendant "
3690 DATA " most holy"," grail "," mirror like"," shield "," nondescript black"," box ","n old and rusty"," key "," double-bladed"," sword "
3700 DATA " small lit"," candle "," thin and tatty"," rope "," red house"," brick "," rusty ventilation"," grille "
3710 DATA 36,19,10,14,17,47,8,1,51,45,22,46,54,19,19,19,19,0,34,7,16,15,24,38
3720 DATA 0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,0,0,0,0,0,0,0
3730 DATA " north "," south "," west "," east "
3740 DATA " take "," put "," using "," with "," cut "," break "," unlock "," open "," kill "," attack "
3750 DATA " light "," burn "," up "," down "," jump "," swim "," tie "," untie "," vard "," galar "
3760 DATA " look "," list "," score "," quit "," inventory "," invent "
