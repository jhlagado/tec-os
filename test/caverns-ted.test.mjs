// Exact book exercise, using the starter disk and actual TED/BAZA executables.
// All editing and compilation use matrix input; no editor/game state is patched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,boot,volume} from './lib/fixtures.mjs';

const source=readFileSync(resolve(ROOT,'programs/CAVBASIC.BAS'),'utf8');
const original='DREAMCARDS presents...',replacement='TEC-OS Book presents';
const expected=source.replace(original,replacement);
const bannerLine=source.split('\n').findIndex(l=>l.startsWith('30 PRINT '))+1;
const sha=b=>createHash('sha256').update(b).digest('hex');
const text=a=>Buffer.from(a.read('CAVBOOK.BAS',{text:true})).toString();
function keys(m,s,what,done){
 m.enqueueInput(s,'matrix');
 m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&m.waitingForInput()&&done();},800_000_000,what);
}
test('Caverns book exercise: copy, TED edit/save/build/run, exit and reopen after power cycle',{timeout:300_000},()=>{
 const image=new Uint8Array(readFileSync(resolve(ROOT,'dist/starter.img'))),a=volume(image,'A');
 const originalSource=sha(a.read('CAVBASIC.BAS')),originalCom=sha(a.read('CAVBASIC.COM'));
 let m=boot(image,{tms:true,matrix:true,width:80});
 const status=()=>m.screen()[23];
 keys(m,'con pico 80\r','select the documented console width',()=>m.ready());
 assert.equal(m.read(m.sym('VWID')),80);
 keys(m,'copy cavbasic.bas cavbook.bas\r','copy original to a working file',()=>m.ready());
 assert.equal(text(a),source);
 keys(m,`ted cavbook.bas ${bannerLine}\r`,'open the banner in TED',()=>/CAVBOOK\.BAS/.test(status())&&status().includes(`L${bannerLine} C1`));
 // Cursor is at the beginning of `30 PRINT "..."`: ten right arrows reach
 // the first literal character. Move through the old text and backspace it.
 keys(m,'\x1b[C'.repeat(10+original.length)+'\x08'.repeat(original.length)+replacement+'\x13','edit and save banner',()=>text(a)!==source);
 assert.equal(text(a).split('\n').find(l=>l.startsWith('30 ')),expected.split('\n').find(l=>l.startsWith('30 ')));
 assert.equal(text(a),expected);
 let mark=m.output.length;
 keys(m,'\x14b','TED builds Caverns and returns',()=>/COM written/.test(m.text(mark))&&/CAVBOOK\.BAS/.test(status()));
 assert.notEqual(sha(a.read('CAVBOOK.COM')),originalCom,'modified source produces a distinct executable');
 assert.ok(a.read('CAVBOOK.COM').length<40000);
 mark=m.output.length;
 keys(m,'\x14r','TED builds and runs Caverns',()=>m.text(mark).includes(replacement)&&m.text(mark).includes('useful looking compass')&&m.text(mark).endsWith('? '));
 keys(m,'quit\r','quit the modified game',()=>m.text().endsWith('? ')&&m.text().includes('Another adventure?'));
 keys(m,'n\r','leave the game for TED return pause',()=>/Press a key/.test(m.screen().join('\n')));
 keys(m,' ','return to TED',()=>/CAVBOOK\.BAS/.test(status()));
 keys(m,'\x11','leave TED',()=>m.ready());
 assert.equal(text(a),expected);
 assert.equal(sha(a.read('CAVBASIC.BAS')),originalSource);
 assert.equal(sha(a.read('CAVBASIC.COM')),originalCom);
 assert.deepEqual(m.violations,[]);
 // Boot the same disk with fresh RAM and reopen, proving saved disk contents.
 m=boot(image,{tms:true,matrix:true,width:80,ramFill:0x76});
 keys(m,'con pico 80\r','restore 80 columns after power cycle',()=>m.ready());
 keys(m,`ted cavbook.bas ${bannerLine}\r`,'reopen after power cycle',()=>/CAVBOOK\.BAS/.test(status())&&m.screen().some(l=>l.includes(replacement)));
 keys(m,'\x11','finish at the shell',()=>m.ready());
 assert.deepEqual(m.violations,[]);
});
