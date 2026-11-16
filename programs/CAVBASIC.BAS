10 REM CAVERNS - John Hardy (c) 1982-83. Microbee edition copyright 1983.
20 REM Dreamcards. GNU GPL release 2019; see CAVERNS.TXT and repository LICENSE.
30 REM Original: github.com/jhlagado/caverns d604815, src/caverns.basic.
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
160 PRINT "CAVERNS by John Hardy (c) 1983":PRINT "GNU Public License, 2019":ft%=0:tu%=0
170 PRINT "Bring treasure home for double points. Take the compass!":PRINT "LOOK describes, INVENTORY lists, SCORE totals, QUIT finishes."
180 REM Apply view-time candle events before rendering; rendering changes no world state.
190 GOSUB 540
200 GOSUB 620
210 GOSUB 1000
220 GOSUB 1090
230 IF vb%=21 THEN 190
240 IF vb%=23 THEN GOSUB 2230:PRINT "Your score is";sc%;" out of 126.":GOTO 210
250 IF vb%=22 THEN GOSUB 910:GOTO 190
260 IF vb%=24 THEN 340
270 REM rs is the result; tc is turn cost. Clarifications are free.
280 rs%=0:tc%=0:ac%=0:GOSUB 1200
290 IF rs%=0 THEN tc%=1:rs%=2:GOSUB 510:IF fo%=5 THEN GOSUB 1770 ELSE GOSUB 1420
300 GOSUB 490
310 IF rs%=3 THEN 340
320 IF rs%=1 THEN 210
330 GOTO 190
340 GOSUB 2230
350 PRINT:PRINT "Score:";sc%;" out of a possible 126 points in";tu%;" moves.":GOSUB 2270:PRINT "Another adventure?"
360 INPUT yn$:IF yn$="N" OR yn$="n" THEN END ELSE IF yn$="Y" OR yn$="y" THEN GOTO 130 ELSE GOTO 360
370 END
380 REM Immutable il: 1..24 starting locations, 25..48 values. Descriptions use one string.
390 RESTORE:FOR ix%=1 TO 54:READ ds$:NEXT ix%
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
630 IF vs%=0 THEN PRINT "It's very dark, too dark to see anything...I'm scared!":GOTO 800
640 RESTORE:FOR ix%=1 TO rm%:READ ds$:NEXT ix%:PRINT ds$
650 IF rm%=20 THEN IF td%=0 THEN PRINT "East: iron-bound door, barred within. Try explosives." ELSE PRINT "East doorway blasted open."
660 IF rm%=28 OR rm%=35 THEN IF rp%=1 THEN PRINT "The secured rope reaches the floor. Use UP or DOWN."
670 IF rm%=35 THEN IF gt% THEN PRINT "North gate open." ELSE PRINT "North gate locked."
680 IF rm%=37 THEN IF cr% THEN PRINT "East seal open." ELSE PRINT "Stones read V, A, R, D. Speak the name."
690 IF rm%=38 THEN IF sh% THEN PRINT "East shaft open." ELSE PRINT "Remove the grille; leave it here. It cannot fit through."
700 IF rm%=48 THEN IF db%=128 THEN PRINT "East drawbridge raised; seek another entrance." ELSE PRINT "East drawbridge lowered."
710 IF rm%=14 THEN IF ob%(4)=0 THEN PRINT "You can also see the bloody corpse of an enormous dragon."
720 IF ce%=1 THEN PRINT "Your candle is growing dim."
730 IF ce%=2 THEN PRINT "Your candle has gone out."
740 qt%=0
750 FOR li%=7 TO 24
760 IF ob%(li%)<>rm% THEN 790
770 IF qt%=0 THEN PRINT "You can also see..."
780 qt%=1:GOSUB 860
790 NEXT li%
800 qt%=0:FOR li%=1 TO 6:IF ob%(li%)=rm% THEN qt%=qt%+1:GOSUB 870
810 NEXT li%:IF qt%=0 THEN 850
820 PRINT "Nearby there lurks..."
830 FOR li%=1 TO 6:IF ob%(li%)=rm% THEN GOSUB 860
840 NEXT li%
850 PRINT:RETURN
860 PRINT "a";ad$(li%);no$(li%);", ";:RETURN
870 IF li%=1 THEN PRINT "An evil wizard bars the way. He cries: Thou shalt not pass!":RETURN
880 IF li%=4 THEN PRINT "A sleeping dragon wakes and breathes jets of fire.":RETURN
890 IF li%=6 THEN PRINT "An old dwarf guards the steps, raising his dagger."
900 RETURN
910 PRINT "You are carrying ";:qt%=0
920 FOR li%=7 TO 24
930 IF ob%(li%)<>-1 THEN 960
940 IF qt%=0 THEN PRINT
950 qt%=1:GOSUB 860
960 NEXT li%
970 IF qt%=0 THEN PRINT "nothing."
980 RETURN
990 REM Normalise once; whole words and alias precedence match the qualified game.
1000 INPUT cm$:IF cm$="" THEN 1000 ELSE cm$=" "+cm$+" "
1010 FOR ix%=1 TO LEN(cm$):cc%=ASC(MID$(cm$,ix%,1)):IF cc%>64 THEN IF cc%<91 THEN cm$=LEFT$(cm$,ix%-1)+CHR$(cc%+32)+MID$(cm$,ix%+1)
1020 NEXT ix%
1030 IF cm$=" n " THEN cm$=" north "
1040 IF cm$=" s " THEN cm$=" south "
1050 IF cm$=" w " THEN cm$=" west "
1060 IF cm$=" e " THEN cm$=" east "
1070 IF cm$=" i " THEN cm$=" list "
1080 RETURN
1090 FOR it%=7 TO 24:wd$=no$(it%):GOSUB 1160:IF mp%>0 THEN 1120
1100 NEXT it%:it%=0
1110 IF it%=0 THEN wd$=" grill ":GOSUB 1160:IF mp%>0 THEN it%=24
1120 FOR vb%=1 TO 26:wd$=ve$(vb%):GOSUB 1160:IF mp%>0 THEN 1140
1130 NEXT vb%:vb%=0:RETURN
1140 IF vb%=10 THEN vb%=9 ELSE IF vb%>24 THEN vb%=22
1150 RETURN
1160 mp%=0:FOR si%=1 TO LEN(cm$)-LEN(wd$)+1
1170 IF MID$(cm$,si%,LEN(wd$))=wd$ THEN mp%=si%:RETURN
1180 NEXT si%:RETURN
1190 REM Validate free clarifications; complete rope/hatch actions return a turn cost.
1200 IF vb%=9 THEN IF it%<>20 THEN PRINT "With what weapon?":rs%=1:RETURN
1210 IF vb%=17 THEN 1280 ELSE IF vb%=18 THEN 1330
1220 IF rm%=28 THEN IF vb%=14 THEN 1350
1230 IF rm%=35 THEN IF vb%=13 THEN 1370
1240 IF vb%=8 AND rm%=43 THEN wd$=" hatch ":GOSUB 1160:IF mp%>0 THEN 1390
1250 IF ob%(24)=-1 THEN IF rm%=38 OR rm%=39 THEN rs%=1:wd$=" east ":IF rm%=39 THEN wd$=" west "
1260 IF rs%=1 THEN GOSUB 1160:IF mp%>0 THEN PRINT "The grille cannot fit. DROP GRILLE first.":RETURN ELSE rs%=0
1270 RETURN
1280 rs%=1:IF rm%<>28 THEN PRINT "There is no suitable rail here.":RETURN
1290 IF it%<>22 THEN PRINT "Tie what?":RETURN
1300 wd$=" rail ":GOSUB 1160:IF mp%=0 THEN PRINT "Tie it to what? Try the rail.":RETURN
1310 IF ob%(22)<>-1 THEN PRINT "You must be carrying the rope.":RETURN
1320 ob%(22)=28:rp%=1:PRINT "Rope secured to rail; it reaches the floor.":GOTO 1400
1330 rs%=1:IF rm%<>28 OR rp%=0 THEN PRINT "No secured rope here.":RETURN
1340 rp%=0:PRINT "Rope untied on balcony.":GOTO 1400
1350 rs%=1:IF rp%=0 THEN PRINT "TIE ROPE TO RAIL first.":RETURN
1360 rm%=35:ft%=0:PRINT "You climb down to the temple floor.":GOTO 1400
1370 rs%=1:IF rp%=0 THEN PRINT "There is no secured rope above you.":RETURN
1380 rm%=28:ft%=0:PRINT "You climb up to the balcony.":GOTO 1400
1390 ht%=43:PRINT "You lift the latch. The hatch opens both ways."
1400 tc%=1:rs%=2:RETURN
1410 REM Dispatch has no jumps into the input loop; every action returns one result.
1420 IF vb%>18 THEN 1520 ELSE IF vb%=0 THEN 1500
1430 IF vb%=9 THEN ac%=3:GOTO 1790
1440 IF vb%<5 THEN ac%=vb%:IF ac%>3 THEN ac%=3
1450 IF vb%<5 THEN 1790 ELSE IF fo%>0 THEN 1780
1460 IF vb%<7 THEN PRINT "Nothing happens!"
1470 IF vb%>6 THEN IF vb%<13 THEN PRINT "Please tell me how."
1480 IF vb%>12 THEN PRINT "I can't!"
1490 PRINT:rs%=1:RETURN
1500 FOR cn%=0 TO 3:wd$=di$(cn%):GOSUB 1160:IF mp%>0 THEN 1550
1510 NEXT cn%
1520 IF vb%=20 THEN 1730
1530 IF vb%=19 THEN 1750
1540 GOTO 1790
1550 IF fo%>0 THEN 1780
1560 IF ob%(8)=-1 THEN 1580 ELSE IF ob%(8)=rm% THEN 1580
1570 PRINT "Without the compass, I lose my bearings!":cn%=INT(RND(1)*4)
1580 ei%=rm%*4+cn%-3:nx%=ex%(ei%):GOSUB 1660
1590 IF rm%=35 THEN IF nx%=37 AND gt%=0 THEN PRINT "The gate is locked. Use the key.":rs%=1:RETURN
1600 IF rm%=43 THEN IF nx%=38 AND ht%=0 THEN PRINT "The hatch is latched. OPEN HATCH.":rs%=1:RETURN
1610 IF rm%=49 THEN IF nx%=50 OR nx%=48 THEN db%=49
1620 IF nx%=0 THEN PRINT "You can't go that way"
1630 IF nx%=128 THEN PRINT "You fall into the chasm and die.":rs%=3:RETURN
1640 IF nx%>0 THEN rm%=nx%:ft%=0
1650 RETURN
1660 IF nx%=-1 THEN nx%=hb%:RETURN
1670 IF nx%=-2 THEN nx%=td%:RETURN
1680 IF nx%=-3 THEN nx%=cr%:RETURN
1690 IF nx%=-4 THEN nx%=ht%:RETURN
1700 IF nx%=-5 THEN nx%=sh%:RETURN
1710 IF nx%=-6 THEN IF db%=128 THEN nx%=0:RETURN ELSE nx%=db%:RETURN
1720 RETURN
1730 IF fo%>0 THEN 1780
1740 ft%=0:PRINT "Suddenly a magic wind carried you to another place...":rm%=16:RETURN
1750 IF rm%<>37 THEN PRINT "Nothing happens here.":RETURN
1760 PRINT "The seal slides open both ways.":cr%=38:RETURN
1770 PRINT "The giant bat carries you to its colony.":rm%=33:ft%=0:ob%(5)=0:RETURN
1780 PRINT "The creature kills you.":rs%=3:RETURN
1790 IF ac%<>0 THEN 1820
1800 ac%=3:wd$=" get ":GOSUB 1160:IF mp%>0 THEN ac%=1:GOTO 1820
1810 wd$=" drop ":GOSUB 1160:IF mp%>0 THEN ac%=2
1820 IF it%<1 THEN IF fo%>0 THEN 1780 ELSE PRINT "eh?":RETURN
1830 IF ob%(it%)=-1 THEN 1850
1840 IF ob%(it%)=rm% THEN 1850 ELSE IF fo%>0 THEN 1780 ELSE PRINT "Not here.":RETURN
1850 IF fo%=0 THEN 1880
1860 IF ac%=3 THEN IF it%=20 THEN IF ob%(20)=-1 THEN 1950
1870 GOTO 1780
1880 IF ac%=1 THEN 1890 ELSE IF ac%=2 THEN 1940 ELSE GOTO 1950
1890 cn%=0:FOR ix%=7 TO 24:IF ob%(ix%)=-1 THEN cn%=cn%+1
1900 NEXT ix%:IF cn%>10 THEN PRINT "You cannot carry more.":RETURN
1910 ob%(it%)=-1:IF it%=24 THEN sh%=39
1920 IF it%=22 THEN rp%=0
1930 PRINT "Taken: ";:li%=it%:GOSUB 860:PRINT:RETURN
1940 ob%(it%)=rm%:PRINT "Dropped: ";:li%=it%:GOSUB 860:PRINT:RETURN
1950 IF it%=9 THEN wd$=" candle ":GOSUB 1160:IF mp%>0 THEN it%=21
1960 IF it%<19 THEN 1990 ELSE IF it%>22 THEN 1990
1970 IF ob%(it%)<>-1 THEN IF ob%(it%)<>rm% THEN PRINT "Where? I can't see it.":RETURN
1980 ON it%-18 GOTO 2000,2020,2160,2220
1990 PRINT "How am I supposed to use it?":RETURN
2000 IF rm%<>2 THEN IF rm%<>35 THEN PRINT "It won't open!":RETURN
2010 PRINT "You opened the door.":IF rm%=2 THEN rm%=1:GOSUB 2340:RETURN ELSE gt%=1:rm%=37:RETURN
2020 IF fo%=0 THEN PRINT "But there's nothing to kill...":RETURN
2030 IF ob%(20)<>-1 THEN PRINT "You aren't carrying that.":RETURN
2040 ft%=ft%+1:IF RND(1)*7+15>ft% THEN 2060
2050 PRINT "You swing with your sword but miss and the creature smashes your skull.":rs%=3:RETURN
2060 IF RND(1)<.38 THEN 2130
2070 li%=INT(RND(1)*4):IF fo%=5 THEN 1770
2080 IF li%=0 THEN PRINT "You attack but the creature moves aside."
2090 IF li%=1 THEN PRINT "The creature deflects your blow."
2100 IF li%=2 THEN PRINT "The foe is stunned but quickly regains his balance."
2110 IF li%=3 THEN PRINT "You missed and he deals a blow to your head."
2120 RETURN
2130 PRINT "The sword strikes home and your foe dies.":ob%(fo%)=0
2140 IF fo%<>4 THEN PRINT "A black cloud descends and the corpse vaporises."
2150 fo%=0:ft%=0:RETURN
2160 IF ob%(9)=-1 THEN 2180 ELSE IF ob%(9)=rm% THEN 2180
2170 PRINT "Nothing to ignite here. Keep your candle safe.":RETURN
2180 IF cl%<>1 THEN PRINT "The candle is out; you need a flame.":RETURN
2190 IF rm%<>20 THEN PRINT "BOOM! Smoke clears: nothing has changed.":RETURN
2200 IF td%=19 THEN PRINT "The passage is already open. Save your bomb.":RETURN
2210 PRINT "BOOM! The door is torn from its hinges. The passage east is open.":td%=19:ob%(9)=0:RETURN
2220 PRINT "TIE ROPE TO RAIL at the balcony, then DOWN; UP returns.":rs%=1:RETURN
2230 sc%=0:FOR ix%=7 TO 17
2240 qt%=il%(ix%+24):IF ob%(ix%)=-1 THEN IF rm%=1 THEN sc%=sc%+qt%*2 ELSE sc%=sc%+qt%
2250 IF ob%(ix%)=1 THEN sc%=sc%+qt%*2
2260 NEXT ix%:RETURN
2270 PRINT "Ranking:"
2280 IF sc%<20 THEN PRINT "Hopeless beginner":RETURN
2290 IF sc%<50 THEN PRINT "Experienced loser":RETURN
2300 IF sc%<100 THEN PRINT "Average Viking":RETURN
2310 IF sc%<126 THEN PRINT "Excellent...but you've left something behind!":RETURN
2320 IF sc%=126 THEN PRINT "Perfectionist and genius!!"
2330 RETURN
2340 PRINT "Welcome home! Your treasures are safe."
2350 FOR ix%=7 TO 17:IF ix%<>8 THEN IF ix%<>9 THEN IF ob%(ix%)=-1 THEN ob%(ix%)=1
2360 NEXT ix%:GOSUB 2230:PRINT "Your score is";sc%;" out of 126.":GOSUB 2270
2370 IF sc%=126 THEN PRINT "All treasure home. Your quest is complete!"
2380 PRINT "QUIT to finish, or leave to seek more treasure.":RETURN
2390 END
2400 DATA "Inside the bark hut. The door leads north to the clearing.","Hut clearing: locked door south, forest west, clover field east."
2410 DATA "Forest path: clearing east, river cliff west. Water glints through the trees.","Clover field: the hut clearing is west; Mount Ymir's slopes lie east."
2420 DATA "Cliff above the Gioll: forest east; a path descends south to the bank.","Riverbank: cliff north, crater west, rocky outcrop east."
2430 DATA "The Gioll pours into a crater. West is a fatal drop. The safe path returns east.","A distant string bridge is visible south-east, beyond the trees. Reach it via the forest; return west."
2440 DATA "Windy slopes of Mount Ymir: clover field west, bridge approach south.","The string bridge crosses the Gioll southwards. Mount Ymir's slopes are north."
2450 DATA "On the swaying string bridge. Follow it north or south; no footing east or west.","Southern bank: string bridge north, oak forest west, rope cliff east."
2460 DATA "A rock amid poisonous mushrooms: bridge landing east, basalt clearing south.","Basalt clearing: oak forest north, cave entrance south."
2470 DATA "A shelf above the Gioll's southern bank. The path west returns to the bridge landing.","Daylit cave entrance: outside north, passages south and east. Take a light first."
2480 DATA "An explorer scratched: Seek the sacred key of Thialfi. The passage returns west.","Entrance cavern: daylight north, old torture chamber west."
2490 DATA "The legendary treasure room of the black elves of Svartalfheim. Only exit: west.","Treasure doorway: south returns to the northern cavern."
2500 DATA "Northern cavern: treasure door north, corridor east, long tunnel south.","Draughty corridor: cavern west, torture chamber south."
2510 DATA "An old torture chamber, stained with blood. Corridor north; entrance cavern east.","Long tunnel: cavern north, round chamber south. A sealed crack glows faintly east."
2520 DATA "Empty side cave. The only exit is west to the round chamber.","Loki's round chamber: tunnel north, upper ledge south, bat caves west, side cave east."
2530 DATA "Upper ledge above an underground river: round chamber north, temple balcony east.","Temple balcony: sturdy stone rail, floor below. West returns to the upper ledge."
2540 DATA "Draughty junction: round chamber east, bat colony south, forked pillar west.","Forked stone pillar: junction east, pale chamber west."
2550 DATA "Low, dripping passage: pale chamber north, key chamber east.","Pale limestone chamber: forked pillar east, low passage south."
2560 DATA "Bat colony: mind the droppings! Junction north, key chamber west.","Key chamber: bat colony east, low passage west."
2570 DATA "Loki's temple: gate north, balcony overhead.","Lower cavern: shaft north, lower river ledge east."
2580 DATA "Crypt: temple gate south, sealed passage east. Four stones name its keeper.","Cell: crypt west, shaft east, service hatch north. Its latch is on the drain side."
2590 DATA "Beyond the shaft: cell west, lower cavern south.","Lower river ledge: cavern west. Paths lead north to the waterfall and south to a river bend. East is a sheer edge."
2600 DATA "Straight drain: conduit west, passage east towards the junction.","Straight drain: conduit west, junction east."
2610 DATA "Drain junction: a winding path north leads to the pearl chamber. Branch east, conduit west; OPEN HATCH south.","Blind drainage branch: return west to the junction."
2620 DATA "The Gioll falls through the roof. Stone steps climb north; the lower ledge is south. No safe footing east.","Pearl-white chamber: steps west; a winding path south leads to the drain junction."
2630 DATA "Top of the stone steps: waterfall south, pearl-white chamber east.","At a river bend, the castle is visible across the water east. Return north, or cross the drawbridge east. No path south."
2640 DATA "Drawbridge: river ledge west, castle courtyard east. Crossing secures the bridge.","Castle courtyard: hzb tzozi. Drawbridge west, magazine east; tunnel south to bank."
2650 DATA "Powder magazine: return west to the courtyard.","Eastern riverbank: castle tunnel north, wooden bridge west."
2660 DATA "Wooden bridge: eastern bank east, conduit service path north.","Freezing conduit: drains east, service path south to the wooden bridge."
2670 DATA 2,0,0,0,0,0,3,4,0,0,5,2,0,0,2,9,0,6,0,3,5,0,7,8,0,0,128
2680 DATA 6,0,0,6,0,0,10,4,0,9,11,0,0,10,12,0,0,11,0,13,15,0,14,0,12,13,16
2690 DATA 0,0,0,0,12,0,14,18,0,17,0,0,16,0,16,0,23,0,0,0,20,0,0,21,0,-2,20
2700 DATA 24,0,22,0,23,21,0,22,0,0,18,21,26,0,0,0,0,26,0,24,27,29,25,26,0,0,28
2710 DATA 0,0,27,0,0,33,30,26,0,0,32,29,32,0,0,34,0,31,0,30,29,0,34,0,0,0,31
2720 DATA 33,37,0,0,0,39,0,0,40,0,35,0,-3,-4,0,37,-5,0,36,38,0,45,48,36,0,0,0
2730 DATA 54,42,0,0,41,43,46,38,42,44,0,0,43,0,47,40,0,0,0,43,47,0,0,45,0,46,40
2740 DATA 0,0,-6,0,0,48,50,0,52,49,51,0,0,50,0,50,0,53,0,54,0,0,52,0,53,0,41
2750 DATA "n evil"," wizard "," fiery"," demon ","n axe wielding"," troll "," fire breathing"," dragon "," giant"," bat "
2760 DATA "n old and gnarled"," dwarf "," gold"," coin "," useful looking"," compass "," home made"," bomb "," blood red"," ruby "
2770 DATA " sparkling"," diamond "," moon-like"," pearl ","n interesting"," stone "," diamond studded"," ring "," magic"," pendant "
2780 DATA " most holy"," grail "," mirror like"," shield "," nondescript black"," box ","n old and rusty"," key "," double-bladed"," sword "
2790 DATA " small lit"," candle "," thin and tatty"," rope "," red house"," brick "," rusty ventilation"," grille "
2800 DATA 36,19,10,14,17,47,8,1,51,45,22,46,54,19,19,19,19,0,34,7,16,15,24,38
2810 DATA 0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,0,0,0,0,0,0,0
2820 DATA " north "," south "," west "," east "
2830 DATA " take "," put "," using "," with "," cut "," break "," unlock "," open "," kill "," attack "
2840 DATA " light "," burn "," up "," down "," jump "," swim "," tie "," untie "," vard "," galar "
2850 DATA " look "," list "," score "," quit "," inventory "," invent "
