---
title: Build the service if you need a copy
parent: TBG
nav_order: 9
nav_group: Reference
---

# 9. Build the service if you need a copy

TBG has its own repository. Clone it beside your Thorium and TEC-OS
checkouts, run `npm ci` in Thorium, then run `npm run build` in the TBG
checkout. The outputs are `build/TBG.SVC`, `build/TBG.HLP`, the help pages H shows,
and `build/TBGSYM.SVC`, the symbols extension. Copy them to your TEC-OS disk.
The standard TEC-OS ROM supports every exercise in this manual. The armed
launch needs ABI 5.3 or later.

[TBG source](https://github.com/jhlagado/tbg) ·
[Viewer build source](https://github.com/jhlagado/tec-os-viewer) ·
[Origo P8 test evidence](https://github.com/jhlagado/origo/tree/main/studies/p8-tbg/evidence)
