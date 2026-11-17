import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restartSwap,restartVectors} from '../tools/caverns-scenario.mjs';

test('scenario launcher rejects a missing or damaged restart exchange before assembly',()=>{
 const game=readFileSync(new URL('../programs/CAVBASIC.COM',import.meta.url));
 const table=restartVectors(game),swap=restartSwap(game);
 assert.ok(swap>=0x100&&swap<game.length+0x100);
 const absent=Buffer.from(game);
 absent[table.address-0x100]=0;
 assert.throws(()=>restartSwap(absent),/requires a runtime restart table/);
 const damaged=Buffer.from(game);
 damaged[swap-0x100]=0;
 assert.throws(()=>restartSwap(damaged),/one restart vector exchange/);
});
