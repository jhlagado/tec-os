// Actual browser trial of exported scenarios; run after caverns-scenario.mjs pack.
// TEST_CHROMIUM=/usr/bin/chromium node tools/caverns-viewer-trial.mjs [VIEWER_ROOT]
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''),viewer=resolve(process.argv[2]??root+'/../tec-os-viewer'),out=root+'/build/caverns/scenario-viewer';mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(readFileSync(viewer+'/dist/tec-os-viewer.html'));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({...(process.env.TEST_CHROMIUM?{executablePath:process.env.TEST_CHROMIUM}:{}),headless:true,args:['--no-sandbox']});
const url='http://127.0.0.1:'+server.address().port;
const ready=p=>p.waitForFunction(()=>tecos.screen().some(l=>/^A:SYSTEM>\s*$/.test(l)),null,{timeout:90000});
async function setup(){const context=await browser.newContext({viewport:{width:1280,height:1100},acceptDownloads:true});const page=await context.newPage();await page.goto(url);await ready(page);await page.selectOption('#profile','80');await ready(page);return {context,page};}
async function cmd(p,s,game=true){await p.locator('#tms').click();await p.keyboard.type(s,{delay:40});await p.keyboard.press('Enter');if(game)await p.waitForFunction(()=>tecos.screen().filter(l=>l.trim()).at(-1)?.trim()==='?',null,{timeout:90000});else await ready(p);return p.evaluate(()=>tecos.screen());}
const a=await setup();await a.page.locator('#openimg').setInputFiles(root+'/build/caverns/scenarios.img');await a.page.waitForFunction(()=>document.querySelector('#filelist').textContent.includes('CAVLOAD.COM'));await ready(a.page);
const rope=await cmd(a.page,'cavload rope');assert.ok(rope.some(l=>l.includes('cliff face')));
const inventory=await cmd(a.page,'list');assert.ok(inventory.some(l=>l.includes('tatty rope')));await a.page.locator('#tms').screenshot({path:out+'/rope.png'});
const download=a.page.waitForEvent('download');await a.page.locator('#filelist tr').filter({hasText:'CAVE.CAV'}).getByRole('button',{name:'Download'}).click();const d=await download;await d.saveAs(out+'/CAVE.CAV');assert.deepEqual(readFileSync(out+'/CAVE.CAV'),readFileSync(root+'/build/caverns/scenarios/CAVE.CAV'));await a.context.close();
// Independent browser storage and a fresh starter card, importing only the
// exported scenario and development launcher, with no old machine/card RAM.
const b=await setup();await b.page.locator('#putfile').setInputFiles([root+'/build/caverns/CAVLOAD.COM',out+'/CAVE.CAV']);await b.page.waitForFunction(()=>document.querySelector('#filelist').textContent.includes('CAVLOAD.COM'));await ready(b.page);
const cave=await cmd(b.page,'cavload cave');assert.ok(cave.some(l=>l.includes('just inside the cave')));const inv=await cmd(b.page,'list');assert.ok(inv.some(l=>l.includes('tatty rope')));await b.page.locator('#tms').screenshot({path:out+'/cave-restored.png'});
writeFileSync(out+'/result.json',JSON.stringify({browser:'system Chromium',profile:80,ropeScreen:rope,ropeInventory:inventory,caveScreen:cave,caveInventory:inv,exportedScenarioBytes:128,freshBrowserContext:true,freshStarterCard:true},null,2)+'\n');console.log('Viewer: rope restored; CAVE.CAV downloaded; fresh browser/card restored cave with inventory.');await b.context.close();await browser.close();await new Promise(r=>server.close(r));
