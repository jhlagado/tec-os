#!/bin/bash
set -euo pipefail
qualification_root=$1
evidence_dir=$2
cd "$qualification_root"
test "$(git rev-parse HEAD)" = "${3:?expected code pin}"
unset TECOS_ROM_ASSEMBLER TECOS_TAS_HOST TAS_COM TED_COM NODE_PATH
node --input-type=module - "$evidence_dir/setup.sh" <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const fence=String.fromCharCode(96).repeat(3);
writeFileSync(process.argv[2],readFileSync('README.md','utf8').split(fence+'sh\n')[1].split(fence)[0]);
JS
bash "$evidence_dir/setup.sh"
export TECOS_ROM_TRACE="$evidence_dir/strict-trace.jsonl"
export STRICT=1
npm run check
node --input-type=module - "$evidence_dir" <<'JS'
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=process.argv[2];
const names=['build/tecos/tecos.rom','build/tecos/tecos.d8.json','build/tecos/census.json',
'build/diag/diag.rom','build/diag/diag.d8.json','build/diag/diag.json',
'build/stack-census.json','build/hwsvc-stacks.json','dist/tecos.rom','dist/tecos.d8.json','dist/tecos.census.json',
'dist/starter.img','dist/starter.recipe.json','dist/page.recipe.json',
'dist/files/GLCD.SVC','dist/files/MOUNT.COM','dist/files/DEMO.COM',
'docs/memory-map.md','docs/rom-services.md'];
const hashes=Object.fromEntries(names.map(name=>[name,createHash('sha256').update(readFileSync(name)).digest('hex')]));
assert.equal(hashes['build/tecos/tecos.rom'],hashes['dist/tecos.rom']);
assert.equal(hashes['build/tecos/tecos.d8.json'],hashes['dist/tecos.d8.json']);
for(const [name,target] of [['build/tecos/census.json','census.json'],['build/stack-census.json','stack-census.json'],['build/hwsvc-stacks.json','hwsvc-stacks.json']])cpSync(name,resolve(out,target));
writeFileSync(resolve(out,'artifact-hashes.json'),JSON.stringify(hashes,null,2)+'\n');
JS
git diff -- docs/memory-map.md docs/rom-services.md >"$evidence_dir/generated-docs.patch"
