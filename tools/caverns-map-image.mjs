// Reproducible spoiler diagram of the qualified BASIC navigation graph.
// node tools/caverns-map-image.mjs (requires Graphviz dot).
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const map=JSON.parse(readFileSync(root+'test/caverns-refined-map.json'));
const names=['','Bark hut','Hut clearing','Dark forest','Clover field','River cliff','Riverbank','Crater','Rocky outcrop','Mount Ymir slopes','Bridge approach','String bridge','Southern landing','Mushroom rock','Basalt clearing','Rope cliff','Cave entrance','Explorer’s dead end','Entrance cavern','Treasure room','Treasure doorway','Northern cavern','Draughty corridor','Torture chamber','Long tunnel','Side cave','Round chamber','Upper river ledge','Temple balcony','Bat-cave junction','Forked pillar','Low passage','Pale chamber','Bat colony','Key chamber','Temple floor','Wizard’s cavern','Crypt','Cell','Beyond the shaft','Lower river ledge','Western drain','Middle drain','Drain junction','Blind drain','Waterfall','Pearl chamber','Guarded steps','Castle viewpoint','Drawbridge','Castle courtyard','Powder magazine','Eastern riverbank','Wooden bridge','Freezing conduit'];
assert.equal(names.length,55);assert.equal(map.exits.length,216);
const objects={1:'Compass · start / home',7:'Sword · warned fatal drop west',8:'Gold coin · distant bridge view',10:'Troll',14:'Dragon',15:'Rope',16:'Lit candle',17:'Explorer’s clue · giant bat',19:'Demon · ring · pendant\ngrail · shield',20:'Bomb opens east door',22:'Diamond',24:'Brick',28:'Rail · TIE ROPE TO RAIL',34:'Key',35:'Key opens north gate',36:'Wizard · sword retained',37:'VARD inscription',38:'Removable grille · hatch north',43:'OPEN HATCH from this side',45:'Ruby',46:'Pearl',47:'Dwarf',48:'Castle visible east',50:'hzb tzozi → SAY GALAR',51:'Bomb',54:'Interesting stone'};
const groups=[{id:'surface',title:'SURFACE · HUT AND GIOLL CROSSING',start:1,end:15,color:'#dcece5',fill:'#f5faf7'},{id:'upper',title:'UPPER CAVES · KEY AND TREASURE',start:16,end:34,color:'#dbe5f4',fill:'#f5f8fd'},{id:'lower',title:'TEMPLE LEVEL · LOWER RIVER, DRAINS AND CASTLE',start:35,end:54,color:'#eadff1',fill:'#faf6fc'}];
const q=s=>JSON.stringify(s);
const graph=['digraph Caverns {','graph [layout=dot, rankdir=TB, bgcolor="white", pad=0.4, nodesep=0.32, ranksep=0.8, splines=polyline, compound=true, fontname="DejaVu Sans", fontsize=24, labelloc=t, label="CAVERNS — ALL 54 ROOMS\nAuthor-refined BASIC · spoiler navigation diagram\nSchematic: exit letters govern movement; corridors may bend. Not to scale."];','node [shape=box, style="rounded,filled", fillcolor=white, color="#778397", fontname="DejaVu Sans", fontsize=12, margin="0.16,0.10"];','edge [color="#64748b", fontname="DejaVu Sans", fontsize=10, arrowsize=0.6, labeldistance=1.8, penwidth=1.2];'];
for(const g of groups){graph.push(`subgraph cluster_${g.id} { label=${q(g.title)}; color=${q(g.color)}; bgcolor=${q(g.fill)}; style=rounded; fontsize=16;`);for(let r=g.start;r<=g.end;r++)graph.push(`r${r} [label=${q(`${r}  ${names[r]}${objects[r]?'\n'+objects[r]:''}`)}${r===1?', fillcolor="#d9f2df", penwidth=2':''}${r===19?', fillcolor="#fff1c7", penwidth=2':''}];`);graph.push('}');}
const dynamic={'-1':11,'-2':19,'-3':38,'-4':43,'-5':39,'-6':49};
const dirs=['N','S','W','E'];
const gates={'1:2':'Key required to re-enter hut','19:20':'Blast door at 20','35:37':'Unlock with key','37:38':'Say VARD in crypt','38:39':'Remove + drop grille','38:43':'Open hatch from drains','48:49':'Lower from castle side'};
const seen=new Set();let links=0;
for(let r=1;r<=54;r++)for(let i=0;i<4;i++){
 const raw=map.exits[(r-1)*4+i],d=dynamic[raw]??raw;if(d<1||d>54)continue;
 const key=[r,d].sort((a,b)=>a-b).join(':');if(seen.has(key))continue;seen.add(key);links++;
 const back=map.exits.slice((d-1)*4,d*4).map(v=>dynamic[v]??v).indexOf(r);
 const reverse=key==='1:2'?'S + key':dirs[back];assert.ok(reverse,`reverse for ${r}/${d}`);
 const extra=gates[key];graph.push(`r${r} -> r${d} [dir=both, taillabel=${q(dirs[i])}, headlabel=${q(reverse)}${extra?`, label=${q(extra)}, color="#b7791f", fontcolor="#8a5b14", penwidth=1.7`:''}];`);
}
graph.push('r28 -> r35 [dir=both, taillabel="DOWN", headlabel="UP", label="Rope secured to rail\nvertical connection", color="#087f8c", fontcolor="#087f8c", penwidth=2.3, style=dashed];');
graph.push('r17 -> r33 [label="Giant bat carries you\non next action", color="#9d4568", fontcolor="#9d4568", style=dashed, constraint=false];');
graph.push('legend [shape=note, fillcolor="#f8fafc", color="#94a3b8", fontsize=12, label="HOW TO READ\nNumbers identify BASIC rooms. Letters beside a room\nare commands to leave it. Lines show routes, not sightlines.\nGrey: ordinary two-way route. Gold: conditional passage.\nTeal: rope / level change. Rose: one-way bat transport.\nGALAR: from any safe room, teleport to entrance 16;\nclued in courtyard 50. Shown here rather than 53 extra arrows.\nOnly crater 7 west retains a warned fatal compass exit.\nAt home: treasures bank automatically; score / ranking shown.\nYou may continue exploring or QUIT."];');
graph.push('}');
const out=root+'docs/images';mkdirSync(out,{recursive:true});writeFileSync(out+'/caverns-map.dot',graph.join('\n')+'\n');
execFileSync('dot',['-Tsvg',out+'/caverns-map.dot','-o',out+'/caverns-map.svg']);
execFileSync('dot',['-Tpng','-Gdpi=135',out+'/caverns-map.dot','-o',out+'/caverns-map.png']);
const svg=readFileSync(out+'/caverns-map.svg','utf8');for(let r=1;r<=54;r++)assert.ok(svg.includes(`<title>r${r}</title>`),`room ${r}`);
console.log(`54 rooms, ${links} compass connections, rope, bat transport and GALAR legend; SVG + PNG written to docs/images.`);
