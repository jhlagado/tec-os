---
title: Build the service if you need a copy
parent: TBG
nav_order: 8
nav_group: Reference
---

# 8. Build the service if you need a copy

TBG has its own repository. Clone it beside your Thorium and TEC-OS
checkouts, run `npm ci` in Thorium, then run `npm run build` in the TBG
checkout. The output is `build/TBG.SVC`. Copy that file to your TEC-OS disk.
The standard Viewer ROM supports the direct-launch exercises in this manual.
Armed launch and the Ctrl-X input pause require the experimental ROM.

[TBG source](https://github.com/jhlagado/tbg) ·
[Viewer build source](https://github.com/jhlagado/tec-os-viewer/tree/tbg-lcd-workflow) ·
[Origo P8 test evidence](https://github.com/jhlagado/origo/tree/main/studies/p8-tbg/evidence)
