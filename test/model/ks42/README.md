# Experimental TAS main ROM build

ATOM remains the default. TAS is opt-in for the main ROM. Diagnostics,
services and standalone programs still use ATOM. Prepare the pinned inputs
once using the existing Thorium remote and its lock file. Assembly itself
uses local files and makes no network requests.

```sh
tas_host=$(mktemp -d)
git clone https://github.com/jhlagado/thorium.git "$tas_host"
git -C "$tas_host" checkout --detach 3d16b30cb8ed7deccc0a8b0b04f1b961e29f5689
npm ci --prefix "$tas_host"
git -C "$tas_host" show dbee66a90816df9a5884a08754ebc2d458a38325:dist/TAS.COM > "$tas_host/TAS.COM"
export TECOS_TAS_HOST="$tas_host"
export TAS_COM="$tas_host/TAS.COM"
export TECOS_ROM_ASSEMBLER=tas
export TECOS_ROM_TRACE="$(pwd)/build/rom-trace.jsonl"
mkdir -p build
npm run build
npm run inputs
npm run media
```

Use the shared memory guard for the build and checks. The trace records
each probe and final pass, its source root and TAS T-state count, and
the backend seen when media copies the main ROM. The pinned historical
KG42 builds use ATOM in their own copied trees.

With independent TAS and ATOM build directories and the Debug80 reader
checkout at `53853ec2968abd8513d915efa5cda621dc7ba4a3`, run
`node test/model/ks42/compare.mjs TAS_TREE ATOM_TREE DEBUG80_CHECKOUT`.
Run `node test/model/ks42/controls.mjs` with the TAS environment above
for fail-closed and workspace controls. Run
`node test/model/ks42/starter.mjs` after the TAS media build for the
generated card's TED and TAS workflow.
