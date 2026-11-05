# Experimental TAS distribution qualification

ATOM remains the default. With the [KS42 pinned inputs](../ks42/README.md)
and `TECOS_ROM_ASSEMBLER=tas`, TAS builds the main and diagnostic ROMs,
GLCD.SVC, MOUNT.COM and DEMO.COM. Web publishes those existing outputs.
The ATOM reference and test-only program and service fixtures still use
ATOM.

For a clean smoke run, prepare the TAS host, TAS.COM and TED.COM first.
Export their absolute paths as `TECOS_TAS_HOST`, `TAS_COM` and `TED_COM`.
From the TEC-OS checkout, create a fresh copy at the commit being checked.
Install its locked dependencies, then remove ATOM from that disposable
installation. Run the production commands under the shared guard.

```sh
scratch=$(mktemp -d)
git archive HEAD | tar -x -C "$scratch"
cd "$scratch"
npm ci
rm -rf node_modules/atom-z80
node --input-type=module -e '
try { import.meta.resolve("atom-z80"); }
catch (error) { if (error.code === "ERR_MODULE_NOT_FOUND") process.exit(0); throw error; }
throw new Error("ATOM resolves in the smoke tree");
'
export TECOS_ROM_ASSEMBLER=tas
export TECOS_ROM_TRACE="$scratch/rom-trace.jsonl"
node /absolute/path/to/origo/tools/mem-guard.mjs --limit 600 \
  --name ks43-no-atom --log "$scratch/guard.jsonl" -- \
  sh -ec 'npm run build; npm run diag; npm run media; npm run web'
```

Run `node test/model/ks43/compare.mjs TAS_TREE ATOM_TREE` from a checkout
with ATOM available. It compares both ROMs, their maps and censuses, the
packaged distribution and an independent third-page GLCD assembly. Run
`node test/model/ks43/media-controls.mjs` after building media in the same
checkout. The controls use a disposable copy of its existing distribution.
