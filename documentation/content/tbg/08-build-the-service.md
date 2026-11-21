---
title: Build the service if you need a copy
parent: TBG
nav_order: 8
nav_group: Reference
---

# 8. Build the service if you need a copy

From a Thorium checkout next to your TEC-OS checkout, run
`node tools/build-tdb.mjs --service ../tec-os`. The output is
`build/tbg/TBG.SVC`. Copy that file to your TEC-OS disk. The standard Viewer
ROM supports the direct-launch exercises in this manual. Armed launch and
the Ctrl-X input pause require the experimental ROM.

[Viewer build source](https://github.com/jhlagado/tec-os-viewer/tree/tbg-lcd-workflow) ·
[Thorium source](https://github.com/jhlagado/thorium) ·
[Origo P5 test evidence](https://github.com/jhlagado/origo/tree/tbg-resident-evidence)
