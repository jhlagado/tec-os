#!/bin/bash
set -euo pipefail
candidate=$1
reference=$2
evidence_dir=$3
test "$(git -C "$candidate" rev-parse HEAD)" = 00410a48c364ee9f40912f9364c653424ba5d70e
test "$(git -C "$reference" rev-parse HEAD)" = 00410a48c364ee9f40912f9364c653424ba5d70e
unset TECOS_ROM_ASSEMBLER TECOS_TAS_HOST TAS_COM TED_COM NODE_PATH
cd "$candidate"
export TECOS_ROM_TRACE="$evidence_dir/repeat-trace.jsonl"
first=$(mktemp -d)
trap 'rm -rf "$first"' EXIT
cp -R build/tecos "$first/main"
cp -R build/diag "$first/diag"
cp -R dist "$first/media"
rm -rf build/tecos build/diag dist src/gen diag/gen
npm run build
npm run diag
npm run media
diff -qr build/tecos "$first/main"
diff -qr build/diag "$first/diag"
diff -qr dist "$first/media"
echo REPEATED_TAS_OUTPUTS_MATCH

# Relay the normally selected, verified application pins to the independent tree.
node --input-type=module - "$candidate" "$evidence_dir/resolved-inputs.json" <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.argv[2];
const {located,pinnedBytes}=await import(pathToFileURL(root+'/tools/lib/pins.mjs'));
const inputs=JSON.parse(readFileSync(root+'/test/inputs.json')).inputs;
const paths=Object.fromEntries(['TAS.COM','TED.COM'].map(name=>{
  pinnedBytes(root,name);
  return [name,located(root,name,inputs[name])];
}));
writeFileSync(process.argv[3],JSON.stringify(paths,null,2)+'\n');
JS
export TAS_COM="$(node -e 'console.log(require(process.argv[1])["TAS.COM"])' "$evidence_dir/resolved-inputs.json")"
export TED_COM="$(node -e 'console.log(require(process.argv[1])["TED.COM"])' "$evidence_dir/resolved-inputs.json")"
cd "$reference"
export TECOS_ROM_ASSEMBLER=atom TECOS_ROM_TRACE="$evidence_dir/atom-trace.jsonl"
npm run build
npm run diag
npm run media
# This is the same production-source comparison used by KG50, with both trees
# at the repair pin. The old stage's exact hash snapshots remain historical.
cd "$candidate"
unset TECOS_ROM_ASSEMBLER
export TECOS_ROM_TRACE="$evidence_dir/comparison-trace.jsonl"
node test/model/ks43/compare.mjs "$candidate" "$reference"
echo SAME_SOURCE_ATOM_TAS_ARTIFACTS_AND_D8_MATCH
