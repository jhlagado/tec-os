from pathlib import Path
import hashlib, json, shutil
ROOT=Path(__file__).resolve().parent
PREVIEW=ROOT.parent/'preview'
def digest(data): return hashlib.sha256(data).hexdigest()
def read_original():
 lines=(ROOT/'original-font5x7.txt').read_text().splitlines(); result={}
 for i,line in enumerate(lines):
  if line.startswith('= '):
   result[int(line[2:],16)]=[sum(128>>x for x,c in enumerate(row) if c=='#') for row in lines[i+1:i+9]]
 assert list(result)==list(range(32,128))
 return result
def bdf(path):
 text=path.read_text(); ascent=next(int(l.split()[1]) for l in text.splitlines() if l.startswith('FONT_ASCENT ')); result={}
 for section in text.split('STARTCHAR ')[1:]:
  lines=section.splitlines(); code=next(int(l.split()[1]) for l in lines if l.startswith('ENCODING '))
  if not 32<=code<=126: continue
  w,h,ox,oy=next(tuple(map(int,l.split()[1:])) for l in lines if l.startswith('BBX ')); start=lines.index('BITMAP')+1; rows=[0]*8
  for y,row in enumerate(lines[start:start+h]):
   for x in range(w):
    if int(row,16)&(1<<(len(row)*4-1-x)):
     px=ox+x; py=ascent-1-(oy+h-1-y)
     assert 0<=px<5 and 0<=py<8
     rows[py]|=128>>px
  result[code]=rows
 assert len(result)==95
 return result
original=read_original(); x11=bdf(PREVIEW/'x11.bdf'); spleen=bdf(PREVIEW/'spleen.bdf')
assert all(r[7]==0 for r in x11.values())
selected={c:[0]+r[:7] for c,r in x11.items()}
for ch in '0123456789{}Oabcdefghijklmnopqrstuvwxyz': selected[ord(ch)]=spleen[ord(ch)].copy()
for ch in 'it': selected[ord(ch)]=original[ord(ch)].copy()
for ch,x,y in [('e',3,2),('r',3,2),('t',4,5)]:
 assert selected[ord(ch)][y]&(128>>x)
 selected[ord(ch)][y]&=~(128>>x)
selected[127]=original[127].copy()
assert list(selected)==list(range(32,128))
assert all(len(r)==8 and all(v&7==0 for v in r) for r in selected.values())
raw=bytes(v for r in selected.values() for v in r); old=bytes(v for r in original.values() for v in r)
assert len(raw)==len(old)==768
(ROOT/'tec-compact.bin').write_bytes(raw); (ROOT/'original-font.bin').write_bytes(old)
text='# TEC Compact research export, slots 20h-7Fh. See README.md and NOTICES.txt.\n'
for c,rows in selected.items():
 text+=f'= {c:02X}\n'+''.join(''.join('#' if v&(128>>x) else '.' for x in range(5))+'\n' for v in rows)
(ROOT/'tec-compact.txt').write_text(text)
manifest={'designCommit':'dd42012ce7722241493615fce55ed6de399c2404','slots':96,'first':32,'last':127,'rowsPerSlot':8,'setBits':'7..3','byteOrder':'ascending code, then top-to-bottom row','compactSha256':digest(raw),'originalSha256':digest(old),'del':{'treatment':'unchanged original, not supplied by X11 or Spleen','bytes':selected[127]},'normalPatternsOnly':True,'reverseTreatment':'consumer derives reverse using its qualified original algorithm; preview uses XOR FF','sources':{p.name:digest(p.read_bytes()) for p in [PREVIEW/'x11.bdf',PREVIEW/'spleen.bdf',ROOT/'original-font5x7.txt']}}
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
