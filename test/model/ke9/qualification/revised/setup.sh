(
  set -eu
  tas_stage=
  trap 'if [ -n "$tas_stage" ]; then rm -rf "$tas_stage"; fi' EXIT
  npm ci
  npm run inputs   # pinned TED.COM and TAS.COM
  mkdir -p .inputs
  if [ -d .inputs/tas-host ]; then
    node --input-type=module -e 'import { tasAssembler } from "./tools/lib/tas-rom.mjs"; await tasAssembler();'
  else
    tas_stage=$(mktemp -d "$PWD/.inputs/.tas-host.XXXXXX")
    git clone https://github.com/jhlagado/thorium.git "$tas_stage"
    git -C "$tas_stage" checkout --detach 3d16b30cb8ed7deccc0a8b0b04f1b961e29f5689
    (cd "$tas_stage" && npm ci)
    TECOS_TAS_HOST="$tas_stage" node --input-type=module -e 'import { tasAssembler } from "./tools/lib/tas-rom.mjs"; await tasAssembler();'
    mv "$tas_stage" .inputs/tas-host
  fi
)
