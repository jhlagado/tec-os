// Actual browser trial of exported scenarios; run after caverns-scenario.mjs pack.
// TEST_CHROMIUM=/usr/bin/chromium node tools/caverns-viewer-trial.mjs [VIEWER_ROOT]
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''),viewer=resolve(process.argv[2]??root+'/../tec-os-viewer'),out=root+'/build/caverns/scenario-viewer';mkdirSync(out,{recursive:true});
const pageBytes=readFileSync(viewer+'/dist/tec-os-viewer.html');
const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(pageBytes);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({...(process.env.TEST_CHROMIUM?{executablePath:process.env.TEST_CHROMIUM}:{}),headless:true,args:['--no-sandbox']});
const url='http://127.0.0.1:'+server.address().port;
const ready=p=>p.waitForFunction(()=>tecos.screen().some(l=>/^A:SYSTEM>\s*$/.test(l)),null,{timeout:90000});
async function setup(){const context=await browser.newContext({viewport:{width:1280,height:1100},acceptDownloads:true});const page=await context.newPage();await page.goto(url);await ready(page);await page.selectOption('#profile','80');await ready(page);return {context,page};}
async function cmd(p,s,game=true){await p.locator('#tms').click();await p.keyboard.type(s,{delay:40});await p.keyboard.press('Enter');if(game)await p.waitForFunction(()=>tecos.screen().filter(l=>l.trim()).at(-1)?.trim()==='?',null,{timeout:90000});else await ready(p);return p.evaluate(()=>tecos.screen());}
const a=await setup();
const suppliedFiles=await a.page.locator('#filelist').textContent();
assert.ok(suppliedFiles.includes('CAVERNS.BAS'));assert.ok(!suppliedFiles.includes('CAVERNS.COM'));
await cmd(a.page,'baza caverns',false);
await a.page.waitForFunction(()=>tecos.screen().join(' ').includes('COM written'),null,{timeout:120000});await ready(a.page);
await a.page.waitForFunction(()=>document.querySelector('#filelist').textContent.includes('CAVERNS.COM'));
const builtDownload=a.page.waitForEvent('download');await a.page.locator('#filelist tr').filter({hasText:'CAVERNS.COM'}).getByRole('button',{name:'Download'}).click();
await (await builtDownload).saveAs(out+'/CAVERNS.COM');assert.deepEqual(readFileSync(out+'/CAVERNS.COM'),readFileSync(root+'/programs/CAVERNS.COM'));
const publicOpening=await cmd(a.page,'caverns');assert.ok(publicOpening.join(' ').includes('bark hut'));
const publicTaken=await cmd(a.page,'take compass');assert.ok(publicTaken.join(' ').includes('You take'));
const publicInventory=await cmd(a.page,'inventory');assert.ok(publicInventory.join(' ').includes('compass'));
const publicClearing=await cmd(a.page,'north');assert.ok(publicClearing.join(' ').replace(/\s+/g,' ').includes('a field of clovers opens east'));
await a.page.locator('#tms').screenshot({path:out+'/public-build-play.png'});
await cmd(a.page,'quit');await cmd(a.page,'n',false);
await a.page.locator('#openimg').setInputFiles(root+'/build/caverns/scenarios.img');await a.page.waitForFunction(()=>document.querySelector('#filelist').textContent.includes('CAVLOAD.COM'));await ready(a.page);
const rope=await cmd(a.page,'cavload rope');assert.ok(rope.some(l=>l.includes('southern riverbank')));
const inventory=await cmd(a.page,'list');assert.ok(/tatty\s+rope/.test(inventory.join(' ')));await a.page.locator('#tms').screenshot({path:out+'/rope.png'});
await cmd(a.page,'quit');await cmd(a.page,'n',false);
const temple=await cmd(a.page,'cavload check5');
assert.ok(temple.join(' ').replace(/\s+/g,'').includes('livingrock'));
assert.ok(temple.join(' ').replace(/\s+/g,'').includes('Tothenorthisalockedgate.'));
assert.ok(!temple.join(' ').includes('North gate locked.'));
await a.page.locator('#tms').screenshot({path:out+'/temple.png'});
const download=a.page.waitForEvent('download');await a.page.locator('#filelist tr').filter({hasText:'CAVE.CAV'}).getByRole('button',{name:'Download'}).click();const d=await download;await d.saveAs(out+'/CAVE.CAV');assert.deepEqual(readFileSync(out+'/CAVE.CAV'),readFileSync(root+'/programs/caverns/CAVE.CAV'));await a.context.close();
// Independent browser storage and a fresh starter card, importing only the
// exported scenario and development launcher, with no old machine/card RAM.
const b=await setup();await b.page.locator('#putfile').setInputFiles([root+'/build/caverns/CAVLOAD.COM',out+'/CAVE.CAV']);await b.page.waitForFunction(()=>document.querySelector('#filelist').textContent.includes('CAVLOAD.COM'));await ready(b.page);
const cave=await cmd(b.page,'cavload cave');assert.ok(cave.some(l=>l.includes('You are just inside a cave')));const inv=await cmd(b.page,'list');assert.ok(/tatty\s+rope/.test(inv.join(' ')));await b.page.locator('#tms').screenshot({path:out+'/cave-restored.png'});
writeFileSync(out+'/result.json',JSON.stringify({browser:'system Chromium',profile:80,starterSourceOnly:true,nativeBrowserCompileMatchesQualifiedCOM:true,publicOpening,publicTaken,publicInventory,publicClearing,ropeScreen:rope,ropeInventory:inventory,templeScreen:temple,caveScreen:cave,caveInventory:inv,exportedScenarioBytes:128,freshBrowserContext:true,freshStarterCard:true},null,2)+'\n');console.log('Viewer: source-only starter compiled and played; matching COM downloaded; rope restored; CAVE exported and restored in fresh browser/card.');await b.context.close();await browser.close();await new Promise(r=>server.close(r));
