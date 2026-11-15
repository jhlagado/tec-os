1 REM CAVERNS - John Hardy (c) 1982-83. Microbee edition copyright 1983.
2 REM Dreamcards. GNU GPL release 2019; see CAVERNS.TXT and repository LICENSE.
3 REM Original: github.com/jhlagado/caverns d604815, src/caverns.basic.
4 REM Author-approved TEC-OS/BAZA refinements: github.com/jhlagado/tec-os.
5 REM Origins: ZX81; VIC-20 port with Ken Stone; Microbee MicroWorld BASIC.
6 REM Recovery: Microbee Software Preservation Project; Alan Laughton (ChickenMan).
7 REM Tables cached once; integer state. The archival listing is unchanged.
10 DIM p%(24),ex%(216),ip%(24),na$(24),no$(24),di$(3),ve$(26)
11 RESTORE:FOR x%=1 TO 54:READ D0$:NEXT x%:FOR x%=1 TO 216:READ ex%(x%):NEXT x%
12 FOR x%=1 TO 24:READ na$(x%),no$(x%):NEXT x%
13 FOR x%=1 TO 24:READ ip%(x%):NEXT x%
14 FOR x%=0 TO 3:READ di$(x%):NEXT x%
15 FOR x%=1 TO 26:READ ve$(x%):NEXT x%
20 CLS
21 h%=11:d%=128:w%=0:g%=0:t%=0:e%=0:j%=0:r0%=0:k0%=0
22 FOR x%=1 TO 24:p%(x%)=ip%(x%):NEXT x%
25 RANDOMIZE
26 a%=1:c0%=1:z%=0:m%=0:f%=0
30 PRINT "DREAMCARDS presents..."
40 PRINT "CAVERNS by John Hardy (c) 1983":PRINT "GNU Public License, 2019":f%=0:u%=0
41 PRINT "Bring treasure home for double points. Take the compass!":PRINT "LOOK describes, INVENTORY lists, SCORE totals, QUIT finishes."
50 PRINT
60 REM Hostile actions are resolved after command parsing.
70 IF a%<18 THEN 100
71 IF c0%<>1 THEN 80
72 IF p%(21)=a% THEN 100
73 IF p%(21)=-1 THEN 100
80 PRINT "It's very dark, too dark to see anything...I'm scared!"
90 GOTO 720
100 RESTORE:FOR x%=1 TO a%:READ D0$:NEXT x%:PRINT D0$
120 IF a%=20 THEN IF t%=0 THEN PRINT "East: iron-bound door, barred within. Try explosives." ELSE PRINT "East doorway blasted open."
130 IF a%=28 OR a%=35 THEN IF r0%=1 THEN PRINT "The secured rope reaches the floor. Use UP or DOWN."
140 IF a%=35 THEN IF k0% THEN PRINT "North gate open." ELSE PRINT "North gate locked."
150 IF a%=37 THEN IF e% THEN PRINT "East seal open." ELSE PRINT "Stones read V, A, R, D. Speak the name."
160 IF a%=38 THEN IF g% THEN PRINT "East shaft open." ELSE PRINT "Remove the grille; leave it here. It cannot fit through."
180 IF a%=48 THEN IF d%=128 THEN PRINT "East drawbridge raised; seek another entrance." ELSE PRINT "East drawbridge lowered."
570 IF a%=14 THEN IF p%(4)=0 THEN  PRINT "You can also see the bloody corpse of an enormous dragon."
590 IF c0%=1 THEN IF u%=201 THEN PRINT "Your candle is growing dim."
600 IF c0%=0 OR u%<230 THEN 630
610 c0%=0
620 PRINT "Your candle has gone out."
630 v%=0
640 FOR l%=7 TO 24
650 IF p%(l%)=a% THEN  LET v%=v%+1
660 NEXT l%
670 IF v%=0 THEN 720
680 PRINT "You can also see..."
690 FOR l%=7 TO 24
700 IF p%(l%)=a% THEN  GOSUB 1650
710 NEXT l%
720 v%=0: FOR l%=1 TO 6: IF p%(l%)=a% THEN  LET v%=v%+1: GOSUB 2070
730 NEXT l%: IF v%=0 THEN 770
740 PRINT "Nearby there lurks..."
750 FOR l%=1 TO 6: IF p%(l%)=a% THEN  GOSUB 1650
760 NEXT l%
770 PRINT
780 REM Informational commands remain safe at the prompt.
790 INPUT A0$:IF A0$="" THEN 790 ELSE A0$=" "+A0$+" "
800 FOR x%=1 TO LEN(A0$):y%=ASC(MID$(A0$,x%,1)):IF y%>64 THEN IF y%<91 THEN A0$=LEFT$(A0$,x%-1)+CHR$(y%+32)+MID$(A0$,x%+1)
810 NEXT x%
811 IF A0$=" n " THEN A0$=" north "
812 IF A0$=" s " THEN A0$=" south "
813 IF A0$=" w " THEN A0$=" west "
814 IF A0$=" e " THEN A0$=" east "
815 IF A0$=" i " THEN A0$=" list "
816 REM INVENTORY and INVENT are recognised as verbs.
830 FOR m%=7 TO 24:SS$=no$(m%)
840 GOSUB 3000:IF sr%>0 THEN 852
850 NEXT m%:m%=0
851 IF m%=0 THEN SS$=" grill ":GOSUB 3000:IF sr%>0 THEN m%=24
852 FOR o%=1 TO 26:SS$=ve$(o%):GOSUB 3000:IF sr%>0 THEN 854
853 NEXT o%:o%=0:GOTO 860
854 IF o%>24 THEN o%=22
860 REM The string bridge remains usable for the return journey.
920 IF o%=21 THEN GOTO 50
925 IF o%=23 THEN GOSUB 3300:PRINT "Your score is";s%;" out of 126.":GOTO 790
930 IF o%<>22 THEN 1010
940 PRINT "You are carrying ";:v%=0
950 FOR l%=7 TO 24
960 IF p%(l%)=-1 THEN  LET v%=v%+1
970 NEXT l%
980 IF v%=0 THEN  PRINT "nothing.": GOTO 50
990 PRINT : FOR l%=7 TO 24: IF p%(l%)=-1 THEN  GOSUB 1650
1000 NEXT l%: GOTO 50
1010 IF o%<>24 THEN 1065
1020 GOSUB 3300:GOTO 1050
1050 PRINT:PRINT "Score:";s%;" out of a possible 126 points in";u%;" moves.":GOSUB 1920:PRINT "Another adventure?"
1060 INPUT Y0$:IF Y0$="N" OR Y0$="n" THEN END ELSE IF Y0$="Y" OR Y0$="y" THEN GOTO 20 ELSE GOTO 1060
1065 pf%=0:ac%=0:GOSUB 3400:IF pf%=1 THEN 790 ELSE IF pf%=2 THEN 50
1070 IF u%<32767 THEN u%=u%+1
1071 FOR z%=1 TO 6:IF p%(z%)=a% THEN 1090
1080 NEXT z%:z%=0: GOTO 1660
1090 IF z%=5 THEN PRINT "The giant bat carries you to its colony.":a%=33:f%=0:p%(5)=0:GOTO 50
1091 GOTO 1660
1110 PRINT "The creature kills you.":GOTO 1020
1130 FOR q%=0 TO 3:SS$=di$(q%):GOSUB 3000:IF sr%>0 THEN 1150
1140 NEXT q%: GOTO 1240
1150 IF z%>0 THEN 1110
1151 IF p%(8)=-1 THEN 1170 ELSE IF p%(8)=a% THEN 1170
1160 PRINT "Without the compass, I lose my bearings!":q%=INT(RND(1)*4)
1170 ix%=a%*4+q%-3:b%=ex%(ix%)
1180 GOSUB 3100
1181 IF a%=35 THEN IF b%=37 AND k0%=0 THEN PRINT "The gate is locked. Use the key.":GOTO 790
1182 IF a%=43 THEN IF b%=38 AND w%=0 THEN PRINT "The hatch is latched. OPEN HATCH.":GOTO 790
1183 IF a%=49 THEN IF b%=50 OR b%=48 THEN d%=49
1190 REM The destination is in b%.
1200 IF b%=0 THEN  PRINT "You can't go that way"
1210 IF b%=128 THEN  PRINT "You fall into the chasm and die.": GOTO 1020
1220 IF b%>0 THEN a%=b%:f%=0
1230  GOTO 50
1240 IF o%<>20 THEN 1260
1250 IF z%>0 THEN 1110 ELSE f%=0:PRINT "Suddenly a magic wind carried you to another place...":a%=16:GOTO 50
1260 IF o%<>19 THEN 1280
1265 IF a%<>37 THEN PRINT "Nothing happens here.":GOTO 50
1270 PRINT "The seal slides open both ways.":e%=38:GOTO 50
1280 IF ac%<>0 THEN 1285
1281 ac%=3:SS$=" get ":GOSUB 3000:IF sr%>0 THEN ac%=1:GOTO 1285
1282 SS$=" drop ":GOSUB 3000:IF sr%>0 THEN ac%=2
1285 IF m%<1 THEN IF z%>0 THEN 1110 ELSE PRINT "eh?":GOTO 50
1290 IF p%(m%)=-1 THEN 1292
1291 IF p%(m%)=a% THEN 1292 ELSE IF z%>0 THEN 1110 ELSE PRINT "Not here.":GOTO 50
1292 IF z%=0 THEN 1300
1293 IF ac%=3 THEN IF m%=20 THEN IF p%(20)=-1 THEN 1390
1294 GOTO 1110
1300 IF ac%=1 THEN 1310 ELSE IF ac%=2 THEN 1380 ELSE 1390
1310 q%=0
1320 FOR x%=7 TO 24
1330 IF p%(x%)=-1 THEN  LET q%=q%+1
1340 NEXT x%
1350 IF q%>10 THEN PRINT "You cannot carry more.":GOTO 50
1360 p%(m%)=-1:IF m%=24 THEN g%=39
1361 IF m%=22 THEN r0%=0
1362 PRINT "Taken: ";:l%=m%:GOSUB 1650:PRINT:GOTO 50
1380 p%(m%)=a%:PRINT "Dropped: ";:l%=m%:GOSUB 1650:PRINT:GOTO 50
1390 IF m%=9 THEN SS$=" candle ":GOSUB 3000:IF sr%>0 THEN m%=21
1391 IF m%<19 OR m%>22 THEN 1400
1392 IF p%(m%)<>-1 THEN IF p%(m%)<>a% THEN PRINT "Where? I can't see it.":GOTO 50
1393 ON m%-18 GOTO 1410,1430,1570,1630
1400 PRINT "How am I supposed to use it?": GOTO 50
1410 IF a%<>2 THEN IF a%<>35 THEN  PRINT "It won't open!": GOTO 50
1420 PRINT "You opened the door.":IF a%=2 THEN a%=1:GOSUB 3700:GOTO 50 ELSE k0%=1:a%=37:GOTO 50
1430 IF z%=0 THEN  PRINT "But there's nothing to kill...": GOTO 50
1431 IF p%(20)<>-1 THEN PRINT "You aren't carrying that.":GOTO 50
1440 f%=f%+1: IF  RND(1) *7+15> f% THEN 1460
1450 PRINT  "You swing with your sword but miss and the creature smashes your skull.": GOTO 1020
1460 IF  RND(1) <.38 THEN 1530
1470 l%= INT ( RND(1) *4): IF z%=5 THEN 1090
1480 IF l%=0 THEN  PRINT "You attack but the creature moves aside."
1490 IF l%=1 THEN  PRINT "The creature deflects your blow."
1500 IF l%=2 THEN  PRINT "The foe is stunned but quickly regains his balance."
1510 IF l%=3 THEN  PRINT "You missed and he deals a blow to your head."
1520 GOTO 50
1530 PRINT "The sword strikes home and your foe dies.":p%(z%)=0
1540 IF z%<>4 THEN PRINT "A black cloud descends and the corpse vaporises."
1550 z%=0:f%=0
1560 GOTO 50
1570 IF p%(9)=-1 THEN 1590
1571 IF p%(9)=a% THEN 1590
1580 PRINT "Nothing to ignite here. Keep your candle safe.":GOTO 50
1590 IF c0%=1 THEN 1610
1600 PRINT "The candle is out; you need a flame.":GOTO 50
1610 IF a%<>20 THEN PRINT "BOOM! Smoke clears: nothing has changed.":GOTO 50
1611 IF t%=19 THEN PRINT "The passage is already open. Save your bomb.":GOTO 50
1612 PRINT "BOOM! The door is torn from its hinges. The passage east is open.":t%=19
1620 p%(9)=0: GOTO 50
1630 PRINT "TIE ROPE TO RAIL at the balcony, then DOWN; UP returns.":GOTO 790
1650 PRINT "a";na$(l%);no$(l%);", ";:RETURN
1660 IF o%>18 THEN 1240 ELSE IF o%=0 THEN 1130 ELSE 1690
1690 IF o%=9 OR o%=10 THEN ac%=3:GOTO 1285
1691 IF o%<5 THEN ac%=o%:IF ac%>3 THEN ac%=3
1692 IF o%<5 THEN 1280 ELSE IF z%>0 THEN 1110
1700 IF o%<7 THEN  PRINT "Nothing happens!"
1710 IF o%>6 THEN IF o%<13 THEN  PRINT "Please tell me how."
1720 IF o%>12 THEN  PRINT "I can't!"
1730 PRINT : GOTO 790
1920 PRINT "Ranking:"
1930 IF s%<20 THEN  PRINT "Hopeless beginner"
1940 IF s%<50 THEN IF s%>19 THEN  PRINT "Experienced loser"
1950 IF s%<100 THEN IF s%>49 THEN  PRINT "Average Viking"
1960 IF s%<126 THEN IF s%>99 THEN  PRINT "Excellent...but you've left something behind!"
1970 IF s%=126 THEN  PRINT "Perfectionist and genius!!"
1980 RETURN
2000 PRINT "An evil wizard bars the way. He cries: Thou shalt not pass!":RETURN
2020 PRINT "A sleeping dragon wakes and breathes jets of fire.":RETURN
2050 PRINT "An old dwarf guards the steps, raising his dagger.":RETURN
2070 IF l%=1 THEN 2000 ELSE  IF l%=4 THEN 2020 ELSE  IF l%=6 THEN 2050 ELSE  RETURN
2090 END
3000 sr%=0:FOR si%=1 TO LEN(A0$)-LEN(SS$)+1
3010 IF MID$(A0$,si%,LEN(SS$))=SS$ THEN sr%=si%:RETURN
3020 NEXT si%:RETURN
3100 IF b%=-1 THEN b%=h%:RETURN
3110 IF b%=-2 THEN b%=t%:RETURN
3120 IF b%=-3 THEN b%=e%:RETURN
3130 IF b%=-4 THEN b%=w%:RETURN
3140 IF b%=-5 THEN b%=g%:RETURN
3150 IF b%=-6 THEN IF d%=128 THEN b%=0:RETURN ELSE b%=d%:RETURN
3160 RETURN
3300 s%=0:FOR x%=7 TO 17
3320 v%=x%-6:IF p%(x%)=-1 THEN IF a%=1 THEN s%=s%+v%*2 ELSE s%=s%+v%
3330 IF p%(x%)=1 THEN s%=s%+v%*2
3340 NEXT x%:RETURN
3400 IF o%=9 OR o%=10 THEN IF m%<>20 THEN PRINT "With what weapon?":pf%=1:RETURN
3401 IF o%=17 THEN 3450 ELSE IF o%=18 THEN 3460
3402 IF o%=14 AND a%=28 THEN 3470 ELSE IF o%=13 AND a%=35 THEN 3480
3403 IF o%=8 AND a%=43 THEN SS$=" hatch ":GOSUB 3000:IF sr%>0 THEN 3492
3404 IF p%(24)=-1 THEN IF a%=38 OR a%=39 THEN pf%=1:SS$=" east ":IF a%=39 THEN SS$=" west "
3405 IF pf%=1 THEN GOSUB 3000:IF sr%>0 THEN 3495 ELSE pf%=0
3406 RETURN
3450 pf%=1:IF a%<>28 THEN PRINT "There is no suitable rail here.":RETURN
3451 IF m%<>22 THEN PRINT "Tie what?":RETURN
3452 SS$=" rail ":GOSUB 3000:IF sr%=0 THEN PRINT "Tie it to what? Try the rail.":RETURN
3453 IF p%(22)<>-1 THEN PRINT "You must be carrying the rope.":RETURN
3454 p%(22)=28:r0%=1:PRINT "Rope secured to rail; it reaches the floor.":GOTO 3498
3460 pf%=1:IF a%<>28 OR r0%=0 THEN PRINT "No secured rope here.":RETURN
3461 r0%=0:PRINT "Rope untied on balcony.":GOTO 3498
3470 pf%=1:IF r0%=0 THEN PRINT "TIE ROPE TO RAIL first.":RETURN
3471 a%=35:f%=0:PRINT "You climb down to the temple floor.":GOTO 3498
3480 pf%=1:IF r0%=0 THEN PRINT "There is no secured rope above you.":RETURN
3481 a%=28:f%=0:PRINT "You climb up to the balcony.":GOTO 3498
3492 w%=43:PRINT "You lift the latch. The hatch opens both ways.":GOTO 3498
3495 PRINT "The grille cannot fit. DROP GRILLE first.":pf%=1:RETURN
3498 IF u%<32767 THEN u%=u%+1
3499 pf%=2:RETURN
3700 PRINT "Welcome home! Your treasures are safe."
3701 FOR x%=7 TO 17:IF x%<>8 THEN IF x%<>9 THEN IF p%(x%)=-1 THEN p%(x%)=1
3702 NEXT x%:GOSUB 3300:PRINT "Your score is";s%;" out of 126.":GOSUB 1920
3703 IF s%=126 THEN PRINT "All treasure home. Your quest is complete!"
3704 PRINT "QUIT to finish, or leave to seek more treasure.":RETURN
4010 DATA "Inside the bark hut. The door leads north to the clearing.","Hut clearing: locked door south, forest west, clover field east."
4030 DATA "Forest path: clearing east, river cliff west. Water glints through the trees.","Clover field: the hut clearing is west; Mount Ymir's slopes lie east."
4050 DATA "Cliff above the Gioll: forest east; a path descends south to the bank.","Riverbank: cliff north, crater west, rocky outcrop east."
4070 DATA "The Gioll pours into a crater. West is a fatal drop. The safe path returns east.","Rocky outcrop: a bridge is visible upriver, but unreachable from here. Return west."
4090 DATA "Windy slopes of Mount Ymir: clover field west, bridge approach south.","The string bridge crosses the Gioll southwards. Mount Ymir's slopes are north."
4110 DATA "On the swaying string bridge. Follow it north or south; no footing east or west.","Southern bank: string bridge north, oak forest west, rope cliff east."
4130 DATA "A rock amid poisonous mushrooms: bridge landing east, basalt clearing south.","Basalt clearing: oak forest north, cave entrance south."
4150 DATA "A shelf overlooks the river. West returns to the southern bridge landing.","Daylit cave entrance: outside north, passages south and east. Take a light first."
4170 DATA "An explorer scratched: Seek the sacred key of Thialfi. The passage returns west.","Entrance cavern: daylight north, old torture chamber west."
4190 DATA "The legendary treasure room of the black elves of Svartalfheim. Only exit: west.","Treasure doorway: south returns to the northern cavern."
4210 DATA "Northern cavern: treasure door north, corridor east, long tunnel south.","Draughty corridor: cavern west, torture chamber south."
4230 DATA "An old torture chamber, stained with blood. Corridor north; entrance cavern east.","Long tunnel: cavern north, round chamber south. A sealed crack glows faintly east."
4250 DATA "Empty side cave. The only exit is west to the round chamber.","Loki's round chamber: tunnel north, upper ledge south, bat caves west, side cave east."
4270 DATA "Upper ledge above an underground river: round chamber north, temple balcony east.","Temple balcony: sturdy stone rail, floor below. West returns to the upper ledge."
4290 DATA "Draughty junction: round chamber east, bat colony south, forked pillar west.","Forked stone pillar: junction east, pale chamber west."
4310 DATA "Low, dripping passage: pale chamber north, key chamber east.","Pale limestone chamber: forked pillar east, low passage south."
4330 DATA "Bat colony: mind the droppings! Junction north, key chamber west.","Key chamber: bat colony east, low passage west."
4350 DATA "Loki's temple: gate north, balcony overhead.","Lower cavern: shaft north, lower river ledge east."
4370 DATA "Crypt: temple gate south, sealed passage east. Four stones name its keeper.","Cell: crypt west, shaft east, service hatch north. Its latch is on the drain side."
4390 DATA "Beyond the shaft: cell west, lower cavern south.","Lower river ledge, below temple level: waterfall north, castle view south, cavern west. East is a sheer edge."
4410 DATA "Straight drain: conduit west, passage east towards the junction.","Straight drain: conduit west, junction east."
4430 DATA "Drain junction: winding path north, branch east, conduit west, service hatch south. OPEN HATCH lifts its latch.","Blind drainage branch: return west to the junction."
4450 DATA "Gioll water falls from the roof. Steps north climb to the drains; ledge south. No safe footing east.","Pearl-white chamber: steps west; a winding path south bends west to the drain junction."
4470 DATA "Top of the stone steps: waterfall south, pearl-white chamber east.","Castle viewpoint: ledge north; castle across the river east, reached by drawbridge. No path south."
4490 DATA "Drawbridge: river ledge west, castle courtyard east. Crossing secures the bridge.","Castle courtyard: hzb tzozi. Drawbridge west, magazine east; tunnel south to bank."
4510 DATA "Powder magazine: return west to the courtyard.","Eastern riverbank: castle tunnel north, wooden bridge west."
4530 DATA "Wooden bridge: eastern bank east, conduit service path north.","Freezing conduit: drains east, service path south to the wooden bridge."
6000 DATA 2,0,0,0,0,0,3,4,0,0,5,2,0,0,2,9,0,6,0,3,5,0,7,8,0,0,128
6010 DATA 6,0,0,6,0,0,10,4,0,9,11,0,0,10,12,0,0,11,0,13,15,0,14,0,12,13,16
6020 DATA 0,0,0,0,12,0,14,18,0,17,0,0,16,0,16,0,23,0,0,0,20,0,0,21,0,-2,20
6030 DATA 24,0,22,0,23,21,0,22,0,0,18,21,26,0,0,0,0,26,0,24,27,29,25,26,0,0,28
6040 DATA 0,0,27,0,0,33,30,26,0,0,32,29,32,0,0,34,0,31,0,30,29,0,34,0,0,0,31
6050 DATA 33,37,0,0,0,39,0,0,40,0,35,0,-3,-4,0,37,-5,0,36,38,0,45,48,36,0,0,0
6060 DATA 54,42,0,0,41,43,46,38,42,44,0,0,43,0,47,40,0,0,0,43,47,0,0,45,0,46,40
6070 DATA 0,0,-6,0,0,48,50,0,52,49,51,0,0,50,0,50,0,53,0,54,0,0,52,0,53,0,41
6080 DATA "n evil"," wizard "," fiery"," demon ","n axe wielding"," troll "," fire breathing"," dragon "," giant"," bat "
6090 DATA "n old and gnarled"," dwarf "
6100 DATA " gold"," coin "," useful looking"," compass "," home made"," bomb "," blood red"," ruby "," sparkling"," diamond "
6110 DATA  " moon-like"," pearl ","n interesting"," stone "," diamond studded"," ring "," magic"," pendant "," most holy"," grail "," mirror like"," shield "
6120 DATA " nondescript black"," box ","n old and rusty"," key "," double-bladed"," sword "," small lit"," candle "," thin and tatty"," rope "," red house"," brick "," rusty ventilation"
6130 DATA " grille "
6140 DATA 36,19,10,14,17,47,8,1,51,45,22,46,54,19,19,19,19,0,34,7,16,15,24,38
6150 DATA  " north "," south "," west "," east "
6160 DATA  " take "," put "," using "," with "," cut "," break "," unlock "," open "," kill "," attack "
6170 DATA  " light "," burn "," up "," down "," jump "," swim "," tie "," untie "," vard "," galar "," look "," list "," score "," quit "," inventory "," invent "
