10 rem times.bas, a first basic program
20 rem build it with baza times,
30 rem then type times to run it.
40 print "HELLO FROM BASIC ON TEC-OS."
50 input "WHAT IS YOUR NAME";n$
60 print "HI, ";n$;"."
70 input "PICK A NUMBER, 1 TO 12";n
80 if n<1 or n>12 then 100
90 if n=int(n) then 120
100 print "PLEASE PICK 1 TO 12."
110 goto 70
120 print "THE";n;"TIMES TABLE:"
130 t=0
140 for i=1 to 12
150 p=i*n
160 print i;tab(4);"X";n;tab(9);"=";p
170 t=t+p
180 next i
190 print "THEY ADD UP TO";t
200 print "THAT IS";t/12;"ON AVERAGE."
210 print "GOODBYE, ";n$;"!"
220 end
