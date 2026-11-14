1 REM Caverns, copyright 1982-83 John Hardy. GNU GPL; see CAVERNS.TXT.
2 REM Original MicroWorld BASIC, refined by its author for TEC-OS and BAZA.
3 REM Integer tables cached once. See CAVERNS.TXT for rules and provenance.
10 DIM p%(24),ex%(216),ip%(24),na$(24),no$(24),di$(3),ve$(16)
11 RESTORE:FOR x%=1 TO 216:READ ex%(x%):NEXT x%
12 FOR x%=1 TO 24:READ na$(x%),no$(x%):NEXT x%
13 FOR x%=1 TO 24:READ ip%(x%):NEXT x%
14 FOR x%=0 TO 3:READ di$(x%):NEXT x%
15 FOR x%=1 TO 16:READ ve$(x%):NEXT x%
20 CLS
21 h%=11:d%=128:w%=0:g%=0:t%=0:e%=0:j%=0
22 FOR x%=1 TO 24:p%(x%)=ip%(x%):NEXT x%
25 RANDOMIZE
26 r%=0:a%=1:c0%=1:z%=0:m%=0:f%=0
30 PRINT "DREAMCARDS presents..."
40 PRINT "CAVERNS by John Hardy (c) 1983":PRINT "GNU Public License, 2019":f%=0:u%=0
41 PRINT "Find the lost treasure and bring it back to this hut for double points.":PRINT "LOOK describes your surroundings. LIST shows what you carry. QUIT gives your score."
50 PRINT
60 REM Hostile actions are resolved after command parsing.
70 IF a%<18 THEN 100
71 IF c0%<>1 THEN 80
72 IF p%(21)=a% THEN 100
73 IF p%(21)=-1 THEN 100
80 PRINT "It's very dark, too dark to see anything...I'm scared!"
90 GOTO 720
100 IF a%=1 THEN  PRINT "You are standing in a darkened room. There is a door to the     north."
110 IF a%=2 THEN  PRINT "You are in a forest clearing before a small bark hut. There are no windows, and locked door to the south. The latch was engaged when you closed the door."
120 IF a%=3 THEN  PRINT "You are deep in a dark forest. In the distance you can see a    mighty river."
130 IF a%=4 THEN PRINT "You are standing in a field of four-leafed clovers. There is a small hut to the north."
140 IF a%=13 THEN  PRINT "You are standing on a rock in the middle of a mighty oak forest.Surrounding you are thousands of poisonous mushrooms."
150 IF a%=15 THEN  PRINT "You are on a cliff face over looking the river."
160 IF a%=5 THEN  PRINT "The forest has opened up at this point. You are standing on a   cliff overlooking a wide glacial river. A small foot-beaten pathleads south."
170 IF a%=6 THEN  PRINT "You are standing at the rocky edge of the mighty river Gioll.   The path forks east and west."
180 IF a%=7 THEN  PRINT "You are on the edge of an enormous crater. The rim is extremely slippery. Clouds of water vapour rise high in the air as the    Gioll pours into it."
190 IF a%=8 THEN  PRINT "The path to the east stops here. You are on a rocky outcrop,    projected about 15 feet above the river. In the distance,       a tiny bridge spans the river."
200 IF a%=9 THEN  PRINT "You are on the lower slopes of Mt. Ymir. The forest stretches   far away and to the west. Arctic winds blow fiercely, it's very cold!"
210 IF a%=10 THEN  PRINT "You stand on a rocky precipice high above the river, Gioll;     Mt. Ymir stands to the north. A flimsy string bridge spans the  mighty river."
220 IF a%=11 THEN PRINT "You are halfway across the swaying string bridge. Hold tight!"
230 IF a%=12 THEN  PRINT "You are on the southern edge of the mighty river, before        the string bridge."
240 IF a%=14 THEN  PRINT "You are in a clearing in the forest. An ancient basalt rock      formation towers above you. To your south is the entrance of a  VERY interesting cave..."
250 IF a%=16 THEN  PRINT "You are just inside the cave. Sunlight pours into the cave      lighting a path to the east and another to the south. I don't   mind saying I'm a bit scared!"
260 IF a%=17 THEN  PRINT "This passage appears to be a dead end. On a wall before you is  carved `Find the Sacred Key of Thialfi'."
270 IF a%=19 THEN  PRINT "You are in the legendary treasure room of the black elves of    Svartalfheim. Every red-blooded Viking has dreamed of entering  this sacred room."
280 IF a%=20 THEN IF t%=0 THEN PRINT "A massive iron-bound oak door blocks the passage east. It is barred from within, with no obvious way to force it. Perhaps explosives could blast it open-but where could you find some?"
281 IF a%=20 THEN IF t%=19 THEN PRINT "The shattered remains of the door lie beside an open passage to the east."
290 IF a%=22 THEN  PRINT  "You are standing in an east-west corridor. You can feel a faint breeze coming from the east."
300 IF a%=23 THEN  PRINT "You are standing in what appears to have once been a torture    chamber. Apart from the rather comprehensive range of instumentsof absolutely inhuman agony,"
310 IF a%=23 THEN  PRINT "coagulated blood stains on the walls and mangled bits of bone onthe floor make me think that a number of would be adventurers   croaked it here!"
320 IF a%=24 THEN  PRINT "You stand in a long tunnel which has been bored out of the rock.It runs from north to south. A faint glow comes from a narrow   crack in the eastern wall."
330 IF a%=26 THEN  PRINT "You are in a large round room with a number of exits. The walls have been painted in a mystical dark purple and a big chalk staris drawn in the centre of "
340 IF a%=26 THEN  PRINT "the floor. Note: This is one of the hidden chambers of the      infamous pagan sect, the monks of Loki. Norse folk believe them to be gods."
350 IF a%=27 THEN  PRINT "You are standing on a narrow ledge, high above a subterranean   river. There is an exit to the east. "
360 IF a%=28 THEN  PRINT "You are on a balcony, overlooking a huge cavern which has been  converted into a pagan temple. Note: this temple has been       dedicated to Loki, the god of"
370 IF a%=28 THEN  PRINT "fire, who came to live in Svartalfheim after he had been        banished to exile by Odin. Since then he has been waiting       for the `End Of All Things'."
380 IF a%=33 THEN  PRINT "You are in the central cave of a giant bat colony. Above you    hundreds of giant bats hang from the ceiling and the floor is   covered in centuries of "
390 IF a%=33 THEN  PRINT "giant bat droppings. Careful where you step! Incidentally, the  smell is indescribable."
400 IF a%=35 THEN  PRINT "You are in the temple. To the north is a locked gate and on the wall is a giant statue of Loki, carved out of the living rock   itself!"
410 IF a%=37 THEN  PRINT "You stand in an old and musty crypt, the final resting place of hundreds of Loki devotees. On the wall is carved:``What 3 letter word completes a word "
420 IF a%=37 THEN  PRINT "starting with 'G---' and another ending with '---X'' Note: The   monks of Loki must have liked silly puzzles.  Putrefaction and decay fills the air here."
430 IF a%=38 THEN  PRINT "You are in a tiny cell. The western wall has now firmly closed  again. There is a ventilator shaft on the eastern wall."
440 IF a%=40 THEN  PRINT "You are on another ledge high above a subterranean river. The   water flows in through a hole in the cavern roof, to the north."
450 IF a%>40  THEN IF a%<45 THEN  PRINT "Somehow you have gotten into the complex drainage system of thisentire cavern network!!"
460 IF a%=45 THEN  PRINT "You are standing near an enormous waterfall which brings water  down from the surface, from the river Gioll."
470 IF a%=47 THEN  PRINT "You are standing before a stone staircase which leads           southwards."
480 IF a%=48 THEN  PRINT "You are on a narrow and crumbling ledge. On the other side of   the river you can see a magic castle. (Don't ask me why it's    magic...I just know it is)"
490 IF a%=49 THEN  PRINT "You are by the drawbridge which has just lowered itself....by   magic!!"
500 IF a%=50 THEN  PRINT "You are in the courtyard of the magic castle. WOW! This castle  is really something! On the wall is inscribed 'hzb tzozi'.      A secret escape tunnel leads south"
510 IF a%=51 THEN  PRINT "You are in the powder magazine of this really super castle."
520 IF a%=53 THEN  PRINT "You stand before a small wooden bridge which crosses the river."
530 IF a%=52 THEN  PRINT "You are on the eastern side of the river. A small tunnel leads  east into the cliff face."
540 IF a%=54 THEN  PRINT "You are in a conduit draining into the river. The water comes upto your knees and is freezing cold. A narrow service path leads south."
550 IF a%=18 OR a%=21 OR a%=25 OR a%>28 AND a%<32 OR a%=34 OR a%=36 OR a%=39 OR a%=46 OR a%=53 THEN  PRINT "You are deep in a dark cavern."
551 IF a%=32 THEN PRINT "You are in a dark passage among the bat caves."
570 IF a%=14 THEN IF p%(4)=0 THEN  PRINT "You can also see the bloody corpse of an enormous dragon."
580 IF a%=48 THEN IF d%=49 THEN  PRINT  " A mighty golden drawbridge spans the waters."
590 IF u%>200 THEN  PRINT "Your candle is growing dim."
600 IF u%<230 THEN 630
610 c0%=0
620 PRINT "In fact...it went out!"
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
770 PRINT:r%=1
780 REM Informational commands remain safe at the prompt.
790 INPUT A0$:IF A0$="" THEN 790 ELSE A0$=" "+A0$+" "
800 FOR x%=1 TO LEN(A0$):y%=ASC(MID$(A0$,x%,1)):IF y%>64 THEN IF y%<91 THEN A0$=LEFT$(A0$,x%-1)+CHR$(y%+32)+MID$(A0$,x%+1)
810 NEXT x%
811 IF A0$=" n " THEN A0$=" north "
812 IF A0$=" s " THEN A0$=" south "
813 IF A0$=" w " THEN A0$=" west "
814 IF A0$=" e " THEN A0$=" east "
815 IF A0$=" i " THEN A0$=" list "
830 FOR m%=7 TO 24:SS$=no$(m%)
840 GOSUB 3000:IF sr%>0 THEN 860
850 NEXT m%:N0$="":N1$="":m%=0
860 REM The string bridge remains usable for the return journey.
870 IF a%=2 THEN  LET j%=1
880 IF a%=45 THEN  LET w%=43
890 IF a%=35 THEN w%=0
900 IF p%(24)<>38 THEN  LET g%=39
910 IF a%=49 THEN  LET d%=49
920 SS$=" look ":GOSUB 3000:IF  sr%>0 THEN  LET r%=0: GOTO 50
925 SS$=" score ":GOSUB 3000:IF sr%>0 THEN GOSUB 3300:PRINT "Your score is";s%;" out of 126.":GOTO 790
930 SS$=" list ":GOSUB 3000:IF  sr%=0 THEN 1010
940 PRINT "You are carrying ";:v%=0
950 FOR l%=7 TO 24
960 IF p%(l%)=-1 THEN  LET v%=v%+1
970 NEXT l%
980 IF v%=0 THEN  PRINT "nothing.": GOTO 50
990 PRINT : FOR l%=7 TO 24: IF p%(l%)=-1 THEN  GOSUB 1650
1000 NEXT l%: GOTO 50
1010 SS$=" quit ":GOSUB 3000:IF  sr%=0 THEN 1070
1020 GOSUB 3300:GOTO 1050
1050 PRINT:PRINT "You have a score of";s%;" out of a possible 126 points in";u%;" moves.":GOSUB 1920:PRINT "Another adventure?"
1060 INPUT Y0$:IF Y0$="N" OR Y0$="n" THEN END ELSE IF Y0$="Y" OR Y0$="y" THEN GOTO 20 ELSE GOTO 1060
1070 IF u%<32767 THEN u%=u%+1
1071 FOR z%=1 TO 6:IF p%(z%)=a% THEN 1090
1080 NEXT z%:z%=0: GOTO 1660
1090 IF z%=5 THEN PRINT "The giant bat picked you up and carried you to another place.":a%=33:r%=0:p%(5)=p%(5)+7:GOTO 50
1091 GOTO 1660
1110 PRINT "AUUUUUGH...you've just been killed by a";na$(z%);no$(z%);"!!":GOTO 1020
1130 FOR q%=0 TO 3:SS$=di$(q%):GOSUB 3000:IF sr%>0 THEN 1150
1140 NEXT q%: GOTO 1240
1150 IF z%>0 THEN 1110
1151 IF p%(8)=-1 OR p%(8)=a% THEN 1170
1160 q%=INT(RND(1)*4)
1170 ix%=a%-1:ix%=ix%*4:ix%=ix%+q%:ix%=ix%+1:b%=ex%(ix%)
1180 GOSUB 3100
1190 REM The destination is in b%.
1200 IF b%=0 THEN  PRINT "You can't go that way"
1210 IF b%=128 THEN  PRINT "You stumble and fall into the chasm and smash yourself to a pulp on the rocks below.": GOTO 1020
1220 IF b%>0 THEN a%=b%
1230 r%=0: GOTO 50
1240 SS$=" galar ":GOSUB 3000:IF  sr%=0 THEN 1260
1250 IF z%>0 THEN 1110 ELSE r%=0:PRINT "Suddenly a magic wind carried you to another place...":a%=16:GOTO 50
1260 SS$=" ape ":GOSUB 3000:IF  sr%=0 THEN 1280
1270 IF z%>0 THEN 1110 ELSE PRINT "Hey! the eastern wall of the crypt slid open...":e%=38:GOTO 50
1280 IF ac%<>0 THEN 1285
1281 ac%=3:SS$=" get ":GOSUB 3000:IF sr%>0 THEN ac%=1:GOTO 1285
1282 SS$=" drop ":GOSUB 3000:IF sr%>0 THEN ac%=2
1285 IF m%<1 THEN IF z%>0 THEN 1110 ELSE PRINT "eh?":GOTO 50
1290 IF p%(m%)=-1 OR p%(m%)=a% THEN 1292 ELSE IF z%>0 THEN 1110 ELSE PRINT "Where? I can't see it.":GOTO 50
1292 IF z%=0 THEN 1300
1293 IF ac%=3 THEN IF m%=20 THEN IF p%(20)=-1 THEN 1390
1294 GOTO 1110
1300 IF ac%=1 THEN 1310 ELSE IF ac%=2 THEN 1380 ELSE 1390
1310 q%=0
1320 FOR x%=7 TO 24
1330 IF p%(x%)=-1 THEN  LET q%=q%+1
1340 NEXT x%
1350 IF q%>10 THEN PRINT "You are carrying too many objects.":GOTO 50
1360 p%(m%)=-1: GOTO 50
1370 SS$=" drop ":GOSUB 3000:IF  sr%=0 THEN 1390
1380 LET p%(m%)=a%: GOTO 50
1390 IF m%=9 THEN SS$=" candle ":GOSUB 3000:IF sr%>0 THEN m%=21
1391 IF m%<19 OR m%>22 THEN 1400
1392 IF p%(m%)<>-1 THEN IF p%(m%)<>a% THEN PRINT "Where? I can't see it.":GOTO 50
1393 ON m%-18 GOTO 1410,1430,1570,1630
1400 PRINT "How am I supposed to use it?": GOTO 50
1410 IF a%<>2 THEN IF a%<>35 THEN  PRINT "It won't open!": GOTO 50
1420 PRINT "You opened the door.":p%(19)=a%:r%=0:IF a%=2 THEN a%=1:GOTO 50 ELSE a%=37:GOTO 50
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
1530 PRINT "The sword strikes home and your foe dies...":p%(m%)=-1:IF z%=3 OR z%=5 THEN p%(z%)=p%(z%)+10 ELSE p%(z%)=0
1531 IF z%=1 THEN PRINT "Hey! Your sword has just crumbled into dust!!":p%(20)=35
1540 IF z%<>4 THEN  PRINT CHR$(13);CHR$(10);"Suddenly a black cloud descends and the corpse vaporizes into   nothing."
1550 z%=0
1560 GOTO 50
1570 IF p%(9)=-1 THEN 1590
1571 IF p%(9)=a% THEN 1590
1580 PRINT "That will not burn. The candle went out.":c0%=0:GOTO 50
1590 IF c0%=1 THEN 1610
1600 PRINT "But the candle is out, stupid!!": GOTO 50
1610 IF a%<>20 THEN PRINT "BOOM! The blast throws you to the side of the room. When the smoke clears, nothing around you has changed.":GOTO 50
1611 IF t%=19 THEN PRINT "The passage is already open. Save your bomb.":GOTO 50
1612 PRINT "BOOM! You are thrown aside as the blast tears the door from its hinges. When the smoke clears, the passage east is open.":t%=19:r%=0
1620 p%(9)=0: GOTO 50
1630 IF a%=28 THEN 1640 ELSE  PRINT "It's too dangerous!!!": GOTO 50
1640 PRINT "You descend the rope, but it drops 10 feet short of the floor.  You jump the rest of the way.":r%=0:p%(m%)=a%:a%=35: GOTO 50
1650 PRINT "a";na$(l%);no$(l%);", ";:RETURN
1660 ac%=0:FOR o%=1 TO 16:SS$=ve$(o%):GOSUB 3000:IF sr%>0 THEN 1690
1670 NEXT o%
1680 GOTO 1130
1690 IF o%<5 THEN ac%=o%:IF ac%>3 THEN ac%=3
1691 IF o%<5 THEN 1280
1692 IF z%>0 THEN 1110
1700 IF o%<7 THEN  PRINT "Nothing happens!"
1710 IF o%>6 THEN IF o%<13 THEN  PRINT "Please tell me how."
1720 IF o%>12 THEN  PRINT "I can't!"
1730 PRINT : GOTO 790
1740 DATA 2,0,0,0,0,0,3,4,2,5,5,0,2,5,0,9,0,6,3,4,5,0,7,8,0,0,128
1750 DATA 6,0,0,6,0,0,10,4,0,9,-1,4,0,10,12,128,128,-1,13,13,0,12,12,14,12,15,16
1760 DATA 0,13,0,14,0,0,14,18,0,17,0,0,16,0,16,0,23,0,0,0,20,0,21,23,0,-2,0
1770 DATA 24,0,20,0,23,21,16,22,0,18,18,21,26,0,18,0,27,24,0,24,27,29,25,18,0,0,28
1780 DATA 0,0,27,0,0,33,0,26,29,31,0,0,32,0,0,0,33,30,0,0,0,31,34,0,0,0,0
1790 DATA 33,0,0,0,0,39,0,35,40,0,35,0,-3,-4,0,0,-5,0,36,38,0,45,48,36,128,46,43
1800 DATA 54,42,46,43,41,43,46,38,42,44,47,47,0,47,0,40,0,128,47,0,47,47,0,45,46,0,40
1810 DATA 128,0,-6,0,0,48,50,0,52,49,51,0,0,50,0,50,0,53,50,54,0,0,52,0,53,41,0
1820 DATA "n evil"," wizard "," fiery"," demon ","n axe wielding"," troll "," fire breathing"," dragon "," giant"," bat "
1830 DATA "n old and gnarled"," dwarf "
1840 DATA " gold"," coin "," useful looking"," compass "," home made"," bomb "," blood red"," ruby "," sparkling"," diamond "
1850 DATA  " moon-like"," pearl ","n interesting"," stone "," diamond studded"," ring "," magic"," pendant "," most holy"," grail "," mirror like"," shield "
1860 DATA " nondescript black"," box ","n old an rusty"," key "," double bladed"," sword "," small"," candle "," thin and tatty"," rope "," red house"," brick "," rusty ventilation"
1870 DATA " grill "
1880 DATA  36,19,10,14,17,47,8,1,51,45,22,46,54,19,19,19,19,0,34,7,18,15,24,38
1890 DATA  " north "," south "," west "," east "
1900 DATA  " take "," put "," using "," with "," cut "," break "," unlock "," open "," kill "," attack "
1910 DATA  " light "," burn "," up "," down "," jump "," swim "
1920 PRINT "This gives you an adventurer's ranking of:"
1930 IF s%<20 THEN  PRINT "Hopeless beginner"
1940 IF s%<50 THEN IF s%>19 THEN  PRINT "Experienced loser"
1950 IF s%<100 THEN IF s%>49 THEN  PRINT "Average Viking"
1960 IF s%<126 THEN IF s%>99 THEN  PRINT "Excellent...but you've left something behind!"
1970 IF s%=126 THEN  PRINT "Perfectionist and genius!!"
1980 RETURN
1990 INPUT A0$: CLS : RETURN
2000 PRINT "There, before you in a swirling mist stands an evil wizard with his hand held outwards...`Thou shall not pass' he cries."
2010 RETURN
2020 PRINT "Before the entrance of the cave lies an enormous, green,        sleeping dragon. Realizing your presence, its eyes flicker open"
2030 PRINT "and it leaps up, breathing jets fire at you."
2040 RETURN
2050 PRINT "From around the corner trots an old and gnarled drawf carrying  a lantern. `My job is to protect these stone steps!' he says andlunges at you with his dagger."
2060 RETURN
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
3150 IF b%=-6 THEN b%=d%:RETURN
3160 RETURN
3300 s%=0:FOR x%=7 TO 17
3320 v%=x%-6:IF p%(x%)=-1 THEN s%=s%+v%
3330 IF p%(x%)=1 THEN v%=v%*2:s%=s%+v%
3340 NEXT x%:RETURN
